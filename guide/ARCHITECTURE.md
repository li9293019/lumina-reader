# Lumina Reader 技术架构与开发规范白皮书

> **文档版本**：2.1  
> **适用范围**：Lumina Reader 核心开发与插件扩展  
> **核心原则**：离线优先、隐私至上、轻盈、简约

---

## 1. 项目概述与核心理念

### 1.1 阅读器的本质诉求

Lumina Reader（流萤阅读器）的本质诉求是：**为读者创造一个无干扰的沉浸式阅读空间**。

阅读是一种需要深度专注的心智活动。现代电子设备的阅读体验往往被以下因素破坏：
- 网络依赖导致的加载延迟与中断
- 隐私泄露风险（云端同步、阅读数据上传）
- 臃肿的功能与混乱的界面
- 需要注册的账号体系

Lumina Reader 致力于解决这些问题，提供**本地化、私密化、专注化**的阅读体验。

### 1.2 核心哲学

#### 离线优先（Offline First）

- **无网络依赖**：所有功能（解析、渲染、存储、搜索）完全本地运行
- **零外部请求**：不依赖 CDN、不加载远程资源（字体使用本地或系统字体）
- **完整的本地功能**：断网环境下功能与在线状态完全一致
- **数据主权**：用户的文档、阅读进度、批注完全由用户掌控

**实践体现**：
- 文档解析完全在浏览器/JavaScript 引擎内完成
- 书库存储在本地 IndexedDB/SQLite，而非云端
- 配置文件可导出为本地 `.lmn` 或 `.json` 文件

#### 隐私至上（Privacy First）

- **数据不出设备**：零上传策略，不存在服务器端
- **无需注册**：无账号体系，无身份追踪
- **本地加密**：敏感配置（如 Azure TTS Key）使用 AES-256-GCM 加密存储
- **权限最小化**：仅申请必要的文件访问权限

**实践体现**：
- 所有数据存储在 `localStorage` 或 `IndexedDB`，不传输到任何服务器
- 文件打开后立即在本地解析为内存数据结构，不留临时文件
- 配置备份文件可由用户选择加密密码

#### 轻盈简约（Lightweight & Minimalist）

- **功能克制**：拒绝功能膨胀，每个功能都必须服务于"更好的阅读体验"
- **界面干净**：无广告、无社交功能、无复杂菜单
- **性能优先**：流畅的渲染、快速的搜索、即时的响应
- **低资源占用**：内存优化、存储优化、电量优化

**实践体现**：
- Vanilla JS 而非重型框架（React/Vue），减少运行时开销
- 分页渲染而非无限滚动，控制内存占用
- 图片懒加载与预加载策略平衡性能与体验
- 字体子集化（仅加载使用的字符）

#### 长期可用（Longevity）

- **开放数据格式**：文档、配置、书库数据格式开放透明
- **不依赖外部服务**：即使停止维护，软件仍可正常使用
- **数据可迁移**：配置可导出，文档可复制，不绑架用户

### 1.3 美学理念

#### 排版美学

Lumina 追求**纸质书般的阅读体验**：

- **字体**：霞鹜文楷（LXGW Neo Zhi Song）作为首选，兼顾屏幕显示与传统书法美感
- **行距与字距**：可调节的行高（1.0-2.0）和段落间距，模仿纸质书的呼吸感
- **首行缩进与首字下沉**：传统中文排版元素的现代演绎
- **页边距**：可调节的页面边距，创造"留白"的阅读空间

#### 交互美学

- **隐形设计**：好的设计是用户注意不到的。界面元素在不使用时自动隐藏，阅读时专注于内容
- **平滑过渡**：页面切换、主题切换使用过渡动画，减少突兀感
- **一致性**：所有按钮、输入框、面板遵循统一的视觉语言

#### 主题美学

- **克制配色**：20+ 主题均遵循"不刺眼、不疲劳"原则
- **深色模式**：不是简单的颜色反转，而是专门为夜间阅读调校的配色
- **羊皮纸模式**：模仿古籍的阅读氛围

### 1.4 项目定位

**跨平台沉浸式本地文档阅读器**

- **跨平台**：Web（浏览器）与 Android App（Capacitor）共享同一份代码
- **沉浸式**：全屏阅读、隐藏 UI、专注模式
- **本地优先**：所有数据本地存储，可选导出备份
- **文档阅读器**：专注于"阅读"而非"编辑"，支持多种文档格式

---

## 2. 功能特性全景

### 2.1 支持的文档格式

| 格式 | 扩展名 | 特性支持 | 技术实现 |
|------|--------|----------|----------|
| **Word** | .docx | 文本、图片、样式、密码保护 | JSZip + XML 解析 |
| **PDF** | .pdf | 文本提取、图片嵌入、密码保护 | pdf.js |
| **纯文本** | .txt | 自动编码检测（UTF-8/GBK/Big5/ANSI） | Encoding API |
| **Markdown** | .md | 富文本渲染（插件）、代码高亮 | markdown-it + PrismJS |
| **EPUB** | .epub | 电子书解析（ZIP + OPF/XML） | JSZip + XML 解析 |
| **HTML** | .html | 标签清理、纯文本提取 | DOMParser |
| **JSON 配置** | .json | 配置导出/导入 | JSON.parse/stringify |
| **加密配置** | .lmn | AES-256-GCM 加密配置 | Web Crypto API |

### 2.2 核心阅读功能

**智能章节系统**
- 自动检测章节标题（支持中文"第X章"、英文"Chapter X"、Markdown 标题等）
- 6级层级支持（Part > Chapter > Section > Subsection...）
- 5种编号策略（中文小说、英文小说、学术论文、技术文档、无编号）
- 自定义正则匹配章节

**导航系统**
- 侧边栏目录树（支持折叠）
- 上一章/下一章快捷键
- 全文搜索（支持正则）
- 阅读进度记忆（精确到段落索引）

**分页系统**
- 智能分页：基于阅读字数（中文字符 + 英文单词）
- 图片等效字数：大图片按字数折算，避免单页全是图片
- 分页导航：页码指示器、上一页/下一页

**批注系统**
- 书签：标记阅读位置
- 高亮批注：选中文本添加注释
- 批注列表：按时间/位置查看所有批注

**G点热力图**
- 关键词高亮：自定义标签（如"修仙"、"魔法"）
- 热力分析：可视化显示关键词分布密度
- 预设管理：保存常用标签组合

### 2.3 个性化系统

**主题系统**
- 20+ 内置主题：云白、青石、羊皮纸、深夜、墨黑等
- 主题分类：浅色系、深色系、暖色系、冷色系
- 自动主题切换：根据时间自动切换（可选）

**字体系统**
- 霞鹜文楷（默认）：开源中文字体，屏幕优化
- 系统字体回退：确保各平台都有可用字体
- 字体度量调整：解决不同字体的行高对齐问题

**排版设置**
- 首行缩进（中文传统排版）
- 首字下沉（西式设计元素）
- 字号（14px-32px 连续可调）
- 行高（1.0-2.0）
- 段间距（0-3em）
- 页宽（50%-100%）
- 边距（0-80px）

### 2.4 语音朗读（TTS）

**系统 TTS**
- 使用设备原生语音合成（Web Speech API / Android TTS）
- 语速、音调调节
- 定时停止（15/30/60分钟）

**Azure TTS（插件）**
- 高品质神经网络语音
- 多种音色：晓晓（女声）、云希（男声）、晓寒（女声）等
- 角色风格：助手、聊天、新闻、客户服务、 affectionate 等
- 预加载缓存：提前合成后续段落，消除停顿
- 任务管理器：智能调度语音合成任务，控制并发
- ROM 引导弹窗：首次启动检测电池优化，引导用户设置

### 2.5 AI 阅读助手（本地优先）

**划词 AI 交互**
- 选中文本后弹出 AI 工具栏（翻译 / 解释 / 润色 / 续写）
- 支持 LM Studio / Ollama（OpenAI 兼容接口）
- 流式响应，Markdown 渲染
- 对话历史与上下文引用管理

**架构定位**
- `ai.js` 作为核心模块（非插件），与阅读器深度集成
- 配置项：`ai.enabled`、`ai.endpoint`、`ai.model`、`ai.maxTokens` 等
- 数据不出设备，完全本地运行

### 2.6 数据管理

**本地书库**
- 书籍存储：支持 TXT、Markdown、HTML、EPUB 等纯文本格式存储到本地数据库
- 元数据：书名、作者、字数、阅读进度、最后阅读时间、封面
- 去重机制：基于文件名+大小+修改时间的文件键生成
- 批量导入/导出
- 书籍详情页：封面展示、阅读统计、标签管理

**分享卡片**
- 选中文本生成精美书签卡片
- SVG 实时预览 + Canvas 高清导出（双轨渲染）
- 支持短/中/长三种自适应版式
- 手势交互：滑动切换图案、缩放查看细节

**配置管理**
- 统一配置：通过 `ConfigManager` 集中管理所有设置
- 配置备份：导出为 `.json`（明文）或 `.lmn`（AES-256-GCM 加密）
- 跨平台同步：通过配置文件在不同设备间迁移设置
- 版本迁移：配置结构升级时自动迁移旧配置

---

## 3. 技术独创性与亮点

### 3.1 编码智能检测系统

**问题背景**：中文 TXT 文档常见编码包括 UTF-8、GBK、Big5、ANSI（Windows-1252），错误的编码会导致乱码。

**解决方案**：
- **多编码置信度评分**：同时计算 UTF-8、GBK、Big5、ANSI 四种编码的置信度分数
- **UTF-8 序列验证**：严格验证多字节序列的合法性，排除"看似 UTF-8 实际是 GBK"的情况
- **常见字符奖励**：GBK 编码中，常用汉字（0xB0-0xF7 区）获得额外加分
- **降级策略**：置信度不足时优先尝试 GB18030（向下兼容 GBK）

**技术细节**：
```javascript
// 置信度阈值
confidenceThreshold: { HIGH: 85, MEDIUM: 70, LOW: 50 }

// UTF-8 验证：检查多字节序列的连续性
// GBK 验证：检查双字节范围（0x81-0xFE + 0x40-0x7E/0x80-0xFE）
```

### 3.2 分页渲染引擎

**问题背景**：大文档（如 100 万字小说）一次性渲染会导致页面卡顿甚至崩溃。

**解决方案**：
- **字数均衡分页**：不是按段落数分页，而是按"阅读字数"（中文字符 + 英文单词）均衡分配
- **图片等效字数**：大图片按 300 字计算，避免单页全是图片
- **虚拟渲染**：仅渲染当前页，前后页预加载，其他页不渲染
- **DOM 批量操作**：使用 `DocumentFragment` 批量插入，减少重排

**技术细节**：
```javascript
// 分页参数
pagination: {
    enabled: true,
    maxReadingWords: 3000,        // 单页最大约 3000 字
    imageEquivalentWords: 300     // 1张图片 ≈ 300字
}

// 渲染流程
1. 计算章节内所有 items 的字数
2. 按 maxReadingWords 划分 pageRanges
3. 仅渲染当前 pageIdx 对应的 range
4. requestAnimationFrame 延迟读操作（scrollIntoView）
```

### 3.3 存储抽象层（Storage Adapter）

**问题背景**：Web 端使用 IndexedDB，App 端使用 SQLite，需要统一接口。

**解决方案**：**适配器模式**

```
StorageAdapter (统一接口)
    ├── IndexedDBImpl    (浏览器端)
    ├── SQLiteImpl       (Web SQLite)
    └── CapacitorSQLiteImpl (App 原生)
```

**技术亮点**：
- **统一接口**：`saveFile()`, `getFile()`, `deleteFile()`, `getAllFiles()` 等方法完全一致
- **智能降级**：Capacitor SQLite 不可用时自动降级到 IndexedDB
- **文件键生成**：`{name}_{size}_{mtime}` 确保同一文件修改后能识别为新版本
- **事务支持**：批量操作使用数据库事务，保证原子性

### 3.4 配置双轨制与迁移系统

**问题背景**：早期配置分散在多个 localStorage key，后期需要统一配置管理，同时兼容旧版本。

**解决方案**：
- **双轨制**：
  - **新轨**：`ConfigManager` 管理，存储在 `luminaConfig` key，结构化数据
  - **旧轨**：`State.settings` 运行时对象，保持旧代码兼容
- **自动迁移**：首次加载时检测旧配置 key（如 `luminaSettings`），自动迁移到新结构
- **版本控制**：配置结构带 `version` 字段，支持未来升级

**技术亮点**：
```javascript
// 迁移示例：旧 luminaSettings → 新 luminaConfig
// 旧 lumina_heatmap_presets → 新 heatMap.presets
// 旧 lumina_azure_tts_config → 新 azureTTS
```

### 3.5 插件化架构（Hook System）

**设计目标**：核心功能与扩展功能完全解耦，无插件时核心功能不受影响。

**实现机制**：
- **钩子系统**：在关键节点预留钩子（Hook）
  - `beforeParse`: 解析前，可接管或修改原始数据
  - `afterParse`: 解析后，可修改解析结果
  - `createElement`: 创建 DOM 元素时，插件可返回自定义元素
  - `afterRender`: 渲染后，可进行 DOM 操作
  - `settingsRender`: 设置面板渲染时，添加插件设置
- **优先级机制**：钩子回调带优先级，数字越小越早执行
- **中断机制**：钩子返回非空值时中断后续执行

**技术亮点**：
```javascript
// Markdown 插件通过 createElement 钩子接管 Markdown 渲染
PluginManager.registerHook('createElement', (item, index) => {
    if (item.type === 'markdown') {
        return renderMarkdown(item.content); // 返回自定义 DOM
    }
    return null; // 让后续钩子处理
}, priority = 5);
```

### 3.6 单命名空间模块化（Vanilla JS）

**技术选择**：不使用 React/Vue 等框架，使用原生 ES6 模块 + 单一全局命名空间。

**优势**：
- **零构建工具依赖**：浏览器直接解析 ES6 modules
- **运行时性能**：无 Virtual DOM 开销，直接操作 DOM
- **内存占用**：无框架运行时，内存占用低
- **调试简单**：浏览器 DevTools 直接查看源码

**组织架构**：
```javascript
// 单一全局对象 Lumina
Lumina = {
    State: {},      // 运行时状态
    Config: {},     // 静态配置
    DOM: {},        // DOM 缓存
    Utils: {},      // 工具函数
    Parser: {},     // 解析器
    Renderer: {},   // 渲染器
    DB: {},         // 存储层
    UI: {},         // UI 交互
    PluginManager: {}, // 插件系统
    // ...
}
```

---

## 4. 架构总览与数据流

### 4.1 系统分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                        展示层 (Presentation)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │   DOM    │ │   UI     │ │  主题    │ │  国际化  │        │
│  │ 缓存管理 │ │ 组件管理 │ │  系统    │ │  (I18n)  │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ 渲染
┌─────────────────────────────────────────────────────────────┐
│                        核心层 (Core)                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │    Parser    │ │   Renderer   │ │    Chapter   │        │
│  │  文件解析    │ │   渲染引擎   │ │   章节管理   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │  Pagination  │ │    Actions   │ │  Annotations │        │
│  │   分页系统   │ │   操作分发   │ │   批注系统   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ 数据操作
┌─────────────────────────────────────────────────────────────┐
│                        数据层 (Data)                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │    State     │ │ConfigManager │ │     DB       │        │
│  │   运行时状态 │ │   配置管理   │ │   存储层     │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ 持久化
┌─────────────────────────────────────────────────────────────┐
│                      插件层 (Plugins)                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │   Markdown   │ │   AzureTTS   │ │   Future...  │        │
│  │    插件      │ │    插件      │ │    插件      │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ 桥接
┌─────────────────────────────────────────────────────────────┐
│                     桥接层 (Bridges)                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │    File      │ │     DB       │ │   Exporter   │        │
│  │   文件桥接   │ │   数据库桥接 │ │   导出桥接   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 核心数据流

#### 文档加载与渲染流程

```
┌─────────┐    ┌──────────────┐    ┌──────────────┐
│  File   │───▶│ Encoding     │───▶│   Parser     │
│  文件   │    │ 编码检测     │    │   文件解析   │
└─────────┘    └──────────────┘    └──────────────┘
                                              │
                                              ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    Render    │◀───│  Pagination  │◀───│   Chapter    │
│    渲染      │    │   分页计算   │    │   章节划分   │
└──────────────┘    └──────────────┘    └──────────────┘
        │
        ▼
┌──────────────┐
│     DOM      │
│   页面展示   │
└──────────────┘
```

**详细说明**：

1. **文件选择**：用户选择文件（通过 `<input>` 或拖拽）
2. **编码检测**：`EncodingManager` 检测文件编码，转换为 UTF-8 文本
3. **文件解析**：根据扩展名调用对应解析器
   - DOCX: 解压 docx → 解析 XML → 提取段落和图片
   - PDF: pdf.js 渲染 → 提取文本层
   - TXT/MD/HTML: 文本解析，识别标题层级
4. **文档模型**：解析结果为 `document.items[]` 数组，每个 item 有 `type` 和 `text`
5. **章节划分**：`buildChapters()` 扫描 items，识别 title/heading 作为章节边界
6. **分页计算**：`Pagination.calculateRanges()` 按字数将 items 分组为 pages
7. **渲染**：`renderCurrentChapter()` 渲染当前 page 的 items 到 DOM

#### 配置变更与持久化流程

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    User      │───▶│    State.    │───▶│   Settings   │
│    Action    │    │   settings   │    │    save()    │
└──────────────┘    └──────────────┘    └──────────────┘
                                                │
                                                ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    Apply     │◀───│ ConfigManager│◀───│   localStorage│
│   应用到UI   │    │     set()    │    │   luminaConfig│
└──────────────┘    └──────────────┘    └──────────────┘
```

**详细说明**：

1. **用户操作**：修改设置（如切换主题）
2. **状态更新**：直接修改 `Lumina.State.settings.theme`
3. **配置保存**：`Settings.save()` 将 State 映射到 ConfigManager 路径
4. **持久化**：`ConfigManager.set()` 更新内存配置并写入 localStorage
5. **应用到 UI**：`Settings.apply()` 读取新配置，更新 CSS 变量和 DOM

### 4.3 状态管理架构

#### 运行时状态 (Lumina.State.app)

```javascript
Lumina.State.app = {
    // 当前文件
    currentFile: {
        name: '',           // 文件名
        type: '',           // 扩展名
        handle: null,       // File System API handle
        rawContent: null,   // 原始文本内容（用于重新解析）
        wordCount: 0,       // 字数统计
        openedAt: null,     // 打开时间
        fileKey: null       // 数据库键
    },
    
    // 文档数据
    document: {
        items: [],          // 段落数组
        type: ''            // 文件类型
    },
    
    // 章节数据
    chapters: [],           // 章节数组
    currentChapterIndex: 0, // 当前章节索引
    
    // 分页数据
    pageRanges: [],         // 分页范围
    currentPageIdx: 0,      // 当前页码
    
    // 搜索数据
    search: {
        matches: [],
        currentQuery: '',
        highlightedIndex: -1
    },
    
    // UI 状态
    ui: {
        isProcessing: false,  // 是否正在处理文件
        isImmersive: false    // 是否沉浸模式
    },
    
    // 批注/书签
    annotations: []
}
```

**特点**：
- **运行时性质**：随页面刷新重置，不持久化
- **阅读进度**：由 `currentChapterIndex` 和 `currentPageIdx` 共同定位
- **渲染依据**：`document.items` 和 `chapters` 是渲染的唯一数据源

#### 用户偏好设置 (Lumina.State.settings)

```javascript
Lumina.State.settings = {
    // 外观
    language: 'zh',
    theme: 'light',
    font: 'serif',
    fontSize: 20,
    lineHeight: 15,
    
    // 排版
    indent: false,
    dropCap: false,
    paragraphSpacing: 3,
    pageWidth: 80,
    margin: 40,
    
    // 功能
    smoothScroll: true,
    ignoreEmptyLines: false,
    textCleaning: true,
    
    // 章节识别
    chapterRegex: '',
    sectionRegex: '',
    chapterNumbering: 'none',
    
    // TTS
    ttsRate: 10,
    ttsPitch: 10,
    
    // 分页
    paginationEnabled: true,
    paginationMaxWords: 3000,
    paginationImageWords: 300,
    
    // 导出
    encryptedExport: false,
    
    // PDF
    pdfExtractImages: true,
    pdfPasswordPreset: false,
    pdfSmartGuess: true
}
```

**特点**：
- **持久化**：通过 `Settings.save()` 保存到 `ConfigManager`
- **响应式**：变更后调用 `Settings.apply()` 立即生效
- **跨会话**：下次打开时从 `ConfigManager.load()` 恢复

---

## 5. 核心数据模型详解

### 5.1 Document Model 文档对象

**核心数据结构**：`Lumina.State.app.document.items`

**Item 类型定义**：

```typescript
interface DocumentItem {
    type: 'paragraph' | 'title' | 'heading1' | 'heading2' | 'heading3' | 
          'heading4' | 'heading5' | 'heading6' | 'image' | 'list';
    text: string;           // 原始文本
    display?: string;       // 显示文本（带章节编号）
    cleanText?: string;     // 干净文本（去掉"第X章"前缀）
    level?: number;         // 标题层级（1-6）
    data?: string;          // 图片数据（base64/data-url）
    alt?: string;           // 图片替代文本
}
```

**字段语义详解**：

- **`text`**：从文件解析出的原始文本。对于章节标题，可能是"第1章 序章"。
- **`cleanText`**：去掉章节编号后的纯标题。"第1章 序章" → "序章"。用于章节列表显示。
- **`display`**：应用编号策略后的显示文本。"序章" → "第一章 序章"（使用中文编号策略时）。
- **`type`**：元素类型，决定渲染方式。

**示例**：

```javascript
// 普通段落
{ type: 'paragraph', text: '这是一个普通的段落。' }

// 章节标题
{ 
    type: 'heading1', 
    text: '第1章 序章',
    cleanText: '序章',
    display: '第一章 序章'
}

// 图片
{
    type: 'image',
    text: '',  // 图片无文本
    data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...',
    alt: '描述文本'
}
```

### 5.2 Chapter Model 章节模型

**核心数据结构**：`Lumina.State.app.chapters[]`

**Chapter 类型定义**：

```typescript
interface Chapter {
    id: string;             // 章节唯一ID，如 "chapter-0" 或 "preface-0"
    title: string;          // 章节标题（干净文本）
    isPreface: boolean;     // 是否前言/序章（无章节编号）
    startIndex: number;     // 在 document.items 中的起始索引
    endIndex: number;       // 在 document.items 中的结束索引
    items: DocumentItem[];  // 章节包含的 items（引用 document.items 片段）
}
```

**章节划分算法**：

```javascript
// 算法逻辑（简化版）
const buildChapters = (items) => {
    const chapters = [];
    let currentChapter = null;
    let buffer = []; // 前言缓冲区
    
    items.forEach((item, index) => {
        if (isChapterStart(item)) {
            // 遇到新章节标题，先保存之前的缓冲内容作为"前言"
            if (buffer.length > 0) {
                chapters.push(createPrefaceChapter(buffer, index - buffer.length));
                buffer = [];
            }
            
            // 创建新章节
            currentChapter = {
                id: `chapter-${chapters.length}`,
                title: extractChapterTitle(item),
                isPreface: false,
                startIndex: index,
                endIndex: items.length - 1, // 暂时，后续会更新
                items: [item]
            };
            chapters.push(currentChapter);
        } else {
            // 非章节标题
            if (currentChapter) {
                // 已有章节，追加到当前章节
                currentChapter.items.push(item);
                currentChapter.endIndex = index;
            } else {
                // 无章节，加入前言缓冲区
                buffer.push(item);
            }
        }
    });
    
    // 处理剩余的前言内容
    if (buffer.length > 0) {
        chapters.push(createPrefaceChapter(buffer, items.length - buffer.length));
    }
    
    return chapters;
};

// 判断是否为章节开始
const isChapterStart = (item) => {
    return item.type === 'title' || item.type === 'heading1';
};
```

**6级层级计数器**：

```javascript
Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
// 索引 0: heading1 计数
// 索引 1: heading2 计数
// ...
// 索引 5: heading6 计数

// 应用编号时更新计数器
const updateCounters = (level) => {
    counters[level - 1]++;           // 当前层级 +1
    for (let i = level; i < 6; i++) {
        counters[i] = 0;             // 下级重置为 0
    }
};

// 示例：遇到 heading1 → [1, 0, 0, 0, 0, 0]
//       遇到 heading2 → [1, 1, 0, 0, 0, 0]
//       遇到 heading1 → [2, 0, 0, 0, 0, 0] (heading2 及以下重置)
```

### 5.3 Pagination Model 分页模型

**核心数据结构**：`pageRanges[]`（存储在章节对象中）

**PageRange 类型定义**：

```typescript
interface PageRange {
    start: number;      // 在章节 items 中的起始索引
    end: number;        // 在章节 items 中的结束索引
    words: number;      // 本页阅读字数
}
```

**字数计算算法**：

```javascript
const calculateContentStats = (text) => {
    // 中文字符（含标点）
    const cn = text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g)?.length || 0;
    
    // 英文单词（连续字母）
    const enWords = text.match(/[a-zA-Z]+/g)?.length || 0;
    
    // 阅读字数 = 中文字符 + 英文单词
    const readingWords = cn + enWords;
    
    return { cn, enWords, readingWords };
};
```

**分页算法**：

```javascript
const calculateRanges = (items) => {
    const maxWords = 3000;           // 单页最大字数
    const imageWords = 300;          // 图片等效字数
    
    const ranges = [];
    let currentWords = 0;
    let pageStart = 0;
    
    items.forEach((item, idx) => {
        let itemWords = 0;
        
        if (item.type === 'image') {
            itemWords = imageWords;
        } else {
            itemWords = calculateContentStats(item.text || '').readingWords;
        }
        
        // 如果加入此项会超限，且当前页已有内容，则新开一页
        if (currentWords + itemWords > maxWords && currentWords > 0) {
            ranges.push({
                start: pageStart,
                end: idx - 1,
                words: currentWords
            });
            pageStart = idx;
            currentWords = 0;
        }
        
        currentWords += itemWords;
    });
    
    // 最后一页
    if (pageStart < items.length) {
        ranges.push({
            start: pageStart,
            end: items.length - 1,
            words: currentWords
        });
    }
    
    return ranges;
};
```

### 5.4 运行时状态 State

**职责分离原则**：

| 状态对象 | 职责 | 持久化 | 生命周期 |
|----------|------|--------|----------|
| `Lumina.State.app` | 运行时数据（当前文件、阅读进度） | 否（由 DB 持久化） | 页面刷新重置 |
| `Lumina.State.settings` | 用户偏好设置 | 是（通过 ConfigManager） | 跨会话保持 |
| `Lumina.DOM` | DOM 元素缓存 | 否 | 页面刷新重置 |

**阅读进度定位**：

阅读进度由两个维度共同确定：

```javascript
// 维度1：章节索引
const chapterIndex = Lumina.State.app.currentChapterIndex;
const chapter = Lumina.State.app.chapters[chapterIndex];

// 维度2：页码索引（章节内分页）
const pageIdx = Lumina.State.app.currentPageIdx || 0;
const pageRange = chapter.pageRanges[pageIdx];

// 实际渲染范围
const startGlobalIdx = chapter.startIndex + pageRange.start;
const endGlobalIdx = chapter.startIndex + pageRange.end;
```

---

## 6. 核心子系统详解

### 6.1 解析系统 (Parser)

#### 6.1.1 编码检测器 (EncodingManager)

**职责**：自动检测文件编码，将二进制数据转换为 UTF-8 文本。

**支持的编码**：
- UTF-8（含 BOM）
- UTF-8（无 BOM）
- GBK / GB18030
- Big5（繁体中文）
- Windows-1252（ANSI）

**检测流程**：

```
1. BOM 检测（文件头字节标记）
   - EF BB BF → UTF-8
   - FF FE → UTF-16 LE
   - FE FF → UTF-16 BE
   
2. 置信度评分（多编码并行计算）
   - UTF-8：验证多字节序列合法性
   - GBK：检查双字节范围，常用汉字加分
   - Big5：检查繁体汉字范围
   - ANSI：检查扩展字符分布
   
3. 候选排序（按置信度降序）

4. 尝试解码（从最高置信度开始）
   - 成功 → 返回文本
   - 失败（含替换字符 U+FFFD）→ 尝试下一个编码
   
5. 最终回退：GB18030（兼容性最强）
```

**关键实现**：见 `parser.js` 中 `EncodingManager` 对象。

#### 6.1.2 文件解析器

**DOCX 解析**：

```javascript
// 技术原理：docx 是 zip 压缩包，包含 XML 文件
const parseDOCX = async (arrayBuffer) => {
    // 1. 解压 docx
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // 2. 读取 word/document.xml
    const xmlContent = await zip.file('word/document.xml').async('text');
    
    // 3. 解析 XML 提取段落
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'application/xml');
    const paragraphs = doc.querySelectorAll('w:p');
    
    // 4. 提取文本和样式
    const items = [];
    paragraphs.forEach(p => {
        const text = extractTextFromParagraph(p);
        const style = detectParagraphStyle(p); // 标题/正文
        items.push({ type: style, text });
    });
    
    // 5. 提取图片（从 media/ 目录）
    const images = await extractImages(zip);
    
    return { items, images };
};
```

**PDF 解析**：

```javascript
// 技术原理：使用 Mozilla 的 pdf.js
const parsePDF = async (arrayBuffer, onProgress) => {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const items = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // 提取文本层
        const text = textContent.items.map(item => item.str).join(' ');
        items.push({ type: 'paragraph', text });
        
        // 提取图片（可选，性能开销大）
        if (extractImages) {
            const images = await extractImagesFromPage(page);
            items.push(...images);
        }
        
        onProgress?.(i, pdf.numPages);
    }
    
    return { items };
};
```

**TXT/Markdown/HTML 解析**：

```javascript
const parseTextFile = (text, fileType) => {
    const lines = text.split(/\r?\n/);
    const items = [];
    
    lines.forEach(line => {
        if (fileType === 'md') {
            // Markdown 解析
            if (line.startsWith('# ')) {
                items.push({ type: 'heading1', text: line.slice(2) });
            } else if (line.startsWith('## ')) {
                items.push({ type: 'heading2', text: line.slice(3) });
            } else {
                items.push({ type: 'paragraph', text: line });
            }
        } else {
            // 纯文本
            items.push({ type: 'paragraph', text: line });
        }
    });
    
    return { items };
};
```

#### 6.1.3 章节识别 (RegexCache)

**职责**：根据正则表达式识别章节标题。

**默认正则模式**：

```javascript
const defaultPatterns = {
    chineseChapter: /^[<第]\s*[一二三四五六七八九十百千万零〇壹贰叁肆伍陆柒捌玖拾佰仟萬上中下\d]+\s*[部章卷>][.、：:]?\s*(.{0,15})/i,
    englishChapter: /^(Chapter|Chap|Part|Book)\s*(\d+[\.:\-]?\d*)\s*[:\-]?\s*(.{0,15})/i,
    sectionDash: /^<?(\d+)[\-–—\.](\d+)\s*[:\-]?>?\s*(.{0,15})/,
    mdHeading: /^(#{1,6})\s+(.+)$/
};
```

**动态重解析**：

用户修改正则后，可以重新解析文档而不重新加载文件：

```javascript
const reparseDocumentStructure = async () => {
    // 1. 重新扫描所有 items，识别章节
    // 2. 重建 chapters 数组
    // 3. 重新分页
    // 4. 重新渲染
};
```

### 6.2 渲染系统 (Renderer)

#### 6.2.1 分页渲染主流程

```javascript
const renderCurrentChapter = (targetIndex = null) => {
    const chapter = state.chapters[state.currentChapterIndex];
    
    // 1. 确保分页数据存在
    if (!chapter.pageRanges) {
        chapter.pageRanges = Pagination.calculateRanges(chapter.items);
    }
    
    // 2. 确定当前页码
    const pageIdx = calculatePageIndex(targetIndex);
    const range = chapter.pageRanges[pageIdx];
    
    // 3. 清空并重建 DOM（批量操作）
    contentWrapper.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    for (let i = range.start; i <= range.end; i++) {
        const item = chapter.items[i];
        const line = createDocLineElement(item, chapter.startIndex + i);
        fragment.appendChild(line);
    }
    
    contentWrapper.appendChild(fragment);
    
    // 4. 延迟读操作到下一帧
    requestAnimationFrame(() => {
        // 高亮、滚动、恢复 TTS 位置等读操作
        highlightCurrentLine();
        scrollToTarget();
    });
};
```

#### 6.2.2 单行元素创建

```javascript
const createDocLineElement = (item, globalIndex) => {
    // 【插件钩子】让插件有机会接管渲染
    const hookResult = PluginManager.executeHook('createElement', item, globalIndex);
    if (hookResult) return hookResult;
    
    // 默认渲染
    const div = document.createElement('div');
    div.className = 'doc-line';
    div.dataset.index = globalIndex;
    
    // 根据类型添加类名
    if (item.type.startsWith('heading')) {
        div.classList.add(`chapter-${item.type.replace('heading', '')}`);
    } else if (item.type === 'image') {
        // 图片特殊处理
        const img = document.createElement('img');
        img.src = item.data;
        img.loading = 'lazy';
        div.appendChild(img);
        return div;
    }
    
    div.textContent = item.display || item.text;
    return div;
};
```

#### 6.2.3 性能优化策略

**批量 DOM 操作**：
- 使用 `DocumentFragment` 批量插入，减少重排次数
- 先清空 `innerHTML`，再一次性插入新内容

**延迟读操作**：
- 将 `scrollIntoView`、`getBoundingClientRect` 等触发重排的读操作延迟到 `requestAnimationFrame`
- 确保所有写操作（DOM 修改）完成后再进行读操作

**图片优化**：
- **懒加载**：`loading="lazy"`，仅视口内图片加载
- **预加载**：下一页图片在空闲时预加载（`requestIdleCallback`）
- **大小限制**：大于 500KB 的图片不参与预加载

### 6.3 存储系统 (DB)

#### 6.3.1 适配器模式

```javascript
// 统一接口
class StorageAdapter {
    async use(type) {
        if (type === 'indexeddb') this.impl = new IndexedDBImpl();
        else if (type === 'sqlite') this.impl = new SQLiteImpl();
        else if (type === 'capacitor') this.impl = new CapacitorSQLiteImpl();
    }
    
    async saveFile(fileKey, data) { return this.impl.saveFile(fileKey, data); }
    async getFile(fileKey) { return this.impl.getFile(fileKey); }
    async deleteFile(fileKey) { return this.impl.deleteFile(fileKey); }
    // ...
}

// IndexedDB 实现
class IndexedDBImpl {
    async saveFile(fileKey, data) {
        const record = {
            fileKey,
            fileName: data.fileName,
            fileType: data.fileType,
            content: data.content,      // 文本内容或 ArrayBuffer
            wordCount: data.wordCount,
            lastChapter: data.lastChapter,
            lastScrollIndex: data.lastScrollIndex,
            annotations: data.annotations || [],
            cover: data.cover || null,
            heatMap: data.heatMap || null,
            lastReadTime: new Date().toISOString()
        };
        
        return new Promise((resolve) => {
            const tx = this.db.transaction(['fileData'], 'readwrite');
            const store = tx.objectStore('fileData');
            const request = store.put(record);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    }
}
```

#### 6.3.2 文件键生成策略

```javascript
const generateFileKey = (file) => {
    const name = file.name || file;
    const size = file.size || 0;
    const mtime = file.lastModified || 0;
    return `${name}_${size}_${mtime}`;
};

// 特点：
// 1. 同一文件修改后（mtime 变化）→ 生成新 key，识别为新版本
// 2. 不同文件但同名同大小 → mtime 不同，key 不同，避免冲突
// 3. 简单可预测，便于调试
```

### 6.4 配置系统 (ConfigManager)

#### 6.4.1 配置结构

```javascript
// 完整配置结构（config-manager.js getDefaultConfig）
const config = {
    version: 1,                     // 配置版本，用于迁移
    lastModified: Date.now(),       // 最后修改时间
    
    // 1. 阅读设置
    reading: {
        language: 'zh',
        theme: 'light',
        font: 'serif',
        fontSize: 20,
        lineHeight: 15,
        paragraphSpacing: 3,
        pageWidth: 80,
        margin: 40,
        indent: false,
        dropCap: false,
        smoothScroll: true,
        ignoreEmptyLines: false,
        textCleaning: true,
        sidebarVisible: false,
        chapterNumbering: 'none'
    },
    
    // 2. 正则设置
    regex: {
        chapter: '',
        section: ''
    },
    
    // 3. TTS 设置
    tts: {
        rate: 10,
        pitch: 10,
        voiceURI: null,
        volume: 1.0
    },
    
    // 4. 分页设置
    pagination: {
        enabled: true,
        maxWords: 3000,
        imageWords: 300
    },
    
    // 5. PDF 设置
    pdf: {
        extractImages: true,
        passwordPreset: {
            enabled: false,
            smartGuess: true,
            length: 4,
            prefix: '',
            commonPasswords: ['1234', '0000']
        }
    },
    
    // 6. 导出设置
    export: {
        encrypted: false
    },
    
    // 7. 热力图预设
    heatMap: {
        presets: []
    },
    
    // 8. Azure TTS
    azureTTS: {
        enabled: false,
        speechKey: '',
        region: 'eastasia',
        voice: 'zh-CN-XiaoxiaoNeural',
        style: 'general',
        rate: 1.0,
        pitch: 0,
        cache: {
            enabled: true,
            preloadCount: 5,
            cacheDepth: 5,
            waitTimeout: 2000
        }
    },
    
    // 9. AI 设置
    ai: {
        enabled: false,
        endpoint: 'http://localhost:1234',
        model: '',
        apiKey: '',
        timeout: 30000,
        systemPrompt: '你是一个 helpful 的阅读助手...',
        maxTokens: 4096
    },
    
    // 10. 插件状态
    plugins: {},
    
    // 11. 元数据
    meta: {
        firstInstall: Date.now(),
        lastBackup: null,
        importCount: 0
    }
};
```

#### 6.4.2 API 使用

```javascript
// 读取配置（支持路径）
const theme = Lumina.ConfigManager.get('reading.theme');
const presets = Lumina.ConfigManager.get('heatMap.presets');

// 写入配置（自动持久化）
Lumina.ConfigManager.set('reading.theme', 'dark');
Lumina.ConfigManager.set('heatMap.presets', [...]);

// 批量保存
Lumina.ConfigManager.save(configObject);

// 重置配置
Lumina.ConfigManager.reset();
```

#### 6.4.3 版本迁移机制

```javascript
const migrate = (config) => {
    if (config.version === 0) {
        // v0 → v1：从旧分散配置迁移
        const oldSettings = localStorage.getItem('luminaSettings');
        if (oldSettings) {
            const old = JSON.parse(oldSettings);
            config.reading.theme = old.theme || 'light';
            // ... 更多字段映射
        }
        config.version = 1;
    }
    
    if (config.version === 1) {
        // v1 → v2：未来配置升级
        // config.newField = defaultValue;
        // config.version = 2;
    }
    
    return config;
};
```

### 6.5 插件系统 (PluginManager)

#### 6.5.1 钩子类型

```javascript
hooks: {
    'beforeParse': [],      // 解析前：返回数据可接管解析
    'afterParse': [],       // 解析后：修改解析结果
    'beforeRender': [],     // 渲染前：修改 item 数据
    'createElement': [],    // 创建元素：返回 DOM 可自定义渲染
    'afterRender': [],      // 渲染后：DOM 操作
    'fileLoad': [],         // 文件加载时：检测文件类型
    'settingsRender': [],   // 设置面板渲染：添加插件设置
    'ttsEngineProvider': [] // TTS 引擎提供者
}
```

#### 6.5.2 插件注册示例

```javascript
// Azure TTS 插件
Lumina.Plugin.AzureTTS = {
    name: 'azure-tts',
    version: '2.0.0',
    description: 'Azure 语音服务朗读支持',
    
    config: {
        enabled: false,
        speechKey: '',
        // ...
    },
    
    init() {
        this.loadConfig();
        this.initEngine();
        this.bindUI();
    },
    
    loadConfig() {
        const saved = Lumina.ConfigManager.get('azureTTS');
        if (saved) this.config = { ...this.config, ...saved };
    },
    
    saveConfig() {
        Lumina.ConfigManager.set('azureTTS', this.config);
    }
};

// 注册到插件管理器
Lumina.PluginManager.register(Lumina.Plugin.AzureTTS);
```

#### 6.5.3 钩子使用示例

```javascript
// Markdown 插件通过 createElement 钩子接管渲染
Lumina.PluginManager.registerHook('createElement', (item, index) => {
    if (item.type === 'markdown') {
        const div = document.createElement('div');
        div.className = 'markdown-body';
        div.innerHTML = renderMarkdown(item.content);
        return div; // 返回非空值，中断后续钩子
    }
    return null; // 返回空，让后续钩子处理
}, priority = 5);
```

### 6.6 国际化 (I18n)

#### 6.6.1 数据结构

```javascript
Lumina.I18n.data = {
    zh: {  // 简体中文
        themeLight: '云白',
        themeDark: '深夜',
        // ...
    },
    zh1: { // 繁体中文
        themeLight: '雲白',
        themeDark: '深夜',
        // ...
    },
    en: {  // 英文
        themeLight: 'Cloud White',
        themeDark: 'Midnight',
        // ...
    }
};
```

#### 6.6.2 使用方式

```javascript
// 翻译函数
const text = Lumina.I18n.t('themeLight');
const formatted = Lumina.I18n.t('pagesCount', 5); // 支持参数

// 更新 UI
Lumina.I18n.updateUI(); // 扫描所有 data-i18n 属性并更新

// HTML 中使用
// <span data-i18n="themeLight">云白</span>
// <input data-i18n-placeholder="searchPlaceholder">
```

---

## 7. 开发规范与实操指南

### 7.1 新增设置项的完整链路

以"新增一个'自动切换主题'设置"为例：

**Step 1: 添加默认配置** (`config-manager.js`)

```javascript
getDefaultConfig() {
    return {
        // ...
        reading: {
            // ...
            autoThemeSwitch: false  // 新增
        }
    };
}
```

**Step 2: 映射到 State.settings** (`settings.js`)

```javascript
load() {
    const config = Lumina.ConfigManager.load();
    Lumina.State.settings = {
        // ...
        autoThemeSwitch: config.reading.autoThemeSwitch
    };
}

save() {
    const settings = Lumina.State.settings;
    Lumina.ConfigManager.set('reading', {
        // ...
        autoThemeSwitch: settings.autoThemeSwitch
    });
}
```

**Step 3: 添加 UI 控件** (`index.html`)

```html
<div class="setting-row">
    <div class="setting-label" data-i18n="autoThemeSwitch">自动切换主题</div>
    <div class="toggle-switch" data-setting-toggle="autoThemeSwitch">
        <div class="toggle-track"></div>
    </div>
</div>
```

**Step 4: 添加翻译** (`i18n/zh.js`、`i18n/zh-TW.js`、`i18n/en.js`)

```javascript
zh: {
    autoThemeSwitch: '自动切换主题',
    // ...
},
zh1: {
    autoThemeSwitch: '自動切換主題',
    // ...
},
en: {
    autoThemeSwitch: 'Auto Switch Theme',
    // ...
}
```

**Step 5: 应用设置** (`settings.js` apply()`)

```javascript
async apply() {
    const settings = Lumina.State.settings;
    
    // 应用自动主题切换
    if (settings.autoThemeSwitch) {
        checkTimeAndSwitchTheme();
    }
}
```

### 7.2 新增本地存储键的规范

**必须**使用 `ConfigManager`，禁止直接操作 localStorage：

```javascript
// ❌ 错误：直接 localStorage
localStorage.setItem('myNewKey', value);

// ✅ 正确：通过 ConfigManager
Lumina.ConfigManager.set('path.to.key', value);
```

**配置路径规范**：
- 使用点号分隔路径，如 `azureTTS.cache.enabled`
- 按功能模块分组，如 `reading.*`, `tts.*`, `pdf.*`
- 布尔值设置使用 `enabled` 作为字段名

### 7.3 新增 DOM 元素的规范

**优先使用 Lumina.DOM 缓存**：

```javascript
// ✅ 正确：在 UI.init 中缓存
Lumina.DOM.myNewButton = document.getElementById('myNewButton');

// 使用时
Lumina.DOM.myNewButton.addEventListener('click', handler);
```

**批量操作使用 DocumentFragment**：

```javascript
// ✅ 正确：批量插入
const fragment = document.createDocumentFragment();
items.forEach(item => {
    const el = createElement(item);
    fragment.appendChild(el);
});
container.appendChild(fragment);

// ❌ 错误：逐个插入（导致多次重排）
items.forEach(item => {
    container.appendChild(createElement(item));
});
```

### 7.4 样式开发规范

**CSS 类命名**：
- 小写 + 连字符，如 `.heat-preset-btn`
- 模块前缀，如 `.azure-*` 表示 Azure TTS 插件相关
- 状态类使用 `-active`, `-disabled`, `-hidden` 后缀

**主题变量使用**：
```css
/* ✅ 正确：使用 CSS 变量 */
.my-element {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
}

/* ❌ 错误：硬编码颜色 */
.my-element {
    background: #f8f9fa;
    color: #212529;
}
```

**行内样式边界**：
- ✅ 动态计算值：`<div style="width: ${percent}%">`
- ✅ 一次性设置：`<div style="display: none">`
- ❌ 静态样式：应放在 CSS 类中

### 7.5 插件开发规范

**目录结构**：
```
js/plugins/{plugin-name}/
├── {plugin-name}.plugin.js      # 插件入口（必须）
├── {plugin-name}.css            # 插件样式（可选）
├── lib/                         # 私有依赖（可选）
│   └── ...
└── README.md                    # 插件文档（可选）
```

**插件模板**：

```javascript
// js/plugins/my-plugin/my-plugin.plugin.js
Lumina.Plugin.MyPlugin = {
    // 元数据
    name: 'my-plugin',
    version: '1.0.0',
    description: '插件描述',
    
    // 默认配置
    config: {
        enabled: false,
        option1: 'default'
    },
    
    // 初始化
    init() {
        this.loadConfig();
        this.registerHooks();
        this.bindUI();
    },
    
    // 加载配置
    loadConfig() {
        const saved = Lumina.ConfigManager.get('myPlugin');
        if (saved) {
            this.config = { ...this.config, ...saved };
        }
    },
    
    // 保存配置
    saveConfig() {
        Lumina.ConfigManager.set('myPlugin', this.config);
    },
    
    // 注册钩子
    registerHooks() {
        Lumina.PluginManager.registerHook('createElement', (item, index) => {
            if (item.type === 'myType') {
                return this.render(item);
            }
            return null;
        }, priority = 10);
    },
    
    // 渲染方法
    render(item) {
        const div = document.createElement('div');
        div.className = 'my-plugin-item';
        div.textContent = item.text;
        return div;
    },
    
    // UI 绑定
    bindUI() {
        // 添加设置面板等
    }
};

// 注册
Lumina.PluginManager.register(Lumina.Plugin.MyPlugin);
```

### 7.6 事件处理规范

**事件委托优先**：

```javascript
// ✅ 正确：事件委托（适用于动态生成的元素）
container.addEventListener('click', (e) => {
    const btn = e.target.closest('.action-btn');
    if (btn) {
        const id = btn.dataset.id;
        handleAction(id);
    }
});

// ❌ 错误：逐个绑定（内存占用高，难以清理）
document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.id));
});
```

**清理事件监听**：

```javascript
// 面板关闭时清理
const cleanup = () => {
    container.removeEventListener('click', handler);
    window.removeEventListener('resize', resizeHandler);
};
```

---

## 8. 性能优化规范

### 8.1 大文件处理

**Worker 使用场景**：
- PDF 解析（pdf.js 在主线程解析会阻塞 UI）
- DOCX 解析（解压和 XML 解析耗时较长）
- 全文搜索索引构建

**实现模式**：
```javascript
// 创建 Worker
const worker = new Worker('js/workers/pdf-parser.worker.js');

// 发送数据
worker.postMessage({ arrayBuffer }, [arrayBuffer]);

// 接收结果
worker.onmessage = (e) => {
    const { items } = e.data;
    renderItems(items);
    worker.terminate();
};
```

### 8.2 渲染优化

**requestAnimationFrame 延迟读操作**：

```javascript
// ✅ 正确：先批量写，后读
container.innerHTML = '';                    // 写
container.appendChild(fragment);              // 写

requestAnimationFrame(() => {                 // 延迟到下一帧
    const rect = element.getBoundingClientRect(); // 读（触发重排）
    scrollToPosition(rect.top);
});

// ❌ 错误：写读交替（强制同步重排）
container.innerHTML = '';
container.appendChild(element1);
const h1 = element1.offsetHeight;  // 读 → 强制重排
container.appendChild(element2);
const h2 = element2.offsetHeight;  // 读 → 强制重排
```

### 8.3 内存管理

**图片释放**：
```javascript
// 切换文档时释放大图内存
const releaseImages = () => {
    document.querySelectorAll('.doc-image').forEach(img => {
        if (img.dataset.src) {
            img.src = '';  // 释放图片内存
        }
    });
};
```

**DOM 回收**：
```javascript
// 清空大量 DOM 时先移除事件监听
const clearContainer = (container) => {
    // 移除所有子元素的事件监听
    container.querySelectorAll('*').forEach(el => {
        el.onclick = null;
        el.onmouseover = null;
    });
    container.innerHTML = '';
};
```

### 8.4 存储优化

**批量操作使用事务**：
```javascript
// ✅ 正确：批量导入使用事务
const importBatch = async (books) => {
    const tx = db.transaction(['fileData'], 'readwrite');
    const store = tx.objectStore('fileData');
    
    books.forEach(book => {
        store.put(book);
    });
    
    return new Promise((resolve) => {
        tx.oncomplete = () => resolve(true);
    });
};
```

---

## 9. 技术债务与重构方向

### 9.1 样式系统债务

**现状问题**：
- 行内样式与 CSS 类混用严重，部分 DOM 元素有数十个行内样式
- 缺乏原子化 CSS 工具类，导致大量重复样式代码
- 主题切换依赖 CSS 变量，但部分硬编码颜色未使用变量

**重构方向**：
1. **建立原子化 CSS 系统**：
   ```css
   /* 定义工具类 */
   .flex { display: flex; }
   .items-center { align-items: center; }
   .gap-8 { gap: 8px; }
   .p-12 { padding: 12px; }
   .text-secondary { color: var(--text-secondary); }
   ```

2. **逐步迁移行内样式**：
   - 将静态样式迁移到 CSS 类
   - 保留动态样式（如计算宽度）在行内

3. **主题变量完整性检查**：
   - 扫描所有硬编码颜色
   - 替换为 CSS 变量

### 9.2 配置系统债务

**现状问题**：
- `State.settings` 与 `ConfigManager` 双轨并行，存在数据冗余
- 部分旧代码仍直接访问 `localStorage`
- 配置迁移逻辑随版本增加而变得复杂

**重构方向**：
1. **逐步淘汰 State.settings**：
   - 新功能直接使用 `ConfigManager.get/set`
   - 旧代码逐步迁移

2. **统一配置访问层**：
   ```javascript
   // 目标：所有配置访问通过 ConfigManager
   const theme = Lumina.Config.get('reading.theme');
   ```

3. **配置 Schema 验证**：
   - 添加配置结构验证
   - 防止非法配置导致崩溃

### 9.3 模块组织债务

**现状问题**：
- `init.js` 过于臃肿（HeatMap、Annotations、Settings 初始化混杂）
- 部分模块直接操作 DOM，未通过 UI 层
- 缺乏模块间的明确接口定义

**重构方向**：
1. **模块拆分**：
   ```
   js/modules/
   ├── heatmap/
   │   ├── heatmap.js        # 核心逻辑
   │   ├── heatmap-ui.js     # UI 交互
   │   └── heatmap-presets.js # 预设管理
   ```

2. **建立模块接口规范**：
   ```javascript
   // 每个模块暴露清晰的接口
   Lumina.HeatMap = {
       init(),           // 初始化
       analyze(),        // 分析
       applyPreset(),    // 应用预设
       // 不允许直接操作 DOM，通过 HeatMapUI 子模块
   };
   ```

3. **依赖注入**：
   - 减少模块间的直接依赖
   - 通过事件或依赖注入解耦

### 9.4 待重构清单（按优先级排序）

| 优先级 | 任务 | 影响范围 | 预估工作量 |
|--------|------|----------|------------|
| P0 | 统一配置系统（淘汰 State.settings） | 全局 | 2-3 天 |
| P1 | 样式系统原子化 | UI 层 | 3-4 天 |
| P1 | 提取 HeatMap 为独立模块 | init.js | 1 天 |
| P2 | 移除所有直接 localStorage 访问 | 存储层 | 1 天 |
| P2 | 完善 TypeScript 类型定义 | 开发体验 | 2-3 天 |
| P3 | 建立单元测试体系 | 质量保证 | 3-5 天 |
| P3 | 模块化 CSS（CSS Modules） | 样式层 | 2-3 天 |

---

## 10. 附录

### 10.1 模块加载顺序

```
1.  namespace.js          # 创建 Lumina 全局对象
2.  loader.js             # 模块加载器
3.  file-opener-bridge.js # 文件打开桥接（assets/js/app/）
4.  config.js             # 静态配置
5.  export-utils.js       # 导出工具
6.  config-manager.js     # 配置管理器
7.  utils.js              # 工具函数
8.  i18n/index.js         # 国际化入口
9.  i18n/zh.js            # 简体中文
10. i18n/zh-TW.js         # 繁体中文
11. i18n/en.js            # 英文
12. db-helpers.js         # 数据库辅助（合并/标准化）
13. db.js                 # 存储层（适配器模式）
14. parser.js             # 文件解析器
15. metadata-extractor.js # 元数据提取
16. chapter.js            # 章节管理
17. converter.js          # 简繁转换
18. renderer.js           # 渲染引擎（搜索/热图/分页）
19. search.js             # 搜索模块
20. cache-manager.js      # 缓存管理（Web SQLite 专用）
21. password-preset.js    # PDF 密码预设
22. crypto.js             # AES-256-GCM 加密
23. tts.js                # 语音朗读（三层降级）
24. annotations.js        # 批注系统
25. bibliomorph-cover.js  # Bibliomorph 封面生成
26. pattern-warehouse.js  # Pattern Warehouse 图案库
27. data-manager.js       # 书库管理
28. share-card.js         # 分享卡片
29. book-detail.js        # 书籍详情
30. settings.js           # 设置管理
31. font-manager.js       # 字体管理
32. legal-content.js      # 法律内容
33. legal-page.js         # 法律页面
34. update-manager.js     # 更新管理
35. about.js              # 关于页面
36. ui.js                 # UI 交互中枢
37. actions.js            # 操作事务
38. exporter.js           # 导出功能
39. ai.js                 # 本地 AI 阅读助手
40. plugin-manager.js     # 插件管理器
41. markdown/*.js         # Markdown 插件
42. azure-tts/*.js        # Azure TTS 插件
43. init.js               # 初始化入口（依赖以上所有模块）
```

### 10.2 核心 API 速查表

**ConfigManager**
```javascript
Lumina.ConfigManager.load() → Config
Lumina.ConfigManager.save(config)
Lumina.ConfigManager.get('path.key') → Value
Lumina.ConfigManager.set('path.key', value)
Lumina.ConfigManager.reset()
```

**PluginManager**
```javascript
Lumina.PluginManager.register(plugin)
Lumina.PluginManager.registerHook(name, callback, priority)
Lumina.PluginManager.executeHook(name, ...args) → Result|null
```

**Storage Adapter**
```javascript
Lumina.DB.adapter.use('indexeddb'|'sqlite'|'capacitor')
Lumina.DB.adapter.saveFile(fileKey, data) → Promise<boolean>
Lumina.DB.adapter.getFile(fileKey) → Promise<Record|null>
Lumina.DB.adapter.deleteFile(fileKey) → Promise<boolean>
```

**Renderer**
```javascript
Lumina.Renderer.renderCurrentChapter(targetIndex?)
Lumina.Renderer.createDocLineElement(item, globalIndex) → Element
Lumina.Renderer.generateTOC()
```

**I18n**
```javascript
Lumina.I18n.t(key, ...params) → String
Lumina.I18n.updateUI()
```

### 10.3 文件格式与解析器对照表

| 格式 | 扩展名 | Parser 方法 | Worker | 备注 |
|------|--------|-------------|--------|------|
| DOCX | .docx | parseDOCX | 否 | JSZip 解压 |
| PDF | .pdf | parsePDF | 是 | pdf.js |
| TXT | .txt | parseTextFile | 否 | 编码检测 |
| Markdown | .md | parseTextFile | 否 | 识别标题语法 |
| HTML | .html | parseTextFile | 否 | DOMParser 清理 |
| JSON | .json | JSON.parse | 否 | 配置导入 |
| LMN | .lmn | decrypt + JSON.parse | 否 | AES 解密 |

### 10.4 提交信息规范

```
<type>: <subject>

<body>

<footer>
```

**Type 类型**：
- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 格式（不影响代码运行）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试
- `chore`: 构建过程或辅助工具的变动

**示例**：
```
feat: 添加 Azure TTS 插件支持

- 支持晓晓、云希等多种音色
- 支持角色风格（助手、聊天、新闻）
- 预加载缓存机制

Closes #123
```

### 10.5 代码审查 Checklist

**功能性**：
- [ ] 功能是否按需求实现
- [ ] 错误处理是否完善（try-catch、边界条件）
- [ ] 多语言翻译是否完整（zh/zh1/en）

**架构**：
- [ ] 是否使用 ConfigManager 进行配置操作
- [ ] DOM 操作是否通过 UI 层或遵循规范
- [ ] 新增模块是否注册到 namespace

**性能**：
- [ ] 大列表是否使用 DocumentFragment
- [ ] 事件监听是否正确清理
- [ ] 图片是否有懒加载

**样式**：
- [ ] 是否使用 CSS 变量而非硬编码颜色
- [ ] 行内样式是否必要
- [ ] 移动端适配是否考虑

**兼容性**：
- [ ] Web 与 App 是否都测试通过
- [ ] 旧配置是否能自动迁移
- [ ] 降级策略是否完善

---

**文档结束**

*本文档是 Lumina Reader 的技术宪法，所有开发活动应遵循本文档规范。文档应随项目迭代持续更新。*
