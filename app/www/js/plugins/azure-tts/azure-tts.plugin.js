// ==================== Azure TTS 插件 ====================

Lumina.Plugin = Lumina.Plugin || {};
Lumina.Plugin.AzureTTS = Lumina.Plugin.AzureTTS || {};

Object.assign(Lumina.Plugin.AzureTTS, {
    name: 'azure-tts',
    version: '2.0.0',
    description: 'Azure 语音服务朗读支持（支持预加载缓存）',
    
    engine: null,
    taskManager: null,
    
    // 默认配置
    config: {
        enabled: false,
        speechKey: '',
        region: 'eastasia',
        voice: 'zh-CN-XiaoxiaoNeural',
        style: 'general',
        rate: 1.0,
        pitch: 0,
        cache: {
            enabled: true,          // 总开关
            preloadCount: 5,        // 预加载句数
            cacheDepth: 5,          // 缓存深度（总缓存 = preloadCount * cacheDepth）
            waitTimeout: 2000       // 等待超时(ms)
        }
    },
    
    // 使用统一配置管理器，配置路径: azureTTS
    
    // 音色支持的风格映射
    voiceStyles: {
        'zh-CN-XiaoxiaoNeural': ['general', 'assistant', 'chat', 'customerservice', 'newscast', 'affectionate', 'angry', 'calm', 'cheerful', 'sad', 'serious'],
        'zh-CN-YunxiNeural': ['general', 'assistant', 'chat', 'customerservice', 'newscast', 'angry', 'cheerful', 'sad', 'serious'],
        'zh-CN-YunjianNeural': ['general'],
        'zh-CN-YunxiaNeural': ['general'],
        'zh-CN-XiaoyiNeural': ['general'],
        'zh-CN-YunyangNeural': ['general', 'customerservice', 'narration'],
        'zh-CN-XiaochenNeural': ['general'],
        'zh-CN-XiaohanNeural': ['general']
    },

    init() {
        // console.log('[AzureTTS Plugin] 初始化...');
        
        this.loadConfig();
        
        // 初始化 TaskManager
        const preloadCount = this.config.cache?.preloadCount ?? 5;
        const cacheDepth = this.config.cache?.cacheDepth ?? 5;
        this.taskManager = new Lumina.Plugin.AzureTTS.TaskManager({
            enabled: this.config.cache?.enabled !== false,
            windowSize: preloadCount,
            maxCacheSize: preloadCount * cacheDepth,  // 总缓存量 = 预加载 * 深度
            waitTimeout: this.config.cache?.waitTimeout ?? 2000
        });
        
        // 等待引擎类加载
        let engineAttempts = 0;
        const waitForEngine = () => {
            if (Lumina.Plugin.AzureTTS.Engine) {
                this.engine = new Lumina.Plugin.AzureTTS.Engine();
                this.engine.setTaskManager(this.taskManager);
                this.taskManager.setEngine(this.engine);
                this._initUI();
            } else if (engineAttempts < 50) {
                engineAttempts++;
                setTimeout(waitForEngine, 100);
            } else {
                console.error('[AzureTTS] Engine 类加载超时');
            }
        };
        waitForEngine();
        
        return true;
    },
    
    _initUI() {
        let attempts = 0;
        const waitForDOM = () => {
            const toggle = document.getElementById('azureTtsToggle');
            const dialog = document.getElementById('azureTtsDialog');
            
            if (toggle && dialog) {
                this.bindToggleUI();
                this.bindDialogEvents();
                this.updateCacheUI();
            } else {
                attempts++;
                if (attempts < 50) {
                    setTimeout(waitForDOM, 100);
                }
            }
        };
        
        setTimeout(waitForDOM, 100);
        
        setTimeout(() => {
            if (this.config.enabled && this.config.speechKey) {
                this.engine.init(this.config.speechKey, this.config.region);
            }
        }, 1000);
        
        // console.log('[AzureTTS Plugin] 已就绪');
    },

    loadConfig() {
        try {
            const saved = Lumina.ConfigManager.get('azureTTS');
            if (saved) {
                this.config = { ...this.config, ...saved };
                this.config.cache = { 
                    ...this.config.cache,
                    ...saved.cache 
                };
            }
        } catch (e) {
            console.warn('[AzureTTS] 加载配置失败:', e);
        }
    },

    saveConfig() {
        try {
            Lumina.ConfigManager.set('azureTTS', this.config);
        } catch (e) {
            console.warn('[AzureTTS] 保存配置失败:', e);
        }
    },
    
    // 刷新 UI（从 ConfigManager 重新加载配置并更新界面）
    refreshUI() {
        // 重新加载配置
        this.loadConfig();
        
        // 更新主界面开关
        const toggle = document.getElementById('azureTtsToggle');
        if (toggle) {
            const oldValue = toggle.checked;
            toggle.checked = this.config.enabled;
            
            // 触发 change 事件以确保 CSS 更新
            if (oldValue !== toggle.checked) {
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        
        // 更新缓存 UI
        this.updateCacheUI();
    },

    bindToggleUI() {
        const toggle = document.getElementById('azureTtsToggle');
        const info = document.getElementById('azureTtsInfo');
        
        if (!toggle || !info) return;
        
        toggle.checked = this.config.enabled;
        
        info.addEventListener('click', () => this.openDialog());
        
        toggle.addEventListener('change', async () => {
            if (toggle.checked) {
                if (this.config.speechKey && this.config.speechKey.length > 20) {
                    this.config.enabled = true;
                    this.saveConfig();
                    this.engine.init(this.config.speechKey, this.config.region);
                    Lumina.TTS?.manager?.clearPluginEngine?.();
                    Lumina.UI?.showToast?.(Lumina.I18n.t('azureTTSEnabled'));
                } else {
                    await this.openDialog();
                    toggle.checked = !!this.config.speechKey;
                }
            } else {
                this.config.enabled = false;
                this.saveConfig();
                this.engine.destroy();
                Lumina.TTS?.manager?.clearPluginEngine?.();
                Lumina.UI?.showToast?.(Lumina.I18n.t('azureTTSDisabled'));
            }
        });
    },

    updateCacheUI() {
        // 开关状态
        const cacheToggleTrack = document.getElementById('azureCacheToggleTrack');
        if (cacheToggleTrack) {
            cacheToggleTrack.classList.toggle('active', this.config.cache?.enabled !== false);
        }
        
        // 预加载句数滑块
        const preloadSlider = document.getElementById('azurePreloadSlider');
        const preloadValue = document.getElementById('azurePreloadValue');
        const preloadCount = this.config.cache?.preloadCount ?? 5;
        if (preloadSlider) preloadSlider.value = preloadCount;
        if (preloadValue) preloadValue.textContent = preloadCount;
        
        // 缓存深度滑块
        const depthSlider = document.getElementById('azureDepthSlider');
        const depthValue = document.getElementById('azureDepthValue');
        const cacheDepth = this.config.cache?.cacheDepth ?? 5;
        if (depthSlider) depthSlider.value = cacheDepth;
        if (depthValue) depthValue.textContent = cacheDepth;
        
        // 应用 i18n 翻译
        this._applyI18n();
    },
    
    _applyI18n() {
        // 翻译所有带有 data-i18n 属性的元素
        const dialog = document.getElementById('azureTtsDialog');
        if (!dialog) return;
        
        dialog.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key && Lumina.I18n?.t) {
                el.textContent = Lumina.I18n.t(key);
            }
        });
    },

    openDialog() {
        return new Promise((resolve) => {
            const dialog = document.getElementById('azureTtsDialog');
            if (!dialog) {
                resolve(false);
                return;
            }
            
            this._dialogResolve = resolve;
            this.loadDialogValues();
            this.updateCacheUI();
            this.updateStatsDisplay();
            dialog.classList.add('active');
            
            setTimeout(() => {
                document.getElementById('azureDialogKey')?.focus();
            }, 100);
        });
    },

    closeDialog(confirmed = false) {
        const dialog = document.getElementById('azureTtsDialog');
        if (dialog) dialog.classList.remove('active');
        
        const status = document.getElementById('azureDialogStatus');
        if (status) status.style.display = 'none';
        
        if (this._dialogResolve) {
            this._dialogResolve(confirmed);
            this._dialogResolve = null;
        }
    },

    loadDialogValues() {
        const keyInput = document.getElementById('azureDialogKey');
        if (keyInput) keyInput.value = this.config.speechKey;
        
        this.updateCapsuleGroup('azureRegionOptions', this.config.region);
        this.updateCapsuleGroup('azureVoiceOptions', this.config.voice);
        this.updateCapsuleGroup('azureStyleOptions', this.config.style);
        this.updateStyleOptions(this.config.voice);
    },

    updateCapsuleGroup(groupId, activeValue) {
        const group = document.getElementById(groupId);
        if (!group) return;
        
        group.querySelectorAll('.azure-capsule').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === activeValue);
        });
    },
    
    updateStyleOptions(voice) {
        const supportedStyles = this.voiceStyles[voice] || ['general'];
        const styleGroup = document.getElementById('azureStyleOptions');
        if (!styleGroup) return;
        
        styleGroup.querySelectorAll('.azure-capsule').forEach(btn => {
            const style = btn.dataset.value;
            const isSupported = supportedStyles.includes(style);
            
            if (isSupported) {
                btn.style.display = '';
                btn.disabled = false;
            } else {
                btn.style.display = 'none';
                btn.disabled = true;
                btn.classList.remove('active');
            }
        });
        
        const currentActive = styleGroup.querySelector('.azure-capsule.active');
        if (currentActive && currentActive.disabled) {
            const generalBtn = styleGroup.querySelector('[data-value="general"]');
            if (generalBtn) {
                styleGroup.querySelectorAll('.azure-capsule').forEach(btn => btn.classList.remove('active'));
                generalBtn.classList.add('active');
                this.saveCurrentConfig();
            }
        }
        
        if (!styleGroup.querySelector('.azure-capsule.active')) {
            const generalBtn = styleGroup.querySelector('[data-value="general"]');
            if (generalBtn) generalBtn.classList.add('active');
        }
    },

    bindDialogEvents() {
        const closeBtn = document.getElementById('azureTtsDialogClose');
        if (closeBtn) closeBtn.onclick = () => this.closeDialog(true);
        
        const dialog = document.getElementById('azureTtsDialog');
        if (dialog) {
            dialog.onclick = (e) => {
                if (e.target === dialog) this.closeDialog(true);
            };
        }
        
        if (!Lumina.Plugin.AzureTTS._escBound) {
            document.onkeydown = (e) => {
                if (e.key === 'Escape') {
                    const dlg = document.getElementById('azureTtsDialog');
                    if (dlg?.classList.contains('active')) this.closeDialog(true);
                }
            };
            Lumina.Plugin.AzureTTS._escBound = true;
        }
        
        ['azureRegionOptions', 'azureVoiceOptions', 'azureStyleOptions'].forEach(groupId => {
            const group = document.getElementById(groupId);
            if (!group) return;
            
            group.querySelectorAll('.azure-capsule').forEach(capsule => {
                capsule.onclick = () => {
                    group.querySelectorAll('.azure-capsule').forEach(btn => btn.classList.remove('active'));
                    capsule.classList.add('active');
                    
                    if (groupId === 'azureVoiceOptions') {
                        this.updateStyleOptions(capsule.dataset.value);
                    }
                    this.saveCurrentConfig();
                };
            });
        });
        
        const keyInput = document.getElementById('azureDialogKey');
        if (keyInput) {
            keyInput.onchange = () => this.saveCurrentConfig();
            keyInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.saveCurrentConfig();
                }
            };
        }
        
        const testBtn = document.getElementById('azureDialogTest');
        if (testBtn) testBtn.onclick = () => this.testConfig();
        
        // 缓存开关（使用 toggle-switch 样式）
        const cacheToggleRow = document.getElementById('azureCacheToggleRow');
        const cacheToggleTrack = document.getElementById('azureCacheToggleTrack');
        if (cacheToggleRow && cacheToggleTrack) {
            cacheToggleRow.onclick = () => {
                const newState = !cacheToggleTrack.classList.contains('active');
                cacheToggleTrack.classList.toggle('active', newState);
                this.config.cache.enabled = newState;
                this.taskManager?.setEnabled(newState);
                this.saveConfig();
            };
        }
        
        // 预加载句数滑块
        const preloadSlider = document.getElementById('azurePreloadSlider');
        if (preloadSlider) {
            preloadSlider.oninput = (e) => {
                const value = parseInt(e.target.value);
                this.config.cache.preloadCount = value;
                if (this.taskManager) {
                    this.taskManager.config.windowSize = value;
                    // 更新最大缓存量
                    const cacheDepth = this.config.cache.cacheDepth ?? 5;
                    this.taskManager.maxCacheSize = value * cacheDepth;
                }
                const valueDisplay = document.getElementById('azurePreloadValue');
                if (valueDisplay) valueDisplay.textContent = value;
            };
            preloadSlider.onchange = () => this.saveConfig();
        }
        
        // 缓存深度滑块
        const depthSlider = document.getElementById('azureDepthSlider');
        if (depthSlider) {
            depthSlider.oninput = (e) => {
                const value = parseInt(e.target.value);
                this.config.cache.cacheDepth = value;
                // 更新最大缓存量
                if (this.taskManager) {
                    const preloadCount = this.config.cache.preloadCount ?? 5;
                    this.taskManager.maxCacheSize = preloadCount * value;
                }
                const valueDisplay = document.getElementById('azureDepthValue');
                if (valueDisplay) valueDisplay.textContent = value;
            };
            depthSlider.onchange = () => this.saveConfig();
        }
    },

    updateStatsDisplay() {
        const stats = this.taskManager?.getStats();
        if (!stats) return;
        
        const hitRateEl = document.getElementById('statHitRate');
        const cacheSizeEl = document.getElementById('statCacheSize');
        const synthesizedEl = document.getElementById('statSynthesized');
        const avgTimeEl = document.getElementById('statAvgTime');
        
        if (hitRateEl) hitRateEl.textContent = stats.hitRate + '%';
        if (cacheSizeEl) cacheSizeEl.textContent = stats.cacheSize;
        if (synthesizedEl) synthesizedEl.textContent = Lumina.Utils?.formatWordCount?.(stats.synthesizedChars) || stats.synthesizedChars;
        if (avgTimeEl) avgTimeEl.textContent = (stats.avgSynthesisTime / 1000).toFixed(1) + 's';
    },

    saveCurrentConfig() {
        const key = document.getElementById('azureDialogKey')?.value?.trim() || '';
        
        this.config.speechKey = key;
        this.config.region = this.getActiveCapsuleValue('azureRegionOptions') || 'eastasia';
        this.config.voice = this.getActiveCapsuleValue('azureVoiceOptions') || 'zh-CN-XiaoxiaoNeural';
        this.config.style = this.getActiveCapsuleValue('azureStyleOptions') || 'general';
        
        if (key && key.length > 20) {
            this.config.enabled = true;
            this.saveConfig();
            this.engine.init(key, this.config.region);
        } else {
            this.saveConfig();
        }
    },

    getActiveCapsuleValue(groupId) {
        const group = document.getElementById(groupId);
        if (!group) return null;
        const active = group.querySelector('.azure-capsule.active');
        return active?.dataset?.value;
    },

    async testVoice(voice) {
        if (!this.config.speechKey) return;
        
        const supportedStyles = this.voiceStyles[voice] || ['general'];
        const style = supportedStyles.includes(this.config.style) ? this.config.style : 'general';
        
        try {
            await this.engine.speak({
                text: Lumina.I18n.t('azureTestText'),
                voice: voice,
                style: style,
                rate: 1.0,
                pitch: 0
            });
        } catch (e) {
            console.warn('[AzureTTS] 音色测试失败:', e);
        }
    },

    async testConfig() {
        const keyInput = document.getElementById('azureDialogKey');
        const key = keyInput?.value?.trim();
        
        if (!key) {
            this.showStatus(Lumina.I18n.t('azureEnterKey'), 'error');
            keyInput?.focus();
            return;
        }
        
        this.showStatus(Lumina.I18n.t('azureTesting'), 'info');
        
        const globalRate = Lumina.State?.settings?.ttsRate || 10;
        const globalPitch = Lumina.State?.settings?.ttsPitch || 10;
        const azureRate = Math.max(0.5, Math.min(2.0, globalRate / 10));
        const azurePitch = Math.max(-50, Math.min(50, ((globalPitch - 5) / 15) * 100 - 50));
        
        const testEngine = new Lumina.Plugin.AzureTTS.Engine();
        const initSuccess = testEngine.init(key, this.config.region);
        
        if (!initSuccess) {
            this.showStatus(Lumina.I18n.t('azureTestFailed') + ': SDK 未加载', 'error');
            return;
        }
        
        const supportedStyles = this.voiceStyles[this.config.voice] || ['general'];
        const style = supportedStyles.includes(this.config.style) ? this.config.style : 'general';
        
        const testPromise = testEngine.speak({
            text: Lumina.I18n.t('azureTestText'),
            voice: this.config.voice,
            style: style,
            rate: azureRate,
            pitch: azurePitch
        });
        
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('连接超时')), 10000);
        });
        
        try {
            await Promise.race([testPromise, timeoutPromise]);
            this.showStatus(Lumina.I18n.t('azureTestSuccess'), 'success');
            this.saveCurrentConfig();
        } catch (err) {
            this.showStatus(Lumina.I18n.t('azureTestFailed') + ': ' + err.message, 'error');
        }
    },

    showStatus(message, type) {
        const status = document.getElementById('azureDialogStatus');
        if (!status) return;
        
        status.textContent = message;
        status.className = `azure-status ${type}`;
        status.style.display = 'block';
        
        if (type === 'success' || type === 'error') {
            setTimeout(() => status.style.display = 'none', 3000);
        }
    },

    // ==================== TTS 引擎接口 ====================
    
    // 获取朗读参数（供外部统一使用）
    _getParams() {
        const globalRate = Lumina.State?.settings?.ttsRate || 10;
        const globalPitch = Lumina.State?.settings?.ttsPitch || 10;
        const azureRate = Math.max(0.5, Math.min(2.0, globalRate / 10));
        const azurePitch = Math.max(-50, Math.min(50, ((globalPitch - 5) / 15) * 100 - 50));
        
        const supportedStyles = this.voiceStyles[this.config.voice] || ['general'];
        const style = supportedStyles.includes(this.config.style) ? this.config.style : 'general';
        
        return {
            voice: this.config.voice,
            style,
            rate: azureRate,
            pitch: azurePitch
        };
    },
    
    async speak(options) {
        // console.log('[AzureTTS] speak 被调用:', options.text?.substring(0, 20) + '...');
        
        if (!this.config.enabled || !this.config.speechKey) {
            throw new Error('Azure TTS 未启用');
        }
        
        if (!this.engine.isInitialized) {
            const success = this.engine.init(this.config.speechKey, this.config.region);
            if (!success) throw new Error('初始化失败');
        }
        
        const params = this._getParams();
        
        // 调用 TaskManager 朗读（自动处理缓存命中/未命中）
        await this.taskManager.speak(options.text, params);
    },

    // ==================== 向前看窗口填充 ====================
    // currentIdx: 当前读到第几句（-1表示段落开始，还没读）
    // sentences: 当前段落的所有句子
    // getNextParagraph: 获取下一段的回调函数
    fillWindow(currentIdx, sentences, getNextParagraph) {
        if (!this.config.enabled || !this.config.speechKey) return;
        if (!this.engine?.isInitialized) return;
        if (!this.taskManager) return;
        
        const params = this._getParams();
        this.taskManager.fillWindow(null, currentIdx, sentences, params, getNextParagraph);
    },

    stop() {
        this.engine?.stop();
    },

    pause() {
        this.engine?.pause();
    },

    resume() {
        this.engine?.resume();
    },

    isPlaying() {
        return this.engine?.isPlaying || false;
    },

    getConfig() {
        return { ...this.config };
    },
    
    getCacheStats() {
        return this.taskManager?.getStats();
    }
});

// 自动注册
if (Lumina.PluginManager) {
    Lumina.PluginManager.register(Lumina.Plugin.AzureTTS);
}

// console.log('[AzureTTS] Plugin v2 已加载（支持预加载缓存）');
