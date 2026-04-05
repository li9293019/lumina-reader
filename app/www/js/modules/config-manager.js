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
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
            return true;
        } catch (e) {
            console.error('[ConfigManager] 保存配置失败:', e);
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
            
            this.save(merged);
            
            // 导入成功后重新初始化字体管理器
            if (merged.customFonts?.length > 0) {
                console.log('[ConfigManager] 导入配置包含', merged.customFonts.length, '个自定义字体');
                // 延迟执行，确保配置已保存
                setTimeout(() => {
                    Lumina.FontManager?.init?.().then(() => {
                        // 更新设置面板的字体按钮
                        Lumina.Settings?.renderFontButtons?.();
                        console.log('[ConfigManager] 字体面板已更新');
                    });
                }, 100);
            }
            
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
