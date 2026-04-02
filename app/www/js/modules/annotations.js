// ==================== 20. 注释与书签管理 ====================

Lumina.Annotations = {
    // 颜色配置
    colors: [
        { id: 'yellow', bg: 'rgba(255, 235, 59, 0.4)', border: '#F9A825', name: '黄色' },
        { id: 'green', bg: 'rgba(76, 175, 80, 0.3)', border: '#388E3C', name: '绿色' },
        { id: 'blue', bg: 'rgba(33, 150, 243, 0.3)', border: '#1976D2', name: '蓝色' },
        { id: 'pink', bg: 'rgba(233, 30, 99, 0.3)', border: '#C2185B', name: '粉色' },
        { id: 'purple', bg: 'rgba(156, 39, 176, 0.3)', border: '#7B1FA2', name: '紫色' },
        { id: 'orange', bg: 'rgba(255, 152, 0, 0.3)', border: '#F57C00', name: '橙色' }
    ],
    
    // 初始化
    init() {
        this.setupContextMenu();
        this.setupPanel();
        this.setupTooltipDelegation();
        this.loadAnnotations();
    },
    
    // 加载当前文件的注释
    loadAnnotations() {
        const fileKey = Lumina.State.app.currentFile.fileKey;
        if (!fileKey) {
            Lumina.State.app.annotations = [];
            return;
        }
        // 从数据库加载会在 restoreFileFromDB 中处理
        // 这里只负责初始化 UI
        this.renderAnnotations();
    },
    
    // 设置上下文菜单（选中文本后显示）
    setupContextMenu() {
        // 创建上下文菜单
        const menu = document.createElement('div');
        menu.id = 'annotationContextMenu';
        menu.className = 'annotation-context-menu';
        document.body.appendChild(menu);
        
        // 隐藏菜单
        const hideMenu = () => {
            menu.classList.remove('show');
            this.currentLineIndex = null;
        };
        
        // 点击外部隐藏
        const handleClickOutside = (e) => {
            if (!e.target.closest('#annotationContextMenu')) {
                hideMenu();
            }
        };
        document.addEventListener('click', handleClickOutside);
        document.addEventListener('scroll', hideMenu, true);
        
        // 菜单点击事件
        menu.addEventListener('click', async (e) => {
            const item = e.target.closest('.annotation-menu-item');
            const color = e.target.closest('.color-option');
            
            if (item) {
                const action = item.dataset.action;
                await this.handleMenuAction(action);
                hideMenu();
            } else if (color) {
                const colorId = color.dataset.color;
                await this.handleColorClick(colorId);
            }
        });
        
        // 监听选中文本（桌面端和移动端）
        let selectionTimeout;
        const handleSelection = (e) => {
            clearTimeout(selectionTimeout);
            selectionTimeout = setTimeout(() => {
                const selection = window.getSelection();
                const text = selection.toString().trim();
                
                if (text && this.isInContent(e.target)) {
                    this.pendingSelection = this.saveSelectionInfo(selection);
                    this.pendingSelection.text = text;
                    this.pendingSelection.selectedText = text;
                    this.showContextMenu(menu, selection);
                }
            }, 50);
        };
        
        document.addEventListener('mouseup', handleSelection);
        
        // 移动端：监听选区变化
        let lastSelectionText = '';
        document.addEventListener('selectionchange', () => {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            
            // 只在有选区且文本变化时处理
            if (text && text !== lastSelectionText) {
                lastSelectionText = text;
                
                // 延迟检查，确保选区稳定
                clearTimeout(selectionTimeout);
                selectionTimeout = setTimeout(() => {
                    const currentSelection = window.getSelection();
                    const currentText = currentSelection.toString().trim();
                    
                    if (currentText === text && this.isInContent(currentSelection.anchorNode)) {
                        this.pendingSelection = this.saveSelectionInfo(currentSelection);
                        this.pendingSelection.text = text;
                        this.pendingSelection.selectedText = text;
                        
                        // 获取选区位置
                        try {
                            const range = currentSelection.getRangeAt(0);
                            this.showContextMenu(menu, currentSelection, window.innerWidth <= 768);
                        } catch (e) {
                            // 如果无法获取范围，使用长按目标
                            if (this.longPressTarget) {
                                this.showContextMenu(menu, null, true);
                            }
                        }
                    }
                }, 300);
            } else if (!text) {
                lastSelectionText = '';
            }
        });
        
        // 移动端支持：长按段落显示菜单
        let touchTimeout;
        let touchStartTime;
        
        const contentArea = document.getElementById('contentWrapper');
        if (contentArea) {
            // 阻止默认的上下文菜单
            contentArea.addEventListener('contextmenu', (e) => {
                if (window.innerWidth < 768) {
                    e.preventDefault();
                }
                return false;
            });
            
            contentArea.addEventListener('touchstart', (e) => {
                // 写死单指操作：只有单指触摸才触发标注
                if (e.touches.length !== 1) return;
                // 双指缩放时不触发标注
                if (window.LuminaPinchState?.isPinching) return;
                // 排除页码导航区域
                if (e.target.closest('.pagination-nav, .pagination-main, .pagination-arrow, .pagination-num')) {
                    return;
                }
                
                touchStartTime = Date.now();
                this.longPressTarget = e.target.closest('[data-index]');
                
                if (this.longPressTarget) {
                    touchTimeout = setTimeout(() => {
                        // 长按时获取选区
                        const selection = window.getSelection();
                        const text = selection.toString().trim();
                        
                        // 只有在有选区的情况下才触发注释面板
                        if (text && this.isInSelection(this.longPressTarget)) {
                            // 有选区且包含当前行
                            this.pendingSelection = this.saveSelectionInfo(selection);
                            this.pendingSelection.text = text;
                            this.pendingSelection.selectedText = text;
                            
                            // 震动反馈
                            if (navigator.vibrate) navigator.vibrate(50);
                            
                            this.showContextMenu(menu, null, true);
                        }
                        // 无选区时不触发注释面板（让全屏切换能正常工作）
                    }, 600);
                }
            }, { passive: false });
            
            contentArea.addEventListener('touchmove', () => {
                clearTimeout(touchTimeout);
            }, { passive: true });
            
            contentArea.addEventListener('touchend', () => {
                clearTimeout(touchTimeout);
            }, { passive: true });
        }
    },
    
    // 检查选区是否包含指定元素
    isInSelection(element) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return false;
        
        const range = selection.getRangeAt(0);
        return range.commonAncestorContainer.contains(element) || 
               element.contains(range.commonAncestorContainer);
    },
    
    // 显示上下文菜单
    showContextMenu(menu, selection, isMobile = false) {
        const t = Lumina.I18n.t;
        const lineIndex = this.pendingSelection?.startLine;
        if (lineIndex === undefined) return;
        
        // 查找当前行已有的注释/书签
        const chapterIndex = Lumina.State.app.currentChapterIndex;
        const existingBookmark = Lumina.State.app.annotations.find(
            a => a.chapterIndex === chapterIndex && 
                 a.type === 'bookmark' && 
                 a.lineIndex === lineIndex
        );
        const existingAnnotation = Lumina.State.app.annotations.find(
            a => a.chapterIndex === chapterIndex && 
                 a.type === 'annotation' && 
                 a.startLine === lineIndex
        );
        
        this.existingBookmark = existingBookmark;
        this.existingAnnotation = existingAnnotation;
        this.currentLineIndex = lineIndex;
        
        // 构建菜单内容
        let menuItems = '';
        
        // 【第一项】复制文本功能
        const selectedText = this.pendingSelection?.selectedText || '';
        if (selectedText) {
            menuItems += `
                <div class="annotation-menu-item" data-action="copy-text">
                    <svg class="icon"><use href="#icon-copy"/></svg>
                    <span>${t('copyText') || '复制文本'}</span>
                </div>
            `;
        }
        
        // 书签操作
        if (existingBookmark) {
            menuItems += `
                <div class="annotation-menu-item" data-action="delete-bookmark">
                    <svg class="icon"><use href="#icon-delete"/></svg>
                    <span>${t('deleteBookmark') || '删除书签'}</span>
                </div>
            `;
        }
        
        // 注释操作
        if (existingAnnotation) {
            menuItems += `
                <div class="annotation-menu-item" data-action="edit-annotation">
                    <svg class="icon"><use href="#icon-edit"/></svg>
                    <span>${t('editAnnotation') || '编辑注释'}</span>
                </div>
                <div class="annotation-menu-item" data-action="delete-annotation">
                    <svg class="icon"><use href="#icon-delete"/></svg>
                    <span>${t('deleteAnnotation') || '删除注释'}</span>
                </div>
            `;
        } else {
            menuItems += `
                <div class="annotation-menu-item" data-action="add-annotation">
                    <svg class="icon"><use href="#icon-edit"/></svg>
                    <span>${t('addAnnotation') || '添加注释'}</span>
                </div>
            `;
        }
        
        // 颜色选择器（用于书签）
        const currentColor = existingBookmark?.color || existingAnnotation?.color || 'yellow';
        menuItems += `
            <div class="annotation-color-picker">
                ${this.colors.map(c => `
                    <div class="color-option ${c.id === currentColor ? 'active' : ''}" 
                         data-color="${c.id}" 
                         style="background: ${c.bg}; border-color: ${c.border}">
                    </div>
                `).join('')}
            </div>
        `;
        
        menu.innerHTML = menuItems;
        
        // 定位菜单 - 优先使用选区位置
        let targetRect = null;
        
        // 首先尝试使用保存的选区位置信息
        if (this.pendingSelection?.selectionRect) {
            const rect = this.pendingSelection.selectionRect;
            if (rect.width > 0 && rect.height > 0) {
                targetRect = rect;
            }
        }
        
        // 如果没有保存的位置信息，尝试从 selection 获取
        if (!targetRect && selection) {
            try {
                const range = selection.getRangeAt(0);
                targetRect = range.getBoundingClientRect();
            } catch (e) {
                // ignore
            }
        }
        
        // 设置菜单位置
        if (targetRect && targetRect.width > 0) {
            // 使用选区位置（桌面端和移动端都使用选区位置）
            menu.style.position = 'fixed';
            menu.style.left = `${targetRect.left + targetRect.width / 2}px`;
            menu.style.top = `${targetRect.bottom + 10}px`;
            menu.style.bottom = 'auto';
            menu.style.transform = 'translateX(-50%)';
        } else if (isMobile && this.longPressTarget) {
            // 备用：使用长按目标位置
            const rect = this.longPressTarget.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.left = `${rect.left + rect.width / 2}px`;
            menu.style.top = `${rect.bottom + 10}px`;
            menu.style.bottom = 'auto';
            menu.style.transform = 'translateX(-50%)';
        }
        
        menu.classList.add('show');
    },
    
    // 处理颜色点击
    async handleColorClick(colorId) {
        const t = Lumina.I18n.t;
        
        if (this.existingBookmark) {
            // 更新书签颜色
            await this.updateAnnotation(this.existingBookmark.id, { color: colorId });
            Lumina.UI.showToast(t('bookmarkUpdated') || '书签已更新');
        } else if (this.existingAnnotation) {
            // 更新注释颜色
            await this.updateAnnotation(this.existingAnnotation.id, { color: colorId });
            Lumina.UI.showToast(t('annotationUpdated') || '注释已更新');
        } else {
            // 新建书签
            await this.addAnnotation({
                type: 'bookmark',
                chapterIndex: Lumina.State.app.currentChapterIndex,
                lineIndex: this.currentLineIndex,
                color: colorId,
                note: '',
                selectedText: ''
            });
            Lumina.UI.showToast(t('bookmarkAdded') || '书签已添加');
        }
        
        document.getElementById('annotationContextMenu').classList.remove('show');
        window.getSelection().removeAllRanges();
    },
    
    // 检查是否在内容区域
    isInContent(element) {
        if (!element) return false;
        // 如果是文本节点，获取其父元素
        const el = element.nodeType === Node.TEXT_NODE ? element.parentElement : element;
        if (!el) return false;
        
        // 必须在 contentWrapper 内
        if (el.closest('#contentWrapper') === null) return false;
        
        // 排除页码导航区域
        if (el.closest('.pagination-nav, .pagination-main, .pagination-arrow, .pagination-num, .pagination-pages, .pagination-ellipsis')) {
            return false;
        }
        
        return true;
    },
    
    // 保存选区信息
    saveSelectionInfo(selection) {
        const range = selection.getRangeAt(0);
        const startEl = range.startContainer.parentElement?.closest('[data-index]') || 
                       range.startContainer.closest?.('[data-index]');
        const endEl = range.endContainer.parentElement?.closest('[data-index]') || 
                     range.endContainer.closest?.('[data-index]');
        
        // 获取选区的精确文本内容
        const selectedText = selection.toString().trim();
        
        // 获取选区在文档中的位置信息（用于移动端定位菜单）
        const rect = range.getBoundingClientRect();
        
        return {
            startLine: startEl ? parseInt(startEl.dataset.index) : 0,
            endLine: endEl ? parseInt(endEl.dataset.index) : 0,
            startOffset: range.startOffset,
            endOffset: range.endOffset,
            startContainer: range.startContainer.nodeType === Node.TEXT_NODE ? 'text' : 'element',
            endContainer: range.endContainer.nodeType === Node.TEXT_NODE ? 'text' : 'element',
            selectedText: selectedText,
            // 选区位置信息（用于菜单位置）
            selectionRect: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height
            }
        };
    },
    
    // 处理菜单动作
    async handleMenuAction(action) {
        const t = Lumina.I18n.t;
        
        if (action === 'copy-text') {
            // 复制文本
            const textToCopy = this.pendingSelection?.selectedText || '';
            if (textToCopy) {
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    Lumina.UI.showToast(t('textCopied') || '文本已复制');
                } catch (err) {
                    // 备用复制方法
                    const textarea = document.createElement('textarea');
                    textarea.value = textToCopy;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    Lumina.UI.showToast(t('textCopied') || '文本已复制');
                }
            }
        } else if (action === 'add-annotation') {
            // 添加注释
            const color = this.colors.find(c => c.id === (this.existingBookmark?.color || 'yellow'));
            this.showAnnotationEditor(this.pendingSelection, color);
        } else if (action === 'edit-annotation') {
            // 编辑注释
            if (this.existingAnnotation) {
                const color = this.colors.find(c => c.id === this.existingAnnotation.color);
                this.showAnnotationEditor({
                    id: this.existingAnnotation.id,
                    text: this.existingAnnotation.selectedText,
                    note: this.existingAnnotation.note,
                    type: 'annotation',
                    startLine: this.existingAnnotation.startLine,
                    endLine: this.existingAnnotation.endLine
                }, color);
            }
        } else if (action === 'delete-annotation') {
            // 删除注释
            if (this.existingAnnotation) {
                Lumina.UI.showDialog(t('confirmDeleteAnnotation') || '确定删除此注释？', 'confirm', async (result) => {
                    if (result) {
                        await this.deleteAnnotation(this.existingAnnotation.id);
                        Lumina.UI.showToast(t('annotationDeleted') || '注释已删除');
                    }
                });
            }
        } else if (action === 'delete-bookmark') {
            // 删除书签
            if (this.existingBookmark) {
                Lumina.UI.showDialog(t('confirmDeleteBookmark') || '确定删除此书签？', 'confirm', async (result) => {
                    if (result) {
                        await this.deleteAnnotation(this.existingBookmark.id);
                        Lumina.UI.showToast(t('bookmarkDeleted') || '书签已删除');
                    }
                });
            }
        }
        
        // 清除选区
        window.getSelection().removeAllRanges();
    },
    
    // 添加注释
    async addAnnotation(annotation) {
        const anno = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            ...annotation,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        Lumina.State.app.annotations.push(anno);
        await this.saveAnnotations();
        this.renderAnnotations();
        this.renderAnnotationList();
    },
    
    // 更新注释
    async updateAnnotation(id, updates) {
        const anno = Lumina.State.app.annotations.find(a => a.id === id);
        if (anno) {
            Object.assign(anno, updates, { updatedAt: new Date().toISOString() });
            await this.saveAnnotations();
            this.renderAnnotations();
            this.renderAnnotationList();
        }
    },
    
    // 删除注释
    async deleteAnnotation(id) {
        Lumina.State.app.annotations = Lumina.State.app.annotations.filter(a => a.id !== id);
        await this.saveAnnotations();
        this.renderAnnotations();
        this.renderAnnotationList();
    },
    
    // 保存注释到数据库
    async saveAnnotations() {
        const fileKey = Lumina.State.app.currentFile.fileKey;
        if (!fileKey || !Lumina.State.app.dbReady) return;
        
        try {
            const fileData = await Lumina.DB.adapter.getFile(fileKey);
            if (fileData) {
                fileData.annotations = Lumina.State.app.annotations;
                fileData.lastReadTime = Lumina.DB.getLocalTimeString();
                await Lumina.DB.adapter.saveFile(fileKey, fileData);
            }
        } catch (e) {
            console.warn('[Annotations] 保存失败:', e);
        }
    },
    
    // 显示注释编辑器
    showAnnotationEditor(selection, color) {
        const t = Lumina.I18n.t;
        const isBookmark = selection.type === 'bookmark';
        
        // 关闭已存在的对话框（防止堆积）
        document.querySelectorAll('.annotation-dialog-overlay').forEach(d => d.remove());
        
        const dialog = document.createElement('div');
        dialog.className = 'annotation-dialog-overlay';
        dialog.innerHTML = `
            <div class="annotation-dialog">
                <div class="annotation-dialog-header">
                    <span>${isBookmark ? (t('editBookmark') || '编辑书签') : (t('addAnnotation') || '添加注释')}</span>
                    <button class="annotation-dialog-close" aria-label="${t('close') || '关闭'}">
                        <svg class="icon"><use href="#icon-close"/></svg>
                    </button>
                </div>
                <div class="annotation-dialog-body">
                    <div class="annotation-selected-text">
                        "${selection.text || ''}"
                    </div>
                    <div class="annotation-color-picker-row">
                        ${this.colors.map(c => `
                            <div class="color-option-large ${c.id === color.id ? 'active' : ''}" 
                                 data-color="${c.id}" 
                                 style="background: ${c.bg}; border-color: ${c.border}"
                                 role="button" tabindex="0" aria-label="${c.name}">
                            </div>
                        `).join('')}
                    </div>
                    <textarea class="annotation-input" 
                              name="annotation-note"
                              placeholder="${t('annotationPlaceholder') || '输入注释内容...'}"
                              rows="4">${selection.note || ''}</textarea>
                </div>
                <div class="annotation-dialog-footer">
                    <button class="annotation-btn annotation-btn-secondary" data-action="cancel">
                        ${t('cancel') || '取消'}
                    </button>
                    <button class="annotation-btn annotation-btn-primary" data-action="save" disabled>
                        ${t('save') || '保存'}
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // 显示对话框（添加 active 类）
        requestAnimationFrame(() => dialog.classList.add('active'));
        
        // 颜色选择
        let selectedColor = color.id;
        dialog.querySelectorAll('.color-option-large').forEach(btn => {
            btn.addEventListener('click', () => {
                dialog.querySelectorAll('.color-option-large').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedColor = btn.dataset.color;
            });
        });
        
        // 按钮事件
        const saveBtn = dialog.querySelector('[data-action="save"]');
        const input = dialog.querySelector('.annotation-input');
        
        // 编辑模式下允许空内容（变成书签），新建模式需要内容
        const updateSaveButton = () => {
            const hasContent = input.value.trim().length > 0;
            if (selection.id) {
                // 编辑模式：始终可用
                saveBtn.disabled = false;
            } else {
                // 新建模式：需要内容
                saveBtn.disabled = !hasContent;
            }
        };
        
        // 初始状态检查
        updateSaveButton();
        
        // 监听输入
        input.addEventListener('input', updateSaveButton);
        
        dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.annotation-dialog-close').addEventListener('click', () => dialog.remove());
        saveBtn.addEventListener('click', async () => {
            const note = input.value.trim();
            
            if (selection.id) {
                // 编辑模式
                await this.updateAnnotation(selection.id, { note, color: selectedColor });
            } else {
                // 新建模式
                await this.addAnnotation({
                    type: note ? 'annotation' : 'bookmark',
                    chapterIndex: Lumina.State.app.currentChapterIndex,
                    startLine: selection.startLine,
                    endLine: selection.endLine,
                    selectedText: selection.text,
                    color: selectedColor,
                    note
                });
            }
            
            dialog.remove();
            Lumina.UI.showToast(t('annotationSaved') || '已保存');
        });
        
        // 点击遮罩关闭
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
        
        // ESC 关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                dialog.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    },
    
    // 渲染所有注释高亮
    renderAnnotations() {
        // 清除现有高亮和书签样式
        document.querySelectorAll('.has-bookmark').forEach(el => {
            el.classList.remove('has-bookmark');
            el.style.borderLeft = '';
            el.style.background = '';
        });
        
        // 清除注释高亮 - 恢复原始内容
        document.querySelectorAll('.has-annotation').forEach(el => {
            this.clearAnnotationHighlights(el);
            el.classList.remove('has-annotation');
            delete el.dataset.annotationId;
        });
        
        // 渲染当前章节的注释
        const chapterIndex = Lumina.State.app.currentChapterIndex;
        const chapter = Lumina.State.app.chapters[chapterIndex];
        if (!chapter) return;
        
        const chapterAnnotations = Lumina.State.app.annotations.filter(
            a => a.chapterIndex === chapterIndex
        );
        
        chapterAnnotations.forEach(anno => {
            if (anno.type === 'bookmark') {
                this.renderBookmark(anno);
            } else {
                this.renderAnnotationHighlight(anno);
            }
        });
    },
    
    // 渲染书签标记
    renderBookmark(anno) {
        const line = document.querySelector(`[data-index="${anno.lineIndex}"]`);
        if (!line) return;
        
        const color = this.colors.find(c => c.id === anno.color) || this.colors[0];
        line.classList.add('has-bookmark');
        line.style.borderLeft = `4px solid ${color.border}`;
        line.style.background = color.bg;
    },
    
    // 渲染注释高亮 - 使用下划线标注选区文本
    renderAnnotationHighlight(anno) {
        // 只在起始行添加标记（注释是针对选区文本的，不是整个段落）
        const line = document.querySelector(`[data-index="${anno.startLine}"]`);
        if (!line) return;
        
        const color = this.colors.find(c => c.id === anno.color) || this.colors[0];
        const selectedText = anno.selectedText;
        
        if (selectedText && selectedText.length > 0) {
            // 尝试在文本中查找并高亮选中的部分
            this.highlightSelectedText(line, selectedText, anno.color, anno.id);
        }
        
        // 添加标记类但不设置背景色
        line.classList.add('has-annotation');
        line.dataset.annotationId = anno.id;
    },
    
    // 高亮选中的文本
    highlightSelectedText(lineElement, selectedText, colorId, annoId) {
        if (!selectedText || !lineElement) return;
        
        // 保存原始内容（如果还没有保存）
        if (!lineElement.dataset.originalContent) {
            lineElement.dataset.originalContent = lineElement.innerHTML;
        }
        
        const colorClass = colorId || 'yellow';
        
        // 清理选中文本中的多余空白，以便更好地匹配
        const normalizedSearchText = selectedText.replace(/\s+/g, ' ').trim();
        if (!normalizedSearchText) return;
        
        // 尝试找到并替换文本
        // 策略：在文本节点中查找匹配的文本
        const walker = document.createTreeWalker(
            lineElement,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            // 跳过注释高亮内的文本节点
            if (node.parentElement?.classList?.contains('annotation-highlight')) {
                continue;
            }
            textNodes.push(node);
        }
        
        // 合并相邻文本节点进行查找
        let fullText = '';
        const nodeMap = [];
        textNodes.forEach(node => {
            nodeMap.push({
                node: node,
                start: fullText.length,
                end: fullText.length + node.textContent.length
            });
            fullText += node.textContent;
        });
        
        // 查找选中文本在合并后文本中的位置（使用原始文本或规范化文本）
        let matchIndex = fullText.indexOf(selectedText);
        let matchText = selectedText;
        
        // 如果直接查找失败，尝试规范化后的文本
        if (matchIndex === -1) {
            const normalizedFullText = fullText.replace(/\s+/g, ' ');
            matchIndex = normalizedFullText.indexOf(normalizedSearchText);
            if (matchIndex !== -1) {
                // 找到后，在原始文本中重新定位
                matchText = fullText.substring(matchIndex, matchIndex + normalizedSearchText.length);
            }
        }
        
        if (matchIndex !== -1) {
            const matchStart = matchIndex;
            const matchEnd = matchStart + matchText.length;
            
            // 找到包含匹配文本的节点
            let startNodeInfo = null;
            let endNodeInfo = null;
            
            for (const info of nodeMap) {
                if (!startNodeInfo && info.start <= matchStart && matchStart < info.end) {
                    startNodeInfo = info;
                }
                if (info.start < matchEnd && matchEnd <= info.end) {
                    endNodeInfo = info;
                    break;
                }
            }
            
            // 如果匹配在同一节点内，直接替换
            if (startNodeInfo && endNodeInfo && startNodeInfo.node === endNodeInfo.node) {
                const node = startNodeInfo.node;
                const text = node.textContent;
                const relativeStart = matchStart - startNodeInfo.start;
                const relativeEnd = matchEnd - startNodeInfo.start;
                
                const before = text.substring(0, relativeStart);
                const matchedContent = text.substring(relativeStart, relativeEnd);
                const after = text.substring(relativeEnd);
                
                const span = document.createElement('span');
                span.className = `annotation-highlight ${colorClass}`;
                span.dataset.annotationId = annoId;
                span.textContent = matchedContent;
                
                const parent = node.parentNode;
                if (before) parent.insertBefore(document.createTextNode(before), node);
                parent.insertBefore(span, node);
                if (after) parent.insertBefore(document.createTextNode(after), node);
                parent.removeChild(node);
            }
        }
    },
    
    // 清除注释高亮
    clearAnnotationHighlights(lineElement) {
        if (!lineElement || !lineElement.dataset.originalContent) return;
        
        // 恢复原始内容
        lineElement.innerHTML = lineElement.dataset.originalContent;
        delete lineElement.dataset.originalContent;
    },
    
    // 设置悬浮提示（使用事件委托）- 仅注释
    setupTooltipDelegation() {
        const contentArea = document.getElementById('contentWrapper');
        if (!contentArea) return;
        
        // 鼠标进入 - 仅处理注释
        contentArea.addEventListener('mouseenter', (e) => {
            const line = e.target.closest('[data-annotation-id].has-annotation');
            if (!line) return;
            
            const annoId = line.dataset.annotationId;
            const chapterIndex = Lumina.State.app.currentChapterIndex;
            
            // 查找注释（仅注释类型）
            const anno = Lumina.State.app.annotations.find(
                a => a.chapterIndex === chapterIndex && 
                     a.id === annoId && 
                     a.type === 'annotation'
            );
            
            if (anno) {
                this.showAnnotationTooltip(line, anno);
            }
        }, true);
        
        // 鼠标离开
        contentArea.addEventListener('mouseleave', (e) => {
            const line = e.target.closest('[data-annotation-id].has-annotation');
            if (line) {
                this.hideAnnotationTooltip();
            }
        }, true);
        
        // 鼠标移动
        contentArea.addEventListener('mousemove', (e) => {
            if (this.currentTooltipAnno) {
                this.updateAnnotationTooltipPosition(e);
            }
        });
    },
    
    // 显示注释 tooltip
    showAnnotationTooltip(target, anno) {
        let tooltip = document.getElementById('annotation-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'annotation-tooltip';
            tooltip.className = 'annotation-tooltip';
            document.body.appendChild(tooltip);
        }
        
        // 格式化时间
        const date = new Date(anno.createdAt || Date.now());
        const dateStr = date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // 构建 tooltip 内容：时间 + 注释内容
        let content = `<div class="annotation-tooltip-time">${Lumina.I18n.t('annotatedAt')} ${dateStr}</div>`;
        if (anno.note) {
            // 限制长度
            const noteText = anno.note.length > 100 
                ? anno.note.substring(0, 100) + '...' 
                : anno.note;
            content += `<div class="annotation-tooltip-note">${Lumina.Utils.escapeHtml(noteText)}</div>`;
        }
        
        tooltip.innerHTML = content;
        tooltip.classList.add('show');
        
        // 保存当前注释
        this.currentTooltipAnno = anno;
    },
    
    // 隐藏注释 tooltip
    hideAnnotationTooltip() {
        const tooltip = document.getElementById('annotation-tooltip');
        if (tooltip) {
            tooltip.classList.remove('show');
        }
        this.currentTooltipAnno = null;
    },
    
    // 更新 tooltip 位置
    updateAnnotationTooltipPosition(e) {
        const tooltip = document.getElementById('annotation-tooltip');
        if (!tooltip || !this.currentTooltipAnno) return;
        
        const tooltipRect = tooltip.getBoundingClientRect();
        const offset = 15;
        
        let left = e.clientX + offset;
        let top = e.clientY + offset;
        
        // 防止超出屏幕右边界
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = e.clientX - tooltipRect.width - offset;
        }
        
        // 防止超出屏幕下边界
        if (top + tooltipRect.height > window.innerHeight - 10) {
            top = e.clientY - tooltipRect.height - offset;
        }
        
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    },
    
    // 设置注释面板事件
    setupPanel() {
        // 面板已在 HTML 中静态创建，这里只绑定事件
        const panel = document.getElementById('annotationPanel');
        if (!panel) {
            console.warn('[Annotations] 注释面板元素未找到');
            return;
        }
        
        // 关闭按钮
        document.getElementById('closeAnnotationPanel').addEventListener('click', () => {
            panel.classList.remove('open');
        });
    },
    
    // 渲染注释列表
    renderAnnotationList() {
        const list = document.getElementById('annotationList');
        const annotations = Lumina.State.app.annotations;
        const t = Lumina.I18n.t;
        
        if (!annotations.length) {
            list.innerHTML = `
                <div class="annotation-empty">
                    <svg class="icon"><use href="#icon-bookmark"/></svg>
                    <div>${t('noAnnotations') || '暂无注释或书签'}</div>
                    <div class="annotation-hint">${t('annotationHint') || '选中文本添加注释，或点击添加书签'}</div>
                </div>
            `;
            return;
        }
        
        // 按章节分组
        const grouped = {};
        annotations.forEach(anno => {
            if (!grouped[anno.chapterIndex]) grouped[anno.chapterIndex] = [];
            grouped[anno.chapterIndex].push(anno);
        });
        
        let html = '';
        Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b)).forEach(chIdx => {
            const chapter = Lumina.State.app.chapters[chIdx];
            const title = chapter ? (chapter.title || `第${parseInt(chIdx)+1}章`) : `第${parseInt(chIdx)+1}章`;
            
            html += `<div class="annotation-group">`;
            html += `<div class="annotation-group-title">${Lumina.Utils.escapeHtml(title)}</div>`;
            
            grouped[chIdx].forEach(anno => {
                const color = this.colors.find(c => c.id === anno.color) || this.colors[0];
                const isBookmark = anno.type === 'bookmark';
                
                html += `
                    <div class="annotation-item ${isBookmark ? 'bookmark' : 'annotation'}" data-id="${anno.id}">
                        <div class="annotation-marker" style="background: ${color.border}"></div>
                        <div class="annotation-content">
                            ${!isBookmark ? `<div class="annotation-text">"${Lumina.Utils.escapeHtml((anno.selectedText || '').substring(0, 50))}${(anno.selectedText || '').length > 50 ? '...' : ''}"</div>` : ''}
                            ${anno.note ? `<div class="annotation-note">${Lumina.Utils.escapeHtml(anno.note)}</div>` : ''}
                            ${isBookmark ? `<div class="annotation-note annotation-bookmark-label">${t('bookmark') || '书签'}</div>` : ''}
                        </div>
                        <div class="annotation-actions">
                            <button class="annotation-action-btn" data-action="edit" data-tooltip-text="${t('edit')}">
                                <svg class="icon"><use href="#icon-edit"/></svg>
                            </button>
                            <button class="annotation-action-btn" data-action="delete" data-tooltip-text="${t('delete')}">
                                <svg class="icon"><use href="#icon-delete"/></svg>
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += `</div>`;
        });
        
        list.innerHTML = html;
        
        // 绑定事件
        list.querySelectorAll('.annotation-item').forEach(item => {
            const id = item.dataset.id;
            const anno = annotations.find(a => a.id === id);
            
            // 点击跳转
            item.addEventListener('click', (e) => {
                if (e.target.closest('.annotation-actions')) return;
                if (anno) {
                    Lumina.Actions.navigateToChapter(anno.chapterIndex, anno.lineIndex || anno.startLine);
                    document.getElementById('annotationPanel').classList.remove('open');
                }
            });
            
            // 编辑
            item.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
                if (anno) {
                    const color = this.colors.find(c => c.id === anno.color) || this.colors[0];
                    this.showAnnotationEditor({
                        id: anno.id,
                        text: anno.selectedText,
                        note: anno.note,
                        type: anno.type,
                        ...anno
                    }, color);
                }
            });
            
            // 删除
            item.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
                Lumina.UI.showDialog(t('confirmDeleteAnnotation') || '确定删除此标记？', 'confirm', async (result) => {
                    if (result) await this.deleteAnnotation(id);
                });
            });
        });
    },
    
    // 打开面板
    openPanel() {
        const panel = document.getElementById('annotationPanel');
        if (!panel) return;
        this.renderAnnotationList();
        panel.classList.add('open');
    },
    
    // 切换面板（toggle）
    togglePanel() {
        const panel = document.getElementById('annotationPanel');
        if (!panel) return;
        if (panel.classList.contains('open')) {
            panel.classList.remove('open');
        } else {
            this.openPanel();
        }
    },
    
    // 关闭面板
    closePanel() {
        document.getElementById('annotationPanel')?.classList.remove('open');
    }
};

