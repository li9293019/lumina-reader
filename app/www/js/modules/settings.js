// ==================== 15. 设置与配置 ====================

Lumina.Settings = {
    load() {
        // 使用新的配置管理器
        const config = Lumina.ConfigManager.load();
        
        // 转换新格式到旧的 State.settings 格式（保持兼容性）
        Lumina.State.settings = {
            ...config.reading,
            chapterRegex: config.regex.chapter,
            sectionRegex: config.regex.section,
            // TTS 设置映射
            ttsRate: config.tts?.rate ?? 10,
            ttsPitch: config.tts?.pitch ?? 10,
            // 其他旧字段映射
            paginationEnabled: config.pagination.enabled,
            paginationMaxWords: config.pagination.maxWords,
            paginationImageWords: config.pagination.imageWords,
            encryptedExport: config.export.encrypted,
            pdfExtractImages: config.pdf.extractImages,
            pdfPasswordPreset: config.pdf.passwordPreset.enabled,
            pdfSmartGuess: config.pdf.passwordPreset.smartGuess,
        };
    },

    save() {
        // 从 State.settings 反向转换到新格式
        const settings = Lumina.State.settings;
        
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
        });
        
        // TTS 设置保存到新路径
        Lumina.ConfigManager.set('tts', {
            rate: settings.ttsRate ?? 10,
            pitch: settings.ttsPitch ?? 10,
            voiceURI: settings.ttsVoiceURI ?? null,
            volume: settings.ttsVolume ?? 1.0,
        });
        
        Lumina.ConfigManager.set('regex', {
            chapter: settings.chapterRegex,
            section: settings.sectionRegex,
        });
        
        Lumina.ConfigManager.set('pagination', {
            enabled: settings.paginationEnabled,
            maxWords: settings.paginationMaxWords,
            imageWords: settings.paginationImageWords,
        });
        
        Lumina.ConfigManager.set('export.encrypted', settings.encryptedExport);
        Lumina.ConfigManager.set('pdf.extractImages', settings.pdfExtractImages);
        Lumina.ConfigManager.set('pdf.passwordPreset.enabled', settings.pdfPasswordPreset);
        Lumina.ConfigManager.set('pdf.passwordPreset.smartGuess', settings.pdfSmartGuess);
    },

    async apply() {
        const settings = Lumina.State.settings;
        document.documentElement.lang = settings.language;
        document.documentElement.setAttribute('data-theme', settings.theme);
        
        // 设置状态栏颜色（APP 环境）
        const darkThemes = ['dark', 'amoled', 'midnight', 'nebula', 'espresso'];
        const isDarkTheme = darkThemes.includes(settings.theme);
        
        setTimeout(() => {
            if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
                try {
                    const StatusBar = Capacitor.Plugins.StatusBar;
                    if (StatusBar && StatusBar.setStyle) {
                        const style = isDarkTheme ? 'DARK' : 'LIGHT';
                        StatusBar.setStyle({ style: style }).catch(() => {});
                    }
                } catch (e) {}
            }
        }, 500);
        
        window.__isDarkTheme = isDarkTheme;

        let savedScrollIndex = null;
        const wasReading = Lumina.State.app.document.items.length > 0 &&
            Lumina.DOM.contentWrapper.querySelector('.doc-line[data-index]');
        if (wasReading) savedScrollIndex = Lumina.Renderer.getCurrentVisibleIndex();

        const fontFamily = await Lumina.Font.load(settings.font);
        const config = Lumina.Config.fontConfig[settings.font];
        document.documentElement.style.setProperty('--font-family-dynamic', fontFamily || config.family);
        document.body.style.fontFamily = config.family;

        Lumina.DOM.contentWrapper.className = `content-wrapper font-${settings.font}`;
        document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);
        document.documentElement.style.setProperty('--line-height', (settings.lineHeight / 10).toString());
        document.documentElement.style.setProperty('--paragraph-spacing', `${settings.paragraphSpacing / 10}em`);

        const isMobileView = window.innerWidth <= 768;
        document.documentElement.style.setProperty('--content-max-width', isMobileView ? '100%' : `${settings.pageWidth}%`);
        document.documentElement.style.setProperty('--content-padding', isMobileView ? '16px' : `${settings.margin}px`);

        Lumina.DOM.contentScroll.classList.toggle('no-smooth', !settings.smoothScroll);

        document.querySelectorAll('[data-setting-toggle]').forEach(el => {
            const key = el.dataset.settingToggle;
            el.querySelector('.toggle-track').classList.toggle('active', settings[key]);
        });

        document.querySelectorAll('[data-setting-slider]').forEach(container => {
            const key = container.dataset.settingSlider;
            const slider = container.querySelector('.slider');
            const display = container.querySelector('.slider-value');
            const divider = parseInt(container.dataset.divider) || 1;
            const unit = container.dataset.unit || '';
            slider.min = container.dataset.min || 0;
            slider.max = container.dataset.max || 100;
            slider.value = settings[key];
            let displayValue = settings[key];
            if (divider !== 1) displayValue = (settings[key] / divider).toFixed(1);
            display.textContent = `${displayValue}${unit}`;
        });

        Lumina.UI.updateActiveButtons();
        document.getElementById('chapterRegex').value = settings.chapterRegex;
        document.getElementById('sectionRegex').value = settings.sectionRegex;

        const encryptedExportToggle = document.getElementById('encryptedExportToggle');
        if (encryptedExportToggle) encryptedExportToggle.checked = settings.encryptedExport;

        const sidebarVisible = settings.sidebarVisible && Lumina.State.app.document.items.length;
        Lumina.DOM.sidebarLeft.classList.toggle('visible', sidebarVisible);
        Lumina.DOM.readingArea.classList.toggle('with-sidebar', sidebarVisible);

        if (Lumina.State.app.document.items.length) Lumina.Renderer.renderCurrentChapter(savedScrollIndex);
        Lumina.Renderer.updateChapterNavInfo();

        Lumina.Config.pagination.enabled = settings.paginationEnabled;
        Lumina.Config.pagination.maxReadingWords = parseInt(settings.paginationMaxWords) || 3000;
        Lumina.Config.pagination.imageEquivalentWords = parseInt(settings.paginationImageWords) || 300;
        
        if (Lumina.State.app.document.items.length) {
            Lumina.State.app.chapters.forEach(ch => ch.pageRanges = null);
            const currentIdx = Lumina.Renderer.getCurrentVisibleIndex();
            Lumina.Renderer.renderCurrentChapter(currentIdx);
        }
    },

    reset() {
        const oldFileName = Lumina.State.app.currentFile.name;
        const oldFileType = Lumina.State.app.currentFile.type;
        
        // 重置配置
        Lumina.ConfigManager.reset();
        
        // 重新加载
        this.load();
        Lumina.Parser.RegexCache.updateCustomPatterns('', '');

        document.getElementById('chapterRegex').value = '';
        document.getElementById('sectionRegex').value = '';
        document.getElementById('chapterRegex').classList.remove('error', 'valid');
        document.getElementById('sectionRegex').classList.remove('error', 'valid');
        document.getElementById('chapterRegexFeedback').textContent = '';
        document.getElementById('chapterRegexFeedback').classList.remove('error', 'valid', 'info');
        document.getElementById('sectionRegexFeedback').textContent = '';
        document.getElementById('sectionRegexFeedback').classList.remove('error', 'valid', 'info');

        // 重置热力图预设内存状态
        if (Lumina.HeatMap) {
            Lumina.HeatMap.presets = [];
        }
        
        // 重置 Azure TTS 配置并刷新 UI
        if (Lumina.Plugin.AzureTTS) {
            Lumina.Plugin.AzureTTS.refreshUI();
            // 销毁引擎
            Lumina.Plugin.AzureTTS.engine.destroy?.();
        }
        
        // 重新加载 PDF 密码预设 UI
        this.reloadPasswordPresetUI();

        this.apply();
        
        // 显示重置成功提示
        Lumina.UI.showToast(Lumina.I18n.t('resetSuccess') || '设置已重置');
        Lumina.I18n.updateUI();
        if (oldFileName) {
            Lumina.State.app.currentFile.name = oldFileName;
            Lumina.State.app.currentFile.type = oldFileType;
            Lumina.DOM.fileInfo.textContent = oldFileName;
        }
    },

    // 初始化 PDF 解析设置（密码预设器）
    initPasswordPreset() {
        const presetToggle = document.getElementById('pdfPasswordPresetToggle');
        const configPanel = document.getElementById('pdfPasswordPresetConfig');
        const lengthSlider = document.getElementById('pdfPasswordLength');
        const lengthValue = document.getElementById('pdfPasswordLengthValue');
        const prefixInput = document.getElementById('pdfPasswordPrefix');
        const commonInput = document.getElementById('pdfCommonPasswords');
        
        if (!presetToggle || !configPanel) return;
        
        // 从新配置加载
        const config = Lumina.ConfigManager.get('pdf.passwordPreset');
        
        // 同步到 State.settings
        const syncToState = () => {
            Lumina.State.settings.pdfPasswordPreset = config.enabled;
            Lumina.State.settings.pdfSmartGuess = config.smartGuess;
        };
        syncToState();
        
        // 监听设置变化
        const originalSave = this.save;
        this.save = function() {
            originalSave.call(this);
            Lumina.ConfigManager.set('pdf.passwordPreset.enabled', Lumina.State.settings.pdfPasswordPreset);
            Lumina.ConfigManager.set('pdf.passwordPreset.smartGuess', Lumina.State.settings.pdfSmartGuess);
        };
        
        const updatePanelVisibility = () => {
            configPanel.style.display = config.enabled ? 'block' : 'none';
        };
        updatePanelVisibility();
        
        presetToggle.addEventListener('click', () => setTimeout(updatePanelVisibility, 0));
        
        if (lengthSlider) {
            lengthSlider.value = config.length;
            if (lengthValue) lengthValue.textContent = config.length;
            lengthSlider.addEventListener('input', () => {
                const value = parseInt(lengthSlider.value);
                if (lengthValue) lengthValue.textContent = value;
                Lumina.ConfigManager.set('pdf.passwordPreset.length', value);
            });
        }
        
        if (prefixInput) {
            prefixInput.value = config.prefix;
            prefixInput.addEventListener('change', () => {
                Lumina.ConfigManager.set('pdf.passwordPreset.prefix', prefixInput.value);
            });
        }
        
        if (commonInput) {
            commonInput.value = (config.commonPasswords || '').replace(/\|/g, ', ');
            commonInput.addEventListener('change', () => {
                const passwords = commonInput.value
                    .split(/[,，\s]+/)
                    .map(p => p.trim())
                    .filter(p => p.length > 0)
                    .join('|');
                Lumina.ConfigManager.set('pdf.passwordPreset.commonPasswords', passwords);
            });
        }
    },
    
    // 重新加载 PDF 密码预设 UI（用于重置和导入后）
    reloadPasswordPresetUI() {
        const config = Lumina.ConfigManager.get('pdf.passwordPreset');
        const presetToggle = document.getElementById('pdfPasswordPresetToggle');
        const configPanel = document.getElementById('pdfPasswordPresetConfig');
        const lengthSlider = document.getElementById('pdfPasswordLength');
        const lengthValue = document.getElementById('pdfPasswordLengthValue');
        const prefixInput = document.getElementById('pdfPasswordPrefix');
        const commonInput = document.getElementById('pdfCommonPasswords');
        
        if (presetToggle) {
            presetToggle.querySelector('.toggle-track')?.classList.toggle('active', config.enabled);
        }
        if (configPanel) {
            configPanel.style.display = config.enabled ? 'block' : 'none';
        }
        if (lengthSlider) {
            lengthSlider.value = config.length;
        }
        if (lengthValue) {
            lengthValue.textContent = config.length;
        }
        if (prefixInput) {
            prefixInput.value = config.prefix;
        }
        if (commonInput) {
            commonInput.value = (config.commonPasswords || '').replace(/\|/g, ', ');
        }
    },
    
    // APP 环境：显示文件选择器
    showAppFilePicker() {
        const input = document.createElement('input');
        input.type = 'file';
        // APP 环境使用通用 MIME 类型，因为 Android 不认识 .lmn 扩展名
        input.accept = '*/*';
        // 临时添加到 DOM 防止被垃圾回收
        input.style.display = 'none';
        document.body.appendChild(input);
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // 检查文件扩展名
            const isLmn = file.name.toLowerCase().endsWith('.lmn');
            const isJson = file.name.toLowerCase().endsWith('.json');
            
            if (!isLmn && !isJson) {
                Lumina.UI.showToast(Lumina.I18n.t('configInvalidFileType') || '请选择 .json 或 .lmn 文件');
                document.body.removeChild(input);
                return;
            }
            
            await this.handleConfigImport(file);
            // 清理
            document.body.removeChild(input);
        };
        
        // 监听取消选择（通过 visibilitychange）
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // APP 回到前台，检查是否有文件被选择
                setTimeout(() => {
                    if (input.parentNode) {
                        document.body.removeChild(input);
                    }
                }, 1000);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange, { once: true });
        
        input.click();
    },
    
    // 处理配置导入
    async handleConfigImport(file) {
        const ext = file.name.toLowerCase().split('.').pop();
        if (ext !== 'json' && ext !== 'lmn') {
            Lumina.UI.showToast(Lumina.I18n.t('configInvalidFileType') || '请选择 .json 或 .lmn 文件');
            return;
        }
        
        // 显示加载提示
        Lumina.UI.showToast(Lumina.I18n.t('readingFile') || '正在读取文件...', 0);
        
        // 自动根据文件扩展名检测是否加密
        const isEncrypted = file.name.toLowerCase().endsWith('.lmn');
        
        try {
            const result = await Lumina.ConfigManager.upload(file, isEncrypted);
            
            // 隐藏加载提示
            const toast = document.querySelector('.toast');
            if (toast) {
                toast.classList.remove('show');
            }
            
            if (result.success) {
                // 重新加载并应用配置
                Lumina.Settings.load();
                await Lumina.Settings.apply();
                
                // 更新热力图预设内存状态
                if (Lumina.HeatMap) {
                    Lumina.HeatMap.loadPresets();
                }
                
                // 刷新 Azure TTS UI（导入的配置已在 ConfigManager 中）
                if (Lumina.Plugin.AzureTTS) {
                    Lumina.Plugin.AzureTTS.refreshUI();
                    // 如果已启用且配置有效，重新初始化引擎
                    if (Lumina.Plugin.AzureTTS.config.enabled && Lumina.Plugin.AzureTTS.config.speechKey) {
                        Lumina.Plugin.AzureTTS.engine.init(Lumina.Plugin.AzureTTS.config.speechKey, Lumina.Plugin.AzureTTS.config.region);
                    }
                }
                
                // 重新加载 PDF 密码预设 UI
                Lumina.Settings.reloadPasswordPresetUI();
                
                Lumina.I18n.updateUI();
                Lumina.UI.showToast(Lumina.I18n.t('configImportSuccess') || '配置导入成功');
            } else {
                Lumina.UI.showDialog(Lumina.I18n.t('configImportFailed') || `配置导入失败: ${result.error}`);
            }
        } catch (err) {
            Lumina.UI.showDialog(Lumina.I18n.t('configImportFailed') || `配置导入失败: ${err.message}`);
        }
    },
    
    // ========== 配置备份与恢复 ==========
    initConfigBackup() {
        const exportBtn = document.getElementById('configExportBtn');
        const importBtn = document.getElementById('configImportBtn');
        const importFile = document.getElementById('configImportFile');
        const encryptedToggle = document.getElementById('configEncryptToggle');
        
        // 初始化加密开关 toggle
        if (encryptedToggle) {
            // 点击 toggle 切换状态
            encryptedToggle.addEventListener('click', () => {
                const isActive = encryptedToggle.classList.contains('active');
                if (isActive) {
                    encryptedToggle.classList.remove('active');
                } else {
                    encryptedToggle.classList.add('active');
                }
            });
        }
        
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                const encrypted = encryptedToggle?.classList.contains('active') || false;
                // 生成带日期时间的文件名（使用本地时间）
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hour = String(now.getHours()).padStart(2, '0');
                const minute = String(now.getMinutes()).padStart(2, '0');
                const second = String(now.getSeconds()).padStart(2, '0');
                const dateStr = `${year}${month}${day}_${hour}${minute}${second}`;
                const filename = `lumina-config_${dateStr}`;
                await Lumina.ConfigManager.download(filename, encrypted);
            });
        }
        
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                // APP 环境使用系统文件选择器
                const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
                if (isApp) {
                    this.showAppFilePicker();
                } else {
                    importFile?.click();
                }
            });
            
            importFile?.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                await this.handleConfigImport(file);
                // 清空 input value，允许再次选择同一文件
                e.target.value = '';
            });
        }
    }
};

// ==================== 16. 字体加载器 ====================

Lumina.Font = {
    loaded: new Set(),
    loading: new Set(),
    failed: new Set(),

    async load(type) {
        const config = Lumina.Config.fontConfig[type];
        if (!config) return '';
        if (!config.url || this.loaded.has(type)) return config.family;

        if (this.loading.has(type)) {
            return new Promise(resolve => {
                const check = setInterval(() => {
                    if (this.loaded.has(type)) { clearInterval(check); resolve(config.family); }
                    else if (this.failed.has(type)) { clearInterval(check); resolve(config.fallback || config.family); }
                }, 100);
            });
        }

        this.loading.add(type);
        const indicator = document.getElementById('fontLoadingIndicator');
        if (indicator) {
            indicator.textContent = Lumina.I18n.t('fontLoading');
            indicator.classList.add('active');
        }

        if (!document.getElementById(`font-style-${type}`) && config.metrics) {
            const style = document.createElement('style');
            style.id = `font-style-${type}`;
            style.textContent = `@font-face { font-family: '${type}-fallback'; src: local('${config.fallback.split(',')[0].trim()}'); ${config.metrics.sizeAdjust ? `size-adjust: ${config.metrics.sizeAdjust};` : ''} ${config.metrics.ascentOverride ? `ascent-override: ${config.metrics.ascentOverride};` : ''} ${config.metrics.descentOverride ? `descent-override: ${config.metrics.descentOverride};` : ''} ${config.metrics.lineGapOverride ? `line-gap-override: ${config.metrics.lineGapOverride};` : ''} }`;
            document.head.appendChild(style);
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.loading.delete(type);
                this.failed.add(type);
                if (indicator) indicator.classList.remove('active');
                this.applyFallbackFont(type);
                resolve(config.fallback || config.family);
            }, 8000);

            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = config.url;
            link.crossOrigin = 'anonymous';

            link.onload = () => {
                clearTimeout(timeout);
                const fontName = config.family.split(',')[0].replace(/"/g, '').trim();
                document.fonts.load(`16px "${fontName}"`).then(() => {
                    this.loading.delete(type);
                    this.loaded.add(type);
                    if (indicator) indicator.classList.remove('active');
                    document.documentElement.classList.add(`font-${type}-loaded`);
                    resolve(config.family);
                }).catch(() => {
                    this.loading.delete(type);
                    this.failed.add(type);
                    this.applyFallbackFont(type);
                    if (indicator) indicator.classList.remove('active');
                    resolve(config.fallback || config.family);
                });
            };

            link.onerror = () => {
                clearTimeout(timeout);
                this.loading.delete(type);
                this.failed.add(type);
                this.applyFallbackFont(type);
                if (indicator) indicator.classList.remove('active');
                resolve(config.fallback || config.family);
            };

            document.head.appendChild(link);
        });
    },

    applyFallbackFont(type) {
        const config = Lumina.Config.fontConfig[type];
        if (!config) return;
        const fallbackStack = config.metrics ? `"${type}-fallback", ${config.fallback}` : config.fallback;
        document.documentElement.style.setProperty(`--font-${type}-fallback`, fallbackStack);
        document.documentElement.classList.add(`font-${type}-fallback`);
    },

    preloadCritical() {
        if (document.readyState === 'complete') {
            setTimeout(() => {
                ['serif', 'sans'].forEach(type => {
                    if (Lumina.Config.fontConfig[type].preload && !this.loaded.has(type) && !this.loading.has(type)) this.load(type);
                });
            }, 100);
        }
    }
};
