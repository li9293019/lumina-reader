// ==================== 13. 数据管理器 ====================

Lumina.DataManager = class {
    constructor() {
        this.isPreloaded = false;
        this.currentStats = null;
        this.currentView = Lumina.ConfigManager.get('library.viewMode') || 'card';
    }

    init() {
        document.getElementById('openDataManager').addEventListener('click', () => this.open());
        document.getElementById('closeDataManager').addEventListener('click', () => this.close());
        document.getElementById('batchExportBtn').addEventListener('click', () => this.batchExport());
        document.getElementById('importDataBtn').addEventListener('click', () => this.batchImport());
        document.getElementById('clearLibraryBtn').addEventListener('click', () => this.confirmClearLibrary());
        document.getElementById('dataManagerPanel').addEventListener('click', (e) => {
            if (e.target.id === 'dataManagerPanel') this.close();
        });

        // 初始化视图切换
        this.initViewToggle();
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

    async preload() {
        if (this.isPreloaded) return;

        this.currentStats = await Lumina.DB.adapter.getStorageStats();
        this.updateSettingsBar();
        this.renderStats();
        this.renderGrid();
        this.isPreloaded = true;
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
        
        try {
            if (isSQLite) {
                // SQLite 模式：先显示加载状态，再获取数据
                this.showLoadingState();
                
                // 获取数据（优先缓存，自动处理后台刷新）
                const stats = await Lumina.DB.adapter.getStorageStats();
                
                this.currentStats = stats;
                this.renderStats();
                this.renderGrid();
                
                // 如果数据来自缓存（可能过期），在顶部显示弱提示
                if (stats._stale) {
                    Lumina.UI.showToast('当前为离线数据，后台同步中...', 2000);
                }
            } else {
                // IndexedDB 模式：直接加载（很快）
                await this.refreshStats();
            }
        } catch (error) {
            this.showErrorState(error.message || '加载失败', () => this.open());
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
            // 没有缓存，显示骨架屏
            grid.innerHTML = Array(4).fill(`
                <div class="lib-card-skel" style="background:var(--bg-secondary);border-radius:12px;overflow:hidden;">
                    <div class="skeleton-bg" style="aspect-ratio:176/250;width:100%;"></div>
                    <div style="padding:12px;">
                        <div class="skeleton-bg" style="height:14px;width:80%;margin-bottom:8px;border-radius:3px;"></div>
                        <div class="skeleton-bg" style="height:12px;width:50%;border-radius:3px;"></div>
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
                    ${t('retry') || '重试'}
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
        document.getElementById('totalFilesCount').textContent = totalFiles;
        document.getElementById('totalStorageSize').textContent = totalSize + 'MB';
        document.getElementById('totalImagesCount').textContent = imageCount;
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
        const { files } = this.currentStats;

        // 设置当前视图
        grid.dataset.view = this.currentView;

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
        const sizeStr = file.estimatedSize ? parseFloat(file.estimatedSize).toFixed(1) + 'MB' : '--';
        const fileName = Lumina.Utils.escapeHtml(file.fileName);
        const chapterHtml = file.chapterTitle ? `<div class="card-chapter">${Lumina.Utils.escapeHtml(file.chapterTitle)}</div>` : '<div class="card-chapter"></div>';
        const coverHtml = hasCover 
            ? `<img src="${file.cover}" class="cover-img" alt="" onerror="this.style.display='none';this.parentNode.innerHTML='<div class=\\'cover-placeholder\\'><svg><use href=\\'#icon-book\\'/></svg></div>';">`
            : `<div class="cover-placeholder"><svg><use href="#icon-book"/></svg></div>`;
        
        return `
        <div class="data-card" data-filekey="${Lumina.Utils.escapeHtml(file.fileKey)}">
            <!-- 滑动操作层（移动端显示，PC隐藏） -->
            <div class="swipe-layer">
                <div class="swipe-action export-action" data-action="export">
                    <svg class="icon"><use href="#icon-export"/></svg>
                    <span>${Lumina.I18n.t('exportFile')}</span>
                </div>
                <div class="swipe-content">
                    <div class="card-cover">
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
            
            // 点击卡片打开（排除按钮区域）
            card.addEventListener('click', (e) => {
                if (e.target.closest('.cover-btn') || e.target.closest('.swipe-action')) return;
                this.openFile(fileKey);
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
        
        // 移动端绑定滑动手势
        if (isMobile) {
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
                    // 确认是点击 - 打开书籍
                    content.style.transform = '';
                    this.openFile(fileKey);
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
        const jsonContent = JSON.stringify(data, null, 2);
        const fileName = `Lumina_${data.fileName.replace(/\.[^/.]+$/, '')}_${new Date().getTime()}.json`;
        
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
                
                await Filesystem.writeFile({
                    path: `LuminaReader/${fileName}`,
                    data: jsonContent,
                    directory: 'DOCUMENTS',
                    encoding: 'utf8'
                });
                
                Lumina.UI.showToast(Lumina.I18n.t('exportSuccess'));
            } catch (err) {
                console.error('[Export] Filesystem error:', err);
                Lumina.UI.showToast(Lumina.I18n.t('exportFailed') + ': ' + (err.message || '无法写入文件'));
            }
        } else {
            this.downloadJSON(jsonContent, fileName);
            Lumina.UI.showToast(Lumina.I18n.t('exportSuccess'));
        }
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
            
            const fileName = `Lumina_${data.fileName.replace(/\.[^/.]+$/, '')}_${new Date().getTime()}.lmn`;
            
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
                
                // 将 ArrayBuffer 转换为 base64 保存
                const base64Data = this.arrayBufferToBase64(encryptedBuffer);
                
                await Filesystem.writeFile({
                    path: `LuminaReader/${fileName}`,
                    data: base64Data,
                    directory: 'DOCUMENTS'
                });
                
                progressDialog.close();
                Lumina.UI.showToast(Lumina.I18n.t('exportSuccess'));
            } else {
                // 浏览器环境：直接下载二进制文件
                this.downloadBinary(encryptedBuffer, fileName);
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
    downloadBinary(buffer, fileName) {
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

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
    
    // 明文批量导出
    async batchExportPlain(batchData) {
        const jsonContent = JSON.stringify(batchData, null, 2);
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
                
                await Filesystem.writeFile({
                    path: `LuminaReader/${fileName}`,
                    data: jsonContent,
                    directory: 'DOCUMENTS',
                    encoding: 'utf8'
                });
                
                Lumina.UI.showToast(Lumina.I18n.t('batchExportSuccess', batchData.totalBooks));
            } catch (err) {
                console.error('[Export] Filesystem error:', err);
                Lumina.UI.showToast('导出失败: ' + (err.message || '无法写入文件'));
            }
        } else {
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
                
                const base64Data = this.arrayBufferToBase64(encryptedBuffer);
                
                await Filesystem.writeFile({
                    path: `LuminaReader/${fileName}`,
                    data: base64Data,
                    directory: 'DOCUMENTS'
                });
                
                progressDialog.close();
                Lumina.UI.showToast(Lumina.I18n.t('batchExportSuccess', batchData.totalBooks));
            } else {
                this.downloadBinary(encryptedBuffer, fileName);
                progressDialog.close();
                Lumina.UI.showToast(Lumina.I18n.t('batchExportSuccess', batchData.totalBooks));
            }
        } catch (err) {
            progressDialog.close();
            console.error('[Export] 加密失败:', err);
            Lumina.UI.showToast(Lumina.I18n.t('exportFailed') + ': ' + err.message);
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
            // App 环境：直接使用系统文件选择器
            // 提示用户去默认目录找文件（Android 文件选择器无法控制默认目录）
            this.showSystemFilePickerWithHint();
        } else {
            // 浏览器环境：使用系统文件选择
            this.showSystemFilePicker();
        }
    }
    
    // 显示带提示的文件选择器
    showSystemFilePickerWithHint() {
        // 直接打开系统文件选择器，不显示额外提示
        this.showSystemFilePicker();
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
                    else
                        throw new Error('Invalid format');
                }
            } catch (err) {
                console.error('[FilePicker] 导入失败:', err);
                Lumina.UI.showDialog(Lumina.I18n.t('importFailed') + ': ' + (err.message || 'Unknown error'));
            }
        };
        input.click();
    }
    
    // 导入 .lmn 加密文件
    async importLmnFile(file) {
        console.log('[Import LMN] 开始导入:', file.name, 'size:', file.size);
        
        let arrayBuffer;
        try {
            // 尝试使用 file.arrayBuffer()
            if (file.arrayBuffer) {
                arrayBuffer = await file.arrayBuffer();
            } else {
                // APP 环境回退使用 FileReader
                arrayBuffer = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsArrayBuffer(file);
                });
            }
            console.log('[Import LMN] 读取文件成功:', arrayBuffer.byteLength, 'bytes');
        } catch (e) {
            console.error('[Import LMN] 读取文件失败:', e);
            throw new Error('读取文件失败: ' + e.message);
        }
        
        // 检测是否为 .lmn 格式
        if (!Lumina.Crypto.isLmnFile(arrayBuffer)) {
            throw new Error('无效的 .lmn 文件格式');
        }
        
        // 检测是否需要密码
        const view = new Uint8Array(arrayBuffer);
        const hasPassword = (view[5] & 0x01) !== 0;
        
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
            const data = await Lumina.Crypto.decrypt(arrayBuffer, password, (progress) => {
                progressDialog.update(progress);
            });
            
            progressDialog.close();
            
            // 验证并导入数据
            if (data.exportType === 'batch' && Array.isArray(data.books)) {
                await this.handleBatchImport(data.books);
            } else if (data.fileName && Array.isArray(data.content)) {
                await this.importDataToDB(data);
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
        const newKey = `${data.fileName}_${Date.now()}`;
        await Lumina.DB.adapter.saveFile(newKey, {
            fileName: data.fileName,
            fileType: data.fileType || 'txt',
            fileSize: 0,
            content: data.content,
            wordCount: data.wordCount || 0,
            cover: data.cover || null,
            customRegex: data.customRegex || { chapter: '', section: '' },
            chapterNumbering: data.chapterNumbering || 'none',
            annotations: data.annotations || [],
            heatMap: data.heatMap || null,
            lastChapter: data.lastChapter || 0,
            lastScrollIndex: data.lastScrollIndex || 0,
            chapterTitle: data.chapterTitle || '',
            lastReadTime: new Date().toISOString()
        });
        await this.refreshStats();
        await Lumina.DB.loadHistoryFromDB();
        this.updateSettingsBar();
        Lumina.UI.showToast(Lumina.I18n.t('importSuccess'));
    }
    
    // 辅助方法：从解析后的数据导入（用于 Filesystem 读取）
    async importJSONFileFromData(data) {
        try {
            if (!this.validateHistoryData(data)) {
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
            if (!this.validateHistoryData(data)) {
                Lumina.UI.showDialog(Lumina.I18n.t('invalidHistoryFile'));
                return false;
            }
            const newKey = `${data.fileName}_${Date.now()}`;
            await Lumina.DB.adapter.saveFile(newKey, {
                fileName: data.fileName,
                fileType: data.fileType || 'txt',
                fileSize: 0,
                content: data.content,
                wordCount: data.wordCount || 0,
                cover: data.cover || null,
                customRegex: data.customRegex || { chapter: '', section: '' },
                chapterNumbering: data.chapterNumbering || 'none',
                annotations: data.annotations || [],
                heatMap: data.heatMap || null,  // 恢复热力图数据
                lastChapter: data.lastChapter || 0,
                lastScrollIndex: data.lastScrollIndex || 0,
                chapterTitle: data.chapterTitle || '',
                lastReadTime: new Date().toISOString()
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
        
        const baseData = {
            fileName: state.currentFile.name, 
            fileType: state.currentFile.type,
            fileSize: state.currentFile.handle?.size || 0,
            ...(includeContent && { content: processedContent }),
            wordCount: state.currentFile.wordCount,
            lastChapter: state.currentChapterIndex,
            lastScrollIndex: Lumina.Renderer.getCurrentVisibleIndex(),
            chapterTitle: currentChapter ? (currentChapter.isPreface ? Lumina.I18n.t('preface') : currentChapter.title) : '',
            lastReadTime: new Date().toISOString(),
            customRegex: { chapter: Lumina.State.settings.chapterRegex, section: Lumina.State.settings.sectionRegex },
            chapterNumbering: Lumina.State.settings.chapterNumbering,
            annotations: [],
            cover: overrides.cover || null,
            heatMap: state.currentFile.heatMap // 保存热力图数据（未设置时为 undefined，便于合并逻辑判断）
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
                    lastReadTime: new Date().toISOString(),
                    chapterNumbering: Lumina.State.settings.chapterNumbering,
                    customRegex: { 
                        chapter: Lumina.State.settings.chapterRegex, 
                        section: Lumina.State.settings.sectionRegex 
                    },
                    heatMap: heatMapValue
                };
                await Lumina.DB.adapter.saveFile(fileKey, patchData);
                await Lumina.DB.loadHistoryFromDB();
                return { saved: true, mode: 'patch' };
            }
        } catch (e) {
            console.warn('Progress update failed, fallback to full save', e);
        }
    }

    // 全量保存（首次打开、重新解析）
    let finalCover = cover;
    let existingHeatMap = null;
    if (Lumina.State.app.dbReady) {
        const existingData = await Lumina.DB.adapter.getFile(fileKey);
        if (existingData) {
            if (finalCover === null && existingData.cover) finalCover = existingData.cover;
            // 保留现有的 heatMap，如果当前没有的话
            if (!Lumina.State.app.currentFile.heatMap && existingData.heatMap) {
                existingHeatMap = existingData.heatMap;
            }
        }
    }
    
    // 如果有现有的 heatMap 且当前没有，恢复它
    if (existingHeatMap) {
        Lumina.State.app.currentFile.heatMap = existingHeatMap;
    }

    const data = await Lumina.DB.HistoryDataBuilder.build(fileKey, { cover: finalCover }, true, saveMode);
    
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
                                <div class="history-name">${Lumina.Utils.escapeHtml(item.fileName)}</div>
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
    const t = Lumina.I18n.t;
    const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
    
    try {
        if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) Lumina.TTS.manager.stop();

        const state = Lumina.State.app;
        state.currentFile.name = fileData.fileName;
        state.currentFile.type = fileData.fileType;
        state.currentFile.wordCount = fileData.wordCount;
        state.currentFile.fileKey = fileData.fileKey;
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

        Lumina.DOM.fileInfo.textContent = fileData.fileName;
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

        // 关键修改：只有非 SQLite 才显示"已从书库快速恢复"和立即保存
        if (!isSQLite) {
            Lumina.UI.showToast(t('dbUsingCache'));
            // 仅在 IndexedDB 模式下立即保存（更新阅读时间）
            if (state.dbReady && fileData.fileKey) {
                try {
                    fileData.lastReadTime = new Date().toISOString();
                    await Lumina.DB.adapter.saveFile(fileData.fileKey, fileData);
                } catch (err) { }
            }
        }
        // SQLite 模式下不立即保存，避免用本地缓存覆盖服务器数据
        // 阅读进度会在滚动时通过 saveCurrentProgress 保存
        // 注释会在编辑时通过 saveAnnotations 保存

        await Lumina.DB.loadHistoryFromDB();
        Lumina.Search.clearResults();
        
        // 加载注释/书签
        Lumina.State.app.annotations = fileData.annotations || [];
        Lumina.Annotations.renderAnnotations();
        
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

