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
            // 从全局获取原生 TTS 插件
            if (Capacitor.Plugins && Capacitor.Plugins.TextToSpeech) {
                this.nativeTTS = Capacitor.Plugins.TextToSpeech;
                console.log('[TTS] 使用原生 TTS 插件');
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
        // 防止默认行为
        if (e.cancelable) e.preventDefault();
        
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
    
    // 切换段落模式（短按）
    toggleParagraphMode() {
        if (this.isPlaying && this.isPageMode) {
            // 如果正在以页面模式播放，停止后切换到段落模式
            this.stop();
            this.isPageMode = false;
            this.start();
            Lumina.UI.showToast('已切换到段落朗读');
        } else if (this.isPlaying && !this.isPageMode) {
            // 正在段落模式，停止
            this.stop();
        } else {
            // 未播放，启动段落模式
            this.isPageMode = false;
            this.start();
        }
    }
    
    // 切换页面听书模式（长按）
    togglePageMode() {
        if (this.isPlaying && !this.isPageMode) {
            // 如果正在以段落模式播放，停止后切换到页面模式
            this.stop();
            this.isPageMode = true;
            this.speakCurrentPage();
            Lumina.UI.showToast('进入页面听书模式');
        } else if (this.isPlaying && this.isPageMode) {
            // 正在页面模式，停止
            this.stop();
        } else {
            // 未播放，启动页面模式
            this.isPageMode = true;
            this.speakCurrentPage();
            Lumina.UI.showToast('进入听书模式');
        }
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
                this.voices = result.voices || [];
                console.log('[TTS] 原生音色列表:', this.voices.map(v => ({ name: v.name, lang: v.lang })));
                
                // 优先选择中文音色
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
            this.stop();
            return;
        }
        
        // 构建当前页的完整文本
        let pageText = '';
        for (let i = currentRange.start; i <= currentRange.end; i++) {
            const item = chapter.items[i];
            if (!item || item.type === 'image') continue;
            
            let textToAdd = '';
            if (item.type === 'paragraph' || item.type === 'text') {
                textToAdd = item.text || '';
            } else if (item.type === 'heading') {
                const level = item.level || 1;
                const prefix = '第' + ['一', '二', '三', '四', '五', '六'][level - 1] || level;
                textToAdd = prefix + '章 ' + (item.text || '');
            }
            
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
                // APP 环境
                const speakOptions = {
                    text: pageText,
                    lang: 'zh-CN',
                    rate: this.settings.rate,
                    pitch: this.settings.pitch,
                    volume: this.settings.volume,
                    category: 'playback'
                };
                
                // 添加音色选择
                if (this.settings.voiceIndex !== undefined && this.settings.voiceIndex >= 0) {
                    speakOptions.voice = this.settings.voiceIndex;
                }
                
                await this.nativeTTS.speak(speakOptions);
                
                // 当前页朗读完成，自动翻页
                if (this.isPlaying && this.isPageMode) {
                    state.currentPageIdx++;
                    Lumina.Renderer.renderCurrentChapter();
                    setTimeout(() => this.speakCurrentPage(), 100);
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
                        state.currentPageIdx++;
                        Lumina.Renderer.renderCurrentChapter();
                        setTimeout(() => this.speakCurrentPage(), 100);
                    }
                };
                
                this.utterance.onerror = (e) => {
                    if (e.error === 'interrupted' || e.error === 'canceled') {
                        return;
                    }
                    if (this.isPlaying && this.isPageMode) {
                        state.currentPageIdx++;
                        Lumina.Renderer.renderCurrentChapter();
                        setTimeout(() => this.speakCurrentPage(), 100);
                    }
                };
                
                this.synth.speak(this.utterance);
            }
        } catch (e) {
            console.error('[TTS] 页面模式朗读失败:', e);
        }
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
        if (!item || !item.text || item.type === 'image' || !item.text.trim()) {
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
        
        // 预分句
        this.currentSentences = this.splitIntoSentences(item.text);
        const textToRead = this.currentSentences.slice(this.currentSentenceIndex).join('');
        
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
            
            this.currentItemIndex++;
            this.currentSentenceIndex = 0;
            this.currentHighlightIndex = -1;
            this.clearSentenceHighlightsOnly();
            
            // 关键修复：立即播放下一段，不使用 setTimeout（后台会被延迟）
            // 使用 Promise 确保立即执行
            Promise.resolve().then(() => this.speakCurrent());
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

    // APP 原生 TTS 播放
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
        
        // 分页检查 - 关键修复：如果当前段落不在当前页，先翻页
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
        
        if (!item || !item.text || item.type === 'image' || !item.text.trim()) {
            this.currentItemIndex++;
            this.currentSentenceIndex = 0;
            setTimeout(() => this.speakCurrent(), 50);
            return;
        }
        
        // 获取要朗读的文本
        this.currentParagraphEl = document.querySelector(`.doc-line[data-index="${this.currentItemIndex}"]`);
        const textToRead = item.text;
        
        // 高亮当前段落
        this.clearAllHighlights();
        if (this.currentParagraphEl) {
            this.currentParagraphEl.classList.add('tts-highlight');
            this.currentParagraphEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        try {
            // 启动前台服务保活
            this.startServiceKeepAlive();
            
            // 使用原生 TTS
            const speakOptions = {
                text: textToRead,
                lang: 'zh-CN',
                rate: this.settings.rate,
                pitch: this.settings.pitch,
                volume: this.settings.volume,
                category: 'playback'
            };
            
            // 添加音色选择（如果有设置）
            if (this.settings.voiceIndex !== undefined && this.settings.voiceIndex >= 0) {
                speakOptions.voice = this.settings.voiceIndex;
            }
            
            await this.nativeTTS.speak(speakOptions);
            
            // 朗读完成，继续下一段
            if (this.isPlaying) {
                this.currentItemIndex++;
                this.currentSentenceIndex = 0;
                this.currentHighlightIndex = -1;
                this.clearAllHighlights();
                
                setTimeout(() => this.speakCurrent(), 100);
            }
        } catch (e) {
            console.error('[TTS] 原生播放失败:', e);
            // 出错时继续下一段，避免卡住
            if (this.isPlaying) {
                this.currentItemIndex++;
                this.currentSentenceIndex = 0;
                setTimeout(() => this.speakCurrent(), 100);
            }
        } finally {
            // 停止前台服务保活
            this.stopServiceKeepAlive();
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

