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

    if (Lumina.State.app.dbReady) {
        await Lumina.DB.loadHistoryFromDB();
    } else {
        const history = JSON.parse(localStorage.getItem('luminaHistory') || '[]');
        Lumina.Renderer.renderHistoryFromDB(history);
    }

    Lumina.Font.preloadCritical();
    
    // 初始化配置管理器（首次使用会自动迁移旧配置）
    Lumina.Settings.load();
    
    // 初始化配置备份功能（安全检查）
    if (typeof Lumina.Settings.initConfigBackup === 'function') {
        Lumina.Settings.initConfigBackup();
    } else {
        console.warn('[Init] initConfigBackup 方法未找到，可能正在使用缓存版本');
    }
    
    await Lumina.Settings.apply();
    Lumina.I18n.updateUI();

    Lumina.DataManager = new Lumina.DataManager();
    window.dataManager = Lumina.DataManager; // 暴露到全局供 HistoryActions 使用
    Lumina.DataManager.init();
    
    // 预加载书库面板（静默，不阻塞）
    if (Lumina.State.app.dbReady) {
        Lumina.DataManager.preload().catch(() => {});
    }
    
    // 显示书库按钮（DataManager 初始化完成后）
    const libraryBtn = document.getElementById('libraryBtn');
    if (libraryBtn) libraryBtn.style.display = '';
    
    // 初始化书籍详情面板
    Lumina.BookDetail.init();
    
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
        // 使用 DataManager.preload() 以复用请求和防止竞争
        await Lumina.DataManager.preload();
        Lumina.DataManager.updateSettingsBar();
    }
    
    // 显示缓存管理按钮（仅Web SQLite模式）
    const cacheManagerBtn = document.getElementById('openCacheManager');
    if (cacheManagerBtn) {
        const isWebSQLite = Lumina.DB.adapter?.impl instanceof Lumina.DB.SQLiteImpl;
        cacheManagerBtn.style.display = isWebSQLite ? 'block' : 'none';
    }
    
    // HTTP 模式下尝试导入默认说明书
    if (!window.location.protocol.startsWith('file')) {
        await Lumina.importDefaultGuideIfNeeded();
    }

    if (!Lumina.State.app.document.items.length) {
        Lumina.DOM.sidebarLeft.classList.remove('visible');
        Lumina.DOM.readingArea.classList.remove('with-sidebar');
    }
    
    // 延迟初始化非关键模块，避免阻塞 UI
    requestIdleCallback?.(() => {
        // 初始化密码预设器设置（FileOpener 在 file-opener-bridge.js 加载后自动初始化）
        Lumina.Settings.initPasswordPreset();
    }) ?? setTimeout(() => {
        Lumina.Settings.initPasswordPreset();
    }, 100);
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
            lastReadTime: Lumina.DB.getLocalTimeString(),
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
                await Lumina.DataManager.preload();
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
    presets: [], // 标签预设列表
    // 使用统一配置管理器，不再需要独立的 STORAGE_KEY
    
    init() {
        this.tagList = document.getElementById('heatTagList');
        this.input = document.getElementById('heatTagInput');
        this.analyzeBtn = document.getElementById('analyzeHeatBtn');
        
        if (!this.input) return;
        
        this.loadPresets();
        this.bindEvents();
        this.bindPresetsEvents();
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
    
    // 预设面板事件绑定
    bindPresetsEvents() {
        const presetsBtn = document.getElementById('heatMapPresetsBtn');
        const presetsDialog = document.getElementById('heatMapPresetsDialog');
        const presetsClose = document.getElementById('heatMapPresetsClose');
        
        if (presetsBtn) {
            presetsBtn.addEventListener('click', () => {
                this.openPresetsDialog();
            });
        }
        
        if (presetsClose) {
            presetsClose.addEventListener('click', () => {
                presetsDialog?.classList.remove('active');
            });
        }
        
        // 点击遮罩关闭
        presetsDialog?.addEventListener('click', (e) => {
            if (e.target === presetsDialog) {
                presetsDialog.classList.remove('active');
            }
        });
        
        // 添加预设按钮
        const addBtn = document.getElementById('heatPresetAddBtn');
        addBtn?.addEventListener('click', () => this.addPreset());
        
        // 预设面板中的标签输入
        const presetTagInput = document.getElementById('heatPresetTagInput');
        const presetTagList = document.getElementById('heatPresetTagList');
        
        if (presetTagInput) {
            presetTagInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const value = presetTagInput.value.trim();
                    if (value) {
                        this.parsePresetTags(value);
                        presetTagInput.value = '';
                    }
                } else if (e.key === 'Backspace' && !presetTagInput.value) {
                    this.removePresetTag(-1);
                }
            });
            
            presetTagInput.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasted = e.clipboardData.getData('text');
                this.parsePresetTags(pasted);
            });
            
            presetTagInput.addEventListener('blur', () => {
                const value = presetTagInput.value.trim();
                if (value) {
                    this.parsePresetTags(value);
                    presetTagInput.value = '';
                }
            });
        }
    },
    
    // 打开预设面板
    openPresetsDialog() {
        this.tempPresetTags = [];
        this.renderPresetsList();
        this.renderPresetTags();
        document.getElementById('heatPresetNameInput').value = '';
        document.getElementById('heatMapPresetsDialog')?.classList.add('active');
    },
    
    // 加载预设（从 ConfigManager）
    loadPresets() {
        try {
            const presets = Lumina.ConfigManager.get('heatMap.presets');
            if (presets && Array.isArray(presets)) {
                this.presets = presets;
            } else {
                this.presets = [];
            }
        } catch (e) {
            console.warn('[HeatMap] 加载预设失败:', e);
            this.presets = [];
        }
    },
    
    // 保存预设（到 ConfigManager）
    savePresets() {
        try {
            Lumina.ConfigManager.set('heatMap.presets', this.presets);
        } catch (e) {
            console.warn('[HeatMap] 保存预设失败:', e);
        }
    },
    
    // 添加预设
    addPreset() {
        const nameInput = document.getElementById('heatPresetNameInput');
        const name = nameInput.value.trim();
        
        if (!name || this.tempPresetTags.length === 0) {
            return;
        }
        
        this.presets.push({
            id: Date.now(),
            name,
            tags: [...this.tempPresetTags],
            createdAt: Date.now()
        });
        
        this.savePresets();
        this.renderPresetsList();
        
        nameInput.value = '';
        this.tempPresetTags = [];
        this.renderPresetTags();
    },
    
    // 删除预设
    removePreset(id) {
        this.presets = this.presets.filter(p => p.id !== id);
        this.savePresets();
        this.renderPresetsList();
    },
    
    // 应用预设到当前小说
    applyPreset(id) {
        const preset = this.presets.find(p => p.id === id);
        if (!preset) return;
        
        this.tags = [...preset.tags];
        this.renderTags();
        this.saveTags();
        this.onKeywordsChange();
        
        document.getElementById('heatMapPresetsDialog')?.classList.remove('active');
        Lumina.UI?.showToast?.(Lumina.I18n.t('presetApplied')?.replace?.('{name}', preset.name) || `已应用预设: ${preset.name}`);
    },
    
    // 复制预设 tags 到剪贴板
    async copyPreset(id) {
        const preset = this.presets.find(p => p.id === id);
        if (!preset) return;
        
        const text = preset.tags.join(', ');
        try {
            await navigator.clipboard.writeText(text);
            Lumina.UI?.showToast?.(Lumina.I18n.t('presetCopied')?.replace?.('{name}', preset.name) || `已复制预设 "${preset.name}" 的标签`);
        } catch (err) {
            // 降级方案
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                Lumina.UI?.showToast?.(Lumina.I18n.t('presetCopied')?.replace?.('{name}', preset.name) || `已复制预设 "${preset.name}" 的标签`);
            } catch (e) {
                Lumina.UI?.showToast?.(Lumina.I18n.t('copyFailed') || '复制失败');
            }
            document.body.removeChild(textarea);
        }
    },
    
    // 渲染预设列表
    renderPresetsList() {
        const container = document.getElementById('heatPresetsList');
        if (!container) return;
        
        if (this.presets.length === 0) {
            container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 24px 4px;">${Lumina.I18n.t('noPresets')}</div>`;
            return;
        }
        
        container.innerHTML = this.presets.map(preset => `
            <div class="heat-preset-item">
                <div>
                    <div class="preset-name">${Lumina.Utils.escapeHtml(preset.name)}</div>
                    <div class="preset-tags">
                        ${Lumina.Utils.escapeHtml(preset.tags.join(', '))}
                    </div>
                </div>
                <div class="preset-actions">
                    <button class="btn-icon heat-preset-btn" onclick="Lumina.HeatMap.applyPreset(${preset.id})" data-tooltip="${Lumina.I18n.t('apply') || '应用'}">
                        <svg class="icon" style="width: 18px; height: 18px;"><use href="#icon-check" /></svg>
                    </button>
                    <button class="btn-icon heat-preset-btn" onclick="Lumina.HeatMap.copyPreset(${preset.id})" data-tooltip="${Lumina.I18n.t('copy') || '复制'}">
                        <svg class="icon" style="width: 18px; height: 18px;"><use href="#icon-copy" /></svg>
                    </button>
                    <button class="btn-icon heat-preset-btn" onclick="Lumina.HeatMap.removePreset(${preset.id})" data-tooltip="${Lumina.I18n.t('delete') || '删除'}">
                        <svg class="icon" style="width: 18px; height: 18px;"><use href="#icon-delete" /></svg>
                    </button>
                </div>
            </div>
        `).join('');
    },
    
    // 临时预设标签操作
    tempPresetTags: [],
    
    parsePresetTags(text) {
        if (!text) return;
        const separators = /[,，\s\n\r\t]+/;
        const newTags = text.split(separators)
            .map(t => t.trim())
            .filter(t => t.length > 0);
        
        newTags.forEach(tag => {
            if (!this.tempPresetTags.includes(tag)) {
                this.tempPresetTags.push(tag);
            }
        });
        this.renderPresetTags();
    },
    
    removePresetTag(index) {
        if (index === -1) {
            this.tempPresetTags.pop();
        } else {
            this.tempPresetTags.splice(index, 1);
        }
        this.renderPresetTags();
    },
    
    renderPresetTags() {
        const tagList = document.getElementById('heatPresetTagList');
        if (!tagList) return;
        
        tagList.innerHTML = this.tempPresetTags.map((tag, index) => `
            <span class="tag-item" onclick="Lumina.HeatMap.removePresetTag(${index})">
                ${Lumina.Utils.escapeHtml(tag)}
            </span>
        `).join('');
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
        // 强制重新获取DOM元素，确保引用的元素存在
        const tagList = document.getElementById('heatTagList');
        if (!tagList) return;
        
        tagList.innerHTML = this.tags.map((tag, index) => `
            <span class="tag-item" data-index="${index}">
                ${Lumina.Utils.escapeHtml(tag)}
            </span>
        `).join('');
        
        tagList.querySelectorAll('.tag-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
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
        
        // 强制重新获取DOM并渲染
        this.tagList = document.getElementById('heatTagList');
        this.input = document.getElementById('heatTagInput');
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
    
    // 核心分析算法 - 双维度：宽度=章节长度，透明度=G点热度
    async analyze() {
        if (this.tags.length === 0) {
            this.clearHeat();
            return;
        }
        
        const items = Lumina.State.app.document?.items || [];
        const chapters = Lumina.State.app.chapters || [];
        if (items.length === 0) return;
        
        // 收集器：一级标题和二级标题
        const level1Titles = [];
        const level2Titles = [];
        
        // 查找前言章节（如果有），前言视同 level-1
        const prefaceChapter = chapters.find(ch => ch.isPreface);
        if (prefaceChapter) {
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
                    endIndex: items.length - 1,
                    wordCount: 0,
                    matchCount: 0
                });
            } else if (isLevel2) {
                level2Titles.push({
                    index: i,
                    title: titleText,
                    startIndex: i,
                    endIndex: items.length - 1,
                    wordCount: 0,
                    matchCount: 0
                });
            }
        }
        
        // 修正标题结束位置
        for (let i = 0; i < level1Titles.length; i++) {
            if (i < level1Titles.length - 1) {
                level1Titles[i].endIndex = level1Titles[i + 1].index - 1;
            }
        }
        for (let i = 0; i < level2Titles.length; i++) {
            if (i < level2Titles.length - 1) {
                level2Titles[i].endIndex = level2Titles[i + 1].index - 1;
            }
        }
        
        // 统计每个标题范围内的内容
        this.calculateTitleHeat(level1Titles, items);
        this.calculateTitleHeat(level2Titles, items);
        
        // 计算双维度：宽度基于最大字数，透明度基于最大热度密度
        const allTitles = [...level1Titles, ...level2Titles];
        
        // 找到最大字数作为100%基准（用于宽度）
        let maxWordCount = 0;
        allTitles.forEach(t => {
            if (t.wordCount > maxWordCount) maxWordCount = t.wordCount;
        });
        
        // 找到最大热度密度作为100%基准（用于透明度）
        let maxDensity = 0;
        allTitles.forEach(t => {
            const density = t.wordCount > 0 ? (t.matchCount / t.wordCount) * 1000 : 0;
            t.density = density;
            if (density > maxDensity) maxDensity = density;
        });
        
        // 计算双维度
        allTitles.forEach(t => {
            // 宽度：相对于最大字数的比例（最小5%，最大100%）
            t.widthPercent = maxWordCount > 0 
                ? Math.max(5, (t.wordCount / maxWordCount) * 100) 
                : 0;
            
            // 透明度：相对于最大密度的比例（0.15-1.0，G点密集时更显著）
            t.opacity = maxDensity > 0 
                ? Math.max(0.15, Math.min(1.0, t.density / maxDensity)) 
                : 0.15;
        });
        
        // 保存和渲染
        this.cache = allTitles;
        this.render(allTitles);
        await this.saveAnalysisToBook(allTitles);
    },
    
    // 计算标题范围内的热度
    calculateTitleHeat(titles, items) {
        titles.forEach(title => {
            let text = '';
            for (let i = title.startIndex; i <= title.endIndex && i < items.length; i++) {
                text += (items[i].text || '') + ' ';
            }
            title.wordCount = text.length;
            
            // 统计关键词匹配
            this.tags.forEach(tag => {
                const regex = new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                const matches = text.match(regex);
                if (matches) title.matchCount += matches.length;
            });
        });
    },
    
    // 双维度渲染：宽度=章节长度，透明度=G点热度
    render(heatData) {
        heatData.forEach(data => {
            const selector = `.toc-item[data-index="${data.index}"]`;
            const elements = document.querySelectorAll(selector);
            
            if (elements.length > 0) {
                elements.forEach(el => {
                    el.style.setProperty('--heat-width', `${data.widthPercent}%`);
                    el.style.setProperty('--heat-opacity', data.opacity);
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
        
        // 合并更新，保存双维度数据
        currentFile.heatMap = {
            keywords: this.tags.join(','),
            chapters: heatData.map(h => ({
                index: h.index,
                width: Math.round(h.widthPercent),
                opacity: Math.round(h.opacity * 100) / 100
            })),
            updatedAt: Date.now()
        };
        
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
                    el.style.setProperty('--heat-opacity', h.opacity || 0.25);
                    el.dataset.hasHeat = 'true';
                });
            });
            return true;
        }
        return false;
    },
    
    // 从当前书本刷新显示（设置面板打开时调用）
    refreshFromCurrentBook() {
        const currentFile = Lumina.State.app.currentFile;
        
        // 清空现有显示
        this.tags = [];
        const tagList = document.getElementById('heatTagList');
        const input = document.getElementById('heatTagInput');
        if (tagList) tagList.innerHTML = '';
        if (input) input.value = '';
        this.clearHeat();
        
        // 从当前书本重新加载
        const savedKeywords = currentFile?.heatMap?.keywords || '';
        if (savedKeywords) {
            this.tags = savedKeywords.split(',').map(t => t.trim()).filter(t => t.length > 0);
        }
        
        // 重新获取DOM引用并渲染
        this.tagList = document.getElementById('heatTagList');
        this.input = document.getElementById('heatTagInput');
        this.renderTags();
        this.updateAnalyzeButton();
        
        // 恢复热力图（如果有关键词）
        if (this.tags.length > 0) {
            if (!this.restoreFromBook()) {
                this.analyze();
            }
        }
    },
    
    // 打开书本时调用
    onBookOpen() {
        // 书本切换时强制清空，避免数据残留
        this.tags = [];
        this.cache = null;
        this.updateAnalyzeButton();
        this.clearHeat();
        
        // 从当前书本恢复热力图数据（如果有）
        const currentFile = Lumina.State.app.currentFile;
        const heatMap = currentFile?.heatMap;
        
        if (heatMap && heatMap.keywords) {
            // 恢复标签
            this.tags = heatMap.keywords.split(',').map(t => t.trim()).filter(t => t.length > 0);
            this.renderTags();
            this.updateAnalyzeButton();
            
            // 恢复热力图渲染
            if (heatMap.chapters) {
                heatMap.chapters.forEach(h => {
                    const elements = document.querySelectorAll(`.toc-item[data-index="${h.index}"]`);
                    elements.forEach(el => {
                        el.style.setProperty('--heat-width', `${h.width}%`);
                        el.style.setProperty('--heat-opacity', h.opacity || 0.25);
                        el.dataset.hasHeat = 'true';
                    });
                });
            }
        }
    }
};

// 页面获得焦点时自动刷新（防止其他窗口操作后数据不同步）
window.addEventListener('focus', () => {
    if (Lumina.DB.adapter instanceof Lumina.DB.SQLiteImpl && 
        Lumina.DB.adapter.isReady &&
        Lumina.DataManager) {
        
        // 如果书库面板正打开，静默刷新（复用正在进行的请求）
        if (document.getElementById('dataManagerPanel')?.classList.contains('active')) {
            Lumina.DataManager.refreshStatsSilently();
        }
    }
});

// ==================== APP 返回按钮控制 ====================

Lumina.BackButtonHandler = {
    
    init() {
        // 返回按钮处理由原生层 (MainActivity.java) 驱动
        // 原生层调用 Lumina.BackButtonHandler.handleBackButton()
        // 这里只需要确保方法已挂载到全局
        if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.()) {
            console.log('[BackButton] Handler ready (native-driven)');
        }
    },
    
    handleBackButton(event) {
        // 注意：此方法由原生层通过 onBackPressed 调用
        // 原生层已经检查了状态，这里直接执行关闭逻辑
        
        // 优先级1: 关闭书籍详情页 (z-index 300)
        const bookDetailPanel = document.getElementById('bookDetailPanel');
        if (bookDetailPanel?.classList.contains('active')) {
            Lumina.BookDetail.close();
            return true;
        }
        
        // 优先级2: 关闭文件浏览器面板 (z-index 260)
        const fileBrowserPanel = document.getElementById('fileBrowserPanel');
        if (fileBrowserPanel?.classList.contains('active')) {
            fileBrowserPanel.classList.remove('active');
            return true;
        }
        
        // 优先级3: 关闭书库面板 (z-index 250)
        const dataManagerPanel = document.getElementById('dataManagerPanel');
        if (dataManagerPanel?.classList.contains('active')) {
            Lumina.DataManager.close();
            return true;
        }
        
        // 优先级4: 关闭关于面板类 (z-index 200)
        const aboutPanels = [
            document.getElementById('aboutPanel'),
            document.getElementById('cacheManagerPanel'),
            document.getElementById('regexHelpPanel'),
            document.getElementById('azureTtsDialog'),
            document.getElementById('heatMapPresetsDialog')
        ];
        
        for (const panel of aboutPanels) {
            if (panel?.classList.contains('active')) {
                panel.classList.remove('active');
                return true;
            }
        }
        
        // 优先级4: 关闭右侧面板（设置/搜索/注释/历史）(z-index 95)
        // 注意：这些面板是独立的，不是互斥的，需要逐个检查
        const rightPanels = [
            { id: 'sidebarRight', close: (el) => el.classList.remove('open') },
            { id: 'historyPanel', close: (el) => el.classList.remove('open') },
            { id: 'searchPanel', close: (el) => el.classList.remove('open') },
            { id: 'annotationPanel', close: (el) => el.classList.remove('open') }
        ];
        
        for (const panel of rightPanels) {
            const el = document.getElementById(panel.id);
            if (el?.classList.contains('open')) {
                panel.close(el);
                return true;
            }
        }
        
        // 优先级5: 关闭左侧面板（目录）(z-index 95)
        const leftPanel = document.getElementById('sidebarLeft');
        if (leftPanel?.classList.contains('visible')) {
            leftPanel.classList.remove('visible');
            Lumina.DOM.readingArea.classList.remove('with-sidebar');
            Lumina.State.settings.sidebarVisible = false;
            Lumina.Settings.save();
            return true;
        }
        
        // 优先级6: 关闭当前书籍，回到欢迎界面
        if (Lumina.State.app.currentFile.name) {
            Lumina.Actions.returnToWelcome();
            return true;
        }
        
        // 返回 false 表示没有处理，原生层将执行退出逻辑
        return false;
    },
    
    // 显示退出提示（由原生层调用）
    showExitToast() {
        Lumina.UI.showToast(Lumina.I18n.t('pressBackAgainToExit'));
    }
};

// 在 Lumina.init 完成后初始化返回按钮处理器
const originalInit = Lumina.init;
Lumina.init = async function() {
    await originalInit.call(this);
    Lumina.BackButtonHandler.init();
};

// 启动
document.addEventListener('DOMContentLoaded', Lumina.init);