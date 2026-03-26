// ==================== Markdown 插件入口 ====================
// 插件化集成，通过钩子系统扩展核心功能
// 无此插件时，Markdown 文件按纯文本解析

Lumina.Plugin = Lumina.Plugin || {};
Lumina.Plugin.Markdown = Lumina.Plugin.Markdown || {};

// 保留已有的 Parser 和 Renderer，合并插件配置
Object.assign(Lumina.Plugin.Markdown, {
    name: 'markdown',
    version: '1.0.0',
    description: 'Markdown 富文本渲染支持',
    
    // 配置
    config: {
        // 代码高亮
        codeHighlight: {
            enabled: true,
            cdn: {
                js: 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js',
                autoloader: 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js',
                theme: 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css'
            },
            local: {
                js: './js/plugins/markdown/lib/prism/prism.min.js',
                themeDir: './js/plugins/markdown/lib/prism/themes/'
            }
        },
        // 默认启用
        enabledByDefault: true
    },

    /**
     * 插件初始化
     */
    init() {
        // console.log('[Markdown Plugin] 初始化...');
        
        // 确保依赖已加载
        if (!Lumina.Plugin.Markdown.Parser || !Lumina.Plugin.Markdown.Renderer) {
            console.error('[Markdown Plugin] 依赖未加载：Parser 或 Renderer 不存在');
            return;
        }
        
        // 注册钩子
        this.registerHooks();
        
        // 初始化代码高亮（异步，不阻塞）
        if (this.config.codeHighlight.enabled) {
            Lumina.Plugin.Markdown.Renderer.initHighlighter().catch(() => {
                // 失败也没关系
            });
        }
        
        // 监听主题切换
        this.observeThemeChange();
        
        // console.log('[Markdown Plugin] 已就绪');
    },

    /**
     * 监听主题切换，动态更新代码高亮主题
     */
    observeThemeChange() {
        // 监听 html 元素的 data-theme 属性变化
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                    // 主题变化时，重新加载代码高亮主题
                    this.updateCodeHighlightTheme();
                }
            });
        });
        
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    },

    /**
     * 更新代码高亮主题
     */
    async updateCodeHighlightTheme() {
        const Renderer = Lumina.Plugin.Markdown.Renderer;
        if (!Renderer.highlightState.loaded) return;
        
        const newTheme = Renderer.getCurrentTheme();
        const oldLink = document.querySelector('link[data-prism-theme]');
        
        if (oldLink) {
            // 如果主题没变，不需要重新加载
            if (oldLink.getAttribute('data-prism-theme') === newTheme) return;
            oldLink.remove();
        }
        
        // 加载新主题
        try {
            await Renderer.loadCSS(`./js/plugins/markdown/lib/prism/themes/${newTheme}.css`, 'data-prism-theme', newTheme);
            // console.log('[Markdown] 代码高亮主题已更新:', newTheme);
        } catch (e) {
            // console.log('[Markdown] 代码高亮主题更新失败:', e);
        }
    },

    /**
     * 注册钩子
     */
    registerHooks() {
        // 1. beforeParse - 检测 Markdown 文件并接管解析
        Lumina.PluginManager.registerHook('beforeParse', (file, content) => {
            if (this.isMarkdownFile(file)) {
                const parsed = Lumina.Plugin.Markdown.Parser.parse(content);
                return {
                    handled: true,
                    data: parsed
                };
            }
            return null;  // 不处理，让默认解析器接手
        }, 1);  // 高优先级

        // 2. createElement - 自定义 Markdown 元素渲染
        Lumina.PluginManager.registerHook('createElement', (item, index) => {
            if (this.isMarkdownItem(item)) {
                return Lumina.Plugin.Markdown.Renderer.render(item, index);
            }
            return null;  // 不处理，使用默认渲染
        }, 1);
    },

    /**
     * 判断是否是 Markdown 文件
     */
    isMarkdownFile(file) {
        if (!file) return false;
        
        // 通过文件名判断
        const name = file.name || '';
        if (name.endsWith('.md') || name.endsWith('.markdown') || 
            name.endsWith('.mdown') || name.endsWith('.mkd')) {
            return true;
        }
        
        // 通过扩展名判断
        const ext = name.split('.').pop()?.toLowerCase();
        return ['md', 'markdown', 'mdown', 'mkd'].includes(ext);
    },

    /**
     * 判断 item 是否是 Markdown 格式
     * 严格判断：必须有 raw 字段（原始 markdown 文本）
     */
    isMarkdownItem(item) {
        if (!item) return false;
        // 必须有 raw 字段（markdown 解析时保留的原始文本）
        if (!item.raw) return false;
        // 特定类型
        const mdTypes = ['heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
                        'blockquote', 'codeblock', 'list', 'table', 'hr', 'paragraph'];
        return mdTypes.includes(item.type);
    },

    /**
     * 获取纯文本（用于搜索、TTS 等）
     * @param {Object} item - Markdown item
     * @returns {string} - 纯文本
     */
    getPlainText(item) {
        if (!item) return '';
        
        // 直接有 text 字段
        if (item.text) return item.text;
        
        // 从 inlineContent 提取
        if (item.inlineContent) {
            return this.extractTextFromInline(item.inlineContent);
        }
        
        return '';
    },

    /**
     * 从 inlineContent 提取纯文本
     */
    extractTextFromInline(inlineContent) {
        if (!inlineContent || !Array.isArray(inlineContent)) return '';
        
        return inlineContent.map(item => {
            switch (item.type) {
                case 'text':
                case 'strong':
                case 'em':
                case 'del':
                case 'code':
                    return item.content || '';
                case 'link':
                    return item.content || item.href || '';
                case 'image':
                    return item.alt || '';
                default:
                    return '';
            }
        }).join('');
    }
});

// 自动注册插件（如果 PluginManager 存在）
if (Lumina.PluginManager) {
    Lumina.PluginManager.register(Lumina.Plugin.Markdown);
}
