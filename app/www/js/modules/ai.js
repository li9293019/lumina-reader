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
    _quote: { type: 'chapter', label: '' },
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

        if (cfg.fabX != null && cfg.fabY != null) {
            this._fabPos = { x: cfg.fabX, y: cfg.fabY };
        } else {
            this._fabPos = {
                x: window.innerWidth - size - marginSide,
                y: window.innerHeight - size - bottomOffset
            };
        }
        this._fabPos.x = Math.max(margin, Math.min(this._fabPos.x, window.innerWidth - size - margin));
        this._fabPos.y = Math.max(margin, Math.min(this._fabPos.y, window.innerHeight - size - bottomOffset));
        this._applyFabPos();

        window.addEventListener('resize', () => {
            const safeB = this._getSafeAreaBottom();
            const botOff = Math.max(marginBottom, marginBottom + safeB);
            this._fabPos.x = Math.min(this._fabPos.x, window.innerWidth - size - margin);
            this._fabPos.y = Math.min(this._fabPos.y, window.innerHeight - size - botOff);
            this._fabPos.x = Math.max(margin, this._fabPos.x);
            this._fabPos.y = Math.max(margin, this._fabPos.y);
            this._applyFabPos();
        });

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
                nx = Math.max(margin, Math.min(nx, window.innerWidth - size - margin));
                ny = Math.max(margin, Math.min(ny, window.innerHeight - size - botOff));
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
        // 默认引用：有选区则选区，否则章节
        const sel = window.getSelection()?.toString()?.trim();
        this._quote = { type: sel ? 'selection' : 'chapter', label: '' };
        this._updateQuoteLabel();
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

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
        this._abortController = new AbortController();
        const timeoutId = setTimeout(() => this._abortController.abort(), cfg.timeout || 30000);
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
                    stream: false
                }),
                signal: this._abortController.signal
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${errText}`);
            }
            const data = await res.json();
            const reply = data.choices?.[0]?.message?.content?.trim();
            if (!reply) throw new Error(Lumina.I18n.t('aiEmptyResponse') || '模型返回为空');
            this._setLoading(false);
            this._renderResult(this._escapeHtml(reply).replace(/\n/g, '<br>'));
            this._setFooterVisible(true);
        } catch (err) {
            clearTimeout(timeoutId);
            this._setLoading(false);
            if (err.name === 'AbortError') {
                this._renderResult(`<span style="opacity:.7;">${Lumina.I18n.t('aiCancelled') || '已取消'}</span>`);
            } else {
                this._renderResult(`<span style="color:#e57373;">${this._escapeHtml(Lumina.I18n.t('aiError')?.replace?.('$1', err.message) || `AI 请求失败: ${err.message}`)}</span>`);
            }
            this._setFooterVisible(true);
        } finally {
            this._abortController = null;
        }
    },

    // ==================== 对话模式面板 ====================
    _initChatPanel() {
        const overlay = document.getElementById('aiChatOverlay');
        const panel = document.getElementById('aiChatPanel');
        const closeBtn = document.getElementById('aiChatClose');
        const copyAllBtn = document.getElementById('aiChatCopyAll');
        const exportBtn = document.getElementById('aiChatExport');
        const sendBtn = document.getElementById('aiSendBtn');
        const input = document.getElementById('aiChatInput');
        const quoteBtn = document.getElementById('aiQuoteBtn');
        const quoteClose = document.getElementById('aiQuoteClose');
        const header = document.getElementById('aiChatHeader');

        if (closeBtn) closeBtn.addEventListener('click', () => this.closeChatPanel());

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
            sendBtn.addEventListener('click', () => this._sendChatMessage());
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._sendChatMessage();
                }
            });
            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 120) + 'px';
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
                const type = el.dataset.quote;
                this._quote = { type, label: '' };
                this._updateQuoteLabel();
                document.getElementById('aiQuotePopover')?.classList.remove('active');
                const quoteBar = document.getElementById('aiQuoteBar');
                if (quoteBar) {
                    quoteBar.classList.remove('hidden-anim');
                    // 先更新内容，等动画展开
                    setTimeout(() => this._updateQuoteBar(), 50);
                } else {
                    this._updateQuoteBar();
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
        this._updateQuoteBar();
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
        // 刷新状态
        const types = ['selection','paragraph','page','chapter','book'];
        types.forEach(type => {
            const text = this._getQuoteText(type, false);
            const len = text.length;
            const descEl = document.getElementById(`aiQuoteDesc${type.charAt(0).toUpperCase() + type.slice(1)}`);
            if (descEl) descEl.textContent = len === 0 ? '—' : '';
            const opt = document.querySelector(`.ai-quote-option[data-quote="${type}"]`);
            if (opt) {
                opt.classList.toggle('disabled', len === 0);
                const nameDiv = opt.querySelector('div');
                if (nameDiv) {
                    const full = Lumina.I18n.t(`aiQuote${type.charAt(0).toUpperCase() + type.slice(1)}`) || type;
                    const short = full.length > 4 ? full.slice(0, 4) : full;
                    nameDiv.textContent = short;
                }
            }
        });
        popover.classList.add('active');
        document.querySelectorAll('.ai-quote-option').forEach(o => o.classList.toggle('active', o.dataset.quote === this._quote?.type));
    },

    _getQuoteText(type, withTruncate = true) {
        const state = Lumina.State.app;
        const doc = state.document;
        const chapter = state.chapters?.[state.currentChapterIndex];
        const maxLen = withTruncate ? (this.getConfig().maxTokens || 4096) * 2 : Infinity;

        let text = '';
        switch (type) {
            case 'selection': {
                const sel = window.getSelection()?.toString()?.trim();
                text = sel || '';
                break;
            }
            case 'paragraph': {
                // 当前可视区域或光标附近段落难以精确获取，简化：取当前章节首 3 段
                if (chapter && doc?.items) {
                    const items = doc.items.slice(chapter.startIndex, chapter.endIndex + 1);
                    let paraCount = 0;
                    const paras = [];
                    for (const item of items) {
                        if (item.text?.trim()) paras.push(item.text);
                        if (item.text?.trim() && ++paraCount >= 3) break;
                    }
                    text = paras.join('\n');
                }
                break;
            }
            case 'page': {
                // 简化：取当前章节内容的前 1/3 模拟一页
                if (chapter && doc?.items) {
                    const items = doc.items.slice(chapter.startIndex, chapter.endIndex + 1);
                    const total = items.length;
                    const pageItems = items.slice(0, Math.max(1, Math.floor(total / 3)));
                    text = pageItems.map(i => i.text).join('\n').trim();
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
        if (!bar || !label) return;
        if (!this._quote) {
            bar.style.display = 'none';
            return;
        }
        const text = this._getQuoteText(this._quote.type, false);
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
        bar.style.display = 'flex';
        bar.classList.remove('hidden-anim');
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
        // 目标：低于限制的 85%
        const target = Math.floor(limit * 0.85);
        while (total > target && trimmed.length >= 2) {
            const removedUser = trimmed.shift();
            const removedAssist = trimmed.shift();
            total -= (this._estimateTokens(removedUser?.content || '') + this._estimateTokens(removedAssist?.content || ''));
            forgotten++;
        }
        return { history: trimmed, forgotten };
    },

    _buildSystemPrompt() {
        const state = Lumina.State.app;
        const doc = state.document;
        const chapter = state.chapters?.[state.currentChapterIndex];
        const bookTitle = doc?.fileName || Lumina.I18n.t('unknownBook') || '未知书籍';
        const chapterTitle = chapter?.title || '';
        const t = Lumina.I18n.t;
        return `你是阅读助手，正在帮助用户阅读《${bookTitle}》。用户当前在${chapterTitle ? `「${chapterTitle}」` : '当前章节'}。请根据用户提供的引用内容回答问题，回答简洁准确。`;
    },

    _formatChatForExport() {
        const state = Lumina.State.app;
        const doc = state.document;
        const chapter = state.chapters?.[state.currentChapterIndex];
        const bookTitle = doc?.fileName || 'Unknown';
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

    _renderForgetHint(count) {
        if (count <= 0) return;
        const container = document.getElementById('aiChatMessages');
        if (!container) return;
        const el = document.createElement('div');
        el.className = 'ai-chat-forget-hint';
        const text = (Lumina.I18n.t('aiForgetHint') || '已忘记最开始的 $1 轮对话').replace('$1', count);
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

    _scrollChatToBottom() {
        const container = document.getElementById('aiChatMessages');
        if (container) container.scrollTop = container.scrollHeight;
    },

    async _sendChatMessage() {
        const input = document.getElementById('aiChatInput');
        if (!input) return;
        const rawText = input.value.trim();
        if (!rawText) return;

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

        const userContent = quoteText
            ? `${rawText}\n\n---\n[${this._quote.label}]\n${quoteText}`
            : rawText;

        // 渲染用户消息
        this._renderChatMessage('user', rawText);
        input.value = '';
        input.style.height = 'auto';
        this._appendChatThinking();

        const systemPrompt = this._buildSystemPrompt();
        const maxTokens = cfg.maxTokens || 4096;

        // 截断历史
        const trimResult = this._trimHistory(this._chatHistory, maxTokens, userContent, systemPrompt);
        const historyToSend = trimResult.history;
        if (trimResult.forgotten > 0) {
            this._forgottenRounds += trimResult.forgotten;
            this._renderForgetHint(trimResult.forgotten);
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            ...historyToSend,
            { role: 'user', content: userContent }
        ];

        const url = `${cfg.endpoint.replace(/\/$/, '')}/v1/chat/completions`;
        this._abortController = new AbortController();
        const timeoutId = setTimeout(() => this._abortController.abort(), cfg.timeout || 30000);

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
                    stream: false
                }),
                signal: this._abortController.signal
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${errText}`);
            }
            const data = await res.json();
            const reply = data.choices?.[0]?.message?.content?.trim();
            if (!reply) throw new Error(Lumina.I18n.t('aiEmptyResponse') || '模型返回为空');

            this._removeChatThinking();
            this._chatHistory.push({ role: 'user', content: userContent });
            this._chatHistory.push({ role: 'assistant', content: reply });
            this._renderChatMessage('assistant', reply, quoteMeta || undefined);
        } catch (err) {
            clearTimeout(timeoutId);
            this._removeChatThinking();
            const errMsg = err.name === 'AbortError'
                ? (Lumina.I18n.t('aiCancelled') || '已取消')
                : (Lumina.I18n.t('aiError')?.replace?.('$1', err.message) || `AI 请求失败: ${err.message}`);
            this._renderChatMessage('assistant', errMsg);
        } finally {
            this._abortController = null;
        }
    },

    cancel() {
        if (this._abortController) {
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
