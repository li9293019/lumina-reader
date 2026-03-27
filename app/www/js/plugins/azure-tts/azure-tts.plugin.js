// ==================== Azure TTS 插件 ====================

Lumina.Plugin = Lumina.Plugin || {};
Lumina.Plugin.AzureTTS = Lumina.Plugin.AzureTTS || {};

Object.assign(Lumina.Plugin.AzureTTS, {
    name: 'azure-tts',
    version: '1.0.0',
    description: 'Azure 语音服务朗读支持',
    
    engine: null,
    
    // 默认配置
    config: {
        enabled: false,
        speechKey: '',
        region: 'eastasia',
        voice: 'zh-CN-XiaoxiaoNeural',
        style: 'general',
        rate: 1.0,
        pitch: 0
    },
    
    STORAGE_KEY: 'lumina_azure_tts_config',
    
    // 音色支持的风格映射
    voiceStyles: {
        'zh-CN-XiaoxiaoNeural': ['general', 'assistant', 'chat', 'customerservice', 'newscast', 'affectionate', 'angry', 'calm', 'cheerful', 'sad', 'serious'],
        'zh-CN-YunxiNeural': ['general', 'assistant', 'chat', 'customerservice', 'newscast', 'angry', 'cheerful', 'sad', 'serious'],
        'zh-CN-YunjianNeural': ['general'],
        'zh-CN-YunxiaNeural': ['general'], // 少年音只支持通用
        'zh-CN-XiaoyiNeural': ['general'],
        'zh-CN-YunyangNeural': ['general', 'customerservice', 'narration'],
        'zh-CN-XiaochenNeural': ['general'],
        'zh-CN-XiaohanNeural': ['general']
    },

    init() {
        console.log('[AzureTTS Plugin] 初始化...');
        
        this.loadConfig();
        
        // 等待引擎类加载（脚本可能还没执行完）
        let engineAttempts = 0;
        const waitForEngine = () => {
            if (Lumina.Plugin.AzureTTS.Engine) {
                this.engine = new Lumina.Plugin.AzureTTS.Engine();
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
        // 使用轮询等待 DOM 元素出现
        let attempts = 0;
        const waitForDOM = () => {
            const toggle = document.getElementById('azureTtsToggle');
            const dialog = document.getElementById('azureTtsDialog');
            
            if (toggle && dialog) {
                console.log('[AzureTTS] DOM 元素已就绪，开始绑定事件');
                this.bindToggleUI();
                this.bindDialogEvents();
            } else {
                attempts++;
                if (attempts < 50) { // 最多等待 5 秒
                    setTimeout(waitForDOM, 100);
                } else {
                    console.error('[AzureTTS] DOM 元素加载超时');
                }
            }
        };
        
        // 开始轮询
        setTimeout(waitForDOM, 100);
        
        // 延迟初始化引擎
        setTimeout(() => {
            if (this.config.enabled && this.config.speechKey) {
                this.engine.init(this.config.speechKey, this.config.region);
            }
        }, 1000);
        
        console.log('[AzureTTS Plugin] 已就绪（等待 DOM）');
    },

    loadConfig() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                this.config = { ...this.config, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn('[AzureTTS] 加载配置失败:', e);
        }
    },

    saveConfig() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config));
        } catch (e) {
            console.warn('[AzureTTS] 保存配置失败:', e);
        }
    },

    // 绑定设置面板开关
    bindToggleUI() {
        const toggle = document.getElementById('azureTtsToggle');
        const info = document.getElementById('azureTtsInfo');
        
        if (!toggle || !info) {
            console.warn('[AzureTTS] 找不到元素 #azureTtsToggle 或 #azureTtsInfo');
            return;
        }
        
        console.log('[AzureTTS] 绑定开关事件');
        
        // 设置初始状态
        toggle.checked = this.config.enabled;
        
        // 点击左侧信息区域打开对话框
        info.addEventListener('click', () => {
            this.openDialog();
        });
        
        // 开关使用 change 事件
        toggle.addEventListener('change', async () => {
            console.log('[AzureTTS] 开关变化，新状态:', toggle.checked);
            
            if (toggle.checked) {
                // 开启：有配置直接启用，无配置弹出对话框
                if (this.config.speechKey && this.config.speechKey.length > 20) {
                    this.config.enabled = true;
                    this.saveConfig();
                    this.engine.init(this.config.speechKey, this.config.region);
                    Lumina.TTS?.manager?.clearPluginEngine?.();
                    Lumina.UI?.showToast?.(Lumina.I18n.t('azureTTSEnabled'));
                } else {
                    // 无配置，弹出对话框
                    await this.openDialog();
                    // 关闭后检查是否有配置
                    toggle.checked = !!this.config.speechKey;
                }
            } else {
                // 关闭：恢复系统 TTS
                this.config.enabled = false;
                this.saveConfig();
                this.engine.destroy();
                Lumina.TTS?.manager?.clearPluginEngine?.();
                Lumina.UI?.showToast?.(Lumina.I18n.t('azureTTSDisabled'));
            }
        });
    },

    // 打开设置对话框
    openDialog() {
        console.log('[AzureTTS] openDialog 被调用');
        return new Promise((resolve) => {
            const dialog = document.getElementById('azureTtsDialog');
            console.log('[AzureTTS] 对话框元素:', dialog);
            
            if (!dialog) {
                console.error('[AzureTTS] 找不到对话框元素 #azureTtsDialog');
                resolve(false);
                return;
            }
            
            console.log('[AzureTTS] 准备显示对话框');
            this._dialogResolve = resolve;
            
            // 加载当前配置到对话框
            this.loadDialogValues();
            
            // 显示对话框 (使用 about-panel 的 active 类)
            dialog.classList.add('active');
            
            console.log('[AzureTTS] 对话框已显示，classList:', dialog.classList.toString());
            
            // 聚焦到 key 输入框
            setTimeout(() => {
                document.getElementById('azureDialogKey')?.focus();
            }, 100);
        });
    },

    // 关闭对话框
    closeDialog(confirmed = false) {
        const dialog = document.getElementById('azureTtsDialog');
        if (dialog) dialog.classList.remove('active');
        
        // 隐藏状态提示
        const status = document.getElementById('azureDialogStatus');
        if (status) status.style.display = 'none';
        
        if (this._dialogResolve) {
            this._dialogResolve(confirmed);
            this._dialogResolve = null;
        }
    },

    // 加载配置到对话框
    loadDialogValues() {
        // Key
        const keyInput = document.getElementById('azureDialogKey');
        if (keyInput) keyInput.value = this.config.speechKey;
        
        // 区域
        this.updateCapsuleGroup('azureRegionOptions', this.config.region);
        
        // 音色
        this.updateCapsuleGroup('azureVoiceOptions', this.config.voice);
        
        // 风格（根据当前音色过滤可用选项）
        this.updateCapsuleGroup('azureStyleOptions', this.config.style);
        this.updateStyleOptions(this.config.voice);
    },

    // 更新胶囊按钮组的选中状态
    updateCapsuleGroup(groupId, activeValue) {
        const group = document.getElementById(groupId);
        if (!group) return;
        
        group.querySelectorAll('.azure-capsule').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === activeValue);
        });
    },
    
    // 根据音色更新风格选项的可用状态
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
        
        // 如果当前选中的风格不支持，切换到通用
        const currentActive = styleGroup.querySelector('.azure-capsule.active');
        if (currentActive && currentActive.disabled) {
            const generalBtn = styleGroup.querySelector('[data-value="general"]');
            if (generalBtn) {
                styleGroup.querySelectorAll('.azure-capsule').forEach(btn => btn.classList.remove('active'));
                generalBtn.classList.add('active');
                this.saveCurrentConfig();
            }
        }
        
        // 兜底：如果没有选中的风格，选择通用
        if (!styleGroup.querySelector('.azure-capsule.active')) {
            const generalBtn = styleGroup.querySelector('[data-value="general"]');
            if (generalBtn) {
                generalBtn.classList.add('active');
                this.saveCurrentConfig();
            }
        }
    },

    // 更新滑块显示值
    updateSliderValue(slider) {
        const container = slider.closest('.slider-control');
        const display = container?.querySelector('.slider-value');
        if (!display) return;
        
        const divider = parseInt(container.dataset.divider) || 1;
        const unit = container.dataset.unit || '';
        let value = parseFloat(slider.value) / divider;
        
        if (slider.id === 'azureRateSlider') {
            display.textContent = value.toFixed(1) + unit;
        } else {
            const sign = value > 0 ? '+' : '';
            display.textContent = sign + value + unit;
        }
    },

    // 绑定对话框事件
    bindDialogEvents() {
        console.log('[AzureTTS] 绑定对话框事件');
        
        // 关闭按钮
        const closeBtn = document.getElementById('azureTtsDialogClose');
        if (closeBtn) {
            closeBtn.onclick = () => {
                console.log('[AzureTTS] 关闭按钮点击');
                this.closeDialog(true);
            };
        } else {
            console.warn('[AzureTTS] 找不到关闭按钮');
        }
        
        // 点击遮罩关闭
        const dialog = document.getElementById('azureTtsDialog');
        if (dialog) {
            dialog.onclick = (e) => {
                if (e.target === dialog) {
                    console.log('[AzureTTS] 遮罩点击');
                    this.closeDialog(true);
                }
            };
        } else {
            console.warn('[AzureTTS] 找不到对话框');
        }
        
        // ESC 键关闭 - 只绑定一次
        if (!Lumina.Plugin.AzureTTS._escBound) {
            document.onkeydown = (e) => {
                if (e.key === 'Escape') {
                    const dlg = document.getElementById('azureTtsDialog');
                    if (dlg?.classList.contains('active')) {
                        console.log('[AzureTTS] ESC 按下');
                        this.closeDialog(true);
                    }
                }
            };
            Lumina.Plugin.AzureTTS._escBound = true;
        }
        
        // 胶囊按钮点击 - 即点即存
        ['azureRegionOptions', 'azureVoiceOptions', 'azureStyleOptions'].forEach(groupId => {
            const group = document.getElementById(groupId);
            if (!group) {
                console.warn(`[AzureTTS] 找不到胶囊组: ${groupId}`);
                return;
            }
            
            // 为每个胶囊按钮绑定点击事件
            group.querySelectorAll('.azure-capsule').forEach(capsule => {
                capsule.onclick = () => {
                    console.log(`[AzureTTS] 胶囊点击: ${capsule.dataset.value}`);
                    
                    // 更新选中状态
                    group.querySelectorAll('.azure-capsule').forEach(btn => btn.classList.remove('active'));
                    capsule.classList.add('active');
                    
                    // 如果切换了音色，更新风格选项的可用状态
                    if (groupId === 'azureVoiceOptions') {
                        this.updateStyleOptions(capsule.dataset.value);
                    }
                    
                    // 立即保存配置
                    this.saveCurrentConfig();
                };
            });
        });
        
        // 注意：语速和音调现在使用阅读器全局设置 (Lumina.State.settings.ttsRate, ttsPitch)
        
        // Key 输入框 - 失去焦点或按回车时保存
        const keyInput = document.getElementById('azureDialogKey');
        if (keyInput) {
            keyInput.onchange = () => {
                this.saveCurrentConfig();
            };
            keyInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.saveCurrentConfig();
                }
            };
        } else {
            console.warn('[AzureTTS] 找不到 Key 输入框');
        }
        
        // 测试按钮
        const testBtn = document.getElementById('azureDialogTest');
        if (testBtn) {
            testBtn.onclick = () => {
                console.log('[AzureTTS] 测试按钮点击');
                this.testConfig();
            };
        } else {
            console.warn('[AzureTTS] 找不到测试按钮');
        }
    },

    // 保存当前对话框配置（不关闭对话框，不显示 toast）
    saveCurrentConfig() {
        const key = document.getElementById('azureDialogKey')?.value?.trim() || '';
        
        this.config.speechKey = key;
        this.config.region = this.getActiveCapsuleValue('azureRegionOptions') || 'eastasia';
        this.config.voice = this.getActiveCapsuleValue('azureVoiceOptions') || 'zh-CN-XiaoxiaoNeural';
        this.config.style = this.getActiveCapsuleValue('azureStyleOptions') || 'general';
        
        // 如果 key 存在且长度正确，启用引擎但不显示 toast
        if (key && key.length > 20) {
            this.config.enabled = true;
            this.saveConfig();
            this.engine.init(key, this.config.region);
        } else {
            this.saveConfig();
        }
    },

    // 获取胶囊按钮组中选中的值
    getActiveCapsuleValue(groupId) {
        const group = document.getElementById(groupId);
        if (!group) return null;
        
        const active = group.querySelector('.azure-capsule.active');
        return active?.dataset?.value;
    },

    // 快速测试音色
    async testVoice(voice) {
        if (!this.config.speechKey) return;
        
        // 检查当前风格是否支持，不支持则使用通用
        const supportedStyles = this.voiceStyles[voice] || ['general'];
        const style = supportedStyles.includes(this.config.style) ? this.config.style : 'general';
        
        try {
            // 使用当前引擎直接朗读
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

    // 测试配置
    async testConfig() {
        const keyInput = document.getElementById('azureDialogKey');
        const key = keyInput?.value?.trim();
        
        if (!key) {
            this.showStatus(Lumina.I18n.t('azureEnterKey'), 'error');
            keyInput?.focus();
            return;
        }
        
        this.showStatus(Lumina.I18n.t('azureTesting'), 'info');
        
        // 使用阅读器全局设置
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
        
        // 检查当前风格是否支持，不支持则使用通用
        const supportedStyles = this.voiceStyles[this.config.voice] || ['general'];
        const style = supportedStyles.includes(this.config.style) ? this.config.style : 'general';
        
        // 使用 Promise.race 添加超时检测
        const testPromise = testEngine.speak({
            text: Lumina.I18n.t('azureTestText'),
            voice: this.config.voice,
            style: style,
            rate: azureRate,
            pitch: azurePitch
        });
        
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('连接超时，请检查网络和 Key')), 10000);
        });
        
        try {
            await Promise.race([testPromise, timeoutPromise]);
            this.showStatus(Lumina.I18n.t('azureTestSuccess'), 'success');
            this.saveCurrentConfig();
        } catch (err) {
            this.showStatus(Lumina.I18n.t('azureTestFailed') + ': ' + err.message, 'error');
        }
    },

    // 显示状态
    showStatus(message, type) {
        const status = document.getElementById('azureDialogStatus');
        if (!status) return;
        
        status.textContent = message;
        status.className = `azure-status ${type}`;
        status.style.display = 'block';
        
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                status.style.display = 'none';
            }, 3000);
        }
    },

    // ==================== TTS 引擎接口 ====================
    
    async speak(options) {
        console.log('[AzureTTS] speak 被调用:', options.text?.substring(0, 20) + '...');
        
        if (!this.config.enabled || !this.config.speechKey) {
            console.error('[AzureTTS] 未启用或未配置');
            throw new Error('Azure TTS 未启用');
        }
        
        if (!this.engine.isInitialized) {
            console.log('[AzureTTS] 引擎未初始化，尝试初始化');
            const success = this.engine.init(this.config.speechKey, this.config.region);
            if (!success) {
                console.error('[AzureTTS] 引擎初始化失败');
                throw new Error('初始化失败');
            }
        }
        
        // 使用阅读器全局设置中的语速和音调
        const globalRate = Lumina.State?.settings?.ttsRate || 10;
        const globalPitch = Lumina.State?.settings?.ttsPitch || 10;
        
        // 转换为 Azure 格式
        const azureRate = Math.max(0.5, Math.min(2.0, globalRate / 10));
        const azurePitch = Math.max(-50, Math.min(50, ((globalPitch - 5) / 15) * 100 - 50));
        
        console.log('[AzureTTS] 调用引擎 speak:', { voice: this.config.voice, rate: azureRate, pitch: azurePitch });
        
        // 检查当前风格是否支持，不支持则使用通用
        const supportedStyles = this.voiceStyles[this.config.voice] || ['general'];
        const style = supportedStyles.includes(this.config.style) ? this.config.style : 'general';
        if (style !== this.config.style) {
            console.log('[AzureTTS] 风格不支持，使用通用风格:', style);
        }
        
        return this.engine.speak({
            text: options.text,
            voice: this.config.voice,
            style: style,
            rate: azureRate,
            pitch: azurePitch,
            volume: (options.volume ?? 1.0) * 100,
            useCache: options.useCache !== false  // 默认使用缓存
        });
    },

    // 预加载音频（后台静默合成）
    preload(options) {
        if (!this.config.enabled || !this.config.speechKey || !this.engine?.isInitialized) {
            return;
        }
        
        // 听书模式不预加载
        if (options.useCache === false) return;
        
        const supportedStyles = this.voiceStyles[this.config.voice] || ['general'];
        const style = supportedStyles.includes(this.config.style) ? this.config.style : 'general';
        
        // 异步预加载，不阻塞
        this.engine.preload({
            text: options.text,
            voice: this.config.voice,
            style: style
        });
    },

    // 检查文本是否在缓存中
    isCached(text) {
        if (!this.engine) return false;
        const supportedStyles = this.voiceStyles[this.config.voice] || ['general'];
        const style = supportedStyles.includes(this.config.style) ? this.config.style : 'general';
        return this.engine.isInCache(text, this.config.voice, style);
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
        return this.engine?.getPlayingState() || false;
    },

    getConfig() {
        return { ...this.config };
    }
});

// 自动注册
if (Lumina.PluginManager) {
    Lumina.PluginManager.register(Lumina.Plugin.AzureTTS);
}

// 全局调试接口
window.testAzureTTS = () => {
    const plugin = Lumina.Plugin?.AzureTTS;
    if (!plugin) {
        console.error('[AzureTTS] 插件未加载');
        return;
    }
    console.log('[AzureTTS] 当前配置:', plugin.getConfig());
    console.log('[AzureTTS] 引擎状态:', plugin.engine?.isInitialized);
    plugin.openDialog();
};

console.log('[AzureTTS] Plugin 已加载');
