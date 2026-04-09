// ==================== 简繁转换模块 ====================
// 字符级转换，保证字数不变，完美支持索引对齐

Lumina.Converter = {
    // 运行状态
    enabled: false,           // 全局开关
    isConverting: false,      // 当前是否正在转换
    bookLanguage: null,       // 书籍检测到的语言 'zh-CN' | 'zh-TW'
    uiLanguage: null,         // 当前UI语言
    direction: null,          // 转换方向 's2t' | 't2s' | null
    
    // OpenCC 字典映射表
    s2tMap: null,             // 简->繁映射（从文件加载）
    t2sMap: null,             // 繁->简映射（从文件加载）
    dictLoaded: false,        // 字典是否已加载
    
    // 缓存（按 filekey）
    cache: new Map(),
    currentCache: null,
    
    // 初始化
    async init() {
        // console.log('[Converter] init() 开始执行');
        
        // 读取开关设置
        try {
            this.enabled = Lumina.ConfigManager.get('reading.autoConvertSC') ?? false;
        } catch (e) {
            this.enabled = false;
        }
        
        // 读取 UI 语言（简化逻辑，确保有值）
        this.uiLanguage = 'zh'; // 先设置默认值
        try {
            const lang = Lumina.ConfigManager.get('reading.language');
            if (lang) this.uiLanguage = lang;
        } catch (e) {
            // 使用默认值
        }
        
        // log('[Converter] 初始化完成，UI语言:', this.uiLanguage, '开关状态:', this.enabled);
        
        // 【关键】先注册事件监听器，再加载字典，避免事件丢失
        this._setupEventListeners();
        
        // 异步加载 OpenCC 字典（不阻塞事件监听）
        this.loadDictionaries().then(() => {
            // console.log('[Converter] 字典加载完成，检查是否有待处理文件');
            // 如果字典加载期间有文件已打开，重新检测
            if (Lumina.State.app.currentFile?.fileKey && !this.bookLanguage) {
                this.onFileOpened(Lumina.State.app.currentFile.fileKey);
            }
        });
    },
    
    /**
     * 设置事件监听器（必须在初始化早期调用）
     */
    _setupEventListeners() {
        // 监听语言变化
        window.addEventListener('languageChanged', (e) => {
            // console.log('[Converter] 语言变化事件:', e.detail?.language);
            if (e.detail?.language) {
                this.uiLanguage = e.detail.language;
                this.onUILanguageChanged();
            }
        });
        
        // 监听文件打开
        window.addEventListener('fileOpened', async (e) => {
            try {
                const fileKey = e.detail?.fileKey;
                // console.log('[Converter] 收到 fileOpened 事件:', fileKey);
                if (fileKey) {
                    await this.onFileOpened(fileKey);
                }
            } catch (err) {
                console.error('[Converter] fileOpened 处理失败:', err);
            }
        });
        
        // 监听文件关闭
        window.addEventListener('fileClosed', (e) => {
            try {
                const fileKey = e.detail?.fileKey;
                // console.log('[Converter] 收到 fileClosed 事件:', fileKey);
                if (fileKey) {
                    this.onFileClosed(fileKey);
                }
            } catch (err) {
                console.error('[Converter] fileClosed 处理失败:', err);
            }
        });
        
        // console.log('[Converter] 事件监听器已注册');
    },
    
    /**
     * 加载 OpenCC 字典文件
     */
    async loadDictionaries() {
        try {
            // 尝试加载字典文件
            const [stResponse, tsResponse] = await Promise.all([
                fetch('./assets/js/lib/opencc/STCharacters.txt').catch(() => null),
                fetch('./assets/js/lib/opencc/TSCharacters.txt').catch(() => null)
            ]);
            
            if (stResponse?.ok && tsResponse?.ok) {
                const [stText, tsText] = await Promise.all([
                    stResponse.text(),
                    tsResponse.text()
                ]);
                
                this.s2tMap = this.parseDictionary(stText);
                this.t2sMap = this.parseDictionary(tsText);
                this.dictLoaded = true;
                // console.log('[Converter] OpenCC 字典加载成功，映射数:', Object.keys(this.s2tMap).length);
            } else {
                throw new Error('字典文件不存在');
            }
        } catch (e) {
            // 使用内置降级映射表
            console.log('[Converter] 没有找到字典:', e.message);
            this.dictLoaded = false;
        }
    },
    
    /**
     * 解析字典文件
     */
    parseDictionary(text) {
        const map = {};
        const lines = text.split('\n');
        
        for (const line of lines) {
            // 跳过注释和空行
            if (!line || line.startsWith('#')) continue;
            
            const parts = line.split('\t');
            if (parts.length >= 2) {
                const from = parts[0].trim();
                // 取第一个映射（最常用），忽略其他
                const to = parts[1].trim().split(' ')[0];
                if (from && to && from.length === to.length) {
                    map[from] = to;
                }
            }
        }
        
        return map;
    },
    
    /**
     * 文件打开时检测语言并准备转换
     */
    async onFileOpened(fileKey) {
        if (!fileKey) return;
        
        // console.log('[Converter] onFileOpened:', fileKey);
        
        // 恢复或创建缓存
        if (this.cache.has(fileKey)) {
            this.currentCache = this.cache.get(fileKey);
        } else {
            this.currentCache = {
                fileKey,
                bookLanguage: null,
                isConverting: false,
                direction: null,
                itemCache: new Map()  // 行级转换缓存
            };
            this.cache.set(fileKey, this.currentCache);
        }
        
        // 确保字典已加载
        if (!this.dictLoaded) {
            // console.log('[Converter] 等待字典加载...');
            await this.loadDictionaries();
        }
        
        // 检测书籍语言
        await this.detectBookLanguage();
        
        // 评估是否需要转换
        this.evaluateConversion();
        
        // console.log('[Converter] 文件打开处理完成:', { 
        //     bookLanguage: this.bookLanguage, 
        //     isConverting: this.isConverting 
        // });
        
        // 如果需要转换，触发重新渲染
        if (this.isConverting) {
            // console.log('[Converter] 需要转换，触发重新渲染');
            Lumina.Renderer?.renderCurrentChapter?.();
            Lumina.Renderer?.generateTOC?.();
            Lumina.Renderer?.updateChapterNavInfo?.();
            Lumina.I18n?.updateUI?.();
        }
    },
    
    /**
     * 文件关闭时清理内存
     */
    onFileClosed(fileKey) {
        if (!fileKey || !this.currentCache) return;
        
        // 清理 items 上的运行时缓存
        const items = Lumina.State.app.document.items;
        if (items) {
            items.forEach(item => {
                delete item._convertCache;
            });
        }
        
        // 清空当前缓存的 itemCache（释放内存）
        if (this.currentCache.itemCache) {
            this.currentCache.itemCache.clear();
        }
        
        this.currentCache = null;
        this.isConverting = false;
    },
    
    /**
     * 检测书籍语言（优先使用元数据）
     */
    detectBookLanguage() {
        const currentFile = Lumina.State.app.currentFile;
        if (!currentFile?.fileKey) return;
        
        // 1. 优先使用缓存的检测结果
        if (this.currentCache?.bookLanguage) {
            this.bookLanguage = this.currentCache.bookLanguage;
            return;
        }
        
        // 2. 检查元数据中的语言
        const metadata = currentFile.metadata;
        const confidence = metadata?._extracted?.confidence?.language ?? 0;
        // console.log('[Converter] 检测书籍语言，元数据:', metadata?.language, '置信度:', confidence);
        
        // 用户手动设置的语言（confidence=100）或自动检测的语言名称都尝试解析
        if (metadata?.language) {
            // 对于中文名称，尝试直接解析
            const parsed = this.parseLanguage(metadata.language);
            // console.log('[Converter] 解析元数据语言:', metadata.language, '->', parsed?.code);
            
            if (parsed && confidence === 100) {
                // 高置信度（用户手动设置）直接使用
                this.bookLanguage = parsed.code;
                this.currentCache.bookLanguage = parsed.code;
                // console.log('[Converter] 使用手动设置的语言:', parsed.code);
                return;
            }
        }
        
        // 3. 自动检测（采样分析）
        const detected = this.detectBySampling();
        this.bookLanguage = detected;
        if (this.currentCache) {
            this.currentCache.bookLanguage = detected;
        }
        // console.log('[Converter] 采样检测结果:', detected);
    },
    
    /**
     * 解析语言名称为简繁代码
     * 元数据中存储的是语言名称（如"简体中文"），需要映射到代码
     */
    parseLanguage(langName) {
        if (!langName) return null;
        
        // console.log('[Converter] parseLanguage 输入:', langName, 'Config.languages:', Lumina.Config?.languages?.length);
        
        // 从 Lumina.Config.languages 查找对应的语言代码
        const langConfig = Lumina.Config?.languages?.find(l => l.name === langName);
        if (langConfig) {
            // console.log('[Converter] 找到语言配置:', langConfig);
            if (langConfig.code === 'zh') {
                return { code: 'zh-CN', name: langName };
            }
            if (langConfig.code === 'zh-TW') {
                return { code: 'zh-TW', name: langName };
            }
            // 其他语言返回 null（不参与简繁转换）
            return null;
        }
        
        // 兜底：根据常见名称匹配
        const nameMap = {
            '简体中文': 'zh-CN',
            '繁體中文': 'zh-TW',
            '繁体中文': 'zh-TW'
        };
        
        if (nameMap[langName]) {
            // console.log('[Converter] 使用兜底映射:', langName, '->', nameMap[langName]);
            return { code: nameMap[langName], name: langName };
        }
        
        // console.log('[Converter] 无法解析语言:', langName);
        return null;
    },
    
    /**
     * 采样检测书籍简繁类型
     * @returns {'zh-CN' | 'zh-TW' | null}
     */
    detectBySampling() {
        const items = Lumina.State.app.document?.items;
        if (!items?.length) return null;
        
        // 过滤出有效文本段落，累计字数
        const paragraphs = items
            .filter(item => item.type === 'paragraph' && item.text?.trim())
            .map((item, index) => ({
                text: item.text,
                index: index,
                length: item.text.length
            }));
        
        if (paragraphs.length === 0) return null;
        
        // 按字数计算采样点（更均匀）
        const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0);
        const targetPositions = [
            totalChars * 0.2,
            totalChars * 0.5,
            totalChars * 0.8
        ];
        
        let currentChars = 0;
        const samples = [];
        let paraIdx = 0;
        
        for (const target of targetPositions) {
            while (paraIdx < paragraphs.length && 
                currentChars + paragraphs[paraIdx].length < target) {
                currentChars += paragraphs[paraIdx].length;
                paraIdx++;
            }
            if (paragraphs[paraIdx]) {
                samples.push(paragraphs[paraIdx].text);
            }
        }
        
        return this.analyzeScript(samples.join(''));
    },
    
    /**
     * 分析文本的简繁类型
     * @returns {'zh-CN' | 'zh-TW' | null} 返回 null 表示无法确定
     */
    analyzeScript(text) {
        if (!text) return null;
        
        // 先检查是否包含中文字符
        const hasChinese = /[\u4e00-\u9fa5]/.test(text);
        if (!hasChinese) {
            // console.log('[Converter] 无中文字符，无法确定简繁');
            return null;
        }
        
        // 使用已加载的 OpenCC 字典进行检测（更全更准确）
        let scScore = 0, tcScore = 0, totalChecks = 0;
        
        // 遍历采样文本的每个字符
        for (const char of text) {
            // 检查是否是简体中文特征（在 s2tMap 中）
            if (this.s2tMap && this.s2tMap[char]) {
                scScore++;
                totalChecks++;
            }
            // 检查是否是繁体中文特征（在 t2sMap 中）
            else if (this.t2sMap && this.t2sMap[char]) {
                tcScore++;
                totalChecks++;
            }
        }
        
        // console.log('[Converter] 检测得分:', { scScore, tcScore, totalChecks, sample: text.substring(0, 50) });
        
        // 置信度机制：
        // 1. 至少需要3个特征字符才进行判断
        // 2. 某一方占比超过60%就算确定（降低阈值以提高覆盖率）
        const MIN_SAMPLES = 3;
        const CONFIDENCE_THRESHOLD = 0.6;
        
        if (totalChecks < MIN_SAMPLES) {
            // console.log(`[Converter] 样本不足(${totalChecks}<${MIN_SAMPLES})，无法确定`);
            return null;
        }
        
        const scRatio = scScore / totalChecks;
        const tcRatio = tcScore / totalChecks;
        
        if (scRatio >= CONFIDENCE_THRESHOLD) {
            // console.log(`[Converter] 高置信度判定为简体(${ (scRatio*100).toFixed(1) }%)`);
            return 'zh-CN';
        }
        if (tcRatio >= CONFIDENCE_THRESHOLD) {
            // console.log(`[Converter] 高置信度判定为繁体(${ (tcRatio*100).toFixed(1) }%)`);
            return 'zh-TW';
        }
        
        // 无明显差异，无法确定
        // console.log(`[Converter] 置信度不足(简体${ (scRatio*100).toFixed(1) }%, 繁体${ (tcRatio*100).toFixed(1) }%)`);
        return null;
    },
    
    /**
     * 评估是否需要转换
     */
    evaluateConversion() {
        if (Lumina.State.app.currentFile.wordCount === 0) return;
        console.log('[Converter] 评估转换:', {
            enabled: this.enabled,
            bookLanguage: this.bookLanguage,
            uiLanguage: this.uiLanguage
        });
        
        if (!this.enabled) {
            this.isConverting = false;
            this.direction = null;
            console.log('[Converter] 不转换: 开关关闭');
            return;
        }
        
        if (!this.bookLanguage) {
            this.isConverting = false;
            this.direction = null;
            console.log('[Converter] 不转换: 无法确定书籍语言');
            return;
        }
        
        const uiIsTrad = this.uiLanguage === 'zh1';
        const bookIsTrad = this.bookLanguage === 'zh-TW';
        
        // UI和书籍简繁类型不同，需要转换
        if (uiIsTrad !== bookIsTrad) {
            this.isConverting = true;
            this.direction = bookIsTrad ? 't2s' : 's2t';
            console.log('[Converter] 需要转换:', this.direction);
        } else {
            this.isConverting = false;
            this.direction = null;
            console.log('[Converter] 无需转换: 语言相同或不相关');
        }
        
        // 更新缓存
        if (this.currentCache) {
            this.currentCache.isConverting = this.isConverting;
            this.currentCache.direction = this.direction;
        }
    },
    
    /**
     * UI语言变化时的处理
     */
    onUILanguageChanged() {
        if (!Lumina.State.app.document.items.length) return;
        
        const wasConverting = this.isConverting;
        this.evaluateConversion();
        
        // 转换状态变化，需要重新渲染
        if (wasConverting !== this.isConverting) {
            // 清除行级缓存
            this.currentCache?.itemCache?.clear();
            
            // 触发重新渲染
            Lumina.Renderer.renderCurrentChapter();
            Lumina.Renderer.generateTOC();
            Lumina.Renderer.updateChapterNavInfo();
            Lumina.Annotations.renderAnnotations();
        }
    },
    
    /**
     * 设置转换开关
     */
    setEnabled(enabled) {
        const wasConverting = this.isConverting;
        this.enabled = enabled;
        
        // 重新评估
        this.evaluateConversion();
        
        // 状态变化时刷新
        if (wasConverting !== this.isConverting && Lumina.State.app.document.items.length > 0) {
            this.currentCache?.itemCache?.clear();
            
            Lumina.Renderer.renderCurrentChapter();
            Lumina.Renderer.generateTOC();
            Lumina.Renderer.updateChapterNavInfo();
            Lumina.Annotations.renderAnnotations();
        }
        
        return this.isConverting;
    },
    
    /**
     * 转换文本（核心方法）
     */
    convert(text) {
        if (!text || !this.isConverting || !this.dictLoaded) return text;
        
        const map = this.direction === 's2t' ? this.s2tMap : this.t2sMap;
        if (!map) return text;
        
        let result = '';
        for (const char of text) {
            result += map[char] || char;
        }
        return result;
    },
    
    /**
     * 获取转换后的文本（带缓存）
     */
    getConvertedText(item, index) {
        if (!this.isConverting || !item) {
            return item?.display || item?.text || '';
        }
        
        // 检查缓存
        if (this.currentCache?.itemCache?.has(index)) {
            return this.currentCache.itemCache.get(index);
        }
        
        // 转换并缓存
        const original = item.display || item.text || '';
        const converted = this.convert(original);
        
        if (this.currentCache) {
            this.currentCache.itemCache.set(index, converted);
        }
        
        // 同时在 item 上缓存（便于其他模块使用）
        item._convertCache = converted;
        
        return converted;
    },
    
    /**
     * 降级转换（指定方向）
     */
    fallbackConvert(text, direction = null) {
        if (!text) return '';
        
        const dir = direction || this.direction;
        const map = dir === 's2t' ? this.s2tMap : this.t2sMap;
        if (!map) return text;
        
        let result = '';
        for (const char of text) {
            result += map[char] || char;
        }
        return result;
    },
    
    /**
     * 获取显示书名（支持简繁转换）
     * 优先用 metadata.title，否则用文件名（去扩展名）
     */
    getDisplayTitle(fileData) {
        if (!fileData) return '';
        
        // 优先用 metadata.title，否则用文件名（去扩展名）
        let title = fileData.metadata?.title 
            || fileData.fileName?.replace(/\.[^/.]+$/, '') 
            || fileData.name?.replace(/\.[^/.]+$/, '') 
            || fileData.fileName 
            || fileData.name 
            || '';
        
        // 简繁转换
        if (this.isConverting && title) {
            title = this.convert(title);
        }
        
        return title;
    },
};

// 模块加载自检
// console.log('[Converter] 模块已加载，对象存在:', !!Lumina.Converter);
