// ==================== 9. 渲染引擎 ====================

// 标记：下一次 renderCurrentChapter 渲染后是否滚动到页面底部（用于“上一页”协同）
let _scrollToBottomAfterRender = false;

Lumina.Renderer.setScrollToBottomAfterRender = (value = true) => {
    _scrollToBottomAfterRender = value;
};

Lumina.Renderer.renderCurrentChapter = (targetIndex = null) => {
    Lumina.UI.hideTooltip();

    const state = Lumina.State.app;
    const chapter = state.chapters[state.currentChapterIndex];

    // 如果本次是显式 targetIndex 定位，则清空“滚动到底部”标记，避免误触发
    if (targetIndex !== null) {
        _scrollToBottomAfterRender = false;
    }
    
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
    
    // 1.5 清空 TOC 同步缓存（布局已变化）
    Lumina.Renderer.invalidateTocSpyCache();
    
    // 1.6 断开旧的图片懒加载 Observer，避免内存泄漏
    if (Lumina.Renderer._lazyImageObserver) {
        Lumina.Renderer._lazyImageObserver.disconnect();
        Lumina.Renderer._lazyImageObserver = null;
    }
    
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
    
    // 4.5 自动识别正文中的 URL 和邮箱，转为可点击外部链接
    // 同时为 Markdown 原生渲染的 .markdown-link 绑定确认对话框
    if (Lumina.Utils?.linkifyContent) {
        Lumina.DOM.contentWrapper.querySelectorAll('.doc-line').forEach(line => {
            Lumina.Utils.linkifyContent(line);
            if (Lumina.Utils.bindExternalLinkConfirmation) {
                Lumina.Utils.bindExternalLinkConfirmation(line);
            }
        });
    }
    
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
        } else if (_scrollToBottomAfterRender) {
            // “上一页”协同：回退到上一页时，把页面定位到最底部
            const scroller = Lumina.DOM.contentScroll;
            scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            _scrollToBottomAfterRender = false;
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
        
        // 词典高亮
        if (Lumina.Dictionary?.isEnabled()) {
            Lumina.Dictionary.highlightCurrentPage();
        }
        
        // 预加载下一页的图片（提升翻页体验）
        Lumina.Renderer.preloadNextPageImages(chapter, pageIdx);
    });
    window.dispatchEvent(new CustomEvent('chapterRendered', { detail: { chapterIndex: state.currentChapterIndex, pageIndex: state.currentPageIdx } }));
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
        
        // 使用全局单例 Intersection Observer，避免每次翻页创建大量 observer 导致内存泄漏
        if ('IntersectionObserver' in window) {
            if (!Lumina.Renderer._lazyImageObserver) {
                Lumina.Renderer._lazyImageObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const img = entry.target;
                            img.src = img.dataset.src;
                            img.onload = () => {
                                img.style.backgroundColor = 'transparent';
                                img.style.minHeight = 'auto';
                            };
                            Lumina.Renderer._lazyImageObserver.unobserve(img);
                        }
                    });
                }, { rootMargin: '100px' });
            }
            Lumina.Renderer._lazyImageObserver.observe(img);
        } else {
            // 不支持 Intersection Observer 的浏览器直接加载
            img.src = img.dataset.src;
        }
        
        div.appendChild(img);
    } else {
        let content = item.display || item.text;
        // 防御：确保 content 是字符串
        if (typeof content !== 'string') content = String(content || '');
        
        // 简繁转换
        if (Lumina.Converter?.isConverting && content) {
            content = Lumina.Converter.getConvertedText(item, index);
        }
        
        content = Lumina.Renderer.getCleanText(content);
        if (item.isEmpty || (!content.trim() && !Lumina.State.settings.ignoreEmptyLines)) {
            div.innerHTML = '&nbsp;'; // 使用不换行空格确保高度
            div.classList.add('empty-paragraph');
        } else {
            div.textContent = content.trim();
            // 忽略空行模式下，空段落去掉 margin，完全不占空间
            if (!content.trim() && Lumina.State.settings.ignoreEmptyLines) {
                div.classList.add('hidden-empty-line');
            }
        }
        
        if (div.classList.contains('paragraph') && Lumina.State.settings.indent) {
            div.classList.add('indent');
        }
    }

    return div;
};

/**
 * 原位更新单个 doc-line 元素，不触发全页重建
 * 用于纯文本编辑后保持滚动位置、避免闪烁
 */
Lumina.Renderer.updateDocLineElement = (index, item) => {
    const oldEl = document.querySelector(`.doc-line[data-index="${index}"]`);
    if (!oldEl) return false;

    const newEl = Lumina.Renderer.createDocLineElement(item, index);
    oldEl.parentNode.replaceChild(newEl, oldEl);

    // 重新应用 URL 自动链接化
    if (Lumina.Utils?.linkifyContent && item.type !== 'image') {
        Lumina.Utils.linkifyContent(newEl);
        if (Lumina.Utils.bindExternalLinkConfirmation) {
            Lumina.Utils.bindExternalLinkConfirmation(newEl);
        }
    }

    // 重新渲染该行的批注高亮（最小化重绘范围）
    const chapterIndex = Lumina.State.app.currentChapterIndex;
    const chapterAnnotations = (Lumina.State.app.annotations || []).filter(
        a => a.chapterIndex === chapterIndex && (a.lineIndex === index || a.startLine === index)
    );
    if (chapterAnnotations.length && Lumina.Annotations) {
        chapterAnnotations.forEach(anno => {
            if (anno.type === 'bookmark') {
                Lumina.Annotations.renderBookmark(anno);
            } else {
                Lumina.Annotations.renderAnnotationHighlight(anno);
            }
        });
    }

    return true;
};

Lumina.Renderer.getCleanText = (txt) => {
    // 防御：确保 txt 是字符串
    if (typeof txt !== 'string') return txt || '';
    if (['chap', 'part', 'sect'].some(prefix => txt.toLowerCase().startsWith(prefix))) return txt;
    if (txt.length > 20) return txt;
    
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

/**
 * 去除 Markdown 行内格式标记（用于目录和章节导航显示）
 * 仅针对 md 文件：去除成对的 **...** 和 *...*，保留不成对的 *
 */
Lumina.Renderer.stripMarkdownInlineMarkers = (txt) => {
    if (!txt || typeof txt !== 'string') return txt || '';
    if (Lumina.State?.app?.currentFile?.type !== 'md') return txt;
    // 先去除粗体 **...**（content 中不能包含 *）
    let result = txt.replace(/\*\*([^*]+?)\*\*/g, '$1');
    // 再去除斜体 *...*（content 中不能包含 *）
    result = result.replace(/\*([^*]+)\*/g, '$1');
    return result;
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

    // PC 端：双击分页栏打开页码面板
    nav.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        Lumina.Renderer.openPagePanel();
    });

    // 移动端：双指短按分页栏打开页码面板
    let pagePanelTouchStartTime = 0;
    let pagePanelTouchStartDist = 0;
    let pagePanelTouchStartPos = [{ x: 0, y: 0 }, { x: 0, y: 0 }];

    nav.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            pagePanelTouchStartTime = Date.now();
            pagePanelTouchStartPos = [
                { x: e.touches[0].clientX, y: e.touches[0].clientY },
                { x: e.touches[1].clientX, y: e.touches[1].clientY }
            ];
            const dx = pagePanelTouchStartPos[0].x - pagePanelTouchStartPos[1].x;
            const dy = pagePanelTouchStartPos[0].y - pagePanelTouchStartPos[1].y;
            pagePanelTouchStartDist = Math.hypot(dx, dy);
        }
    }, { passive: true });

    nav.addEventListener('touchend', (e) => {
        if (pagePanelTouchStartTime === 0) return;
        const duration = Date.now() - pagePanelTouchStartTime;
        const changed = e.changedTouches;
        // 判定：双指、短按(<500ms)、几乎没移动(<20px)
        if (duration < 500 && changed.length >= 1) {
            let maxMove = 0;
            for (let i = 0; i < Math.min(changed.length, 2); i++) {
                const start = pagePanelTouchStartPos[i];
                if (start) {
                    const move = Math.hypot(changed[i].clientX - start.x, changed[i].clientY - start.y);
                    maxMove = Math.max(maxMove, move);
                }
            }
            if (maxMove < 20) {
                e.preventDefault();
                e.stopPropagation();
                Lumina.Renderer.openPagePanel();
            }
        }
        pagePanelTouchStartTime = 0;
    }, { passive: false });
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

// 打开分页扩展面板（显示当前章节全部页码）
Lumina.Renderer.openPagePanel = () => {
    const state = Lumina.State.app;
    const chapter = state.chapters[state.currentChapterIndex];
    if (!chapter) return;

    const ranges = chapter.pageRanges || Lumina.Pagination.calculateRanges(chapter.items);
    const totalPages = ranges.length;
    const currentPage = state.currentPageIdx;

    if (totalPages < 7) return;

    // 更新标题
    const titleEl = document.getElementById('pagePanelTitle');
    if (titleEl) {
        titleEl.textContent = Lumina.I18n.t('pageJumpTitle') || '页码跳转';
    }

    // 渲染页码网格
    const grid = document.getElementById('pagePanelGrid');
    if (!grid) return;

    let html = '';
    for (let i = 0; i < totalPages; i++) {
        const isActive = i === currentPage;
        html += `<button class="page-panel-btn ${isActive ? 'active' : ''}" ` +
                `onclick="Lumina.Actions.goToPageFromPanel(${i})" ` +
                `data-page="${i}">${i + 1}</button>`;
    }
    grid.innerHTML = html;

    // 显示面板
    const panel = document.getElementById('pagePanel');
    if (panel) {
        panel.classList.add('active');
        // 视觉焦点：滚动到当前页按钮所在位置
        requestAnimationFrame(() => {
            const activeBtn = grid.querySelector('.page-panel-btn.active');
            if (activeBtn) {
                activeBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
            }
        });
    }
};

Lumina.Renderer.updateDocumentStyles = () => {
    const state = Lumina.State.app;
    // 首字下沉只在章节第一页生效，分页后的页面不触发
    if (state.currentPageIdx !== 0) return;
    const firstPara = Lumina.DOM.contentWrapper.querySelector('.doc-line.paragraph');
    if (firstPara && Lumina.State.settings?.dropCap) firstPara.classList.add('drop-cap');
};

Lumina.Renderer.generateTOC = () => {
    Lumina.DOM.tocList.innerHTML = '';
    const state = Lumina.State.app;
    const fragment = document.createDocumentFragment();

    // 1. 收集所有目录项
    const tocItems = [];
    state.chapters.forEach((chapter, chIdx) => {
        if (chapter.isPreface) {
            tocItems.push({
                type: 'preface',
                level: 1,
                content: Lumina.I18n.t('preface'),
                chapterIndex: chIdx,
                globalIndex: chapter.startIndex
            });
        }
        chapter.items.forEach((item, itemIdx) => {
            const globalIndex = chapter.startIndex + itemIdx;
            let level = -1;
            if (item.type === 'title') level = 1;
            else if (item.type === 'subtitle') level = 2;
            else if (item.type && item.type.startsWith('heading')) level = parseInt(item.type.replace('heading', ''));

            if (level >= 0) {
                if (chapter.isPreface && itemIdx === 0 && item.type === 'title') return;
                let content = item.display || item.text;
                if (Lumina.Converter?.isConverting && content) {
                    content = Lumina.Converter.convert(content);
                }
                content = Lumina.Renderer.stripMarkdownInlineMarkers(content);
                content = Lumina.Renderer.getCleanText(content).trim();
                if (!content) return;
                tocItems.push({
                    type: 'heading',
                    level,
                    content,
                    chapterIndex: chIdx,
                    globalIndex
                });
            }
        });
    });

    // 2. 构建嵌套树
    const root = { children: [], level: -1 };
    const stack = [root];
    tocItems.forEach(item => {
        while (stack.length > 1 && stack[stack.length - 1].level >= item.level) {
            stack.pop();
        }
        const parent = stack[stack.length - 1];
        const node = { ...item, children: [] };
        parent.children.push(node);
        stack.push(node);
    });

    // 3. 递归渲染
    const renderNode = (node) => {
        const li = document.createElement('li');
        li.className = 'toc-node';

        const div = document.createElement('div');
        div.className = `toc-item level-${node.level} ${node.type === 'preface' ? 'preface-item' : ''}`;
        div.dataset.index = node.globalIndex;
        div.dataset.chapterIndex = node.chapterIndex;

        const hasChildren = node.children.length > 0;

        if (hasChildren) {
            const foldBtn = document.createElement('span');
            foldBtn.className = 'toc-fold-btn';
            foldBtn.innerHTML = `<svg class="icon"><use href="#icon-caret-down"/></svg>`;
            div.appendChild(foldBtn);
        }

        const textNode = document.createTextNode(node.content);
        div.appendChild(textNode);
        li.appendChild(div);

        if (hasChildren) {
            const ul = document.createElement('ul');
            ul.className = 'toc-children';
            node.children.forEach(child => ul.appendChild(renderNode(child)));
            li.appendChild(ul);

            let touchStartX = 0, touchStartY = 0, isSwipe = false;
            div.addEventListener('touchstart', (e) => {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isSwipe = false;
            }, { passive: true });
            div.addEventListener('touchend', (e) => {
                const dx = e.changedTouches[0].clientX - touchStartX;
                const dy = e.changedTouches[0].clientY - touchStartY;
                if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
                    e.preventDefault();
                    e.stopPropagation();
                    isSwipe = true;
                    if (dx > 0) {
                        li.classList.remove('collapsed');
                    } else {
                        li.classList.add('collapsed');
                    }
                }
            });
            div.addEventListener('click', (e) => {
                if (isSwipe) {
                    e.preventDefault();
                    e.stopPropagation();
                    isSwipe = false;
                    return;
                }
                if (e.target.closest('.toc-fold-btn')) {
                    e.stopPropagation();
                    li.classList.toggle('collapsed');
                } else {
                    Lumina.Actions.navigateToChapter(node.chapterIndex, node.globalIndex);
                }
            });
        } else {
            div.addEventListener('click', () => {
                Lumina.Actions.navigateToChapter(node.chapterIndex, node.globalIndex);
            });
        }

        return li;
    };

    root.children.forEach(node => fragment.appendChild(renderNode(node)));
    Lumina.DOM.tocList.appendChild(fragment);
};

let _lastActiveTocItem = null;

Lumina.Renderer.updateTocActive = (index) => {
    const tocItems = [...document.querySelectorAll('.toc-item')].filter(item => parseInt(item.dataset.index, 10) <= index);
    const tocItem = tocItems.pop();
    if (!tocItem) return;
    
    // 如果已经是当前激活项，跳过 DOM 操作
    if (_lastActiveTocItem === tocItem) return;
    
    // 移除上一个激活项
    if (_lastActiveTocItem) {
        _lastActiveTocItem.classList.remove('active');
    }
    
    // 激活新项
    tocItem.classList.add('active');
    _lastActiveTocItem = tocItem;
    
    // 只在必要时滚动到视口（避免每次滚动都触发滚动动画）
    const tocList = Lumina.DOM.tocList;
    const tocRect = tocList.getBoundingClientRect();
    const itemRect = tocItem.getBoundingClientRect();
    if (itemRect.top < tocRect.top || itemRect.bottom > tocRect.bottom) {
        tocItem.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
};

// TOC 滚动同步缓存（避免每次滚动都触发重排）
let _tocSpyCache = null;
let _tocSpyRafId = null;
let _lastTocActiveIndex = -1;

function _buildTocSpyCache() {
    const headings = Array.from(Lumina.DOM.contentWrapper.querySelectorAll('.doc-line[data-index]'));
    _tocSpyCache = headings.map(el => ({
        index: parseInt(el.dataset.index, 10),
        offsetTop: el.offsetTop,
        offsetHeight: el.offsetHeight
    }));
}

Lumina.Renderer.invalidateTocSpyCache = () => {
    _tocSpyCache = null;
    _lastTocActiveIndex = -1;
    // 取消 pending 的 RAF 回调，避免访问已移除的 DOM
    if (_tocSpyRafId) {
        cancelAnimationFrame(_tocSpyRafId);
        _tocSpyRafId = null;
    }
};

Lumina.Renderer.updateTocSpy = () => {
    const state = Lumina.State.app;
    if (!state.chapters.length) return;

    // 使用 RAF 节流，避免滚动期间高频触发重排
    if (_tocSpyRafId) return;
    _tocSpyRafId = requestAnimationFrame(() => {
        _tocSpyRafId = null;
        
        // 缓存未命中时重建（仅在布局变化后）
        if (!_tocSpyCache) {
            _buildTocSpyCache();
        }
        
        const scrollTop = Lumina.DOM.contentScroll.scrollTop;
        const clientHeight = Lumina.DOM.contentScroll.clientHeight;
        const scrollMiddle = scrollTop + clientHeight / 2;
        
        let closestIndex = -1, minDistance = Infinity;
        
        _tocSpyCache.forEach(({ index, offsetTop, offsetHeight }) => {
            const elCenter = offsetTop + offsetHeight / 2;
            const distance = Math.abs(elCenter - scrollMiddle);
            if (distance < minDistance) { minDistance = distance; closestIndex = index; }
        });
        
        // 只在真正变化时才更新 DOM，减少重绘
        if (closestIndex >= 0 && closestIndex !== _lastTocActiveIndex) {
            _lastTocActiveIndex = closestIndex;
            Lumina.Renderer.updateTocActive(closestIndex);
        }
    });
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
    let title = chapter.isPreface ? Lumina.I18n.t('preface') : chapter.title;
    // 简繁转换
    if (Lumina.Converter?.isConverting && title) {
        title = Lumina.Converter.convert(title);
    }
    // 对于 md 文件，去除顶部章节信息中的成对 *...* / **...** 标记
    title = Lumina.Renderer.stripMarkdownInlineMarkers(title);
    Lumina.DOM.chapterNavInfo.textContent = Lumina.Renderer.getCleanText(title);
};

// ==================== 10. 搜索功能 ====================
// 已迁移到 search.js
