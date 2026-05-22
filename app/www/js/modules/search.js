// ==================== 搜索模块 ====================
// 聚合搜索：文档内搜索 + 书库搜索
// 特性：防抖、元数据搜索

Lumina.Search = {
    // 当前状态
    currentTab: 'document',
    currentQuery: '',
    
    // 搜索结果（内存存储当前搜索）
    documentResults: [],
    libraryResults: [],
    
    // 防抖定时器
    debounceTimer: null,
    baseDelay: 300,  // 基础延迟 300ms
    
    // 加载状态
    isLoading: false,
    loadingTimer: null,

    // 初始化
    init() {
        this.bindTabEvents();
        this.initReplace();
        
        // 初始状态：隐藏选项卡容器
        const tabsContainer = document.getElementById('searchTabs');
        if (tabsContainer) {
            tabsContainer.style.display = 'none';
        }
    },

    // 绑定选项卡事件 - 每次渲染后重新绑定
    bindTabEvents() {
        const tabs = document.getElementById('searchTabs');
        if (!tabs) return;

        // 先移除旧的事件监听
        tabs.onclick = null;
        
        // 直接绑定到容器（事件委托）
        tabs.onclick = (e) => {
            const btn = e.target.closest('.search-tab');
            if (!btn) return;

            const tab = btn.dataset.tab;
            if (tab && tab !== this.currentTab) {
                this.switchTab(tab);
            }
        };
    },

    // 切换搜索标签 - 直接渲染已有结果，不重新搜索
    switchTab(tab) {
        this.currentTab = tab;

        // 更新UI激活状态
        document.querySelectorAll('.search-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // 直接渲染当前标签的结果
        this.renderCurrentResults();
    },

    // 防抖搜索入口
    perform(query) {
        this.currentQuery = query;
        
        clearTimeout(this.debounceTimer);
        
        if (!query) {
            this.clearResults();
            return;
        }

        // 防抖：停止输入 300ms 后执行
        this.debounceTimer = setTimeout(() => {
            this.doSearch(query);
        }, this.baseDelay);
    },

    // 实际搜索 - 同时搜索文档和书库，无缓存
    async doSearch(query) {
        const lowerQuery = query.toLowerCase().trim();
        
        // 延迟显示 Loading（超过 200ms 才显示，避免闪烁）
        this.loadingTimer = setTimeout(() => {
            this.showLoading(true);
        }, 200);

        try {
            // 同时执行两种搜索（都从内存读取，无IO）
            const docResults = this.searchDocument(lowerQuery);
            const libResults = this.searchLibrary(lowerQuery);
            
            // 保存结果
            this.documentResults = docResults;
            this.libraryResults = libResults;
        } catch (err) {
            window.logger?.error('Search', '搜索失败', { error: err.message });
            this.documentResults = [];
            this.libraryResults = [];
        }

        // 清除 Loading 定时器
        clearTimeout(this.loadingTimer);
        this.showLoading(false);

        // 更新计数并决定选项卡显示
        this.updateResultCountsUI();
        this.determineTabVisibility();
        
        // 渲染当前标签的结果
        this.renderCurrentResults();
    },

    // 书库搜索：搜文件名 + 元数据（title/author/tags）
    // 【修改】强制双向搜索，无论是否开启转换
    searchLibrary(query) {
        // 强制从 DataManager 获取最新内存数据
        const files = Lumina.DataManager?.currentStats?.files || [];
        const converter = Lumina.Converter;
        const lowerQuery = query.toLowerCase();
        
        // 【修改】强制双向查询词
        const searchTerms = [lowerQuery];
        
        if (converter?.dictLoaded) {
            // 简→繁
            const s2tQuery = this.convertWithDirection(lowerQuery, 's2t');
            if (s2tQuery !== lowerQuery) searchTerms.push(s2tQuery);
            
            // 繁→简
            const t2sQuery = this.convertWithDirection(lowerQuery, 't2s');
            if (t2sQuery !== lowerQuery && !searchTerms.includes(t2sQuery)) {
                searchTerms.push(t2sQuery);
            }
        }
        
        return files.filter(file => {
            const meta = file.metadata || {};
            
            // 构建可搜索文本
            const searchableParts = [
                file.fileName,
                meta.title,
                meta.author,
                meta.publisher,
                ...(meta.tags || [])
            ].filter(Boolean);  // 过滤空值
            
            const searchableText = searchableParts.join(' ').toLowerCase();
            // 任一查询词匹配即可
            return searchTerms.some(q => searchableText.includes(q));
        });
    },

    // 【新增】强制指定方向转换（不依赖全局 direction）
    convertWithDirection(text, direction) {
        const converter = Lumina.Converter;
        if (!converter?.dictLoaded) return text;
        
        const map = direction === 's2t' ? converter.s2tMap : converter.t2sMap;
        if (!map) return text;
        
        let result = '';
        for (const char of text) {
            result += map[char] || char;
        }
        return result;
    },

    // 文档内搜索
    searchDocument(query) {
        const state = Lumina.State.app;
        const matches = [];

        // 没有打开文档
        if (!state.document?.items?.length) {
            return [];
        }

        // 【修复】强制双向搜索，无论是否开启转换
        const converter = Lumina.Converter;
        const lowerQuery = query.toLowerCase();
        const searchTerms = [lowerQuery];
        
        if (converter?.dictLoaded) {
            // 简→繁
            const s2tQuery = this.convertWithDirection(lowerQuery, 's2t');
            if (s2tQuery !== lowerQuery) searchTerms.push(s2tQuery);
            
            // 繁→简
            const t2sQuery = this.convertWithDirection(lowerQuery, 't2s');
            if (t2sQuery !== lowerQuery && !searchTerms.includes(t2sQuery)) {
                searchTerms.push(t2sQuery);
            }
        }

        // 遍历所有章节
        state.chapters.forEach((chapter, chIdx) => {
            chapter.items.forEach((item, itemIdx) => {
                const itemText = item.text?.toLowerCase() || '';
                // 任一查询词匹配即可
                if (searchTerms.some(q => itemText.includes(q))) {
                    matches.push({
                        item,
                        chapterIndex: chIdx,
                        globalIndex: chapter.startIndex + itemIdx,
                        chapterTitle: chapter.isPreface 
                            ? Lumina.I18n.t('preface') 
                            : chapter.title,
                        // 保存匹配信息用于高亮
                        matchedTerm: searchTerms.find(q => itemText.includes(q))
                    });
                }
            });
        });

        return matches;
    },

    // ==================== 文本替换 ====================

    initReplace() {
        this.replaceState = {
            scope: 'page',
            ignoreCase: true,
            useRegex: false,
            matches: [],
            currentMatchIndex: -1,
            previewDebounceTimer: null
        };
    },

    findMatches(scope, query, options = {}) {
        const { ignoreCase = true, useRegex = false } = options;
        const state = Lumina.State.app;
        const items = state.document?.items;
        if (!items?.length || !query) return [];

        let startIdx = 0, endIdx = items.length;

        // 确定搜索范围
        if (scope === 'page') {
            const chapter = state.chapters[state.currentChapterIndex];
            if (chapter?.pageRanges?.length) {
                const pageIdx = state.currentPageIdx || 0;
                const range = chapter.pageRanges[Math.min(pageIdx, chapter.pageRanges.length - 1)];
                if (range) {
                    startIdx = chapter.startIndex + range.start;
                    endIdx = Math.min(items.length, chapter.startIndex + range.end);
                }
            } else {
                // 无分页时回退到当前章节
                scope = 'chapter';
            }
        }

        if (scope === 'chapter') {
            const chapter = state.chapters[state.currentChapterIndex];
            if (chapter) {
                startIdx = chapter.startIndex;
                endIdx = chapter.endIndex;
            }
        }

        // 构建正则
        let regex;
        try {
            if (useRegex) {
                regex = new RegExp(query, ignoreCase ? 'gi' : 'g');
            } else {
                const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                regex = new RegExp(escaped, ignoreCase ? 'gi' : 'g');
            }
        } catch (e) {
            return { error: 'invalidRegex' };
        }

        const matches = [];
        for (let i = startIdx; i < endIdx && i < items.length; i++) {
            const item = items[i];
            if (!item.text) continue;

            const text = item.text;
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(text)) !== null) {
                matches.push({
                    globalIndex: i,
                    chapterIndex: this._getChapterIndex(i),
                    offset: match.index,
                    length: match[0].length,
                    originalText: match[0],
                    itemText: text,
                    groups: Array.from(match)  // 保存捕获组 [$0, $1, $2, ...]
                });
                if (match[0].length === 0) regex.lastIndex++;
            }
        }

        return matches;
    },

    _getChapterIndex(globalIndex) {
        const chapters = Lumina.State.app.chapters;
        for (let i = chapters.length - 1; i >= 0; i--) {
            if (globalIndex >= chapters[i].startIndex) return i;
        }
        return 0;
    },

    renderReplacePreview(matches, query, replacement) {
        const container = document.getElementById('replacePreviewList');
        const header = document.getElementById('replacePreviewHeader');
        if (!container) return;

        if (!query) {
            if (header) header.textContent = '';
            container.innerHTML = `<div class="search-empty">${Lumina.I18n.t('replacePreviewEmpty')}</div>`;
            return;
        }

        if (!matches || !matches.length) {
            if (header) header.textContent = '';
            container.innerHTML = `<div class="search-empty">${Lumina.I18n.t('replacePreviewNoMatch')}</div>`;
            return;
        }

        // 新查询或替换内容变化时重置显示限制
        if (this._lastPreviewQuery !== query || this._lastPreviewReplacement !== replacement) {
            this._lastPreviewQuery = query;
            this._lastPreviewReplacement = replacement;
            this._replacePreviewLimit = 50;
        }

        const MAX_PREVIEW = this._replacePreviewLimit;
        const displayMatches = matches.slice(0, MAX_PREVIEW);
        const truncated = matches.length > MAX_PREVIEW;

        const t = Lumina.I18n.t;
        if (header) {
            header.textContent = t('replacePreview').replace('{count}', matches.length);
        }

        container.innerHTML = displayMatches.map((match, idx) => {
            const text = match.itemText;
            const before = text.substring(Math.max(0, match.offset - 25), match.offset);
            const after = text.substring(match.offset + match.length, Math.min(text.length, match.offset + match.length + 25));

            const originalContext = Lumina.Utils.escapeHtml(before) +
                `<span class="search-result-match">${Lumina.Utils.escapeHtml(match.originalText)}</span>` +
                Lumina.Utils.escapeHtml(after);

            const resolvedReplacement = this._resolveReplacement(replacement, match);
            const replacedContext = Lumina.Utils.escapeHtml(before) +
                `<span class="search-result-match">${Lumina.Utils.escapeHtml(resolvedReplacement)}</span>` +
                Lumina.Utils.escapeHtml(after);

            const chapter = Lumina.State.app.chapters[match.chapterIndex];
            const chapterTitle = chapter?.isPreface ? t('preface') : (chapter?.title || '');

            return `
                <div class="replace-preview-item" data-index="${idx}" data-global="${match.globalIndex}">
                    <div class="replace-preview-original">${originalContext}</div>
                    <div class="replace-preview-arrow"></div>
                    <div class="replace-preview-result">${replacedContext}</div>
                    <div class="replace-preview-info">
                        <span>${this.getItemTypeLabel(Lumina.State.app.document.items[match.globalIndex]?.type)}</span>
                        <span>${Lumina.Utils.escapeHtml(chapterTitle)}</span>
                    </div>
                </div>
            `;
        }).join('');

        if (truncated) {
            const remaining = matches.length - MAX_PREVIEW;
            container.insertAdjacentHTML('beforeend', `<div class="replace-truncated-hint search-load-more" data-action="load-more-replace">
                ${t('loadMoreResults').replace('{count}', remaining) || `还有 ${remaining} 条，点击加载更多`}
            </div>`);

            const loadMore = container.querySelector('[data-action="load-more-replace"]');
            if (loadMore) {
                loadMore.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._replacePreviewLimit = (this._replacePreviewLimit || 50) + 100;
                    const scrollTop = container.scrollTop;
                    this.renderReplacePreview(matches, query, replacement);
                    requestAnimationFrame(() => {
                        container.scrollTop = scrollTop;
                    });
                });
            }
        }

        // 绑定点击跳转
        container.querySelectorAll('.replace-preview-item').forEach(item => {
            item.addEventListener('click', () => {
                const globalIndex = parseInt(item.dataset.global);
                const chapterIndex = this._getChapterIndex(globalIndex);

                this.clearHighlight();
                Lumina.Actions.navigateToChapter(chapterIndex, globalIndex);

                container.querySelectorAll('.replace-preview-item.active').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
    },

    _highlightMatchInReader(match) {
        const globalIndex = match.globalIndex;
        const chapterIndex = match.chapterIndex;

        this.clearHighlight();
        Lumina.Actions.navigateToChapter(chapterIndex, globalIndex);

        setTimeout(() => {
            const target = Lumina.DOM.contentWrapper.querySelector(`.doc-line[data-index="${globalIndex}"]`);
            if (target) {
                target.classList.add('search-highlight');
                Lumina.State.app.search.highlightedIndex = globalIndex;
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, Lumina.Utils.isMobile() ? 400 : 150);
    },

    findNextMatch() {
        const matches = this.replaceState.matches;
        if (!matches.length) {
            Lumina.UI.showToast(Lumina.I18n.t('replaceNoMore'));
            return;
        }

        this.replaceState.currentMatchIndex++;
        if (this.replaceState.currentMatchIndex >= matches.length) {
            this.replaceState.currentMatchIndex = 0;
            Lumina.UI.showToast(Lumina.I18n.t('replaceCycleBack'));
        }

        this._highlightMatchInReader(matches[this.replaceState.currentMatchIndex]);
    },

    async replaceCurrentMatch() {
        const matches = this.replaceState.matches;
        if (!matches.length) {
            Lumina.UI.showToast(Lumina.I18n.t('replaceNoMore'));
            return;
        }

        const replacement = document.getElementById('replaceWithInput')?.value || '';
        const match = matches[this.replaceState.currentMatchIndex];
        if (!match) return;

        const didSplit = await this._doReplaceAtMatch(match, replacement);

        if (didSplit) {
            // 拆分后原 item 已不存在，移除所有同 globalIndex 的 match
            let removedBeforeCurrent = 0;
            for (let i = matches.length - 1; i >= 0; i--) {
                if (matches[i].globalIndex === match.globalIndex) {
                    matches.splice(i, 1);
                    if (i < this.replaceState.currentMatchIndex) removedBeforeCurrent++;
                }
            }
            this.replaceState.currentMatchIndex -= removedBeforeCurrent;
        } else {
            // 普通替换：调整同 item 后续匹配 offset
            const delta = replacement.length - match.length;
            if (delta !== 0) {
                for (let i = this.replaceState.currentMatchIndex + 1; i < matches.length; i++) {
                    if (matches[i].globalIndex === match.globalIndex) {
                        matches[i].offset += delta;
                    }
                }
            }

            // 移除当前匹配
            const replacedGlobalIndex = match.globalIndex;
            matches.splice(this.replaceState.currentMatchIndex, 1);

            // 更新同 item 中剩余匹配的 itemText，确保预览准确
            const updatedText = Lumina.State.app.document.items[replacedGlobalIndex]?.text;
            if (updatedText !== undefined) {
                for (let i = 0; i < matches.length; i++) {
                    if (matches[i].globalIndex === replacedGlobalIndex) {
                        matches[i].itemText = updatedText;
                    }
                }
            }
        }

        // 刷新预览
        this.renderReplacePreview(matches, document.getElementById('replaceFindInput')?.value || '', replacement);

        // 高亮下一个（当前 index 已指向下一项，因为移除了当前项）
        if (matches.length > 0) {
            if (this.replaceState.currentMatchIndex >= matches.length) {
                this.replaceState.currentMatchIndex = 0;
                Lumina.UI.showToast(Lumina.I18n.t('replaceCycleBack'));
            }
            this._highlightMatchInReader(matches[this.replaceState.currentMatchIndex]);
        } else {
            this.replaceState.currentMatchIndex = -1;
            Lumina.UI.showToast(Lumina.I18n.t('replaceNoMore'));
        }
    },

    /**
     * 解析替换字符串中的捕获组引用
     * 支持：$1~$99 捕获组、$& 完整匹配、$$ 字面量 $
     */
    _resolveReplacement(replacement, match) {
        if (!match.groups || match.groups.length <= 1) return replacement;
        return replacement.replace(/\$(\$|&|(\d{1,2}))/g, (m, p1) => {
            if (p1 === '$') return '$';                    // $$ → $
            if (p1 === '&') return match.originalText;     // $& → 完整匹配
            const idx = parseInt(p1, 10);
            return match.groups[idx] !== undefined ? match.groups[idx] : m;
        });
    },

    /**
     * 将包含换行符的文本拆分为多个 items
     * 第一个 item 保留原 type，其余为 paragraph
     */
    _splitItem(originalItem, text) {
        const lines = text.split('\n').map(s => s.trimEnd());
        while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
        if (lines.length === 0) lines.push('');

        return lines.map((line, i) => ({
            type: i === 0 ? originalItem.type : 'paragraph',
            text: line,
            ...(originalItem.display !== undefined && { display: line }),
            ...(originalItem.cleanText !== undefined && { cleanText: line }),
            ...(originalItem.inlineContent !== undefined && {
                inlineContent: Lumina.Plugin?.Markdown?.Parser?.parseInline
                    ? Lumina.Plugin.Markdown.Parser.parseInline(line)
                    : originalItem.inlineContent
            }),
            ...(originalItem.raw !== undefined && { raw: line })
        }));
    },

    async _doReplaceAtMatch(match, replacement) {
        const state = Lumina.State.app;
        const item = state.document.items[match.globalIndex];
        if (!item) return false;

        const resolved = this._resolveReplacement(replacement, match);
        const newText = item.text.substring(0, match.offset) + resolved + item.text.substring(match.offset + match.length);

        if (newText.includes('\n')) {
            // 拆分模式
            const newItems = this._splitItem(item, newText);
            state.document.items.splice(match.globalIndex, 1, ...newItems);

            const delta = newItems.length - 1;
            if (delta !== 0) {
                Lumina.Editor.remapIndices(match.globalIndex + 1, delta, { invalidateSearch: false });
            }

            state.chapters = Lumina.Parser.buildChapters(state.document.items);
            if (item.type?.startsWith('heading') || item.type === 'title') {
                Lumina.Parser.applyNumberingStyle();
            } else {
                Lumina.Renderer.renderCurrentChapter(match.globalIndex);
            }

            await Lumina.Editor.saveDocument();
            return true;
        }

        // 普通模式
        item.text = newText;
        if (item.display !== undefined) item.display = newText;
        if (item.cleanText !== undefined) item.cleanText = newText;
        if (item.raw !== undefined) item.raw = newText;
        if (item.inlineContent && Lumina.Plugin?.Markdown?.Parser?.parseInline) {
            item.inlineContent = Lumina.Plugin.Markdown.Parser.parseInline(newText);
        }

        const isHeading = item.type?.startsWith('heading') || item.type === 'title';
        if (isHeading) {
            state.chapters = Lumina.Parser.buildChapters(state.document.items);
            Lumina.Parser.applyNumberingStyle();
        } else {
            Lumina.Renderer.updateDocLineElement(match.globalIndex, item);
        }

        await Lumina.Editor.saveDocument();
        return false;
    },

    async replaceAllMatches() {
        const matches = this.replaceState.matches;
        if (!matches.length) {
            Lumina.UI.showToast(Lumina.I18n.t('replaceNoMore'));
            return;
        }

        const replacement = document.getElementById('replaceWithInput')?.value || '';
        const t = Lumina.I18n.t;

        Lumina.UI.showDialog(
            t('replaceConfirmAll').replace('{count}', matches.length),
            'confirm',
            async (confirmed) => {
                if (!confirmed) return;

                // 按 globalIndex 分组，每组内按 offset 从大到小排序
                const groups = new Map();
                for (const match of matches) {
                    if (!groups.has(match.globalIndex)) groups.set(match.globalIndex, []);
                    groups.get(match.globalIndex).push(match);
                }

                let hasHeading = false;
                let hasSplit = false;
                const replacedIndices = new Set();

                // 按 globalIndex 从大到小处理，避免拆分影响未处理 item 的索引
                const sortedEntries = Array.from(groups.entries()).sort((a, b) => b[0] - a[0]);

                for (const [globalIndex, itemMatches] of sortedEntries) {
                    const item = Lumina.State.app.document.items[globalIndex];
                    if (!item?.text) continue;

                    // 从后往前替换，避免 offset 漂移
                    itemMatches.sort((a, b) => b.offset - a.offset);

                    let text = item.text;
                    for (const match of itemMatches) {
                        const resolved = this._resolveReplacement(replacement, match);
                        text = text.substring(0, match.offset) + resolved + text.substring(match.offset + match.length);
                    }

                    if (text.includes('\n')) {
                        // 拆分模式
                        const newItems = this._splitItem(item, text);
                        Lumina.State.app.document.items.splice(globalIndex, 1, ...newItems);
                        const delta = newItems.length - 1;
                        if (delta !== 0) {
                            Lumina.Editor.remapIndices(globalIndex + 1, delta, { invalidateSearch: false });
                        }
                        hasSplit = true;
                        if (item.type?.startsWith('heading') || item.type === 'title') {
                            hasHeading = true;
                        }
                        replacedIndices.add(globalIndex);
                    } else {
                        // 普通模式
                        item.text = text;
                        if (item.display !== undefined) item.display = text;
                        if (item.cleanText !== undefined) item.cleanText = text;
                        if (item.raw !== undefined) item.raw = text;
                        if (item.inlineContent && Lumina.Plugin?.Markdown?.Parser?.parseInline) {
                            item.inlineContent = Lumina.Plugin.Markdown.Parser.parseInline(text);
                        }

                        if (item.type?.startsWith('heading') || item.type === 'title') {
                            hasHeading = true;
                        }
                        replacedIndices.add(globalIndex);
                    }
                }

                const state = Lumina.State.app;
                state.chapters = Lumina.Parser.buildChapters(state.document.items);
                if (hasHeading) Lumina.Parser.applyNumberingStyle();

                if (hasSplit) {
                    // 有拆分，索引已变化，需要整章重渲染
                    Lumina.Renderer.renderCurrentChapter();
                } else {
                    replacedIndices.forEach(idx => {
                        Lumina.Renderer.updateDocLineElement(idx, state.document.items[idx]);
                    });
                }

                await Lumina.Editor.saveDocument();

                Lumina.UI.showToast(t('replaceSuccess').replace('{count}', matches.length));

                // 清空状态
                this.replaceState.matches = [];
                this.replaceState.currentMatchIndex = -1;
                this.renderReplacePreview([], '', '');
            }
        );
    },

    // 显示/隐藏 Loading
    showLoading(show) {
        this.isLoading = show;
        const container = document.getElementById('aggregateSearch');
        if (!container) return;

        // 添加或移除 loading 类
        if (show) {
            container.classList.add('search-loading-active');
        } else {
            container.classList.remove('search-loading-active');
        }
    },

    // 更新UI上的结果计数
    updateResultCountsUI() {
        const docCountEl = document.getElementById('docResultCount');
        const libCountEl = document.getElementById('libResultCount');

        if (docCountEl) docCountEl.textContent = this.documentResults.length;
        if (libCountEl) libCountEl.textContent = this.libraryResults.length;
    },

    // 决定选项卡显示/隐藏 - 只有两种结果都有时才显示选项卡
    determineTabVisibility() {
        const hasDocResults = this.documentResults.length > 0;
        const hasLibResults = this.libraryResults.length > 0;
        const tabsContainer = document.getElementById('searchTabs');

        if (!tabsContainer) return;

        // 关键逻辑：只有一种结果类型时，或都没有结果时，隐藏整个选项卡容器
        const hasOnlyOneType = (hasDocResults && !hasLibResults) || (!hasDocResults && hasLibResults);
        const hasNoResults = !hasDocResults && !hasLibResults;
        
        if (hasOnlyOneType || hasNoResults) {
            // 只有一种结果类型，或都没有结果，隐藏整个选项卡容器
            tabsContainer.style.display = 'none';
            
            // 切换到正确的标签
            if (hasDocResults && this.currentTab === 'library') {
                this.currentTab = 'document';
            } else if (hasLibResults && this.currentTab === 'document') {
                this.currentTab = 'library';
            }
            return;
        }

        // 有两种结果，显示选项卡容器
        tabsContainer.style.display = 'flex';

        // 重新绑定选项卡事件（确保点击有效）
        this.bindTabEvents();
    },

    // 根据当前标签渲染结果
    renderCurrentResults() {
        // 更新选项卡激活状态
        document.querySelectorAll('.search-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === this.currentTab);
        });

        if (this.currentTab === 'library') {
            if (this.libraryResults.length) {
                this.renderLibraryResults(this.libraryResults, this.currentQuery);
            } else {
                this.renderNoResults();
            }
        } else {
            if (this.documentResults.length) {
                this.renderDocumentResults(this.documentResults, this.currentQuery);
            } else {
                this.renderNoResults();
            }
        }
    },

    // 渲染文档搜索结果
    renderDocumentResults(matches, query) {
        // 新查询时重置显示限制
        if (this._lastDocQuery !== query) {
            this._lastDocQuery = query;
            this._docDisplayLimit = 50;
        }

        const converter = Lumina.Converter;
        const MAX_DISPLAY = this._docDisplayLimit;
        const displayMatches = matches.slice(0, MAX_DISPLAY);
        const truncated = matches.length > MAX_DISPLAY;

        const header = document.getElementById('searchResultsHeader');
        if (header) {
            header.textContent = matches.length > 0
                ? Lumina.I18n.t('searchResultsHeader').replace('{count}', matches.length)
                : '';
        }

        let html = displayMatches.map((match, idx) => {
            // 获取显示文本（转换后）
            let text = match.item.text;
            if (converter?.isConverting && text) {
                text = converter.convert(text);
            }
            
            // 【修复】高亮用的查询词：双向准备，确保能匹配不同语言的内容
            let highlightQuery = query.toLowerCase();
            let highlightQueryAlt = null;
            
            if (converter?.dictLoaded) {
                // 准备 UI 语言版本的查询词
                if (converter?.isConverting) {
                    highlightQuery = converter.convert(highlightQuery);
                }
                // 准备另一种字体的查询词（用于未开启转换时的双向高亮）
                const s2t = this.convertWithDirection(query.toLowerCase(), 's2t');
                const t2s = this.convertWithDirection(query.toLowerCase(), 't2s');
                if (s2t !== query.toLowerCase()) highlightQueryAlt = s2t;
                if (t2s !== query.toLowerCase() && t2s !== highlightQueryAlt) highlightQueryAlt = t2s;
            }
            
            // 【修复】高亮匹配：尝试主查询词和备选查询词
            let matchIndex = text.toLowerCase().indexOf(highlightQuery);
            let matchedQuery = highlightQuery;
            
            // 主查询词未匹配，尝试备选查询词
            if (matchIndex < 0 && highlightQueryAlt) {
                matchIndex = text.toLowerCase().indexOf(highlightQueryAlt);
                if (matchIndex >= 0) matchedQuery = highlightQueryAlt;
            }
            
            const lowerHighlightQuery = matchedQuery.toLowerCase();
            const start = Math.max(0, matchIndex - 30);
            const end = Math.min(text.length, matchIndex + matchedQuery.length + 30);
            let context = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
            context = context.replace(new RegExp(`(${Lumina.Utils.escapeRegex(lowerHighlightQuery)})`, 'gi'), '<span class="search-result-match">$1</span>');

            // 章节标题转换
            let chapterTitle = match.chapterTitle;
            if (converter?.isConverting && chapterTitle) {
                chapterTitle = converter.convert(chapterTitle);
            }

            return `
        <div class="search-result-item" data-index="${idx}" data-global="${match.globalIndex}" data-chapter="${match.chapterIndex}">
        <div class="search-result-context">${context}</div>
        <div class="search-result-info">
            <span>${this.getItemTypeLabel(match.item.type)}</span>
            <span>${Lumina.Utils.escapeHtml(chapterTitle)}</span>
        </div>
        </div>
    `;
        }).join('');

        if (truncated) {
            const remaining = matches.length - MAX_DISPLAY;
            html += `<div class="search-truncated-hint search-load-more" data-action="load-more-doc">
                ${Lumina.I18n.t('loadMoreResults').replace('{count}', remaining) || `还有 ${remaining} 条，点击加载更多`}
            </div>`;
        }

        const container = document.getElementById('aggregateSearch');
        container.innerHTML = html;
        this.bindDocumentResultEvents();

        // 绑定"加载更多"
        const loadMore = container.querySelector('[data-action="load-more-doc"]');
        if (loadMore) {
            loadMore.addEventListener('click', (e) => {
                e.stopPropagation();
                this._docDisplayLimit = (this._docDisplayLimit || 50) + 100;
                const scrollTop = container.scrollTop;
                this.renderDocumentResults(matches, query);
                requestAnimationFrame(() => {
                    container.scrollTop = scrollTop;
                });
            });
        }
    },

    // 绑定文档结果点击事件
    bindDocumentResultEvents() {
        document.getElementById('aggregateSearch').querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const globalIndex = parseInt(item.dataset.global);
                const chapterIndex = parseInt(item.dataset.chapter);

                this.clearHighlight();
                Lumina.Actions.navigateToChapter(chapterIndex, globalIndex);

                // 移动端自动关闭搜索面板
                if (Lumina.Utils.isMobile()) {
                    Lumina.DOM.searchPanel.classList.remove('open');
                }

                // 延迟高亮
                setTimeout(() => {
                    const target = Lumina.DOM.contentWrapper.querySelector(`.doc-line[data-index="${globalIndex}"]`);
                    if (target) {
                        target.classList.add('search-highlight');
                        Lumina.State.app.search.highlightedIndex = globalIndex;
                        document.querySelectorAll('.search-result-item.active').forEach(i => i.classList.remove('active'));
                        item.classList.add('active');
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, Lumina.Utils.isMobile() ? 400 : 150);
            });
        });
    },

    // 渲染书库搜索结果
    renderLibraryResults(files, query) {
        const converter = Lumina.Converter;
        
        // 【修复】高亮用的查询词：双向准备，确保能匹配不同语言的书名
        const rawQuery = query.toLowerCase();
        let highlightQuery = rawQuery;
        let highlightQueryAlt = null;  // 备选查询词（另一种字体）
        
        if (converter?.dictLoaded) {
            // 准备 UI 语言版本的查询词
            if (converter?.isConverting) {
                highlightQuery = converter.convert(rawQuery);
            }
            // 准备另一种字体的查询词（用于未开启转换时的双向高亮）
            const s2t = this.convertWithDirection(rawQuery, 's2t');
            const t2s = this.convertWithDirection(rawQuery, 't2s');
            if (s2t !== rawQuery) highlightQueryAlt = s2t;
            if (t2s !== rawQuery && t2s !== highlightQueryAlt) highlightQueryAlt = t2s;
        }
        highlightQuery = highlightQuery.toLowerCase();
        if (highlightQueryAlt) highlightQueryAlt = highlightQueryAlt.toLowerCase();

        document.getElementById('aggregateSearch').innerHTML = files.map((file, idx) => {
            const timeAgo = Lumina.Utils.formatTimeAgo(file.lastReadTime);
            const sizeStr = file.estimatedSize ? Lumina.Utils.formatFileSize(file.estimatedSize) : '--';
            
            // 获取显示名称（优先用 title，支持转换）
            let displayName = file.metadata?.title || file.fileName;
            if (converter?.isConverting && displayName) {
                displayName = converter.convert(displayName);
            }
            displayName = Lumina.Utils.escapeHtml(displayName);
            
            // 【修复】高亮匹配：尝试主查询词和备选查询词
            let matchIndex = displayName.toLowerCase().indexOf(highlightQuery);
            let matchedQuery = highlightQuery;
            
            // 主查询词未匹配，尝试备选查询词
            if (matchIndex < 0 && highlightQueryAlt) {
                matchIndex = displayName.toLowerCase().indexOf(highlightQueryAlt);
                if (matchIndex >= 0) matchedQuery = highlightQueryAlt;
            }
            
            let highlightedName = displayName;
            if (matchIndex >= 0) {
                const before = displayName.substring(0, matchIndex);
                const match = displayName.substring(matchIndex, matchIndex + matchedQuery.length);
                const after = displayName.substring(matchIndex + matchedQuery.length);
                highlightedName = `${before}<span class="search-result-match">${match}</span>${after}`;
            }

            return `
        <div class="search-result-item library-result-item" data-filekey="${file.fileKey}" data-index="${idx}">
            <div class="search-result-context" style="font-weight: 500;">${highlightedName}</div>
            <div class="search-result-info">
                <span>${sizeStr}</span>
                <span>${timeAgo}</span>
            </div>
        </div>
    `;
        }).join('');

        this.bindLibraryResultEvents();
    },

    // 绑定书库结果点击事件
    bindLibraryResultEvents() {
        document.getElementById('aggregateSearch').querySelectorAll('.library-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const fileKey = item.dataset.filekey;
                
                if (Lumina.DataManager && Lumina.DataManager.openFile) {
                    Lumina.DataManager.openFile(fileKey);
                }
                
                if (Lumina.Utils.isMobile()) {
                    Lumina.DOM.searchPanel.classList.remove('open');
                }
            });
        });
    },

    // 渲染空状态
    renderEmpty() {
        const container = document.getElementById('aggregateSearch');
        if (container) {
            container.innerHTML = `<div class="search-empty">${Lumina.I18n.t('searchEmpty')}</div>`;
        }
    },

    // 渲染无结果状态
    renderNoResults() {
        const container = document.getElementById('aggregateSearch');
        if (container) {
            container.innerHTML = `<div class="search-empty">${Lumina.I18n.t('searchNoResults')}</div>`;
        }
    },

    // 获取类型标签（i18n）
    getItemTypeLabel(type) {
        const labels = {
            title: Lumina.I18n.t('title'),
            subtitle: Lumina.I18n.t('subtitle'),
            paragraph: Lumina.I18n.t('paragraph'),
            list: Lumina.I18n.t('list')
        };
        if (type?.startsWith('heading')) return Lumina.I18n.t(type);
        return labels[type] || type;
    },

    // 清除结果
    clearResults() {
        const state = Lumina.State.app;
        state.search.matches = [];
        state.search.currentQuery = '';
        state.search.highlightedIndex = -1;
        this.currentQuery = '';
        this.documentResults = [];
        this.libraryResults = [];

        // 清空计数
        const docCountEl = document.getElementById('docResultCount');
        const libCountEl = document.getElementById('libResultCount');
        if (docCountEl) docCountEl.textContent = '0';
        if (libCountEl) libCountEl.textContent = '0';

        // 隐藏选项卡
        const tabsContainer = document.getElementById('searchTabs');
        if (tabsContainer) {
            tabsContainer.style.display = 'none';
        }

        this.renderEmpty();
        this.clearHighlight();
    },

    // 清除高亮
    clearHighlight() {
        const state = Lumina.State.app;
        if (state.search.highlightedIndex >= 0) {
            const el = Lumina.DOM.contentWrapper.querySelector(`[data-index="${state.search.highlightedIndex}"]`);
            if (el) el.classList.remove('search-highlight');
            state.search.highlightedIndex = -1;
        }
    }
};

// 初始化
if (Lumina.State?.app?.search) {
    Lumina.Search.init();
}
