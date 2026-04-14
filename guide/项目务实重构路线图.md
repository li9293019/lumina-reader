# Lumina Reader 务实重构路线图
## 核心原则：「外科手术式」渐进重构

### 一、重构策略总纲

| 原则 | 具体含义 |
|------|---------|
| **零停机迁移** | 每步重构后必须保证 Web + App 双端可正常运行，不引入构建工具 |
| **ROI 优先** | 先解决「改一处要改三处」和「不敢改」的问题，再追求优雅 |
| **文件拆分 > TS 重写** | Vanilla JS 拆成职责单一的文件，比全盘 TS 迁移更务实 |
| **CSS 功能域拆分** | 把 `main.css` 按组件/面板拆成多个文件，主题变量不动 |
| **测试后置但关键** | 不为测而测，只对「不敢手动改」的模块补测试 |

---

### 二、四阶段重构计划

#### Phase 1：止血与收敛（第 1~3 周）
**目标**：消灭「四重入口」「三体数据库」类的高风险重复逻辑。

**步骤 1.1：统一配置导入管道（3 天）**
- 新建 `app/www/js/core/config-importer.js`
- 将 `settings.js`、`data-manager.js`、`actions.js` 中的配置导入逻辑全部迁移至此
- 统一封装 `ConfigImporter.import(data, source)` 和 `applyImportedConfig()` 两个函数
- **验证**：在 Web 端和 App 端分别测试 `.lmn` 和 `.json` 配置导入，确认所有 UI（设置、热力图、Azure TTS、字体）都被正确刷新

**步骤 1.2：统一 DB 层接口契约（4 天）**
- 不改三个实现类的内部逻辑，先**立规矩**：
  - 新建 `app/www/js/core/db-adapter-interface.js`（纯 JSDoc/注释文档）
  - 强制规定 `saveFile(fileKey, data)`、`getFile(fileKey)`、`importBatch(books, onProgress)`、`exportBatch()` 的签名和返回值结构
- 修正现有三个实现类中已知的签名不一致（如 `CapacitorSQLiteImpl.importBatch` 的 `onProgress` 参数类型）
- **验证**：检查三个实现类的 `importBatch`、`exportBatch`、`saveFile` 方法，确保参数和返回值完全一致

**步骤 1.3：清理明显遗迹代码（2 天）**
- 删除 `tts.js` 中重复的 `start()` 方法定义
- 清理 `db.js`、`tts.js` 中大量被注释掉的 `console.log` 调试代码
- 修复 `i18n.js` 中已发现的重复键和错误映射
- **验证**：全局搜索 `console.log` 和重复函数定义，运行基本功能无异常

**风险控制**：
- 每一步都做**Git 独立提交**
- 每个步骤完成后，在 Web 端 (`python server.py`) 和 App 端 (`npx cap run android`) 跑一遍核心用户路径：打开书 → 翻页 → TTS → 导出配置 → 导入配置

---

#### Phase 2：文件拆分与职责清晰化（第 4~8 周）
**目标**：把「不敢改」的巨型文件拆成「改得动」的小模块。

**步骤 2.1：拆分 `tts.js`（8 天）**
按**运行角色**拆分，而不是按技术概念过度细分：

```
app/www/js/modules/tts/
├── tts-core.js          # 状态管理、播放控制、段落/页面模式切换
├── tts-highlighter.js   # 句子高亮、边界探测、滚动同步
├── tts-native-bridge.js # Web Speech API + APP 保活桥接
└── tts-azure-bridge.js  # 与 Azure TTS 插件的交互接口
```

- `tts-core.js` 暴露的接口与当前 `tts.js` 对外暴露的完全一致
- `index.html` 中的 `<script>` 标签顺序替换为加载这 4 个新文件
- **不迁移到 ES Module**，保持当前的全局命名空间风格（`Lumina.TTS.*`），避免引入打包工具
- **验证**：TTS 的 Web Speech 模式、Azure 模式、APP 后台播放、段落/页面双模式全部测试通过

**步骤 2.2：拆分 `ui.js`（6 天）**
按**面板/交互域**拆分：

```
app/www/js/modules/ui/
├── ui-core.js           # DOM 缓存、全局事件委托、Toast/对话框
├── ui-panels.js         # 左/右侧面板、书库面板、关于面板的开关逻辑
├── ui-gestures.js       # 触摸滑动、双指缩放、沉浸模式长按
└── ui-reading.js        # 阅读区专属交互（分页、目录、搜索高亮）
```

- 同样保持全局命名空间
- **验证**：所有面板开关、手势翻页、沉浸模式、双指缩放字号功能正常

**步骤 2.3：拆分 `main.css`（4 天）**
按**功能域**拆分，主题变量和配色方案完全不动：

```
app/www/css/
├── main.css             # 保留：CSS 变量定义、基础布局、主题切换
├── components.css       # 提取：按钮、输入框、标签、卡片等原子组件
├── panels.css           # 提取：侧边栏、书库面板、设置面板、搜索面板
├── reader.css           # 提取：阅读区、分页导航、目录高亮、批注样式
└── markdown.css         # 已有，不动
```

- `main.css` 从 2000+ 行缩减到只保留**变量、基础布局、通用工具类**
- 在 `index.html` 中按顺序引入新的 CSS 文件
- **验证**：切换 20+ 主题，确认所有界面样式无回归

**风险控制**：
- 拆分文件时，使用**"复制-替换-验证-删除旧文件"**的流程
- 每拆分一个模块，都跑一次完整的功能验证

---

#### Phase 3：建立最低限度的类型与测试护栏（第 9~12 周）
**目标**：防止接口不一致回潮，建立「敢改」的信心。

**步骤 3.1：为核心数据结构添加 JSDoc（5 天）**
不引入 TypeScript，用**零成本的 JSDoc**建立类型契约：

- 在 `namespace.js` 或新建 `types.js` 中定义：
```javascript
/**
 * @typedef {Object} BookRecord
 * @property {string} fileKey
 * @property {string} fileName
 * @property {DocumentItem[]} content
 * @property {number} lastChapter
 * @property {number} lastScrollIndex
 * @property {Annotation[]} annotations
 * @property {HeatMapData|null} heatMap
 */
```

- 为 `db.js` 的三个实现类、`config-manager.js`、`export-utils.js` 的关键函数补充 `@param` 和 `@returns`
- VS Code 会自动提供 IntelliSense 和参数提示

**步骤 3.2：建立核心模块的单元测试（5 天）**
使用**浏览器原生可运行的测试**，不引入 Jest/Vitest 等构建依赖：

新建 `app/www/tests/core-tests.js`，用纯 JS 写断言：

```javascript
const Tests = {
    runCryptoRoundTrip() {
        // 测试 .lmn 加密解密不丢数据
    },
    runTaskManagerCache() {
        // 测试 Azure TTS 缓存命中/淘汰
    },
    runConfigMerge() {
        // 测试 ConfigManager.mergeDeep 的边界情况
    },
    runSplitSentences() {
        // 测试 TTS 中文分句逻辑
    }
};
```

- 在 `demo/` 下新建 `test-runner.html`，加载核心模块后执行测试
- 每次重构前运行一遍，确保不破坏核心契约
- **验证**：四个核心测试全部通过

**步骤 3.3：Android 返回键的声明式改造（3 天）**
当前新增面板需要改 4 处（HTML、Java 查询、Java switch、JS handler），极易遗漏。

改为**声明式注册**：
- 在 `init.js` 中维护一个面板注册表：
```javascript
Lumina.BackButtonHandler.registerPanel({
    id: 'bookDetailPanel',
    closeClass: 'active',
    closeFn: () => Lumina.BookDetail.close(),
    zIndex: 300
});
```
- `MainActivity.java` 中的查询逻辑改为**遍历注册表生成的 JS 字符串**
- `init.js` 中的 handler 也遍历同一个注册表
- 新增面板时只需改 **1 处**
- **验证**：按返回键测试所有面板的关闭优先级和双击退出逻辑

---

#### Phase 4：前瞻性能力建设（第 13~16 周，持续迭代）
**目标**：在不破坏「离线优先」的前提下，增加可扩展性。

**步骤 4.1：插件 API 规范化（6 天）**
当前 Azure TTS 插件与核心有隐式耦合。定义正式的插件注册接口：

```javascript
Lumina.PluginManager.registerTTSProvider({
    id: 'azure-tts',
    name: 'Azure 语音',
    init: () => { /* ... */ },
    speak: (text, options) => { /* ... */ },
    stop: () => { /* ... */ },
    renderSettings: (container) => { /* ... */ }
});
```

- `tts-core.js` 通过统一接口调用插件，不再直接检测 `Lumina.Plugin.AzureTTS`
- 为未来的第三方 TTS 插件（如 OpenAI TTS、本地模型 TTS）预留接口

**步骤 4.2：建立性能基准（4 天）**
在 `demo/` 下新建 `benchmark.html`，自动测量并记录：
- 大文档（50万字）打开时间
- 1000 页 PDF 解析时间
- TTS 缓存命中率
- 首屏渲染时间

每次发布前跑一遍，防止性能回退。

**步骤 4.3：多设备同步方案预研（持续）**
- **不改现有存储架构**
- 在 `Crypto` 模块基础上，预研基于 **WebDAV** 的增量同步：
  - 只同步书籍元数据（进度、批注、热力图），不同步 `content`
  - 使用 `.lmn` 格式的对称加密包裹同步数据
  - 用户完全自选存储后端（坚果云、群晖 NAS、NextCloud）

---

### 三、执行优先级与里程碑

| 周次 | 里程碑 | 可交付验证 |
|------|--------|-----------|
| 第 1 周 | 配置导入统一 | 4 个入口导入后 UI 刷新完全一致 |
| 第 2 周 | DB 接口统一 | 三个实现类的签名一致，无类型错误 |
| 第 3 周 | 遗迹代码清理 | `tts.js` 无重复 `start()`，日志整洁 |
| 第 4~5 周 | TTS 模块化 | 4 个新文件替代旧 `tts.js`，功能无回归 |
| 第 6~7 周 | UI 模块化 | 面板、手势、阅读交互拆分完成 |
| 第 8 周 | CSS 功能域拆分 | `main.css` 瘦身，主题切换正常 |
| 第 9~10 周 | JSDoc 类型契约 | VS Code 对核心函数提供参数提示 |
| 第 11 周 | 核心单元测试 | `test-runner.html` 4 项测试通过 |
| 第 12 周 | 返回键声明式改造 | 新增面板只需改 1 处 |
| 第 13~16 周 | 插件 API 规范 + 基准测试 | 第三方 TTS 可接入，性能可追踪 |

---

### 四、风险控制清单

| 风险 | 应对策略 |
|------|---------|
| **重构引入回归 Bug** | 每步完成后在 Web + App 双端跑通核心路径；建立 `test-runner.html` 作为自动化回归护栏 |
| **文件拆分后加载顺序出错** | 保持全局命名空间模式（`Lumina.Xxx`），在 `index.html` 中显式控制 `<script>` 加载顺序 |
| **时间超预期** | 若某步骤卡住，允许跳过进入下一步（如 JSDoc 可先覆盖 50% 核心函数），不求完美 |
| **用户无感知，失去动力** | 每完成一个 Phase，给自己一个小版本号（如 v1.8.1 → v1.8.2），并在 release note 中记录内部改进 |

---

### 五、关键洞察

1. **不要引入构建工具**。项目当前最大的优势是「零构建依赖」，浏览器直接跑。一旦引入 Vite/Webpack，Capacitor 的同步流程会变复杂，得不偿失。
2. **不要重写为 TypeScript**。对独立开发者来说，**"拆文件 + JSDoc"** 的收益远大于 **"迁移 TS + 配编译链"**。
3. **CSS 的主题资产是安全的**。只需要把 `main.css` 按功能域物理拆分成多个文件，20+ 主题的配色变量完全不动。
4. **最优先解决的是「心智负担」**。`tts.js` 和配置导入的重复逻辑是当前最大的「不敢改」源头，拆分它们后，后续迭代速度会自然提升。

这个计划的核心是：**让重构的每一步都能立刻感受到「代码更好改了」，而不是为了遥远的优雅牺牲当下的稳定。**