# Lumina Reader 本地 AI 集成架构与实现指南

> 版本：v1.0  
> 日期：2026-04-15  
> 技术栈：Capacitor 6 + Vanilla JS + LM Studio / OpenAI-compatible API  
> 核心模块：`app/www/js/modules/ai.js`、`settings.js`、`ui.js`  
> 关键变更：对话模式引入引用上下文、SSE 流式输出、上下文容量条、跨书历史隔离

---

## 目录

1. [架构定位与核心目标](#1-架构定位与核心目标)
2. [双模式设计：任务面板 vs 对话面板](#2-双模式设计任务面板-vs-对话面板)
3. [引用系统：5 种上下文来源](#3-引用系统5-种上下文来源)
4. [对话模式的请求与上下文管理](#4-对话模式的请求与上下文管理)
   - 4.1 SSE 流式读取
   - 4.2 历史截断与预算控制
   - 4.3 跨书隔离
   - 4.4 上下文容量条（Context Bar）
5. [AI 设置面板与模型下拉框](#5-ai-设置面板与模型下拉框)
6. [关键事件流与自动刷新机制](#6-关键事件流与自动刷新机制)
7. [文件结构与代码入口](#7-文件结构与代码入口)
8. [已知限制与后续优化方向](#8-已知限制与后续优化方向)
9. [附录：快速排查清单](#9-附录快速排查清单)

---

## 1. 架构定位与核心目标

本地 AI 模块是 Lumina Reader 的**可选增强功能**，目标是在**不依赖云端**的前提下，让已加载的本地大模型（LM Studio、Ollama 等）直接为阅读服务。

设计原则：
- **最小侵入**：AI 未启用时，所有 UI（包括 FAB 悬浮按钮）完全隐藏，不影响阅读体验。
- **上下文感知**：对话必须基于用户当前真正在看的内容（选区/段落/页面/章节/全书）。
- **性能兜底**：前端主动做 token 预算、历史截断、引用截断，防止 4096 上下文模型直接溢出。
- **双轨并行**：临时任务（解释/翻译/摘要等）走一次性任务面板；连续追问走对话面板，各自独立。

---

## 2. 双模式设计：任务面板 vs 对话面板

### 2.1 临时任务面板（Task Panel）
- **入口**：单击 FAB → 打开 `#aiPanel`
- **行为**：一次性请求，没有历史记忆
- **上下文来源**：有选区则取选区，否则取当前章节全文
- **动作按钮**：解释、翻译、摘要、续写、润色、自定义任务
- **核心方法**：`Lumina.AI._sendTaskMessage(action, text)`

### 2.2 对话面板（Chat Panel）
- **入口**：长按 FAB 或从任务面板切换 → 打开 `#aiChatOverlay`
- **行为**：多轮对话，维护 `_chatHistory`，支持 SSE 流式输出
- **上下文来源**：基于**引用系统**（`selection` / `paragraph` / `page` / `chapter` / `book`），用户可手动切换
- **核心方法**：`Lumina.AI._sendChatMessage()`

**引用仅属于对话模式**，任务面板不使用 `_quote` 状态。

---

## 3. 引用系统：5 种上下文来源

引用状态保存在 `Lumina.AI._quote = { type, label, snapshot? }` 中。`_getQuoteText(type)` 负责按类型提取文本。

| 类型 | 数据来源 | 可用条件 |
|------|---------|---------|
| `selection` | `window.getSelection()` | 有文字选区时可用，无选区则隐藏 |
| `paragraph` | 当前段落 | 有选区时取选区所在段落；无选区时取**视觉中心段落**（`getCurrentVisibleIndex`） |
| `page` | 当前分页范围 | 始终可用（只要有书籍） |
| `chapter` | 当前一级章节 | 始终可用 |
| `book` | 全书 | 始终可用 |

### 3.1 段落（paragraph）的精确实现
早期实现粗暴地取章节前 3 段，现已改为：
1. **有选区**：通过 `range.commonAncestorContainer` 向上查找 `.doc-line.paragraph`，只认正文段落。
2. **无选区**：调用 `Lumina.Renderer.getCurrentVisibleIndex()` 获取视觉中心 index，然后在当前页面所有 `.doc-line.paragraph[data-index]` 中找**距离最近**的一个。
3. 若找不到任何正文段落，返回空字符串，选项隐藏。

### 3.2 页面（page）的精确实现
早期实现取章节前 1/3 模拟一页，现已改为直接读取 `pageRanges[currentPageIdx]`，精确截取当前页实际渲染的 `doc.items`。

### 3.3 引用内容预览
Quote Bar（`#aiQuoteBar`）上除了显示类型和字数，还在标签右侧显示一段 **50 字内容预览**，帮助用户确认引用没有搞错。

---

## 4. 对话模式的请求与上下文管理

### 4.1 SSE 流式读取
`_streamChat(url, cfg, messages, onDelta, onDone, onError)` 统一封装了 SSE 处理：
- 使用 `fetch` + `res.body.getReader()` 逐段解码
- 支持首 token 超时检测，收到第一个 `delta` 后清除超时
- 流式渲染时创建 `.streaming` 气泡，逐字追加
- 用户可随时点击关闭或切换引用触发 `this.cancel()` 中断请求

### 4.2 历史截断与预算控制
`_trimHistory(history, maxTokens, newMessageText, systemText)` 维护对话上下文预算：
- **目标预算**：`maxTokens * 0.7`（给模型生成留足余量）
- **溢出策略**：从最早的对话对（user + assistant）开始 `shift()` 丢弃
- **前端丢弃**：若仍超预算，优先**截断本轮引用内容**，而不是混合截断用户问题
- **History 存储优化**：`_chatHistory` 只存储用户的**原始问题**（不含大段引用），避免历史被原文撑爆

### 4.3 Prompt 格式：引用在前、问题在后
早期格式是“问题在前、引用在后”，导致 LLM 产生 **Lost in the Middle**（只读开头）。现已改为：

```text
[页面]
<当前页面内容>

---
<用户问题>
```

这样问题位于 prompt 最末端，模型生成时必须回溯引用文本，利用率更高。

### 4.4 跨书隔离
`_currentBookKey` 记录当前书籍的 `fileKey`：
- 换书后 `fileKey` 不一致 → 自动清空 `_chatHistory` 和 `_forgottenRounds`
- 重置默认引用（有选区则 `selection`，否则 `paragraph`）

### 4.5 上下文容量条（Context Bar）
对话面板底部有 `#aiContextFill` 细进度条：
- `< 60%`：绿色（`var(--accent-color)`）
- `≥ 60%`：橙色（`.warning`）
- `≥ 85%`：红色（`.danger`）
- 顶部有删除图标按钮 `#aiChatClear`，点击清空历史并 toast 提示

计算方式：`(systemPromptTokens + sum(historyTokens)) / maxTokens * 100%`

---

## 5. AI 设置面板与模型下拉框

`Lumina.Settings.initAISettings()` 负责初始化 AI 设置：
- 开关、端点输入、Max Tokens 滑块
- **自定义下拉框**：原生 `<select>` 已被替换为 `Lumina.UI.CustomSelect`
- `refreshAIModels()` 拉取 `/v1/models`，动态填充下拉选项

`Lumina.UI.CustomSelect` 是通用类组件，支持 `setItems` / `setValue` / `open` / `close` / `destroy`，位于 `ui.js`。

---

## 6. 关键事件流与自动刷新机制

对话面板打开时，需要感知用户在阅读区的行为变化。核心监听器：

| 事件 | 来源 | 作用 |
|------|------|------|
| `fileOpened` | `actions.js` 打开新文件时 dispatch | 清空历史、重置引用 |
| `chapterRendered` | `renderer.js` 每次渲染完毕 dispatch | 刷新 quote bar 和选项列表 |
| `selectionchange` | 浏览器原生事件（200ms 防抖） | 有选区切 `selection`，无选区自动回退 |
| `scroll` | `Lumina.DOM.contentScroll`（300ms 防抖） | 仅当当前引用为 `paragraph` 时更新 quote bar |

**Popover 选项动态显隐**：
- 未打开书籍：5 个选项全部显示但置灰（`disabled`）
- 已打开书籍：空内容选项（如无选区时的 `selection`）直接隐藏
- 当前选中类型被隐藏时，自动切到第一个可用类型

---

## 7. 文件结构与代码入口

```
app/www/
├── index.html              # AI 面板 DOM（chat overlay、quote bar、context bar）
├── css/
│   └── ai.css              # AI 模块专用样式（含 context bar、quote preview）
└── js/
    ├── i18n/
    │   ├── zh.js           # 中文键值（aiContextCleared、aiQuoteTruncated 等）
    │   ├── zh-TW.js
    │   └── en.js
    ├── modules/
    │   ├── ai.js           # 核心：FAB、任务面板、对话面板、SSE、引用、上下文管理
    │   ├── settings.js     # AI 设置初始化、模型刷新
    │   ├── ui.js           # CustomSelect 通用组件
    │   └── renderer.js     # 渲染后 dispatch chapterRendered；getCurrentVisibleIndex
    └── ...
```

关键状态变量（`ai.js`）：
- `Lumina.AI._isChatMode`
- `Lumina.AI._quote`
- `Lumina.AI._chatHistory`
- `Lumina.AI._currentBookKey`
- `Lumina.AI._forgottenRounds`

---

## 8. 已知限制与后续优化方向

### 8.1 当前已知限制
1. **上下文硬天花板**：默认 `maxTokens = 4096`，若书籍章节很长（>3000 字），单章引用就可能占去大部分 token，留给对话历史和多轮生成的空间很小。根本解决需在 LM Studio 端调大 Context Length。
2. **段落滚动追踪的边界情况**：如果页面全是标题/图片，找不到 `.doc-line.paragraph`，`paragraph` 选项会暂时隐藏。
3. **任务面板不支持引用切换**：任务面板始终走“选区 → 章节”的自动 fallback，无法像对话面板那样精准指定 page/chapter/book。

### 8.2 后续可优化方向
1. **滑动窗口 + 摘要化历史**：当历史很长时，把久远对话自动摘要成一句话 system hint，而不是直接丢弃。
2. **引用 Token 预估前置**：在 quote bar 上直接显示当前引用预计占用多少 tokens，而不是仅显示字数。
3. **任务面板引用对齐**：让任务面板也能复用 `_quote` 系统，实现“基于当前页面翻译”等更细粒度任务。
4. **移动端 FAB 位置记忆**：已支持 PC Web 端拖拽记忆，APP 端可补充 safe-area 适配。

---

## 9. 附录：快速排查清单

| 现象 | 排查点 |
|------|--------|
| AI 面板打不开 | 检查设置里 AI 开关是否打开、端点是否填写 |
| 模型下拉框为空 | 确认 LM Studio 已启动且 CORS 开启，点击刷新按钮看 toast 提示 |
| 模型回复为空或截断 | 检查上下文容量条是否变红；调大 LM Studio 的 Context Length |
| 对话历史没有清空换书后 | 确认 `fileKey` 是否正常生成；看 `_currentBookKey` 是否变化 |
| 段落引用不随滚动更新 | 检查 `contentScroll` 的 scroll 事件是否被其他逻辑阻止冒泡 |
| quote bar 显示 "—" 或 ○ | 未打开书籍时 `_quote` 为 null，属于正常状态；打开书籍后应恢复 |
| 选区选项消失/出现异常 | 检查 `selectionchange` 事件和 `_refreshQuoteOptions()` 调用时机 |
