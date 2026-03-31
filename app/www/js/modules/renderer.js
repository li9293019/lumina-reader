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
// 已迁移到 search.js
