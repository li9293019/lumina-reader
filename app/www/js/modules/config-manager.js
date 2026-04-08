/**
 * 统一配置管理器
 * 整合所有 localStorage 配置，支持版本控制和导出/导入
 */

Lumina.ConfigManager = {
    // 配置存储键
    STORAGE_KEY: 'luminaConfig',
    
    // 当前配置版本（用于迁移）
    CURRENT_VERSION: 1,
    
    // 默认配置结构
    getDefaultConfig() {
        return {
            version: this.CURRENT_VERSION,
            lastModified: Date.now(),
            
            // ========== 1. 核心阅读设置 ==========
            reading: {
                language: 'zh',
                theme: 'light',
                font: 'serif',
                indent: false,
                dropCap: false,
                fontSize: 20,
                lineHeight: 15,
                paragraphSpacing: 3,
                pageWidth: 80,
                margin: 40,
                ignoreEmptyLines: false,
                textCleaning: true,
                smoothScroll: true,
                sidebarVisible: false,
                chapterNumbering: 'none',
            },
            
            // ========== 2. 正则表达式设置 ==========
            regex: {
                chapter: '',
                section: '',
            },
            
            // ========== 3. TTS 设置 ==========
            tts: {
                rate: 10,
                pitch: 10,
                voiceURI: null,
                volume: 1.0,
            },
            
            // ========== 4. 分页设置 ==========
            pagination: {
                enabled: true,
                maxWords: 3000,
                imageWords: 300,
            },
            
            // ========== 5. PDF 设置 ==========
            pdf: {
                extractImages: true,
                passwordPreset: {
                    enabled: false,
                    smartGuess: true,
                    length: 6,
                    prefix: '',
                    commonPasswords: ''
                }
            },
            
            // ========== 6. 导出设置 ==========
            export: {
                encrypted: false,
            },
            
            // ========== 7. 书库设置 ==========
            library: {
                hashCover: true,  // 启用哈希封面（默认开启）
            },
            
            // ========== 8. 热力图预设 ==========
            heatMap: {
                presets: [], // {id, name, tags: []}
            },
            
            // ========== 8. 自定义字体 ==========
            customFonts: [], // {id, name, family, fileName, storedName, size, addedAt}
            
            // ========== 8. Azure TTS 配置 ==========
            azureTTS: {
                enabled: false,
                speechKey: '',
                region: 'eastasia',
                voice: 'zh-CN-XiaoxiaoNeural',
                style: 'general',
                rate: 1.0,
                pitch: 0,
                cache: {
                    enabled: true,
                    preloadCount: 5,
                    cacheDepth: 5,
                    waitTimeout: 2000
                }
            },
            
            // ========== 9. 插件状态 ==========
            plugins: {
                // 'plugin-id': true/false
            },
            
            // ========== 10. 元数据 ==========
            meta: {
                firstInstall: Date.now(),
                lastBackup: null,
                importCount: 0,
            }
        };
    },
    
    // ========== 加载配置 ==========
    load() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // 合并默认配置和保存的配置（处理新增字段）
                const config = this.mergeDeep(this.getDefaultConfig(), parsed);
                // 版本迁移（开发中简化）
                if (config.version < this.CURRENT_VERSION) {
                    config.version = this.CURRENT_VERSION;
                }
                return config;
            }
        } catch (e) {
            console.error('[ConfigManager] 加载配置失败:', e);
        }
        return this.getDefaultConfig();
    },
    
    // ========== 保存配置 ==========
    save(config) {
        try {
            config.version = this.CURRENT_VERSION;
            config.lastModified = Date.now();
            
            // 保存前临时移除字体数据（避免超出 LocalStorage 配额）
            const fontsData = config.customFontsData;
            if (fontsData) {
                delete config.customFontsData;
            }
            
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
            
            // 恢复字体数据（如果需要）
            if (fontsData) {
                config.customFontsData = fontsData;
            }
            
            return true;
        } catch (e) {
            console.error('[ConfigManager] 保存配置失败:', e);
            // 如果是配额错误，提示用户
            if (e.name === 'QuotaExceededError') {
                Lumina.UI.showToast('配置保存失败：存储空间不足，请清理一些数据');
            }
            return false;
        }
    },
    
    // ========== 获取/设置单项配置 ==========
    get(path) {
        const config = this.load();
        return path.split('.').reduce((obj, key) => obj?.[key], config);
    },
    
    set(path, value) {
        const config = this.load();
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((obj, key) => {
            if (!obj[key]) obj[key] = {};
            return obj[key];
        }, config);
        target[lastKey] = value;
        return this.save(config);
    },
    
    // ========== 深度合并对象 ==========
    mergeDeep(target, source) {
        const output = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                output[key] = this.mergeDeep(target[key] || {}, source[key]);
            } else {
                output[key] = source[key];
            }
        }
        return output;
    },
    
    // ========== 导出配置（备份） ==========
    async export(encrypt = false) {
        const config = this.load();
        
        // 如果有自定义字体，打包字体文件数据（仅 APP 端，用于重装后恢复）
        // PC 端不打包，因为 Web 端 IndexedDB 会保留，且 LocalStorage 配额有限
        if (config.customFonts?.length > 0 && typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem) {
            const fontsData = await this._packCustomFonts(config.customFonts);
            if (fontsData.length > 0) {
                config.customFontsData = fontsData;
            }
        }
        
        if (encrypt) {
            // 使用 Lumina 专用 .lmn 格式加密
            const password = await this._requestPassword('set');
            if (password === null) return null; // 用户取消
            
            console.log('[ConfigManager] 导出加密配置，密码长度:', password.length, '使用默认密钥:', password.length === 0);
            
            try {
                const encrypted = await Lumina.Crypto.encrypt(config, password);
                console.log('[ConfigManager] 加密成功，数据长度:', encrypted.byteLength || encrypted.length);
                return encrypted;
            } catch (e) {
                console.error('[ConfigManager] 加密失败:', e);
                return null;
            }
        }
        
        return JSON.stringify(config, null, 2);
    },
    
    // 打包自定义字体文件为 base64（用于配置导出）
    async _packCustomFonts(customFonts) {
        const fontsData = [];
        
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem) {
            const { Filesystem } = Capacitor.Plugins;
            
            for (const font of customFonts) {
                try {
                    // 优先从私有目录读取
                    let result = null;
                    try {
                        result = await Filesystem.readFile({
                            path: `fonts/user/${font.storedName}`,
                            directory: 'DATA'
                        });
                    } catch {
                        // 私有目录没有，尝试 Documents
                        try {
                            result = await Filesystem.readFile({
                                path: `fonts/user/${font.storedName}`,
                                directory: 'DOCUMENTS'
                            });
                        } catch {}
                    }
                    
                    if (result?.data) {
                        fontsData.push({
                            id: font.id,
                            name: font.name,
                            fileName: font.fileName,
                            storedName: font.storedName,
                            data: typeof result.data === 'string' ? result.data : await this._arrayBufferToBase64(result.data)
                        });
                        console.log('[ConfigManager] 打包字体:', font.name);
                    }
                } catch (e) {
                    console.warn('[ConfigManager] 打包字体失败:', font.name, e);
                }
            }
        }
        
        return fontsData;
    },
    
    // 从配置中的字体数据恢复（重装后无需文件权限）
    async _restoreFontsFromConfig(customFonts, fontsData) {
        // Web 端（PC）：字体数据不存在，直接从 IndexedDB 加载
        if (!fontsData || fontsData.length === 0) {
            console.log('[ConfigManager] Web 端导入：从 IndexedDB 加载字体');
            // 将字体配置添加到 FontManager
            for (const font of customFonts) {
                if (!Lumina.FontManager.customFonts.find(f => f.id === font.id)) {
                    Lumina.FontManager.customFonts.push(font);
                }
            }
            await Lumina.FontManager._saveCustomFonts();
            // 加载字体
            for (const font of customFonts) {
                try {
                    await Lumina.FontManager.loadFont(font.id);
                } catch (e) {
                    console.warn('[ConfigManager] 加载字体失败:', font.name, e);
                }
            }
            return;
        }
        
        let restoredCount = 0;
        
        for (const fontData of fontsData) {
            try {
                // 解码 base64 并保存到私有目录
                const binary = atob(fontData.data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                
                await Lumina.FontManager._saveFontFile(fontData.storedName, bytes.buffer);
                
                // 添加到 FontManager
                const fontInfo = customFonts.find(f => f.id === fontData.id);
                if (fontInfo && !Lumina.FontManager.customFonts.find(f => f.id === fontData.id)) {
                    Lumina.FontManager.customFonts.push(fontInfo);
                }
                
                // 加载字体
                await Lumina.FontManager.loadFont(fontData.id);
                
                restoredCount++;
                console.log('[ConfigManager] 恢复字体成功:', fontData.name);
            } catch (e) {
                console.error('[ConfigManager] 恢复字体失败:', fontData.name, e);
            }
        }
        
        // 保存字体列表
        await Lumina.FontManager._saveCustomFonts();
        
        if (restoredCount > 0) {
            Lumina.UI.showToast(`成功恢复 ${restoredCount} 个自定义字体`);
        }
        
        console.log('[ConfigManager] 字体恢复完成:', restoredCount, '/', fontsData.length);
    },
    
    // 从 Documents 目录恢复字体（APP 端导入 PC 端配置时使用）
    async _restoreFontsFromDocuments(customFonts) {
        const { Filesystem } = Capacitor?.Plugins || {};
        if (!Filesystem) return;
        
        let restoredCount = 0;
        let missingFonts = [];
        
        for (const font of customFonts) {
            try {
                // 检查 Documents 中是否有备份
                const stat = await Filesystem.stat({
                    path: `fonts/user/${font.storedName}`,
                    directory: 'DOCUMENTS'
                });
                
                if (stat) {
                    // 读取字体文件
                    const result = await Filesystem.readFile({
                        path: `fonts/user/${font.storedName}`,
                        directory: 'DOCUMENTS'
                    });
                    
                    // 保存到私有目录
                    await Lumina.FontManager._saveFontFile(font.storedName, result.data);
                    
                    // 添加到 FontManager
                    if (!Lumina.FontManager.customFonts.find(f => f.id === font.id)) {
                        Lumina.FontManager.customFonts.push(font);
                    }
                    
                    // 加载字体
                    await Lumina.FontManager.loadFont(font.id);
                    
                    restoredCount++;
                    console.log('[ConfigManager] 从 Documents 恢复字体:', font.name);
                }
            } catch (e) {
                // 文件不存在或读取失败
                console.warn('[ConfigManager] Documents 中没有字体:', font.name);
                missingFonts.push(font);
            }
        }
        
        // 保存字体列表
        await Lumina.FontManager._saveCustomFonts();
        
        if (restoredCount > 0) {
            Lumina.UI.showToast(`从 Documents 恢复 ${restoredCount} 个字体`);
        }
        
        if (missingFonts.length > 0) {
            console.log('[ConfigManager] 以下字体未找到，需要手动添加:', missingFonts.map(f => f.name).join(', '));
            setTimeout(() => {
                Lumina.UI.showToast(`${missingFonts.length} 个字体未找到，请手动添加`);
            }, 500);
        }
    },
    
    // 应用配置中指定的字体
    async _applyCurrentFont(fontId) {
        if (!fontId) return;
        
        console.log('[ConfigManager] 应用配置中的字体:', fontId);
        
        // 等待字体管理器就绪
        if (!Lumina.FontManager.customFonts) {
            await new Promise(r => setTimeout(r, 100));
        }
        
        // 检查字体是否存在
        const fontExists = Lumina.FontManager.getFont(fontId);
        if (!fontExists) {
            console.warn('[ConfigManager] 配置中的字体不存在，使用默认:', fontId);
            return;
        }
        
        // 应用字体
        console.log('[ConfigManager] 字体存在，应用到阅读器:', fontId);
        
        // 更新设置面板
        Lumina.Settings?.renderFontButtons?.();
        
        // 应用到阅读器
        if (Lumina.Reader?.applyFont) {
            Lumina.Reader.applyFont(fontId);
        }
        
        // 触发自定义事件通知字体已更改
        window.dispatchEvent(new CustomEvent('fontChanged', { detail: { fontId } }));
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
    
    // ========== 导入配置（恢复） ==========
    async import(data, encrypted = false) {
        try {
            let json = data;
            
            if (encrypted) {
                // 使用 Lumina 专用 .lmn 格式解密
                const password = await this._requestPassword('enter');
                if (password === null) return { success: false, error: '未输入密码' };
                
                console.log('[ConfigManager] 导入加密配置，密码长度:', password.length, '使用默认密钥:', password.length === 0);
                console.log('[ConfigManager] 数据类型:', data.constructor.name, '数据长度:', data.length || data.byteLength);
                
                try {
                    // 确保传递 ArrayBuffer 给 decrypt
                    const arrayBuffer = data.buffer instanceof ArrayBuffer ? data.buffer : data;
                    const decrypted = await Lumina.Crypto.decrypt(arrayBuffer, password);
                    json = JSON.stringify(decrypted);
                    console.log('[ConfigManager] 解密成功');
                } catch (e) {
                    console.error('[ConfigManager] 解密失败:', e);
                    return { success: false, error: '密码错误或数据损坏' };
                }
            }
            
            const imported = JSON.parse(json);
            
            // 验证配置结构
            if (!imported.version) {
                throw new Error('无效的配置文件');
            }
            
            // 合并导入的配置（保留部分当前设置）
            const current = this.load();
            const merged = this.mergeDeep(this.getDefaultConfig(), imported);
            
            // 保留的元数据
            merged.meta.firstInstall = current.meta.firstInstall;
            merged.meta.importCount = (current.meta.importCount || 0) + 1;
            merged.meta.lastImport = Date.now();
            
            // 处理跨平台字体导入
            const isApp = typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Filesystem;
            const hasFontData = merged.customFontsData?.length > 0;
            
            if (merged.customFonts?.length > 0) {
                if (isApp && hasFontData) {
                    // APP 端导入含字体数据的配置（正常流程）
                    console.log('[ConfigManager] APP 导入：恢复', merged.customFonts.length, '个字体');
                    await this._restoreFontsFromConfig(merged.customFonts, merged.customFontsData);
                    delete merged.customFontsData;
                } else if (isApp && !hasFontData) {
                    // APP 端导入不含字体数据的配置（来自 PC）
                    console.log('[ConfigManager] APP 导入 PC 配置：尝试从 Documents 恢复字体');
                    await this._restoreFontsFromDocuments(merged.customFonts);
                } else if (!isApp && hasFontData) {
                    // PC 端导入含字体数据的配置（来自 APP）
                    console.log('[ConfigManager] PC 导入 APP 配置：字体数据忽略，保留配置');
                    // 保存字体配置但不保存字体数据
                    delete merged.customFontsData;
                    // 提示用户需要重新添加字体
                    setTimeout(() => {
                        Lumina.UI.showToast('自定义字体配置已导入，请手动重新添加字体文件');
                    }, 500);
                } else {
                    // PC 端导入不含字体数据的配置（正常 PC 间导入）
                    console.log('[ConfigManager] PC 导入：从 IndexedDB 加载字体');
                    await this._restoreFontsFromConfig(merged.customFonts, null);
                }
            }
            
            // 保存配置（不含字体数据）
            this.save(merged);
            
            // 应用配置中的当前字体设置
            await this._applyCurrentFont(merged.reading?.font);
            
            return { success: true, config: merged };
        } catch (e) {
            console.error('[ConfigManager] 导入失败:', e);
            return { success: false, error: e.message };
        }
    },
    
    // ========== 请求密码（内部方法）==========
    _requestPassword(type = 'enter') {
        return new Promise((resolve) => {
            const t = Lumina.I18n?.t || ((k) => k);
            const title = type === 'set' ? t('configExportPasswordTitle') || '设置导出密码' : t('enterPassword') || '输入解密密码';
            const message = type === 'set' ? t('configExportPasswordDesc') || '请为此配置备份设置密码' : t('enterPasswordDesc') || '此配置已加密，请输入密码';
            
            Lumina.UI.showDialog(message, 'prompt', (result) => {
                if (result === null || result === false) {
                    resolve(null); // 用户取消
                    return;
                }
                
                const password = result;
                
                // 设置密码模式且用户输入了非空密码：需要确认密码
                if (type === 'set' && password.length > 0) {
                    Lumina.UI.showDialog(t('confirmPassword') || '确认密码', 'prompt', (confirmResult) => {
                        if (confirmResult === null || confirmResult === false) {
                            resolve(null); // 用户取消确认
                            return;
                        }
                        
                        if (password !== confirmResult) {
                            Lumina.UI.showToast(t('passwordMismatch') || '两次输入的密码不一致');
                            resolve(null);
                        } else {
                            resolve(password);
                        }
                    }, {
                        title: t('confirmPassword') || '确认密码',
                        inputType: 'password',
                        placeholder: t('passwordPlaceholder') || '再次输入密码'
                    });
                } else {
                    // 输入密码模式，或者设置模式但用户输入空密码：直接返回
                    resolve(password);
                }
            }, {
                title,
                inputType: 'password',
                placeholder: t('passwordPlaceholder') || '输入密码（可选）'
            });
        });
    },
    
    // ========== 下载配置文件 ==========
    async download(filename = 'lumina-config.json', encrypt = false) {
        let data = await this.export(encrypt);
        if (!data) return;
        
        const ext = encrypt ? '.lmn' : '.json';
        const fullFilename = filename.endsWith(ext) ? filename : `${filename}${ext}`;
        
        // 统一格式：LMN 文件使用 base64 编码，JSON 文件使用纯文本
        // 这样 WEB 和 APP 导出的文件内容完全一致
        let fileContent;
        let mimeType;
        
        if (encrypt) {
            // LMN 格式：统一转为 base64 字符串
            const arrayBuffer = data instanceof ArrayBuffer ? data : data.buffer;
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            fileContent = btoa(binary);
            mimeType = 'text/plain'; // base64 是文本格式
        } else {
            // JSON 格式：直接文本
            fileContent = typeof data === 'string' ? data : JSON.stringify(data);
            mimeType = 'application/json';
        }
        
        // APP 环境：使用 Filesystem 插件保存到 documents/LuminaReader
        const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
        if (isApp && Capacitor.Plugins?.Filesystem) {
            const { Filesystem } = Capacitor.Plugins;
            try {
                // 创建目录
                try {
                    await Filesystem.mkdir({
                        path: 'LuminaReader',
                        directory: 'DOCUMENTS',
                        recursive: true
                    });
                } catch (e) { /* 目录已存在 */ }
                
                // 写入文件（统一使用 utf8 编码写入文本）
                await Filesystem.writeFile({
                    path: `LuminaReader/${fullFilename}`,
                    data: fileContent,
                    directory: 'DOCUMENTS',
                    encoding: 'utf8'
                });
                
                Lumina.UI?.showToast?.(`已导出到: Documents/LuminaReader/${fullFilename}`);
                this.set('meta.lastBackup', Date.now());
                return;
            } catch (err) {
                console.error('[ConfigManager] APP 导出失败:', err);
                // 降级到浏览器下载
            }
        }
        
        // Web 环境：使用浏览器下载（统一使用 Blob 导出文本内容）
        const blob = new Blob([fileContent], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fullFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // 更新备份时间
        this.set('meta.lastBackup', Date.now());
    },
    
    // ========== 从文件导入 ==========
    upload(file, encrypted = false) {
        // 根据文件扩展名自动检测是否加密
        const isLmnFile = file.name.toLowerCase().endsWith('.lmn');
        const shouldDecrypt = encrypted || isLmnFile;
        
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    let data = e.target.result;
                    
                    if (shouldDecrypt) {
                        // LMN 文件现在统一是 base64 编码的文本
                        // 读取为文本后直接解码 base64
                        if (data instanceof ArrayBuffer) {
                            data = new TextDecoder().decode(data);
                        }
                        console.log('[ConfigManager] LMN 文件内容长度:', data.length);
                        // 解码 base64 为原始二进制
                        data = this.base64ToUint8Array(data.trim());
                        console.log('[ConfigManager] Base64 解码后字节数:', data.length);
                    } else {
                        // JSON 是文本格式
                        if (data instanceof ArrayBuffer) {
                            data = new TextDecoder().decode(data);
                        }
                    }
                    
                    const result = await this.import(data, shouldDecrypt);
                    resolve(result);
                } catch (err) {
                    console.error('[ConfigManager] 导入处理失败:', err);
                    resolve({ success: false, error: err.message });
                }
            };
            reader.onerror = () => resolve({ success: false, error: '文件读取失败' });
            
            // 统一使用文本方式读取
            reader.readAsText(file);
        });
    },
    
    // base64 解码为 Uint8Array
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
            console.error('[ConfigManager] Base64 解码失败:', e);
            throw new Error('文件格式错误：无效的 base64 编码');
        }
    },
    
    // ========== 重置所有配置 ==========
    reset() {
        localStorage.removeItem(this.STORAGE_KEY);
        // 清理所有旧配置
        [
            'luminaSettings',
            'lumina_heatmap_presets',
            'luminaPdfPasswordPreset',
            'luminaTTS',
            'lumina_azure_tts_config',
            'lumina_plugin_states',
            'luminaGuideImported',
            'reader-theme'
        ].forEach(key => localStorage.removeItem(key));
        
        return this.getDefaultConfig();
    },
    
    // ========== 获取配置摘要（用于显示） ==========
    getSummary() {
        const config = this.load();
        return {
            version: config.version,
            lastModified: new Date(config.lastModified).toLocaleString(),
            theme: config.reading.theme,
            language: config.reading.language,
            heatMapPresets: config.heatMap.presets.length,
            lastBackup: config.meta.lastBackup ? new Date(config.meta.lastBackup).toLocaleString() : '从未',
        };
    }
};

// ========== 兼容性封装 ==========
// 保持旧的 Settings API 兼容
Lumina.SettingsV2 = {
    load() {
        const config = Lumina.ConfigManager.load();
        // 转换旧格式
        return {
            ...config.reading,
            chapterRegex: config.regex.chapter,
            sectionRegex: config.regex.section,
        };
    },
    
    save(settings) {
        // 反向转换
        Lumina.ConfigManager.set('reading', {
            language: settings.language,
            theme: settings.theme,
            font: settings.font,
            indent: settings.indent,
            dropCap: settings.dropCap,
            fontSize: settings.fontSize,
            lineHeight: settings.lineHeight,
            paragraphSpacing: settings.paragraphSpacing,
            pageWidth: settings.pageWidth,
            margin: settings.margin,
            ignoreEmptyLines: settings.ignoreEmptyLines,
            textCleaning: settings.textCleaning,
            smoothScroll: settings.smoothScroll,
            sidebarVisible: settings.sidebarVisible,
            chapterNumbering: settings.chapterNumbering,
            ttsRate: settings.ttsRate,
            ttsPitch: settings.ttsPitch,
            paginationEnabled: settings.paginationEnabled,
            encryptedExport: settings.encryptedExport,
            paginationMaxWords: settings.paginationMaxWords,
            paginationImageWords: settings.paginationImageWords,
            pdfExtractImages: settings.pdfExtractImages,
            pdfPasswordPreset: settings.pdfPasswordPreset,
            pdfSmartGuess: settings.pdfSmartGuess,
        });
        Lumina.ConfigManager.set('regex.chapter', settings.chapterRegex);
        Lumina.ConfigManager.set('regex.section', settings.sectionRegex);
    }
};
