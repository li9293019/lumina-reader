// ==================== Web 内容缓存管理器 ====================
// 提供界面让用户查看和管理本地 content 缓存

Lumina.CacheManager = {
    isOpen: false,
    currentStats: null,
    
    // 打开缓存管理面板
    open() {
        if (this.isOpen) return;
        
        // 检查是否是 HTTP 模式（Python后端）
        const isHttpMode = location.href.startsWith('http');
        if (!isHttpMode) {
            Lumina.UI.showToast(Lumina.I18n.t('cacheManagerNoNeed'));
            return;
        }
        
        this.isOpen = true;
        this.bindEvents();
        this.loadCacheStats();
        
        // 显示面板
        const panel = document.getElementById('cacheManagerPanel');
        if (panel) {
            panel.classList.add('active');
        }
    },
    
    // 关闭面板
    close() {
        this.isOpen = false;
        const panel = document.getElementById('cacheManagerPanel');
        if (panel) {
            panel.classList.remove('active');
        }
    },
    
    // 绑定事件
    bindEvents() {
        // 关闭按钮
        const closeBtn = document.getElementById('closeCacheManager');
        if (closeBtn) {
            closeBtn.onclick = () => this.close();
        }
        
        // 点击遮罩关闭
        const panel = document.getElementById('cacheManagerPanel');
        if (panel) {
            panel.onclick = (e) => {
                if (e.target === panel) this.close();
            };
        }
        
        // 刷新按钮
        const refreshBtn = document.getElementById('cacheRefresh');
        if (refreshBtn) {
            refreshBtn.onclick = () => this.loadCacheStats();
        }
        
        // 清理全部按钮
        const clearAllBtn = document.getElementById('cacheClearAll');
        if (clearAllBtn) {
            clearAllBtn.onclick = () => this.confirmClearAll();
        }
    },
    
    // 加载缓存统计
    async loadCacheStats() {
        const loadingEl = document.getElementById('cacheManagerLoading');
        const contentEl = document.getElementById('cacheManagerContent');
        
        if (loadingEl) loadingEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        
        try {
            const impl = Lumina.DB.adapter.impl;
            const stats = await impl.getCacheStats();
            this.currentStats = stats;
            
            // 更新统计
            const countEl = document.getElementById('cacheCount');
            const sizeEl = document.getElementById('cacheSize');
            if (countEl) countEl.textContent = stats.count;
            if (sizeEl) sizeEl.textContent = this.formatSize(stats.size);
            
            // 更新列表
            this.renderCacheList(stats.files);
            
            if (loadingEl) loadingEl.style.display = 'none';
            if (contentEl) contentEl.style.display = 'block';
            
        } catch (e) {
            console.error('[CacheManager] 加载统计失败:', e);
            if (loadingEl) {
                loadingEl.innerHTML = `<p class="cache-error">${Lumina.I18n.t('cacheManagerLoadError')}: ${e.message}</p>`;
            }
        }
    },
    
    // 渲染缓存列表
    renderCacheList(files) {
        const listContainer = document.getElementById('cacheListItems');
        if (!listContainer) return;
        
        if (!files || files.length === 0) {
            listContainer.innerHTML = `<div class="cache-empty">${Lumina.I18n.t('cacheManagerEmpty')}</div>`;
            return;
        }
        
        listContainer.innerHTML = files.map(file => {
            const createdTime = this.formatTime(file.createdAt || file.lastAccess);
            const updatedTime = this.formatTime(file.updatedAt || file.lastAccess);
            
            return `
                <div class="cache-list-item" data-filekey="${file.fileKey}">
                    <span class="cache-item-name" title="${this.escapeHtml(file.fileName)}">
                        ${this.escapeHtml(file.fileName)}
                    </span>
                    <span class="cache-item-time">${createdTime}</span>
                    <span class="cache-item-time">${updatedTime}</span>
                    <span class="cache-item-size">${this.formatSize(file.size)}</span>
                    <button class="cache-item-delete" data-filekey="${file.fileKey}" data-i18n-tooltip="cacheManagerDelete">
                        <svg class="icon" style="width: 16px; height: 16px;"><use href="#icon-delete"/></svg>
                    </button>
                </div>
            `;
        }).join('');
        
        // 绑定单个删除事件
        listContainer.querySelectorAll('.cache-item-delete').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const fileKey = btn.dataset.filekey;
                this.clearFileCache(fileKey);
            };
        });
        
        // 重新绑定 tooltip
        if (window.bindTooltips) {
            window.bindTooltips();
        }
    },
    
    // 清理单个文件缓存
    async clearFileCache(fileKey) {
        if (!confirm(Lumina.I18n.t('cacheManagerConfirmDelete'))) return;
        
        try {
            const impl = Lumina.DB.adapter.impl;
            const success = await impl.clearFileCache(fileKey);
            
            if (success) {
                Lumina.UI.showToast(Lumina.I18n.t('cacheManagerDeleteSuccess'));
                this.loadCacheStats(); // 刷新
            } else {
                Lumina.UI.showToast(Lumina.I18n.t('cacheManagerDeleteFailed'));
            }
        } catch (e) {
            Lumina.UI.showToast(Lumina.I18n.t('cacheManagerDeleteFailed') + ': ' + e.message);
        }
    },
    
    // 确认清理所有缓存
    confirmClearAll() {
        if (!this.currentStats || this.currentStats.count === 0) {
            Lumina.UI.showToast(Lumina.I18n.t('cacheManagerEmpty'));
            return;
        }
        
        if (!confirm(Lumina.I18n.t('cacheManagerConfirmClear'))) return;
        
        this.clearAllCache();
    },
    
    // 清理所有缓存
    async clearAllCache() {
        const btn = document.getElementById('cacheClearAll');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="cache-spinner-small"></span> ' + Lumina.I18n.t('cacheManagerClearing');
        }
        
        try {
            const impl = Lumina.DB.adapter.impl;
            const result = await impl.clearAllCache();
            
            if (result.success) {
                const msg = Lumina.I18n.t('cacheManagerClearSuccess').replace('{count}', result.cleared);
                Lumina.UI.showToast(msg);
                this.loadCacheStats();
            } else {
                Lumina.UI.showToast(Lumina.I18n.t('cacheManagerClearFailed') + ': ' + result.error);
            }
        } catch (e) {
            Lumina.UI.showToast(Lumina.I18n.t('cacheManagerClearFailed') + ': ' + e.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `
                    <svg class="icon" style="width: 16px; height: 16px;"><use href="#icon-delete"/></svg>
                    <span data-i18n="cacheManagerClearAll">${Lumina.I18n.t('cacheManagerClearAll')}</span>
                `;
            }
        }
    },
    
    // 格式化大小
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },
    
    // 格式化时间
    formatTime(timeValue) {
        if (!timeValue || timeValue === 'unknown') return '-';
        
        try {
            const date = new Date(timeValue);
            if (isNaN(date.getTime())) return '-';
            
            const now = new Date();
            const diff = now - date;
            
            // 小于1分钟
            if (diff < 60000) return Lumina.I18n.t('timeJustNow');
            // 小于1小时
            if (diff < 3600000) return Lumina.I18n.t('timeMinutesAgo').replace('$1', Math.floor(diff / 60000));
            // 小于24小时
            if (diff < 86400000) return Lumina.I18n.t('timeHoursAgo').replace('$1', Math.floor(diff / 3600000));
            // 小于30天
            if (diff < 2592000000) return Lumina.I18n.t('timeDaysAgo').replace('$1', Math.floor(diff / 86400000));
            
            // 显示日期
            return date.toLocaleDateString();
        } catch (e) {
            return '-';
        }
    },
    
    // 转义 HTML
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
