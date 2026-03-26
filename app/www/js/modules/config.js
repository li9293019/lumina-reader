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
    // 检测运行环境
    const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
    // file:// 协议下加载本地 CSS 会触发 CORS，需要禁用
    const isFileProtocol = typeof window !== 'undefined' && window.location?.protocol === 'file:';
    
    // APP 环境：使用系统字体 + 本地字体
    if (isApp) {
        return {
            serif: {
                family: '"LXGW Neo Zhi Song", "Noto Serif SC", "Source Han Serif SC", "SimSun", "STSong", serif',
                url: isFileProtocol ? null : './assets/fonts/LXGWNeoZhiSong.css', // file协议下禁用避免CORS
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
                url: isFileProtocol ? null : './assets/fonts/lxgwwenkai.css', // file协议下禁用避免CORS
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
            url: null,  // CDN已移除，使用系统字体
            preload: true,
            fallback: 'sans-serif',
            metrics: { sizeAdjust: '100%', ascentOverride: '88%', descentOverride: '22%', lineGapOverride: '0%' }
        },
        kai: {
            family: '"LXGW WenKai", "KaiTi", "STKaiti", serif',
            url: isFileProtocol ? null : './assets/fonts/lxgwwenkai.css',
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
    paragraphSpacing: 3,
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
    encryptedExport: false,
    paginationMaxWords: 3000,
    paginationImageWords: 300,
};

Lumina.Config.regexPatterns = {
    chineseChapter: /^<?第\s*[一二三四五六七八九十百千万零〇\d]+\s*[章卷]>?\s*[:\-]?\s*(.*)/i,
    englishChapter: /^(Chapter|Chap|Part|Book)\s*(\d+[\.:\-]?\d*)\s*[:\-]?\s*(.*)/i,
    sectionDash: /^<?(\d+)[\-–—\.](\d+)\s*[:\-]?>?\s*(.*)/,
    sectionCn: /^<?第\s*[一二三四五六七八九十百千万零〇\d]+\s*[节集]>?\s*[:\-]?\s*(.*)/i,
    sectionEn: /^Section\s*(\d+)\s*[:\-]?\s*(.*)/i,
    specialTitles: /^<?(阅读须知|版权说明|引言|序言|前言|楔子|尾声|创作后记|后记|附录|Introduction|Prologue|Preface|Epilogue)[:：]?(.*)>?$/i,
    mdHeading: /^(#{1,6})\s+(.+)$/,
    titleTag: /^\[T\]/i,
    subtitleTag: /^\[S\]/i
};

Lumina.Config.pagination = {
    enabled: true,             // 总开关，设为 false 则每章显示为单页，无分页导航
    maxReadingWords: 3000,             // 单页最大字数（约一屏阅读量，可调整）
    imageEquivalentWords: 300   // 图片等效字数（1张图 ≈ 300字，避免图片过多撑爆页面）
};

