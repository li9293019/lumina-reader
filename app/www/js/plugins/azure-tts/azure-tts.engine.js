// ==================== Azure TTS 引擎 ====================
// 封装 Azure Speech SDK 调用，提供统一的合成和播放接口
// 缓存逻辑由 TaskManager 负责

Lumina.Plugin = Lumina.Plugin || {};
Lumina.Plugin.AzureTTS = Lumina.Plugin.AzureTTS || {};

Lumina.Plugin.AzureTTS.Engine = class {
    constructor() {
        this.synthesizer = null;
        this.isPlaying = false;
        this.isInitialized = false;
        this.currentKey = null;
        this.currentRegion = null;
        
        // 任务管理器
        this.taskManager = null;
        
        // 当前播放控制
        this._audioContext = null;
        
        // 可用音色
        this.voices = [
            { name: 'zh-CN-XiaoxiaoNeural', displayName: '晓晓', gender: 'Female' },
            { name: 'zh-CN-YunxiNeural', displayName: '云希', gender: 'Male' },
            { name: 'zh-CN-YunjianNeural', displayName: '云健', gender: 'Male' },
            { name: 'zh-CN-YunxiaNeural', displayName: '云夏', gender: 'Male' },
            { name: 'zh-CN-XiaoyiNeural', displayName: '晓伊', gender: 'Female' },
            { name: 'zh-CN-YunyangNeural', displayName: '云扬', gender: 'Male' },
            { name: 'zh-CN-XiaochenNeural', displayName: '晓晨', gender: 'Female' },
            { name: 'zh-CN-XiaohanNeural', displayName: '晓涵', gender: 'Female' }
        ];
    }
    
    // 设置任务管理器
    setTaskManager(taskManager) {
        this.taskManager = taskManager;
    }

    init(speechKey, region = 'eastasia') {
        if (!speechKey) return false;
        if (this.isInitialized && this.currentKey === speechKey && this.currentRegion === region) {
            return true;
        }
        
        const sdk = window.SpeechSDK;
        if (!sdk) {
            console.warn('[AzureTTS] SDK 未加载');
            return false;
        }
        
        this.SpeechSDK = sdk;
        this.currentKey = speechKey;
        this.currentRegion = region;
        this.isInitialized = true;
        
        // console.log('[AzureTTS] 初始化成功');
        return true;
    }

    // 合成音频（返回 ArrayBuffer）- 纯合成，不处理缓存
    _synthesize(text, voice, style, rate, pitch, volume) {
        if (!this.isInitialized) {
            return Promise.reject(new Error('Azure TTS 未初始化'));
        }
        
        return new Promise((resolve, reject) => {
            const stream = this.SpeechSDK.AudioOutputStream.createPullStream();
            const audioConfig = this.SpeechSDK.AudioConfig.fromStreamOutput(stream);
            
            const speechConfig = this.SpeechSDK.SpeechConfig.fromSubscription(
                this.currentKey, this.currentRegion
            );
            speechConfig.speechSynthesisOutputFormat = 
                this.SpeechSDK.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3;
            
            const synthesizer = new this.SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig);
            const ssml = this._buildSSML(text, voice, style, rate, pitch, volume);
            
            synthesizer.speakSsmlAsync(
                ssml,
                (result) => {
                    synthesizer.close();
                    if (result.reason === this.SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
                        resolve(result.audioData);
                    } else {
                        reject(new Error('合成失败'));
                    }
                },
                (err) => {
                    synthesizer.close();
                    reject(err);
                }
            );
        });
    }

    // 朗读（调用 TaskManager，支持缓存）
    async speak(options) {
        const { text, voice, style, rate = 1.0, pitch = 0, volume = 100 } = options;
        
        if (!this.isInitialized) {
            throw new Error('Azure TTS 未初始化');
        }
        
        const params = { voice, style, rate, pitch };
        
        // 使用 TaskManager 朗读（自动处理缓存）
        if (this.taskManager && this.taskManager.config.enabled) {
            return this.taskManager.speak(text, params);
        }
        
        // 无缓存，直接实时合成（也使用 TaskManager 的 speakId 机制）
        const speakId = this.taskManager ? ++this.taskManager.currentSpeakId : 0;
        const audioData = await this._synthesize(text, voice, style, rate, pitch, volume);
        return this._play(audioData, rate, speakId);
    }
    
    // 预加载（供外部调用）
    preload(text, params) {
        if (!this.taskManager || !this.taskManager.config.enabled) return;
        this.taskManager.preload(text, params);
    }

    // 播放音频
    _play(audioData, rate, speakId = null) {
        return new Promise((resolve, reject) => {
            // 如果提供了 speakId，检查是否已被取消
            if (speakId !== null && this.taskManager && speakId !== this.taskManager.currentSpeakId) {
                // console.log('[AzureTTS Engine] 播放已被取消，跳过');
                reject(new Error('播放已被取消'));
                return;
            }
            
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            
            // 保存所有活跃的音频上下文，用于 stop() 时全部关闭
            if (!this._audioContexts) this._audioContexts = new Set();
            this._audioContexts.add(ctx);
            this._audioContext = ctx;
            this.isPlaying = true;
            
            ctx.decodeAudioData(audioData.slice(0), (buffer) => {
                // 再次检查是否已被取消
                if (speakId !== null && this.taskManager && speakId !== this.taskManager.currentSpeakId) {
                    // console.log('[AzureTTS Engine] decode 完成后发现已取消，不播放');
                    ctx.close().catch(() => {});
                    this._audioContexts.delete(ctx);
                    reject(new Error('播放已被取消'));
                    return;
                }
                
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.playbackRate.value = rate;
                source.connect(ctx.destination);
                
                source.onended = () => {
                    ctx.close().catch(() => {});
                    this._audioContexts.delete(ctx);
                    if (this._audioContexts.size === 0) {
                        this.isPlaying = false;
                    }
                    resolve();
                };
                
                source.start(0);
            }, (err) => {
                ctx.close().catch(() => {});
                this._audioContexts.delete(ctx);
                if (this._audioContexts.size === 0) {
                    this.isPlaying = false;
                }
                reject(err);
            });
        });
    }

    // 构建 SSML
    _buildSSML(text, voice, style, rate, pitch, volume) {
        const v = voice || 'zh-CN-XiaoxiaoNeural';
        const rateStr = `${Math.round((rate - 1) * 100)}%`.replace(/^\+?0%$/, '0%');
        const pitchStr = pitch === 0 ? 'default' : `${pitch > 0 ? '+' : ''}${pitch}%`;
        
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        
        if (style && style !== 'general') {
            return `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://schema.microsoft.com/2019/07/mstts/neural" version="1.0" xml:lang="zh-CN">
                <voice name="${v}">
                    <mstts:express-as style="${style}">
                        <prosody rate="${rateStr}" pitch="${pitchStr}" volume="${volume}">${escaped}</prosody>
                    </mstts:express-as>
                </voice>
            </speak>`;
        }
        
        return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
            <voice name="${v}">
                <prosody rate="${rateStr}" pitch="${pitchStr}" volume="${volume}">${escaped}</prosody>
            </voice>
        </speak>`;
    }

    stop() {
        this.isPlaying = false;
        this.taskManager?.stop();
        
        // 关闭所有活跃的音频上下文
        if (this._audioContexts) {
            this._audioContexts.forEach(ctx => {
                if (ctx.state !== 'closed') {
                    ctx.close().catch(() => {});
                }
            });
            this._audioContexts.clear();
        }
        
        if (this._audioContext?.state !== 'closed') {
            this._audioContext?.close().catch(() => {});
            this._audioContext = null;
        }
    }

    pause() {
        this._audioContext?.suspend();
        this.isPlaying = false;
    }

    resume() {
        this._audioContext?.resume();
        this.isPlaying = true;
    }

    destroy() {
        this.stop();
        this.taskManager?.clear();
        this.isInitialized = false;
    }
};

// console.log('[AzureTTS] Engine 已加载（集成 TaskManager v2）');
