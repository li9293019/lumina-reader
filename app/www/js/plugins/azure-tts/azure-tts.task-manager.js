// ==================== Azure TTS 任务管理器 v3 ====================
// 核心逻辑：维护"向前看窗口"
// 始终确保当前朗读位置后面有 N 句已预加载
// 支持跨段落填充窗口

Lumina.Plugin = Lumina.Plugin || {};
Lumina.Plugin.AzureTTS = Lumina.Plugin.AzureTTS || {};

Lumina.Plugin.AzureTTS.TaskManager = class {
    constructor(options = {}) {
        this.config = {
            enabled: true,
            windowSize: 5,          // 向前看窗口大小（句）
            waitTimeout: 2000,      // 等待预加载超时
            maxRetries: 2,
            ...options
        };
        
        // 缓存池: cacheKey -> { audioData, params, savedAt, textLength }
        this.cache = new Map();
        this.maxCacheSize = options.maxCacheSize || 25;  // 最大缓存音频数量（默认 5*5）
        
        // 正在进行的合成任务: cacheKey -> Promise
        this.pendingSynthesis = new Map();
        
        // 引擎引用
        this.engine = null;
        
        // 当前状态
        this.currentKey = null;
        this.currentText = null;
        this.currentParams = null;
        this.currentSpeakId = 0;  // 用于取消机制：每次 speak 增加 ID，过时 ID 的播放会被丢弃
        
        // 统计
        this.stats = {
            hits: 0,        // 缓存命中（预加载成功被使用）
            misses: 0,      // 缓存未命中（实时合成）
            synthesizedChars: 0,  // 已合成字符数
            totalSynthesisTime: 0, // 总合成耗时(ms)
            synthesisCount: 0      // 合成次数
        };
        
        // 统计更新回调（供 UI 实时刷新使用）
        this.onStatsUpdate = null;
    }
    
    setEngine(engine) {
        this.engine = engine;
    }
    
    setEnabled(enabled) {
        this.config.enabled = enabled;
        if (!enabled) {
            this.clear();
        }
    }
    
    // 生成缓存 key（包含所有参数）
    _cacheKey(text, params) {
        const { voice, style, rate, pitch } = params;
        const textHash = this._hashText(text);
        return `${voice}_${style}_${rate.toFixed(2)}_${pitch}_${textHash}`;
    }
    
    _hashText(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
        }
        return (h >>> 0).toString(16);
    }
    
    // 检查指定文本是否在缓存中
    isCached(text, params) {
        if (!this.config.enabled) return false;
        const key = this._cacheKey(text, params);
        return this.cache.has(key) || this.pendingSynthesis.has(key);
    }
    
    // 检查句子是否有意义（非纯标点）
    _isMeaningfulSentence(text) {
        const meaningfulChars = text.replace(/[\s\n\r""''（）()【】\[\]《》<>、，。！？；：,.!?;:\-\—]/g, '');
        return meaningfulChars.length >= 2;
    }
    
    // ==================== 核心：填充向前看窗口 ====================
    // sentences: 当前段落的所有句子
    // currentIdx: 当前读到第几句（0-based，-1表示段落开始前）
    // nextParagraphs: 后续段落的可调用函数，返回 { sentences[], source: '段落标识' }
    fillWindow(currentText, currentIdx, sentences, params, getNextParagraph) {
        if (!this.config.enabled || !params) return;
        
        this.currentText = currentText;
        this.currentParams = params;
        
        let needed = this.config.windowSize;
        let paragraphIdx = 0;
        
        // 1. 先填充本段落中当前位置后面的句子
        const remainingInCurrent = sentences.slice(currentIdx + 1);
        for (let i = 0; i < remainingInCurrent.length && needed > 0; i++) {
            const sentence = remainingInCurrent[i];
            if (this._isMeaningfulSentence(sentence)) {
                this._preload(sentence, params);
                needed--;
            }
        }
        
        // 2. 如果窗口还没满，跨段落填充
        while (needed > 0) {
            const nextPara = getNextParagraph?.(paragraphIdx++);
            if (!nextPara || !nextPara.sentences) break;
            
            for (let i = 0; i < nextPara.sentences.length && needed > 0; i++) {
                const sentence = nextPara.sentences[i];
                if (this._isMeaningfulSentence(sentence)) {
                    this._preload(sentence, params);
                    needed--;
                }
            }
        }
    }
    
    // 内部：预加载单句（后台合成）
    _preload(text, params) {
        if (!this.engine || !text) return;
        
        const key = this._cacheKey(text, params);
        
        // 已在缓存或正在合成中，跳过
        if (this.cache.has(key) || this.pendingSynthesis.has(key)) return;
        
        // console.log(`[AzureTTS] 预加载: "${text.substring(0, 20)}..."`);
        
        // 开始后台合成
        const synthesisPromise = this._doSynthesize(text, params).catch(() => null);
        this.pendingSynthesis.set(key, synthesisPromise);
        
        synthesisPromise.then(audioData => {
            this.pendingSynthesis.delete(key);
            if (audioData) {
                this._addToCache(key, audioData, params, text.length);
            }
        });
    }
    
    // ==================== 朗读（带缓存检查）====================
    async speak(text, params, options = {}) {
        if (!this.engine) {
            throw new Error('引擎未设置');
        }
        
        // 生成本次朗读的唯一 ID，用于取消机制
        const speakId = ++this.currentSpeakId;
        
        const key = this._cacheKey(text, params);
        this.currentKey = key;
        this.currentParams = params;
        
        // 1. 检查缓存
        const cached = this.cache.get(key);
        if (cached) {
            // console.log(`[AzureTTS] 缓存命中: "${text.substring(0, 20)}..."`);
            this.stats.hits++;
            // LRU：移到最新位置
            this.cache.delete(key);
            this.cache.set(key, cached);
            
            // 触发统计更新回调
            if (this.onStatsUpdate) {
                this.onStatsUpdate(this.getStats());
            }
            
            // 播放前检查是否已被取消
            if (speakId !== this.currentSpeakId) {
                // console.log('[AzureTTS] 朗读已被取消，丢弃缓存播放');
                throw new Error('朗读已取消');
            }
            return this.engine._play(cached.audioData, params.rate, speakId);
        }
        
        // 2. 检查是否正在合成中（但不等待，直接实时合成）
        // 预加载是"锦上添花"，不是阻塞等待
        const pending = this.pendingSynthesis.get(key);
        if (pending) {
            // 如果正在预加载，尝试快速等待短时间（200ms），否则直接实时合成
            try {
                const audioData = await this._waitWithTimeout(pending, 200);
                if (audioData) {
                    // console.log(`[AzureTTS] 预加载刚好完成: "${text.substring(0, 20)}..."`);
                    this.stats.hits++;
                    this.pendingSynthesis.delete(key);
                    // 播放前检查是否已被取消
                    if (speakId !== this.currentSpeakId) {
                        // console.log('[AzureTTS] 朗读已被取消，丢弃预加载播放');
                        throw new Error('朗读已取消');
                    }
                    return this.engine._play(audioData, params.rate, speakId);
                }
            } catch (e) {
                // 200ms内没完成，直接实时合成
                // console.log(`[AzureTTS] 预加载未完成，实时合成: "${text.substring(0, 20)}..."`);
            }
        }
        
        // 3. 实时合成（缓存未命中）
        // console.log(`[AzureTTS] 缓存未命中，实时合成: "${text.substring(0, 20)}..."`);
        this.stats.misses++;
        const audioData = await this._doSynthesize(text, params);
        
        // 播放前检查是否已被取消
        if (speakId !== this.currentSpeakId) {
            // console.log('[AzureTTS] 朗读已被取消，丢弃实时合成播放');
            throw new Error('朗读已取消');
        }
        return this.engine._play(audioData, params.rate, speakId);
    }
    
    // 执行合成
    async _doSynthesize(text, params) {
        if (!this.engine) throw new Error('引擎未设置');
        
        // 过滤纯标点或太短的文本（Azure可能处理不好）
        const meaningfulText = text.replace(/[\s\n\r""''（）()【】\[\]《》<>]/g, '');
        if (meaningfulText.length < 2) {
            console.warn('[AzureTTS] 文本太短或纯标点，跳过合成:', text);
            throw new Error('文本太短');
        }
        
        const startTime = performance.now();
        try {
            const audioData = await this.engine._synthesize(
                text,
                params.voice,
                params.style,
                params.rate,
                params.pitch,
                100
            );
            const duration = performance.now() - startTime;
            
            this.stats.synthesizedChars = (this.stats.synthesizedChars || 0) + text.length;
            this.stats.totalSynthesisTime = (this.stats.totalSynthesisTime || 0) + duration;
            this.stats.synthesisCount = (this.stats.synthesisCount || 0) + 1;
            
            return audioData;
        } catch (error) {
            console.error('[AzureTTS] 合成失败:', error);
            // 保留原始错误，特别是超时错误
            throw error;
        }
    }
    
    // 带超时的等待
    _waitWithTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
        ]);
    }
    
    // 添加到缓存（LRU）
    _addToCache(key, audioData, params, textLength) {
        // 容量检查：删除最旧的
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, {
            audioData,
            params: { ...params },
            savedAt: Date.now(),
            textLength
        });
        
        // 触发统计更新回调
        if (this.onStatsUpdate) {
            this.onStatsUpdate(this.getStats());
        }
    }
    
    // 获取统计
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const avgTime = this.stats.synthesisCount > 0 
            ? Math.round(this.stats.totalSynthesisTime / this.stats.synthesisCount)
            : 0;
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(1) : 0,
            cacheSize: this.cache.size,
            pendingCount: this.pendingSynthesis.size,
            synthesizedChars: this.stats.synthesizedChars || 0,
            avgSynthesisTime: avgTime,  // 平均合成耗时(ms)
            windowSize: this.config.windowSize
        };
    }
    
    // 清空
    clear() {
        this.cache.clear();
        this.pendingSynthesis.clear();
        this.stats = { hits: 0, misses: 0, synthesizedChars: 0, totalSynthesisTime: 0, synthesisCount: 0 };
    }
    
    stop() {
        this.currentKey = null;
        // 增加 speakId，使所有正在进行的旧请求失效
        this.currentSpeakId++;
        // console.log('[AzureTTS] 停止朗读，旧请求 ID 已失效');
    }
};

// console.log('[AzureTTS] TaskManager v3 已加载（向前看窗口）');
