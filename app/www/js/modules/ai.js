// ==================== 本地 AI 模块 (LM Studio / Ollama 兼容接口) ====================

Lumina.AI = {
    _abortController: null,
    _isDragging: false,
    _dragOffset: { x: 0, y: 0 },
    _fabPos: { x: 0, y: 0 },

    // 模式状态
    _isChatMode: false,
    _chatHistory: [],
    _forgottenRounds: 0,
    _currentBookKey: '',
    _quote: null,
    _chatDrag: { active: false, offsetX: 0, offsetY: 0 },

    getConfig() {
        return Lumina.ConfigManager.get('ai') || {
            enabled: false,
            endpoint: 'http://localhost:1234',
            model: '',
            apiKey: '',
            timeout: 30000,
            systemPrompt: '你是一个 helpful 的阅读助手。回答简洁、准确，直接给出结果，不要过度发挥。',
            fabX: null,
            fabY: null,
            maxTokens: 4096
        };
    },

    saveConfig(config) {
        Lumina.ConfigManager.set('ai', config);
    },

    isAvailable() {
        const cfg = this.getConfig();
        return cfg.enabled && cfg.endpoint;
    },

    init() {
        this._initFAB();
        this._initTaskPanel();
        this._initChatPanel();
        this._updateFABVisibility();
        window.addEventListener('languageChanged', () => this._updateFABVisibility());
        window.addEventListener('fileOpened', () => this._onReadingContextChanged('file'));
        window.addEventListener('chapterRendered', () => this._onReadingContextChanged('chapter'));
        document.addEventListener('selectionchange', this._debounce(() => this._onReadingContextChanged('selection'), 200));
    },

    _debounce(fn, wait) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
    },

    _onReadingContextChanged(source) {
        if (!this.isAvailable() || !this._isChatPanelOpen()) return;
        if (source === 'file') {
            this._currentBookKey = '';
            this._chatHistory = [];
            this._forgottenRounds = 0;
            this._removeForgetHint();
            this._resetQuoteForCurrentContext();
            this._updateContextBar();
        } else if (source === 'chapter') {
            // chapter 切换/翻页后，若当前引用已失效，刷新选项状态
            this._refreshQuoteOptions();
            this._updateQuoteBar();
            this._updateContextBar();
        } else if (source === 'selection') {
            const sel = window.getSelection()?.toString()?.trim();
            if (sel) {
                this._quote = { type: 'selection', label: '' };
                this._updateQuoteLabel();
                this._updateQuoteBar();
                this._updateContextBar();
            } else if (this._quote?.type === 'selection') {
                // 选区消失，不再硬编码兜底为 chapter，交给刷新逻辑自动切到第一个可用类型
                this._refreshQuoteOptions();
                this._updateContextBar();
            }
            const popover = document.getElementById('aiQuotePopover');
            if (popover?.classList.contains('active')) {
                this._refreshQuoteOptions();
            }
        } else if (source === 'scroll') {
            if (this._quote?.type === 'paragraph') {
                this._updateQuoteBar();
                this._updateContextBar();
            }
        }
    },

    _resetQuoteForCurrentContext() {
        const sel = window.getSelection()?.toString()?.trim();
        if (sel) {
            this._quote = { type: 'selection', label: '' };
        } else {
            // 默认使用段落（视觉焦点段落），打开书籍后必然存在
            this._quote = { type: 'paragraph', label: '' };
        }
        this._updateQuoteLabel();
        this._updateQuoteBar();
        this._updateContextBar();
    },

    _updateFABVisibility() {
        const fab = document.getElementById('aiFab');
        if (!fab) return;
        fab.style.display = this.isAvailable() ? 'flex' : 'none';
    },

    _getSafeAreaBottom() {
        const val = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-bottom');
        return parseFloat(val) || 0;
    },

    _isMobile() {
        return window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    },

    // ==================== FAB 手势控制 ====================
    _initFAB() {
        const fab = document.getElementById('aiFab');
        if (!fab) return;

        const cfg = this.getConfig();
        const size = 40;
        const margin = 8;
        const marginSide = 16;
        const marginBottom = 16;
        const safeAreaBottom = this._getSafeAreaBottom();
        const bottomOffset = Math.max(marginBottom, marginBottom + safeAreaBottom);
        const vw = window.visualViewport;
        const vpW = vw ? vw.width : window.innerWidth;
        const vpH = vw ? vw.height : window.innerHeight;

        if (cfg.fabX != null && cfg.fabY != null) {
            this._fabPos = { x: cfg.fabX, y: cfg.fabY };
        } else {
            this._fabPos = {
                x: vpW - size - marginSide,
                y: vpH - size - bottomOffset
            };
        }
        this._fabPos.x = Math.max(margin, Math.min(this._fabPos.x, vpW - size - margin));
        this._fabPos.y = Math.max(margin, Math.min(this._fabPos.y, vpH - size - bottomOffset));
        // PC Web 兜底：如果仍显得贴底，额外抬高 24px
        if (!this._isMobile() && this._fabPos.y + size > vpH - 8) {
            this._fabPos.y = vpH - size - Math.max(bottomOffset, 24);
        }
        this._applyFabPos();

        const onViewportChange = () => {
            const safeB = this._getSafeAreaBottom();
            const botOff = Math.max(marginBottom, marginBottom + safeB);
            const vW = window.visualViewport ? window.visualViewport.width : window.innerWidth;
            const vH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            this._fabPos.x = Math.min(this._fabPos.x, vW - size - margin);
            this._fabPos.y = Math.min(this._fabPos.y, vH - size - botOff);
            this._fabPos.x = Math.max(margin, this._fabPos.x);
            this._fabPos.y = Math.max(margin, this._fabPos.y);
            if (!this._isMobile() && this._fabPos.y + size > vH - 8) {
                this._fabPos.y = vH - size - Math.max(botOff, 24);
            }
            this._applyFabPos();
        };

        window.addEventListener('resize', onViewportChange);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', onViewportChange);
        }

        // 拖拽
        const onStart = (e) => {
            if (e.button && e.button !== 0) return;
            this._isDragging = false;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const rect = fab.getBoundingClientRect();
            this._dragOffset = { x: clientX - rect.left, y: clientY - rect.top };

            const onMove = (ev) => {
                this._isDragging = true;
                const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
                const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
                let nx = cx - this._dragOffset.x;
                let ny = cy - this._dragOffset.y;
                const safeB = this._getSafeAreaBottom();
                const botOff = Math.max(marginBottom, marginBottom + safeB);
                const vW = window.visualViewport ? window.visualViewport.width : window.innerWidth;
                const vH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                nx = Math.max(margin, Math.min(nx, vW - size - margin));
                ny = Math.max(margin, Math.min(ny, vH - size - botOff));
                this._fabPos = { x: nx, y: ny };
                this._applyFabPos();
            };

            const onEnd = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onEnd);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
                const c = this.getConfig();
                c.fabX = this._fabPos.x;
                c.fabY = this._fabPos.y;
                this.saveConfig(c);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        };

        fab.addEventListener('mousedown', onStart);
        fab.addEventListener('touchstart', onStart, { passive: false });

        // 手势：长按 vs 单击/双击
        let longPressTimer = null;
        let clickTimer = null;
        let clickCount = 0;
        let isLongPress = false;

        const startPress = () => {
            isLongPress = false;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                if (navigator.vibrate) navigator.vibrate(40);
                this._enterChatMode();
                this.openChatPanel();
            }, 500);
        };

        const endPress = () => {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        };

        fab.addEventListener('mousedown', startPress);
        fab.addEventListener('touchstart', startPress, { passive: true });
        fab.addEventListener('mouseup', endPress);
        fab.addEventListener('touchend', endPress);

        fab.addEventListener('click', (e) => {
            if (this._isDragging) { this._isDragging = false; return; }
            if (isLongPress) { e.stopPropagation(); return; }

            // 若任何面板开着，立即关闭
            if (this._isAnyPanelOpen()) {
                this.closeAnyPanel();
                return;
            }

            clickCount++;
            if (clickTimer) clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
                if (clickCount === 1) {
                    if (this._isChatMode) this.openChatPanel();
                    else this.openTaskPanel();
                } else if (clickCount >= 2) {
                    this.openTaskPanel(); // 双击打开任务面板
                }
                clickCount = 0;
            }, 250);
        });
    },

    _applyFabPos() {
        const fab = document.getElementById('aiFab');
        if (fab) {
            fab.style.left = `${this._fabPos.x}px`;
            fab.style.top = `${this._fabPos.y}px`;
            fab.style.right = 'auto';
            fab.style.bottom = 'auto';
        }
    },

    _enterChatMode() {
        if (this._isChatMode) return;
        this._isChatMode = true;
        this._chatHistory = [];
        this._forgottenRounds = 0;
        const doc = Lumina.State.app.document;
        if (doc?.items?.length > 0) {
            this._resetQuoteForCurrentContext();
        } else {
            this._quote = null;
            this._updateContextBar();
        }
    },

    _isAnyPanelOpen() {
        return this._isTaskPanelOpen() || this._isChatPanelOpen();
    },

    closeAnyPanel() {
        this.closeTaskPanel();
        this.closeChatPanel();
    },

    // ==================== 临时任务面板 ====================
    _initTaskPanel() {
        const panel = document.getElementById('aiPanel');
        const closeBtn = document.getElementById('aiPanelClose');
        const copyBtn = document.getElementById('aiCopyBtn');
        const exportBtn = document.getElementById('aiExportBtn');

        if (closeBtn) closeBtn.addEventListener('click', () => this.closeTaskPanel());
        if (panel) {
            panel.addEventListener('click', (e) => {
                if (e.target === panel) this.closeTaskPanel();
            });
        }
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                const text = document.getElementById('aiResultContent')?.innerText || '';
                try {
                    await navigator.clipboard.writeText(text);
                    Lumina.UI.showToast(Lumina.I18n.t('textCopied') || '已复制');
                } catch (e) {
                    Lumina.UI.showToast(Lumina.I18n.t('copyFailed') || '复制失败');
                }
            });
        }
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const text = document.getElementById('aiResultContent')?.innerText || '';
                if (!text.trim()) {
                    Lumina.UI.showToast(Lumina.I18n.t('aiNoResult') || '没有可导出的内容');
                    return;
                }
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `AI-result-${new Date().toISOString().slice(0,10)}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                Lumina.UI.showToast(Lumina.I18n.t('aiExported') || '已导出 TXT');
            });
        }

        const actions = document.querySelectorAll('.ai-action-btn');
        actions.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const context = document.getElementById('aiContextText')?.value?.trim() || '';
                if (!context) {
                    Lumina.UI.showToast(Lumina.I18n.t('aiNoContext') || '没有可用的上下文');
                    return;
                }
                this._runAction(action, context);
            });
        });
    },

    _isTaskPanelOpen() {
        return document.getElementById('aiPanel')?.classList.contains('active');
    },

    openTaskPanel() {
        const panel = document.getElementById('aiPanel');
        if (!panel) return;
        this.closeChatPanel();
        const contextText = document.getElementById('aiContextText');
        const contextHint = document.getElementById('aiContextHint');
        const resultContent = document.getElementById('aiResultContent');
        const resultPlaceholder = document.getElementById('aiResultPlaceholder');

        const { text, source } = this._getContextText();
        const maxLen = 4000;
        let displayText = text;
        if (displayText.length > maxLen) {
            displayText = displayText.slice(0, maxLen) + '\n\n[... ' + (Lumina.I18n.t('aiTruncated') || '内容已截断，可在上方编辑后发送') + ' ...]';
        }

        if (contextText) contextText.value = displayText;
        if (contextHint) {
            contextHint.textContent = source === 'selection'
                ? (Lumina.I18n.t('aiContextSelection') || '已提取当前选中的文本')
                : (Lumina.I18n.t('aiContextChapter') || '已提取当前章节内容');
        }
        if (resultContent) resultContent.innerHTML = '';
        if (resultPlaceholder) {
            resultPlaceholder.style.display = 'block';
            resultPlaceholder.textContent = Lumina.I18n.t('aiResultPlaceholder') || '点击上方按钮开始对话';
        }
        this._setFooterVisible(false);

        panel.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeTaskPanel() {
        const panel = document.getElementById('aiPanel');
        if (panel) panel.classList.remove('active');
        document.body.style.overflow = '';
        this.cancel();
        this._stopThinking();
    },

    _setFooterVisible(visible) {
        const footer = document.getElementById('aiPanelFooter');
        if (footer) footer.style.display = visible ? 'flex' : 'none';
    },

    _startThinking() {
        const placeholder = document.getElementById('aiResultPlaceholder');
        const thinking = document.getElementById('aiThinking');
        if (placeholder) placeholder.style.display = 'none';
        if (thinking) thinking.style.display = 'flex';
    },

    _stopThinking() {
        const thinking = document.getElementById('aiThinking');
        if (thinking) thinking.style.display = 'none';
    },

    _setLoading(loading) {
        if (loading) {
            this._startThinking();
            this._setFooterVisible(false);
        } else {
            this._stopThinking();
            const resultPlaceholder = document.getElementById('aiResultPlaceholder');
            if (resultPlaceholder) resultPlaceholder.style.display = 'none';
            this._setFooterVisible(true);
        }
    },

    _renderResult(html) {
        const resultContent = document.getElementById('aiResultContent');
        const resultPlaceholder = document.getElementById('aiResultPlaceholder');
        if (!resultContent) return;
        resultContent.innerHTML = html;
        if (resultPlaceholder) resultPlaceholder.style.display = 'none';
    },

    _renderStreamingResult(text) {
        const resultContent = document.getElementById('aiResultContent');
        if (!resultContent) return;
        resultContent.innerHTML = this._renderMarkdownInline(text);
    },

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _renderMarkdown(text) {
        const parser = Lumina.Plugin?.Markdown?.Parser;
        const renderer = Lumina.Plugin?.Markdown?.Renderer;
        if (!parser || !renderer || !text) {
            return this._escapeHtml(text || '').replace(/\n/g, '<br>');
        }
        try {
            const parsed = parser.parse(text);
            if (!parsed?.items?.length) {
                return this._escapeHtml(text).replace(/\n/g, '<br>');
            }
            const container = document.createElement('div');
            container.className = 'ai-markdown-body';
            parsed.items.forEach((item) => {
                const el = renderer.render(item, -1);
                if (el) {
                    el.classList.remove('doc-line');
                    delete el.dataset.index;
                    container.appendChild(el);
                }
            });
            // 给表格加 wrapper，防止撑破气泡
            container.querySelectorAll('table').forEach((table) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'markdown-table-wrapper';
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            });
            return container.innerHTML;
        } catch (e) {
            console.warn('[AI] Markdown render failed, fallback to plain text:', e);
            return this._escapeHtml(text).replace(/\n/g, '<br>');
        }
    },

    _renderMarkdownInline(text) {
        if (!text) return '';
        let html = this._escapeHtml(text).replace(/\n/g, '<br>');

        // 保护已渲染的标签，避免被标题规则误匹配
        const placeholders = [];
        const protect = (regex) => {
            html = html.replace(regex, (match) => {
                placeholders.push(match);
                return `\u0000${placeholders.length - 1}\u0000`;
            });
        };
        protect(/<(code|strong|em|del|a)[^>]*>.*?<\/\1>/g);

        // 标题：独占一行，# 开头
        html = html.replace(/(^|<br>)(#{1,6})\s+([^<]+?)(?=<br>|$)/g, (match, prefix, hashes, content) => {
            const level = hashes.length;
            return `${prefix}<h${level} class="markdown-heading markdown-h${level}">${content.trim()}</h${level}>`;
        });

        // 恢复受保护的标签
        html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => placeholders[i]);

        // 行内代码
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        // 粗体
        html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        // 斜体
        html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
        html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
        // 删除线
        html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        // 链接
        html = html.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        return html;
    },

    _getContextText() {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            return { text: selection.toString().trim(), source: 'selection' };
        }
        const state = Lumina.State.app;
        const chapter = state.chapters[state.currentChapterIndex];
        if (!chapter || !state.document?.items) return { text: '', source: 'chapter' };
        const items = state.document.items.slice(chapter.startIndex, chapter.endIndex + 1);
        const text = items.map(i => i.text).join('\n').trim();
        return { text, source: 'chapter' };
    },

    getPrompts() {
        const t = Lumina.I18n.t;
        return {
            explain: {
                label: t('aiExplain') || '解释',
                system: '请用简洁的中文解释以下段落的核心含义，不要过度发挥。'
            },
            translate: {
                label: t('aiTranslate') || '翻译',
                system: '请翻译以下文本。如果是中文则翻译成英文，如果是其他语言则翻译成中文。保持原文风格。'
            },
            summary: {
                label: t('aiSummary') || '摘要',
                system: '请为以下内容生成一段不超过 100 字的摘要。'
            },
            rewrite: {
                label: t('aiRewrite') || '润色',
                system: '请对以下文本进行润色，使其表达更流畅、优美，但不要改变原意。'
            }
        };
    },

    _runAction(action, context) {
        const prompts = this.getPrompts();
        const p = prompts[action];
        if (!p) return;
        this._sendTaskChat(p.system, context);
    },

    async _streamChat(url, cfg, messages, onDelta, onDone, onError) {
        this._abortController = new AbortController();
        this._userCancelled = false;
        // 动态超时：本地模型处理长文本首 token 很慢，按内容长度计算
        // 基础 30 秒 + 每 1000 字符 10 秒，最小 60 秒，最大 300 秒（5 分钟）
        const contentLength = JSON.stringify(messages).length;
        const dynamicTimeout = Math.min(300000, Math.max(60000, 30000 + Math.floor(contentLength / 1000) * 10000));
        // getConfig 默认 timeout 是 30000，对于本地模型太短，必须取两者较大值
        const timeoutMs = Math.max(cfg.timeout || 30000, dynamicTimeout);
        const timeoutId = setTimeout(() => this._abortController.abort(), timeoutMs);
        let buffer = '';
        let receivedAny = false;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(cfg.apiKey ? { 'Authorization': `Bearer ${cfg.apiKey}` } : {})
                },
                body: JSON.stringify({
                    model: cfg.model || 'local-model',
                    messages,
                    temperature: 0.7,
                    stream: true
                }),
                signal: this._abortController.signal
            });

            if (!res.ok) {
                clearTimeout(timeoutId);
                const errText = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${errText}`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const dataStr = trimmed.slice(5).trim();
                    if (dataStr === '[DONE]') {
                        clearTimeout(timeoutId);
                        onDone?.();
                        this._abortController = null;
                        return;
                    }
                    try {
                        const json = JSON.parse(dataStr);
                        const delta = json.choices?.[0]?.delta?.content;
                        if (typeof delta === 'string') {
                            if (!receivedAny) {
                                receivedAny = true;
                                clearTimeout(timeoutId);
                            }
                            onDelta?.(delta);
                        }
                    } catch (e) {
                        // ignore malformed JSON
                    }
                }
            }

            clearTimeout(timeoutId);
            onDone?.();
        } catch (err) {
            clearTimeout(timeoutId);
            onError?.(err);
        } finally {
            this._abortController = null;
        }
    },

    async _sendTaskChat(systemPrompt, userContent) {
        const cfg = this.getConfig();
        if (!this.isAvailable()) {
            Lumina.UI.showToast(Lumina.I18n.t('aiNotAvailable') || '本地 AI 未启用');
            return;
        }
        const url = `${cfg.endpoint.replace(/\/$/, '')}/v1/chat/completions`;
        const messages = [
            { role: 'system', content: cfg.systemPrompt || systemPrompt },
            { role: 'user', content: userContent }
        ];
        this._renderResult('');
        this._setLoading(true);

        let reply = '';
        let started = false;

        await this._streamChat(url, cfg, messages,
            (delta) => {
                if (!started) {
                    started = true;
                    this._setLoading(false);
                }
                reply += delta;
                this._renderStreamingResult(reply);
            },
            () => {
                if (!started) this._setLoading(false);
                this._setFooterVisible(true);
                if (!reply.trim()) {
                    this._renderResult(`<span style="opacity:.7;">${Lumina.I18n.t('aiEmptyResponse') || '模型返回为空'}</span>`);
                } else {
                    this._renderResult(this._renderMarkdown(reply));
                }
            },
            (err) => {
                if (!started) this._setLoading(false);
                this._setFooterVisible(true);
                if (err.name === 'AbortError' && this._userCancelled && reply.trim()) {
                    this._renderResult(this._renderMarkdown(reply));
                } else if (err.name === 'AbortError') {
                    this._renderResult(`<span style="opacity:.7;">${Lumina.I18n.t('aiCancelled') || '已取消'}</span>`);
                } else if (this._isContextOverflowError(err)) {
                    const msg = '输入内容超过 LM Studio 模型的上下文长度。请在 LM Studio 中调大 Context Length，或减少引用范围。';
                    this._renderResult(`<span style="color:#e57373;">${this._escapeHtml(msg)}</span>`);
                } else {
                    this._renderResult(`<span style="color:#e57373;">${this._escapeHtml(Lumina.I18n.t('aiError')?.replace?.('$1', err.message) || `AI 请求失败: ${err.message}`)}</span>`);
                }
            }
        );
    },

    _isContextOverflowError(err) {
        const msg = (err?.message || '').toLowerCase();
        return msg.includes('context length') || msg.includes('overflow') || msg.includes('not enough');
    },

    // ==================== 对话模式面板 ====================
    _initChatPanel() {
        const overlay = document.getElementById('aiChatOverlay');
        const panel = document.getElementById('aiChatPanel');
        const closeBtn = document.getElementById('aiChatClose');
        const clearContextBtn = document.getElementById('aiChatClearContext');
        const copyAllBtn = document.getElementById('aiChatCopyAll');
        const exportBtn = document.getElementById('aiChatExport');
        const sendBtn = document.getElementById('aiSendBtn');
        const input = document.getElementById('aiChatInput');
        const quoteBtn = document.getElementById('aiQuoteBtn');
        const quoteClose = document.getElementById('aiQuoteClose');
        const header = document.getElementById('aiChatHeader');

        if (closeBtn) closeBtn.addEventListener('click', () => this.closeChatPanel());

        if (clearContextBtn) {
            clearContextBtn.addEventListener('click', () => {
                this._chatHistory = [];
                this._forgottenRounds = 0;
                this._removeForgetHint();
                this._updateContextBar();
                Lumina.UI.showToast(Lumina.I18n.t('aiContextCleared') || '对话上下文已清除');
            });
        }

        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', async () => {
                const text = this._formatChatForExport();
                try {
                    await navigator.clipboard.writeText(text);
                    Lumina.UI.showToast(Lumina.I18n.t('textCopied') || '已复制');
                } catch (e) {
                    Lumina.UI.showToast(Lumina.I18n.t('copyFailed') || '复制失败');
                }
            });
        }
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const text = this._formatChatForExport();
                if (!text.trim()) {
                    Lumina.UI.showToast(Lumina.I18n.t('aiNoResult') || '没有可导出的内容');
                    return;
                }
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `AI-chat-${new Date().toISOString().slice(0,10)}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                Lumina.UI.showToast(Lumina.I18n.t('aiExported') || '已导出 TXT');
            });
        }
        if (sendBtn && input) {
            sendBtn.addEventListener('click', () => {
                if (sendBtn.dataset.generating === 'true') {
                    this.cancel();
                } else {
                    this._sendChatMessage();
                }
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (sendBtn?.dataset.generating === 'true') return;
                    this._sendChatMessage();
                }
            });
            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 120) + 'px';
                this._updateContextBar();
            });
        }
        if (quoteBtn) {
            quoteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleQuotePopover();
            });
        }
        if (quoteClose) {
            quoteClose.addEventListener('click', () => {
                this._quote = null;
                this._refreshQuoteOptions();
                this._updateQuoteBar();
                this._updateContextBar();
                const quoteBar = document.getElementById('aiQuoteBar');
                if (quoteBar) {
                    quoteBar.classList.add('hidden-anim');
                    setTimeout(() => {
                        if (!this._quote) quoteBar.style.display = 'none';
                    }, 260);
                }
            });
        }
        document.addEventListener('click', (e) => {
            const popover = document.getElementById('aiQuotePopover');
            if (popover && !popover.contains(e.target) && e.target !== quoteBtn && popover.classList.contains('active')) {
                popover.classList.remove('active');
                const quoteBar = document.getElementById('aiQuoteBar');
                if (quoteBar) quoteBar.classList.remove('hidden-anim');
            }
        });

        // 引用选项
        document.querySelectorAll('.ai-quote-option').forEach(el => {
            el.addEventListener('click', () => {
                if (el.classList.contains('disabled')) return;
                const type = el.dataset.quote;
                this._quote = { type, label: '' };
                this._updateQuoteLabel();
                document.getElementById('aiQuotePopover')?.classList.remove('active');
                const quoteBar = document.getElementById('aiQuoteBar');
                if (quoteBar) {
                    quoteBar.classList.remove('hidden-anim');
                    // 先更新内容，等动画展开
                    setTimeout(() => { this._updateQuoteBar(); this._updateContextBar(); }, 50);
                } else {
                    this._updateQuoteBar();
                    this._updateContextBar();
                }
            });
        });

        // PC 拖拽 + ResizeObserver 记录尺寸
        if (header && panel) {
            header.addEventListener('mousedown', (e) => {
                if (this._isMobile()) return;
                if (e.target.closest('.btn-icon')) return;
                this._chatDrag.active = true;
                const rect = panel.getBoundingClientRect();
                this._chatDrag.offsetX = e.clientX - rect.left;
                this._chatDrag.offsetY = e.clientY - rect.top;
                panel.style.transition = 'none';
                panel.style.opacity = '0.85';
            });
            document.addEventListener('mousemove', (e) => {
                if (!this._chatDrag.active) return;
                const p = document.getElementById('aiChatPanel');
                if (!p) return;
                let nx = e.clientX - this._chatDrag.offsetX;
                let ny = e.clientY - this._chatDrag.offsetY;
                const maxX = window.innerWidth - p.offsetWidth;
                const maxY = window.innerHeight - p.offsetHeight;
                nx = Math.max(0, Math.min(nx, maxX));
                ny = Math.max(0, Math.min(ny, maxY));
                p.style.left = nx + 'px';
                p.style.top = ny + 'px';
                p.style.right = 'auto';
                p.style.bottom = 'auto';
            });
            document.addEventListener('mouseup', () => {
                if (this._chatDrag.active) {
                    this._chatDrag.active = false;
                    const p = document.getElementById('aiChatPanel');
                    if (p) {
                        p.style.transition = '';
                        p.style.opacity = '';
                        const rect = p.getBoundingClientRect();
                        const c = this.getConfig();
                        c.chatPanelX = rect.left;
                        c.chatPanelY = rect.top;
                        this.saveConfig(c);
                    }
                }
            });
        }
        if (panel && typeof ResizeObserver !== 'undefined') {
            let resizeTimer = null;
            this._resizeObserver = new ResizeObserver(() => {
                if (!panel.classList.contains('draggable')) return;
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    const c = this.getConfig();
                    c.chatPanelWidth = panel.offsetWidth;
                    c.chatPanelHeight = panel.offsetHeight;
                    this.saveConfig(c);
                }, 300);
            });
            this._resizeObserver.observe(panel);
        }
    },

    _isChatPanelOpen() {
        return document.getElementById('aiChatOverlay')?.classList.contains('active');
    },

    openChatPanel() {
        const overlay = document.getElementById('aiChatOverlay');
        const panel = document.getElementById('aiChatPanel');
        if (!overlay || !panel) return;
        if (!this._scrollBound) {
            this._scrollBound = true;
            const scroller = Lumina.DOM.contentScroll;
            if (scroller) {
                scroller.addEventListener('scroll', this._debounce(() => this._onReadingContextChanged('scroll'), 300));
            }
        }
        this.closeTaskPanel();
        overlay.classList.add('active');
        if (this._isMobile()) {
            overlay.classList.add('mobile-fullscreen');
            panel.classList.remove('draggable');
            document.body.style.overflow = 'hidden';
        } else {
            overlay.classList.remove('mobile-fullscreen');
            panel.classList.add('draggable');
            const cfg = this.getConfig();
            if (cfg.chatPanelWidth) panel.style.width = cfg.chatPanelWidth + 'px';
            if (cfg.chatPanelHeight) panel.style.height = cfg.chatPanelHeight + 'px';
            if (cfg.chatPanelX != null) {
                panel.style.left = cfg.chatPanelX + 'px';
                panel.style.right = 'auto';
            } else {
                panel.style.right = '24px';
                panel.style.left = 'auto';
            }
            if (cfg.chatPanelY != null) {
                panel.style.top = cfg.chatPanelY + 'px';
                panel.style.bottom = 'auto';
            } else {
                panel.style.bottom = '24px';
                panel.style.top = 'auto';
            }
        }
        const doc = Lumina.State.app.document;
        if (!this._quote && doc?.items?.length > 0) {
            this._resetQuoteForCurrentContext();
        }
        this._updateQuoteBar();
        this._updateContextBar();
        this._scrollChatToBottom();
    },

    closeChatPanel() {
        const overlay = document.getElementById('aiChatOverlay');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
        this.cancel();
        this._removeChatThinking();
    },

    _toggleQuotePopover() {
        const popover = document.getElementById('aiQuotePopover');
        const quoteBar = document.getElementById('aiQuoteBar');
        if (!popover) return;
        const isActive = popover.classList.contains('active');
        if (isActive) {
            popover.classList.remove('active');
            if (quoteBar) quoteBar.classList.remove('hidden-anim');
            return;
        }
        // 隐藏 quote bar，展开 popover
        if (quoteBar && quoteBar.style.display !== 'none') quoteBar.classList.add('hidden-anim');
        this._refreshQuoteOptions();
        popover.classList.add('active');
    },

    _refreshQuoteOptions() {
        const types = ['selection','paragraph','page','chapter','book'];
        let firstAvailable = '';
        const hasBook = !!(Lumina.State.app.document?.items?.length > 0);
        types.forEach(type => {
            const text = this._getQuoteText(type, false);
            const len = text.length;
            const descEl = document.getElementById(`aiQuoteDesc${type.charAt(0).toUpperCase() + type.slice(1)}`);
            if (descEl) descEl.textContent = len === 0 ? '—' : '';
            const opt = document.querySelector(`.ai-quote-option[data-quote="${type}"]`);
            if (opt) {
                opt.classList.toggle('disabled', len === 0);
                // 未打开书籍时全部显示但置灰；打开书籍后，空内容选项直接隐藏
                opt.style.display = (len === 0 && hasBook) ? 'none' : '';
                if (len > 0 && !firstAvailable) firstAvailable = type;
                const nameDiv = opt.querySelector('div');
                if (nameDiv) {
                    const full = Lumina.I18n.t(`aiQuote${type.charAt(0).toUpperCase() + type.slice(1)}`) || type;
                    const short = full.length > 4 ? full.slice(0, 4) : full;
                    nameDiv.textContent = short;
                }
            }
        });
        // 未打开书籍：没有任何可用引用
        if (!firstAvailable) {
            this._quote = null;
            this._updateQuoteBar();
            return;
        }
        // 当前无引用或当前引用不可用时，自动切换到第一个可用类型
        if (firstAvailable && (!this._quote?.type || this._getQuoteText(this._quote.type, false).length === 0)) {
            this._quote = { type: firstAvailable, label: '' };
            this._updateQuoteLabel();
            this._updateQuoteBar();
            this._updateContextBar();
        }
        // 同步高亮状态
        document.querySelectorAll('.ai-quote-option').forEach(o => o.classList.toggle('active', o.dataset.quote === this._quote?.type));
    },

    _getQuoteText(type, withTruncate = true) {
        const state = Lumina.State.app;
        const doc = state.document;
        const chapter = state.chapters?.[state.currentChapterIndex];
        const maxLen = withTruncate ? Math.floor((this.getConfig().maxTokens || 4096) * 1.4) : Infinity;

        let text = '';
        switch (type) {
            case 'selection': {
                const sel = window.getSelection()?.toString()?.trim();
                text = sel || this._quote?.snapshot || '';
                break;
            }
            case 'paragraph': {
                if (chapter && doc?.items) {
                    let globalIdx = -1;
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        let node = range.commonAncestorContainer;
                        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
                        const lineEl = node?.closest('.doc-line.paragraph');
                        if (lineEl) globalIdx = parseInt(lineEl.dataset.index, 10);
                    }
                    if (globalIdx < 0 && Lumina.Renderer.getCurrentVisibleIndex) {
                        const centerIdx = Lumina.Renderer.getCurrentVisibleIndex();
                        // 从视觉中心往前往后找最近的正文段落（.doc-line.paragraph）
                        const paragraphs = Array.from(document.querySelectorAll('.doc-line.paragraph[data-index]'));
                        let best = -1;
                        let minDist = Infinity;
                        paragraphs.forEach(el => {
                            const idx = parseInt(el.dataset.index, 10);
                            const dist = Math.abs(idx - centerIdx);
                            if (dist < minDist) {
                                minDist = dist;
                                best = idx;
                            }
                        });
                        globalIdx = best;
                    }
                    if (globalIdx >= 0 && doc.items[globalIdx]?.text) {
                        text = doc.items[globalIdx].text.trim();
                    }
                }
                break;
            }
            case 'page': {
                if (chapter && doc?.items) {
                    const state = Lumina.State.app;
                    const ranges = state.pageRanges || chapter.pageRanges;
                    const pageIdx = state.currentPageIdx || 0;
                    if (ranges && ranges[pageIdx]) {
                        const range = ranges[pageIdx];
                        const start = chapter.startIndex + range.start;
                        const end = chapter.startIndex + range.end + 1;
                        text = doc.items.slice(start, end).map(i => i.text).join('\n').trim();
                    } else {
                        text = doc.items.slice(chapter.startIndex, chapter.endIndex + 1).map(i => i.text).join('\n').trim();
                    }
                }
                break;
            }
            case 'chapter': {
                if (chapter && doc?.items) {
                    text = doc.items.slice(chapter.startIndex, chapter.endIndex + 1).map(i => i.text).join('\n').trim();
                }
                break;
            }
            case 'book': {
                text = doc?.items?.map(i => i.text).join('\n').trim() || '';
                break;
            }
        }
        if (withTruncate && text.length > maxLen) {
            text = text.slice(0, maxLen) + '\n\n[... ' + (Lumina.I18n.t('aiTruncated') || '内容已截断') + ' ...]';
        }
        return text;
    },

    _updateQuoteLabel() {
        const t = Lumina.I18n.t;
        const map = {
            selection: t('aiQuoteSelection') || '选区',
            paragraph: t('aiQuoteParagraph') || '段落',
            page: t('aiQuotePage') || '页面',
            chapter: t('aiQuoteChapter') || '章节',
            book: t('aiQuoteBook') || '全书'
        };
        if (this._quote) {
            this._quote.label = map[this._quote.type] || this._quote.type;
        }
    },

    _updateQuoteBar() {
        const bar = document.getElementById('aiQuoteBar');
        const label = document.getElementById('aiQuoteLabel');
        const preview = document.getElementById('aiQuotePreview');
        if (!bar || !label) return;
        if (!this._quote) {
            bar.style.display = 'none';
            return;
        }
        const text = this._getQuoteText(this._quote.type, false);
        if (this._quote) this._quote.snapshot = text;
        if (!text || text.length === 0) {
            bar.style.display = 'none';
            return;
        }
        const len = text.length;
        const tokens = Math.ceil(len / 2);
        const t = Lumina.I18n.t;
        const charsBase = t('aiChars') || '字';
        const tokensBase = t('aiTokens') || '词元';
        const charsLabel = (charsBase === 'char' && len !== 1) ? charsBase + 's' : charsBase;
        const tokensLabel = (tokensBase === 'token' && tokens !== 1) ? tokensBase + 's' : tokensBase;
        const charsStr = (charsBase === 'char') ? `${len} ${charsLabel}` : `${len}${charsLabel}`;
        const tokensStr = (tokensBase === 'token') ? `${tokens} ${tokensLabel}` : `${tokens}${tokensLabel}`;
        const sizeLabel = len > 9999 
            ? `${Math.round(len/1000)}k ${charsBase === 'char' ? charsLabel : charsBase} · ${tokensStr}` 
            : `${charsStr} · ${tokensStr}`;
        label.textContent = `${this._quote.label} · ${sizeLabel}`;
        if (preview) {
            const previewText = text.replace(/\s+/g, ' ').trim();
            preview.textContent = previewText ? (previewText.slice(0, 50) + (previewText.length > 50 ? '…' : '')) : '';
        }
        bar.style.display = 'flex';
        bar.classList.remove('hidden-anim');
    },

    _updateContextBar(historyOverride = null) {
        const fill = document.getElementById('aiContextFill');
        if (!fill) return;
        const cfg = this.getConfig();
        const maxTokens = cfg.maxTokens || 4096;
        const systemPrompt = this._buildSystemPrompt();
        let usedTokens = this._estimateTokens(systemPrompt);
        const history = historyOverride || this._chatHistory;
        for (const m of history) {
            usedTokens += this._estimateTokens(m.content || '');
        }
        // 当前引用
        if (this._quote) {
            const quoteText = this._getQuoteText(this._quote.type, false);
            usedTokens += this._estimateTokens(quoteText);
        }
        // 输入框中尚未发送的内容
        const input = document.getElementById('aiChatInput');
        if (input && input.value) {
            usedTokens += this._estimateTokens(input.value.trim());
        }
        const pct = Math.min(100, Math.max(0, (usedTokens / maxTokens) * 100));
        fill.style.width = `${pct}%`;
        fill.classList.toggle('warning', pct >= 60 && pct < 85);
        fill.classList.toggle('danger', pct >= 85);
    },

    _estimateTokens(text) {
        return Math.ceil(text.length / 2);
    },

    _trimHistory(history, maxTokens, newMessageText, systemText) {
        const limit = maxTokens;
        const sysTokens = this._estimateTokens(systemText);
        const newTokens = this._estimateTokens(newMessageText);
        let total = sysTokens + newTokens;
        let trimmed = [...history];
        let forgotten = 0;
        for (let i = 0; i < history.length; i += 2) {
            const pairTokens = this._estimateTokens(history[i]?.content || '') + this._estimateTokens(history[i+1]?.content || '');
            total += pairTokens;
        }
        // 目标：低于限制的 70%（给模型留足生成余量，避免 4096 模型直接溢出）
        const target = Math.floor(limit * 0.7);
        while (total > target && trimmed.length >= 2) {
            const removedUser = trimmed.shift();
            const removedAssist = trimmed.shift();
            total -= (this._estimateTokens(removedUser?.content || '') + this._estimateTokens(removedAssist?.content || ''));
            forgotten++;
        }
        const remainingBudget = target - total;
        return { history: trimmed, forgotten, overBudget: total > target, remainingBudget };
    },

    _buildSystemPrompt() {
        const state = Lumina.State.app;
        const doc = state.document;
        const chapter = state.chapters?.[state.currentChapterIndex];
        const currentFile = state.currentFile;
        const bookTitle = currentFile?.metadata?.title
            || currentFile?.fileName?.replace(/\.[^/.]+$/, '')
            || currentFile?.name
            || doc?.fileName
            || Lumina.I18n.t('unknownBook')
            || '未知书籍';
        const chapterTitle = chapter?.title || '';
        const t = Lumina.I18n.t;
        return `你是阅读助手，正在帮助用户阅读《${bookTitle}》。用户当前在${chapterTitle ? `「${chapterTitle}」` : '当前章节'}。请根据用户提供的引用内容回答问题，回答简洁准确。`;
    },

    _formatChatForExport() {
        const state = Lumina.State.app;
        const doc = state.document;
        const chapter = state.chapters?.[state.currentChapterIndex];
        const currentFile = state.currentFile;
        const bookTitle = currentFile?.metadata?.title
            || currentFile?.fileName?.replace(/\.[^/.]+$/, '')
            || currentFile?.name
            || doc?.fileName
            || 'Unknown';
        const t = Lumina.I18n.t;
        let out = `《${bookTitle}》 · ${t('aiChatTitle') || 'AI Chat'}\n${'─'.repeat(30)}\n\n`;
        for (let i = 0; i < this._chatHistory.length; i++) {
            const m = this._chatHistory[i];
            if (m.role === 'user') out += `User:\n${m.content}\n\n`;
            else if (m.role === 'assistant') out += `AI:\n${m.content}\n\n`;
        }
        return out.trim();
    },

    _renderChatMessage(role, content, meta) {
        const container = document.getElementById('aiChatMessages');
        if (!container) return;
        const wrapper = document.createElement('div');
        wrapper.className = `ai-chat-message ${role}`;
        const bubble = document.createElement('div');
        bubble.className = 'ai-chat-bubble';
        bubble.innerHTML = this._escapeHtml(content).replace(/\n/g, '<br>');
        wrapper.appendChild(bubble);
        if (meta && role === 'assistant') {
            const metaEl = document.createElement('div');
            metaEl.className = 'ai-chat-meta';
            metaEl.textContent = meta;
            wrapper.appendChild(metaEl);
        }
        container.appendChild(wrapper);
        this._scrollChatToBottom();
    },

    _removeForgetHint() {
        const container = document.getElementById('aiChatMessages');
        if (!container) return;
        container.querySelectorAll('.ai-chat-forget-hint').forEach(el => el.remove());
    },

    _renderForgetHint(totalCount) {
        if (totalCount <= 0) return;
        const container = document.getElementById('aiChatMessages');
        if (!container) return;
        this._removeForgetHint();
        const el = document.createElement('div');
        el.className = 'ai-chat-forget-hint';
        const text = (Lumina.I18n.t('aiForgetHint') || '已忘记最开始的 $1 轮对话').replace('$1', totalCount);
        el.textContent = text;
        container.appendChild(el);
        this._scrollChatToBottom();
    },

    _appendChatThinking() {
        const container = document.getElementById('aiChatMessages');
        if (!container) return;
        const el = document.createElement('div');
        el.className = 'ai-chat-message assistant';
        el.id = 'aiChatThinking';
        el.innerHTML = '<div class="ai-thinking" style="padding:10px 0;"><div class="ai-thinking-bars"><span></span><span></span><span></span><span></span><span></span></div></div>';
        container.appendChild(el);
        this._scrollChatToBottom();
    },

    _removeChatThinking() {
        const el = document.getElementById('aiChatThinking');
        if (el) el.remove();
    },

    _setSendButtonState(generating) {
        const btn = document.getElementById('aiSendBtn');
        if (!btn) return;
        if (generating) {
            btn.textContent = Lumina.I18n.t('aiStop') || '停止';
            btn.classList.add('stop');
            btn.dataset.generating = 'true';
        } else {
            btn.textContent = Lumina.I18n.t('aiSend') || '发送';
            btn.classList.remove('stop');
            btn.dataset.generating = '';
        }
    },

    _scrollChatToBottom() {
        const container = document.getElementById('aiChatMessages');
        if (container) container.scrollTop = container.scrollHeight;
    },

    _createStreamingChatBubble() {
        const container = document.getElementById('aiChatMessages');
        if (!container) return null;
        const wrapper = document.createElement('div');
        wrapper.className = 'ai-chat-message assistant streaming';
        wrapper.id = 'aiChatStreaming';
        const bubble = document.createElement('div');
        bubble.className = 'ai-chat-bubble';
        wrapper.appendChild(bubble);
        container.appendChild(wrapper);
        this._scrollChatToBottom();
        return { wrapper, bubble };
    },

    _finishStreamingChatBubble(meta) {
        const el = document.getElementById('aiChatStreaming');
        if (!el) return;
        el.removeAttribute('id');
        el.classList.remove('streaming');
        if (meta) {
            const metaEl = document.createElement('div');
            metaEl.className = 'ai-chat-meta';
            metaEl.textContent = meta;
            el.appendChild(metaEl);
            this._scrollChatToBottom();
        }
    },

    async _sendChatMessage() {
        const input = document.getElementById('aiChatInput');
        if (!input) return;
        const rawText = input.value.trim();
        if (!rawText) return;

        // 清除旧的遗忘提示（本轮若无截断，不应再显示旧提示）
        this._removeForgetHint();

        // 换书检测：如果当前书籍变了，清空历史
        const currentBookKey = Lumina.State.app.currentFile?.fileKey || Lumina.State.app.document?.fileKey || '';
        if (this._currentBookKey !== currentBookKey) {
            this._chatHistory = [];
            this._forgottenRounds = 0;
            this._currentBookKey = currentBookKey;
        }

        const cfg = this.getConfig();
        if (!this.isAvailable()) {
            Lumina.UI.showToast(Lumina.I18n.t('aiNotAvailable') || '本地 AI 未启用');
            return;
        }

        // 获取引用文本
        let quoteText = '';
        let quoteMeta = '';
        if (this._quote) {
            quoteText = this._getQuoteText(this._quote.type, true);
            quoteMeta = (Lumina.I18n.t('aiQuoteMeta') || '基于 · $1').replace('$1', this._quote.label);
        }

        // 构建发送给 AI 的 user message：引用在前，问题在后，避免 Lost in the Middle
        let userContent = rawText;
        if (quoteText) {
            userContent = `[${this._quote.label}]\n${quoteText}\n\n---\n${rawText}`;
        }

        // 渲染用户消息（界面上只显示用户原始输入）
        this._renderChatMessage('user', rawText);
        input.value = '';
        input.style.height = 'auto';
        this._appendChatThinking();
        this._setSendButtonState(true);

        const systemPrompt = this._buildSystemPrompt();
        const maxTokens = cfg.maxTokens || 4096;

        // 截断历史：用 userContent（含引用）预留空间，确保不会溢出
        const trimResult = this._trimHistory(this._chatHistory, maxTokens, userContent, systemPrompt);
        const historyToSend = trimResult.history;
        if (trimResult.forgotten > 0) {
            this._forgottenRounds += trimResult.forgotten;
            this._renderForgetHint(this._forgottenRounds);
        } else {
            // 本轮无截断，重置遗忘计数
            this._forgottenRounds = 0;
        }

        // 如果清空历史后仍然超预算，优先截断本轮引用内容，而不是混合截断
        if (trimResult.overBudget && trimResult.remainingBudget < 0) {
            const sysTokens = this._estimateTokens(systemPrompt);
            const histTokens = historyToSend.reduce((sum, m) => sum + this._estimateTokens(m.content || ''), 0);
            const rawTokens = this._estimateTokens(rawText);
            const reserve = 256; // 给模型生成回复留余量
            const maxQuoteTokens = Math.max(0, Math.floor(maxTokens * 0.7 - sysTokens - histTokens - rawTokens - reserve));
            const maxQuoteChars = Math.max(0, maxQuoteTokens * 2);
            if (quoteText.length > maxQuoteChars) {
                const truncated = quoteText.slice(0, maxQuoteChars);
                userContent = `[${this._quote.label}]\n${truncated}\n\n[... ${Lumina.I18n.t('aiTruncated') || '内容已截断'} ...]\n\n---\n${rawText}`;
                Lumina.UI.showToast(Lumina.I18n.t('aiQuoteTruncated') || '引用内容过长，已自动截断以适配模型上下文');
            }
        }

        // 发送前同步一次进度条，使用截断后的历史，确保用户看到真实容量
        this._updateContextBar(historyToSend);

        const messages = [
            { role: 'system', content: systemPrompt },
            ...historyToSend,
            { role: 'user', content: userContent }
        ];

        console.log('[AI Chat] userContent length:', userContent.length);
        console.log('[AI Chat] messages:', messages);

        const url = `${cfg.endpoint.replace(/\/$/, '')}/v1/chat/completions`;

        let reply = '';
        let bubbleEl = null;
        let started = false;

        await this._streamChat(url, cfg, messages,
            (delta) => {
                // console.log('[AI Chat] delta:', JSON.stringify(delta));
                if (!started) {
                    started = true;
                    this._removeChatThinking();
                    const created = this._createStreamingChatBubble();
                    bubbleEl = created?.bubble || null;
                }
                reply += delta;
                if (bubbleEl) {
                    bubbleEl.innerHTML = this._renderMarkdownInline(reply);
                    this._scrollChatToBottom();
                }
            },
            () => {
                console.log('[AI Chat] final reply:', reply);
                if (!started) {
                    this._removeChatThinking();
                    this._renderChatMessage('assistant', Lumina.I18n.t('aiEmptyResponse') || '模型返回为空');
                } else {
                    if (bubbleEl) bubbleEl.innerHTML = this._renderMarkdown(reply);
                    this._finishStreamingChatBubble(quoteMeta || undefined);
                    // 同步 _chatHistory 为实际发送的历史，保存包含引用的 userContent
                    this._chatHistory = [...historyToSend];
                    this._chatHistory.push({ role: 'user', content: userContent });
                    this._chatHistory.push({ role: 'assistant', content: reply });
                }
                this._setSendButtonState(false);
                this._updateContextBar();
            },
            (err) => {
                if (err.name !== 'AbortError' || !this._userCancelled) {
                    console.error('[AI Chat] error:', err);
                }
                if (!started) {
                    this._removeChatThinking();
                }
                if (err.name === 'AbortError' && this._userCancelled && started && bubbleEl) {
                    // 用户主动点击停止，保留已生成的内容，不加入 history
                    if (bubbleEl) bubbleEl.innerHTML = this._renderMarkdown(reply);
                    this._finishStreamingChatBubble(quoteMeta || undefined);
                } else if (err.name === 'AbortError' && !this._userCancelled) {
                    // 超时 abort
                    const timeoutMsg = Lumina.I18n.t('aiTimeout') || 'AI 响应超时，长文本在本地模型上可能需要更长时间。请检查 LM Studio 是否正常运行，或尝试减少引用范围。';
                    if (started && bubbleEl) {
                        bubbleEl.innerHTML = this._escapeHtml(timeoutMsg).replace(/\n/g, '<br>');
                        this._finishStreamingChatBubble();
                    } else {
                        this._renderChatMessage('assistant', timeoutMsg);
                    }
                } else {
                    let errMsg = this._isContextOverflowError(err)
                        ? '输入内容超过 LM Studio 模型的上下文长度。请在 LM Studio 中调大 Context Length，或减少引用范围。'
                        : (Lumina.I18n.t('aiError')?.replace?.('$1', err.message) || `AI 请求失败: ${err.message}`);
                    if (started && bubbleEl) {
                        bubbleEl.innerHTML = this._escapeHtml(errMsg).replace(/\n/g, '<br>');
                        this._finishStreamingChatBubble();
                    } else {
                        this._renderChatMessage('assistant', errMsg);
                    }
                }
                this._setSendButtonState(false);
                this._updateContextBar();
            }
        );
    },

    cancel() {
        if (this._abortController) {
            this._userCancelled = true;
            this._abortController.abort();
            this._abortController = null;
        }
    }
};

// 自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Lumina.AI.init());
} else {
    Lumina.AI.init();
}
