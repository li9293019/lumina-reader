# 文章内容编辑功能 — 详细实现计划

> **状态**：待评审  
> **基于代码审查**：`renderer.js`、`db-helpers.js`、`parser.js/chapter.js`、`annotations.js`、`search.js`、`init.js`（HeatMap）、`actions.js`、`data-manager.js`（saveHistory）

---

## 0. 核心约束（决定架构）

| 约束 | 影响 |
|------|------|
| `renderer.js` **只有全页重建**（`renderCurrentChapter` 每次 `innerHTML = ''`） | 就地编辑若要不闪烁，必须新增 `updateDocLineElement()` 原位替换 DOM；否则接受当前页轻量重建 |
| **全局索引 `data-index`** 是唯一纽带 | 所有插入/删除必须通过 `remapIndices(startIndex, delta)` 同步 annotations、chapters、ranges、search、heatMap、TTS 等 |
| `applyNumberingStyle()` 会**重建 chapters + 全页渲染** | 标题编辑后可直接复用，无需手写章节重建 |
| 存储为**"快照覆盖"**策略 | 编辑后的 `document.items` 作为 `content` 字段全量写入，`mergeFileData` 保护阅读进度和批注 |
| Web SQLite 模式已**内置缓存双写** | 编辑保存只需调用 `StorageAdapter.saveFile`，无需额外处理二级缓存 |
| **分页延迟重建**已存在 | `pageRanges` 在 `renderCurrentChapter` 中懒加载；编辑后标记 `paginationDirty = true` 即可 |

---

## 1. 阶段一：索引迁移基础设施 `remapIndices()`

**目标**：建立所有编辑操作的底层索引同步机制。这是后续一切的前提。

**新增文件**：`app/www/js/modules/editor.js`
**修改文件**：`app/www/index.html`（引入模块）

### 1.1 函数签名

```javascript
Lumina.Editor = {
    /**
     * 全局索引迁移：在 document.items 数组发生插入/删除后，同步所有外部索引引用
     * @param {number} startIndex - 变更起始的全局索引
     * @param {number} delta - 索引偏移量（插入为正，删除为负）
     * @param {Object} options - 可选配置
     *   @param {boolean} options.invalidateSearch - 是否清空搜索结果（默认 true）
     *   @param {boolean} options.invalidateHeatMap - 是否清空热力图缓存（默认 true）
     */
    remapIndices(startIndex, delta, options = {}) {}
};
```

### 1.2 同步范围与具体逻辑

```
┌─────────────────────┬────────────────────────────────────────────────────────────┐
│ 数据对象            │ 迁移规则                                                   │
├─────────────────────┼────────────────────────────────────────────────────────────┤
│ annotations[]       │ lineIndex / startLine / endLine: 若 >= startIndex, 则 +delta│
│                     │ 若删除导致某行不存在，删除该 annotation（边界处理）          │
├─────────────────────┼────────────────────────────────────────────────────────────┤
│ chapters[]          │ startIndex / endIndex: 若 >= startIndex, 则 +delta          │
│                     │ 同时 chapters.forEach 重新计算 endIndex = startIndex + items.length - 1 │
├─────────────────────┼────────────────────────────────────────────────────────────┤
│ pageRanges[]        │ 当前章节的 pageRanges 直接置 null（延迟重建）               │
│                     │ 其他章节的 pageRanges 不受影响（是局部索引）                │
├─────────────────────┼────────────────────────────────────────────────────────────┤
│ search.matches[]    │ 直接清空（matches = []），不尝试映射                        │
│ search.highlightedIndex│ 置 -1                                                   │
├─────────────────────┼────────────────────────────────────────────────────────────┤
│ heatMap.chapters[].index│ 若 >= startIndex, 则 +delta                            │
│                     │ 不存在的索引项忽略                                         │
├─────────────────────┼────────────────────────────────────────────────────────────┤
│ currentFile.lastScrollIndex│ 若 >= startIndex, 则 +delta                        │
├─────────────────────┼────────────────────────────────────────────────────────────┤
│ TTS.manager.currentItemIndex│ 若 >= startIndex, 则 +delta; 若 TTS 正在播放则暂停  │
└─────────────────────┴────────────────────────────────────────────────────────────┘
```

### 1.3 关键代码（伪代码）

```javascript
remapIndices(startIndex, delta, options = {}) {
    const state = Lumina.State.app;
    const { invalidateSearch = true, invalidateHeatMap = true } = options;

    // 1. Annotations
    if (state.annotations?.length) {
        state.annotations.forEach(anno => {
            if (anno.lineIndex !== undefined && anno.lineIndex >= startIndex) {
                anno.lineIndex += delta;
            }
            if (anno.startLine !== undefined && anno.startLine >= startIndex) {
                anno.startLine += delta;
            }
            if (anno.endLine !== undefined && anno.endLine >= startIndex) {
                anno.endLine += delta;
            }
        });
        // 删除越界 annotation（索引变为负数或超过 items 长度）
        const maxIndex = state.document.items.length - 1;
        state.annotations = state.annotations.filter(a => {
            const idx = a.lineIndex ?? a.startLine;
            return idx >= 0 && idx <= maxIndex;
        });
    }

    // 2. Chapters
    if (state.chapters?.length) {
        state.chapters.forEach(ch => {
            if (ch.startIndex >= startIndex) ch.startIndex += delta;
            if (ch.endIndex >= startIndex) ch.endIndex += delta;
            // 重新校正 endIndex（基于 items 长度）
            ch.endIndex = ch.startIndex + ch.items.length - 1;
        });
    }

    // 3. 当前章节 pageRanges 标记为脏（延迟重建）
    const currentChapter = state.chapters[state.currentChapterIndex];
    if (currentChapter) currentChapter.pageRanges = null;

    // 4. Search
    if (invalidateSearch && state.search) {
        state.search.matches = [];
        state.search.highlightedIndex = -1;
        state.search.currentQuery = '';
        Lumina.Search.documentResults = [];
    }

    // 5. HeatMap
    if (invalidateHeatMap && state.currentFile?.heatMap?.chapters) {
        state.currentFile.heatMap.chapters.forEach(h => {
            if (h.index >= startIndex) h.index += delta;
        });
        // 删除越界
        const maxIdx = state.document.items.length - 1;
        state.currentFile.heatMap.chapters = state.currentFile.heatMap.chapters.filter(h => h.index >= 0 && h.index <= maxIdx);
    }

    // 6. 阅读进度
    if (state.currentFile?.lastScrollIndex >= startIndex) {
        state.currentFile.lastScrollIndex += delta;
    }

    // 7. TTS
    if (Lumina.TTS?.manager?.currentItemIndex >= startIndex) {
        Lumina.TTS.manager.currentItemIndex += delta;
        if (Lumina.TTS.manager.isPlaying) {
            Lumina.TTS.manager.pause();
        }
    }
}
```

### 1.4 边界情况

- **delta = 0**：直接返回，无操作。
- **批量操作**：在批量替换（replaceAll）时，每次替换后 startIndex 会变化，需要从后向前处理，或每次调用后更新 startIndex。
- **删除导致章节为空**：若删除后某 chapter.items 为空，该 chapter 仍保留（结构稳定优先），但 `endIndex = startIndex - 1`。

---

## 2. 阶段二：就地编辑（Edit-on-place）

**目标**：双击/长按行进入编辑模式，支持改字、段落分割（回车）、标题编辑。

**新增文件**：`app/www/js/modules/editor.js`（与 remapIndices 同文件）
**修改文件**：
- `app/www/js/modules/renderer.js`（新增 `updateDocLineElement`）
- `app/www/js/modules/ui.js`（绑定双击/长按事件）
- `app/www/css/components.css`（编辑框样式）

### 2.1 renderer.js 新增：单行原位刷新

```javascript
/**
 * 原位更新单个 doc-line 元素，不触发全页重建
 * 用于纯文本编辑后保持滚动位置、避免闪烁
 */
Lumina.Renderer.updateDocLineElement = (index, item) => {
    const oldEl = document.querySelector(`.doc-line[data-index="${index}"]`);
    if (!oldEl) return false;

    const newEl = Lumina.Renderer.createDocLineElement(item, index);
    oldEl.parentNode.replaceChild(newEl, oldEl);

    // 重新应用 linkify（URL 自动链接化）
    if (Lumina.Utils?.linkifyContent && item.type !== 'image') {
        Lumina.Utils.linkifyContent(newEl);
    }

    // 重新渲染该行的批注高亮
    const chapterIndex = Lumina.State.app.currentChapterIndex;
    const chapterAnnotations = Lumina.State.app.annotations.filter(
        a => a.chapterIndex === chapterIndex && (a.lineIndex === index || a.startLine === index)
    );
    chapterAnnotations.forEach(anno => {
        if (anno.type === 'bookmark') {
            Lumina.Annotations.renderBookmark(anno);
        } else {
            Lumina.Annotations.renderAnnotationHighlight(anno);
        }
    });

    return true;
};
```

> **决策说明**：新增此函数比整页重建更优，原因：
> 1. 保持滚动位置（无需 `getCurrentVisibleIndex()` 恢复）
> 2. 无闪烁（不触发 `innerHTML = ''`）
> 3. 批注重绘范围最小化（仅当前行）
> 4. 复杂度可控（50 行以内）

### 2.2 editor.js 核心编辑操作

```javascript
Lumina.Editor = {
    // ... remapIndices 见阶段一 ...

    /** 编辑状态 */
    activeEdit: null, // { index, originalText, originalItem }

    /**
     * 进入就地编辑模式
     * @param {number} index - 全局索引
     * @param {HTMLElement} lineEl - 当前行 DOM 元素（可选）
     */
    enterEditMode(index, lineEl = null) {
        const state = Lumina.State.app;
        const item = state.document.items[index];
        if (!item || item.type === 'image') return; // 图片不支持编辑

        // 若 TTS 正在播放，暂停
        if (Lumina.TTS?.manager?.isPlaying) {
            Lumina.TTS.manager.pause();
        }

        const el = lineEl || document.querySelector(`.doc-line[data-index="${index}"]`);
        if (!el) return;

        // 保存原始状态用于取消回滚
        this.activeEdit = {
            index,
            originalText: item.text,
            originalItem: JSON.parse(JSON.stringify(item)), // 深拷贝
            el
        };

        // 预填充文本：标题用 cleanText（无编号前缀），正文用 text
        const initialText = item.cleanText !== undefined ? item.cleanText : item.text;

        // 创建编辑框
        const textarea = document.createElement('textarea');
        textarea.className = 'doc-line-editor';
        textarea.value = initialText;
        textarea.rows = 1;
        // 自动高度
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';

        el.innerHTML = '';
        el.classList.add('editing');
        el.appendChild(textarea);
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        // 绑定事件
        this.bindEditEvents(textarea, index, item);
    },

    bindEditEvents(textarea, index, item) {
        const commit = async () => {
            const newText = textarea.value;
            if (newText !== this.activeEdit.originalText) {
                await this.commitEdit(index, newText);
            } else {
                this.cancelEdit();
            }
        };

        const cancel = () => this.cancelEdit();

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                // 光标位置分割
                const cursorPos = textarea.selectionStart;
                if (cursorPos < textarea.value.length) {
                    // 在光标处分割段落
                    this.splitLineAtCursor(index, textarea.value, cursorPos);
                } else {
                    commit();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });

        textarea.addEventListener('blur', () => {
            // 延迟处理，让 click 事件先完成
            setTimeout(() => {
                if (this.activeEdit) commit();
            }, 200);
        });

        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        });
    },

    /**
     * 提交编辑（无分割）
     */
    async commitEdit(index, newText) {
        const state = Lumina.State.app;
        const item = state.document.items[index];

        // 1. 更新数据
        item.text = newText;
        if (item.cleanText !== undefined) item.cleanText = newText;

        // 2. Markdown inlineContent 重建
        if (item.inlineContent && Lumina.Plugin?.Markdown?.Parser?.parseInline) {
            item.inlineContent = Lumina.Plugin.Markdown.Parser.parseInline(newText);
        }
        // raw 字段更新（如果存在）
        if (item.raw !== undefined) item.raw = newText;

        // 3. 标题特殊处理：重新编号
        const isHeading = item.type && (item.type.startsWith('heading') || item.type === 'title');
        if (isHeading) {
            Lumina.Parser.applyNumberingStyle(); // 这会重建 chapters + TOC + 全页渲染
        } else {
            // 普通段落：原位更新 DOM
            Lumina.Renderer.updateDocLineElement(index, item);
        }

        // 4. 保存到存储
        await this.saveDocument();

        // 5. 清理状态
        this.activeEdit = null;
    },

    /**
     * 在光标处分割段落
     */
    async splitLineAtCursor(index, fullText, cursorPos) {
        const state = Lumina.State.app;
        const item = state.document.items[index];

        const beforeText = fullText.substring(0, cursorPos).trimEnd();
        const afterText = fullText.substring(cursorPos).trimStart();

        // 更新当前行
        item.text = beforeText;
        if (item.cleanText !== undefined) item.cleanText = beforeText;

        // 创建新行（继承 type）
        const newItem = {
            type: item.type,
            text: afterText,
            ...(item.cleanText !== undefined && { cleanText: afterText }),
            ...(item.inlineContent !== undefined && {
                inlineContent: Lumina.Plugin?.Markdown?.Parser?.parseInline
                    ? Lumina.Plugin.Markdown.Parser.parseInline(afterText)
                    : item.inlineContent
            }),
            ...(item.raw !== undefined && { raw: afterText })
        };

        // 插入 items 数组
        state.document.items.splice(index + 1, 0, newItem);

        // 索引迁移
        this.remapIndices(index + 1, 1);

        // 重建当前章节数据（因为 items 变了）
        state.chapters = Lumina.Parser.buildChapters(state.document.items);

        // 防止当前章节索引越界
        if (state.currentChapterIndex >= state.chapters.length) {
            state.currentChapterIndex = state.chapters.length - 1;
        }

        // 当前页轻量重建（因为行数变了，原位替换不够）
        Lumina.Renderer.renderCurrentChapter(index);

        // 保存
        await this.saveDocument();

        this.activeEdit = null;
    },

    cancelEdit() {
        if (!this.activeEdit) return;
        const { index, originalItem } = this.activeEdit;
        // 恢复原始 item
        Lumina.State.app.document.items[index] = originalItem;
        // 恢复 DOM
        Lumina.Renderer.updateDocLineElement(index, originalItem);
        this.activeEdit = null;
    },

    /**
     * 保存 document.items 到存储
     */
    async saveDocument() {
        const state = Lumina.State.app;
        const fileKey = state.currentFile?.fileKey;
        if (!fileKey || !state.dbReady || state.currentFile.skipSave) return;

        try {
            const existing = await Lumina.DB.adapter.getFile(fileKey);
            const content = Lumina.State.app.document.items;
            const patch = {
                content: content,
                totalItems: content.length,
                lastReadTime: Lumina.DB.getLocalTimeString()
            };
            // 使用 mergeFileData 保护 annotations/heatMap 等
            const merged = Lumina.DB.mergeFileData(existing, patch);
            await Lumina.DB.adapter.saveFile(fileKey, merged);
        } catch (e) {
            console.warn('[Editor] 保存失败:', e);
            Lumina.UI.showToast(Lumina.I18n.t('saveFailed') || '保存失败');
        }
    }
};
```

### 2.3 UI 事件绑定

在 `ui.js` 的 `setupEventListeners()` 或 `initContentEvents()` 中添加：

```javascript
// 双击进入编辑模式
document.getElementById('contentWrapper').addEventListener('dblclick', (e) => {
    const line = e.target.closest('.doc-line[data-index]');
    if (!line) return;
    const index = parseInt(line.dataset.index);
    Lumina.Editor.enterEditMode(index, line);
});

// 移动端：长按进入编辑模式（与 annotation 长按区分）
// 策略：长按后若无选区则进入编辑模式（annotation 需要选区）
```

### 2.4 CSS 样式（components.css 追加）

```css
.doc-line.editing {
    padding: 0;
    background: var(--bg-secondary);
    border: 2px solid var(--accent-primary);
    border-radius: 4px;
}
.doc-line-editor {
    width: 100%;
    min-height: 1.8em;
    padding: 0.5em 0.75em;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    line-height: inherit;
    resize: none;
    outline: none;
    word-break: break-word;
    white-space: pre-wrap;
}
```

### 2.5 标题编辑的特殊流程

标题（`title`、`heading1-6`）编辑与普通段落不同：

```
用户双击标题行
  → 编辑框预填充 item.cleanText（无"第一章"等前缀）
  → 用户修改后按回车
  → item.text = 新文本, item.cleanText = 新文本
  → 调用 applyNumberingStyle():
      - 重置 sectionCounters
      - 遍历所有 heading 重新生成 display
      - 重建 chapters
      - 重建 TOC
      - 调用 renderCurrentChapter() 全页渲染
  → 保存到存储
```

> 注：标题编辑导致章节结构变化（如把 heading1 改为 paragraph）是**边界外行为**，当前阶段不处理。若用户确实改了 type，按普通段落处理，下次重新解析文件时恢复。

---

## 3. 阶段三：查找替换（Find & Replace）

**目标**：在搜索面板中增加替换能力，支持单个替换和全部替换。

**修改文件**：
- `app/www/js/modules/search.js`
- `app/www/js/modules/editor.js`（复用 commitEdit）
- `app/www/index.html`（搜索面板 UI）

### 3.1 搜索面板 UI 扩展

在现有搜索面板（`aggregateSearch`）中新增替换输入框和按钮：

```html
<!-- 在搜索输入框下方追加 -->
<div class="search-replace-row">
    <input type="text" id="replaceInput" placeholder="替换为..." />
    <button id="replaceOneBtn">替换</button>
    <button id="replaceAllBtn">全部替换</button>
</div>
```

### 3.2 search.js 新增替换逻辑

```javascript
Lumina.Search = {
    // ... 现有代码 ...

    /**
     * 替换指定全局索引处的文本
     * @param {number} globalIndex - 全局索引
     * @param {string} replacement - 替换文本
     * @returns {boolean} 是否成功
     */
    replaceAtIndex(globalIndex, replacement) {
        const state = Lumina.State.app;
        const item = state.document.items[globalIndex];
        if (!item || item.type === 'image') return false;

        // 执行替换（直接替换整行文本，不处理行内部分匹配）
        // 若需要支持行内部分匹配，需传入 query 做 text.replace(query, replacement)
        item.text = replacement;
        if (item.cleanText !== undefined) item.cleanText = replacement;

        // 重建 inlineContent / raw
        if (item.inlineContent && Lumina.Plugin?.Markdown?.Parser?.parseInline) {
            item.inlineContent = Lumina.Plugin.Markdown.Parser.parseInline(replacement);
        }
        if (item.raw !== undefined) item.raw = replacement;

        // 判断是否标题，决定是原位更新还是全页重建
        const isHeading = item.type && (item.type.startsWith('heading') || item.type === 'title');
        if (isHeading) {
            Lumina.Parser.applyNumberingStyle();
        } else {
            Lumina.Renderer.updateDocLineElement(globalIndex, item);
        }

        return true;
    },

    /**
     * 全部替换
     * @param {string} query - 查找文本
     * @param {string} replacement - 替换文本
     * @returns {number} 替换次数
     */
    replaceAll(query, replacement) {
        const state = Lumina.State.app;
        if (!state.document?.items?.length || !query) return 0;

        const lowerQuery = query.toLowerCase();
        let count = 0;
        let hasHeadingChange = false;

        // 【关键】从后向前遍历，避免索引漂移影响后续替换
        for (let i = state.document.items.length - 1; i >= 0; i--) {
            const item = state.document.items[i];
            if (item.type === 'image') continue;
            if (!item.text) continue;

            const lowerText = item.text.toLowerCase();
            if (lowerText.includes(lowerQuery)) {
                // 执行文本替换（大小写敏感按原样，简单实现）
                item.text = item.text.split(query).join(replacement);
                if (item.cleanText !== undefined) {
                    item.cleanText = item.cleanText.split(query).join(replacement);
                }
                if (item.inlineContent && Lumina.Plugin?.Markdown?.Parser?.parseInline) {
                    item.inlineContent = Lumina.Plugin.Markdown.Parser.parseInline(item.text);
                }
                if (item.raw !== undefined) item.raw = item.text;

                if (item.type && (item.type.startsWith('heading') || item.type === 'title')) {
                    hasHeadingChange = true;
                }
                count++;
            }
        }

        if (count > 0) {
            if (hasHeadingChange) {
                Lumina.Parser.applyNumberingStyle();
            } else {
                // 仅刷新当前页（全部替换后搜索缓存已失效）
                Lumina.Renderer.renderCurrentChapter();
            }

            // 清空搜索结果
            state.search.matches = [];
            state.search.highlightedIndex = -1;
            this.documentResults = [];
            this.renderCurrentResults();

            // 保存
            Lumina.Editor.saveDocument();
        }

        return count;
    }
};
```

### 3.3 替换后位置保持策略

- **单个替换**：使用 `updateDocLineElement` 原位更新，滚动位置自然保持。
- **全部替换**：若未涉及标题变化，调用 `renderCurrentChapter()` 重建当前页，利用 `getCurrentVisibleIndex()` 恢复位置（但 search 结果清空后无目标位置，保持当前 scrollTop 即可）。
- **涉及标题变化**：`applyNumberingStyle()` 会全页渲染，章节结构可能变化，此时通过 `currentChapterIndex` + `currentPageIdx` 定位（它们已随 chapters 重建更新）。

---

## 4. 阶段四：集成、测试与边界处理

### 4.1 模块加载顺序

`index.html` 中 `editor.js` 放在 `renderer.js` 之后、`search.js` 之前：

```html
<script src="./js/modules/renderer.js"></script>
<script src="./js/modules/editor.js"></script>   <!-- 新增 -->
<script src="./js/modules/search.js"></script>
```

### 4.2 测试清单

| 测试项 | 预期结果 |
|--------|----------|
| 双击正文段落，修改文字，回车 | 该行文字更新，无页面闪烁，滚动位置不变，批注重绘正确 |
| 双击标题，修改 cleanText，回车 | 所有 heading 编号重新生成，TOC 更新，当前位置保持在编辑行 |
| 编辑段落时光标在中间按回车 | 原行变为前半部分，新行插入后半部分，索引正确，后续批注同步 |
| 删除一行（后续实现） | 该行消失，后续所有 data-index 正确递减，批注/搜索/热力图索引同步 |
| 查找替换：单个替换 | 目标行更新，search 面板高亮跳转到下一个匹配 |
| 查找替换：全部替换 | 所有匹配行更新，search 结果清空，无索引错误 |
| 替换后标题编号变化 | applyNumberingStyle 正确触发，章节结构重建 |
| TTS 播放中编辑 | TTS 自动暂停，编辑完成后不自动恢复 |
| Markdown 文件编辑 | inlineContent 正确重建，表格/列表不受影响 |
| Web SQLite 模式保存 | 主存更新，二级缓存自动同步 |
| 大文件（>10MB）编辑 | 无卡顿，分页延迟重建生效 |

### 4.3 边界处理

| 场景 | 处理策略 |
|------|----------|
| 图片行双击 | 忽略，不进入编辑模式 |
| 空段落（`&nbsp;`）编辑 | 正常处理，编辑后若为空则保留空段落结构 |
| 编辑时翻页/切章 | `blur` 事件自动提交当前编辑 |
| 编辑时打开其他面板（AI、设置） | 同样触发 `blur` 提交 |
| 网络存储模式下保存失败 | 显示 Toast 提示，内存数据已更新，用户可继续阅读 |
| 批量替换导致某 chapter 为空 | chapter 保留，items = []，endIndex = startIndex - 1 |

### 4.4 性能注意事项

- `remapIndices` 中 `annotations` 和 `heatMap.chapters` 的过滤操作是 O(n)，对于万级数据可接受。
- `replaceAll` 从后向前遍历避免索引漂移，单次遍历 O(n)。
- `updateDocLineElement` 的批注重绘仅针对当前行，比 `renderAnnotations()` 全量扫描更高效。
- 全部替换后的 `renderCurrentChapter` 仍是全页重建，但只在必要时触发（标题变化时）。

---

## 5. 文件变更总览

| 文件 | 动作 | 说明 |
|------|------|------|
| `app/www/js/modules/editor.js` | **新建** | remapIndices + 就地编辑核心逻辑 |
| `app/www/js/modules/renderer.js` | **修改** | 新增 `updateDocLineElement(index, item)` |
| `app/www/js/modules/search.js` | **修改** | 新增 `replaceAtIndex`、`replaceAll` |
| `app/www/js/modules/ui.js` | **修改** | 绑定双击/长按进入编辑事件 |
| `app/www/css/components.css` | **修改** | `.doc-line-editor` 样式 |
| `app/www/index.html` | **修改** | 引入 editor.js；搜索面板追加替换 UI |

---

## 6. 风险与回滚策略

| 风险 | 缓解措施 |
|------|----------|
| `remapIndices` 遗漏某处索引引用 | 代码审查 + 单元测试覆盖所有索引字段；添加 `console.assert` 检查索引一致性 |
| `updateDocLineElement` 与插件钩子冲突 | 严格复用 `createDocLineElement`（已含插件钩子），保证一致性 |
| 标题编辑导致章节结构混乱 | 当前版本不处理 type 转换；applyNumberingStyle 仅改 display，不改结构 |
| 存储写入失败导致数据丢失 | 内存数据优先；保存失败仅 Toast 提示，不阻塞阅读；saveHistory 的 mergeFileData 保护字段 |
| 移动端长按与 annotation 长按冲突 | 区分逻辑：有选区 → annotation 菜单；无选区 → 编辑模式 |

---

## 附录：关键数据结构速查

### Annotation 结构
```javascript
{
    id: string,
    type: 'bookmark' | 'annotation',
    chapterIndex: number,   // 章节索引（不随 items 变化）
    lineIndex: number,      // 书签：全局索引
    startLine: number,      // 注释：起始全局索引
    endLine: number,        // 注释：结束全局索引
    color: string,
    note: string,
    selectedText: string
}
```

### Search Match 结构（内存）
```javascript
state.search.matches = [ /* globalIndex 数组 */ ];
state.search.highlightedIndex = number; // 当前高亮全局索引
// documentResults[] 中的 globalIndex 也依赖此
```

### HeatMap 结构
```javascript
state.currentFile.heatMap = {
    keywords: string,
    chapters: [
        { index: number, width: number, opacity: number } // index = TOC data-index
    ]
};
```

### Chapter 结构
```javascript
{
    id: string,
    title: string,
    isPreface: boolean,
    startIndex: number,     // 全局索引
    endIndex: number,       // 全局索引
    items: [],
    pageRanges: null | [{start, end}] // 局部索引，延迟计算
}
```
