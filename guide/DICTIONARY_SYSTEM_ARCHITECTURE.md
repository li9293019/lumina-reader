# Lumina Reader 词典系统架构文档

> **版本**: v1.0  
> **日期**: 2026-05-20  
> **适用范围**: 流萤阅读器 (Lumina Reader) v2.1.8+  
> **对应模块**: `app/www/js/modules/dictionary.js` (~560 行)  
> **依赖模块**: `parser.js`, `renderer.js`, `markdown.parser.js`, `config-manager.js`, `settings.js`

---

## 目录

1. [架构概览](#1-架构概览)
2. [数据模型](#2-数据模型)
3. [解析引擎](#3-解析引擎)
4. [索引系统](#4-索引系统)
5. [高亮渲染](#5-高亮渲染)
6. [UI 交互](#6-ui-交互)
7. [配置与设置](#7-配置与设置)
8. [存储与序列化](#8-存储与序列化)
9. [扩展指南](#9-扩展指南)
10. [故障排查](#10-故障排查)

---

## 1. 架构概览

### 1.1 系统定位

词典系统是 Lumina Reader 的**嵌入式术语高亮与释义模块**，为 `.lw`（Lumina Writing）格式和独立 `.dic` 文件提供以下能力：

- **术语索引**：从 Markdown 格式的 `.dic` 文件解析层级化词条
- **正文高亮**：在阅读器渲染的每一页文本中自动匹配并高亮词条
- **释义弹窗**：点击词条弹出 about-panel 风格详情，支持完整 Markdown 渲染（含图片）
- **侧边栏树**：右侧面板展示词条层级树，支持搜索与跳转
- **存储持久化**：每本书的词典数据随阅读进度一起保存

### 1.2 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     词典系统架构 (Dictionary)                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐  │
│  │   解析层     │      │   索引层     │      │  渲染层  │  │
│  │  parse()     │─────►│ buildIndex() │─────►│ highlight│  │
│  │              │      │ compilePattern│     │  + UI    │  │
│  └──────────────┘      └──────────────┘      └──────────┘  │
│         ▲                                              │    │
│         │                                              ▼    │
│  ┌──────────────┐                              ┌──────────┐│
│  │ .dic 文件    │                              │ 阅读正文 ││
│  │ .lw companion│                              │ #content ││
│  └──────────────┘                              └──────────┘│
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   存储层 (Storage)                      │  │
│  │  serialize() / loadFromStorage() / scrollToTerm()     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 生命周期

```
打开 .lw / .dic 文件
    │
    ▼
actions.js → processFileContinue()
    │  提取 _lwMeta.dictionaries[]
    ▼
Dictionary.init(dicSources)
    │  ① parse() → ② buildIndex() → ③ compilePattern()
    ▼
renderer.js → renderCurrentChapter()
    │  requestAnimationFrame
    ▼
Dictionary.highlightCurrentPage()
    │  遍历 .doc-line → highlightLine() → DOM 替换
    ▼
用户点击词条 / 面板条目
    │
    ├──► showTermDetail() → #dictDetailPanel (about-panel)
    │         _renderEntryContent() → Markdown 渲染
    │
    └──► scrollToTerm() → 定位到正文高亮位置
```

---

## 2. 数据模型

### 2.1 词条 Entry

```javascript
{
    name: "星河市",           // 词条名（heading 文本，已去除 Markdown 标记）
    path: ["地点", "城市"],   // 层级路径，由父级 heading 堆栈决定
    level: 3,                 // heading 层级 #1~#6
    content: "...",           // 释义正文（Markdown 原始文本）
    aliases: ["星河"],        // 别名列表，从 > 别名：xxx 提取
    isDeepest: true,          // 是否为所在分支最深节点
    line: 42                  // 在 .dic 文件中的行号
}
```

### 2.2 索引 Index

```javascript
{
    entries: [...],           // Entry[] 原始列表
    nameMap: Map<string, Entry>,    // 词条名 → Entry（O(1) 查找）
    aliasMap: Map<string, Entry>,   // 别名 → Entry
    patterns: [RegExp, ...]   // 分块正则数组，每块 ≤500 个词条
}
```

### 2.3 配置 Config

```javascript
{
    enabled: true,            // 是否启用高亮
    highlight: true,          // 高亮开关（运行时）
    frequency: 'first',       // 'first' = 每页首次出现, 'all' = 每次出现
    matchAllLevels: false,    // false = 仅匹配最深层级词条
    showTooltip: true         // 是否显示详情弹窗
}
```

---

## 3. 解析引擎

### 3.1 .dic 文件格式规范

`.dic` 是标准 Markdown 子集，约定如下：

```markdown
# 地点

## 城市

### 星河市

> 别名：星河、星之都

星河市的夜晚，仰望星空……

### 蓝港市

港口城市，贸易中心。

## 国家

### 北方联邦

军事强国，位于大陆北部。
```

**规则**：
- `#` heading 为词条名，`path` 由上级 heading 堆栈自动构建
- `> 别名：xxx` 为可选别名行，支持 `,，、` 多分隔符
- heading 与下一个同级/更高级 heading 之间的内容为释义
- 支持完整的 Markdown 行内格式（粗体、斜体、链接、图片等）

### 3.2 解析流程

```javascript
parse(content) {
    // 1. 逐行扫描
    // 2. 匹配 /^#{1,6}\s+(.+)$/ → heading
    // 3. 维护堆栈确定 path
    // 4. 收集 heading 到下一个同级 heading 之间的内容为释义
    // 5. 从释义首行提取 > 别名：...
    // 6. 所有文本经过 stripInlineMarkdown() 去除 Markdown 标记
}
```

> **注意**：heading 文本和别名在解析时即调用 `stripInlineMarkdown()`，确保索引中的词条名是纯文本（如 `**胶囊**` → `胶囊`）。

---

## 4. 索引系统

### 4.1 分块正则编译

为避免大词典（>1500 词条）产生超长的正则表达式导致浏览器拒绝编译，采用**分块策略**：

```javascript
compilePattern(nameMap, aliasMap) {
    const CHUNK = 500;
    const patterns = [];
    for (let i = 0; i < escaped.length; i += CHUNK) {
        const chunk = escaped.slice(i, i + CHUNK);
        patterns.push(new RegExp(`(${chunk.join('|')})`, 'g'));
    }
    return patterns;  // RegExp[]
}
```

### 4.2 匹配边界策略

| 词条类型 | 正则边界 | 说明 |
|----------|----------|------|
| 纯中文 (`^[\u4e00-\u9fff]+$`) | 无边界 | 可嵌入其他中文文本，如 "星河市" 匹配 "仰望星河市的夜晚" |
| 非中文 | `\w` 边界检查 | 避免 "cat" 匹配 "catch" |

```javascript
const isCJK = /^[\u4e00-\u9fff]+$/.test(term);
if (!isCJK) {
    const before = text[match.index - 1];
    const after = text[match.index + term.length];
    if ((before && /\w/.test(before)) || (after && /\w/.test(after))) continue;
}
```

### 4.3 重叠处理

多正则块独立匹配后，收集所有结果并做三步后处理：

1. **去重**：同一位置保留最长的匹配
2. **排序**：按起始位置升序
3. **去重叠**：保留先出现的，跳过与已保留区域重叠的后续匹配

---

## 5. 高亮渲染

### 5.1 触发时机

`renderer.js` 在 `renderCurrentChapter()` 的 `requestAnimationFrame` 回调中调用：

```javascript
requestAnimationFrame(() => {
    Lumina.Annotations.renderAnnotations();
    if (Lumina.Dictionary?.isEnabled()) Lumina.Dictionary.highlightCurrentPage();
    Lumina.Renderer.preloadNextPageImages(chapter, pageIdx);
});
```

### 5.2 高亮范围

- **作用域**：当前页所有 `.doc-line`
- **跳过节点**：`code, pre, .dict-entry, .annotation-highlight` 内的文本
- **TreeWalker**：`NodeFilter.SHOW_TEXT` 遍历文本节点，从后向前替换避免索引偏移

### 5.3 频率控制

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| `first` | 每页仅高亮词条的**第一次出现** | 减少视觉干扰（默认） |
| `all` | 高亮词条的**每一次出现** | 需要全文回顾术语 |

`seenTerms: Set<string>` 在 `highlightCurrentPage()` 开始时清空，在 `highlightLine()` 中根据 `frequency` 决定是否添加。

---

## 6. UI 交互

### 6.1 词条详情弹窗

使用 **about-panel** 风格的全屏遮罩弹窗（`#dictDetailPanel`），而非 hover tooltip，以支持：
- 长内容滚动（无高度限制）
- Markdown 完整渲染（图片、列表、代码块等）
- PC 与移动端统一体验

```
┌──────────────────────────────┐
│  KK                    [×]   │  ← .about-header
├──────────────────────────────┤
│  人物                        │  ← .dict-detail-path
│                              │
│  真人样本。13岁，篮球少年……   │  ← .dict-detail-content
│  (Markdown 渲染)             │
└──────────────────────────────┘
```

`_renderEntryContent()` 内部使用 `Lumina.Plugin.Markdown.Parser.parse()` + `Renderer.render()` 渲染释义正文。

### 6.2 侧边栏词条树

- **位置**：右侧面板 `#dictionaryPanel`（与搜索/注释面板同级）
- **结构**：按 `path` 层级分组的折叠树
- **搜索**：顶部输入框实时过滤，`filterPanel()` 按词条名 + 别名匹配
- **点击**：滚动到正文对应位置并打开详情弹窗

### 6.3 词条空状态

- 无词典数据：显示 "本书暂无词典数据"（i18n: `dictionaryEmpty`）
- 搜索无结果：显示 "未找到匹配词条"（i18n: `dictionaryNoMatch`）

---

## 7. 配置与设置

### 7.1 设置面板选项

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| 启用词典高亮 | toggle | true | `dictionaryEnabled` |
| 匹配所有层级词条 | toggle | true | `dictionaryMatchAllLevels` |
| 词条每次出现都高亮 | toggle | false | `dictionaryFrequencyAll`（false = first） |

### 7.2 配置持久化路径

```
ConfigManager
  └── dictionary:
        enabled: true
        matchAllLevels: true
        frequency: 'first'    // 或 'all'
```

`settings.js` 负责 `load/save/apply` 三层映射：
- `load()`: `config.dictionary.frequency → State.settings.dictionaryFrequencyAll`
- `save()`: `settings.dictionaryFrequencyAll → config.dictionary.frequency`
- `apply()`: `settings → Lumina.Dictionary.config`

---

## 8. 存储与序列化

### 8.1 数据流向

`.dic` 文件内容随 `.lw` 打开时提取，存储到数据库的 `fileData.dictionaries[]` 字段：

```javascript
// actions.js / data-manager.js
Lumina.State.app.currentFile.dictionaries = meta.dictionaries;
Lumina.Dictionary?.init(meta.dictionaries);
```

### 8.2 序列化格式

```javascript
serialize() {
    return [{
        source: 'dictionary',
        entryCount: this.index.entries.length,
        entries: entries.map(e => ({
            name, path, level, content, aliases, isDeepest
        })),
        patterns: this.index.patterns.length   // 仅记录数量，正则运行时重建
    }];
}
```

`loadFromStorage()` 调用 `buildIndex(entries)` 重新生成正则索引。

### 8.3 存储字段

`normalizeRecord`、`mergeFileData`、`createImportRecord`、`createExportRecord`、`HistoryDataBuilder.build()` 等均已包含 `dictionaries` 字段。

---

## 9. 扩展指南

### 9.1 添加新的 Markdown 行内类型

词典释义支持 Lumina Writing 的全部 Markdown 扩展：

| 扩展 | 语法 | 说明 |
|------|------|------|
| 标记高亮 | `==text==` | `<mark>` 标签 |
| 注音 | `{ruby|rt}` | `<ruby><rt>` |
| 着重号 | `::text::` | CSS `text-emphasis` |
| 跳转链接 | `[[target]]` | 内部跳转锚点 |
| 旁注 | `{^text^type}` | 行内注释标签 |

这些类型在 `markdown.parser.js` 中解析，由 `markdown.renderer.js` 渲染，`dictionary.js` 的 `_renderMarkdown()` 直接复用。

### 9.2 调整分块大小

若遇到极端大词典（>5000 词条）性能问题，可调整 `compilePattern()` 中的 `CHUNK`：

```javascript
const CHUNK = 500;  // 降低为 300 可减少单次匹配开销，但增加循环次数
```

### 9.3 自定义别名格式

当前别名解析正则：

```javascript
const aliasMatch = entryContent.match(/^>\s*别名[:：]\s*(.+)$/m);
```

如需支持多语言前缀（如 "AKA:"、"Alias:"），修改此正则即可。

---

## 10. 故障排查

### 10.1 常见问题

| 现象 | 原因 | 排查方法 |
|------|------|----------|
| 词条不显示高亮 | `dictionary.enabled = false` 或 `index` 为空 | 控制台搜索 `[Dictionary] skip highlight` |
| 中文词条匹配不到 | 正则边界问题（已修复） | 检查 `compilePattern()` 是否返回数组 |
| 弹窗不显示 | `#dictDetailPanel` DOM 缺失 | 确认 `index.html` 包含 about-panel 结构 |
| 大词典崩溃 | 单个正则超过浏览器限制 | 检查 `patterns.length` 是否 >1 |
| 别名未生效 | 别名行格式不匹配 | 确认使用 `> 别名：xxx` 格式 |

### 10.2 调试日志

词典系统会在控制台输出以下日志：

```
[Dictionary] parsed dic1.dic entries: 150
[Dictionary] init done, total entries: 150 patterns: 1
[Dictionary] highlight lines: 24 entries: 150
[Dictionary] highlighted terms: 12
```

### 10.3 性能基准

| 场景 | 预期性能 |
|------|----------|
| 500 词条 / 1000 行页面 | < 50ms |
| 1500 词条 / 1000 行页面 | < 100ms（分 3 块正则） |
| 5000 词条 / 1000 行页面 | < 200ms（分 10 块正则） |

---

## 附录 A：相关文件清单

```
app/www/
├── js/modules/
│   ├── dictionary.js           # 词典系统核心
│   ├── parser.js               # parseLW()、stripInlineMarkdown()
│   ├── renderer.js             # highlightCurrentPage() 调用点
│   ├── settings.js             # 设置加载/保存/应用
│   ├── config-manager.js       # dictionary 默认配置
│   ├── actions.js              # .lw 文件处理、字典按钮显隐
│   ├── data-manager.js         # 历史记录字典图标、存储恢复
│   └── metadata-extractor.js   # 元数据提取（已去除 Markdown 标记）
│
├── js/i18n/
│   ├── zh.js                   # 词典相关 i18n 键
│   ├── zh-TW.js
│   └── en.js
│
├── js/plugins/markdown/
│   ├── markdown.parser.js      # heading 解析（已 stripInlineMarkdown）
│   └── markdown.renderer.js    # 释义渲染
│
├── css/
│   ├── reader.css              # .dict-entry, .dict-detail-*, .dict-drawer
│   ├── markdown.css            # mark, ruby, .pixiv-emphasis 等扩展样式
│   └── book-detail.css         # [data-type="lwn"] 胶囊颜色
│
└── index.html                  # #dictDetailPanel, #dictionaryPanel, 设置开关
```

## 附录 B：i18n 键速查

| 键名 | 用途 |
|------|------|
| `dictionary` | 面板标题 |
| `dictionaryEnabled` | 设置开关标签 |
| `dictionaryEnabledDesc` | 设置开关 tooltip |
| `dictionaryMatchAllLevels` | 设置开关标签 |
| `dictionaryMatchAllLevelsDesc` | 设置开关 tooltip |
| `dictionaryFrequencyAll` | "词条每次出现都高亮" |
| `dictionaryFrequencyDesc` | tooltip |
| `dictionarySearchPlaceholder` | 面板搜索框占位符 |
| `dictionaryAliasPrefix` | 详情弹窗别名前缀 |
| `dictionaryEmpty` | 空状态提示 |
| `dictionaryNoMatch` | 搜索无结果提示 |
