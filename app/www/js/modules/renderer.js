// ==================== 9. 渲染引擎 ====================

Lumina.Renderer.renderCurrentChapter = (targetIndex = null) => {
    Lumina.UI.hideTooltip();
    
    const state = Lumina.State.app;
    const chapter = state.chapters[state.currentChapterIndex];
    
    if (!chapter || !chapter.items) return;
    
    // 确保分页数据存在
    if (!chapter.pageRanges) {
        chapter.pageRanges = Lumina.Pagination.calculateRanges(chapter.items);
    }
    
    const ranges = chapter.pageRanges;
    state.pageRanges = ranges;
    
    let pageIdx = state.currentPageIdx || 0;
    if (targetIndex !== null && targetIndex >= chapter.startIndex && targetIndex <= chapter.endIndex) {
        const relativeIdx = targetIndex - chapter.startIndex;
        pageIdx = Lumina.Pagination.findPageIndex(ranges, relativeIdx);
    }
    
    if (pageIdx < 0) pageIdx = 0;
    if (pageIdx >= ranges.length) pageIdx = ranges.length - 1;
    state.currentPageIdx = pageIdx;
    const range = ranges[pageIdx];
    
    // 1. 先清空（写操作）
    Lumina.DOM.contentWrapper.innerHTML = '';
    
    // 2. 构建片段（批量写，不读取布局）
    const fragment = document.createDocumentFragment();
    for (let i = range.start; i <= range.end; i++) {
        if (i >= chapter.items.length) break;
        const item = chapter.items[i];
        const globalIndex = chapter.startIndex + i;
        const line = Lumina.Renderer.createDocLineElement(item, globalIndex);
        if (state.currentPageIdx > 0 && i === range.start) {
            line.classList.add('page-first-item');
        }
        if (line) fragment.appendChild(line);
    }
    Lumina.DOM.contentWrapper.appendChild(fragment);
    
    // 3. 添加分页导航（仍是写操作）
    Lumina.Renderer.addPaginationNav();
    
    // 4. 其他样式更新（写操作）
    Lumina.Renderer.updateDocumentStyles();
    Lumina.Renderer.updateChapterNavInfo();
    
    // 5. 关键修复：将所有可能触发重排的读操作延迟到下一帧
    requestAnimationFrame(() => {
        // 高亮和滚动（读+写混合操作）
        if (targetIndex !== null) {
            const targetEl = document.querySelector(`.doc-line[data-index="${targetIndex}"]`);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (state.search.highlightedIndex === targetIndex || 
                    Lumina.DOM.aggregateSearch.querySelector('.active')?.dataset.global == targetIndex) {
                    targetEl.classList.add('search-highlight');
                }
            }
        } else {
            Lumina.DOM.contentScroll.scrollTop = 0;
        }
        
        // TTS 高亮恢复
        if (Lumina.TTS.manager?.isPlaying) {
            const currentGlobalIdx = Lumina.TTS.manager.currentItemIndex;
            const relativeIdx = currentGlobalIdx - chapter.startIndex;
            if (relativeIdx >= range.start && relativeIdx <= range.end) {
                Lumina.TTS.manager.highlightCurrent();
            }
        }
        
        // 渲染注释/书签高亮
        Lumina.Annotations.renderAnnotations();
        
        // 预加载下一页的图片（提升翻页体验）
        Lumina.Renderer.preloadNextPageImages(chapter, pageIdx);
    });
};

// 预加载下一页图片
Lumina.Renderer.preloadNextPageImages = (chapter, currentPageIdx) => {
    if (!chapter.pageRanges || currentPageIdx >= chapter.pageRanges.length - 1) return;
    
    const nextRange = chapter.pageRanges[currentPageIdx + 1];
    if (!nextRange) return;
    
    // 收集下一页的图片URL
    const imageUrls = [];
    for (let i = nextRange.start; i <= nextRange.end && i < chapter.items.length; i++) {
        const item = chapter.items[i];
        if (item.type === 'image' && item.data && item.data.length < 500000) { // 只预加载小于500KB的图片
            imageUrls.push(item.data);
        }
    }
    
    // 使用 requestIdleCallback 在浏览器空闲时预加载
    const preloadImages = () => {
        imageUrls.forEach(url => {
            const img = new Image();
            img.src = url;
        });
    };
    
    if ('requestIdleCallback' in window) {
        requestIdleCallback(preloadImages, { timeout: 2000 });
    } else {
        setTimeout(preloadImages, 100);
    }
};

Lumina.Renderer.createDocLineElement = (item, index) => {
    // 【插件钩子】尝试让插件创建元素
    if (Lumina.PluginManager) {
        const hookResult = Lumina.PluginManager.executeHook('createElement', item, index);
        if (hookResult) {
            return hookResult;
        }
    }
    
    const div = document.createElement('div');
    div.className = 'doc-line';
    div.dataset.index = index;

    const typeClass = { title: 'title-display', subtitle: 'subtitle-display', list: 'list-item' }[item.type];
    if (typeClass) div.classList.add(typeClass);
    else if (item.type && item.type.startsWith('heading')) div.classList.add(`chapter-${item.type.replace('heading', '')}`);
    else div.classList.add('paragraph');

    if (item.type === 'image') {
        const img = document.createElement('img');
        // 使用懒加载优化性能
        img.dataset.src = item.data;
        img.className = 'doc-image center lazy-image';
        img.alt = item.alt || '';
        img.loading = 'lazy';
        
        // 设置占位符背景色，避免布局抖动
        img.style.backgroundColor = 'var(--bg-tertiary)';
        img.style.minHeight = '100px';
        
        // 点击放大查看
        img.style.cursor = 'zoom-in';
        img.onclick = () => Lumina.UI.viewImageFull(item.data, item.alt);
        
        // 使用 Intersection Observer 延迟加载
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.onload = () => {
                            img.style.backgroundColor = 'transparent';
                            img.style.minHeight = 'auto';
                        };
                        observer.unobserve(img);
                    }
                });
            }, { rootMargin: '100px' });
            observer.observe(img);
        } else {
            // 不支持 Intersection Observer 的浏览器直接加载
            img.src = img.dataset.src;
        }
        
        div.appendChild(img);
    } else {
        let content = item.display || item.text;
        // 防御：确保 content 是字符串
        if (typeof content !== 'string') content = String(content || '');
        content = Lumina.Renderer.getCleanText(content);
        if (item.isEmpty || (!content.trim() && !Lumina.State.settings.ignoreEmptyLines)) {
            div.innerHTML = '&nbsp;'; // 使用不换行空格确保高度
            div.classList.add('empty-paragraph');
        } else {
            div.textContent = content.trim();
        }
        
        if (div.classList.contains('paragraph') && Lumina.State.settings.indent) {
            div.classList.add('indent');
        }
    }

    return div;
};

Lumina.Renderer.getCleanText = (txt) => {
    // 防御：确保 txt 是字符串
    if (typeof txt !== 'string') return txt || '';
    if (['chap', 'part', 'sect'].some(prefix => txt.toLowerCase().startsWith(prefix))) return txt;
    
    const specialChars = new Set(`!@#$%^&*()_+-=[]{}|;':"\\,./?`);
    
    return Lumina.State.settings.textCleaning ?
        txt.replace(/[\x00-\x7F]{10,}$/gm, match => {
            // 规则1：特殊符号检测
            const uniqueSymbols = new Set([...match].filter(c => specialChars.has(c)));
            const hasManySymbols = uniqueSymbols.size >= 4;
            
            // 规则2：检测4个以上"分散"的空白（不连续）
            // 模式：空白 + 至少一个非空白字符，重复4次
            // 例如："a b c d" 中的空格是分散的
            const scatteredWhitespaces = match.match(/(\s+\S+){3,}\s+/);
            const hasScatteredWhitespaces = scatteredWhitespaces !== null;
            
            // 规则3：或者检测4个以上连续/不连续的空白总数
            const totalWhitespaces = (match.match(/\s/g) || []).length;
            const hasTotalWhitespaces = totalWhitespaces >= 4;
            
            // 满足任一条件即删除
            return (hasManySymbols || hasScatteredWhitespaces || hasTotalWhitespaces) ? '' : match;
        }) : txt;
};

Lumina.Renderer.addPaginationNav = () => {
    const state = Lumina.State.app;
    const chapterIdx = state.currentChapterIndex;
    const chapter = state.chapters[chapterIdx];
    const ranges = state.pageRanges || [{start:0, end:chapter.items.length-1}];

    // 如果禁用分页，不显示分页导航
    if (!Lumina.Config.pagination.enabled) {
        return;
    }

    const current = state.currentPageIdx || 0;
    const total = ranges.length;
    const t = Lumina.I18n.t;
    
    const nav = document.createElement('div');
    nav.className = 'pagination-nav';
    
    const isFirstPage = current === 0;
    const isLastPage = current === total - 1;
    const isFirstChapter = chapterIdx === 0;
    const isLastChapter = chapterIdx === state.chapters.length - 1;
    
    // 左按钮逻辑
    let leftAction, leftTooltip, leftDisabled = false, leftClass = '';
    if (isFirstPage && isFirstChapter) {
        leftDisabled = true;
        leftTooltip = t('atBeginning');
        leftClass = 'disabled';
    } else if (isFirstPage) {
        leftAction = 'Lumina.Actions.goToPrevChapterLastPage()';
        const prevTitle = state.chapters[chapterIdx - 1].title || '';
        leftTooltip = t('prevChapterTooltip', prevTitle);
        leftClass = 'chapter-boundary';
    } else {
        leftAction = 'Lumina.Actions.prevPage()';
        leftTooltip = t('prevPage');
    }
    
    // 右按钮逻辑
    let rightAction, rightTooltip, rightDisabled = false, rightClass = '';
    if (isLastPage && isLastChapter) {
        rightDisabled = true;
        rightTooltip = t('atEnd');
        rightClass = 'disabled';
    } else if (isLastPage) {
        rightAction = 'Lumina.Actions.goToNextChapterFirstPage()';
        const nextTitle = state.chapters[chapterIdx + 1].title || '';
        rightTooltip = t('nextChapterTooltip', nextTitle);
        rightClass = 'chapter-boundary';
    } else {
        rightAction = 'Lumina.Actions.nextPage()';
        rightTooltip = t('nextPage');
    }
    
    // 页码生成
    const pageNumbers = Lumina.Renderer.generatePageNumbers(current, total);

    // 构建HTML
    nav.innerHTML = `
        <button class="pagination-arrow ${leftClass}" 
                onclick="${leftDisabled ? '' : leftAction}"
                data-tooltip="${leftTooltip}"
                aria-label="${leftTooltip}">
            <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>
        
        <div class="pagination-pages">
            ${pageNumbers.map(num => {
                if (num === '...') {
                    return `<span class="pagination-ellipsis">⋯</span>`;
                }
                const isActive = num === current + 1;
                return `<button class="pagination-num ${isActive ? 'active' : ''}" 
                            onclick="Lumina.Actions.goToPage(${num - 1})"
                            data-tooltip="${t('jumpToPage', num)}">${num}</button>`;
            }).join('')}
        </div>
        
        <button class="pagination-arrow ${rightClass}" 
                onclick="${rightDisabled ? '' : rightAction}"
                data-tooltip="${rightTooltip}"
                aria-label="${rightTooltip}">
            <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
    `;
    
    Lumina.DOM.contentWrapper.appendChild(nav);
    Lumina.UI.setupPaginationTooltip?.(nav);
};

// 页码生成逻辑（折叠中间）
Lumina.Renderer.generatePageNumbers = (current, total) => {
    const currentPage = current + 1; // 转为 1-based
    const pages = [];
    
    if (total <= 7) {
        // 全部显示：1 2 3 4 5 6 7
        for (let i = 1; i <= total; i++) pages.push(i);
    } else if (currentPage <= 4) {
        // 当前在前段：1 2 3 4 5 ... 10
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(total);
    } else if (currentPage >= total - 3) {
        // 当前在后段：1 ... 6 7 8 9 10
        pages.push(1);
        pages.push('...');
        for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
        // 当前在中段：1 ... 4 5 6 ... 10
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(total);
    }
    
    return pages;
};

Lumina.Renderer.updateDocumentStyles = () => {
    const firstPara = Lumina.DOM.contentWrapper.querySelector('.doc-line.paragraph');
    if (firstPara && Lumina.State.settings.dropCap) firstPara.classList.add('drop-cap');
};

Lumina.Renderer.generateTOC = () => {
    Lumina.DOM.tocList.innerHTML = '';
    const state = Lumina.State.app;
    
    // 关键优化：使用 DocumentFragment 批量操作
    const fragment = document.createDocumentFragment();

    state.chapters.forEach((chapter, chIdx) => {
        if (chapter.isPreface) {
            const prefaceLi = document.createElement('li');
            prefaceLi.className = 'toc-item level-0 preface-item';
            prefaceLi.dataset.index = chapter.startIndex;
            prefaceLi.dataset.chapterIndex = chIdx;  // 章节索引（用于热力图）
            prefaceLi.textContent = Lumina.I18n.t('preface');
            prefaceLi.addEventListener('click', () => Lumina.Actions.navigateToChapter(chIdx));
            fragment.appendChild(prefaceLi);
        }

        chapter.items.forEach((item, itemIdx) => {
            const globalIndex = chapter.startIndex + itemIdx;
            let level = -1;
            if (item.type === 'title') level = 1;
            else if (item.type === 'subtitle') level = 2;
            else if (item.type && item.type.startsWith('heading')) level = parseInt(item.type.replace('heading', ''));

            if (level >= 0) {
                if (chapter.isPreface && itemIdx === 0 && item.type === 'title') return;
                const li = document.createElement('li');
                li.className = `toc-item level-${level}`;
                li.dataset.index = globalIndex;
                li.dataset.chapterIndex = chIdx;  // 章节索引（用于热力图）
                let content = item.display || item.text;
                content = Lumina.Renderer.getCleanText(content).trim();
                if (!content) return;
                li.textContent = content;
                li.addEventListener('click', () => Lumina.Actions.navigateToChapter(chIdx, globalIndex));
                fragment.appendChild(li);
            }
        });
    });
    
    // 一次性插入，只触发一次重排
    Lumina.DOM.tocList.appendChild(fragment);
};

Lumina.Renderer.updateTocActive = (index) => {
    const tocItems = [...document.querySelectorAll('.toc-item')].filter(item => parseInt(item.dataset.index, 10) <= index);
    const tocItem = tocItems.pop();
    if (tocItem) {
        document.querySelectorAll('.toc-item.active').forEach(el => el.classList.remove('active'));
        tocItem.classList.add('active');
        tocItem.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
};

Lumina.Renderer.updateTocSpy = () => {
    const state = Lumina.State.app;
    if (!state.chapters.length) return;

    const scrollTop = Lumina.DOM.contentScroll.scrollTop;
    const clientHeight = Lumina.DOM.contentScroll.clientHeight;
    const scrollMiddle = scrollTop + clientHeight / 2;

    const headings = Array.from(Lumina.DOM.contentWrapper.querySelectorAll('.doc-line[data-index]'));
    const headingData = headings.map(el => ({
        index: parseInt(el.dataset.index),
        offsetTop: el.offsetTop,
        offsetHeight: el.offsetHeight
    }));

    let closestIndex = -1, minDistance = Infinity;

    headingData.forEach(({ index, offsetTop, offsetHeight }) => {
        const elCenter = offsetTop + offsetHeight / 2;
        const distance = Math.abs(elCenter - scrollMiddle);
        if (distance < minDistance) { minDistance = distance; closestIndex = index; }
    });

    if (closestIndex >= 0) Lumina.Renderer.updateTocActive(closestIndex);
};

Lumina.Renderer.getCurrentVisibleIndex = () => {
    const state = Lumina.State.app;
    if (!state.chapters.length) return 0;

    const scrollMiddle = Lumina.DOM.contentScroll.scrollTop + Lumina.DOM.contentScroll.clientHeight / 2;
    const paragraphs = Array.from(Lumina.DOM.contentWrapper.querySelectorAll('.doc-line[data-index]'));

    if (paragraphs.length === 0) return state.chapters[state.currentChapterIndex]?.startIndex || 0;

    let closestIndex = state.chapters[state.currentChapterIndex]?.startIndex || 0;
    let minDistance = Infinity;

    paragraphs.forEach(el => {
        const elCenter = el.offsetTop + el.offsetHeight / 2;
        const distance = Math.abs(elCenter - scrollMiddle);
        if (distance < minDistance) { minDistance = distance; closestIndex = parseInt(el.dataset.index) || 0; }
    });

    return closestIndex;
};

Lumina.Renderer.updateChapterNavInfo = () => {
    const state = Lumina.State.app;
    if (!state.document.items.length || !state.chapters.length) {
        Lumina.DOM.chapterNavInfo.textContent = '';
        return;
    }
    const chapter = state.chapters[state.currentChapterIndex];
    Lumina.DOM.chapterNavInfo.textContent = chapter.isPreface ? Lumina.I18n.t('preface') : Lumina.Renderer.getCleanText(chapter.title);
};

// ==================== 10. 搜索功能 ====================

Lumina.Search = {
    // 当前搜索标签：'document' | 'library'
    currentTab: 'document',
    // 搜索结果缓存
    documentResults: [],
    libraryResults: [],
    // 搜索结果数量
    docResultCount: 0,
    libResultCount: 0,
    // 当前搜索词
    currentQuery: '',

    // 初始化搜索标签
    init() {
        this.bindTabEvents();
        
        // 初始状态：隐藏选项卡容器（等待搜索结果）
        const tabsContainer = document.getElementById('searchTabs');
        if (tabsContainer) {
            tabsContainer.style.display = 'none';
        }
    },

    // 绑定选项卡事件（可重复调用）
    bindTabEvents() {
        const tabs = document.getElementById('searchTabs');
        if (!tabs) return;

        // 避免重复绑定
        tabs.removeEventListener('click', this._tabClickHandler);
        
        this._tabClickHandler = (e) => {
            const btn = e.target.closest('.search-tab');
            if (!btn) return;

            const tab = btn.dataset.tab;
            if (tab && tab !== this.currentTab) {
                this.switchTab(tab);
            }
        };

        tabs.addEventListener('click', this._tabClickHandler);
    },

    // 切换搜索标签
    switchTab(tab) {
        this.currentTab = tab;

        // 更新 UI
        document.querySelectorAll('.search-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // 根据当前标签渲染对应结果
        if (this.currentQuery) {
            this.renderCurrentResults();
        }
    },

    // 执行搜索（同时搜索文档和书库）
    async perform(query) {
        this.currentQuery = query;

        if (!query) {
            this.clearResults();
            return;
        }

        // 同时执行两种搜索
        const docPromise = this.searchDocument(query);
        const libPromise = this.searchLibrary(query);

        await Promise.all([docPromise, libPromise]);

        // 更新计数显示
        this.updateResultCounts();

        // 根据结果决定显示哪个标签
        this.determineTabVisibility();

        // 渲染当前标签的结果
        this.renderCurrentResults();

        // 重新绑定选项卡事件（确保点击有效）
        this.bindTabEvents();
    },

    // 文档内搜索
    async searchDocument(query) {
        const state = Lumina.State.app;
        state.search.currentQuery = query;
        const lowerQuery = query.toLowerCase();

        // 如果没有打开文档，结果为空
        if (!state.document.items.length) {
            this.documentResults = [];
            this.docResultCount = 0;
            return;
        }

        this.documentResults = [];

        state.chapters.forEach((chapter, chIdx) => {
            chapter.items.forEach((item, itemIdx) => {
                if (item.text?.toLowerCase().includes(lowerQuery)) {
                    this.documentResults.push({
                        item,
                        chapterIndex: chIdx,
                        globalIndex: chapter.startIndex + itemIdx,
                        chapterTitle: chapter.isPreface ? Lumina.I18n.t('preface') : chapter.title
                    });
                }
            });
        });

        this.docResultCount = this.documentResults.length;
    },

    // 书库搜索
    async searchLibrary(query) {
        const lowerQuery = query.toLowerCase();

        try {
            // 获取书库数据
            const stats = await Lumina.DB.adapter.getStorageStats();
            this.libraryResults = stats.files.filter(file => {
                const fileName = file.fileName?.toLowerCase() || '';
                return fileName.includes(lowerQuery);
            });
            this.libResultCount = this.libraryResults.length;
        } catch (e) {
            this.libraryResults = [];
            this.libResultCount = 0;
        }
    },

    // 更新结果计数显示
    updateResultCounts() {
        const docCountEl = document.getElementById('docResultCount');
        const libCountEl = document.getElementById('libResultCount');

        if (docCountEl) docCountEl.textContent = this.docResultCount;
        if (libCountEl) libCountEl.textContent = this.libResultCount;
    },
    
    // 更新搜索标签文本（i18n）
    updateSearchTabLabels() {
        const docTabLabel = document.querySelector('[data-tab="document"] span[data-i18n]');
        const libTabLabel = document.querySelector('[data-tab="library"] span[data-i18n]');
        if (docTabLabel) docTabLabel.textContent = Lumina.I18n.t('searchTabDocument');
        if (libTabLabel) libTabLabel.textContent = Lumina.I18n.t('searchTabLibrary');
    },

    // 决定选项卡显示/隐藏
    determineTabVisibility() {
        const hasDocResults = this.docResultCount > 0;
        const hasLibResults = this.libResultCount > 0;
        const tabsContainer = document.getElementById('searchTabs');

        if (!tabsContainer) return;

        const docTab = tabsContainer.querySelector('[data-tab="document"]');
        const libTab = tabsContainer.querySelector('[data-tab="library"]');

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

        // 两种结果都有，显示两个选项卡
        if (docTab) docTab.style.display = '';
        if (libTab) libTab.style.display = '';
    },

    // 渲染当前标签的结果
    renderCurrentResults() {
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
        const state = Lumina.State.app;
        const lowerQuery = query.toLowerCase();

        Lumina.DOM.aggregateSearch.innerHTML = matches.map((match, idx) => {
            const text = match.item.text;
            const matchIndex = text.toLowerCase().indexOf(lowerQuery);
            const start = Math.max(0, matchIndex - 30);
            const end = Math.min(text.length, matchIndex + query.length + 30);
            let context = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
            context = context.replace(new RegExp(`(${Lumina.Utils.escapeRegex(lowerQuery)})`, 'gi'), '<span class="search-result-match">$1</span>');

            return `
        <div class="search-result-item" data-index="${idx}" data-global="${match.globalIndex}" data-chapter="${match.chapterIndex}">
        <div class="search-result-context">${context}</div>
        <div class="search-result-info">
            <span>${Lumina.Search.getItemTypeLabel(match.item.type)}</span>
            <span>${Lumina.Utils.escapeHtml(match.chapterTitle)}</span>
        </div>
        </div>
    `;
        }).join('');

        Lumina.DOM.aggregateSearch.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const globalIndex = parseInt(item.dataset.global);
                const chapterIndex = parseInt(item.dataset.chapter);

                Lumina.Search.clearHighlight();

                // 让 navigateToChapter 处理分页计算
                Lumina.Actions.navigateToChapter(chapterIndex, globalIndex);

                // 移动端自动关闭搜索面板
                if (window.innerWidth <= 768) {
                    Lumina.DOM.searchPanel.classList.remove('open');
                }

                // 高亮搜索结果（延迟确保渲染完成，移动端需要更长时间）
                setTimeout(() => {
                    const target = Lumina.DOM.contentWrapper.querySelector(`.doc-line[data-index="${globalIndex}"]`);
                    if (target) {
                        target.classList.add('search-highlight');
                        state.search.highlightedIndex = globalIndex;
                        document.querySelectorAll('.search-result-item.active').forEach(i => i.classList.remove('active'));
                        item.classList.add('active');
                        
                        // 滚动到视口中央，确保用户能看到
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, window.innerWidth <= 768 ? 400 : 150);
            });
        });
    },

    // 渲染书库搜索结果
    renderLibraryResults(files, query) {
        Lumina.DOM.aggregateSearch.innerHTML = files.map((file, idx) => {
            const timeAgo = Lumina.Utils.formatTimeAgo(file.lastReadTime);
            const sizeStr = file.estimatedSize ? parseFloat(file.estimatedSize).toFixed(1) + 'MB' : '--';
            const fileName = Lumina.Utils.escapeHtml(file.fileName);
            
            // 高亮匹配的文件名
            const lowerQuery = query.toLowerCase();
            const matchIndex = fileName.toLowerCase().indexOf(lowerQuery);
            let highlightedName = fileName;
            if (matchIndex >= 0) {
                const before = fileName.substring(0, matchIndex);
                const match = fileName.substring(matchIndex, matchIndex + query.length);
                const after = fileName.substring(matchIndex + query.length);
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

        Lumina.DOM.aggregateSearch.querySelectorAll('.library-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const fileKey = item.dataset.filekey;
                
                // 打开文件
                if (Lumina.DataManager && Lumina.DataManager.openFile) {
                    Lumina.DataManager.openFile(fileKey);
                }
                
                // 移动端自动关闭搜索面板
                if (window.innerWidth <= 768) {
                    Lumina.DOM.searchPanel.classList.remove('open');
                }
            });
        });
    },

    // 渲染空状态
    renderEmpty() {
        Lumina.DOM.aggregateSearch.innerHTML = `<div class="search-empty">${Lumina.I18n.t('searchEmpty')}</div>`;
    },

    // 渲染无结果状态
    renderNoResults() {
        Lumina.DOM.aggregateSearch.innerHTML = `<div class="search-empty">${Lumina.I18n.t('searchNoResults')}</div>`;
    },

    getItemTypeLabel(type) {
        const labels = { title: Lumina.I18n.t('title'), subtitle: Lumina.I18n.t('subtitle'), paragraph: Lumina.I18n.t('paragraph'), list: Lumina.I18n.t('list') };
        if (type?.startsWith('heading')) return Lumina.I18n.t(type);
        return labels[type] || type;
    },

    clearResults() {
        const state = Lumina.State.app;
        state.search.matches = [];
        state.search.currentQuery = '';
        state.search.highlightedIndex = -1;
        this.documentResults = [];
        this.libraryResults = [];
        this.docResultCount = 0;
        this.libResultCount = 0;
        this.currentQuery = '';
        this.currentTab = 'document';

        // 重置计数
        this.updateResultCounts();

        // 重置标签显示（保持隐藏，等待新的搜索结果）
        const tabsContainer = document.getElementById('searchTabs');
        if (tabsContainer) {
            tabsContainer.style.display = 'none';  // 保持隐藏
            const docTab = tabsContainer.querySelector('[data-tab="document"]');
            const libTab = tabsContainer.querySelector('[data-tab="library"]');
            if (docTab) {
                docTab.classList.add('active');
            }
            if (libTab) {
                libTab.classList.remove('active');
            }
        }

        if (Lumina.DOM.aggregateSearch) this.renderEmpty();

        const searchInput = document.getElementById('searchPanelInput');
        if (searchInput) searchInput.value = '';

        Lumina.DOM.searchPanel.classList.remove('open');
        Lumina.Search.clearHighlight();
    },

    clearHighlight() {
        const state = Lumina.State.app;
        if (state.search.highlightedIndex >= 0) {
            const el = Lumina.DOM.contentWrapper.querySelector(`[data-index="${state.search.highlightedIndex}"]`);
            if (el) el.classList.remove('search-highlight');
            state.search.highlightedIndex = -1;
        }
    }
};
