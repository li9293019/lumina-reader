// ==================== 15. 设置与配置 ====================

Lumina.Settings = {
    load() {
        const saved = localStorage.getItem('luminaSettings');
        if (saved) Lumina.State.settings = { ...Lumina.Config.defaultSettings, ...JSON.parse(saved) };
        else Lumina.State.settings = { ...Lumina.Config.defaultSettings };
    },

    save() { localStorage.setItem('luminaSettings', JSON.stringify(Lumina.State.settings)); },

    async apply() {
        const settings = Lumina.State.settings;
        document.documentElement.lang = settings.language;
        document.documentElement.setAttribute('data-theme', settings.theme);
        
        // 设置状态栏颜色（APP 环境）
        // 深色主题列表
        const darkThemes = ['dark', 'amoled', 'midnight', 'nebula', 'espresso'];
        const isDarkTheme = darkThemes.includes(settings.theme);
        
        // 延迟设置状态栏，确保插件已加载
        setTimeout(() => {
            if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
                try {
                    const StatusBar = Capacitor.Plugins.StatusBar;
                    console.log('[StatusBar] 插件对象:', StatusBar);
                    if (StatusBar && StatusBar.setStyle) {
                        // Capacitor StatusBar: style.DARK = 深色图标(浅色背景), style.LIGHT = 浅色图标(深色背景)
                        // 浅色主题 -> 需要深色图标
                        // 深色主题 -> 需要浅色图标
                        const style = isDarkTheme ? 'DARK' : 'LIGHT';
                        StatusBar.setStyle({ style: style }).then(() => {
                            console.log('[StatusBar] 样式设置成功:', style);
                        }).catch(err => {
                            console.error('[StatusBar] 设置失败:', err);
                        });
                    } else {
                        console.warn('[StatusBar] 插件不可用');
                    }
                } catch (e) {
                    console.warn('[StatusBar] 异常:', e);
                }
            }
        }, 500);
        
        // 保存主题类型供状态栏背景使用
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

        // 加密导出开关
        const encryptedExportToggle = document.getElementById('encryptedExportToggle');
        if (encryptedExportToggle) {
            encryptedExportToggle.checked = settings.encryptedExport;
        }

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
        Lumina.State.settings = { ...Lumina.Config.defaultSettings };
        Lumina.Parser.RegexCache.updateCustomPatterns('', '');

        document.getElementById('chapterRegex').value = '';
        document.getElementById('sectionRegex').value = '';
        document.getElementById('chapterRegex').classList.remove('error', 'valid');
        document.getElementById('sectionRegex').classList.remove('error', 'valid');
        document.getElementById('chapterRegexFeedback').textContent = '';
        document.getElementById('chapterRegexFeedback').classList.remove('error', 'valid', 'info');
        document.getElementById('sectionRegexFeedback').textContent = '';
        document.getElementById('sectionRegexFeedback').classList.remove('error', 'valid', 'info');

        Lumina.Settings.save();
        Lumina.Settings.apply();
        Lumina.I18n.updateUI();
        if (oldFileName) {
            Lumina.State.app.currentFile.name = oldFileName;
            Lumina.State.app.currentFile.type = oldFileType;
            Lumina.DOM.fileInfo.textContent = oldFileName;
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

