// ==================== 13. 数据管理器 ====================

Lumina.DataManager = class {
    constructor() {
        this.isPreloaded = false;
        this.currentStats = null;
        this.currentView = Lumina.ConfigManager.get('library.viewMode') || 'card';
        this.currentSort = Lumina.ConfigManager.get('library.sortBy') || 'time';
        this.sortOrder = Lumina.ConfigManager.get('library.sortOrder') || 'desc';
        
        // 多选状态
        this.isBatchMode = false;
        this.selectedFiles = new Set();
        
        // 防止重复请求
        this._loadingPromise = null;
    }

    init() {
        this._initialized = true;
        
        document.getElementById('openDataManager').addEventListener('click', () => this.open());
        
        // 缓存管理按钮事件（显示控制在 init.js 中处理）
        const cacheManagerBtn = document.getElementById('openCacheManager');
        if (cacheManagerBtn) {
            cacheManagerBtn.addEventListener('click', () => {
                if (Lumina.CacheManager) {
                    Lumina.CacheManager.open();
                }
            });
        }
        document.getElementById('closeDataManager').addEventListener('click', () => this.close());
        document.getElementById('batchExportBtn').addEventListener('click', () => this.batchExport());
        document.getElementById('importDataBtn').addEventListener('click', () => this.batchImport());
        document.getElementById('clearLibraryBtn').addEventListener('click', () => this.confirmClearLibrary());
        document.getElementById('dataManagerPanel').addEventListener('click', (e) => {
            if (e.target.id === 'dataManagerPanel') this.close();
        });
        
        // 文件浏览器面板事件
        const closeFileBrowser = document.getElementById('closeFileBrowser');
        const fileBrowserSystemBtn = document.getElementById('fileBrowserSystemBtn');
        const fileBrowserPanel = document.getElementById('fileBrowserPanel');
        
        if (closeFileBrowser) {
            closeFileBrowser.addEventListener('click', () => {
                if (fileBrowserPanel) fileBrowserPanel.classList.remove('active');
            });
        }
        
        if (fileBrowserSystemBtn) {
            fileBrowserSystemBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (fileBrowserPanel) fileBrowserPanel.classList.remove('active');
                this.showSystemFilePicker();
            });
        }

        // 初始化视图切换
        this.initViewToggle();
        
        // 初始化排序
        this.initSort();
        
        // 初始化多选批量操作
        this.initBatchMode();
    }

    // 初始化视图切换
    initViewToggle() {
        const toggleBtn = document.getElementById('libViewToggle');
        if (!toggleBtn) {
            console.warn('[DataManager] View toggle button not found');
            return;
        }

        // 设置初始图标
        this.updateViewToggleIcon();

        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // 循环切换：card -> list -> compact -> card
            const views = ['card', 'list', 'compact'];
            const currentIndex = views.indexOf(this.currentView);
            const nextView = views[(currentIndex + 1) % views.length];
            
            this.setView(nextView);
        });
    }

    // 更新视图切换按钮图标
    updateViewToggleIcon() {
        const toggleBtn = document.getElementById('libViewToggle');
        const icon = document.getElementById('viewToggleIcon');
        if (!toggleBtn || !icon) {
            console.warn('[DataManager] Toggle button or icon not found');
            return;
        }
        
        toggleBtn.dataset.view = this.currentView;
        
        const iconMap = {
            'card': '#icon-grid',
            'list': '#icon-list',
            'compact': '#icon-compact'
        };
        
        const iconId = iconMap[this.currentView] || '#icon-grid';
        const use = icon.querySelector('use');
        if (use) {
            use.setAttribute('href', iconId);
        }
    }

    // 切换视图
    setView(view) {
        if (this.currentView === view) return;
        
        this.currentView = view;
        Lumina.ConfigManager.set('library.viewMode', view);
        
        // 更新按钮图标
        this.updateViewToggleIcon();
        
        // 更新 grid 的 data-view 属性
        const grid = document.getElementById('dataGrid');
        if (grid) {
            grid.dataset.view = view;
        }

        // 重新渲染
        this.renderGrid();
    }

    // ==================== 排序功能 ====================
    initSort() {
        const sortBtn = document.getElementById('libSortBtn');
        const sortMenu = document.getElementById('libSortMenu');
        const directionBtn = document.getElementById('libSortDirectionBtn');
        if (!sortBtn || !sortMenu) return;
        
        // 点击展开/收起下拉菜单
        sortBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sortMenu.classList.toggle('open');
        });
        
        // 点击排序方向按钮切换方向
        if (directionBtn) {
            directionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // 切换排序方向
                this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
                
                // 保存设置
                Lumina.ConfigManager.set('library.sortOrder', this.sortOrder);
                
                // 更新UI并重新渲染
                this.updateSortLabel();
                this.updateSortMenu();
                this.renderGrid();
            });
        }
        
        // 点击选项
        sortMenu.querySelectorAll('.sort-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const sortBy = item.dataset.sort;
                this.setSort(sortBy);
                sortMenu.classList.remove('open');
            });
        });
        
        // 点击外部关闭
        document.addEventListener('click', () => {
            sortMenu.classList.remove('open');
        });
    }
    
    setSort(sortBy) {
        if (this.currentSort === sortBy) {
            // 切换排序方向
            this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
        } else {
            this.currentSort = sortBy;
            this.sortOrder = 'desc'; // 默认倒序
        }
        
        // 保存设置
        Lumina.ConfigManager.set('library.sortBy', this.currentSort);
        Lumina.ConfigManager.set('library.sortOrder', this.sortOrder);
        
        // 更新UI
        this.updateSortLabel();
        this.updateSortMenu();
        this.renderGrid();
    }
    
    updateSortLabel() {
        const label = document.getElementById('libSortLabel');
        const sortNames = {
            'time': Lumina.I18n.t('sortByTime') || '最新阅读',
            'added': Lumina.I18n.t('sortByAdded') || '添加时间',
            'name': Lumina.I18n.t('sortByName') || '文件名称',
            'size': Lumina.I18n.t('sortBySize') || '文件大小'
        };
        if (label) {
            label.textContent = sortNames[this.currentSort] || sortNames.time;
            label.dataset.sort = this.currentSort;
        }
        
        // 更新排序方向图标
        const directionIcon = document.getElementById('libSortDirectionIcon');
        if (directionIcon) {
            const use = directionIcon.querySelector('use');
            if (use) {
                use.setAttribute('href', this.sortOrder === 'desc' ? '#icon-caret-down' : '#icon-caret-up');
            }
        }
        
        // 更新排序按钮tooltip
        const sortBtn = document.getElementById('libSortBtn');
        if (sortBtn) {
            sortBtn.dataset.i18nTooltip = this.sortOrder === 'desc' ? 'sortDesc' : 'sortAsc';
            // 重新初始化tooltip
            Lumina.UI.setupCustomTooltip?.();
        }
    }
    
    updateSortMenu() {
        const menu = document.getElementById('libSortMenu');
        if (!menu) return;
        
        menu.querySelectorAll('.sort-item').forEach(item => {
            item.classList.toggle('active', item.dataset.sort === this.currentSort);
        });
    }
    
    sortFiles(files) {
        const sorted = [...files];
        
        switch (this.currentSort) {
            case 'name':
                sorted.sort((a, b) => this.sortOrder === 'desc' 
                    ? b.fileName.localeCompare(a.fileName) 
                    : a.fileName.localeCompare(b.fileName));
                break;
            case 'size':
                sorted.sort((a, b) => this.sortOrder === 'desc'
                    ? (b.fileSize || 0) - (a.fileSize || 0)
                    : (a.fileSize || 0) - (b.fileSize || 0));
                break;
            case 'added':
                // 添加时间 - 使用created_at字段
                sorted.sort((a, b) => {
                    const timeA = new Date(a.created_at || a.lastReadTime || 0).getTime();
                    const timeB = new Date(b.created_at || b.lastReadTime || 0).getTime();
                    return this.sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
                });
                break;
            case 'time':
            default:
                // 最新阅读 - 使用lastReadTime
                sorted.sort((a, b) => {
                    const timeA = new Date(a.lastReadTime || 0).getTime();
                    const timeB = new Date(b.lastReadTime || 0).getTime();
                    return this.sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
                });
                break;
        }
        
        return sorted;
    }

    // ==================== 多选批量操作 ====================
    initBatchMode() {
        // 批量导出选中
        document.getElementById('libBatchExportBtn')?.addEventListener('click', () => {
            this.batchExportSelected();
        });
        
        // 批量删除选中
        document.getElementById('libBatchDeleteBtn')?.addEventListener('click', () => {
            this.batchDeleteSelected();
        });
        
        // 取消多选
        document.getElementById('libCancelBatchBtn')?.addEventListener('click', () => {
            this.exitBatchMode();
        });
        
        // 全选
        document.getElementById('libSelectAllBtn')?.addEventListener('click', () => {
            this.selectAll();
        });
        
        // 反选
        document.getElementById('libInvertSelectBtn')?.addEventListener('click', () => {
            this.invertSelection();
        });
    }
    
    selectAll() {
        if (!this.currentStats?.files) return;
        
        // 选中所有文件
        this.currentStats.files.forEach(file => {
            this.selectedFiles.add(file.fileKey);
        });
        
        // 更新所有卡片外观
        document.querySelectorAll('.data-card').forEach(card => {
            card.classList.add('selected');
        });
        
        this.updateSelectedCount();
    }
    
    invertSelection() {
        if (!this.currentStats?.files) return;
        
        // 遍历所有文件，切换选中状态
        this.currentStats.files.forEach(file => {
            if (this.selectedFiles.has(file.fileKey)) {
                this.selectedFiles.delete(file.fileKey);
            } else {
                this.selectedFiles.add(file.fileKey);
            }
        });
        
        // 更新所有卡片外观
        document.querySelectorAll('.data-card').forEach(card => {
            const fileKey = card.dataset.filekey;
            card.classList.toggle('selected', this.selectedFiles.has(fileKey));
        });
        
        this.updateSelectedCount();
    }
    
    enterBatchMode() {
        if (this.isBatchMode) return;
        this.isBatchMode = true;
        this.selectedFiles.clear();
        
        // 切换 Header
        document.getElementById('libNormalHeader').style.display = 'none';
        document.getElementById('libBatchHeader').style.display = '';
        document.getElementById('libFilterBar').style.display = 'none';
        
        // 重新渲染显示勾选框
        this.renderGrid();
        this.updateSelectedCount();
    }
    
    exitBatchMode() {
        if (!this.isBatchMode) return;
        this.isBatchMode = false;
        this.selectedFiles.clear();
        
        // 恢复 Header
        document.getElementById('libNormalHeader').style.display = '';
        document.getElementById('libBatchHeader').style.display = 'none';
        document.getElementById('libFilterBar').style.display = '';
        
        // 重新渲染隐藏勾选框
        this.renderGrid();
    }
    
    toggleSelection(fileKey) {
        if (this.selectedFiles.has(fileKey)) {
            this.selectedFiles.delete(fileKey);
        } else {
            this.selectedFiles.add(fileKey);
        }
        
        // 更新卡片外观
        const card = document.querySelector(`.data-card[data-filekey="${fileKey}"]`);
        if (card) {
            card.classList.toggle('selected', this.selectedFiles.has(fileKey));
        }
        
        this.updateSelectedCount();
    }
    
    updateSelectedCount() {
        const countEl = document.getElementById('libSelectedCount');
        if (countEl) {
            countEl.textContent = this.selectedFiles.size;
        }
    }
    
    async batchExportSelected() {
        if (this.selectedFiles.size === 0) {
            Lumina.UI.showToast(Lumina.I18n.t('noFilesSelected') || '请先选择文件');
            return;
        }
        
        // 使用 exportBatchByKeys 方法，确保格式与整库导出一致
        await this.exportBatchByKeys(Array.from(this.selectedFiles));
        this.exitBatchMode();
    }
    
    // 根据文件键列表导出（支持部分导出和整库导出）
    async exportBatchByKeys(fileKeys) {
        const books = [];
        for (const fileKey of fileKeys) {
            // 直接使用 getFile 获取完整数据，确保与 exportBatch 格式一致
            const fileData = await Lumina.DB.adapter.getFile(fileKey);
            if (fileData) {
                books.push(fileData);
            }
        }
        
        if (books.length === 0) {
            Lumina.UI.showToast(Lumina.I18n.t('exportFailed') || '导出失败');
            return;
        }
        
        const batchData = {
            version: 2,
            exportType: 'batch',
            exportDate: Lumina.DB.getLocalTimeString(),
            appName: 'Lumina Reader',
            books,
            totalBooks: books.length
        };
        
        await this.exportBatchData(batchData);
    }
    
    async batchDeleteSelected() {
        if (this.selectedFiles.size === 0) {
            Lumina.UI.showToast(Lumina.I18n.t('noFilesSelected') || '请先选择文件');
            return;
        }
        
        const count = this.selectedFiles.size;
        Lumina.UI.showDialog(
            Lumina.I18n.t('confirmDeleteSelected', count) || `确认删除选中的 ${count} 个文件？`,
            'confirm',
            async (confirmed) => {
                if (!confirmed) return;
                
                let success = 0;
                for (const fileKey of this.selectedFiles) {
                    try {
                        await Lumina.DB.adapter.deleteFile(fileKey);
                        success++;
                    } catch (e) {
                        console.error('Delete failed:', fileKey, e);
                    }
                }
                
                Lumina.UI.showToast(Lumina.I18n.t('filesDeleted', success) || `已删除 ${success} 个文件`);
                await this.refreshStats();
                await Lumina.DB.loadHistoryFromDB();
                this.exitBatchMode();
            }
        );
    }

    async preload() {
        if (this.isPreloaded) return;
        if (this._loadingPromise) return this._loadingPromise;

        this._loadingPromise = (async () => {
            try {
                this.currentStats = await Lumina.DB.adapter.getStorageStats();
                this.updateSettingsBar();
                this.renderStats();
                this.renderGrid();
                this.isPreloaded = true;
            } finally {
                this._loadingPromise = null;
            }
        })();
        
        return this._loadingPromise;
    }
    
    // 标记缓存失效（打开新书后调用）
    invalidateCache() {
        this.isPreloaded = false;
    }

    async open() {
        const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
        const panel = document.getElementById('dataManagerPanel');
        
        panel.classList.add('active');
        
        // 书库面板打开时重新应用安全区域
        if (window.SafeArea) {
            window.SafeArea.apply();
        }
        
        // 确保视图图标同步
        this.updateViewToggleIcon();
        
        // 如果已有数据，直接显示（秒开），不重新获取
        if (this.currentStats) {
            this.renderStats();
            this.renderGrid();
            return;
        }
        
        // 如果有正在进行的请求，复用它
        if (this._loadingPromise) {
            this.showLoadingState();
            try {
                await this._loadingPromise;
                this.renderStats();
                this.renderGrid();
            } catch (error) {
                this.showErrorState(error.message || '加载失败', () => this.open());
            }
            return;
        }
        
        // 第一次打开，需要加载数据
        this._loadingPromise = (async () => {
            try {
                if (isSQLite) {
                    this.showLoadingState();
                    const stats = await Lumina.DB.adapter.getStorageStats();
                    this.currentStats = stats;
                    this.renderStats();
                    this.renderGrid();
                } else {
                    await this.refreshStats();
                }
            } catch (error) {
                throw error;
            } finally {
                this._loadingPromise = null;
            }
        })();
        
        try {
            await this._loadingPromise;
        } catch (error) {
            this.showErrorState(error.message || '加载失败', () => this.open());
        }
    }
    
    // 后台静默刷新（无提示）
    async refreshStatsSilently() {
        try {
            // 如果有正在进行的请求，复用它
            const stats = this._loadingPromise 
                ? await this._loadingPromise.then(() => this.currentStats)
                : await Lumina.DB.adapter.getStorageStats();
            
            // 只有数据变化才更新UI（静默）
            if (!this.currentStats || JSON.stringify(stats.files) !== JSON.stringify(this.currentStats.files)) {
                this.currentStats = stats;
                this.renderStats();
                this.renderGrid();
            }
        } catch (e) {
            // 静默失败
        }
    }

    // 新增：静默更新（不闪屏）
    updateGridSilently(newStats) {
        if (!this.currentStats) {
            this.currentStats = newStats;
            this.renderGrid();
            return;
        }
        
        // 比较文件数量变化
        const oldIds = new Set(this.currentStats.files.map(f => f.fileKey));
        const newIds = new Set(newStats.files.map(f => f.fileKey));
        
        // 如果有增删，完全重绘
        if (oldIds.size !== newIds.size || 
            ![...oldIds].every(id => newIds.has(id))) {
            this.currentStats = newStats;
            this.renderGrid();
            Lumina.UI.showToast('书库已更新', 1500);
        } else {
            // 只更新时间和统计（不闪屏）
            this.currentStats = newStats;
            this.renderStats();
        }
    }

    showLoadingState() {
        const grid = document.getElementById('dataGrid');
        const t = Lumina.I18n.t;
        
        // 如果有缓存，显示半透明遮罩 + 小 loading
        if (Lumina.DB.adapter.listCache) {
            grid.style.opacity = '0.6';
            grid.style.pointerEvents = 'none';
            grid.insertAdjacentHTML('afterbegin', 
                `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10;">
                    <div class="loading-spinner" style="width:32px;height:32px;border-width:3px;"></div>
                </div>`
            );
        } else {
            // 没有缓存，显示骨架屏（与 data-card 结构一致）
            grid.innerHTML = Array(4).fill(`
                <div class="data-card" style="background:var(--bg-secondary);">
                    <div class="swipe-layer">
                        <div class="swipe-content" style="padding:12px;">
                            <div class="card-cover" style="background:var(--bg-tertiary);">
                                <div class="skeleton-bg" style="width:100%;height:100%;"></div>
                            </div>
                            <div class="card-info">
                                <div class="skeleton-bg" style="height:16px;width:80%;margin-bottom:8px;border-radius:4px;"></div>
                                <div class="skeleton-bg" style="height:12px;width:50%;border-radius:4px;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    showErrorState(message, retryCallback) {
        const grid = document.getElementById('dataGrid');
        const t = Lumina.I18n.t;
        
        grid.innerHTML = `
            <div class="history-empty" style="grid-column:1/-1;padding:60px;">
                <svg class="icon" style="width:48px;height:48px;color:var(--warnning);"><use href="#icon-error"/></svg>
                <div style="margin:16px 0;color:var(--text-secondary);">${message}</div>
                <button class="option-btn" onclick="(${retryCallback})()" style="margin-top:8px;">
                    ${Lumina.I18n.t('retry') || '重试'}
                </button>
            </div>
        `;
    }

    close() {
        document.getElementById('dataManagerPanel').classList.remove('active');
    }

    toggle() {
        document.getElementById('dataManagerPanel').classList.contains('active') ? this.close() : this.open();
    }

    async refreshStats() {
        this.currentStats = await Lumina.DB.adapter.getStorageStats();
        this.renderStats();
        this.renderGrid();
        this.updateSettingsBar();
    }

    renderStats() {
        const { totalFiles, totalSize, imageCount } = this.currentStats;
        
        // 更新简要统计信息（筛选栏右侧）
        const statsCount = document.getElementById('libStatsCount');
        const statsSize = document.getElementById('libStatsSize');
        if (statsCount) statsCount.textContent = totalFiles;
        if (statsSize) statsSize.textContent = Lumina.Utils.formatFileSize(totalSize);
        
        // 保持兼容性：如果有旧版统计栏也更新
        const totalFilesEl = document.getElementById('totalFilesCount');
        const totalSizeEl = document.getElementById('totalStorageSize');
        const totalImagesEl = document.getElementById('totalImagesCount');
        
        if (totalFilesEl) totalFilesEl.textContent = totalFiles;
        if (totalSizeEl) totalSizeEl.textContent = Lumina.Utils.formatFileSize(totalSize);
        if (totalImagesEl) totalImagesEl.textContent = imageCount;
    }

    updateSettingsBar() {
        const { totalFiles, maxFiles } = this.currentStats;
        const countEl = document.getElementById('settingsStorageCount');
        const barEl = document.getElementById('settingsStorageBar');
        if (countEl) countEl.textContent = totalFiles;
        if (barEl) barEl.style.width = Math.min((totalFiles / maxFiles) * 100, 100) + '%';
    }

    renderGrid() {
        const grid = document.getElementById('dataGrid');
        let { files } = this.currentStats;
        
        // 排序
        files = this.sortFiles(files);

        // 设置当前视图
        grid.dataset.view = this.currentView;
        
        // 设置多选状态
        grid.classList.toggle('batch-mode', this.isBatchMode);

        if (!files.length) {
            grid.innerHTML = `<div class="history-empty" style="grid-column: 1/-1; padding: 60px;"><svg class="icon"><use href="#icon-folder"/></svg><div>${Lumina.I18n.t('noDataToManage')}</div></div>`;
            return;
        }

        // 统一渲染所有视图
        grid.innerHTML = files.map(file => this.renderCard(file)).join('');
        
        // 绑定事件
        this.bindCardEvents();
        Lumina.UI.setupCustomTooltip();
    }

    // 统一渲染卡片（一套HTML结构，CSS控制显示）
    renderCard(file) {
        const hasCover = !!file.cover;
        const timeAgo = Lumina.Utils.formatTimeAgo(file.lastReadTime);
        const sizeStr = file.estimatedSize ? Lumina.Utils.formatFileSize(file.estimatedSize) : '--';
        const fileName = Lumina.Utils.escapeHtml(file.metadata?.title || file.fileName.replace(/\.[^/.]+$/, ''));
        const chapterHtml = file.chapterTitle ? `<div class="card-chapter">${Lumina.Utils.escapeHtml(file.chapterTitle)}</div>` : '<div class="card-chapter"></div>';
        let coverHtml;
        if (hasCover) {
            coverHtml = `<img src="${file.cover}" class="cover-img" alt="" onerror="this.style.display='none';this.parentNode.innerHTML='<div class=\'cover-placeholder\'><svg><use href=\'#icon-book\'/></svg></div>';">`;
        } else if (Lumina.State.settings.hashCover && Lumina.CoverGenerator) {
            // 直接插入 SVG 以继承页面字体（APP 环境下可用自定义字体）
            const metadata = file.metadata || {};
            const title = metadata.title || file.title || file.fileName?.replace(/\.[^/.]+$/, '') || 'Untitled';
            const author = metadata.author || file.author || '';
            const generatedCover = Lumina.CoverGenerator.generateWithPattern(
                title, author, null, 'rectTiling'
            );
            if (generatedCover) {
                // 添加 cover-img 类以应用样式
                coverHtml = generatedCover.replace('<svg', '<svg class="cover-img"');
            } else {
                coverHtml = `<div class="cover-placeholder"><svg><use href="#icon-book"/></svg></div>`;
            }
        } else {
            coverHtml = `<div class="cover-placeholder"><svg><use href="#icon-book"/></svg></div>`;
        }
        
        // 多选勾选框（自定义SVG，非浏览器checkbox）
        const checkboxHtml = `
            <div class="card-checkbox" data-checkbox="true" title="${Lumina.I18n.t('selectFile') || '选择文件'}">
                <svg class="checkbox-icon" viewBox="0 0 24 24">
                    <rect class="checkbox-frame" x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
                    <path class="checkbox-check" d="M7 12l4 4 6-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
        `;
        
        return `
        <div class="data-card" data-filekey="${Lumina.Utils.escapeHtml(file.fileKey)}">
            ${checkboxHtml}
            <!-- 滑动操作层（移动端显示，PC隐藏；多选模式时禁用） -->
            <div class="swipe-layer">
                <div class="swipe-action export-action" data-action="export">
                    <svg class="icon"><use href="#icon-export"/></svg>
                    <span>${Lumina.I18n.t('exportFile')}</span>
                </div>
                <div class="swipe-content">
                    <div class="card-cover" data-cover="true" data-filekey="${Lumina.Utils.escapeHtml(file.fileKey)}">
                        ${coverHtml}
                        <div class="cover-overlay">
                            <button class="cover-btn export-btn" data-tooltip-text="${Lumina.I18n.t('exportFile')}"><svg class="icon"><use href="#icon-export"/></svg></button>
                            <button class="cover-btn delete-btn" data-tooltip-text="${Lumina.I18n.t('deleteFile')}"><svg class="icon"><use href="#icon-delete"/></svg></button>
                        </div>
                    </div>
                    <div class="card-info">
                        <div class="card-title" data-tooltip-text="${fileName}">${fileName}</div>
                        <div class="card-meta">${sizeStr} · ${timeAgo}</div>
                        ${chapterHtml}
                    </div>
                    <div class="list-actions">
                        <button class="cover-btn export-btn" data-tooltip-text="${Lumina.I18n.t('exportFile')}"><svg class="icon"><use href="#icon-export"/></svg></button>
                        <button class="cover-btn delete-btn" data-tooltip-text="${Lumina.I18n.t('deleteFile')}"><svg class="icon"><use href="#icon-delete"/></svg></button>
                    </div>
                </div>
                <div class="swipe-action delete-action" data-action="delete">
                    <svg class="icon"><use href="#icon-delete"/></svg>
                    <span>${Lumina.I18n.t('deleteFile')}</span>
                </div>
            </div>
        </div>
        `;
    }

    // 统一绑定卡片事件（PC和移动端共用）
    bindCardEvents() {
        const grid = document.getElementById('dataGrid');
        const isMobile = window.innerWidth <= 768;
        
        grid.querySelectorAll('.data-card').forEach(card => {
            const fileKey = card.dataset.filekey;
            
            // 勾选框点击（进入多选模式或切换选中状态）
            const checkbox = card.querySelector('.card-checkbox');
            if (checkbox) {
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    // 如果不在多选模式，先进入多选模式
                    if (!this.isBatchMode) {
                        this.enterBatchMode();
                    }
                    
                    this.toggleSelection(fileKey);
                });
            }
            
            // 移动端长按支持（用于进入多选模式）
            let longPressTimer = null;
            let isLongPress = false;
            const LONG_PRESS_DELAY = 500; // 毫秒
            
            const startLongPress = (e) => {
                // 只在移动端或触摸设备上生效
                if (!isMobile && e.type !== 'touchstart') return;
                
                isLongPress = false;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    // 阻止后续的click事件
                    if (e.type === 'touchstart') {
                        card.dataset.longPressTriggered = 'true';
                    }
                    
                    // 如果不在多选模式，进入多选模式并选中当前卡片
                    if (!this.isBatchMode) {
                        this.enterBatchMode();
                        this.toggleSelection(fileKey);
                        
                        // 触觉反馈
                        if (navigator.vibrate) navigator.vibrate(50);
                    }
                }, LONG_PRESS_DELAY);
            };
            
            const cancelLongPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            };
            
            // 绑定长按事件
            card.addEventListener('touchstart', startLongPress, { passive: true });
            card.addEventListener('touchend', cancelLongPress);
            card.addEventListener('touchmove', cancelLongPress);
            card.addEventListener('touchcancel', cancelLongPress);
            
            // 点击卡片打开详情或书籍（排除按钮区域和勾选框）
            card.addEventListener('click', (e) => {
                // 如果是长按触发的，忽略此次点击
                if (card.dataset.longPressTriggered === 'true') {
                    card.dataset.longPressTriggered = '';
                    return;
                }
                
                // 多选模式下，整个卡片都是选择触发体
                if (this.isBatchMode) {
                    this.toggleSelection(fileKey);
                    return;
                }
                
                // 点击按钮或勾选框时忽略
                if (e.target.closest('.cover-btn') || e.target.closest('.swipe-action') || e.target.closest('.card-checkbox')) return;
                
                // 点击封面打开书籍，点击其他区域打开详情页
                if (e.target.closest('.card-cover')) {
                    this.openFile(fileKey);
                } else {
                    this.openBookDetail(fileKey);
                }
            });
            
            // 导出按钮
            const exportBtns = card.querySelectorAll('[data-action="export"], .export-btn');
            exportBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.exportSingle(fileKey);
                });
            });
            
            // 删除按钮
            const deleteBtns = card.querySelectorAll('[data-action="delete"], .delete-btn');
            deleteBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.confirmDelete(fileKey, card);
                });
            });
        });
        
        // 移动端绑定滑动手势（多选模式下禁用）
        if (isMobile && !this.isBatchMode) {
            this.bindSwipeForDataManager();
        }
    }

    // 绑定移动端滑动手势
    bindSwipeForDataManager() {
        const grid = document.getElementById('dataGrid');
        const cards = grid.querySelectorAll('.data-card');
        
        cards.forEach(card => {
            const fileKey = card.dataset.filekey;
            const container = card.querySelector('.swipe-layer');
            const content = card.querySelector('.swipe-content');
            
            let startX = 0;
            let startY = 0;
            let currentX = 0;
            let isDragging = false;
            let isHorizontalSwipe = false;
            let touchStartTime = 0;
            
            const SWIPE_THRESHOLD = 60;  // 触发阈值
            const MAX_SWIPE = 100;
            const ANGLE_THRESHOLD = 25;  // 角度阈值，只有水平角度小于这个值才认为是水平滑动
            const MOVE_THRESHOLD = 15;   // 最小移动阈值
            
            // 触摸开始
            container.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                isDragging = true;
                isHorizontalSwipe = false;
                touchStartTime = Date.now();
                currentX = 0;
                content.style.transition = 'none';
            }, { passive: true });
            
            // 触摸移动
            container.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                
                const touch = e.touches[0];
                const deltaX = touch.clientX - startX;
                const deltaY = touch.clientY - startY;
                const absX = Math.abs(deltaX);
                const absY = Math.abs(deltaY);
                
                // 如果还没有确定是水平滑动，先进行判断
                if (!isHorizontalSwipe) {
                    // 如果移动距离不够，先不处理
                    if (absX < MOVE_THRESHOLD && absY < MOVE_THRESHOLD) return;
                    
                    // 计算角度（与水平方向的夹角）
                    const angle = Math.atan2(absY, absX) * 180 / Math.PI;
                    
                    // 如果角度太大（偏垂直），放弃处理，让页面滚动
                    if (angle > ANGLE_THRESHOLD) {
                        isDragging = false;
                        return;
                    }
                    
                    // 确认是水平滑动
                    isHorizontalSwipe = true;
                }
                
                // 阻止默认行为（滚动）
                e.preventDefault();
                
                currentX = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, deltaX));
                content.style.transform = `translateX(${currentX}px)`;
            }, { passive: false });
            
            // 触摸结束
            container.addEventListener('touchend', (e) => {
                if (!isDragging) return;
                isDragging = false;
                
                const touch = e.changedTouches[0];
                const touchDuration = Date.now() - touchStartTime;
                const deltaX = touch.clientX - startX;
                const deltaY = touch.clientY - startY;
                
                // 点击判定：短时间 + 几乎没移动（X和Y方向都要小）
                const isClick = touchDuration < 180 && Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6;
                
                content.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
                
                if (isClick) {
                    // 确认是点击
                    content.style.transform = '';
                    
                    // 检查点击的是否是封面区域
                    const touch = e.changedTouches[0];
                    const elementAtTouch = document.elementFromPoint(touch.clientX, touch.clientY);
                    const isCoverClick = elementAtTouch?.closest('.card-cover');
                    
                    if (isCoverClick) {
                        // 点击封面 - 打开书籍
                        this.openFile(fileKey);
                    } else {
                        // 点击其他区域 - 打开详情页
                        this.openBookDetail(fileKey);
                    }
                } else if (currentX > SWIPE_THRESHOLD) {
                    // 右滑 - 导出
                    content.style.transform = `translateX(${SWIPE_THRESHOLD}px)`;
                    setTimeout(() => {
                        this.exportSingle(fileKey);
                        setTimeout(() => {
                            content.style.transform = '';
                        }, 300);
                    }, 200);
                } else if (currentX < -SWIPE_THRESHOLD) {
                    // 左滑 - 删除
                    content.style.transform = `translateX(-${SWIPE_THRESHOLD}px)`;
                    setTimeout(() => {
                        this.confirmDelete(fileKey, card);
                        setTimeout(() => {
                            content.style.transform = '';
                        }, 300);
                    }, 200);
                } else {
                    // 复位
                    content.style.transform = '';
                }
                
                currentX = 0;
            });
        });
    }

    async openFile(fileKey) {
        console.log('[openFile] 正在打开:', fileKey);  // 添加这行确认执行
        
        const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
        
        if (isSQLite) {
            Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = 
                Lumina.I18n.t('loadingFile');
            Lumina.DOM.loadingScreen.classList.add('active');
        }
        
        try {
            let fileData;
            
            if (isSQLite) {
                // 必须是 getFileSmart，不是 getFile！
                console.log('[openFile] 调用 getFileSmart...');  // 添加这行
                fileData = await Lumina.DB.adapter.getFileSmart(fileKey);
            } else {
                fileData = await Lumina.DB.adapter.getFile(fileKey);
            }
            
            if (fileData) {
                await Lumina.DB.restoreFileFromDB(fileData);
                this.close();
            } else {
                Lumina.UI.showDialog(Lumina.I18n.t('fileDataLost'));
            }
        } catch (err) {
            console.error('Open file error:', err);
            Lumina.UI.showDialog(Lumina.I18n.t('fileDataLost'));
        } finally {
            if (isSQLite) {
                Lumina.DOM.loadingScreen.classList.remove('active');
                Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = 
                    Lumina.I18n.t('loading');
            }
        }
    }

    // 打开书籍详情面板
    openBookDetail(fileKey) {
        if (!Lumina.BookDetail) {
            console.warn('[DataManager] BookDetail module not loaded');
            return;
        }
        
        // 获取当前列表和索引，支持切换功能
        const fileList = this.currentStats?.files || [];
        const currentIndex = fileList.findIndex(f => f.fileKey === fileKey);
        
        if (currentIndex === -1) {
            console.warn('[DataManager] 文件不在当前列表中:', fileKey);
            return;
        }
        
        // 传入列表和索引，支持切换
        Lumina.BookDetail.open(fileList, currentIndex);
    }

    async confirmClearLibrary() {
        const files = await Lumina.DB.adapter.getAllFiles();
        if (!files || files.length === 0) {
            Lumina.UI.showToast(Lumina.I18n.t('libraryEmpty'));
            return;
        }
        
        Lumina.UI.showDialog(Lumina.I18n.t('confirmClearLibrary'), 'confirm', async (confirmed) => {
            if (!confirmed) return;
            
            const btn = document.getElementById('clearLibraryBtn');
            btn.classList.add('loading');
            
            try {
                // 检查当前是否有打开的文件
                const isCurrentFileInLibrary = Lumina.State.app.currentFile?.fileKey && 
                    files.some(f => f.fileKey === Lumina.State.app.currentFile.fileKey);
                
                // 清空所有文件
                for (const file of files) {
                    await Lumina.DB.adapter.deleteFile(file.fileKey);
                }
                
                // 如果当前打开的文件在书库中，标记为不自动保存
                if (isCurrentFileInLibrary) {
                    Lumina.State.app.currentFile.skipSave = true;
                }
                
                // 清除说明书导入标记，以便下次刷新时重新导入
                localStorage.removeItem('luminaGuideImported');
                
                // 刷新显示
                await this.refreshStats();
                this.renderGrid();
                
                // 刷新历史记录面板
                await Lumina.DB.loadHistoryFromDB();
                
                Lumina.UI.showToast(Lumina.I18n.t('libraryCleared'));
                
                // 如果当前有打开的文件，返回欢迎页面
                if (isCurrentFileInLibrary) {
                    Lumina.Actions.returnToWelcome();
                }
            } catch (err) {
                console.error('Clear library error:', err);
                Lumina.UI.showToast(Lumina.I18n.t('clearFailed'));
            } finally {
                btn.classList.remove('loading');
            }
        });
    }

    async confirmDelete(fileKey, cardElement) {
        Lumina.UI.showDialog(Lumina.I18n.t('confirmDeleteFile'), 'confirm', async (confirmed) => {
            if (confirmed) {
                cardElement.style.transform = 'scale(0.9)';
                cardElement.style.opacity = '0';
                
                const isCurrentFile = fileKey === Lumina.State.app.currentFile.fileKey;
                
                setTimeout(async () => {
                    try {
                        await Lumina.DB.adapter.deleteFile(fileKey);
                        
                        // 立即刷新数据（不等待缓存过期）
                        await this.refreshStats();
                        await Lumina.DB.loadHistoryFromDB();
                        
                        Lumina.UI.showToast(Lumina.I18n.t('fileDeleted'));
                        
                        if (isCurrentFile) {
                            Lumina.Actions.returnToWelcome();
                        }
                    } catch (err) {
                        Lumina.UI.showToast('删除失败，请重试');
                        console.error(err);
                    }
                }, 300);
            }
        });
    }

    async exportSingle(fileKey) {
        const data = await Lumina.DB.adapter.exportFile(fileKey);
        if (!data) {
            Lumina.UI.showToast(Lumina.I18n.t('exportFailed'));
            return;
        }
        
        // 检查是否开启了加密导出
        const encryptedExport = Lumina.State.settings.encryptedExport;
        
        if (encryptedExport) {
            // 加密导出模式
            await this.exportEncrypted(data);
        } else {
            // 明文导出模式（保持兼容）
            await this.exportPlain(data);
        }
    }
    
    // 明文导出
    async exportPlain(data) {
        const _filename = data.metadata?.title || data.fileName.replace(/\.[^/.]+$/, '');
        const fileName = `Lumina_${_filename}_${new Date().getTime()}.json`;
        
        const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
        if (isApp && Capacitor.Plugins?.Filesystem) {
            const { Filesystem } = Capacitor.Plugins;
            try {
                try {
                    await Filesystem.mkdir({
                        path: 'LuminaReader',
                        directory: 'DOCUMENTS',
                        recursive: true
                    });
                } catch (e) {}
                
                // 分块流式写入避免内存溢出
                await this.writeSingleBookJsonInChunks(`LuminaReader/${fileName}`, data);
                
                Lumina.UI.showToast(Lumina.I18n.t('exportSuccess'));
            } catch (err) {
                console.error('[Export] Filesystem error:', err);
                Lumina.UI.showToast(Lumina.I18n.t('exportFailed') + ': ' + (err.message || '无法写入文件'));
            }
        } else {
            // Web 环境：直接下载
            const jsonContent = JSON.stringify(data, null, 2);
            this.downloadJSON(jsonContent, fileName);
            Lumina.UI.showToast(Lumina.I18n.t('exportSuccess'));
        }
    }
    
    // 分块流式写入单本书 JSON（避免 Capacitor Bridge OOM）
    async writeSingleBookJsonInChunks(filePath, data) {
        const { Filesystem } = Capacitor.Plugins;
        
        // 写入文件头（除 content 数组外的字段）
        const headerObj = {
            fileName: data.fileName,
            fileType: data.fileType,
            fileSize: data.fileSize,
            wordCount: data.wordCount,
            cover: data.cover,
            customRegex: data.customRegex,
            chapterNumbering: data.chapterNumbering,
            annotations: data.annotations,
            heatMap: data.heatMap,
            metadata: data.metadata,  // 包含元数据
            lastChapter: data.lastChapter,
            lastScrollIndex: data.lastScrollIndex,
            chapterTitle: data.chapterTitle,
            lastReadTime: data.lastReadTime,
            created_at: data.created_at
        };
        
        let header = JSON.stringify(headerObj, null, 2);
        // 去掉最后的 }
        header = header.slice(0, -1);
        header += ',\n  "content": [\n';
        
        await Filesystem.writeFile({
            path: filePath,
            data: header,
            directory: 'DOCUMENTS',
            encoding: 'utf8'
        });
        
        // 分块写入 content 数组
        const content = data.content || [];
        for (let i = 0; i < content.length; i++) {
            let itemJson = JSON.stringify(content[i], null, 4);
            
            // 添加缩进
            itemJson = itemJson.split('\n').map(line => '    ' + line).join('\n');
            
            // 添加逗号（除了最后一个）
            if (i < content.length - 1) {
                itemJson += ',';
            }
            itemJson += '\n';
            
            await Filesystem.appendFile({
                path: filePath,
                data: itemJson,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
        }
        
        // 写入文件尾
        await Filesystem.appendFile({
            path: filePath,
            data: '  ]\n}',
            directory: 'DOCUMENTS',
            encoding: 'utf8'
        });
    }
    
    // 加密导出
    async exportEncrypted(data) {
        // 弹出密码输入对话框
        const password = await this.showPasswordDialog();
        if (password === null) {
            // 用户取消
            return;
        }
        
        // 显示进度对话框
        const progressDialog = this.showProgressDialog(Lumina.I18n.t('encrypting') || '正在加密...');
        
        try {
            // 加密数据
            const encryptedBuffer = await Lumina.Crypto.encrypt(data, password || null, (progress) => {
                progressDialog.update(progress);
            });
            
            const _filename = data.metadata?.title || data.fileName.replace(/\.[^/.]+$/, '');
            const fileName = `Lumina_${_filename}_${new Date().getTime()}.lmn`;
            
            const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
            if (isApp && Capacitor.Plugins?.Filesystem) {
                const { Filesystem } = Capacitor.Plugins;
                try {
                    await Filesystem.mkdir({
                        path: 'LuminaReader',
                        directory: 'DOCUMENTS',
                        recursive: true
                    });
                } catch (e) {}
                
                // 分块写入避免内存溢出（每次 512KB）
                await this.writeLargeFileInChunks(`LuminaReader/${fileName}`, encryptedBuffer, 512 * 1024);
                
                progressDialog.close();
                Lumina.UI.showToast(Lumina.I18n.t('exportSuccess'));
            } else {
                // 浏览器环境：转为 base64 文本下载（与 APP 统一格式）
                const base64Data = this.arrayBufferToBase64(encryptedBuffer);
                const blob = new Blob([base64Data], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                progressDialog.close();
                Lumina.UI.showToast(Lumina.I18n.t('exportSuccess'));
            }
        } catch (err) {
            progressDialog.close();
            console.error('[Export] 加密失败:', err);
            Lumina.UI.showToast(Lumina.I18n.t('exportFailed') + ': ' + err.message);
        }
    }
    
    // 统一的密码输入对话框（复用系统对话框）
    // type: 'set' | 'confirm' - set=设置密码(需要确认), confirm=确认密码
    showPasswordDialog(type = 'set') {
        return new Promise((resolve) => {
            const title = type === 'set' ? Lumina.I18n.t('passwordDialogTitle') : Lumina.I18n.t('enterPassword');
            const message = type === 'set' ? Lumina.I18n.t('passwordDialogDesc') : Lumina.I18n.t('enterPasswordDesc');
            
            // 第一次输入密码
            Lumina.UI.showDialog(message, 'prompt', (result) => {
                // result === null 表示用户取消，result === '' 表示用户输入空密码（使用默认密钥）
                if (result === null || result === false) {
                    resolve(null); // 用户取消
                    return;
                }
                
                const password = result;
                
                // 设置密码模式且用户输入了非空密码：需要确认密码
                if (type === 'set' && password.length > 0) {
                    Lumina.UI.showDialog(Lumina.I18n.t('confirmPassword'), 'prompt', (confirmResult) => {
                        if (confirmResult === null || confirmResult === false) {
                            resolve(null); // 用户取消确认
                            return;
                        }
                        
                        if (password !== confirmResult) {
                            Lumina.UI.showToast(Lumina.I18n.t('passwordMismatch'));
                            resolve(null);
                        } else {
                            resolve(password);
                        }
                    }, { 
                        title: Lumina.I18n.t('confirmPassword'),
                        inputType: 'password',
                        placeholder: Lumina.I18n.t('confirmPassword')
                    });
                } else {
                    // 确认密码模式，或者设置模式但用户输入空密码：直接返回
                    resolve(password);
                }
            }, { 
                title,
                inputType: 'password',
                placeholder: Lumina.I18n.t('passwordPlaceholder')
            });
        });
    }
    
    // 显示进度对话框
    showProgressDialog(title) {
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay active';
        dialog.innerHTML = `
            <div class="dialog-content" style="text-align: center;">
                <div class="dialog-header">
                    <h3>${title}</h3>
                </div>
                <div class="dialog-body">
                    <div class="progress-bar" style="width: 100%; height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
                        <div class="progress-fill" style="width: 0%; height: 100%; background: var(--accent-color); transition: width 0.3s;"></div>
                    </div>
                    <p class="progress-text" style="margin-top: 12px; color: var(--text-secondary);">0%</p>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        const progressFill = dialog.querySelector('.progress-fill');
        const progressText = dialog.querySelector('.progress-text');
        
        return {
            update: (percent) => {
                progressFill.style.width = percent + '%';
                progressText.textContent = percent + '%';
            },
            close: () => dialog.remove()
        };
    }
    
    // ArrayBuffer 转 Base64
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    // 下载二进制文件
    async batchExport() {
        const btn = document.getElementById('batchExportBtn');
        btn.classList.add('loading');
        try {
            const batchData = await Lumina.DB.adapter.exportBatch();
            if (!batchData) {
                Lumina.UI.showToast(Lumina.I18n.t('libraryEmpty'));
                return;
            }
            
            // 检查是否开启了加密导出
            const encryptedExport = Lumina.State.settings.encryptedExport;
            
            if (encryptedExport) {
                // 加密导出模式
                await this.batchExportEncrypted(batchData);
            } else {
                // 明文导出模式
                await this.batchExportPlain(batchData);
            }
        } catch (err) {
            console.error('[Export] Error:', err);
            Lumina.UI.showToast(Lumina.I18n.t('batchExportFailed'));
        } finally {
            btn.classList.remove('loading');
        }
    }
    
    // 通用批量导出（支持传入自定义数据）
    async exportBatchData(batchData) {
        if (!batchData || !batchData.books || batchData.books.length === 0) {
            Lumina.UI.showToast(Lumina.I18n.t('libraryEmpty'));
            return;
        }
        
        try {
            // 检查是否开启了加密导出
            const encryptedExport = Lumina.State.settings.encryptedExport;
            
            if (encryptedExport) {
                await this.batchExportEncrypted(batchData);
            } else {
                await this.batchExportPlain(batchData);
            }
        } catch (err) {
            console.error('[Export] Error:', err);
            Lumina.UI.showToast(Lumina.I18n.t('batchExportFailed'));
        }
    }
    
    // 明文批量导出
    async batchExportPlain(batchData) {
        const fileName = `Lumina_Library_Backup_${new Date().getTime()}.json`;
        
        const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
        if (isApp && Capacitor.Plugins?.Filesystem) {
            const { Filesystem } = Capacitor.Plugins;
            try {
                try {
                    await Filesystem.mkdir({
                        path: 'LuminaReader',
                        directory: 'DOCUMENTS',
                        recursive: true
                    });
                } catch (e) {}
                
                // 分块流式写入避免内存溢出
                await this.writeLargeJsonInChunks(`LuminaReader/${fileName}`, batchData);
                
                Lumina.UI.showToast(Lumina.I18n.t('batchExportSuccess', batchData.totalBooks));
            } catch (err) {
                console.error('[Export] Filesystem error:', err);
                Lumina.UI.showToast('导出失败: ' + (err.message || '无法写入文件'));
            }
        } else {
            // Web 环境：直接下载
            const jsonContent = JSON.stringify(batchData, null, 2);
            const blob = new Blob([jsonContent], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            Lumina.UI.showToast(Lumina.I18n.t('batchExportSuccess', batchData.totalBooks));
        }
    }
    
    // 分块流式写入大 JSON 文件（避免 Capacitor Bridge OOM）
    async writeLargeJsonInChunks(filePath, batchData) {
        const { Filesystem } = Capacitor.Plugins;
        const books = batchData.books;
        const totalBooks = books.length;
        
        // 写入文件头和元数据
        const header = '{\n  "exportType": "batch",\n  "totalBooks": ' + totalBooks + ',\n  "exportTime": "' + batchData.exportTime + '",\n  "books": [\n';
        await Filesystem.writeFile({
            path: filePath,
            data: header,
            directory: 'DOCUMENTS',
            encoding: 'utf8'
        });
        
        // 分块写入每本书
        for (let i = 0; i < totalBooks; i++) {
            const book = books[i];
            let bookJson = JSON.stringify(book, null, 4);
            
            // 添加缩进（与头部对齐）
            bookJson = bookJson.split('\n').map(line => '    ' + line).join('\n');
            
            // 添加逗号（除了最后一本）
            if (i < totalBooks - 1) {
                bookJson += ',';
            }
            bookJson += '\n';
            
            await Filesystem.appendFile({
                path: filePath,
                data: bookJson,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
        }
        
        // 写入文件尾
        await Filesystem.appendFile({
            path: filePath,
            data: '  ]\n}',
            directory: 'DOCUMENTS',
            encoding: 'utf8'
        });
    }
    
    // 加密批量导出
    async batchExportEncrypted(batchData) {
        const password = await this.showPasswordDialog();
        if (password === null) return;
        
        const progressDialog = this.showProgressDialog(Lumina.I18n.t('encrypting') || '正在加密...');
        
        try {
            const encryptedBuffer = await Lumina.Crypto.encrypt(batchData, password || null, (progress) => {
                progressDialog.update(progress);
            });
            
            const fileName = `Lumina_Library_Backup_${new Date().getTime()}.lmn`;
            
            const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
            if (isApp && Capacitor.Plugins?.Filesystem) {
                const { Filesystem } = Capacitor.Plugins;
                try {
                    await Filesystem.mkdir({
                        path: 'LuminaReader',
                        directory: 'DOCUMENTS',
                        recursive: true
                    });
                } catch (e) {}
                
                // 分块写入避免内存溢出（每次 512KB）
                await this.writeLargeFileInChunks(`LuminaReader/${fileName}`, encryptedBuffer, 512 * 1024);
                
                progressDialog.close();
                Lumina.UI.showToast(Lumina.I18n.t('batchExportSuccess', batchData.totalBooks));
            } else {
                // 浏览器环境：转为 base64 文本下载（与 APP 统一格式）
                const base64Data = this.arrayBufferToBase64(encryptedBuffer);
                const blob = new Blob([base64Data], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                progressDialog.close();
                Lumina.UI.showToast(Lumina.I18n.t('batchExportSuccess', batchData.totalBooks));
            }
        } catch (err) {
            progressDialog.close();
            console.error('[Export] 加密失败:', err);
            Lumina.UI.showToast(Lumina.I18n.t('exportFailed') + ': ' + err.message);
        }
    }
    
    // 分块写入大文件（避免 Capacitor Bridge OOM）
    // 关键：每个分块的字节数必须是 3 的倍数，否则 base64 拼接后会损坏
    async writeLargeFileInChunks(filePath, arrayBuffer, chunkSize = 510 * 1024) {
        const { Filesystem } = Capacitor.Plugins;
        const bytes = new Uint8Array(arrayBuffer);
        const totalSize = bytes.length;
        
        // 调整 chunkSize 为 3 的倍数（base64 每 3 字节编码为 4 字符）
        // 510KB = 522240 字节，是 3 的倍数
        const adjustedChunkSize = Math.floor(chunkSize / 3) * 3;
        
        // 第一块：创建文件
        const firstChunkEnd = Math.min(adjustedChunkSize, totalSize);
        const firstChunk = bytes.slice(0, firstChunkEnd);
        const firstBase64 = this.arrayBufferToBase64(firstChunk.buffer);
        
        await Filesystem.writeFile({
            path: filePath,
            data: firstBase64,
            directory: 'DOCUMENTS',
            encoding: 'utf8'
        });
        
        // 后续块：追加写入
        for (let offset = firstChunkEnd; offset < totalSize; offset += adjustedChunkSize) {
            const end = Math.min(offset + adjustedChunkSize, totalSize);
            const chunk = bytes.slice(offset, end);
            const base64Chunk = this.arrayBufferToBase64(chunk.buffer);
            
            await Filesystem.appendFile({
                path: filePath,
                data: base64Chunk,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
        }
    }
    
    // 辅助方法：浏览器下载 JSON
    downloadJSON(content, fileName) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async batchImport() {
        const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
        
        if (isApp) {
            // App 环境：使用自定义文件浏览器，默认打开 LuminaReader 目录
            this.showAppFileBrowser();
        } else {
            // 浏览器环境：使用系统文件选择
            this.showSystemFilePicker();
        }
    }
    
    // APP 环境：显示自定义文件浏览器（默认打开 Documents/LuminaReader）
    async showAppFileBrowser() {
        const { Filesystem } = Capacitor.Plugins;
        const t = Lumina.I18n?.t || ((k) => k);
        const panel = document.getElementById('fileBrowserPanel');
        const listContainer = document.getElementById('fileBrowserList');
        
        if (!panel || !listContainer) return;
        
        // 显示面板
        panel.classList.add('active');
        
        // 清空并显示加载中
        listContainer.innerHTML = '<div class="file-browser-empty"><div class="empty-title">' + (t('loading') || '加载中...') + '</div></div>';
        
        try {
            const result = await Filesystem.readdir({
                path: 'LuminaReader',
                directory: 'DOCUMENTS'
            });
            
            const files = result.files.filter(f => {
                const name = f.name.toLowerCase();
                return name.endsWith('.json') || name.endsWith('.lmn');
            });
            
            if (files.length === 0) {
                this.renderEmptyFileBrowser(t, 'noBackupFiles');
            } else {
                this.renderFileList(files, t, panel, listContainer);
            }
        } catch (err) {
            console.error('[FileBrowser] 读取目录失败:', err);
            // 权限不足时提供替代方案
            if (err.message?.includes('permission') || err.message?.includes('Permission')) {
                this.renderPermissionError(t, listContainer);
            } else {
                listContainer.innerHTML = `
                    <div class="file-browser-empty">
                        <svg class="icon"><use href="#icon-info"/></svg>
                        <div class="empty-title">${t('readDirFailed') || '无法读取目录'}</div>
                        <div class="empty-desc">${err.message || ''}</div>
                        <button class="btn-secondary" style="margin-top: 16px;" id="fallbackFilePicker">
                            ${t('useSystemFilePicker') || '使用系统文件选择器'}
                        </button>
                    </div>
                `;
                document.getElementById('fallbackFilePicker')?.addEventListener('click', () => {
                    panel.classList.remove('active');
                    this.showSystemFilePicker();
                });
            }
        }
    }
    
    // 渲染空文件浏览器
    renderEmptyFileBrowser(t, key) {
        const listContainer = document.getElementById('fileBrowserList');
        const messages = {
            noBackupFiles: { title: '未找到备份文件', desc: '应用目录中没有找到备份文件' },
            permissionDenied: { title: '需要存储权限', desc: '请授权访问存储空间以读取备份文件' }
        };
        const msg = messages[key] || messages.noBackupFiles;
        
        listContainer.innerHTML = `
            <div class="file-browser-empty">
                <svg class="icon"><use href="#icon-folder"/></svg>
                <div class="empty-title">${t(key) || msg.title}</div>
                <div class="empty-desc">${t(key + 'Detail') || msg.desc}</div>
            </div>
        `;
    }
    
    // 渲染文件列表
    renderFileList(files, t, panel, listContainer) {
        files.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        listContainer.innerHTML = '';
        
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-browser-item';
            const isLmn = file.name.toLowerCase().endsWith('.lmn');
            
            const sizeStr = Lumina.Utils.formatFileSize(file.size || 0);
            const timeStr = file.mtime ? Lumina.Utils.formatTimeAgo(file.mtime) : '';
            const lockIcon = isLmn ? '<svg class="icon lock-icon"><use href="#icon-lock"/></svg>' : '';
            const metaStr = timeStr ? `${sizeStr} · ${timeStr}${isLmn ? ' · ' + lockIcon : ''}` : sizeStr + (isLmn ? ' · ' + lockIcon : '');
            
            item.innerHTML = `
                <div class="item-info">
                    <div class="item-name">${Lumina.Utils.escapeHtml(file.name)}</div>
                    <div class="item-meta">${metaStr}</div>
                </div>
            `;
            
            item.addEventListener('click', async () => {
                panel.classList.remove('active');
                await this.importFileFromPath(`LuminaReader/${file.name}`);
            });
            
            listContainer.appendChild(item);
        });
    }
    
    // 渲染权限错误提示
    renderPermissionError(t, listContainer) {
        const panel = document.getElementById('fileBrowserPanel');
        listContainer.innerHTML = `
            <div class="file-browser-empty">
                <svg class="icon"><use href="#icon-lock"/></svg>
                <div class="empty-title">需要存储权限</div>
                <div class="empty-desc">Android 13+ 需要手动授权才能访问 Documents 目录<br>请点击下方按钮使用系统文件选择器</div>
                <button class="btn-primary" style="margin-top: 16px;" id="useSystemPicker">
                    选择备份文件
                </button>
            </div>
        `;
        
        document.getElementById('useSystemPicker')?.addEventListener('click', () => {
            panel.classList.remove('active');
            this.showSystemFilePicker();
        });
    }
    
    // 从指定路径导入文件（APP 环境）
    async importFileFromPath(filePath) {
        const { Filesystem } = Capacitor.Plugins;
        const t = Lumina.I18n?.t || ((k) => k);
        
        try {
            Lumina.UI.showToast(t('readingFile') || '正在读取文件...', 0);
            
            // 读取文件内容
            const result = await Filesystem.readFile({
                path: filePath,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
            
            const fileName = filePath.split('/').pop();
            const isLmn = fileName.toLowerCase().endsWith('.lmn');
            const isConfigFile = fileName.toLowerCase().includes('config');
            
            if (isLmn) {
                // LMN 文件：base64 解码后导入
                const base64Data = result.data;
                const binary = this.base64ToUint8Array(base64Data);
                
                // 检测是否为配置文件（通过文件名或尝试解析）
                if (isConfigFile) {
                    // 尝试作为配置文件导入
                    try {
                        await this.importLmnConfig(binary.buffer || binary, fileName);
                    } catch (configErr) {
                        // 配置文件导入失败，尝试作为书籍导入
                        console.log('[Import] 配置文件导入失败，尝试书籍导入:', configErr.message);
                        await this.importLmnBinary(binary.buffer || binary, fileName);
                    }
                } else {
                    await this.importLmnBinary(binary.buffer || binary, fileName);
                }
            } else {
                // JSON 文件：直接解析
                const data = JSON.parse(result.data);
                if (data.exportType === 'batch' && Array.isArray(data.books)) {
                    await this.handleBatchImport(data.books);
                } else if (data.fileName && Array.isArray(data.content)) {
                    // 单本书籍导入（importDataToDB 内部已处理刷新和提示）
                    await this.importDataToDB(data);
                } else if (data.version && data.reading) {
                    // 配置文件
                    await Lumina.Settings.handleConfigImport(new File([result.data], fileName, { type: 'application/json' }));
                } else {
                    throw new Error('Invalid format');
                }
            }
        } catch (err) {
            console.error('[Import] 失败:', err);
            Lumina.UI.showDialog((t('importFailed') || '导入失败') + ': ' + (err.message || 'Unknown error'));
        }
    }
    
    // 导入 LMN 配置文件数据
    async importLmnConfigData(data) {
        const t = Lumina.I18n?.t || ((k) => k);
        
        if (!data.version) {
            throw new Error(t('invalidFileFormat') || '无效的配置文件');
        }
        
        const current = Lumina.ConfigManager.load();
        const merged = Lumina.ConfigManager.mergeDeep(
            Lumina.ConfigManager.getDefaultConfig(), 
            data
        );
        
        // 保留的元数据
        merged.meta.firstInstall = current.meta.firstInstall;
        merged.meta.importCount = (current.meta.importCount || 0) + 1;
        merged.meta.lastImport = Date.now();
        
        Lumina.ConfigManager.save(merged);
        
        // 刷新相关UI
        Lumina.Settings.load();
        await Lumina.Settings.apply();
        if (Lumina.HeatMap) Lumina.HeatMap.loadFromConfig?.();
        if (Lumina.Settings.reloadPasswordPresetUI) Lumina.Settings.reloadPasswordPresetUI();
        Lumina.I18n.updateUI();
        Lumina.UI.showToast(t('configImportSuccess') || '配置导入成功');
        
        // 重新加载并激活自定义字体
        if (data.customFonts && data.customFonts.length > 0) {
            await this.reloadCustomFonts(data.customFonts);
        }
    }
    
    // 重新加载自定义字体（导入配置后调用）
    async reloadCustomFonts(customFonts) {
        const t = Lumina.I18n?.t || ((k) => k);
        let loadedCount = 0;
        let missingFonts = [];
        let failedFonts = [];
        
        console.log('[FontReload] 开始加载', customFonts.length, '个自定义字体');
        
        for (const font of customFonts) {
            console.log('[FontReload] 检查字体:', font.name, 'storedName:', font.storedName);
            
            // 检查私有目录是否存在
            let ttfExists = await Lumina.FontManager._checkFontFileExists(font.storedName);
            console.log('[FontReload] 私有目录 TTF 存在:', ttfExists);
            

            if (ttfExists) {
                // 确保字体在 FontManager 的列表中
                if (!Lumina.FontManager.customFonts.find(f => f.id === font.id)) {
                    Lumina.FontManager.customFonts.push(font);
                    console.log('[FontReload] 添加到列表:', font.id);
                }
                
                // 加载字体（使用内联 CSS 注入）
                try {
                    await Lumina.FontManager.loadFont(font.id);
                    console.log('[FontReload] 字体加载成功:', font.name);
                    loadedCount++;
                } catch (e) {
                    console.error('[FontReload] 加载字体失败:', font.name, e);
                    failedFonts.push({ font, error: e.message });
                }
            } else {
                console.log('[FontReload] TTF 不存在:', font.storedName);
                missingFonts.push(font);
            }
        }
        
        // 保存更新后的字体列表
        await Lumina.FontManager._saveCustomFonts();
        
        console.log('[FontReload] 结果: 成功', loadedCount, '缺失', missingFonts.length, '失败', failedFonts.length);
        
        // 如果有加载失败的字体，提示用户
        if (failedFonts.length > 0) {
            const failedNames = failedFonts.map(f => f.font.name).join(', ');
            Lumina.UI.showToast(`字体加载失败: ${failedNames}`);
        }
        
        // 有缺失字体时静默清理配置（现在通过配置内嵌字体数据恢复）
        if (missingFonts.length > 0) {
            console.log('[FontReload] 清理缺失字体配置:', missingFonts.length);
            const current = Lumina.ConfigManager.get('customFonts') || [];
            const missingIds = missingFonts.map(f => f.id);
            const remaining = current.filter(f => !missingIds.includes(f.id));
            Lumina.ConfigManager.set('customFonts', remaining);
            Lumina.FontManager.customFonts = remaining;
        }
        
        if (loadedCount > 0) {
            Lumina.UI.showToast(`成功加载 ${loadedCount} 个自定义字体`);
        }
    }
    
    // 导入加密的 LMN 配置文件
    async importLmnConfig(arrayBuffer, fileName) {
        const t = Lumina.I18n?.t || ((k) => k);
        
        // 检测是否为 .lmn 格式
        if (!Lumina.Crypto.isLmnFile(arrayBuffer)) {
            throw new Error(t('invalidLmnFile') || '无效的 .lmn 文件格式');
        }
        
        // 检测是否需要密码
        const view = new Uint8Array(arrayBuffer);
        const hasPassword = (view[5] & 0x01) !== 0;
        
        let password = null;
        if (hasPassword) {
            password = await this.showDecryptPasswordDialog();
            if (password === null) return; // 用户取消
        }
        
        // 解密数据
        const data = await Lumina.Crypto.decrypt(arrayBuffer, password);
        
        // 验证是配置文件
        if (!data.version || !data.reading) {
            throw new Error(t('invalidFileFormat') || '不是有效的配置文件');
        }
        
        await this.importLmnConfigData(data);
    }
    
    // 从二进制数据导入 LMN 文件
    async importLmnBinary(arrayBuffer, fileName) {
        const t = Lumina.I18n?.t || ((k) => k);
        
        // 检测是否为 .lmn 格式
        if (!Lumina.Crypto.isLmnFile(arrayBuffer)) {
            throw new Error(t('invalidLmnFile') || '无效的 .lmn 文件格式');
        }
        
        // 检测是否需要密码
        const view = new Uint8Array(arrayBuffer);
        const hasPassword = (view[5] & 0x01) !== 0;
        
        let password = null;
        if (hasPassword) {
            password = await this.showDecryptPasswordDialog();
            if (password === null) return; // 用户取消
        }
        
        // 显示进度
        const progressDialog = this.showProgressDialog(t('decrypting') || '正在解密...');
        
        try {
            // 解密数据
            const data = await Lumina.Crypto.decrypt(arrayBuffer, password, (progress) => {
                progressDialog.update(progress);
            });
            
            progressDialog.close();
            
            // 验证并导入数据
            if (data.exportType === 'batch' && Array.isArray(data.books)) {
                await this.handleBatchImport(data.books);
            } else if (data.fileName && Array.isArray(data.content)) {
                await this.importDataToDB(data);
                Lumina.UI.showToast(t('importSuccess') || '导入成功');
                await this.refreshStats();
                await Lumina.DB.loadHistoryFromDB();
                this.updateSettingsBar();
            } else {
                throw new Error(t('invalidFileFormat') || '无效的文件格式');
            }
        } catch (err) {
            progressDialog.close();
            if (err.message.includes('密码') || err.message.includes('password')) {
                Lumina.UI.showDialog(t('decryptFailed') || '解密失败：密码错误', 'alert');
            } else {
                throw err;
            }
        }
    }
    
    // 辅助方法：系统文件选择
    showSystemFilePicker() {
        const input = document.createElement('input');
        input.type = 'file';
        // APP 环境使用通用 MIME 类型，因为 Android 不认识 .lmn 扩展名
        const isApp = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
        input.accept = isApp ? '*/*' : '.json,.lmn';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) {
                console.log('[FilePicker] 未选择文件');
                return;
            }
            console.log('[FilePicker] 选择文件:', file.name, 'type:', file.type, 'isApp:', isApp);
            
            // 检查文件扩展名
            const isLmn = file.name.toLowerCase().endsWith('.lmn');
            const isJson = file.name.toLowerCase().endsWith('.json');
            
            if (!isLmn && !isJson) {
                Lumina.UI.showDialog(Lumina.I18n.t('importFailed') + ': 请选择 .json 或 .lmn 文件');
                return;
            }
            
            Lumina.UI.showToast(Lumina.I18n.t('readingFile'), 0);
            try {
                // 检测文件类型
                if (isLmn) {
                    console.log('[FilePicker] 检测为 LMN 格式');
                    await this.importLmnFile(file);
                } else {
                    console.log('[FilePicker] 检测为 JSON 格式');
                    const text = await file.text();
                    const data = JSON.parse(text);
                    if (data.exportType === 'batch' && Array.isArray(data.books))
                        await this.handleBatchImport(data.books);
                    else if (data.fileName && Array.isArray(data.content))
                        await this.importJSONFile(file);
                    else if (data.version && data.reading) {
                        // 配置文件
                        console.log('[FilePicker] 检测为配置文件');
                        await Lumina.Settings.handleConfigImport(file);
                    } else
                        throw new Error('Invalid format');
                }
            } catch (err) {
                console.error('[FilePicker] 导入失败:', err);
                Lumina.UI.showDialog(Lumina.I18n.t('importFailed') + ': ' + (err.message || 'Unknown error'));
            }
        };
        input.click();
    }
    
    // 导入 .lmn 加密文件（支持 base64 文本格式和二进制格式兼容）
    async importLmnFile(file) {
        console.log('[Import LMN] 开始导入:', file.name, 'size:', file.size);
        
        // 检测是否为配置文件（通过文件名）
        const isConfigFile = file.name.toLowerCase().includes('config');
        
        let binary;
        try {
            // 先尝试作为文本读取，检测是否为 base64 格式（新格式）
            const text = await file.text();
            const trimmedText = text.trim();
            
            // 检测是否为 base64 编码（只包含 base64 字符且长度是4的倍数）
            const isBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(trimmedText.replace(/\s/g, '')) 
                && trimmedText.replace(/\s/g, '').length % 4 === 0
                && trimmedText.length > 0;
            
            if (isBase64) {
                // base64 文本格式（新格式，与 APP 统一）
                console.log('[Import LMN] 检测到 base64 文本格式');
                binary = this.base64ToUint8Array(trimmedText);
            } else {
                // 可能是旧二进制格式，重新读取为 ArrayBuffer（兼容历史文件）
                console.log('[Import LMN] 尝试作为二进制格式读取');
                const arrayBuffer = await file.arrayBuffer();
                binary = new Uint8Array(arrayBuffer);
            }
            console.log('[Import LMN] 读取文件成功:', binary.length, 'bytes');
        } catch (e) {
            console.error('[Import LMN] 读取文件失败:', e);
            throw new Error('读取文件失败: ' + e.message);
        }
        
        // 如果是配置文件，尝试配置文件导入流程
        if (isConfigFile) {
            console.log('[Import LMN] 检测到可能的配置文件，尝试配置导入');
            try {
                await this.importLmnConfig(binary.buffer || binary, file.name);
                return;
            } catch (configErr) {
                // 配置文件导入失败，继续尝试书籍导入
                console.log('[Import LMN] 配置文件导入失败，尝试书籍导入:', configErr.message);
            }
        }
        
        // 检测是否为 .lmn 格式
        if (!Lumina.Crypto.isLmnFile(binary.buffer || binary)) {
            throw new Error('无效的 .lmn 文件格式');
        }
        
        // 检测是否需要密码
        const hasPassword = (binary[5] & 0x01) !== 0;
        
        let password = null;
        if (hasPassword) {
            password = await this.showDecryptPasswordDialog();
            if (password === null) {
                // 用户取消
                return;
            }
        }
        
        // 显示进度
        const progressDialog = this.showProgressDialog(Lumina.I18n.t('decrypting') || '正在解密...');
        
        try {
            // 解密数据
            const data = await Lumina.Crypto.decrypt(binary.buffer || binary, password, (progress) => {
                progressDialog.update(progress);
            });
            
            progressDialog.close();
            
            // 验证并导入数据
            if (data.exportType === 'batch' && Array.isArray(data.books)) {
                await this.handleBatchImport(data.books);
            } else if (data.fileName && Array.isArray(data.content)) {
                await this.importDataToDB(data);
            } else if (data.version && data.reading) {
                // 配置文件（文件名不含 config 的情况）
                await this.importLmnConfigData(data);
            } else {
                throw new Error('无效的文件格式');
            }
        } catch (err) {
            progressDialog.close();
            if (err.message.includes('密码') || err.message.includes('password')) {
                Lumina.UI.showDialog(Lumina.I18n.t('decryptFailed'), 'alert');
            } else {
                throw err;
            }
        }
    }
    
    // 解密密码对话框（统一使用 showPasswordDialog）
    showDecryptPasswordDialog() {
        return this.showPasswordDialog('confirm');
    }
    
    // 将数据导入数据库
    async importDataToDB(data) {
        try {
            const newKey = `${data.fileName}_${Date.now()}`;
            const saveResult = await Lumina.DB.adapter.saveFile(newKey, {
                fileName: data.fileName,
                fileType: data.fileType || 'txt',
                fileSize: data.fileSize || 0,
                content: data.content,
                wordCount: data.wordCount || 0,
                cover: data.cover || null,
                customRegex: data.customRegex || { chapter: '', section: '' },
                chapterNumbering: data.chapterNumbering || 'none',
                annotations: data.annotations || [],
                heatMap: data.heatMap || null,
                metadata: data.metadata || null,  // 导入元数据
                lastChapter: data.lastChapter || 0,
                lastScrollIndex: data.lastScrollIndex || 0,
                chapterTitle: data.chapterTitle || '',
                lastReadTime: data.lastReadTime || Lumina.DB.getLocalTimeString(),
                created_at: data.created_at || data.lastReadTime || Lumina.DB.getLocalTimeString()
            });
            
            if (!saveResult) {
                throw new Error('保存到数据库失败');
            }
            
            await this.refreshStats();
            await Lumina.DB.loadHistoryFromDB();
            this.updateSettingsBar();
            Lumina.UI.showToast(Lumina.I18n.t('importSuccess'));
            return true;
        } catch (err) {
            console.error('[importDataToDB] 导入失败:', err);
            throw err;  // 向上抛出，让调用者处理
        }
    }
    
    // 辅助方法：从解析后的数据导入（用于 Filesystem 读取）
    async importJSONFileFromData(data) {
        try {
            // 统一使用与拖放/直接打开相同的宽松验证：只需要 fileName 和 content 数组
            if (!(data && typeof data === 'object' && data.fileName && Array.isArray(data.content))) {
                Lumina.UI.showDialog(Lumina.I18n.t('invalidHistoryFile'));
                return false;
            }
            await Lumina.DB.adapter.restoreFileFromDB(data);
            Lumina.DOM.historyPanel?.classList.remove('open');
            Lumina.UI.showToast(Lumina.I18n.t('importSuccess'));
            return true;
        } catch (err) {
            console.error('[Import] Error:', err);
            Lumina.UI.showDialog(Lumina.I18n.t('importFailed'));
            return false;
        }
    }

    async handleBatchImport(books) {
        if (!books.length) {
            Lumina.UI.showToast(Lumina.I18n.t('noBooksInFile'));
            return;
        }
        Lumina.UI.showDialog(Lumina.I18n.t('confirmBatchImport', books.length), 'confirm', async (confirmed) => {
            if (!confirmed) return;
            const progressToast = document.createElement('div');
            progressToast.className = 'toast-progress';
            progressToast.innerHTML = `<span class="progress-text">${Lumina.I18n.t('importing')} 0/${books.length}</span><div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div>`;
            document.body.appendChild(progressToast);

            const results = await Lumina.DB.adapter.importBatch(books, (current, total, success) => {
                const percent = (current / total) * 100;
                progressToast.querySelector('.progress-text').textContent = `${Lumina.I18n.t('importing')} ${current}/${total} (${success} ${Lumina.I18n.t('success')})`;
                progressToast.querySelector('.progress-fill').style.width = `${percent}%`;
            });

            progressToast.remove();
            await this.refreshStats();
            await Lumina.DB.loadHistoryFromDB();
            this.updateSettingsBar();

            if (results.failed === 0)
                Lumina.UI.showToast(Lumina.I18n.t('batchImportSuccess', results.success));
            else
                Lumina.UI.showDialog(Lumina.I18n.t('batchImportPartial', results.success, results.failed) + '\n\n' + results.errors.slice(0, 3).map(e => `• ${e.book}: ${e.error}`).join('\n'), 'alert');
        });
    }

    async importJSONFile(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            // 统一使用与拖放/直接打开相同的宽松验证：只需要 fileName 和 content 数组
            if (!(data && typeof data === 'object' && data.fileName && Array.isArray(data.content))) {
                Lumina.UI.showDialog(Lumina.I18n.t('invalidHistoryFile'));
                return false;
            }
            const newKey = `${data.fileName}_${Date.now()}`;
            await Lumina.DB.adapter.saveFile(newKey, {
                fileName: data.fileName,
                fileType: data.fileType || 'txt',
                fileSize: data.fileSize || 0,
                content: data.content,
                wordCount: data.wordCount || 0,
                cover: data.cover || null,
                customRegex: data.customRegex || { chapter: '', section: '' },
                chapterNumbering: data.chapterNumbering || 'none',
                annotations: data.annotations || [],
                heatMap: data.heatMap || null,
                metadata: data.metadata || null,  // 导入元数据
                lastChapter: data.lastChapter || 0,
                lastScrollIndex: data.lastScrollIndex || 0,
                chapterTitle: data.chapterTitle || '',
                lastReadTime: data.lastReadTime || Lumina.DB.getLocalTimeString(),
                created_at: data.created_at || data.lastReadTime || Lumina.DB.getLocalTimeString()
            });
            await this.refreshStats();
            await Lumina.DB.loadHistoryFromDB();
            this.updateSettingsBar();
            Lumina.UI.showToast(Lumina.I18n.t('importSuccess'));
            return true;
        } catch (err) {
            Lumina.UI.showDialog(Lumina.I18n.t('importFailed') + ': ' + (err.message || 'Unknown error'));
            return false;
        }
    }

    validateHistoryData(data) {
        return data && typeof data === 'object' && data.fileName && Array.isArray(data.content) && data.version && data.exportDate;
    }
    
    // base64 解码为 Uint8Array（用于 LMN 文件导入）
    base64ToUint8Array(base64) {
        // 清理 base64 字符串（去除所有空白字符，包括换行符）
        const cleanBase64 = base64.replace(/[\s\r\n]+/g, '');
        
        try {
            const binaryString = atob(cleanBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        } catch (e) {
            throw new Error('文件格式错误：无效的 base64 编码');
        }
    }
};

// ==================== 14. 历史记录管理 ====================

/**
 * 压缩图片数据 URL
 * @param {string} dataUrl - 原始图片数据 URL
 * @param {number} maxWidth - 最大宽度
 * @param {number} quality - JPEG 质量 (0-1)
 * @returns {Promise<string>} - 压缩后的数据 URL
 */
Lumina.Utils.compressImage = async (dataUrl, maxWidth = 1200, quality = 0.7) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            // 如果图片本身就不大，直接返回原图
            if (img.width <= maxWidth && dataUrl.length < 50000) {
                resolve(dataUrl);
                return;
            }
            
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // 按比例缩放
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // 转换为 JPEG（通常比 PNG 小很多）
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = dataUrl;
    });
};

/**
 * 估算内容大小（字节）
 */
Lumina.Utils.estimateContentSize = (items) => {
    let size = 0;
    for (const item of items) {
        if (item.type === 'image' && item.data) {
            size += item.data.length;
        } else if (item.text) {
            size += item.text.length * 2; // UTF-16
        }
    }
    return size;
};

Lumina.DB.HistoryDataBuilder = {
    // 添加 includeContent 参数，默认 true（首次保存），false（仅进度）
    // saveMode: 'full' | 'text-only' | 'no-save' - 保存模式
    async build(fileKey, overrides = {}, includeContent = true, saveMode = 'full') {
        const state = Lumina.State.app;
        const currentChapter = state.chapters[state.currentChapterIndex];
        
        let processedContent = null;
        
        // 关键：includeContent 为 false 时不带 content 数组
        if (includeContent && saveMode !== 'no-save') {
            processedContent = [];
            let imageCount = 0;
            const MAX_IMAGES = saveMode === 'text-only' ? 0 : 50; // 全量保存最多50张，文本模式不保存图片
            
            for (const item of state.document.items) {
                const processedItem = {
                    type: item.type,
                    text: item.text,
                    ...(item.display !== undefined && { display: item.display }),
                    ...(item.level !== undefined && { level: item.level }),
                    ...(item.alt !== undefined && { alt: item.alt }),
                    // 【关键】保留 Markdown 的 items（列表、表格等）
                    ...(item.items !== undefined && { items: item.items }),
                    // 【关键】保留 Markdown 的 inlineContent（行内格式）
                    ...(item.inlineContent !== undefined && { inlineContent: item.inlineContent }),
                    // 保留其他可能需要的字段
                    ...(item.ordered !== undefined && { ordered: item.ordered }),
                    ...(item.start !== undefined && { start: item.start }),
                    ...(item.headers !== undefined && { headers: item.headers }),
                    ...(item.rows !== undefined && { rows: item.rows }),
                    ...(item.language !== undefined && { language: item.language }),
                    ...(item.raw !== undefined && { raw: item.raw })
                };
                
                // 处理图片
                if (item.type === 'image' && item.data) {
                    imageCount++;
                    
                    // 根据保存模式处理图片
                    if (saveMode === 'text-only' || imageCount > MAX_IMAGES) {
                        // 文本模式或超过数量限制，跳过图片
                        continue;
                    } else {
                        // 全量模式：不压缩，原样保存
                        processedItem.data = item.data;
                    }
                }
                
                processedContent.push(processedItem);
            }
        }
        
        // 构建元数据（优先使用自动提取的）
        const metadata = state.currentFile.metadata;
        const existingMeta = state.currentFile.metadata || {};
        const _metadata = {
            title: metadata?.title || existingMeta.title || '',
            author: metadata?.author || existingMeta.author || '',
            publishDate: metadata?.publishDate || existingMeta.publishDate || '',
            sourceUrl: metadata?.sourceUrl || existingMeta.sourceUrl || '',
            publisher: metadata?.publisher || existingMeta.publisher || '',
            language: metadata?.language || existingMeta.language || '',
            description: metadata?.description || existingMeta.description || '',
            tags: metadata?.tags?.length > 0 ? metadata.tags : (existingMeta.tags || []),
            // 保存提取置信度信息（调试用）
            _extracted: metadata ? {
                confidence: metadata.confidence,
                source: metadata.source
            } : null
        };
        
        const baseData = {
            fileName: state.currentFile.name, 
            fileType: state.currentFile.type,
            fileSize: state.currentFile.handle?.size || 0,
            ...(includeContent && { content: processedContent }),
            wordCount: state.currentFile.wordCount,
            lastChapter: state.currentChapterIndex,
            lastScrollIndex: Lumina.Renderer.getCurrentVisibleIndex(),
            chapterTitle: currentChapter ? (currentChapter.isPreface ? Lumina.I18n.t('preface') : currentChapter.title) : '',
            lastReadTime: Lumina.DB.getLocalTimeString(),
            customRegex: { chapter: Lumina.State.settings.chapterRegex, section: Lumina.State.settings.sectionRegex },
            chapterNumbering: Lumina.State.settings.chapterNumbering,
            annotations: [],
            cover: overrides.cover || null,
            heatMap: state.currentFile.heatMap, // 保存热力图数据（未设置时为 undefined，便于合并逻辑判断）
            metadata: _metadata // 新增：书籍元数据
        };
        return { ...baseData, ...overrides };
    }
};

/**
 * 检查文件大小并提示用户选择保存模式
 * @param {number} sizeBytes - 文件大小（字节）
 * @returns {Promise<string>} - 'full' | 'text-only' | 'no-save'
 */
Lumina.DB.promptForSaveMode = async (sizeBytes) => {
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);
    const t = Lumina.I18n.t;
    
    return new Promise((resolve) => {
        const message = `${t('fileTooLarge') || '文件较大'} (${sizeMB} MB)\n\n${t('fileTooLargeMessage') || '该文件包含大量图片，建议选择保存方式：'}`;
        
        Lumina.UI.showDialog(message, 'confirm', (result) => {
            if (result === null || result === false) {
                resolve('no-save'); // 取消 = 不保存到书库
            } else {
                resolve('text-only'); // 确定 = 仅保存文本
            }
        }, {
            title: t('largeFileTitle') || '大文件提示',
            confirmText: t('saveTextOnly') || '仅保存文本',
            cancelText: t('doNotSave') || '不保存到书库'
        });
    });
};

Lumina.DB.saveHistory = async (fileName, fileType, wordCount = 0, cover = null, isFullSave = true, saveMode = 'full') => {
    const fileKey = Lumina.State.app.currentFile.fileKey || 
                    Lumina.DB.adapter.generateFileKey({ name: fileName, size: 0, lastModified: Date.now() });
    Lumina.State.app.currentFile.fileKey = fileKey;

    // 增量保存：先读取现有数据，只更新部分字段
    if (!isFullSave && Lumina.State.app.dbReady) {
        try {
            const existing = await Lumina.DB.adapter.getFile(fileKey);
            if (existing) {
                const currentChapter = Lumina.State.app.chapters[Lumina.State.app.currentChapterIndex];
                const heatMapValue = Lumina.State.app.currentFile.heatMap !== undefined 
                    ? Lumina.State.app.currentFile.heatMap 
                    : (existing.heatMap || null);
                const patchData = {
                    ...existing,
                    lastChapter: Lumina.State.app.currentChapterIndex,
                    lastScrollIndex: Lumina.Renderer.getCurrentVisibleIndex(),
                    chapterTitle: currentChapter ? (currentChapter.isPreface ? Lumina.I18n.t('preface') : currentChapter.title) : '',
                    lastReadTime: Lumina.DB.getLocalTimeString(),
                    chapterNumbering: Lumina.State.settings.chapterNumbering,
                    customRegex: { 
                        chapter: Lumina.State.settings.chapterRegex, 
                        section: Lumina.State.settings.sectionRegex 
                    },
                    heatMap: heatMapValue
                };
                await Lumina.DB.adapter.saveFile(fileKey, patchData);
                await Lumina.DB.loadHistoryFromDB();
                
                // 同步刷新书库面板（与历史面板一致）
                if (Lumina.State.app.dbReady && window.dataManager && window.dataManager.refreshStats) {
                    await window.dataManager.refreshStats();
                } else {
                    console.warn('[Patch Save] 无法刷新书库:', { dbReady: Lumina.State.app.dbReady, hasDataManager: !!window.dataManager, hasRefreshStats: !!(window.dataManager && window.dataManager.refreshStats) });
                }
                
                return { saved: true, mode: 'patch' };
            }
        } catch (e) {
            console.warn('Progress update failed, fallback to full save', e);
        }
    }

    // 全量保存（首次打开、重新解析）
    let finalCover = cover;
    let existingData = null;
    if (Lumina.State.app.dbReady) {
        existingData = await Lumina.DB.adapter.getFile(fileKey);
        if (existingData) {
            if (finalCover === null && existingData.cover) finalCover = existingData.cover;
            // 保留现有的 heatMap，如果当前没有的话
            if (!Lumina.State.app.currentFile.heatMap && existingData.heatMap) {
                Lumina.State.app.currentFile.heatMap = existingData.heatMap;
            }
        }
    }

    const data = await Lumina.DB.HistoryDataBuilder.build(fileKey, { cover: finalCover }, true, saveMode);
    
    // 【关键】如果是重新打开已有文件，保留原有的阅读进度字段
    // 避免重新解析后重置阅读进度
    if (existingData) {
        // 只有当当前状态是初始状态（刚打开文件）时才保留原有进度
        // 如果用户已经开始阅读（currentChapterIndex > 0），则使用当前状态
        if (Lumina.State.app.currentChapterIndex === 0 && existingData.lastChapter > 0) {
            data.lastChapter = existingData.lastChapter;
            data.lastScrollIndex = existingData.lastScrollIndex || 0;
            data.chapterTitle = existingData.chapterTitle || '';
        }
        // 保留其他重要字段
        if (!data.customRegex?.chapter && existingData.customRegex) {
            data.customRegex = existingData.customRegex;
        }
        if (existingData.chapterNumbering && data.chapterNumbering === 'none') {
            data.chapterNumbering = existingData.chapterNumbering;
        }
        // 保留 annotations（批注）
        if (existingData.annotations && existingData.annotations.length > 0) {
            data.annotations = existingData.annotations;
        }
    }
    
    // 如果用户选择不保存，跳过数据库保存
    if (saveMode === 'no-save') {
        return { saved: false, mode: 'no-save' };
    }
    
    await Lumina.DB.adapter.saveFile(fileKey, data);
    await Lumina.DB.loadHistoryFromDB();

    if (Lumina.State.app.dbReady) {
        if (window.dataManager && window.dataManager.refreshStats) {
            await window.dataManager.refreshStats();
        }
    }
    
    return { saved: true, mode: saveMode };
};

Lumina.DB._autoSaveEnabled = true;
Lumina.DB._saveQueue = [];
Lumina.DB._saveTimer = null;

Lumina.DB.updateHistoryProgress = () => {
    // 如果自动保存被禁用（正在打开大文件），直接返回
    if (!Lumina.DB._autoSaveEnabled) return;

    const state = Lumina.State.app;
    if (!state.currentFile.name || !state.document.items.length) return;
    
    // 如果用户选择不保存到书库，跳过自动保存
    if (state.currentFile.skipSave) return;

    clearTimeout(Lumina.DB._historyUpdateTimer);
    Lumina.DB._historyUpdateTimer = setTimeout(async () => {
        if (state.dbReady && state.currentFile.fileKey) {
            try {
                // 关键改动：false = 只更新进度，不存 content
                await Lumina.DB.saveHistory(
                    state.currentFile.name, 
                    state.currentFile.type, 
                    state.currentFile.wordCount, 
                    null, 
                    false  // isFullSave = false
                );
            } catch (err) { 
                console.warn('Progress save failed:', err);
            }
        }
    }, 1000); // 防抖 1 秒
};

Lumina.DB.loadHistoryFromDB = async () => {
    const t = Lumina.I18n.t;
    const list = Lumina.DOM.historyList;
    const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
    
    // SQLite 模式：先显示骨架屏（4条占位）
    if (isSQLite && !list.querySelector('.history-item')) {
        list.innerHTML = Array(4).fill(`
            <div class="hist-skeleton">
                <div class="skeleton-bg hist-icon-skel"></div>
                <div style="flex:1">
                    <div class="skeleton-bg hist-line-skel"></div>
                    <div class="skeleton-bg hist-line-skel short"></div>
                </div>
            </div>
        `).join('');
        await new Promise(r => setTimeout(r, 50));
    }
    
    try {
        const files = await Lumina.DB.adapter.getAllFiles();
        Lumina.Renderer.renderHistoryFromDB(files);
    } catch (err) {
        list.innerHTML = `<div class="history-empty"><div>${Lumina.I18n.t('loadFailed')}</div></div>`;
    }
};

// ==================== 历史记录操作 ====================
Lumina.HistoryActions = {
    // 打开文件
    async openFile(fileKey) {
        const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
        
        if (isSQLite) {
            Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = Lumina.I18n.t('loadingFile');
            Lumina.DOM.loadingScreen.classList.add('active');
        }
        
        try {
            let fileData;
            
            if (isSQLite) {
                console.log('[History] 调用 getFileSmart 打开:', fileKey);
                fileData = await Lumina.DB.adapter.getFileSmart(fileKey);
            } else {
                fileData = await Lumina.DB.adapter.getFile(fileKey);
            }
            
            if (fileData) {
                await Lumina.DB.restoreFileFromDB(fileData);
                Lumina.DOM.historyPanel.classList.remove('open');
                
                // 打开书籍后，标记书库数据需要刷新（下次打开时重新加载）
                if (Lumina.DataManager) {
                    Lumina.DataManager.invalidateCache();
                }
            } else {
                Lumina.UI.showDialog(Lumina.I18n.t('fileDataLost'));
            }
        } catch (err) {
            console.error('Open file error:', err);
            Lumina.UI.showDialog(Lumina.I18n.t('fileDataLost'));
        } finally {
            if (isSQLite) {
                Lumina.DOM.loadingScreen.classList.remove('active');
                Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = Lumina.I18n.t('loading');
            }
        }
    },
    
    // 导出文件（历史面板右滑导出）- 支持加密导出
    // 复用 DataManager 的导出逻辑
    async exportFile(fileKey) {
        if (!window.dataManager) {
            Lumina.UI.showToast('导出系统未初始化');
            return;
        }
        await window.dataManager.exportSingle(fileKey);
    },
    
    // 删除文件（已确认）
    async deleteFile(fileKey, itemElement) {
        // 先执行删除动画
        if (itemElement) {
            itemElement.style.transform = 'translateX(-100%)';
            itemElement.style.opacity = '0';
            await new Promise(r => setTimeout(r, 200));
        }
        
        try {
            const isCurrentFile = fileKey === Lumina.State.app.currentFile.fileKey;
            
            await Lumina.DB.adapter.deleteFile(fileKey);
            
            if (isCurrentFile) {
                Lumina.State.app.currentFile.skipSave = true;
                // 跳转到欢迎页面（与书库删除逻辑保持一致）
                Lumina.Actions.returnToWelcome();
            }
            
            // 刷新历史记录列表（重新渲染）
            await Lumina.DB.loadHistoryFromDB();
            
            // 更新数据管理器统计
            if (Lumina.DataManager) {
                Lumina.DataManager.currentStats = await Lumina.DB.adapter.getStorageStats();
                Lumina.DataManager.updateSettingsBar();
            }
            
            Lumina.UI.showToast(Lumina.I18n.t('fileDeleted'));
        } catch (err) {
                console.error('Delete file error:', err);
                Lumina.UI.showToast(Lumina.I18n.t('deleteFailed'));
                // 删除失败，复位动画
                if (itemElement) {
                    itemElement.style.transform = '';
                    itemElement.style.opacity = '';
                    const content = itemElement.querySelector('.history-item-content');
                    if (content) content.style.transform = '';
                    itemElement.classList.remove('swiped-left', 'swiped-right');
                }
            }
    },
    
    // 绑定滑动手势（移动端）
    bindSwipe(item, container, content, fileKey) {
        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let isDragging = false;
        let startTime = 0;
        
        const SWIPE_THRESHOLD = 80; // 滑动触发阈值
        const MAX_SWIPE = 120; // 最大滑动距离
        
        const handleTouchStart = (e) => {
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            startTime = Date.now();
            isDragging = true;
            content.style.transition = 'none';
        };
        
        const handleTouchMove = (e) => {
            if (!isDragging) return;
            
            const touch = e.touches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;
            
            // 垂直滑动为主时，不处理水平滑动
            if (Math.abs(deltaY) > Math.abs(deltaX)) return;
            
            e.preventDefault();
            
            currentX = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, deltaX));
            content.style.transform = `translateX(${currentX}px)`;
            
            // 显示操作提示
            if (currentX > 30) {
                item.classList.add('showing-export');
                item.classList.remove('showing-delete');
            } else if (currentX < -30) {
                item.classList.add('showing-delete');
                item.classList.remove('showing-export');
            } else {
                item.classList.remove('showing-export', 'showing-delete');
            }
        };
        
        const handleTouchEnd = (e) => {
            if (!isDragging) return;
            isDragging = false;
            
            content.style.transition = 'transform 0.2s ease';
            
            const deltaTime = Date.now() - startTime;
            const velocity = currentX / deltaTime;
            
            // 快速滑动或超过阈值触发
            if (currentX > SWIPE_THRESHOLD || (currentX > 40 && velocity > 0.3)) {
                // 右滑 - 导出
                content.style.transform = `translateX(${SWIPE_THRESHOLD}px)`;
                item.classList.add('swiped-right');
                item.classList.remove('swiped-left', 'showing-export', 'showing-delete');
                
                // 自动执行导出
                setTimeout(() => {
                    this.exportFile(fileKey);
                    // 复位
                    setTimeout(() => {
                        content.style.transform = '';
                        item.classList.remove('swiped-right');
                    }, 300);
                }, 200);
            } else if (currentX < -SWIPE_THRESHOLD || (currentX < -40 && velocity < -0.3)) {
                // 左滑 - 删除
                content.style.transform = `translateX(-${SWIPE_THRESHOLD}px)`;
                item.classList.add('swiped-left');
                item.classList.remove('swiped-right', 'showing-export', 'showing-delete');
                
                // 标记正在显示对话框，防止外部点击复位
                item._showingDialog = true;
                
                // 显示确认对话框
                setTimeout(() => {
                    Lumina.UI.showDialog(Lumina.I18n.t('confirmDeleteFile'), 'confirm', (confirmed) => {
                        item._showingDialog = false;
                        if (confirmed) {
                            Lumina.HistoryActions.deleteFile(fileKey, item);
                        } else {
                            // 取消，复位滑动状态
                            content.style.transform = '';
                            item.classList.remove('swiped-left');
                        }
                    });
                }, 100);
            } else {
                // 复位
                content.style.transform = '';
                item.classList.remove('swiped-left', 'swiped-right', 'showing-export', 'showing-delete');
            }
            
            currentX = 0;
        };
        
        // 触摸事件
        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);
        
        // 点击外部复位
        document.addEventListener('click', (e) => {
            // 如果正在显示对话框，不复位
            if (item._showingDialog) return;
            // 如果点击的是对话框区域，不复位
            if (e.target.closest('.custom-dialog') || e.target.closest('#customDialog')) return;
            
            if (!item.contains(e.target) && (item.classList.contains('swiped-left') || item.classList.contains('swiped-right'))) {
                content.style.transform = '';
                item.classList.remove('swiped-left', 'swiped-right');
            }
        });
    }
};

Lumina.Renderer.renderHistoryFromDB = (files) => {
    if (!files || !files.length) {
        Lumina.DOM.historyList.innerHTML = `<div class="history-empty"><svg><use href="#icon-clock"/></svg><div>${Lumina.I18n.t('noHistory')}</div></div>`;
        return;
    }

    const sortedFiles = files.sort((a, b) => new Date(b.lastReadTime || 0).getTime() - new Date(a.lastReadTime || 0).getTime());

    const fileIcons = {
        docx: { letter: 'W', color: '#4472C4' }, txt: { letter: 'T', color: '#6B7280' },
        md: { letter: 'M', color: '#8B5CF6' }, html: { letter: 'H', color: '#E34C26' },
        epub: { letter: 'E', color: '#10B981' }, json: { letter: 'J', color: '#F59E0B' },
        pdf: { letter: 'P', color: '#DC2626' }
    };

    const getFileIcon = (type) => {
        const { letter = '?', color = '#999' } = fileIcons[type] || {};
        return `<svg viewBox="0 0 20.83 25.92" style="color:${color}"><path fill="currentColor" d="M3 2h12l6 6v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path fill="rgba(255,255,255,0.5)" d="M15 2v6h6"/><text x="11" y="14" font-family="Arial" font-size="10" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${letter}</text></svg>`;
    };

    Lumina.DOM.historyList.innerHTML = sortedFiles.map((item, index) => {
        const timeAgo = Lumina.Utils.formatTimeAgo(item.lastReadTime);
        const readTimeStr = Lumina.Utils.formatReadTime(Math.ceil(item.wordCount / (Lumina.State.settings.language === 'zh' ? 300 : 200)));

        return `
            <div class="history-item" data-filekey="${item.fileKey}" data-index="${index}">
                <div class="history-item-swipe-container">
                    <div class="history-item-actions history-actions-left" data-action="export">
                        <svg class="icon"><use href="#icon-export"/></svg>
                        <span>${Lumina.I18n.t('exportFile')}</span>
                    </div>
                    <div class="history-item-content">
                        <div class="history-icon">${getFileIcon(item.fileType)}</div>
                        <div class="history-main">
                            <div class="history-header-row">
                                <div class="history-name">${Lumina.Utils.escapeHtml(item.metadata?.title || item.fileName.replace(/\.[^/.]+$/, ''))}</div>
                                <div class="history-time">${timeAgo}</div>
                            </div>
                            <div class="history-meta-row">
                                <div class="history-meta-item"><svg class="icon"><use href="#icon-word-count"/></svg><span>${Lumina.Utils.formatWordCount(item.wordCount)} ${Lumina.I18n.t('words')}</span></div>
                                ${readTimeStr ? `<div class="history-meta-item"><svg class="icon"><use href="#icon-clock"/></svg><span>${readTimeStr}</span></div>` : ''}
                            </div>
                            ${item.chapterTitle ? `<div class="history-progress"><svg class="icon"><use href="#icon-chapter"/></svg><span>${Lumina.Utils.escapeHtml(item.chapterTitle)}</span></div>` : ''}
                        </div>
                        <div class="history-hover-actions">
                            <button class="history-action-btn history-action-export" data-tooltip-text="${Lumina.I18n.t('exportFile')}">
                                <svg class="icon" style="width:20px;height:20px;"><use href="#icon-export"/></svg>
                            </button>
                            <button class="history-action-btn history-action-open" data-tooltip-text="${Lumina.I18n.t('openBook')}">
                                <svg class="icon" style="width:20px;height:20px;"><use href="#icon-check"/></svg>
                            </button>
                            <button class="history-action-btn history-action-delete" data-tooltip-text="${Lumina.I18n.t('deleteFile')}">
                                <svg class="icon" style="width:20px;height:20px;"><use href="#icon-delete"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="history-item-actions history-actions-right" data-action="delete">
                        <svg class="icon"><use href="#icon-delete"/></svg>
                        <span>${Lumina.I18n.t('deleteFile')}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // 绑定事件
    Lumina.DOM.historyList.querySelectorAll('.history-item').forEach(item => {
        const fileKey = item.dataset.filekey;
        const container = item.querySelector('.history-item-swipe-container');
        const content = item.querySelector('.history-item-content');
        
        // 点击打开（内容区域）
        content.addEventListener('click', async (e) => {
            // 如果点击的是悬浮按钮，不触发打开
            if (e.target.closest('.history-hover-actions') || e.target.closest('.history-action-btn')) return;
            
            // 如果处于滑动状态，不触发打开
            if (item.classList.contains('swiped-left') || item.classList.contains('swiped-right')) {
                // 复位滑动
                item.classList.remove('swiped-left', 'swiped-right');
                return;
            }
            
            await Lumina.HistoryActions.openFile(fileKey);
        });
        
        // 悬浮按钮事件（注意：按钮顺序是 导出-打开-删除）
        const exportBtn = item.querySelector('.history-action-export');
        const openBtn = item.querySelector('.history-action-open');
        const deleteBtn = item.querySelector('.history-action-delete');
        
        exportBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            Lumina.HistoryActions.exportFile(fileKey);
        });
        
        openBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            Lumina.HistoryActions.openFile(fileKey);
        });
        
        deleteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            Lumina.UI.showDialog(Lumina.I18n.t('confirmDeleteFile'), 'confirm', (confirmed) => {
                if (confirmed) {
                    Lumina.HistoryActions.deleteFile(fileKey, item);
                }
            });
        });
        
        // 滑动操作（移动端）
        Lumina.HistoryActions.bindSwipe(item, container, content, fileKey);
    });
};

Lumina.DB.restoreFileFromDB = async (fileData) => {
    // console.log(fileData)
    const t = Lumina.I18n.t;
    const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
    
    try {
        if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) Lumina.TTS.manager.stop();

        const state = Lumina.State.app;
        state.currentFile.name = fileData.fileName;
        state.currentFile.type = fileData.fileType;
        state.currentFile.wordCount = fileData.wordCount;
        state.currentFile.fileKey = fileData.fileKey;
        state.currentFile.metadata = fileData.metadata;
        state.currentFile.skipSave = false; // 从书库打开的文件允许自动保存

        state.document = { items: fileData.content, type: fileData.fileType };

        if (['txt', 'md', 'html'].includes(fileData.fileType)) {
            state.currentFile.rawContent = fileData.content.map(item => item.text || '').join('\n');
        }

        if (fileData.customRegex) {
            Lumina.State.settings.chapterRegex = fileData.customRegex.chapter || '';
            Lumina.State.settings.sectionRegex = fileData.customRegex.section || '';
            document.getElementById('chapterRegex').value = Lumina.State.settings.chapterRegex;
            document.getElementById('sectionRegex').value = Lumina.State.settings.sectionRegex;
            Lumina.Parser.RegexCache.updateCustomPatterns(Lumina.State.settings.chapterRegex, Lumina.State.settings.sectionRegex);
        }

        Lumina.State.settings.chapterNumbering = fileData.chapterNumbering || 'none';
        Lumina.UI.updateActiveButtons();
        
        // 恢复热力图数据（始终重置，避免保留上一本书的数据）
        state.currentFile.heatMap = fileData.heatMap || null;

        if (Lumina.State.settings.chapterRegex || Lumina.State.settings.sectionRegex) await Lumina.Parser.reparseWithRegex();
        else {
            Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
            state.document.items.forEach(item => {
                if (item.type && item.type.startsWith('heading')) {
                    const level = parseInt(item.type.replace('heading', '')) || 1;
                    const newItem = Lumina.Parser.processHeading(level, item.text || '');
                    item.display = newItem.display;
                    // 【关键】保留 Markdown 的 inlineContent
                    // 如果原 item 有 inlineContent，则保留，不覆盖
                    if (!item.inlineContent && newItem.inlineContent) {
                        item.inlineContent = newItem.inlineContent;
                    }
                }
            });
        }

        state.chapters = Lumina.Parser.buildChapters(state.document.items);
        state.currentChapterIndex = fileData.lastChapter || 0;
        
        // 设置默认页码为第1页，renderCurrentChapter 会根据 savedScrollIndex 覆盖为上次阅读位置
        state.currentPageIdx = 0;

        Lumina.Renderer.generateTOC();
        const savedScrollIndex = fileData.lastScrollIndex;
        Lumina.Renderer.renderCurrentChapter(savedScrollIndex);
        
        // 初始化 G点热力图
        Lumina.HeatMap.onBookOpen();

        // 显示书名（优先用 metadata.title，支持简繁转换）
        Lumina.DOM.fileInfo.textContent = Lumina.Converter?.getDisplayTitle?.(fileData) || fileData.fileName;
        Lumina.DOM.welcomeScreen.style.display = 'none';

        const isMobileView = window.innerWidth <= 768;
        if (!isMobileView) {
            // 桌面端：显示目录
            Lumina.DOM.sidebarLeft.classList.add('visible');
            Lumina.DOM.readingArea.classList.add('with-sidebar');
            Lumina.State.settings.sidebarVisible = true;
        } else {
            // 移动端：隐藏目录
            Lumina.DOM.sidebarLeft.classList.remove('visible');
            Lumina.DOM.readingArea.classList.remove('with-sidebar');
            Lumina.State.settings.sidebarVisible = false;
            // 移动端：关闭所有右侧面板
            Lumina.DOM.sidebarRight?.classList.remove('open');
            Lumina.DOM.historyPanel?.classList.remove('open');
            Lumina.DOM.searchPanel?.classList.remove('open');
            Lumina.DOM.aboutPanel?.classList.remove('active');
            document.getElementById('annotationPanel')?.classList.remove('open');
        }

        if (savedScrollIndex !== undefined && savedScrollIndex !== null) {
            requestAnimationFrame(() => {
                const target = Lumina.DOM.contentWrapper.querySelector(`[data-index="${savedScrollIndex}"]`);
                if (target) {
                    target.classList.add('last-read-marker');
                    target.setAttribute('data-marker-text', t('lastReadHere') || '上次阅读位置');
                    const clearMarker = () => {
                        target.classList.add('interacted');
                        setTimeout(() => {
                            target.classList.remove('last-read-marker', 'interacted');
                            target.removeAttribute('data-marker-text');
                        }, 600);
                        document.removeEventListener('mousemove', clearMarker);
                        document.removeEventListener('click', clearMarker);
                        document.removeEventListener('keydown', clearMarker);
                        Lumina.DOM.contentScroll.removeEventListener('scroll', clearMarker);
                    };
                    requestAnimationFrame(() => {
                        document.addEventListener('mousemove', clearMarker, { once: true });
                        document.addEventListener('click', clearMarker, { once: true });
                        document.addEventListener('keydown', clearMarker, { once: true });
                        Lumina.DOM.contentScroll.addEventListener('scroll', clearMarker, { once: true });
                    });
                }
            });
        }

        // 更新最后阅读时间（所有模式都执行）
        if (state.dbReady && fileData.fileKey) {
            try {
                fileData.lastReadTime = Lumina.DB.getLocalTimeString();
                await Lumina.DB.adapter.saveFile(fileData.fileKey, {
                    ...fileData,
                    lastReadTime: fileData.lastReadTime
                });
                
                // 同步刷新书库和历史面板
                if (window.dataManager && window.dataManager.refreshStats) {
                    await window.dataManager.refreshStats();
                }
            } catch (err) { 
                console.warn('[restoreFileFromDB] 更新阅读时间失败:', err);
            }
        }
        
        // 非 SQLite 模式显示"已从书库快速恢复"
        if (!isSQLite) {
            Lumina.UI.showToast(t('dbUsingCache'));
        }

        await Lumina.DB.loadHistoryFromDB();
        Lumina.Search.clearResults();
        
        // 加载注释/书签
        Lumina.State.app.annotations = fileData.annotations || [];
        Lumina.Annotations.renderAnnotations();
        
        // 触发文件打开事件（用于简繁转换等模块）
        window.dispatchEvent(new CustomEvent('fileOpened', { 
            detail: { fileKey: fileData.fileKey }
        }));
        
    } catch (err) {
        throw err;
    }
};

Lumina.DB.clearHistory = async () => {
    const currentFileKey = Lumina.State.app.currentFile.fileKey;
    const shouldReturnToWelcome = Lumina.State.app.dbReady && currentFileKey;

    if (Lumina.State.app.dbReady) {
        const files = await Lumina.DB.adapter.getAllFiles();
        for (const f of files) await Lumina.DB.adapter.deleteFile(f.fileKey);
    }
    localStorage.removeItem('luminaHistory');
    
    // 清除说明书导入标记，以便下次刷新时重新导入
    localStorage.removeItem('luminaGuideImported');
    
    Lumina.Renderer.renderHistoryFromDB([]);
    if (Lumina.DataManager) {
        Lumina.DataManager.currentStats = await Lumina.DB.adapter.getStorageStats();
        Lumina.DataManager.updateSettingsBar();
    }

    if (shouldReturnToWelcome) {
        Lumina.Actions.returnToWelcome();
    }
};

