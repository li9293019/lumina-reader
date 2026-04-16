// ==================== 本地 AI 模块 (LM Studio / Ollama 兼容接口) ====================

Lumina.AI = {
    _abortController: null,
    _isDragging: false,
    _dragOffset: { x: 0, y: 0 },
    _fabPos: { x: 0, y: 0 },

    getConfig() {
        return Lumina.ConfigManager.get('ai') || {
            enabled: false,
            endpoint: 'http://localhost:1234',
            model: '',
            apiKey: '',
            timeout: 30000,
            systemPrompt: '你是一个 helpful 的阅读助手。回答简洁、准确，直接给出结果，不要过度发挥。',
            fabX: null,
            fabY: null
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
        this._initPanel();
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

    _initFAB() {
        const fab = document.getElementById('aiFab');
        if (!fab) return;

        const cfg = this.getConfig();
        const size = 40; // must match CSS
        const margin = 8;
        const marginSide = 16; // CSS right
        const marginBottom = 16; // CSS bottom base
        const safeAreaBottom = this._getSafeAreaBottom();
        const bottomOffset = Math.max(marginBottom, marginBottom + safeAreaBottom);

        // 恢复或计算默认位置（右下角，含安全距离）
        if (cfg.fabX != null && cfg.fabY != null) {
            this._fabPos = { x: cfg.fabX, y: cfg.fabY };
        } else {
            this._fabPos = {
                x: window.innerWidth - size - marginSide,
                y: window.innerHeight - size - bottomOffset
            };
        }
        // 初始 clamp，防止窗口变小后坐标超出视口
        this._fabPos.x = Math.max(margin, Math.min(this._fabPos.x, window.innerWidth - size - margin));
        this._fabPos.y = Math.max(margin, Math.min(this._fabPos.y, window.innerHeight - size - bottomOffset));
        this._applyFabPos();

        window.addEventListener('resize', () => {
            const safeB = this._getSafeAreaBottom();
            const botOff = Math.max(marginBottom, marginBottom + safeB);
            // 保持相对位置或重置到可见区域
            this._fabPos.x = Math.min(this._fabPos.x, window.innerWidth - size - margin);
            this._fabPos.y = Math.min(this._fabPos.y, window.innerHeight - size - botOff);
            this._fabPos.x = Math.max(margin, this._fabPos.x);
            this._fabPos.y = Math.max(margin, this._fabPos.y);
            this._applyFabPos();
        });

        const onStart = (e) => {
            if (e.button && e.button !== 0) return;
            this._isDragging = false;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const rect = fab.getBoundingClientRect();
            this._dragOffset = {
                x: clientX - rect.left,
                y: clientY - rect.top
            };

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
                // 保存位置
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

        fab.addEventListener('click', () => {
            if (!this._isDragging) {
                this.openPanel();
            }
            this._isDragging = false;
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

    _initPanel() {
        const panel = document.getElementById('aiPanel');
        const closeBtn = document.getElementById('aiPanelClose');
        const copyBtn = document.getElementById('aiCopyBtn');
        const exportBtn = document.getElementById('aiExportBtn');

        if (closeBtn) closeBtn.addEventListener('click', () => this.hidePanel());
        if (panel) {
            panel.addEventListener('click', (e) => {
                if (e.target === panel) this.hidePanel();
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

        // 快捷动作按钮
        const actions = document.querySelectorAll('.ai-action-btn');
        actions.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const context = document.getElementById('aiContextText')?.value?.trim() || '';
                if (!context) {
                    Lumina.UI.showToast(Lumina.I18n.t('aiNoContext') || '没有可用的上下文');
                    return;
                }
                if (action === 'custom') {
                    this._askCustom(context);
                } else {
                    this._runAction(action, context);
                }
            });
        });
    },

    _getContextText() {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            return { text: selection.toString().trim(), source: 'selection' };
        }
        // 否则取当前章节文本
        const state = Lumina.State.app;
        const chapter = state.chapters[state.currentChapterIndex];
        if (!chapter || !state.document?.items) return { text: '', source: 'chapter' };
        const items = state.document.items.slice(chapter.startIndex, chapter.endIndex + 1);
        const text = items.map(i => i.text).join('\n').trim();
        return { text, source: 'chapter' };
    },

    openPanel() {
        const panel = document.getElementById('aiPanel');
        const contextText = document.getElementById('aiContextText');
        const contextHint = document.getElementById('aiContextHint');
        const resultContent = document.getElementById('aiResultContent');
        const resultPlaceholder = document.getElementById('aiResultPlaceholder');
        if (!panel) return;

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

    hidePanel() {
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
        const resultPlaceholder = document.getElementById('aiResultPlaceholder');
        if (loading) {
            this._startThinking();
            this._setFooterVisible(false);
        } else {
            this._stopThinking();
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
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
            continue: {
                label: t('aiContinue') || '续写',
                system: '请根据以下内容的风格与主题，续写一段合理的情节（100 字左右）。'
            },
            rewrite: {
                label: t('aiRewrite') || '润色',
                system: '请对以下文本进行润色，使其表达更流畅、优美，但不要改变原意。'
            }
        };
    },

    _askCustom(context) {
        const t = Lumina.I18n.t;
        Lumina.UI.showDialog(
            t('aiCustomPrompt') || '请输入你的问题或指令：',
            'prompt',
            (result) => {
                if (result === null || result === false) return;
                if (!result.trim()) {
                    Lumina.UI.showToast(t('aiEmptyPrompt') || '输入不能为空');
                    return;
                }
                this._sendChat(result.trim(), context);
            },
            { inputType: 'text', placeholder: t('aiCustomPlaceholder') || '例如：这段话表达了什么情感？' }
        );
    },

    _runAction(action, context) {
        const prompts = this.getPrompts();
        const p = prompts[action];
        if (!p) return;
        this._sendChat(p.system, context);
    },

    async _sendChat(systemPrompt, userContent) {
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
