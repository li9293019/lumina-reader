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
            html: async () => await Lumina.Exporter.downloadFile(Lumina.Exporter.generateHTML_v2(), 'text/html', '.html')
        };

        if (exporters[format]) {
            try {
                await exporters[format]();
            } catch (e) {
                console.error('导出失败:', e);
                Lumina.UI.showToast(Lumina.I18n.t('exportFailed') + ': ' + e.message);
            }
        }
    },

    generateTXT() {
        return Lumina.State.app.document.items.map((i, idx) => {
            if (i.type === 'image') return Lumina.I18n.t('imagePlaceholder');
            let text = i.display || i.text;
            // 简繁转换
            if (Lumina.Converter?.isConverting && text) {
                text = Lumina.Converter.getConvertedText(i, idx);
            }
            return text;
        }).join('\n');
    },

    generateMD() {
        const doc = Lumina.State.app.document;
        // 原始文档就是 Markdown 格式：拼接每个 item 的 raw 字段（保留原始 Markdown 语法）
        if (doc.type === 'md') {
            let content = doc.items.map(i => i.raw || '').join('\n');
            if (Lumina.Converter?.isConverting && content) {
                content = Lumina.Converter.convert(content);
            }
            return content;
        }
        // 其他格式：按现有简化逻辑导出为 Markdown
        return doc.items.map((i, idx) => {
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


    generateHTML_v2() {
        const appState = Lumina.State.app;
        const settings = Lumina.State.settings;
        const escapeHtml = Lumina.Utils.escapeHtml;
        const getCleanText = Lumina.Renderer.getCleanText;

        const fileTitle = escapeHtml(appState.currentFile.name.replace(/\.[^/.]+$/, ''));

        // ===== 19 主题定义 =====
        const THEME_DEFS = {
            light:       { bg:'#ffffff', bgSecondary:'#f5f5f5', text:'#1a1a1a', textSecondary:'#555555', accent:'#3b82f6', border:'#e8e8e8', headerBg:'#ffffff', sidebarBg:'#f5f5f5' },
            slate:       { bg:'#f8fafc', bgSecondary:'#f1f5f9', text:'#1e293b', textSecondary:'#64748b', accent:'#475569', border:'#cbd5e1', headerBg:'#f8fafc', sidebarBg:'#f8fafc' },
            parchment:   { bg:'#f7f3e8', bgSecondary:'#ede8d8', text:'#3d3530', textSecondary:'#6b5e52', accent:'#b07d46', border:'#d8d0c0', headerBg:'#f7f3e8', sidebarBg:'#f2ede0' },
            sprout:      { bg:'#f0f4ec', bgSecondary:'#e5ebe0', text:'#3d4a3d', textSecondary:'#6b7a6b', accent:'#6b8e6b', border:'#cdd8c5', headerBg:'#f0f4ec', sidebarBg:'#e8efe5' },
            mist:        { bg:'#f0f4f8', bgSecondary:'#e8eef5', text:'#2c3a4a', textSecondary:'#5a6b7d', accent:'#4a6fa5', border:'#cdd8e6', headerBg:'#f0f4f8', sidebarBg:'#e8eef5' },
            mint:        { bg:'#f0fdfa', bgSecondary:'#e6f7f5', text:'#134e4a', textSecondary:'#2d6b66', accent:'#0d9488', border:'#b8e6e0', headerBg:'#f0fdfa', sidebarBg:'#e8f8f6' },
            rose:        { bg:'#faf0f0', bgSecondary:'#f5e6e6', text:'#451a1a', textSecondary:'#7c4e4e', accent:'#be5656', border:'#e8d5d5', headerBg:'#faf0f0', sidebarBg:'#f7f0f0' },
            olive:       { bg:'#7d8471', bgSecondary:'#6e7562', text:'#f2f0e9', textSecondary:'#d4d1c5', accent:'#a3a380', border:'#707865', headerBg:'#7d8471', sidebarBg:'#777e6c' },
            taupe:       { bg:'#8c7c70', bgSecondary:'#7d6d61', text:'#f5f0eb', textSecondary:'#e0d5c8', accent:'#c4a882', border:'#7a6a5e', headerBg:'#8c7c70', sidebarBg:'#857565' },
            sandstone:   { bg:'#d8dce0', bgSecondary:'#c8ccd0', text:'#4a5056', textSecondary:'#6a7076', accent:'#8a9298', border:'#b8bcc0', headerBg:'#d8dce0', sidebarBg:'#e0e4e8' },
            straw:       { bg:'#c4b896', bgSecondary:'#b8ac8a', text:'#3d3525', textSecondary:'#5e5240', accent:'#9a7d50', border:'#b0a480', headerBg:'#c4b896', sidebarBg:'#c0b490' },
            terracotta:  { bg:'#c9a090', bgSecondary:'#bd9486', text:'#3d2820', textSecondary:'#6b4e42', accent:'#8b5a4a', border:'#a67c6b', headerBg:'#c9a090', sidebarBg:'#c49888' },
            moss:        { bg:'#3d4540', bgSecondary:'#323936', text:'#f0f2ee', textSecondary:'#c5ccc2', accent:'#b2cba6', border:'#4a554e', headerBg:'#3d4540', sidebarBg:'#373f3a' },
            dusk:        { bg:'#6b5b73', bgSecondary:'#5a4d61', text:'#f5f0e8', textSecondary:'#d4c4b0', accent:'#e6b89c', border:'#5d5063', headerBg:'#6b5b73', sidebarBg:'#625468' },
            espresso:    { bg:'#2b2622', bgSecondary:'#332d28', text:'#e8e0d8', textSecondary:'#a89a8d', accent:'#d4a574', border:'#4a4238', headerBg:'#2b2622', sidebarBg:'#26211e' },
            midnight:    { bg:'#1a2639', bgSecondary:'#121d2d', text:'#f7f5f0', textSecondary:'#b8c0c8', accent:'#f0a040', border:'#2a3a52', headerBg:'#1a2639', sidebarBg:'#162230' },
            nebula:      { bg:'#1a1c26', bgSecondary:'#151720', text:'#e2e0eb', textSecondary:'#9a96b0', accent:'#b8a8d8', border:'#2a2c3a', headerBg:'#1a1c26', sidebarBg:'#13141c' },
            dark:        { bg:'#1a1a1a', bgSecondary:'#252525', text:'#d1d1d1', textSecondary:'#a0a0a0', accent:'#c9a06c', border:'#2e2e2e', headerBg:'#1a1a1a', sidebarBg:'#202020' },
            amoled:      { bg:'#000000', bgSecondary:'#0a0a0a', text:'#b8b8b8', textSecondary:'#808080', accent:'#c9956b', border:'#1f1f1f', headerBg:'#000000', sidebarBg:'#050505' }
        };
        const themesList = Object.keys(THEME_DEFS);
        const themeJson = JSON.stringify(THEME_DEFS);

        // ===== 内容渲染（保持 Reader 现有逻辑）=====
        let headingCounter = 0;
        const idMap = new Map();
        appState.chapters.forEach((chapter, cidx) => {
            chapter.items.forEach((item) => {
                if (item.type === 'title' || item.type?.startsWith('heading')) {
                    idMap.set(item, 'h-' + (headingCounter++));
                }
            });
        });

        // 构建树形 TOC（支持折叠/展开）
        const tocHeadings = [];
        appState.chapters.forEach((chapter, cidx) => {
            const chapterId = 'ch-' + cidx;
            if (chapter.isPreface) {
                tocHeadings.push({ level: 0, id: chapterId, text: '前言' });
            }
            chapter.items.forEach((item) => {
                let text = item.display || item.text || '';
                if (Lumina.Converter?.isConverting && text) text = Lumina.Converter.convert(text);
                text = escapeHtml(getCleanText(text));
                if (!text) return;
                let level = 0, hid = '';
                if (item.type === 'title') {
                    level = 1; hid = idMap.get(item);
                } else if (item.type === 'subtitle') {
                    level = 2; hid = 'sub-' + cidx;
                } else if (item.type?.startsWith('heading')) {
                    level = Math.min(parseInt(item.type.replace('heading', '')) || 1, 6);
                    hid = idMap.get(item);
                } else {
                    return;
                }
                tocHeadings.push({ level, id: hid, text });
            });
        });

        function buildTocHtml(headings) {
            if (headings.length < 1) return '';
            let html = '<ul class="toc-list">';
            const stack = [];
            for (let i = 0; i < headings.length; i++) {
                const h = headings[i];
                const next = headings[i + 1];
                const hasChildren = next && next.level > h.level;
                while (stack.length > 0 && stack[stack.length - 1] >= h.level) {
                    html += '</ul></li>';
                    stack.pop();
                }
                html += '<li class="toc-item level-' + h.level + (hasChildren ? ' has-children' : '') + '" data-target="' + h.id + '">';
                html += '<div class="toc-row" data-target="' + h.id + '">';
                if (hasChildren) {
                    html += '<span class="toc-toggle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';
                }
                html += '<span class="toc-text">' + h.text + '</span>';
                html += '</div>';
                if (hasChildren) {
                    html += '<ul class="toc-children">';
                    stack.push(h.level);
                } else {
                    html += '</li>';
                }
            }
            while (stack.length > 0) {
                html += '</ul></li>';
                stack.pop();
            }
            html += '</ul>';
            return html;
        }
        const tocHtml = buildTocHtml(tocHeadings);

        // 构建内容
        let contentItems = '';
        appState.chapters.forEach((chapter, cidx) => {
            const chapterId = 'ch-' + cidx;
            contentItems += '<section id="' + chapterId + '" class="chapter ' + (chapter.isPreface ? 'preface' : '') + '">';
            chapter.items.forEach((item) => {
                if (item.type === 'image') {
                    contentItems += '<p class="img-wrap"><img src="' + item.data + '" alt="' + escapeHtml(item.alt || '') + '"></p>';
                } else if (item.type === 'paragraph') {
                    let text = item.text;
                    if (Lumina.Converter?.isConverting && text) text = Lumina.Converter.convert(text);
                    text = escapeHtml(getCleanText(text));
                    contentItems += text ? '<p>' + text + '</p>' : '';
                } else if (item.type === 'title') {
                    let text = item.text;
                    if (Lumina.Converter?.isConverting && text) text = Lumina.Converter.convert(text);
                    text = escapeHtml(getCleanText(text));
                    const hid = idMap.get(item);
                    contentItems += text ? '<h1 class="doc-title" id="' + hid + '">' + text + '</h1>' : '';
                } else if (item.type === 'subtitle') {
                    let text = item.text;
                    if (Lumina.Converter?.isConverting && text) text = Lumina.Converter.convert(text);
                    text = escapeHtml(getCleanText(text));
                    const hid = 'sub-' + cidx;
                    contentItems += text ? '<h2 class="doc-subtitle" id="' + hid + '">' + text + '</h2>' : '';
                } else if (item.type?.startsWith('heading')) {
                    const level = Math.min(parseInt(item.type.replace('heading', '')) || 1, 6);
                    let text = item.display || item.text;
                    if (Lumina.Converter?.isConverting && text) text = Lumina.Converter.convert(text);
                    text = escapeHtml(text);
                    const hid = idMap.get(item);
                    contentItems += '<h' + level + ' id="' + hid + '" class="heading-' + level + '">' + text + '</h' + level + '>';
                }
            });
            contentItems += '</section>';
        });

        // ===== 封面嵌入 =====
        let coverHtml = '';
        if (settings.hashCover && window.Lumina.BibliomorphCover) {
            try {
                const doc = appState.document;
                const title = (doc.metadata?.title || doc.title || appState.currentFile.name.replace(/\.[^/.]+$/, '') || 'Untitled');
                const author = (doc.metadata?.author || doc.author || '');
                const coverSvg = window.Lumina.BibliomorphCover.generate(title, author, { pattern: 'none' });
                if (coverSvg) {
                    coverHtml = '<div class="export-cover">' + coverSvg + '</div>';
                }
            } catch (e) {
                console.warn('[Exporter] Cover embed failed:', e);
            }
        }

        // ===== 组装 HTML =====
        const googleFontsLink = '<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">';

        // 生成主题 CSS
        let themeCss = '';
        for (const [name, vars] of Object.entries(THEME_DEFS)) {
            themeCss += ':root[data-theme="' + name + '"] {\n';
            themeCss += '  --bg: ' + vars.bg + ';\n';
            themeCss += '  --bg-secondary: ' + vars.bgSecondary + ';\n';
            themeCss += '  --text: ' + vars.text + ';\n';
            themeCss += '  --text-secondary: ' + vars.textSecondary + ';\n';
            themeCss += '  --accent: ' + vars.accent + ';\n';
            themeCss += '  --border: ' + vars.border + ';\n';
            themeCss += '  --header-bg: ' + vars.headerBg + ';\n';
            themeCss += '  --sidebar-bg: ' + vars.sidebarBg + ';\n';
            themeCss += '}\n';
        }

        return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>${fileTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${googleFontsLink}
<style>
${themeCss}
:root {
  --font-serif: "Noto Serif SC", "Source Han Serif SC", "SimSun", "STSong", serif;
  --font-sans: "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif;
  --font-kai: "KaiTi", "STKaiti", "BiauKai", serif;
  --font-mono: "JetBrains Mono", "Fira Code", "SF Mono", "Courier New", monospace;
  --content-max-width: 900px;
  --content-padding: 48px;
  --p-spacing: 16px;
  --fw-light: 300; --fw-normal: 400; --fw-medium: 500; --fw-semibold: 600; --fw-bold: 700;
}
* { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--accent); }
body { font-family: var(--font-serif); font-size: 18px; line-height: 1.8; color: var(--text); background: var(--bg-secondary); overflow-x: hidden; }
.header { position: fixed; top:0; left:0; right:0; height: 60px; background: var(--header-bg); border-bottom: 1px solid var(--border); z-index: 1000; display: flex; align-items: center; padding: 0 20px; justify-content: space-between; }
.header-btn { width: 40px; height: 40px; border: 1px solid var(--border); background: transparent; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text); transition: all 0.2s; flex-shrink: 0; }
.header-btn:hover { border-color: var(--accent); color: var(--accent); }
.header-btn svg { width: 20px; height: 20px; }
.header-title { flex: 1; text-align: center; padding: 0 15px; overflow: hidden; min-width: 0; }
.book-name { font-size: 13px; color: var(--text-secondary); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chapter-name { font-size: 17px; font-weight: var(--fw-semibold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text); }
.sidebar { position: fixed; top: 60px; left: 0; width: 300px; height: calc(100vh - 60px); background: var(--sidebar-bg); border-right: 1px solid var(--border); overflow-y: auto; z-index: 999; transition: transform 0.3s ease; transform: translateX(-100%); padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)); }
.sidebar.open { transform: translateX(0); }
.toc-list { list-style: none; padding: 16px 0; }
.toc-item { list-style: none; }
.toc-row { display: flex; align-items: center; padding: 8px 20px 8px 12px; cursor: pointer; border-left: 3px solid transparent; transition: all 0.2s; color: var(--text-secondary); font-size: 15px; }
.toc-row:hover { background: rgba(128,128,128,0.06); border-left-color: var(--border); color: var(--text); }
.toc-row.active { background: var(--bg-secondary); border-left-color: var(--accent); color: var(--text); font-weight: var(--fw-medium); }
.toc-item.level-1 .toc-row { font-weight: var(--fw-semibold); color: var(--text); }
.toc-item.level-2 .toc-row { padding-left: 24px; }
.toc-item.level-3 .toc-row { padding-left: 36px; font-size: 14px; }
.toc-item.level-4 .toc-row, .toc-item.level-5 .toc-row, .toc-item.level-6 .toc-row { padding-left: 48px; font-size: 13px; opacity: 0.85; }
.toc-text { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.toc-toggle { display: inline-flex; width: 16px; height: 16px; align-items: center; justify-content: center; cursor: pointer; margin-right: 6px; flex-shrink: 0; }
.toc-toggle svg { width: 10px; height: 10px; transition: transform 0.2s; }
.toc-item.collapsed .toc-toggle svg { transform: rotate(-90deg); }
.toc-children { list-style: none; padding: 0; margin: 0; width: 100%; }
.toc-item.collapsed > .toc-children { display: none; }
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 998; opacity: 0; visibility: hidden; transition: opacity 0.3s, visibility 0.3s; }
.overlay.active { opacity: 1; visibility: visible; }
.main { margin-left: 0; margin-top: 60px; min-height: calc(100vh - 60px); }
article.content { max-width: var(--content-max-width); margin: 0 auto; padding: 40px var(--content-padding); background: var(--bg); min-height: calc(100vh - 60px); }
h1, h2, h3, h4, h5, h6 { color: var(--text); margin-top: 1.5em; margin-bottom: 0.5em; scroll-margin-top: 80px; }
h1 { font-size: 2em; font-weight: var(--fw-bold); text-align: left; margin-top: 0.5em; }
h2 { font-size: 1.5em; font-weight: var(--fw-semibold); }
h3 { font-size: 1.25em; font-weight: var(--fw-semibold); color: var(--text-secondary); }
h4, h5, h6 { font-size: 1.1em; color: var(--text-secondary); opacity: 0.9; }
p { margin: var(--p-spacing, 16px) 0; text-align: justify; word-wrap: break-word; }
img { max-width: 100%; height: auto; border-radius: 4px; display: block; margin: 1.5em auto; }
a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
blockquote { border-left: 3px solid var(--accent); padding-left: 16px; margin: 16px 0; color: var(--text-secondary); font-style: italic; }
:not(pre) > code { font-family: var(--font-mono); font-size: 0.85em; background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px; }
pre { background: var(--bg-secondary); padding: 16px; border-radius: 8px; overflow-x: auto; margin: 16px 0; white-space: pre; word-wrap: normal; }
pre code { background: none; padding: 0; font-family: var(--font-mono); font-size: 0.9em; white-space: pre; }
.table-wrapper { overflow-x: auto; margin: 16px 0; border-radius: 8px; border: 1px solid var(--border); }
.table-wrapper table { width: 100%; border-collapse: collapse; margin: 0; }
th, td { padding: 10px 14px; border: 1px solid var(--border); text-align: left; }
th { background: var(--bg-secondary); font-weight: var(--fw-semibold); }
hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
ul, ol { margin: 8px 0 8px 24px; padding-left: 16px; }
mark { background: rgba(255, 215, 0, 0.35); color: inherit; border-radius: 2px; padding: 0 2px; }

/* Settings panel */
.settings-panel { position: fixed; top: 60px; right: 0; width: 280px; height: calc(100vh - 60px); background: var(--sidebar-bg); border-left: 1px solid var(--border); overflow-y: auto; z-index: 999; transition: transform 0.3s ease; transform: translateX(100%); padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)); }
.settings-panel.open { transform: translateX(0); }
.settings-panel__header { padding: 16px 20px; font-size: 16px; font-weight: var(--fw-semibold); border-bottom: 1px solid var(--border); color: var(--text); }
.settings-panel__body { padding: 16px 20px; }
.setting-group { margin-bottom: 20px; }
.setting-label { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
.setting-value { color: var(--accent); font-weight: var(--fw-medium); }
.setting-options { display: flex; flex-wrap: wrap; gap: 8px; }
.setting-options--theme { gap: 10px; }
.option-btn { padding: 6px 12px; border: 1px solid var(--border); background: var(--bg-secondary); border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--text); font-family: inherit; transition: all 0.15s; }
.option-btn:hover { border-color: var(--accent); }
.option-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.theme-dot { display: block; width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(128,128,128,0.4); }
.option-btn.active .theme-dot { border: 2px solid var(--accent); }
.toggle-switch-el { position: relative; display: inline-block; width: 40px; height: 22px; }
.toggle-switch-el input { opacity: 0; width: 0; height: 0; }
.toggle-track-el { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: var(--border); border-radius: 22px; transition: 0.2s; }
.toggle-track-el::before { content: ''; position: absolute; height: 16px; width: 16px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.2s; }
.toggle-switch-el input:checked + .toggle-track-el { background: var(--accent); }
.toggle-switch-el input:checked + .toggle-track-el::before { transform: translateX(18px); }
.setting-slider { width: 100%; height: 4px; border-radius: 2px; -webkit-appearance: none; appearance: none; background: var(--border); outline: none; }
.setting-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); cursor: pointer; }
.setting-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--accent); cursor: pointer; border: none; }

/* Cover */
.export-cover { display: flex; justify-content: center; align-items: center; margin: 0 auto 2em; padding: 1em; border-radius: 4px; overflow: hidden; }
.export-cover svg { display: block; max-width: 100%; height: auto; border-radius: 4px; }

@media (min-width: 769px) {
  .sidebar { transform: translateX(0); }
  .sidebar.closed { transform: translateX(-100%); }
  .main { margin-left: 300px; }
  .main.sidebar-closed { margin-left: 0; }
  .overlay { display: none; }
}
@media (max-width: 900px) {
  article.content { padding: 40px 24px; }
}
@media (max-width: 768px) {
  body { font-size: 17px; }
  .sidebar { width: 100%; max-width: none; border-right: none; transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
  .main { margin-left: 0 !important; }
  article.content { padding: 24px 20px; width: 100%; max-width: none; }
  .header { padding: 0 16px; }
  .header-title { padding: 0 12px; }
  .chapter-name { font-size: 15px; }
  h1 { font-size: 1.8em; }
  h2 { font-size: 1.4em; }
}
@media (max-width: 480px) {
  article.content { padding: 20px 16px; }
}
@media print {
  .header, .sidebar, .overlay, .settings-panel { display: none; }
  .main { margin-left: 0; margin-top: 0; }
}
</style>
</head>
<body>

<header class="header">
  <button class="header-btn" onclick="toggleSidebar()" aria-label="目录">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
  </button>
  <div class="header-title">
    <div class="book-name">${fileTitle}</div>
    <div class="chapter-name">点击目录开始阅读</div>
  </div>
  <button class="header-btn" id="settings-btn" onclick="toggleSettings()" aria-label="设置">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.17 15 1.65 1.65 0 0 0 2.66 13.1 2 2 0 0 1 1 11.99a2 2 0 0 1 1.66-1.82A1.65 1.65 0 0 0 4.17 9a1.65 1.65 0 0 0 .33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9A1.65 1.65 0 0 0 20 10.1a2 2 0 0 1 1.66 1.82 2 2 0 0 1-1.66 1.82 1.65 1.65 0 0 0-.33 1.82z"/></svg>
  </button>
</header>

<div class="overlay"></div>

<aside class="sidebar">
  ${tocHtml}
</aside>

<main class="main">
  <article class="content">
    ${coverHtml}
    ${contentItems}
  </article>
</main>

<aside class="settings-panel">
  <div class="settings-panel__header">阅读设置</div>
  <div class="settings-panel__body">
    <div class="setting-group">
      <div class="setting-label">主题色</div>
      <div class="setting-options setting-options--theme">
        ${themesList.map(t => '<button class="option-btn" data-setting="theme" data-value="' + t + '" onclick="applyTheme(\'' + t + '\'); syncActiveBtn(\'theme\', \'' + t + '\');"><span class="theme-dot" style="background:' + THEME_DEFS[t].bg + '"></span></button>').join('')}
      </div>
    </div>
    <div class="setting-group">
      <div class="setting-label">字体</div>
      <div class="setting-options">
        <button class="option-btn" data-setting="font" data-value="serif" onclick="applyFont('serif'); syncActiveBtn('font', 'serif');">宋体</button>
        <button class="option-btn" data-setting="font" data-value="sans" onclick="applyFont('sans'); syncActiveBtn('font', 'sans');">黑体</button>
        <button class="option-btn" data-setting="font" data-value="kai" onclick="applyFont('kai'); syncActiveBtn('font', 'kai');">楷体</button>
        <button class="option-btn" data-setting="font" data-value="mono" onclick="applyFont('mono'); syncActiveBtn('font', 'mono');">等宽</button>
      </div>
    </div>
    <div class="setting-group">
      <div class="setting-label">字号 <span class="setting-value" id="val-fontSize">18px</span></div>
      <input type="range" id="setting-fontSize" class="setting-slider" min="12" max="32" step="1" value="18" oninput="applyFontSize(this.value); document.getElementById('val-fontSize').textContent = this.value + 'px';">
    </div>
    <div class="setting-group">
      <div class="setting-label">行高 <span class="setting-value" id="val-lineHeight">1.8</span></div>
      <input type="range" id="setting-lineHeight" class="setting-slider" min="12" max="25" step="1" value="18" oninput="const v = (this.value / 10).toFixed(1); applyLineHeight(v); document.getElementById('val-lineHeight').textContent = v;">
    </div>
    <div class="setting-group">
      <div class="setting-label">段间距 <span class="setting-value" id="val-paragraphSpacing">16px</span></div>
      <input type="range" id="setting-paragraphSpacing" class="setting-slider" min="0" max="32" step="1" value="16" oninput="applyParagraphSpacing(this.value); document.getElementById('val-paragraphSpacing').textContent = this.value + 'px';">
    </div>
    <div class="setting-group">
      <div class="setting-label">页宽 <span class="setting-value" id="val-pageWidth">900px</span></div>
      <input type="range" id="setting-pageWidth" class="setting-slider" min="600" max="1400" step="20" value="900" oninput="applyPageWidth(this.value); document.getElementById('val-pageWidth').textContent = this.value + 'px';">
    </div>
    <div class="setting-group">
      <div class="setting-label">边距 <span class="setting-value" id="val-pagePadding">48px</span></div>
      <input type="range" id="setting-pagePadding" class="setting-slider" min="16" max="120" step="4" value="48" oninput="applyPagePadding(this.value); document.getElementById('val-pagePadding').textContent = this.value + 'px';">
    </div>
    <div class="setting-group">
      <div class="setting-label" style="justify-content:space-between;cursor:pointer;" onclick="const t = document.getElementById('toggle-smooth'); t.checked = !t.checked; t.dispatchEvent(new Event('change'));">
        <span>平滑跳转</span>
        <span class="toggle-switch-el"><input type="checkbox" id="toggle-smooth" checked onchange="applySmoothScroll(this.checked);"><span class="toggle-track-el"></span></span>
      </div>
    </div>
  </div>
</aside>

<script>
const THEMES = ${JSON.stringify(themesList)};
const THEME_DEFS = ${themeJson};
let themeIdx = 0;
let sidebarOpen = window.innerWidth > 768;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function updateOverlay() {
  const hasOpen = (window.innerWidth <= 768 && sidebarOpen) || $('.settings-panel')?.classList.contains('open');
  $('.overlay').classList.toggle('active', !!hasOpen);
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  const sb = $('.sidebar');
  const main = $('.main');
  if (window.innerWidth <= 768) {
    sb.classList.toggle('open', sidebarOpen);
  } else {
    sb.classList.toggle('closed', !sidebarOpen);
    main.classList.toggle('sidebar-closed', !sidebarOpen);
  }
  updateOverlay();
}

function toggleSettings() {
  const panel = $('.settings-panel');
  if (!panel) return;
  panel.classList.toggle('open');
  updateOverlay();
}

function applyTheme(name) {
  const idx = THEMES.indexOf(name);
  if (idx > -1) { themeIdx = idx; document.documentElement.setAttribute('data-theme', name); localStorage.setItem('lumina-export-theme', name); }
}

function applyFont(name) {
  const map = { serif: 'var(--font-serif)', sans: 'var(--font-sans)', kai: 'var(--font-kai)', mono: 'var(--font-mono)' };
  document.body.style.fontFamily = map[name] || map.serif;
  localStorage.setItem('lumina-export-font', name);
}

function applyFontSize(px) {
  document.body.style.fontSize = px + 'px';
  localStorage.setItem('lumina-export-fontSize', px);
}

function applyLineHeight(v) {
  document.body.style.lineHeight = v;
  localStorage.setItem('lumina-export-lineHeight', v);
}

function applyParagraphSpacing(px) {
  document.documentElement.style.setProperty('--p-spacing', px + 'px');
  localStorage.setItem('lumina-export-paragraphSpacing', px);
}

function applyPageWidth(px) {
  document.documentElement.style.setProperty('--content-max-width', px + 'px');
  localStorage.setItem('lumina-export-pageWidth', px);
}

function applyPagePadding(px) {
  document.documentElement.style.setProperty('--content-padding', px + 'px');
  localStorage.setItem('lumina-export-pagePadding', px);
}

function applySmoothScroll(enabled) {
  window._smoothScroll = enabled;
  document.documentElement.style.scrollBehavior = enabled ? 'smooth' : 'auto';
  localStorage.setItem('lumina-export-smoothScroll', enabled ? '1' : '0');
}

function syncActiveBtn(setting, value) {
  $$(".settings-panel [data-setting='" + setting + "']").forEach(b => b.classList.remove('active'));
  const btn = $(".settings-panel [data-setting='" + setting + "'][data-value='" + value + "']");
  if (btn) btn.classList.add('active');
}

function goTo(targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const offset = window.innerWidth <= 768 ? 70 : 80;
  const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
  const behavior = window._smoothScroll !== false ? 'smooth' : 'auto';
  window.scrollTo({ top: Math.max(0, top), behavior });
  history.pushState(null, null, '#' + targetId);
  if (window.innerWidth <= 768 && sidebarOpen) toggleSidebar();
  updateActiveToc(targetId);
}

function updateActiveToc(targetId) {
  $$('.toc-row').forEach(el => el.classList.remove('active'));
  const active = $('.toc-row[data-target="' + targetId + '"');
  if (active) {
    active.classList.add('active');
    active.scrollIntoView({ behavior: window._smoothScroll !== false ? 'smooth' : 'auto', block: 'nearest' });
  }
}

// TOC collapse/expand
document.querySelectorAll('.toc-toggle').forEach(toggle => {
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle.closest('.toc-item').classList.toggle('collapsed');
  });
});

// TOC click delegation
$('.toc-list')?.addEventListener('click', e => {
  const item = e.target.closest('.toc-item');
  if (!item) return;
  if (e.target.closest('.toc-toggle')) return;
  const targetId = item.dataset.target;
  if (targetId) goTo(targetId);
});

// Scroll sync
let ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { ticking = false; onScroll(); });
}, { passive: true });

function onScroll() {
  const offset = window.innerWidth <= 768 ? 70 : 80;
  const targets = $$('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]');
  if (!targets.length) return;
  let minDist = Infinity, closest = null;
  targets.forEach(el => {
    const dist = Math.abs(el.getBoundingClientRect().top - offset);
    if (dist < minDist) { minDist = dist; closest = el.id; }
  });
  if (closest) updateActiveToc(closest);
  const firstH = $('.content h1, .content h2');
  if (firstH) $('.chapter-name').textContent = firstH.textContent;
}

// Keyboard
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (sidebarOpen) toggleSidebar();
    if ($('.settings-panel')?.classList.contains('open')) toggleSettings();
  }
});

// Overlay click
$('.overlay').addEventListener('click', () => {
  if (sidebarOpen) toggleSidebar();
  if ($('.settings-panel')?.classList.contains('open')) toggleSettings();
});

// Click outside settings panel to close
document.addEventListener('click', e => {
  const panel = $('.settings-panel');
  if (!panel || !panel.classList.contains('open')) return;
  if (panel.contains(e.target)) return;
  if (e.target.closest('#settings-btn')) return;
  toggleSettings();
});

// Restore settings
const savedTheme = localStorage.getItem('lumina-export-theme');
if (savedTheme && THEMES.includes(savedTheme)) { themeIdx = THEMES.indexOf(savedTheme); document.documentElement.setAttribute('data-theme', savedTheme); }
const savedFont = localStorage.getItem('lumina-export-font');
if (savedFont) applyFont(savedFont);
const savedFontSize = localStorage.getItem('lumina-export-fontSize');
if (savedFontSize) applyFontSize(parseFloat(savedFontSize));
const savedLH = localStorage.getItem('lumina-export-lineHeight');
if (savedLH) applyLineHeight(parseFloat(savedLH));
const savedPS = localStorage.getItem('lumina-export-paragraphSpacing');
if (savedPS) applyParagraphSpacing(parseFloat(savedPS));
const savedSmooth = localStorage.getItem('lumina-export-smoothScroll');
if (savedSmooth !== null) { applySmoothScroll(savedSmooth === '1'); } else { applySmoothScroll(true); }
const savedPW = localStorage.getItem('lumina-export-pageWidth');
if (savedPW) applyPageWidth(parseFloat(savedPW));
const savedPP = localStorage.getItem('lumina-export-pagePadding');
if (savedPP) applyPagePadding(parseFloat(savedPP));

// Init settings panel values after DOM ready
requestAnimationFrame(() => {
  syncActiveBtn('theme', THEMES[themeIdx]);
  if (savedFont) syncActiveBtn('font', savedFont);
  const fsSlider = $('#setting-fontSize');
  if (fsSlider) { fsSlider.value = parseFloat(savedFontSize) || 18; fsSlider.dispatchEvent(new Event('input')); }
  const lhSlider = $('#setting-lineHeight');
  if (lhSlider) { lhSlider.value = ((parseFloat(savedLH) || 1.8) * 10).toFixed(0); lhSlider.dispatchEvent(new Event('input')); }
  const psSlider = $('#setting-paragraphSpacing');
  if (psSlider) { psSlider.value = parseFloat(savedPS) || 16; psSlider.dispatchEvent(new Event('input')); }
  const smoothChk = $('#toggle-smooth');
  if (smoothChk) { smoothChk.checked = savedSmooth !== null ? savedSmooth === '1' : true; smoothChk.dispatchEvent(new Event('change')); }
  const pwSlider = $('#setting-pageWidth');
  if (pwSlider) { pwSlider.value = parseFloat(savedPW) || 900; pwSlider.dispatchEvent(new Event('input')); }
  const ppSlider = $('#setting-pagePadding');
  if (ppSlider) { ppSlider.value = parseFloat(savedPP) || 48; ppSlider.dispatchEvent(new Event('input')); }
});

// Handle hash
if (location.hash) {
  setTimeout(() => {
    const targetId = location.hash.slice(1);
    if (document.getElementById(targetId)) goTo(targetId);
  }, 100);
}

onScroll();
</script>

</body>
</html>`;
    },

    async generateDOCX() {
        let docxLib = window.docx || window.Docx;
        if (!docxLib) {
            Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = Lumina.I18n.t('loadingDocxLibrary') || '正在加载 DOCX 导出库...';
            Lumina.DOM.loadingScreen.classList.add('active');
            try {
                await Lumina.Loader.loadLibrary('docx', './assets/js/lib/docx.min.js', 20000);
                docxLib = window.docx || window.Docx;
            } catch (e) {
                Lumina.DOM.loadingScreen.classList.remove('active');
                Lumina.UI.showToast(Lumina.I18n.t('docxLibraryNotLoaded') || 'DOCX 库未加载');
                console.error('[Exporter] Failed to load docx library:', e);
                return;
            } finally {
                Lumina.DOM.loadingScreen.classList.remove('active');
            }
        }
        if (!docxLib) {
            Lumina.UI.showToast(Lumina.I18n.t('docxLibraryNotLoaded') || 'DOCX 库未加载');
            return;
        }

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
                paper: { bg: 'FFFFFF', text: '000000', secondary: '555555', accent: '333333', border: 'CCCCCC' },
                ink: { bg: '000000', text: 'FFFFFF', secondary: 'CCCCCC', accent: '555555', border: '555555' },
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
                        const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
                        if (isApp) {
                            Lumina.UI.showToast(Lumina.I18n.t('exportedTo', {path: 'Documents/LuminaReader/' + fileTitle + '.docx'}));
                        } else {
                            Lumina.UI.showToast(Lumina.I18n.t('docxExportSuccess'));
                        }
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
                const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
                if (isApp) {
                    Lumina.UI.showToast(Lumina.I18n.t('exportedTo', {path: 'Documents/LuminaReader/' + fileName}));
                } else {
                    Lumina.UI.showToast(Lumina.I18n.t('exportSuccess') + ': ' + fileName);
                }
            } catch (e) {
                console.error('导出失败:', e);
                Lumina.UI.showToast(Lumina.I18n.t('exportFailed') + ': ' + e.message);
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

