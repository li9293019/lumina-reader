// ==================== 根命名空间 ====================
const Lumina = {
    // 配置命名空间
    Config: {},
    // 运行时状态
    State: {
        app: {
            currentFile: { name: '', type: '', handle: null, rawContent: null, wordCount: 0, openedAt: null, fileKey: null },
            document: { items: [], type: '' },
            chapters: [],
            currentChapterIndex: 0,
            search: { matches: [], currentQuery: '', highlightedIndex: -1 },
            ui: { isProcessing: false, isImmersive: false },
            dbReady: false,
            // 注释/书签数据 (type: 'bookmark' | 'annotation')
            annotations: []
        },
        settings: null, // 将在init中初始化
        sectionCounters: [0, 0, 0, 0, 0, 0]
    },
    // DOM元素缓存
    DOM: {},
    // 国际化
    I18n: { data: {} },
    // 存储层
    DB: { adapter: null },
    // 解析器
    Parser: {},
    // 渲染器
    Renderer: {},
    // 语音朗读
    TTS: { manager: null },
    // 数据管理器
    DataManager: null,
    // 字体加载器
    Font: {},
    // 工具函数
    Utils: {},
    // 操作分发
    Actions: {}
};

// ==================== 1. 配置与常量 ====================

Lumina.Config.fileTypes = {
    docx: { icon: 'icon-file-word', parser: 'parseDOCX' },
    pdf: { icon: 'icon-file-pdf', parser: 'parsePDF' },
    txt: { icon: 'icon-file-text', parser: 'parseTextFile' },
    md: { icon: 'icon-file-markdown', parser: 'parseTextFile' },
    html: { icon: 'icon-file-code', parser: 'parseTextFile' },
    json: { icon: 'icon-file-json', parser: null }
};

Lumina.Config.fontConfig = (() => {
    // 检测是否在 APP 环境（离线优先）
    const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
    
    // APP 环境：使用系统字体 + 本地字体
    if (isApp) {
        return {
            serif: {
                family: '"LXGW Neo Zhi Song", "Noto Serif SC", "Source Han Serif SC", "SimSun", "STSong", serif',
                url: './assets/fonts/LXGWNeoZhiSong.css', // 本地 CSS
                preload: false,
                fallback: 'SimSun, STSong, serif',
                metrics: { sizeAdjust: '100%', ascentOverride: '90%', descentOverride: '25%', lineGapOverride: '0%' }
            },
            sans: {
                family: '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif',
                url: null,
                preload: false,
                fallback: 'sans-serif',
                metrics: { sizeAdjust: '100%', ascentOverride: '88%', descentOverride: '22%', lineGapOverride: '0%' }
            },
            kai: {
                family: '"LXGW WenKai", "KaiTi", "STKaiti", serif',
                url: './assets/fonts/lxgwwenkai.css', // 本地 CSS
                preload: false,
                fallback: 'KaiTi, STKaiti, serif',
                metrics: { sizeAdjust: '105%', ascentOverride: '92%', descentOverride: '28%', lineGapOverride: '0%' }
            },
            mono: {
                family: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
                url: null,
                preload: false,
                fallback: 'monospace',
                metrics: null
            }
        };
    }
    
    // Web 环境：使用网络字体
    return {
        serif: {
            family: '"LXGW Neo Zhi Song", "Noto Serif SC", "Source Han Serif SC", "SimSun", serif',
            url: null, // 离线优先，使用系统字体或本地字体
            preload: false,
            fallback: 'serif',
            metrics: { sizeAdjust: '100%', ascentOverride: '90%', descentOverride: '25%', lineGapOverride: '0%' }
        },
        sans: {
            family: '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif',
            url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap',
            preload: true,
            fallback: 'sans-serif',
            metrics: { sizeAdjust: '100%', ascentOverride: '88%', descentOverride: '22%', lineGapOverride: '0%' }
        },
        kai: {
            family: '"LXGW WenKai", "KaiTi", "STKaiti", serif',
            url: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css',
            preload: false,
            fallback: 'KaiTi, STKaiti, serif',
            metrics: { sizeAdjust: '105%', ascentOverride: '92%', descentOverride: '28%', lineGapOverride: '0%' }
        },
        mono: {
            family: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
            url: null,
            preload: false,
            fallback: 'monospace',
            metrics: null
        }
    };
})();

Lumina.Config.numberingStrategies = {
    none: (level, counters, text) => text,
    roman: (level, counters, text) => level === 1 ? `${Lumina.Utils.numberToRoman(counters[0])} ${text}` : level === 2 ? `${Lumina.Utils.numberToRoman(counters[1], false)} ${text}` : text,
    chineseNovel: (level, counters, text) => {
        const num = Lumina.Utils.numberToChinese(counters[level - 1]);
        const suffix = level === 1 ? '章' : level === 2 ? '节' : '';
        return suffix ? `第${num}${suffix} ${text}` : `(${num}) ${text}`;
    },
    englishNovel: (level, counters, text) => {
        const labels = ['Chapter', 'Section', 'Part', 'Item', '', ''];
        return `${labels[level - 1] || ''} ${counters[level - 1]} ${text}`.trim();
    },
    technical: (level, counters, text) => `${counters.slice(0, level).join('.')} ${text}`,
    academic: (level, counters, text) => {
        const n = counters[level - 1];
        const symbols = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
        switch (level) {
            case 1: return `${Lumina.Utils.numberToChinese(n)}、${text}`;
            case 2: return `（${Lumina.Utils.numberToChinese(n)}）${text}`;
            case 3: return `${n}. ${text}`;
            case 4: return `（${n}）${text}`;
            case 5: return `${symbols[n - 1] || '(' + n + ')'} ${text}`;
            case 6: return `${String.fromCharCode(64 + n)}. ${text}`;
            default: return text;
        }
    }
};

Lumina.Config.defaultSettings = {
    language: 'zh',
    theme: 'light',
    font: 'serif',
    indent: false,
    dropCap: false,
    fontSize: 20,
    lineHeight: 15,
    paragraphSpacing: 0,
    pageWidth: 80,
    margin: 40,
    ignoreEmptyLines: false,
    textCleaning: true,
    smoothScroll: true,
    chapterRegex: '',
    sectionRegex: '',
    sidebarVisible: false,
    chapterNumbering: 'none',
    ttsRate: 10,
    ttsPitch: 10,
    paginationEnabled: true,
    paginationMaxWords: 3000,
    paginationImageWords: 300,
};

Lumina.Config.regexPatterns = {
    chineseChapter: /^<?第\s*[一二三四五六七八九十百千万零〇\d]+\s*[章卷]>?\s*[:\-]?\s*(.*)/i,
    englishChapter: /^(Chapter|Chap|Part|Book)\s*(\d+[\.:\-]?\d*)\s*[:\-]?\s*(.*)/i,
    sectionDash: /^<?(\d+)[\-–—\.](\d+)\s*[:\-]?>?\s*(.*)/,
    sectionCn: /^<?第\s*[一二三四五六七八九十百千万零〇\d]+\s*[节集]>?\s*[:\-]?\s*(.*)/i,
    sectionEn: /^Section\s*(\d+)\s*[:\-]?\s*(.*)/i,
    specialTitles: /^(阅读须知|版权说明|引言|序言|前言|楔子|尾声|创作后记|后记|Introduction|Prologue|Preface|Epilogue)$/i,
    mdHeading: /^(#{1,6})\s+(.+)$/,
    titleTag: /^\[T\]/i,
    subtitleTag: /^\[S\]/i
};

Lumina.Config.pagination = {
    enabled: true,             // 总开关，设为 false 则每章显示为单页，无分页导航
    maxReadingWords: 3000,             // 单页最大字数（约一屏阅读量，可调整）
    imageEquivalentWords: 300   // 图片等效字数（1张图 ≈ 300字，避免图片过多撑爆页面）
};

// ==================== 2. 工具函数 ====================

Lumina.Utils.escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

// 转义正则表达式特殊字符
Lumina.Utils.escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

Lumina.Utils.escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

Lumina.Utils.formatTimeAgo = (isoString) => {
    if (!isoString) return Lumina.I18n.t('unknown');
    const diff = Math.floor((new Date() - new Date(isoString)) / 1000);
    if (diff < 60) return Lumina.I18n.t('timeJustNow');
    if (diff < 3600) return Lumina.I18n.t('timeMinutesAgo', Math.floor(diff / 60));
    if (diff < 86400) return Lumina.I18n.t('timeHoursAgo', Math.floor(diff / 3600));
    return Lumina.I18n.t('timeDaysAgo', Math.floor(diff / 86400));
};

Lumina.Utils.formatReadTime = (minutes) => {
    if (!minutes) return '';
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins === 0 ? `${hours}${Lumina.I18n.t('hours')}` : `${hours}${Lumina.I18n.t('hours')}${mins}${Lumina.I18n.t('mins')}`;
    }
    return `${minutes}${Lumina.I18n.t('mins')}`;
};

Lumina.Utils.formatWordCount = (count) => count >= 1000 ? `${(count / 1000).toFixed(1)}k` : (count || '0').toString();

Lumina.Utils.numberToChinese = (num) => {
    const chars = '零一二三四五六七八九十';
    if (num <= 10) return chars[num] || num.toString();
    if (num < 20) return '十' + (num === 10 ? '' : chars[num - 10]);
    if (num < 100) {
        const ten = Math.floor(num / 10);
        const one = num % 10;
        return chars[ten] + '十' + (one === 0 ? '' : chars[one]);
    }
    return num.toString();
};

Lumina.Utils.numberToRoman = (num, upper = true) => {
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let r = '', n = num;
    for (const [v, s] of map) while (n >= v) { r += s; n -= v; }
    return upper ? r : r.toLowerCase();
};

Lumina.Utils.debounce = (fn, delay) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
};

Lumina.Utils.throttle = (fn, limit) => {
    let inThrottle;
    return (...args) => {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

Lumina.Utils.validateRegex = (pattern) => {
    if (!pattern) return true;
    try { new RegExp(pattern); return true; } catch (e) { return false; }
};

// 底层详细统计（用于分页、调试等）
Lumina.Utils.calculateContentStats = (text) => {
    if (!text) return { chars: 0, words: 0, total: 0 };
    
    // 中文字符（含标点）
    const cn = text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g)?.length || 0;
    
    // 英文单词（连续字母）
    const enWords = text.match(/[a-zA-Z]+/g)?.length || 0;
    
    // 数字串（可选，作为独立计数或并入英文）
    const numbers = text.match(/\d+/g)?.length || 0;
    
    // 统一"阅读字数"：中文单字 + 英文单词
    const readingWords = cn + enWords;
    
    // 纯字符长度（用于内存估算）
    const charLength = text.length;

    const result = {
        cn,           // 中文字符数
        enWords,      // 英文单词数
        numbers,      // 数字串数
        readingWords, // 阅读字数（与历史记录一致）
        charLength    // 字符长度
    };

    return result;
};

// 便捷函数（用于历史记录等只需总字数的场景）
Lumina.Utils.calculateWordCount = (items) => {
    if (!Array.isArray(items)) return 0;
    return items.reduce((count, item) => {
        if (!item.text) return count;
        // 直接复用 calculateContentStats
        const stats = Lumina.Utils.calculateContentStats(item.text);
        return count + stats.readingWords;
    }, 0);
};

// ==================== 3. 国际化模块 ====================

Lumina.I18n.data = {
    zh: {
        zh: '简体中文',
        zh1: '繁體中文',
        en: 'English',
        appName: '流萤阅读器', noFile: '未打开文件', toc: '目录', settings: '阅读设置',
        language: '界面语言', theme: '主题配色', font: '字体选择', typography: '排版选项',
        indent: '首行缩进', dropCap: '首字下沉', fontSize: '字号大小', lineHeight: '行间距',
        paragraphSpacing: '段落间距', pageWidth: '页面宽度', margin: '页面边距',
        readingSettings: '阅读设置', smoothScroll: '平滑跳转', ignoreEmptyLines: '忽略空行', textCleaning: '文本清洁',
        regex: '章节匹配规则', regexHelp: '支持 JavaScript 正则表达式语法', apply: '应用规则',
        export: '导出格式', reset: '重置所有设置', history: '最近打开', clear: '清空',
        clearLibrary: '清空书库', clearHistory: '删除', noHistory: '暂无历史记录',
        heatMapKeywords: 'G点热力关键词', analyzeHeat: '分析本书热力',  heatMapHint: '以逗号或空格分割关键词',
        welcomeSubtitle: '沉浸式文档阅读空间',
        welcomeHint: '智能排版 · 语音朗读 · 本地书库', shortcuts: '快捷键',
        chapterNav: '章节', scrollNav: '翻页', search: '搜索', openFile: '开始阅读',
        close: '关闭', about: '关于', aboutTitle: '关于流萤',
        aboutDesc: '流萤阅读器是一款专注于沉浸式阅读体验的高级文档阅读器，支持多种格式的智能解析与优雅的排版展示。',
        features: '核心功能', feature1: '支持 DOCX、TXT、Markdown、HTML、PDF 格式',
        feature2: '智能章节检测与层级识别', feature3: '多种主题配色与字体选择',
        feature4: '灵活的排版自定义选项', feature5: '全文搜索与快速定位',
        feature6: '全文智能语音朗读', feature7: '历史记录与书库管理', feature8: '书签与注释管理', feature9: 'G点热力图智能目录', feature10: '多格式文件数据导出',
        shortcutsTitle: '键盘快捷键',
        shortcutChapter: '上一章/下一章', shortcutSearch: '打开搜索',
        shortcutHistory: '打开历史', shortcutLibrary: '打开书库', shortcutSettings: '打开设置', shortcutAnnotations: '打开注释', shortcutClose: '关闭面板',
        searchPlaceholder: '搜索全文...',
        chapterRegexPlaceholder: '主章节正则 (如: 第.+章)',
        sectionRegexPlaceholder: '次章节正则 (如: \\d+\\.\\d+)',
        searchResults: '搜索结果',
        searchEmpty: '输入关键词开始搜索', searchNoResults: '未找到匹配结果',
        confirm: '确定', cancel: '取消', save: '保存', loading: '正在解析文件...',
        themeLight: '云白',
        themeSlate: '青石',
        themeParchment: '羊皮纸',
        themeSprout: '春芽',
        themeMist: '迷雾',
        themeMint: '薄荷',
        themeRose: '玫瑰',
        themeDusk: '暮光',
        themeOlive: '橄榄',
        themeEspresso: '咖啡馆',
        themeMidnight: '午夜',
        themeNebula: '星云',
        themeDark: '极夜',
        themeAmoled: '墨夜',
        themeTaupe: '灰褐',
        themeStraw: '稻草',
        themeTerracotta: '赤陶',
        themeMauve: '藕荷',
        themeSandstone: '砂石',
        fontSerif: '宋体', fontSans: '黑体', fontKai: '楷体', fontMono: '等宽', fontRecommended: '推荐',
        chapterNumbering: '章节序号样式', noneNumbering: '无序号', roman: '罗马数字', chineseNovel: '中文小说', englishNovel: '英文小说',
        technical: '理工通用', academic: '社科通用', preface: '前言',
        prevChapter: '上一章', nextChapter: '下一章', chapterEnd: '本章结束',
        readTime: '阅读时间', lastRead: '上次阅读', wordCount: '字数',
        words: '字', mins: '分钟', hours: '小时', unknown: '未知',
        regexValid: '✓ 语法有效',
        regexInvalid: '✗ 语法错误',
        regexMatches: '匹配到 $1 个章节',
        regexNoFile: '打开文件后预览匹配效果',
        confirmClearLibrary: '确定要清空书库吗？此操作不可恢复。',
        errorNoFile: '请先打开文件',
        errorInvalidRegex: '正则表达式格式错误，请检查输入',
        ruleApplied: '规则已应用',
        dialogTitle: '提示',
        timeJustNow: '刚刚',
        timeMinutesAgo: '$1分钟前',
        timeHoursAgo: '$1小时前',
        timeDaysAgo: '$1天前',
        paragraph: '正文', title: '标题', subtitle: '副标题', list: '列表', image: '图像',
        heading1: '标题1', heading2: '标题2', heading3: '标题3', heading4: '标题4', heading5: '标题5', heading6: '标题6',
        fontLoading: '正在加载字体...',
        dbUsingCache: '已从书库快速恢复',
        dbFileChanged: '文件已更新，重新解析中...',
        localLibrary: '书库管理',
        manageData: '管理本地书库',
        storageUsed: '存储占用',
        filesCount: '本书籍',
        imagesCount: '张封面',
        noDataToManage: '暂无本地数据',
        confirmDeleteFile: '确定要删除这本书的所有数据吗？此操作不可恢复。',
        fileDeleted: '已删除',
        deleteFailed: '删除失败',
        exportSuccess: '导出成功',
        exportFailed: '导出失败',
        annotatedAt: '注释于',
        importData: '导入数据',
        importSuccess: '导入成功',
        importFailed: '导入失败',
        exportFile: '导出',
        deleteFile: '删除',
        openBook: '打开',
        fileDataLost: '文件数据已丢失或损坏',
        booksUnit: '本',
        libraryStorageDesc: '本地书库存储',
        library: '书库',
        invalidHistoryFile: '无效的历史数据文件格式',
        storageQuotaExceeded: '存储空间不足，请删除一些旧文件',
        jsonFormatError: 'JSON格式错误或不支持的文件',
        batchExport: '批量导出书库',
        batchImport: '批量导入书库',
        libraryEmpty: '书库为空',
        libraryCleared: '书库已清空',
        clearFailed: '清空失败',
        batchExportSuccess: '成功导出 $1 本书',
        batchExportFailed: '导出失败',
        noBooksInFile: '文件中未找到书籍数据',
        confirmBatchImport: '确定要导入 $1 本书吗？这将合并到现有书库中。',
        importing: '正在导入',
        success: '成功',
        batchImportSuccess: '成功导入 $1 本书',
        batchImportPartial: '导入完成：成功 $1 本，失败 $2 本',
        readingFile: '正在读取文件...',
        lastReadHere: '上次阅读位置',
        generatingDocx: '正在生成排版文档...',
        docxExportSuccess: '文档导出成功',
        docxExportFailed: '导出失败：$1',
        confirmOverwrite: '文件 "$1" 已存在，覆盖原记录？',
        tts: '朗读',
        ttsSettings: '语音朗读',
        ttsEnable: '启用朗读',
        ttsVoice: '人声选择',
        ttsVoiceLoading: '加载中...',
        ttsRate: '语速',
        ttsPitch: '音调',
        ttsFinished: '朗读完成',
        annotations: '注释',
        annotation: '注释',
        bookmark: '书签',
        storageDetails: '存储详情',
        storageMode: '存储模式',
        storageEngine: '存储引擎',
        storageLocal: '本地存储 (IndexedDB)',
        storageServer: '后端存储 (SQLite)',
        storageFallback: '后端存储 (SQLite) - 已回退',
        booksCountLabel: '书籍数量',
        booksCountValue: '$1 本',
        storageUsedLabel: '占用空间',
        storageSizeValue: '$1 MB',
        storageEndpoint: '服务端点',
        storageOnline: '在线同步',
        storageOffline: '离线模式',
        storageDegraded: '降级运行',
        prevPage: '上一页',
        nextPage: '下一页',
        addBookmark: '添加书签',
        addAnnotation: '添加注释',
        copyText: '复制文本',
        textCopied: '文本已复制',
        editBookmark: '编辑书签',
        editAnnotation: '编辑注释',
        bookmarkAdded: '书签已添加',
        bookmarkUpdated: '书签已更新',
        bookmarkDeleted: '书签已删除',
        deleteBookmark: '删除书签',
        annotationSaved: '注释已保存',
        annotationUpdated: '注释已更新',
        annotationDeleted: '注释已删除',
        deleteAnnotation: '删除注释',
        confirmDeleteBookmark: '确定删除此书签？',
        confirmDeleteAnnotation: '确定删除此注释？',
        noAnnotations: '暂无注释或书签',
        annotationHint: '选中文本添加注释，或点击添加书签',
        annotationPlaceholder: '输入注释内容...',
        bookmark: '书签',
        edit: '编辑',
        delete: '删除',
        confirmDeleteAnnotation: '确定删除此标记？', 
        firstPage: '第一页',
        lastPage: '最后一页',
        pageInfo: '第$1/$2页', 
        jumpToPage: '跳转到第$1页',
        atBeginning: '已经是开头',
        atEnd: '已经是结尾',
        prevChapterTooltip: '上一章：$1', 
        nextChapterTooltip: '下一章：$1',
        loadingFile: '正在载入文件...',
        pdfParsing: 'PDF 解析中',
        pdfPasswordRequired: '需要密码',
        ruleApplyFailed: '应用规则失败',
        fileTooLarge: '文件较大',
        fileTooLargeMessage: '该文件包含大量图片，建议选择保存方式：',
        largeFileTitle: '大文件提示',
        saveTextOnly: '仅保存文本',
        doNotSave: '不保存到书库',
        fileNotSaved: '文件未保存到书库，仍可继续阅读',
        fileSavedTextOnly: '已仅保存文本到书库（图片未保存）',
        saving: '正在保存...',
        savingText: '正在保存文本...',
        pdfPasswordError: '密码错误',
        pdfPasswordPrompt: '此 PDF 受密码保护，请输入密码',
        pdfPasswordRetry: '请重新输入 PDF 密码',
        pdfPasswordPlaceholder: '请输入密码',
        regexHelpTooltip: '查看正则表达式帮助',
        regexHelpTitle: '正则表达式帮助',
        regexBasicSyntax: '基本语法',
        regexBasicDesc: '支持标准 JavaScript 正则表达式语法。常用符号：',
        regexMacros: '快捷宏定义',
        regexMacrosDesc: '可使用以下宏简化编写：',
        regexExamples: '常用示例',
        regexDescStart: '行首',
        regexDescEnd: '行尾',
        regexDescAny: '任意字符',
        regexDescZeroOrMore: '零次或多次',
        regexDescOneOrMore: '一次或多次',
        regexDescZeroOrOne: '零次或一次',
        regexDescGroup: '字符组，如 [0-9] 匹配数字',
        regexDescCapture: '捕获组',
        regexDescCN: '中文数字（一二三四...）',
        regexDescRomanU: '大写罗马数字（IVXLCDM）',
        regexDescRomanL: '小写罗马数字（ivxlcdm）',
        regexDescNum: '阿拉伯数字（\\d+）',
        regexDescUpper: '大写英文字母（A-Z）',
        regexDescLower: '小写英文字母（a-z）',
        regexDescAlpha: '任意英文字母（A-Za-z）',
        regexDescWord: '英文单词（[A-Za-z]+）',
        regexDescSpace: '空白字符（\\s+）',
        regexExTitleCN: '第X章',
        regexExTitleEN: 'Chapter X',
        regexExTitleSection: 'X.Y 节',
        regexExTitleVolume: '第X卷 第Y章',
        regexExTitleCnCode: '第\\C章',
        regexExTitleEnCode: 'Chapter\\S\\N',
        regexExTitleSectionCode: '^\\N\\.\\N',
        regexExTitleVolumneCode: '第\\C卷\\S第\\C章',
        regexNoteDetail: '提示：自动添加 ^ 开头匹配。使用 () 捕获标题内容分组。',
        immersiveEnter: '进入沉浸模式',
        immersiveExit: '退出沉浸模式',
        txt: '文本文档',
        md: 'Markdown',
        html: 'H5网页',
        docx: 'Word文档',
        paginationSettings: '分页设置',
        paginationEnabled: '启用分页导航',
        paginationMaxWords: '单页字数上限',
        paginationImageWords: '图片等效字数',
    },
    zh1: {
        zh: '简体中文',
        zh1: '繁體中文',
        en: 'English',
        appName: '流螢閱讀器', noFile: '未開啟檔案', toc: '目錄', settings: '閱讀設定',
        language: '介面語言', theme: '主題配色', font: '字型選擇', typography: '排版選項',
        indent: '首行縮排', dropCap: '首字下沉', fontSize: '字型大小', lineHeight: '行間距',
        paragraphSpacing: '段落間距', pageWidth: '頁面寬度', margin: '頁面邊距',
        readingSettings: '閱讀設定', smoothScroll: '平滑跳轉', ignoreEmptyLines: '忽略空行', textCleaning: '文字清潔',
        regex: '章節匹配規則', regexHelp: '支援 JavaScript 正規表示式語法', apply: '套用規則',
        export: '匯出格式', reset: '重置所有設定', history: '最近開啟', clear: '清空',
        clearLibrary: '清空書庫', clearHistory: '刪除', noHistory: '暫無歷史記錄',
        heatMapKeywords: 'G點熱力關鍵詞', analyzeHeat: '分析本書熱力', heatMapHint: '以逗號或空格分割關鍵字',
        welcomeSubtitle: '沉浸式文件閱讀空間',
        welcomeHint: '智慧排版 · 語音朗讀 · 本地書庫', shortcuts: '快捷鍵',
        chapterNav: '章節', scrollNav: '翻頁', search: '搜尋', openFile: '開始閱讀',
        close: '關閉', about: '關於', aboutTitle: '關於流螢',
        aboutDesc: '流螢閱讀器是一款專注於沉浸式閱讀體驗的高級文件閱讀器，支援多種格式的智慧解析與優雅的排版展示。',
        features: '核心功能', feature1: '支援 DOCX、TXT、Markdown、HTML、PDF 格式',
        feature2: '智慧章節偵測與層級識別', feature3: '多種主題配色與字型選擇',
        feature4: '靈活的排版自訂選項', feature5: '全文搜尋與快速定位',
        feature6: '全文智慧語音朗讀', feature7: '歷史記錄與書庫管理', feature8: '書簽與注釋管理', feature9: 'G點熱力圖智慧目錄', feature10: '多格式檔案資料匯出',
        shortcutsTitle: '鍵盤快捷鍵',
        shortcutChapter: '上一章/下一章', shortcutSearch: '開啟搜尋',
        shortcutHistory: '開啟歷史', shortcutLibrary: '開啟書庫', shortcutSettings: '開啟設定', shortcutAnnotations: '開啟註釋', shortcutClose: '關閉面板',
        searchPlaceholder: '搜尋全文...',
        chapterRegexPlaceholder: '主章節正規表示式 (如: 第.+章)',
        sectionRegexPlaceholder: '次章節正規表示式 (如: \\d+\\.\\d+)',
        searchResults: '搜尋結果',
        searchEmpty: '輸入關鍵字開始搜尋', searchNoResults: '未找到匹配結果',
        confirm: '確定', cancel: '取消', save: '儲存', loading: '正在解析檔案...',
        themeLight: '雲白',
        themeSlate: '青石',
        themeParchment: '羊皮紙',
        themeSprout: '春芽',
        themeMist: '迷霧',
        themeMint: '薄荷',
        themeRose: '玫瑰',
        themeEspresso: '咖啡館',
        themeDusk: '暮光',
        themeOlive: '橄欖',
        themeMidnight: '午夜',
        themeNebula: '星雲',
        themeDark: '極夜',
        themeAmoled: '墨夜',
        themeTaupe: '灰褐',
        themeStraw: '稻草',
        themeTerracotta: '赤陶',
        themeMauve: '藕荷',
        themeSandstone: '砂石',
        fontSerif: '宋體', fontSans: '黑體', fontKai: '楷體', fontMono: '等寬', fontRecommended: '推薦',
        chapterNumbering: '章節序號樣式', noneNumbering: '無序號', roman: '羅馬數字', chineseNovel: '中文小說', englishNovel: '英文小說',
        technical: '理工通用', academic: '社科通用', preface: '前言',
        prevChapter: '上一章', nextChapter: '下一章', chapterEnd: '本章結束',
        readTime: '閱讀時間', lastRead: '上次閱讀', wordCount: '字數',
        words: '字', mins: '分鐘', hours: '小時', unknown: '未知',
        regexValid: '✓ 語法有效',
        regexInvalid: '✗ 語法錯誤',
        regexMatches: '匹配到 $1 個章節',
        regexNoFile: '開啟檔案後預覽匹配效果',
        confirmClearLibrary: '確定要清空書庫嗎？此操作不可恢復。',
        errorNoFile: '請先開啟檔案',
        errorInvalidRegex: '正規表示式格式錯誤，請檢查輸入',
        ruleApplied: '規則已套用',
        dialogTitle: '提示',
        timeJustNow: '剛剛',
        timeMinutesAgo: '$1分鐘前',
        timeHoursAgo: '$1小時前',
        timeDaysAgo: '$1天前',
        paragraph: '正文', title: '標題', subtitle: '副標題', list: '清單', image: '圖像',
        heading1: '標題1', heading2: '標題2', heading3: '標題3', heading4: '標題4', heading5: '標題5', heading6: '標題6',
        fontLoading: '正在載入字型...',
        dbUsingCache: '已從書庫快速恢復',
        dbFileChanged: '檔案已更新，重新解析中...',
        localLibrary: '書庫管理',
        manageData: '管理本地書庫',
        storageUsed: '儲存占用',
        filesCount: '本書籍',
        imagesCount: '張封面',
        noDataToManage: '暫無本地資料',
        confirmDeleteFile: '確定要刪除這本書的所有資料嗎？此操作不可恢復。',
        fileDeleted: '已刪除',
        deleteFailed: '刪除失敗',
        exportSuccess: '匯出成功',
        exportFailed: '匯出失敗',
        annotatedAt: '注釋於',
        importData: '匯入資料',
        importSuccess: '匯入成功',
        importFailed: '匯入失敗',
        exportFile: '匯出',
        deleteFile: '刪除',
        openBook: '開啟',
        fileDataLost: '檔案資料已遺失或損壞',
        booksUnit: '本',
        libraryStorageDesc: '本地書庫儲存',
        library: '書庫',
        invalidHistoryFile: '無效的歷史資料檔案格式',
        storageQuotaExceeded: '儲存空間不足，請刪除一些舊檔案',
        jsonFormatError: 'JSON格式錯誤或不支援的檔案',
        batchExport: '批次匯出書庫',
        batchImport: '批次匯入書庫',
        libraryEmpty: '書庫為空',
        libraryCleared: '書庫已清空',
        clearFailed: '清空失敗',
        batchExportSuccess: '成功匯出 $1 本書',
        batchExportFailed: '匯出失敗',
        noBooksInFile: '檔案中未找到書籍資料',
        confirmBatchImport: '確定要匯入 $1 本書嗎？這將合併到現有書庫中。',
        importing: '正在匯入',
        success: '成功',
        batchImportSuccess: '成功匯入 $1 本書',
        batchImportPartial: '匯入完成：成功 $1 本，失敗 $2 本',
        readingFile: '正在讀取檔案...',
        lastReadHere: '上次閱讀位置',
        generatingDocx: '正在生成排版文件...',
        docxExportSuccess: '文件匯出成功',
        docxExportFailed: '匯出失敗：$1',
        confirmOverwrite: '檔案 "$1" 已存在，覆蓋原記錄？',
        tts: '朗讀',
        ttsSettings: '語音朗讀',
        ttsEnable: '啟用朗讀',
        ttsVoice: '人聲選擇',
        ttsVoiceLoading: '載入中...',
        ttsRate: '語速',
        ttsPitch: '音調',
        ttsFinished: '朗讀完成',
        annotations: '註釋',
        annotation: '註釋',
        bookmark: '書籤',
        storageDetails: '儲存詳情',
        storageMode: '儲存模式',
        storageEngine: '儲存引擎',
        storageLocal: '本地儲存 (IndexedDB)',
        storageServer: '後端儲存 (SQLite)',
        storageFallback: '後端儲存 (SQLite) - 已回退',
        booksCountLabel: '書籍數量',
        booksCountValue: '$1 本',
        storageUsedLabel: '占用空間',
        storageSizeValue: '$1 MB',
        storageEndpoint: '服務端點',
        storageOnline: '線上同步',
        storageOffline: '離線模式',
        storageDegraded: '降級執行',
        prevPage: '上一頁',
        nextPage: '下一頁',
        addBookmark: '新增書籤',
        addAnnotation: '新增註釋',
        copyText: '複製文本',
        textCopied: '文本已複製',
        editBookmark: '編輯書籤',
        editAnnotation: '編輯註釋',
        bookmarkAdded: '書籤已新增',
        bookmarkUpdated: '書籤已更新',
        bookmarkDeleted: '書籤已删除',
        deleteBookmark: '删除書籤',
        annotationSaved: '註釋已儲存',
        annotationUpdated: '註釋已更新',
        annotationDeleted: '註釋已删除',
        deleteAnnotation: '删除註釋',
        confirmDeleteBookmark: '確定删除此書籤？',
        confirmDeleteAnnotation: '確定删除此註釋？',
        noAnnotations: '暫無註釋或書籤',
        annotationHint: '選取文字新增註釋，或點擊新增書籤',
        annotationPlaceholder: '輸入註釋內容...',
        bookmark: '書籤',
        edit: '編輯',
        delete: '刪除',
        confirmDeleteAnnotation: '確定刪除此標記？', 
        firstPage: '第一頁',
        lastPage: '最後一頁',
        pageInfo: '第$1/$2頁',
        jumpToPage: '跳轉到第$1頁',
        atBeginning: '已經是開頭',
        atEnd: '已經是結尾',
        prevChapterTooltip: '上一章：$1',
        nextChapterTooltip: '下一章：$1',
        loadingFile: '正在載入檔案...',
        pdfParsing: 'PDF 解析中',
        pdfPasswordRequired: '需要密碼',
        ruleApplyFailed: '應用規則失敗',
        fileTooLarge: '檔案較大',
        fileTooLargeMessage: '該檔案包含大量圖片，建議選擇儲存方式：',
        largeFileTitle: '大檔案提示',
        saveTextOnly: '僅儲存文字',
        doNotSave: '不儲存到書庫',
        fileNotSaved: '檔案未儲存到書庫，仍可繼續閱讀',
        fileSavedTextOnly: '已僅儲存文字到書庫（圖片未儲存）',
        saving: '正在儲存...',
        savingText: '正在儲存文字...',
        pdfPasswordError: '密碼錯誤',
        pdfPasswordPrompt: '此 PDF 受密碼保護，請輸入密碼',
        pdfPasswordRetry: '請重新輸入 PDF 密碼',
        pdfPasswordPlaceholder: '請輸入密碼',
        regexHelpTooltip: '檢視正規表示式說明',
        regexHelpTitle: '正規表示式說明',
        regexBasicSyntax: '基本語法',
        regexBasicDesc: '支援標準 JavaScript 正規表示式語法。常用符號：',
        regexMacros: '快捷巨集定義',
        regexMacrosDesc: '可使用以下巨集簡化編寫：',
        regexExamples: '常用範例',
        regexDescStart: '行首',
        regexDescEnd: '行尾',
        regexDescAny: '任意字元',
        regexDescZeroOrMore: '零次或多次',
        regexDescOneOrMore: '一次或多次',
        regexDescZeroOrOne: '零次或一次',
        regexDescGroup: '字元組，如 [0-9] 匹配數字',
        regexDescCapture: '捕獲群組',
        regexDescCN: '中文數字（一二三四...）',
        regexDescRomanU: '大寫羅馬數字（IVXLCDM）',
        regexDescRomanL: '小寫羅馬數字（ivxlcdm）',
        regexDescNum: '阿拉伯數字（\\d+）',
        regexDescUpper: '大寫英文字母（A-Z）',
        regexDescLower: '小寫英文字母（a-z）',
        regexDescAlpha: '任意英文字母（A-Za-z）',
        regexDescWord: '英文單字（[A-Za-z]+）',
        regexDescSpace: '空白字元（\\s+）',
        regexExTitleCN: '第X章',
        regexExTitleEN: 'Chapter X',
        regexExTitleSection: 'X.Y 節',
        regexExTitleVolume: '第X卷 第Y章',
        regexExTitleCnCode: '第\\C章',
        regexExTitleEnCode: 'Chapter\\S\\N',
        regexExTitleSectionCode: '^\\N\\.\\N',
        regexExTitleVolumneCode: '第\\C卷\\S第\\C章',
        regexNoteDetail: '提示：自動添加 ^ 開頭匹配。使用 () 捕獲標題內容分組。',
        immersiveEnter: '進入沉浸模式',
        immersiveExit: '退出沉浸模式',
        txt: '文字文件',
        md: 'Markdown',
        html: 'H5網頁',
        docx: 'Word文件',
        paginationSettings: '分頁設定',
        paginationEnabled: '啟用分頁導航',
        paginationMaxWords: '單頁字數上限',
        paginationImageWords: '圖片等效字數',
    },
    en: {
        zh: '简体中文',
        zh1: '繁體中文',
        en: 'English',
        appName: 'Lumina', noFile: 'No file opened', toc: 'Contents', settings: 'Settings',
        language: 'Language', theme: 'Theme', font: 'Font', typography: 'Typography',
        indent: 'First Line Indent', dropCap: 'Drop Cap', fontSize: 'Font Size', lineHeight: 'Line Height',
        paragraphSpacing: 'Paragraph Spacing', pageWidth: 'Page Width', margin: 'Page Margin',
        readingSettings: 'Reading Settings', smoothScroll: 'Smooth Scroll', ignoreEmptyLines: 'Ignore Empty Lines', textCleaning: 'Text Cleaning',
        regex: 'Chapters Patterns', regexHelp: 'JavaScript regular expression syntax supported', apply: 'Apply',
        export: 'Export', reset: 'Reset All', history: 'History', clear: 'Clear',
        clearLibrary: 'Clear Library', clearHistory: 'Delete', noHistory: 'No recent files',
        heatMapKeywords: 'Heat Map Keywords', analyzeHeat: 'Analyze Heat', heatMapHint: 'Keywords separated by commas or spaces',
        welcomeSubtitle: 'Reading flows like light',
        welcomeHint: 'Minimal · Immersive · Elegant', shortcuts: 'Shortcuts',
        chapterNav: 'Chapter', scrollNav: 'Scroll', search: 'Search', openFile: 'Start Now',
        close: 'Close', about: 'About', aboutTitle: 'About Lumina',
        aboutDesc: 'Lumina Reader is an advanced document reader focused on immersive reading experience, supporting intelligent parsing and elegant typography for multiple formats.',
        features: 'Key Features', feature1: 'Support DOCX, TXT, Markdown, HTML, PDF formats',
        feature2: 'Smart chapter detection and hierarchy recognition',
        feature3: 'Multiple theme colors and font choices',
        feature4: 'Flexible typography customization',
        feature5: 'Full-text search and quick navigation',
        feature6: 'Intelligent Text to Speech',
        feature7: 'History and Library Management',
        feature8: 'Bookmark and Annotation Management',
        feature9: 'Smart Catalog of G-Point Heat Map',
        feature10: 'Multi file format export',
        shortcutsTitle: 'Keyboard Shortcuts',
        shortcutChapter: 'Previous/Next Chapter', shortcutSearch: 'Open Search',
        shortcutHistory: 'Open History', shortcutLibrary: 'Open Library', shortcutSettings: 'Open Settings', shortcutAnnotations: 'Open Annotations', shortcutClose: 'Close Panel',
        searchPlaceholder: 'Search...',
        chapterRegexPlaceholder: 'Chapter regex (e.g. ^Chapter)',
        sectionRegexPlaceholder: 'Section regex', searchResults: 'Search Results',
        searchEmpty: 'Enter keywords to search', searchNoResults: 'No matches found',
        confirm: 'OK', cancel: 'Cancel', save: 'Save', loading: 'Parsing file...',
        themeLight: 'Cloud White',
        themeSlate: 'Slate',
        themeParchment: 'Parchment',
        themeSprout: 'Sprout',
        themeMist: 'Mist',
        themeMint: 'Mint',
        themeRose: 'Rose',
        themeDusk: 'Twilight',
        themeOlive: 'Olive',
        themeEspresso: 'Espresso',
        themeMidnight: 'Deep Blue',
        themeNebula: 'Nebula',
        themeDark: 'Midnight Dark',
        themeAmoled: 'Obsidian',
        themeTaupe: 'Taupe',
        themeStraw: 'Straw',
        themeTerracotta: 'Terracotta',
        themeMauve: 'Dusty Mauve',
        themeSandstone: 'Sandstone',
        fontSerif: 'Serif', fontSans: 'Sans', fontKai: 'Kai', fontMono: 'Mono', fontRecommended: 'Recommended',
        chapterNumbering: 'Chapter Numbering', noneNumbering: 'None Numbering', roman: 'Roman Numerals', chineseNovel: 'Chinese Novel', englishNovel: 'English Novel',
        technical: 'Technical', academic: 'Academic', preface: 'Preface',
        prevChapter: 'Previous', nextChapter: 'Next', chapterEnd: 'End of Chapter',
        readTime: 'Read time', lastRead: 'Last read', wordCount: 'Words',
        words: 'words', mins: 'm', hours: 'h', unknown: 'Unknown',
        regexValid: '✓ Valid syntax',
        regexInvalid: '✗ Invalid syntax',
        regexMatches: 'Matches $1 chapters',
        regexNoFile: 'Open file to preview matches',
        confirmClearLibrary: 'Clear all library data? This action cannot be undone.',
        errorNoFile: 'Please open a file first',
        errorInvalidRegex: 'Invalid regex pattern',
        ruleApplied: 'Rules applied',
        dialogTitle: 'Notice',
        timeJustNow: 'Just now',
        timeMinutesAgo: '$1m ago',
        timeHoursAgo: '$1h ago',
        timeDaysAgo: '$1d ago',
        paragraph: 'Paragraph', title: 'Title', subtitle: 'Subtitle', list: 'List', image: 'Image',
        heading1: 'heading1', heading2: 'heading2', heading3: 'heading3', heading4: 'heading4', heading5: 'heading5', heading6: 'heading6',
        fontLoading: 'Loading font...',
        dbUsingCache: 'Restored from library',
        dbFileChanged: 'File updated, re-parsing...',
        localLibrary: 'Books Management',
        manageData: 'Manage Local Library',
        storageUsed: 'Storage Used',
        filesCount: 'books',
        imagesCount: 'covers',
        noDataToManage: 'No local data',
        confirmDeleteFile: 'Delete this book permanently? This cannot be undone.',
        fileDeleted: 'Deleted',
        deleteFailed: 'Delete failed',
        exportSuccess: 'Exported',
        exportFailed: 'Export failed',
        annotatedAt: 'Annotated at',
        importData: 'Import Data',
        importSuccess: 'Imported successfully',
        importFailed: 'Import failed',
        exportFile: 'Export',
        deleteFile: 'Delete',
        openBook: 'Open',
        fileDataLost: 'File data is lost or corrupted',
        booksUnit: 'books',
        libraryStorageDesc: 'Local library storage',
        library: 'Library',
        invalidHistoryFile: 'Invalid history file format',
        storageQuotaExceeded: 'Storage quota exceeded, please delete some old files',
        jsonFormatError: 'Invalid JSON format or unsupported file',
        batchExport: 'Export Library',
        batchImport: 'Import Library',
        libraryEmpty: 'Library is empty',
        libraryCleared: 'Library cleared',
        clearFailed: 'Clear failed',
        batchExportSuccess: 'Exported $1 books successfully',
        batchExportFailed: 'Export failed',
        noBooksInFile: 'No books found in file',
        confirmBatchImport: 'Import $1 books? This will merge with existing library.',
        importing: 'Importing',
        success: 'success',
        batchImportSuccess: 'Successfully imported $1 books',
        batchImportPartial: 'Import complete: $1 success, $2 failed',
        readingFile: 'Reading file...',
        lastReadHere: 'Last read here',
        generatingDocx: 'Generating document...',
        docxExportSuccess: 'Document exported successfully',
        docxExportFailed: 'Export failed: $1',
        confirmOverwrite: 'File "$1" already exists. Overwrite existing record? ',
        tts: 'Speech',
        ttsSettings: 'Text to Speech',
        ttsEnable: 'Enable TTS',
        ttsVoice: 'Voice',
        ttsVoiceLoading: 'Loading...',
        ttsRate: 'Speed',
        ttsPitch: 'Pitch',
        ttsFinished: 'Reading finished',
        annotations: 'Annotations',
        annotation: 'Annotation',
        bookmark: 'Bookmark',
        storageDetails: 'Storage',
        storageMode: 'Storage Mode',
        storageEngine: 'Storage Engine',
        storageLocal: 'Local Storage (IndexedDB)',
        storageServer: 'Backend Storage (SQLite)',
        storageFallback: 'Backend Storage (SQLite) - Fallback',
        booksCountLabel: 'Books',
        booksCountValue: '$1 books',
        storageUsedLabel: 'Storage Used',
        storageSizeValue: '$1 MB',
        storageEndpoint: 'Endpoint',
        storageOnline: 'Online',
        storageOffline: 'Offline',
        storageDegraded: 'Degraded',
        prevPage: 'Previous',
        nextPage: 'Next',
        addBookmark: 'Add Bookmark',
        addAnnotation: 'Add Note',
        copyText: 'Copy Text',
        textCopied: 'Text copied',
        editBookmark: 'Edit Bookmark',
        editAnnotation: 'Edit Note',
        bookmarkAdded: 'Bookmark added',
        bookmarkUpdated: 'Bookmark updated',
        bookmarkDeleted: 'Bookmark deleted',
        deleteBookmark: 'Delete Bookmark',
        annotationSaved: 'Note saved',
        annotationUpdated: 'Note updated',
        annotationDeleted: 'Note deleted',
        deleteAnnotation: 'Delete Note',
        confirmDeleteBookmark: 'Delete this bookmark?',
        confirmDeleteAnnotation: 'Delete this note?',
        noAnnotations: 'No bookmarks or notes',
        annotationHint: 'Select text to add note, or click to add bookmark',
        annotationPlaceholder: 'Enter your note...',
        bookmark: 'Bookmark',
        edit: 'Edit',
        delete: 'Delete',
        confirmDeleteAnnotation: 'Delete this mark?', 
        firstPage: 'First',
        lastPage: 'Last',
        pageInfo: 'Page $1/$2',
        jumpToPage: 'Jumpto Page $1',
        atBeginning: 'At Beginning',
        atEnd: 'At End',
        prevChapterTooltip: 'Previous Chapter: $1',
        nextChapterTooltip: 'Next Chapter: $1',
        loadingFile: 'Loading File...',
        pdfParsing: 'Parsing PDF',
        pdfPasswordRequired: 'Password Required',
        ruleApplyFailed: 'Failed to apply rules',
        fileTooLarge: 'Large File',
        fileTooLargeMessage: 'This file contains many images. Please choose save option:',
        largeFileTitle: 'Large File Warning',
        saveTextOnly: 'Save Text Only',
        doNotSave: 'Do Not Save to Library',
        fileNotSaved: 'File not saved to library, but you can continue reading',
        fileSavedTextOnly: 'Text-only saved to library (images not saved)',
        saving: 'Saving...',
        savingText: 'Saving text...',
        pdfPasswordError: 'Incorrect Password',
        pdfPasswordPrompt: 'This PDF is password protected. Please enter the password',
        pdfPasswordRetry: 'Please re-enter the PDF password',
        pdfPasswordPlaceholder: 'Enter password',
        regexHelpTooltip: 'Regex Help',
        regexHelpTitle: 'Regular Expression Help',
        regexBasicSyntax: 'Basic Syntax',
        regexBasicDesc: 'Standard JavaScript regex syntax supported. Common symbols:',
        regexMacros: 'Macro Shortcuts',
        regexMacrosDesc: 'Use these macros to simplify patterns:',
        regexExamples: 'Common Examples',
        regexDescStart: 'Start of line',
        regexDescEnd: 'End of line',
        regexDescAny: 'Any character',
        regexDescZeroOrMore: 'Zero or more',
        regexDescOneOrMore: 'One or more',
        regexDescZeroOrOne: 'Zero or one',
        regexDescGroup: 'Character group, e.g. [0-9] for digits',
        regexDescCapture: 'Capture group',
        regexDescCN: 'Chinese numerals (一二三四...)',
        regexDescRomanU: 'Upper Roman (IVXLCDM)',
        regexDescRomanL: 'Lower Roman (ivxlcdm)',
        regexDescNum: 'Arabic numerals (\\d+)',
        regexDescUpper: 'Uppercase letters (A-Z)',
        regexDescLower: 'Lowercase letters (a-z)',
        regexDescAlpha: 'Any letters (A-Za-z)',
        regexDescWord: 'English words ([A-Za-z]+)',
        regexDescSpace: 'Whitespace (\\s+)',
        regexExTitleCN: 'Chinese Chapter',
        regexExTitleEN: 'English Chapter',
        regexExTitleSection: 'Section X.Y',
        regexExTitleVolume: 'Volume X Chapter Y',
        regexExTitleCnCode: '第\\C章',
        regexExTitleEnCode: 'Chapter\\S\\N',
        regexExTitleSectionCode: '^\\N\\.\\N',
        regexExTitleVolumneCode: '第\\C卷\\S第\\C章',
        regexNoteDetail: 'Tip: Auto-add ^ for line start. Use () groups to capture titles.',
        immersiveEnter: 'Immersive On',
        immersiveExit: 'Immersive Off',
        txt: 'Text',
        md: 'Markdown',
        html: 'HTML',
        docx: 'Word',
        paginationSettings: 'Pagination',
        paginationEnabled: 'Enable Pagination',
        paginationMaxWords: 'Max Words Per Page',
        paginationImageWords: 'Image Equivalent Words',
    }
};

Lumina.I18n.t = (key, ...args) => {
    const text = Lumina.I18n.data[Lumina.State.settings.language]?.[key] || Lumina.I18n.data.zh[key] || key;
    return args.reduce((str, arg, i) => str.replace(`$${i + 1}`, arg), text);
};

// ==================== 4. 存储层 ====================

Lumina.DB.StorageAdapter = class {
    constructor() { this.impl = null; }

    async use(type) {
        if (type === 'indexeddb') this.impl = new Lumina.DB.IndexedDBImpl();
        else if (type === 'sqlite') this.impl = new Lumina.DB.SQLiteImpl();
        else if (type === 'capacitor') this.impl = new Lumina.DB.CapacitorSQLiteImpl();
        else throw new Error(`Unknown storage type: ${type}`);
        return this.impl.init();
    }

    async getFileSmart(fileKey) {
        if (this.impl && this.impl.getFileSmart) {
            return this.impl.getFileSmart(fileKey);
        }
        // 降级到普通 getFile
        return this.impl.getFile(fileKey);
    }

    async saveFile(fileKey, data) { return this.impl.saveFile(fileKey, data); }
    async getFile(fileKey) { return this.impl.getFile(fileKey); }
    async getAllFiles() { return this.impl.getAllFiles(); }
    async deleteFile(fileKey) { return this.impl.deleteFile(fileKey); }
    async findByFileName(fileName) { return this.impl.findByFileName(fileName); }
    async overwriteFile(oldKey, newKey, newData, oldData) { return this.impl.overwriteFile(oldKey, newKey, newData, oldData); }
    generateFileKey(file) { return this.impl.generateFileKey(file); }
    async getStorageStats() { return this.impl.getStorageStats(); }
    async exportBatch() { return this.impl.exportBatch(); }
    async importBatch(books, onProgress) { return this.impl.importBatch(books, onProgress); }
    async updateCover(fileKey, coverDataUrl) { return this.impl.updateCover(fileKey, coverDataUrl); }
    async exportFile(fileKey) { return this.impl.exportFile(fileKey); }
};

Lumina.DB.IndexedDBImpl = class {
    constructor() {
        this.db = null;
        this.DB_NAME = 'LuminaReaderDB';
        this.DB_VERSION = 2;
        this.MAX_FILES = 50;
        this.isReady = false;
    }

    async init() {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onerror = () => { this.isReady = false; resolve(false); };
            request.onsuccess = (event) => {
                this.db = event.target.result;
                if (!this.db.objectStoreNames.contains('fileData')) {
                    this.db.close();
                    const deleteReq = indexedDB.deleteDatabase(this.DB_NAME);
                    deleteReq.onsuccess = () => {
                        this.DB_VERSION = 1;
                        this.init().then(resolve);
                    };
                    deleteReq.onerror = () => { this.isReady = false; resolve(false); };
                    return;
                }
                this.isReady = true;
                resolve(true);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('fileData')) {
                    const store = db.createObjectStore('fileData', { keyPath: 'fileKey' });
                    store.createIndex('lastReadTime', 'lastReadTime', { unique: false });
                    store.createIndex('fileName', 'fileName', { unique: false });
                }
            };
        });
    }

    generateFileKey(file) {
        const name = file.name || file;
        const size = file.size || 0;
        const mtime = file.lastModified || 0;
        return `${name}_${size}_${mtime}`;
    }

    async saveFile(fileKey, data) {
        if (!this.isReady || !this.db) return false;
        try {
            const transaction = this.db.transaction(['fileData'], 'readwrite');
            const store = transaction.objectStore('fileData');
            
            const record = {
                fileKey,
                fileName: data.fileName,
                fileType: data.fileType,
                fileSize: data.fileSize || 0,
                content: data.content,
                wordCount: data.wordCount,
                lastChapter: data.lastChapter || 0,
                lastScrollIndex: data.lastScrollIndex || 0,
                chapterTitle: data.chapterTitle || '',
                lastReadTime: data.lastReadTime || new Date().toISOString(),
                customRegex: data.customRegex || { chapter: '', section: '' },
                chapterNumbering: data.chapterNumbering || 'none',
                annotations: data.annotations || [],
                cover: data.cover || null,
                heatMap: data.heatMap || null  // 保存热力图数据
            };
            
            return new Promise((resolve) => {
                const request = store.put(record);
                request.onsuccess = () => {
                    resolve(true);
                };
                request.onerror = (e) => {
                    resolve(false);
                };
            });
        } catch (e) { 
            console.error('[IndexedDB] 异常:', e);
            return false; 
        }
    }

    async getFile(fileKey) {
        if (!this.isReady || !this.db) return null;
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['fileData'], 'readonly');
                const store = transaction.objectStore('fileData');
                const request = store.get(fileKey);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    }

    async getAllFiles() {
        if (!this.isReady || !this.db) return [];
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['fileData'], 'readonly');
                const store = transaction.objectStore('fileData');
                const index = store.index('lastReadTime');
                const request = index.openCursor(null, 'prev');
                const files = [];
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) { files.push(cursor.value); cursor.continue(); }
                    else resolve(files);
                };
                request.onerror = () => resolve([]);
            } catch (e) { resolve([]); }
        });
    }

    async deleteFile(fileKey) {
        if (!this.isReady || !this.db) return false;
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['fileData'], 'readwrite');
                const store = transaction.objectStore('fileData');
                const request = store.delete(fileKey);
                request.onsuccess = () => resolve(true);
                request.onerror = () => resolve(false);
            } catch (e) { resolve(false); }
        });
    }

    async findByFileName(fileName) {
        if (!this.isReady || !this.db) return null;
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['fileData'], 'readonly');
                const store = transaction.objectStore('fileData');
                const index = store.index('fileName');
                const request = index.get(fileName);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    }

    async overwriteFile(oldKey, newKey, newData, oldData) {
        await this.deleteFile(oldKey);
        const mergedData = {
            ...newData,
            lastChapter: oldData.lastChapter || 0,
            lastScrollIndex: oldData.lastScrollIndex || 0,
            chapterTitle: oldData.chapterTitle || '',
            customRegex: oldData.customRegex || { chapter: '', section: '' },
            chapterNumbering: oldData.chapterNumbering || 'none',
            annotations: oldData.annotations || [],
            cover: newData.cover || oldData.cover || null,
            lastReadTime: new Date().toISOString()
        };
        return this.saveFile(newKey, mergedData);
    }

    async cleanupOldFiles(keepCount) {
        try {
            const files = await this.getAllFiles();
            if (files.length <= keepCount) return;
            const toDelete = files.slice(keepCount);
            for (const file of toDelete) await this.deleteFile(file.fileKey);
        } catch (e) { }
    }

    async getStorageStats() {
        const files = await this.getAllFiles();
        let totalSize = 0, imageCount = 0;
        files.forEach(file => {
            const contentSize = JSON.stringify(file.content || []).length * 2;
            const coverSize = file.cover ? file.cover.length * 0.75 : 0;
            file.estimatedSize = (contentSize + coverSize) / (1024 * 1024);
            totalSize += file.estimatedSize;
            if (file.cover) imageCount++;
        });
        return { files, totalFiles: files.length, totalSize: totalSize.toFixed(2), imageCount, maxFiles: this.MAX_FILES };
    }

    async exportBatch() {
        const files = await this.getAllFiles();
        if (!files.length) return null;
        const books = files.map(file => ({
            fileKey: file.fileKey, 
            fileName: file.fileName, 
            fileType: file.fileType,
            fileSize: file.fileSize, 
            wordCount: file.wordCount, 
            content: file.content,
            cover: file.cover || null, 
            customRegex: file.customRegex || { chapter: '', section: '' },
            chapterNumbering: file.chapterNumbering || 'none', 
            lastChapter: file.lastChapter || 0, 
            lastScrollIndex: file.lastScrollIndex || 0,
            chapterTitle: file.chapterTitle || '',
            lastReadTime: file.lastReadTime
        }));
        return {
            version: this.DB_VERSION, 
            exportType: 'batch', 
            exportDate: new Date().toISOString(),
            appName: 'Lumina Reader', 
            books, 
            totalBooks: books.length, 
            totalSize: '0MB'
        };
    }

    async importBatch(books, onProgress) {
        const results = { success: 0, failed: 0, errors: [] };
        for (let i = 0; i < books.length; i++) {
            const book = books[i];
            try {
                if (!book.fileName || !Array.isArray(book.content)) throw new Error('Invalid book data');
                const newKey = `${book.fileName}_${Date.now()}_${i}`;
                await this.cleanupOldFiles(this.MAX_FILES - (books.length - i) - 1);
                await this.saveFile(newKey, {
                    fileName: book.fileName, fileType: book.fileType || 'txt', fileSize: book.fileSize || 0,
                    content: book.content, wordCount: book.wordCount || 0, cover: book.cover || null,
                    customRegex: book.customRegex || { chapter: '', section: '' },
                    lastChapter: book.lastChapter || 0, chapterTitle: book.chapterTitle || '',
                    lastReadTime: book.lastReadTime || new Date().toISOString()
                });
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push({ book: book.fileName, error: err.message });
            }
            if (onProgress) onProgress(i + 1, books.length, results.success);
        }
        return results;
    }

    async updateCover(fileKey, coverDataUrl) {
        const fileData = await this.getFile(fileKey);
        if (fileData) {
            fileData.cover = coverDataUrl;
            return this.saveFile(fileKey, fileData);
        }
        return false;
    }

    async exportFile(fileKey) {
        const file = await this.getFile(fileKey);
        if (!file) return null;
        return {
            version: this.DB_VERSION, 
            exportType: 'single', 
            exportDate: new Date().toISOString(),
            appName: 'Lumina Reader', 
            fileName: file.fileName, 
            fileType: file.fileType,
            content: file.content, 
            wordCount: file.wordCount, 
            cover: file.cover || null,
            customRegex: file.customRegex,
            chapterNumbering: file.chapterNumbering || 'none',  
            lastChapter: file.lastChapter || 0,
            lastScrollIndex: file.lastScrollIndex || 0,
            chapterTitle: file.chapterTitle || ''
        };
    }
};

// ========== Capacitor SQLite 实现（原生APP模式）==========
Lumina.DB.CapacitorSQLiteImpl = class {
    constructor() {
        this.isReady = false;
        this.dbBridge = null;
        this.cache = new Map();
        this.listCache = null;
        this.listTimestamp = 0;
        this.CACHE_VALID_MS = 30000;
        this.isRefreshing = false;
        this.localCache = null;
        this.localCacheReady = false;
    }

    async init() {
        try {
            // 动态导入 db-bridge
            const module = await import('./assets/js/db-bridge.js');
            this.dbBridge = module.dbBridge;
            
            // 等待桥接初始化
            if (!this.dbBridge.initialized) {
                await this.dbBridge.init();
            }
            
            this.isReady = true;
            
            // 初始化本地 IndexedDB 作为二级缓存
            this.localCache = new Lumina.DB.IndexedDBImpl();
            this.localCacheReady = await this.localCache.init();
            
            this.backgroundRefresh();
            return true;
        } catch (e) {
            console.error('[CapacitorSQLite] 初始化失败:', e);
            this.isReady = false;
            return false;
        }
    }

    generateFileKey(file) {
        const name = file.name || file;
        const size = file.size || 0;
        const mtime = file.lastModified || 0;
        return `${name}_${size}_${mtime}`;
    }

    async getStorageStats(forceRefresh = false) {
        const now = Date.now();
        
        if (!forceRefresh && this.listCache && (now - this.listTimestamp < this.CACHE_VALID_MS)) {
            if (!this.isRefreshing) {
                this.backgroundRefresh();
            }
            return this.listCache;
        }
        
        try {
            const fresh = await this.fetchFromDB();
            this.listCache = fresh;
            this.listTimestamp = now;
            return fresh;
        } catch (error) {
            if (this.listCache) {
                return {...this.listCache, _stale: true};
            }
            throw error;
        }
    }

    async backgroundRefresh() {
        if (this.isRefreshing) return;
        this.isRefreshing = true;
        
        try {
            const fresh = await this.fetchFromDB();
            const oldCount = this.listCache?.totalFiles || 0;
            const newCount = fresh.totalFiles;
            
            this.listCache = fresh;
            this.listTimestamp = Date.now();
            
            if (document.getElementById('dataManagerPanel')?.classList.contains('active')) {
                if (newCount !== oldCount || JSON.stringify(fresh.files) !== JSON.stringify(this.listCache?.files)) {
                    if (Lumina.DataManager) {
                        Lumina.DataManager.updateGridSilently(fresh);
                    }
                }
            }
        } catch (e) {
            // 静默失败
        } finally {
            this.isRefreshing = false;
        }
    }

    async fetchFromDB() {
        const [files, stats] = await Promise.all([
            this.dbBridge.getList(),
            this.dbBridge.getStats()
        ]);
        
        files.forEach(file => {
            file.estimatedSize = (file.fileSize / (1024 * 1024)).toFixed(2);
        });
        
        return {
            files,
            totalFiles: stats.totalFiles,
            totalSize: stats.totalSize.toFixed(2),
            imageCount: 0,
            maxFiles: '∞'
        };
    }

    async getFile(fileKey) {
        if (this.cache.has(fileKey)) {
            return this.cache.get(fileKey);
        }
        
        try {
            const result = await this.dbBridge.get(fileKey);
            if (result) {
                this.cache.set(fileKey, result);
            }
            return result;
        } catch (error) {
            console.error(`[CapacitorSQLite] 获取文件失败 ${fileKey}:`, error);
            throw error;
        }
    }

    async getFileSmart(fileKey) {
        // 1. 先查本地缓存
        if (this.localCacheReady) {
            try {
                const local = await this.localCache.getFile(fileKey);
                if (local?.content?.length > 0 && local.fileName) {
                    this.syncFromRemote(fileKey);
                    return local;
                }
            } catch (e) {}
        }
        
        // 2. 从原生数据库加载
        Lumina.UI.showToast('首次加载中...', 0);
        const remote = await this.getFile(fileKey);
        
        // 3. 保存到本地缓存
        if (remote && this.localCacheReady) {
            setTimeout(() => {
                this.localCache.saveFile(fileKey, remote).catch(() => {});
            }, 500);
        }
        
        return remote;
    }

    async syncFromRemote(fileKey) {
        // Capacitor 模式下不需要同步，因为只有一个数据源
        // 但为了兼容，保留方法
    }

    async saveFile(fileKey, data) {
        try {
            const existing = this.cache.get(fileKey) || {};
            
            const mergedAnnotations = (data.annotations === undefined || 
                (Array.isArray(data.annotations) && data.annotations.length === 0 && existing.annotations?.length > 0))
                ? existing.annotations 
                : data.annotations;
            
            let mergedHeatMap;
            if (data.heatMap === undefined && existing.heatMap) {
                mergedHeatMap = existing.heatMap;
            } else if (data.heatMap === undefined) {
                mergedHeatMap = null;
            } else {
                mergedHeatMap = data.heatMap;
            }
            
            const mergedData = {
                ...existing,
                ...data,
                annotations: mergedAnnotations,
                heatMap: mergedHeatMap,
                fileKey
            };
            
            const result = await this.dbBridge.save(fileKey, mergedData);
            
            if (result.success) {
                this.cache.set(fileKey, mergedData);
                this.listTimestamp = 0;
                setTimeout(() => this.backgroundRefresh(), 500);
                
                if (this.localCacheReady) {
                    this.localCache.saveFile(fileKey, mergedData).catch(() => {});
                }
            }
            return result.success;
        } catch (error) {
            console.error('[CapacitorSQLite] saveFile 失败:', error);
            return false;
        }
    }

    async deleteFile(fileKey) {
        try {
            const result = await this.dbBridge.delete(fileKey);
            if (result.success) {
                this.cache.delete(fileKey);
                this.listTimestamp = 0;
                this.backgroundRefresh();
                
                if (this.localCacheReady) {
                    await this.localCache.deleteFile(fileKey);
                }
            }
            return result;
        } catch (error) {
            console.error('[CapacitorSQLite] deleteFile 失败:', error);
            return { success: false };
        }
    }

    async getAllFiles() {
        const stats = await this.getStorageStats();
        return stats.files;
    }

    async findByFileName(fileName) {
        const files = await this.getAllFiles();
        return files.find(f => f.fileName === fileName) || null;
    }

    async overwriteFile(oldKey, newKey, newData, oldData) {
        await this.deleteFile(oldKey);
        const mergedData = {
            ...newData,
            lastChapter: oldData.lastChapter || 0,
            lastScrollIndex: oldData.lastScrollIndex || 0,
            chapterTitle: oldData.chapterTitle || '',
            customRegex: oldData.customRegex || {chapter: '', section: ''},
            chapterNumbering: oldData.chapterNumbering || 'none',
            annotations: oldData.annotations || [],
            cover: newData.cover || oldData.cover || null,
            lastReadTime: new Date().toISOString()
        };
        return this.saveFile(newKey, mergedData);
    }

    async exportBatch() {
        const files = await this.getAllFiles();
        if (!files.length) return null;
        
        const books = [];
        for (const file of files) {
            const fullData = await this.getFile(file.fileKey);
            if (fullData) books.push(fullData);
        }
        
        return {
            version: 2,
            exportType: 'batch',
            exportDate: new Date().toISOString(),
            appName: 'Lumina Reader',
            books,
            totalBooks: books.length
        };
    }

    async importBatch(books, onProgress) {
        const results = {success: 0, failed: 0, errors: []};
        for (let i = 0; i < books.length; i++) {
            const book = books[i];
            try {
                if (!book.fileName || !Array.isArray(book.content)) {
                    throw new Error('Invalid book data');
                }
                const newKey = `${book.fileName}_${Date.now()}_${i}`;
                await this.saveFile(newKey, {
                    fileName: book.fileName,
                    fileType: book.fileType || 'txt',
                    fileSize: book.fileSize || 0,
                    content: book.content,
                    wordCount: book.wordCount || 0,
                    lastChapter: book.lastChapter || 0,
                    lastScrollIndex: book.lastScrollIndex || 0,
                    chapterTitle: book.chapterTitle || '',
                    customRegex: book.customRegex || {},
                    chapterNumbering: book.chapterNumbering || 'none',
                    annotations: book.annotations || [],
                    cover: book.cover || null,
                    heatMap: book.heatMap || null,
                    lastReadTime: new Date().toISOString()
                });
                results.success++;
                if (onProgress) onProgress(i + 1, books.length, true);
            } catch (e) {
                results.failed++;
                results.errors.push(`${book.fileName}: ${e.message}`);
                if (onProgress) onProgress(i + 1, books.length, false);
            }
        }
        return results;
    }

    async exportFile(fileKey) {
        return await this.getFile(fileKey);
    }
};

// ========== 原 Web SQLite 实现（HTTP 模式）==========
Lumina.DB.SQLiteImpl = class {
    constructor() {
        this.baseUrl = 'http://localhost:8080/api';
        this.isReady = false;
        
        // 智能缓存系统
        this.cache = new Map();
        this.listCache = null;
        this.listTimestamp = 0;
        this.CACHE_VALID_MS = 30000;
        this.isRefreshing = false;
        this.errorCount = 0;
        this.MAX_ERRORS = 3;
        
        // 本地 IndexedDB 二级缓存（用于加速二次打开）
        this.localCache = null; 
        this.localCacheReady = false;
    }

    async init() {
        try {
            const response = await fetch(`${this.baseUrl}/health`, { 
                method: 'GET', 
                signal: AbortSignal.timeout(1500) 
            });
            this.isReady = response.ok;
            
            // 初始化本地 IndexedDB 缓存
            if (this.isReady) {
                this.localCache = new Lumina.DB.IndexedDBImpl();
                this.localCacheReady = await this.localCache.init();
                // 启动时预加载书库列表
                this.backgroundRefresh();
            }
            return this.isReady;
        } catch (e) { 
            return false; 
        }
    }

    async _fetch(endpoint, options = {}, timeoutMs = 5000) {
        const url = `${this.baseUrl}${endpoint}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        
        try {
            const response = await fetch(url, {
                ...options,
                headers: { 'Content-Type': 'application/json', ...options.headers },
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.errorCount++;
            }
            throw error;
        }
    }

    generateFileKey(file) {
        const name = file.name || file;
        const size = file.size || 0;
        const mtime = file.lastModified || 0;
        return `${name}_${size}_${mtime}`;
    }

    // ========== 核心优化：智能获取（先本地后远程） ==========
    async getFileSmart(fileKey) {
        // 1. 先查本地 IndexedDB（秒开）
        if (this.localCacheReady) {
            try {
                const local = await this.localCache.getFile(fileKey);
                if (local) {
                    const hasContent = local.content && Array.isArray(local.content) && local.content.length > 0;
                    const hasFileName = local.fileName && local.fileName.length > 0;
                    
                    if (hasContent && hasFileName) {
                        // 检查本地数据是否完整（有热力图数据）
                        // 如果本地有内容但没有 heatMap，先尝试从远程同步
                        if (!local.heatMap) {
                            try {
                                const remote = await this.getFile(fileKey);
                                if (remote && remote.heatMap) {
                                    setTimeout(() => {
                                        this.localCache.saveFile(fileKey, remote);
                                    }, 100);
                                    return remote;
                                }
                            } catch (e) {}
                        }
                        
                        // 后台同步阅读进度（异步，不阻塞）
                        this.syncFromRemote(fileKey);
                        return local;
                    }
                }
            } catch (e) {
                console.error('[getFileSmart] 本地缓存读取失败:', e);
            }
        }
        
        // 2. 本地没有，从服务器加载
        Lumina.UI.showToast('首次加载中...', 0);
        
        const remote = await this.getFile(fileKey);
        
        // 3. 保存到本地缓存（比较数据新旧）
        if (remote && this.localCacheReady) {
            console.log('[SQLite] 准备保存到本地缓存...');
            
            // 延迟保存，避免与 saveFile 冲突
            setTimeout(async () => {
                try {
                    // 检查是否已存在，并比较数据新旧
                    const exists = await this.localCache.getFile(fileKey);
                    let shouldSave = true;
                    
                    if (exists) {
                        // 比较更新时间，远程数据更新才保存
                        const localTime = new Date(exists.lastReadTime || 0);
                        const remoteTime = new Date(remote.lastReadTime || 0);
                        
                        // 检查热力图是否需要更新
                        let heatMapNeedsUpdate = false;
                        if (remote.heatMap && !exists.heatMap) {
                            heatMapNeedsUpdate = true;
                        } else if (remote.heatMap && exists.heatMap) {
                            const remoteHeatTime = remote.heatMap.updatedAt || 0;
                            const localHeatTime = exists.heatMap.updatedAt || 0;
                            heatMapNeedsUpdate = remoteHeatTime > localHeatTime;
                        }
                        
                        // 如果远程数据不更新且热力图也不需要更新，则跳过
                        if (remoteTime <= localTime && !heatMapNeedsUpdate) {
                            console.log('[SQLite] 本地缓存已是最新，跳过保存');
                            shouldSave = false;
                        } else {
                            console.log('[SQLite] 远程数据更新，需要同步到本地缓存:', {
                                timeUpdated: remoteTime > localTime,
                                heatMapUpdated: heatMapNeedsUpdate
                            });
                        }
                    }
                    
                    if (shouldSave) {
                        await this.localCache.saveFile(fileKey, remote);
                    }
                } catch (e) {
                    console.error('[SQLite] 缓存保存错误:', e);
                }
            }, 500); // 延迟500ms，确保 saveFile 先完成
        }
        
        return remote;
    }

    // 后台同步（更新阅读进度、注释、热力图等信息）
    async syncFromRemote(fileKey) {
        try {
            const remote = await this.getFile(fileKey);
            if (remote && this.localCacheReady) {
                const local = await this.localCache.getFile(fileKey);
                if (local) {
                    const localTime = new Date(local.lastReadTime || 0);
                    const remoteTime = new Date(remote.lastReadTime || 0);
                    
                    // 检查注释是否需要同步
                    const localAnnotations = local.annotations || [];
                    const remoteAnnotations = remote.annotations || [];
                    const needsSyncAnnotations = localAnnotations.length !== remoteAnnotations.length ||
                        JSON.stringify(localAnnotations) !== JSON.stringify(remoteAnnotations);
                    
                    // 检查热力图是否需要同步
                    const localHeatMap = local.heatMap;
                    const remoteHeatMap = remote.heatMap;
                    let needsSyncHeatMap = false;
                    if (remoteHeatMap && !localHeatMap) {
                        needsSyncHeatMap = true;
                    } else if (remoteHeatMap && localHeatMap) {
                        // 比较更新时间
                        const localHeatTime = localHeatMap.updatedAt || 0;
                        const remoteHeatTime = remoteHeatMap.updatedAt || 0;
                        needsSyncHeatMap = remoteHeatTime > localHeatTime;
                    }
                    
                    // 如果阅读时间更新，或注释需要同步，或热力图需要同步
                    if (remoteTime > localTime || needsSyncAnnotations || needsSyncHeatMap) {
                        await this.localCache.saveFile(fileKey, remote);
                    }
                }
            }
        } catch (e) {
            // 静默失败
        }
    }

    async getStorageStats(forceRefresh = false) {
        const now = Date.now();
        
        if (!forceRefresh && this.listCache && (now - this.listTimestamp < this.CACHE_VALID_MS)) {
            if (!this.isRefreshing) {
                this.backgroundRefresh();
            }
            return this.listCache;
        }
        
        try {
            const fresh = await this.fetchFromServer();
            this.listCache = fresh;
            this.listTimestamp = now;
            this.errorCount = 0;
            return fresh;
        } catch (error) {
            if (this.listCache) {
                return {...this.listCache, _stale: true};
            }
            throw error;
        }
    }

    async backgroundRefresh() {
        if (this.isRefreshing) return;
        this.isRefreshing = true;
        
        try {
            const fresh = await this.fetchFromServer();
            const oldCount = this.listCache?.totalFiles || 0;
            const newCount = fresh.totalFiles;
            
            this.listCache = fresh;
            this.listTimestamp = Date.now();
            
            if (document.getElementById('dataManagerPanel')?.classList.contains('active')) {
                if (newCount !== oldCount || JSON.stringify(fresh.files) !== JSON.stringify(this.listCache?.files)) {
                    if (Lumina.DataManager) {
                        Lumina.DataManager.updateGridSilently(fresh);
                    }
                }
            }
        } catch (e) {
            // 静默失败
        } finally {
            this.isRefreshing = false;
        }
    }

    async fetchFromServer() {
        const results = await this._fetch('/batch', {
            method: 'POST',
            body: JSON.stringify({
                requests: [{method: 'getList'}, {method: 'getStats'}]
            })
        });
        
        const files = results[0];
        const stats = results[1];
        
        files.forEach(file => {
            file.estimatedSize = (file.fileSize / (1024 * 1024)).toFixed(2);
        });
        
        return {
            files,
            totalFiles: stats.totalFiles,
            totalSize: stats.totalSize.toFixed(2),
            imageCount: 0,
            maxFiles: '∞'
        };
    }

    async getFile(fileKey) {
        if (this.cache.has(fileKey)) {
            return this.cache.get(fileKey);
        }
        
        try {
            const result = await this._fetch(
                `/file/${encodeURIComponent(fileKey)}`, 
                {}, 
                60000  // 大文件60秒超时
            );
            
            if (result) {
                this.cache.set(fileKey, result);
                this.errorCount = 0;
            }
            return result;
        } catch (error) {
            console.error(`[SQLite] 获取文件失败 ${fileKey}:`, error);
            throw error;
        }
    }

    async saveFile(fileKey, data) {            
        try {
            // 关键修复：合并数据而不是完全替换，避免丢失 annotations 和 heatMap
            const existing = this.cache.get(fileKey) || {};
            
            // 特殊处理 annotations：如果 data.annotations 是空数组但 existing 有数据，保留 existing
            const mergedAnnotations = (data.annotations === undefined || 
                (Array.isArray(data.annotations) && data.annotations.length === 0 && existing.annotations?.length > 0))
                ? existing.annotations 
                : data.annotations;
            
            // 特殊处理 heatMap：如果 data.heatMap 为 undefined（未设置）但 existing 有数据，保留 existing
            // 注意：如果明确设置为 null，则允许删除
            // 如果两者都是 undefined，则显式设置为 null，避免 JSON 序列化时忽略该字段
            let mergedHeatMap;
            if (data.heatMap === undefined && existing.heatMap) {
                mergedHeatMap = existing.heatMap;
            } else if (data.heatMap === undefined) {
                mergedHeatMap = null;  // 显式设置为 null，不是 undefined
            } else {
                mergedHeatMap = data.heatMap;
            }
            
            const mergedData = {
                ...existing,
                ...data,
                annotations: mergedAnnotations,
                heatMap: mergedHeatMap,
                fileKey
            };
            
            // 关键修复：将 undefined 转换为 null，否则 JSON.stringify 会忽略该字段
            const dataToSend = JSON.parse(JSON.stringify(mergedData, (key, value) => 
                value === undefined ? null : value
            ));
            
            // 先保存到远程 SQLite
            const result = await this._fetch(
                '/save',
                {
                    method: 'POST',
                    body: JSON.stringify({fileKey, data: dataToSend})
                },
                5000
            );
            
            if (result && result.success) {
                // 更新内存缓存（使用合并后的数据）
                this.cache.set(fileKey, mergedData);
                this.listTimestamp = 0;
                this.errorCount = 0;
                
                // 延迟刷新列表
                setTimeout(() => this.backgroundRefresh(), 500);
                
                // 同步更新本地缓存
                if (this.localCacheReady) {
                    try {
                        await this.localCache.saveFile(fileKey, mergedData);
                    } catch (e) {
                        console.warn('[SQLite] 本地缓存更新失败:', e);
                    }
                }
            }
            return result && result.success;
        } catch (error) {
            console.log('[SQLite] saveFile 失败:', error);
            return false;
        }
    }

    async deleteFile(fileKey) {
        const result = await this._fetch(
            `/file/${encodeURIComponent(fileKey)}`, 
            {method: 'DELETE'}
        );
        
        if (result) {
            this.cache.delete(fileKey);
            this.listTimestamp = 0;
            this.backgroundRefresh();
            
            // 同时删除本地缓存
            if (this.localCacheReady) {
                await this.localCache.deleteFile(fileKey);
            }
        }
        return result;
    }

    async getAllFiles() {
        const stats = await this.getStorageStats();
        return stats.files;
    }

    async findByFileName(fileName) {
        const files = await this.getAllFiles();
        return files.find(f => f.fileName === fileName) || null;
    }

    async overwriteFile(oldKey, newKey, newData, oldData) {
        await this.deleteFile(oldKey);
        const mergedData = {
            ...newData,
            lastChapter: oldData.lastChapter || 0,
            lastScrollIndex: oldData.lastScrollIndex || 0,
            chapterTitle: oldData.chapterTitle || '',
            customRegex: oldData.customRegex || {chapter: '', section: ''},
            chapterNumbering: oldData.chapterNumbering || 'none',
            annotations: oldData.annotations || [],
            cover: newData.cover || oldData.cover || null,
            lastReadTime: new Date().toISOString()
        };
        return this.saveFile(newKey, mergedData);
    }

    async exportBatch() {
        const files = await this.getAllFiles();
        if (!files.length) return null;
        
        const books = [];
        for (const file of files) {
            const fullData = await this.getFile(file.fileKey);
            if (fullData) books.push(fullData);
        }
        
        return {
            version: 2,
            exportType: 'batch',
            exportDate: new Date().toISOString(),
            appName: 'Lumina Reader',
            books,
            totalBooks: books.length
        };
    }

    async importBatch(books, onProgress) {
        const results = {success: 0, failed: 0, errors: []};
        for (let i = 0; i < books.length; i++) {
            const book = books[i];
            try {
                if (!book.fileName || !Array.isArray(book.content)) {
                    throw new Error('Invalid book data');
                }
                const newKey = `${book.fileName}_${Date.now()}_${i}`;
                await this.saveFile(newKey, {
                    fileName: book.fileName,
                    fileType: book.fileType || 'txt',
                    fileSize: book.fileSize || 0,
                    content: book.content,
                    wordCount: book.wordCount || 0,
                    cover: book.cover || null,
                    customRegex: book.customRegex || {chapter: '', section: ''},
                    lastChapter: book.lastChapter || 0,
                    chapterTitle: book.chapterTitle || '',
                    lastReadTime: book.lastReadTime || new Date().toISOString()
                });
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push({book: book.fileName, error: err.message});
            }
            if (onProgress) onProgress(i + 1, books.length, results.success);
        }
        this.listTimestamp = 0;
        this.backgroundRefresh();
        return results;
    }

    async updateCover(fileKey, coverDataUrl) {
        const fileData = await this.getFile(fileKey);
        if (fileData) {
            fileData.cover = coverDataUrl;
            return this.saveFile(fileKey, fileData);
        }
        return false;
    }

    async exportFile(fileKey) {
        return await this.getFile(fileKey);
    }
};

// ==================== 5. 编码管理器 ====================

Lumina.Parser.EncodingManager = {
    confidenceThreshold: { HIGH: 85, MEDIUM: 70, LOW: 50 },

    async processFile(file) {
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

        const bom = this.detectBOM(uint8);
        if (bom) return { text: new TextDecoder(bom.encoding).decode(uint8.slice(bom.skip)), originalEncoding: bom.encoding, confidence: 100 };

        const scores = this.calculateConfidenceScores(uint8);
        const candidates = this.generateCandidates(scores);

        for (const { encoding, confidence } of candidates) {
            try {
                const result = this.tryDecode(uint8, encoding);
                if (result && this.validateDecodedText(result)) return { text: result, originalEncoding: encoding, confidence };
            } catch (e) { continue; }
        }

        const text = new TextDecoder('GB18030').decode(uint8);
        return { text, originalEncoding: 'GB18030', confidence: 30 };
    },

    calculateConfidenceScores(bytes) {
        const scores = [], sampleSize = Math.min(bytes.length, 2000);
        const utf8Score = this.calculateUTF8Score(bytes, sampleSize);
        if (utf8Score > 0) scores.push({ encoding: 'UTF-8', score: utf8Score, reason: 'valid_utf8' });
        const gbkScore = this.calculateGBKScore(bytes, sampleSize);
        if (gbkScore > 0) scores.push({ encoding: 'GBK', score: gbkScore, reason: 'gbk_pairs' });
        const big5Score = this.calculateBig5Score(bytes, sampleSize);
        if (big5Score > 0) scores.push({ encoding: 'Big5', score: big5Score, reason: 'big5_pairs' });
        const ansiScore = this.calculateANSIScore(bytes, sampleSize);
        if (ansiScore > 0) scores.push({ encoding: 'Windows-1252', score: ansiScore, reason: 'ansi_extended' });
        return scores.sort((a, b) => b.score - a.score);
    },

    calculateUTF8Score(bytes, sampleSize) {
        let validSequences = 0, invalidSequences = 0, multiByteChars = 0, i = 0;
        while (i < sampleSize && i < bytes.length) {
            const b1 = bytes[i];
            if (b1 < 0x80) { validSequences++; i++; continue; }
            const seqLen = this.getUTF8SequenceLength(b1);
            if (seqLen === 0 || i + seqLen > bytes.length) { invalidSequences++; i++; continue; }
            let valid = true;
            for (let j = 1; j < seqLen; j++) if ((bytes[i + j] & 0xC0) !== 0x80) { valid = false; break; }
            if (valid && seqLen > 1) {
                const codePoint = this.extractUTF8CodePoint(bytes, i, seqLen);
                const minVal = [0, 0, 0x80, 0x800, 0x10000][seqLen];
                if (codePoint < minVal) valid = false;
                if (codePoint >= 0xD800 && codePoint <= 0xDFFF) valid = false;
                if (valid) multiByteChars++;
            }
            if (valid) validSequences++; else invalidSequences++;
            i += seqLen;
        }
        const total = validSequences + invalidSequences;
        if (total === 0) return 0;
        const ratio = validSequences / total;
        if (ratio > 0.98 && multiByteChars > 0) return 95;
        if (ratio > 0.95 && multiByteChars > 0) return 85;
        if (ratio > 0.90 && multiByteChars > 0) return 70;
        return 0;
    },

    getUTF8SequenceLength(b1) {
        if ((b1 & 0x80) === 0) return 1;
        if ((b1 & 0xE0) === 0xC0) return 2;
        if ((b1 & 0xF0) === 0xE0) return 3;
        if ((b1 & 0xF8) === 0xF0) return 4;
        return 0;
    },

    extractUTF8CodePoint(bytes, start, len) {
        if (len === 2) return ((bytes[start] & 0x1F) << 6) | (bytes[start + 1] & 0x3F);
        if (len === 3) return ((bytes[start] & 0x0F) << 12) | ((bytes[start + 1] & 0x3F) << 6) | (bytes[start + 2] & 0x3F);
        if (len === 4) return ((bytes[start] & 0x07) << 18) | ((bytes[start + 1] & 0x3F) << 12) | ((bytes[start + 2] & 0x3F) << 6) | (bytes[start + 3] & 0x3F);
        return bytes[start];
    },

    calculateGBKScore(bytes, sampleSize) {
        let validPairs = 0, invalidPairs = 0, commonChars = 0, i = 0;
        while (i < sampleSize - 1) {
            const b1 = bytes[i];
            if (b1 >= 0x81 && b1 <= 0xFE) {
                const b2 = bytes[i + 1];
                const validB2 = (b2 >= 0x40 && b2 <= 0x7E) || (b2 >= 0x80 && b2 <= 0xFE);
                if (validB2) {
                    const isCommon = (b1 >= 0xB0 && b1 <= 0xF7 && b2 >= 0xA1 && b2 <= 0xFE);
                    if (isCommon) commonChars++;
                    validPairs++; i += 2; continue;
                } else invalidPairs++;
            } else if (b1 > 0x7F) invalidPairs++;
            i++;
        }
        const total = validPairs + invalidPairs;
        if (total < 10) return 0;
        const ratio = validPairs / total;
        const commonBonus = Math.min(commonChars * 2, 20);
        if (ratio > 0.95) return Math.min(90 + commonBonus, 95);
        if (ratio > 0.90) return Math.min(80 + commonBonus, 85);
        if (ratio > 0.80) return Math.min(65 + commonBonus, 75);
        return 0;
    },

    calculateBig5Score(bytes, sampleSize) {
        let validPairs = 0, i = 0;
        while (i < sampleSize - 1) {
            const b1 = bytes[i];
            if (b1 >= 0x81 && b1 <= 0xFE) {
                const b2 = bytes[i + 1];
                if ((b2 >= 0x40 && b2 <= 0x7E) || (b2 >= 0xA1 && b2 <= 0xFE)) { validPairs++; i += 2; continue; }
            }
            i++;
        }
        if (validPairs < 20) return 0;
        return Math.min(85, 70 + validPairs / 10);
    },

    calculateANSIScore(bytes, sampleSize) {
        let extendedChars = 0, isolatedExtended = 0;
        for (let i = 0; i < sampleSize; i++) {
            const b = bytes[i];
            if (b >= 0x80 && b <= 0xFF) {
                extendedChars++;
                const isDoubleByteLead = b >= 0x81 && b <= 0xFE;
                if (!isDoubleByteLead || i === bytes.length - 1) isolatedExtended++;
            }
        }
        if (isolatedExtended > 10 && isolatedExtended > extendedChars * 0.7) return Math.min(75, 50 + isolatedExtended / 5);
        return 0;
    },

    generateCandidates(scores) {
        const candidates = [];
        for (const { encoding, score } of scores) if (score >= this.confidenceThreshold.MEDIUM) candidates.push({ encoding, confidence: score });
        candidates.push({ encoding: 'UTF-8', confidence: 50 });
        candidates.push({ encoding: 'GB18030', confidence: 40 });
        return candidates;
    },

    tryDecode(bytes, encoding) {
        try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); } catch { return null; }
    },

    validateDecodedText(text) {
        if (text.includes('\uFFFD')) return false;
        const controlChars = text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || [];
        if (controlChars.length > text.length * 0.01) return false;
        let readableCount = 0;
        const checkLen = Math.min(text.length, 500);
        for (let i = 0; i < checkLen; i++) {
            const c = text.charCodeAt(i);
            if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3040 && c <= 0x309F) || (c >= 0x30A0 && c <= 0x30FF) || (c >= 0xAC00 && c <= 0xD7AF) ||
                (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || (c >= 0x30 && c <= 0x39) || (c >= 0x2000 && c <= 0x206F) || c === 0x20 || c === 0x0A || c === 0x0D) readableCount++;
        }
        return readableCount > checkLen * 0.3 || text.length === 0;
    },

    detectBOM(bytes) {
        if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return { encoding: 'UTF-8', skip: 3 };
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return { encoding: 'UTF-16LE', skip: 2 };
        if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return { encoding: 'UTF-16BE', skip: 2 };
        return null;
    }
};

// ==================== 6. 章节解析与处理 ====================

Lumina.Parser.RegexCache = {
    customPatterns: { chapter: null, section: null },
    rawPatterns: { chapter: '', section: '' },

    // 宏定义系统
    macros: {
        // 中文数字（大小写混合）
        '\\C': '[一二三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟萬零〇]',
        
        // 罗马数字（大写）
        '\\R': '[IVXLCDM]+',
        // 罗马数字（小写）
        '\\r': '[ivxlcdm]+',
        
        // 英文字母（大写）
        '\\U': '[A-Z]',
        // 英文字母（小写）
        '\\L': '[a-z]',
        // 英文字母（大小写混合）
        '\\A': '[A-Za-z]',
        // 英文单词（多字母）
        '\\W': '[A-Za-z]+',
        
        // 数字（阿拉伯数字，多个）
        '\\N': '\\d+',
        // 空白字符（简化）
        '\\S': '\\s+'
    },

    expandMacros(pattern) {
        if (!pattern) return pattern;
        let result = pattern;
        // 按长度降序排序，避免短匹配干扰长匹配（如 \R 和 \r）
        const sortedKeys = Object.keys(this.macros).sort((a, b) => b.length - a.length);
        for (const key of sortedKeys) {
            result = result.split(key).join(this.macros[key]);
        }
        return result;
    },

    updateCustomPatterns(chapterRegex, sectionRegex) {
        this.rawPatterns.chapter = chapterRegex || '';
        this.rawPatterns.section = sectionRegex || '';
        
        const expandedChapter = this.expandMacros(chapterRegex);
        const expandedSection = this.expandMacros(sectionRegex);

        this.customPatterns.chapter = null;
        this.customPatterns.section = null;

        if (chapterRegex) {
            try {
                let pattern = expandedChapter;
                if (!pattern.startsWith('^')) pattern = '^' + pattern;
                if (!pattern.includes('(')) pattern = pattern + '\\s*(.*)';
                this.customPatterns.chapter = new RegExp(pattern, 'i');
            } catch (e) {}
        }

        if (sectionRegex) {
            try {
                let pattern = expandedSection;
                if (!pattern.startsWith('^')) pattern = '^' + pattern;
                if (!pattern.includes('(')) pattern = pattern + '\\s*(.*)';
                this.customPatterns.section = new RegExp(pattern, 'i');
            } catch (e) {}
        }
    },

    detectChapter(text, useCustom = false) {
        if (!text) return null;
        const trimmed = text.trim();

        if (useCustom) {
            if (!this.customPatterns.chapter && !this.customPatterns.section) return this.detectChapter(text, false);

            if (this.customPatterns.chapter) {
                const match = trimmed.match(this.customPatterns.chapter);
                if (match) {
                    let cleanText = match.length > 1 ? match[match.length - 1] : trimmed.slice(match[0].length).trim().replace(/^[:：\-]\s*/, '').trim();
                    if (!cleanText) cleanText = trimmed;
                    return { level: 1, text: cleanText, raw: trimmed };
                }
            }

            if (this.customPatterns.section) {
                const match = trimmed.match(this.customPatterns.section);
                if (match) {
                    let cleanText = match.length > 1 ? match[match.length - 1] : trimmed.slice(match[0].length).trim().replace(/^[:：\-]\s*/, '').trim();
                    if (!cleanText) cleanText = trimmed;
                    return { level: 2, text: cleanText, raw: trimmed };
                }
            }

            if (!this.customPatterns.chapter && this.customPatterns.section) return this.detectChapter(text, false);
            return null;
        }

        const p = Lumina.Config.regexPatterns;
        
        const chMatch = trimmed.match(p.chineseChapter);
        if (chMatch) {
            const cleanTitle = chMatch[1]?.trim() || chMatch[0].trim();
            return { level: 1, text: cleanTitle, raw: trimmed };
        }

        const enMatch = trimmed.match(p.englishChapter);
        if (enMatch) return { level: 1, text: enMatch[3] ? enMatch[3].trim() : trimmed, raw: trimmed };

        const dashMatch = trimmed.match(p.sectionDash);
        if (dashMatch) return { level: 2, text: dashMatch[3] ? dashMatch[3].trim() : trimmed, raw: trimmed };

        const cnSecMatch = trimmed.match(p.sectionCn);
        if (cnSecMatch) return { level: 2, text: cnSecMatch[1] ? cnSecMatch[1].trim() : trimmed, raw: trimmed };

        const enSecMatch = trimmed.match(p.sectionEn);
        if (enSecMatch) return { level: 2, text: enSecMatch[2] ? enSecMatch[2].trim() : trimmed, raw: trimmed };

        if (p.specialTitles.test(trimmed)) return { level: 1, text: trimmed, raw: trimmed, isSpecial: true };

        return null;
    }
};

Lumina.Parser.processHeading = (level, rawText, cleanText = null) => {
    level = Math.max(1, Math.min(6, level));
    Lumina.State.sectionCounters[level - 1]++;
    for (let i = level; i < 6; i++) Lumina.State.sectionCounters[i] = 0;

    const textForDisplay = cleanText !== null ? cleanText : rawText;
    const display = Lumina.Config.numberingStrategies[Lumina.State.settings.chapterNumbering](level, Lumina.State.sectionCounters, textForDisplay);

    return {
        type: `heading${level}`,
        level,
        text: rawText,
        display,
        cleanText: cleanText !== null ? cleanText : rawText
    };
};

// ==================== 7. 文件解析器 ====================

Lumina.Parser.parseDOCX = async (arrayBuffer) => {
    const zip = await JSZip.loadAsync(arrayBuffer);
    let styleDefs = {};
    const images = {}, relsMap = {};

    const imageFiles = Object.keys(zip.files).filter(name => name.startsWith('word/media/') && /\.(png|jpg|jpeg|gif|bmp|svg)$/i.test(name));
    for (const imgPath of imageFiles) {
        const imgData = await zip.file(imgPath).async('base64');
        const ext = imgPath.split('.').pop().toLowerCase();
        const mimeType = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' }[ext] || 'image/png';
        images[imgPath] = `data:${mimeType};base64,${imgData}`;
    }

    try {
        const relsXml = await zip.file('word/_rels/document.xml.rels').async('text');
        const relsDoc = new DOMParser().parseFromString(relsXml, 'text/xml');
        Array.from(relsDoc.getElementsByTagName('Relationship')).forEach(rel => {
            const id = rel.getAttribute('Id'), target = rel.getAttribute('Target'), type = rel.getAttribute('Type');
            if (type && type.includes('image')) {
                const fullPath = target.startsWith('word/') ? target : `word/${target}`;
                relsMap[id] = fullPath;
            }
        });
    } catch (e) { }

    try {
        const stylesXml = await zip.file('word/styles.xml').async('text');
        const stylesDoc = new DOMParser().parseFromString(stylesXml, 'text/xml');
        Array.from(stylesDoc.getElementsByTagName('w:style')).forEach(style => {
            const styleId = style.getAttribute('w:styleId');
            const nameNode = style.getElementsByTagName('w:name')[0];
            const name = nameNode ? nameNode.getAttribute('w:val') : '';
            if (name || styleId) styleDefs[styleId.toLowerCase()] = { name: (name || '').toLowerCase(), styleId: styleId.toLowerCase() };
        });
    } catch (e) { }

    const xmlContent = await zip.file('word/document.xml').async('text');
    const xmlDoc = new DOMParser().parseFromString(xmlContent, 'text/xml');
    const body = xmlDoc.getElementsByTagName('w:body')[0];
    const paragraphs = Array.from(body.getElementsByTagName('w:p'));

    Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
    const results = [];

    paragraphs.forEach(p => {
        const text = Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('');
        const pPr = p.getElementsByTagName('w:pPr')[0];
        const styleId = pPr ? (pPr.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') || '').toLowerCase() : '';

        // 关键修复：只排除目录，不排除空段落
        const isToc = styleId && ['toc', '目录', 'table of contents'].some(keyword => styleId.includes(keyword));
        
        if (!isToc) {
            const styleInfo = Lumina.Parser.getDOCXStyleInfo(pPr, styleId, styleDefs[styleId]?.name || '');
            const item = Lumina.Parser.processDOCXStyleInfo(styleInfo, text);
            
            // 确保空段落也被处理为 paragraph 类型
            if (item) {
                // 如果文本为空且不是特殊类型，确保标记为空段落
                if (!text.trim() && item.type === 'paragraph') {
                    item.isEmpty = true; // 标记为空，便于后续渲染特殊处理
                }
                results.push(item);
            }
        }

        const drawings = p.getElementsByTagName('w:drawing');
        if (drawings.length > 0) {
            for (const drawing of drawings) {
                const blip = drawing.getElementsByTagName('a:blip')[0] || drawing.getElementsByTagName('c:blip')[0];
                if (blip) {
                    const embedId = blip.getAttribute('r:embed');
                    const imgPath = relsMap[embedId];
                    if (imgPath && images[imgPath]) results.push({ type: 'image', data: images[imgPath], alt: 'Image' });
                }
            }
        }

        const picts = p.getElementsByTagName('w:pict');
        if (picts.length > 0) {
            for (const pict of picts) {
                const imagedata = pict.getElementsByTagName('v:imagedata')[0];
                if (imagedata) {
                    const relId = imagedata.getAttribute('r:id');
                    const imgPath = relsMap[relId];
                    if (imgPath && images[imgPath]) results.push({ type: 'image', data: images[imgPath], alt: 'Image' });
                }
                const binData = pict.getElementsByTagName('w:binData')[0];
                if (binData) {
                    const base64 = binData.textContent.trim();
                    if (base64) results.push({ type: 'image', data: `data:image/png;base64,${base64}`, alt: 'Image' });
                }
            }
        }
    });

    return { items: results, type: 'docx' };
};

Lumina.Parser.processDOCXStyleInfo = (styleInfo, text) => {
    if (styleInfo.isSubtitle) return { type: 'subtitle', text, display: `${text}` };
    if (styleInfo.isTitle) return { type: 'title', text, display: `${text}` };
    if (styleInfo.level >= 1 && styleInfo.level <= 6) return Lumina.Parser.processHeading(styleInfo.level, text);
    if (styleInfo.isList) return { type: 'list', level: styleInfo.listLevel, text, display: '  '.repeat(styleInfo.listLevel) + '• ' + text };
    return { type: 'paragraph', text, display: text };
};

Lumina.Parser.getDOCXStyleInfo = (pPr, styleId, styleName) => {
    const info = { level: 0, isTitle: false, isSubtitle: false, isList: false, listLevel: 0 };
    if (!pPr && !styleId) return info;

    const checkId = styleId || '', checkName = styleName || '';
    if ((checkId === 'title' || checkName === 'title' || checkId === '标题' || checkName === '标题') && !checkId.includes('副')) {
        info.isTitle = true; return info;
    }
    if (checkId === 'subtitle' || checkName === 'subtitle' || checkId.includes('副标题') || checkName.includes('副标题')) {
        info.isSubtitle = true; return info;
    }

    const headingMatch = checkId.match(/^heading\s*(\d)$/) || checkName.match(/^heading\s*(\d)$/);
    if (headingMatch) { info.level = parseInt(headingMatch[1]); return info; }

    const cnMatch = checkId.match(/标题\s*([1-6])/) || checkName.match(/标题\s*([1-6])/);
    if (cnMatch) { info.level = parseInt(cnMatch[1]); return info; }

    if (pPr) {
        const outline = pPr.getElementsByTagName('w:outlineLvl')[0];
        if (outline) {
            const lvl = parseInt(outline.getAttribute('w:val'));
            if (lvl >= 0 && lvl <= 5) { info.level = lvl + 1; return info; }
        }
        const numPr = pPr.getElementsByTagName('w:numPr')[0];
        if (numPr) {
            info.isList = true;
            const ilvl = numPr.getElementsByTagName('w:ilvl')[0];
            info.listLevel = ilvl ? parseInt(ilvl.getAttribute('w:val')) : 0;
        }
    }
    return info;
};

// ==================== PDF 解析器 ====================

// 初始化 PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = './assets/js/pdf.worker.min.js';
}

/**
 * 解析 PDF 文件
 * @param {ArrayBuffer} arrayBuffer - PDF 文件的 ArrayBuffer
 * @returns {Promise<{items: Array, type: string}>}
 */
Lumina.Parser.parsePDF = async (arrayBuffer, onProgress = null) => {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js library not loaded');
    }

    const results = [];
    let currentPdf = null;
    let passwordResolve = null;
    let passwordReject = null;

    // 密码输入对话框
    const requestPassword = (reason) => {
        return new Promise((resolve, reject) => {
            passwordResolve = resolve;
            passwordReject = reject;
            
            const isRetry = reason === 2;
            const title = isRetry ? Lumina.I18n.t('pdfPasswordError') || '密码错误' : Lumina.I18n.t('pdfPasswordRequired') || '需要密码';
            const message = isRetry ? Lumina.I18n.t('pdfPasswordRetry') || '请重新输入 PDF 密码' : Lumina.I18n.t('pdfPasswordPrompt') || '此 PDF 受密码保护，请输入密码';
            
            // 使用阅读器的对话框
            Lumina.UI.showDialog(message, 'prompt', (result) => {
                if (result === null || result === false) {
                    reject(new Error('Password cancelled'));
                } else {
                    resolve(result);
                }
            }, { title, inputType: 'password', placeholder: Lumina.I18n.t('pdfPasswordPlaceholder') || '请输入密码' });
        });
    };

    try {
        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            useSystemFonts: true,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true
        });

        // 处理密码保护
        loadingTask.onPassword = async (callback, reason) => {
            // 暂时隐藏 loading 界面，让密码对话框显示在最上层
            const wasLoadingActive = Lumina.DOM.loadingScreen.classList.contains('active');
            Lumina.DOM.loadingScreen.classList.remove('active');
            
            try {
                const password = await requestPassword(reason);
                callback(password);
            } catch (e) {
                callback(null);
            } finally {
                // 恢复 loading 界面
                if (wasLoadingActive) {
                    Lumina.DOM.loadingScreen.classList.add('active');
                }
            }
        };

        currentPdf = await loadingTask.promise;
        const numPages = currentPdf.numPages;

        // 用于跨页段落合并
        let carryOverText = '';
        let carryOverY = 0;

        // 存储每页的段落和图片
        const pageContents = [];

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            // 更新进度
            if (onProgress) {
                onProgress(pageNum, numPages);
            }

            const page = await currentPdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.0 });
            const textContent = await page.getTextContent();

            // 提取并处理文本（包含跨页合并逻辑）
            const { paragraphs, newCarryOver, newCarryOverY } = Lumina.Parser.processPDFPageText(
                textContent, 
                viewport.height, 
                carryOverText,
                carryOverY
            );

            // 更新跨页携带的文本
            carryOverText = newCarryOver || '';
            carryOverY = newCarryOverY || 0;

            // 提取图片
            const images = await Lumina.Parser.extractPDFImages(page, pageNum);

            // 将段落转换为文本项
            const textItems = paragraphs.map(p => ({
                type: 'text',
                content: p.text,
                y: p.y
            }));

            // 合并文本和图片，按 Y 坐标排序
            const mergedItems = [...textItems, ...images].sort((a, b) => b.y - a.y);

            pageContents.push({
                pageNum,
                items: mergedItems
            });

            page.cleanup();
        }

        // 处理最后一页残留的跨页文本
        if (carryOverText) {
            pageContents[pageContents.length - 1]?.items.push({
                type: 'text',
                content: carryOverText,
                y: 0
            });
        }

        // 将所有内容转换为阅读器格式
        for (const page of pageContents) {
            for (const item of page.items) {
                if (item.type === 'text') {
                    // 将 PDF 文本转换为段落
                    results.push({
                        type: 'paragraph',
                        text: item.content,
                        display: item.content
                    });
                } else if (item.type === 'image') {
                    results.push({
                        type: 'image',
                        data: item.data,
                        alt: item.alt || `Page ${item.page} image`
                    });
                }
            }
        }

    } catch (error) {
        if (error.message === 'Password cancelled') {
            throw new Error('Password required');
        }
        throw error;
    }

    return { items: results, type: 'pdf' };
};

/**
 * 提取 PDF 文本项
 * @param {Object} textContent - PDF.js getTextContent 的结果
 * @param {number} pageHeight - 页面高度
 * @returns {Array<{type: string, content: string, y: number}>}
 */
/**
 * 检查是否为段落结束
 * @param {string} text - 文本内容
 * @returns {boolean}
 */
Lumina.Parser.isParagraphEnd = (text) => {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.length === 0) return false;
    const endPunctuations = /[。.！!；;…—~～")）]$/;
    const abbreviations = /(?:Mr|Mrs|Ms|Dr|Prof|No|vol|vs|etc|i\.e|e\.g|et\s+al|fig|Fig|Inc|Ltd|Jr|Sr|St|Ave|Rd|Blvd|Dept|Univ|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?$/i;
    return endPunctuations.test(trimmed) && !abbreviations.test(trimmed);
};

/**
 * 处理 PDF 单页文本（包含跨页合并、目录过滤、智能段落合并）
 * @param {Object} textContent - PDF.js getTextContent 的结果
 * @param {number} pageHeight - 页面高度
 * @param {string} carryOverText - 从上一页携带过来的未完结段落
 * @param {number} carryOverY - 携带段落的 Y 坐标
 * @returns {{paragraphs: Array<{text: string, y: number}>, newCarryOver: string, newCarryOverY: number}}
 */
Lumina.Parser.processPDFPageText = (textContent, pageHeight, carryOverText = '', carryOverY = 0) => {
    const items = textContent.items;
    if (items.length === 0) {
        return { paragraphs: [], newCarryOver: carryOverText, newCarryOverY: carryOverY };
    }

    // 增强文本项，添加坐标信息
    const enhancedItems = items.map(item => {
        const x = item.transform[4];
        const y = item.transform[5];
        // 过滤页眉页脚（距离顶部或底部 5% 区域的内容）
        const isHeader = y > pageHeight * 0.95;
        const isFooter = y < pageHeight * 0.05;
        
        return {
            str: item.str,
            x,
            y,
            isHeader,
            isFooter
        };
    }).filter(item => {
        // 过滤页眉页脚中的页码
        if (item.isHeader || item.isFooter) {
            if (/^\s*\d+\s*$/.test(item.str) || item.str.trim().length < 10) {
                return false;
            }
        }
        return true;
    });

    if (enhancedItems.length === 0) {
        return { paragraphs: [], newCarryOver: carryOverText, newCarryOverY: carryOverY };
    }

    // 按 Y 坐标排序，Y 坐标接近的归为一行
    enhancedItems.sort((a, b) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 3) return yDiff;
        return a.x - b.x;
    });

    // 按 Y 坐标分组（合并同一行的文本）
    const lines = [];
    let currentLine = [];
    let currentLineY = null;

    enhancedItems.forEach(item => {
        if (currentLineY === null || Math.abs(item.y - currentLineY) > 3) {
            if (currentLine.length > 0) {
                currentLine.sort((a, b) => a.x - b.x);
                lines.push({ items: currentLine, y: currentLineY });
            }
            currentLine = [item];
            currentLineY = item.y;
        } else {
            currentLine.push(item);
        }
    });

    if (currentLine.length > 0) {
        currentLine.sort((a, b) => a.x - b.x);
        lines.push({ items: currentLine, y: currentLineY });
    }

    // 合并每行的文本
    const lineTexts = lines.map(line => {
        let text = line.items[0].str;
        for (let i = 1; i < line.items.length; i++) {
            text += line.items[i].str;
        }
        return { text: text.trim(), y: line.y };
    }).filter(line => line.text.length > 0);

    // 智能段落合并
    const paragraphs = [];
    let currentParagraph = carryOverText || '';
    let currentParagraphY = carryOverText ? (lineTexts[0]?.y || 0) : null;

    for (let i = 0; i < lineTexts.length; i++) {
        const line = lineTexts[i];
        
        // 【关键】过滤目录行：包含 '........' 或目录标题
        if (/^\s*(目录|Content|Contents|Catalog|Catalogs)\s*$/i.test(line.text) || line.text.includes('........')) {
            // 如果当前有未完成的段落，先保存
            if (currentParagraph.trim()) {
                paragraphs.push({ text: currentParagraph.trim(), y: currentParagraphY || line.y });
                currentParagraph = '';
                currentParagraphY = null;
            }
            continue;
        }

        // 如果不含有常规标点且较短，允许独立成段
        if (/[,.:;'"，。：；""''!！]/.test(line.text) === false && line.text.length < 8) {
            if (currentParagraph !== line.text) {
                if (currentParagraph.trim()) {
                    paragraphs.push({ text: currentParagraph.trim(), y: currentParagraphY || line.y });
                }
                paragraphs.push({ text: line.text, y: line.y });
                currentParagraph = '';
                currentParagraphY = null;
            }
            continue;
        }

        if (!currentParagraph) {
            currentParagraph = line.text;
            currentParagraphY = line.y;
            continue;
        }

        const prevLine = lineTexts[i - 1];
        if (prevLine && Lumina.Parser.isParagraphEnd(prevLine.text)) {
            // 前一行以标点结尾，开始新段落
            paragraphs.push({ text: currentParagraph.trim(), y: currentParagraphY });
            currentParagraph = line.text;
            currentParagraphY = line.y;
        } else {
            // 合并到当前段落（处理连字符）
            if (currentParagraph.endsWith('-') || currentParagraph.endsWith('－')) {
                currentParagraph = currentParagraph.slice(0, -1) + line.text;
            } else {
                currentParagraph += line.text;
            }
        }
    }

    // 判断最后一行是否是段落结束
    const lastLine = lineTexts[lineTexts.length - 1];
    let newCarryOver = '';
    let newCarryOverY = 0;

    if (currentParagraph && lastLine && !Lumina.Parser.isParagraphEnd(currentParagraph)) {
        // 段落未结束，携带到下一页
        newCarryOver = currentParagraph;
        newCarryOverY = currentParagraphY;
        currentParagraph = '';
    }

    if (currentParagraph.trim()) {
        paragraphs.push({ text: currentParagraph.trim(), y: currentParagraphY });
    }

    return { paragraphs, newCarryOver, newCarryOverY };
};

/**
 * 提取 PDF 图片
 * @param {Object} page - PDF.js 页面对象
 * @param {number} pageNum - 页码
 * @returns {Promise<Array<{type: string, data: string, y: number, page: number, alt: string}>>}
 */
Lumina.Parser.extractPDFImages = async (page, pageNum) => {
    const images = [];
    
    try {
        const ops = await page.getOperatorList();
        const { objs, commonObjs } = page;

        for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i];
            const args = ops.argsArray[i];

            // 图片操作类型
            const imageOps = [
                pdfjsLib.OPS.paintImageXObject,
                pdfjsLib.OPS.paintJpegXObject,
                pdfjsLib.OPS.paintInlineImageXObject,
                pdfjsLib.OPS.paintImageMaskXObject,
                pdfjsLib.OPS.paintImageXObjectRepeat
            ];

            if (!imageOps.includes(fn)) continue;

            try {
                let imgData = null;
                let width = 0, height = 0, y = 0;

                // 内联图像
                if (fn === pdfjsLib.OPS.paintInlineImageXObject) {
                    const inline = args[0];
                    if (inline?.data) {
                        imgData = Lumina.Parser.imageDataToBase64(inline.data);
                        width = inline.width || 0;
                        height = inline.height || 0;
                        // 从变换矩阵获取 Y 坐标
                        const matrix = args[1] || [1, 0, 0, 1, 0, 0];
                        y = matrix[5] || 0;
                    }
                } else {
                    // 外部图像
                    const objId = args[0];
                    const matrix = Array.isArray(args[1]) ? args[1] : [1, 0, 0, 1, 0, 0];
                    y = matrix[5] || 0;

                    let obj = null;
                    if (objs.has(objId)) obj = objs.get(objId);
                    else if (commonObjs.has(objId)) obj = commonObjs.get(objId);

                    if (!obj) continue;

                    width = obj.width || 0;
                    height = obj.height || 0;

                    if (obj.bitmap) {
                        // 颜色过滤：跳过可能是文字的图片（颜色数≤3）
                        const colorCount = await Lumina.Parser.analyzeImageColorCount(obj.bitmap);
                        if (colorCount <= 3) continue;

                        imgData = await Lumina.Parser.bitmapToBase64(obj.bitmap);
                    } else if (obj.data) {
                        imgData = Lumina.Parser.imageDataToBase64(obj.data);
                    } else if (obj.imgData?.data) {
                        imgData = Lumina.Parser.imageDataToBase64(obj.imgData.data);
                    }
                }

                if (imgData) {
                    images.push({
                        type: 'image',
                        data: imgData,
                        y,
                        page: pageNum,
                        alt: `Page ${pageNum} image`
                    });
                }
            } catch (e) {
                console.warn(`提取第${pageNum}页图片失败:`, e);
            }
        }
    } catch (e) {
        console.error('extractPDFImages 失败:', e);
    }

    return images;
};

/**
 * 创建"图片未保存"占位符 SVG
 * @returns {string} - Base64 SVG 数据 URL
 */
Lumina.Utils.createImagePlaceholder = () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#f5f5f5"/><text x="150" y="100" font-size="14" fill="#999" text-anchor="middle" dy=".3em">图片（未保存到书库）</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
};

/**
 * 分析图片颜色数量（用于过滤文字/简单图形）
 * @param {ImageBitmap} bitmap - 图片位图
 * @returns {Promise<number>} - 颜色数量
 */
Lumina.Parser.analyzeImageColorCount = async (bitmap) => {
    try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);

        // 采样中心区域
        const sampleSize = 50;
        const w = Math.min(bitmap.width, sampleSize);
        const h = Math.min(bitmap.height, sampleSize);
        const x = Math.floor((bitmap.width - w) / 2);
        const y = Math.floor((bitmap.height - h) / 2);

        const imageData = ctx.getImageData(x, y, w, h).data;
        const colors = new Set();

        for (let i = 0; i < imageData.length; i += 4) {
            const alpha = imageData[i + 3];
            if (alpha < 128) continue;

            // 颜色量化（合并相近颜色）
            const r = Math.round(imageData[i] / 36);
            const g = Math.round(imageData[i + 1] / 36);
            const b = Math.round(imageData[i + 2] / 36);
            colors.add(`${r},${g},${b}`);

            // 提前退出
            if (colors.size > 8) return colors.size;
        }

        return colors.size;
    } catch (e) {
        console.warn('颜色分析失败:', e);
        return 999; // 出错时保守保留
    }
};

/**
 * 将 ImageBitmap 转为 Base64
 * @param {ImageBitmap} bitmap - 图片位图
 * @returns {Promise<string|null>} - Base64 数据 URL
 */
Lumina.Parser.bitmapToBase64 = async (bitmap) => {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        return canvas.toDataURL('image/png');
    } catch (e) {
        console.error('Bitmap 转换失败:', e);
        return null;
    }
};

/**
 * 将 Uint8Array 转为 Base64 数据 URL
 * @param {Uint8Array|Array} data - 图像数据
 * @returns {string|null} - Base64 数据 URL
 */
Lumina.Parser.imageDataToBase64 = (data) => {
    try {
        if (!data) return null;
        let u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
        if (u8.length === 0) return null;

        // 检测 MIME 类型
        let mime = 'image/png';
        if (u8[0] === 0xFF && u8[1] === 0xD8) mime = 'image/jpeg';
        else if (u8[0] === 0x89 && u8[1] === 0x50) mime = 'image/png';
        else if (u8[0] === 0x47 && u8[1] === 0x49) mime = 'image/gif';

        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < u8.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunkSize));
        }
        return `data:${mime};base64,${btoa(binary)}`;
    } catch (e) {
        console.error('Base64 转换失败:', e);
        return null;
    }
};

Lumina.Parser.parseTextFile = (content, ext) => {
    if (typeof content !== 'string') return { items: [], type: ext };
    const lines = content.split(/\r?\n/);
    const results = [];
    Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];

    const p = Lumina.Config.regexPatterns;

    if (ext === 'html') {
        const doc = new DOMParser().parseFromString(content, 'text/html');
        doc.querySelectorAll('img').forEach(img => results.push({ type: 'image', data: img.src, alt: img.alt || '' }));
        doc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li').forEach(el => {
            const text = el.textContent.trim();
            const tag = el.tagName.toLowerCase();
            if (tag === 'h1') results.push({ type: 'title', text, display: text });
            else if (tag.startsWith('h')) results.push(Lumina.Parser.processHeading(parseInt(tag[1]), text));
            else if (tag === 'li') results.push({ type: 'list', text, display: '• ' + text });
            else results.push({ type: 'paragraph', text, display: '    ' + text });
        });
    } else {
        lines.forEach(line => {
            const trimmed = line.trim();
            let item = null;

            if (p.specialTitles.test(trimmed)) {
                const matched = trimmed.match(p.specialTitles)[0];
                item = { type: 'title', text: matched, display: `${matched}` };
            } else if (p.titleTag.test(trimmed)) {
                item = { type: 'title', text: trimmed.replace(p.titleTag, ''), display: trimmed };
            } else if (p.subtitleTag.test(trimmed)) {
                item = { type: 'subtitle', text: trimmed.replace(p.subtitleTag, ''), display: trimmed };
            } else if (ext === 'md' && trimmed.startsWith('#')) {
                const match = trimmed.match(p.mdHeading);
                item = match ? Lumina.Parser.processHeading(match[1].length, match[2].trim()) : { type: 'paragraph', text: trimmed, display: trimmed };
            } else {
                const chapterInfo = Lumina.Parser.RegexCache.detectChapter(trimmed, true);
                item = chapterInfo ? Lumina.Parser.processHeading(chapterInfo.level, chapterInfo.raw, chapterInfo.text) : { type: 'paragraph', text: trimmed, display: trimmed };
            }
            if (item) results.push(item);
        });
    }
    return { items: results, type: ext };
};

// ==================== 8. 章节管理 ====================

Lumina.Parser.buildChapters = (items) => {
    const newChapters = [];
    let currentChapter = null, buffer = [], globalIndex = 0;

    const flushBuffer = () => {
        if (!buffer.length) return;
        const startIdx = globalIndex - buffer.length;
        newChapters.push({
            id: `preface-${newChapters.length}`, title: Lumina.I18n.t('preface'), isPreface: true,
            startIndex: startIdx, endIndex: globalIndex - 1, items: [...buffer]
        });
        buffer = [];
    };

    items.forEach((item, index) => {
        globalIndex = index;
        if (Lumina.Parser.isChapterStart(item)) {
            flushBuffer();
            currentChapter = {
                id: `chapter-${newChapters.length}`, title: Lumina.Parser.extractChapterTitle(item),
                isPreface: false, startIndex: index, endIndex: items.length - 1, items: [item]
            };
            newChapters.push(currentChapter);
        } else {
            if (currentChapter) { currentChapter.items.push(item); currentChapter.endIndex = index; }
            else buffer.push(item);
        }
    });

    flushBuffer();
    return newChapters;
};

Lumina.Parser.isChapterStart = (item) => item.type === 'title' || item.type === 'heading1';

Lumina.Parser.extractChapterTitle = (item) => item.display?.replace(/^\[T\]/, '') || item.text;

Lumina.Parser.applyNumberingStyle = () => {
    if (!Lumina.State.app.document.items.length) return;
    
    // 重置计数器
    Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
    
    // 遍历现有文档项，仅更新 display 字段
    Lumina.State.app.document.items.forEach(item => {
        if (item.type && item.type.startsWith('heading')) {
            const level = parseInt(item.type.replace('heading', '')) || 1;
            
            // 更新层级计数器
            Lumina.State.sectionCounters[level - 1]++;
            for (let i = level; i < 6; i++) Lumina.State.sectionCounters[i] = 0;
            
            // 使用 cleanText（去除了"第X章"前缀的纯标题）重新生成序号
            const textForDisplay = item.cleanText !== undefined ? item.cleanText : item.text;
            item.display = Lumina.Config.numberingStrategies[Lumina.State.settings.chapterNumbering](
                level, 
                Lumina.State.sectionCounters, 
                textForDisplay
            );
        }
    });

    // 重建章节索引（因为标题文字变了，但结构不变）
    Lumina.State.app.chapters = Lumina.Parser.buildChapters(Lumina.State.app.document.items);
    
    // 防止当前章节索引越界
    if (Lumina.State.app.currentChapterIndex >= Lumina.State.app.chapters.length) {
        Lumina.State.app.currentChapterIndex = 0;
    }

    Lumina.Renderer.generateTOC();
    Lumina.Renderer.renderCurrentChapter();

    // 自动保存进度
    if (Lumina.State.app.currentFile.name && Lumina.State.app.dbReady && Lumina.State.app.currentFile.fileKey) {
        Lumina.DB.saveHistory(Lumina.State.app.currentFile.name, Lumina.State.app.currentFile.type, Lumina.State.app.currentFile.wordCount, null, false);
    }
};

Lumina.Parser.reparseDocumentStructure = async () => {
    if (!Lumina.State.app.document.items.length) return;
    
    // 重置计数器
    Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
    
    const ext = Lumina.State.app.currentFile.type;

    // 重新解析：根据新的正则规则重新识别标题级别
    // PDF 和 DOCX 都是二进制格式，需要重新分析已有 items，而不是重新解析原始内容
    if (ext === 'docx' || ext === 'pdf') {
        Lumina.Parser.reanalyzeDocumentItems();
    } else {
        const result = Lumina.Parser.parseTextFile(Lumina.State.app.currentFile.rawContent, ext);
        Lumina.State.app.document = result;
    }

    // 重建章节
    Lumina.State.app.chapters = Lumina.Parser.buildChapters(Lumina.State.app.document.items);
    if (Lumina.State.app.currentChapterIndex >= Lumina.State.app.chapters.length) {
        Lumina.State.app.currentChapterIndex = 0;
    }

    Lumina.Renderer.generateTOC();
    Lumina.Renderer.renderCurrentChapter();

    if (Lumina.State.app.currentFile.name && Lumina.State.app.dbReady && Lumina.State.app.currentFile.fileKey) {
        await Lumina.DB.saveHistory(Lumina.State.app.currentFile.name, Lumina.State.app.currentFile.type, Lumina.State.app.currentFile.wordCount, null);
    }
};

Lumina.Parser.reanalyzeDocumentItems = () => {
    const newItems = [];
    Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];

    Lumina.State.app.document.items.forEach((item, index) => {
        try {
            if (!item) return; // 跳过空项
            if (item.type === 'image') { newItems.push(item); return; }

            const text = item.text || '';
            const trimmed = text.trim();
            const chapterInfo = Lumina.Parser.RegexCache.detectChapter(trimmed, true);

            if (chapterInfo) {
                const newItem = Lumina.Parser.processHeading(chapterInfo.level, chapterInfo.raw, chapterInfo.text);
                newItems.push(newItem);
            } else if (item.type && item.type.startsWith('heading')) {
                const level = parseInt(item.type.replace('heading', '')) || 1;
                const newItem = Lumina.Parser.processHeading(level, item.text || '');
                newItems.push(newItem);
            } else {
                // 确保段落有 display 字段
                if (!item.display && item.text) {
                    item.display = item.text;
                }
                newItems.push(item);
            }
        } catch (err) {
            console.warn(`处理 item ${index} 时出错:`, err, item);
            // 如果处理失败，保留原始 item
            newItems.push(item);
        }
    });

    Lumina.State.app.document.items = newItems;
};

Lumina.Parser.reparseWithRegex = async () => {
    if (!Lumina.State.app.currentFile.name || !Lumina.State.app.document.items.length) {
        Lumina.UI.showDialog(Lumina.I18n.t('errorNoFile'));
        return;
    }

    try {
        Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
        await Lumina.Parser.reparseDocumentStructure();
    } catch (err) {
        Lumina.UI.showDialog(`Error: ${err.message}`);
    }
};

Lumina.Pagination = {
    calculateRanges(items) {
        // 解构时提供默认值，防止配置缺失导致 NaN
        const { 
            enabled = true, 
            maxReadingWords = 1500, 
            imageEquivalentWords = 300 
        } = Lumina.Config.pagination || {};
        
        // 如果禁用分页，返回单页
        if (!enabled) {
            return [{ start: 0, end: items.length - 1, words: items.length }];
        }
        
        if (!items || items.length === 0) return [{ start: 0, end: 0 }];
        
        // 计算总阅读字数
        const totalWords = items.reduce((sum, item) => {
            if (item.type === 'image') {
                return sum + (imageEquivalentWords || 300); // 双重保护
            }
            const stats = Lumina.Utils.calculateContentStats(item.text || '');
            return sum + (stats.readingWords || 0);
        }, 0);
        
        // 关键调试：如果 totalWords 为 0 或 NaN，说明解析有问题
        if (isNaN(totalWords)) {
            console.warn('分页计算错误：totalWords 为 NaN，检查 imageEquivalentWords 配置');
            return [{ start: 0, end: items.length - 1, words: 0 }];
        }
        
        // 如果总字数不足一页，返回单页（包含所有空段落）
        if (totalWords <= maxReadingWords) {
            return [{ start: 0, end: items.length - 1, words: totalWords }];
        }

        // 分页逻辑...
        const ranges = [];
        let currentWords = 0;
        let pageStart = 0;
        
        items.forEach((item, idx) => {
            let itemWords = 0;
            
            if (item.type === 'image') {
                itemWords = imageEquivalentWords || 300;
            } else {
                const stats = Lumina.Utils.calculateContentStats(item.text || '');
                itemWords = stats.readingWords || 0;
            }
            
            // 防止 NaN 污染
            if (isNaN(itemWords)) itemWords = 0;
            
            // 如果加入此项会超限，且当前页已有内容，则新开一页
            if (currentWords + itemWords > maxReadingWords && currentWords > 0) {
                ranges.push({ 
                    start: pageStart, 
                    end: idx - 1,
                    words: currentWords 
                });
                pageStart = idx;
                currentWords = 0;
            }
            
            currentWords += itemWords;
        });
        
        // 最后一页
        if (pageStart < items.length) {
            ranges.push({ 
                start: pageStart, 
                end: items.length - 1,
                words: currentWords 
            });
        }
        
        return ranges.length ? ranges : [{ start: 0, end: items.length - 1, words: 0 }];
    },
    
    findPageIndex(ranges, relativeIdx) {
        if (!ranges || ranges.length === 0) return 0;
        const idx = ranges.findIndex(r => relativeIdx >= r.start && relativeIdx <= r.end);
        return idx === -1 ? 0 : idx;
    }
};

// ==================== 9. 渲染引擎 ====================

Lumina.Renderer.renderCurrentChapter = (targetIndex = null) => {
    Lumina.UI.hideTooltip();
    
    const state = Lumina.State.app;
    const chapter = state.chapters[state.currentChapterIndex];
    
    if (!chapter || !chapter.items) return;
    
    // 确保分页数据存在
    if (!chapter.pageRanges) {
        chapter.pageRanges = Lumina.Pagination.calculateRanges(chapter.items);
    }
    
    const ranges = chapter.pageRanges;
    state.pageRanges = ranges;
    
    let pageIdx = state.currentPageIdx || 0;
    if (targetIndex !== null && targetIndex >= chapter.startIndex && targetIndex <= chapter.endIndex) {
        const relativeIdx = targetIndex - chapter.startIndex;
        pageIdx = Lumina.Pagination.findPageIndex(ranges, relativeIdx);
    }
    
    if (pageIdx < 0) pageIdx = 0;
    if (pageIdx >= ranges.length) pageIdx = ranges.length - 1;
    state.currentPageIdx = pageIdx;
    const range = ranges[pageIdx];
    
    // 1. 先清空（写操作）
    Lumina.DOM.contentWrapper.innerHTML = '';
    
    // 2. 构建片段（批量写，不读取布局）
    const fragment = document.createDocumentFragment();
    for (let i = range.start; i <= range.end; i++) {
        if (i >= chapter.items.length) break;
        const item = chapter.items[i];
        const globalIndex = chapter.startIndex + i;
        const line = Lumina.Renderer.createDocLineElement(item, globalIndex);
        if (state.currentPageIdx > 0 && i === range.start) {
            line.classList.add('page-first-item');
        }
        if (line) fragment.appendChild(line);
    }
    Lumina.DOM.contentWrapper.appendChild(fragment);
    
    // 3. 添加分页导航（仍是写操作）
    Lumina.Renderer.addPaginationNav();
    
    // 4. 其他样式更新（写操作）
    Lumina.Renderer.updateDocumentStyles();
    Lumina.Renderer.updateChapterNavInfo();
    
    // 5. 关键修复：将所有可能触发重排的读操作延迟到下一帧
    requestAnimationFrame(() => {
        // 高亮和滚动（读+写混合操作）
        if (targetIndex !== null) {
            const targetEl = document.querySelector(`.doc-line[data-index="${targetIndex}"]`);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (state.search.highlightedIndex === targetIndex || 
                    Lumina.DOM.searchResults.querySelector('.active')?.dataset.global == targetIndex) {
                    targetEl.classList.add('search-highlight');
                }
            }
        } else {
            Lumina.DOM.contentScroll.scrollTop = 0;
        }
        
        // TTS 高亮恢复
        if (Lumina.TTS.manager?.isPlaying) {
            const currentGlobalIdx = Lumina.TTS.manager.currentItemIndex;
            const relativeIdx = currentGlobalIdx - chapter.startIndex;
            if (relativeIdx >= range.start && relativeIdx <= range.end) {
                Lumina.TTS.manager.highlightCurrent();
            }
        }
        
        // 渲染注释/书签高亮
        Lumina.Annotations.renderAnnotations();
        
        // 预加载下一页的图片（提升翻页体验）
        Lumina.Renderer.preloadNextPageImages(chapter, pageIdx);
    });
};

// 预加载下一页图片
Lumina.Renderer.preloadNextPageImages = (chapter, currentPageIdx) => {
    if (!chapter.pageRanges || currentPageIdx >= chapter.pageRanges.length - 1) return;
    
    const nextRange = chapter.pageRanges[currentPageIdx + 1];
    if (!nextRange) return;
    
    // 收集下一页的图片URL
    const imageUrls = [];
    for (let i = nextRange.start; i <= nextRange.end && i < chapter.items.length; i++) {
        const item = chapter.items[i];
        if (item.type === 'image' && item.data && item.data.length < 500000) { // 只预加载小于500KB的图片
            imageUrls.push(item.data);
        }
    }
    
    // 使用 requestIdleCallback 在浏览器空闲时预加载
    const preloadImages = () => {
        imageUrls.forEach(url => {
            const img = new Image();
            img.src = url;
        });
    };
    
    if ('requestIdleCallback' in window) {
        requestIdleCallback(preloadImages, { timeout: 2000 });
    } else {
        setTimeout(preloadImages, 100);
    }
};

Lumina.Renderer.createDocLineElement = (item, index) => {
    const div = document.createElement('div');
    div.className = 'doc-line';
    div.dataset.index = index;

    const typeClass = { title: 'title-display', subtitle: 'subtitle-display', list: 'list-item' }[item.type];
    if (typeClass) div.classList.add(typeClass);
    else if (item.type && item.type.startsWith('heading')) div.classList.add(`chapter-${item.type.replace('heading', '')}`);
    else div.classList.add('paragraph');

    if (item.type === 'image') {
        const img = document.createElement('img');
        // 使用懒加载优化性能
        img.dataset.src = item.data;
        img.className = 'doc-image center lazy-image';
        img.alt = item.alt || '';
        img.loading = 'lazy';
        
        // 设置占位符背景色，避免布局抖动
        img.style.backgroundColor = 'var(--bg-tertiary)';
        img.style.minHeight = '100px';
        
        // 点击放大查看
        img.style.cursor = 'zoom-in';
        img.onclick = () => Lumina.UI.viewImageFull(item.data, item.alt);
        
        // 使用 Intersection Observer 延迟加载
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.onload = () => {
                            img.style.backgroundColor = 'transparent';
                            img.style.minHeight = 'auto';
                        };
                        observer.unobserve(img);
                    }
                });
            }, { rootMargin: '100px' });
            observer.observe(img);
        } else {
            // 不支持 Intersection Observer 的浏览器直接加载
            img.src = img.dataset.src;
        }
        
        div.appendChild(img);
    } else {
        let content = item.display || item.text;
        content = Lumina.Renderer.getCleanText(content);
        if (item.isEmpty || (!content.trim() && !Lumina.State.settings.ignoreEmptyLines)) {
            div.innerHTML = '&nbsp;'; // 使用不换行空格确保高度
            div.classList.add('empty-paragraph');
        } else {
            div.textContent = content.trim();
        }
        
        if (div.classList.contains('paragraph') && Lumina.State.settings.indent) {
            div.classList.add('indent');
        }
    }

    return div;
};

Lumina.Renderer.getCleanText = (txt) => {
    if (['chap', 'part', 'sect'].some(prefix => txt.toLowerCase().startsWith(prefix))) return txt;
    
    const specialChars = new Set(`!@#$%^&*()_+-=[]{}|;':"\\,./?`);
    
    return Lumina.State.settings.textCleaning ?
        txt.replace(/[\x00-\x7F]{10,}$/gm, match => {
            // 规则1：特殊符号检测
            const uniqueSymbols = new Set([...match].filter(c => specialChars.has(c)));
            const hasManySymbols = uniqueSymbols.size >= 4;
            
            // 规则2：检测4个以上"分散"的空白（不连续）
            // 模式：空白 + 至少一个非空白字符，重复4次
            // 例如："a b c d" 中的空格是分散的
            const scatteredWhitespaces = match.match(/(\s+\S+){3,}\s+/);
            const hasScatteredWhitespaces = scatteredWhitespaces !== null;
            
            // 规则3：或者检测4个以上连续/不连续的空白总数
            const totalWhitespaces = (match.match(/\s/g) || []).length;
            const hasTotalWhitespaces = totalWhitespaces >= 4;
            
            // 满足任一条件即删除
            return (hasManySymbols || hasScatteredWhitespaces || hasTotalWhitespaces) ? '' : match;
        }) : txt;
};

Lumina.Renderer.addPaginationNav = () => {
    const state = Lumina.State.app;
    const chapterIdx = state.currentChapterIndex;
    const chapter = state.chapters[chapterIdx];
    const ranges = state.pageRanges || [{start:0, end:chapter.items.length-1}];

    // 如果禁用分页，不显示分页导航
    if (!Lumina.Config.pagination.enabled) {
        return;
    }

    const current = state.currentPageIdx || 0;
    const total = ranges.length;
    const t = Lumina.I18n.t;
    
    const nav = document.createElement('div');
    nav.className = 'pagination-nav';
    
    const isFirstPage = current === 0;
    const isLastPage = current === total - 1;
    const isFirstChapter = chapterIdx === 0;
    const isLastChapter = chapterIdx === state.chapters.length - 1;
    
    // 左按钮逻辑
    let leftAction, leftTooltip, leftDisabled = false, leftClass = '';
    if (isFirstPage && isFirstChapter) {
        leftDisabled = true;
        leftTooltip = t('atBeginning');
        leftClass = 'disabled';
    } else if (isFirstPage) {
        leftAction = 'Lumina.Actions.goToPrevChapterLastPage()';
        const prevTitle = state.chapters[chapterIdx - 1].title || '';
        leftTooltip = t('prevChapterTooltip', prevTitle);
        leftClass = 'chapter-boundary';
    } else {
        leftAction = 'Lumina.Actions.prevPage()';
        leftTooltip = t('prevPage');
    }
    
    // 右按钮逻辑
    let rightAction, rightTooltip, rightDisabled = false, rightClass = '';
    if (isLastPage && isLastChapter) {
        rightDisabled = true;
        rightTooltip = t('atEnd');
        rightClass = 'disabled';
    } else if (isLastPage) {
        rightAction = 'Lumina.Actions.goToNextChapterFirstPage()';
        const nextTitle = state.chapters[chapterIdx + 1].title || '';
        rightTooltip = t('nextChapterTooltip', nextTitle);
        rightClass = 'chapter-boundary';
    } else {
        rightAction = 'Lumina.Actions.nextPage()';
        rightTooltip = t('nextPage');
    }
    
    // 页码生成
    const pageNumbers = Lumina.Renderer.generatePageNumbers(current, total);

    // 构建HTML
    nav.innerHTML = `
        <button class="pagination-arrow ${leftClass}" 
                onclick="${leftDisabled ? '' : leftAction}"
                data-tooltip="${leftTooltip}"
                aria-label="${leftTooltip}">
            <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>
        
        <div class="pagination-pages">
            ${pageNumbers.map(num => {
                if (num === '...') {
                    return `<span class="pagination-ellipsis">⋯</span>`;
                }
                const isActive = num === current + 1;
                return `<button class="pagination-num ${isActive ? 'active' : ''}" 
                            onclick="Lumina.Actions.goToPage(${num - 1})"
                            data-tooltip="${t('jumpToPage', num)}">${num}</button>`;
            }).join('')}
        </div>
        
        <button class="pagination-arrow ${rightClass}" 
                onclick="${rightDisabled ? '' : rightAction}"
                data-tooltip="${rightTooltip}"
                aria-label="${rightTooltip}">
            <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
    `;
    
    Lumina.DOM.contentWrapper.appendChild(nav);
    Lumina.UI.setupPaginationTooltip?.(nav);
};

// 页码生成逻辑（折叠中间）
Lumina.Renderer.generatePageNumbers = (current, total) => {
    const currentPage = current + 1; // 转为 1-based
    const pages = [];
    
    if (total <= 7) {
        // 全部显示：1 2 3 4 5 6 7
        for (let i = 1; i <= total; i++) pages.push(i);
    } else if (currentPage <= 4) {
        // 当前在前段：1 2 3 4 5 ... 10
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(total);
    } else if (currentPage >= total - 3) {
        // 当前在后段：1 ... 6 7 8 9 10
        pages.push(1);
        pages.push('...');
        for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
        // 当前在中段：1 ... 4 5 6 ... 10
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(total);
    }
    
    return pages;
};

Lumina.Renderer.updateDocumentStyles = () => {
    const firstPara = Lumina.DOM.contentWrapper.querySelector('.doc-line.paragraph');
    if (firstPara && Lumina.State.settings.dropCap) firstPara.classList.add('drop-cap');
};

Lumina.Renderer.generateTOC = () => {
    Lumina.DOM.tocList.innerHTML = '';
    const state = Lumina.State.app;
    
    // 关键优化：使用 DocumentFragment 批量操作
    const fragment = document.createDocumentFragment();

    state.chapters.forEach((chapter, chIdx) => {
        if (chapter.isPreface) {
            const prefaceLi = document.createElement('li');
            prefaceLi.className = 'toc-item level-0 preface-item';
            prefaceLi.dataset.index = chapter.startIndex;
            prefaceLi.dataset.chapterIndex = chIdx;  // 章节索引（用于热力图）
            prefaceLi.textContent = Lumina.I18n.t('preface');
            prefaceLi.addEventListener('click', () => Lumina.Actions.navigateToChapter(chIdx));
            fragment.appendChild(prefaceLi);
        }

        chapter.items.forEach((item, itemIdx) => {
            const globalIndex = chapter.startIndex + itemIdx;
            let level = -1;
            if (item.type === 'title') level = 1;
            else if (item.type === 'subtitle') level = 2;
            else if (item.type && item.type.startsWith('heading')) level = parseInt(item.type.replace('heading', ''));

            if (level >= 0) {
                if (chapter.isPreface && itemIdx === 0 && item.type === 'title') return;
                const li = document.createElement('li');
                li.className = `toc-item level-${level}`;
                li.dataset.index = globalIndex;
                li.dataset.chapterIndex = chIdx;  // 章节索引（用于热力图）
                let content = item.display || item.text;
                content = Lumina.Renderer.getCleanText(content).trim();
                if (!content) return;
                li.textContent = content;
                li.addEventListener('click', () => Lumina.Actions.navigateToChapter(chIdx, globalIndex));
                fragment.appendChild(li);
            }
        });
    });
    
    // 一次性插入，只触发一次重排
    Lumina.DOM.tocList.appendChild(fragment);
};

Lumina.Renderer.updateTocActive = (index) => {
    const tocItems = [...document.querySelectorAll('.toc-item')].filter(item => parseInt(item.dataset.index, 10) <= index);
    const tocItem = tocItems.pop();
    if (tocItem) {
        document.querySelectorAll('.toc-item.active').forEach(el => el.classList.remove('active'));
        tocItem.classList.add('active');
        tocItem.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
};

Lumina.Renderer.updateTocSpy = () => {
    const state = Lumina.State.app;
    if (!state.chapters.length) return;

    const scrollTop = Lumina.DOM.contentScroll.scrollTop;
    const clientHeight = Lumina.DOM.contentScroll.clientHeight;
    const scrollMiddle = scrollTop + clientHeight / 2;

    const headings = Array.from(Lumina.DOM.contentWrapper.querySelectorAll('.doc-line[data-index]'));
    const headingData = headings.map(el => ({
        index: parseInt(el.dataset.index),
        offsetTop: el.offsetTop,
        offsetHeight: el.offsetHeight
    }));

    let closestIndex = -1, minDistance = Infinity;

    headingData.forEach(({ index, offsetTop, offsetHeight }) => {
        const elCenter = offsetTop + offsetHeight / 2;
        const distance = Math.abs(elCenter - scrollMiddle);
        if (distance < minDistance) { minDistance = distance; closestIndex = index; }
    });

    if (closestIndex >= 0) Lumina.Renderer.updateTocActive(closestIndex);
};

Lumina.Renderer.getCurrentVisibleIndex = () => {
    const state = Lumina.State.app;
    if (!state.chapters.length) return 0;

    const scrollMiddle = Lumina.DOM.contentScroll.scrollTop + Lumina.DOM.contentScroll.clientHeight / 2;
    const paragraphs = Array.from(Lumina.DOM.contentWrapper.querySelectorAll('.doc-line[data-index]'));

    if (paragraphs.length === 0) return state.chapters[state.currentChapterIndex]?.startIndex || 0;

    let closestIndex = state.chapters[state.currentChapterIndex]?.startIndex || 0;
    let minDistance = Infinity;

    paragraphs.forEach(el => {
        const elCenter = el.offsetTop + el.offsetHeight / 2;
        const distance = Math.abs(elCenter - scrollMiddle);
        if (distance < minDistance) { minDistance = distance; closestIndex = parseInt(el.dataset.index) || 0; }
    });

    return closestIndex;
};

Lumina.Renderer.updateChapterNavInfo = () => {
    const state = Lumina.State.app;
    if (!state.document.items.length || !state.chapters.length) {
        Lumina.DOM.chapterNavInfo.textContent = '';
        return;
    }
    const chapter = state.chapters[state.currentChapterIndex];
    Lumina.DOM.chapterNavInfo.textContent = chapter.isPreface ? Lumina.I18n.t('preface') : Lumina.Renderer.getCleanText(chapter.title);
};

// ==================== 10. 搜索功能 ====================

Lumina.Search = {
    perform(query) {
        const state = Lumina.State.app;
        state.search.currentQuery = query;

        if (!query || !state.document.items.length) {
            Lumina.DOM.searchResults.innerHTML = `<div class="search-empty">${Lumina.I18n.t('searchEmpty')}</div>`;
            return;
        }

        const lowerQuery = query.toLowerCase();
        state.search.matches = [];

        state.chapters.forEach((chapter, chIdx) => {
            chapter.items.forEach((item, itemIdx) => {
                if (item.text?.toLowerCase().includes(lowerQuery)) {
                    state.search.matches.push({
                        item, chapterIndex: chIdx, globalIndex: chapter.startIndex + itemIdx,
                        chapterTitle: chapter.isPreface ? Lumina.I18n.t('preface') : chapter.title
                    });
                }
            });
        });

        if (!state.search.matches.length) {
            Lumina.DOM.searchResults.innerHTML = `<div class="search-empty">${Lumina.I18n.t('searchNoResults')}</div>`;
            return;
        }

        Lumina.DOM.searchResults.innerHTML = state.search.matches.map((match, idx) => {
            const text = match.item.text;
            const matchIndex = text.toLowerCase().indexOf(lowerQuery);
            const start = Math.max(0, matchIndex - 30);
            const end = Math.min(text.length, matchIndex + query.length + 30);
            let context = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
            context = context.replace(new RegExp(`(${Lumina.Utils.escapeRegex(lowerQuery)})`, 'gi'), '<span class="search-result-match">$1</span>');

            return `
        <div class="search-result-item" data-index="${idx}" data-global="${match.globalIndex}" data-chapter="${match.chapterIndex}">
        <div class="search-result-context">${context}</div>
        <div class="search-result-info">
            <span>${Lumina.Search.getItemTypeLabel(match.item.type)}</span>
            <span>${Lumina.Utils.escapeHtml(match.chapterTitle)}</span>
        </div>
        </div>
    `;
        }).join('');

        Lumina.DOM.searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const globalIndex = parseInt(item.dataset.global);
                const chapterIndex = parseInt(item.dataset.chapter);

                Lumina.Search.clearHighlight();

                // 🔧 关键修复：无论是否同章节，都调用 navigateToChapter 并传递 globalIndex
                // 让 navigateToChapter 处理分页计算
                Lumina.Actions.navigateToChapter(chapterIndex, globalIndex);

                // 高亮搜索结果（延迟确保渲染完成）
                setTimeout(() => {
                    const target = Lumina.DOM.contentWrapper.querySelector(`.doc-line[data-index="${globalIndex}"]`);
                    if (target) {
                        target.classList.add('search-highlight');
                        state.search.highlightedIndex = globalIndex;
                        document.querySelectorAll('.search-result-item.active').forEach(i => i.classList.remove('active'));
                        item.classList.add('active');
                    }
                }, 100);
            });
        });
    },

    getItemTypeLabel(type) {
        const labels = { title: Lumina.I18n.t('title'), subtitle: Lumina.I18n.t('subtitle'), paragraph: Lumina.I18n.t('paragraph'), list: Lumina.I18n.t('list') };
        if (type?.startsWith('heading')) return Lumina.I18n.t(type);
        return labels[type] || type;
    },

    clearResults() {
        const state = Lumina.State.app;
        state.search.matches = [];
        state.search.currentQuery = '';
        state.search.highlightedIndex = -1;

        if (Lumina.DOM.searchResults) Lumina.DOM.searchResults.innerHTML = `<div class="search-empty">${Lumina.I18n.t('searchEmpty')}</div>`;

        const searchInput = document.getElementById('searchPanelInput');
        if (searchInput) searchInput.value = '';

        Lumina.DOM.searchPanel.classList.remove('open');
        Lumina.Search.clearHighlight();
    },

    clearHighlight() {
        const state = Lumina.State.app;
        if (state.search.highlightedIndex >= 0) {
            const el = Lumina.DOM.contentWrapper.querySelector(`[data-index="${state.search.highlightedIndex}"]`);
            if (el) el.classList.remove('search-highlight');
            state.search.highlightedIndex = -1;
        }
    }
};

// ==================== 11. 导出功能 ====================

Lumina.Exporter = {
    async exportDocument(format) {
        const state = Lumina.State.app;
        if (!state.document.items.length) return;

        if (format === 'docx') {
            if ('requestIdleCallback' in window) requestIdleCallback(() => Lumina.Exporter.generateDOCX(), { timeout: 100 });
            else setTimeout(() => Lumina.Exporter.generateDOCX(), 50);
            return;
        }

        const exporters = {
            txt: async () => await Lumina.Exporter.downloadFile(Lumina.Exporter.generateTXT(), 'text/plain', '.txt'),
            md: async () => await Lumina.Exporter.downloadFile(Lumina.Exporter.generateMD(), 'text/markdown', '.md'),
            html: async () => await Lumina.Exporter.downloadFile(Lumina.Exporter.generateHTML(), 'text/html', '.html')
        };

        if (exporters[format]) {
            try {
                await exporters[format]();
            } catch (e) {
                console.error('导出失败:', e);
                Lumina.UI.showToast('导出失败: ' + e.message);
            }
        }
    },

    generateTXT() {
        return Lumina.State.app.document.items.map(i => i.type === 'image' ? '[图片]' : (i.display || i.text)).join('\n');
    },

    generateMD() {
        return Lumina.State.app.document.items.map(i => {
            if (i.type === 'image') return `![${i.alt || 'image'}](${i.data})`;
            if (i.type === 'title') return `# ${i.text}`;
            if (i.type === 'subtitle') return `## ${i.text}`;
            if (i.type.startsWith('heading')) return `${'#'.repeat(i.level)} ${i.text}`;
            return i.text;
        }).join('\n');
    },

    generateHTML() {
        const appState = Lumina.State.app;
        const settings = Lumina.State.settings;
        const escapeHtml = Lumina.Utils.escapeHtml;
        const getCleanText = Lumina.Renderer.getCleanText;
        const fontConfig = Lumina.Config.fontConfig;

        const fileTitle = escapeHtml(appState.currentFile.name.replace(/\.[^/.]+$/, ''));
        const chapterNames = appState.chapters.map(c =>
            c.isPreface ? '前言' : escapeHtml(getCleanText(c.title).substring(0, 40))
        );

        // 重置计数器
        let headingCounter = 0;
        const idMap = new Map(); // 存储 item -> ID 的映射

        // 第一遍：为所有需要导航的元素预分配ID
        appState.chapters.forEach((chapter, cidx) => {
            // 章节本身分配ID（用于前言跳转）
            const chapterId = `ch-${cidx}`;

            chapter.items.forEach((item) => {
                if (item.type === 'title' || item.type?.startsWith('heading')) {
                    const hid = `h-${headingCounter++}`;
                    idMap.set(item, hid);
                }
            });
        });

        // 构建目录项
        let tocItems = '';

        appState.chapters.forEach((chapter, cidx) => {
            const chapterId = `ch-${cidx}`;

            // 前言章节：添加前言入口
            if (chapter.isPreface) {
                tocItems += `
                <li class="toc-item level-0 preface-item" data-target="${chapterId}" data-ch="${cidx}">
                    <span class="toc-text">前言</span>
                </li>`;
            }

            // 章节的子标题
            chapter.items.forEach((item) => {
                if (item.type === 'title') {
                    // 文档标题（通常只有一个）
                    const hid = idMap.get(item);
                    const text = escapeHtml(getCleanText(item.text));
                    tocItems += `
                    <li class="toc-item level-1 doc-title-item" data-target="${hid}" data-ch="${cidx}">
                        <span class="toc-text">${text}</span>
                    </li>`;
                } else if (item.type === 'subtitle') {
                    // 副标题（通常不加入目录，或作为二级）
                    const text = escapeHtml(getCleanText(item.text));
                    // 副标题可选加入目录，这里选择加入作为level-2
                    const hid = `sub-${cidx}`; // 副标题使用独立ID生成
                    idMap.set(item, hid);
                    tocItems += `
                    <li class="toc-item level-2 doc-subtitle-item" data-target="${hid}" data-ch="${cidx}">
                        <span class="toc-text">${text}</span>
                    </li>`;
                } else if (item.type?.startsWith('heading')) {
                    const level = Math.min(parseInt(item.type.replace('heading', '')) || 1, 6);
                    const text = escapeHtml(item.display || item.text);
                    const hid = idMap.get(item);

                    // 前言章节且是第一个heading，如果是前言入口已显示，这里跳过或降级
                    if (chapter.isPreface && level === 1) {
                        // 前言的一级标题仍然显示，但样式可能不同
                    }

                    tocItems += `
                    <li class="toc-item level-${level}" data-target="${hid}" data-ch="${cidx}">
                        <span class="toc-text">${text}</span>
                    </li>`;
                }
            });
        });

        // 构建内容
        let contentItems = '';

        appState.chapters.forEach((chapter, cidx) => {
            const chapterId = `ch-${cidx}`;
            contentItems += `<section id="${chapterId}" class="chapter ${chapter.isPreface ? 'preface' : ''}" data-idx="${cidx}">`;

            chapter.items.forEach((item) => {
                if (item.type === 'image') {
                    contentItems += `<p class="img-wrap"><img src="${item.data}" alt="${escapeHtml(item.alt || '')}"></p>`;
                } else if (item.type === 'paragraph') {
                    const text = escapeHtml(getCleanText(item.text));
                    contentItems += text ? `<p>${text}</p>` : '';
                } else if (item.type === 'title') {
                    const text = escapeHtml(getCleanText(item.text));
                    const hid = idMap.get(item);
                    contentItems += text ? `<h1 class="doc-title" id="${hid}">${text}</h1>` : '';
                } else if (item.type === 'subtitle') {
                    const text = escapeHtml(getCleanText(item.text));
                    const hid = idMap.get(item);
                    contentItems += text ? `<h2 class="doc-subtitle" id="${hid}">${text}</h2>` : '';
                } else if (item.type?.startsWith('heading')) {
                    const level = Math.min(parseInt(item.type.replace('heading', '')) || 1, 6);
                    const text = escapeHtml(item.display || item.text);
                    const hid = idMap.get(item);
                    contentItems += `<h${level} id="${hid}" class="heading-${level}">${text}</h${level}>`;
                }
            });

            contentItems += '</section>';
        });

        // 字体加载策略
        const fontLoaderScript = `
        (function() {
        const fonts = [
            {family: 'Noto Serif SC', url: 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&display=swap'},
            {family: 'Noto Sans SC', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap'}
        ];
        // ... 其余保持原样
        })();
    `;

        // SVG 图标
        const icons = {
            menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`,
            theme: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
        };

        // CSS 样式
        const styles = `
        :root {
            --bg: #fff;
            --bg-secondary: #f8f9fa;
            --text: #333;
            --text-secondary: #666;
            --border: #e0e0e0;
            --accent: #333;
            --header-bg: #fff;
            --sidebar-bg: #fff;
            --scroll-track: #f1f1f1;
            --scroll-thumb: #c1c1c1;
            --font-serif: "Noto Serif SC", "Source Han Serif SC", "SimSun", "STSong", serif;
            --font-sans: "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif;
            --reader-font-size: 18px;
        }

        .font-serif-fallback {
            --font-serif: "serif-fallback", "SimSun", "STSong", serif;
        }
        .font-sans-fallback {
            --font-sans: "sans-fallback", "Microsoft YaHei", "PingFang SC", sans-serif;
        }
        
        [data-theme="dark"] {
            --bg: #1a1a1a;
            --bg-secondary: #2d2d2d;
            --text: #d4d4d4;
            --text-secondary: #888;
            --border: #404040;
            --accent: #d4a373;
            --header-bg: #242424;
            --sidebar-bg: #1a1a1a;
            --scroll-track: #2d2d2d;
            --scroll-thumb: #555;
        }
        
        [data-theme="sepia"] {
            --bg: #f4ecd8;
            --bg-secondary: #e8dec5;
            --text: #5b4636;
            --text-secondary: #8b7355;
            --border: #d4c9b0;
            --accent: #8b4513;
            --header-bg: #f4ecd8;
            --sidebar-bg: #f4ecd8;
            --scroll-track: #e8dec5;
            --scroll-thumb: #c9b896;
        }
        
        [data-theme="green"] {
            --bg: #c7edcc;
            --bg-secondary: #b8e0be;
            --text: #2c3e2d;
            --text-secondary: #4a5d4b;
            --border: #a8d5b0;
            --accent: #2e7d32;
            --header-bg: #c7edcc;
            --sidebar-bg: #c7edcc;
            --scroll-track: #b8e0be;
            --scroll-thumb: #7cb87f;
        }
        
        .fonts-failed { --font-serif: "SimSun", "STSong", serif; --font-sans: "Microsoft YaHei", "PingFang SC", sans-serif; }
        
        * { margin: 0; padding: 0; touch-action: manipulation; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html { scroll-behavior: smooth; }
        body {
            font-family: var(--font-serif);
            line-height: 1.8;
            color: var(--text);
            background: var(--bg-secondary);
            font-size: 18px;
            overflow-x: hidden;
            transition: background 0.3s, color 0.3s;
            scrollbar-width: thin;
            scrollbar-color: var(--scroll-thumb) var(--scroll-track);
            font-synthesis: none;
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        .fonts-loading body {
            opacity: 0.9;
        }
        .fonts-loaded body {
            opacity: 1;
            transition: opacity 0.3s ease;
        }

        @font-face {
            font-family: 'Noto Serif SC';
            font-display: swap;
        }
        @font-face {
            font-family: 'Noto Sans SC';
            font-display: swap;
        }
        @font-face {
            font-family: 'LXGW Neo Zhi Song';
            src: url('assets/fonts/LXGWNeoZhiSongPlus.ttf') format('truetype');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
        }
        
        body::-webkit-scrollbar { width: 8px; }
        body::-webkit-scrollbar-track { background: var(--scroll-track); }
        body::-webkit-scrollbar-thumb { background: var(--scroll-thumb); border-radius: 4px; }
        
        .header {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 60px;
            background: var(--header-bg);
            border-bottom: 1px solid var(--border);
            z-index: 1000;
            display: flex;
            align-items: center;
            padding: 0 20px;
            justify-content: space-between;
            transition: background 0.3s, border-color 0.3s;
        }
        
        .header-btn {
            width: 40px;
            height: 40px;
            border: 1px solid var(--border);
            background: transparent;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text);
            transition: all 0.2s;
            flex-shrink: 0;
        }
        
        .header-btn:hover { border-color: var(--accent); color: var(--accent); }
        .header-btn svg { width: 20px; height: 20px; }
        
        .header-title {
            flex: 1;
            text-align: center;
            padding: 0 15px;
            overflow: hidden;
            min-width: 0;
        }
        
        .book-name { font-size: 13px; color: var(--text-secondary); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chapter-name { font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text); }
        
        .sidebar {
            position: fixed;
            top: 60px;
            left: 0;
            width: 300px;
            height: calc(100vh - 60px);
            background: var(--sidebar-bg);
            border-right: 1px solid var(--border);
            overflow-y: auto;
            z-index: 999;
            transition: transform 0.3s ease;
            transform: translateX(-100%);
            scrollbar-width: thin;
            scrollbar-color: var(--scroll-thumb) transparent;
        }
        
        .sidebar.open { transform: translateX(0); }
        .sidebar::-webkit-scrollbar { width: 6px; }
        .sidebar::-webkit-scrollbar-thumb { background: var(--scroll-thumb); border-radius: 3px; }
        
        .toc-list { list-style: none; padding: 16px 0; }
        
        .toc-item {
            padding: 10px 20px;
            cursor: pointer;
            border-left: 3px solid transparent;
            transition: all 0.2s;
            color: var(--text-secondary);
        }
        
        .toc-item:hover { background: var(--bg-secondary); color: var(--text); }
        .toc-item.active { background: var(--bg-secondary); border-left-color: var(--accent); color: var(--text); font-weight: 500; }
        
        /* 前言特殊样式 */
        .toc-item.preface-item {
            font-style: italic;
            color: var(--accent);
            font-weight: 600;
        }
                        
        /* 文档标题样式 */
        .toc-item.doc-title-item {
            font-weight: 700;
            color: var(--text);
        }
        
        .toc-item.doc-subtitle-item {
            font-style: italic;
            opacity: 0.8;
        }
        
        .toc-item.level-1 { font-weight: 600; color: var(--text); }
        .toc-item.level-2 { padding-left: 32px; }
        .toc-item.level-3 { padding-left: 44px; font-size: 15px; }
        .toc-item.level-4, .toc-item.level-5, .toc-item.level-6 { padding-left: 56px; font-size: 14px; opacity: 0.9; }
        
        .toc-text {
            display: block;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .main {
            margin-left: 0;
            margin-top: 60px;
            transition: margin-left 0.3s;
            min-height: calc(100vh - 60px);
        }
        
        .content {
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 48px;
            background: var(--bg);
            min-height: calc(100vh - 60px);
            transition: background 0.3s;
            touch-action: pan-y pinch-zoom;
        }
        
        /* 前言样式 */
        .chapter.preface {
            background: var(--bg-secondary);
            padding: 2em;
            border-radius: 8px;
            margin-bottom: 2em;
        }
        
        /* 标题样式 */
        .doc-title { 
            font-size: 2.2em; 
            font-weight: 700; 
            text-align: center; 
            margin: 0.5em 0 0.3em; 
            color: var(--text);
            line-height: 1.3;
            scroll-margin-top: 80px;
        }
        
        .doc-subtitle { 
            font-size: 1.4em; 
            font-weight: 500; 
            text-align: center; 
            color: var(--text-secondary); 
            font-style: italic;
            margin: 0 0 1.5em 0;
            opacity: 0.9;
            scroll-margin-top: 80px;
        }
        
        [id^="h-"] { scroll-margin-top: 80px; }
        [id^="ch-"] { scroll-margin-top: 80px; }
        
        .chapter { margin-bottom: 60px; }
        
        .heading-1 { font-size: 2em; margin: 1.5em 0 1em; padding-bottom: 0.5em; border-bottom: 2px solid var(--accent); line-height: 1.3; }
        .heading-2 { font-size: 1.5em; margin: 1.5em 0 0.8em; }
        .heading-3 { font-size: 1.25em; margin: 1.2em 0 0.6em; color: var(--text-secondary); }
        .heading-4, .heading-5, .heading-6 { font-size: 1.1em; margin: 1em 0 0.5em; color: var(--text-secondary); opacity: 0.9; }
        
        p { margin: 1em 0; text-align: justify; word-wrap: break-word; overflow-wrap: break-word; }
        
        .img-wrap { text-align: center; margin: 1.5em 0; }
        .img-wrap img { max-width: 100%; height: auto; border-radius: 4px; display: block; margin: 0 auto; }
        
        /* 懒加载图片样式 */
        .lazy-image {
            opacity: 0;
            transition: opacity 0.3s;
        }
        .lazy-image.loaded {
            opacity: 1;
        }
        .lazy-image[src] {
            opacity: 1;
        }
        
        /* 图片查看器动画优化 */
        .image-viewer-overlay {
            will-change: opacity;
        }
        .image-viewer-overlay img {
            will-change: transform;
        }
        
        .overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            z-index: 998;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s, visibility 0.3s;
        }
        
        .overlay.active { opacity: 1; visibility: visible; }
        
        @media (min-width: 769px) {
            .sidebar { transform: translateX(0); }
            .main { margin-left: 300px; }
            .overlay { display: none; }
        }
        
        @media (max-width: 900px) {
            .content { padding: 40px 24px; }
        }
        
        @media (max-width: 768px) {
            body { font-size: 17px; }
            .sidebar { width: 100%; max-width: none; border-right: none; }
            .content { padding: 24px 20px; width: 100%; max-width: none; }
            .header { padding: 0 16px; }
            .header-title { padding: 0 12px; }
            .chapter-name { font-size: 15px; }
            .doc-title { font-size: 1.8em; }
            .doc-subtitle { font-size: 1.2em; }
            .heading-1 { font-size: 1.7em; }
            .heading-2 { font-size: 1.4em; }
            [id^="h-"], [id^="ch-"], .doc-title, .doc-subtitle { scroll-margin-top: 70px; }
            .header-btn { width: 36px; height: 36px; }
            .header-btn svg { width: 18px; height: 18px; }
        }
        
        @media (max-width: 480px) {
            .content { padding: 20px 16px; }
            .chapter.preface { padding: 1.5em; }
        }
        
        @media print {
            .header, .sidebar, .overlay { display: none; }
            .main { margin-left: 0; margin-top: 0; }
        }

        .font-loading-indicator {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--bg-primary);
            padding: 10px 18px;
            border-radius: 24px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 0.85em;
            color: var(--text-secondary);
            display: none;
            align-items: center;
            gap: 10px;
            z-index: 1000;
            border: 1px solid var(--border-color);
            backdrop-filter: blur(8px);
            transition: opacity 0.3s, transform 0.3s;
        }
        
        .font-loading-indicator.active {
            display: flex;
            animation: slideIn 0.3s ease;
        }
        
        .font-loading-indicator.fade-out {
            opacity: 0;
            transform: translateY(10px);
        }
        
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .font-loading-indicator::before {
            content: "";
            width: 14px;
            height: 14px;
            border: 2px solid var(--border-color);
            border-top-color: var(--accent-color);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .content-wrapper {
            transition: font-family 0.3s ease;
        }
        
        .doc-line {
            min-height: 1.5em; 
            transition: font-size 0.2s ease;
        }
    `;

        // 主逻辑脚本
        const mainScript = `
        (function() {
            const chapterNames = ${JSON.stringify(chapterNames)};
            const themes = ['light', 'dark', 'sepia', 'green'];
            let currentCh = 0;
            let themeIdx = 0;
            let sidebarOpen = false;

            const $ = (s) => document.querySelector(s);
            const $$ = (s) => document.querySelectorAll(s);
            
            // 双指缩放字体大小功能
            let initialPinchDistance = null;
            let initialFontSize = 20;
            let currentFontSize = 20;
            const MIN_FONT_SIZE = 12;
            const MAX_FONT_SIZE = 32;

            // 关键新增：手势状态追踪，防止缩放结束后误触发双击
            let gestureState = {
                isPinching: false,      // 是否正在双指缩放
                isSingleTap: false,     // 是否单指点击
                touchStartTime: 0,      // 触摸开始时间
                touchStartPos: { x: 0, y: 0 },  // 触摸开始位置
                lastTapTime: 0,         // 上次点击时间（用于双击检测）
                lastTapPos: { x: 0, y: 0 }      // 上次点击位置（用于区分移动和点击）
            };

            // 应用字体大小
            function applyFontSize(size) {
                currentFontSize = parseFloat(Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size)).toFixed(1));
                document.documentElement.style.setProperty('--reader-font-size', currentFontSize + 'px');
                document.body.style.fontSize = currentFontSize + 'px';
                showFontSizeToast(currentFontSize);
            }

            // 显示字号提示
            let toastTimeout;
            function showFontSizeToast(size) {
                let toast = document.getElementById('font-size-toast');
                if (!toast) {
                    toast = document.createElement('div');
                    toast.id = 'font-size-toast';
                    toast.style.cssText = \`
                        position: fixed;
                        bottom: 100px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: rgba(0,0,0,0.7);
                        color: white;
                        padding: 8px 16px;
                        border-radius: 20px;
                        font-size: 14px;
                        z-index: 10000;
                        pointer-events: none;
                        opacity: 0;
                        transition: opacity 0.3s;
                    \`;
                    document.body.appendChild(toast);
                }
                toast.textContent = '字号: ' + size.toFixed(1) + 'px';
                toast.style.opacity = '1';
                clearTimeout(toastTimeout);
                toastTimeout = setTimeout(() => {
                    toast.style.opacity = '0';
                }, 1500);
            }

            // 触摸开始事件
            document.addEventListener('touchstart', (e) => {
                const currentTime = new Date().getTime();
                
                if (e.touches.length === 2) {
                    // ===== 双指缩放开始 =====
                    gestureState.isPinching = true;
                    gestureState.isSingleTap = false;
                    
                    const touch1 = e.touches[0];
                    const touch2 = e.touches[1];
                    
                    // 记录初始双指距离和字体大小
                    initialPinchDistance = Math.hypot(
                        touch2.clientX - touch1.clientX,
                        touch2.clientY - touch1.clientY
                    );
                    initialFontSize = currentFontSize;
                    
                    e.preventDefault();
                    
                } else if (e.touches.length === 1) {
                    // ===== 单指触摸开始，记录可能为点击 =====
                    gestureState.isSingleTap = true;
                    gestureState.touchStartTime = currentTime;
                    gestureState.touchStartPos = {
                        x: e.touches[0].clientX,
                        y: e.touches[0].clientY
                    };
                }
            }, { passive: false });

            // 触摸移动事件
            document.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2 && gestureState.isPinching && initialPinchDistance !== null) {
                    // ===== 双指缩放中 =====
                    const touch1 = e.touches[0];
                    const touch2 = e.touches[1];
                    
                    const currentDistance = Math.hypot(
                        touch2.clientX - touch1.clientX,
                        touch2.clientY - touch1.clientY
                    );
                    
                    // 基于初始距离计算总缩放比例
                    const scale = currentDistance / initialPinchDistance;
                    const newSize = initialFontSize * scale;
                    
                    applyFontSize(newSize);
                    e.preventDefault();
                    
                } else if (e.touches.length === 1 && gestureState.isSingleTap) {
                    // ===== 单指移动，检查是否超出点击范围 =====
                    const moveDistance = Math.hypot(
                        e.touches[0].clientX - gestureState.touchStartPos.x,
                        e.touches[0].clientY - gestureState.touchStartPos.y
                    );
                    
                    // 如果移动超过10px，则不再是点击，而是滚动
                    if (moveDistance > 10) {
                        gestureState.isSingleTap = false;
                    }
                }
            }, { passive: false });

            // 触摸结束事件 - 关键修复：区分缩放结束和点击
            document.addEventListener('touchend', (e) => {
                const currentTime = new Date().getTime();
                
                if (gestureState.isPinching) {
                    // ===== 缩放结束 =====
                    // 关键修复：延迟重置 isPinching，防止立即触发双击检测
                    setTimeout(() => {
                        gestureState.isPinching = false;
                        initialPinchDistance = null;
                        initialFontSize = currentFontSize;
                    }, 100); // 100ms延迟，确保不会立即被判定为点击
                    
                    // 缩放结束后，不处理任何点击逻辑
                    return;
                }
                
                // 单指点击处理（只有在真正是点击时才处理）
                if (gestureState.isSingleTap && e.changedTouches.length === 1) {
                    const touch = e.changedTouches[0];
                    
                    // 检查触摸时长（点击应该很快，< 300ms）
                    const touchDuration = currentTime - gestureState.touchStartTime;
                    if (touchDuration > 300) {
                        gestureState.isSingleTap = false;
                        return; // 长按，不是点击
                    }
                    
                    // 检查触摸位置变化（点击应该几乎没移动）
                    const moveDistance = Math.hypot(
                        touch.clientX - gestureState.touchStartPos.x,
                        touch.clientY - gestureState.touchStartPos.y
                    );
                    if (moveDistance > 10) {
                        gestureState.isSingleTap = false;
                        return; // 移动了，是滑动不是点击
                    }
                    
                    // ===== 真正的点击检测 =====
                    // 检查与上次点击的距离（双击应该在相近位置）
                    const tapDistance = Math.hypot(
                        touch.clientX - gestureState.lastTapPos.x,
                        touch.clientY - gestureState.lastTapPos.y
                    );
                    
                    const tapInterval = currentTime - gestureState.lastTapTime;
                    
                    // 双击检测：300ms内，且位置相近（< 50px）
                    if (tapInterval < 300 && tapInterval > 0 && tapDistance < 50) {
                        // 双击确认，重置字体大小
                        applyFontSize(20.0);
                        
                        // 重置点击记录，防止三击连续触发
                        gestureState.lastTapTime = 0;
                        gestureState.lastTapPos = { x: 0, y: 0 };
                    } else {
                        // 记录这次点击
                        gestureState.lastTapTime = currentTime;
                        gestureState.lastTapPos = { x: touch.clientX, y: touch.clientY };
                    }
                }
                
                // 重置单指状态
                gestureState.isSingleTap = false;
            });

            // 触摸取消事件（如来电打断等）
            document.addEventListener('touchcancel', (e) => {
                gestureState.isPinching = false;
                gestureState.isSingleTap = false;
                initialPinchDistance = null;
            });
            
            // 菜单切换
            window.toggleMenu = function() {
                sidebarOpen = !sidebarOpen;
                $('.sidebar').classList.toggle('open', sidebarOpen);
                $('.overlay').classList.toggle('active', sidebarOpen);
            };
            
            $('.overlay').addEventListener('click', () => {
                if (sidebarOpen) toggleMenu();
            });
            
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && sidebarOpen) toggleMenu();
            });
            
            // 主题切换
            window.toggleTheme = function() {
                themeIdx = (themeIdx + 1) % themes.length;
                const t = themes[themeIdx];
                document.documentElement.setAttribute('data-theme', t);
                localStorage.setItem('reader-theme', t);
            };
            
            // 跳转到指定位置
            window.goTo = function(targetId, ch) {
                currentCh = ch;
                const el = document.getElementById(targetId);
                if (!el) {
                    console.warn('Target not found:', targetId);
                    return;
                }
                
                const isMobile = window.innerWidth <= 768;
                const offset = isMobile ? 70 : 80;
                let top;
                
                if (targetId.startsWith('ch-')) {
                    top = el.offsetTop - offset;
                } else {
                    const rect = el.getBoundingClientRect();
                    top = window.pageYOffset + rect.top - offset;
                }
                
                window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
                history.pushState(null, null, '#' + targetId);
                
                if (isMobile && sidebarOpen) toggleMenu();
                updateUI();
            };
            
            function updateUI() {
                $$('.toc-item').forEach(el => el.classList.remove('active'));
                
                const hash = location.hash.slice(1);
                if (!hash) return;
                
                const active = $('.toc-item[data-target="' + hash + '"]');
                if (active) {
                    active.classList.add('active');
                    active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                
                const currentSection = $('.chapter[data-idx="' + currentCh + '"]');
                if (currentSection) {
                    const firstHeading = currentSection.querySelector('.doc-title, .heading-1, h1, h2');
                    $('.chapter-name').textContent = chapterNames[currentCh] || 
                        (firstHeading ? firstHeading.textContent : '');
                }
            }
            
            // 滚动监听
            let ticking = false;
            window.addEventListener('scroll', () => {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => {
                    ticking = false;
                    onScroll();
                });
            }, { passive: true });
            
            function onScroll() {
                const isMobile = window.innerWidth <= 768;
                const offset = isMobile ? 70 : 80;
                
                const allTargets = $$('[id^="h-"], [id^="ch-"], .doc-title[id], .doc-subtitle[id]');
                if (!allTargets.length) return;
                
                let minDist = Infinity, closest = null, closestCh = 0;
                
                allTargets.forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const dist = Math.abs(rect.top - offset);
                    if (dist < minDist) {
                        minDist = dist;
                        closest = el.id;
                        const chapter = el.closest('.chapter');
                        closestCh = chapter ? parseInt(chapter.dataset.idx) || 0 : 0;
                    }
                });
                
                if (closest) {
                    $$('.toc-item').forEach(el => el.classList.remove('active'));
                    const cur = $('.toc-item[data-target="' + closest + '"]');
                    if (cur) cur.classList.add('active');
                    
                    if (closestCh !== currentCh) {
                        currentCh = closestCh;
                        $('.chapter-name').textContent = chapterNames[currentCh] || '';
                    }
                }
            }
            
            // 目录点击委托
            $('.toc-list').addEventListener('click', (e) => {
                const item = e.target.closest('.toc-item');
                if (!item) return;
                const targetId = item.dataset.target;
                const ch = parseInt(item.dataset.ch);
                if (targetId) goTo(targetId, ch);
            });
            
            // 恢复主题
            const saved = localStorage.getItem('reader-theme');
            if (saved) {
                const idx = themes.indexOf(saved);
                if (idx > -1) {
                    themeIdx = idx;
                    document.documentElement.setAttribute('data-theme', saved);
                }
            }
            
            // 处理URL hash
            if (location.hash) {
                setTimeout(() => {
                    const hash = location.hash.slice(1);
                    const target = $('.toc-item[data-target="' + hash + '"]');
                    if (target) {
                        const ch = parseInt(target.dataset.ch);
                        goTo(hash, ch);
                    }
                }, 100);
            }
            
            updateUI();
        })();
    `;

        // 组装 HTML
        const parts = [
            '<!DOCTYPE html>',
            '<html lang="zh-CN" data-theme="light">',
            '<head>',
            '<meta charset="UTF-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">',
            '<title>' + fileTitle + '</title>',
            '<style>' + styles + '</style>',
            '</head>',
            '<body>',

            '<header class="header">',
            '<button class="header-btn" onclick="toggleMenu()" aria-label="目录">' + icons.menu + '</button>',
            '<div class="header-title">',
            '<div class="book-name">' + fileTitle + '</div>',
            '<div class="chapter-name">点击目录开始阅读</div>',
            '</div>',
            '<button class="header-btn" onclick="toggleTheme()" aria-label="切换主题">' + icons.theme + '</button>',
            '</header>',

            '<div class="overlay"></div>',

            '<aside class="sidebar">',
            '<ul class="toc-list">' + tocItems + '</ul>',
            '</aside>',

            '<main class="main">',
            '<article class="content">' + contentItems + '</article>',
            '</main>',

            '<script>' + fontLoaderScript + '<\/script>',
            '<script>' + mainScript + '<\/script>',
            '</body>',
            '</html>'
        ];

        return parts.join('');
    },

    async generateDOCX() {
        const docxLib = window.docx || window.Docx;
        if (!docxLib) { Lumina.UI.showToast(Lumina.I18n.t('docxLibraryNotLoaded') || 'DOCX 库未加载'); return; }

        const { Document, Packer, Paragraph, PageSize, TextRun, ImageRun, PageBreak, AlignmentType, Header, Footer, PageNumber, ShadingType } = docxLib;

        Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = Lumina.I18n.t('generatingDocx');
        Lumina.DOM.loadingScreen.classList.add('active');
        await new Promise(r => setTimeout(r, 50));

        const appState = Lumina.State.app;
        const settings = Lumina.State.settings;
        const getCleanText = Lumina.Renderer.getCleanText;

        try {
            // 视觉设置
            const themeColors = {
                light: { bg: 'F8F9FA', text: '212529', secondary: '6C757D', accent: '495057', border: 'DEE2E6' },
                retro: { bg: 'F4ECD8', text: '3D3D3D', secondary: '5A5A5A', accent: '8B4513', border: 'D4C9B0' },
                eyeCare: { bg: 'C7EDCC', text: '2C3E2D', secondary: '4A5D4B', accent: '2E7D32', border: 'A8D5B0' },
                dark: { bg: '2D2D2D', text: 'E0E0E0', secondary: 'A0A0A0', accent: 'D4A373', border: '404040' }
            };
            const colors = themeColors[settings.theme] || themeColors.light;

            const fontMap = {
                serif: { cn: 'Noto Serif SC', fallback: 'SimSun' },
                sans: { cn: 'Noto Sans SC', fallback: 'Microsoft YaHei' },
                kai: { cn: 'KaiTi', fallback: 'KaiTi' },
                mono: { cn: 'FangSong', fallback: 'FangSong' }
            };
            const font = fontMap[settings.font] || fontMap.serif;

            const fontSizePt = settings.fontSize;
            const SINGLE_LINE = 240; // 单倍行距
            const EIGHT_LINES = 1920;  // 8行 = 1920 twips

            // ========== B5 尺寸精确计算 ==========
            // B5 = 176mm × 250mm
            // 1 inch = 1440 twips, 1 mm = 0.03937 inch
            // 176mm = 6.929 inch = 9978 twips
            // 250mm = 9.843 inch = 14174 twips
            const B5_WIDTH = 9978;   // 176mm in twips
            const B5_HEIGHT = 14174; // 250mm in twips
            const MARGIN = 1134;     // 20mm = 1134 twips

            const children = [];
            const fileTitle = appState.currentFile.name.replace(/\.[^/.]+$/, '');

            // 生成内容
            for (let chIdx = 0; chIdx < appState.chapters.length; chIdx++) {
                const chapter = appState.chapters[chIdx];

                for (let i = 0; i < chapter.items.length; i++) {
                    const item = chapter.items[i];

                    // 图片处理
                    if (item.type === 'image' && item.data) {
                        try {
                            const img = new Image();
                            await new Promise((resolve, reject) => {
                                img.onload = resolve;
                                img.onerror = reject;
                                img.src = item.data;
                            });

                            // 计算 100% 版心宽度（像素）
                            const MAX_WIDTH_PX = Math.round((B5_WIDTH - MARGIN * 2) / 15); // 514px

                            // 保持比例缩放到版心宽度
                            const scale = MAX_WIDTH_PX / img.width;
                            const finalWidth = MAX_WIDTH_PX;   // 强制 100% 宽度
                            const finalHeight = Math.round(img.height * scale);

                            const match = item.data.match(/^data:image\/(\w+);base64,(.+)$/);
                            if (match) {
                                const [, ext, base64] = match;
                                const imageBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

                                children.push(new Paragraph({
                                    children: [
                                        new ImageRun({
                                            data: imageBuffer,
                                            transformation: {
                                                width: finalWidth,    // 100% 版心宽度 (514px)
                                                height: finalHeight   // 等比例高度
                                            },
                                            type: ext === 'png' ? 'png' : 'jpg'
                                        })
                                    ],
                                    alignment: AlignmentType.CENTER,  // 图片居中
                                    spacing: { before: 120, after: 120, line: 240 }
                                }));
                            }
                        } catch (e) {
                            console.warn('图片处理失败:', e);
                        }
                        continue;
                    }

                    const text = item.display || item.text || '';
                    if (!text.trim()) continue;
                    const cleanText = getCleanText(text);

                    // 文档标题（左对齐，32pt）
                    if (item.type === 'title') {
                        children.push(new Paragraph({
                            children: [new TextRun({
                                text: cleanText, bold: true, size: 64, // 32pt
                                color: colors.accent,
                                font: { name: font.cn, eastAsia: font.fallback }
                            })],
                            alignment: AlignmentType.LEFT,
                            spacing: { before: 0, after: 360, line: SINGLE_LINE },
                            shading: { fill: colors.bg, type: ShadingType.CLEAR }
                        }));
                    }
                    // 副标题（左对齐）
                    else if (item.type === 'subtitle') {
                        children.push(new Paragraph({
                            children: [new TextRun({
                                text: cleanText, italics: true, size: 32,
                                color: colors.secondary,
                                font: { name: font.cn, eastAsia: font.fallback }
                            })],
                            alignment: AlignmentType.LEFT,
                            spacing: { before: 0, after: 480, line: SINGLE_LINE }
                        }));
                    }
                    // 章节标题（全部左对齐，一级加大，一级后6行间距）
                    else if (item.type && item.type.startsWith('heading')) {
                        const level = parseInt(item.type.replace('heading', '')) || 1;

                        // 字号：一级32pt(64)，二级22pt(44)，三级20pt(40)...
                        const sizes = [64, 44, 40, 36, 32, 28];
                        const size = sizes[level - 1] || 28;

                        // 一级标题后8行，其他递减
                        const afters = [EIGHT_LINES, 320, 240, 200, 160, 120];
                        const befores = [480, 360, 280, 200, 160, 120];

                        children.push(new Paragraph({
                            children: [new TextRun({
                                text: cleanText, bold: true, size: size,
                                color: colors.accent,
                                font: { name: font.cn, eastAsia: font.fallback }
                            })],
                            alignment: AlignmentType.LEFT,
                            spacing: {
                                before: befores[level - 1] || 200,
                                after: afters[level - 1] || 120,
                                line: SINGLE_LINE
                            },
                            outlineLevel: level - 1
                        }));
                    }
                    // 列表
                    else if (item.type === 'list') {
                        children.push(new Paragraph({
                            children: [new TextRun({
                                text: cleanText, size: fontSizePt * 2,
                                color: colors.text,
                                font: { name: font.cn, eastAsia: font.fallback }
                            })],
                            bullet: { level: item.level || 0 },
                            spacing: { before: 60, after: 60, line: SINGLE_LINE * 0.75 },
                            indent: { left: 720 * ((item.level || 0) + 1) }
                        }));
                    }
                    // 正文
                    else {
                        children.push(new Paragraph({
                            children: [new TextRun({
                                text: cleanText, size: fontSizePt * 2,
                                color: colors.text,
                                font: { name: font.cn, eastAsia: font.fallback }
                            })],
                            spacing: {
                                before: 0,
                                after: 240,
                                line: SINGLE_LINE * 0.75,
                                lineRule: 'auto'
                            },
                            indent: settings.indent ? { firstLine: 640 } : undefined
                        }));
                    }
                }

                // 章节结束后分页
                if (chIdx < appState.chapters.length - 1) {
                    children.push(new Paragraph({
                        children: [new PageBreak()]
                    }));
                }
            }

            // 页眉页脚
            const header = new Header({
                children: [new Paragraph({
                    children: [new TextRun({
                        text: fileTitle, size: 24, color: colors.secondary,
                        font: { name: font.cn, eastAsia: font.fallback }
                    })],
                    alignment: AlignmentType.CENTER,
                    border: {
                        bottom: { color: colors.border, space: 1, style: 'single', size: 6 }
                    }
                })]
            });

            const footer = new Footer({
                children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({
                        children: [PageNumber.CURRENT],
                        size: 24, color: colors.secondary
                    })]
                })]
            });

            const doc = new Document({
                background: { color: colors.bg },
                styles: {
                    default: {
                        document: {
                            run: { font: font.cn, size: fontSizePt * 2 }
                        }
                    }
                },
                sections: [{
                    properties: {
                        page: {
                            size: {
                                width: B5_WIDTH,
                                height: B5_HEIGHT,
                            },
                            margin: {
                                top: MARGIN,      // 1134 twips (20mm)
                                right: MARGIN,
                                bottom: MARGIN,
                                left: MARGIN
                            }
                        }
                    },
                    headers: { default: header },
                    footers: { default: footer },
                    children: children
                }]
            });

            const blob = await Packer.toBlob(doc);
            
            // 使用桥接层保存
            if (window.FileExporter) {
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = async () => {
                    try {
                        const base64data = reader.result.split(',')[1];
                        await window.FileExporter.saveBinary(base64data, `${fileTitle}.docx`);
                        Lumina.UI.showToast(Lumina.I18n.t('docxExportSuccess'));
                    } catch (e) {
                        console.error('DOCX 导出失败:', e);
                        Lumina.UI.showToast(Lumina.I18n.t('docxExportFailed', e.message));
                    }
                };
            } else {
                // 传统方式
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${fileTitle}.docx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                Lumina.UI.showToast(Lumina.I18n.t('docxExportSuccess'));
            }
        } catch (err) {
            Lumina.UI.showToast(Lumina.I18n.t('docxExportFailed', err.message));
        } finally {
            Lumina.DOM.loadingScreen.classList.remove('active');
        }
    },

    async downloadFile(content, mimeType, extension) {
        const fileName = Lumina.State.app.currentFile.name.replace(/\.[^/.]+$/, '') + extension;
        
        // 使用桥接层保存文件
        if (window.FileExporter) {
            try {
                await window.FileExporter.saveFile(content, fileName, mimeType);
                Lumina.UI.showToast('导出成功: ' + fileName);
            } catch (e) {
                console.error('导出失败:', e);
                Lumina.UI.showToast('导出失败: ' + e.message);
            }
        } else {
            // 桥接层未加载，使用传统方式
            const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }
};

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
        this.loadVoices();

        if (!this.isApp && speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => this.loadVoices();
        }

        document.getElementById('ttsToggle').addEventListener('click', () => this.toggle());
        window.addEventListener('beforeunload', () => this.stop());
        this.startFileChangeMonitor();
        
        // 监听原生层保活广播（防止后台 WebView 休眠）
        this.setupKeepAliveListener();

        return true;
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

    loadVoices() {
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

        this.populateVoiceSelector();

        if (!this.settings.voiceURI && this.voices.length > 0) {
            this.settings.voiceURI = this.voices[0].voiceURI;
            this.saveSettings();
        }
    }

    populateVoiceSelector() {
        const container = document.getElementById('ttsVoiceOptions');
        if (!container || this.voices.length === 0) return;

        const displayVoices = this.voices.slice(0, 6);

        container.innerHTML = displayVoices.map((v) => {
            const isActive = v.voiceURI === this.settings.voiceURI;
            return `
        <button class="option-btn voice-btn ${isActive ? 'active' : ''}" data-voice="${v.voiceURI}">
        <span class="voice-name">${v.name.replace(/Microsoft|Google|Apple/g, '').trim().split(/\s+/)[0]}</span>
        <span class="voice-lang">${v.lang}</span>
        </button>
    `;
        }).join('');

        container.querySelectorAll('.voice-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.voice-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateSettings('voice', btn.dataset.voice);
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
                this.speakCurrent();
            }, 50);
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
            // 使用原生 TTS
            await this.nativeTTS.speak({
                text: textToRead,
                lang: 'zh-CN',
                rate: this.settings.rate,
                pitch: this.settings.pitch,
                volume: this.settings.volume,
                category: 'playback'
            });
            
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

// ==================== 13. 数据管理器 ====================

Lumina.DataManager = class {
    constructor() {
        this.isPreloaded = false;
        this.currentStats = null;
    }

    init() {
        document.getElementById('openDataManager').addEventListener('click', () => this.open());
        document.getElementById('closeDataManager').addEventListener('click', () => this.close());
        document.getElementById('batchExportBtn').addEventListener('click', () => this.batchExport());
        document.getElementById('importDataBtn').addEventListener('click', () => this.batchImport());
        document.getElementById('clearLibraryBtn').addEventListener('click', () => this.confirmClearLibrary());
        document.getElementById('dataManagerPanel').addEventListener('click', (e) => {
            if (e.target.id === 'dataManagerPanel') this.close();
        });

        document.getElementById('dataGrid').addEventListener('click', (e) => {
            const card = e.target.closest('.data-card');
            if (!card) return;
            const fileKey = card.dataset.filekey;

            if (e.target.closest('.delete-btn')) {
                e.stopPropagation();
                this.confirmDelete(fileKey, card);
            } else if (e.target.closest('.export-btn')) {
                e.stopPropagation();
                this.exportSingle(fileKey);
            } else {
                this.openFile(fileKey);
            }
        });
    }

    async preload() {
        if (this.isPreloaded) return;

        this.currentStats = await Lumina.DB.adapter.getStorageStats();
        this.updateSettingsBar();
        this.renderStats();
        this.renderGrid();
        this.isPreloaded = true;
    }

    async open() {
        const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
        const panel = document.getElementById('dataManagerPanel');
        
        panel.classList.add('active');
        
        // 书库面板打开时重新应用安全区域
        if (window.SafeArea) {
            window.SafeArea.apply();
        }
        
        try {
            if (isSQLite) {
                // SQLite 模式：先显示加载状态，再获取数据
                this.showLoadingState();
                
                // 获取数据（优先缓存，自动处理后台刷新）
                const stats = await Lumina.DB.adapter.getStorageStats();
                
                this.currentStats = stats;
                this.renderStats();
                this.renderGrid();
                
                // 如果数据来自缓存（可能过期），在顶部显示弱提示
                if (stats._stale) {
                    Lumina.UI.showToast('当前为离线数据，后台同步中...', 2000);
                }
            } else {
                // IndexedDB 模式：直接加载（很快）
                await this.refreshStats();
            }
        } catch (error) {
            this.showErrorState(error.message || '加载失败', () => this.open());
        }
    }

    // 新增：静默更新（不闪屏）
    updateGridSilently(newStats) {
        if (!this.currentStats) {
            this.currentStats = newStats;
            this.renderGrid();
            return;
        }
        
        // 比较文件数量变化
        const oldIds = new Set(this.currentStats.files.map(f => f.fileKey));
        const newIds = new Set(newStats.files.map(f => f.fileKey));
        
        // 如果有增删，完全重绘
        if (oldIds.size !== newIds.size || 
            ![...oldIds].every(id => newIds.has(id))) {
            this.currentStats = newStats;
            this.renderGrid();
            Lumina.UI.showToast('书库已更新', 1500);
        } else {
            // 只更新时间和统计（不闪屏）
            this.currentStats = newStats;
            this.renderStats();
        }
    }

    showLoadingState() {
        const grid = document.getElementById('dataGrid');
        const t = Lumina.I18n.t;
        
        // 如果有缓存，显示半透明遮罩 + 小 loading
        if (Lumina.DB.adapter.listCache) {
            grid.style.opacity = '0.6';
            grid.style.pointerEvents = 'none';
            grid.insertAdjacentHTML('afterbegin', 
                `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10;">
                    <div class="loading-spinner" style="width:32px;height:32px;border-width:3px;"></div>
                </div>`
            );
        } else {
            // 没有缓存，显示骨架屏
            grid.innerHTML = Array(4).fill(`
                <div class="lib-card-skel" style="background:var(--bg-secondary);border-radius:12px;overflow:hidden;">
                    <div class="skeleton-bg" style="aspect-ratio:176/250;width:100%;"></div>
                    <div style="padding:12px;">
                        <div class="skeleton-bg" style="height:14px;width:80%;margin-bottom:8px;border-radius:3px;"></div>
                        <div class="skeleton-bg" style="height:12px;width:50%;border-radius:3px;"></div>
                    </div>
                </div>
            `).join('');
        }
    }

    showErrorState(message, retryCallback) {
        const grid = document.getElementById('dataGrid');
        const t = Lumina.I18n.t;
        
        grid.innerHTML = `
            <div class="history-empty" style="grid-column:1/-1;padding:60px;">
                <svg class="icon" style="width:48px;height:48px;color:var(--warnning);"><use href="#icon-error"/></svg>
                <div style="margin:16px 0;color:var(--text-secondary);">${message}</div>
                <button class="option-btn" onclick="(${retryCallback})()" style="margin-top:8px;">
                    ${t('retry') || '重试'}
                </button>
            </div>
        `;
    }

    close() {
        document.getElementById('dataManagerPanel').classList.remove('active');
    }

    toggle() {
        document.getElementById('dataManagerPanel').classList.contains('active') ? this.close() : this.open();
    }

    async refreshStats() {
        this.currentStats = await Lumina.DB.adapter.getStorageStats();
        this.renderStats();
        this.renderGrid();
        this.updateSettingsBar();
    }

    renderStats() {
        const { totalFiles, totalSize, imageCount } = this.currentStats;
        document.getElementById('totalFilesCount').textContent = totalFiles;
        document.getElementById('totalStorageSize').textContent = totalSize + 'MB';
        document.getElementById('totalImagesCount').textContent = imageCount;
    }

    updateSettingsBar() {
        const { totalFiles, maxFiles } = this.currentStats;
        const countEl = document.getElementById('settingsStorageCount');
        const barEl = document.getElementById('settingsStorageBar');
        if (countEl) countEl.textContent = totalFiles;
        if (barEl) barEl.style.width = Math.min((totalFiles / maxFiles) * 100, 100) + '%';
    }

    renderGrid() {
        const grid = document.getElementById('dataGrid');
        const { files } = this.currentStats;

        if (!files.length) {
            grid.innerHTML = `<div class="history-empty" style="grid-column: 1/-1; padding: 60px;"><svg class="icon"><use href="#icon-folder"/></svg><div>${Lumina.I18n.t('noDataToManage')}</div></div>`;
            return;
        }

        grid.innerHTML = files.map(file => {
            const hasCover = !!file.cover;
            const timeAgo = Lumina.Utils.formatTimeAgo(file.lastReadTime);
            const sizeStr = file.estimatedSize ? parseFloat(file.estimatedSize).toFixed(1) + 'MB' : '--';

            return `
        <div class="data-card" data-filekey="${Lumina.Utils.escapeHtml(file.fileKey)}">
        <div class="card-cover">
            ${hasCover ? `<img src="${file.cover}" class="cover-img" alt="" onerror="this.style.display='none';this.parentNode.innerHTML='<div class=\\'cover-placeholder\\'><svg><use href=\\'#icon-book\\'/></svg></div>';">` : `<div class="cover-placeholder"><svg><use href="#icon-book"/></svg></div>`}
            <div class="cover-overlay">
            <button class="cover-btn export-btn" data-tooltip-text="${Lumina.I18n.t('exportFile')}"><svg class="icon"><use href="#icon-export"/></svg></button>
            <button class="cover-btn delete-btn" data-tooltip-text="${Lumina.I18n.t('deleteFile')}"><svg class="icon"><use href="#icon-delete"/></svg></button>
            </div>
        </div>
        <div class="card-info">
            <div class="card-title" title="${Lumina.Utils.escapeHtml(file.fileName)}">${Lumina.Utils.escapeHtml(file.fileName)}</div>
            <div class="card-meta">${sizeStr} · ${timeAgo}</div>
            ${file.chapterTitle ? `<div class="card-chapter">${Lumina.Utils.escapeHtml(file.chapterTitle)}</div>` : ''}
        </div>
        </div>
    `;
        }).join('');
        Lumina.UI.setupCustomTooltip();
    }

    async openFile(fileKey) {
        console.log('[openFile] 正在打开:', fileKey);  // 添加这行确认执行
        
        const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
        
        if (isSQLite) {
            Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = 
                Lumina.I18n.t('loadingFile');
            Lumina.DOM.loadingScreen.classList.add('active');
        }
        
        try {
            let fileData;
            
            if (isSQLite) {
                // 必须是 getFileSmart，不是 getFile！
                console.log('[openFile] 调用 getFileSmart...');  // 添加这行
                fileData = await Lumina.DB.adapter.getFileSmart(fileKey);
            } else {
                fileData = await Lumina.DB.adapter.getFile(fileKey);
            }
            
            if (fileData) {
                await Lumina.DB.restoreFileFromDB(fileData);
                this.close();
            } else {
                Lumina.UI.showDialog(Lumina.I18n.t('fileDataLost'));
            }
        } catch (err) {
            console.error('Open file error:', err);
            Lumina.UI.showDialog(Lumina.I18n.t('fileDataLost'));
        } finally {
            if (isSQLite) {
                Lumina.DOM.loadingScreen.classList.remove('active');
                Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = 
                    Lumina.I18n.t('loading');
            }
        }
    }

    async confirmClearLibrary() {
        const files = await Lumina.DB.adapter.getAllFiles();
        if (!files || files.length === 0) {
            Lumina.UI.showToast(Lumina.I18n.t('libraryEmpty'));
            return;
        }
        
        Lumina.UI.showDialog(Lumina.I18n.t('confirmClearLibrary'), 'confirm', async (confirmed) => {
            if (!confirmed) return;
            
            const btn = document.getElementById('clearLibraryBtn');
            btn.classList.add('loading');
            
            try {
                // 清空所有文件
                for (const file of files) {
                    await Lumina.DB.adapter.deleteFile(file.fileKey);
                }
                
                // 如果当前打开的文件在书库中，标记为不自动保存
                Lumina.State.app.currentFile.skipSave = true;
                
                // 刷新显示
                await this.refreshStats();
                this.renderGrid();
                
                // 刷新历史记录面板
                await Lumina.DB.loadHistoryFromDB();
                
                Lumina.UI.showToast(Lumina.I18n.t('libraryCleared'));
            } catch (err) {
                console.error('Clear library error:', err);
                Lumina.UI.showToast(Lumina.I18n.t('clearFailed'));
            } finally {
                btn.classList.remove('loading');
            }
        });
    }

    async confirmDelete(fileKey, cardElement) {
        Lumina.UI.showDialog(Lumina.I18n.t('confirmDeleteFile'), 'confirm', async (confirmed) => {
            if (confirmed) {
                cardElement.style.transform = 'scale(0.9)';
                cardElement.style.opacity = '0';
                
                const isCurrentFile = fileKey === Lumina.State.app.currentFile.fileKey;
                
                setTimeout(async () => {
                    try {
                        await Lumina.DB.adapter.deleteFile(fileKey);
                        
                        // 立即刷新数据（不等待缓存过期）
                        await this.refreshStats();
                        await Lumina.DB.loadHistoryFromDB();
                        
                        Lumina.UI.showToast(Lumina.I18n.t('fileDeleted'));
                        
                        if (isCurrentFile) {
                            Lumina.Actions.returnToWelcome();
                        }
                    } catch (err) {
                        Lumina.UI.showToast('删除失败，请重试');
                        console.error(err);
                    }
                }, 300);
            }
        });
    }

    async exportSingle(fileKey) {
        const data = await Lumina.DB.adapter.exportFile(fileKey);
        if (data) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Lumina_${data.fileName.replace(/\.[^/.]+$/, '')}_${new Date().getTime()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            Lumina.UI.showToast(Lumina.I18n.t('exportSuccess'));
        }
    }

    async batchExport() {
        const btn = document.getElementById('batchExportBtn');
        btn.classList.add('loading');
        try {
            const batchData = await Lumina.DB.adapter.exportBatch();
            if (!batchData) {
                Lumina.UI.showToast(Lumina.I18n.t('libraryEmpty'));
                return;
            }
            
            const jsonContent = JSON.stringify(batchData, null, 2);
            const fileName = `Lumina_Library_Backup_${new Date().getTime()}.json`;
            
            // 5. 导入导出目录统一：App 环境下使用 Filesystem 插件保存到 Documents/LuminaReader/
            const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
            if (isApp && Capacitor.Plugins?.Filesystem) {
                const { Filesystem } = Capacitor.Plugins;
                try {
                    // 确保目录存在
                    try {
                        await Filesystem.mkdir({
                            path: 'LuminaReader',
                            directory: 'DOCUMENTS',
                            recursive: true
                        });
                        console.log('[Export] 目录创建成功');
                    } catch (e) {
                        console.log('[Export] 目录已存在或创建失败:', e);
                    }
                    
                    // 写入文件
                    const writeResult = await Filesystem.writeFile({
                        path: `LuminaReader/${fileName}`,
                        data: jsonContent,
                        directory: 'DOCUMENTS',
                        encoding: 'utf8'
                    });
                    
                    Lumina.UI.showToast(Lumina.I18n.t('batchExportSuccess', batchData.totalBooks));
                } catch (err) {
                    console.error('[Export] Filesystem error:', err);
                    Lumina.UI.showToast('导出失败: ' + (err.message || '无法写入文件'));
                }
            } else {
                // 浏览器环境：使用下载
                console.log('[Export] 非App环境，使用浏览器下载');
                this.downloadJSON(jsonContent, fileName);
                Lumina.UI.showToast(Lumina.I18n.t('batchExportSuccess', batchData.totalBooks));
            }
        } catch (err) {
            console.error('[Export] Error:', err);
            Lumina.UI.showToast(Lumina.I18n.t('batchExportFailed'));
        } finally {
            btn.classList.remove('loading');
        }
    }
    
    // 辅助方法：浏览器下载 JSON
    downloadJSON(content, fileName) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async batchImport() {
        const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
        
        if (isApp) {
            // App 环境：直接使用系统文件选择器
            // 提示用户去默认目录找文件（Android 文件选择器无法控制默认目录）
            this.showSystemFilePickerWithHint();
        } else {
            // 浏览器环境：使用系统文件选择
            this.showSystemFilePicker();
        }
    }
    
    // 显示带提示的文件选择器
    showSystemFilePickerWithHint() {
        // 直接打开系统文件选择器，不显示额外提示
        this.showSystemFilePicker();
    }
    
    // 辅助方法：系统文件选择
    showSystemFilePicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            Lumina.UI.showToast(Lumina.I18n.t('readingFile'), 0);
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (data.exportType === 'batch' && Array.isArray(data.books))
                    await this.handleBatchImport(data.books);
                else if (data.fileName && Array.isArray(data.content))
                    await this.importJSONFile(file);
                else
                    throw new Error('Invalid format');
            } catch (err) {
                Lumina.UI.showDialog(Lumina.I18n.t('importFailed') + ': ' + (err.message || 'Unknown error'));
            }
        };
        input.click();
    }
    
    // 辅助方法：从解析后的数据导入（用于 Filesystem 读取）
    async importJSONFileFromData(data) {
        try {
            if (!this.validateHistoryData(data)) {
                Lumina.UI.showDialog(Lumina.I18n.t('invalidHistoryFile'));
                return false;
            }
            await Lumina.DB.adapter.restoreFileFromDB(data);
            Lumina.DOM.historyPanel?.classList.remove('open');
            Lumina.UI.showToast(Lumina.I18n.t('importSuccess'));
            return true;
        } catch (err) {
            console.error('[Import] Error:', err);
            Lumina.UI.showDialog(Lumina.I18n.t('importFailed'));
            return false;
        }
    }

    async handleBatchImport(books) {
        if (!books.length) {
            Lumina.UI.showToast(Lumina.I18n.t('noBooksInFile'));
            return;
        }
        Lumina.UI.showDialog(Lumina.I18n.t('confirmBatchImport', books.length), 'confirm', async (confirmed) => {
            if (!confirmed) return;
            const progressToast = document.createElement('div');
            progressToast.className = 'toast-progress';
            progressToast.innerHTML = `<span class="progress-text">${Lumina.I18n.t('importing')} 0/${books.length}</span><div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div>`;
            document.body.appendChild(progressToast);

            const results = await Lumina.DB.adapter.importBatch(books, (current, total, success) => {
                const percent = (current / total) * 100;
                progressToast.querySelector('.progress-text').textContent = `${Lumina.I18n.t('importing')} ${current}/${total} (${success} ${Lumina.I18n.t('success')})`;
                progressToast.querySelector('.progress-fill').style.width = `${percent}%`;
            });

            progressToast.remove();
            await this.refreshStats();
            await Lumina.DB.loadHistoryFromDB();
            this.updateSettingsBar();

            if (results.failed === 0)
                Lumina.UI.showToast(Lumina.I18n.t('batchImportSuccess', results.success));
            else
                Lumina.UI.showDialog(Lumina.I18n.t('batchImportPartial', results.success, results.failed) + '\n\n' + results.errors.slice(0, 3).map(e => `• ${e.book}: ${e.error}`).join('\n'), 'alert');
        });
    }

    async importJSONFile(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!this.validateHistoryData(data)) {
                Lumina.UI.showDialog(Lumina.I18n.t('invalidHistoryFile'));
                return false;
            }
            const newKey = `${data.fileName}_${Date.now()}`;
            await Lumina.DB.adapter.saveFile(newKey, {
                fileName: data.fileName,
                fileType: data.fileType || 'txt',
                fileSize: 0,
                content: data.content,
                wordCount: data.wordCount || 0,
                cover: data.cover || null,
                customRegex: data.customRegex || { chapter: '', section: '' },
                lastReadTime: new Date().toISOString()
            });
            await this.refreshStats();
            await Lumina.DB.loadHistoryFromDB();
            this.updateSettingsBar();
            Lumina.UI.showToast(Lumina.I18n.t('importSuccess'));
            return true;
        } catch (err) {
            Lumina.UI.showDialog(Lumina.I18n.t('importFailed') + ': ' + (err.message || 'Unknown error'));
            return false;
        }
    }

    validateHistoryData(data) {
        return data && typeof data === 'object' && data.fileName && Array.isArray(data.content) && data.version && data.exportDate;
    }
};

// ==================== 14. 历史记录管理 ====================

/**
 * 压缩图片数据 URL
 * @param {string} dataUrl - 原始图片数据 URL
 * @param {number} maxWidth - 最大宽度
 * @param {number} quality - JPEG 质量 (0-1)
 * @returns {Promise<string>} - 压缩后的数据 URL
 */
Lumina.Utils.compressImage = async (dataUrl, maxWidth = 1200, quality = 0.7) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            // 如果图片本身就不大，直接返回原图
            if (img.width <= maxWidth && dataUrl.length < 50000) {
                resolve(dataUrl);
                return;
            }
            
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // 按比例缩放
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // 转换为 JPEG（通常比 PNG 小很多）
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = dataUrl;
    });
};

/**
 * 估算内容大小（字节）
 */
Lumina.Utils.estimateContentSize = (items) => {
    let size = 0;
    for (const item of items) {
        if (item.type === 'image' && item.data) {
            size += item.data.length;
        } else if (item.text) {
            size += item.text.length * 2; // UTF-16
        }
    }
    return size;
};

Lumina.DB.HistoryDataBuilder = {
    // 添加 includeContent 参数，默认 true（首次保存），false（仅进度）
    // saveMode: 'full' | 'text-only' | 'no-save' - 保存模式
    async build(fileKey, overrides = {}, includeContent = true, saveMode = 'full') {
        const state = Lumina.State.app;
        const currentChapter = state.chapters[state.currentChapterIndex];
        
        let processedContent = null;
        
        // 关键：includeContent 为 false 时不带 content 数组
        if (includeContent && saveMode !== 'no-save') {
            processedContent = [];
            let imageCount = 0;
            const MAX_IMAGES = saveMode === 'text-only' ? 0 : 50; // 全量保存最多50张，文本模式不保存图片
            
            for (const item of state.document.items) {
                const processedItem = {
                    type: item.type,
                    text: item.text,
                    ...(item.display !== undefined && { display: item.display }),
                    ...(item.level !== undefined && { level: item.level }),
                    ...(item.alt !== undefined && { alt: item.alt })
                };
                
                // 处理图片
                if (item.type === 'image' && item.data) {
                    imageCount++;
                    
                    // 根据保存模式处理图片
                    if (saveMode === 'text-only' || imageCount > MAX_IMAGES) {
                        // 文本模式或超过数量限制，跳过图片
                        continue;
                    } else {
                        // 全量模式：不压缩，原样保存
                        processedItem.data = item.data;
                    }
                }
                
                processedContent.push(processedItem);
            }
        }
        
        const baseData = {
            fileName: state.currentFile.name, 
            fileType: state.currentFile.type,
            fileSize: state.currentFile.handle?.size || 0,
            ...(includeContent && { content: processedContent }),
            wordCount: state.currentFile.wordCount,
            lastChapter: state.currentChapterIndex,
            lastScrollIndex: Lumina.Renderer.getCurrentVisibleIndex(),
            chapterTitle: currentChapter ? (currentChapter.isPreface ? Lumina.I18n.t('preface') : currentChapter.title) : '',
            lastReadTime: new Date().toISOString(),
            customRegex: { chapter: Lumina.State.settings.chapterRegex, section: Lumina.State.settings.sectionRegex },
            chapterNumbering: Lumina.State.settings.chapterNumbering,
            annotations: [],
            cover: overrides.cover || null,
            heatMap: state.currentFile.heatMap // 保存热力图数据（未设置时为 undefined，便于合并逻辑判断）
        };
        return { ...baseData, ...overrides };
    }
};

/**
 * 检查文件大小并提示用户选择保存模式
 * @param {number} sizeBytes - 文件大小（字节）
 * @returns {Promise<string>} - 'full' | 'text-only' | 'no-save'
 */
Lumina.DB.promptForSaveMode = async (sizeBytes) => {
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);
    const t = Lumina.I18n.t;
    
    return new Promise((resolve) => {
        const message = `${t('fileTooLarge') || '文件较大'} (${sizeMB} MB)\n\n${t('fileTooLargeMessage') || '该文件包含大量图片，建议选择保存方式：'}`;
        
        Lumina.UI.showDialog(message, 'confirm', (result) => {
            if (result === null || result === false) {
                resolve('no-save'); // 取消 = 不保存到书库
            } else {
                resolve('text-only'); // 确定 = 仅保存文本
            }
        }, {
            title: t('largeFileTitle') || '大文件提示',
            confirmText: t('saveTextOnly') || '仅保存文本',
            cancelText: t('doNotSave') || '不保存到书库'
        });
    });
};

Lumina.DB.saveHistory = async (fileName, fileType, wordCount = 0, cover = null, isFullSave = true, saveMode = 'full') => {
    const fileKey = Lumina.State.app.currentFile.fileKey || 
                    Lumina.DB.adapter.generateFileKey({ name: fileName, size: 0, lastModified: Date.now() });
    Lumina.State.app.currentFile.fileKey = fileKey;

    // 增量保存：先读取现有数据，只更新部分字段
    if (!isFullSave && Lumina.State.app.dbReady) {
        try {
            const existing = await Lumina.DB.adapter.getFile(fileKey);
            if (existing) {
                const currentChapter = Lumina.State.app.chapters[Lumina.State.app.currentChapterIndex];
                const heatMapValue = Lumina.State.app.currentFile.heatMap !== undefined 
                    ? Lumina.State.app.currentFile.heatMap 
                    : (existing.heatMap || null);
                const patchData = {
                    ...existing,
                    lastChapter: Lumina.State.app.currentChapterIndex,
                    lastScrollIndex: Lumina.Renderer.getCurrentVisibleIndex(),
                    chapterTitle: currentChapter ? (currentChapter.isPreface ? Lumina.I18n.t('preface') : currentChapter.title) : '',
                    lastReadTime: new Date().toISOString(),
                    chapterNumbering: Lumina.State.settings.chapterNumbering,
                    customRegex: { 
                        chapter: Lumina.State.settings.chapterRegex, 
                        section: Lumina.State.settings.sectionRegex 
                    },
                    heatMap: heatMapValue
                };
                await Lumina.DB.adapter.saveFile(fileKey, patchData);
                await Lumina.DB.loadHistoryFromDB();
                return { saved: true, mode: 'patch' };
            }
        } catch (e) {
            console.warn('Progress update failed, fallback to full save', e);
        }
    }

    // 全量保存（首次打开、重新解析）
    let finalCover = cover;
    let existingHeatMap = null;
    if (Lumina.State.app.dbReady) {
        const existingData = await Lumina.DB.adapter.getFile(fileKey);
        if (existingData) {
            if (finalCover === null && existingData.cover) finalCover = existingData.cover;
            // 保留现有的 heatMap，如果当前没有的话
            if (!Lumina.State.app.currentFile.heatMap && existingData.heatMap) {
                existingHeatMap = existingData.heatMap;
            }
        }
    }
    
    // 如果有现有的 heatMap 且当前没有，恢复它
    if (existingHeatMap) {
        Lumina.State.app.currentFile.heatMap = existingHeatMap;
    }

    const data = await Lumina.DB.HistoryDataBuilder.build(fileKey, { cover: finalCover }, true, saveMode);
    
    // 如果用户选择不保存，跳过数据库保存
    if (saveMode === 'no-save') {
        return { saved: false, mode: 'no-save' };
    }
    
    await Lumina.DB.adapter.saveFile(fileKey, data);
    await Lumina.DB.loadHistoryFromDB();

    if (Lumina.State.app.dbReady) {
        if (window.dataManager && window.dataManager.refreshStats) {
            await window.dataManager.refreshStats();
        }
    }
    
    return { saved: true, mode: saveMode };
};

Lumina.DB._autoSaveEnabled = true;
Lumina.DB._saveQueue = [];
Lumina.DB._saveTimer = null;

Lumina.DB.updateHistoryProgress = () => {
    // 如果自动保存被禁用（正在打开大文件），直接返回
    if (!Lumina.DB._autoSaveEnabled) return;

    const state = Lumina.State.app;
    if (!state.currentFile.name || !state.document.items.length) return;
    
    // 如果用户选择不保存到书库，跳过自动保存
    if (state.currentFile.skipSave) return;

    clearTimeout(Lumina.DB._historyUpdateTimer);
    Lumina.DB._historyUpdateTimer = setTimeout(async () => {
        if (state.dbReady && state.currentFile.fileKey) {
            try {
                // 关键改动：false = 只更新进度，不存 content
                await Lumina.DB.saveHistory(
                    state.currentFile.name, 
                    state.currentFile.type, 
                    state.currentFile.wordCount, 
                    null, 
                    false  // isFullSave = false
                );
            } catch (err) { 
                console.warn('Progress save failed:', err);
            }
        }
    }, 1000); // 防抖 1 秒
};

Lumina.DB.loadHistoryFromDB = async () => {
    const t = Lumina.I18n.t;
    const list = Lumina.DOM.historyList;
    const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
    
    // SQLite 模式：先显示骨架屏（4条占位）
    if (isSQLite && !list.querySelector('.history-item')) {
        list.innerHTML = Array(4).fill(`
            <div class="hist-skeleton">
                <div class="skeleton-bg hist-icon-skel"></div>
                <div style="flex:1">
                    <div class="skeleton-bg hist-line-skel"></div>
                    <div class="skeleton-bg hist-line-skel short"></div>
                </div>
            </div>
        `).join('');
        await new Promise(r => setTimeout(r, 50));
    }
    
    try {
        const files = await Lumina.DB.adapter.getAllFiles();
        Lumina.Renderer.renderHistoryFromDB(files);
    } catch (err) {
        list.innerHTML = `<div class="history-empty"><div>${t('loadFailed')}</div></div>`;
    }
};

// ==================== 历史记录操作 ====================
Lumina.HistoryActions = {
    // 打开文件
    async openFile(fileKey) {
        const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
        
        if (isSQLite) {
            Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = Lumina.I18n.t('loadingFile');
        }
        
        try {
            let fileData;
            
            if (isSQLite) {
                console.log('[History] 调用 getFileSmart 打开:', fileKey);
                fileData = await Lumina.DB.adapter.getFileSmart(fileKey);
            } else {
                fileData = await Lumina.DB.adapter.getFile(fileKey);
            }
            
            if (fileData) {
                await Lumina.DB.restoreFileFromDB(fileData);
                Lumina.DOM.historyPanel.classList.remove('open');
            } else {
                Lumina.UI.showDialog(Lumina.I18n.t('fileDataLost'));
            }
        } catch (err) {
            console.error('Open file error:', err);
            Lumina.UI.showDialog(Lumina.I18n.t('fileDataLost'));
        } finally {
            if (isSQLite) {
                Lumina.DOM.loadingScreen.classList.remove('active');
                Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = Lumina.I18n.t('loading');
            }
        }
    },
    
    // 导出文件
    async exportFile(fileKey) {
        try {
            const fileData = await Lumina.DB.adapter.getFile(fileKey);
            if (!fileData) {
                Lumina.UI.showToast(Lumina.I18n.t('fileDataLost'));
                return;
            }
            
            const exportData = {
                version: '1.0',
                exportTime: new Date().toISOString(),
                file: fileData
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileData.fileName}.lumina.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            Lumina.UI.showToast(Lumina.I18n.t('exportSuccess'));
        } catch (err) {
            console.error('Export file error:', err);
            Lumina.UI.showToast(Lumina.I18n.t('exportFailed'));
        }
    },
    
    // 删除文件（已确认）
    async deleteFile(fileKey, itemElement) {
        // 先执行删除动画
        if (itemElement) {
            itemElement.style.transform = 'translateX(-100%)';
            itemElement.style.opacity = '0';
            await new Promise(r => setTimeout(r, 200));
        }
        
        try {
            const isCurrentFile = fileKey === Lumina.State.app.currentFile.fileKey;
            
            await Lumina.DB.adapter.deleteFile(fileKey);
            
            if (isCurrentFile) {
                Lumina.State.app.currentFile.skipSave = true;
                // 跳转到欢迎页面（与书库删除逻辑保持一致）
                Lumina.Actions.returnToWelcome();
            }
            
            // 刷新历史记录列表（重新渲染）
            await Lumina.DB.loadHistoryFromDB();
            
            // 更新数据管理器统计
            if (Lumina.DataManager) {
                Lumina.DataManager.currentStats = await Lumina.DB.adapter.getStorageStats();
                Lumina.DataManager.updateSettingsBar();
            }
            
            Lumina.UI.showToast(Lumina.I18n.t('fileDeleted'));
        } catch (err) {
                console.error('Delete file error:', err);
                Lumina.UI.showToast(Lumina.I18n.t('deleteFailed'));
                // 删除失败，复位动画
                if (itemElement) {
                    itemElement.style.transform = '';
                    itemElement.style.opacity = '';
                    const content = itemElement.querySelector('.history-item-content');
                    if (content) content.style.transform = '';
                    itemElement.classList.remove('swiped-left', 'swiped-right');
                }
            }
    },
    
    // 绑定滑动手势（移动端）
    bindSwipe(item, container, content, fileKey) {
        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let isDragging = false;
        let startTime = 0;
        
        const SWIPE_THRESHOLD = 80; // 滑动触发阈值
        const MAX_SWIPE = 120; // 最大滑动距离
        
        const handleTouchStart = (e) => {
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            startTime = Date.now();
            isDragging = true;
            content.style.transition = 'none';
        };
        
        const handleTouchMove = (e) => {
            if (!isDragging) return;
            
            const touch = e.touches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;
            
            // 垂直滑动为主时，不处理水平滑动
            if (Math.abs(deltaY) > Math.abs(deltaX)) return;
            
            e.preventDefault();
            
            currentX = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, deltaX));
            content.style.transform = `translateX(${currentX}px)`;
            
            // 显示操作提示
            if (currentX > 30) {
                item.classList.add('showing-export');
                item.classList.remove('showing-delete');
            } else if (currentX < -30) {
                item.classList.add('showing-delete');
                item.classList.remove('showing-export');
            } else {
                item.classList.remove('showing-export', 'showing-delete');
            }
        };
        
        const handleTouchEnd = (e) => {
            if (!isDragging) return;
            isDragging = false;
            
            content.style.transition = 'transform 0.2s ease';
            
            const deltaTime = Date.now() - startTime;
            const velocity = currentX / deltaTime;
            
            // 快速滑动或超过阈值触发
            if (currentX > SWIPE_THRESHOLD || (currentX > 40 && velocity > 0.3)) {
                // 右滑 - 导出
                content.style.transform = `translateX(${SWIPE_THRESHOLD}px)`;
                item.classList.add('swiped-right');
                item.classList.remove('swiped-left', 'showing-export', 'showing-delete');
                
                // 自动执行导出
                setTimeout(() => {
                    this.exportFile(fileKey);
                    // 复位
                    setTimeout(() => {
                        content.style.transform = '';
                        item.classList.remove('swiped-right');
                    }, 300);
                }, 200);
            } else if (currentX < -SWIPE_THRESHOLD || (currentX < -40 && velocity < -0.3)) {
                // 左滑 - 删除
                content.style.transform = `translateX(-${SWIPE_THRESHOLD}px)`;
                item.classList.add('swiped-left');
                item.classList.remove('swiped-right', 'showing-export', 'showing-delete');
                
                // 标记正在显示对话框，防止外部点击复位
                item._showingDialog = true;
                
                // 显示确认对话框
                setTimeout(() => {
                    Lumina.UI.showDialog(Lumina.I18n.t('confirmDeleteFile'), 'confirm', (confirmed) => {
                        item._showingDialog = false;
                        if (confirmed) {
                            Lumina.HistoryActions.deleteFile(fileKey, item);
                        } else {
                            // 取消，复位滑动状态
                            content.style.transform = '';
                            item.classList.remove('swiped-left');
                        }
                    });
                }, 100);
            } else {
                // 复位
                content.style.transform = '';
                item.classList.remove('swiped-left', 'swiped-right', 'showing-export', 'showing-delete');
            }
            
            currentX = 0;
        };
        
        // 触摸事件
        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);
        
        // 点击外部复位
        document.addEventListener('click', (e) => {
            // 如果正在显示对话框，不复位
            if (item._showingDialog) return;
            // 如果点击的是对话框区域，不复位
            if (e.target.closest('.custom-dialog') || e.target.closest('#customDialog')) return;
            
            if (!item.contains(e.target) && (item.classList.contains('swiped-left') || item.classList.contains('swiped-right'))) {
                content.style.transform = '';
                item.classList.remove('swiped-left', 'swiped-right');
            }
        });
    }
};

Lumina.Renderer.renderHistoryFromDB = (files) => {
    if (!files || !files.length) {
        Lumina.DOM.historyList.innerHTML = `<div class="history-empty"><svg><use href="#icon-clock"/></svg><div>${Lumina.I18n.t('noHistory')}</div></div>`;
        return;
    }

    const sortedFiles = files.sort((a, b) => new Date(b.lastReadTime || 0).getTime() - new Date(a.lastReadTime || 0).getTime());

    const fileIcons = {
        docx: { letter: 'W', color: '#4472C4' }, txt: { letter: 'T', color: '#6B7280' },
        md: { letter: 'M', color: '#8B5CF6' }, html: { letter: 'H', color: '#E34C26' },
        epub: { letter: 'E', color: '#10B981' }, json: { letter: 'J', color: '#F59E0B' },
        pdf: { letter: 'P', color: '#DC2626' }
    };

    const getFileIcon = (type) => {
        const { letter = '?', color = '#999' } = fileIcons[type] || {};
        return `<svg viewBox="0 0 20.83 25.92" style="color:${color}"><path fill="currentColor" d="M3 2h12l6 6v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path fill="rgba(255,255,255,0.5)" d="M15 2v6h6"/><text x="11" y="14" font-family="Arial" font-size="10" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${letter}</text></svg>`;
    };

    Lumina.DOM.historyList.innerHTML = sortedFiles.map((item, index) => {
        const timeAgo = Lumina.Utils.formatTimeAgo(item.lastReadTime);
        const readTimeStr = Lumina.Utils.formatReadTime(Math.ceil(item.wordCount / (Lumina.State.settings.language === 'zh' ? 300 : 200)));

        return `
            <div class="history-item" data-filekey="${item.fileKey}" data-index="${index}">
                <div class="history-item-swipe-container">
                    <div class="history-item-actions history-actions-left" data-action="export">
                        <svg class="icon"><use href="#icon-export"/></svg>
                        <span>${Lumina.I18n.t('exportFile')}</span>
                    </div>
                    <div class="history-item-content">
                        <div class="history-icon">${getFileIcon(item.fileType)}</div>
                        <div class="history-main">
                            <div class="history-header-row">
                                <div class="history-name">${Lumina.Utils.escapeHtml(item.fileName)}</div>
                                <div class="history-time">${timeAgo}</div>
                            </div>
                            <div class="history-meta-row">
                                <div class="history-meta-item"><svg class="icon"><use href="#icon-word-count"/></svg><span>${Lumina.Utils.formatWordCount(item.wordCount)} ${Lumina.I18n.t('words')}</span></div>
                                ${readTimeStr ? `<div class="history-meta-item"><svg class="icon"><use href="#icon-clock"/></svg><span>${readTimeStr}</span></div>` : ''}
                            </div>
                            ${item.chapterTitle ? `<div class="history-progress"><svg class="icon"><use href="#icon-chapter"/></svg><span>${Lumina.Utils.escapeHtml(item.chapterTitle)}</span></div>` : ''}
                        </div>
                        <div class="history-hover-actions">
                            <button class="history-action-btn history-action-export" data-tooltip-text="${Lumina.I18n.t('exportFile')}">
                                <svg class="icon" style="width:20px;height:20px;"><use href="#icon-export"/></svg>
                            </button>
                            <button class="history-action-btn history-action-open" data-tooltip-text="${Lumina.I18n.t('openBook')}">
                                <svg class="icon" style="width:20px;height:20px;"><use href="#icon-check"/></svg>
                            </button>
                            <button class="history-action-btn history-action-delete" data-tooltip-text="${Lumina.I18n.t('deleteFile')}">
                                <svg class="icon" style="width:20px;height:20px;"><use href="#icon-delete"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="history-item-actions history-actions-right" data-action="delete">
                        <svg class="icon"><use href="#icon-delete"/></svg>
                        <span>${Lumina.I18n.t('deleteFile')}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // 绑定事件
    Lumina.DOM.historyList.querySelectorAll('.history-item').forEach(item => {
        const fileKey = item.dataset.filekey;
        const container = item.querySelector('.history-item-swipe-container');
        const content = item.querySelector('.history-item-content');
        
        // 点击打开（内容区域）
        content.addEventListener('click', async (e) => {
            // 如果点击的是悬浮按钮，不触发打开
            if (e.target.closest('.history-hover-actions') || e.target.closest('.history-action-btn')) return;
            
            // 如果处于滑动状态，不触发打开
            if (item.classList.contains('swiped-left') || item.classList.contains('swiped-right')) {
                // 复位滑动
                item.classList.remove('swiped-left', 'swiped-right');
                return;
            }
            
            await Lumina.HistoryActions.openFile(fileKey);
        });
        
        // 悬浮按钮事件（注意：按钮顺序是 导出-打开-删除）
        const exportBtn = item.querySelector('.history-action-export');
        const openBtn = item.querySelector('.history-action-open');
        const deleteBtn = item.querySelector('.history-action-delete');
        
        exportBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            Lumina.HistoryActions.exportFile(fileKey);
        });
        
        openBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            Lumina.HistoryActions.openFile(fileKey);
        });
        
        deleteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            Lumina.UI.showDialog(Lumina.I18n.t('confirmDeleteFile'), 'confirm', (confirmed) => {
                if (confirmed) {
                    Lumina.HistoryActions.deleteFile(fileKey, item);
                }
            });
        });
        
        // 滑动操作（移动端）
        Lumina.HistoryActions.bindSwipe(item, container, content, fileKey);
    });
};

Lumina.DB.restoreFileFromDB = async (fileData) => {
    const t = Lumina.I18n.t;
    const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
    
    try {
        if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) Lumina.TTS.manager.stop();

        const state = Lumina.State.app;
        state.currentFile.name = fileData.fileName;
        state.currentFile.type = fileData.fileType;
        state.currentFile.wordCount = fileData.wordCount;
        state.currentFile.fileKey = fileData.fileKey;
        state.currentFile.skipSave = false; // 从书库打开的文件允许自动保存

        state.document = { items: fileData.content, type: fileData.fileType };

        if (['txt', 'md', 'html'].includes(fileData.fileType)) {
            state.currentFile.rawContent = fileData.content.map(item => item.text || '').join('\n');
        }

        if (fileData.customRegex) {
            Lumina.State.settings.chapterRegex = fileData.customRegex.chapter || '';
            Lumina.State.settings.sectionRegex = fileData.customRegex.section || '';
            document.getElementById('chapterRegex').value = Lumina.State.settings.chapterRegex;
            document.getElementById('sectionRegex').value = Lumina.State.settings.sectionRegex;
            Lumina.Parser.RegexCache.updateCustomPatterns(Lumina.State.settings.chapterRegex, Lumina.State.settings.sectionRegex);
        }

        Lumina.State.settings.chapterNumbering = fileData.chapterNumbering || 'none';
        Lumina.UI.updateActiveButtons();
        
        // 恢复热力图数据
        if (fileData.heatMap) {
            state.currentFile.heatMap = fileData.heatMap;
        }

        if (Lumina.State.settings.chapterRegex || Lumina.State.settings.sectionRegex) await Lumina.Parser.reparseWithRegex();
        else {
            Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
            state.document.items.forEach(item => {
                if (item.type && item.type.startsWith('heading')) {
                    const level = parseInt(item.type.replace('heading', '')) || 1;
                    const newItem = Lumina.Parser.processHeading(level, item.text || '');
                    item.display = newItem.display;
                }
            });
        }

        state.chapters = Lumina.Parser.buildChapters(state.document.items);
        state.currentChapterIndex = fileData.lastChapter || 0;

        Lumina.Renderer.generateTOC();
        const savedScrollIndex = fileData.lastScrollIndex;
        Lumina.Renderer.renderCurrentChapter(savedScrollIndex);
        
        // 初始化 G点热力图
        Lumina.HeatMap.onBookOpen();

        Lumina.DOM.fileInfo.textContent = fileData.fileName;
        Lumina.DOM.welcomeScreen.style.display = 'none';

        const isMobileView = window.innerWidth <= 768;
        if (!isMobileView) {
            // 桌面端：显示目录
            Lumina.DOM.sidebarLeft.classList.add('visible');
            Lumina.DOM.readingArea.classList.add('with-sidebar');
            Lumina.State.settings.sidebarVisible = true;
        } else {
            // 移动端：隐藏目录
            Lumina.DOM.sidebarLeft.classList.remove('visible');
            Lumina.DOM.readingArea.classList.remove('with-sidebar');
            Lumina.State.settings.sidebarVisible = false;
        }

        if (savedScrollIndex !== undefined && savedScrollIndex !== null) {
            requestAnimationFrame(() => {
                const target = Lumina.DOM.contentWrapper.querySelector(`[data-index="${savedScrollIndex}"]`);
                if (target) {
                    target.classList.add('last-read-marker');
                    target.setAttribute('data-marker-text', t('lastReadHere') || '上次阅读位置');
                    const clearMarker = () => {
                        target.classList.add('interacted');
                        setTimeout(() => {
                            target.classList.remove('last-read-marker', 'interacted');
                            target.removeAttribute('data-marker-text');
                        }, 600);
                        document.removeEventListener('mousemove', clearMarker);
                        document.removeEventListener('click', clearMarker);
                        document.removeEventListener('keydown', clearMarker);
                        Lumina.DOM.contentScroll.removeEventListener('scroll', clearMarker);
                    };
                    requestAnimationFrame(() => {
                        document.addEventListener('mousemove', clearMarker, { once: true });
                        document.addEventListener('click', clearMarker, { once: true });
                        document.addEventListener('keydown', clearMarker, { once: true });
                        Lumina.DOM.contentScroll.addEventListener('scroll', clearMarker, { once: true });
                    });
                }
            });
        }

        // 关键修改：只有非 SQLite 才显示"已从书库快速恢复"和立即保存
        if (!isSQLite) {
            Lumina.UI.showToast(t('dbUsingCache'));
            // 仅在 IndexedDB 模式下立即保存（更新阅读时间）
            if (state.dbReady && fileData.fileKey) {
                try {
                    fileData.lastReadTime = new Date().toISOString();
                    await Lumina.DB.adapter.saveFile(fileData.fileKey, fileData);
                } catch (err) { }
            }
        }
        // SQLite 模式下不立即保存，避免用本地缓存覆盖服务器数据
        // 阅读进度会在滚动时通过 saveCurrentProgress 保存
        // 注释会在编辑时通过 saveAnnotations 保存

        await Lumina.DB.loadHistoryFromDB();
        Lumina.Search.clearResults();
        
        // 加载注释/书签
        Lumina.State.app.annotations = fileData.annotations || [];
        Lumina.Annotations.renderAnnotations();
        
    } catch (err) {
        throw err;
    }
};

Lumina.DB.clearHistory = async () => {
    const currentFileKey = Lumina.State.app.currentFile.fileKey;
    const shouldReturnToWelcome = Lumina.State.app.dbReady && currentFileKey;

    if (Lumina.State.app.dbReady) {
        const files = await Lumina.DB.adapter.getAllFiles();
        for (const f of files) await Lumina.DB.adapter.deleteFile(f.fileKey);
    }
    localStorage.removeItem('luminaHistory');
    Lumina.Renderer.renderHistoryFromDB([]);
    if (Lumina.DataManager) {
        Lumina.DataManager.currentStats = await Lumina.DB.adapter.getStorageStats();
        Lumina.DataManager.updateSettingsBar();
    }

    if (shouldReturnToWelcome) {
        Lumina.Actions.returnToWelcome();
    }
};

// ==================== 15. 设置与配置 ====================

Lumina.Settings = {
    load() {
        const saved = localStorage.getItem('luminaSettings');
        if (saved) Lumina.State.settings = { ...Lumina.Config.defaultSettings, ...JSON.parse(saved) };
        else Lumina.State.settings = { ...Lumina.Config.defaultSettings };
    },

    save() { localStorage.setItem('luminaSettings', JSON.stringify(Lumina.State.settings)); },

    async apply() {
        const settings = Lumina.State.settings;
        document.documentElement.lang = settings.language;
        document.documentElement.setAttribute('data-theme', settings.theme);
        
        // 设置状态栏颜色（APP 环境）
        // 深色主题列表
        const darkThemes = ['dark', 'amoled', 'midnight', 'nebula', 'espresso'];
        const isDarkTheme = darkThemes.includes(settings.theme);
        
        // 延迟设置状态栏，确保插件已加载
        setTimeout(() => {
            if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
                try {
                    const StatusBar = Capacitor.Plugins.StatusBar;
                    console.log('[StatusBar] 插件对象:', StatusBar);
                    if (StatusBar && StatusBar.setStyle) {
                        // Capacitor StatusBar: style.DARK = 深色图标(浅色背景), style.LIGHT = 浅色图标(深色背景)
                        // 浅色主题 -> 需要深色图标
                        // 深色主题 -> 需要浅色图标
                        const style = isDarkTheme ? 'DARK' : 'LIGHT';
                        StatusBar.setStyle({ style: style }).then(() => {
                            console.log('[StatusBar] 样式设置成功:', style);
                        }).catch(err => {
                            console.error('[StatusBar] 设置失败:', err);
                        });
                    } else {
                        console.warn('[StatusBar] 插件不可用');
                    }
                } catch (e) {
                    console.warn('[StatusBar] 异常:', e);
                }
            }
        }, 500);
        
        // 保存主题类型供状态栏背景使用
        window.__isDarkTheme = isDarkTheme;

        let savedScrollIndex = null;
        const wasReading = Lumina.State.app.document.items.length > 0 &&
            Lumina.DOM.contentWrapper.querySelector('.doc-line[data-index]');
        if (wasReading) savedScrollIndex = Lumina.Renderer.getCurrentVisibleIndex();

        const fontFamily = await Lumina.Font.load(settings.font);
        const config = Lumina.Config.fontConfig[settings.font];
        document.documentElement.style.setProperty('--font-family-dynamic', fontFamily || config.family);
        document.body.style.fontFamily = config.family;

        Lumina.DOM.contentWrapper.className = `content-wrapper font-${settings.font}`;
        document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);
        document.documentElement.style.setProperty('--line-height', (settings.lineHeight / 10).toString());
        document.documentElement.style.setProperty('--paragraph-spacing', `${settings.paragraphSpacing / 10}em`);

        const isMobileView = window.innerWidth <= 768;
        document.documentElement.style.setProperty('--content-max-width', isMobileView ? '100%' : `${settings.pageWidth}%`);
        document.documentElement.style.setProperty('--content-padding', isMobileView ? '16px' : `${settings.margin}px`);

        Lumina.DOM.contentScroll.classList.toggle('no-smooth', !settings.smoothScroll);

        document.querySelectorAll('[data-setting-toggle]').forEach(el => {
            const key = el.dataset.settingToggle;
            el.querySelector('.toggle-track').classList.toggle('active', settings[key]);
        });

        document.querySelectorAll('[data-setting-slider]').forEach(container => {
            const key = container.dataset.settingSlider;
            const slider = container.querySelector('.slider');
            const display = container.querySelector('.slider-value');
            const divider = parseInt(container.dataset.divider) || 1;
            const unit = container.dataset.unit || '';
            slider.min = container.dataset.min || 0;
            slider.max = container.dataset.max || 100;
            slider.value = settings[key];
            let displayValue = settings[key];
            if (divider !== 1) displayValue = (settings[key] / divider).toFixed(1);
            display.textContent = `${displayValue}${unit}`;
        });

        Lumina.UI.updateActiveButtons();
        document.getElementById('chapterRegex').value = settings.chapterRegex;
        document.getElementById('sectionRegex').value = settings.sectionRegex;

        const sidebarVisible = settings.sidebarVisible && Lumina.State.app.document.items.length;
        Lumina.DOM.sidebarLeft.classList.toggle('visible', sidebarVisible);
        Lumina.DOM.readingArea.classList.toggle('with-sidebar', sidebarVisible);

        if (Lumina.State.app.document.items.length) Lumina.Renderer.renderCurrentChapter(savedScrollIndex);
        Lumina.Renderer.updateChapterNavInfo();

        Lumina.Config.pagination.enabled = settings.paginationEnabled;
        Lumina.Config.pagination.maxReadingWords = parseInt(settings.paginationMaxWords) || 3000;
        Lumina.Config.pagination.imageEquivalentWords = parseInt(settings.paginationImageWords) || 300;
        
        if (Lumina.State.app.document.items.length) {
            Lumina.State.app.chapters.forEach(ch => ch.pageRanges = null);
            const currentIdx = Lumina.Renderer.getCurrentVisibleIndex();
            Lumina.Renderer.renderCurrentChapter(currentIdx);
        }
    },

    reset() {
        const oldFileName = Lumina.State.app.currentFile.name;
        const oldFileType = Lumina.State.app.currentFile.type;
        Lumina.State.settings = { ...Lumina.Config.defaultSettings };
        Lumina.Parser.RegexCache.updateCustomPatterns('', '');

        document.getElementById('chapterRegex').value = '';
        document.getElementById('sectionRegex').value = '';
        document.getElementById('chapterRegex').classList.remove('error', 'valid');
        document.getElementById('sectionRegex').classList.remove('error', 'valid');
        document.getElementById('chapterRegexFeedback').textContent = '';
        document.getElementById('chapterRegexFeedback').classList.remove('error', 'valid', 'info');
        document.getElementById('sectionRegexFeedback').textContent = '';
        document.getElementById('sectionRegexFeedback').classList.remove('error', 'valid', 'info');

        Lumina.Settings.save();
        Lumina.Settings.apply();
        Lumina.I18n.updateUI();
        if (oldFileName) {
            Lumina.State.app.currentFile.name = oldFileName;
            Lumina.State.app.currentFile.type = oldFileType;
            Lumina.DOM.fileInfo.textContent = oldFileName;
        }
    }
};

// ==================== 16. 字体加载器 ====================

Lumina.Font = {
    loaded: new Set(),
    loading: new Set(),
    failed: new Set(),

    async load(type) {
        const config = Lumina.Config.fontConfig[type];
        if (!config) return '';
        if (!config.url || this.loaded.has(type)) return config.family;

        if (this.loading.has(type)) {
            return new Promise(resolve => {
                const check = setInterval(() => {
                    if (this.loaded.has(type)) { clearInterval(check); resolve(config.family); }
                    else if (this.failed.has(type)) { clearInterval(check); resolve(config.fallback || config.family); }
                }, 100);
            });
        }

        this.loading.add(type);
        const indicator = document.getElementById('fontLoadingIndicator');
        if (indicator) {
            indicator.textContent = Lumina.I18n.t('fontLoading');
            indicator.classList.add('active');
        }

        if (!document.getElementById(`font-style-${type}`) && config.metrics) {
            const style = document.createElement('style');
            style.id = `font-style-${type}`;
            style.textContent = `@font-face { font-family: '${type}-fallback'; src: local('${config.fallback.split(',')[0].trim()}'); ${config.metrics.sizeAdjust ? `size-adjust: ${config.metrics.sizeAdjust};` : ''} ${config.metrics.ascentOverride ? `ascent-override: ${config.metrics.ascentOverride};` : ''} ${config.metrics.descentOverride ? `descent-override: ${config.metrics.descentOverride};` : ''} ${config.metrics.lineGapOverride ? `line-gap-override: ${config.metrics.lineGapOverride};` : ''} }`;
            document.head.appendChild(style);
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.loading.delete(type);
                this.failed.add(type);
                if (indicator) indicator.classList.remove('active');
                this.applyFallbackFont(type);
                resolve(config.fallback || config.family);
            }, 8000);

            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = config.url;
            link.crossOrigin = 'anonymous';

            link.onload = () => {
                clearTimeout(timeout);
                const fontName = config.family.split(',')[0].replace(/"/g, '').trim();
                document.fonts.load(`16px "${fontName}"`).then(() => {
                    this.loading.delete(type);
                    this.loaded.add(type);
                    if (indicator) indicator.classList.remove('active');
                    document.documentElement.classList.add(`font-${type}-loaded`);
                    resolve(config.family);
                }).catch(() => {
                    this.loading.delete(type);
                    this.failed.add(type);
                    this.applyFallbackFont(type);
                    if (indicator) indicator.classList.remove('active');
                    resolve(config.fallback || config.family);
                });
            };

            link.onerror = () => {
                clearTimeout(timeout);
                this.loading.delete(type);
                this.failed.add(type);
                this.applyFallbackFont(type);
                if (indicator) indicator.classList.remove('active');
                resolve(config.fallback || config.family);
            };

            document.head.appendChild(link);
        });
    },

    applyFallbackFont(type) {
        const config = Lumina.Config.fontConfig[type];
        if (!config) return;
        const fallbackStack = config.metrics ? `"${type}-fallback", ${config.fallback}` : config.fallback;
        document.documentElement.style.setProperty(`--font-${type}-fallback`, fallbackStack);
        document.documentElement.classList.add(`font-${type}-fallback`);
    },

    preloadCritical() {
        if (document.readyState === 'complete') {
            setTimeout(() => {
                ['serif', 'sans'].forEach(type => {
                    if (Lumina.Config.fontConfig[type].preload && !this.loaded.has(type) && !this.loading.has(type)) this.load(type);
                });
            }, 100);
        }
    }
};

// ==================== 17. UI交互模块 ====================

Lumina.UI = {
    els: {},

    init() {
        this.cacheElements();
        this.bindEvents();
        this.setupCustomTooltip();
        this.setupRegexRealtimeFeedback();
    },

    cacheElements() {
        const d = Lumina.DOM;
        d.fileInput = document.getElementById('fileInput');
        d.sidebarLeft = document.getElementById('sidebarLeft');
        d.sidebarRight = document.getElementById('sidebarRight');
        d.historyPanel = document.getElementById('historyPanel');
        d.searchPanel = document.getElementById('searchPanel');
        d.readingArea = document.getElementById('readingArea');
        d.contentWrapper = document.getElementById('contentWrapper');
        d.contentScroll = document.getElementById('contentScroll');
        d.welcomeScreen = document.getElementById('welcomeScreen');
        d.aboutPanel = document.getElementById('aboutPanel');
        d.loadingScreen = document.getElementById('loadingScreen');
        d.customDialog = document.getElementById('customDialog');
        d.fileInfo = document.getElementById('fileInfo');
        d.chapterNavInfo = document.getElementById('chapterNavInfo');
        d.tocList = document.getElementById('tocList');
        d.searchResults = document.getElementById('searchResults');
        d.historyList = document.getElementById('historyList');
        d.tooltip = document.getElementById('global-tooltip');
        d.dialogTitle = document.getElementById('dialogTitle');
        d.dialogTitle = document.getElementById('dialogTitle');
        d.dialogMessage = document.getElementById('dialogMessage');
        d.dialogCancel = document.getElementById('dialogCancel');
        d.dialogConfirm = document.getElementById('dialogConfirm');
        d.dialogInputWrapper = document.getElementById('dialogInputWrapper');
        d.dialogInput = document.getElementById('dialogInput');
        d.fontLoadingIndicator = document.getElementById('fontLoadingIndicator');
        d.toast = document.getElementById('toast');
        d.dataManagerPanel = document.getElementById('dataManagerPanel');
        d.searchPanelInput = document.getElementById('searchPanelInput');
    },

    bindEvents() {
        document.getElementById('openFileBtn').addEventListener('click', () => Lumina.DOM.fileInput.click());
        document.getElementById('welcomeOpenBtn').addEventListener('click', () => Lumina.DOM.fileInput.click());
        Lumina.DOM.fileInput.addEventListener('change', async (e) => {
            if (e.target.files[0]) {
                if (e.target.files[0].handle) Lumina.State.app.currentFile.handle = e.target.files[0].handle;
                await Lumina.Actions.processFile(e.target.files[0]);
            }
        });

        document.body.addEventListener('dragover', (e) => { e.preventDefault(); document.body.style.background = 'var(--bg-tertiary)'; });
        document.body.addEventListener('dragleave', () => { document.body.style.background = ''; });
        document.body.addEventListener('drop', async (e) => {
            e.preventDefault(); document.body.style.background = '';
            if (e.dataTransfer.files[0]) {
                const file = e.dataTransfer.files[0];
                if (file.name.endsWith('.json')) await Lumina.Actions.handleJSONFile(file);
                else await Lumina.Actions.processFile(file);
            }
        });

        const toggleSidebar = () => {
            const isVisible = Lumina.DOM.sidebarLeft.classList.toggle('visible');
            Lumina.DOM.readingArea.classList.toggle('with-sidebar', isVisible);
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
            Lumina.State.settings.sidebarVisible = isVisible;
            Lumina.Settings.save();
        };
        document.getElementById('toggleToc').addEventListener('click', toggleSidebar);
        document.getElementById('collapseToc').addEventListener('click', toggleSidebar);

        const panels = {
            settings: { btn: 'settingsBtn', panel: Lumina.DOM.sidebarRight, toggle: true },
            history: { btn: 'historyBtn', panel: Lumina.DOM.historyPanel, toggle: true },
            search: { btn: 'searchToggle', panel: Lumina.DOM.searchPanel, toggle: true }
        };

        Object.entries(panels).forEach(([key, { btn, panel, toggle }]) => {
            document.getElementById(btn).addEventListener('click', (e) => {
                e.stopPropagation();
                if (toggle) panel.classList.toggle('open');
                else panel.classList.add('open');
                Object.values(panels).forEach(({ panel: p }) => { if (p !== panel) p.classList.remove('open'); });
                // 关闭注释面板
                document.getElementById('annotationPanel')?.classList.remove('open');
                if (panel.classList.contains('open') && key === 'search') Lumina.DOM.searchPanelInput.focus();
            });
        });

        document.getElementById('closeSettings').addEventListener('click', () => Lumina.DOM.sidebarRight.classList.remove('open'));
        document.getElementById('closeHistory').addEventListener('click', () => Lumina.DOM.historyPanel.classList.remove('open'));
        document.getElementById('closeSearchPanel').addEventListener('click', () => {
            Lumina.DOM.searchPanel.classList.remove('open');
            Lumina.Search.clearHighlight();
        });

        document.getElementById('openLibraryManager').addEventListener('click', () => {
            Lumina.DOM.historyPanel.classList.remove('open');
            if (Lumina.DataManager) Lumina.DataManager.open();
        });

        document.getElementById('aboutBtn').addEventListener('click', () => Lumina.DOM.aboutPanel.classList.add('active'));
        document.getElementById('closeAbout').addEventListener('click', () => Lumina.DOM.aboutPanel.classList.remove('active'));
        Lumina.DOM.aboutPanel.addEventListener('click', (e) => { if (e.target === Lumina.DOM.aboutPanel) Lumina.DOM.aboutPanel.classList.remove('active'); });
        
        // 注释/书签按钮
        document.getElementById('annotationBtn').addEventListener('click', () => Lumina.Annotations.togglePanel());

        Lumina.DOM.sidebarRight.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-setting-group] .option-btn, [data-setting-group] .numbering-btn');
            if (btn) {
                const group = btn.closest('[data-setting-group]').dataset.settingGroup;
                Lumina.State.settings[group] = btn.dataset.value;
                Lumina.Settings.save();
                Lumina.UI.updateActiveButtons();

                if (group === 'chapterNumbering' && Lumina.State.app.document.items.length) {
                    Lumina.Parser.applyNumberingStyle();
                    if (Lumina.State.app.dbReady && Lumina.State.app.currentFile.fileKey) {
                        Lumina.DB.saveHistory(Lumina.State.app.currentFile.name, Lumina.State.app.currentFile.type, Lumina.State.app.currentFile.wordCount, null);
                    }
                } else if (group === 'language') Lumina.I18n.updateUI();
                await Lumina.Settings.apply();
            }

            const toggle = e.target.closest('[data-setting-toggle]');
            if (toggle) {
                const key = toggle.dataset.settingToggle;
                Lumina.State.settings[key] = !Lumina.State.settings[key];
                Lumina.Settings.save();
                toggle.querySelector('.toggle-track').classList.toggle('active', Lumina.State.settings[key]);
                Lumina.Settings.apply();
            }
        });

        Lumina.DOM.sidebarRight.addEventListener('change', (e) => {
            const slider = e.target.closest('[data-setting-slider] input');
            if (slider) {
                const container = slider.closest('[data-setting-slider]');
                const key = container.dataset.settingSlider;
                Lumina.State.settings[key] = parseInt(slider.value);
                const display = container.querySelector('.slider-value');
                const divider = parseInt(container.dataset.divider) || 1;
                const unit = container.dataset.unit || '';
                let displayValue = Lumina.State.settings[key];
                if (divider !== 1) displayValue = (Lumina.State.settings[key] / divider).toFixed(1);
                display.textContent = `${displayValue}${unit}`;

                if (key === 'ttsRate') Lumina.TTS.manager.updateSettings('rate', Lumina.State.settings[key] / 10);
                else if (key === 'ttsPitch') Lumina.TTS.manager.updateSettings('pitch', Lumina.State.settings[key] / 10);

                Lumina.Settings.save();
                if (key !== 'ttsRate' && key !== 'ttsPitch') Lumina.Settings.apply();
            }
        });

        Lumina.DOM.sidebarRight.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-export]');
            if (btn) {
                try {
                    await Lumina.Exporter.exportDocument(btn.dataset.export);
                } catch (err) {
                    console.error('导出错误:', err);
                    Lumina.UI.showToast('导出失败');
                }
            }
        });

        document.getElementById('applyRegex').addEventListener('click', Lumina.Actions.applyRegexRules);
        document.getElementById('resetSettings').addEventListener('click', Lumina.Settings.reset);

        Lumina.DOM.searchPanelInput.addEventListener('input', (e) => Lumina.Search.perform(e.target.value));

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.panel, .btn-icon')) {
                Object.values(panels).forEach(({ panel }) => panel?.classList.remove('open'));
                document.getElementById('annotationPanel')?.classList.remove('open');
                Lumina.Search.clearHighlight();
            }
        });

        document.addEventListener('keydown', Lumina.Actions.handleKeyboard);

        let scrollTimeout, idleCallbackId;
        Lumina.DOM.contentScroll.addEventListener('scroll', () => {
            Lumina.Renderer.updateTocSpy();
            clearTimeout(scrollTimeout);
            if (window.cancelIdleCallback && idleCallbackId) cancelIdleCallback(idleCallbackId);
            if ('requestIdleCallback' in window) idleCallbackId = requestIdleCallback(() => Lumina.DB.updateHistoryProgress(), { timeout: 2000 });
            else scrollTimeout = setTimeout(Lumina.DB.updateHistoryProgress, 1500);
        }, { passive: true });

        window.addEventListener('resize', () => setTimeout(Lumina.Settings.apply, 250));

        let touchStartX = 0, touchStartY = 0;
        const SWIPE_THRESHOLD = 50;

        Lumina.DOM.contentScroll.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        Lumina.DOM.contentScroll.addEventListener('touchend', (e) => {
            if (!Lumina.State.app.document.items.length) return;
            
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const deltaX = touchStartX - touchEndX;
            const deltaY = touchStartY - touchEndY;
            
            // 水平滑动超过阈值，且水平移动大于垂直移动（避免与滚动冲突）
            if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
                if (e.cancelable) {
                    e.preventDefault();
                }
                
                if (deltaX > 0) {
                    // 左滑（从右向左）：下一页
                    Lumina.Actions.nextPage();
                } else {
                    // 右滑（从左向右）：上一页  
                    Lumina.Actions.prevPage();
                }
            }
        }, { passive: false });

        this.setupImmersiveMode();
        this.setupPinchZoom();

        // 正则帮助弹窗
        document.getElementById('regexHelpBtn').addEventListener('click', () => {
            document.getElementById('regexHelpPanel').classList.add('active');
        });

        document.getElementById('closeRegexHelp').addEventListener('click', () => {
            document.getElementById('regexHelpPanel').classList.remove('active');
        });

        document.getElementById('regexHelpPanel').addEventListener('click', (e) => {
            if (e.target === document.getElementById('regexHelpPanel')) {
                document.getElementById('regexHelpPanel').classList.remove('active');
            }
        });
    },

    setupImmersiveMode() {
        const readingArea = document.getElementById('readingArea');
        if (!readingArea) return;
        
        let pressTimer = null;
        const PRESS_DURATION = 700; // 700ms 长按，平衡响应与误触
        let isPressing = false;
        let startX = 0, startY = 0;
        let hasSelection = false;
        let rippleEl = null;
        
        // 提示元素
        const hint = document.createElement('div');
        hint.className = 'immersive-hint';
        document.body.appendChild(hint);
        
        const showHint = (isEntering) => {
            const t = Lumina.I18n.t;
            hint.textContent = isEntering ? (t('immersiveEnter') || '进入沉浸模式') 
                                        : (t('immersiveExit') || '退出沉浸模式');
            hint.classList.add('show');
            setTimeout(() => hint.classList.remove('show'), 1800);
        };
        
        const toggleImmersive = (e) => {
            // 如果当前有文本选中，不触发（避免与复制冲突）
            const selection = window.getSelection();
            if (selection && selection.toString().trim().length > 0) {
                return;
            }
            
            const state = Lumina.State.app.ui;
            state.isImmersive = !state.isImmersive;
            
            // 触觉反馈
            if (navigator.vibrate) {
                navigator.vibrate(state.isImmersive ? [50, 80, 50] : 40);
            }
            
            if (state.isImmersive) {
                // 进入沉浸
                document.body.classList.add('immersive-mode');
                document.documentElement.requestFullscreen?.().catch(() => {});
                // 关闭所有面板
                Lumina.DOM.sidebarRight?.classList.remove('open');
                Lumina.DOM.historyPanel?.classList.remove('open');
                Lumina.DOM.searchPanel?.classList.remove('open');
                Lumina.DOM.aboutPanel?.classList.remove('active');
                // 移动端关闭侧边栏
                if (window.innerWidth <= 768) {
                    Lumina.DOM.sidebarLeft?.classList.remove('visible');
                    Lumina.DOM.readingArea?.classList.remove('with-sidebar');
                    Lumina.State.settings.sidebarVisible = false;
                }
                // 应用沉浸模式安全区域
                if (window.toggleImmersiveSafeArea) {
                    window.toggleImmersiveSafeArea(true);
                }
                showHint(true);
            } else {
                // 退出沉浸
                document.body.classList.remove('immersive-mode');
                document.exitFullscreen?.().catch(() => {});
                showHint(false);
                // 恢复安全区域
                if (window.toggleImmersiveSafeArea) {
                    window.toggleImmersiveSafeArea(false);
                } else if (window.SafeArea) {
                    window.SafeArea.apply();
                }
            }
        };
        
        // 监听全屏变化（用户按 ESC 或系统手势退出时同步）
        document.addEventListener('fullscreenchange', () => {
            const state = Lumina.State.app.ui;
            if (!document.fullscreenElement && state.isImmersive) {
                state.isImmersive = false;
                document.body.classList.remove('immersive-mode');
            }
        });
        
        // 触摸开始 - 绑定在阅读区
        readingArea.addEventListener('touchstart', (e) => {
            // 排除交互元素：按钮、输入框、链接、图片（放大查看）
            if (e.target.closest('button, input, a, .doc-image, .pagination-nav, .cover-btn')) {
                return;
            }
            
            // 排除选区操作（如果已经有选区，不启动计时）
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
                return;
            }
            
            isPressing = true;
            hasSelection = false;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            
            // 开始计时
            pressTimer = setTimeout(() => {
                if (isPressing && !hasSelection) {
                    isPressing = false;
                    // 触发切换
                    toggleImmersive(e);
                }
            }, PRESS_DURATION);
            
        }, { passive: true });
        
        // 监控文本选择（防止与选字冲突）
        const checkSelection = () => {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
                hasSelection = true;
                clearTimeout(pressTimer);
            }
        };
        document.addEventListener('selectionchange', checkSelection);
        
        // 取消按压的情况
        const cancelPress = (e) => {
            if (!isPressing) return;
            
            // 如果移动超过阈值，取消
            if (e.changedTouches && e.changedTouches[0]) {
                const deltaX = Math.abs(e.changedTouches[0].clientX - startX);
                const deltaY = Math.abs(e.changedTouches[0].clientY - startY);
                if (deltaX > 15 || deltaY > 15) {
                    clearTimeout(pressTimer);
                    isPressing = false;
                    return;
                }
            }
            
            clearTimeout(pressTimer);
            isPressing = false;
        };
        
        readingArea.addEventListener('touchend', cancelPress, { passive: true });
        readingArea.addEventListener('touchcancel', cancelPress, { passive: true });
        readingArea.addEventListener('touchmove', (e) => {
            if (!isPressing) return;
            const deltaY = Math.abs(e.touches[0].clientY - startY);
            const deltaX = Math.abs(e.touches[0].clientX - startX);
            if (deltaY > 10 || deltaX > 10) {
                clearTimeout(pressTimer);
                isPressing = false;
            }
        }, { passive: true });
        
        // 双击退出（备用方案，如果长按太难用）
        readingArea.addEventListener('dblclick', (e) => {
            // 双击时如果处于沉浸模式，退出
            if (Lumina.State.app.ui.isImmersive) {
                toggleImmersive(e);
            }
        });
    },

    setupCustomTooltip() {
        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-i18n-tooltip], [data-tooltip-text]');
            if (target?.dataset.tooltipText) {
                Lumina.UI.showTooltip(target, target.dataset.tooltipText);
            }
        });
        
        document.addEventListener('mouseout', (e) => { 
            if (e.target.closest('[data-i18n-tooltip], [data-tooltip-text]')) {
                Lumina.UI.hideTooltip(); 
            }
        });
    },

    // 双指缩放字体功能（移动端）
    setupPinchZoom() {
        if (window.innerWidth > 768) return;
        
        let initialPinchDistance = 0;
        let initialFontSize = 0;
        let lastScale = 1;
        let pinchStartTime = 0;
        // 暴露到全局，供其他模块检查双指缩放状态
        window.LuminaPinchState = { isPinching: false };
        
        const MIN_FONT_SIZE = 14;
        const MAX_FONT_SIZE = 32;
        
        // 获取阅读区域（严格限定在此区域）
        const readingArea = document.getElementById('readingArea');
        if (!readingArea) return;
        
        // 显示字体大小提示
        const showFontSizeToast = (size) => {
            const existingToast = document.getElementById('font-size-toast');
            if (existingToast) existingToast.remove();
            
            const toast = document.createElement('div');
            toast.id = 'font-size-toast';
            toast.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 12px 24px;
                border-radius: 24px;
                font-size: 16px;
                z-index: 10000;
                pointer-events: none;
                transition: opacity 0.3s;
                font-family: system-ui, -apple-system, sans-serif;
            `;
            toast.textContent = `字号: ${Math.round(size)}px`;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 1500);
        };
        
        // 应用字体大小并重新渲染
        const applyFontSize = (size) => {
            const newSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(size)));
            
            // 避免重复设置相同值
            if (newSize === Lumina.State.settings.fontSize) return newSize;
            
            Lumina.State.settings.fontSize = newSize;
            Lumina.Settings.save();
            
            // 更新 CSS 变量
            document.documentElement.style.setProperty('--font-size', `${newSize}px`);
            
            // 更新设置面板显示
            const sliderContainer = document.querySelector('[data-setting-slider="fontSize"]');
            if (sliderContainer) {
                const slider = sliderContainer.querySelector('.slider');
                const display = sliderContainer.querySelector('.slider-value');
                if (slider) slider.value = newSize;
                if (display) display.textContent = `${newSize}px`;
            }
            
            // 重新渲染当前章节
            if (Lumina.State.app.document.items.length) {
                const currentIndex = Lumina.Renderer.getCurrentVisibleIndex();
                Lumina.Renderer.renderCurrentChapter(currentIndex);
            }
            
            return newSize;
        };
        
        // 触摸开始 - 严格限定在 readingArea
        readingArea.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                window.LuminaPinchState.isPinching = true;
                pinchStartTime = Date.now();
                
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                initialPinchDistance = Math.hypot(dx, dy);
                initialFontSize = Lumina.State.settings.fontSize;
                lastScale = 1;
                
                e.preventDefault();
                e.stopPropagation();
            }
        }, { passive: false });
        
        // 触摸移动
        readingArea.addEventListener('touchmove', (e) => {
            if (window.LuminaPinchState.isPinching && e.touches.length === 2) {
                e.preventDefault();
                e.stopPropagation();
                
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const distance = Math.hypot(dx, dy);
                
                if (initialPinchDistance > 0) {
                    const scale = distance / initialPinchDistance;
                    lastScale = scale; // 记录最后的缩放比例
                    
                    const previewSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, initialFontSize * scale));
                    document.documentElement.style.setProperty('--font-size', `${previewSize}px`);
                }
            }
        }, { passive: false });
        
        // 触摸结束 - 关键修复：使用 lastScale 而不是重新计算
        readingArea.addEventListener('touchend', (e) => {
            if (window.LuminaPinchState.isPinching) {
                // 双指变单指或全部抬起
                if (e.touches.length < 2) {
                    const pinchDuration = Date.now() - pinchStartTime;
                    window.LuminaPinchState.isPinching = false;
                    
                    // 7.3 双指短按重置字号：双指按下很快抬起（< 300ms）且几乎没移动，重置为默认字号
                    const defaultFontSize = Lumina.Config?.defaultSettings?.fontSize || 20;
                    const isQuickTap = pinchDuration < 300; // 短按判定：小于300ms
                    const isMinimalMove = lastScale >= 0.95 && lastScale <= 1.05; // 几乎没移动
                    
                    if (isQuickTap && isMinimalMove) {
                        // 短按重置字号
                        const finalSize = applyFontSize(defaultFontSize);
                        showFontSizeToast(finalSize);
                    } else if (lastScale > 0 && initialFontSize > 0 && !isQuickTap) {
                        // 有效缩放（不是短按），应用新字号
                        const finalSize = applyFontSize(initialFontSize * lastScale);
                        showFontSizeToast(finalSize);
                    } else {
                        // 无效缩放，恢复原设置（防止漂移）
                        document.documentElement.style.setProperty('--font-size', `${Lumina.State.settings.fontSize}px`);
                    }
                    
                    // 重置状态
                    initialPinchDistance = 0;
                    lastScale = 1;
                }
            }
        });
        
        // 触摸取消
        readingArea.addEventListener('touchcancel', () => {
            if (window.LuminaPinchState.isPinching) {
                window.LuminaPinchState.isPinching = false;
                // 恢复原字体
                document.documentElement.style.setProperty('--font-size', `${Lumina.State.settings.fontSize}px`);
                initialPinchDistance = 0;
                lastScale = 1;
            }
        });
    },

    setupRegexRealtimeFeedback() {
        let debounceTimer;
        ['chapter', 'section'].forEach(type => {
            const input = document.getElementById(`${type}Regex`);
            input.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    Lumina.UI.updateRegexFeedback(type);
                    const chapterVal = document.getElementById('chapterRegex').value;
                    const sectionVal = document.getElementById('sectionRegex').value;
                    Lumina.Parser.RegexCache.updateCustomPatterns(chapterVal, sectionVal);
                }, 300);
            });
            input.addEventListener('blur', () => {
                if (Lumina.Utils.validateRegex(input.value)) {
                    Lumina.State.settings[`${type}Regex`] = input.value;
                    Lumina.Settings.save();
                }
            });
        });
    },

    updateRegexFeedback(type) {
        const input = document.getElementById(`${type}Regex`);
        const feedback = document.getElementById(`${type}RegexFeedback`);
        const pattern = input.value.trim();
        input.classList.remove('error', 'valid');
        feedback.classList.remove('error', 'valid', 'info');
        feedback.textContent = '';
        if (!pattern) return;
        if (!Lumina.Utils.validateRegex(pattern)) {
            input.classList.add('error');
            feedback.classList.add('error');
            feedback.textContent = Lumina.I18n.t('regexInvalid');
            return;
        }
        input.classList.add('valid');
        feedback.classList.add('valid');
        if (Lumina.State.app.document.items?.length > 0) {
            try {
                Lumina.Parser.RegexCache.updateCustomPatterns(
                    type === 'chapter' ? pattern : Lumina.State.settings.chapterRegex,
                    type === 'section' ? pattern : Lumina.State.settings.sectionRegex
                );
                const regex = type === 'chapter' ? Lumina.Parser.RegexCache.customPatterns.chapter : Lumina.Parser.RegexCache.customPatterns.section;
                if (regex) {
                    const count = Lumina.State.app.document.items.filter(item => item.text && regex.test(item.text)).length;
                    feedback.textContent = Lumina.I18n.t('regexMatches', count);
                } else feedback.textContent = Lumina.I18n.t('regexValid');
            } catch (e) { feedback.textContent = Lumina.I18n.t('regexValid'); }
        } else {
            feedback.classList.remove('valid');
            feedback.classList.add('info');
            feedback.textContent = Lumina.I18n.t('regexNoFile');
        }
    },

    showTooltip(target, text) {
        Lumina.DOM.tooltip.textContent = text;
        Lumina.DOM.tooltip.classList.add('visible');
        const rect = target.getBoundingClientRect();
        const tooltipRect = Lumina.DOM.tooltip.getBoundingClientRect();
        let left = rect.left + rect.width / 2;
        let top = rect.bottom + 10;
        if (top + tooltipRect.height > window.innerHeight - 20) top = rect.top - tooltipRect.height - 10;
        left = Math.max(tooltipRect.width / 2 + 10, Math.min(left, window.innerWidth - tooltipRect.width / 2 - 10));
        Lumina.DOM.tooltip.style.left = `${left}px`;
        Lumina.DOM.tooltip.style.top = `${top}px`;
    },

    hideTooltip() { Lumina.DOM.tooltip.classList.remove('visible'); },

    // 全屏查看图片
    viewImageFull(src, alt = '') {
        // 创建全屏遮罩
        const overlay = document.createElement('div');
        overlay.className = 'image-viewer-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.9);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: zoom-out;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        
        // 创建图片
        const img = document.createElement('img');
        img.src = src;
        img.alt = alt;
        img.style.cssText = `
            max-width: 95vw;
            max-height: 95vh;
            object-fit: contain;
            transform: scale(0.9);
            transition: transform 0.3s;
        `;
        
        // 关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            width: 44px;
            height: 44px;
            border: none;
            background: rgba(255,255,255,0.1);
            color: white;
            font-size: 24px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        `;
        closeBtn.onmouseenter = () => closeBtn.style.background = 'rgba(255,255,255,0.2)';
        closeBtn.onmouseleave = () => closeBtn.style.background = 'rgba(255,255,255,0.1)';
        
        overlay.appendChild(img);
        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);
        
        // 动画显示
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            img.style.transform = 'scale(1)';
        });
        
        // 关闭函数
        const close = () => {
            overlay.style.opacity = '0';
            img.style.transform = 'scale(0.9)';
            setTimeout(() => overlay.remove(), 300);
        };
        
        overlay.onclick = close;
        closeBtn.onclick = (e) => { e.stopPropagation(); close(); };
        
        // ESC 关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    },

    showDialog(message, type = 'alert', callback = null, options = {}) {
        const { title, inputType, placeholder, confirmText, cancelText } = options;
        
        // 设置标题
        if (title) {
            Lumina.DOM.dialogTitle.textContent = title;
            Lumina.DOM.dialogTitle.style.display = 'block';
        } else {
            Lumina.DOM.dialogTitle.style.display = 'none';
        }
        
        // 设置消息
        Lumina.DOM.dialogMessage.textContent = message;
        
        // 处理输入框
        const inputWrapper = document.getElementById('dialogInputWrapper');
        const input = document.getElementById('dialogInput');
        
        if (type === 'prompt' || inputType) {
            inputWrapper.style.display = 'block';
            input.type = inputType || 'text';
            input.placeholder = placeholder || '';
            input.value = '';
            setTimeout(() => input.focus(), 50);
        } else {
            inputWrapper.style.display = 'none';
        }
        
        // 显示/隐藏取消按钮
        Lumina.DOM.dialogCancel.style.display = (type === 'confirm' || type === 'prompt') ? 'block' : 'none';
        
        // 自定义按钮文字
        if (confirmText) Lumina.DOM.dialogConfirm.textContent = confirmText;
        else Lumina.DOM.dialogConfirm.textContent = Lumina.I18n.t('confirm') || '确定';
        
        if (cancelText) Lumina.DOM.dialogCancel.textContent = cancelText;
        else Lumina.DOM.dialogCancel.textContent = Lumina.I18n.t('cancel') || '取消';
        
        Lumina.DOM.customDialog.classList.add('active');
        
        const close = (result) => {
            Lumina.DOM.customDialog.classList.remove('active');
            inputWrapper.style.display = 'none';
            // 恢复默认按钮文字
            Lumina.DOM.dialogConfirm.textContent = Lumina.I18n.t('confirm') || '确定';
            Lumina.DOM.dialogCancel.textContent = Lumina.I18n.t('cancel') || '取消';
            if (callback) callback(result);
        };
        
        Lumina.DOM.dialogCancel.onclick = (e) => {
            e.stopPropagation();
            close(null);
        };
        Lumina.DOM.dialogConfirm.onclick = (e) => {
            e.stopPropagation();
            if (type === 'prompt' || inputType) {
                close(input.value || null);
            } else {
                close(true);
            }
        };
        
        // 回车键确认
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                close(input.value || null);
            }
        };
        
        Lumina.DOM.customDialog.onclick = (e) => { 
            if (e.target === Lumina.DOM.customDialog) close(null); 
        };
    },

    showToast(message, duration = 2000) {
        Lumina.DOM.toast.textContent = message;
        Lumina.DOM.toast.classList.add('show');
        setTimeout(() => Lumina.DOM.toast.classList.remove('show'), duration);
    },

    updateActiveButtons() {
        const groups = ['language', 'theme', 'font', 'chapterNumbering'];
        groups.forEach(group => {
            document.querySelectorAll(`[data-setting-group="${group}"] .option-btn, [data-setting-group="${group}"] .numbering-btn`).forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === Lumina.State.settings[group]);
            });
        });
    },

    setupPaginationTooltip(container) {
        container.querySelectorAll('[data-tooltip]').forEach(btn => {
            btn.addEventListener('mouseenter', (e) => {
                const text = e.target.closest('[data-tooltip]')?.dataset.tooltip;
                if (text && this.showTooltip) {
                    this.showTooltip(e.target, text);
                }
            });
            btn.addEventListener('mouseleave', () => {
                if (this.hideTooltip) this.hideTooltip();
            });
        });
    }

};

// 更新存储指示器图标和提示
Lumina.UI.updateStorageIndicator = (mode, isFallback = false) => {
    const indicator = document.getElementById('storageIndicator');
    const iconSvg = document.getElementById('storageIcon');
    
    const useElement = iconSvg.querySelector('use');
    
    if (isFallback) {
        useElement.setAttribute('href', '#icon-storage-local');
    } else if (mode === 'sqlite') {
        useElement.setAttribute('href', '#icon-storage-server');
    } else {
        useElement.setAttribute('href', '#icon-storage-local');
    }
    
    indicator.dataset.mode = mode;
    indicator.dataset.isFallback = String(isFallback);
};

// 显示存储详情弹窗
Lumina.UI.showStorageInfo = async () => {
    const btn = document.getElementById('storageIndicator');
    if (btn.disabled) return;
    
    const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
    const t = Lumina.I18n.t;
    
    btn.disabled = true;
    
    // IndexedDB 模式
    if (!isSQLite) {
        try {
            const stats = await Lumina.DB.adapter.getStorageStats();
            renderContent(stats, false);
        } catch (err) {
            Lumina.UI.showToast(t('loadFailed'));
        } finally {
            setTimeout(() => btn.disabled = false, 500);
        }
        return;
    }
    
    // SQLite 模式：先显示骨架屏
    const html = `
        <div class="storage-modal" id="storageModal" onclick="if(event.target===this)Lumina.UI.closeStorageInfo()">
            <div class="storage-content">
                <div class="storage-header">
                    <span class="storage-title">${t('storageDetails')}</span>
                    <button class="storage-close" disabled style="cursor:not-allowed">
                        <svg class="icon"><use href="#icon-close"></use></svg>
                    </button>
                </div>
                <div class="storage-body" id="storageBody">
                    ${Array(4).fill(`
                        <div class="storage-item" style="pointer-events:none">
                            <div class="storage-icon skeleton-bg"></div>
                            <div class="storage-info">
                                <div class="skeleton-bg" style="height:12px;width:50%;margin-bottom:6px;border-radius:3px;"></div>
                                <div class="skeleton-bg" style="height:14px;width:80%;border-radius:3px;"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    
    // SQLite 加载数据后替换
    try {
        await new Promise(r => setTimeout(r, 50));
        const stats = await Lumina.DB.adapter.getStorageStats();
        
        const body = document.getElementById('storageBody');
        body.style.transition = 'opacity 0.15s';
        body.style.opacity = '0';
        
        setTimeout(() => {
            renderContent(stats, true, true); 
            body.style.opacity = '1';
        }, 150);
        
    } catch (err) {
        document.getElementById('storageBody').innerHTML = 
            `<div style="padding:20px;text-align:center;color:var(--warnning)">${t('loadFailed')}</div>`;
    } finally {
        setTimeout(() => btn.disabled = false, 500);
    }
    
    // 内部函数：渲染正式内容（IndexedDB 直接调用，SQLite 替换调用）
    function renderContent(stats, isSQLite, isReplace = false) {
        const isFallback = isSQLite && !Lumina.State.app.dbReady;
        let modeKey = isSQLite ? (isFallback ? 'storageFallback' : 'storageServer') : 'storageLocal';
        let statusClass = isSQLite ? (isFallback ? 'status-warning' : 'status-online') : 'status-offline';
        
        const items = [
            {
                icon: `<svg class="icon"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
                label: t('storageEngine'), value: t(modeKey), showStatus: true, statusClass
            },
            {
                icon: `<svg class="icon"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
                label: t('booksCountLabel'), value: t('booksCountValue', stats.totalFiles)
            },
            {
                icon: `<svg class="icon"><rect x="2" y="3" width="20" height="6" rx="2"/><rect x="2" y="15" width="20" height="6" rx="2"/></svg>`,
                label: t('storageUsedLabel'), value: t('storageSizeValue', stats.totalSize)
            }
        ];
        
        // SQLite 第4行：端点
        if (isSQLite) {
            items.push({
                icon: `<svg class="icon"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
                label: t('storageEndpoint'), value: 'localhost:8080'
            });
        }
        
        const listHtml = items.map(item => `
            <div class="storage-item">
                <div class="storage-icon">${item.icon}</div>
                <div class="storage-info">
                    <div class="storage-label">${item.label}</div>
                    <div class="storage-value">${item.value}</div>
                </div>
                ${item.showStatus ? `<div class="storage-status ${item.statusClass}"></div>` : ''}
            </div>
        `).join('');
        
        if (isReplace) {
            // SQLite 替换模式：直接替换 body 内容
            document.getElementById('storageBody').innerHTML = listHtml;
            const closeBtn = document.querySelector('#storageModal .storage-close');
            if (closeBtn) {
                closeBtn.disabled = false;
                closeBtn.style.opacity = '1';
                closeBtn.style.cursor = 'pointer';
                closeBtn.onclick = Lumina.UI.closeStorageInfo;
            }
        } else {
            // IndexedDB 直接模式：新建弹窗
            const html = `
                <div class="storage-modal" id="storageModal" onclick="if(event.target===this)Lumina.UI.closeStorageInfo()">
                    <div class="storage-content">
                        <div class="storage-header">
                            <span class="storage-title">${t('storageDetails')}</span>
                            <button class="storage-close" onclick="Lumina.UI.closeStorageInfo()" aria-label="${t('close')}">
                                <svg class="icon"><use href="#icon-close"></use></svg>
                            </button>
                        </div>
                        <div class="storage-body">${listHtml}</div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
            
            // ESC 关闭
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    Lumina.UI.closeStorageInfo();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
        }
    }
};

Lumina.UI.closeStorageInfo = () => {
    const modal = document.getElementById('storageModal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 200);
    }
};

// ==================== 18. 国际化更新 ====================

Lumina.I18n.updateUI = () => {
    const t = Lumina.I18n.t;
    document.title = t('appName');
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (Lumina.I18n.data[Lumina.State.settings.language]?.[key]) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        if (Lumina.I18n.data[Lumina.State.settings.language]?.[key]) el.placeholder = t(key);
    });
    document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
        const key = el.dataset.i18nTooltip;
        if (Lumina.I18n.data[Lumina.State.settings.language]?.[key]) el.dataset.tooltipText = t(key);
    });
    if (Lumina.State.app.currentFile.name) Lumina.DOM.fileInfo.textContent = Lumina.State.app.currentFile.name;
    Lumina.Renderer.updateChapterNavInfo();
    Lumina.DB.loadHistoryFromDB();
    Lumina.UI.updateRegexFeedback('chapter');
    Lumina.UI.updateRegexFeedback('section');
};

// ==================== 19. 操作分发器 ====================

Lumina.Actions = {
    async processFile(file) {
        if (Lumina.State.app.ui.isProcessing) return;
        if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) Lumina.TTS.manager.stop();

        if (file.name.endsWith('.json')) { await this.handleJSONFile(file); return; }

        const fileKey = Lumina.DB.adapter.generateFileKey(file);
        Lumina.State.app.currentFile.fileKey = fileKey;
        Lumina.State.app.currentFile.handle = file;
        Lumina.State.app.currentFile.skipSave = false; // 重置保存标记

        if (Lumina.State.app.dbReady) {
            const exactMatch = await Lumina.DB.adapter.getFile(fileKey);
            if (exactMatch) {
                Lumina.UI.showToast(Lumina.I18n.t('dbUsingCache'));
                await Lumina.DB.restoreFileFromDB(exactMatch);
                return;
            }
            const existingByName = await Lumina.DB.adapter.findByFileName(file.name);
            if (existingByName) {
                Lumina.UI.showDialog(Lumina.I18n.t('confirmOverwrite', file.name), 'confirm', async (confirmed) => {
                    if (confirmed) {
                        await Lumina.DB.adapter.deleteFile(existingByName.fileKey);
                        await Lumina.DB.loadHistoryFromDB();
                        await this.processFileContinue(file, fileKey);
                    }
                });
                return;
            }
        }
        await this.processFileContinue(file, fileKey);
    },

    async processFileContinue(file, fileKey) {
        Lumina.State.settings.chapterNumbering = 'none';
        Lumina.State.settings.chapterRegex = '';
        Lumina.State.settings.sectionRegex = '';
        Lumina.Parser.RegexCache.updateCustomPatterns('', '');
        Lumina.UI.updateActiveButtons();

        Lumina.State.app.ui.isProcessing = true;
        Lumina.DOM.loadingScreen.classList.add('active');

        try {
            let result, wordCount = 0;
            const fileType = file.name.split('.').pop().toLowerCase();
            Lumina.State.app.currentFile.type = fileType;
            let cover = null;

            if (fileType === 'docx' || fileType === 'pdf') {
                const arrayBuffer = await file.arrayBuffer();
                if (fileType === 'docx') {
                    result = await Lumina.Parser.parseDOCX(arrayBuffer);
                } else {
                    // PDF 解析带进度显示
                    const loadingText = Lumina.DOM.loadingScreen.querySelector('.loading-text');
                    const t = Lumina.I18n.t;
                    // 设置初始文本
                    loadingText.textContent = `${t('pdfParsing') || 'PDF 解析中'}...`;
                    result = await Lumina.Parser.parsePDF(arrayBuffer, (current, total) => {
                        const percent = Math.round((current / total) * 100);
                        loadingText.textContent = `${t('pdfParsing') || 'PDF 解析中'} ${percent}% (${current}/${total})`;
                    });
                }
                const firstImage = result.items.find(item => item.type === 'image');
                if (firstImage) cover = firstImage.data;
            } else {
                const { text, originalEncoding } = await Lumina.Parser.EncodingManager.processFile(file);
                Lumina.State.app.currentFile.rawContent = text;
                Lumina.State.app.currentFile.encoding = originalEncoding;
                const parser = Lumina.Config.fileTypes[fileType]?.parser;
                if (!parser) throw new Error('Unsupported format');
                result = Lumina.Parser[parser](text, fileType);
            }

            wordCount = Lumina.Utils.calculateWordCount(result.items);
            Lumina.State.app.document = result;
            Lumina.State.app.currentFile.wordCount = wordCount;
            Lumina.State.app.currentFile.name = file.name;

            Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
            Lumina.State.app.chapters = Lumina.Parser.buildChapters(result.items);
            Lumina.State.app.currentChapterIndex = 0;

            // 检查内容大小，大文件提示用户选择保存模式
            const contentSize = Lumina.Utils.estimateContentSize(result.items);
            const SIZE_THRESHOLD = 50 * 1024 * 1024; // 50MB
            
            let saveMode = 'full';
            if (contentSize > SIZE_THRESHOLD && Lumina.State.app.dbReady) {
                // 先隐藏 loading 界面，让对话框能显示
                Lumina.DOM.loadingScreen.classList.remove('active');
                await new Promise(r => setTimeout(r, 100)); // 等待过渡动画
                saveMode = await Lumina.DB.promptForSaveMode(contentSize);
            }
            
            // 重新显示 loading 界面进行保存
            Lumina.DOM.loadingScreen.classList.add('active');
            Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = 
                saveMode === 'text-only' ? (Lumina.I18n.t('savingText') || '正在保存文本...') : (Lumina.I18n.t('saving') || '正在保存...');
            
            const saveResult = await Lumina.DB.saveHistory(file.name, fileType, wordCount, cover, true, saveMode);
            
            // 保存完成，隐藏 loading
            Lumina.DOM.loadingScreen.classList.remove('active');
            Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = Lumina.I18n.t('loading') || '正在解析文件...';
            
            if (saveResult.mode === 'no-save') {
                Lumina.State.app.currentFile.skipSave = true;
                Lumina.UI.showToast(Lumina.I18n.t('fileNotSaved') || '文件未保存到书库，仍可继续阅读');
            } else if (saveResult.mode === 'text-only') {
                Lumina.State.app.currentFile.skipSave = false;
                Lumina.UI.showToast(Lumina.I18n.t('fileSavedTextOnly') || '已仅保存文本到书库（图片未保存）');
            }
            
            await Lumina.DB.loadHistoryFromDB();
            Lumina.Search.clearResults();

            Lumina.Renderer.generateTOC();
            Lumina.Renderer.renderCurrentChapter();
            
            // 初始化 G点热力图
            Lumina.HeatMap.onBookOpen();
            
            // 重置注释/书签
            Lumina.State.app.annotations = [];
            Lumina.Annotations.renderAnnotations();

            const isMobileView = window.innerWidth <= 768;
            if (!isMobileView) {
                // 桌面端：显示目录
                Lumina.DOM.sidebarLeft.classList.add('visible');
                Lumina.DOM.readingArea.classList.add('with-sidebar');
                Lumina.State.settings.sidebarVisible = true;
            } else {
                // 移动端：默认隐藏目录，专注阅读
                Lumina.DOM.sidebarLeft.classList.remove('visible');
                Lumina.DOM.readingArea.classList.remove('with-sidebar');
                Lumina.State.settings.sidebarVisible = false;
            }
            Lumina.Settings.save();

            Lumina.DOM.fileInfo.textContent = file.name;
            Lumina.DOM.welcomeScreen.style.display = 'none';

            if (Lumina.State.app.currentFile.encoding && !['UTF-8', 'UTF8'].includes(Lumina.State.app.currentFile.encoding)) {
                Lumina.UI.showToast(`${Lumina.State.app.currentFile.encoding} → UTF-8`, 2000);
            }
        } catch (err) {
            Lumina.UI.showDialog(`Error: ${err.message}`);
        } finally {
            Lumina.State.app.ui.isProcessing = false;
            Lumina.DOM.loadingScreen.classList.remove('active');
        }
    },

    async handleJSONFile(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (Lumina.DataManager) await Lumina.DataManager.importJSONFile(file);
        } catch (err) {
            Lumina.UI.showDialog(Lumina.I18n.t('jsonFormatError'));
        }
    },

    prevChapter() {
        const state = Lumina.State.app;
        if (state.currentChapterIndex > 0) {
            if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) {
                Lumina.TTS.manager.pauseForAction(async () => {
                    state.currentChapterIndex--;
                    state.currentPageIdx = 0; 
                    Lumina.Renderer.renderCurrentChapter();
                    Lumina.DB.updateHistoryProgress();
                }, 400);
            } else {
                state.currentChapterIndex--;
                Lumina.Renderer.renderCurrentChapter();
                Lumina.DB.updateHistoryProgress();
            }
        }
    },

    nextChapter() {
        const state = Lumina.State.app;
        if (state.currentChapterIndex < state.chapters.length - 1) {
            if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) {
                Lumina.TTS.manager.pauseForAction(async () => {
                    state.currentChapterIndex++;
                    state.currentPageIdx = 0; 
                    Lumina.Renderer.renderCurrentChapter();
                    Lumina.DB.updateHistoryProgress();
                }, 400);
            } else {
                state.currentChapterIndex++;
                Lumina.Renderer.renderCurrentChapter();
                Lumina.DB.updateHistoryProgress();
            }
        }
    },

    navigateToChapter(chIdx, targetIndex = null) {
        const state = Lumina.State.app;

        if (chIdx < 0 || chIdx >= state.chapters.length) return;
        
        // 立即更新状态（不操作 DOM）
        state.currentChapterIndex = chIdx;
        state.currentPageIdx = 0;
        
        const chapter = state.chapters[chIdx];
        if (!chapter.pageRanges) {
            chapter.pageRanges = Lumina.Pagination.calculateRanges(chapter.items);
        }
        
        if (targetIndex !== null) {
            const relativeIdx = targetIndex - chapter.startIndex;
            state.currentPageIdx = Lumina.Pagination.findPageIndex(chapter.pageRanges, relativeIdx);
        }
        
        // 7.1 目录导航自动隐藏面板：移动端点击目录项后自动隐藏
        if (window.innerWidth <= 768 && Lumina.DOM.sidebarLeft?.classList.contains('visible')) {
            Lumina.DOM.sidebarLeft.classList.remove('visible');
            Lumina.DOM.readingArea?.classList.remove('with-sidebar');
            Lumina.State.settings.sidebarVisible = false;
            Lumina.Settings.save();
        }
        
        // 关键：异步执行渲染，让 click 事件立即完成
        requestAnimationFrame(() => {
            Lumina.Renderer.renderCurrentChapter(targetIndex);
            Lumina.DB.updateHistoryProgress();
        });
    },

    async applyRegexRules() {
        const chapterVal = document.getElementById('chapterRegex').value;
        const sectionVal = document.getElementById('sectionRegex').value;
        if (!Lumina.Utils.validateRegex(chapterVal) || !Lumina.Utils.validateRegex(sectionVal)) {
            Lumina.UI.showDialog(Lumina.I18n.t('errorInvalidRegex'));
            return;
        }
        
        // 保存原始状态，以便在出错时恢复
        const originalItems = [...Lumina.State.app.document.items];
        
        try {
            Lumina.State.settings.chapterRegex = chapterVal;
            Lumina.State.settings.sectionRegex = sectionVal;
            Lumina.Parser.RegexCache.updateCustomPatterns(chapterVal, sectionVal);
            Lumina.Settings.save();
            
            await Lumina.Parser.reparseWithRegex();
            
            if (Lumina.State.app.currentFile.name && Lumina.State.app.dbReady && Lumina.State.app.currentFile.fileKey) {
                await Lumina.DB.saveHistory(Lumina.State.app.currentFile.name, Lumina.State.app.currentFile.type, Lumina.State.app.currentFile.wordCount);
                await Lumina.DB.loadHistoryFromDB();
            }
            Lumina.UI.showDialog(Lumina.I18n.t('ruleApplied'));
        } catch (err) {
            console.error('应用正则规则失败:', err);
            // 恢复原始状态
            Lumina.State.app.document.items = originalItems;
            Lumina.UI.showDialog(Lumina.I18n.t('ruleApplyFailed') || '应用规则失败: ' + err.message);
        }
    },

    handleKeyboard(e) {
        // 在输入框、文本域或可编辑元素中输入时，不触发全局快捷键
        const target = e.target;
        const isInputElement = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
        const isContentEditable = target.isContentEditable || target.contentEditable === 'true';
        
        if (isInputElement || isContentEditable) {
            if (e.key === 'Escape') { 
                target.blur(); 
                Lumina.DOM.customDialog?.classList.remove('active'); 
            }
            return;
        }

        const keyMap = {
            'f': () => document.getElementById('searchToggle').click(),
            'h': () => document.getElementById('historyBtn').click(),
            's': () => document.getElementById('settingsBtn').click(),
            'a': () => Lumina.Annotations.togglePanel(),
            'b': () => { if (Lumina.DataManager) Lumina.DataManager.toggle(); },
            'r': () => Lumina.TTS.manager.toggle(),
            'escape': () => {
                [Lumina.DOM.sidebarRight, Lumina.DOM.historyPanel, Lumina.DOM.searchPanel].forEach(p => p.classList.remove('open'));
                Lumina.DOM.aboutPanel.classList.remove('active');
                Lumina.DOM.customDialog.classList.remove('active');
                if (Lumina.DataManager) Lumina.DataManager.close();
                Lumina.Search.clearHighlight();
            },
            'arrowup': () => { e.preventDefault(); Lumina.Actions.prevChapter(); },
            'arrowdown': () => { e.preventDefault(); Lumina.Actions.nextChapter(); },
            'arrowleft': () => {
                e.preventDefault();
                if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) {
                    Lumina.TTS.manager.pauseForAction(() => {
                        Lumina.DOM.contentScroll.scrollBy({ top: -Lumina.DOM.contentScroll.clientHeight * 0.9, behavior: Lumina.State.settings.smoothScroll ? 'smooth' : 'auto' });
                    });
                } else {
                    Lumina.DOM.contentScroll.scrollBy({ top: -Lumina.DOM.contentScroll.clientHeight * 0.9, behavior: Lumina.State.settings.smoothScroll ? 'smooth' : 'auto' });
                }
            },
            'arrowright': () => {
                e.preventDefault();
                if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) {
                    Lumina.TTS.manager.pauseForAction(() => {
                        Lumina.DOM.contentScroll.scrollBy({ top: Lumina.DOM.contentScroll.clientHeight * 0.9, behavior: Lumina.State.settings.smoothScroll ? 'smooth' : 'auto' });
                    });
                } else {
                    Lumina.DOM.contentScroll.scrollBy({ top: Lumina.DOM.contentScroll.clientHeight * 0.9, behavior: Lumina.State.settings.smoothScroll ? 'smooth' : 'auto' });
                }
            }
        };

        if (keyMap[e.key.toLowerCase()]) keyMap[e.key.toLowerCase()]();
    },

    returnToWelcome() {
        if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) {
            Lumina.TTS.manager.stop();
        }
        
        Lumina.State.app.currentFile = { 
            name: '', 
            type: '', 
            handle: null, 
            rawContent: null, 
            wordCount: 0, 
            openedAt: null, 
            fileKey: null 
        };
        Lumina.State.app.document = { items: [], type: '' };
        Lumina.State.app.chapters = [];
        Lumina.State.app.currentChapterIndex = 0;
        Lumina.State.app.search = { matches: [], currentQuery: '', highlightedIndex: -1 };
        Lumina.State.app.ui.isProcessing = false;
        
        Lumina.DOM.fileInfo.textContent = Lumina.I18n.t('noFile');
        Lumina.DOM.chapterNavInfo.textContent = '';

        if (Lumina.DOM.fileInput) {
            Lumina.DOM.fileInput.value = '';
        }
                    
        Lumina.DOM.contentWrapper.innerHTML = '';
        Lumina.DOM.contentWrapper.appendChild(Lumina.DOM.welcomeScreen);
        Lumina.DOM.welcomeScreen.style.display = 'flex';
        
        Lumina.DOM.tocList.innerHTML = '';
        
        Lumina.DOM.sidebarLeft.classList.remove('visible');
        Lumina.DOM.readingArea.classList.remove('with-sidebar');
        Lumina.State.settings.sidebarVisible = false;
        Lumina.Settings.save();
        
        Lumina.DOM.sidebarRight.classList.remove('open');
        Lumina.DOM.historyPanel.classList.remove('open');
        Lumina.DOM.searchPanel.classList.remove('open');
        Lumina.DOM.aboutPanel.classList.remove('active');
        if (Lumina.DOM.dataManagerPanel) {
            Lumina.DOM.dataManagerPanel.classList.remove('active');
        }
        
        Lumina.Search.clearResults();
        
        Lumina.DOM.contentScroll.scrollTop = 0;
    }
};

Lumina.Actions.nextPage = () => {
    const state = Lumina.State.app;
    const chapter = state.chapters[state.currentChapterIndex];
    const ranges = state.pageRanges;
    
    if (!ranges || ranges.length <= 1) {
        // 无分页，直接下一章
        state.currentChapterIndex++;
        state.currentPageIdx = 0; // ✅ 确保从第1页开始
        Lumina.Renderer.renderCurrentChapter();
        Lumina.DB.updateHistoryProgress();
        return;
    }
    
    if (state.currentPageIdx < ranges.length - 1) {
        // 当前章还有下一页
        state.currentPageIdx++;
        Lumina.Renderer.renderCurrentChapter();
        Lumina.DB.updateHistoryProgress();
    } else {
        // ✅ 当前章最后一页，进入下一章第1页
        if (state.currentChapterIndex < state.chapters.length - 1) {
            state.currentChapterIndex++;
            state.currentPageIdx = 0; // 关键：重置为第1页
            Lumina.Renderer.renderCurrentChapter();
            Lumina.DB.updateHistoryProgress();
        }
    }
};

Lumina.Actions.prevPage = () => {
    const state = Lumina.State.app;
    
    if (state.currentPageIdx > 0) {
        // 当前章还有上一页
        state.currentPageIdx--;
        Lumina.Renderer.renderCurrentChapter();
        Lumina.DB.updateHistoryProgress();
    } else {
        // ✅ 当前章第1页，回退到上一章最后一页
        if (state.currentChapterIndex > 0) {
            state.currentChapterIndex--;
            const prevChapter = state.chapters[state.currentChapterIndex];
            
            // 确保有分页数据
            if (!prevChapter.pageRanges) {
                prevChapter.pageRanges = Lumina.Pagination.calculateRanges(prevChapter.items);
            }
            
            // 跳到上一章最后一页
            state.currentPageIdx = Math.max(0, prevChapter.pageRanges.length - 1);
            Lumina.Renderer.renderCurrentChapter();
            Lumina.DB.updateHistoryProgress();
        }
    }
};

Lumina.Actions.goToPage = (pageIdx) => {
    const state = Lumina.State.app;
    if (pageIdx < 0 || pageIdx >= state.pageRanges.length) return;
    if (pageIdx === state.currentPageIdx) return;
    
    state.currentPageIdx = pageIdx;
    Lumina.Renderer.renderCurrentChapter();
    Lumina.DB.updateHistoryProgress();
};

Lumina.Actions.goToPrevChapterLastPage = () => {
    const state = Lumina.State.app;
    if (state.currentChapterIndex <= 0) return;
    
    const prevIdx = state.currentChapterIndex - 1;
    const prevChapter = state.chapters[prevIdx];
    
    // 确保有分页数据
    if (!prevChapter.pageRanges) {
        prevChapter.pageRanges = Lumina.Pagination.calculateRanges(prevChapter.items);
    }
    
    // 切换到上一章最后一页
    state.currentChapterIndex = prevIdx;
    state.currentPageIdx = prevChapter.pageRanges.length - 1;
    Lumina.Renderer.renderCurrentChapter();
    Lumina.DB.updateHistoryProgress();
};

Lumina.Actions.goToNextChapterFirstPage = () => {
    const state = Lumina.State.app;
    if (state.currentChapterIndex >= state.chapters.length - 1) return;
    
    state.currentChapterIndex++;
    state.currentPageIdx = 0;
    Lumina.Renderer.renderCurrentChapter();
    Lumina.DB.updateHistoryProgress();
};

// 可选：点击 ... 展开更多页码（简化版直接显示全部）
Lumina.Actions.togglePageRange = () => {
    // 简单实现：临时展开显示全部页码，再次点击恢复折叠
    const state = Lumina.State.app;
    state.showAllPages = !state.showAllPages;
    Lumina.Renderer.addPaginationNav(); // 重新渲染
};

// ==================== 20. 注释与书签管理 ====================

Lumina.Annotations = {
    // 颜色配置
    colors: [
        { id: 'yellow', bg: 'rgba(255, 235, 59, 0.4)', border: '#F9A825', name: '黄色' },
        { id: 'green', bg: 'rgba(76, 175, 80, 0.3)', border: '#388E3C', name: '绿色' },
        { id: 'blue', bg: 'rgba(33, 150, 243, 0.3)', border: '#1976D2', name: '蓝色' },
        { id: 'pink', bg: 'rgba(233, 30, 99, 0.3)', border: '#C2185B', name: '粉色' },
        { id: 'purple', bg: 'rgba(156, 39, 176, 0.3)', border: '#7B1FA2', name: '紫色' },
        { id: 'orange', bg: 'rgba(255, 152, 0, 0.3)', border: '#F57C00', name: '橙色' }
    ],
    
    // 初始化
    init() {
        this.setupContextMenu();
        this.setupPanel();
        this.setupTooltipDelegation();
        this.loadAnnotations();
    },
    
    // 加载当前文件的注释
    loadAnnotations() {
        const fileKey = Lumina.State.app.currentFile.fileKey;
        if (!fileKey) {
            Lumina.State.app.annotations = [];
            return;
        }
        // 从数据库加载会在 restoreFileFromDB 中处理
        // 这里只负责初始化 UI
        this.renderAnnotations();
    },
    
    // 设置上下文菜单（选中文本后显示）
    setupContextMenu() {
        // 创建上下文菜单
        const menu = document.createElement('div');
        menu.id = 'annotationContextMenu';
        menu.className = 'annotation-context-menu';
        document.body.appendChild(menu);
        
        // 隐藏菜单
        const hideMenu = () => {
            menu.classList.remove('show');
            this.currentLineIndex = null;
        };
        
        // 点击外部隐藏
        const handleClickOutside = (e) => {
            if (!e.target.closest('#annotationContextMenu')) {
                hideMenu();
            }
        };
        document.addEventListener('click', handleClickOutside);
        document.addEventListener('scroll', hideMenu, true);
        
        // 菜单点击事件
        menu.addEventListener('click', async (e) => {
            const item = e.target.closest('.annotation-menu-item');
            const color = e.target.closest('.color-option');
            
            if (item) {
                const action = item.dataset.action;
                await this.handleMenuAction(action);
                hideMenu();
            } else if (color) {
                const colorId = color.dataset.color;
                await this.handleColorClick(colorId);
            }
        });
        
        // 监听选中文本（桌面端和移动端）
        let selectionTimeout;
        const handleSelection = (e) => {
            clearTimeout(selectionTimeout);
            selectionTimeout = setTimeout(() => {
                const selection = window.getSelection();
                const text = selection.toString().trim();
                
                if (text && this.isInContent(e.target)) {
                    this.pendingSelection = this.saveSelectionInfo(selection);
                    this.pendingSelection.text = text;
                    this.pendingSelection.selectedText = text;
                    this.showContextMenu(menu, selection);
                }
            }, 50);
        };
        
        document.addEventListener('mouseup', handleSelection);
        
        // 移动端：监听选区变化
        let lastSelectionText = '';
        document.addEventListener('selectionchange', () => {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            
            // 只在有选区且文本变化时处理
            if (text && text !== lastSelectionText) {
                lastSelectionText = text;
                
                // 延迟检查，确保选区稳定
                clearTimeout(selectionTimeout);
                selectionTimeout = setTimeout(() => {
                    const currentSelection = window.getSelection();
                    const currentText = currentSelection.toString().trim();
                    
                    if (currentText === text && this.isInContent(currentSelection.anchorNode)) {
                        this.pendingSelection = this.saveSelectionInfo(currentSelection);
                        this.pendingSelection.text = text;
                        this.pendingSelection.selectedText = text;
                        
                        // 获取选区位置
                        try {
                            const range = currentSelection.getRangeAt(0);
                            this.showContextMenu(menu, currentSelection, window.innerWidth <= 768);
                        } catch (e) {
                            // 如果无法获取范围，使用长按目标
                            if (this.longPressTarget) {
                                this.showContextMenu(menu, null, true);
                            }
                        }
                    }
                }, 300);
            } else if (!text) {
                lastSelectionText = '';
            }
        });
        
        // 移动端支持：长按段落显示菜单
        let touchTimeout;
        let touchStartTime;
        
        const contentArea = document.getElementById('contentWrapper');
        if (contentArea) {
            // 阻止默认的上下文菜单
            contentArea.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            });
            
            contentArea.addEventListener('touchstart', (e) => {
                // 写死单指操作：只有单指触摸才触发标注
                if (e.touches.length !== 1) return;
                // 双指缩放时不触发标注
                if (window.LuminaPinchState?.isPinching) return;
                
                touchStartTime = Date.now();
                this.longPressTarget = e.target.closest('[data-index]');
                
                if (this.longPressTarget) {
                    touchTimeout = setTimeout(() => {
                        // 长按时获取选区或整行
                        const selection = window.getSelection();
                        const text = selection.toString().trim();
                        
                        if (text && this.isInSelection(this.longPressTarget)) {
                            // 有选区且包含当前行
                            this.pendingSelection = this.saveSelectionInfo(selection);
                            this.pendingSelection.text = text;
                            this.pendingSelection.selectedText = text;
                        } else {
                            // 无选区，使用整行
                            const lineIndex = parseInt(this.longPressTarget.dataset.index);
                            const lineText = this.longPressTarget.textContent.trim().substring(0, 100);
                            this.pendingSelection = {
                                startLine: lineIndex,
                                endLine: lineIndex,
                                text: lineText,
                                selectedText: lineText
                            };
                        }
                        
                        // 震动反馈
                        if (navigator.vibrate) navigator.vibrate(50);
                        
                        this.showContextMenu(menu, null, true);
                    }, 600);
                }
            }, { passive: false });
            
            contentArea.addEventListener('touchmove', () => {
                clearTimeout(touchTimeout);
            }, { passive: true });
            
            contentArea.addEventListener('touchend', () => {
                clearTimeout(touchTimeout);
            }, { passive: true });
        }
    },
    
    // 检查选区是否包含指定元素
    isInSelection(element) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return false;
        
        const range = selection.getRangeAt(0);
        return range.commonAncestorContainer.contains(element) || 
               element.contains(range.commonAncestorContainer);
    },
    
    // 显示上下文菜单
    showContextMenu(menu, selection, isMobile = false) {
        const t = Lumina.I18n.t;
        const lineIndex = this.pendingSelection?.startLine;
        if (lineIndex === undefined) return;
        
        // 查找当前行已有的注释/书签
        const chapterIndex = Lumina.State.app.currentChapterIndex;
        const existingBookmark = Lumina.State.app.annotations.find(
            a => a.chapterIndex === chapterIndex && 
                 a.type === 'bookmark' && 
                 a.lineIndex === lineIndex
        );
        const existingAnnotation = Lumina.State.app.annotations.find(
            a => a.chapterIndex === chapterIndex && 
                 a.type === 'annotation' && 
                 a.startLine === lineIndex
        );
        
        this.existingBookmark = existingBookmark;
        this.existingAnnotation = existingAnnotation;
        this.currentLineIndex = lineIndex;
        
        // 构建菜单内容
        let menuItems = '';
        
        // 【第一项】复制文本功能
        const selectedText = this.pendingSelection?.selectedText || '';
        if (selectedText) {
            menuItems += `
                <div class="annotation-menu-item" data-action="copy-text">
                    <svg class="icon"><use href="#icon-copy"/></svg>
                    <span>${t('copyText') || '复制文本'}</span>
                </div>
            `;
        }
        
        // 书签操作
        if (existingBookmark) {
            menuItems += `
                <div class="annotation-menu-item" data-action="delete-bookmark">
                    <svg class="icon"><use href="#icon-delete"/></svg>
                    <span>${t('deleteBookmark') || '删除书签'}</span>
                </div>
            `;
        }
        
        // 注释操作
        if (existingAnnotation) {
            menuItems += `
                <div class="annotation-menu-item" data-action="edit-annotation">
                    <svg class="icon"><use href="#icon-edit"/></svg>
                    <span>${t('editAnnotation') || '编辑注释'}</span>
                </div>
                <div class="annotation-menu-item" data-action="delete-annotation">
                    <svg class="icon"><use href="#icon-delete"/></svg>
                    <span>${t('deleteAnnotation') || '删除注释'}</span>
                </div>
            `;
        } else {
            menuItems += `
                <div class="annotation-menu-item" data-action="add-annotation">
                    <svg class="icon"><use href="#icon-edit"/></svg>
                    <span>${t('addAnnotation') || '添加注释'}</span>
                </div>
            `;
        }
        
        // 颜色选择器（用于书签）
        const currentColor = existingBookmark?.color || existingAnnotation?.color || 'yellow';
        menuItems += `
            <div class="annotation-color-picker">
                ${this.colors.map(c => `
                    <div class="color-option ${c.id === currentColor ? 'active' : ''}" 
                         data-color="${c.id}" 
                         style="background: ${c.bg}; border-color: ${c.border}">
                    </div>
                `).join('')}
            </div>
        `;
        
        menu.innerHTML = menuItems;
        
        // 定位菜单 - 优先使用选区位置
        let targetRect = null;
        
        // 首先尝试使用保存的选区位置信息
        if (this.pendingSelection?.selectionRect) {
            const rect = this.pendingSelection.selectionRect;
            if (rect.width > 0 && rect.height > 0) {
                targetRect = rect;
            }
        }
        
        // 如果没有保存的位置信息，尝试从 selection 获取
        if (!targetRect && selection) {
            try {
                const range = selection.getRangeAt(0);
                targetRect = range.getBoundingClientRect();
            } catch (e) {
                // ignore
            }
        }
        
        // 设置菜单位置
        if (targetRect && targetRect.width > 0) {
            // 使用选区位置（桌面端和移动端都使用选区位置）
            menu.style.position = 'fixed';
            menu.style.left = `${targetRect.left + targetRect.width / 2}px`;
            menu.style.top = `${targetRect.bottom + 10}px`;
            menu.style.bottom = 'auto';
            menu.style.transform = 'translateX(-50%)';
        } else if (isMobile && this.longPressTarget) {
            // 备用：使用长按目标位置
            const rect = this.longPressTarget.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.left = `${rect.left + rect.width / 2}px`;
            menu.style.top = `${rect.bottom + 10}px`;
            menu.style.bottom = 'auto';
            menu.style.transform = 'translateX(-50%)';
        }
        
        menu.classList.add('show');
    },
    
    // 处理颜色点击
    async handleColorClick(colorId) {
        const t = Lumina.I18n.t;
        
        if (this.existingBookmark) {
            // 更新书签颜色
            await this.updateAnnotation(this.existingBookmark.id, { color: colorId });
            Lumina.UI.showToast(t('bookmarkUpdated') || '书签已更新');
        } else if (this.existingAnnotation) {
            // 更新注释颜色
            await this.updateAnnotation(this.existingAnnotation.id, { color: colorId });
            Lumina.UI.showToast(t('annotationUpdated') || '注释已更新');
        } else {
            // 新建书签
            await this.addAnnotation({
                type: 'bookmark',
                chapterIndex: Lumina.State.app.currentChapterIndex,
                lineIndex: this.currentLineIndex,
                color: colorId,
                note: '',
                selectedText: ''
            });
            Lumina.UI.showToast(t('bookmarkAdded') || '书签已添加');
        }
        
        document.getElementById('annotationContextMenu').classList.remove('show');
        window.getSelection().removeAllRanges();
    },
    
    // 检查是否在内容区域
    isInContent(element) {
        if (!element) return false;
        // 如果是文本节点，获取其父元素
        const el = element.nodeType === Node.TEXT_NODE ? element.parentElement : element;
        return el?.closest('#contentWrapper') !== null;
    },
    
    // 保存选区信息
    saveSelectionInfo(selection) {
        const range = selection.getRangeAt(0);
        const startEl = range.startContainer.parentElement?.closest('[data-index]') || 
                       range.startContainer.closest?.('[data-index]');
        const endEl = range.endContainer.parentElement?.closest('[data-index]') || 
                     range.endContainer.closest?.('[data-index]');
        
        // 获取选区的精确文本内容
        const selectedText = selection.toString().trim();
        
        // 获取选区在文档中的位置信息（用于移动端定位菜单）
        const rect = range.getBoundingClientRect();
        
        return {
            startLine: startEl ? parseInt(startEl.dataset.index) : 0,
            endLine: endEl ? parseInt(endEl.dataset.index) : 0,
            startOffset: range.startOffset,
            endOffset: range.endOffset,
            startContainer: range.startContainer.nodeType === Node.TEXT_NODE ? 'text' : 'element',
            endContainer: range.endContainer.nodeType === Node.TEXT_NODE ? 'text' : 'element',
            selectedText: selectedText,
            // 选区位置信息（用于菜单位置）
            selectionRect: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height
            }
        };
    },
    
    // 处理菜单动作
    async handleMenuAction(action) {
        const t = Lumina.I18n.t;
        
        if (action === 'copy-text') {
            // 复制文本
            const textToCopy = this.pendingSelection?.selectedText || '';
            if (textToCopy) {
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    Lumina.UI.showToast(t('textCopied') || '文本已复制');
                } catch (err) {
                    // 备用复制方法
                    const textarea = document.createElement('textarea');
                    textarea.value = textToCopy;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    Lumina.UI.showToast(t('textCopied') || '文本已复制');
                }
            }
        } else if (action === 'add-annotation') {
            // 添加注释
            const color = this.colors.find(c => c.id === (this.existingBookmark?.color || 'yellow'));
            this.showAnnotationEditor(this.pendingSelection, color);
        } else if (action === 'edit-annotation') {
            // 编辑注释
            if (this.existingAnnotation) {
                const color = this.colors.find(c => c.id === this.existingAnnotation.color);
                this.showAnnotationEditor({
                    id: this.existingAnnotation.id,
                    text: this.existingAnnotation.selectedText,
                    note: this.existingAnnotation.note,
                    type: 'annotation',
                    startLine: this.existingAnnotation.startLine,
                    endLine: this.existingAnnotation.endLine
                }, color);
            }
        } else if (action === 'delete-annotation') {
            // 删除注释
            if (this.existingAnnotation) {
                Lumina.UI.showDialog(t('confirmDeleteAnnotation') || '确定删除此注释？', 'confirm', async (result) => {
                    if (result) {
                        await this.deleteAnnotation(this.existingAnnotation.id);
                        Lumina.UI.showToast(t('annotationDeleted') || '注释已删除');
                    }
                });
            }
        } else if (action === 'delete-bookmark') {
            // 删除书签
            if (this.existingBookmark) {
                Lumina.UI.showDialog(t('confirmDeleteBookmark') || '确定删除此书签？', 'confirm', async (result) => {
                    if (result) {
                        await this.deleteAnnotation(this.existingBookmark.id);
                        Lumina.UI.showToast(t('bookmarkDeleted') || '书签已删除');
                    }
                });
            }
        }
        
        // 清除选区
        window.getSelection().removeAllRanges();
    },
    
    // 添加注释
    async addAnnotation(annotation) {
        const anno = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            ...annotation,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        Lumina.State.app.annotations.push(anno);
        await this.saveAnnotations();
        this.renderAnnotations();
        this.renderAnnotationList();
    },
    
    // 更新注释
    async updateAnnotation(id, updates) {
        const anno = Lumina.State.app.annotations.find(a => a.id === id);
        if (anno) {
            Object.assign(anno, updates, { updatedAt: new Date().toISOString() });
            await this.saveAnnotations();
            this.renderAnnotations();
            this.renderAnnotationList();
        }
    },
    
    // 删除注释
    async deleteAnnotation(id) {
        Lumina.State.app.annotations = Lumina.State.app.annotations.filter(a => a.id !== id);
        await this.saveAnnotations();
        this.renderAnnotations();
        this.renderAnnotationList();
    },
    
    // 保存注释到数据库
    async saveAnnotations() {
        const fileKey = Lumina.State.app.currentFile.fileKey;
        if (!fileKey || !Lumina.State.app.dbReady) return;
        
        try {
            const fileData = await Lumina.DB.adapter.getFile(fileKey);
            if (fileData) {
                fileData.annotations = Lumina.State.app.annotations;
                fileData.lastReadTime = new Date().toISOString();
                await Lumina.DB.adapter.saveFile(fileKey, fileData);
            }
        } catch (e) {
            console.warn('[Annotations] 保存失败:', e);
        }
    },
    
    // 显示注释编辑器
    showAnnotationEditor(selection, color) {
        const t = Lumina.I18n.t;
        const isBookmark = selection.type === 'bookmark';
        
        const dialog = document.createElement('div');
        dialog.className = 'annotation-dialog-overlay';
        dialog.innerHTML = `
            <div class="annotation-dialog">
                <div class="annotation-dialog-header">
                    <span>${isBookmark ? (t('editBookmark') || '编辑书签') : (t('addAnnotation') || '添加注释')}</span>
                    <button class="annotation-dialog-close">
                        <svg class="icon"><use href="#icon-close"/></svg>
                    </button>
                </div>
                <div class="annotation-dialog-body">
                    <div class="annotation-selected-text">
                        "${selection.text || ''}"
                    </div>
                    <div class="annotation-color-picker-row">
                        ${this.colors.map(c => `
                            <div class="color-option-large ${c.id === color.id ? 'active' : ''}" 
                                 data-color="${c.id}" 
                                 style="background: ${c.bg}; border-color: ${c.border}">
                            </div>
                        `).join('')}
                    </div>
                    <textarea class="annotation-input" 
                              placeholder="${t('annotationPlaceholder') || '输入注释内容...'}"
                              rows="4">${selection.note || ''}</textarea>
                </div>
                <div class="annotation-dialog-footer">
                    <button class="annotation-btn annotation-btn-secondary" data-action="cancel">
                        ${t('cancel') || '取消'}
                    </button>
                    <button class="annotation-btn annotation-btn-primary" data-action="save" disabled>
                        ${t('save') || '保存'}
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // 颜色选择
        let selectedColor = color.id;
        dialog.querySelectorAll('.color-option-large').forEach(btn => {
            btn.addEventListener('click', () => {
                dialog.querySelectorAll('.color-option-large').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedColor = btn.dataset.color;
            });
        });
        
        // 按钮事件
        const saveBtn = dialog.querySelector('[data-action="save"]');
        const input = dialog.querySelector('.annotation-input');
        
        // 编辑模式下允许空内容（变成书签），新建模式需要内容
        const updateSaveButton = () => {
            const hasContent = input.value.trim().length > 0;
            if (selection.id) {
                // 编辑模式：始终可用
                saveBtn.disabled = false;
            } else {
                // 新建模式：需要内容
                saveBtn.disabled = !hasContent;
            }
        };
        
        // 初始状态检查
        updateSaveButton();
        
        // 监听输入
        input.addEventListener('input', updateSaveButton);
        
        dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.annotation-dialog-close').addEventListener('click', () => dialog.remove());
        saveBtn.addEventListener('click', async () => {
            const note = input.value.trim();
            
            if (selection.id) {
                // 编辑模式
                await this.updateAnnotation(selection.id, { note, color: selectedColor });
            } else {
                // 新建模式
                await this.addAnnotation({
                    type: note ? 'annotation' : 'bookmark',
                    chapterIndex: Lumina.State.app.currentChapterIndex,
                    startLine: selection.startLine,
                    endLine: selection.endLine,
                    selectedText: selection.text,
                    color: selectedColor,
                    note
                });
            }
            
            dialog.remove();
            Lumina.UI.showToast(t('annotationSaved') || '已保存');
        });
        
        // 点击遮罩关闭
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
        
        // ESC 关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                dialog.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    },
    
    // 渲染所有注释高亮
    renderAnnotations() {
        // 清除现有高亮和书签样式
        document.querySelectorAll('.has-bookmark').forEach(el => {
            el.classList.remove('has-bookmark');
            el.style.borderLeft = '';
            el.style.background = '';
        });
        
        // 清除注释高亮 - 恢复原始内容
        document.querySelectorAll('.has-annotation').forEach(el => {
            this.clearAnnotationHighlights(el);
            el.classList.remove('has-annotation');
            delete el.dataset.annotationId;
        });
        
        // 渲染当前章节的注释
        const chapterIndex = Lumina.State.app.currentChapterIndex;
        const chapter = Lumina.State.app.chapters[chapterIndex];
        if (!chapter) return;
        
        const chapterAnnotations = Lumina.State.app.annotations.filter(
            a => a.chapterIndex === chapterIndex
        );
        
        chapterAnnotations.forEach(anno => {
            if (anno.type === 'bookmark') {
                this.renderBookmark(anno);
            } else {
                this.renderAnnotationHighlight(anno);
            }
        });
    },
    
    // 渲染书签标记
    renderBookmark(anno) {
        const line = document.querySelector(`[data-index="${anno.lineIndex}"]`);
        if (!line) return;
        
        const color = this.colors.find(c => c.id === anno.color) || this.colors[0];
        line.classList.add('has-bookmark');
        line.style.borderLeft = `4px solid ${color.border}`;
        line.style.background = color.bg;
    },
    
    // 渲染注释高亮 - 使用下划线标注选区文本
    renderAnnotationHighlight(anno) {
        // 只在起始行添加标记（注释是针对选区文本的，不是整个段落）
        const line = document.querySelector(`[data-index="${anno.startLine}"]`);
        if (!line) return;
        
        const color = this.colors.find(c => c.id === anno.color) || this.colors[0];
        const selectedText = anno.selectedText;
        
        if (selectedText && selectedText.length > 0) {
            // 尝试在文本中查找并高亮选中的部分
            this.highlightSelectedText(line, selectedText, anno.color, anno.id);
        }
        
        // 添加标记类但不设置背景色
        line.classList.add('has-annotation');
        line.dataset.annotationId = anno.id;
    },
    
    // 高亮选中的文本
    highlightSelectedText(lineElement, selectedText, colorId, annoId) {
        if (!selectedText || !lineElement) return;
        
        // 保存原始内容（如果还没有保存）
        if (!lineElement.dataset.originalContent) {
            lineElement.dataset.originalContent = lineElement.innerHTML;
        }
        
        const colorClass = colorId || 'yellow';
        
        // 清理选中文本中的多余空白，以便更好地匹配
        const normalizedSearchText = selectedText.replace(/\s+/g, ' ').trim();
        if (!normalizedSearchText) return;
        
        // 尝试找到并替换文本
        // 策略：在文本节点中查找匹配的文本
        const walker = document.createTreeWalker(
            lineElement,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            // 跳过注释高亮内的文本节点
            if (node.parentElement?.classList?.contains('annotation-highlight')) {
                continue;
            }
            textNodes.push(node);
        }
        
        // 合并相邻文本节点进行查找
        let fullText = '';
        const nodeMap = [];
        textNodes.forEach(node => {
            nodeMap.push({
                node: node,
                start: fullText.length,
                end: fullText.length + node.textContent.length
            });
            fullText += node.textContent;
        });
        
        // 查找选中文本在合并后文本中的位置（使用原始文本或规范化文本）
        let matchIndex = fullText.indexOf(selectedText);
        let matchText = selectedText;
        
        // 如果直接查找失败，尝试规范化后的文本
        if (matchIndex === -1) {
            const normalizedFullText = fullText.replace(/\s+/g, ' ');
            matchIndex = normalizedFullText.indexOf(normalizedSearchText);
            if (matchIndex !== -1) {
                // 找到后，在原始文本中重新定位
                matchText = fullText.substring(matchIndex, matchIndex + normalizedSearchText.length);
            }
        }
        
        if (matchIndex !== -1) {
            const matchStart = matchIndex;
            const matchEnd = matchStart + matchText.length;
            
            // 找到包含匹配文本的节点
            let startNodeInfo = null;
            let endNodeInfo = null;
            
            for (const info of nodeMap) {
                if (!startNodeInfo && info.start <= matchStart && matchStart < info.end) {
                    startNodeInfo = info;
                }
                if (info.start < matchEnd && matchEnd <= info.end) {
                    endNodeInfo = info;
                    break;
                }
            }
            
            // 如果匹配在同一节点内，直接替换
            if (startNodeInfo && endNodeInfo && startNodeInfo.node === endNodeInfo.node) {
                const node = startNodeInfo.node;
                const text = node.textContent;
                const relativeStart = matchStart - startNodeInfo.start;
                const relativeEnd = matchEnd - startNodeInfo.start;
                
                const before = text.substring(0, relativeStart);
                const matchedContent = text.substring(relativeStart, relativeEnd);
                const after = text.substring(relativeEnd);
                
                const span = document.createElement('span');
                span.className = `annotation-highlight ${colorClass}`;
                span.dataset.annotationId = annoId;
                span.textContent = matchedContent;
                
                const parent = node.parentNode;
                if (before) parent.insertBefore(document.createTextNode(before), node);
                parent.insertBefore(span, node);
                if (after) parent.insertBefore(document.createTextNode(after), node);
                parent.removeChild(node);
            }
        }
    },
    
    // 清除注释高亮
    clearAnnotationHighlights(lineElement) {
        if (!lineElement || !lineElement.dataset.originalContent) return;
        
        // 恢复原始内容
        lineElement.innerHTML = lineElement.dataset.originalContent;
        delete lineElement.dataset.originalContent;
    },
    
    // 设置悬浮提示（使用事件委托）- 仅注释
    setupTooltipDelegation() {
        const contentArea = document.getElementById('contentWrapper');
        if (!contentArea) return;
        
        // 鼠标进入 - 仅处理注释
        contentArea.addEventListener('mouseenter', (e) => {
            const line = e.target.closest('[data-annotation-id].has-annotation');
            if (!line) return;
            
            const annoId = line.dataset.annotationId;
            const chapterIndex = Lumina.State.app.currentChapterIndex;
            
            // 查找注释（仅注释类型）
            const anno = Lumina.State.app.annotations.find(
                a => a.chapterIndex === chapterIndex && 
                     a.id === annoId && 
                     a.type === 'annotation'
            );
            
            if (anno) {
                this.showAnnotationTooltip(line, anno);
            }
        }, true);
        
        // 鼠标离开
        contentArea.addEventListener('mouseleave', (e) => {
            const line = e.target.closest('[data-annotation-id].has-annotation');
            if (line) {
                this.hideAnnotationTooltip();
            }
        }, true);
        
        // 鼠标移动
        contentArea.addEventListener('mousemove', (e) => {
            if (this.currentTooltipAnno) {
                this.updateAnnotationTooltipPosition(e);
            }
        });
    },
    
    // 显示注释 tooltip
    showAnnotationTooltip(target, anno) {
        let tooltip = document.getElementById('annotation-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'annotation-tooltip';
            tooltip.className = 'annotation-tooltip';
            document.body.appendChild(tooltip);
        }
        
        // 格式化时间
        const date = new Date(anno.createdAt || Date.now());
        const dateStr = date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // 构建 tooltip 内容：时间 + 注释内容
        let content = `<div class="annotation-tooltip-time">${Lumina.I18n.t('annotatedAt')} ${dateStr}</div>`;
        if (anno.note) {
            // 限制长度
            const noteText = anno.note.length > 100 
                ? anno.note.substring(0, 100) + '...' 
                : anno.note;
            content += `<div class="annotation-tooltip-note">${Lumina.Utils.escapeHtml(noteText)}</div>`;
        }
        
        tooltip.innerHTML = content;
        tooltip.classList.add('show');
        
        // 保存当前注释
        this.currentTooltipAnno = anno;
    },
    
    // 隐藏注释 tooltip
    hideAnnotationTooltip() {
        const tooltip = document.getElementById('annotation-tooltip');
        if (tooltip) {
            tooltip.classList.remove('show');
        }
        this.currentTooltipAnno = null;
    },
    
    // 更新 tooltip 位置
    updateAnnotationTooltipPosition(e) {
        const tooltip = document.getElementById('annotation-tooltip');
        if (!tooltip || !this.currentTooltipAnno) return;
        
        const tooltipRect = tooltip.getBoundingClientRect();
        const offset = 15;
        
        let left = e.clientX + offset;
        let top = e.clientY + offset;
        
        // 防止超出屏幕右边界
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = e.clientX - tooltipRect.width - offset;
        }
        
        // 防止超出屏幕下边界
        if (top + tooltipRect.height > window.innerHeight - 10) {
            top = e.clientY - tooltipRect.height - offset;
        }
        
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    },
    
    // 设置注释面板
    setupPanel() {
        // 在设置面板旁边添加注释面板
        const panel = document.createElement('aside');
        panel.className = 'panel annotation-panel';
        panel.id = 'annotationPanel';
        panel.innerHTML = `
            <div class="panel-header">
                <span class="panel-title" data-i18n="annotations">注释与书签</span>
                <button class="btn-icon" id="closeAnnotationPanel" data-i18n-tooltip="close">
                    <svg class="icon"><use href="#icon-close"/></svg>
                </button>
            </div>
            <div class="annotation-list" id="annotationList">
                <div class="annotation-empty">
                    <svg class="icon"><use href="#icon-bookmark"/></svg>
                    <div data-i18n="noAnnotations">暂无注释或书签</div>
                    <div class="annotation-hint" data-i18n="annotationHint">选中文本添加注释，或点击添加书签</div>
                </div>
            </div>
        `;
        document.querySelector('.main-frame').appendChild(panel);
        
        // 关闭按钮
        document.getElementById('closeAnnotationPanel').addEventListener('click', () => {
            panel.classList.remove('open');
        });
    },
    
    // 渲染注释列表
    renderAnnotationList() {
        const list = document.getElementById('annotationList');
        const annotations = Lumina.State.app.annotations;
        const t = Lumina.I18n.t;
        
        if (!annotations.length) {
            list.innerHTML = `
                <div class="annotation-empty">
                    <svg class="icon"><use href="#icon-bookmark"/></svg>
                    <div>${t('noAnnotations') || '暂无注释或书签'}</div>
                    <div class="annotation-hint">${t('annotationHint') || '选中文本添加注释，或点击添加书签'}</div>
                </div>
            `;
            return;
        }
        
        // 按章节分组
        const grouped = {};
        annotations.forEach(anno => {
            if (!grouped[anno.chapterIndex]) grouped[anno.chapterIndex] = [];
            grouped[anno.chapterIndex].push(anno);
        });
        
        let html = '';
        Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b)).forEach(chIdx => {
            const chapter = Lumina.State.app.chapters[chIdx];
            const title = chapter ? (chapter.title || `第${parseInt(chIdx)+1}章`) : `第${parseInt(chIdx)+1}章`;
            
            html += `<div class="annotation-group">`;
            html += `<div class="annotation-group-title">${Lumina.Utils.escapeHtml(title)}</div>`;
            
            grouped[chIdx].forEach(anno => {
                const color = this.colors.find(c => c.id === anno.color) || this.colors[0];
                const isBookmark = anno.type === 'bookmark';
                
                html += `
                    <div class="annotation-item ${isBookmark ? 'bookmark' : 'annotation'}" data-id="${anno.id}">
                        <div class="annotation-marker" style="background: ${color.border}"></div>
                        <div class="annotation-content">
                            ${!isBookmark ? `<div class="annotation-text">"${Lumina.Utils.escapeHtml((anno.selectedText || '').substring(0, 50))}${(anno.selectedText || '').length > 50 ? '...' : ''}"</div>` : ''}
                            ${anno.note ? `<div class="annotation-note">${Lumina.Utils.escapeHtml(anno.note)}</div>` : ''}
                            ${isBookmark ? `<div class="annotation-note annotation-bookmark-label">${t('bookmark') || '书签'}</div>` : ''}
                        </div>
                        <div class="annotation-actions">
                            <button class="annotation-action-btn" data-action="edit" data-tooltip-text="${t('edit')}">
                                <svg class="icon"><use href="#icon-edit"/></svg>
                            </button>
                            <button class="annotation-action-btn" data-action="delete" data-tooltip-text="${t('delete')}">
                                <svg class="icon"><use href="#icon-delete"/></svg>
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += `</div>`;
        });
        
        list.innerHTML = html;
        
        // 绑定事件
        list.querySelectorAll('.annotation-item').forEach(item => {
            const id = item.dataset.id;
            const anno = annotations.find(a => a.id === id);
            
            // 点击跳转
            item.addEventListener('click', (e) => {
                if (e.target.closest('.annotation-actions')) return;
                if (anno) {
                    Lumina.Actions.navigateToChapter(anno.chapterIndex, anno.lineIndex || anno.startLine);
                    document.getElementById('annotationPanel').classList.remove('open');
                }
            });
            
            // 编辑
            item.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
                if (anno) {
                    const color = this.colors.find(c => c.id === anno.color) || this.colors[0];
                    this.showAnnotationEditor({
                        id: anno.id,
                        text: anno.selectedText,
                        note: anno.note,
                        type: anno.type,
                        ...anno
                    }, color);
                }
            });
            
            // 删除
            item.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
                Lumina.UI.showDialog(t('confirmDeleteAnnotation') || '确定删除此标记？', 'confirm', async (result) => {
                    if (result) await this.deleteAnnotation(id);
                });
            });
        });
    },
    
    // 打开面板
    openPanel() {
        this.renderAnnotationList();
        document.getElementById('annotationPanel').classList.add('open');
    },
    
    // 切换面板（toggle）
    togglePanel() {
        const panel = document.getElementById('annotationPanel');
        if (panel.classList.contains('open')) {
            panel.classList.remove('open');
        } else {
            this.openPanel();
        }
    },
    
    // 关闭面板
    closePanel() {
        document.getElementById('annotationPanel')?.classList.remove('open');
    }
};

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

    if (!Lumina.State.app.document.items.length) {
        Lumina.DOM.sidebarLeft.classList.remove('visible');
        Lumina.DOM.readingArea.classList.remove('with-sidebar');
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