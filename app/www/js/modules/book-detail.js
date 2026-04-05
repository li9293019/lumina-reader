// ==================== 书籍详情面板 ====================

Lumina.BookDetail = {
    // 当前书籍数据
    currentFile: null,
    
    // 切换相关状态
    fileList: [],        // 当前列表
    currentIndex: 0,     // 当前索引
    isSwitching: false,  // 是否正在切换中
    frameworkReady: false, // 框架是否已初始化
    
    // 缓存的 DOM 引用（避免重复查询）
    _elements: {},
    
    // 文件类型颜色映射
    fileTypeColors: {
        docx: '#4472C4',
        txt: '#6B7280',
        md: '#8B5CF6',
        html: '#E34C26',
        epub: '#10B981',
        json: '#F59E0B',
        pdf: '#DC2626'
    },
    
    // 初始化（只执行一次，创建框架和绑定事件）
    init() {
        this.initFramework();
        this.bindEvents();
        this.createDatalists();
        this.initSwipeGesture();
    },
    
    // 初始化面板框架（只执行一次）
    initFramework() {
        if (this.frameworkReady) return;
        
        // 缓存 DOM 引用
        this._elements = {
            panel: document.getElementById('bookDetailPanel'),
            container: document.querySelector('.book-detail-container'),
            cover: document.getElementById('bookDetailCover'),
            coverWrapper: document.getElementById('bookDetailCoverWrapper'),
            formatBadge: document.getElementById('bookDetailFormatBadge'),
            name: document.getElementById('bookDetailName'),
            author: document.getElementById('bookDetailAuthor'),
            publishDate: document.getElementById('bookDetailPublishDate'),
            publisher: document.getElementById('bookDetailPublisher'),
            language: document.getElementById('bookDetailLanguage'),
            fileName: document.getElementById('bookDetailFileName'),
            description: document.getElementById('bookDetailDescription'),
            tagList: document.getElementById('bookDetailTagList'),
            tagInput: document.getElementById('bookDetailTagInput')
        };
        
        this.frameworkReady = true;
    },
    
    // 创建 datalist 和语言菜单
    createDatalists() {
        // 创建 datalist
        if (!document.getElementById('languageOptions')) {
            const datalist = document.createElement('datalist');
            datalist.id = 'languageOptions';
            const languages = Lumina.Config?.languages || [
                { name: '简体中文' }, { name: '繁體中文' }, { name: 'English' },
                { name: '日本語' }, { name: '한국어' }
            ];
            datalist.innerHTML = languages.map(lang => `<option value="${lang.name}">`).join('');
            document.body.appendChild(datalist);
        }
        
        // 动态生成语言下拉菜单
        const menu = document.getElementById('bookDetailLanguageMenu');
        if (menu && !menu.hasChildNodes()) {
            const languages = Lumina.Config?.languages || [
                { code: 'zh', name: '简体中文' }, { code: 'zh-TW', name: '繁體中文' },
                { code: 'en', name: 'English' }, { code: 'ja', name: '日本語' }, { code: 'ko', name: '한국어' }
            ];
            menu.innerHTML = languages.map(lang => 
                `<div class="language-option" data-value="${lang.name}">${lang.name}</div>`
            ).join('');
        }
    },
    
    // 绑定事件
    bindEvents() {
        // 关闭按钮
        const closeBtn = document.getElementById('bookDetailClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        // 点击遮罩关闭（点击背景关闭，但点击容器不关闭）
        const panel = document.getElementById('bookDetailPanel');
        const container = document.querySelector('.book-detail-container');
        if (panel) {
            panel.addEventListener('click', (e) => {
                // 如果点击的是面板背景（不是容器内部），则关闭
                if (e.target === panel || e.target === container) return;
                // 检查点击目标是否在容器内或是导航区域
                const isNavZone = e.target.closest('.book-nav-zone');
                if (!container?.contains(e.target) && !isNavZone) {
                    this.close();
                }
            });
        }
        
        // 封面滑动操作（移动端）
        this.bindCoverSwipeActions();
        
        // PC端悬浮按钮
        const updateBtn = document.querySelector('.book-detail-cover-hover-actions .update-btn');
        const deleteBtn = document.querySelector('.book-detail-cover-hover-actions .delete-btn');
        
        if (updateBtn) {
            updateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.triggerCoverUpload();
            });
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteCover();
            });
        }
        
        // 点击封面内容区（PC端）
        const coverContent = document.querySelector('.book-detail-cover-content');
        if (coverContent) {
            coverContent.addEventListener('click', () => this.triggerCoverUpload());
        }
        
        // 书名编辑
        const nameEl = document.getElementById('bookDetailName');
        if (nameEl) {
            nameEl.addEventListener('click', () => this.editName());
        }
        
        // 作者编辑
        const authorEl = document.getElementById('bookDetailAuthor');
        if (authorEl) {
            authorEl.addEventListener('click', () => this.editAuthor());
        }
        
        // 发布时间编辑
        const publishDateEl = document.getElementById('bookDetailPublishDate');
        if (publishDateEl) {
            publishDateEl.addEventListener('click', () => this.editPublishDate());
        }
        
        // 发布平台编辑（点击）/ 跳转链接（长按）
        const publisherEl = document.getElementById('bookDetailPublisher');
        if (publisherEl) {
            let longPressTimer = null;
            let isLongPress = false;
            const LONG_PRESS_DURATION = 500; // 500ms 视为长按
            
            const startLongPress = (e) => {
                const sourceUrl = publisherEl.dataset.sourceUrl;
                if (!sourceUrl) return; // 无链接时不处理长按
                
                isLongPress = false;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    // 长按触发跳转
                    Lumina.UI.showDialog(
                        Lumina.I18n.t('externalLinkConfirm', sourceUrl), 
                        'confirm', 
                        (confirmed) => {
                            if (confirmed) {
                                window.open(sourceUrl, '_blank', 'noopener,noreferrer');
                            }
                        }
                    );
                }, LONG_PRESS_DURATION);
            };
            
            const cancelLongPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            };
            
            // 鼠标事件（PC）
            publisherEl.addEventListener('mousedown', startLongPress);
            publisherEl.addEventListener('mouseup', cancelLongPress);
            publisherEl.addEventListener('mouseleave', cancelLongPress);
            
            // 触摸事件（移动端）
            publisherEl.addEventListener('touchstart', (e) => {
                startLongPress(e);
            }, { passive: true });
            publisherEl.addEventListener('touchend', cancelLongPress);
            publisherEl.addEventListener('touchcancel', cancelLongPress);
            
            // 点击事件：如果不是长按，则进入编辑
            publisherEl.addEventListener('click', (e) => {
                if (isLongPress) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                this.editPublisher();
            });
        }
        
        // 语言编辑
        const languageEl = document.getElementById('bookDetailLanguage');
        if (languageEl) {
            languageEl.addEventListener('click', () => this.editLanguage());
        }
        
        // 简介编辑
        const descEl = document.getElementById('bookDetailDescription');
        if (descEl) {
            descEl.addEventListener('click', () => this.editDescription());
        }
        
        // 展开/收起简介
        const descToggle = document.getElementById('bookDetailDescToggle');
        if (descToggle) {
            descToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDescription();
            });
        }
        
        // 标签输入（使用 keyup 确保输入值已包含刚按下的键）
        const tagInput = document.getElementById('bookDetailTagInput');
        if (tagInput) {
            tagInput.addEventListener('keyup', (e) => this.handleTagInput(e));
        }
        
        // 打开阅读按钮
        const readBtn = document.getElementById('bookDetailReadBtn');
        if (readBtn) {
            readBtn.addEventListener('click', () => this.startReading());
        }
    },
    
    // 打开面板（支持切换功能）
    open(fileList, index) {
        if (!fileList || fileList.length === 0) return;
        if (index < 0 || index >= fileList.length) return;
        
        this.fileList = fileList;
        this.currentIndex = index;
        this.show(fileList[index]);
    },
    
    // 内部：显示面板
    show(fileData) {
        this.currentFile = fileData;
        
        // 确保框架已初始化
        this.initFramework();
        
        // 更新书籍数据（不重建 DOM）
        this.updateBookData(fileData);
        
        // 渲染切换按钮（PC端）
        this.renderNavButtons();
        
        // 绑定tooltip
        if (Lumina.UI?.setupCustomTooltip) {
            Lumina.UI.setupCustomTooltip();
        }
        
        // 绑定键盘事件
        this.bindKeyboardEvents();
        
        // 显示面板
        const panel = this._elements.panel;
        if (panel) {
            panel.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    },
    
    // 绑定键盘事件
    bindKeyboardEvents() {
        // 移除旧的事件监听
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
        }
        
        // 创建新的事件处理函数
        this._keyHandler = (e) => {
            // 只在面板打开时响应
            const panel = document.getElementById('bookDetailPanel');
            if (!panel?.classList.contains('active')) return;
            
            // 如果正在编辑输入框，不响应方向键
            if (e.target.closest('input') || e.target.closest('textarea')) return;
            
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.switchBook('prev');
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.switchBook('next');
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.close();
                    break;
            }
        };
        
        document.addEventListener('keydown', this._keyHandler);
    },
    
    // 渲染切换按钮（PC端显示，移动端隐藏）
    renderNavButtons() {
        const panel = document.getElementById('bookDetailPanel');
        if (!panel) return;
        
        // 移除旧按钮和hover区域
        panel.querySelectorAll('.book-nav-zone').forEach(zone => zone.remove());
        
        const isMobile = window.innerWidth <= 768;
        if (isMobile) return; // 移动端不显示按钮，使用滑动
        
        const total = this.fileList.length;
        if (total <= 1) return; // 只有一本不显示
        
        // 创建左侧hover区域和按钮
        const leftZone = document.createElement('div');
        leftZone.className = 'book-nav-zone book-nav-zone-left';
        leftZone.innerHTML = `
            <button class="book-nav-btn book-nav-prev" data-tooltip="${Lumina.I18n.t('previousBook') || '上一本'}">
                <svg class="icon"><use href="#icon-chevron-left"/></svg>
            </button>
        `;
        leftZone.querySelector('.book-nav-prev').onclick = (e) => {
            e.stopPropagation();
            this.switchBook('prev');
        };
        
        // 创建右侧hover区域和按钮
        const rightZone = document.createElement('div');
        rightZone.className = 'book-nav-zone book-nav-zone-right';
        rightZone.innerHTML = `
            <button class="book-nav-btn book-nav-next" data-tooltip="${Lumina.I18n.t('nextBook') || '下一本'}">
                <svg class="icon"><use href="#icon-chevron-right"/></svg>
            </button>
        `;
        rightZone.querySelector('.book-nav-next').onclick = (e) => {
            e.stopPropagation();
            this.switchBook('next');
        };
        
        panel.appendChild(leftZone);
        panel.appendChild(rightZone);
    },
    
    // 切换书籍
    // direction: 'next' 或 'prev' - 用于确定切换到哪本书
    switchBook(direction) {
        if (this.isSwitching) return;
        if (this.fileList.length <= 1) return;
        
        this.isSwitching = true;
        
        const total = this.fileList.length;
        let newIndex;
        
        if (direction === 'next') {
            newIndex = (this.currentIndex + 1) % total;
        } else {
            newIndex = (this.currentIndex - 1 + total) % total;
        }
        
        // 使用封面位移动画切换
        this.animateCoverSwitch(direction, this.fileList[newIndex], () => {
            this.currentIndex = newIndex;
            this.currentFile = this.fileList[newIndex];
            this.isSwitching = false;
        });
    },
    
    // 封面位移动画（物理弹性效果）
    animateCoverSwitch(direction, newBookData, callback) {
        const coverWrapper = document.getElementById('bookDetailCoverWrapper');
        const panel = document.getElementById('bookDetailPanel');
        
        if (!coverWrapper) {
            // 降级：直接更新
            this.updateBookData(newBookData);
            callback();
            return;
        }
        
        // 添加切换中状态（禁用交互）
        panel?.classList.add('book-switching');
        
        // 获取当前完整封面区域 HTML（包含胶囊）
        const currentCoverHTML = this.getCoverAreaHTML();
        
        // 预生成新书完整封面 HTML（包含胶囊）
        const newCoverHTML = this.generateCoverAreaHTML(newBookData);
        
        // 确定动画方向
        const isNext = direction === 'next';
        const exitClass = isNext ? 'cover-anim-out-left' : 'cover-anim-out-right';
        const enterClass = isNext ? 'cover-anim-in-right' : 'cover-anim-in-left';
        
        // 创建双层封面结构用于动画
        const animContainer = document.createElement('div');
        animContainer.className = 'cover-anim-container';
        
        // 旧封面层（退出动画）- 包含封面和胶囊
        const oldCover = document.createElement('div');
        oldCover.className = `cover-anim-layer ${exitClass}`;
        oldCover.innerHTML = `
            <div class="cover-anim-content">${currentCoverHTML.coverHTML}</div>
            ${currentCoverHTML.badgeHTML}
        `;
        
        // 新封面层（进入动画）- 包含封面和胶囊
        const newCover = document.createElement('div');
        newCover.className = `cover-anim-layer ${enterClass}`;
        newCover.innerHTML = `
            <div class="cover-anim-content">${newCoverHTML.coverHTML}</div>
            ${newCoverHTML.badgeHTML}
        `;
        
        // 保存原始封面和胶囊引用
        const originalCover = document.getElementById('bookDetailCover');
        const originalBadge = document.getElementById('bookDetailFormatBadge');
        
        // 隐藏原始封面和胶囊，显示动画层
        if (originalCover) {
            originalCover.style.opacity = '0';
        }
        if (originalBadge) {
            originalBadge.style.opacity = '0';
        }
        
        animContainer.appendChild(oldCover);
        animContainer.appendChild(newCover);
        coverWrapper.appendChild(animContainer);
        
        // 动画中段更新数据（旧封面已退出，新封面即将进入）
        // 内容区域保持不变，只更新文本数据
        setTimeout(() => {
            this.updateBookData(newBookData);
        }, 180);
        
        // 动画结束后清理
        setTimeout(() => {
            // 恢复原始封面和胶囊显示
            if (originalCover) {
                originalCover.style.opacity = '1';
                originalCover.style.animation = 'none';
            }
            if (originalBadge) {
                originalBadge.style.opacity = '1';
            }
            
            // 移除动画层
            animContainer.remove();
            
            // 移除切换状态
            panel?.classList.remove('book-switching');
            
            callback();
        }, 500);
    },
    
    // 获取当前封面区域完整 HTML（包含胶囊）
    getCoverAreaHTML() {
        const coverEl = document.getElementById('bookDetailCover');
        const badgeEl = document.getElementById('bookDetailFormatBadge');
        
        const coverHTML = coverEl?.innerHTML || '';
        const badgeHTML = badgeEl?.outerHTML || '';
        
        return { coverHTML, badgeHTML };
    },
    
    // 生成新书封面区域完整 HTML（包含胶囊）
    generateCoverAreaHTML(bookData) {
        const fileType = bookData.fileType || 'default';
        const badgeText = fileType.toUpperCase();
        
        // 生成胶囊 HTML
        const badgeHTML = `<span class="book-detail-format-badge" data-type="${fileType}">${badgeText}</span>`;
        
        // 生成封面内容 HTML
        let coverContentHTML = '';
        if (bookData.cover) {
            coverContentHTML = `<img src="${bookData.cover}" class="book-detail-cover-img" alt="" style="width:100%;height:100%;object-fit:cover;">`;
        } else if (Lumina.State.settings.hashCover && Lumina.CoverGenerator) {
            const svg = Lumina.CoverGenerator.getCoverSVG(bookData);
            if (svg) {
                coverContentHTML = svg.replace('<svg', '<svg class="book-detail-cover-img"');
            } else {
                coverContentHTML = '<div class="book-detail-cover-placeholder"><svg><use href="#icon-book"/></svg></div>';
            }
        } else {
            coverContentHTML = '<div class="book-detail-cover-placeholder"><svg><use href="#icon-book"/></svg></div>';
        }
        
        return { coverHTML: coverContentHTML, badgeHTML };
    },
    
    // 初始化滑动手势（移动端）
    initSwipeGesture() {
        const panel = document.getElementById('bookDetailPanel');
        if (!panel) return;
        
        let startX = 0;
        let currentX = 0;
        let isDragging = false;
        const threshold = 80; // 触发阈值
        
        panel.addEventListener('touchstart', (e) => {
            // 在编辑区域禁止滑动切换书籍
            if (e.target.closest('input') || e.target.closest('textarea')) {
                return;
            }

            // 元数据编辑区域禁止滑动
            if (e.target.closest('.book-detail-name') || 
                e.target.closest('.book-detail-author') ||
                e.target.closest('.book-detail-info-list') || 
                e.target.closest('.book-detail-description') || 
                e.target.closest('.tag-input-container')) {
                return;
            }
            
            // 封面区域禁止滑动（有单独的滑动处理）
            if (e.target.closest('.book-detail-cover-wrapper') || e.target.closest('#bookDetailCoverSwipeLayer')) {
                return;
            }
            
            startX = e.touches[0].clientX;
            isDragging = true;
        }, { passive: true });
        
        panel.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
        }, { passive: true });
        
        panel.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            
            // 【关键】如果封面正在滑动，不触发页面切换
            if (window._bookDetailCoverSwiping) {
                return;
            }
            
            const deltaX = currentX - startX;
            
            if (Math.abs(deltaX) > threshold) {
                if (deltaX > 0) {
                    // 右滑：显示上一本
                    this.switchBook('prev');
                } else {
                    // 左滑：显示下一本
                    this.switchBook('next');
                }
            }
        });
    },
    
    // 关闭面板
    close() {
        // 关闭语言选择菜单
        this.closeLanguageMenu();
        
        const panel = document.getElementById('bookDetailPanel');
        if (panel) {
            panel.classList.remove('active');
            document.body.style.overflow = '';
        }
        
        // 移除键盘事件监听
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
        
        // 重置状态
        this.currentFile = null;
        this.fileList = [];
        this.currentIndex = 0;
        this.isSwitching = false;
        
        // 移除切换按钮和hover区域
        const panelEl = document.getElementById('bookDetailPanel');
        if (panelEl) {
            panelEl.querySelectorAll('.book-nav-zone').forEach(zone => zone.remove());
        }
    },
    
    // 更新书籍数据（增量更新，不重建 DOM）
    updateBookData(data) {
        if (!data) return;
        
        const metadata = data.metadata || {};
        const el = this._elements;
        
        // 封面
        if (el.cover) {
            if (data.cover) {
                el.cover.innerHTML = `<img src="${data.cover}" class="book-detail-cover-img" alt="" onerror="this.parentNode.innerHTML='<div class=\'book-detail-cover-placeholder\'><svg><use href=\'#icon-book\'/></svg></div>';">`;
                el.coverWrapper?.classList.remove('no-cover');
            } else if (Lumina.State.settings.hashCover && Lumina.CoverGenerator) {
                const generatedCover = Lumina.CoverGenerator.getCoverSVG(data);
                if (generatedCover) {
                    el.cover.innerHTML = generatedCover;
                    el.cover.querySelector('svg')?.classList.add('book-detail-cover-img');
                    el.coverWrapper?.classList.remove('no-cover');
                } else {
                    el.cover.innerHTML = '<div class="book-detail-cover-placeholder"><svg><use href="#icon-book"/></svg></div>';
                    el.coverWrapper?.classList.add('no-cover');
                }
            } else {
                el.cover.innerHTML = '<div class="book-detail-cover-placeholder"><svg><use href="#icon-book"/></svg></div>';
                el.coverWrapper?.classList.add('no-cover');
            }
        }
        
        // 删除按钮显示控制
        const deleteBtn = document.querySelector('.book-detail-cover-hover-actions .delete-btn');
        if (deleteBtn) {
            deleteBtn.style.display = data.cover ? '' : 'none';
        }
        
        // 文件类型胶囊
        if (el.formatBadge) {
            const fileType = data.fileType || 'default';
            el.formatBadge.textContent = fileType.toUpperCase();
            el.formatBadge.dataset.type = fileType;
        }
        
        // 书名
        if (el.name) {
            const displayName = metadata.title || this.getFileNameWithoutExt(data.fileName);
            el.name.textContent = displayName;
            const titleConfidence = metadata._extracted?.confidence?.title;
            if (metadata.title && titleConfidence > 0 && titleConfidence < 100) {
                el.name.dataset.autoExtracted = 'true';
            } else {
                delete el.name.dataset.autoExtracted;
                delete el.name.dataset.tooltip;
            }
        }
        
        // 作者
        if (el.author) {
            const authorText = metadata.author;
            el.author.textContent = authorText || Lumina.I18n.t('anonymousAuthor') || '佚名';
            const authorConfidence = metadata._extracted?.confidence?.author;
            if (authorText && authorConfidence > 0 && authorConfidence < 100) {
                el.author.dataset.autoExtracted = 'true';
            } else {
                delete el.author.dataset.autoExtracted;
                delete el.author.dataset.tooltip;
            }
        }
        
        // 发布时间
        if (el.publishDate) {
            el.publishDate.textContent = this.formatPublishDate(metadata.publishDate) || 'NA';
            const dateConfidence = metadata._extracted?.confidence?.publishDate;
            if (metadata.publishDate && dateConfidence > 0 && dateConfidence < 100) {
                el.publishDate.dataset.autoExtracted = 'true';
            } else {
                delete el.publishDate.dataset.autoExtracted;
            }
        }
        
        // 发布平台
        if (el.publisher) {
            const hasSourceUrl = metadata.sourceUrl && metadata.sourceUrl.startsWith('http');
            el.publisher.textContent = metadata.publisher || 'NA';
            el.publisher.style.cursor = hasSourceUrl ? 'pointer' : 'default';
            el.publisher.style.textDecoration = hasSourceUrl ? 'underline' : 'none';
            el.publisher.style.color = hasSourceUrl ? 'var(--accent)' : '';
            
            const pubConfidence = metadata._extracted?.confidence?.publisher;
            if (metadata.publisher && pubConfidence > 0 && pubConfidence < 100) {
                el.publisher.dataset.autoExtracted = 'true';
            } else {
                delete el.publisher.dataset.autoExtracted;
            }
            
            if (hasSourceUrl) {
                el.publisher.dataset.sourceUrl = metadata.sourceUrl;
            } else {
                delete el.publisher.dataset.sourceUrl;
            }
        }
        
        // 语言
        if (el.language) {
            el.language.textContent = metadata.language || 'NA';
            const langConfidence = metadata._extracted?.confidence?.language;
            if (metadata.language && langConfidence > 0 && langConfidence < 100) {
                el.language.dataset.autoExtracted = 'true';
            } else {
                delete el.language.dataset.autoExtracted;
            }
        }
        
        // 文件名
        if (el.fileName) {
            el.fileName.textContent = data.fileName || 'NA';
        }
        
        // 简介
        if (el.description) {
            const description = metadata.description || '';
            el.description.textContent = description || Lumina.I18n.t('noDescription');
            el.description.classList.toggle('collapsed', description.length > 60);
            const descConfidence = metadata._extracted?.confidence?.description;
            if (description && descConfidence > 0 && descConfidence < 100) {
                el.description.dataset.autoExtracted = 'true';
            } else {
                delete el.description.dataset.autoExtracted;
            }
        }
        
        // 更新简介展开/收起按钮
        this.updateDescToggle();
        
        // 标签
        this.renderTags(metadata.tags || []);
        
        // 系统信息
        const createdAtEl = document.getElementById('bookDetailCreatedAt');
        if (createdAtEl) {
            createdAtEl.textContent = data.created_at || 'NA';
        }
        
        const lastReadTimeEl = document.getElementById('bookDetailLastReadTime');
        if (lastReadTimeEl) {
            lastReadTimeEl.textContent = data.lastReadTime || Lumina.I18n.t('neverRead');
        }
        
        const lastChapterEl = document.getElementById('bookDetailLastChapter');
        if (lastChapterEl) {
            lastChapterEl.textContent = data.chapterTitle || Lumina.I18n.t('none');
        }
    },
    
    // 兼容旧代码：render 作为 updateBookData 的别名
    render() {
        this.updateBookData(this.currentFile);
    },
    
    // 刷新生成的封面（书名/作者编辑后调用）
    refreshGeneratedCover() {
        if (!this.currentFile) return;
        
        const el = this._elements;
        
        if (el.cover && Lumina.CoverGenerator) {
            // 清除缓存，强制重新生成
            Lumina.CoverGenerator.clearCache();
            const generatedCover = Lumina.CoverGenerator.getCoverSVG(this.currentFile);
            if (generatedCover) {
                el.cover.innerHTML = generatedCover;
                el.cover.querySelector('svg')?.classList.add('book-detail-cover-img');
                el.coverWrapper?.classList.remove('no-cover');
            }
        }
    },
    
    // 获取文件名（不含扩展名）
    getFileNameWithoutExt(fileName) {
        if (!fileName) return '';
        return fileName.replace(/\.[^/.]+$/, '');
    },
    
    // 格式化发布时间显示
    formatPublishDate(dateStr) {
        if (!dateStr) return '';
        // 如果存储的是完整日期，显示年月即可
        const match = dateStr.match(/^(\d{4})(?:-(\d{1,2}))?/);
        if (match) {
            const [, year, month] = match;
            return month ? `${year}-${month.padStart(2, '0')}` : year;
        }
        return dateStr;
    },
    
    // 智能补全发布时间
    normalizePublishDate(input) {
        const value = input.trim();
        if (!value) return '';
        
        const now = new Date();
        const year = now.getFullYear();
        
        // yyyy
        if (/^\d{4}$/.test(value)) {
            return `${value}-01-01 00:00:00`;
        }
        // yyyy-m 或 yyyy-mm
        if (/^\d{4}-\d{1,2}$/.test(value)) {
            const [y, m] = value.split('-');
            return `${y}-${m.padStart(2, '0')}-01 00:00:00`;
        }
        // yyyy-m-d 或 yyyy-mm-dd
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) {
            const [y, m, d] = value.split('-');
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')} 00:00:00`;
        }
        // 已经是完整格式
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
            return value;
        }
        
        return value;
    },
    
    // 渲染标签
    renderTags(tags) {
        const tagList = document.getElementById('bookDetailTagList');
        if (!tagList) return;
        
        tagList.innerHTML = '';
        tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag-item';
            tagEl.textContent = tag;
            tagEl.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止冒泡，避免触发面板关闭
                this.removeTag(tag);
            });
            tagList.appendChild(tagEl);
        });
    },
    
    // 处理标签输入（支持逗号或空白字符分隔）
    // 【关键规则】如果输入包含逗号（中英文），则只用逗号分隔（支持带空格的标签如 "boy's love"）
    handleTagInput(e) {
        // 支持中英文逗号和回车
        const isEnter = e.key === 'Enter';
        const isComma = e.key === ',' || e.key === '，' || e.code === 'Comma';
        if (!isEnter && !isComma) return;
        
        // 防止输入法组合过程中触发（如中文输入时）
        if (e.isComposing) return;
        
        e.preventDefault();
        const input = e.target;
        const rawValue = input.value;
        
        // 判断是否包含逗号
        const hasComma = /[,，]/.test(rawValue);
        
        // 如果包含逗号，只用逗号分隔；否则可以用空格或逗号分隔
        const separator = hasComma ? /[,，]+/ : /[,，\s]+/;
        
        const newTags = rawValue.split(separator)
            .map(t => t.trim())
            .filter(t => t.length > 0);
        
        if (newTags.length === 0) return;
        
        const metadata = this.currentFile.metadata || {};
        const tags = metadata.tags || [];
        
        // 添加不重复的标签
        let addedCount = 0;
        for (const tag of newTags) {
            if (tags.length >= 50) {
                Lumina.UI?.showToast?.(Lumina.I18n.t('tagsLimitReached'));
                break;
            }
            if (!tags.includes(tag)) {
                tags.push(tag);
                addedCount++;
            }
        }
        
        if (addedCount > 0) {
            this.saveMetadata({ tags });
            this.renderTags(tags);
        }
        
        input.value = '';
    },
    
    // 移除标签
    removeTag(tag) {
        const metadata = this.currentFile.metadata || {};
        const tags = (metadata.tags || []).filter(t => t !== tag);
        this.saveMetadata({ tags });
        this.renderTags(tags);
    },
    
    // 切换简介展开/收起
    toggleDescription() {
        const descEl = document.getElementById('bookDetailDescription');
        const toggleEl = document.getElementById('bookDetailDescToggle');
        if (!descEl || !toggleEl) return;
        
        const isCollapsed = descEl.classList.contains('collapsed');
        descEl.classList.toggle('collapsed', !isCollapsed);
        toggleEl.classList.toggle('expanded', isCollapsed);
        
        const toggleText = toggleEl.querySelector('span');
        if (toggleText) {
            toggleText.textContent = isCollapsed ? Lumina.I18n.t('collapse') : Lumina.I18n.t('expand');
        }
    },
    
    // 更新简介展开按钮状态
    updateDescToggle() {
        const descEl = document.getElementById('bookDetailDescription');
        const toggleEl = document.getElementById('bookDetailDescToggle');
        if (!descEl || !toggleEl) return;
        
        // 只有内容超过3行才显示展开按钮
        const needsToggle = descEl.textContent.length > 60;
        toggleEl.style.display = needsToggle ? 'inline-flex' : 'none';
        
        const toggleText = toggleEl.querySelector('span');
        if (toggleText) {
            toggleText.textContent = Lumina.I18n.t('expand');
        }
        toggleEl.classList.remove('expanded');
        descEl.classList.add('collapsed');
    },
    
    // ========== 就地编辑功能 ==========
    
    // 通用文本编辑
    // options: { el, field, inputClass?, defaultValue?, transform?(value), onSave?(value), refreshCover?, clearExtracted? }
    _editText({ el, field, inputClass, defaultValue = '', transform, onSave, refreshCover, clearExtracted }) {
        if (!el) return;
        const currentValue = el.textContent.trim();
        const isDefault = defaultValue && currentValue === defaultValue;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = inputClass || (el.id.replace('bookDetail', 'book-detail-').toLowerCase() + '-input');
        input.value = isDefault ? '' : currentValue;
        if (field === 'publishDate') input.placeholder = 'YYYY / YYYY-MM / YYYY-MM-DD';
        
        const handleSave = () => {
            let newValue = input.value.trim();
            if (!newValue && defaultValue) newValue = defaultValue;
            
            if (transform) newValue = transform(newValue);
            const isChanged = newValue !== currentValue;
            
            el.textContent = newValue || defaultValue || 'NA';
            el.style.display = '';
            
            // 清除自动提取标记（确保圆点立即消失）
            if (clearExtracted && isChanged) {
                el.removeAttribute('data-auto-extracted');
            }
            
            input.remove();
            
            // 保存到 metadata（如果是默认值则存空字符串）
            const saveValue = (defaultValue && newValue === defaultValue) ? '' : newValue;
            const updates = { [field]: saveValue };
            
            // 如果需要清除自动提取标记
            if (clearExtracted && isChanged) {
                updates._clearExtracted = { [field]: true };
            }
            
            this.saveMetadata(updates);
            
            // 回调
            if (onSave) onSave(newValue);
            
            // 刷新封面（如果需要且确实改变了）
            if (refreshCover && isChanged && !this.currentFile.cover && Lumina.State.settings.hashCover) {
                this.refreshGeneratedCover();
            }
        };
        
        input.addEventListener('blur', handleSave);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        
        el.style.display = 'none';
        el.parentNode.insertBefore(input, el);
        input.focus();
        input.select();
    },
    
    // 编辑书名
    editName() {
        this._editText({
            el: document.getElementById('bookDetailName'),
            field: 'title',
            refreshCover: true,
            clearExtracted: true
        });
    },
    
    // 编辑作者
    editAuthor() {
        this._editText({
            el: document.getElementById('bookDetailAuthor'),
            field: 'author',
            inputClass: 'book-detail-author-input',
            defaultValue: Lumina.I18n.t('anonymousAuthor') || '佚名',
            refreshCover: true,
            clearExtracted: true
        });
    },
    
    // 编辑发布时间
    editPublishDate() {
        const el = document.getElementById('bookDetailPublishDate');
        if (!el) return;
        
        const currentValue = el.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'book-detail-info-input';
        input.value = currentValue === 'NA' ? '' : currentValue;
        input.placeholder = 'YYYY / YYYY-MM / YYYY-MM-DD';
        
        input.addEventListener('blur', () => {
            const normalized = this.normalizePublishDate(input.value);
            const displayValue = this.formatPublishDate(normalized) || 'NA';
            const isChanged = displayValue !== currentValue;
            el.textContent = displayValue;
            el.style.display = 'block';
            input.remove();
            // 清除自动提取标记
            if (isChanged) {
                el.removeAttribute('data-auto-extracted');
            }
            this.saveMetadata({ 
                publishDate: normalized,
                _clearExtracted: { publishDate: true }
            });
        });
        
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        
        el.style.display = 'none';
        el.parentNode.appendChild(input);
        input.focus();
        input.select();
    },
    
    // 编辑发布平台
    editPublisher() {
        this._editText({
            el: document.getElementById('bookDetailPublisher'),
            field: 'publisher',
            inputClass: 'book-detail-info-input',
            defaultValue: 'NA',
            clearExtracted: true
        });
    },
    
    // 编辑语言 - 手风琴下拉菜单
    editLanguage() {
        const el = document.getElementById('bookDetailLanguage');
        const menu = document.getElementById('bookDetailLanguageMenu');
        if (!el || !menu) return;
        
        const currentValue = el.textContent.trim();
        
        // 如果菜单已打开，则关闭
        if (menu.classList.contains('open')) {
            this.closeLanguageMenu();
            return;
        }
        
        // 标记选中项
        menu.querySelectorAll('.language-option').forEach(option => {
            option.classList.toggle('active', option.dataset.value === currentValue);
        });
        
        // 展开菜单
        menu.classList.add('open');
        
        // 绑定选项点击事件
        const handleOptionClick = (e) => {
            const option = e.target.closest('.language-option');
            if (!option) return;
            
            const newValue = option.dataset.value;
            el.textContent = newValue;
            // 清除自动提取标记
            el.removeAttribute('data-auto-extracted');
            this.saveMetadata({ 
                language: newValue,
                _clearExtracted: { language: true }
            });
            this.closeLanguageMenu();
        };
        
        menu._clickHandler = handleOptionClick;
        menu.addEventListener('click', handleOptionClick);
        
        // 点击外部关闭
        const handleOutsideClick = (e) => {
            if (!el.contains(e.target) && !menu.contains(e.target)) {
                this.closeLanguageMenu();
            }
        };
        
        document._languageOutsideHandler = handleOutsideClick;
        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 0);
    },
    
    // 关闭语言选择菜单
    closeLanguageMenu() {
        const menu = document.getElementById('bookDetailLanguageMenu');
        if (!menu) return;
        
        menu.classList.remove('open');
        
        // 移除事件监听
        if (menu._clickHandler) {
            menu.removeEventListener('click', menu._clickHandler);
            delete menu._clickHandler;
        }
        if (document._languageOutsideHandler) {
            document.removeEventListener('click', document._languageOutsideHandler);
            delete document._languageOutsideHandler;
        }
    },
    
    // 编辑简介
    editDescription() {
        const textEl = document.getElementById('bookDetailDescription');
        const container = textEl.parentNode;
        if (!textEl || !container) return;
        
        const currentValue = textEl.textContent.trim();
        const isPlaceholder = currentValue === Lumina.I18n.t('noDescription');
        
        const textarea = document.createElement('textarea');
        textarea.name = 'book-detail-description-input';
        textarea.className = 'book-detail-description-input';
        textarea.value = isPlaceholder ? '' : currentValue;
        textarea.maxLength = 1000;
        
        const hint = document.createElement('div');
        hint.className = 'book-detail-description-hint';
        hint.textContent = `${textarea.value.length}/1000`;
        
        textarea.addEventListener('input', () => {
            hint.textContent = `${textarea.value.length}/1000`;
        });
        
        textarea.addEventListener('blur', () => {
            const newValue = textarea.value.trim();
            const isChanged = newValue !== currentValue;
            textEl.textContent = newValue || Lumina.I18n.t('noDescription');
            textEl.style.display = '-webkit-box';
            textEl.classList.add('collapsed');
            textarea.remove();
            hint.remove();
            // 清除自动提取标记
            if (isChanged) {
                textEl.removeAttribute('data-auto-extracted');
            }
            this.saveMetadata({ 
                description: newValue,
                _clearExtracted: { description: true }
            });
            this.updateDescToggle();
        });
        
        textEl.style.display = 'none';
        container.insertBefore(textarea, textEl);
        container.insertBefore(hint, textEl);
        
        // 隐藏展开按钮
        const toggle = document.getElementById('bookDetailDescToggle');
        if (toggle) toggle.style.display = 'none';
        
        textarea.focus();
    },
    
    // 触发封面上传
    triggerCoverUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // 检查文件大小 (5MB)
            let imageData = await this.readFileAsDataURL(file);
            
            if (file.size > 5 * 1024 * 1024) {
                // 压缩图片
                imageData = await this.compressImage(imageData, 800, 0.8);
            }
            
            // 更新封面显示
            const coverImg = document.getElementById('bookDetailCover');
            if (coverImg) {
                coverImg.src = imageData;
            }
            
            // 保存到数据库
            await this.saveCover(imageData);
        });
        
        input.click();
    },
    
    // 读取文件为 DataURL
    readFileAsDataURL(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    },
    
    // 压缩图片
    compressImage(dataUrl, maxWidth, quality) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = Math.round(height * maxWidth / width);
                    width = maxWidth;
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = dataUrl;
        });
    },
    
    // 保存封面
    async saveCover(imageData) {
        if (!this.currentFile) return;
        
        const fileKey = this.currentFile.fileKey;
        
        // 更新当前文件数据
        this.currentFile.cover = imageData;
        
        // 保存到数据库
        await Lumina.DB.adapter.saveFile(fileKey, {
            ...this.currentFile,
            cover: imageData
        });
        
        // 立即刷新详情页封面显示
        const coverEl = document.getElementById('bookDetailCover');
        if (coverEl) {
            coverEl.innerHTML = `<img src="${imageData}" class="book-detail-cover-img" alt="" onerror="this.parentNode.innerHTML='<div class=\'book-detail-cover-placeholder\'><svg><use href=\'#icon-book\'/></svg></div>';">`;
        }
        
        // 刷新书库显示
        if (window.dataManager) {
            window.dataManager.refreshStats();
        }
    },
    
    // 绑定封面滑动操作（移动端）
    bindCoverSwipeActions() {
        const isMobile = window.innerWidth <= 768;
        if (!isMobile) return;
        
        const swipeLayer = document.getElementById('bookDetailCoverSwipeLayer');
        const content = document.querySelector('.book-detail-cover-content');
        if (!swipeLayer || !content) return;
        
        let startX = 0;
        let currentX = 0;
        let isDragging = false;
        const SWIPE_THRESHOLD = 80; // 与按钮宽度一致，滑动超过按钮宽度即触发
        
        const handleTouchStart = (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
            content.style.transition = 'none';
            // 【关键】阻止事件冒泡，避免触发页面级别的书籍切换滑动
            // 使用标志而非 stopPropagation，以免影响其他交互
            window._bookDetailCoverSwiping = true;
        };
        
        const handleTouchMove = (e) => {
            if (!isDragging) return;
            
            currentX = e.touches[0].clientX;
            const deltaX = currentX - startX;
            
            // 跟随手指移动，最大显示操作按钮宽度
            const maxDrag = 80;
            if (Math.abs(deltaX) <= maxDrag) {
                content.style.transform = `translateX(${deltaX}px)`;
            } else {
                // 超出范围时限制移动
                content.style.transform = `translateX(${deltaX > 0 ? maxDrag : -maxDrag}px)`;
            }
            
            // 【关键】滑动过程中阻止默认行为，避免页面滚动干扰
            if (Math.abs(deltaX) > 10) {
                e.preventDefault();
            }
        };
        
        const handleTouchEnd = () => {
            // 清除标志
            window._bookDetailCoverSwiping = false;
            if (!isDragging) return;
            isDragging = false;
            
            const deltaX = currentX - startX;
            content.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
            
            if (deltaX > SWIPE_THRESHOLD) {
                // 右滑 - 更新封面
                content.style.transform = '';
                this.triggerCoverUpload();
            } else if (deltaX < -SWIPE_THRESHOLD) {
                // 左滑 - 删除封面（仅当有真实封面时）
                if (this.currentFile?.cover) {
                    content.style.transform = '';
                    this.deleteCover();
                } else {
                    content.style.transform = '';
                }
            } else {
                // 复位
                content.style.transform = '';
            }
        };
        
        swipeLayer.addEventListener('touchstart', handleTouchStart, { passive: true });
        swipeLayer.addEventListener('touchmove', handleTouchMove, { passive: true });
        swipeLayer.addEventListener('touchend', handleTouchEnd);
    },
    
    // 删除封面
    async deleteCover() {
        if (!this.currentFile) return;
        
        const fileKey = this.currentFile.fileKey;
        
        // 使用阅读器自己的对话框确认删除
        Lumina.UI.showDialog(Lumina.I18n.t('confirmClear') || '确定要清除封面吗？', 'confirm', async (confirmed) => {
            if (!confirmed) return;
            
            // 更新当前文件数据
            this.currentFile.cover = null;
            
            // 保存到数据库
            await Lumina.DB.adapter.saveFile(fileKey, {
                ...this.currentFile,
                cover: null
            });
            
            // 立即刷新详情页封面显示为占位符
            const coverEl = document.getElementById('bookDetailCover');
            const coverWrapper = document.getElementById('bookDetailCoverWrapper');
            if (coverEl) {
                coverEl.innerHTML = '<div class="book-detail-cover-placeholder"><svg><use href="#icon-book"/></svg></div>';
            }
            if (coverWrapper) {
                coverWrapper.classList.add('no-cover');
            }
            
            // 刷新书库显示
            if (window.dataManager) {
                window.dataManager.refreshStats();
            }
        });
    },
    
    // 保存元数据
    async saveMetadata(updates) {
        if (!this.currentFile) return;
        
        const fileKey = this.currentFile.fileKey;
        const existingMeta = this.currentFile.metadata || {};
        
        // 合并 metadata，保留 _extracted 信息
        const metadata = {
            ...existingMeta,
            ...updates,
            // 保留提取信息（如果有）
            _extracted: existingMeta._extracted
        };
        
        // 如果用户手动编辑了之前自动提取的字段，清除自动提取标记
        if (updates._clearExtracted) {
            if (!metadata._extracted) metadata._extracted = {};
            if (!metadata._extracted.confidence) metadata._extracted.confidence = {};
            
            // 清除指定字段的自动提取标记（设为100表示用户已确认）
            if (updates._clearExtracted.title) {
                metadata._extracted.confidence.title = 100;
            }
            if (updates._clearExtracted.author) {
                metadata._extracted.confidence.author = 100;
            }
            if (updates._clearExtracted.publishDate) {
                metadata._extracted.confidence.publishDate = 100;
            }
            if (updates._clearExtracted.publisher) {
                metadata._extracted.confidence.publisher = 100;
            }
            if (updates._clearExtracted.description) {
                metadata._extracted.confidence.description = 100;
            }
            if (updates._clearExtracted.language) {
                metadata._extracted.confidence.language = 100;
            }
            
            // 删除临时标记
            delete updates._clearExtracted;
        }
        
        // 更新当前文件数据
        this.currentFile.metadata = metadata;
        
        // 保存到数据库
        await Lumina.DB.adapter.saveFile(fileKey, {
            ...this.currentFile,
            metadata
        });
        
        // 刷新书库显示
        if (window.dataManager) {
            window.dataManager.refreshStats();
        }
    },
    
    // 开始阅读
    async startReading() {
        if (!this.currentFile) return;
        
        const fileKey = this.currentFile.fileKey;
        
        // 关闭详情面板
        this.close();
        
        // 打开书籍
        if (window.dataManager?.openFile) {
            await window.dataManager.openFile(fileKey);
        } else {
            console.error('[BookDetail] DataManager 未初始化');
        }
    }
};
