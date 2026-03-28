// ==================== Markdown 渲染器 ====================
// 将解析后的 Markdown 数据渲染为 DOM
// 支持代码高亮（CDN优先，本地备用）

Lumina.Plugin = Lumina.Plugin || {};
Lumina.Plugin.Markdown = Lumina.Plugin.Markdown || {};

Lumina.Plugin.Markdown.Renderer = {
    // 代码高亮状态
    highlightState: {
        loaded: false,
        source: null,  // 'cdn', 'local', null
        Prism: null
    },

    /**
     * 初始化代码高亮
     * 纯本地策略：使用本地 PrismJS，根据主题自动匹配
     */
    async initHighlighter() {
        if (this.highlightState.loaded) return;

        try {
            // 如果 Prism 已存在（可能之前加载过），直接复用
            if (window.Prism) {
                this.highlightState = { loaded: true, source: 'local', Prism: window.Prism };
                // console.log('[Markdown] 复用已加载的 Prism');
                return;
            }

            // 加载 PrismJS 核心
            // console.log('[Markdown] 开始加载 PrismJS...');
            await this.loadScript('./js/plugins/markdown/lib/prism/prism.min.js');
            
            // 根据当前主题加载对应代码高亮主题
            const theme = this.getCurrentTheme();
            // console.log('[Markdown] 加载代码高亮主题:', theme);
            await this.loadCSS(`./js/plugins/markdown/lib/prism/themes/${theme}.css`, 'data-prism-theme', theme);
            
            this.highlightState = { loaded: true, source: 'local', Prism: window.Prism };
            // console.log('[Markdown] 代码高亮已加载 (主题: ' + theme + ')');
        } catch (e) {
            console.error('[Markdown] 代码高亮加载失败:', e);
            this.highlightState = { loaded: false, source: null, Prism: null };
        }
    },

    /**
     * 获取当前代码高亮主题
     * 与阅读器20种主题联动
     */
    getCurrentTheme() {
        // 获取阅读器当前主题设置
        const config = Lumina.ConfigManager?.load() || { reading: { theme: 'light' } };
        const theme = config.reading?.theme || 'light';
        
        // 阅读器20个主题到代码高亮主题的映射
        // 分类依据：
        // 1. 浅色主题(bg-primary亮度高) -> 浅色代码主题
        // 2. 深色主题(bg-primary亮度低) -> 深色代码主题
        // 3. 暖色调 -> 因为增加了插件系统，项目的文件架构变了，你可以帮我检查和更新一下git的README.md吗one-dark(暖)
        // 4. 冷色调 -> default-light / okaidia(冷)
        const themeMap = {
            /* ========== 浅色主题 (7个) ========== */
            'light': 'one-light',           // 纯白 -> 明亮
            'parchment': 'solarized-light',       // 羊皮纸(暖黄) -> 暖色
            'sprout': 'one-light',          // 春芽(淡绿) -> 明亮
            'slate': 'default-light',       // 青石灰(冷灰) -> 标准浅色
            'mist': 'default-light',        // 迷雾蓝(淡蓝) -> 标准浅色
            'mint': 'one-light',            // 薄荷青(淡青) -> 明亮
            'rose': 'solarized-light',            // 玫瑰纸(淡粉) -> 暖色
            
            /* ========== 深色主题 (8个) ========== */
            'espresso': 'one-dark',         // 黑咖啡(暖棕) -> 暖暗
            'dark': 'one-dark',             // 极夜(标准深灰) -> 标准暗色
            'amoled': 'one-dark',           // 墨夜(纯黑) -> 标准暗色
            'midnight': 'okaidia',          // 午夜蓝(深蓝) -> 冷调暗色
            'nebula': 'twilight',            // 星云紫(深紫) -> 冷调暗色
            'dusk': 'twilight',              // 黄昏暮光(暗紫) -> 冷调暗色
            'mauve': 'okaidia',             // 藕荷(粉紫) -> 冷调暗色
            'taupe': 'tomorrow',            // 灰褐(暖棕灰) -> 暖暗
            
            /* ========== 中间调主题 (5个) ========== */
            // 这些主题背景色介于深浅之间，根据具体色调选择
            'olive': 'tomorrow',            // 橄榄灰(中绿灰) -> 较亮暗色
            'straw': 'solarized-light',     // 稻草(浅黄褐) -> 暖色（较亮）
            'terracotta': 'tomorrow',       // 赤陶(中橙) -> 暖色
            'sandstone': 'default-light',           // 砂石(银灰) -> 明亮主题
        };
        
        const codeTheme = themeMap[theme] || 'one-light';
        // console.log('[Markdown] 代码高亮主题映射:', theme, '->', codeTheme);
        return codeTheme;
    },

    /**
     * 动态加载脚本
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    },

    /**
     * 动态加载 CSS
     * @param {string} href - CSS 路径
     * @param {string} dataAttr - 可选的数据属性名
     * @param {string} dataValue - 可选的数据属性值
     */
    loadCSS(href, dataAttr = null, dataValue = null) {
        return new Promise((resolve, reject) => {
            // 检查是否已加载相同主题的 CSS
            if (dataAttr && dataValue) {
                const existing = document.querySelector(`link[${dataAttr}="${dataValue}"]`);
                if (existing) {
                    // console.log('[Markdown] CSS 主题已加载:', dataValue);
                    resolve();
                    return;
                }
            }
            
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            if (dataAttr) {
                link.setAttribute(dataAttr, dataValue);
            }
            link.onload = () => {
                // console.log('[Markdown] CSS 加载成功:', href);
                resolve();
            };
            link.onerror = (e) => {
                console.error('[Markdown] CSS 加载失败:', href, e);
                reject(new Error(`Failed to load ${href}`));
            };
            document.head.appendChild(link);
        });
    },

    /**
     * 主渲染入口
     * @param {Object} item - 解析后的 item
     * @param {number} index - 全局索引
     * @returns {HTMLElement} - DOM 元素
     */
    render(item, index) {
        if (!item || !item.type) return null;

        const div = document.createElement('div');
        // 只有当前文件是 MD 文件时才添加 markdown-body 类
        const isMdFile = Lumina.State?.app?.currentFile?.type === 'md';
        div.className = isMdFile ? 'doc-line markdown-body' : 'doc-line';
        div.dataset.index = index;

        switch (item.type) {
            case 'heading1':
            case 'heading2':
            case 'heading3':
            case 'heading4':
            case 'heading5':
            case 'heading6':
                this.renderHeading(div, item);
                break;
            case 'paragraph':
                this.renderParagraph(div, item);
                break;
            case 'blockquote':
                this.renderBlockquote(div, item);
                break;
            case 'codeblock':
                this.renderCodeBlock(div, item);
                break;
            case 'list':
                this.renderList(div, item);
                break;
            case 'table':
                this.renderTable(div, item);
                break;
            case 'hr':
                this.renderHR(div);
                break;
            default:
                // 未知类型，按纯文本处理
                div.textContent = item.text || '';
        }

        return div;
    },

    /**
     * 渲染标题
     */
    renderHeading(container, item) {
        const h = document.createElement(`h${item.level}`);
        h.className = `markdown-heading markdown-h${item.level}`;
        
        // 渲染行内内容
        if (item.inlineContent) {
            this.renderInlineContent(h, item.inlineContent);
        } else {
            h.textContent = item.text;
        }
        
        container.appendChild(h);
    },

    /**
     * 渲染段落
     */
    renderParagraph(container, item) {
        const p = document.createElement('p');
        p.className = 'markdown-paragraph';
        
        // 检查是否有图片独占一行（作为块级图片）
        if (item.inlineContent && 
            item.inlineContent.length === 1 && 
            item.inlineContent[0].type === 'image') {
            this.renderBlockImage(container, item.inlineContent[0]);
            return;
        }
        
        if (item.inlineContent) {
            this.renderInlineContent(p, item.inlineContent);
        } else {
            p.textContent = item.text;
        }
        
        container.appendChild(p);
    },

    /**
     * 渲染块级图片
     */
    renderBlockImage(container, imgItem) {
        const figure = document.createElement('figure');
        figure.className = 'markdown-figure';
        
        const img = document.createElement('img');
        img.src = imgItem.src;
        img.alt = imgItem.alt;
        img.className = 'markdown-image';
        img.loading = 'lazy';
        
        // 点击放大
        img.onclick = () => {
            if (Lumina.UI && Lumina.UI.viewImageFull) {
                Lumina.UI.viewImageFull(imgItem.src, imgItem.alt);
            }
        };
        
        figure.appendChild(img);
        
        // 图片标题
        if (imgItem.title || imgItem.alt) {
            const figcaption = document.createElement('figcaption');
            figcaption.className = 'markdown-figcaption';
            figcaption.textContent = imgItem.title || imgItem.alt;
            figure.appendChild(figcaption);
        }
        
        container.appendChild(figure);
    },

    /**
     * 渲染引用块
     * 支持多行换行，多行文本按行分割渲染保持结构
     */
    renderBlockquote(container, item) {
        const blockquote = document.createElement('blockquote');
        blockquote.className = 'markdown-blockquote';
        
        // 如果有嵌套解析的 items（块级结构如列表、代码块），递归渲染
        if (item.items && item.items.length > 0) {
            item.items.forEach((subItem, idx) => {
                // 处理段落类型的换行：如果段落的原始文本包含换行，分割成多行段落
                if (subItem.type === 'paragraph' && subItem.raw && subItem.raw.includes('\n')) {
                    // 使用已有的 inlineContent 来保留格式，通过换行符分割
                    this.renderParagraphWithLineBreaks(blockquote, subItem);
                } else {
                    const child = this.render(subItem, -1);  // 不设置索引
                    if (child) {
                        // 移除 doc-line 类，避免重复
                        child.classList.remove('doc-line');
                        blockquote.appendChild(child);
                    }
                }
            });
        } else if (item.text) {
            // 文本内容：按行分割，每行一个段落，保留换行结构
            const lines = item.text.split('\n').filter((line, idx, arr) => {
                // 保留非空行，以及中间的空白行
                return line.trim() || idx < arr.length - 1;
            });
            
            if (lines.length === 0) {
                // 空引用
                blockquote.innerHTML = '<br>';
            } else if (lines.length === 1) {
                // 单行：直接渲染，保留行内格式
                const p = document.createElement('p');
                p.className = 'markdown-paragraph';
                const inlineContent = Lumina.Plugin.Markdown.Parser.parseInline(lines[0]);
                this.renderInlineContent(p, inlineContent);
                p.style.margin = '0';
                blockquote.appendChild(p);
            } else {
                // 多行：每行一个段落，保留行内格式
                lines.forEach((line) => {
                    const p = document.createElement('p');
                    p.className = 'markdown-paragraph';
                    // 解析行内格式（加粗、斜体等）
                    const inlineContent = Lumina.Plugin.Markdown.Parser.parseInline(line);
                    this.renderInlineContent(p, inlineContent);
                    p.style.margin = '0.2em 0';
                    blockquote.appendChild(p);
                });
            }
        } else {
            // 空引用
            blockquote.innerHTML = '<br>';
        }
        
        container.appendChild(blockquote);
    },

    /**
     * 渲染包含换行的段落，保留行内格式
     * 基于已有的 inlineContent 分割，而不是重新解析
     */
    renderParagraphWithLineBreaks(container, item) {
        if (!item.inlineContent || !item.inlineContent.length) {
            // 没有 inlineContent，回退到普通渲染
            const p = document.createElement('p');
            p.className = 'markdown-paragraph';
            p.textContent = item.text || '';
            p.style.margin = '0.2em 0';
            container.appendChild(p);
            return;
        }

        // 重建原始文本，记录每个字符对应的 inlineContent 索引
        let fullText = '';
        const charMapping = []; // 记录每个字符来自哪个 inlineContent 项
        
        item.inlineContent.forEach((contentItem, idx) => {
            const text = contentItem.content || '';
            for (let i = 0; i < text.length; i++) {
                charMapping.push(idx);
            }
            fullText += text;
        });

        // 按换行符分割文本位置
        const lineRanges = [];
        let start = 0;
        for (let i = 0; i < fullText.length; i++) {
            if (fullText[i] === '\n') {
                if (i > start) {
                    lineRanges.push({ start, end: i });
                }
                start = i + 1;
            }
        }
        if (start < fullText.length) {
            lineRanges.push({ start, end: fullText.length });
        }

        // 为每一行创建段落
        lineRanges.forEach(range => {
            const p = document.createElement('p');
            p.className = 'markdown-paragraph';
            p.style.margin = '0.2em 0';

            // 收集这一行涉及的 inlineContent 索引
            const usedIndices = new Set();
            for (let i = range.start; i < range.end; i++) {
                if (charMapping[i] !== undefined) {
                    usedIndices.add(charMapping[i]);
                }
            }

            // 按顺序渲染涉及的 inlineContent 项
            const sortedIndices = Array.from(usedIndices).sort((a, b) => a - b);
            if (sortedIndices.length === 0) {
                p.innerHTML = '<br>';
            } else {
                // 提取这一行对应的 inlineContent 片段
                const lineContent = sortedIndices.map(idx => item.inlineContent[idx]);
                this.renderInlineContent(p, lineContent);
            }

            container.appendChild(p);
        });
    },

    /**
     * 渲染代码块
     */
    renderCodeBlock(container, item) {
        // 创建代码块容器（用于定位语言标签）
        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-code-wrapper';
        if (item.language) {
            wrapper.setAttribute('data-lang', item.language.toUpperCase());
        }
        
        const pre = document.createElement('pre');
        pre.className = 'markdown-pre';
        if (item.language) {
            pre.classList.add(`language-${item.language}`);
        }
        
        const code = document.createElement('code');
        code.className = 'markdown-code';
        if (item.language) {
            code.classList.add(`language-${item.language}`);
        }
        
        // 转义 HTML 特殊字符
        code.textContent = item.text;
        
        pre.appendChild(code);
        wrapper.appendChild(pre);
        container.appendChild(wrapper);
        
        // 异步尝试高亮
        this.highlightCodeElement(code);
    },

    /**
     * 已加载的语言组件缓存
     */
    loadedLanguages: new Set(['markup', 'html', 'xml', 'mathml', 'svg']), // markup 是基础
    
    /**
     * 加载指定语言的 PrismJS 组件
     */
    async loadLanguageComponent(lang) {
        if (!lang || this.loadedLanguages.has(lang)) return;
        
        // 语言别名映射
        const aliasMap = {
            'js': 'javascript',
            'ts': 'typescript',
            'py': 'python',
            'sh': 'bash',
            'shell': 'bash',
            'yml': 'yaml',
            'md': 'markdown',
            'html': 'markup',
            'xml': 'markup',
            'htm': 'markup'
        };
        
        const actualLang = aliasMap[lang] || lang;
        if (this.loadedLanguages.has(actualLang)) return;
        
        try {
            await this.loadScript(`./js/plugins/markdown/lib/prism/components/prism-${actualLang}.min.js`);
            this.loadedLanguages.add(actualLang);
            // console.log('[Markdown] 语言组件加载成功:', actualLang);
        } catch (e) {
            // console.log('[Markdown] 语言组件加载失败:', actualLang, e.message);
        }
    },

    /**
     * 高亮单个代码元素
     */
    async highlightCodeElement(codeElement) {
        // console.log('[Markdown] 尝试高亮代码块:', codeElement.className);
        
        // 等待高亮库就绪
        if (!this.highlightState.loaded) {
            // console.log('[Markdown] 高亮库未加载，尝试初始化...');
            await this.initHighlighter();
        }
        
        if (this.highlightState.loaded && this.highlightState.Prism) {
            try {
                // 检查语言
                const langClass = Array.from(codeElement.classList).find(c => c.startsWith('language-'));
                const lang = langClass ? langClass.replace('language-', '') : '';
                
                // 先加载语言组件（如果有指定语言）
                if (lang) {
                    await this.loadLanguageComponent(lang);
                }
                
                // console.log('[Markdown] Prism 高亮:', lang || '纯文本');
                
                // 调用 Prism 高亮
                this.highlightState.Prism.highlightElement(codeElement);
                
                // 检查高亮是否生效
                const hasTokens = codeElement.querySelector('.token');
                if (hasTokens) {
                    // console.log('[Markdown] 代码高亮成功');
                } else {
                    // console.log('[Markdown] 无 token 生成（语言可能不支持或纯文本）');
                }
            } catch (e) {
                console.error('[Markdown] 代码高亮失败:', e);
            }
        } else {
            console.warn('[Markdown] 无法高亮：Prism 未就绪');
        }
    },

    /**
     * 渲染列表
     */
    renderList(container, item) {
        // 防御：确保 items 存在
        if (!item.items || !Array.isArray(item.items)) {
            console.warn('[Markdown] 列表项数据缺失:', item.type, 'items:', item.items, 'raw:', item.raw?.substring(0, 50));
            // 降级：如果 items 丢失，尝试从 text 渲染简单列表项
            if (item.text) {
                const p = document.createElement('p');
                p.textContent = item.text;
                p.style.fontStyle = 'italic';
                container.appendChild(p);
            }
            return;
        }
        
        const list = document.createElement(item.ordered ? 'ol' : 'ul');
        list.className = `markdown-list markdown-${item.ordered ? 'ol' : 'ul'}`;
        
        if (item.ordered && item.start !== 1) {
            list.start = item.start;
        }
        
        item.items.forEach(listItem => {
            const li = document.createElement('li');
            li.className = 'markdown-li';
            
            // 渲染列表项内容
            if (listItem.inlineContent) {
                this.renderInlineContent(li, listItem.inlineContent);
            } else {
                li.textContent = listItem.text;
            }
            
            // 递归渲染嵌套列表
            // listItem.items 里存储的是嵌套列表对象（type: 'list'）
            if (listItem.items && listItem.items.length > 0) {
                const nestedList = listItem.items[0]; // 取第一个嵌套列表
                if (nestedList && nestedList.type === 'list') {
                    this.renderList(li, nestedList);
                }
            }
            
            list.appendChild(li);
        });
        
        container.appendChild(list);
    },

    /**
     * 渲染表格
     * 使用 wrapper 实现移动端横向滚动，不影响 TTS 文本提取
     */
    renderTable(container, item) {
        // 创建滚动容器（仅用于视觉布局，不影响 TTS 文本读取）
        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-table-wrapper';
        
        const table = document.createElement('table');
        table.className = 'markdown-table';
        
        // 表头
        if (item.headers && item.headers.length > 0) {
            const thead = document.createElement('thead');
            const tr = document.createElement('tr');
            
            item.headers.forEach((header, idx) => {
                const th = document.createElement('th');
                th.className = `markdown-th markdown-align-${header.align}`;
                if (header.inlineContent) {
                    this.renderInlineContent(th, header.inlineContent);
                } else {
                    th.textContent = header.text;
                }
                tr.appendChild(th);
            });
            
            thead.appendChild(tr);
            table.appendChild(thead);
        }
        
        // 表体
        if (item.rows && item.rows.length > 0) {
            const tbody = document.createElement('tbody');
            
            item.rows.forEach(row => {
                const tr = document.createElement('tr');
                
                row.forEach((cell, idx) => {
                    const td = document.createElement('td');
                    td.className = `markdown-td markdown-align-${cell.align}`;
                    if (cell.inlineContent) {
                        this.renderInlineContent(td, cell.inlineContent);
                    } else {
                        td.textContent = cell.text;
                    }
                    tr.appendChild(td);
                });
                
                tbody.appendChild(tr);
            });
            
            table.appendChild(tbody);
        }
        
        wrapper.appendChild(table);
        container.appendChild(wrapper);
    },

    /**
     * 渲染分隔线
     */
    renderHR(container) {
        const hr = document.createElement('hr');
        hr.className = 'markdown-hr';
        container.appendChild(hr);
    },

    /**
     * 渲染行内内容
     * @param {HTMLElement} container - 容器
     * @param {Array} inlineContent - 行内元素数组
     */
    renderInlineContent(container, inlineContent) {
        if (!inlineContent || !Array.isArray(inlineContent)) return;

        inlineContent.forEach(item => {
            switch (item.type) {
                case 'text':
                    container.appendChild(document.createTextNode(item.content));
                    break;
                    
                case 'strong':
                    const strong = document.createElement('strong');
                    strong.className = 'markdown-strong';
                    strong.textContent = item.content;
                    container.appendChild(strong);
                    break;
                    
                case 'em':
                    const em = document.createElement('em');
                    em.className = 'markdown-em';
                    em.textContent = item.content;
                    container.appendChild(em);
                    break;
                    
                case 'del':
                    const del = document.createElement('del');
                    del.className = 'markdown-del';
                    del.textContent = item.content;
                    container.appendChild(del);
                    break;
                    
                case 'code':
                    const code = document.createElement('code');
                    code.className = 'markdown-inline-code';
                    code.textContent = item.content;
                    container.appendChild(code);
                    break;
                    
                case 'link':
                    const a = document.createElement('a');
                    a.className = 'markdown-link';
                    a.href = item.href;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    if (item.title) a.title = item.title;
                    
                    // 链接内容可能还有格式
                    if (item.inlineContent) {
                        this.renderInlineContent(a, item.inlineContent);
                    } else {
                        a.textContent = item.content;
                    }
                    container.appendChild(a);
                    break;
                    
                case 'image':
                    const img = document.createElement('img');
                    img.src = item.src;
                    img.alt = item.alt;
                    img.className = 'markdown-inline-image';
                    if (item.title) img.title = item.title;
                    img.loading = 'lazy';
                    container.appendChild(img);
                    break;
                    
                default:
                    container.appendChild(document.createTextNode(item.content || ''));
            }
        });
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
    }
};
