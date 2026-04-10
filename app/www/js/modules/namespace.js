// ==================== 根命名空间 ====================
const Lumina = window.Lumina || {
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

// 绑定到全局 window 对象
window.Lumina = Lumina;

