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
        return Lumina.State.app.document.items.map((i, idx) => {
            if (i.type === 'image') return '[图片]';
            let text = i.display || i.text;
            // 简繁转换
            if (Lumina.Converter?.isConverting && text) {
                text = Lumina.Converter.getConvertedText(i, idx);
            }
            return text;
        }).join('\n');
    },

    generateMD() {
        return Lumina.State.app.document.items.map((i, idx) => {
            // 获取文本并转换
            let text = i.text || i.display || '';
            if (Lumina.Converter?.isConverting && text) {
                text = Lumina.Converter.getConvertedText(i, idx);
            }
            
            if (i.type === 'image') return `![${i.alt || 'image'}](${i.data})`;
            if (i.type === 'title') return `# ${text}`;
            if (i.type === 'subtitle') return `## ${text}`;
            if (i.type.startsWith('heading')) return `${'#'.repeat(i.level)} ${text}`;
            return text;
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
                    let text = item.text;
                    if (Lumina.Converter?.isConverting && text) text = Lumina.Converter.convert(text);
                    text = escapeHtml(getCleanText(text));
                    tocItems += `
                    <li class="toc-item level-1 doc-title-item" data-target="${hid}" data-ch="${cidx}">
                        <span class="toc-text">${text}</span>
                    </li>`;
                } else if (item.type === 'subtitle') {
                    // 副标题（通常不加入目录，或作为二级）
                    let text = item.text;
                    if (Lumina.Converter?.isConverting && text) text = Lumina.Converter.convert(text);
                    text = escapeHtml(getCleanText(text));
                    // 副标题可选加入目录，这里选择加入作为level-2
                    const hid = `sub-${cidx}`; // 副标题使用独立ID生成
                    idMap.set(item, hid);
                    tocItems += `
                    <li class="toc-item level-2 doc-subtitle-item" data-target="${hid}" data-ch="${cidx}">
                        <span class="toc-text">${text}</span>
                    </li>`;
                } else if (item.type?.startsWith('heading')) {
                    const level = Math.min(parseInt(item.type.replace('heading', '')) || 1, 6);
                    let text = item.display || item.text;
                    if (Lumina.Converter?.isConverting && text) text = Lumina.Converter.convert(text);
                    text = escapeHtml(text);
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
                    let text = item.text;
                    if (Lumina.Converter?.isConverting && text) text = Lumina.Converter.convert(text);
                    text = escapeHtml(getCleanText(text));
                    contentItems += text ? `<p>${text}</p>` : '';
                } else if (item.type === 'title') {
                    let text = item.text;
                    if (Lumina.Converter?.isConverting && text) text = Lumina.Converter.convert(text);
                    text = escapeHtml(getCleanText(text));
                    const hid = idMap.get(item);
                    contentItems += text ? `<h1 class="doc-title" id="${hid}">${text}</h1>` : '';
                } else if (item.type === 'subtitle') {
                    let text = item.text;
                    if (Lumina.Converter?.isConverting && text) text = Lumina.Converter.convert(text);
                    text = escapeHtml(getCleanText(text));
                    const hid = idMap.get(item);
                    contentItems += text ? `<h2 class="doc-subtitle" id="${hid}">${text}</h2>` : '';
                } else if (item.type?.startsWith('heading')) {
                    const level = Math.min(parseInt(item.type.replace('heading', '')) || 1, 6);
                    let text = item.display || item.text;
                    if (Lumina.Converter?.isConverting && text) text = Lumina.Converter.convert(text);
                    text = escapeHtml(text);
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
            {family: 'Noto Serif SC', url: null},  // CDN已移除
            {family: 'LXGW Neo XiHei', url: 'assets/fonts/LXGWNeoXiHei.css'}  // 本地字体
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
            --font-sans: "LXGW Neo XiHei", "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif;
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
            font-family: 'LXGW Neo XiHei';
            src: url('assets/fonts/LXGWNeoXiHeiPlus.ttf') format('truetype');
            font-weight: normal;
            font-style: normal;
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
                sans: { cn: 'LXGW Neo XiHei', fallback: 'Microsoft YaHei' },
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

