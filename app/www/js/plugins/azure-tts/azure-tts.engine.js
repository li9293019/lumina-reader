// ==================== Azure TTS 引擎 ====================
// 封装 Azure Speech SDK 调用，提供统一的 speak/stop 接口
// 支持音频缓存和预加载，减少句间延迟

Lumina.Plugin = Lumina.Plugin || {};
Lumina.Plugin.AzureTTS = Lumina.Plugin.AzureTTS || {};

Lumina.Plugin.AzureTTS.Engine = class {
    constructor() {
        this.synthesizer = null;
        this.isPlaying = false;
        this.isInitialized = false;
        this.currentKey = null;
        this.currentRegion = null;
        
        // 音频缓存 (textHash -> ArrayBuffer)
        this.cache = new Map();
        this.maxCacheSize = 10; // 一般模式缓存10句，听书模式不缓存
        
        // 预加载控制
        this.preloadAbort = null;
        
        // 当前播放控制
        this._currentRequestId = null;
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
        
        console.log('[AzureTTS] 初始化成功');
        return true;
    }

    // 生成缓存 key (基于文本和语音参数)
    _cacheKey(text, voice, style) {
        // 简单 hash：取前30字符 + 参数
        const prefix = text.slice(0, 30).replace(/\s/g, '');
        return `${voice}_${style || 'general'}_${prefix}_${text.length}`;
    }

    // 预加载音频（后台静默合成）
    async preload(options) {
        if (!this.isInitialized || this.cache.size >= this.maxCacheSize) return;
        if (options.useCache === false) return;
        
        const { text, voice, style } = options;
        const key = this._cacheKey(text, voice, style);
        
        // 已缓存则跳过
        if (this.cache.has(key)) return;
        
        // 创建可取消的预加载
        this.preloadAbort?.abort();
        const abortController = new AbortController();
        this.preloadAbort = abortController;
        
        const startTime = performance.now();
        try {
            const audioData = await this._synthesize(text, voice, style, 1.0, 0, 100);
            
            if (!abortController.signal.aborted && audioData) {
                this._addToCache(key, audioData);
                console.log(`[AzureTTS] 预加载完成: "${text.substring(0, 20)}...", 缓存数: ${this.cache.size}, 耗时: ${(performance.now() - startTime).toFixed(0)}ms`);
            }
        } catch (e) {
            // 预加载失败静默处理
        }
    }

    // 添加缓存（LRU 淘汰）
    _addToCache(key, audioData) {
        if (this.cache.size >= this.maxCacheSize) {
            // 删除最旧的条目
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, audioData);
    }

    // 合成音频（返回 ArrayBuffer）
    _synthesize(text, voice, style, rate, pitch, volume) {
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

    // 朗读（带缓存）
    async speak(options) {
        const { text, voice, style, rate = 1.0, pitch = 0, volume = 100, useCache = true } = options;
        
        if (!this.isInitialized) {
            throw new Error('Azure TTS 未初始化');
        }
        
        const requestId = Date.now();
        const startTime = performance.now();
        this.stop(); // 停止之前的
        this._currentRequestId = requestId;
        this.isPlaying = true;
        
        // 听书模式(useCache=false)不走缓存
        let audioData = null;
        const cacheKey = useCache ? this._cacheKey(text, voice, style) : null;
        
        if (useCache) {
            audioData = this.cache.get(cacheKey);
            if (audioData) {
                console.log(`[AzureTTS] 缓存命中: "${text.substring(0, 20)}...", 缓存数: ${this.cache.size}`);
            }
        }
        
        // 缓存未命中，实时合成
        if (!audioData) {
            try {
                console.log(`[AzureTTS] 缓存未命中，开始合成: "${text.substring(0, 20)}..."`);
                audioData = await this._synthesize(text, voice, style, rate, pitch, volume);
                // 只有一般模式才写入缓存
                if (useCache) {
                    this._addToCache(cacheKey, audioData);
                }
                console.log(`[AzureTTS] 合成完成，耗时: ${(performance.now() - startTime).toFixed(0)}ms`);
            } catch (e) {
                this.isPlaying = false;
                throw e;
            }
        }
        
        // 播放
        return this._play(audioData, rate, requestId);
    }

    // 播放音频
    _play(audioData, rate, requestId) {
        return new Promise((resolve, reject) => {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            this._audioContext = ctx;
            
            ctx.decodeAudioData(audioData.slice(0), (buffer) => {
                if (this._currentRequestId !== requestId) {
                    ctx.close().catch(() => {});
                    resolve();
                    return;
                }
                
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.playbackRate.value = rate;
                source.connect(ctx.destination);
                
                source.onended = () => {
                    ctx.close().catch(() => {});
                    if (this._currentRequestId === requestId) {
                        this.isPlaying = false;
                    }
                    resolve();
                };
                
                source.start(0);
            }, (err) => {
                ctx.close().catch(() => {});
                reject(err);
            });
        });
    }

    // 检查文本是否在缓存中
    isInCache(text, voice, style) {
        const key = this._cacheKey(text, voice, style);
        return this.cache.has(key);
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
        this._currentRequestId = null;
        this.isPlaying = false;
        this.preloadAbort?.abort();
        
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

    clearCache() {
        this.cache.clear();
    }

    destroy() {
        this.stop();
        this.clearCache();
        this.isInitialized = false;
    }
};

console.log('[AzureTTS] Engine 已加载（带缓存）');
