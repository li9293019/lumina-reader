// ==================== 书籍详情面板 ====================

Lumina.BookDetail = {
    // 当前书籍数据
    currentFile: null,
    
    // 切换相关状态
    fileList: [],        // 当前列表
    currentIndex: 0,     // 当前索引
    isSwitching: false,  // 是否正在切换中
    
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
    
    // 初始化
    init() {
        this.bindEvents();
        this.createDatalists();
        this.initSwipeGesture();
    },
    
    // 创建 datalist（语言选择等）
    createDatalists() {
        if (document.getElementById('languageOptions')) return;
        
        const datalist = document.createElement('datalist');
        datalist.id = 'languageOptions';
        datalist.innerHTML = `
            <option value="简体中文">
            <option value="繁體中文">
            <option value="English">
            <option value="日本語">
            <option value="한국어">
            <option value="Français">
            <option value="Deutsch">
            <option value="Español">
        `;
        document.body.appendChild(datalist);
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
        
        // 发布平台编辑
        const publisherEl = document.getElementById('bookDetailPublisher');
        if (publisherEl) {
            publisherEl.addEventListener('click', () => this.editPublisher());
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
        
        // 渲染数据
        this.render();
        
        // 渲染切换按钮
        this.renderNavButtons();
        
        // 绑定tooltip
        if (Lumina.UI?.setupCustomTooltip) {
            Lumina.UI.setupCustomTooltip();
        }
        
        // 绑定键盘事件
        this.bindKeyboardEvents();
        
        // 显示面板
        const panel = document.getElementById('bookDetailPanel');
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
    // animationDirection: 可选，用于指定动画方向（移动端滑动时使用相反方向）
    switchBook(direction, animationDirection) {
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
        
        // 执行切换动画，移动端滑动时使用相反的动画方向
        const animDirection = animationDirection || direction;
        this.animateSwitch(animDirection, () => {
            this.currentIndex = newIndex;
            this.currentFile = this.fileList[newIndex];
            this.render();
            this.isSwitching = false;
        });
    },
    
    // 切换动画（仅使用位移，避免透明度变化导致背景穿透）
    animateSwitch(direction, callback) {
        const container = document.querySelector('.book-detail-container');
        if (!container) {
            callback();
            return;
        }
        
        // next(下一本)：当前内容向右滑出，新内容从左侧滑入（像翻页到下一页）
        // prev(上一本)：当前内容向左滑出，新内容从右侧滑入（像翻页到上一页）
        const slideOut = direction === 'next' ? '100%' : '-100%';
        const slideIn = direction === 'next' ? '-100%' : '100%';
        
        // 第一阶段：当前内容滑出（保持透明度不变）
        container.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
        container.style.transform = `translateX(${slideOut})`;
        
        setTimeout(() => {
            callback();
            // 第二阶段：瞬间重置位置并滑入
            container.style.transition = 'none';
            container.style.transform = `translateX(${slideIn})`;
            
            requestAnimationFrame(() => {
                container.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
                container.style.transform = 'translateX(0)';
            });
        }, 250);
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
            if (e.target.closest('input') || e.target.closest('textarea') || e.target.closest('.book-detail-info-input')) {
                return;
            }

            if (e.target.closest('.book-detail-info-list') || e.target.closest('.book-detail-description') || e.target.closest('.tag-input-container')) {
                return;
            }
            
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
                    // 右滑（手指从左往右）：显示上一本，但动画向右滑出（跟随手指）
                    this.switchBook('prev', 'next');
                } else {
                    // 左滑（手指从右往左）：显示下一本，但动画向左滑出（跟随手指）
                    this.switchBook('next', 'prev');
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
    
    // 渲染数据
    render() {
        if (!this.currentFile) return;
        
        const data = this.currentFile;
        const metadata = data.metadata || {};
        
        // 封面
        const coverEl = document.getElementById('bookDetailCover');
        const coverWrapper = document.getElementById('bookDetailCoverWrapper');
        if (coverEl) {
            if (data.cover) {
                // 有真实封面
                coverEl.innerHTML = `<img src="${data.cover}" class="book-detail-cover-img" alt="" onerror="this.parentNode.innerHTML='<div class=\'book-detail-cover-placeholder\'><svg><use href=\'#icon-book\'/></svg></div>';">`;
                coverWrapper?.classList.remove('no-cover');
            } else if (Lumina.State.settings.hashCover && Lumina.CoverGenerator) {
                // 无真实封面但开启哈希封面，使用生成封面（直接插入 SVG 以继承页面字体）
                const generatedCover = Lumina.CoverGenerator.getCoverSVG(data);
                if (generatedCover) {
                    coverEl.innerHTML = generatedCover;
                    coverEl.querySelector('svg')?.classList.add('book-detail-cover-img');
                    coverWrapper?.classList.remove('no-cover');
                } else {
                    coverEl.innerHTML = '<div class="book-detail-cover-placeholder"><svg><use href="#icon-book"/></svg></div>';
                    coverWrapper?.classList.add('no-cover');
                }
            } else {
                coverEl.innerHTML = '<div class="book-detail-cover-placeholder"><svg><use href="#icon-book"/></svg></div>';
                coverWrapper?.classList.add('no-cover');
            }
        }
        
        // 删除按钮显示控制（无真实封面时隐藏）
        const deleteBtn = document.querySelector('.book-detail-cover-hover-actions .delete-btn');
        if (deleteBtn) {
            deleteBtn.style.display = data.cover ? '' : 'none';
        }
        
        // 文件类型胶囊
        const formatBadge = document.getElementById('bookDetailFormatBadge');
        if (formatBadge) {
            const fileType = data.fileType || 'default';
            formatBadge.textContent = fileType.toUpperCase();
            formatBadge.dataset.type = fileType;
        }
        
        // 书名（优先使用提取/编辑的元数据，其次是文件名）
        const nameEl = document.getElementById('bookDetailName');
        if (nameEl) {
            const displayName = metadata.title || this.getFileNameWithoutExt(data.fileName);
            nameEl.textContent = displayName;
            // 如果书名是自动提取的，添加提示样式
            if (metadata.title && metadata._extracted?.confidence?.title >= 70) {
                nameEl.dataset.autoExtracted = 'true';
            } else {
                delete nameEl.dataset.autoExtracted;
                delete nameEl.dataset.tooltip;
            }
        }
        
        // 作者（优先使用提取的元数据）
        const authorEl = document.getElementById('bookDetailAuthor');
        if (authorEl) {
            const authorText = metadata.author;
            // 如果没有作者，根据语言显示对应默认值：佚名 / Anonymous
            authorEl.textContent = authorText || Lumina.I18n.t('anonymousAuthor') || '佚名';
            // 如果作者是自动提取的，添加提示样式
            if (authorText && metadata._extracted?.confidence?.author >= 70) {
                authorEl.dataset.autoExtracted = 'true';
            } else {
                delete authorEl.dataset.autoExtracted;
                delete authorEl.dataset.tooltip;
            }
        }
        
        // 发布时间
        const publishDateEl = document.getElementById('bookDetailPublishDate');
        if (publishDateEl) {
            publishDateEl.textContent = this.formatPublishDate(metadata.publishDate) || 'NA';
        }
        
        // 发布平台（如果有sourceUrl，显示为可点击链接）
        const publisherEl = document.getElementById('bookDetailPublisher');
        if (publisherEl) {
            const hasSourceUrl = metadata.sourceUrl && metadata.sourceUrl.startsWith('http');
            publisherEl.textContent = metadata.publisher || 'NA';
            publisherEl.style.cursor = hasSourceUrl ? 'pointer' : 'default';
            publisherEl.style.textDecoration = hasSourceUrl ? 'underline' : 'none';
            publisherEl.style.color = hasSourceUrl ? 'var(--accent)' : '';
            
            // 点击跳转外部链接
            publisherEl.onclick = hasSourceUrl ? () => {
                Lumina.UI.showDialog(
                    Lumina.I18n.t('externalLinkConfirm', metadata.sourceUrl), 
                    'confirm', 
                    (confirmed) => {
                        if (confirmed) {
                            window.open(metadata.sourceUrl, '_blank', 'noopener,noreferrer');
                        }
                    }
                );
            } : null;
        }
        
        // 语言
        const languageEl = document.getElementById('bookDetailLanguage');
        if (languageEl) {
            languageEl.textContent = metadata.language || 'NA';
        }
        
        // 文件名
        const fileNameEl = document.getElementById('bookDetailFileName');
        if (fileNameEl) {
            fileNameEl.textContent = data.fileName || 'NA';
        }
        
        // 简介
        const descEl = document.getElementById('bookDetailDescription');
        if (descEl) {
            const description = metadata.description || '';
            descEl.textContent = description || Lumina.I18n.t('noDescription');
            descEl.classList.toggle('collapsed', description.length > 60);
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
    
    // 刷新生成的封面（书名/作者编辑后调用）
    refreshGeneratedCover() {
        if (!this.currentFile) return;
        
        const coverEl = document.getElementById('bookDetailCover');
        const coverWrapper = document.getElementById('bookDetailCoverWrapper');
        
        if (coverEl && Lumina.CoverGenerator) {
            // 清除缓存，强制重新生成
            Lumina.CoverGenerator.clearCache();
            const generatedCover = Lumina.CoverGenerator.getCoverSVG(this.currentFile);
            if (generatedCover) {
                coverEl.innerHTML = generatedCover;
                coverEl.querySelector('svg')?.classList.add('book-detail-cover-img');
                coverWrapper?.classList.remove('no-cover');
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
    
    // 编辑书名
    editName() {
        const el = document.getElementById('bookDetailName');
        if (!el) return;
        
        const currentValue = el.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.name = 'book-detail-name-input';
        input.className = 'book-detail-name-input';
        input.value = currentValue;
        
        input.addEventListener('blur', () => {
            const newValue = input.value.trim() || currentValue;
            const isChanged = newValue !== currentValue;
            el.textContent = newValue;
            el.style.display = 'block';
            input.remove();
            this.saveMetadata({ title: newValue });
            // 如果书名改变且使用生成封面，刷新封面
            if (isChanged && !this.currentFile.cover && Lumina.State.settings.hashCover) {
                this.refreshGeneratedCover();
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
        });
        
        el.style.display = 'none';
        el.parentNode.insertBefore(input, el);
        input.focus();
        input.select();
    },
    
    // 编辑作者
    editAuthor() {
        const el = document.getElementById('bookDetailAuthor');
        if (!el) return;
        
        const currentValue = el.textContent;
        const defaultAuthor = Lumina.I18n.t('anonymousAuthor') || '佚名';
        const input = document.createElement('input');
        input.type = 'text';
        input.name = 'book-detail-author-input';
        input.className = 'book-detail-author-input';
        // 如果当前是默认值，则输入框显示为空，方便用户输入
        input.value = currentValue === defaultAuthor ? '' : currentValue;
        
        input.addEventListener('blur', () => {
            const newValue = input.value.trim() || defaultAuthor;
            const isChanged = newValue !== currentValue;
            el.textContent = newValue;
            el.style.display = 'inline';
            input.remove();
            // 如果用户输入的是默认值，则保存为空字符串（表示未指定）
            this.saveMetadata({ author: newValue === defaultAuthor ? '' : newValue });
            // 如果作者改变且使用生成封面，刷新封面
            if (isChanged && !this.currentFile.cover && Lumina.State.settings.hashCover) {
                this.refreshGeneratedCover();
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
        });
        
        el.style.display = 'none';
        el.parentNode.insertBefore(input, el);
        input.focus();
        input.select();
    },
    
    // 编辑发布时间
    editPublishDate() {
        const el = document.getElementById('bookDetailPublishDate');
        if (!el) return;
        
        const currentValue = el.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.name = 'book-detail-info-input';
        input.className = 'book-detail-info-input';
        input.value = currentValue === 'NA' ? '' : currentValue;
        input.placeholder = 'YYYY / YYYY-MM / YYYY-MM-DD';
        
        input.addEventListener('blur', () => {
            const normalized = this.normalizePublishDate(input.value);
            const displayValue = this.formatPublishDate(normalized) || 'NA';
            el.textContent = displayValue;
            el.style.display = 'block';
            input.remove();
            this.saveMetadata({ publishDate: normalized });
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
        });
        
        el.style.display = 'none';
        el.parentNode.appendChild(input);
        input.focus();
        input.select();
    },
    
    // 编辑发布平台
    editPublisher() {
        const el = document.getElementById('bookDetailPublisher');
        if (!el) return;
        
        const currentValue = el.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.name = 'book-detail-info-input';
        input.className = 'book-detail-info-input';
        input.value = currentValue === 'NA' ? '' : currentValue;
        
        input.addEventListener('blur', () => {
            const newValue = input.value.trim() || 'NA';
            el.textContent = newValue;
            el.style.display = 'block';
            input.remove();
            this.saveMetadata({ publisher: newValue === 'NA' ? '' : newValue });
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
        });
        
        el.style.display = 'none';
        el.parentNode.appendChild(input);
        input.focus();
        input.select();
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
            this.saveMetadata({ language: newValue });
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
            textEl.textContent = newValue || Lumina.I18n.t('noDescription');
            textEl.style.display = '-webkit-box';
            textEl.classList.add('collapsed');
            textarea.remove();
            hint.remove();
            this.saveMetadata({ description: newValue });
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
        if (updates.title && existingMeta._extracted?.confidence?.title >= 70) {
            if (metadata._extracted) {
                metadata._extracted.confidence.title = 100; // 用户确认，设为最高置信度
            }
        }
        if (updates.author && existingMeta._extracted?.confidence?.author >= 70) {
            if (metadata._extracted) {
                metadata._extracted.confidence.author = 100;
            }
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
