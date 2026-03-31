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
            Lumina.UI.showToast('当前模式下无需管理缓存');
            return;
        }
        
        this.isOpen = true;
        this.createPanel();
        this.loadCacheStats();
    },
    
    // 创建管理面板
    createPanel() {
        // 移除已存在的面板
        const existing = document.getElementById('cacheManagerPanel');
        if (existing) existing.remove();
        
        const panel = document.createElement('div');
        panel.id = 'cacheManagerPanel';
        panel.className = 'cache-manager-panel';
        panel.innerHTML = `
            <div class="cache-manager-overlay"></div>
            <div class="cache-manager-container">
                <div class="cache-manager-header">
                    <h3>内容缓存管理</h3>
                    <button class="cache-manager-close" title="关闭">
                        <svg viewBox="0 0 24 24"><use href="#icon-close"/></svg>
                    </button>
                </div>
                <div class="cache-manager-body">
                    <div class="cache-manager-loading">
                        <div class="cache-manager-spinner"></div>
                        <p>正在统计缓存数据...</p>
                    </div>
                    <div class="cache-manager-content" style="display: none;">
                        <div class="cache-manager-summary">
                            <div class="cache-stat">
                                <span class="cache-stat-value" id="cacheCount">-</span>
                                <span class="cache-stat-label">已缓存书籍</span>
                            </div>
                            <div class="cache-stat">
                                <span class="cache-stat-value" id="cacheSize">-</span>
                                <span class="cache-stat-label">缓存大小</span>
                            </div>
                        </div>
                        <div class="cache-manager-actions">
                            <button class="cache-btn cache-btn-primary" id="cacheClearAll">
                                <svg viewBox="0 0 24 24"><use href="#icon-delete"/></svg>
                                清理所有内容缓存
                            </button>
                            <button class="cache-btn" id="cacheRefresh">
                                <svg viewBox="0 0 24 24"><use href="#icon-refresh"/></svg>
                                刷新统计
                            </button>
                        </div>
                        <div class="cache-manager-list">
                            <h4>缓存明细</h4>
                            <div class="cache-list-header">
                                <span>书名</span>
                                <span>大小</span>
                                <span>操作</span>
                            </div>
                            <div class="cache-list-items" id="cacheListItems">
                                <!-- 动态填充 -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // 绑定事件
        panel.querySelector('.cache-manager-close').onclick = () => this.close();
        panel.querySelector('.cache-manager-overlay').onclick = () => this.close();
        panel.querySelector('#cacheRefresh').onclick = () => this.loadCacheStats();
        panel.querySelector('#cacheClearAll').onclick = () => this.confirmClearAll();
        
        // 动画显示
        requestAnimationFrame(() => {
            panel.classList.add('active');
        });
    },
    
    // 加载缓存统计
    async loadCacheStats() {
        const loadingEl = document.querySelector('.cache-manager-loading');
        const contentEl = document.querySelector('.cache-manager-content');
        
        loadingEl.style.display = 'block';
        contentEl.style.display = 'none';
        
        try {
            const impl = Lumina.DB.adapter.impl;
            const stats = await impl.getCacheStats();
            this.currentStats = stats;
            
            // 更新统计
            document.getElementById('cacheCount').textContent = stats.count;
            document.getElementById('cacheSize').textContent = this.formatSize(stats.size);
            
            // 更新列表
            const listContainer = document.getElementById('cacheListItems');
            if (stats.files && stats.files.length > 0) {
                listContainer.innerHTML = stats.files.map(file => `
                    <div class="cache-list-item" data-filekey="${file.fileKey}">
                        <span class="cache-item-name" title="${this.escapeHtml(file.fileName)}">
                            ${this.escapeHtml(file.fileName)}
                        </span>
                        <span class="cache-item-size">${this.formatSize(file.size)}</span>
                        <button class="cache-item-delete" data-filekey="${file.fileKey}" title="删除缓存">
                            <svg viewBox="0 0 24 24"><use href="#icon-delete"/></svg>
                        </button>
                    </div>
                `).join('');
                
                // 绑定单个删除事件
                listContainer.querySelectorAll('.cache-item-delete').forEach(btn => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        const fileKey = btn.dataset.filekey;
                        this.clearFileCache(fileKey);
                    };
                });
            } else {
                listContainer.innerHTML = '<div class="cache-empty">暂无内容缓存</div>';
            }
            
            loadingEl.style.display = 'none';
            contentEl.style.display = 'block';
            
        } catch (e) {
            console.error('[CacheManager] 加载统计失败:', e);
            loadingEl.innerHTML = `<p class="cache-error">加载失败: ${e.message}</p>`;
        }
    },
    
    // 清理单个文件缓存
    async clearFileCache(fileKey) {
        if (!confirm('确定要删除这本书的内容缓存吗？下次打开需要重新下载。')) return;
        
        try {
            const impl = Lumina.DB.adapter.impl;
            const success = await impl.clearFileCache(fileKey);
            
            if (success) {
                Lumina.UI.showToast('已删除缓存');
                this.loadCacheStats(); // 刷新
            } else {
                Lumina.UI.showToast('删除失败');
            }
        } catch (e) {
            Lumina.UI.showToast('删除失败: ' + e.message);
        }
    },
    
    // 确认清理所有缓存
    confirmClearAll() {
        if (!this.currentStats || this.currentStats.count === 0) {
            Lumina.UI.showToast('当前没有内容缓存');
            return;
        }
        
        const message = `确定要清理所有内容缓存吗？\n\n` +
                       `这将删除 ${this.currentStats.count} 本书的本地内容数据，` +
                       `下次打开时需要重新从服务器下载。\n\n` +
                       `书库列表和元数据不受影响。`;
        
        if (!confirm(message)) return;
        
        this.clearAllCache();
    },
    
    // 清理所有缓存
    async clearAllCache() {
        const btn = document.getElementById('cacheClearAll');
        btn.disabled = true;
        btn.innerHTML = '<span class="cache-spinner-small"></span> 清理中...';
        
        try {
            const impl = Lumina.DB.adapter.impl;
            const result = await impl.clearAllCache();
            
            if (result.success) {
                Lumina.UI.showToast(`已清理 ${result.cleared} 本书的缓存`);
                this.loadCacheStats();
            } else {
                Lumina.UI.showToast('清理失败: ' + result.error);
            }
        } catch (e) {
            Lumina.UI.showToast('清理失败: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `
                <svg viewBox="0 0 24 24"><use href="#icon-delete"/></svg>
                清理所有内容缓存
            `;
        }
    },
    
    // 关闭面板
    close() {
        this.isOpen = false;
        const panel = document.getElementById('cacheManagerPanel');
        if (panel) {
            panel.classList.remove('active');
            setTimeout(() => panel.remove(), 300);
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
    
    // 转义 HTML
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// 添加到设置面板（可选，用户可自行决定在哪里放置入口）
// Lumina.CacheManager.open() 即可打开管理界面
