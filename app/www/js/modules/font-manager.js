// ==================== 字体管理器 ====================
// 统一管理系统：内置字体 + 用户自定义字体

// ========== 字体名称解析工具 ==========
const FontParser = {
    async extractFontName(arrayBuffer) {
        try {
            const view = new DataView(arrayBuffer);
            const sfntVersion = view.getUint32(0);
            
            let tableOffset = 0;
            if (sfntVersion === 0x74727565) {
                const numFonts = view.getUint32(8);
                if (numFonts > 0) tableOffset = view.getUint32(12);
            }
            
            const numTables = view.getUint16(tableOffset + 4);
            const tableDirOffset = tableOffset + 12;
            
            for (let i = 0; i < numTables; i++) {
                const entryOffset = tableDirOffset + i * 16;
                const tag = this._readTag(view, entryOffset);
                if (tag === 'name') {
                    const nameTableOffset = view.getUint32(entryOffset + 8);
                    return this._parseNameTable(view, tableOffset + nameTableOffset);
                }
            }
            return null;
        } catch (err) {
            console.error('[FontParser] 解析失败:', err);
            return null;
        }
    },
    
    _readTag(view, offset) {
        const bytes = [];
        for (let i = 0; i < 4; i++) {
            bytes.push(String.fromCharCode(view.getUint8(offset + i)));
        }
        return bytes.join('');
    },
    
    _parseNameTable(view, offset) {
        const stringOffset = view.getUint16(offset + 4);
        const count = view.getUint16(offset + 2);
        
        let bestMatch = null;
        let fallback = null;
        
        for (let i = 0; i < count; i++) {
            const recordOffset = offset + 6 + i * 12;
            const platformID = view.getUint16(recordOffset);
            const languageID = view.getUint16(recordOffset + 4);
            const nameID = view.getUint16(recordOffset + 6);
            
            if (nameID !== 1) continue;
            
            const stringLength = view.getUint16(recordOffset + 8);
            const stringRelOffset = view.getUint16(recordOffset + 10);
            const stringAbsOffset = offset + stringOffset + stringRelOffset;
            
            let name = '';
            if (platformID === 3) {
                const bytes = new Uint8Array(view.buffer, stringAbsOffset, stringLength);
                name = new TextDecoder('utf-16be').decode(bytes);
            } else if (platformID === 1 || platformID === 0) {
                const bytes = new Uint8Array(view.buffer, stringAbsOffset, stringLength);
                name = new TextDecoder(platformID === 1 ? 'latin1' : 'utf-16be').decode(bytes);
            }
            
            if (platformID === 3 && languageID === 0x0804) return name;
            if (platformID === 3 && languageID === 0x0409 && !bestMatch) bestMatch = name;
            if (platformID === 1 && languageID === 0 && !fallback) fallback = name;
        }
        
        return bestMatch || fallback;
    }
};

// ========== 字体管理器核心 ==========
Lumina.FontManager = {
    STORAGE_KEY: 'customFonts',
    FONT_DIR: 'fonts/user',
    
    // 内置字体配置（唯一数据源）
    builtInFonts: {
        serif: {
            id: 'serif',
            name: '宋体',
            family: '"LXGW Neo Zhi Song", "Noto Serif SC", "Source Han Serif SC", "SimSun", "STSong", serif',
            cssUrl: './assets/fonts/LXGWNeoZhiSong.css',
            isBuiltIn: true
        },
        sans: {
            id: 'sans',
            name: '黑体',
            family: '"LXGW Neo XiHei", "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif',
            cssUrl: './assets/fonts/LXGWNeoXiHei.css',
            isBuiltIn: true
        },
        kai: {
            id: 'kai',
            name: '楷体',
            family: '"LXGW WenKai", "KaiTi", "STKaiti", serif',
            cssUrl: './assets/fonts/lxgwwenkai.css',
            isBuiltIn: true
        },
        mono: {
            id: 'mono',
            name: '等宽',
            family: '"JetBrains Mono", "Fira Code", "Consolas", "Monaco", monospace',
            cssUrl: null,
            isBuiltIn: true
        }
    },
    
    customFonts: [],
    loadedFonts: new Set(),
    
    async init() {
        await this._loadCustomFonts();
        console.log('[FontManager] 初始化完成，自定义字体:', this.customFonts.length);
    },
    
    // 获取所有可用字体
    getAllFonts() {
        return [
            ...Object.values(this.builtInFonts),
            ...this.customFonts
        ];
    },
    
    // 根据ID获取字体配置
    getFont(fontId) {
        return this.builtInFonts[fontId] || this.customFonts.find(f => f.id === fontId);
    },
    
    // 获取字体CSS family
    getFontFamily(fontId) {
        const font = this.getFont(fontId);
        if (!font) return this.builtInFonts.serif.family;
        if (font.isBuiltIn) return font.family;
        return `"${font.family}", ${this.builtInFonts.serif.family}`;
    },
    
    // 加载字体CSS
    async loadFont(fontId) {
        if (this.loadedFonts.has(fontId)) return;
        
        const font = this.getFont(fontId);
        if (!font) return;
        
        if (font.isBuiltIn) {
            if (font.cssUrl) await this._loadCSS(font.cssUrl);
        } else {
            // APP 环境：加载 CSS 文件（使用 convertFileSrc 转换路径）
            if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem) {
                // 先获取 CSS 文件的绝对路径，再转换为 WebView URL
                const cssStat = await Capacitor.Plugins.Filesystem.stat({
                    path: `${this.FONT_DIR}/${font.id}.css`,
                    directory: 'DOCUMENTS'
                });
                const fileUrl = Capacitor.convertFileSrc(cssStat.uri);
                await this._loadCSS(fileUrl);
            }
            // Web 环境：重新生成 CSS（确保 Blob URL 有效）
            else {
                await this._generateFontCSS(fontId, font.family, font.storedName);
            }
        }
        
        this.loadedFonts.add(fontId);
    },
    
    // 添加自定义字体
    async addFont() {
        try {
            const file = await this._pickFontFile();
            if (!file) return null;
            
            if (file.size > 30 * 1024 * 1024) {
                Lumina.UI.showToast('字体文件过大（最大 30MB）');
                return null;
            }
            
            const arrayBuffer = await file.arrayBuffer();
            const fontName = await FontParser.extractFontName(arrayBuffer) || file.name.replace(/\.[^/.]+$/, '');
            
            // 检查是否已存在相同名称的字体
            const exists = this.customFonts.find(f => f.name === fontName);
            if (exists) {
                Lumina.UI.showToast(`字体 "${fontName}" 已存在`);
                return null;
            }
            
            const fontId = `cf_${Date.now().toString(36)}`;
            const storedName = `${fontId}.ttf`;
            
            await this._saveFontFile(storedName, arrayBuffer);
            await this._generateFontCSS(fontId, fontName, storedName);
            
            const fontInfo = {
                id: fontId,
                name: fontName,
                family: fontName,
                fileName: file.name,
                storedName,
                size: file.size,
                addedAt: Date.now(),
                isBuiltIn: false
            };
            
            this.customFonts.push(fontInfo);
            await this._saveCustomFonts();
            await this.loadFont(fontId);
            
            Lumina.UI.showToast(`已安装字体: ${fontName}`);
            return fontInfo;
            
        } catch (err) {
            console.error('[FontManager] 添加字体失败:', err);
            Lumina.UI.showToast('字体安装失败');
            return null;
        }
    },
    
    // 删除自定义字体
    async removeFont(fontId) {
        const index = this.customFonts.findIndex(f => f.id === fontId);
        if (index === -1) return false;
        
        const font = this.customFonts[index];
        
        try {
            await this._deleteFontFile(font.storedName);
            await this._deleteFontCSS(fontId);
        } catch (e) {
            console.warn('[FontManager] 删除文件失败:', e);
        }
        
        this.customFonts.splice(index, 1);
        this.loadedFonts.delete(fontId);
        await this._saveCustomFonts();
        
        return true;
    },
    
    // ========== 私有方法 ==========
    
    async _pickFontFile() {
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.FilePicker) {
            try {
                const result = await Capacitor.Plugins.FilePicker.pickFiles({
                    types: ['font/ttf', 'font/otf'],
                    multiple: false
                });
                return result.files?.[0];
            } catch {
                return null;
            }
        }
        
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.ttf,.otf';
            input.onchange = (e) => resolve(e.target.files?.[0] || null);
            input.click();
        });
    },
    
    // IndexedDB 实例（Web环境）
    _getDB() {
        if (this._dbPromise) return this._dbPromise;
        
        this._dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open('LuminaFonts', 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('fonts')) {
                    db.createObjectStore('fonts', { keyPath: 'fileName' });
                }
            };
        });
        
        return this._dbPromise;
    },
    
    async _saveFontFile(fileName, arrayBuffer) {
        // APP 环境：保存到沙盒
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem) {
            const { Filesystem } = Capacitor.Plugins;
            
            try {
                await Filesystem.mkdir({
                    path: this.FONT_DIR,
                    directory: 'DOCUMENTS',
                    recursive: true
                });
            } catch {}
            
            // 分块转换 ArrayBuffer 为 Base64，避免堆栈溢出
            const bytes = new Uint8Array(arrayBuffer);
            const chunkSize = 65536; // 64KB 每块
            let binary = '';
            for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.subarray(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, chunk);
            }
            const base64 = btoa(binary);
            await Filesystem.writeFile({
                path: `${this.FONT_DIR}/${fileName}`,
                data: base64,
                directory: 'DOCUMENTS'
            });
        }
        // Web 环境：保存到 IndexedDB
        else {
            const db = await this._getDB();
            const tx = db.transaction('fonts', 'readwrite');
            const store = tx.objectStore('fonts');
            await new Promise((resolve, reject) => {
                const request = store.put({ fileName, data: arrayBuffer });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    },
    
    async _generateFontCSS(fontId, fontName, fileName) {
        // 转义字体名称中的特殊字符，用于 CSS font-family
        const safeFontName = fontName.replace(/['"\\]/g, '\\$&');
        
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem) {
            // APP 环境：获取绝对路径并转换为 WebView 可访问的 URL
            const { Filesystem } = Capacitor.Plugins;
            
            // 获取字体文件的绝对路径，然后转换为 WebView URL
            // 添加重试逻辑，因为文件系统可能需要时间同步
            let fontStat = null;
            let retries = 3;
            while (retries > 0) {
                try {
                    fontStat = await Filesystem.stat({
                        path: `${this.FONT_DIR}/${fileName}`,
                        directory: 'DOCUMENTS'
                    });
                    break;
                } catch (e) {
                    retries--;
                    if (retries === 0) throw e;
                    await new Promise(r => setTimeout(r, 100));
                }
            }
            
            const fontUrl = Capacitor.convertFileSrc(fontStat.uri);
            
            // CSS 中使用转换后的完整 URL
            const css = `@font-face{font-family:'${safeFontName}';src:url('${fontUrl}') format('truetype');font-display:swap}`;
            
            await Filesystem.writeFile({
                path: `${this.FONT_DIR}/${fontId}.css`,
                data: css,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
        }
        // Web 环境：从 IndexedDB 读取并创建 Blob URL
        else {
            const db = await this._getDB();
            const tx = db.transaction('fonts', 'readonly');
            const store = tx.objectStore('fonts');
            const result = await new Promise((resolve, reject) => {
                const request = store.get(fileName);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (result?.data) {
                // 删除旧样式（避免 Blob URL 累积）
                const oldStyle = document.getElementById(`font-style-${fontId}`);
                if (oldStyle) {
                    const oldCss = oldStyle.textContent;
                    const oldMatch = oldCss.match(/url\(['"]?([^'"]+)['"]?\)/);
                    if (oldMatch) URL.revokeObjectURL(oldMatch[1]);
                    oldStyle.remove();
                }
                
                const blob = new Blob([result.data], { type: 'font/ttf' });
                const blobUrl = URL.createObjectURL(blob);
                const css = `@font-face{font-family:'${safeFontName}';src:url('${blobUrl}') format('truetype');font-display:swap}`;
                const style = document.createElement('style');
                style.id = `font-style-${fontId}`;
                style.textContent = css;
                document.head.appendChild(style);
            }
        }
    },
    
    async _deleteFontFile(fileName) {
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem) {
            try {
                await Capacitor.Plugins.Filesystem.deleteFile({
                    path: `${this.FONT_DIR}/${fileName}`,
                    directory: 'DOCUMENTS'
                });
            } catch {}
        } else {
            // Web 环境：从 IndexedDB 删除
            try {
                const db = await this._getDB();
                const tx = db.transaction('fonts', 'readwrite');
                const store = tx.objectStore('fonts');
                await new Promise((resolve, reject) => {
                    const request = store.delete(fileName);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            } catch {}
        }
    },
    
    async _deleteFontCSS(fontId) {
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem) {
            try {
                await Capacitor.Plugins.Filesystem.deleteFile({
                    path: `${this.FONT_DIR}/${fontId}.css`,
                    directory: 'DOCUMENTS'
                });
            } catch {}
        } else {
            // Web 环境：移除 style 标签
            const style = document.getElementById(`font-style-${fontId}`);
            if (style) {
                // 释放 Blob URL
                const cssText = style.textContent;
                const match = cssText.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (match) URL.revokeObjectURL(match[1]);
                style.remove();
            }
        }
    },
    
    async _loadCSS(url) {
        if (document.querySelector(`link[href="${url}"]`)) return;
        
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    },
    
    async _loadCustomFonts() {
        try {
            const data = Lumina.ConfigManager.get(this.STORAGE_KEY);
            console.log('[FontManager] 加载自定义字体:', data);
            if (Array.isArray(data) && data.length > 0) {
                // 验证每个字体文件是否存在
                const validFonts = [];
                for (const font of data) {
                    const exists = await this._checkFontFileExists(font.storedName);
                    if (exists) {
                        validFonts.push(font);
                    } else {
                        console.warn('[FontManager] 字体文件不存在，跳过:', font.name);
                    }
                }
                
                this.customFonts = validFonts;
                
                // 如果有无效字体，更新存储
                if (validFonts.length !== data.length) {
                    await this._saveCustomFonts();
                }
                
                // 预加载所有自定义字体CSS
                for (const font of this.customFonts) {
                    this.loadFont(font.id).catch(() => {});
                }
            } else {
                this.customFonts = [];
            }
        } catch (err) {
            console.error('[FontManager] 加载自定义字体失败:', err);
            this.customFonts = [];
        }
    },
    
    // 检查字体文件是否存在
    async _checkFontFileExists(fileName) {
        // APP 环境：检查文件系统
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem) {
            try {
                await Capacitor.Plugins.Filesystem.stat({
                    path: `${this.FONT_DIR}/${fileName}`,
                    directory: 'DOCUMENTS'
                });
                return true;
            } catch {
                return false;
            }
        }
        // Web 环境：检查 IndexedDB
        else {
            try {
                const db = await this._getDB();
                const tx = db.transaction('fonts', 'readonly');
                const store = tx.objectStore('fonts');
                const result = await new Promise((resolve) => {
                    const request = store.get(fileName);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => resolve(null);
                });
                return !!result;
            } catch {
                return false;
            }
        }
    },
    
    async _saveCustomFonts() {
        Lumina.ConfigManager.set(this.STORAGE_KEY, this.customFonts);
    }
};

// ========== 字体管理对话框 ==========
Lumina.FontManagerDialog = {
    panel: null,
    listContainer: null,
    
    init() {
        this.panel = document.getElementById('fontManagerDialog');
        this.listContainer = document.getElementById('fontManagerList');
        if (!this.panel) return;
        
        document.getElementById('fontManagerClose')?.addEventListener('click', () => this.close());
        document.getElementById('fontManagerAddBtn')?.addEventListener('click', () => this._onAdd());
        
        this.panel.addEventListener('click', (e) => {
            if (e.target === this.panel) this.close();
        });
    },
    
    open() {
        if (!this.panel) return;
        this.render();
        this.panel.classList.add('active');
    },
    
    close() {
        this.panel?.classList.remove('active');
        Lumina.Settings?.renderFontButtons?.();
    },
    
    render() {
        if (!this.listContainer) return;
        
        const fonts = Lumina.FontManager.customFonts;
        
        if (fonts.length === 0) {
            this.listContainer.innerHTML = `
                <div class="font-manager-empty">
                    <svg class="icon" style="width:48px;height:48px;opacity:0.3"><use href="#icon-font"/></svg>
                    <div class="empty-title" data-i18n="fontManagerEmpty">暂无自定义字体</div>
                    <div class="empty-desc" data-i18n="fontManagerEmptyHint">点击下方按钮添加字体文件</div>
                </div>`;
            return;
        }
        
        this.listContainer.innerHTML = fonts.map(font => `
            <div class="font-manager-item" data-font-id="${font.id}">
                <div class="font-info">
                    <div class="font-name">${Lumina.Utils.escapeHtml(font.name)}</div>
                    <div class="font-meta">${this._formatSize(font.size)}</div>
                </div>
                <button class="btn-icon font-delete-btn" data-font-id="${font.id}" title="删除">
                    <svg class="icon" style="width:18px;height:18px"><use href="#icon-delete"/></svg>
                </button>
            </div>
        `).join('');
        
        this.listContainer.querySelectorAll('.font-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._onDelete(btn.dataset.fontId);
            });
        });
    },
    
    async _onAdd() {
        const btn = document.getElementById('fontManagerAddBtn');
        btn?.classList.add('loading');
        try {
            const font = await Lumina.FontManager.addFont();
            if (font) this.render();
        } finally {
            btn?.classList.remove('loading');
        }
    },
    
    async _onDelete(fontId) {
        const font = Lumina.FontManager.customFonts.find(f => f.id === fontId);
        if (!font) return;
        
        Lumina.UI.showDialog(
            `${Lumina.I18n.t('fontManagerDeleteConfirm')}"${font.name}"?`,
            'confirm',
            async (confirmed) => {
                if (confirmed) {
                    await Lumina.FontManager.removeFont(fontId);
                    this.render();
                    Lumina.Settings?.renderFontButtons?.();
                }
            }
        );
    },
    
    _formatSize(bytes) {
        return bytes < 1024 * 1024 
            ? (bytes / 1024).toFixed(1) + ' KB'
            : (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    Lumina.FontManagerDialog.init();
});
