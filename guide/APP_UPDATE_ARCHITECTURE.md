# Lumina Reader APP 自动更新机制复盘总结

## 一、实现原理

Lumina Reader 采用 **「原生层热更新 + 原生插件代理网络」** 的混合架构，核心思路是：

1. **Web 资源热更新**：只更新 `app/www/` 内的前端资源（HTML/JS/CSS），不触碰 APK。
2. **原生层网络代理**：由于 WebView 直接访问 GitHub Releases 会被 CORS 拦截，所有检查/下载逻辑下沉到 Android 原生插件 `AppUpdaterPlugin` 中，通过 `HttpURLConnection` 完成。
3. **运行时路径切换**：`MainActivity` 在 `onCreate` 时检查 `/data/data/com.lumina.reader/files/www/index.html` 是否存在，存在则调用 `bridge.setServerBasePath()` 让 Capacitor 从热更新目录加载，否则回退到内置 `assets/public/`。
4. **版本源分层**：
   - **构建期 Truth Source**：`app/www/version.json`
   - **运行期 Truth Source**：插件读取 `files/www/version.json`（热更新后）或 `assets/public/version.json`（首次安装），并在 `init.js` 启动时覆盖 `Lumina.Config.version`，确保 UI 显示的是实际运行版本。

---

## 二、技术方法拆解

### 2.1 原生插件（`AppUpdaterPlugin.java`）

| 方法 | 职责 |
|---|---|
| `checkUpdate` | 拉取远程 `version.json`，解析出版本、changelog、下载 URL、SHA-256 |
| `getCurrentVersion` | 读取本地实际生效的 `version.json`（热更新目录优先） |
| `downloadUpdate` | 下载 zip → SHA-256 校验 → 解压到 `updates/www` → 验证 `index.html` → 原子性重命名为 `www` |
| `restartApp` | `Handler.postDelayed` 启动新 `MainActivity` + `finishAndRemoveTask` + `Process.killProcess` |

**关键实现细节**：
- **进度事件**：下载线程每 200ms 或每 chunk 通过 `this.notifyListeners("downloadProgress", ...)` 向 JS 广播进度。
- **SHA-256 校验**：下载完成后计算文件摘要，与远程 `version.json` 中的 `sha256` 比对，失败则删除临时包。
- **原子替换**：先解压到 `updates/www`，确认结构合法后再重命名为 `www`，避免中途失败导致应用损坏。
- **安全重启**：使用 `FLAG_ACTIVITY_CLEAR_TASK | FLAG_ACTIVITY_NEW_TASK` 配合 300ms 延迟和 `killProcess`，解决 ColorOS 等 ROM 上「三方应用异常」弹窗问题。

### 2.2 JS 更新管理器（`update-manager.js` + `about.js`）

- **状态机驱动**：`about.js` 维护 `idle → checking → available → downloading → ready → uptodate/error` 状态。
- **面板式 UX**：「关于」页仅保留单行状态，点击「查看更新」后弹出 `updateDetailPanel`，内部三态切换：
  1. **Detail**：展示当前版本 / 新版本 / Changelog，提供「立即更新」和「取消」。
  2. **Progress**：强制等待，无取消按钮，显示进度条和百分比。
  3. **Ready**：更新已就绪，提供「重新启动」按钮。
- **错误处理**：下载失败不关闭面板，而是在进度页内联显示错误文案 + 「返回」按钮，允许用户回到 Detail 页重试。

### 2.3 `MainActivity` 热更新加载

```java
private void applyHotUpdateIfExists() {
    File updatedIndex = new File(getFilesDir(), "www/index.html");
    if (updatedIndex.exists()) {
        bridge.setServerBasePath(wwwDir.getAbsolutePath());
    }
}
```

**注意**：Capacitor 8 的 `Bridge` 在 `super.onCreate()` 内部即被创建，因此 `registerPlugin(AppUpdaterPlugin.class)` 必须在 `super.onCreate()` 之前调用，否则插件无法被 JS 识别。

---

## 三、操作流程

### 3.1 开发 → 发布热更新的标准流程

```
1. 修改前端代码（app/www/）
   ↓
2. 更新 app/www/version.json（version + build + changelog）
   ↓
3. 执行发布脚本
   python scripts/release-update.py --upload --token $GITHUB_TOKEN
   ↓
4. 脚本自动完成：
   a. 同步 version 到 config.js / sponsor.html / index.html
   b. 打包 app/www/ → dist/update/v{x.x.x}/www-{x.x.x}.zip
   c. 计算 SHA-256
   d. 生成远程 version.json
   e. 创建 GitHub Release（或复用已有）并上传两个文件
   ↓
5. 用户端打开 App → 进入关于页 → 检查更新 → 下载 → 重启生效
```

### 3.2 需要重新打 APK 的场景

- 修改了任何 `.java` 原生代码（如 `AppUpdaterPlugin.java`、`MainActivity.java`）
- 新增了原生依赖或权限
- 修改了 `capacitor.config.json` 中需要原生层感知的配置

**此时必须执行**：
```bash
npx cap sync android
# 然后在 Android Studio 中重新构建签名 APK
```

---

## 四、`release-update.py` 脚本检查

### 4.1 功能亮点

- **零第三方依赖**：使用 Python 标准库 `urllib` 完成 GitHub API 调用，不依赖 `gh` CLI。
- **一条龙发布**：版本同步 → 打包 → 校验 → 生成远程配置 → 自动上传 Release。
- **Release 复用**：如果同名 Tag 的 Release 已存在，会直接追加文件，避免重复创建。
- **安全意识**：脚本支持从环境变量 `GITHUB_TOKEN` 读取 Token，减少命令行暴露风险。

### 4.2 发现的问题与风险

#### A. 内存占用风险（中等）
```python
with open(file_path, "rb") as f:
    data = f.read()   # 一次性将整个 zip 读入内存
```
`upload_file_to_release` 对 zip 文件使用 `f.read()`。如果未来热更新包膨胀到几十 MB，可能导致发布机 OOM。建议改为**流式上传**（`urllib` 配合 `Request` 的 `data` 传入 generator 或分块读取，虽然标准库较麻烦，但可改用 `http.client` 的 `putrequest` + `putheader` + `endheaders` + `send(chunk)`）。

#### B. 文件覆盖/冲突处理缺失（中高）
GitHub Release 上传时，如果同名文件已存在，API 会返回 `422 Unprocessable Entity`。脚本目前对此没有预处理逻辑（没有先删除已有 asset）。在实际迭代中如果手动删了又传，或 CI 重试，容易触发此错误。

**建议**：在上传前调用 `GET /repos/{owner}/{repo}/releases/{release_id}/assets`，若存在同名 asset 则先调用 `DELETE /repos/{owner}/{repo}/releases/assets/{asset_id}`。

#### C. 硬编码仓库信息
```python
GITHUB_OWNER = "li9293019"
GITHUB_REPO = "lumina-reader"
```
硬编码了仓库信息，通用性较差。建议改为从 `git remote -v` 或环境变量读取。

#### D. Token 泄露风险（已发生）
Important Context 中记录：**开发者的 GitHub PAT 曾在对话中暴露**（`ghp_ygCbCbl8...`）。**必须立即到 GitHub Settings → Developer settings → Personal access tokens 中撤销该 Token**。

#### E. 打包路径遍历隐患（ zip 解压侧 ）
虽然不在 Python 脚本里，但对应的原生 `AppUpdaterPlugin.unzip()` 方法：
```java
File outFile = new File(destDir, entry.getName());
```
没有过滤 `../` 路径穿越。如果 zip 被恶意构造，可能写出到 `files/www` 之外。建议增加校验：
```java
String canonicalDest = destDir.getCanonicalPath();
String canonicalEntry = outFile.getCanonicalPath();
if (!canonicalEntry.startsWith(canonicalDest + File.separator)) {
    throw new SecurityException("Zip entry path traversal: " + entry.getName());
}
```

---

## 五、尚需改进的地方

### 5.1 安全与健壮性

| 优先级 | 问题 | 建议方案 |
|---|---|---|
| **高** | 无回滚机制 | 保留上一个版本的 `www` 目录（如 `www_backup`），在更新校验失败或启动异常时自动回滚 |
| **高** | zip 路径遍历 | 在 `unzip()` 中增加 `getCanonicalPath()` 校验 |
| **中** | 下载无断点续传 | 支持 HTTP `Range` 请求，或改用 Android `DownloadManager` |
| **中** | 无网络重试 | `checkUpdate` / `downloadUpdate` 增加指数退避重试（3 次） |
| **低** | 缺少签名验证 | 除了 SHA-256 校验完整性，可考虑对 `version.json` 做 RSA 签名验证来源真实性 |

### 5.2 用户体验

| 优先级 | 问题 | 建议方案 |
|---|---|---|
| **中** | 下载时切后台易中断 | 将下载任务迁移到 Android `WorkManager` 或 `Foreground Service`，支持锁屏/后台继续下载 |
| **中** | 全量更新浪费流量 | 实现增量更新（基于文件级 diff 或 bsdiff），尤其对大 JS 库（如 pdf.worker）效果显著 |
| **中** | 缺少静默检查 | 可在 App 启动时（非用户主动）后台静默检查更新，仅在发现新版本时在设置角标或首页提示 |
| **低** | 无灰度发布能力 | `version.json` 中增加 `rolloutPercentage` 字段，按设备 ID 哈希灰度放量 |

### 5.3 代码与工程化

| 优先级 | 问题 | 建议方案 |
|---|---|---|
| **中** | `release-update.py` 上传不支持流式/大文件 | 改进上传逻辑，或考虑迁移到 `requests`/`httpx`（允许引入轻量依赖） |
| **中** | `config.js` 与 `version.json` 双版本源 | 长期看应完全以 `version.json` 为唯一源，`config.js` 在运行时被插件覆盖，构建期无需同步 |
| **低** | 下载重定向递归 | 将 `downloadFile()` 中的递归重定向改为循环 + 最大跳转次数限制（如 10 次），防止循环重定向 StackOverflow |

---

## 六、总结

当前 Lumina Reader 的热更新体系已经 **跑通且可用**，核心链路（检查 → 下载 → 校验 → 解压 → 切换路径 → 重启）设计合理，UI 交互也经过了多轮打磨（强制等待面板、无取消、内联错误提示）。原生插件方案很好地解决了 WebView CORS 问题。

**现阶段最应优先处理的 3 件事**：
1. **撤销已泄露的 GitHub Token**。
2. **在 `AppUpdaterPlugin.unzip()` 中增加路径遍历防御**。
3. **为热更新增加回滚机制**（保留旧版 `www`，启动失败时自动恢复），这是生产环境稳定性的最后一块拼图。

其余如增量更新、后台下载、灰度发布等可作为二期优化项逐步迭代。