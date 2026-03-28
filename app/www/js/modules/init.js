// ==================== 20. 初始化入口 ====================

Lumina.init = async () => {
    Lumina.Settings.load();
    Lumina.State.app.dbReady = false;

    if (Lumina.State.settings.chapterRegex || Lumina.State.settings.sectionRegex) {
        Lumina.Parser.RegexCache.updateCustomPatterns(Lumina.State.settings.chapterRegex, Lumina.State.settings.sectionRegex);
    }

    Lumina.UI.init();

    Lumina.DB.adapter = new Lumina.DB.StorageAdapter();

    // 检测运行环境：Capacitor > Web SQLite > IndexedDB
    const isCapacitor = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
    let STORAGE_BACKEND = isCapacitor ? 'capacitor' : (location.href.startsWith('http') ? 'sqlite' : 'indexeddb');
    let isFallback = false;
    let actualMode = 'indexeddb';

    // APP 环境隐藏存储模式按钮（只在 Web 端显示）
    // APP 环境使用通用文件过滤器，因为 Android 不认识自定义扩展名
    if (isCapacitor) {
        const storageBtn = document.getElementById('storageIndicator');
        if (storageBtn) storageBtn.style.display = 'none';
        
        // 修改主文件输入框的 accept 属性
        const mainFileInput = document.getElementById('fileInput');
        if (mainFileInput) {
            mainFileInput.accept = '*/*';
            console.log('[Init] APP 环境：文件选择器使用通用类型 */*');
        }
    } 

    try {
        console.log('[Init] 选择存储后端:', STORAGE_BACKEND);
        const ready = await Lumina.DB.adapter.use(STORAGE_BACKEND);
        
        if (!ready && STORAGE_BACKEND === 'capacitor') {
            console.log('Capacitor SQLite failed, falling back to IndexedDB');
            isFallback = true;
            Lumina.State.app.dbReady = await Lumina.DB.adapter.use('indexeddb');
            actualMode = 'indexeddb';
        } else if (!ready && STORAGE_BACKEND === 'sqlite') {
            console.log('Web SQLite failed, falling back to IndexedDB');
            isFallback = true;
            Lumina.State.app.dbReady = await Lumina.DB.adapter.use('indexeddb');
            actualMode = 'indexeddb';
        } else if (ready && STORAGE_BACKEND === 'capacitor') {
            actualMode = 'capacitor';
            Lumina.State.app.dbReady = true;
        } else if (ready && STORAGE_BACKEND === 'sqlite') {
            actualMode = 'sqlite';
            Lumina.State.app.dbReady = true;
        } else {
            actualMode = 'indexeddb';
            Lumina.State.app.dbReady = ready;
        }
        
        console.log('[Init] 实际存储模式:', actualMode, '就绪:', Lumina.State.app.dbReady);
    } catch (e) {
        console.error('Storage init error:', e);
        Lumina.State.app.dbReady = false;
        actualMode = 'indexeddb';
    }

    // 更新指示器（确保传递正确的 mode）
    Lumina.UI.updateStorageIndicator(actualMode, isFallback);
    
    // 绑定点击事件
    const storageBtn = document.getElementById('storageIndicator');
    if (storageBtn) {
        storageBtn.addEventListener('click', Lumina.UI.showStorageInfo);
    }

    if (Lumina.State.app.dbReady) await Lumina.DB.loadHistoryFromDB();
    else {
        const history = JSON.parse(localStorage.getItem('luminaHistory') || '[]');
        Lumina.Renderer.renderHistoryFromDB(history);
    }

    Lumina.Font.preloadCritical();
    await Lumina.Settings.apply();
    Lumina.I18n.updateUI();

    Lumina.DataManager = new Lumina.DataManager();
    window.dataManager = Lumina.DataManager; // 暴露到全局供 HistoryActions 使用
    Lumina.DataManager.init();
    
    // TTS 初始化（失败不阻塞）
    try {
        Lumina.TTS.manager = new Lumina.TTS.Manager();
        await Lumina.TTS.manager.init();
    } catch (e) {
        console.error('[Init] TTS 初始化失败:', e);
        Lumina.TTS.manager = { init: () => false, toggle: () => {}, stop: () => {}, isPlaying: false };
    }
    
    // 初始化注释/书签管理器
    Lumina.Annotations.init();
    
    // 初始化 G点热力图
    Lumina.HeatMap.init();

    if (Lumina.State.app.dbReady) {
        Lumina.DataManager.currentStats = await Lumina.DB.adapter.getStorageStats();
        Lumina.DataManager.updateSettingsBar();
    }
    
    // HTTP 模式下尝试导入默认说明书
    if (!window.location.protocol.startsWith('file')) {
        await Lumina.importDefaultGuideIfNeeded();
    }

    if (!Lumina.State.app.document.items.length) {
        Lumina.DOM.sidebarLeft.classList.remove('visible');
        Lumina.DOM.readingArea.classList.remove('with-sidebar');
    }
    
    // 初始化文件打开器（处理从系统文件管理器打开的文件）
    if (Lumina.FileOpener?.tryInit) {
        console.log('[Init] 初始化 FileOpener...');
        Lumina.FileOpener.tryInit();
        
        // 检查是否有从 Android 原生层接收的待处理文件
        if (window.pendingOpenUrl) {
            console.log('[Init] 发现待处理文件:', window.pendingOpenUrl);
            const url = window.pendingOpenUrl;
            window.pendingOpenUrl = null;
            setTimeout(() => Lumina.FileOpener.handleIncomingUrl(url), 100);
        }
    }
    
    // 初始化密码预设器设置
    Lumina.Settings.initPasswordPreset();
};

// ==================== 默认说明书导入 ====================
// 仅在 HTTP(S) 模式下工作：从 guide.md 文件读取并导入
// file:// 模式下由于浏览器安全限制（CORS），无法使用 fetch，故此功能不可用
Lumina.importDefaultGuideIfNeeded = async () => {
    // 检查是否已导入过
    if (localStorage.getItem('luminaGuideImported') === 'true') return;
    if (!Lumina.State.app.dbReady) return;
    
    try {
        // 检查书库是否为空
        const files = await Lumina.DB.adapter.getAllFiles();
        if (files.length > 0) {
            localStorage.setItem('luminaGuideImported', 'true');
            return;
        }
        
        // 尝试从 guide.md 读取
        const response = await fetch('./guide.md');
        if (!response.ok) return;
        
        const text = await response.text();
        if (!text || text.length < 100) return;
        
        // 解析 Markdown
        const parsed = Lumina.Plugin?.Markdown?.Parser?.parse 
            ? Lumina.Plugin.Markdown.Parser.parse(text) 
            : Lumina.Parser.parseTXT(text);
        
        if (!parsed?.items?.length) return;
        
        // 保存到数据库
        const fileKey = `流萤阅读器使用指南.md_${text.length}_${Date.now()}`;
        const saved = await Lumina.DB.adapter.saveFile(fileKey, {
            fileName: '流萤阅读器使用指南.md',
            fileType: 'md',
            fileSize: new Blob([text]).size,
            content: parsed.items,
            wordCount: text.length,
            lastChapter: 0,
            lastScrollIndex: 0,
            chapterTitle: '',
            lastReadTime: new Date().toISOString(),
            customRegex: { chapter: '', section: '' },
            chapterNumbering: 'none',
            annotations: [],
            cover: null,
            heatMap: null
        });
        
        if (saved) {
            localStorage.setItem('luminaGuideImported', 'true');
            await Lumina.DB.loadHistoryFromDB();
            
            // 更新设置面板的 storage-info-bar
            if (Lumina.State.app.dbReady && Lumina.DataManager) {
                Lumina.DataManager.currentStats = await Lumina.DB.adapter.getStorageStats();
                Lumina.DataManager.updateSettingsBar();
            }
        }
    } catch (err) {
        // 静默失败
    }
};

// ==================== G点热力图模块 ====================
Lumina.HeatMap = {
    tags: [],
    cache: null, // 缓存计算结果
    
    init() {
        this.tagList = document.getElementById('heatTagList');
        this.input = document.getElementById('heatTagInput');
        this.analyzeBtn = document.getElementById('analyzeHeatBtn');
        
        if (!this.input) return;
        
        this.bindEvents();
        this.updateAnalyzeButton();
    },
    
    bindEvents() {
        // 回车添加
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = this.input.value.trim();
                if (value) {
                    this.parseAndAddTags(value);
                    this.input.value = '';
                }
            } else if (e.key === 'Backspace' && !this.input.value && this.tags.length > 0) {
                this.removeTag(this.tags.length - 1);
            }
        });
        
        // 粘贴自动识别
        this.input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData('text');
            this.parseAndAddTags(pasted);
        });
        
        // 失去焦点添加剩余内容
        this.input.addEventListener('blur', () => {
            const value = this.input.value.trim();
            if (value) {
                this.parseAndAddTags(value);
                this.input.value = '';
            }
        });
        
        // 分析按钮
        this.analyzeBtn?.addEventListener('click', () => this.analyze());
    },
    
    // 解析并添加 tags（支持中英文逗号、空格、换行）
    parseAndAddTags(text) {
        if (!text) return;
        
        const separators = /[,，\s\n\r\t]+/;
        const newTags = text.split(separators)
            .map(t => t.trim())
            .filter(t => t.length > 0);
        
        let changed = false;
        newTags.forEach(tag => {
            if (!this.tags.includes(tag)) {
                this.tags.push(tag);
                changed = true;
            }
        });
        
        if (changed) {
            this.renderTags();
            this.saveTags();
            this.onKeywordsChange();
        }
    },
    
    removeTag(index) {
        if (index < 0 || index >= this.tags.length) return;
        this.tags.splice(index, 1);
        this.renderTags();
        this.saveTags();
        this.onKeywordsChange();
    },
    
    renderTags() {
        if (!this.tagList) return;
        
        this.tagList.innerHTML = this.tags.map((tag, index) => `
            <span class="tag-item" data-index="${index}">
                ${Lumina.Utils.escapeHtml(tag)}
            </span>
        `).join('');
        
        this.tagList.querySelectorAll('.tag-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡，防止关闭设置面板
                this.removeTag(parseInt(el.dataset.index));
            });
        });
    },
    
    // 保存关键词到当前书本数据
    saveTags() {
        const currentFile = Lumina.State.app.currentFile;
        if (!currentFile) return;
        
        // 合并更新，保留现有的 chapters 数据
        const existingHeatMap = currentFile.heatMap || {};
        currentFile.heatMap = {
            ...existingHeatMap,
            keywords: this.tags.join(','),
            updatedAt: Date.now()
        };
        
        // 触发保存到数据库 - 使用防抖避免频繁保存
        this.debouncedPersist();
    },
    
    // 防抖持久化
    debouncedPersist: (function() {
        let timer = null;
        return function() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                this.persistToDB();
                timer = null;
            }, 500);
        };
    })(),
    
    // 从当前书本数据加载关键词
    loadTags() {
        const currentFile = Lumina.State.app.currentFile;
        const savedKeywords = currentFile?.heatMap?.keywords || '';
        
        if (savedKeywords) {
            this.tags = savedKeywords.split(',').map(t => t.trim()).filter(t => t.length > 0);
        } else {
            this.tags = []; // 新书本，清空
        }
        
        this.renderTags();
    },
    
    // 保存到数据库
    persistToDB() {
        if (!Lumina.State.app.dbReady) return;
        
        const currentFile = Lumina.State.app.currentFile;
        if (!currentFile || !currentFile.fileKey) return;
        
        // 使用增量保存模式，确保只更新 heatMap 等字段，不覆盖 content
        Lumina.DB.saveHistory(
            currentFile.name,
            currentFile.type,
            currentFile.wordCount,
            null,
            false // 增量保存
        ).catch(() => {});
    },
    
    getKeywords() {
        return this.tags;
    },
    
    // 判断是否实时分析（小文件直接分析，大文件显示按钮）
    shouldRealtime() {
        const wordCount = Lumina.State.app.currentFile?.wordCount || 0;
        return wordCount < 300000; // 30万字以下实时
    },
    
    updateAnalyzeButton() {
        if (!this.analyzeBtn) return;
        const hasTags = this.tags.length > 0;
        const isLarge = !this.shouldRealtime();
        this.analyzeBtn.style.display = (hasTags && isLarge) ? 'inline-flex' : 'none';
    },
    
    onKeywordsChange() {
        this.cache = null;
        this.updateAnalyzeButton();
        
        if (this.tags.length === 0) {
            this.clearHeat();
            return;
        }
        
        if (this.shouldRealtime()) {
            clearTimeout(this._timer);
            this._timer = setTimeout(() => this.analyze(), 300);
        }
    },
    
    // 核心分析算法 - 遍历 items 收集一级和二级标题
    async analyze() {
        if (this.tags.length === 0) {
            this.clearHeat();
            return;
        }
        
        const items = Lumina.State.app.document?.items || [];
        const chapters = Lumina.State.app.chapters || [];
        if (items.length === 0) return;
        
        // 收集器：一级标题和二级标题
        // 与 generateTOC 逻辑一致：title/heading1/level-0 = 一级, subtitle/heading2 = 二级
        const level1Titles = []; // { index, title, startIndex, endIndex, wordCount, matchCount }
        const level2Titles = []; // { index, title, startIndex, endIndex, wordCount, matchCount }
        
        // 查找前言章节（如果有），前言视同 level-1
        const prefaceChapter = chapters.find(ch => ch.isPreface);
        if (prefaceChapter) {
            // 前言作为一个特殊的"标题"，使用 chapter.startIndex
            level1Titles.push({
                index: prefaceChapter.startIndex,
                title: Lumina.I18n.t('preface') || '前言',
                startIndex: prefaceChapter.startIndex,
                endIndex: prefaceChapter.endIndex,
                wordCount: 0,
                matchCount: 0,
                isPreface: true
            });
        }
        
        // 遍历 items，识别标题
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const type = item.type || '';
            
            let isLevel1 = false;
            let isLevel2 = false;
            let titleText = '';
            
            // 与 generateTOC 逻辑保持一致
            if (type === 'title' || type === 'heading1') {
                isLevel1 = true;
                titleText = item.display || item.text || '';
            } else if (type === 'subtitle' || type === 'heading2') {
                isLevel2 = true;
                titleText = item.display || item.text || '';
            } else if (type.startsWith('heading')) {
                const level = parseInt(type.replace('heading', '')) || 1;
                if (level === 1 || level === 0) {
                    isLevel1 = true;
                    titleText = item.display || item.text || '';
                } else if (level === 2) {
                    isLevel2 = true;
                    titleText = item.display || item.text || '';
                }
            }
            
            if (isLevel1) {
                level1Titles.push({
                    index: i,
                    title: titleText,
                    startIndex: i,
                    endIndex: items.length - 1, // 暂时设为末尾，后续修正
                    wordCount: 0,
                    matchCount: 0
                });
            } else if (isLevel2) {
                level2Titles.push({
                    index: i,
                    title: titleText,
                    startIndex: i,
                    endIndex: items.length - 1, // 暂时设为末尾，后续修正
                    wordCount: 0,
                    matchCount: 0
                });
            }
        }
        
        // 修正每个一级标题的结束位置（下一个一级标题之前）
        for (let i = 0; i < level1Titles.length; i++) {
            if (i < level1Titles.length - 1) {
                level1Titles[i].endIndex = level1Titles[i + 1].index - 1;
            }
        }
        
        // 修正每个二级标题的结束位置（下一个二级标题之前）
        for (let i = 0; i < level2Titles.length; i++) {
            if (i < level2Titles.length - 1) {
                level2Titles[i].endIndex = level2Titles[i + 1].index - 1;
            }
        }
        
        // 统计每个标题范围内的内容
        this.calculateTitleHeat(level1Titles, items);
        this.calculateTitleHeat(level2Titles, items);
        
        // 找到两个维度中的最大热度，作为100%基准
        let maxHeat = 0;
        [...level1Titles, ...level2Titles].forEach(t => {
            if (t.matchCount > maxHeat) maxHeat = t.matchCount;
        });
        
        // 计算每个标题的宽度百分比（基于最大热度）
        const allTitles = [...level1Titles, ...level2Titles];
        allTitles.forEach(t => {
            t.widthPercent = maxHeat > 0 ? Math.min(100, (t.matchCount / maxHeat) * 100) : 0;
        });
        
        // 保存和渲染
        this.cache = allTitles;
        this.render(allTitles);
        await this.saveAnalysisToBook(allTitles);
    },
    
    // 计算标题范围内的热度
    calculateTitleHeat(titles, items) {
        titles.forEach(title => {
            // 提取范围内的文本
            let text = '';
            for (let i = title.startIndex; i <= title.endIndex && i < items.length; i++) {
                text += (items[i].text || '') + ' ';
            }
            
            // 统计字数
            title.wordCount = text.length;
            
            // 统计关键词匹配
            this.tags.forEach(tag => {
                const regex = new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                const matches = text.match(regex);
                if (matches) title.matchCount += matches.length;
            });
        });
    },
    
    render(heatData) {
        heatData.forEach(data => {
            const selector = `.toc-item[data-index="${data.index}"]`;
            const elements = document.querySelectorAll(selector);
            
            if (elements.length > 0) {
                elements.forEach(el => {
                    el.style.setProperty('--heat-width', `${data.widthPercent}%`);
                    el.dataset.hasHeat = 'true';
                });
            }
        });
    },
    
    clearHeat() {
        document.querySelectorAll('.toc-item[data-has-heat]').forEach(el => {
            el.style.removeProperty('--heat-width');
            el.removeAttribute('data-has-heat');
        });
    },
    
    saveAnalysisToBook(heatData) {
        const currentFile = Lumina.State.app.currentFile;
        if (!currentFile || !currentFile.fileKey) {
            console.warn('[HeatMap] 无法保存：没有 fileKey');
            return;
        }
        
        // 合并更新，确保保留 keywords
        currentFile.heatMap = {
            keywords: this.tags.join(','),
            chapters: heatData.map(h => ({
                index: h.index,
                width: Math.round(h.widthPercent)
            })),
            updatedAt: Date.now()
        };
        
        // 触发数据库保存 - 立即保存，不使用防抖
        this.persistToDB();
    },
    
    restoreFromBook() {
        const currentFile = Lumina.State.app.currentFile;
        const heatMap = currentFile?.heatMap;
        
        if (heatMap && heatMap.keywords === this.tags.join(',') && heatMap.chapters) {
            heatMap.chapters.forEach(h => {
                const elements = document.querySelectorAll(`.toc-item[data-index="${h.index}"]`);
                elements.forEach(el => {
                    el.style.setProperty('--heat-width', `${h.width}%`);
                    el.dataset.hasHeat = 'true';
                });
            });
            return true;
        }
        return false;
    },
    
    // 打开书本时调用
    onBookOpen() {
        this.loadTags();
        this.cache = null;
        this.updateAnalyzeButton();
        
        // 如果有关键词，延迟等待目录渲染完成后恢复热力显示
        if (this.tags.length > 0) {
            setTimeout(() => {
                if (!this.restoreFromBook() && this.shouldRealtime()) {
                    this.analyze();
                }
            }, 600);
        } else {
            this.clearHeat();
        }
    }
};

// 页面获得焦点时自动刷新（防止其他窗口操作后数据不同步）
window.addEventListener('focus', () => {
    if (Lumina.DB.adapter instanceof Lumina.DB.SQLiteImpl && 
        Lumina.DB.adapter.isReady) {
        
        // 如果书库面板正打开，静默刷新
        if (document.getElementById('dataManagerPanel')?.classList.contains('active')) {
            Lumina.DB.adapter.getStorageStats(true).then(stats => {
                if (Lumina.DataManager) {
                    Lumina.DataManager.updateGridSilently(stats);
                }
            }).catch(() => {}); // 静默失败
        }
    }
});

// 启动
document.addEventListener('DOMContentLoaded', Lumina.init);