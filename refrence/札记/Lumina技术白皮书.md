**《流萤阅读器 (Lumina Reader) 技术白皮书 v1.0**

---

## 1. 文档概述

### 1.1 产品定位与技术栈

**产品定位**：单文件、离线优先的沉浸式文档阅读器，支持 EPUB/DOCX/TXT/Markdown 多格式解析，提供出版级排版与语音朗读能力。

**技术栈约束**：
- **零构建工具**：纯原生 ES6+，无 Webpack/Vite 依赖
- **单文件架构**：HTML/CSS/JS 一体化，便于本地离线使用
- **浏览器原生 API**：IndexedDB、Web Speech API、File System Access API（可选）

### 1.2 核心设计哲学

**模块化单文件模式**：
```
┌─────────────────────────────────────┐
│           reader.html               │
│  ┌─────────────────────────────┐   │
│  │  Namespace: Lumina          │   │
│  │  ├── Config (常量配置)       │   │
│  │  ├── State (状态管理)        │   │
│  │  ├── DOM (元素缓存)          │   │
│  │  ├── Parser (解析引擎)       │   │
│  │  ├── Renderer (渲染器)       │   │
│  │  ├── DB (存储层)            │   │
│  │  └── UI (交互层)            │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**设计原则**：
1. **命名空间隔离**：所有功能挂载于 `window.Lumina`，避免全局污染
2. **状态集中管理**：单一数据源（`Lumina.State`），UI 只读不直接修改
3. **存储适配器模式**：业务逻辑与存储后端解耦，支持 IndexedDB/SQLite 无缝切换

### 1.3 版本兼容性

| 浏览器 | 最低版本 | 关键依赖 |
|--------|----------|----------|
| Chrome | 90+ | File System Access API, CSS Variables |
| Edge | 90+ | Web Speech API (在线语音) |
| Safari | 14+ | IndexedDB 2.0, CSS `scroll-behavior` |
| Firefox | 88+ | 部分语音功能受限 |

---

## 2. 架构设计

### 2.1 命名空间体系

```javascript
// 根命名空间 - 防冲突设计
const Lumina = {
    Config: {},      // 只读配置常量
    State: {         // 运行时状态
        app: {       // 应用状态（易变）
            currentFile: {},
            document: { items: [] },
            chapters: [],
            currentChapterIndex: 0,
            search: { matches: [] }
        },
        settings: {} // 用户设置（持久化）
    },
    DOM: {},         // DOM 元素引用缓存
    I18n: {},        // 国际化
    DB: {            // 数据层
        adapter: null,
        IndexedDBImpl: class {},
        SQLiteImpl: class {}
    },
    Parser: {        // 解析层
        EncodingManager: {},
        RegexCache: {},
        processHeading: fn
    },
    Renderer: {},    // 渲染层
    TTS: {           // 语音模块
        Manager: class {}
    },
    UI: {},          // 交互控制
    Actions: {}      // 业务动作分发
};
```

### 2.2 状态管理架构

**双向绑定简化版**：
```
Settings (持久) ←→ LocalStorage
     ↓
State.settings (运行时) ←→ UI Controls
     ↓
State.app (业务状态) ←→ Renderer
```

**关键方法**：

```javascript
// 设置持久化
Lumina.Settings.save() 
// 序列化 State.settings 至 localStorage

// 状态应用
Lumina.Settings.apply()
// 将 State.settings 映射至 CSS Variables 与 DOM
```

### 2.3 存储层抽象（Adapter Pattern）

**类图**：
```
┌─────────────────┐
│ StorageAdapter  │ ← 统一接口
├─────────────────┤
│ - impl: IStorage│
├─────────────────┤
│ + use(type)     │
│ + saveFile()    │
│ + getFile()     │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐ ┌─────────┐
│IndexedDB│ │ SQLite  │
│  Impl   │ │  Impl   │
└─────────┘ └─────────┘
```

**扩展接口规范**：
```javascript
class CustomStorageImpl {
    async init() { return boolean; }
    generateFileKey(file) { return string; }
    async saveFile(fileKey, data) { return boolean; }
    async getFile(fileKey) { return object; }
    async getAllFiles() { return array; }
    async deleteFile(fileKey) { return boolean; }
    async getStorageStats() { return { totalFiles, totalSize, imageCount }; }
}
```

### 2.4 事件驱动模型

**事件流**：
```
File Input → EncodingManager → Parser → State.app.document → Renderer
     ↓              ↓              ↓              ↓              ↓
   Binary      TextStream    Item[]      Chapters[]    DOM Update
```

---

## 3. 文档处理流水线

### 3.1 文件解析器架构

**Parser Chain 设计**：
```javascript
Lumina.Parser = {
    // 入口方法
    async processFile(file) {
        // 1. 编码检测 → Text
        // 2. 格式路由 → Specific Parser
        // 3. 结构识别 → Chapter Building
    },
    
    // 格式路由表
    fileTypes: {
        docx: { parser: 'parseDOCX' },
        txt: { parser: 'parseTextFile' },
        md: { parser: 'parseTextFile' }
    }
}
```

**添加新格式示例**：
```javascript
// 1. 注册格式
Lumina.Config.fileTypes.epub = { 
    icon: 'icon-epub', 
    parser: 'parseEPUB' 
};

// 2. 实现解析器
Lumina.Parser.parseEPUB = async (arrayBuffer) => {
    // 返回 { items: [], type: 'epub' }
    // items: [{ type: 'heading1'|'paragraph'|'image', text: '', ... }]
};

// 3. 章节检测规则（可选）
Lumina.Config.regexPatterns.epubChapter = /^Chapter\s+\d+/i;
```

### 3.2 编码智能检测系统

**置信度算法流程**：
```
┌─────────────┐
│   Binary    │
└──────┬──────┘
       ▼
┌─────────────┐     Yes    ┌─────────┐
│  BOM Check  │ ─────────→ │ UTF-8   │
└──────┬──────┘            └─────────┘
       │ No
       ▼
┌─────────────┐
│ Score Calc  │
│ - UTF-8     │ ← 多字节序列验证
│ - GBK       │ ← 双字节范围检测
│ - Big5      │ ← 繁体常用字
│ - ANSI      │ ← 扩展 ASCII
└──────┬──────┘
       ▼
┌─────────────┐
│ 候选排序    │ ← 按置信度降序
└──────┬──────┘
       ▼
┌─────────────┐
│ Try Decode  │ → 验证可读性
└─────────────┘
```

**关键方法**：
```javascript
Lumina.Parser.EncodingManager.calculateConfidenceScores(uint8Array)
// 返回: [{ encoding: 'UTF-8', score: 95, reason: 'valid_utf8' }, ...]

Lumina.Parser.EncodingManager.validateDecodedText(text)
// 检查控制字符比例、替换字符(U+FFFD)等
```

### 3.3 章节识别引擎（Regex Macro）

**宏系统架构**：
```javascript
// 宏定义（用户友好的简写）
macros = {
    '\\C': '[一二三四五六七八九十百千万零〇]',  // 中文数字
    '\\R': '[IVXLCDM]+',                           // 罗马数字大写
    '\\r': '[ivxlcdm]+',                           // 罗马数字小写
    '\\N': '\\d+',                                 // 阿拉伯数字
    '\\S': '\\s+'                                  // 空白
}

// 展开流程：
用户输入: "第\C章" → 内部展开: "^第[一二...]章\\s*(.*)"
```

**章节检测优先级**：
1. 用户自定义正则（最高优先级）
2. 系统内置模式（中文/英文/数字混合）
3. 特殊标题匹配（前言/楔子/尾声）

### 3.4 文档对象模型（DOM）

**Item 类型规范**：
```typescript
interface DocItem {
    type: 'title' | 'subtitle' | 'heading1-6' | 'paragraph' | 'list' | 'image';
    text?: string;           // 纯文本内容
    display?: string;        // 带序号的显示文本（如"第一章 标题"）
    level?: number;          // 层级（heading 用）
    data?: string;           // 图片 base64
    alt?: string;            // 图片替代文本
    cleanText?: string;      // 去除序号后的纯标题
}
```

**编号策略模式**：
```javascript
Lumina.Config.numberingStrategies = {
    chineseNovel: (level, counters, text) => `第${num}章 ${text}`,
    technical: (level, counters, text) => `${counters.join('.')} ${text}`,
    academic: (level, counters, text) => { /* 一、（一）1. （1） */ }
}
```

---

## 4. 渲染引擎

### 4.1 CSS Variables 主题系统

**变量映射表**：
```css
:root {
    /* 动态计算值 */
    --font-family-dynamic: "Noto Serif SC", ...;
    --font-size: 18px;
    --line-height: 1.8;
    --content-max-width: 80%;
    
    /* 主题色板（通过 data-theme 切换） */
    --bg-primary: #ffffff;
    --text-primary: #212529;
    --accent-color: #495057;
}
```

**主题切换逻辑**：
```javascript
// 切换 data-theme 属性 → CSS 自动重算
document.documentElement.setAttribute('data-theme', 'dark');
// 同时更新 favicon 颜色
Lumina.UI.updateFavicon('dark');
```

### 4.2 响应式布局策略

**断点变量系统**：
```css
/* 桌面端默认值 */
:root {
    --sidebar-width: 320px;
    --content-max-width: 80%;
    --content-padding: 40px;
}

/* 移动端覆盖（<768px） */
@media (max-width: 768px) {
    :root {
        --sidebar-width: 100%;
        --content-max-width: 100%;
        --content-padding: 16px;
    }
}
```

### 4.3 虚拟滚动限制与方案

**当前实现**：全量 DOM 渲染（`renderCurrentChapter`）
- **限制**：章节 >1000 段时首次渲染卡顿
- **优化方向**：
  ```javascript
  // 建议实现 Intersection Observer 懒加载
  const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
          if (entry.isIntersecting) {
              entry.target.classList.add('rendered');
          }
      });
  });
  ```

### 4.4 排版算法

**首字下沉实现**：
```css
.doc-line.drop-cap::first-letter {
    float: left;
    font-size: 3.5em;
    line-height: 0.8;
    margin-right: 0.1em;
    color: var(--accent-color);
}
```

**文本清洁（广告过滤）**：
```javascript
// 规则：检测特殊符号密度与分散空白
text.replace(/[\x00-\x7F]{10,}$/gm, match => {
    const uniqueSymbols = new Set([...match].filter(c => specialChars.has(c)));
    const hasManySymbols = uniqueSymbols.size >= 4;  // 4种以上特殊符号
    const hasScatteredWhitespaces = match.match(/(\s+\S+){3,}\s+/);
    return (hasManySymbols || hasScatteredWhitespaces) ? '' : match;
});
```

---

## 5. 存储与数据管理

### 5.1 双模式存储实现

**IndexedDB 模式**：
- **对象存储**：`fileData`（keyPath: `fileKey`）
- **索引**：`lastReadTime`（倒序查询）、`fileName`（查重）
- **容量管理**：自动清理旧文件（`MAX_FILES = 50`）

**SQLite 模式**（后端服务）：
- **REST API**：`localhost:8080/api`
- **端点**：`/save`, `/file/{key}`, `/files`, `/health`
- **降级策略**：连接失败自动切换至 IndexedDB

### 5.2 文件指纹策略

**FileKey 生成**：
```javascript
generateFileKey(file) {
    // 格式：文件名_大小_修改时间
    return `${file.name}_${file.size}_${file.lastModified}`;
}
```

**版本控制逻辑**：
1. 打开文件时检查 `fileKey` 完全匹配
2. 若内容变化（大小/时间不同）但文件名相同 → 提示覆盖或新建
3. 保留阅读进度（`lastChapter`, `lastScrollIndex`）合并至新记录

### 5.3 历史记录 Schema

```javascript
{
    fileKey: "novel.txt_1024_1699999999999",
    fileName: "novel.txt",
    fileType: "txt",
    fileSize: 1024,
    content: [{ type: "heading1", text: "..." }], // 全文存储
    wordCount: 50000,
    lastChapter: 5,
    lastScrollIndex: 120,
    chapterTitle: "第五章 标题",
    lastReadTime: "2024-01-01T00:00:00Z",
    customRegex: { chapter: "", section: "" },
    chapterNumbering: "chineseNovel",
    cover: "data:image/png;base64,..." // 首图缓存
}
```

### 5.4 数据导入/导出规范

**批量导出格式**：
```json
{
    "version": 2,
    "exportType": "batch",
    "exportDate": "2024-01-01T00:00:00Z",
    "appName": "Lumina Reader",
    "books": [ /* 历史记录数组 */ ],
    "totalBooks": 10
}
```

---

## 6. 高级功能模块

### 6.1 语音朗读引擎（TTS）

**架构图**：
```
Text → Split Sentences → SpeechSynthesisUtterance
            ↓                      ↓
    Array<sentence>           onboundary
            ↓                      ↓
    Highlight Manager ←── Char Index Mapping
```

**句子级高亮算法**：
```javascript
// 关键：将字符偏移量映射到 DOM Range
highlightSentence(sentenceIndex) {
    const sentences = this.currentSentences; // ["第一句。", "第二句。", ...]
    const charIndex = sentences.slice(0, index).join('').length;
    
    // 使用 TreeWalker 定位文本节点
    const treeWalker = document.createTreeWalker(
        paragraph, 
        NodeFilter.SHOW_TEXT
    );
    
    // 计算累计字符位置，找到目标节点与偏移
    // 使用 Range.surroundContents() 包裹高亮 span
}
```

**状态管理**：
```javascript
// 朗读时允许的操作：
- 切换章节：暂停 → 跳转 → 恢复
- 调整语速：取消当前 utterance → 重新 speak（保持位置）
- 页面滚动：自动 scrollIntoView({ block: 'center' })
```

### 6.2 全文检索系统

**索引策略**：运行时内存索引（非持久化）
```javascript
// 构建倒排索引（简化版）
buildIndex() {
    this.index = {};
    items.forEach((item, idx) => {
        const words = item.text.toLowerCase().split(/\s+/);
        words.forEach(word => {
            if (!this.index[word]) this.index[word] = [];
            this.index[word].push(idx);
        });
    });
}
```

**搜索结果高亮**：
```javascript
// 使用正则替换保留上下文
context.replace(
    new RegExp(`(${escapeRegex(query)})`, 'gi'), 
    '<span class="search-result-match">$1</span>'
);
```

### 6.3 DOCX 导出引擎

**技术栈**：`docx.js` 库（UMD 版本）

**排版映射**：
| 文档元素 | DOCX 对象 | 样式参数 |
|---------|-----------|----------|
| 标题1 | `Paragraph` + `HeadingLevel.ONE` | 32pt, 粗体, 段后8行 |
| 正文 | `Paragraph` | 首行缩进 640 twips (0.5英寸) |
| 图片 | `ImageRun` | 最大宽度 514px (B5 版心) |
| 分页 | `PageBreak` | 章节间插入 |

**纸张设置**（B5 规格）：
```javascript
page: {
    size: {
        width: 9978,  // 176mm in twips (1mm = 56.7 twips)
        height: 14174 // 250mm
    },
    margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } // 20mm
}
```

---

## 7. 扩展开发指南

### 7.1 添加新文件格式

**步骤 1**：注册 MIME 类型映射
```javascript
// 在 Lumina.Config.fileTypes 中添加
epub: { 
    icon: 'icon-book', 
    parser: 'parseEPUB',
    mimeType: 'application/epub+zip'
}
```

**步骤 2**：实现解析器
```javascript
Lumina.Parser.parseEPUB = async (arrayBuffer) => {
    const zip = await JSZip.loadAsync(arrayBuffer);
    // 1. 解析 META-INF/container.xml 找到 OPF 路径
    // 2. 解析 OPF 获取目录 (spine) 与资源列表
    // 3. 遍历 HTML/XHTML 文件，提取文本与图片
    // 4. 转换为标准 DocItem 数组
    
    return {
        items: [
            { type: 'heading1', text: 'Chapter 1' },
            { type: 'paragraph', text: 'Content...' },
            { type: 'image', data: 'base64...', alt: 'Figure 1' }
        ],
        type: 'epub'
    };
};
```

**步骤 3**：章节检测（如需要）
```javascript
// 在 Lumina.Parser.RegexCache.detectChapter 中添加
if (type === 'epub') {
    // EPUB 通常有结构化数据，可直接从 OPF 读取 navMap
}
```

### 7.2 主题定制

**变量覆盖表**：
```css
[data-theme="custom"] {
    /* 背景 */
    --bg-primary: #your-color;
    --bg-secondary: #your-secondary;
    
    /* 文字 */
    --text-primary: #333;
    --text-secondary: #666;
    
    /* 强调色 */
    --accent-color: #your-accent;
    --accent-hover: #darker-accent;
    
    /* Logo 专用 */
    --logo-page-main: #color;
    --logo-firefly-core: #color;
    --logo-firefly-glow: #color;
}
```

**动态切换**：
```javascript
// 在设置面板中添加按钮
<button class="option-btn" data-value="custom">自定义</button>

// Lumina.Settings.apply() 会自动处理 data-theme 属性
```

### 7.3 存储后端扩展

**实现模板**：
```javascript
Lumina.DB.MyCustomImpl = class {
    constructor() {
        this.baseUrl = 'https://api.example.com';
        this.cache = new Map();
    }
    
    async init() {
        // 测试连接
        const response = await fetch(`${this.baseUrl}/health`);
        return response.ok;
    }
    
    generateFileKey(file) {
        // 必须与其他后端生成逻辑一致
        return `${file.name}_${file.size}_${file.lastModified}`;
    }
    
    async saveFile(fileKey, data) {
        // 序列化数据
        const payload = JSON.stringify(data);
        // 发送请求...
        return true;
    }
    
    // 必须实现的所有方法：getFile, getAllFiles, deleteFile, 
    // findByFileName, getStorageStats, exportBatch, importBatch
};
```

**注册使用**：
```javascript
// 在 Lumina.init() 中
await Lumina.DB.adapter.use('mycustom'); // 对应类名 MyCustomImpl
```

### 7.4 国际化扩展

**添加新语言**：
```javascript
// 在 Lumina.I18n.data 中添加
Lumina.I18n.data.fr = {
    appName: 'Lecteur Lumina',
    toc: 'Table des matières',
    // ... 其他键值
};

// 语言标识符使用 ISO 639-1 标准（zh, en, fr, ja 等）
```

**模板字符串**：
```javascript
// 支持占位符替换
timeMinutesAgo: '$1分钟前'  // 使用 $1, $2...
// 调用：Lumina.I18n.t('timeMinutesAgo', 5) → "5分钟前"
```

---

## 8. 性能与优化

### 8.1 内存管理

**Blob URL 回收**：
```javascript
// 导出文件后及时释放
URL.revokeObjectURL(url);
```

**字体加载控制**：
```javascript
// 仅预加载关键字体（宋体/黑体）
// 楷体/等宽按需加载，避免阻塞首屏
Lumina.Font.preloadCritical(); // 只加载 serif/sans
```

**图片优化**：
- DOCX 中的图片以 Base64 内联存储，导出时自动压缩至 514px 宽度
- 历史记录封面使用缩略图（建议 <100KB）

### 8.2 渲染性能基准

**当前瓶颈**：
- `renderCurrentChapter()`：全量 DOM 插入，大数据量时耗时 >200ms
- `generateTOC()`：递归遍历所有 items，O(n) 复杂度

**优化建议**：
1. **虚拟滚动**：只渲染视口内 ±5 屏的内容
2. **章节分页**：将长章节拆分为虚拟子章节
3. **Web Worker**：将 DOCX 解析移至后台线程

### 8.3 存储配额管理

**IndexedDB 限制处理**：
```javascript
// 捕获 QuotaExceededError
try {
    await store.put(record);
} catch (e) {
    if (e.name === 'QuotaExceededError') {
        // 策略：删除最旧的 5 本书，然后重试
        await this.cleanupOldFiles(this.MAX_FILES - 5);
        await store.put(record); // 重试
    }
}
```

**存储统计计算**：
```javascript
// 估算公式：JSON 序列化后长度 × 2（Unicode）
// 图片：Base64 长度 × 0.75（二进制换算）
file.estimatedSize = (JSON.stringify(content).length * 2 + cover.length * 0.75) / (1024 * 1024);
```

---

## 9. 附录

### 9.1 API 参考手册

**核心方法速查**：

| 方法 | 所属模块 | 参数 | 返回值 | 说明 |
|------|---------|------|--------|------|
| `processFile(file)` | Actions | File | Promise<void> | 主入口，处理文件打开 |
| `parseDOCX(buffer)` | Parser | ArrayBuffer | {items, type} | DOCX 解析 |
| `renderCurrentChapter(idx)` | Renderer | number? | void | 渲染指定章节 |
| `saveHistory(name, type, count)` | DB | string, string, number | Promise<void> | 保存阅读记录 |
| `toggle()` | TTS.Manager | - | void | 启停朗读 |
| `perform(query)` | Search | string | void | 执行搜索 |

### 9.2 配置项清单（Settings Schema）

```typescript
interface Settings {
    language: 'zh' | 'en';              // 界面语言
    theme: 'light' | 'dark' | 'retro' | 'eye-care';
    font: 'serif' | 'sans' | 'kai' | 'mono';
    fontSize: number;                   // 14-32 (px)
    lineHeight: number;                 // 12-30 (÷10 = 实际倍数)
    paragraphSpacing: number;           // 0-30 (÷10 = em)
    pageWidth: number;                  // 50-100 (%)
    margin: number;                     // 20-200 (px)
    indent: boolean;                    // 首行缩进
    dropCap: boolean;                   // 首字下沉
    ignoreEmptyLines: boolean;          // 忽略空行
    textCleaning: boolean;              // 广告过滤
    smoothScroll: boolean;              // 平滑滚动
    chapterNumbering: 'none' | 'roman' | 'chineseNovel' | 'englishNovel' | 'technical' | 'academic';
    chapterRegex: string;               // 自定义章节正则
    sectionRegex: string;               // 自定义小节正则
    ttsRate: number;                    // 5-20 (÷10 = 倍速)
    ttsPitch: number;                   // 5-20 (÷10)
}
```

### 9.3 错误代码与处理

| 错误场景 | 现象 | 解决方案 |
|---------|------|---------|
| `QuotaExceededError` | 存储已满，无法保存 | 自动清理旧书/提示用户导出 |
| `Encoding detection failed` | 文件乱码 | 强制使用 GB18030 重试 |
| `DOCX library not loaded` | 导出按钮无响应 | 检查 docx.js CDN 连接 |
| `Speech synthesis canceled` | 朗读突然停止 | 自动重试下一段/章节 |
| `SQLite connection refused` | 后端离线 | 自动降级至 IndexedDB |

### 9.4 依赖库版本清单

| 库名 | 版本 | 用途 | CDN |
|------|------|------|-----|
| JSZip | 3.10.1 | DOCX 解压 | cdnjs |
| encoding-japanese | 2.2.0 | 编码检测 | unpkg |
| docx | 9.1.0 | DOCX 生成 | jsdelivr |

**本地回退方案**：
所有 CDN 资源均支持本地缓存，若离线使用需提前在 `<script>` 标签中引用本地路径。

## 10. 代码拆解分析（Code Anatomy）

本章节深入单文件内部的代码实现细节，提供可直接查阅的代码片段与架构逻辑。

### 10.1 物理文件结构

尽管为单 HTML 文件，代码按**严格分区**组织：

```html
<!DOCTYPE html>
<html>
<head>
    <!-- 1. Meta & 外部依赖（CDN） -->
    <!-- 2. CSS 变量与主题定义 -->
    <!-- 3. 关键 CSS 动画（Logo 呼吸、滚动条等） -->
</head>
<body>
    <!-- 4. HTML 模板（SVG Symbols、Panel 结构） -->
    
    <script>
        // 5. 根命名空间声明（Lumina = {}）
        // 6. 配置层（Config）- 静态常量
        // 7. 工具层（Utils）- 纯函数
        // 8. 国际化（I18n）- 数据与翻译函数
        // 9. 存储实现（DB）- IndexedDB/SQLite 类
        // 10. 解析器（Parser）- 编码、章节、DOCX
        // 11. 渲染器（Renderer）- DOM 操作
        // 12. 语音（TTS）- Web Speech API 封装
        // 13. 数据管理（DataManager）- 书库逻辑
        // 14. UI 控制（UI）- 事件绑定
        // 15. 动作分发（Actions）- 业务逻辑编排
        // 16. 初始化入口（Lumina.init）
    </script>
</body>
</html>
```

**加载顺序依赖**：
```
Config → Utils → I18n → DB → Parser → Renderer → TTS → DataManager → UI → Actions → init
```

### 10.2 核心命名空间详解

#### 10.2.1 State 管理实现

**双向绑定简化机制**：
```javascript
Lumina.State = {
    // 运行时状态（非持久化）
    app: {
        currentFile: { 
            name: '', type: '', handle: null, 
            rawContent: null, wordCount: 0, 
            fileKey: null  // 关键：用于存储关联
        },
        document: { 
            items: [],  // 核心数据：DocItem[]
            type: '' 
        },
        chapters: [],        // 派生数据：由 buildChapters 生成
        currentChapterIndex: 0,
        search: { 
            matches: [], 
            currentQuery: '', 
            highlightedIndex: -1 
        },
        dbReady: false       // 存储后端就绪状态
    },
    
    // 用户设置（持久化至 localStorage）
    settings: null  // 在 init 时填充默认值
};

// 持久化触发点
Lumina.Settings.save = () => {
    localStorage.setItem('luminaSettings', JSON.stringify(Lumina.State.settings));
};
```

#### 10.2.2 DOM 缓存策略

**集中式 DOM 引用管理**（避免重复查询）：
```javascript
Lumina.DOM = {};  // 在 UI.init() 中批量缓存

Lumina.UI.cacheElements = () => {
    const d = Lumina.DOM;
    // 高频访问元素
    d.contentWrapper = document.getElementById('contentWrapper');
    d.contentScroll = document.getElementById('contentScroll');
    d.tocList = document.getElementById('tocList');
    
    // 面板元素
    d.sidebarLeft = document.getElementById('sidebarLeft');
    d.sidebarRight = document.getElementById('sidebarRight');
    
    // 动态生成内容的容器（需频繁清空）
    d.searchResults = document.getElementById('searchResults');
    d.historyList = document.getElementById('historyList');
};
```

**内存管理注意**：`Lumina.DOM` 持有强引用，在单页应用中无需释放，但若实现标签页切换需考虑解绑。

### 10.3 关键算法实现拆解

#### 10.3.1 编码检测算法（置信度系统）

**多阶段评分机制**：
```javascript
Lumina.Parser.EncodingManager = {
    confidenceThreshold: { HIGH: 85, MEDIUM: 70, LOW: 50 },
    
    async processFile(file) {
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        
        // Stage 1: BOM 检测（确定性）
        const bom = this.detectBOM(uint8);
        if (bom) return { text: decoder.decode(uint8.slice(bom.skip)), confidence: 100 };
        
        // Stage 2: 多算法评分
        const scores = this.calculateConfidenceScores(uint8);
        
        // Stage 3: 候选排序与解码验证
        for (const { encoding, confidence } of scores) {
            try {
                const result = this.tryDecode(uint8, encoding);
                if (result && this.validateDecodedText(result)) 
                    return { text: result, originalEncoding: encoding, confidence };
            } catch (e) { continue; }
        }
        
        // Stage 4: 终极回退
        return { text: new TextDecoder('GB18030').decode(uint8), originalEncoding: 'GB18030' };
    },
    
    calculateConfidenceScores(bytes) {
        const scores = [];
        const sampleSize = Math.min(bytes.length, 2000);
        
        // UTF-8 评分：检测多字节序列合法性
        const utf8Score = this.calculateUTF8Score(bytes, sampleSize);
        if (utf8Score > 0) scores.push({ encoding: 'UTF-8', score: utf8Score });
        
        // GBK 评分：检测双字节范围（0x81-0xFE 开头）
        const gbkScore = this.calculateGBKScore(bytes, sampleSize);
        if (gbkScore > 0) scores.push({ encoding: 'GBK', score: gbkScore });
        
        // Big5 评分：繁体字符集检测
        const big5Score = this.calculateBig5Score(bytes, sampleSize);
        
        return scores.sort((a, b) => b.score - a.score);
    },
    
    // 关键：验证解码后的文本可读性（排除乱码）
    validateDecodedText(text) {
        if (text.includes('\uFFFD')) return false;  // Unicode 替换字符
        const controlChars = text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || [];
        return controlChars.length <= text.length * 0.01;  // 控制字符 < 1%
    }
};
```

#### 10.3.2 章节识别引擎（正则宏系统）

**宏展开与缓存**：
```javascript
Lumina.Parser.RegexCache = {
    macros: {
        '\\C': '[一二三四五六七八九十百千万零〇]',
        '\\R': '[IVXLCDM]+',
        '\\N': '\\d+',
        '\\S': '\\s+'
    },
    
    updateCustomPatterns(chapterRegex, sectionRegex) {
        // 宏展开：将 \C 替换为实际字符类
        const expand = (pattern) => {
            if (!pattern) return pattern;
            return Object.keys(this.macros)
                .sort((a, b) => b.length - a.length)  // 优先替换长的（避免 \R 被 \r 干扰）
                .reduce((acc, key) => acc.split(key).join(this.macros[key]), pattern);
        };
        
        const expandedChapter = expand(chapterRegex);
        
        // 自动添加锚点与捕获组
        if (expandedChapter && !expandedChapter.startsWith('^')) {
            this.customPatterns.chapter = new RegExp('^' + expandedChapter + '\\s*(.*)', 'i');
        }
    },
    
    detectChapter(text, useCustom = false) {
        if (useCustom && this.customPatterns.chapter) {
            const match = text.match(this.customPatterns.chapter);
            if (match) return { level: 1, text: match[1] || text, raw: text };
        }
        
        // 回退至系统模式（中文第X章、英文 Chapter X 等）
        const patterns = Lumina.Config.regexPatterns;
        if (patterns.chineseChapter.test(text)) return { level: 1, text: RegExp.$1 };
        if (patterns.englishChapter.test(text)) return { level: 1, text: RegExp.$3 };
        
        return null;
    }
};
```

#### 10.3.3 编号策略实现（策略模式）

**动态序号生成**：
```javascript
Lumina.Config.numberingStrategies = {
    chineseNovel: (level, counters, text) => {
        const num = Lumina.Utils.numberToChinese(counters[level - 1]);
        const suffix = level === 1 ? '章' : level === 2 ? '节' : '';
        return suffix ? `第${num}${suffix} ${text}` : `(${num}) ${text}`;
    },
    
    technical: (level, counters, text) => {
        // 级联编号：1.1.1
        return `${counters.slice(0, level).join('.')} ${text}`;
    },
    
    academic: (level, counters, text) => {
        // 社科格式：一、（一）1. （1）
        const n = counters[level - 1];
        switch(level) {
            case 1: return `${Lumina.Utils.numberToChinese(n)}、${text}`;
            case 2: return `（${Lumina.Utils.numberToChinese(n)}）${text}`;
            case 3: return `${n}. ${text}`;
            case 4: return `（${n}）${text}`;
        }
    }
};

// 使用示例（在 processHeading 中）
Lumina.Parser.processHeading = (level, rawText, cleanText) => {
    level = Math.max(1, Math.min(6, level));
    
    // 层级计数器递增
    Lumina.State.sectionCounters[level - 1]++;
    for (let i = level; i < 6; i++) Lumina.State.sectionCounters[i] = 0;
    
    const strategy = Lumina.Config.numberingStrategies[Lumina.State.settings.chapterNumbering];
    const display = strategy(level, Lumina.State.sectionCounters, cleanText || rawText);
    
    return { type: `heading${level}`, level, text: rawText, display, cleanText };
};
```

### 10.4 存储层实现细节

#### 10.4.1 IndexedDB 事务管理

**批量操作与错误处理**：
```javascript
Lumina.DB.IndexedDBImpl = class {
    constructor() {
        this.DB_NAME = 'LuminaReaderDB';
        this.DB_VERSION = 2;
        this.db = null;
        this.isReady = false;
    }
    
    async init() {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('fileData')) {
                    const store = db.createObjectStore('fileData', { keyPath: 'fileKey' });
                    // 关键索引：按最后阅读时间倒序查询
                    store.createIndex('lastReadTime', 'lastReadTime', { unique: false });
                    store.createIndex('fileName', 'fileName', { unique: false });
                }
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isReady = true;
                resolve(true);
            };
        });
    }
    
    async saveFile(fileKey, data) {
        // 自动清理旧文件（LRU 策略）
        await this.cleanupOldFiles(this.MAX_FILES - 1);
        
        return new Promise((resolve) => {
            const tx = this.db.transaction(['fileData'], 'readwrite');
            const store = tx.objectStore('fileData');
            
            const record = {
                fileKey,
                fileName: data.fileName,
                content: data.content,  // 完整文档内容（可能很大）
                cover: data.cover,      // Base64 图片（占用空间大）
                lastReadTime: new Date().toISOString()
            };
            
            const request = store.put(record);
            
            request.onerror = (e) => {
                if (e.target.error?.name === 'QuotaExceededError') {
                    // 配额超限处理：清理更旧的数据
                    this.cleanupOldFiles(this.MAX_FILES - 5).then(() => {
                        store.put(record).onsuccess = () => resolve(true);
                    });
                }
            };
        });
    }
};
```

#### 10.4.2 SQLite 适配器（REST 封装）

**网络降级策略**：
```javascript
Lumina.DB.SQLiteImpl = class {
    constructor() {
        this.baseUrl = 'http://localhost:8080/api';
        this.cache = new Map();  // 内存缓存，减少网络请求
    }
    
    async init() {
        try {
            const response = await fetch(`${this.baseUrl}/health`, { 
                signal: AbortSignal.timeout(3000)  // 3秒超时
            });
            return response.ok;
        } catch (e) {
            console.log('SQLite 后端离线，将降级至 IndexedDB');
            return false;
        }
    }
    
    async getFile(fileKey) {
        // 二级缓存策略
        if (this.cache.has(fileKey)) return this.cache.get(fileKey);
        
        const result = await fetch(`${this.baseUrl}/file/${encodeURIComponent(fileKey)}`);
        const data = await result.json();
        this.cache.set(fileKey, data);  // 缓存结果
        return data;
    }
};
```

### 10.5 渲染引擎优化技巧

#### 10.5.1 文档片段批量插入

**减少重排（Reflow）**：
```javascript
Lumina.Renderer.renderCurrentChapter = (targetIndex = null) => {
    const chapter = Lumina.State.app.chapters[Lumina.State.app.currentChapterIndex];
    
    // 使用 DocumentFragment 批量构建 DOM
    const fragment = document.createDocumentFragment();
    
    chapter.items.forEach((item, idx) => {
        const line = Lumina.Renderer.createDocLineElement(item, chapter.startIndex + idx);
        if (line) fragment.appendChild(line);
    });
    
    // 一次性清空并插入（仅触发一次重排）
    Lumina.DOM.contentWrapper.innerHTML = '';
    Lumina.DOM.contentWrapper.appendChild(fragment);
};
```

#### 10.5.2 滚动性能优化

**节流与 requestIdleCallback**：
```javascript
// 滚动事件处理（UI.bindEvents 中）
let scrollTimeout, idleCallbackId;

Lumina.DOM.contentScroll.addEventListener('scroll', () => {
    // 高频操作：目录高亮（使用 rAF 节流）
    requestAnimationFrame(() => Lumina.Renderer.updateTocSpy());
    
    // 低频操作：保存进度（使用 requestIdleCallback 或 setTimeout）
    clearTimeout(scrollTimeout);
    if (window.cancelIdleCallback && idleCallbackId) {
        cancelIdleCallback(idleCallbackId);
    }
    
    idleCallbackId = requestIdleCallback(() => {
        Lumina.DB.updateHistoryProgress();  // 非关键任务
    }, { timeout: 2000 });
}, { passive: true });  // 关键：passive 监听器，不阻塞滚动
```

### 10.6 TTS 语音朗读实现

#### 10.6.1 句子级高亮算法

**字符偏移映射**：
```javascript
highlightSentence(sentenceIndex) {
    const paragraph = this.currentParagraphEl;
    const sentences = this.currentSentences;
    
    // 计算目标句子在全文中的字符偏移
    let charOffset = 0;
    for (let i = 0; i < sentenceIndex; i++) {
        charOffset += sentences[i].length;
    }
    const targetSentence = sentences[sentenceIndex];
    
    // 使用 TreeWalker 遍历文本节点
    const treeWalker = document.createTreeWalker(
        paragraph, 
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let currentChar = 0;
    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;
    let node;
    
    // 定位起始与结束文本节点
    while (node = treeWalker.nextNode()) {
        const nodeLength = node.textContent.length;
        
        if (!startNode && currentChar + nodeLength > charOffset) {
            startNode = node;
            startOffset = charOffset - currentChar;
        }
        
        if (startNode && currentChar + nodeLength >= charOffset + targetSentence.length) {
            endNode = node;
            endOffset = (charOffset + targetSentence.length) - currentChar;
            break;
        }
        
        currentChar += nodeLength;
    }
    
    // 使用 Range 包裹高亮
    if (startNode && endNode) {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        
        const span = document.createElement('span');
        span.className = 'tts-sentence-highlight';
        range.surroundContents(span);
        this.sentenceElements.push(span);  // 缓存以便清除
    }
}
```

#### 10.6.2 跨章节连续朗读

**状态保持与恢复**：
```javascript
async speakCurrent() {
    if (this.currentItemIndex > chapter.endIndex) {
        // 章节结束，自动切换
        if (this.currentChapterIndex < state.chapters.length - 1) {
            this.currentChapterIndex++;
            state.currentChapterIndex = this.currentChapterIndex;
            
            // 触发章节渲染
            Lumina.Renderer.renderCurrentChapter();
            
            // 延迟后继续朗读（等待 DOM 更新）
            setTimeout(() => this.speakCurrent(), 300);
            return;
        } else {
            this.stop();  // 全书结束
            return;
        }
    }
    
    // 朗读当前段落...
}
```

### 10.7 扩展钩子与二次开发

#### 10.7.1 自定义解析器钩子

**预留的扩展点**：
```javascript
// 在 processFile 中预留预处理钩子
Lumina.Actions.processFile = async (file) => {
    // 预处理钩子（可在 Lumina 对象挂载后修改）
    if (Lumina.Hooks?.beforeParse) {
        file = await Lumina.Hooks.beforeParse(file);
    }
    
    // 标准解析流程...
    
    // 后处理钩子
    if (Lumina.Hooks?.afterParse) {
        result.items = await Lumina.Hooks.afterParse(result.items);
    }
};
```

**使用示例**（在 HTML 中引入自定义脚本）：
```html
<script src="reader.html"></script>
<script>
    // 添加自定义过滤器
    Lumina.Hooks = {
        afterParse: (items) => {
            // 自动移除所有"广告"段落
            return items.filter(item => !item.text.includes('广告'));
        }
    };
</script>
```

#### 10.7.2 主题定制 CSS 变量覆盖

**动态样式注入**：
```javascript
// 允许运行时注入自定义 CSS
Lumina.UI.injectCustomCSS = (cssText) => {
    const style = document.createElement('style');
    style.id = 'custom-user-styles';
    style.textContent = cssText;
    document.head.appendChild(style);
};

// 示例：通过控制台实时修改
Lumina.UI.injectCustomCSS(`
    :root {
        --accent-color: #ff6b6b !important;
        --font-size: 20px !important;
    }
`);
```

### 10.8 调试与性能分析

#### 10.8.1 内置调试接口

**暴露给控制台的调试方法**：
```javascript
// 在 init 最后暴露
window.LuminaDebug = {
    // 查看当前状态快照
    getState: () => JSON.parse(JSON.stringify(Lumina.State)),
    
    // 导出当前章节结构
    exportChapters: () => console.table(Lumina.State.app.chapters.map(c => ({
        title: c.title.substring(0, 30),
        itemCount: c.items.length,
        startIndex: c.startIndex
    }))),
    
    // 性能计时：渲染耗时
    benchmarkRender: () => {
        console.time('render');
        Lumina.Renderer.renderCurrentChapter();
        console.timeEnd('render');
    },
    
    // 清空存储（紧急重置）
    clearAllData: () => {
        indexedDB.deleteDatabase('LuminaReaderDB');
        localStorage.clear();
        location.reload();
    }
};
```

#### 10.8.2 内存泄漏检查点

**潜在风险点与解决方案**：

| 位置 | 风险 | 防护措施 |
|------|------|----------|
| `DOM.tocList` 缓存 | 旧事件监听器残留 | 使用 `innerHTML = ''` 清空时自动解绑 |
| `TTS.sentenceElements` | span 元素引用未释放 | `clearSentenceHighlights()` 强制移除 |
| `DB.cache` (SQLite) | 无限增长 | 限制 Map 大小（LRU 淘汰策略） |
| `Font.loading` Set | 字体加载超时 | 8秒强制清理，标记为 failed |

---

**代码统计**（供参考）：
- **总代码行数**：约 3500 行（含 CSS）
- **JavaScript 函数**：约 120 个
- **类定义**：8 个（StorageAdapter, IndexedDBImpl, SQLiteImpl, DataManager, TTS Manager 等）
- **事件监听器**：约 25 个（集中在 UI.init）

**维护建议**：
- 修改 `Parser` 模块时需注意 `sectionCounters` 全局状态重置
- 新增设置项需在 `defaultSettings` 与 `Settings.apply()` 中同步添加
- 存储相关修改需同时更新 `IndexedDBImpl` 与 `SQLiteImpl` 保持接口一致
---
**《流萤阅读器 (Lumina Reader) 技术白皮书》**
**文档版本**：v3.0  
**最后更新**：2026-02-25
**维护者**：陆关 (Lumina Project)