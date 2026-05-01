// ==================== 文章内容编辑模块 ====================
// 支持就地编辑（双击段落）和查找替换
// PC/App 统一双击触发；点击非编辑区域退出（App端）/ blur退出（PC端）
// 兼容三种存储模式：IndexedDB(files) / Web SQLite(http) / Capacitor SQLite(app)

Lumina.Editor = {
    // 当前编辑状态
    activeEdit: null,

    init() {
        this.bindEvents();
    },

    bindEvents() {
        const contentArea = Lumina.DOM.contentWrapper;
        if (!contentArea) return;

        const isMobile = Lumina.Utils.isMobile();
        const isCapacitor = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
        const isApp = isMobile || isCapacitor;

        // ── PC端：鼠标双击进入编辑 ──
        if (!isApp) {
            contentArea.addEventListener('dblclick', (e) => {
                const line = e.target.closest('.doc-line[data-index]');
                if (!line) return;
                if (Lumina.State.app.ui.isImmersive) return;
                if (e.target.closest('.doc-image')) return;
                const menu = document.getElementById('annotationContextMenu');
                if (menu?.classList.contains('show')) return;

                const index = parseInt(line.dataset.index);
                this.enterEditMode(index, line);
            });
        }

        // ── App端：自行检测 double tap（比浏览器合成的 dblclick 更可靠） ──
        // 记录上一次 tap 的时间和目标元素
        let lastTapTime = 0;
        let lastTapTarget = null;
        const DOUBLE_TAP_INTERVAL = 350; // ms

        if (isApp) {
            contentArea.addEventListener('touchend', (e) => {
                // 如果当前已在编辑中，此 touchend 可能是"点击非编辑区域退出"
                if (this.activeEdit) {
                    const editingEl = this.activeEdit.el;
                    const touchedLine = e.target.closest('.doc-line[data-index]');
                    // 点击的不是当前编辑行 → 提交并退出
                    if (touchedLine !== editingEl) {
                        e.preventDefault();
                        const textarea = this.activeEdit.textarea;
                        if (textarea) {
                            const newText = textarea.value;
                            if (newText !== this.activeEdit.originalText) {
                                this.commitEdit(this.activeEdit.index, newText);
                            } else {
                                this.cancelEdit();
                            }
                        }
                    }
                    return;
                }

                const line = e.target.closest('.doc-line[data-index]');
                if (!line) {
                    lastTapTime = 0;
                    lastTapTarget = null;
                    return;
                }

                const now = Date.now();
                const isDoubleTap = (now - lastTapTime < DOUBLE_TAP_INTERVAL) && (lastTapTarget === line);

                if (isDoubleTap) {
                    // 阻止浏览器生成 click（防止干扰）
                    e.preventDefault();
                    lastTapTime = 0;
                    lastTapTarget = null;

                    if (e.target.closest('.doc-image')) return;
                    const menu = document.getElementById('annotationContextMenu');
                    if (menu?.classList.contains('show')) return;

                    const index = parseInt(line.dataset.index);
                    this.enterEditMode(index, line);
                } else {
                    lastTapTime = now;
                    lastTapTarget = line;
                }
            });
        }
    },

    _getItemByIndex(index) {
        return Lumina.State.app.document.items[index];
    },

    /**
     * 进入就地编辑模式
     */
    _isEditableType(type) {
        if (!type) return true; // 无 type 默认按普通文本处理
        if (type === 'paragraph' || type === 'title') return true;
        if (type.startsWith('heading')) return true;
        return false;
    },

    enterEditMode(index, lineEl = null) {
        const state = Lumina.State.app;
        const item = state.document.items[index];
        if (!item || !this._isEditableType(item.type)) return;

        // TTS 播放中则暂停
        if (Lumina.TTS?.manager?.isPlaying) {
            Lumina.TTS.manager.pause();
        }

        const el = lineEl || document.querySelector(`.doc-line[data-index="${index}"]`);
        if (!el) return;

        this.activeEdit = {
            index,
            originalText: item.text,
            originalItem: JSON.parse(JSON.stringify(item)),
            el,
            textarea: null // 将在创建后赋值
        };

        // 预填充：标题用 cleanText（无编号前缀），正文用 text
        const initialText = item.cleanText !== undefined ? item.cleanText : item.text;

        const textarea = document.createElement('textarea');
        textarea.className = 'doc-line-editor';
        textarea.id = `doc-line-editor-${index}`;
        textarea.name = 'doc-line-editor';
        textarea.value = initialText;
        textarea.rows = 1;
        textarea.setAttribute('autocorrect', 'off');
        textarea.setAttribute('autocomplete', 'off');
        textarea.setAttribute('spellcheck', 'false');

        // 精确复制原 div 的排版样式，确保编辑框和原文视觉一致、尺寸不变
        const computed = window.getComputedStyle(el);
        textarea.style.fontSize = computed.fontSize;
        textarea.style.lineHeight = computed.lineHeight;
        textarea.style.fontFamily = computed.fontFamily;
        textarea.style.fontWeight = computed.fontWeight;
        textarea.style.letterSpacing = computed.letterSpacing;
        textarea.style.textIndent = computed.textIndent;
        textarea.style.textAlign = computed.textAlign;
        textarea.style.padding = computed.padding;
        textarea.style.margin = '0';
        textarea.style.boxSizing = 'border-box';

        el.innerHTML = '';
        el.classList.add('editing');
        el.appendChild(textarea);
        if (this.activeEdit) this.activeEdit.textarea = textarea;

        // 自动高度并聚焦
        requestAnimationFrame(() => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
            textarea.focus();
            const len = textarea.value.length;
            textarea.setSelectionRange(len, len);
        });

        this.bindEditEvents(textarea, index, item);
    },

    bindEditEvents(textarea, index, item) {
        const isHeadingItem = item.type && (item.type.startsWith('heading') || item.type === 'title');

        const commit = async () => {
            if (!this.activeEdit) return;
            const newText = textarea.value;
            if (newText !== this.activeEdit.originalText) {
                await this.commitEdit(index, newText);
            } else if (!isHeadingItem && newText.trim() === '') {
                // 原本就是空段落，提交后仍为空 → 删除该行
                await this.commitEdit(index, newText);
            } else {
                this.cancelEdit();
            }
        };

        const cancel = () => this.cancelEdit();

        const isApp = Lumina.Utils.isMobile() || (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.());

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                if (isApp) {
                    // App 端：不阻止默认行为，Enter 在 textarea 中就是插入换行
                    return;
                }
                // PC 端：Enter = 提交编辑
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
            // PC 端 Shift+Enter 保持默认行为：在 textarea 内插入换行，继续编辑
        });

        // PC端 blur 提交；App端由用户主动操作（回车/取消）
        if (!Lumina.Utils.isMobile() && !(typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.())) {
            textarea.addEventListener('blur', () => {
                setTimeout(() => {
                    const active = document.activeElement;
                    if (active?.classList.contains('doc-line-editor')) return;
                    if (this.activeEdit) commit();
                }, 150);
            });
        }

        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        });
    },

    /**
     * 提交编辑。若文本含换行符，自动拆分为多个段落（items）。
     */
    async commitEdit(index, newText) {
        const state = Lumina.State.app;
        const item = state.document.items[index];
        const isHeading = item.type && (item.type.startsWith('heading') || item.type === 'title');

        // 含换行符 → 自动拆分段落
        if (newText.includes('\n')) {
            await this.commitSplitEdit(index, newText);
            return;
        }

        // 普通段落且内容清空 → 删除该段落
        if (!isHeading && newText.trim() === '') {
            state.document.items.splice(index, 1);
            this.remapIndices(index, -1);
            state.chapters = Lumina.Parser.buildChapters(state.document.items);
            if (state.currentChapterIndex >= state.chapters.length) {
                state.currentChapterIndex = state.chapters.length - 1;
            }
            Lumina.Renderer.renderCurrentChapter(index);
            await this.saveDocument();
            this.activeEdit = null;
            return;
        }

        // 单行编辑（保留或更新）
        item.text = newText;
        if (item.display !== undefined) item.display = newText;
        if (item.cleanText !== undefined) item.cleanText = newText;

        if (item.inlineContent && Lumina.Plugin?.Markdown?.Parser?.parseInline) {
            item.inlineContent = Lumina.Plugin.Markdown.Parser.parseInline(newText);
        }
        if (item.raw !== undefined) item.raw = newText;

        if (isHeading) {
            Lumina.Parser.applyNumberingStyle();
        } else {
            Lumina.Renderer.updateDocLineElement(index, item);
        }

        await this.saveDocument();
        this.activeEdit = null;
    },

    /**
     * 按换行符拆分为多个段落
     */
    async commitSplitEdit(index, newText) {
        const state = Lumina.State.app;
        const originalItem = state.document.items[index];

        // 按 \n 拆分，去掉末尾空字符串，保留中间空行
        const lines = newText.split('\n').map(s => s.trimEnd());
        while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
        if (lines.length === 0) lines.push('');

        // 第一个 item 继承原 type，其余设为普通段落
        const newItems = lines.map((text, i) => ({
            type: i === 0 ? originalItem.type : 'paragraph',
            text,
            ...(originalItem.display !== undefined && { display: text }),
            ...(originalItem.cleanText !== undefined && { cleanText: text }),
            ...(originalItem.inlineContent !== undefined && {
                inlineContent: Lumina.Plugin?.Markdown?.Parser?.parseInline
                    ? Lumina.Plugin.Markdown.Parser.parseInline(text)
                    : originalItem.inlineContent
            }),
            ...(originalItem.raw !== undefined && { raw: text })
        }));

        // 替换原 item
        state.document.items.splice(index, 1, ...newItems);

        // 索引迁移
        const delta = newItems.length - 1;
        if (delta !== 0) this.remapIndices(index + 1, delta);

        // 重建章节
        state.chapters = Lumina.Parser.buildChapters(state.document.items);
        if (state.currentChapterIndex >= state.chapters.length) {
            state.currentChapterIndex = state.chapters.length - 1;
        }

        // 渲染
        if (originalItem.type && (originalItem.type.startsWith('heading') || originalItem.type === 'title')) {
            Lumina.Parser.applyNumberingStyle();
        } else {
            Lumina.Renderer.renderCurrentChapter(index);
        }

        await this.saveDocument();
        this.activeEdit = null;
    },

    /**
     * 在光标处分割段落
     */
    async splitLineAtCursor(index, fullText, cursorPos) {
        const state = Lumina.State.app;
        const item = state.document.items[index];

        const beforeText = fullText.substring(0, cursorPos);
        const afterText = fullText.substring(cursorPos);

        item.text = beforeText;
        if (item.display !== undefined) item.display = beforeText;
        if (item.cleanText !== undefined) item.cleanText = beforeText;

        const newItem = {
            type: item.type,
            text: afterText,
            ...(item.display !== undefined && { display: afterText }),
            ...(item.cleanText !== undefined && { cleanText: afterText }),
            ...(item.inlineContent !== undefined && {
                inlineContent: Lumina.Plugin?.Markdown?.Parser?.parseInline
                    ? Lumina.Plugin.Markdown.Parser.parseInline(afterText)
                    : item.inlineContent
            }),
            ...(item.raw !== undefined && { raw: afterText })
        };

        state.document.items.splice(index + 1, 0, newItem);
        this.remapIndices(index + 1, 1);

        state.chapters = Lumina.Parser.buildChapters(state.document.items);
        if (state.currentChapterIndex >= state.chapters.length) {
            state.currentChapterIndex = state.chapters.length - 1;
        }

        Lumina.Renderer.renderCurrentChapter(index);
        await this.saveDocument();
        this.activeEdit = null;
    },

    /**
     * 取消编辑，恢复原状
     */
    cancelEdit() {
        if (!this.activeEdit) return;
        const { index, originalItem } = this.activeEdit;
        Lumina.State.app.document.items[index] = originalItem;
        Lumina.Renderer.updateDocLineElement(index, originalItem);
        this.activeEdit = null;
    },

    /**
     * 保存 document.items 到存储
     * 统一适配三种存储模式，通过 adapter 自动处理底层差异
     */
    async saveDocument() {
        const state = Lumina.State.app;
        const fileKey = state.currentFile?.fileKey;
        if (!fileKey || !state.dbReady || state.currentFile.skipSave) return;

        try {
            const existing = await Lumina.DB.adapter.getFile(fileKey) || {};
            const content = state.document.items;
            const patch = {
                ...existing,
                content: content,
                totalItems: content.length,
                lastReadTime: Lumina.DB.getLocalTimeString()
            };
            await Lumina.DB.adapter.saveFile(fileKey, patch);
        } catch (e) {
            console.warn('[Editor] 保存失败:', e);
            Lumina.UI.showToast(Lumina.I18n.t('saveFailed') || '保存失败');
        }
    },

    /**
     * 全局索引迁移：插入/删除后同步所有外部索引引用
     * @param {number} startIndex 变更起始全局索引
     * @param {number} delta 偏移量（插入为正，删除为负）
     */
    remapIndices(startIndex, delta, options = {}) {
        if (delta === 0) return;
        const state = Lumina.State.app;
        const { invalidateSearch = true, invalidateHeatMap = true } = options;

        // 1. Annotations
        if (state.annotations?.length) {
            state.annotations.forEach(anno => {
                if (anno.lineIndex !== undefined && anno.lineIndex >= startIndex) anno.lineIndex += delta;
                if (anno.startLine !== undefined && anno.startLine >= startIndex) anno.startLine += delta;
                if (anno.endLine !== undefined && anno.endLine >= startIndex) anno.endLine += delta;
            });
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
            if (Lumina.Search) Lumina.Search.documentResults = [];
        }

        // 5. HeatMap
        if (invalidateHeatMap && state.currentFile?.heatMap?.chapters) {
            state.currentFile.heatMap.chapters.forEach(h => {
                if (h.index >= startIndex) h.index += delta;
            });
            const maxIdx = state.document.items.length - 1;
            state.currentFile.heatMap.chapters = state.currentFile.heatMap.chapters.filter(
                h => h.index >= 0 && h.index <= maxIdx
            );
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
};
