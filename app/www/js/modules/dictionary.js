// ==================== 词典系统 ====================
// 解析 .dic 文件，构建词条索引，在阅读正文中高亮词条并提供释义 tooltip

Lumina.Dictionary = {
    // 运行时索引
    index: null,

    // 配置
    config: {
        enabled: true,
        highlight: true,
        frequency: 'first',      // 'first' | 'all'
        matchAllLevels: false,
        showTooltip: true
    },

    // Tooltip DOM 缓存
    tooltipEl: null,

    // 当前页已高亮的词条（用于 'first' 频率控制）
    seenTerms: new Set(),

    // ========== 生命周期 ==========

    init(dicSources) {
        if (!dicSources || dicSources.length === 0) {
            this.clear();
            return;
        }
        const allEntries = [];
        dicSources.forEach(src => {
            const entries = this.parse(src.content);
            allEntries.push(...entries);
        });
        this.index = this.buildIndex(allEntries);
        this.seenTerms.clear();
        this.renderPanel();
    },

    clear() {
        this.index = null;
        this.seenTerms.clear();
        this.unhighlightAll();
    },

    isEnabled() {
        return this.config.enabled && !!this.index;
    },

    // ========== 解析与索引 ==========

    // 辅助函数：去除 Markdown 行内格式标记
    stripInlineMarkdown(text) {
        if (!text || typeof text !== 'string') return text;
        return text
            .replace(/(\\*\\*|__)(.*?)\1/g, '$2')
            .replace(/(\\*|_)(.*?)\1/g, '$2')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/~~(.*?)~~/g, '$1')
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/<[^>]+>/g, '')
            .trim();
    },

    parse(content) {
        if (!content || typeof content !== 'string') return [];
        const lines = content.split('\n');
        const entries = [];
        const stack = [];

        lines.forEach((line, idx) => {
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                const name = this.stripInlineMarkdown(headingMatch[2].trim());

                while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                    stack.pop();
                }

                const path = stack.map(h => h.name);
                stack.push({ level, name });

                // 收集释义（到下一个同级或更高级 heading 为止）
                const contentStart = idx + 1;
                let contentEnd = contentStart;
                for (let j = contentStart; j < lines.length; j++) {
                    const next = lines[j].match(/^(#{1,6})\s+/);
                    if (next && next[1].length <= level) break;
                    contentEnd = j + 1;
                }

                const entryContent = lines.slice(contentStart, contentEnd).join('\n');

                // 旧格式：> 别名：xxx, yyy
                const aliasMatch = entryContent.match(/^>\s*别名[:：]\s*(.+)$/m);
                // 新格式：[aka:xxx, yyy] 或 [aka：xxx, yyy]
                const akaMatch = entryContent.match(/\[aka[:：]\s*([^\]]+)\]/i);

                const aliases = [];
                if (aliasMatch) {
                    aliasMatch[1].split(/[,，、]/).map(s => this.stripInlineMarkdown(s.trim())).filter(Boolean)
                        .forEach(a => aliases.push(a));
                }
                if (akaMatch) {
                    akaMatch[1].split(/[,，、]\s*/).map(s => this.stripInlineMarkdown(s.trim())).filter(Boolean)
                        .forEach(a => aliases.push(a));
                }
                const uniqueAliases = [...new Set(aliases)];

                entries.push({
                    name,
                    path,
                    level,
                    content: entryContent.trim(),
                    aliases: uniqueAliases,
                    line: idx
                });
            }
        });

        return entries;
    },

    buildIndex(entries) {
        const nameMap = new Map();
        const aliasMap = new Map();
        const deepestPerBranch = new Map();

        // 计算每个分支的最大层级
        entries.forEach(e => {
            const branchKey = e.path.join(' > ') || '__root__';
            const currentMax = deepestPerBranch.get(branchKey) || 0;
            if (e.level > currentMax) deepestPerBranch.set(branchKey, e.level);
        });

        entries.forEach(e => {
            const branchKey = e.path.join(' > ') || '__root__';
            const maxLevel = deepestPerBranch.get(branchKey) || e.level;
            e.isDeepest = e.level >= maxLevel;

            nameMap.set(e.name, e);
            e.aliases.forEach(a => aliasMap.set(a, e));
        });

        const patterns = this.compilePattern(nameMap, aliasMap);

        return { entries, nameMap, aliasMap, patterns };
    },

    compilePattern(nameMap, aliasMap) {
        const names = Array.from(new Set([
            ...Array.from(nameMap.keys()),
            ...Array.from(aliasMap.keys())
        ]));
        if (names.length === 0) return [];

        // 按长度降序，避免短词覆盖长词
        names.sort((a, b) => b.length - a.length);

        const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const CHUNK = 500;
        const patterns = [];
        for (let i = 0; i < escaped.length; i += CHUNK) {
            const chunk = escaped.slice(i, i + CHUNK);
            try {
                patterns.push(new RegExp(`(${chunk.join('|')})`, 'g'));
            } catch (e) {
                console.error('[Dictionary] 正则块编译失败:', e);
            }
        }
        return patterns;
    },

    // ========== 渲染 ==========

    highlightCurrentPage() {
        if (!this.isEnabled() || !this.index || !this.index.patterns || this.index.patterns.length === 0) {
            return;
        }
        this.seenTerms.clear();

        const lines = document.querySelectorAll('#contentWrapper .doc-line');
        lines.forEach(line => {
            this.highlightLine(line);
        });
    },

    highlightLine(lineElement) {
        if (!lineElement || lineElement.querySelector('.dict-entry')) return;

        const patterns = this.index.patterns;
        const settings = this.config;
        const walker = document.createTreeWalker(
            lineElement,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            const parent = node.parentElement;
            if (parent && (parent.closest('code, pre, .dict-entry, .annotation-highlight'))) continue;
            textNodes.push(node);
        }

        // 从后向前处理，避免节点替换导致索引偏移
        for (let i = textNodes.length - 1; i >= 0; i--) {
            const textNode = textNodes[i];
            const text = textNode.textContent;
            let matches = [];
            let match;

            // 遍历所有正则块收集匹配
            for (let pi = 0; pi < patterns.length; pi++) {
                const pattern = patterns[pi];
                pattern.lastIndex = 0;
                while ((match = pattern.exec(text)) !== null) {
                    const term = match[1];
                    const entry = this.index.nameMap.get(term) || this.index.aliasMap.get(term);
                    if (!entry) continue;

                    // 非中文词条需要手动边界检查（避免 cat 匹配 catch）
                    const isCJK = /^[\u4e00-\u9fff]+$/.test(term);
                    if (!isCJK) {
                        const before = text[match.index - 1];
                        const after = text[match.index + term.length];
                        // 只有词条首字符本身是单词字符时，才需要前边界（如 [1] 依附于 dangerous 是允许的）
                        if (/^\w/.test(term) && before && /\w/.test(before)) continue;
                        // 只有词条尾字符本身是单词字符时，才需要后边界
                        if (/\w$/.test(term) && after && /\w/.test(after)) continue;
                    }

                    if (!settings.matchAllLevels && !entry.isDeepest) continue;
                    if (settings.frequency === 'first' && this.seenTerms.has(term)) continue;

                    matches.push({
                        start: match.index,
                        end: match.index + term.length,
                        term,
                        entry
                    });
                    if (settings.frequency === 'first') this.seenTerms.add(term);
                }
            }

            // 去重并按位置排序，处理重叠匹配（优先保留长的）
            const seen = new Map(); // start -> match
            matches.forEach(m => {
                const existing = seen.get(m.start);
                if (!existing || m.term.length > existing.term.length) {
                    seen.set(m.start, m);
                }
            });
            matches = Array.from(seen.values()).sort((a, b) => a.start - b.start);

            // 移除相互重叠的匹配（保留先出现/更长的）
            const filtered = [];
            let lastEnd = -1;
            for (const m of matches) {
                if (m.start >= lastEnd) {
                    filtered.push(m);
                    lastEnd = m.end;
                }
            }
            matches = filtered;

            if (matches.length === 0) continue;

            // 从后向前替换，避免位置偏移
            const parent = textNode.parentNode;
            const fragment = document.createDocumentFragment();
            let lastIndex = text.length;

            for (let j = matches.length - 1; j >= 0; j--) {
                const m = matches[j];
                // 添加匹配后的文本
                if (m.end < lastIndex) {
                    fragment.insertBefore(document.createTextNode(text.slice(m.end, lastIndex)), fragment.firstChild);
                }
                // 添加高亮 span
                const span = document.createElement('span');
                span.className = 'dict-entry';
                span.dataset.term = m.term;
                span.textContent = m.term;
                fragment.insertBefore(span, fragment.firstChild);
                lastIndex = m.start;
            }

            // 添加最前面的文本
            if (lastIndex > 0) {
                fragment.insertBefore(document.createTextNode(text.slice(0, lastIndex)), fragment.firstChild);
            }

            parent.replaceChild(fragment, textNode);
        }
    },

    unhighlightAll() {
        document.querySelectorAll('.dict-entry').forEach(el => {
            const parent = el.parentNode;
            if (!parent) return;
            // 将 span 替换为纯文本节点
            parent.insertBefore(document.createTextNode(el.textContent), el);
            parent.removeChild(el);
            // 合并相邻文本节点
            parent.normalize();
        });
    },

    // ========== 词条详情（统一 about-panel 形式） ==========

    showTermDetail(term, rect) {
        if (!this.index) return;
        const entry = this.index.nameMap.get(term) || this.index.aliasMap.get(term);
        if (!entry) return;

        const panel = document.getElementById('dictDetailPanel');
        const title = document.getElementById('dictDetailTitle');
        const body = document.getElementById('dictDetailBody');
        if (!panel || !title || !body) return;

        title.textContent = entry.name;
        body.innerHTML = '';
        this._renderEntryContent(body, entry);
        panel.classList.add('active');
    },

    hideTermDetail() {
        const panel = document.getElementById('dictDetailPanel');
        if (panel) panel.classList.remove('active');
    },

    _renderEntryContent(container, entry) {
        // 路径
        if (entry.path.length > 0) {
            const pathEl = document.createElement('div');
            pathEl.className = 'dict-detail-path';
            pathEl.textContent = entry.path.join(' > ');
            container.appendChild(pathEl);
        }
        // 别名
        if (entry.aliases.length > 0) {
            const aliasEl = document.createElement('div');
            aliasEl.className = 'dict-detail-alias';
            const aliasPrefix = Lumina.I18n?.t('dictionaryAliasPrefix') || '别名: ';
            aliasEl.textContent = aliasPrefix + entry.aliases.join(', ');
            container.appendChild(aliasEl);
        }
        // 内容：使用 Markdown 渲染
        const contentEl = document.createElement('div');
        contentEl.className = 'dict-detail-content markdown-body';
        // 过滤 aka 标签行，避免显示在释义中
        const cleanContent = entry.content.replace(/^\[aka[:：][^\]]+\]$/gim, '').trim();
        this._renderMarkdown(contentEl, cleanContent);
        container.appendChild(contentEl);
    },

    _renderMarkdown(container, markdownText) {
        if (!markdownText) return;
        try {
            const parsed = Lumina.Plugin?.Markdown?.Parser?.parse(markdownText);
            if (parsed && parsed.items) {
                parsed.items.forEach((item, idx) => {
                    const el = Lumina.Plugin?.Markdown?.Renderer?.render(item, idx);
                    if (el) {
                        el.classList.remove('doc-line');
                        el.style.margin = '0.3em 0';
                        container.appendChild(el);
                    }
                });
            } else {
                container.textContent = markdownText;
            }
        } catch (e) {
            console.warn('[Dictionary] Markdown 渲染失败:', e);
            container.textContent = markdownText;
        }
    },

    stripMarkdown(text) {
        if (!text) return '';
        return text
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^>\s*/gm, '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/~~([^~]+)~~/g, '$1')
            .replace(/==([^=]+)==/g, '$1')
            .replace(/\n+/g, ' ')
            .trim();
    },

    // ========== 面板 ==========

    renderPanel() {
        const container = document.getElementById('sidebarDictionaryList');
        if (!container) return;
        if (!this.index) {
            const emptyText = Lumina.I18n?.t('dictionaryEmpty') || '本书暂无词典数据';
            container.innerHTML = `<div class="dictionary-empty"><svg class="icon"><use href="#icon-book"/></svg><div>${emptyText}</div></div>`;
            return;
        }

        const entries = this.index.entries;
        if (entries.length === 0) {
            const emptyText = Lumina.I18n?.t('dictionaryEmpty') || '本书暂无词典数据';
            container.innerHTML = `<div class="dictionary-empty"><svg class="icon"><use href="#icon-book"/></svg><div>${emptyText}</div></div>`;
            return;
        }

        // 按 path 分组构建树
        const tree = this.buildTree(entries);
        container.innerHTML = this.renderTreeNodes(tree);

        // 绑定折叠事件
        container.querySelectorAll('.dict-tree-folder-header').forEach(header => {
            let touchStartX = 0, touchStartY = 0, isSwipe = false;
            header.addEventListener('touchstart', (e) => {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isSwipe = false;
            }, { passive: true });
            header.addEventListener('touchend', (e) => {
                const dx = e.changedTouches[0].clientX - touchStartX;
                const dy = e.changedTouches[0].clientY - touchStartY;
                if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
                    e.preventDefault();
                    e.stopPropagation();
                    isSwipe = true;
                    const folder = header.closest('.dict-tree-folder');
                    if (folder) {
                        if (dx > 0) {
                            folder.classList.remove('collapsed');
                        } else {
                            folder.classList.add('collapsed');
                        }
                    }
                }
            });
            header.addEventListener('click', (e) => {
                if (isSwipe) {
                    e.preventDefault();
                    e.stopPropagation();
                    isSwipe = false;
                    return;
                }
                const folder = header.closest('.dict-tree-folder');
                if (folder) folder.classList.toggle('collapsed');
            });
        });

        // 绑定词条点击事件
        container.querySelectorAll('.dict-tree-entry').forEach(el => {
            el.addEventListener('click', () => {
                const term = el.dataset.term;
                if (term) {
                    Lumina.Dictionary.showTermDetail(term, el.getBoundingClientRect());
                }
            });
        });
    },

    buildTree(entries) {
        const root = { children: new Map(), entries: [] };
        entries.forEach(e => {
            let current = root;
            e.path.forEach(segment => {
                if (!current.children.has(segment)) {
                    current.children.set(segment, { children: new Map(), entries: [] });
                }
                current = current.children.get(segment);
            });
            current.entries.push(e);
        });
        return root;
    },

    renderTreeNodes(node, level = 0) {
        let html = '';
        const childNames = new Set(node.children.keys());

        node.children.forEach((child, name) => {
            const padding = level * 12;
            html += `<div class="dict-tree-folder" style="padding-left:${padding}px">
                <div class="dict-tree-folder-header">
                    <span class="dict-fold-btn"><svg class="icon"><use href="#icon-caret-down"/></svg></span>
                    <span class="dict-tree-folder-name">${name}</span>
                </div>
                <div class="dict-tree-folder-children">`;
            html += this.renderTreeNodes(child, level + 1);
            html += '</div></div>';
        });
        node.entries.forEach(e => {
            if (childNames.has(e.name)) return; // 去重：跳过同时是 children 的 entry
            const padding = level * 12;
            html += `<div class="dict-tree-entry" data-term="${e.name}" style="padding-left:${padding}px">
                ${e.name}
            </div>`;
        });
        return html;
    },

    filterPanel(query) {
        const container = document.getElementById('sidebarDictionaryList');
        if (!container || !this.index) return;
        const q = (query || '').trim().toLowerCase();
        if (!q) {
            this.renderPanel();
            return;
        }
        const matched = this.index.entries.filter(e =>
            e.name.toLowerCase().includes(q) ||
            e.aliases.some(a => a.toLowerCase().includes(q))
        );
        if (matched.length === 0) {
            const noMatchText = Lumina.I18n?.t('dictionaryNoMatch') || '未找到匹配词条';
            container.innerHTML = `<div class="dictionary-empty"><div>${noMatchText}</div></div>`;
            return;
        }
        let html = '';
        matched.forEach(e => {
            const pathStr = e.path.join(' / ');
            html += `<div class="dict-tree-entry" data-term="${e.name}">
                ${e.name}
                <span class="dict-tree-path" style="opacity:0.6;font-size:0.85em;margin-left:8px;">${pathStr}</span>
            </div>`;
        });
        container.innerHTML = html;
        container.querySelectorAll('.dict-tree-entry').forEach(el => {
            el.addEventListener('click', () => {
                const term = el.dataset.term;
                if (term) {
                    Lumina.Dictionary.showTermDetail(term, el.getBoundingClientRect());
                }
            });
        });
    },

    // ========== 存储序列化 ==========

    serialize() {
        if (!this.index) return [];
        return [{
            source: 'dictionary',
            entryCount: this.index.entries.length,
            entries: this.index.entries.map(e => ({
                name: e.name,
                path: e.path,
                level: e.level,
                content: e.content.slice(0, 500), // 截断存储
                aliases: e.aliases,
                isDeepest: e.isDeepest
            })),
            patterns: this.index.patterns ? this.index.patterns.length : 0
        }];
    },

    loadFromStorage(stored) {
        if (!stored || stored.length === 0) {
            this.clear();
            return false;
        }
        const data = stored[0];
        const entries = (data.entries || []).map(e => ({
            ...e,
            content: e.content || ''
        }));
        this.index = this.buildIndex(entries);
        this.seenTerms.clear();
        return true;
    },

    // ========== 工具 ==========

    scrollToTerm(term) {
        const items = Lumina.State.app.document?.items || [];
        for (let i = 0; i < items.length; i++) {
            const text = items[i].text || items[i].display || '';
            if (text.includes(term)) {
                const chapter = Lumina.State.app.chapters.find(ch => i >= ch.startIndex && i <= ch.endIndex);
                if (chapter) {
                    const chIdx = Lumina.State.app.chapters.indexOf(chapter);
                    Lumina.Actions.navigateToChapter(chIdx, i);
                }
                return;
            }
        }
    }
};

// ========== 事件委托 ==========
// 点击词条显示详情面板
document.addEventListener('click', (e) => {
    const entryEl = e.target.closest('.dict-entry');
    if (entryEl) {
        const term = entryEl.dataset.term;
        if (term) {
            e.stopPropagation();
            Lumina.Dictionary.showTermDetail(term, entryEl.getBoundingClientRect());
        }
        return;
    }
    const treeEl = e.target.closest('.dict-tree-entry');
    if (treeEl) {
        const term = treeEl.dataset.term;
        if (term) Lumina.Dictionary.scrollToTerm(term);
    }
});

// 关闭词条详情面板
document.addEventListener('click', (e) => {
    if (e.target.closest('#closeDictDetail')) {
        Lumina.Dictionary.hideTermDetail();
    }
});

// 点击面板背景关闭（延迟绑定，确保 DOM 已就绪）
function bindDictDetailOverlay() {
    const panel = document.getElementById('dictDetailPanel');
    if (!panel) {
        setTimeout(bindDictDetailOverlay, 50);
        return;
    }
    panel.addEventListener('click', (e) => {
        if (e.target.id === 'dictDetailPanel') {
            Lumina.Dictionary.hideTermDetail();
        }
    });
}
bindDictDetailOverlay();
