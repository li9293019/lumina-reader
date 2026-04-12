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
        // 清理 Documents 目录中的孤儿字体文件（不在 customFonts 列表中的）
        this._cleanupOrphanFontFiles();
        // console.log('[FontManager] 初始化完成，自定义字体:', this.customFonts.length);
    },
    
    // 清理 Documents 目录中的历史遗留字体文件（旧版本会在 Documents 备份字体，新版本不再需要）
    async _cleanupOrphanFontFiles() {
        if (typeof Capacitor === 'undefined' || !Capacitor.Plugins?.Filesystem) return;
        
        const { Filesystem } = Capacitor.Plugins;
        
        try {
            // 读取 Documents/fonts/user/ 目录
            const result = await Filesystem.readdir({
                path: this.FONT_DIR,
                directory: 'DOCUMENTS'
            });
            
            if (!result.files || result.files.length === 0) return;
            
            // 获取当前有效的字体文件名集合
            const validFontFiles = new Set(this.customFonts.map(f => f.storedName));
            
            let cleanedCount = 0;
            
            for (const file of result.files) {
                // 只处理 .ttf 和 .otf 文件
                if (!file.name.endsWith('.ttf') && !file.name.endsWith('.otf')) continue;
                
                // 如果不在有效列表中，删除
                if (!validFontFiles.has(file.name)) {
                    try {
                        await Filesystem.deleteFile({
                            path: `${this.FONT_DIR}/${file.name}`,
                            directory: 'DOCUMENTS'
                        });
                        cleanedCount++;
                        console.log('[FontManager] 清理孤儿字体文件:', file.name);
                    } catch (e) {
                        // 忽略删除失败
                    }
                }
            }
            
            if (cleanedCount > 0) {
                console.log(`[FontManager] 共清理 ${cleanedCount} 个孤儿字体文件`);
            }
        } catch (e) {
            // 目录可能不存在或读取失败，静默处理
            console.log('[FontManager] 清理孤儿字体文件检查失败:', e.message);
        }
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
    
    // 获取用于 SVG 的字体 CSS（将字体嵌入为 base64）
    async getFontCSSForSVG(fontId) {
        // 检查缓存
        if (this._fontCSSCache && this._fontCSSCache.has(fontId)) {
            return this._fontCSSCache.get(fontId);
        }
        
        // 初始化缓存
        if (!this._fontCSSCache) {
            this._fontCSSCache = new Map();
        }
        
        const font = this.getFont(fontId);
        if (!font || font.isBuiltIn) return null;
        
        try {
            let fontData;
            
            if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem) {
                // APP 环境：读取字体文件
                const { Filesystem } = Capacitor.Plugins;
                const result = await Filesystem.readFile({
                    path: `${this.FONT_DIR}/${font.storedName}`,
                    directory: 'DOCUMENTS'
                });
                fontData = result.data;
            } else {
                // Web 环境：从 IndexedDB 读取
                const db = await this._getDB();
                const tx = db.transaction('fonts', 'readonly');
                const store = tx.objectStore('fonts');
                const result = await new Promise((resolve, reject) => {
                    const request = store.get(font.storedName);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
                if (result?.data) {
                    // 转换为 base64
                    const bytes = new Uint8Array(result.data);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    fontData = btoa(binary);
                }
            }
            
            if (!fontData) return null;
            
            const safeFontName = font.family.replace(/['"\\]/g, '\\$&');
            const css = `@font-face{font-family:'${safeFontName}';src:url('data:font/ttf;base64,${fontData}') format('truetype');font-display:swap}`;
            
            // 存入缓存
            this._fontCSSCache.set(fontId, css);
            return css;
        } catch (e) {
            console.error('[FontManager] 获取 SVG 字体 CSS 失败:', e);
            return null;
        }
    },
    
    // 加载字体CSS
    async loadFont(fontId) {
        if (this.loadedFonts.has(fontId)) return;
        
        const font = this.getFont(fontId);
        if (!font) return;
        
        if (font.isBuiltIn) {
            if (font.cssUrl) await this._loadCSS(font.cssUrl);
        } else {
            // 统一使用内联 CSS 注入，避免重装后文件访问权限问题
            await this._injectFontCSS(font);
        }
        
        this.loadedFonts.add(fontId);
    },
    
    // 直接注入字体 CSS 到页面（使用私有目录，有完整权限）
    async _injectFontCSS(font) {
        const safeFontName = font.name.replace(/['"\\]/g, '\\$&');
        
        // 检查是否已存在
        const existingStyle = document.getElementById(`font-style-${font.id}`);
        if (existingStyle) return;
        
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem) {
            // APP 环境：读取字体文件为 base64，内联到 CSS 中
            try {
                const { Filesystem } = Capacitor.Plugins;
                const result = await Filesystem.readFile({
                    path: `${this.FONT_DIR}/${font.storedName}`,
                    directory: 'DATA'  // 使用私有目录，有完整权限
                });
                
                // result.data 是 base64 字符串
                const base64Data = typeof result.data === 'string' ? result.data : await this._arrayBufferToBase64(result.data);
                const fontUrl = `data:font/ttf;base64,${base64Data}`;
                
                const css = `@font-face{font-family:'${safeFontName}';src:url('${fontUrl}') format('truetype');font-display:swap}`;
                
                const style = document.createElement('style');
                style.id = `font-style-${font.id}`;
                style.textContent = css;
                document.head.appendChild(style);
                
                console.log('[FontManager] CSS 内联注入成功:', font.name);
            } catch (e) {
                console.error('[FontManager] 内联字体注入失败:', font.name, e);
                throw e;
            }
        } else {
            // Web 环境：使用 Blob URL
            await this._generateFontCSS(font.id, font.name, font.storedName);
        }
    },
    
    // ArrayBuffer 转 Base64
    async _arrayBufferToBase64(buffer) {
        if (typeof buffer === 'string') return buffer;
        const bytes = new Uint8Array(buffer);
        const chunkSize = 65536;
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
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
            
            // 保存到私有目录
            await this._saveFontFile(storedName, arrayBuffer);
            
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
            window.logger?.error('FontManager', '添加字体失败', { error: err.message });
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
        } catch (e) {
            console.warn('[FontManager] 删除文件失败:', e);
        }
        
        // 清理页面上的 style 标签
        const styleEl = document.getElementById(`font-style-${fontId}`);
        if (styleEl) styleEl.remove();
        
        this.customFonts.splice(index, 1);
        this.loadedFonts.delete(fontId);
        await this._saveCustomFonts();
        
        return true;
    },
    
    // ========== 私有方法 ==========
    
    async _pickFontFile() {
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.FilePicker) {
            console.log('[FontManager] APP 端打开文件选择器');
            
            // 使用 Promise.race 添加超时保护（某些 Android 版本取消时不 resolve）
            const TIMEOUT_MS = 8000; // 8秒超时
            
            try {
                const result = await Promise.race([
                    Capacitor.Plugins.FilePicker.pickFiles({
                        types: ['font/ttf', 'font/otf'],
                        multiple: false
                    }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('FilePicker timeout')), TIMEOUT_MS)
                    )
                ]);
                
                console.log('[FontManager] 文件选择器返回:', result ? '有结果' : '无结果');
                
                // 用户取消时，result 可能为 undefined 或 files 为空数组
                if (!result || !result.files || result.files.length === 0) {
                    console.log('[FontManager] 用户取消选择或结果为空');
                    return null;
                }
                console.log('[FontManager] 用户选择了文件:', result.files[0]?.name);
                return result.files[0];
            } catch (e) {
                // 用户取消选择器或超时时，静默返回 null
                console.log('[FontManager] 文件选择取消、失败或超时:', e?.message || '未知错误');
                return null;
            }
        }
        
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.ttf,.otf';
            
            // 处理用户选择文件
            input.onchange = (e) => {
                cleanup();
                resolve(e.target.files?.[0] || null);
            };
            
            // 处理用户取消（通过窗口重新获得焦点来判断）
            let isCancelled = false;
            const handleFocus = () => {
                // 延迟检查，因为 onchange 可能在 focus 之后触发
                setTimeout(() => {
                    if (!input.files?.length && !isCancelled) {
                        isCancelled = true;
                        cleanup();
                        resolve(null);
                    }
                }, 300);
            };
            
            const cleanup = () => {
                window.removeEventListener('focus', handleFocus);
                clearTimeout(timeoutId);
            };
            
            // 超时保护（5分钟）
            const timeoutId = setTimeout(() => {
                isCancelled = true;
                cleanup();
                resolve(null);
            }, 5 * 60 * 1000);
            
            window.addEventListener('focus', handleFocus, { once: true });
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
        // APP 环境：保存到 APP 私有目录（有完整读写权限）
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem) {
            const { Filesystem } = Capacitor.Plugins;
            
            try {
                await Filesystem.mkdir({
                    path: this.FONT_DIR,
                    directory: 'DATA',
                    recursive: true
                });
            } catch (e) {
                // 忽略"目录已存在"错误
                if (!e.message?.includes('already exists')) {
                    console.warn('[FontManager] 创建字体目录失败:', e.message);
                }
            }
            
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
                directory: 'DATA'
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
                        directory: 'DATA'
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
                directory: 'DATA',
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
            // 删除私有目录中的文件
            try {
                await Capacitor.Plugins.Filesystem.deleteFile({
                    path: `${this.FONT_DIR}/${fileName}`,
                    directory: 'DATA'
                });
            } catch {}
            // 删除 Documents 中的备份
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
            if (!Array.isArray(data) || data.length === 0) {
                this.customFonts = [];
                return;
            }
            
            // 简单过滤：只保留文件存在的字体
            const validFonts = [];
            for (const font of data) {
                if (await this._checkFontFileExists(font.storedName)) {
                    validFonts.push(font);
                    // 预加载CSS
                    this.loadFont(font.id).catch(() => {});
                }
            }
            
            this.customFonts = validFonts;
            
            // 如果有失效字体，静默更新存储（不提示用户）
            if (validFonts.length !== data.length) {
                await this._saveCustomFonts();
            }
        } catch (err) {
            console.error('[FontManager] 加载自定义字体失败:', err);
            this.customFonts = [];
        }
    },
    
    // 检查字体文件是否存在（在私有 DATA 目录中）
    async _checkFontFileExists(fileName) {
        // APP 环境：检查私有目录
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem) {
            try {
                await Capacitor.Plugins.Filesystem.stat({
                    path: `${this.FONT_DIR}/${fileName}`,
                    directory: 'DATA'
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
    _isAdding: false,
    _isWaitingFilePicker: false, // 标记是否正在等待文件选择器
    
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
        // 重置添加状态（防止异常情况下按钮被永久禁用）
        this._resetAddingState();
    },
    
    render() {
        if (!this.listContainer) return;
        
        const t = Lumina.I18n?.t || ((k) => k);
        const fonts = Lumina.FontManager.customFonts;
        
        if (fonts.length === 0) {
            this.listContainer.innerHTML = `
                <div class="font-manager-empty">
                    <svg class="icon" style="width:48px;height:48px;opacity:0.3"><use href="#icon-font"/></svg>
                    <div class="empty-title">${t('fontManagerEmpty') || '暂无自定义字体'}</div>
                </div>`;
            return;
        }
        
        this.listContainer.innerHTML = fonts.map(font => `
            <div class="font-manager-item" data-font-id="${font.id}">
                <div class="font-info">
                    <div class="font-name">${Lumina.Utils.escapeHtml(font.name)}</div>
                    <div class="font-meta">${this._formatSize(font.size)}</div>
                </div>
                <button class="btn-icon font-delete-btn" data-font-id="${font.id}" data-i18n-tooltip="delete" data-tooltip-text="删除">
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
        // 防止并发导入
        if (this._isAdding) {
            Lumina.UI.showToast(Lumina.I18n?.t?.('fontAddingInProgress') || '正在导入字体，请稍候...');
            return;
        }
        
        const btn = document.getElementById('fontManagerAddBtn');
        this._isAdding = true;
        this._isWaitingFilePicker = true; // 标记正在等待文件选择器
        btn?.classList.add('loading');
        btn && (btn.disabled = true);
        
        // 安全机制1：监听 APP 从后台返回（文件选择器关闭时触发）
        // 使用 focus + visibilitychange 双重检测，提高可靠性
        let hasReturned = false;
        const handleAppReturn = () => {
            if (hasReturned || !this._isWaitingFilePicker) return;
            hasReturned = true;
            console.log('[FontManagerDialog] APP 返回前台，恢复按钮状态');
            this._resetAddingState();
        };
        
        // 延迟添加监听，确保是文件选择器打开后才监听
        setTimeout(() => {
            if (!this._isWaitingFilePicker) return;
            window.addEventListener('focus', handleAppReturn, { once: true });
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') handleAppReturn();
            }, { once: true });
        }, 500);
        
        // 安全机制2：超时保护（即使 Promise 永久挂起，10秒后强制恢复）
        const SAFETY_TIMEOUT = 10000;
        const safetyTimer = setTimeout(() => {
            if (this._isAdding) {
                console.warn('[FontManagerDialog] 安全超时触发，强制重置按钮状态');
                hasReturned = true;
                this._resetAddingState();
                Lumina.UI.showToast('操作超时，请重试');
            }
        }, SAFETY_TIMEOUT);
        
        try {
            const font = await Lumina.FontManager.addFont();
            if (font) this.render();
        } finally {
            clearTimeout(safetyTimer);
            window.removeEventListener('focus', handleAppReturn);
            hasReturned = true; // 标记已完成，防止监听重复触发
            this._resetAddingState();
        }
    },
    
    // 重置添加状态（抽离为独立方法方便复用）
    _resetAddingState() {
        this._isAdding = false;
        this._isWaitingFilePicker = false;
        const btn = document.getElementById('fontManagerAddBtn');
        btn?.classList.remove('loading');
        if (btn) btn.disabled = false;
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
                    
                    // 如果删除的是当前正在使用的字体，重置为默认字体
                    const currentFont = Lumina.State.settings.font;
                    if (currentFont === fontId) {
                        Lumina.State.settings.font = 'serif';
                        await Lumina.Settings.save();
                        await Lumina.Settings.apply();
                    }
                    
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
