# Lumina Reader 流萤阅读器

一款跨平台的沉浸式文档阅读器，支持 Web 和 Android App。

## 项目结构

```
LuminaReader/
├── app/                          # Android App + Web 共享前端
│   ├── android/                 # Android 原生项目 (Capacitor 6)
│   ├── www/                     # 【核心】Web 前端代码（Web/App 共享）
│   │   ├── index.html           # 主页面
│   │   ├── css/
│   │   │   ├── main.css        # 主样式文件
│   │   │   └── markdown.css    # Markdown 插件样式
│   │   ├── js/
│   │   │   ├── modules/        # 核心模块
│   │   │   │   ├── namespace.js         # 命名空间初始化
│   │   │   │   ├── config.js            # 运行时配置
│   │   │   │   ├── utils.js             # 工具函数
│   │   │   │   ├── i18n.js              # 国际化（中/繁/英）
│   │   │   │   ├── parser.js            # 文件解析器 (DOM/Worker)
│   │   │   │   ├── chapter.js           # 章节管理
│   │   │   │   ├── renderer.js          # 渲染引擎
│   │   │   │   ├── actions.js           # 操作事务
│   │   │   │   ├── ui.js                # UI 交互
│   │   │   │   ├── annotations.js       # 批注系统
│   │   │   │   ├── tts.js               # 语音朗读 (原生 TTS)
│   │   │   │   ├── db.js                # 数据存储 (IndexedDB/SQLite)
│   │   │   │   ├── data-manager.js      # 书库管理
│   │   │   │   ├── settings.js          # 设置管理
│   │   │   │   ├── exporter.js          # 导出功能
│   │   │   │   ├── init.js              # 初始化与 HeatMap
│   │   │   │   ├── config-manager.js    # 【新增】统一配置管理器
│   │   │   │   ├── crypto.js            # 【新增】AES-256-GCM 加密
│   │   │   │   └── plugin-manager.js    # 插件系统管理器
│   │   │   ├── plugins/        # 插件目录
│   │   │   │   ├── markdown/            # Markdown 富文本渲染插件
│   │   │   │   │   ├── markdown.plugin.js
│   │   │   │   │   ├── markdown.parser.js
│   │   │   │   │   ├── markdown.renderer.js
│   │   │   │   │   └── lib/prism/       # 代码高亮库
│   │   │   │   └── azure-tts/           # 【新增】Azure TTS 插件
│   │   │   │       ├── azure-tts.plugin.js    # 插件入口
│   │   │   │       ├── azure-tts.engine.js    # 语音合成引擎
│   │   │   │       ├── azure-tts.task-manager.js  # 预加载任务管理
│   │   │   │       └── azure-tts.css          # 插件样式
│   │   │   └── bridges/        # 桥接模块
│   │   │       ├── exporter-bridge.js   # 导出桥接
│   │   │       ├── db-bridge.js         # 数据库桥接
│   │   │       └── file-opener-bridge.js # 文件打开桥接
│   │   └── assets/             # 字体、JS 库等静态资源
│   ├── package.json           # Node 依赖
│   └── capacitor.config.json  # Capacitor 配置
├── web/                        # Web 服务器
│   ├── server.py              # Python HTTP 服务器
│   ├── start.bat              # Windows 启动脚本
│   └── data/                  # 运行时数据（自动创建）
└── reference/                  # 参考文件（不提交 Git）
```

## 核心设计：一次编写，两处运行

**`app/www/` 是唯一的 Web 前端代码仓库**

- **App**：Capacitor 加载 `app/www/` 打包成 APK
- **Web**：`web/server.py` 直接服务 `app/www/` 目录

---

## 环境准备

### 1. 安装 Node.js

**Windows（推荐方式）：**
```powershell
# 使用 winget（Windows 10/11 自带）
winget install OpenJS.NodeJS.LTS

# 或官网下载：https://nodejs.org/ LTS 版本
```

**macOS：**
```bash
brew install node@20
```

**验证安装：**
```bash
node -v    # v18.x 或 v20.x
npm -v
```

### 2. 安装项目依赖

```bash
cd app
npm install
```

### 3. Android 开发环境（可选，仅构建 APK 需要）

| 工具 | 用途 | 下载地址 |
|------|------|----------|
| Java JDK 17 | Android 编译必需 | https://www.oracle.com/java/technologies/downloads/ |
| Android Studio | Android SDK 管理 | https://developer.android.com/studio |

安装完成后，在 Android Studio 的 SDK Manager 中安装：
- Android SDK Platform 34（或更高版本）
- Android SDK Build-Tools

### 4. Python（一般 Windows 已自带）

Web 服务器需要 Python 3.7+：

```bash
python --version
```

---

## 快速开始

### Web 端（最简单，推荐先尝试）

```bash
cd web
start.bat
# 或：python server.py
# 访问 http://localhost:8080
```

### Android App

```bash
cd app

# 首次安装依赖
npm install

# 同步 Web 代码到 Android
npx cap sync android

# 打开 Android Studio 运行或构建 APK
npx cap open android
```

**构建 APK（命令行方式）：**
```bash
cd android
.\gradlew.bat assembleDebug
# 输出位置：app/build/outputs/apk/debug/app-debug.apk
```

---

## 核心功能

### 文档阅读
- **多格式支持**：DOCX, TXT, Markdown, HTML, PDF
- **智能排版**：首行缩进、首字下沉、行间距、段落间距调节
- **主题系统**：20+ 配色方案，支持深色/浅色模式
- **字体切换**：内置霞鹜文楷等多款字体

### 导航与搜索
- **智能目录**：自动检测章节层级
- **全文搜索**：快速定位关键词
- **书签注释**：支持添加书签和文本批注
- **历史记录**：自动保存阅读进度

### G点热力图
- **关键词高亮**：自定义标签，高亮显示敏感内容
- **预设管理**：保存常用标签组合，一键应用
- **智能分析**：自动分析文档热点

### 语音朗读 (TTS)
- **系统 TTS**：使用设备原生语音引擎
- **Azure TTS**（新增）：支持 Azure 语音服务
  - 高品质神经网络语音
  - 多种音色选择（晓晓、云希等）
  - 角色扮演风格（助手、聊天、新闻等）
  - 智能预加载缓存，流畅朗读
- **朗读控制**：播放/暂停、速度调节、定时停止

---

## 配置管理

### 统一配置系统（ConfigManager）

采用集中式配置管理，支持版本控制和迁移：

```javascript
// 配置结构
{
    version: 1,
    reading: { theme, font, fontSize, lineHeight, ... },
    regex: { chapter, section },
    tts: { rate, pitch, voiceURI, volume },
    pagination: { enabled, maxWords, imageWords },
    pdf: { extractImages, passwordPreset },
    export: { encrypted },
    heatMap: { presets: [] },
    azureTTS: { enabled, speechKey, region, voice, style, cache },
    plugins: {},
    meta: { firstInstall, lastBackup, importCount }
}
```

### 配置备份与恢复

- **导出配置**：支持 `.json`（明文）和 `.lmn`（加密）格式
- **导入配置**：跨设备迁移设置
- **加密保护**：AES-256-GCM 加密，支持密码保护
- **跨平台兼容**：Web 和 App 配置文件互通

---

## 插件系统

项目采用插件化架构，核心功能与扩展功能解耦：

```
js/plugins/
├── markdown/              # Markdown 富文本渲染
│   ├── markdown.plugin.js     # 插件入口
│   ├── markdown.parser.js     # 解析器
│   ├── markdown.renderer.js   # 渲染器
│   └── lib/prism/             # 代码高亮
└── azure-tts/             # Azure 语音服务
    ├── azure-tts.plugin.js    # 插件入口
    ├── azure-tts.engine.js    # 语音引擎
    └── azure-tts.task-manager.js  # 任务管理
```

**插件机制：**
- `plugin-manager.js` 提供钩子系统（`beforeParse`, `createElement` 等）
- 插件通过钩子扩展功能，不影响核心代码
- 动态加载，按需启用

---

## 开发工作流

### 首次克隆项目后

```bash
# 1. 安装 Node 依赖
cd app
npm install

# 2. 启动 Web 端测试
cd ../web
python server.py
```

### 修改前端代码

**所有前端修改都在 `app/www/` 进行**

### 测试

| 平台 | 方式 |
|-----|------|
| Web | 运行 `web/start.bat`，浏览器打开 `http://localhost:8080` |
| App | `npx cap open android` → Android Studio 运行 |

### 同步

修改 `app/www/` 后同步到 Android：

```bash
cd app
npx cap copy
```

**不需要手动复制到 web/，server.py 自动读取 `app/www/`**

---

## Git 提交

```bash
# 克隆
git clone https://gitee.com/boyryan85/lumina-reader.git

# 日常提交
git add .
git commit -m "feat: xxx"
git push
```

### 不提交的文件

- `node_modules/` - Node 依赖
- `__pycache__/` - Python 缓存  
- `web/data/` - 运行时数据（书籍、数据库）
- `reference/` - 本地参考文件
- `*.rar`, `*.zip` - 压缩包

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | HTML5 + CSS3 + Vanilla JS（模块化） |
| 移动端 | Capacitor 6 + Android SDK |
| Web 服务器 | Python 3 标准库 |
| 存储 | IndexedDB (Web) / SQLite (App) |
| 加密 | AES-256-GCM (Web Crypto API) |
| 插件系统 | 基于钩子的事件驱动架构 |
| 代码高亮 | PrismJS（按需加载） |

---

## 功能清单

### 文档支持
- [x] DOCX - Word 文档
- [x] TXT - 纯文本
- [x] Markdown - 富文本渲染（标题、列表、代码块、表格）
- [x] HTML - 网页文档
- [x] PDF - 支持密码保护和文本提取

### 阅读体验
- [x] 20+ 主题配色
- [x] 字体切换（霞鹜文楷等）
- [x] 排版自定义（缩进、行距、段距）
- [x] 平滑滚动
- [x] 分页/连续阅读模式

### 导航与标注
- [x] 智能章节检测
- [x] 全文搜索
- [x] 书签管理
- [x] 文本批注
- [x] 阅读进度同步

### 语音朗读
- [x] 系统 TTS 引擎
- [x] Azure TTS 高品质语音
- [x] 语速/音调调节
- [x] 预加载缓存
- [x] 定时停止

### G点热力图
- [x] 关键词高亮
- [x] 标签预设管理
- [x] 一键应用预设
- [x] 复制/删除预设

### 配置管理
- [x] 统一配置管理器
- [x] 配置导出/导入
- [x] AES-256-GCM 加密
- [x] 跨平台兼容

### 插件系统
- [x] 钩子机制
- [x] Markdown 富文本
- [x] 代码高亮（16种语言，6种主题）
- [x] Azure TTS 插件

---

## License

MIT License © 2024
