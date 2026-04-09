# Lumina Reader Markdown 插件技术架构详解

> **文档版本**：1.0  
> **适用范围**：Markdown 插件开发、阅读器核心扩展  
> **技术栈**：原生 JavaScript、PrismJS、插件化架构  
> **核心原则**：渐进增强、降级兼容、性能优先

---

## 目录

1. [架构总览](#1-架构总览)
   - 1.1 插件化设计理念
   - 1.2 与核心系统的协作关系
   - 1.3 数据流全景图

2. [解析引擎深度解析](#2-解析引擎深度解析)
   - 2.1 块级解析器（Block Parser）
   - 2.2 行内解析器（Inline Parser）
   - 2.3 解析结果的数据结构
   - 2.4 与纯文本解析的差异

3. [渲染引擎详解](#3-渲染引擎详解)
   - 3.1 插件钩子机制
   - 3.2 DOM 构建策略
   - 3.3 行内元素渲染
   - 3.4 简繁转换集成

4. [代码高亮系统](#4-代码高亮系统)
   - 4.1 PrismJS 集成架构
   - 4.2 动态语言加载策略
   - 4.3 主题联动机制
   - 4.4 懒加载与错误降级

5. [系统集成与兼容性](#5-系统集成与兼容性)
   - 5.1 TTS 语音朗读集成
   - 5.2 搜索系统适配
   - 5.3 数据持久化格式
   - 5.4 无插件降级策略

6. [性能优化实践](#6-性能优化实践)
   - 6.1 大表格优化
   - 6.2 超大代码块处理
   - 6.3 渲染节流策略
   - 6.4 内存管理

7. [扩展开发指南](#7-扩展开发指南)
   - 7.1 添加新的块级元素
   - 7.2 自定义行内格式
   - 7.3 添加代码语言支持

8. [故障排查与调试](#8-故障排查与调试)

---

## 1. 架构总览

### 1.1 插件化设计理念

Lumina Reader 的 Markdown 支持采用**完全插件化**架构，核心设计理念是：

> **"无插件时优雅降级，有插件时功能完备"**

这意味着：
- **零依赖**：核心阅读器不依赖 Markdown 插件，单独编译也能运行
- **渐进增强**：安装插件后自动获得富文本渲染能力
- **完全隔离**：插件代码与核心代码通过钩子系统通信，无直接耦合

### 1.2 与核心系统的协作关系

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Lumina Reader Core                            │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │   File Parser  │  │  Renderer      │  │   Plugin Manager     │  │
│  │   (parser.js)  │  │  (renderer.js) │  │  (plugin-manager.js) │  │
│  └───────┬────────┘  └───────┬────────┘  └──────────┬───────────┘  │
│          │                   │                      │              │
│          │   beforeParse     │                      │              │
│          │◄─────────────────│                      │              │
│          │   {handled:true}  │                      │              │
│          │──────────────────►│                      │              │
│          │                   │   createElement      │              │
│          │                   │◄─────────────────────│              │
│          │                   │   HTMLElement        │              │
│          │                   │─────────────────────►│              │
└──────────┼───────────────────┼──────────────────────┼──────────────┘
           │                   │                      │
           │                   │                      ▼
           │                   │         ┌──────────────────────┐
           │                   │         │   Markdown Plugin    │
           │                   │         │                      │
           │                   │         │  ┌────────────────┐  │
           │                   │         │  │    Parser      │  │
           │                   │         │  │ (markdown.*.js)│  │
           │                   │         │  └────────────────┘  │
           │                   │         │  ┌────────────────┐  │
           │                   │         │  │   Renderer     │  │
           │                   └────────►│  │ (markdown.*.js)│  │
           │                             │  └────────────────┘  │
           │                             └──────────────────────┘
           │                                        │
           └────────────────────────────────────────┘
                    items[] with inlineContent
```

**关键协作点**：

1. **解析阶段**：核心调用 `beforeParse` 钩子，Markdown 插件检测到 `.md` 文件后接管解析
2. **数据传递**：插件返回结构化数据 `items[]`，包含 `inlineContent` 行内格式信息
3. **渲染阶段**：核心调用 `createElement` 钩子，插件为每个 item 生成 DOM 元素
4. **降级策略**：无插件时，核心将 Markdown 视为纯文本，保留 `#` 等原始标记

### 1.3 数据流全景图

```
Markdown 文件 (.md)
        │
        ▼
┌─────────────────┐
│  1. 文件检测     │  file.name.endsWith('.md')
│  (插件钩子)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  2. 块级解析     │────►│  Heading        │ # Title
│  (逐行扫描)      │     │  Paragraph      │ Normal text
│                 │     │  CodeBlock      │ ```code```
│  parseATX()     │     │  List           │ - item
│  parseCodeBlock │     │  Table          │ | a | b |
│  parseTable()   │     │  Blockquote     │ > quote
│  ...            │     │  HR             │ ---
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  3. 行内解析     │  **bold** → {type:'strong', content:'bold'}
│  (正则匹配)      │  `code`   → {type:'code', content:'code'}
│                 │  [link]() → {type:'link', content, href}
│  parseInline()  │  *em*     → {type:'em', content}
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. 数据存储     │  inlineContent[] 保存到数据库
│  (IndexedDB/    │  纯文本降级备用
│   SQLite)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. 渲染触发     │  用户翻页/打开文件
│  (createElement  │
│   钩子)          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  6. DOM 构建     │  <h1>, <p>, <pre>, <ul>, <table>
│  (Renderer)     │  行内: <strong>, <code>, <a>, <em>
│                 │  简繁转换在 textContent 阶段应用
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  7. 代码高亮     │  PrismJS 异步高亮
│  (异步优化)      │  失败时保持原始文本
└────────┬────────┘
         │
         ▼
    用户阅读界面
```

---

## 2. 解析引擎深度解析

### 2.1 块级解析器（Block Parser）

**核心方法**：`Lumina.Plugin.Markdown.Parser.parse(content)`

采用**逐行扫描**策略，单轮遍历完成块级元素识别：

```javascript
// 解析主循环（简化示意）
while (i < lines.length) {
    const line = lines[i];
    
    // 优先级：代码块 > 表格 > 标题 > 分隔线 > 引用 > 列表 > 段落
    if (consumed = this.parseCodeBlock(lines, i)) {
        item = consumed.item; i = consumed.nextIndex;
    } else if (consumed = this.parseTable(lines, i)) {
        item = consumed.item; i = consumed.nextIndex;
    } else if (item = this.parseATXHeading(line)) {
        i++;
    } else if (item = this.parseSetextHeading(lines, i)) {
        i += 2;
    }
    // ... 其他类型
    
    if (item) items.push(item);
}
```

**块级元素识别优先级**：

| 优先级 | 元素类型 | 识别特征 | 方法名 |
|--------|----------|----------|--------|
| 1 | 代码块 | ``` 或 ~~~ 围栏 | `parseCodeBlock()` |
| 2 | 表格 | \| 列分隔符 | `parseTable()` |
| 3 | Setext 标题 | 下划线 === / --- | `parseSetextHeading()` |
| 4 | ATX 标题 | # 前缀 | `parseATXHeading()` |
| 5 | 分隔线 | *** / --- / ___ | `parseHR()` |
| 6 | 引用块 | > 前缀 | `parseBlockquote()` |
| 7 | 列表 | - / * / + / 1. | `parseList()` |
| 8 | 段落 | 默认回退 | `parseParagraph()` |

**嵌套代码块处理**：

```javascript
// 支持嵌套代码块（如 markdown 教程中展示代码块）
parseCodeBlock(lines, startIndex) {
    let depth = 1;
    while (i < lines.length) {
        if (遇到相同围栏标记) {
            if (有语言标识) depth++;  // 嵌套开始
            else depth--;              // 嵌套结束
        }
        if (depth === 0) break;
    }
}
```

### 2.2 行内解析器（Inline Parser）

**核心方法**：`parseInline(text)`

采用**多轮正则匹配 + 冲突检测**策略：

```javascript
parseInline(text) {
    // 第一轮：收集所有匹配（不嵌套处理）
    const matches = [];
    
    // 行内代码（最高优先级，不解析内部）
    matches.push(...findAllMatches(text, /`([^`]+)`/g, 'code'));
    
    // 图片（在链接之前，避免冲突）
    matches.push(...findAllMatches(text, /!\[...\]\(...\)/g, 'image'));
    
    // 链接
    matches.push(...findAllMatches(text, /\[([^\]]+)\]\(([^)]+)\)/g, 'link'));
    
    // 加粗 **text** 或 __text__
    matches.push(...findAllMatches(text, /\*\*([^*]+)\*\*|__([^_]+)__/g, 'strong'));
    
    // 斜体 *text* 或 _text_
    matches.push(...findAllMatches(text, /\*([^*]+)\*|_([^_]+)_/g, 'em'));
    
    // 删除线 ~~text~~
    matches.push(...findAllMatches(text, /~~([^~]+)~~/g, 'del'));
    
    // 第二轮：排序并解决冲突
    matches.sort((a, b) => a.start - b.start);
    const cleanMatches = resolveConflicts(matches);
    
    // 第三轮：构建结果
    return buildInlineContent(text, cleanMatches);
}
```

**冲突解决规则**：

```javascript
// 1. 代码块内不解析其他格式
if (isInsideCode(pos, matches)) skip;

// 2. 粗体内不解析斜体（避免 **bold*italic*** 歧义）
if (isInsideStrong(pos, matches)) skip;

// 3. 重叠区域取先出现的
if (current.start < last.end) skip;
```

**行内元素类型**：

| 类型 | Markdown 语法 | 输出结构 | 嵌套支持 |
|------|---------------|----------|----------|
| `text` | 纯文本 | `{type:'text', content}` | - |
| `code` | `` `code` `` | `{type:'code', content}` | ✗ |
| `strong` | `**bold**` | `{type:'strong', content}` | ✗ |
| `em` | `*italic*` | `{type:'em', content}` | ✗ |
| `del` | `~~del~~` | `{type:'del', content}` | ✗ |
| `link` | `[text](url)` | `{type:'link', content, href, title}` | ✓ 内容可嵌套 |
| `image` | `![alt](src)` | `{type:'image', alt, src, title}` | ✗ |

### 2.3 解析结果的数据结构

**标准 Item 结构**：

```typescript
interface MarkdownItem {
    type: 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6' 
         | 'paragraph' | 'blockquote' | 'codeblock' | 'list' | 'table' | 'hr';
    text: string;                    // 纯文本内容（用于搜索/TTS）
    display?: string;                // 显示文本（与 text 相同或带缩进）
    raw: string;                     // 原始 Markdown 文本
    inlineContent?: InlineItem[];    // 行内格式（关键字段）
    
    // 类型特定字段
    level?: number;                  // heading 级别
    language?: string;               // codeblock 语言
    items?: ListItem[];              // list/blockquote 嵌套
    ordered?: boolean;               // list 是否有序
    start?: number;                  // list 起始编号
    headers?: TableCell[];           // table 表头
    rows?: TableCell[][];            // table 行
}

interface InlineItem {
    type: 'text' | 'code' | 'strong' | 'em' | 'del' | 'link' | 'image';
    content?: string;
    href?: string;       // link 专属
    title?: string;      // link/image 专属
    alt?: string;        // image 专属
    src?: string;        // image 专属
    inlineContent?: InlineItem[];  // link 内容可嵌套
}
```

**数据结构示例**：

```markdown
# Hello **World**

This is a [link](https://example.com) to site.
```

```json
[
  {
    "type": "heading1",
    "level": 1,
    "text": "Hello World",
    "display": "Hello World",
    "raw": "# Hello **World**",
    "inlineContent": [
      { "type": "text", "content": "Hello " },
      { "type": "strong", "content": "World" }
    ]
  },
  {
    "type": "paragraph",
    "text": "This is a link to site.",
    "display": "This is a link to site.",
    "raw": "This is a [link](https://example.com) to site.",
    "inlineContent": [
      { "type": "text", "content": "This is a " },
      { 
        "type": "link", 
        "content": "link",
        "href": "https://example.com",
        "inlineContent": [{ "type": "text", "content": "link" }]
      },
      { "type": "text", "content": " to site." }
    ]
  }
]
```

### 2.4 与纯文本解析的差异

| 特性 | Markdown 模式 | 纯文本模式 |
|------|---------------|------------|
| **解析器** | `Markdown.Parser` | `parseTextFile` 简单正则 |
| **标题识别** | # / ## / ### 严格分级 | 仅识别单行特殊标题 |
| **格式保留** | `inlineContent[]` 保留所有格式 | 无格式，纯文本 |
| **代码块** | ``` 围栏代码，支持语法高亮 | 视为普通段落 |
| **表格** | 完整表格结构 | 视为纯文本行 |
| **列表** | 嵌套列表、有序/无序 | 可能误识别为章节 |
| **数据库** | `inlineContent` 字段持久化 | 仅存储 text |
| **渲染** | 丰富 DOM 结构 | 简单 textContent |

---

## 3. 渲染引擎详解

### 3.1 插件钩子机制

**两个核心钩子**：

```javascript
// 1. beforeParse - 解析前接管
Lumina.PluginManager.registerHook('beforeParse', (file, content) => {
    if (isMarkdownFile(file)) {
        return {
            handled: true,
            data: Lumina.Plugin.Markdown.Parser.parse(content)
        };
    }
    return null;  // 不处理，让默认解析器继续
}, 1);  // 优先级 1（高）

// 2. createElement - 渲染时接管
Lumina.PluginManager.registerHook('createElement', (item, index) => {
    if (isMarkdownItem(item)) {
        return Lumina.Plugin.Markdown.Renderer.render(item, index);
    }
    return null;  // 使用默认渲染
}, 1);
```

**钩子执行流程**：

```
core:parser.js ──► executeHook('beforeParse')
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    ▼                   ▼                   ▼
Plugin A           Plugin B(Markdown)    Plugin C
priority 10        priority 1           priority 5
    │                   │                   │
    │              检测到 .md 文件           │
    │                   │                   │
    │              返回 handled:true        │
    │               (中断后续插件)           │
    │                   │                   │
    └───────────────────┼───────────────────┘
                        ▼
              使用 Markdown 解析结果
```

### 3.2 DOM 构建策略

**渲染入口**：

```javascript
render(item, index) {
    const div = document.createElement('div');
    // 只有 MD 文件添加 markdown-body 类（应用样式）
    const isMdFile = Lumina.State?.app?.currentFile?.type === 'md';
    div.className = isMdFile ? 'doc-line markdown-body' : 'doc-line';
    div.dataset.index = index;

    switch (item.type) {
        case 'heading1': ... case 'heading6':
            this.renderHeading(div, item); break;
        case 'paragraph':
            this.renderParagraph(div, item); break;
        case 'codeblock':
            this.renderCodeBlock(div, item); break;
        // ... 其他类型
    }
    return div;
}
```

**各类元素映射**：

| Item Type | DOM Element | CSS Class |
|-----------|-------------|-----------|
| `heading1-6` | `<h1>`-`<h6>` | `markdown-heading markdown-h{n}` |
| `paragraph` | `<p>` | `markdown-paragraph` |
| `codeblock` | `<div><pre><code>` | `markdown-code-wrapper` |
| `list` | `<ul>` / `<ol>` | `markdown-list markdown-{ul/ol}` |
| `table` | `<div><table>` | `markdown-table-wrapper` |
| `blockquote` | `<blockquote>` | `markdown-blockquote` |
| `hr` | `<hr>` | `markdown-hr` |
| 图片 | `<figure><img><figcaption>` | `markdown-figure` |

### 3.3 行内元素渲染

**核心方法**：`renderInlineContent(container, inlineContent)`

```javascript
renderInlineContent(container, inlineContent) {
    inlineContent.forEach(item => {
        switch (item.type) {
            case 'text':
                container.appendChild(
                    document.createTextNode(this.getConvertedText(item.content))
                );
                break;
                
            case 'strong':
                const strong = document.createElement('strong');
                strong.textContent = this.getConvertedText(item.content);
                container.appendChild(strong);
                break;
                
            case 'link':
                const a = document.createElement('a');
                a.href = item.href;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                // 链接内容可能还有嵌套格式
                if (item.inlineContent) {
                    this.renderInlineContent(a, item.inlineContent);
                } else {
                    a.textContent = this.getConvertedText(item.content);
                }
                container.appendChild(a);
                break;
                
            // ... code, em, del, image 等
        }
    });
}
```

### 3.4 简繁转换集成

**转换时机**：在渲染时进行，而非解析时

```javascript
getConvertedText(text) {
    if (!text || !Lumina.Converter?.isConverting) return text;
    // 使用全局转换器（保持与纯文本一致的行为）
    return Lumina.Converter.convert(text);
}

// 应用示例
renderParagraph(container, item) {
    const p = document.createElement('p');
    if (item.inlineContent) {
        // 每个文本节点单独转换
        this.renderInlineContent(p, item.inlineContent);
    } else {
        p.textContent = this.getConvertedText(item.text);
    }
}
```

**优势**：
- 原始数据保持简体中文（存储友好）
- 切换简繁时无需重新解析文件
- 与纯文本文档的转换行为完全一致

---

## 4. 代码高亮系统

### 4.1 PrismJS 集成架构

**组件构成**：

```
┌─────────────────────────────────────────┐
│           PrismJS Core                  │
│      (prism.min.js - 必须)              │
│  - 基础高亮引擎                          │
│  - 语言定义接口                          │
│  - 主题系统                              │
└─────────────────┬───────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
┌────────┐  ┌────────┐  ┌────────────┐
│ markup │  │ clike  │  │ 其他语言    │
│ (内置)  │  │ (内置) │  │ (按需加载)  │
└────────┘  └────────┘  └────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Batch/PowerShell │
                    │ Python/JavaScript │
                    │ Java/C++/Go      │
                    │ 40+ 语言组件      │
                    └─────────────────┘
```

### 4.2 动态语言加载策略

**按需加载机制**：

```javascript
async highlightCodeElement(codeElement) {
    const language = codeElement.dataset.language;
    
    // 1. 检查是否已加载
    if (this.loadedLanguages.has(language)) {
        this.applyHighlight(codeElement);
        return;
    }
    
    // 2. 检查是否正在加载中（防止并发重复请求）
    if (this.loadingLanguages.has(language)) {
        await this.loadingLanguages.get(language);
        this.applyHighlight(codeElement);
        return;
    }
    
    // 3. 开始加载
    const loadPromise = this.loadLanguageComponent(language);
    this.loadingLanguages.set(language, loadPromise);
    
    try {
        await loadPromise;
        this.loadedLanguages.add(language);
        this.applyHighlight(codeElement);
    } catch (e) {
        console.warn(`[Markdown] 语言组件加载失败: ${language}`, e);
        // 降级：保持原始文本，不中断渲染
    } finally {
        this.loadingLanguages.delete(language);
    }
}
```

**加载优先级**：

1. 本地组件：`./js/plugins/markdown/lib/prism/components/prism-{lang}.min.js`
2. 失败时：静默忽略，代码以普通文本显示
3. 常用语言预置：javascript, python, java, bash 等 40+ 语言

### 4.3 主题联动机制

**阅读器主题 → 代码主题映射**：

```javascript
const themeMap = {
    // 浅色主题
    'light': 'one-light',
    'parchment': 'solarized-light',
    'slate': 'default-light',
    
    // 深色主题
    'dark': 'one-dark',
    'midnight': 'okaidia',
    'nebula': 'twilight',
    
    // 中间调
    'olive': 'tomorrow',
    'straw': 'solarized-light'
};
```

**主题切换流程**：

```javascript
// 监听 html data-theme 属性变化
observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
            this.updateCodeHighlightTheme();
        }
    });
});

// 动态加载新主题 CSS
async updateCodeHighlightTheme() {
    const newTheme = themeMap[currentTheme] || 'one-light';
    await this.loadCSS(`./js/plugins/markdown/lib/prism/themes/${newTheme}.css`);
}
```

### 4.4 懒加载与错误降级

**性能优化策略**：

```javascript
renderCodeBlock(container, item) {
    // 1. 立即渲染基本结构（不阻塞）
    const wrapper = document.createElement('div');
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = item.text;  // 转义后的原始代码
    
    // 2. 异步高亮（setTimeout 0 让出主线程）
    setTimeout(() => {
        if (code.isConnected) {  // 检查元素是否仍在 DOM
            this.highlightCodeElement(code).catch(() => {
                // 静默失败，保持原始文本
            });
        }
    }, 0);
}
```

**错误处理**：
- 语言组件 404 → 控制台警告，保持原始文本
- PrismJS 未加载 → 不报错，正常显示
- 超大代码块（>10000 行）→ 自动截断并警告

---

## 5. 系统集成与兼容性

### 5.1 TTS 语音朗读集成

**纯文本提取**：`tts.js:extractTextFromInline()`

```javascript
extractTextFromInline(inlineContent) {
    return inlineContent.map(item => {
        switch (item.type) {
            case 'text':
            case 'strong':
            case 'em':
            case 'del':
                return item.content;
            case 'link':
                return item.content || item.href;  // 读链接文本而非 URL
            case 'image':
                return item.alt || '';  // 读图片替代文本
            case 'code':
                return item.content;  // 代码也读出（技术文档场景）
        }
    }).join('');
}
```

**列表和表格处理**：

```javascript
// 列表项
if (item.items) {
    text = item.items.map(subItem => {
        let itemText = subItem.inlineContent 
            ? this.extractTextFromInline(subItem.inlineContent)
            : subItem.text;
        return prefix + itemText;  // 加 "• " 或 "1. " 前缀
    }).join('。');
}

// 表格
if (item.type === 'table') {
    const headerTexts = item.headers.map(h => 
        h.inlineContent ? this.extractTextFromInline(h.inlineContent) : h.text
    );
    tableTexts.push('表头：' + headerTexts.join('，'));
    
    item.rows.forEach((row, rowIndex) => {
        const rowTexts = row.map(cell => 
            cell.inlineContent ? this.extractTextFromInline(cell.inlineContent) : cell.text
        );
        tableTexts.push(`第${rowIndex + 1}行：${rowTexts.join('，')}`);
    });
}
```

### 5.2 搜索系统适配

**搜索文本来源**：优先使用 `item.text`（纯文本）

```javascript
// search.js
searchInFile(file, query) {
    const content = file.content || [];
    
    content.forEach((item, index) => {
        // 优先使用纯文本字段（已去除 Markdown 标记）
        const searchableText = item.text || '';
        
        if (searchableText.toLowerCase().includes(query)) {
            results.push({
                text: searchableText,  // 搜索结果显示纯文本
                index: index,
                type: item.type
            });
        }
    });
}
```

**优势**：用户搜索 "**bold**" 时，实际搜索的是 "bold"（不包含 ** 标记）

### 5.3 数据持久化格式

**数据库存储结构**：

```javascript
// data-manager.js:HistoryDataBuilder
const processedItem = {
    type: item.type,
    text: item.text,              // 纯文本（搜索/TTS用）
    display: item.display,        // 显示文本
    
    // 【关键】保留 Markdown 特有字段
    inlineContent: item.inlineContent,  // 行内格式
    items: item.items,            // 列表/引用嵌套
    ordered: item.ordered,        // 列表是否有序
    start: item.start,            // 列表起始编号
    headers: item.headers,        // 表格表头
    rows: item.rows,              // 表格行
    language: item.language,      // 代码块语言
    
    // 其他字段...
};
```

**向前兼容性**：
- 旧版本保存的数据没有 `inlineContent` → 渲染时降级为纯文本
- 新版本读取旧数据 → `if (!item.inlineContent) renderAsPlainText()`

### 5.4 无插件降级策略

**核心逻辑**：`renderer.js:createDocLineElement()`

```javascript
createDocLineElement(item, index) {
    // 【插件钩子】尝试让插件创建元素
    if (Lumina.PluginManager) {
        const hookResult = Lumina.PluginManager.executeHook('createElement', item, index);
        if (hookResult) {
            return hookResult;  // 插件成功渲染
        }
    }
    
    // 【降级】无插件或插件不处理时，使用默认渲染
    const div = document.createElement('div');
    div.className = 'doc-line';
    
    // 纯文本渲染（textContent 自动转义 HTML）
    div.textContent = item.display || item.text || '';
    
    return div;
}
```

**用户体验**：
- 安装插件前打开的 Markdown → 显示带 # 标记的纯文本
- 安装插件后重新打开 → 自动识别 `raw` 字段，富文本渲染
- 插件被禁用/删除 → 自动降级为纯文本，不报错

---

## 6. 性能优化实践

### 6.1 大表格优化

**问题**：超大表格（>500 行）解析和渲染卡顿

**优化策略**：

```javascript
parseTable(lines, startIndex) {
    // 超大表格使用简化解析（跳过复杂 inline 解析）
    const MAX_TABLE_SIZE = 500;
    const estimatedRows = estimateRowCount(lines, startIndex);
    const useSimpleParse = estimatedRows > MAX_TABLE_SIZE;
    
    // 简化解析：只处理 **bold** 和 `code`
    if (useSimpleParse) {
        inlineContent = this.parseInlineSimple(cell);
    } else {
        inlineContent = this.parseInline(cell);  // 完整解析
    }
}

// 简化版行内解析（只处理最常见的格式）
parseInlineSimple(text) {
    const simpleRegex = /(`[^`]+`)|(\*\*[^*]+\*\*)/g;
    // 只匹配 `code` 和 **bold**
}
```

### 6.2 超大代码块处理

**安全限制**：

```javascript
parseCodeBlock(lines, startIndex) {
    const MAX_CODE_BLOCK_LINES = 10000;
    let lineCount = 0;
    
    while (i < lines.length && lineCount < MAX_CODE_BLOCK_LINES) {
        // 解析...
        lineCount++;
    }
    
    if (lineCount >= MAX_CODE_BLOCK_LINES) {
        console.warn('[Markdown] 代码块超过最大行数限制，已截断');
    }
}
```

**渲染优化**：

```javascript
// 超大代码块不应用高亮（避免卡顿）
if (codeText.length > 100000) {  // > 10万字符
    // 直接显示，不调用 Prism.highlight
    return;
}
```

### 6.3 渲染节流策略

**分页渲染**：利用阅读器已有的分页系统

```javascript
// 每次只渲染当前页的内容
renderCurrentChapter() {
    const range = ranges[pageIdx];  // 当前页范围
    
    for (let i = range.start; i <= range.end; i++) {
        const item = chapter.items[i];
        const line = createDocLineElement(item, globalIndex);
        fragment.appendChild(line);
    }
}
```

**懒加载**：图片和代码高亮都使用 IntersectionObserver

```javascript
// 图片懒加载
img.loading = 'lazy';

// 代码高亮懒加载（可见时才高亮）
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            highlightCodeElement(entry.target);
            observer.unobserve(entry.target);
        }
    });
});
```

### 6.4 内存管理

**缓存策略**：

```javascript
// 已加载的语言组件缓存（避免重复加载）
loadedLanguages: new Set(['markup', 'html', 'xml'])

// 正在加载中的语言（防止并发重复请求）
loadingLanguages: new Map()
```

**DOM 清理**：

```javascript
// 翻页时自动清理上一页 DOM（阅读器核心管理）
Lumina.DOM.contentWrapper.innerHTML = '';

// 图片资源释放
img.onload = () => {
    URL.revokeObjectURL(img.dataset.tempSrc);
};
```

---

## 7. 扩展开发指南

### 7.1 添加新的块级元素

**示例：添加数学公式块支持**

```javascript
// 1. 在 Parser 中添加识别逻辑
parse(content) {
    // ... 其他解析
    else if ((consumed = this.parseMathBlock(lines, i))) {
        item = consumed.item;
        i = consumed.nextIndex;
    }
}

parseMathBlock(lines, startIndex) {
    const line = lines[startIndex];
    if (!line.startsWith('$$')) return null;
    
    let content = '';
    let i = startIndex + 1;
    
    while (i < lines.length && !lines[i].startsWith('$$')) {
        content += lines[i] + '\n';
        i++;
    }
    
    return {
        item: {
            type: 'mathblock',
            text: content,
            raw: lines.slice(startIndex, i + 1).join('\n')
        },
        nextIndex: i + 1
    };
}

// 2. 在 Renderer 中添加渲染逻辑
renderMathBlock(container, item) {
    const div = document.createElement('div');
    div.className = 'markdown-math';
    
    // 使用 MathJax 或 KaTeX 渲染
    if (window.MathJax) {
        div.textContent = '$$' + item.text + '$$';
        MathJax.typeset([div]);
    } else {
        div.textContent = item.text;  // 降级
    }
    
    container.appendChild(div);
}
```

### 7.2 自定义行内格式

**示例：添加下划线支持（++underline++）**

```javascript
// 1. 在 parseInline 中添加匹配
parseInline(text) {
    // ... 其他匹配
    
    // 下划线 ++text++
    const underlineRegex = /\+\+([^+]+)\+\+/g;
    while ((match = underlineRegex.exec(text)) !== null) {
        if (!this.isInsideCode(match.index, matches)) {
            matches.push({
                type: 'underline',
                start: match.index,
                end: match.index + match[0].length,
                content: match[1]
            });
        }
    }
    
    // ... 排序和构建结果
}

// 2. 在 renderInlineContent 中添加渲染
case 'underline':
    const u = document.createElement('u');
    u.textContent = this.getConvertedText(item.content);
    container.appendChild(u);
    break;
```

### 7.3 添加代码语言支持

**步骤**：

1. **下载语言组件**：
   ```bash
   curl -O https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-{lang}.min.js
   mv prism-{lang}.min.js app/www/js/plugins/markdown/lib/prism/components/
   ```

2. **验证加载**：无需修改代码，插件会自动按需加载新语言

3. **别名配置**（可选）：
   ```javascript
   // 在 markdown.renderer.js 中添加别名
   const aliasMap = {
       'js': 'javascript',
       'py': 'python',
       'rb': 'ruby',  // 新增
       // ...
   };
   ```

---

## 8. 故障排查与调试

### 常见问题

**Q1: Markdown 文件显示为纯文本**

排查步骤：
1. 检查插件是否加载：`console.log(Lumina.Plugin.Markdown)`
2. 检查文件名：`.endsWith('.md')` 是否返回 true
3. 检查钩子是否注册：`console.log(Lumina.PluginManager.hooks)`

**Q2: 代码块没有高亮**

排查步骤：
1. 检查语言组件是否存在：`ls prism/components/prism-{lang}.min.js`
2. 检查控制台 404 错误
3. 检查 `codeblock.language` 是否正确识别
4. 尝试手动调用：`Prism.highlightElement(codeElement)`

**Q3: 行内格式渲染错误（如 **bold** 不显示）**

排查步骤：
1. 检查 `inlineContent` 是否存在：`console.log(item.inlineContent)`
2. 检查冲突解决：`parseInline` 中的 `isInsideCode` 是否误判
3. 检查渲染逻辑：`renderInlineContent` 是否处理该类型

**Q4: TTS 朗读包含 Markdown 标记**

排查步骤：
1. 检查 `tts.js:extractItemText` 是否正确处理 `inlineContent`
2. 检查是否优先使用 `item.text`（纯文本）而非 `item.display`

### 调试技巧

**启用详细日志**：

```javascript
// 在控制台临时启用
localStorage.setItem('markdown_debug', 'true');

// 在代码中检查
if (localStorage.getItem('markdown_debug')) {
    console.log('[Markdown Debug]', item);
}
```

**性能分析**：

```javascript
// 测量解析时间
console.time('parse');
const result = Lumina.Plugin.Markdown.Parser.parse(content);
console.timeEnd('parse');  // > 100ms 需关注

// 测量渲染时间
console.time('render');
items.forEach(item => renderer.render(item));
console.timeEnd('render');
```

---

## 附录：核心文件结构

```
app/www/js/plugins/markdown/
├── markdown.plugin.js       # 插件入口，钩子注册
├── markdown.parser.js       # 解析引擎
├── markdown.renderer.js     # 渲染引擎
├── lib/
│   └── prism/
│       ├── prism.min.js           # PrismJS 核心
│       ├── themes/                # 代码高亮主题
│       │   ├── one-light.css
│       │   ├── one-dark.css
│       │   └── ... (10+ themes)
│       └── components/            # 语言组件
│           ├── prism-javascript.min.js
│           ├── prism-python.min.js
│           └── ... (40+ languages)
└── README.md
```

## 总结

Lumina Reader 的 Markdown 插件采用**插件化架构**实现了富文本渲染能力，核心特点：

1. **完全解耦**：通过钩子系统与核心通信，可独立开发/测试/部署
2. **渐进增强**：无插件时优雅降级为纯文本阅读
3. **性能优先**：分页渲染、懒加载、大文件优化
4. **系统集成**：与 TTS、搜索、简繁转换无缝协作
5. **扩展友好**：清晰的扩展点，易于添加新功能

这种架构设计确保了阅读器的**长期可维护性**和**功能可扩展性**。
