# 流萤阅读器本地 AI 系统架构与极客实践白皮书

> **文档版本**：1.0  
> **更新日期**：2026-04-17  
> **适用对象**：科技发烧用户、LLM 极客、自托管玩家、开源贡献者  
> **核心原则**：隐私至上、本地优先、完全可控

---

## 1. 本地 AI 的哲学与定位

### 1.1 为什么是"本地 AI"而非云端

流萤阅读器的 AI 功能从设计之初就明确了一个边界：**不接任何云端大模型 API**。

这不是技术能力的限制，而是产品哲学的坚持：

- **数据主权**：你的阅读内容、批注、对话历史，任何时候都不会离开你的设备传输给第三方
- **无订阅绑架**：无需为 AI 功能支付月费，一次部署，永久使用
- **离线可用**：没有网络也能对话（模型已在本地运行）
- **模型自主**：用哪个模型、什么参数、什么角色，完全由你决定

> **适合谁**：已经掌握或愿意学习 LM Studio / Ollama 部署的进阶用户。如果你还不知道什么是 GGUF 模型文件，这个功能可能暂时不适合你——但这也是流萤的刻意选择：AI 功能不是取悦所有人的 checkbox，而是为真正理解本地 AI 价值的用户准备的利器。

### 1.2 小众极客功能的产品定位

在流萤阅读器的功能矩阵中，本地 AI 被定位为**"小众极客功能"**：

| 功能层级 | 代表功能 | 用户门槛 |
|---------|---------|---------|
| 核心层 | 文档阅读、书库管理、批注 | 零门槛 |
| 扩展层 | TTS 朗读、主题定制、热力图 | 低门槛 |
| **极客层** | **本地 AI 对话** | **需要自建后端** |

这意味着：
- AI 功能默认关闭，不会打扰普通用户
- 开启后也不会有强制引导或教程弹窗
- 错误信息面向"懂行的人"（如"无法连接到 192.168.x.x:1234"而非含糊的"网络错误"）

### 1.3 隐私优先：你的数据不出设备

流萤阅读器的 AI 模块遵循与阅读器本体相同的隐私原则：

```
用户问题 + 引用内容 + 历史对话
        ↓
    本地 HTTP 请求 (局域网)
        ↓
    LM Studio / Ollama (同一设备或同一路由器下的电脑)
        ↓
    模型推理（本地 GPU/CPU）
        ↓
    响应流回 APP
```

整个链路中：
- ❌ 没有任何数据上传到互联网
- ❌ 没有第三方 API Key 被发送到外部服务器
- ❌ 没有遥测、没有分析、没有日志上报

### 1.4 支持的后端生态概览

流萤阅读器的 AI 模块通过 **OpenAI 兼容接口** 与后端通信，理论上支持任何提供 `/v1/chat/completions` 的服务：

| 后端 | 推荐场景 | 特点 |
|------|---------|------|
| **LM Studio** | 桌面端、有独立显卡 | GUI 管理、模型切换方便、支持多模型并发 |
| **Ollama** | 命令行用户、macOS/Linux | 轻量、命令行操作、社区模型丰富 |
| **llama.cpp** | 极致精简、嵌入式设备 | 纯命令行、资源占用最低 |
| **vLLM** | 多用户、高并发 | 企业级吞吐、需要 Linux |

下文以 **LM Studio** 和 **Ollama** 为主进行讲解，因为它们是个人用户最常用的方案。

---

## 2. 本地 AI 的部署与设置

### 2.1 LM Studio 部署指南

#### 步骤 1：下载与安装

1. 访问 [https://lmstudio.ai](https://lmstudio.ai) 下载对应平台版本
2. 安装后首次启动，选择模型存储目录（建议预留 10GB+ 空间）

#### 步骤 2：加载模型

1. 在 LM Studio 左侧栏点击 "Search"，搜索你想使用的模型（推荐：Qwen2.5-7B-Instruct、Llama-3.1-8B-Instruct、DeepSeek-R1-Distill-Qwen-7B）
2. 点击下载，等待完成
3. 切换到 "Chat" 标签，在顶部模型选择器中加载刚下载的模型
4. 右下角确认模型已加载（显示绿色状态灯）

#### 步骤 3：启动本地服务器

1. 点击右侧面板的 "▶️ Start Server"
2. 默认端口为 `1234`，保持默认即可
3. **关键设置**：点击 "Server Config" → 勾选 "Listen on all interfaces"
   - 如果不勾选，服务只绑定 `127.0.0.1`，手机无法访问
4. 确认左侧显示 "Server Running on port 1234"

#### 步骤 4：获取电脑局域网 IP

```powershell
# Windows
ipconfig
# 找到 Wi-Fi 适配器的 IPv4 地址，如 192.168.3.206

# macOS/Linux
ifconfig | grep inet
```

### 2.2 Ollama 部署指南

#### 步骤 1：安装

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows：下载安装包 https://ollama.com/download
```

#### 步骤 2：拉取并运行模型

```bash
# 拉取模型（以 qwen2.5:7b 为例）
ollama pull qwen2.5:7b

# 启动服务（默认监听 11434）
ollama serve
```

#### 步骤 3：跨设备访问配置

Ollama 默认只监听 `127.0.0.1`，需要设置环境变量：

```bash
# Windows PowerShell
$env:OLLAMA_HOST="0.0.0.0:11434"
ollama serve

# macOS/Linux
export OLLAMA_HOST=0.0.0.0:11434
ollama serve
```

### 2.3 网络配置关键点

#### 局域网访问的三要素

手机能访问电脑上的 AI 服务，必须同时满足：

1. **同一局域网**：手机和电脑连接同一个 WiFi 路由器
2. **服务绑定 `0.0.0.0`**：而非 `127.0.0.1`（仅本机）
3. **防火墙放行**：Windows 防火墙允许对应端口的入站连接

#### Windows 防火墙放行（以 LM Studio 为例）

```powershell
# 以管理员身份打开 PowerShell，运行：
netsh advfirewall firewall add rule name="LM Studio" dir=in action=allow protocol=tcp localport=1234
```

#### Android APP 的网络适配

流萤阅读器 APP 运行在 `https://localhost/`，向 `http://192.168.x.x:1234` 发起请求时，涉及两个关键配置：

**`AndroidManifest.xml`**：
```xml
<application
    android:usesCleartextTraffic="true">
```

**`MainActivity.java`**：
```java
bridge.getWebView().getSettings().setMixedContentMode(
    WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
);
```

前者允许明文 HTTP 流量（Android 9+ 强制要求），后者允许 HTTPS 页面加载 HTTP 资源（Mixed Content）。

### 2.4 流萤阅读器内的 AI 配置

打开 APP → 设置（⚙️）→ 向下滚动到"本地 AI"区域：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| **启用本地 AI** | 总开关 | 开启 |
| **API Endpoint** | 后端服务地址 | `http://192.168.3.206:1234` |
| **模型名称** | 留空则自动检测 | `qwen2.5-7b-instruct` |
| **API Key** | 本地服务通常无需 | 留空 |
| **System Prompt** | 全局系统提示词 | 按需自定义 |
| **最大 Token** | 上下文长度上限 | 4096（根据模型调整）|

**测试连通性**：配置完成后，点击设置页内的"刷新模型列表"按钮。如果能显示模型名称，说明网络连通。

---

## 3. 双模式交互架构

流萤阅读器的 AI 采用**双模式设计**，分别对应两种使用场景：

### 3.1 任务面板（Task Mode）

**定位**：一次性精准请求，不保留上下文。

**使用场景**：
- 选中一段文字，想知道什么意思（解释）
- 选中一段外文，想翻译成中文（翻译）
- 想快速了解本章讲了什么（摘要）
- 觉得这段文字写得不够好，想优化表达（润色）

**交互流程**：
```
选中文本 → 点击 AI 悬浮按钮 → 打开任务面板
    → 点击"解释"按钮 → 一次性请求 → 显示结果
```

**技术特征**：
- 每次请求都是独立的 `messages` 数组，不含历史
- 适合需要**确定性输出**的场景（翻译必须准确，不受前面对话影响）
- 结果可导出为 TXT

### 3.2 对话面板（Chat Mode）

**定位**：多轮连续对话，保留上下文，支持追问。

**使用场景**：
- 基于前文讨论，深入追问细节
- 让 AI 对比不同章节的情节
- 连续修改润色方向（"太正式了，再口语化一点"）

**进入方式**：
- 长按 AI 悬浮按钮（移动端）
- 或点击任务面板右上角切换按钮

**技术特征**：
- 维护 `_chatHistory` 数组，保存多轮对话
- SSE 流式输出，逐字显示
- 支持上下文截断和遗忘提示
- 可清空历史、导出对话记录

### 3.3 模式切换与状态隔离

两种模式的数据完全隔离：

| 维度 | 任务面板 | 对话面板 |
|------|---------|---------|
| 历史记录 | ❌ 无 | ✅ 有 |
| 流式输出 | ❌ 一次性 | ✅ SSE |
| 引用范围 | 当前选中/章节 | 可选 5 种范围 |
| 输出渲染 | 纯文本 | Markdown |
| 可导出 | ✅ | ✅ |
| 可取消 | ❌ | ✅ |

### 3.4 完整链路架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户交互层                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  选中文本    │  │ AI 悬浮按钮  │  │  引用选择    │      │
│  │  (触发引用)  │  │ (长按/点击)  │  │ (5种范围)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        模式分发层                             │
│                                                             │
│   短按 + 无对话面板打开  ────────▶  任务面板 (Task Mode)     │
│                                                             │
│   长按 / 点击切换到对话  ────────▶  对话面板 (Chat Mode)     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        消息构造层                             │
│                                                             │
│   _buildSystemPrompt()  ──────▶  System Prompt              │
│   _getQuoteText()       ──────▶  引用文本                   │
│   _trimHistory()        ──────▶  截断后的历史               │
│                                                             │
│   最终 messages[]:                                          │
│   [                                                         │
│     {role: 'system', content: systemPrompt},                │
│     ...historyToSend,                                       │
│     {role: 'user', content: userContent}  // 引用+问题      │
│   ]                                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        网络传输层                             │
│                                                             │
│   POST /v1/chat/completions                                 │
│   Content-Type: application/json                            │
│   Body: {model, messages, temperature: 0.7, stream: true}   │
│                                                             │
│   ←── SSE data: {...choices[0].delta.content}               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        渲染输出层                             │
│                                                             │
│   onDelta(delta)  ─────────▶  逐字追加到气泡                │
│   onDone()        ─────────▶  Markdown 最终渲染             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 引用系统：阅读即上下文

### 4.1 五种引用范围详解

流萤阅读器的 AI 对话支持**五种引用范围**，覆盖从"一词一句"到"整本书"的全部粒度：

| 范围 | 标识 | 获取方式 | 适用场景 |
|------|------|---------|---------|
| **selection** | 当前选中 | `window.getSelection()` | 精读某句话、某个术语 |
| **paragraph** | 当前段落 | 视觉焦点段落 / 点击段落 | 讨论单段内容 |
| **page** | 当前页 | 分页范围计算 | 回顾整页情节 |
| **chapter** | 当前章节 | 章节起止索引 | 章节总结、情节分析 |
| **book** | 整本书 | 全部 items | 全书脉络、人物关系 |

**引用切换 UI**：
- 对话面板左下角点击 📖 按钮
- 弹出 5 个选项的浮层
- 当前不可用的选项置灰（如没有选中文本时，`selection` 不可选）

### 4.2 引用文本的获取与实时更新

引用不是"快照"，而是**实时获取**当前阅读状态：

```javascript
_getQuoteText(type, forSend = false) {
    switch (type) {
        case 'selection':
            return window.getSelection().toString();
        case 'paragraph':
            // 获取当前视觉焦点段落
            return this._getCurrentParagraphText();
        case 'page':
            // 获取当前页的所有 items
            return this._getCurrentPageText();
        case 'chapter':
            // 获取当前章节的全部文本
            return this._getChapterText();
        case 'book':
            // 获取全部文档文本（截断保护）
            return this._getBookText();
    }
}
```

**实时更新机制**：
- 翻页时：`_onReadingContextChanged('chapter')` → 若当前引用为 `page`，文本自动更新
- 选区变化时：`selectionchange` 事件 → 若当前引用为 `selection`，实时同步
- 切换章节时：清空对话历史（避免跨书混淆）

### 4.3 "引用在前、问题在后"的消息结构

这是流萤阅读器 AI 模块最核心的设计决策之一：

```javascript
// 有引用时的 userContent 格式
`[${引用标签}]
${引用文本}

---
${用户问题}`
```

**示例**：
```
[当前选中内容]
"赵老实不由的开始回忆起自己的童年：记得俺当时也就11岁吧"

---
解释这段话的时代背景
```

**为什么引用在前？**

LLM 存在 **Lost in the Middle** 现象：当上下文很长时，模型对文本**中间部分**的记忆显著弱于开头和结尾。如果把用户问题放在前面、引用放在后面，模型可能在生成回答时"忘记"引用的具体内容。

通过"引用在前、问题在后"的结构，确保：
- 引用内容处于模型的"近场记忆"
- 用户问题在引用之后，作为明确的指令
- `---` 分隔符作为视觉锚点，帮助模型区分"材料"和"指令"

### 4.4 无引用场景的优雅降级

当用户没有设置引用（点击 ❌ 关闭引用栏），或当前场景无法获取引用时：

```javascript
let userContent = rawText;  // 直接等于用户输入
if (quoteText) {
    userContent = `[${this._quote.label}]\n${quoteText}\n\n---\n${rawText}`;
}
```

此时 `messages` 退化为标准的多轮对话格式，System Prompt 中的"请根据用户提供的引用内容回答问题"对 AI 来说只是一句温和的提示，不会产生负面影响。

---

## 5. Prompt 工程与消息构造

### 5.1 System Prompt 的动态构建

System Prompt 根据当前阅读状态**动态生成**，不是静态配置：

```javascript
_buildSystemPrompt() {
    const state = Lumina.State.app;
    const currentFile = state.currentFile;
    
    // 没有打开书籍时，使用通用助手角色
    if (!currentFile?.fileName && !currentFile?.name && !state.document?.fileName) {
        return '你是一个 helpful 的助手，请根据用户的提示词简洁准确地回答问题。';
    }
    
    // 有书籍打开时，构建阅读助手角色
    const doc = state.document;
    const chapter = state.chapters?.[state.currentChapterIndex];
    const bookTitle = currentFile?.metadata?.title
        || currentFile?.fileName?.replace(/\.[^/.]+$/, '')
        || doc?.fileName
        || '未知书籍';
    const chapterTitle = chapter?.title || '';
    
    return `你是阅读助手，正在帮助用户阅读《${bookTitle}》。用户当前在${chapterTitle ? `「${chapterTitle}」` : '当前章节'}。请根据用户提供的引用内容回答问题，回答简洁准确。`;
}
```

**两种角色的设计意图**：

| 场景 | System Prompt | AI 行为预期 |
|------|--------------|------------|
| 无书籍 | 通用 helpful 助手 | 自由问答、知识咨询、创意写作 |
| 有书籍 | 阅读助手 | 聚焦文本分析、情节解读、语言润色 |

### 5.2 四种预设 Prompt

任务面板的 4 个按钮对应 4 组预设：

```javascript
getPrompts() {
    return {
        explain: {
            label: '解释',
            system: '请用简洁的中文解释以下段落的核心含义，不要过度发挥。'
        },
        translate: {
            label: '翻译',
            system: '请翻译以下文本。如果是中文则翻译成英文，如果是其他语言则翻译成中文。保持原文风格。'
        },
        summary: {
            label: '摘要',
            system: '请为以下内容生成一段不超过 100 字的摘要。'
        },
        rewrite: {
            label: '润色',
            system: '请对以下文本进行润色，使其表达更流畅、优美，但不要改变原意。'
        }
    };
}
```

**任务面板的请求结构**：
```javascript
messages = [
    { role: 'system', content: cfg.systemPrompt || action.systemPrompt },
    { role: 'user',   content: contextText }  // 引用文本
];
```

注意：任务面板使用**两组 system prompt**——用户配置的全局 `systemPrompt` 作为第一层，任务预设的 `system` 作为第二层。实际发送时取后者（更具体）。

### 5.3 User Content 拼接格式

完整的 `userContent` 构建流程：

```javascript
// 步骤 1：获取原始输入
const rawText = input.value.trim();  // "你好"

// 步骤 2：获取引用（如有）
let quoteText = '';
if (this._quote) {
    quoteText = this._getQuoteText(this._quote.type, true);
}

// 步骤 3：拼接
let userContent = rawText;
if (quoteText) {
    userContent = `[${this._quote.label}]\n${quoteText}\n\n---\n${rawText}`;
}

// 示例输出（有引用）
// [当前章节]
// 赵老实不由的开始回忆起自己的童年...
//
// ---
// 这段话在全书中的作用是什么？
```

### 5.4 最终 messages[] 结构

对话面板发送给 AI 的完整消息数组：

```javascript
[
    // 第 1 条：System Prompt（动态构建）
    {
        role: 'system',
        content: '你是阅读助手，正在帮助用户阅读《平凡的世界》。用户当前在「第一章」。请根据用户提供的引用内容回答问题，回答简洁准确。'
    },
    
    // 第 2~N 条：截断后的历史对话（FIFO，保留最近的）
    { role: 'user',      content: '[当前段落]\n...\n\n---\n这段话写得好吗？' },
    { role: 'assistant', content: '这段描写非常细腻...' },
    { role: 'user',      content: '能再具体说说哪里细腻吗？' },
    { role: 'assistant', content: '主要体现在三个方面...' },
    
    // 最后 1 条：本轮用户输入（含引用）
    {
        role: 'user',
        content: '[当前选中内容]\n"11岁"\n\n---\n这个年龄设定有什么隐喻吗？'
    }
]
```

---

## 6. 上下文管理与容量控制

### 6.1 _chatHistory 设计

`_chatHistory` 是一个扁平数组，按顺序存储用户和助手的消息：

```javascript
_chatHistory = [
    { role: 'user',      content: '...' },      // 第 1 轮用户
    { role: 'assistant', content: '...' },      // 第 1 轮助手
    { role: 'user',      content: '...' },      // 第 2 轮用户
    { role: 'assistant', content: '...' },      // 第 2 轮助手
    // ...
];
```

**关键设计决策**：
- 保存的是**完整 `userContent`**（含引用），而非界面上的 `rawText`
- 这样截断时计算的 token 数才准确
- 换书时自动清空（通过 `currentBookKey` 检测）

### 6.2 Token 估算策略

流萤阅读器采用简化的 token 估算：

```javascript
_estimateTokens(text) {
    return Math.ceil((text || '').length / 2);
}
```

**为什么是 `length / 2`？**

对于中文内容，这是经验上最接近真实 token 数的比值：
- 1 个汉字 ≈ 1 token（在 GPT 系列分词器中通常是 1~1.5 token）
- 1 个英文单词 ≈ 1 token
- `length / 2` 对混合文本偏保守，宁可多算也不多算

**局限性**：
- 不精确（真实 tokenizer 需要加载模型词汇表）
- 对纯英文文本会低估（英文单词平均 1.3 token）
- 对代码片段会高估（代码 token 更碎）

> **为什么不引入精确 tokenizer？**
> 因为 tokenizer 文件（如 `tokenizer.json`）通常几 MB，引入它会显著增加 APP 体积。对于阅读辅助场景，`length / 2` 的精度足够指导截断决策。

### 6.3 FIFO 截断机制

当历史 + 本轮输入 + System Prompt 的总 token 超过预算时，触发截断：

```javascript
_trimHistory(history, maxTokens, userContent, systemPrompt) {
    const target = Math.floor(maxTokens * 0.7);  // 留 30% 给模型生成
    
    let total = estimate(systemPrompt) + estimate(userContent);
    total += history.reduce((sum, m) => sum + estimate(m.content), 0);
    
    const trimmed = [...history];
    let forgotten = 0;
    
    // 从最早的对话开始，成对丢弃
    while (total > target && trimmed.length >= 2) {
        const removedUser = trimmed.shift();
        const removedAssist = trimmed.shift();
        total -= estimate(removedUser.content) + estimate(removedAssist.content);
        forgotten++;
    }
    
    return { history: trimmed, forgotten };
}
```

**为什么是 `maxTokens * 0.7`？**

- 70% 给输入（System + History + UserContent）
- 30% 留给模型生成回复
- 避免"输入占满，模型无空间回答"的尴尬

### 6.4 容量进度条

对话面板底部有一条实时容量条：

```
上下文容量: [████████░░░░░░░░░░░░] 45%
```

颜色状态：
- **绿色（< 60%）**：健康
- **黄色（60%~85%）**：警告，接近截断
- **红色（≥ 85%）**：危险，下一轮极可能触发截断

进度条实时响应：
- 输入框打字时自动更新
- 切换引用范围时重新计算
- 历史被截断后同步刷新

### 6.5 遗忘轮数提示

当历史被截断时，面板顶部显示提示：

```
⚠️ 已遗忘前 3 轮对话上下文
```

这个提示的目的是：
- **透明性**：让用户知道 AI 已经"忘记"了之前的某些内容
- **避免幻觉**：如果用户追问"你刚才说的那个..."，而那段已被截断，提示可以降低预期落差
- **主动清理**：提示用户"对话太长了，可以清空重新开始"

### 6.6 引用独立截断策略

极端情况下，即使清空全部历史，引用内容本身也可能超预算。此时采取**引用截断**：

```javascript
if (trimResult.overBudget && trimResult.remainingBudget < 0) {
    const maxQuoteTokens = Math.floor(maxTokens * 0.7 - sysTokens - rawTokens - reserve);
    const maxQuoteChars = Math.max(0, maxQuoteTokens * 2);
    
    if (quoteText.length > maxQuoteChars) {
        const truncated = quoteText.slice(0, maxQuoteChars);
        userContent = `[${label}]\n${truncated}\n\n[...内容已截断...]\n\n---\n${rawText}`;
    }
}
```

**策略优先级**：
1. 优先截断旧历史（FIFO）
2. 历史清空后仍超预算，截断本轮引用
3. 绝不截断用户问题（`rawText`）

---

## 7. SSE 流式传输与网络层

### 7.1 SSE 解析实现

流萤阅读器使用 **Server-Sent Events (SSE)** 接收流式响应：

```javascript
async _streamChat(url, cfg, messages, onDelta, onDone, onError) {
    this._abortController = new AbortController();
    
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true }),
        signal: this._abortController.signal
    });
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();  // 保留不完整的最后一行
        
        for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') { onDone(); return; }
            
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) onDelta(delta);
        }
    }
}
```

**为什么用 SSE 而非 WebSocket？**

- SSE 是单向流（服务器→客户端），适合 AI 生成场景
- 基于 HTTP，无需额外协议升级，兼容性更好
- LM Studio / Ollama 原生支持 SSE 输出

### 7.2 动态超时计算

本地模型处理长文本时，首 token 可能很慢（几秒到几十秒）。流萤采用动态超时：

```javascript
const contentLength = JSON.stringify(messages).length;
const dynamicTimeout = Math.min(300000, Math.max(60000, 30000 + Math.floor(contentLength / 1000) * 10000));
// 基础 30 秒 + 每 1000 字符 10 秒，最小 60 秒，最大 300 秒
```

### 7.3 取消机制

用户可以随时点击"停止"按钮中断生成：

```javascript
cancel() {
    this._userCancelled = true;
    this._abortController?.abort();
    this._abortController = null;
}
```

取消后：
- 已生成的内容保留在对话中
- 发送按钮恢复可用
- 不会触发错误提示

### 7.4 错误分类处理

| 错误类型 | 检测方式 | 用户提示 |
|---------|---------|---------|
| 连接失败 | `fetch` 抛出 | "AI 请求失败: Failed to fetch" |
| HTTP 错误 | `res.ok === false` | "AI 请求失败: HTTP 404" |
| 上下文溢出 | 错误消息含 "context length" | "输入内容超过模型上下文长度..." |
| 用户取消 | `_userCancelled === true` | 静默处理，不提示 |

---

## 8. UI 渲染与交互设计

### 8.1 流式打字机效果

SSE 接收到的每个 `delta` 被逐字追加到当前气泡：

```javascript
onDelta: (delta) => {
    reply += delta;
    if (!bubbleEl) {
        bubbleEl = this._appendAssistantBubble();
        started = true;
    }
    // 流式渲染：直接追加文本，不重新解析 Markdown
    bubbleEl.textContent = reply;
}
```

**为什么流式阶段不用 Markdown 渲染？**

- Markdown 解析需要完整的文本（如表格、代码块需要闭合标记）
- 流式过程中文本不完整，渲染会闪烁或出错
- 策略：**流式阶段显示纯文本，`onDone` 后再统一 Markdown 渲染**

### 8.2 Markdown 渲染复用

对话气泡的 Markdown 渲染复用了阅读器的 **Markdown 插件**：

```javascript
_renderMarkdown(text) {
    const parser = Lumina.Plugin?.Markdown?.Parser;
    const renderer = Lumina.Plugin?.Markdown?.Renderer;
    
    if (!parser || !renderer) {
        // 降级：纯文本 + 换行转 <br>
        return escapeHtml(text).replace(/\n/g, '<br>');
    }
    
    const parsed = parser.parse(text);
    const container = document.createElement('div');
    container.className = 'ai-markdown-body';
    
    parsed.items.forEach(item => {
        const el = renderer.render(item, -1);
        container.appendChild(el);
    });
    
    return container.innerHTML;
}
```

### 8.3 移动端 vs 桌面端

| 特性 | 移动端 | 桌面端 |
|------|--------|--------|
| 面板形态 | 底部弹出 Sheet | 居中浮动窗口 |
| 面板尺寸 | 宽度 100%，高度 80vh | 宽度 100%（max 720px），高度 80vh |
| 悬浮按钮 | 支持拖动 reposition | 支持拖动 reposition |
| 对话面板 | 全屏覆盖 | 可拖拽标题栏移动、ResizeObserver 记录尺寸 |

### 8.4 悬浮按钮手势设计

```
┌──────────────┐
│   短按/单击  │ ──────▶ 有面板打开则关闭，无则打开任务面板
│   (click)    │
├──────────────┤
│   长按 500ms │ ──────▶ 进入对话模式并打开对话面板
│   (long press)│         + 震动反馈 (navigator.vibrate)
├──────────────┤
│   拖动 >5px  │ ──────▶ reposition 按钮位置，保存到配置
│   (drag)     │         拖动时取消长按定时器，避免误触发
└──────────────┘
```

---

## 9. 配置与持久化

### 9.1 AI 配置存储结构

AI 配置存储在 `ConfigManager` 的 `ai` 键下：

```javascript
Lumina.ConfigManager.get('ai') === {
    enabled: false,           // 总开关
    endpoint: 'http://localhost:1234',
    model: '',                // 空字符串 = 自动检测
    apiKey: '',
    timeout: 30000,
    systemPrompt: '你是一个 helpful 的阅读助手...',
    maxTokens: 4096,
    fabX: null,               // 悬浮按钮 X 坐标
    fabY: null,               // 悬浮按钮 Y 坐标
    chatPanelX: null,         // 对话面板 X（PC）
    chatPanelY: null,         // 对话面板 Y（PC）
    chatPanelWidth: null,     // 对话面板宽度（PC）
    chatPanelHeight: null     // 对话面板高度（PC）
};
```

### 9.2 关键配置项详解

| 配置项 | 默认值 | 建议值 | 说明 |
|--------|--------|--------|------|
| `endpoint` | `http://localhost:1234` | 局域网 IP | 本地开发用 localhost，APP 用局域网 IP |
| `model` | `''` | 具体模型名 | 留空时流萤会自动调用 `/v1/models` 检测 |
| `maxTokens` | `4096` | 按模型调整 | Qwen2.5-7B 用 4096，Llama-3.1-8B 用 8192 |
| `systemPrompt` | 内置 | 按需定制 | 全局 System Prompt，可被任务预设覆盖 |

### 9.3 面板位置持久化

- **悬浮按钮**：拖动结束后保存 `fabX` / `fabY` 到配置
- **对话面板（PC）**：拖拽标题栏保存位置；ResizeObserver 保存尺寸
- 所有位置在应用重启后恢复

---

## 10. 开发规范与扩展指南

### 10.1 新增预设任务

在 `getPrompts()` 中添加新条目即可：

```javascript
getPrompts() {
    return {
        // ...原有4个...
        analyze: {
            label: '分析',
            system: '请从文学角度分析以下段落的写作手法和表达技巧。'
        }
    };
}
```

然后在 `index.html` 的 `.ai-actions` 区域添加对应按钮。

### 10.2 扩展引用范围

如需新增引用类型（如 `section` / `volume`）：

1. 在 `_getQuoteText()` 中添加分支
2. 在 `_refreshQuoteOptions()` 中添加可用性判断
3. 在 `index.html` 的引用浮层中添加选项按钮
4. 更新 i18n 文案

### 10.3 Token 估算替换

如需替换为精确 tokenizer：

```javascript
// 当前
_estimateTokens(text) {
    return Math.ceil((text || '').length / 2);
}

// 替换为 tiktoken（需要引入 @dqbd/tiktoken）
async _estimateTokens(text) {
    const encoder = await this._getEncoder();
    return encoder.encode(text).length;
}
```

> 注意：引入 tiktoken 会增加约 1MB 的 WASM 文件体积。

### 10.4 非 OpenAI 兼容接口适配

如果后端不支持 `/v1/chat/completions`，需要修改 `_streamChat()` 中的：
- URL 路径
- 请求体格式
- SSE 数据解析逻辑
- 错误码映射

---

## 11. 故障排查与最佳实践

### 11.1 常见错误排查

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| "Failed to fetch" | 网络不通 / 服务未启动 | 检查 IP 和端口，确认 LM Studio 已启动 Server |
| "Mixed Content" | HTTPS 页面请求 HTTP | Android 已修复，Web 端需用 HTTPS 后端 |
| "HTTP 404" | 路径错误 | 确认 endpoint 末尾无 `/`，如 `http://ip:port` |
| 模型不回复 | 模型加载失败 / GPU 内存不足 | LM Studio 中检查模型状态灯是否为绿色 |
| 回复乱码 | 模型不适合对话（如 base 模型） | 使用 Instruct / Chat 版本模型 |

### 11.2 上下文溢出处理

如果频繁遇到上下文溢出：

1. **调大模型 Context Length**：LM Studio → 模型设置 → Context Length → 设为 8192 或 16384
2. **减小 maxTokens**：流萤设置中把"最大 Token"从 4096 改为 2048
3. **缩短引用范围**：从"整章"改为"当前段落"
4. **清空历史**：对话面板点击 🗑️ 清除上下文

### 11.3 网络连接排查清单

手机无法连接电脑 LM Studio：

- [ ] 手机和电脑在同一 WiFi
- [ ] LM Studio 勾选 "Listen on all interfaces"
- [ ] Windows 防火墙放行端口（`netsh advfirewall`）
- [ ] 电脑 IP 正确（`ipconfig` 确认）
- [ ] 手机浏览器能访问 `http://ip:port/v1/models`
- [ ] APP 已重新构建安装（`usesCleartextTraffic` 生效）

### 11.4 模型选择建议

| 用途 | 推荐模型 | 参数规模 | 显存需求 |
|------|---------|---------|---------|
| 通用阅读辅助 | Qwen2.5-Instruct | 7B | ~6GB |
| 中文文学分析 | DeepSeek-R1-Distill-Qwen | 7B/14B | ~6GB/~12GB |
| 英文原著阅读 | Llama-3.1-Instruct | 8B | ~6GB |
| 低显存设备 | Qwen2.5-Instruct-GPTQ-Int4 | 7B | ~4GB |
| 高质量长文本 | Qwen2.5-32B-Instruct | 32B | ~20GB |

### 11.5 Token 节省技巧

- **缩短 System Prompt**：自定义更简洁的 system prompt
- **避免整本书引用**：除非必要，否则用"当前段落"而非"整本书"
- **及时清空历史**：对话过长时主动清除，而非等待自动截断
- **关闭未使用的功能**：不读外文时不需要加载翻译模型

---

## 12. 附录

### 12.1 消息格式速查表

**任务面板（解释）**：
```json
{
  "model": "qwen2.5-7b-instruct",
  "messages": [
    { "role": "system", "content": "请用简洁的中文解释以下段落的核心含义，不要过度发挥。" },
    { "role": "user", "content": "赵老实不由的开始回忆起自己的童年..." }
  ],
  "stream": false
}
```

**对话面板（有引用、有历史）**：
```json
{
  "model": "qwen2.5-7b-instruct",
  "messages": [
    { "role": "system", "content": "你是阅读助手，正在帮助用户阅读《平凡的世界》..." },
    { "role": "user", "content": "[当前段落]\n...\n\n---\n这段话写得好吗？" },
    { "role": "assistant", "content": "这段描写非常细腻..." },
    { "role": "user", "content": "[当前选中内容]\n\"11岁\"\n\n---\n这个年龄设定有什么隐喻吗？" }
  ],
  "stream": true
}
```

### 12.2 API 兼容层说明

流萤阅读器使用的 OpenAI 兼容字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `model` | string | 模型标识符 |
| `messages` | array | 消息数组，含 `role` 和 `content` |
| `temperature` | float | 采样温度，固定 0.7 |
| `stream` | boolean | 是否流式输出，对话面板固定 `true` |

响应解析字段：

| 字段 | 说明 |
|------|------|
| `choices[0].delta.content` | SSE 流式中的增量文本 |
| `choices[0].message.content` | 非流式完整回复 |

### 12.3 文件结构速查

```
app/www/js/modules/
├── ai.js              # AI 核心模块（双模式、引用、消息构造、SSE）
├── ui.js              # showDialog / showToast 等 UI 方法

app/www/css/
├── ai.css             # AI 面板、悬浮按钮、对话气泡样式

app/www/js/i18n/
├── zh.js              # 中文文案（含 AI 相关）
├── zh-TW.js           # 繁体中文
├── en.js              # 英文
```

### 12.4 关键修复记录

| 日期 | 问题 | 修复 |
|------|------|------|
| 2026-04-17 | `_chatHistory` 保存裸 `rawText` 而非含引用的 `userContent`，导致 token 计算失真 | 历史保存改为 `userContent`，`_updateContextBar` 支持 `historyOverride` |
| 2026-04-17 | 无书籍时 System Prompt 显示《unknownBook》 | 无书籍时改用通用助手 prompt |
| 2026-04-17 | Android APP HTTPS 页面请求 HTTP AI 服务被 Mixed Content 阻止 | `usesCleartextTraffic="true"` + `MIXED_CONTENT_ALWAYS_ALLOW` |
| 2026-04-17 | 悬浮按钮拖动与长按手势混淆 | 5px 阈值分离拖动和长按 |

---

*本文档由流萤阅读器开发团队维护。本地 AI 是小众极客功能，我们不为它提供"一键部署"式的简化包装——因为真正理解本地 AI 价值的用户，应该也完全有能力自己架设后端。如果你在这条路上遇到了问题，欢迎通过 GitHub Issues 反馈。*
