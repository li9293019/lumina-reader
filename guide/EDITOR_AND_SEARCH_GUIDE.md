# Lumina Reader 文档编辑机制完整指南

> 版本：v2.1.8+ | 涵盖就地编辑、查找替换、捕获组引用、换行拆分

---

## 目录

1. [功能概览](#一功能概览)
2. [就地编辑](#二就地编辑)
3. [查找替换](#三查找替换)
4. [捕获组引用](#四捕获组引用)
5. [换行拆分](#五换行拆分)
6. [常用场景速查](#六常用场景速查)
7. [技术实现详解](#七技术实现详解)
8. [已知限制](#八已知限制)

---

## 一、功能概览

```
┌─────────────────────────────────────────────────────────────┐
│                      文档编辑体系                            │
├────────────────────────────┬────────────────────────────────┤
│      就地编辑               │         查找替换               │
│  (双击/双触段落进入)        │  (搜索面板替换模式)            │
├────────────────────────────┼────────────────────────────────┤
│ • 单条 item 修改            │ • 范围：页/章/全文             │
│ • 支持换行拆分              │ • 支持正则                     │
│ • 空段落自动删除            │ • 支持捕获组引用 $1/$&         │
│ • 实时渲染                  │ • 支持换行拆分                 │
│ • 标题自动重建 TOC          │ • 批量替换                     │
└────────────────────────────┴────────────────────────────────┘
```

**核心设计原则**：`document.items` 是**单源真值**。所有编辑直接修改 items，通过统一的 `saveDocument()` 持久化，通过 `remapIndices()` 同步所有外部索引。

---

## 二、就地编辑

### 2.1 触发方式

| 平台 | 操作 | 代码位置 |
|------|------|---------|
| PC Web | **双击** `.doc-line` 段落 | `editor.js: dblclick` |
| Android App | **双触**（350ms 内同一位置触摸两次）| `editor.js: touchend` |

**不可编辑区域**：
- 沉浸模式（`isImmersive`）
- 图片（`.doc-image`）
- 批注上下文菜单打开时

### 2.2 可编辑类型

```
✅ paragraph     正文段落
✅ heading1~6   各级标题（编辑后自动重建编号 + TOC）
✅ title         文档标题
❌ image         图片（不可编辑）
❌ list          列表项（不可编辑）
```

### 2.3 键盘交互

| 操作 | PC Web | Android App |
|------|--------|-------------|
| **提交** | `Enter` | 点击**非编辑区域** |
| **换行** | `Shift + Enter` | `Enter` |
| **取消** | `Escape` | 无专门按键 |
| **Blur 提交** | 是（150ms 防抖） | 否 |

### 2.4 编辑界面

双击后，原 `<div class="doc-line">` 被清空，替换为 `<textarea class="doc-line-editor">`：

- 通过 `getComputedStyle()` 复制原段落的 `fontSize/lineHeight/fontFamily/padding/textAlign` 等样式
- 自动高度：随输入内容自适应行高
- CSS 边框高亮（`2px solid var(--accent-color)`）

### 2.5 标题编辑的特殊链路

编辑 heading/title 时触发：
```
commitEdit()
  → item.text = newText
  → item.display = newText
  → item.cleanText = newText
  → applyNumberingStyle()      # 重建章节编号
  → buildChapters()            # 重建章节索引
  → generateTOC()              # 重建大纲面板
  → renderCurrentChapter()     # 整章重渲染
  → saveDocument()             # 持久化
```

### 2.6 普通段落编辑的轻量链路

```
commitEdit()
  → item.text = newText
  → updateDocLineElement()     # 原位替换 DOM，保持滚动位置
  → saveDocument()
```

### 2.7 空段落自动删除

普通段落编辑后内容为空（`trim() === ''`）：
```
→ items.splice(index, 1)       # 删除该 item
→ remapIndices(index, -1)      # 同步所有索引
→ buildChapters()              # 重建章节
→ renderCurrentChapter()       # 整章重渲染
→ saveDocument()
```

---

## 三、查找替换

### 3.1 入口

- 工具栏搜索按钮 🔍 或 `Ctrl+F`
- 切换至**替换模式**（界面下方）

### 3.2 搜索范围

| 范围 | 说明 |
|------|------|
| **当前页** | 分页后的当前可见页面 |
| **当前章** | 当前章节的所有 items |
| **全文** | 整个 `document.items` |

### 3.3 正则模式

勾选"使用正则"后，查找框支持完整 JavaScript RegExp 语法：

| 元字符 | 含义 |
|--------|------|
| `.` | 任意字符（除换行） |
| `\d` | 数字 |
| `\s` | 空白字符 |
| `\w` | 单词字符 |
| `^` `$` | 行首/行尾 |
| `*` `+` `?` | 0次/1次+/0或1次 |
| `()` | 捕获组 |
| `[^...]` | 排除字符类 |
| `\|` | 或 |

**标志**：默认 `g`（全局）+ `i`（忽略大小写，勾选时）

### 3.4 查找逻辑

```js
_findReplaceMatches(scope, query, { ignoreCase, useRegex })
  → 构建 RegExp
  → 遍历范围内 items
  → regex.exec(item.text) 逐条匹配
  → 返回 match 数组（含捕获组）
```

### 3.5 替换执行逻辑

#### 单个替换（replaceCurrentMatch）

```
1. 执行 _doReplaceAtMatch()
2. 若拆分：移除所有同 globalIndex 的 match
3. 若普通：调整同 item 后续 match 的 offset
4. 移除当前 match
5. 刷新预览 + 高亮下一个
```

#### 全部替换（replaceAllMatches）

```
1. 按 globalIndex 分组
2. 组内按 offset 从大到小排序
3. 按 globalIndex 从大到小遍历各组
   （防止拆分影响未处理 item 的索引）
4. 对每组：逐个替换 → 检查是否含 \n → 决定是否拆分
5. 重建 chapters + 渲染
6. saveDocument + 清空状态
```

### 3.6 替换与渲染策略

| 场景 | 渲染方式 | 原因 |
|------|---------|------|
| 普通段落单个替换 | `updateDocLineElement()` | 原位更新，保持滚动位置 |
| 标题单个替换 | `applyNumberingStyle()` | 重建编号 + TOC |
| 普通段落全部替换（无拆分） | `updateDocLineElement()` 逐个 | 最小化重绘 |
| 任何替换导致拆分 | `renderCurrentChapter()` | 索引全局变化，必须整章重建 |
| 标题全部替换 | `applyNumberingStyle()` | 重建章节结构 |

---

## 四、捕获组引用

> 新增功能。在替换框中使用 `$n` 引用正则捕获组的内容。

### 4.1 支持的语法

| 语法 | 含义 | 示例 |
|------|------|------|
| `$1` ~ `$99` | 第 n 个捕获组 | `(\w+) says: (\w+)` → `$1 said "$2"` |
| `$&` | 完整匹配文本 | `foo` → `[$&]` 得 `[foo]` |
| `$$` | 字面量 `$` | `$$1` 得 `$1` |

### 4.2 使用前提

1. **必须勾选"使用正则"**
2. 查找框中必须有 `()` 捕获组
3. 若正则无捕获组，`$1` 等会**原样保留**（不会报错）

### 4.3 使用步骤

**步骤 1：写正则，定义捕获组**
```
查找："([^"]+)"
      │ └─ 第1组：引号内的所有内容
      └─ 字面量双引号
```

**步骤 2：写替换，引用捕获组**
```
替换为：「$1」
```

**步骤 3：执行替换**
```
原文："你好，今天天气不错"
结果：「你好，今天天气不错」
```

### 4.4 预览中的显示

替换预览面板会**实时解析 `$n`**，显示最终替换结果，不是原始 `$1` 字符串。

---

## 五、换行拆分

> 新增功能。替换结果含换行符 `\n` 时，自动将目标 item 拆分为多个 items。

### 5.1 两种触发方式

| 方式 | 操作 | 结果 |
|------|------|------|
| **就地编辑** | `Shift+Enter` 插入换行 → `Enter` 提交 | `commitSplitEdit()` 自动拆分 |
| **查找替换** | 替换结果包含 `\n` | `_splitItem()` 自动拆分 |

### 5.2 拆分规则

```
原文：{type: "paragraph", text: "第一章 两个朋友\n那一年的夏天来的很早"}

结果：
  item[N]:   {type: "paragraph", text: "第一章 两个朋友"}     ← 保留原 type
  item[N+1]: {type: "paragraph", text: "那一年的夏天来的很早"}  ← 默认 paragraph
```

**规则**：
- 第一行保留原 `type`（如 heading1）
- 其余行自动设为 `paragraph`
- 同步 `display`/`cleanText`/`inlineContent`/`raw`
- 自动 `remapIndices()` 同步所有外部索引
- 自动重建章节

### 5.3 全部替换中的拆分安全策略

```
按 globalIndex 从大到小处理
  → 当前 item 替换后含 \n → splice 拆分
  → remapIndices(globalIndex+1, delta)
  → 后续未处理 item 的索引已自动迁移
```

**为什么从大到小？** 若先处理小索引，拆分会新增 items，后续 item 的 globalIndex 全部后移，导致匹配错位。

---

## 六、常用场景速查

### 场景 1：直引号 → 弯引号（最常见）

**目标**：把 `"你好"` 变成 `"你好"`

```
查找（正则开）："([^"]+)"
替换为："$1"
范围：全文

原文：张三说："今天天气不错。"
结果：张三说："今天天气不错。"
```

**进阶**：如果文本中混有单引号 `'...'` 也要改：
```
查找（正则开）：'([^']+)'
替换为：'$1'
```

---

### 场景 2：书名加书名号

**目标**：把 `《三体》` 统一格式，或给无书名号的加书名号

```
# 统一已有书名号中的空格
查找（正则开）：《\s*([^》]+?)\s*》
替换为：《$1》

原文：《 三体 》
结果：《三体》
```

---

### 场景 3：作者叙述与对话分行

**目标**：把 `张三说："今天天气不错。"他笑了笑。` 拆成三行

```
查找（正则开）：([^"：]+)："([^"]+)"(.+)
替换为：$1：\n"$2"\n$3
范围：全文

原文：张三说："今天天气不错。"他笑了笑。
结果（3个items）：
  张三说：
  "今天天气不错。"
  他笑了笑。
```

---

### 场景 4：去除多余空格

```
查找（正则开）：\s{2,}
替换为：（一个空格，或留空）

# 或更精确：去除段首空格
查找（正则开）：^\s+
替换为：（留空）
```

---

### 场景 5：去除空行

```
查找（正则开）：^\s*$
替换为：（留空）
范围：全文

⚠️ 注意：查找替换的"替换为空"不会自动删除 item（就地编辑会）。
若要彻底删除空段落，建议双击进入就地编辑，清空后按 Enter 提交。
```

---

### 场景 6：段落统一缩进

```
查找（正则开）：^\n?（或直接查找 ^）
替换为：　　（两个全角空格）
范围：当前章
```

---

### 场景 7：人名+空格+对话 拆分为标题+正文

```
原文（一个item）："第一章 两个朋友    那一年的夏天来的很早"

查找（正则开）：(.+?)\s{2,}(.+)
替换为：$1\n$2
范围：当前章

结果（2个items）：
  第一章 两个朋友
  那一年的夏天来的很早

⚠️ 第一行保留原type，若原文是paragraph，拆分后仍是paragraph，
   需要手动就地编辑第一行，把 type 改为 heading1
```

---

### 场景 8：批量去除转义字符

```
查找（正则开）：\\(.)          # 匹配反斜杠+任意字符
替换为：$1                    # 只保留后面的字符

原文：\"你好\"
结果："你好"
```

---

### 场景 9：数字加千分位

```
查找（正则开）：(\d)(?=(\d{3})+$)
替换为：$1,

原文：1234567
结果：1,234,567

⚠️ 此正则要求数字在行尾，若数字在中间需调整
```

---

## 七、技术实现详解

### 7.1 数据模型

```js
// 单源真值
document: {
  items: [
    { type: 'heading1', level: 1, text: '第一章', display: '第一章', cleanText: '第一章' },
    { type: 'paragraph', text: '正文内容', display: '正文内容' },
    { type: 'image', data: 'data:image/png;base64,...', alt: '图注' }
  ]
}
```

Chapter 是**切片视图**：
```js
chapters[0] = {
  title: '第一章',
  startIndex: 0,   // 在 document.items 中的起始位置
  endIndex: 25,
  items: [...]     // 引用，不拥有数据
}
```

### 7.2 就地编辑数据流

```
用户双击
  → enterEditMode()
    → 深拷贝 originalItem（用于 Escape 取消时恢复）
    → 创建 textarea，复制样式
  → 用户输入
  → Enter 提交
    → commitEdit()
      → 含\n → commitSplitEdit()
      → 空段落 → splice 删除
      → 正常 → 更新 item.text/display/cleanText/raw/inlineContent
      → heading → applyNumberingStyle() + buildChapters()
      → paragraph → updateDocLineElement()
    → saveDocument() → DB.adapter.saveFile()
  → Escape 取消
    → cancelEdit() → 恢复 originalItem
```

### 7.3 查找替换数据流

```
用户输入查找词
  → _findReplaceMatches()
    → 构建 RegExp（useRegex ? 原样 : 转义）
    → regex.exec() 遍历
    → 返回 matches[]（含 groups 捕获组）

用户点击替换
  → _doReplaceAtMatch()
    → _resolveReplacement() 解析 $1/$&
    → 拼接 newText
    → 含\n → _splitItem() + remapIndices()
    → 无\n → 正常更新 + updateDocLineElement()
    → saveDocument()

用户点击全部替换
  → replaceAllMatches()
    → 按 globalIndex 分组
    → 组内 offset 从大到小
    → 遍历组（globalIndex 从大到小）
      → 逐个替换（每条 match 独立 _resolveReplacement）
      → 检查\n，决定是否拆分
    → buildChapters()
    → hasHeading ? applyNumberingStyle() : updateDocLineElement()
    → hasSplit ? renderCurrentChapter()
    → saveDocument()
```

### 7.4 索引同步 remapIndices

当 items 数组发生插入/删除时，统一同步 8 类索引：

```js
remapIndices(startIndex, delta, options) {
  // 1. Annotations      批注/书签的行索引
  // 2. Chapters         章节 startIndex/endIndex
  // 3. pageRanges       标记为脏，延迟重建
  // 4. Search           清空匹配结果
  // 5. HeatMap          热力图章节索引
  // 6. lastScrollIndex  阅读进度
  // 7. TTS              朗读位置
  // 8. Converter Cache  简繁转换行级缓存
}
```

### 7.5 简繁转换缓存陷阱

`converter.js:getConvertedText(item, index)` 以 `index` 为 key 缓存转换结果。**编辑/替换后必须清除缓存**，否则渲染时显示旧文本。

已在 `editor.js` 修复：
- `commitEdit` 单行编辑：`itemCache.delete(index)`
- `remapIndices` 索引迁移：`itemCache.clear()`

### 7.6 渲染策略对比

| 函数 | 适用场景 | 性能 | 副作用 |
|------|---------|------|--------|
| `updateDocLineElement()` | 单条 item 文本变更 | 最优（只换 1 个 DOM） | 保持滚动位置 |
| `renderCurrentChapter()` | 章节结构变化、索引变化 | 中等（重建当前页 DOM） | 滚动位置重置 |
| `applyNumberingStyle()` | 标题变更 | 中等（遍历所有 items） | 重建 TOC |

---

## 八、已知限制

| 限制 | 说明 | Workaround |
|------|------|------------|
| **无全局 Undo** | 提交/替换后无法撤销 | 编辑中可 Escape 取消；操作前确认 |
| **替换为空不删 item** | 查找替换清空文本不会删除段落 | 就地编辑清空后自动删除 |
| **拆分后 type 固定** | 拆分后的行默认都是 paragraph | 手动就地编辑调整 type |
| **list/image 不可编辑** | 列表项和图片不支持就地编辑 | 无 |
| **无命名捕获组** | 不支持 `(?<name>...)` + `$<name>` | 使用数字 `$1` `$2` |
| **替换预览 50 条上限** | 超过 50 条只显示前 50 条 | 分批替换或缩小范围 |
| **正则空匹配防护** | 若 `match[0].length === 0` 自动 `lastIndex++` | 无需处理 |

---

## 附录：快速参考卡

### 就地编辑
```
双击段落 → 编辑
  Enter          提交
  Shift+Enter    插入换行（提交后自动拆分）
  Escape         取消，恢复原状
```

### 查找替换
```
Ctrl+F → 切换替换模式
  范围：页 / 章 / 全文
  勾选"正则"支持 JS RegExp
  替换含 \n 时自动拆分 item
  $1~$99 / $& / $$ 捕获组引用
```

### 最常用的 5 个正则
```
"([^"]+)"              # 成对双引号及内容
'([^']+)'              # 成对单引号及内容
《\s*([^》]+?)\s*》    # 书名号及内容（去空格）
\s{2,}                 # 两个及以上连续空格
^\s+$                  # 空行（或仅空白）
```

### 最常用的 3 个替换模板
```
查找："([^"]+)"
替换："$1"
效果：直引号 → 弯引号

查找：《\s*([^》]+?)\s*》
替换：《$1》
效果：书名号去空格

查找：(.+?)\s{2,}(.+)
替换：$1\n$2
效果：多空格处分段
```
