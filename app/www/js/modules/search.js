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
            console.error('[Search] 搜索失败:', err);
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
    // 使用 DataManager.currentStats 的内存数据，确保编辑后实时可见
    searchLibrary(query) {
        // 强制从 DataManager 获取最新内存数据
        const files = Lumina.DataManager?.currentStats?.files || [];
        const converter = Lumina.Converter;
        const lowerQuery = query.toLowerCase();
        
        // 准备查询词（双向搜索）
        const searchTerms = [lowerQuery];
        if (converter?.isConverting) {
            const convertedQuery = converter.convert(query).toLowerCase();
            if (convertedQuery !== lowerQuery) {
                searchTerms.push(convertedQuery);
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

    // 文档内搜索
    searchDocument(query) {
        const state = Lumina.State.app;
        const matches = [];

        // 没有打开文档
        if (!state.document?.items?.length) {
            return [];
        }

        // 准备查询词（双向搜索）
        const converter = Lumina.Converter;
        const searchTerms = [query.toLowerCase()];
        
        if (converter?.isConverting) {
            // 用户输入的是 UI 语言，需要转换为书籍语言去搜索原文
            const bookLangQuery = converter.convert(query);
            if (bookLangQuery !== query) {
                searchTerms.push(bookLangQuery.toLowerCase());
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
        const converter = Lumina.Converter;

        document.getElementById('aggregateSearch').innerHTML = matches.map((match, idx) => {
            // 获取显示文本（转换后）
            let text = match.item.text;
            if (converter?.isConverting && text) {
                text = converter.convert(text);
            }
            
            // 高亮用的查询词也需要转换为 UI 语言
            let highlightQuery = query;
            if (converter?.isConverting) {
                highlightQuery = converter.convert(query);
            }
            const lowerHighlightQuery = highlightQuery.toLowerCase();
            
            const matchIndex = text.toLowerCase().indexOf(lowerHighlightQuery);
            const start = Math.max(0, matchIndex - 30);
            const end = Math.min(text.length, highlightQuery.length + 30);
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

        this.bindDocumentResultEvents();
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
                if (window.innerWidth <= 768) {
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
                }, window.innerWidth <= 768 ? 400 : 150);
            });
        });
    },

    // 渲染书库搜索结果
    renderLibraryResults(files, query) {
        const converter = Lumina.Converter;
        
        // 高亮用的查询词需要是 UI 语言
        let highlightQuery = query.toLowerCase();
        if (converter?.isConverting) {
            highlightQuery = converter.convert(query).toLowerCase();
        }

        document.getElementById('aggregateSearch').innerHTML = files.map((file, idx) => {
            const timeAgo = Lumina.Utils.formatTimeAgo(file.lastReadTime);
            const sizeStr = file.estimatedSize ? Lumina.Utils.formatFileSize(file.estimatedSize) : '--';
            
            // 获取显示名称（优先用 title，支持转换）
            let displayName = file.metadata?.title || file.fileName;
            if (converter?.isConverting && displayName) {
                displayName = converter.convert(displayName);
            }
            displayName = Lumina.Utils.escapeHtml(displayName);
            
            // 高亮匹配（使用 UI 语言的查询词）
            const matchIndex = displayName.toLowerCase().indexOf(highlightQuery);
            let highlightedName = displayName;
            if (matchIndex >= 0) {
                const before = displayName.substring(0, matchIndex);
                const match = displayName.substring(matchIndex, matchIndex + highlightQuery.length);
                const after = displayName.substring(matchIndex + highlightQuery.length);
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
                
                if (window.innerWidth <= 768) {
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
