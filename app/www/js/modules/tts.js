// ==================== 12. 语音朗读模块 ====================

Lumina.TTS.Manager = class {
    constructor() {
        this.synth = window.speechSynthesis;
        this.utterance = null;
        this.isPlaying = false;
        this.currentItemIndex = 0;
        this.currentChapterIndex = 0;
        this.voices = [];
        this.settings = { voiceURI: '', rate: 1.0, pitch: 1.0, volume: 1.0 };
        this.currentFileKey = null;
        this.currentSentences = [];
        this.currentSentenceIndex = 0;
        this.sentenceElements = [];
        this.currentParagraphEl = null;
        this._progressTimer = null;
        this.supportsBoundary = false;
        this.boundaryDetectedThisUtterance = false; 
        this.isApp = false;
        this.nativeTTS = null;
        
        // 页面听书模式
        this.isPageMode = false; // true=页面模式，false=段落模式
        this._longPressTimer = null;
        this._isLongPress = false;
    }

    async init() {
        // 检测是否在 APP 环境
        if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
            this.isApp = true;
            // 优先检查增强版插件
            if (Capacitor.Plugins && Capacitor.Plugins.TTSEnhanced) {
                this.nativeTTS = Capacitor.Plugins.TTSEnhanced;
                this.useEnhancedTTS = true;
                console.log('[TTS] 使用增强版 TTS 插件 (TTSEnhanced)');
            } else if (Capacitor.Plugins && Capacitor.Plugins.TextToSpeech) {
                // 回退到标准插件
                this.nativeTTS = Capacitor.Plugins.TextToSpeech;
                this.useEnhancedTTS = false;
                console.log('[TTS] 使用标准原生 TTS 插件');
            } else {
                console.warn('[TTS] 原生 TTS 插件未找到');
                this.isApp = false;
            }
        }
        
        // 如果不在 APP 环境或原生插件不可用，使用 Web Speech API
        if (!this.isApp && !this.synth) {
            console.warn('浏览器不支持语音合成');
            return false;
        }

        this.loadSavedSettings();
        await this.loadVoices();

        if (!this.isApp && speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => this.loadVoices();
        }

        // 设置 TTS 按钮交互：短按=段落模式，长按=页面听书模式
        this.setupTTSToggleButton();
        window.addEventListener('beforeunload', () => this.stop());
        this.startFileChangeMonitor();
        
        // 监听原生层保活广播（防止后台 WebView 休眠）
        this.setupKeepAliveListener();
        
        return true;
    }
    
    // 设置 TTS 按钮交互：短按=段落模式，长按=页面听书模式
    setupTTSToggleButton() {
        const btn = document.getElementById('ttsToggle');
        if (!btn) return;
        
        // 移除旧的点击事件
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        // 检测是否是移动设备
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        if (isTouchDevice) {
            // 移动设备：只使用触摸事件
            newBtn.addEventListener('touchstart', (e) => this.handleTTSPressStart(e), { passive: false });
            newBtn.addEventListener('touchend', (e) => this.handleTTSPressEnd(e));
            newBtn.addEventListener('touchcancel', () => this.handleTTSPressCancel());
        } else {
            // 桌面设备：使用鼠标事件
            newBtn.addEventListener('mousedown', (e) => this.handleTTSPressStart(e));
            newBtn.addEventListener('mouseup', (e) => this.handleTTSPressEnd(e));
            newBtn.addEventListener('mouseleave', () => this.handleTTSPressCancel());
        }
    }
    
    handleTTSPressStart(e) {
        // 防止默认行为和冒泡（避免触发内容区域的长按事件）
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        
        // 如果已经有定时器在运行，先清除
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
        }
        
        // 标记为按下状态
        this._isPressed = true;
        this._longPressTriggered = false;
        
        // 启动长按检测
        this._longPressTimer = setTimeout(() => {
            if (this._isPressed) {
                this._longPressTriggered = true;
                // 长按触发：切换听书模式
                this.togglePageMode();
            }
        }, 600); // 600ms 作为长按阈值
    }
    
    handleTTSPressEnd(e) {
        // 清除长按定时器
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
        
        // 如果长按已触发，不执行短按操作
        if (this._longPressTriggered) {
            this._isPressed = false;
            return;
        }
        
        // 短按触发：切换段落模式
        this._isPressed = false;
        this.toggleParagraphMode();
    }
    
    handleTTSPressCancel() {
        // 取消按压
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
        this._isPressed = false;
        this._longPressTriggered = false;
    }
    
    // 短按：未播放时启动段落模式，播放中时停止
    toggleParagraphMode() {
        if (this.isPlaying) {
            // 播放中：停止
            this.stop();
        } else {
            // 未播放：启动段落模式
            this.isPageMode = false;
            this.start();
        }
    }
    
    // 启动段落模式（修复：确保更新 UI）
    start() {
        if (!Lumina.State.app.document.items.length) return;

        const state = Lumina.State.app;
        const selectionInfo = this.getSelectionInfo();

        // 停止当前朗读并重置状态
        if (this.synth) this.synth.cancel();
        this.clearAllHighlights();
        
        // 关键修复：重置为 undefined（未知状态）
        this.supportsBoundary = undefined;
        this.boundaryDetectedThisUtterance = false;
        
        // 启动后台服务
        const bookTitle = state.currentFile?.name || '正在朗读...';
        this.setBackgroundService(true, bookTitle);

        if (selectionInfo) {
            this.currentItemIndex = selectionInfo.paragraphIndex;
            this.currentSentenceIndex = selectionInfo.sentenceIndex;
            
            const targetEl = document.querySelector(`.doc-line[data-index="${this.currentItemIndex}"]`);
            
            if (targetEl) {
                this.currentFileKey = state.currentFile?.fileKey;
                this.isPlaying = true;
                this.updateUI();
                
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                setTimeout(() => this.speakCurrent(), 100);
                return;
            }
            
            // 需要翻页逻辑
            for (let i = 0; i < state.chapters.length; i++) {
                const ch = state.chapters[i];
                if (this.currentItemIndex >= ch.startIndex && this.currentItemIndex <= ch.endIndex) {
                    state.currentChapterIndex = i;
                    if (!ch.pageRanges) {
                        ch.pageRanges = Lumina.Pagination.calculateRanges(ch.items);
                    }
                    const relativeIdx = this.currentItemIndex - ch.startIndex;
                    state.currentPageIdx = Lumina.Pagination.findPageIndex(ch.pageRanges, relativeIdx);
                    break;
                }
            }
            
            Lumina.Renderer.renderCurrentChapter(this.currentItemIndex);
            
            this.currentFileKey = state.currentFile?.fileKey;
            this.isPlaying = true;
            this.updateUI();
            
            setTimeout(() => {
                const targetEl = document.querySelector(`.doc-line[data-index="${this.currentItemIndex}"]`);
                if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => this.speakCurrent(), 200);
            }, 300);
            
        } else {
            this.currentItemIndex = Lumina.Renderer.getCurrentVisibleIndex();
            this.currentSentenceIndex = 0;
            
            const ch = state.chapters[state.currentChapterIndex];
            if (ch && ch.pageRanges) {
                const relIdx = this.currentItemIndex - ch.startIndex;
                const targetPage = Lumina.Pagination.findPageIndex(ch.pageRanges, relIdx);
                if (targetPage !== state.currentPageIdx) {
                    state.currentPageIdx = targetPage;
                    Lumina.Renderer.renderCurrentChapter(this.currentItemIndex);
                }
            }
            
            this.currentFileKey = state.currentFile?.fileKey;
            this.isPlaying = true;
            this.updateUI();
            setTimeout(() => this.speakCurrent(), 100);
        }
    }
    
    // 切换页面听书模式（长按）
    // 长按：未播放时启动页面模式，播放中时停止
    togglePageMode() {
        if (this.isPlaying) {
            // 播放中：停止
            this.stop();
        } else {
            // 未播放：启动页面模式
            this.isPageMode = true;
            this.startPageMode();
        }
    }
    
    // 启动页面模式
    startPageMode() {
        if (!Lumina.State.app.document.items.length) return;
        
        const state = Lumina.State.app;
        const bookTitle = state.currentFile?.name || '正在朗读...';
        
        // 启动后台服务
        this.setBackgroundService(true, bookTitle);
        this.startServiceKeepAlive();
        
        // 设置状态
        this.currentFileKey = state.currentFile?.fileKey;
        this.isPlaying = true;
        this.updateUI();
        
        // 显示提示
        const hintText = Lumina.I18n.t('enterPageMode');
        Lumina.UI.showToast(hintText);
        
        // 朗读提示词（用户需要听到反馈）
        this.speakHintAndStartPage(hintText);
    }
    
    // 朗读提示词后开始页面朗读
    async speakHintAndStartPage(hintText) {
        try {
            if (this.isApp && this.nativeTTS) {
                // APP 环境朗读提示词
                await this.nativeTTS.speak({
                    text: hintText,
                    lang: 'zh-CN',
                    rate: this.settings.rate,
                    pitch: this.settings.pitch,
                    volume: this.settings.volume,
                    category: 'playback'
                });
            } else if (this.synth) {
                // Web 环境朗读提示词
                const hintUtterance = new SpeechSynthesisUtterance(hintText);
                hintUtterance.lang = 'zh-CN';
                hintUtterance.rate = this.settings.rate;
                hintUtterance.pitch = this.settings.pitch;
                hintUtterance.volume = this.settings.volume;
                await new Promise(resolve => {
                    hintUtterance.onend = resolve;
                    this.synth.speak(hintUtterance);
                });
            }
        } catch (e) {
            console.log('[TTS] 提示词朗读失败:', e);
        }
        // 开始朗读页面内容
        this.speakCurrentPage();
    }
    
    setupKeepAliveListener() {
        // 仅 APP 环境
        if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform?.()) return;
        
        // 使用 Capacitor 插件监听广播
        try {
            // 注册广播接收器（通过自定义插件或定期检查）
            setInterval(() => {
                if (this.isPlaying && this.synth) {
                    // 定期唤醒 speechSynthesis，防止被系统暂停
                    if (this.synth.paused) {
                        console.log('[TTS] 检测到合成器暂停，尝试恢复');
                        this.synth.resume();
                    }
                    // 关键：如果正在播放但不在朗读状态（可能被系统卡住了），强制继续
                    if (this.isPlaying && !this.synth.speaking && !this.synth.pending) {
                        const now = Date.now();
                        if (this._lastSpeakTime && now - this._lastSpeakTime > 5000) {
                            console.log('[TTS] 检测到朗读卡住，强制继续');
                            this._lastSpeakTime = now;
                            Promise.resolve().then(() => this.speakCurrent());
                        }
                    }
                }
            }, 2000);
        } catch (e) {
            console.warn('[TTS] 保活监听设置失败:', e);
        }
    }
    
    // 启动前台服务保活（解决熄屏问题）
    startServiceKeepAlive() {
        if (!this.isApp) return;
        
        // 启动前台服务
        this.updateTTSBackground('start');
        
        // 每 5 秒更新一次前台服务状态，防止系统优化
        this._serviceKeepAliveInterval = setInterval(() => {
            if (this.isPlaying) {
                this.updateTTSBackground('update');
            }
        }, 5000);
    }
    
    // 停止前台服务保活
    stopServiceKeepAlive() {
        if (!this.isApp) return;
        
        if (this._serviceKeepAliveInterval) {
            clearInterval(this._serviceKeepAliveInterval);
            this._serviceKeepAliveInterval = null;
        }
        
        this.updateTTSBackground('stop');
    }
    
    // 调用后台服务插件
    async updateTTSBackground(action) {
        if (!this.isApp || typeof Capacitor === 'undefined') return;
        
        try {
            const TTSBackground = Capacitor.Plugins.TTSBackground;
            if (!TTSBackground) return;
            
            const currentFile = Lumina.State.app.currentFile;
            const title = currentFile ? currentFile.fileName : '正在朗读...';
            
            switch (action) {
                case 'start':
                    await TTSBackground.startService();
                    await TTSBackground.updatePlaying({ isPlaying: true, title });
                    break;
                case 'update':
                    await TTSBackground.updatePlaying({ isPlaying: true, title });
                    break;
                case 'stop':
                    await TTSBackground.updatePlaying({ isPlaying: false, title: '' });
                    await TTSBackground.stopService();
                    break;
            }
        } catch (e) {
            console.warn('[TTS] 后台服务调用失败:', e);
        }
    }

    startFileChangeMonitor() {
        setInterval(() => {
            const currentKey = Lumina.State.app.currentFile?.fileKey;
            if (this.isPlaying && currentKey && this.currentFileKey && currentKey !== this.currentFileKey) {
                console.log('检测到文件切换，停止朗读');
                this.stop();
            }
            this.currentFileKey = currentKey;
        }, 500);
    }

    async loadVoices() {
        if (this.isApp && this.nativeTTS) {
            // APP 环境：获取原生 TTS 音色
            try {
                const result = await this.nativeTTS.getSupportedVoices();
                // 保存原始列表（与原生插件同样按 name 排序）
                const rawVoices = result.voices || [];
                this._rawVoiceList = [...rawVoices].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                console.log('[TTS] 原生音色列表（按name排序）:', this._rawVoiceList.map((v, i) => `${i}:${v.name}/${v.voiceURI}`));
                
                this.voices = rawVoices;
                // 优先选择中文音色（仅影响显示，不影响索引映射）
                const zhVoices = this.voices.filter(v => v.lang && v.lang.startsWith('zh'));
                if (zhVoices.length > 0) {
                    this.voices = zhVoices.concat(this.voices.filter(v => !v.lang || !v.lang.startsWith('zh')));
                }
            } catch (e) {
                console.error('[TTS] 获取原生音色失败:', e);
                this.voices = [];
            }
        } else {
            // Web 环境：使用 Web Speech API
            if (!this.synth) return;
            const allVoices = this.synth.getVoices();

            this.edgeVoices = allVoices.filter(v =>
                v.name.includes('Microsoft') &&
                (v.lang.startsWith('zh') || v.lang.startsWith('en'))
            );

            const priorityVoices = ['Yunxia', 'Yunjian', 'Xiaoyi', 'Xiaoxiao', 'Yunxi', 'Yunyang'];
            this.edgeVoices.sort((a, b) => {
                const aIdx = priorityVoices.findIndex(p => a.name.includes(p));
                const bIdx = priorityVoices.findIndex(p => b.name.includes(p));
                return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
            });

            this.voices = this.edgeVoices.length > 0 ? this.edgeVoices : allVoices.filter(v => v.lang.startsWith('zh') || v.lang.startsWith('en'));
        }

        this.populateVoiceSelector();

        if ((!this.settings.voiceURI && this.voices.length > 0) || (this.isApp && this.voices.length > 0)) {
            // APP 环境使用索引，Web 环境使用 voiceURI
            this.settings.voiceIndex = 0;
            this.settings.voiceURI = this.voices[0].voiceURI;
            this.saveSettings();
        }
    }

    populateVoiceSelector() {
        const container = document.getElementById('ttsVoiceOptions');
        if (!container || this.voices.length === 0) return;

        const displayVoices = this.voices.slice(0, 8);

        container.innerHTML = displayVoices.map((v, index) => {
            const isActive = this.isApp ? index === this.settings.voiceIndex : v.voiceURI === this.settings.voiceURI;
            const displayName = v.name.replace(/Microsoft|Google|Apple|Android/g, '').trim().split(/\s+/)[0] || v.name;
            return `
        <button class="option-btn voice-btn ${isActive ? 'active' : ''}" data-voice="${v.voiceURI}" data-index="${index}">
        <span class="voice-name">${displayName}</span>
        <span class="voice-lang">${v.lang || 'zh-CN'}</span>
        </button>
    `;
        }).join('');

        container.querySelectorAll('.voice-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.voice-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (this.isApp) {
                    this.settings.voiceIndex = parseInt(btn.dataset.index);
                    this.settings.voiceURI = btn.dataset.voice;
                    this.saveSettings();
                } else {
                    this.updateSettings('voice', btn.dataset.voice);
                }
            });
        });
    }

    splitIntoSentences(text) {
        if (!text) return [];
        
        // 保护特殊标记：引号、括号内的内容暂不分割
        const placeholders = [];
        let protectedText = text
            // 保护 "..." 和 "……" 避免被误分割
            .replace(/\.{3,}|…{1,2}/g, (match) => {
                placeholders.push(match);
                return `\u0000${placeholders.length - 1}\u0000`;
            })
            // 保护引号内内容（简单实现）
            .replace(/"[^"]*"/g, (match) => {
                placeholders.push(match);
                return `\u0000${placeholders.length - 1}\u0000`;
            });

        // 分句正则：支持中英文标点，避免在缩写词（如 Mr. Dr.）处断开
        const sentenceRegex = /[^.!?。！？]+[.!?。！？]+/g;
        let matches = protectedText.match(sentenceRegex) || [];
        
        // 处理剩余文本（无标点结尾）
        const lastMatch = matches[matches.length - 1] || '';
        const lastIndex = protectedText.lastIndexOf(lastMatch) + lastMatch.length;
        const remainder = protectedText.slice(lastIndex).trim();
        
        if (remainder) {
            matches.push(remainder);
        }
        
        // 还原占位符
        matches = matches.map(s => 
            s.replace(/\u0000(\d+)\u0000/g, (m, i) => placeholders[parseInt(i)] || m)
        );
        
        // 过滤空句并合并过短句子（少于5个字符的与下一句合并）
        const result = [];
        let buffer = '';
        
        for (let sentence of matches) {
            sentence = sentence.trim();
            if (!sentence) continue;
            
            if (buffer) {
                sentence = buffer + sentence;
                buffer = '';
            }
            
            // 如果句子太短（少于5个字符）且不以标点结尾，缓存等待下一句
            if (sentence.length < 5 && !/[.!?。！？]$/.test(sentence)) {
                buffer = sentence;
                continue;
            }
            
            result.push(sentence);
        }
        
        if (buffer) result.push(buffer);
        return result.length > 0 ? result : [text];
    }

    getSelectionInfo() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

        const range = selection.getRangeAt(0);
        let container = range.startContainer;
        if (container.nodeType === Node.TEXT_NODE) container = container.parentElement;

        const docLine = container.closest('.doc-line[data-index]');
        if (!docLine) return null;

        const paragraphIndex = parseInt(docLine.dataset.index);
        const fullText = docLine.textContent || '';
        let textOffset = 0;

        const treeWalker = document.createTreeWalker(docLine, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = treeWalker.nextNode()) {
            if (node === range.startContainer) {
                textOffset += range.startOffset;
                break;
            } else {
                textOffset += node.textContent.length;
            }
        }

        const sentences = this.splitIntoSentences(fullText);
        let accumulated = 0, sentenceIndex = 0;
        for (let i = 0; i < sentences.length; i++) {
            accumulated += sentences[i].length;
            if (textOffset < accumulated) {
                sentenceIndex = i;
                break;
            }
            sentenceIndex = i;
        }

        selection.removeAllRanges();
        return { paragraphIndex, sentenceIndex };
    }

    clearSentenceHighlightsOnly() {
        this.sentenceElements.forEach(span => {
            if (span.parentNode) {
                const parent = span.parentNode;
                while (span.firstChild) parent.insertBefore(span.firstChild, span);
                parent.removeChild(span);
                parent.normalize();
            }
        });
        this.sentenceElements = [];
    }

    clearAllHighlights() {
        this.clearSentenceHighlightsOnly();
        document.querySelectorAll('.tts-highlight').forEach(el => 
            el.classList.remove('tts-highlight')
        );
    }

    toggle() {
        if (this.isPlaying) {
            this.stop();
        } else if (this.isPageMode) {
            this.speakCurrentPage();
        } else {
            this.start();
        }
    }

    // 控制后台服务
    async setBackgroundService(enable, title) {
        if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform?.()) return;
        
        try {
            const TTSBackground = Capacitor.Plugins.TTSBackground;
            if (!TTSBackground) return;
            
            if (enable) {
                // 首次启动时检查电池优化白名单
                await this.checkBatteryOptimization();
                await TTSBackground.startService();
                // 延迟更新播放状态，确保服务已启动
                setTimeout(async () => {
                    await TTSBackground.updatePlaying({ 
                        isPlaying: true, 
                        title: title || '正在朗读...' 
                    });
                    console.log('[TTS] 后台状态已更新');
                }, 500);
                console.log('[TTS] 后台服务已启动');
            } else {
                await TTSBackground.stopService();
                console.log('[TTS] 后台服务已停止');
            }
        } catch (e) {
            console.warn('[TTS] 后台服务控制失败:', e);
        }
    }
    
    // 更新后台服务播放状态（用于暂停/继续）
    async updateBackgroundState(isPlaying, title) {
        if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform?.()) return;
        
        try {
            const TTSBackground = Capacitor.Plugins.TTSBackground;
            if (TTSBackground?.updatePlaying) {
                await TTSBackground.updatePlaying({ 
                    isPlaying: isPlaying, 
                    title: title || '正在朗读...' 
                });
            }
        } catch (e) {
            console.warn('[TTS] 更新后台状态失败:', e);
        }
    }
    
    // 检查并请求电池优化白名单（熄屏播放必需）
    async checkBatteryOptimization() {
        if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform?.()) return;
        
        try {
            const TTSBackground = Capacitor.Plugins.TTSBackground;
            if (!TTSBackground) return;
            
            const result = await TTSBackground.checkBatteryOptimization();
            console.log('[TTS] 电池优化检查:', result);
            
            if (result.needRequest && !this.batteryOptimizationRequested) {
                this.batteryOptimizationRequested = true;
                // 显示提示
                Lumina.UI.showToast('需要电池优化权限以保证熄屏播放', 5000);
                // 延迟后请求
                setTimeout(() => {
                    TTSBackground.requestBatteryOptimization().catch(() => {});
                }, 2000);
            }
        } catch (e) {
            console.warn('[TTS] 电池优化检查失败:', e);
        }
    }

    start() {
        if (!Lumina.State.app.document.items.length) return;

        const state = Lumina.State.app;
        const selectionInfo = this.getSelectionInfo();

        // 停止当前朗读并重置状态
        if (this.synth) this.synth.cancel();
        this.clearAllHighlights();
        
        // 🔴 关键修复：重置为 undefined（未知状态），不是 false！
        // false 会导致立即应用段落高亮，造成闪烁
        this.supportsBoundary = undefined;
        this.boundaryDetectedThisUtterance = false;
        
        // 启动后台服务（熄屏播放）
        const bookTitle = Lumina.State.app.currentFile?.name || '正在朗读...';
        this.setBackgroundService(true, bookTitle);

        if (selectionInfo) {
            this.currentItemIndex = selectionInfo.paragraphIndex;
            this.currentSentenceIndex = selectionInfo.sentenceIndex;
            
            const targetEl = document.querySelector(`.doc-line[data-index="${this.currentItemIndex}"]`);
            
            if (targetEl) {
                this.currentFileKey = state.currentFile?.fileKey;
                this.isPlaying = true;
                this.updateUI();
                
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                setTimeout(() => this.speakCurrent(), 100);
                return;
            }
            
            // 需要翻页逻辑...
            for (let i = 0; i < state.chapters.length; i++) {
                const ch = state.chapters[i];
                if (this.currentItemIndex >= ch.startIndex && this.currentItemIndex <= ch.endIndex) {
                    state.currentChapterIndex = i;
                    if (!ch.pageRanges) {
                        ch.pageRanges = Lumina.Pagination.calculateRanges(ch.items);
                    }
                    const relativeIdx = this.currentItemIndex - ch.startIndex;
                    state.currentPageIdx = Lumina.Pagination.findPageIndex(ch.pageRanges, relativeIdx);
                    break;
                }
            }
            
            Lumina.Renderer.renderCurrentChapter(this.currentItemIndex);
            this.currentFileKey = state.currentFile?.fileKey;
            this.isPlaying = true;
            this.updateUI();
            setTimeout(() => this.speakCurrent(), 200);
            
        } else {
            this.currentItemIndex = Lumina.Renderer.getCurrentVisibleIndex();
            this.currentSentenceIndex = 0;
            
            const ch = state.chapters[state.currentChapterIndex];
            if (ch && ch.pageRanges) {
                const relIdx = this.currentItemIndex - ch.startIndex;
                const targetPage = Lumina.Pagination.findPageIndex(ch.pageRanges, relIdx);
                if (targetPage !== state.currentPageIdx) {
                    state.currentPageIdx = targetPage;
                    Lumina.Renderer.renderCurrentChapter(this.currentItemIndex);
                }
            }
            
            this.currentFileKey = state.currentFile?.fileKey;
            this.isPlaying = true;
            this.updateUI();
            setTimeout(() => this.speakCurrent(), 100);
        }
    }

    stop() {
        this.isPlaying = false;
        // 停止后重置为一般模式（段落模式）
        this.isPageMode = false;
        
        if (this.synth) this.synth.cancel();
        // APP 环境停止原生 TTS
        if (this.isApp && this.nativeTTS) {
            this.nativeTTS.stop().catch(() => {});
        }
        this.clearAllHighlights();
        this.updateUI();
        this.currentSentences = [];
        this.currentSentenceIndex = 0;
        this.currentHighlightIndex = -1;
        
        // 重置边界检测状态
        this.supportsBoundary = false;
        this.boundaryDetectedThisUtterance = false;
        
        // 停止后台服务
        this.setBackgroundService(false);
        this.updateBackgroundState(false, '已暂停');
        this.stopServiceKeepAlive();
        
        window.getSelection().removeAllRanges();
    }

    restartIfPlaying() {
        if (this.isPlaying) {
            const savedItemIndex = this.currentItemIndex;
            const savedSentenceIndex = this.currentSentenceIndex;
            const savedChapter = this.currentChapterIndex;

            if (this.synth) this.synth.cancel();
            this.clearAllHighlights();

            setTimeout(() => {
                this.currentItemIndex = savedItemIndex;
                this.currentSentenceIndex = savedSentenceIndex;
                this.currentChapterIndex = savedChapter;
                if (this.isPageMode) {
                    this.speakCurrentPage();
                } else {
                    this.speakCurrent();
                }
            }, 50);
        }
    }

    /**
     * 提取单个 item 的纯文本内容（支持标准和 Markdown 元素）
     * @param {Object} item - 文档元素
     * @returns {string} - 纯文本
     */
    /**
     * 从 inlineContent 提取纯文本（去除 Markdown 标记）
     * @param {Array} inlineContent - 行内元素数组
     * @returns {string} - 纯文本
     */
    extractTextFromInline(inlineContent) {
        if (!inlineContent || !Array.isArray(inlineContent)) return '';
        
        return inlineContent.map(item => {
            switch (item.type) {
                case 'text':
                case 'strong':  // 粗体
                case 'em':      // 斜体
                case 'del':     // 删除线
                case 'code':    // 行内代码
                    return item.content || '';
                case 'link':    // 链接
                    return item.content || item.href || '';
                case 'image':   // 图片
                    return item.alt || '';
                default:
                    return item.content || item.text || '';
            }
        }).join('');
    }

    /**
     * 清理 Markdown 格式标记（备用方法）
     * @param {string} text - 带 Markdown 标记的文本
     * @returns {string} - 清理后的文本
     */
    cleanMarkdownMarks(text) {
        if (!text) return '';
        return text
            // 粗体 **text** __text__
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            // 斜体 *text* _text_
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/_([^_]+)_/g, '$1')
            // 删除线 ~~text~~
            .replace(/~~([^~]+)~~/g, '$1')
            // 行内代码 `code`
            .replace(/`([^`]+)`/g, '$1')
            // 链接 [text](url)
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // 图片 ![alt](url)
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
            // 多余空格
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * 提取单个 item 的纯文本内容（支持标准和 Markdown 元素）
     * @param {Object} item - 文档元素
     * @returns {string} - 纯文本
     */
    extractItemText(item) {
        if (!item) return '';
        
        // 图片、分隔线无需朗读
        if (item.type === 'image' || item.type === 'hr') return '';
        
        // 优先使用 inlineContent 提取纯文本（无 Markdown 标记）
        if (item.inlineContent && Array.isArray(item.inlineContent)) {
            return this.extractTextFromInline(item.inlineContent);
        }
        
        // 段落和普通文本（清理可能的 Markdown 标记）
        if (item.type === 'paragraph' || item.type === 'text') {
            return this.cleanMarkdownMarks(item.text) || '';
        }
        
        // 标题（含 heading1-6、title、subtitle）
        if (item.type && (item.type.startsWith('heading') || item.type === 'title' || item.type === 'subtitle')) {
            if (item.display) return item.display;
            if (item.text) return this.cleanMarkdownMarks(item.text);
        }
        
        // 代码块
        if (item.type === 'codeblock') {
            const lang = item.language ? `（${item.language}代码）` : '（代码块）';
            return lang + (item.text || '');
        }
        
        // 引用块
        if (item.type === 'blockquote') {
            // 有 items 属性（嵌套解析结果），递归提取
            if (item.items && Array.isArray(item.items)) {
                return item.items.map(subItem => this.extractItemText(subItem)).join('。');
            }
            // 优先使用 inlineContent，否则清理 text
            if (item.inlineContent) {
                return this.extractTextFromInline(item.inlineContent);
            }
            return this.cleanMarkdownMarks(item.text) || '';
        }
        
        // 列表
        if (item.type === 'list') {
            const listTexts = [];
            if (item.items && Array.isArray(item.items)) {
                item.items.forEach((listItem, index) => {
                    let prefix = item.ordered ? `${item.start + index}. ` : '• ';
                    // 优先使用 inlineContent 提取纯文本
                    let text = listItem.inlineContent 
                        ? this.extractTextFromInline(listItem.inlineContent)
                        : this.cleanMarkdownMarks(listItem.text) || '';
                    // 处理嵌套列表
                    if (listItem.items && Array.isArray(listItem.items)) {
                        const nestedText = listItem.items.map(subItem => this.extractItemText(subItem)).join('。');
                        text = text + '。' + nestedText;
                    }
                    listTexts.push(prefix + text);
                });
            }
            return listTexts.join('。');
        }
        
        // 表格
        if (item.type === 'table') {
            const tableTexts = [];
            // 表头（使用 inlineContent 提取）
            if (item.headers && Array.isArray(item.headers)) {
                const headerTexts = item.headers.map(h => {
                    if (h.inlineContent) {
                        return this.extractTextFromInline(h.inlineContent);
                    }
                    return this.cleanMarkdownMarks(h.text) || '';
                }).join('，');
                if (headerTexts) tableTexts.push('表头：' + headerTexts);
            }
            // 表格数据
            if (item.rows && Array.isArray(item.rows)) {
                item.rows.forEach((row, rowIndex) => {
                    if (Array.isArray(row)) {
                        const rowTexts = row.map(cell => {
                            if (cell.inlineContent) {
                                return this.extractTextFromInline(cell.inlineContent);
                            }
                            return this.cleanMarkdownMarks(cell.text) || '';
                        }).join('，');
                        if (rowTexts) tableTexts.push(`第${rowIndex + 1}行：${rowTexts}`);
                    }
                });
            }
            return tableTexts.join('。');
        }
        
        // 尝试使用 Markdown 插件的 getPlainText 方法（如果存在）
        if (Lumina.Plugin?.Markdown?.getPlainText) {
            try {
                const mdText = Lumina.Plugin.Markdown.getPlainText(item);
                if (mdText) return mdText;
            } catch (e) {
                // 忽略错误，继续使用默认逻辑
            }
        }
        
        // 默认：清理后返回 text 字段
        return this.cleanMarkdownMarks(item.text) || item.display || '';
    }

    // 页面听书模式：朗读整个页面的文本（解决熄屏间隔问题）
    async speakCurrentPage() {
        if (!this.isPlaying || !this.isPageMode) return;
        
        const state = Lumina.State.app;
        const chapter = state.chapters[state.currentChapterIndex];
        
        if (!chapter) {
            this.stop();
            return;
        }
        
        // 获取当前页的内容
        const currentPageIdx = state.currentPageIdx || 0;
        if (!chapter.pageRanges) {
            chapter.pageRanges = Lumina.Pagination.calculateRanges(chapter.items);
        }
        const currentRange = chapter.pageRanges[currentPageIdx];
        
        if (!currentRange) {
            // 页码超出，检查是否需要进入下一章
            if (await this.advanceToNextChapterOrStop()) {
                return; // 已进入下一章或停止
            }
            this.stop();
            return;
        }
        
        // 构建当前页的完整文本
        let pageText = '';
        for (let i = currentRange.start; i <= currentRange.end; i++) {
            const item = chapter.items[i];
            if (!item || item.type === 'image') continue;
            
            const textToAdd = this.extractItemText(item);
            
            if (textToAdd) {
                pageText += textToAdd + '。';
            }
        }
        
        if (!pageText.trim()) {
            // 当前页无文本，直接翻页
            state.currentPageIdx++;
            Lumina.Renderer.renderCurrentChapter();
            setTimeout(() => this.speakCurrentPage(), 100);
            return;
        }
        
        try {
            // 启动前台服务
            this.startServiceKeepAlive();
            
            if (this.isApp && this.nativeTTS) {
                // APP 环境：按500字分段朗读（避免崩溃）
                const MAX_PAGE_BATCH = 500;
                const batches = this.splitTextIntoBatches(pageText, MAX_PAGE_BATCH);
                
                for (const batch of batches) {
                    if (!this.isPlaying) return;
                    
                    const speakOptions = {
                        text: batch,
                        lang: 'zh-CN',
                        rate: this.settings.rate,
                        pitch: this.settings.pitch,
                        volume: this.settings.volume,
                        category: 'playback'
                    };
                    
                    if (this.settings.voiceIndex !== undefined && this.settings.voiceIndex >= 0) {
                        speakOptions.voice = this.settings.voiceIndex;
                    }
                    
                    await this.nativeTTS.speak(speakOptions);
                }
                
                // 当前页朗读完成，检查是否需要进入下一章
                if (this.isPlaying && this.isPageMode) {
                    const nextPageIdx = state.currentPageIdx + 1;
                    if (nextPageIdx >= chapter.pageRanges.length) {
                        // 当前章已完，尝试进入下一章
                        this.advanceToNextChapterOrStop();
                    } else {
                        // 继续翻页
                        state.currentPageIdx = nextPageIdx;
                        Lumina.Renderer.renderCurrentChapter();
                        setTimeout(() => this.speakCurrentPage(), 100);
                    }
                }
            } else if (this.synth) {
                // Web 环境
                this.utterance = new SpeechSynthesisUtterance(pageText);
                this.utterance.lang = 'zh-CN';
                this.utterance.rate = this.settings.rate;
                this.utterance.pitch = this.settings.pitch;
                this.utterance.volume = this.settings.volume;
                
                if (this.settings.voiceURI) {
                    const voice = this.voices.find(v => v.voiceURI === this.settings.voiceURI);
                    if (voice) this.utterance.voice = voice;
                }
                
                this.utterance.onend = () => {
                    if (this.isPlaying && this.isPageMode) {
                        const nextPageIdx = state.currentPageIdx + 1;
                        if (nextPageIdx >= chapter.pageRanges.length) {
                            // 当前章已完，尝试进入下一章
                            this.advanceToNextChapterOrStop();
                        } else {
                            // 继续翻页
                            state.currentPageIdx = nextPageIdx;
                            Lumina.Renderer.renderCurrentChapter();
                            setTimeout(() => this.speakCurrentPage(), 100);
                        }
                    }
                };
                
                this.utterance.onerror = (e) => {
                    if (e.error === 'interrupted' || e.error === 'canceled') {
                        return;
                    }
                    if (this.isPlaying && this.isPageMode) {
                        const nextPageIdx = state.currentPageIdx + 1;
                        if (nextPageIdx >= chapter.pageRanges.length) {
                            // 当前章已完，尝试进入下一章
                            this.advanceToNextChapterOrStop();
                        } else {
                            // 继续翻页
                            state.currentPageIdx = nextPageIdx;
                            Lumina.Renderer.renderCurrentChapter();
                            setTimeout(() => this.speakCurrentPage(), 100);
                        }
                    }
                };
                
                this.synth.speak(this.utterance);
            }
        } catch (e) {
            console.error('[TTS] 页面模式朗读失败:', e);
        }
    }
    
    // 辅助方法：进入下一章或停止播放
    advanceToNextChapterOrStop() {
        const state = Lumina.State.app;
        if (state.currentChapterIndex < state.chapters.length - 1) {
            // 还有下一章，进入下一章
            state.currentChapterIndex++;
            state.currentPageIdx = 0;
            this.currentItemIndex = state.chapters[state.currentChapterIndex].startIndex;
            this.currentSentenceIndex = 0;
            this.currentHighlightIndex = -1;
            
            Lumina.Renderer.renderCurrentChapter();
            setTimeout(() => this.speakCurrentPage(), 300);
            return true;
        } else {
            // 已是最后一章，停止播放
            this.stop();
            Lumina.UI.showToast(Lumina.I18n.t('ttsFinished'));
            return false;
        }
    }
    
    // 将长文本分批（页面听书模式用，避免TTS崩溃）
    splitTextIntoBatches(text, maxLength) {
        if (text.length <= maxLength) return [text];
        
        const batches = [];
        let remaining = text;
        
        while (remaining.length > maxLength) {
            // 找到不超过maxLength的最后一个句号位置
            let cutPos = maxLength;
            const lastPeriod = remaining.lastIndexOf('。', maxLength);
            const lastExclaim = remaining.lastIndexOf('！', maxLength);
            const lastQuestion = remaining.lastIndexOf('？', maxLength);
            const lastSentenceEnd = Math.max(lastPeriod, lastExclaim, lastQuestion);
            
            if (lastSentenceEnd > maxLength * 0.5) {
                // 如果找到句子结束位置（且不太靠前），在这里切分
                cutPos = lastSentenceEnd + 1;
            }
            // 否则直接按maxLength切分
            
            batches.push(remaining.substring(0, cutPos));
            remaining = remaining.substring(cutPos);
        }
        
        if (remaining) batches.push(remaining);
        return batches;
    }

    isMobileDevice() {
        return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    async speakCurrent() {
        if (!this.isPlaying) return;
        
        // 记录最后朗读时间（用于检测卡住）
        this._lastSpeakTime = Date.now();
        
        // APP 环境使用原生 TTS
        if (this.isApp && this.nativeTTS) {
            await this.speakCurrentNative();
            return;
        }
        
        const state = Lumina.State.app;
        const chapter = state.chapters[state.currentChapterIndex];
        
        if (!chapter) {
            this.stop();
            return;
        }
        
        // 章节边界检查...
        if (this.currentItemIndex > chapter.endIndex) {
            if (state.currentChapterIndex < state.chapters.length - 1) {
                state.currentChapterIndex++;
                state.currentPageIdx = 0;
                this.currentItemIndex = state.chapters[state.currentChapterIndex].startIndex;
                this.currentSentenceIndex = 0;
                this.currentHighlightIndex = -1;
                
                Lumina.Renderer.renderCurrentChapter();
                setTimeout(() => this.speakCurrent(), 300);
                return;
            } else {
                this.stop();
                Lumina.UI.showToast(Lumina.I18n.t('ttsFinished'));
                return;
            }
        }
        
        // 分页检查...
        const relativeIdx = this.currentItemIndex - chapter.startIndex;
        if (!chapter.pageRanges) {
            chapter.pageRanges = Lumina.Pagination.calculateRanges(chapter.items);
        }
        const currentPageIdx = state.currentPageIdx || 0;
        const currentRange = chapter.pageRanges[currentPageIdx];
        
        if (relativeIdx < currentRange.start || relativeIdx > currentRange.end) {
            const targetPageIdx = Lumina.Pagination.findPageIndex(chapter.pageRanges, relativeIdx);
            if (targetPageIdx !== currentPageIdx) {
                state.currentPageIdx = targetPageIdx;
                Lumina.Renderer.renderCurrentChapter(this.currentItemIndex);
                setTimeout(() => this.speakCurrent(), 200);
                return;
            }
        }
        
        const item = chapter.items[relativeIdx];
        const itemText = this.extractItemText(item);
        
        // 修复：支持 Markdown 元素（list、table、blockquote 等）
        if (!item || item.type === 'image' || !itemText.trim()) {
            this.currentItemIndex++;
            this.currentSentenceIndex = 0;
            setTimeout(() => this.speakCurrent(), 50);
            return;
        }
        
        this.currentParagraphEl = document.querySelector(`.doc-line[data-index="${this.currentItemIndex}"]`);
        if (!this.currentParagraphEl) {
            setTimeout(() => this.speakCurrent(), 300);
            return;
        }
        
        // 使用 extractItemText 获取要朗读的文本（支持所有 Markdown 元素类型）
        const textForSplit = itemText;
        this.currentSentences = this.splitIntoSentences(textForSplit);
        
        // 防止TTS崩溃：限制单次朗读文本长度（最多500字）
        const MAX_TTS_LENGTH = 500;
        let textToRead = this.currentSentences.slice(this.currentSentenceIndex).join('');
        let batchEndSentenceIndex = this.currentSentences.length; // 默认朗读到最后
        
        if (textToRead.length > MAX_TTS_LENGTH) {
            // 找到不超过500字的最后一个句子结束位置
            let truncatedLength = 0;
            batchEndSentenceIndex = this.currentSentenceIndex;
            for (let i = this.currentSentenceIndex; i < this.currentSentences.length; i++) {
                if (truncatedLength + this.currentSentences[i].length > MAX_TTS_LENGTH) {
                    break;
                }
                truncatedLength += this.currentSentences[i].length;
                batchEndSentenceIndex = i + 1;
            }
            // 只取到endSentenceIndex，剩余的下次朗读
            textToRead = this.currentSentences.slice(this.currentSentenceIndex, batchEndSentenceIndex).join('');
            console.log('[TTS] 长段落分批朗读，本次', textToRead.length, '字，剩余', this.currentSentences.slice(batchEndSentenceIndex).join('').length, '字');
        }
        
        this.utterance = new SpeechSynthesisUtterance(textToRead);
        const voice = this.voices.find(v => v.voiceURI === this.settings.voiceURI) || this.voices[0];
        if (voice) this.utterance.voice = voice;
        this.utterance.rate = this.settings.rate;
        this.utterance.pitch = this.settings.pitch;
        
        // 预计算边界
        const sentenceBoundaries = [];
        let acc = 0;
        for (let i = this.currentSentenceIndex; i < this.currentSentences.length; i++) {
            acc += this.currentSentences[i].length;
            sentenceBoundaries.push(acc);
        }
        
        // 智能初始高亮策略，避免闪烁
        this.boundaryDetectedThisUtterance = false;
        let fallbackTimer = null;
        
        // 清除之前的高亮
        this.clearAllHighlights();
        
        if (this.supportsBoundary === true) {
            // 已知支持：直接句子级高亮（不经过段落级）
            this.highlightSentence(this.currentSentenceIndex);
        } else if (this.supportsBoundary === false) {
            // 已知不支持：直接段落级高亮 + 滚动
            this.currentParagraphEl.classList.add('tts-highlight');
            this.currentParagraphEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            // 300ms后若未触发boundary，则降级为段落高亮
            fallbackTimer = setTimeout(() => {
                if (!this.boundaryDetectedThisUtterance && this.isPlaying && this.currentParagraphEl) {
                    this.supportsBoundary = false;
                    // 改为调用 highlightCurrent，保持逻辑一致
                    this.highlightCurrent();
                }
            }, 300);
        }
        
        // 边界事件处理
        this.utterance.onboundary = (event) => {
            if (!this.isPlaying || event.charIndex === undefined) return;
            
            // 首次触发boundary
            if (!this.boundaryDetectedThisUtterance) {
                this.boundaryDetectedThisUtterance = true;
                this.supportsBoundary = true;
                
                // 清除降级定时器
                if (fallbackTimer) {
                    clearTimeout(fallbackTimer);
                    fallbackTimer = null;
                }
                
                // 清除可能已应用的段落高亮（防御性）
                this.currentParagraphEl.classList.remove('tts-highlight');
                
                // 应用句子级高亮
                this.highlightSentence(this.currentSentenceIndex);
            }
            
            // 句子索引追踪
            let targetOffset = 0;
            for (let i = 0; i < sentenceBoundaries.length; i++) {
                if (event.charIndex < sentenceBoundaries[i]) {
                    targetOffset = i;
                    break;
                }
                targetOffset = i;
            }
            
            const globalSentenceIdx = this.currentSentenceIndex + targetOffset;
            if (globalSentenceIdx !== this.currentHighlightIndex && 
                globalSentenceIdx < this.currentSentences.length) {
                this.currentHighlightIndex = globalSentenceIdx;
                this.highlightSentence(globalSentenceIdx);
            }
        };
        
        this.utterance.onend = () => {
            if (fallbackTimer) clearTimeout(fallbackTimer);
            if (!this.isPlaying) return;
            
            // 检查是否还有剩余句子未朗读（长段落分批情况）
            if (batchEndSentenceIndex < this.currentSentences.length) {
                // 继续朗读本段落剩余部分
                this.currentSentenceIndex = batchEndSentenceIndex;
                this.currentHighlightIndex = -1;
                this.clearSentenceHighlightsOnly();
                console.log('[TTS] 继续朗读本段落，从句子', this.currentSentenceIndex, '开始');
                Promise.resolve().then(() => this.speakCurrent());
            } else {
                // 本段落朗读完成，跳到下一段
                this.currentItemIndex++;
                this.currentSentenceIndex = 0;
                this.currentHighlightIndex = -1;
                this.clearSentenceHighlightsOnly();
                Promise.resolve().then(() => this.speakCurrent());
            }
        };
        
        this.utterance.onerror = (e) => {
            if (fallbackTimer) clearTimeout(fallbackTimer);
            if (this.isPlaying && e.error !== 'canceled') {
                this.currentItemIndex++;
                this.currentSentenceIndex = 0;
                setTimeout(() => this.speakCurrent(), 100);
            }
        };
        
        this.synth.speak(this.utterance);
    }

    // APP 原生 TTS 播放 - 逐句朗读以实现句子级高亮
    async speakCurrentNative() {
        if (!this.isPlaying) return;
        
        const state = Lumina.State.app;
        const chapter = state.chapters[state.currentChapterIndex];
        
        if (!chapter) {
            this.stop();
            return;
        }
        
        // 章节边界检查
        if (this.currentItemIndex > chapter.endIndex) {
            if (state.currentChapterIndex < state.chapters.length - 1) {
                state.currentChapterIndex++;
                state.currentPageIdx = 0;
                this.currentItemIndex = state.chapters[state.currentChapterIndex].startIndex;
                this.currentSentenceIndex = 0;
                this.currentHighlightIndex = -1;
                
                Lumina.Renderer.renderCurrentChapter();
                setTimeout(() => this.speakCurrent(), 300);
                return;
            } else {
                this.stop();
                Lumina.UI.showToast(Lumina.I18n.t('ttsFinished'));
                return;
            }
        }
        
        // 分页检查
        const relativeIdx = this.currentItemIndex - chapter.startIndex;
        if (!chapter.pageRanges) {
            chapter.pageRanges = Lumina.Pagination.calculateRanges(chapter.items);
        }
        const currentPageIdx = state.currentPageIdx || 0;
        const currentRange = chapter.pageRanges[currentPageIdx];
        
        if (relativeIdx < currentRange.start || relativeIdx > currentRange.end) {
            const targetPageIdx = Lumina.Pagination.findPageIndex(chapter.pageRanges, relativeIdx);
            if (targetPageIdx !== currentPageIdx) {
                state.currentPageIdx = targetPageIdx;
                Lumina.Renderer.renderCurrentChapter(this.currentItemIndex);
                setTimeout(() => this.speakCurrent(), 200);
                return;
            }
        }
        
        const item = chapter.items[relativeIdx];
        const itemText = this.extractItemText(item);
        
        // 修复：支持 Markdown 元素（list、table、blockquote、codeblock 等）
        if (!item || item.type === 'image' || !itemText.trim()) {
            this.currentItemIndex++;
            this.currentSentenceIndex = 0;
            setTimeout(() => this.speakCurrent(), 50);
            return;
        }
        
        // 获取段落元素
        this.currentParagraphEl = document.querySelector(`.doc-line[data-index="${this.currentItemIndex}"]`);
        
        // 使用 extractItemText 获取要朗读的文本（支持所有 Markdown 元素类型）
        const textToRead = itemText;
        this.currentSentences = this.splitIntoSentences(textToRead);
        
        // 逐句朗读
        for (let i = this.currentSentenceIndex; i < this.currentSentences.length; i++) {
            if (!this.isPlaying) return;
            
            this.currentSentenceIndex = i;
            const sentence = this.currentSentences[i];
            
            // 更新高亮 - 只保留句子级（APP 环境逐句朗读）
            this.clearAllHighlights();
            if (this.currentParagraphEl) {
                this.highlightSentenceInParagraph(i);
                this.currentParagraphEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            
            try {
                // 启动前台服务保活
                if (i === 0) this.startServiceKeepAlive();
                
                // 朗读这一句
                const speakOptions = {
                    text: sentence,
                    lang: 'zh-CN',
                    rate: this.settings.rate,
                    pitch: this.settings.pitch,
                    volume: this.settings.volume,
                    category: 'playback'
                };
                
                if (this.settings.voiceIndex !== undefined && this.settings.voiceIndex >= 0) {
                    speakOptions.voice = this.settings.voiceIndex;
                }
                
                await this.nativeTTS.speak(speakOptions);
                
            } catch (e) {
                console.error('[TTS] 句子朗读失败:', e);
                // 出错时继续下一句
                continue;
            }
        }
        
        // 本段落朗读完成，继续下一段
        if (this.isPlaying) {
            this.currentItemIndex++;
            this.currentSentenceIndex = 0;
            this.currentHighlightIndex = -1;
            this.clearAllHighlights();
            setTimeout(() => this.speakCurrent(), 100);
        }
    }
    
    // 在段落内高亮特定句子（APP 环境，简化版）
    highlightSentenceInParagraph(sentenceIndex) {
        if (!this.currentParagraphEl) return;
        
        // 获取段落文本并查找句子位置
        const fullText = this.currentParagraphEl.textContent;
        const sentences = this.splitIntoSentences(fullText);
        
        if (sentenceIndex >= sentences.length) return;
        
        // 计算该句子在段落中的位置
        let charIndex = 0;
        for (let i = 0; i < sentenceIndex; i++) {
            const idx = fullText.indexOf(sentences[i], charIndex);
            if (idx >= 0) charIndex = idx + sentences[i].length;
        }
        
        const targetSentence = sentences[sentenceIndex];
        const sentenceStart = fullText.indexOf(targetSentence, charIndex);
        
        if (sentenceStart < 0) return;
        
        // 尝试在 DOM 中找到这个句子并高亮
        try {
            const range = document.createRange();
            const treeWalker = document.createTreeWalker(this.currentParagraphEl, NodeFilter.SHOW_TEXT);
            
            let currentChar = 0, startNode = null, startOffset = 0, endNode = null, endOffset = 0;
            let node;
            
            while (node = treeWalker.nextNode()) {
                const nodeLength = node.textContent.length;
                if (!startNode && currentChar + nodeLength > sentenceStart) {
                    startNode = node;
                    startOffset = sentenceStart - currentChar;
                }
                if (startNode && currentChar + nodeLength >= sentenceStart + targetSentence.length) {
                    endNode = node;
                    endOffset = (sentenceStart + targetSentence.length) - currentChar;
                    break;
                }
                currentChar += nodeLength;
            }
            
            if (startNode && endNode) {
                range.setStart(startNode, startOffset);
                range.setEnd(endNode, endOffset);
                const span = document.createElement('span');
                span.className = 'tts-sentence-highlight';
                range.surroundContents(span);
                this.sentenceElements.push(span);
            }
        } catch (e) {
            // 如果失败，只保留段落高亮
            console.warn('[TTS] 句子高亮失败:', e);
        }
    }
    

    highlightSentence(sentenceIndex) {
        // 防御：如果不支持boundary，不执行
        if (!this.supportsBoundary) return;
        
        if (!this.currentParagraphEl || !this.currentSentences[sentenceIndex]) return;
        
        // 仅清除句子高亮，保留段落高亮（如果存在）
        this.clearSentenceHighlightsOnly();
        
        // 确保段落高亮已移除（避免与句子高亮叠加）
        this.currentParagraphEl.classList.remove('tts-highlight');

        const fullText = this.currentParagraphEl.textContent;
        const targetSentence = this.currentSentences[sentenceIndex];
        let charIndex = 0;

        for (let i = 0; i < sentenceIndex; i++) charIndex += this.currentSentences[i].length;

        const range = document.createRange();
        const treeWalker = document.createTreeWalker(this.currentParagraphEl, NodeFilter.SHOW_TEXT, null, false);
        let currentChar = 0, startNode = null, startOffset = 0, endNode = null, endOffset = 0, node;

        while (node = treeWalker.nextNode()) {
            const nodeLength = node.textContent.length;
            if (!startNode && currentChar + nodeLength > charIndex) {
                startNode = node;
                startOffset = charIndex - currentChar;
            }
            if (startNode && currentChar + nodeLength >= charIndex + targetSentence.length) {
                endNode = node;
                endOffset = (charIndex + targetSentence.length) - currentChar;
                break;
            }
            currentChar += nodeLength;
        }

        if (startNode && endNode) {
            try {
                range.setStart(startNode, startOffset);
                range.setEnd(endNode, endOffset);
                const highlightSpan = document.createElement('span');
                highlightSpan.className = 'tts-sentence-highlight';
                range.surroundContents(highlightSpan);
                this.sentenceElements.push(highlightSpan);
                
                // 🔴 关键修复2：确保滚动到可视区域（桌面端）
                highlightSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (e) {
                // 降级：如果surroundContents失败（跨元素边界），使用段落高亮
                this.currentParagraphEl.classList.add('tts-highlight');
                this.currentParagraphEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    highlightCurrent() {
        if (!this.isPlaying) return;
        
        // 🔴 关键修复：如果边界支持状态未确定（undefined），不应用任何高亮
        // 等待 speakCurrent 中的检测逻辑确定后再应用，避免闪烁
        if (this.supportsBoundary === undefined) {
            return;
        }
        
        this.clearAllHighlights();
        this.currentParagraphEl = document.querySelector(`.doc-line[data-index="${this.currentItemIndex}"]`);
        
        if (!this.currentParagraphEl) return;
        
        if (this.supportsBoundary && this.currentSentences.length > 0) {
            const idx = Math.min(this.currentSentenceIndex, this.currentSentences.length - 1);
            if (idx >= 0) this.highlightSentence(idx);
        } else {
            // 已知不支持 boundary，使用段落级高亮
            this.currentParagraphEl.classList.add('tts-highlight');
            this.currentParagraphEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    applyHighlightBasedOnSupport() {
        // 清除旧的高亮
        this.clearAllHighlights();
        
        if (!this.currentParagraphEl) return;
        
        if (this.supportsBoundary) {
            // 已知支持边界事件，直接使用句子级高亮（从第一句开始）
            this.highlightSentence(this.currentSentenceIndex);
        } else {
            // 未知或不支持，先应用段落高亮
            // 如果后续 onboundary 触发，会移除这个类并切换到句子级
            this.currentParagraphEl.classList.add('tts-highlight');
        }
    }

    moveToNext() {
        if (!this.isPlaying) return;
        this.currentItemIndex++;
        this.currentSentenceIndex = 0;
        this.clearSentenceHighlights();
        setTimeout(() => this.speakCurrent(), 50);
    }

    updateUI() {
        const btn = document.getElementById('ttsToggle');
        if (btn) btn.classList.toggle('tts-active', this.isPlaying);
    }

    updateSettings(key, value) {
        if (key === 'voice') this.settings.voiceURI = value;
        if (key === 'rate') this.settings.rate = parseFloat(value);
        if (key === 'pitch') this.settings.pitch = parseFloat(value);
        if (key === 'volume') this.settings.volume = parseFloat(value);
        this.saveSettings();
        this.restartIfPlaying();
    }

    saveSettings() {
        localStorage.setItem('luminaTTS', JSON.stringify(this.settings));
    }

    loadSavedSettings() {
        const saved = localStorage.getItem('luminaTTS');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.settings = { ...this.settings, ...parsed };
            } catch (e) {
                console.warn('TTS 设置解析失败:', e);
            }
        }
    }

    highlightCurrent() {
        if (!this.isPlaying) return;
        this.currentParagraphEl = document.querySelector(`.doc-line[data-index="${this.currentItemIndex}"]`);
        if (this.isMobileDevice()) {
            if (this.currentParagraphEl) this.currentParagraphEl.classList.add('tts-highlight');
        } else {
            if (this.currentParagraphEl && this.currentSentences.length > 0) {
                const idx = Math.min(this.currentSentenceIndex, this.currentSentences.length - 1);
                if (idx >= 0) this.highlightSentence(idx);
            }
        }
    }

    async pauseForAction(action, delay = null) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) this.stop();
        const result = await action();
        const waitTime = delay !== null ? delay : (Lumina.State.settings.smoothScroll ? 350 : 50);
        await new Promise(r => setTimeout(r, waitTime));
        if (wasPlaying) {
            this.currentChapterIndex = Lumina.State.app.currentChapterIndex;
            this.currentItemIndex = Lumina.Renderer.getCurrentVisibleIndex();
            this.currentSentenceIndex = 0;
            this.start();
        }
        return result;
    }
};

