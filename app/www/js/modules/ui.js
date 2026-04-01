// ==================== 17. UI交互模块 ====================

Lumina.UI = {
    els: {},

    init() {
        this.cacheElements();
        this.bindEvents();
        this.setupCustomTooltip();
        this.setupRegexRealtimeFeedback();
    },

    cacheElements() {
        const d = Lumina.DOM;
        d.fileInput = document.getElementById('fileInput');
        d.sidebarLeft = document.getElementById('sidebarLeft');
        d.sidebarRight = document.getElementById('sidebarRight');
        d.historyPanel = document.getElementById('historyPanel');
        d.searchPanel = document.getElementById('searchPanel');
        d.readingArea = document.getElementById('readingArea');
        d.contentWrapper = document.getElementById('contentWrapper');
        d.contentScroll = document.getElementById('contentScroll');
        d.welcomeScreen = document.getElementById('welcomeScreen');
        d.aboutPanel = document.getElementById('aboutPanel');
        d.loadingScreen = document.getElementById('loadingScreen');
        d.customDialog = document.getElementById('customDialog');
        d.fileInfo = document.getElementById('fileInfo');
        d.chapterNavInfo = document.getElementById('chapterNavInfo');
        d.tocList = document.getElementById('tocList');
        d.aggregateSearch = document.getElementById('aggregateSearch');
        d.historyList = document.getElementById('historyList');
        d.tooltip = document.getElementById('global-tooltip');
        d.dialogTitle = document.getElementById('dialogTitle');
        d.dialogMessage = document.getElementById('dialogMessage');
        d.dialogCancel = document.getElementById('dialogCancel');
        d.dialogConfirm = document.getElementById('dialogConfirm');
        d.dialogInputWrapper = document.getElementById('dialogInputWrapper');
        d.dialogInput = document.getElementById('dialogInput');
        d.fontLoadingIndicator = document.getElementById('fontLoadingIndicator');
        d.toast = document.getElementById('toast');
        d.dataManagerPanel = document.getElementById('dataManagerPanel');
        d.searchPanelInput = document.getElementById('searchPanelInput');
    },

    bindEvents() {
        document.getElementById('openFileBtn').addEventListener('click', () => Lumina.DOM.fileInput.click());
        document.getElementById('welcomeOpenBtn').addEventListener('click', () => Lumina.DOM.fileInput.click());
        Lumina.DOM.fileInput.addEventListener('change', async (e) => {
            if (e.target.files[0]) {
                if (e.target.files[0].handle) Lumina.State.app.currentFile.handle = e.target.files[0].handle;
                await Lumina.Actions.processFile(e.target.files[0]);
            }
        });

        document.body.addEventListener('dragover', (e) => { e.preventDefault(); document.body.style.background = 'var(--bg-tertiary)'; });
        document.body.addEventListener('dragleave', () => { document.body.style.background = ''; });
        document.body.addEventListener('drop', async (e) => {
            e.preventDefault(); document.body.style.background = '';
            if (e.dataTransfer.files[0]) {
                const file = e.dataTransfer.files[0];
                // 支持 JSON 和 LMN 格式导入，其他格式作为普通文件打开
                if (file.name.endsWith('.json') || file.name.endsWith('.lmn')) {
                    await Lumina.Actions.handleImportFile(file);
                } else {
                    await Lumina.Actions.processFile(file);
                }
            }
        });

        const toggleSidebar = () => {
            const isVisible = Lumina.DOM.sidebarLeft.classList.toggle('visible');
            Lumina.DOM.readingArea.classList.toggle('with-sidebar', isVisible);
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
            Lumina.State.settings.sidebarVisible = isVisible;
            Lumina.Settings.save();
        };
        document.getElementById('toggleToc').addEventListener('click', toggleSidebar);
        document.getElementById('collapseToc').addEventListener('click', toggleSidebar);

        const panels = {
            settings: { btn: 'settingsBtn', panel: Lumina.DOM.sidebarRight, toggle: true },
            history: { btn: 'historyBtn', panel: Lumina.DOM.historyPanel, toggle: true },
            search: { btn: 'searchToggle', panel: Lumina.DOM.searchPanel, toggle: true }
        };

        Object.entries(panels).forEach(([key, { btn, panel, toggle }]) => {
            document.getElementById(btn).addEventListener('click', (e) => {
                e.stopPropagation();
                if (toggle) panel.classList.toggle('open');
                else panel.classList.add('open');
                Object.values(panels).forEach(({ panel: p }) => { if (p !== panel) p.classList.remove('open'); });
                // 关闭注释面板
                document.getElementById('annotationPanel')?.classList.remove('open');
                if (panel.classList.contains('open') && key === 'search') {
                    Lumina.DOM.searchPanelInput.focus();
                    // 刷新搜索标签i18n
                    Lumina.Renderer?.updateSearchTabLabels?.();
                }
                
                // 设置面板打开时，刷新热力图标签显示
                if (key === 'settings' && panel.classList.contains('open')) {
                    Lumina.HeatMap?.refreshFromCurrentBook();
                }
            });
        });

        document.getElementById('closeSettings').addEventListener('click', () => Lumina.DOM.sidebarRight.classList.remove('open'));
        document.getElementById('closeHistory').addEventListener('click', () => Lumina.DOM.historyPanel.classList.remove('open'));
        document.getElementById('closeSearchPanel').addEventListener('click', () => {
            Lumina.DOM.searchPanel.classList.remove('open');
            Lumina.Search.clearHighlight();
        });

        const libraryBtn = document.getElementById('libraryBtn');
        if (libraryBtn) {
            libraryBtn.addEventListener('click', () => {
                if (window.dataManager?._initialized) {
                    window.dataManager.open();
                } else {
                    console.warn('[UI] DataManager 尚未初始化完成');
                }
            });
        }

        document.getElementById('aboutBtn').addEventListener('click', () => Lumina.DOM.aboutPanel.classList.add('active'));
        document.getElementById('closeAbout').addEventListener('click', () => Lumina.DOM.aboutPanel.classList.remove('active'));
        Lumina.DOM.aboutPanel.addEventListener('click', (e) => { if (e.target === Lumina.DOM.aboutPanel) Lumina.DOM.aboutPanel.classList.remove('active'); });
        
        // 注释/书签按钮
        document.getElementById('annotationBtn').addEventListener('click', () => Lumina.Annotations.togglePanel());

        Lumina.DOM.sidebarRight.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-setting-group] .option-btn, [data-setting-group] .numbering-btn');
            if (btn) {
                const group = btn.closest('[data-setting-group]').dataset.settingGroup;
                Lumina.State.settings[group] = btn.dataset.value;
                Lumina.Settings.save();
                Lumina.UI.updateActiveButtons();

                if (group === 'chapterNumbering' && Lumina.State.app.document.items.length) {
                    Lumina.Parser.applyNumberingStyle();
                    if (Lumina.State.app.dbReady && Lumina.State.app.currentFile.fileKey) {
                        Lumina.DB.saveHistory(Lumina.State.app.currentFile.name, Lumina.State.app.currentFile.type, Lumina.State.app.currentFile.wordCount, null);
                    }
                } else if (group === 'language') Lumina.I18n.updateUI();
                await Lumina.Settings.apply();
            }

            const toggle = e.target.closest('[data-setting-toggle]');
            if (toggle) {
                const key = toggle.dataset.settingToggle;
                Lumina.State.settings[key] = !Lumina.State.settings[key];
                Lumina.Settings.save();
                toggle.querySelector('.toggle-track').classList.toggle('active', Lumina.State.settings[key]);
                Lumina.Settings.apply();
            }
        });

        Lumina.DOM.sidebarRight.addEventListener('change', (e) => {
            const slider = e.target.closest('[data-setting-slider] input');
            if (slider) {
                const container = slider.closest('[data-setting-slider]');
                const key = container.dataset.settingSlider;
                Lumina.State.settings[key] = parseInt(slider.value);
                const display = container.querySelector('.slider-value');
                const divider = parseInt(container.dataset.divider) || 1;
                const unit = container.dataset.unit || '';
                let displayValue = Lumina.State.settings[key];
                if (divider !== 1) displayValue = (Lumina.State.settings[key] / divider).toFixed(1);
                display.textContent = `${displayValue}${unit}`;

                if (key === 'ttsRate') Lumina.TTS.manager.updateSettings('rate', Lumina.State.settings[key] / 10);
                else if (key === 'ttsPitch') Lumina.TTS.manager.updateSettings('pitch', Lumina.State.settings[key] / 10);

                Lumina.Settings.save();
                if (key !== 'ttsRate' && key !== 'ttsPitch') Lumina.Settings.apply();
            }
        });

        Lumina.DOM.sidebarRight.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-export]');
            if (btn) {
                try {
                    await Lumina.Exporter.exportDocument(btn.dataset.export);
                } catch (err) {
                    console.error('导出错误:', err);
                    Lumina.UI.showToast('导出失败');
                }
            }
        });

        // 设置面板元素（可能延迟加载）
        const applyRegexBtn = document.getElementById('applyRegex');
        const resetSettingsBtn = document.getElementById('resetSettings');
        if (applyRegexBtn) applyRegexBtn.addEventListener('click', Lumina.Actions.applyRegexRules);
        if (resetSettingsBtn) resetSettingsBtn.addEventListener('click', () => Lumina.Settings.reset());

        Lumina.DOM.searchPanelInput.addEventListener('input', (e) => Lumina.Search.perform(e.target.value));

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.panel, .btn-icon')) {
                Object.values(panels).forEach(({ panel }) => panel?.classList.remove('open'));
                document.getElementById('annotationPanel')?.classList.remove('open');
                Lumina.Search.clearHighlight();
            }
        });

        document.addEventListener('keydown', Lumina.Actions.handleKeyboard);

        let scrollTimeout, idleCallbackId;
        Lumina.DOM.contentScroll.addEventListener('scroll', () => {
            Lumina.Renderer.updateTocSpy();
            clearTimeout(scrollTimeout);
            if (window.cancelIdleCallback && idleCallbackId) cancelIdleCallback(idleCallbackId);
            if ('requestIdleCallback' in window) idleCallbackId = requestIdleCallback(() => Lumina.DB.updateHistoryProgress(), { timeout: 2000 });
            else scrollTimeout = setTimeout(Lumina.DB.updateHistoryProgress, 1500);
        }, { passive: true });

        window.addEventListener('resize', () => setTimeout(Lumina.Settings.apply, 250));

        // 键盘显示/隐藏检测（APP 环境）
        this.setupKeyboardDetection();

        let touchStartX = 0, touchStartY = 0;
        const SWIPE_THRESHOLD = 50;

        Lumina.DOM.contentScroll.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        Lumina.DOM.contentScroll.addEventListener('touchend', (e) => {
            if (!Lumina.State.app.document.items.length) return;
            
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const deltaX = touchStartX - touchEndX;
            const deltaY = touchStartY - touchEndY;
            
            // 水平滑动超过阈值，且水平移动大于垂直移动（避免与滚动冲突）
            if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
                // 【关键修复】检查是否在 code 或 table 区域内滑动，如果是则不翻页
                const target = e.target;
                const isInCodeBlock = target.closest('.markdown-pre, .markdown-code, pre[class*="language-"]');
                const isInTable = target.closest('.markdown-table, table');
                
                if (isInCodeBlock || isInTable) {
                    // 在代码块或表格内滑动，不触发翻页
                    return;
                }
                
                if (e.cancelable) {
                    e.preventDefault();
                }
                
                if (deltaX > 0) {
                    // 左滑（从右向左）：下一页
                    Lumina.Actions.nextPage();
                } else {
                    // 右滑（从左向右）：上一页  
                    Lumina.Actions.prevPage();
                }
            }
        }, { passive: false });

        this.setupImmersiveMode();
        this.setupPinchZoom();

        // 正则帮助弹窗
        document.getElementById('regexHelpBtn').addEventListener('click', () => {
            document.getElementById('regexHelpPanel').classList.add('active');
            // 更新多语言翻译（确保动态添加的内容被翻译）
            Lumina.I18n.updateUI();
        });

        document.getElementById('closeRegexHelp').addEventListener('click', () => {
            document.getElementById('regexHelpPanel').classList.remove('active');
        });

        document.getElementById('regexHelpPanel').addEventListener('click', (e) => {
            if (e.target === document.getElementById('regexHelpPanel')) {
                document.getElementById('regexHelpPanel').classList.remove('active');
            }
        });

        // TTS 帮助按钮 - 打开语音朗读指南
        document.getElementById('ttsHelpBtn')?.addEventListener('click', async () => {
            await this.openTTSGuide();
        });
    },

    // 检测键盘显示/隐藏，在键盘显示时隐藏底部安全距离并滚动输入框到可视区域
    setupKeyboardDetection() {   
        // 方法1: 监听输入框焦点事件（最简单可靠）
        const handleFocus = (e) => {
            const tagName = e.target.tagName;
            if (tagName === 'INPUT' || tagName === 'TEXTAREA' || e.target.isContentEditable) {
                lastFocusedInput = e.target;
                document.body.classList.add('keyboard-open');
                // 刷新安全区域
                if (window.refreshSafeArea) window.refreshSafeArea();
                

            }
        };
        
        const handleBlur = (e) => {
            const tagName = e.target.tagName;
            if (tagName === 'INPUT' || tagName === 'TEXTAREA' || e.target.isContentEditable) {
                setTimeout(() => {
                    const activeElement = document.activeElement;
                    const activeTag = activeElement?.tagName;
                    if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && !activeElement?.isContentEditable) {
                        document.body.classList.remove('keyboard-open');
                        keyboardHeight = 0;
                        // 刷新安全区域
                        if (window.refreshSafeArea) window.refreshSafeArea();
                    }
                }, 200);
            }
        };
        
        document.addEventListener('focusin', handleFocus, true);
        document.addEventListener('focusout', handleBlur, true);
        
        // 方法2: Capacitor Keyboard 插件（支持获取键盘高度）
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Keyboard) {
            try {
                const Keyboard = Capacitor.Plugins.Keyboard;
                Keyboard.addListener('keyboardWillShow', (info) => {
                    keyboardHeight = info?.keyboardHeight || 0;
                    console.log('[Keyboard] Capacitor: Will show, height:', keyboardHeight);
                    document.body.classList.add('keyboard-open');
                    if (window.refreshSafeArea) window.refreshSafeArea();
                    // 滚动当前聚焦的输入框

                });
                Keyboard.addListener('keyboardWillHide', () => {
                    console.log('[Keyboard] Capacitor: Will hide');
                    document.body.classList.remove('keyboard-open');
                    keyboardHeight = 0;
                    if (window.refreshSafeArea) window.refreshSafeArea();
                });
                console.log('[Keyboard] Capacitor plugin registered');
            } catch (e) {
                console.warn('[Keyboard] Capacitor plugin failed:', e);
            }
        }
        
        // 方法3: Visual Viewport API（估算键盘高度）
        if (window.visualViewport) {
            let initialHeight = window.visualViewport.height;
            window.visualViewport.addEventListener('resize', () => {
                const currentHeight = window.visualViewport.height;
                const isKeyboard = currentHeight < initialHeight * 0.85;
                const wasKeyboardOpen = document.body.classList.contains('keyboard-open');
                document.body.classList.toggle('keyboard-open', isKeyboard);
                
                if (isKeyboard) {
                    keyboardHeight = initialHeight - currentHeight;
                    // 滚动当前聚焦的输入框

                } else {
                    keyboardHeight = 0;
                }
                
                if (wasKeyboardOpen !== isKeyboard && window.refreshSafeArea) window.refreshSafeArea();
                if (!isKeyboard && currentHeight > initialHeight * 0.95) {
                    initialHeight = currentHeight;
                }
            });
        }
        
        // 添加手动测试函数
        window.testKeyboard = (show, height = 300) => {
            if (show) {
                document.body.classList.add('keyboard-open');
                keyboardHeight = height;
                console.log('[Keyboard] Manually added class, height:', height);

            } else {
                document.body.classList.remove('keyboard-open');
                keyboardHeight = 0;
                console.log('[Keyboard] Manually removed class');
            }
            console.log('[Keyboard] Current classes:', document.body.className);
            if (window.refreshSafeArea) window.refreshSafeArea();
        };
    },

    // 打开 TTS 使用指南
    async openTTSGuide() {
        const guideFileName = '语音朗读使用指南.md';
        
        try {
            // 1. 检查书库中是否已有该文件
            const files = await Lumina.DB.adapter.getAllFiles();
            const existingFile = files.find(f => f.fileName === guideFileName || f.fileName?.includes('tts-guide'));
            
            if (existingFile) {
                // 已有，从历史记录打开
                console.log('[TTS Help] 从书库打开:', existingFile.fileKey);
                await Lumina.HistoryActions.openFile(existingFile.fileKey);
                return;
            }
            
            // 2. 没有则加载内置的 tts-guide.md
            console.log('[TTS Help] 加载内置指南...');
            const response = await fetch('./tts-guide.md');
            if (!response.ok) {
                Lumina.UI.showToast('指南文件加载失败');
                return;
            }
            
            const text = await response.text();
            if (!text || text.length < 100) {
                Lumina.UI.showToast('指南文件内容无效');
                return;
            }
            
            // 3. 解析 Markdown
            const parsed = Lumina.Plugin?.Markdown?.Parser?.parse 
                ? Lumina.Plugin.Markdown.Parser.parse(text) 
                : Lumina.Parser.parseTXT(text);
            
            if (!parsed?.items?.length) {
                Lumina.UI.showToast('指南解析失败');
                return;
            }
            
            // 4. 保存到数据库
            const fileKey = `${guideFileName}_${text.length}_${Date.now()}`;
            const saved = await Lumina.DB.adapter.saveFile(fileKey, {
                fileName: guideFileName,
                fileType: 'md',
                fileSize: new Blob([text]).size,
                content: parsed.items,
                wordCount: text.length,
                lastChapter: 0,
                lastScrollIndex: 0,
                chapterTitle: '',
                lastReadTime: Lumina.DB.getLocalTimeString(),
                customRegex: { chapter: '', section: '' },
                chapterNumbering: 'none',
                annotations: [],
                cover: null,
                heatMap: null
            });
            
            if (!saved) {
                Lumina.UI.showToast('保存指南失败');
                return;
            }
            
            // 5. 刷新历史记录并打开
            await Lumina.DB.loadHistoryFromDB();
            await Lumina.HistoryActions.openFile(fileKey);
            
            // 6. 更新存储统计
            if (Lumina.State.app.dbReady && Lumina.DataManager) {
                await Lumina.DataManager.preload();
                Lumina.DataManager.updateSettingsBar();
            }
            
        } catch (err) {
            console.error('[TTS Help] 打开指南失败:', err);
            Lumina.UI.showToast('打开指南失败');
        }
    },

    setupImmersiveMode() {
        const readingArea = document.getElementById('readingArea');
        if (!readingArea) return;
        
        let pressTimer = null;
        const PRESS_DURATION = 700; // 700ms 长按，平衡响应与误触
        let isPressing = false;
        let startX = 0, startY = 0;
        let hasSelection = false;
        let rippleEl = null;
        
        // 提示元素
        const hint = document.createElement('div');
        hint.className = 'immersive-hint';
        document.body.appendChild(hint);
        
        const showHint = (isEntering) => {
            const t = Lumina.I18n.t;
            hint.textContent = isEntering ? (t('immersiveEnter') || '进入沉浸模式') 
                                        : (t('immersiveExit') || '退出沉浸模式');
            hint.classList.add('show');
            setTimeout(() => hint.classList.remove('show'), 1800);
        };
        
        const toggleImmersive = (e) => {
            // 如果当前有文本选中，不触发（避免与复制冲突）
            const selection = window.getSelection();
            if (selection && selection.toString().trim().length > 0) {
                return;
            }
            
            const state = Lumina.State.app.ui;
            state.isImmersive = !state.isImmersive;
            
            // 触觉反馈
            if (navigator.vibrate) {
                navigator.vibrate(state.isImmersive ? [50, 80, 50] : 40);
            }
            
            if (state.isImmersive) {
                // 进入沉浸
                document.body.classList.add('immersive-mode');
                document.documentElement.requestFullscreen?.().catch(() => {});
                // 关闭所有面板
                Lumina.DOM.sidebarRight?.classList.remove('open');
                Lumina.DOM.historyPanel?.classList.remove('open');
                Lumina.DOM.searchPanel?.classList.remove('open');
                Lumina.DOM.aboutPanel?.classList.remove('active');
                // 移动端关闭侧边栏
                if (window.innerWidth <= 768) {
                    Lumina.DOM.sidebarLeft?.classList.remove('visible');
                    Lumina.DOM.readingArea?.classList.remove('with-sidebar');
                    Lumina.State.settings.sidebarVisible = false;
                }
                // 应用沉浸模式安全区域
                if (window.toggleImmersiveSafeArea) {
                    window.toggleImmersiveSafeArea(true);
                }
                showHint(true);
            } else {
                // 退出沉浸
                document.body.classList.remove('immersive-mode');
                document.exitFullscreen?.().catch(() => {});
                showHint(false);
                // 恢复安全区域
                if (window.toggleImmersiveSafeArea) {
                    window.toggleImmersiveSafeArea(false);
                } else if (window.SafeArea) {
                    window.SafeArea.apply();
                }
            }
        };
        
        // 监听全屏变化（用户按 ESC 或系统手势退出时同步）
        document.addEventListener('fullscreenchange', () => {
            const state = Lumina.State.app.ui;
            if (!document.fullscreenElement && state.isImmersive) {
                state.isImmersive = false;
                document.body.classList.remove('immersive-mode');
            }
        });
        
        // 触摸开始 - 绑定在阅读区
        readingArea.addEventListener('touchstart', (e) => {
            // 排除交互元素：按钮、输入框、链接、图片（放大查看）
            if (e.target.closest('button, input, a, .doc-image, .pagination-nav, .cover-btn')) {
                return;
            }
            
            // 排除选区操作（如果已经有选区，不启动计时）
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
                return;
            }
            
            isPressing = true;
            hasSelection = false;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            
            // 开始计时
            pressTimer = setTimeout(() => {
                if (isPressing && !hasSelection) {
                    isPressing = false;
                    // 触发切换
                    toggleImmersive(e);
                }
            }, PRESS_DURATION);
            
        }, { passive: true });
        
        // 监控文本选择（防止与选字冲突）
        const checkSelection = () => {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
                hasSelection = true;
                clearTimeout(pressTimer);
            }
        };
        document.addEventListener('selectionchange', checkSelection);
        
        // 取消按压的情况
        const cancelPress = (e) => {
            if (!isPressing) return;
            
            // 如果移动超过阈值，取消
            if (e.changedTouches && e.changedTouches[0]) {
                const deltaX = Math.abs(e.changedTouches[0].clientX - startX);
                const deltaY = Math.abs(e.changedTouches[0].clientY - startY);
                if (deltaX > 15 || deltaY > 15) {
                    clearTimeout(pressTimer);
                    isPressing = false;
                    return;
                }
            }
            
            clearTimeout(pressTimer);
            isPressing = false;
        };
        
        readingArea.addEventListener('touchend', cancelPress, { passive: true });
        readingArea.addEventListener('touchcancel', cancelPress, { passive: true });
        readingArea.addEventListener('touchmove', (e) => {
            if (!isPressing) return;
            const deltaY = Math.abs(e.touches[0].clientY - startY);
            const deltaX = Math.abs(e.touches[0].clientX - startX);
            if (deltaY > 10 || deltaX > 10) {
                clearTimeout(pressTimer);
                isPressing = false;
            }
        }, { passive: true });
        
        // 双击退出（备用方案，如果长按太难用）
        readingArea.addEventListener('dblclick', (e) => {
            // 双击时如果处于沉浸模式，退出
            if (Lumina.State.app.ui.isImmersive) {
                toggleImmersive(e);
            }
        });
    },

    setupCustomTooltip() {
        // 移动端/APP 环境不显示 tooltip（注释内容的 tooltip 除外，单独处理）
        const isMobile = window.innerWidth <= 768;
        const isCapacitor = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
        if (isMobile || isCapacitor) return;
        
        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-i18n-tooltip], [data-tooltip-text], [data-tooltip]');
            const text = target?.dataset.tooltipText || target?.dataset.tooltip;
            if (text) {
                Lumina.UI.showTooltip(target, text);
            }
        });
        
        document.addEventListener('mouseout', (e) => { 
            if (e.target.closest('[data-i18n-tooltip], [data-tooltip-text], [data-tooltip]')) {
                Lumina.UI.hideTooltip(); 
            }
        });
    },

    // 双指缩放字体功能（移动端）
    setupPinchZoom() {
        if (window.innerWidth > 768) return;
        
        let initialPinchDistance = 0;
        let initialFontSize = 0;
        let lastScale = 1;
        let pinchStartTime = 0;
        // 暴露到全局，供其他模块检查双指缩放状态
        window.LuminaPinchState = { isPinching: false };
        
        const MIN_FONT_SIZE = 14;
        const MAX_FONT_SIZE = 32;
        
        // 获取阅读区域（严格限定在此区域）
        const readingArea = document.getElementById('readingArea');
        if (!readingArea) return;
        
        // 显示字体大小提示
        const showFontSizeToast = (size) => {
            const existingToast = document.getElementById('font-size-toast');
            if (existingToast) existingToast.remove();
            
            const toast = document.createElement('div');
            toast.id = 'font-size-toast';
            toast.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 12px 24px;
                border-radius: 24px;
                font-size: 16px;
                z-index: 10000;
                pointer-events: none;
                transition: opacity 0.3s;
                font-family: system-ui, -apple-system, sans-serif;
            `;
            toast.textContent = `字号: ${Math.round(size)}px`;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 1500);
        };
        
        // 应用字体大小并重新渲染
        const applyFontSize = (size) => {
            const newSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(size)));
            
            // 避免重复设置相同值
            if (newSize === Lumina.State.settings.fontSize) return newSize;
            
            Lumina.State.settings.fontSize = newSize;
            Lumina.Settings.save();
            
            // 更新 CSS 变量
            document.documentElement.style.setProperty('--font-size', `${newSize}px`);
            
            // 更新设置面板显示
            const sliderContainer = document.querySelector('[data-setting-slider="fontSize"]');
            if (sliderContainer) {
                const slider = sliderContainer.querySelector('.slider');
                const display = sliderContainer.querySelector('.slider-value');
                if (slider) slider.value = newSize;
                if (display) display.textContent = `${newSize}px`;
            }
            
            // 重新渲染当前章节
            if (Lumina.State.app.document.items.length) {
                const currentIndex = Lumina.Renderer.getCurrentVisibleIndex();
                Lumina.Renderer.renderCurrentChapter(currentIndex);
            }
            
            return newSize;
        };
        
        // 触摸开始 - 严格限定在 readingArea
        readingArea.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                window.LuminaPinchState.isPinching = true;
                pinchStartTime = Date.now();
                
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                initialPinchDistance = Math.hypot(dx, dy);
                initialFontSize = Lumina.State.settings.fontSize;
                lastScale = 1;
                
                e.preventDefault();
                e.stopPropagation();
            }
        }, { passive: false });
        
        // 触摸移动
        readingArea.addEventListener('touchmove', (e) => {
            if (window.LuminaPinchState.isPinching && e.touches.length === 2) {
                e.preventDefault();
                e.stopPropagation();
                
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const distance = Math.hypot(dx, dy);
                
                if (initialPinchDistance > 0) {
                    const scale = distance / initialPinchDistance;
                    lastScale = scale; // 记录最后的缩放比例
                    
                    const previewSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, initialFontSize * scale));
                    document.documentElement.style.setProperty('--font-size', `${previewSize}px`);
                }
            }
        }, { passive: false });
        
        // 触摸结束 - 关键修复：使用 lastScale 而不是重新计算
        readingArea.addEventListener('touchend', (e) => {
            if (window.LuminaPinchState.isPinching) {
                // 双指变单指或全部抬起
                if (e.touches.length < 2) {
                    const pinchDuration = Date.now() - pinchStartTime;
                    window.LuminaPinchState.isPinching = false;
                    
                    // 7.3 双指短按重置字号：双指按下很快抬起（< 300ms）且几乎没移动，重置为默认字号
                    const defaultFontSize = Lumina.Config?.defaultSettings?.fontSize || 20;
                    const isQuickTap = pinchDuration < 300; // 短按判定：小于300ms
                    const isMinimalMove = lastScale >= 0.95 && lastScale <= 1.05; // 几乎没移动
                    
                    if (isQuickTap && isMinimalMove) {
                        // 短按重置字号
                        const finalSize = applyFontSize(defaultFontSize);
                        showFontSizeToast(finalSize);
                    } else if (lastScale > 0 && initialFontSize > 0 && !isQuickTap) {
                        // 有效缩放（不是短按），应用新字号
                        const finalSize = applyFontSize(initialFontSize * lastScale);
                        showFontSizeToast(finalSize);
                    } else {
                        // 无效缩放，恢复原设置（防止漂移）
                        document.documentElement.style.setProperty('--font-size', `${Lumina.State.settings.fontSize}px`);
                    }
                    
                    // 重置状态
                    initialPinchDistance = 0;
                    lastScale = 1;
                }
            }
        });
        
        // 触摸取消
        readingArea.addEventListener('touchcancel', () => {
            if (window.LuminaPinchState.isPinching) {
                window.LuminaPinchState.isPinching = false;
                // 恢复原字体
                document.documentElement.style.setProperty('--font-size', `${Lumina.State.settings.fontSize}px`);
                initialPinchDistance = 0;
                lastScale = 1;
            }
        });
    },

    setupRegexRealtimeFeedback() {
        let debounceTimer;
        ['chapter', 'section'].forEach(type => {
            const input = document.getElementById(`${type}Regex`);
            input.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    Lumina.UI.updateRegexFeedback(type);
                    const chapterVal = document.getElementById('chapterRegex').value;
                    const sectionVal = document.getElementById('sectionRegex').value;
                    Lumina.Parser.RegexCache.updateCustomPatterns(chapterVal, sectionVal);
                }, 300);
            });
            input.addEventListener('blur', () => {
                if (Lumina.Utils.validateRegex(input.value)) {
                    const oldValue = Lumina.State.settings[`${type}Regex`];
                    const newValue = input.value;
                    // 只有值真正改变时才保存和刷新
                    if (oldValue !== newValue) {
                        Lumina.State.settings[`${type}Regex`] = newValue;
                        Lumina.Settings.save();
                        // 如果文档已加载，重新渲染以应用新的章节正则
                        if (Lumina.State.app.document.items?.length > 0) {
                            // 重新识别章节
                            Lumina.Parser.recognizeChapters(Lumina.State.app.document.items);
                            // 重新渲染当前视图
                            const currentIdx = Lumina.Renderer.getCurrentVisibleIndex();
                            Lumina.Renderer.renderCurrentChapter(currentIdx);
                            Lumina.Renderer.updateChapterNavInfo();
                            // 如果热力图有tag数据，刷新热力图（因为章节变了）
                            if (Lumina.HeatMap?.tags?.length > 0) {
                                Lumina.HeatMap.cache = null; // 清除缓存，强制重新分析
                                Lumina.HeatMap.analyze();
                            }
                        }
                    }
                }
            });
        });
    },

    updateRegexFeedback(type) {
        const input = document.getElementById(`${type}Regex`);
        const feedback = document.getElementById(`${type}RegexFeedback`);
        const pattern = input.value.trim();
        input.classList.remove('error', 'valid');
        feedback.classList.remove('error', 'valid', 'info');
        feedback.textContent = '';
        if (!pattern) return;
        if (!Lumina.Utils.validateRegex(pattern)) {
            input.classList.add('error');
            feedback.classList.add('error');
            feedback.textContent = Lumina.I18n.t('regexInvalid');
            return;
        }
        input.classList.add('valid');
        feedback.classList.add('valid');
        if (Lumina.State.app.document.items?.length > 0) {
            try {
                Lumina.Parser.RegexCache.updateCustomPatterns(
                    type === 'chapter' ? pattern : Lumina.State.settings.chapterRegex,
                    type === 'section' ? pattern : Lumina.State.settings.sectionRegex
                );
                const regex = type === 'chapter' ? Lumina.Parser.RegexCache.customPatterns.chapter : Lumina.Parser.RegexCache.customPatterns.section;
                if (regex) {
                    const count = Lumina.State.app.document.items.filter(item => item.text && regex.test(item.text)).length;
                    feedback.textContent = Lumina.I18n.t('regexMatches', count);
                } else feedback.textContent = Lumina.I18n.t('regexValid');
            } catch (e) { feedback.textContent = Lumina.I18n.t('regexValid'); }
        } else {
            feedback.classList.remove('valid');
            feedback.classList.add('info');
            feedback.textContent = Lumina.I18n.t('regexNoFile');
        }
    },

    showTooltip(target, text) {
        Lumina.DOM.tooltip.textContent = text;
        Lumina.DOM.tooltip.classList.add('visible');
        const rect = target.getBoundingClientRect();
        const tooltipRect = Lumina.DOM.tooltip.getBoundingClientRect();
        let left = rect.left + rect.width / 2;
        let top = rect.bottom + 10;
        if (top + tooltipRect.height > window.innerHeight - 20) top = rect.top - tooltipRect.height - 10;
        left = Math.max(tooltipRect.width / 2 + 10, Math.min(left, window.innerWidth - tooltipRect.width / 2 - 10));
        Lumina.DOM.tooltip.style.left = `${left}px`;
        Lumina.DOM.tooltip.style.top = `${top}px`;
    },

    hideTooltip() { Lumina.DOM.tooltip.classList.remove('visible'); },

    // 全屏查看图片
    viewImageFull(src, alt = '') {
        // 创建全屏遮罩
        const overlay = document.createElement('div');
        overlay.className = 'image-viewer-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.9);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: zoom-out;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        
        // 创建图片
        const img = document.createElement('img');
        img.src = src;
        img.alt = alt;
        img.style.cssText = `
            max-width: 95vw;
            max-height: 95vh;
            object-fit: contain;
            transform: scale(0.9);
            transition: transform 0.3s;
        `;
        
        // 关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            width: 44px;
            height: 44px;
            border: none;
            background: rgba(255,255,255,0.1);
            color: white;
            font-size: 24px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        `;
        closeBtn.onmouseenter = () => closeBtn.style.background = 'rgba(255,255,255,0.2)';
        closeBtn.onmouseleave = () => closeBtn.style.background = 'rgba(255,255,255,0.1)';
        
        overlay.appendChild(img);
        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);
        
        // 动画显示
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            img.style.transform = 'scale(1)';
        });
        
        // 关闭函数
        const close = () => {
            overlay.style.opacity = '0';
            img.style.transform = 'scale(0.9)';
            setTimeout(() => overlay.remove(), 300);
        };
        
        overlay.onclick = close;
        closeBtn.onclick = (e) => { e.stopPropagation(); close(); };
        
        // ESC 关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    },

    showDialog(message, type = 'alert', callback = null, options = {}) {
        const { title, inputType, placeholder, confirmText, cancelText } = options;
        
        // 获取元素（如果不存在则使用备用方案）
        const dialogTitle = Lumina.DOM.dialogTitle || document.getElementById('dialogTitle');
        const dialogMessage = Lumina.DOM.dialogMessage || document.getElementById('dialogMessage');
        const dialogCancel = Lumina.DOM.dialogCancel || document.getElementById('dialogCancel');
        const dialogConfirm = Lumina.DOM.dialogConfirm || document.getElementById('dialogConfirm');
        const customDialog = Lumina.DOM.customDialog;
        
        if (!customDialog) {
            console.error('[Dialog] 对话框容器不存在');
            if (callback) callback(type === 'confirm' || type === 'prompt' ? null : true);
            return;
        }
        
        // 设置标题
        if (title && dialogTitle) {
            dialogTitle.textContent = title;
            dialogTitle.style.display = 'block';
        } else if (dialogTitle) {
            dialogTitle.style.display = 'none';
        }
        
        // 设置消息
        if (dialogMessage) dialogMessage.textContent = message;
        
        // 处理输入框
        const inputWrapper = document.getElementById('dialogInputWrapper');
        const input = document.getElementById('dialogInput');
        
        if ((type === 'prompt' || inputType) && inputWrapper && input) {
            inputWrapper.style.display = 'block';
            input.type = inputType || 'text';
            input.placeholder = placeholder || '';
            input.value = '';
            setTimeout(() => input.focus(), 50);
        } else if (inputWrapper) {
            inputWrapper.style.display = 'none';
        }
        
        // 显示/隐藏取消按钮
        if (dialogCancel) {
            dialogCancel.style.display = (type === 'confirm' || type === 'prompt') ? 'block' : 'none';
        }
        
        // 自定义按钮文字
        const confirmBtnText = confirmText || (Lumina.I18n.t && Lumina.I18n.t('confirm')) || '确定';
        const cancelBtnText = cancelText || (Lumina.I18n.t && Lumina.I18n.t('cancel')) || '取消';
        
        if (dialogConfirm) dialogConfirm.textContent = confirmBtnText;
        if (dialogCancel) dialogCancel.textContent = cancelBtnText;
        
        customDialog.classList.add('active');
        
        const close = (result) => {
            customDialog.classList.remove('active');
            if (inputWrapper) inputWrapper.style.display = 'none';
            // 恢复默认按钮文字
            if (dialogConfirm) dialogConfirm.textContent = (Lumina.I18n.t && Lumina.I18n.t('confirm')) || '确定';
            if (dialogCancel) dialogCancel.textContent = (Lumina.I18n.t && Lumina.I18n.t('cancel')) || '取消';
            if (callback) callback(result);
        };
        
        if (dialogCancel) {
            dialogCancel.onclick = (e) => {
                e.stopPropagation();
                close(null);
            };
        }
        
        if (dialogConfirm) {
            dialogConfirm.onclick = (e) => {
                e.stopPropagation();
                if ((type === 'prompt' || inputType) && input) {
                    // 允许返回空字符串（例如密码输入留空使用默认密钥）
                    close(input.value);
                } else {
                    close(true);
                }
            };
        }
        
        // 回车键确认
        if (input) {
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    close(input.value || null);
                }
            };
        }
        
        customDialog.onclick = (e) => { 
            if (e.target === customDialog) close(null); 
        };
    },

    showToast(message, duration = 2000) {
        Lumina.DOM.toast.textContent = message;
        Lumina.DOM.toast.classList.add('show');
        setTimeout(() => Lumina.DOM.toast.classList.remove('show'), duration);
    },

    updateActiveButtons() {
        const groups = ['language', 'theme', 'font', 'chapterNumbering'];
        groups.forEach(group => {
            document.querySelectorAll(`[data-setting-group="${group}"] .option-btn, [data-setting-group="${group}"] .numbering-btn`).forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === Lumina.State.settings[group]);
            });
        });
    },

    setupPaginationTooltip(container) {
        container.querySelectorAll('[data-tooltip]').forEach(btn => {
            btn.addEventListener('mouseenter', (e) => {
                const text = e.target.closest('[data-tooltip]')?.dataset.tooltip;
                if (text && this.showTooltip) {
                    this.showTooltip(e.target, text);
                }
            });
            btn.addEventListener('mouseleave', () => {
                if (this.hideTooltip) this.hideTooltip();
            });
        });
    }

};

// 更新存储指示器图标和提示
Lumina.UI.updateStorageIndicator = (mode, isFallback = false) => {
    const indicator = document.getElementById('storageIndicator');
    const iconSvg = document.getElementById('storageIcon');
    
    if (!indicator || !iconSvg) return;
    
    const useElement = iconSvg.querySelector('use');
    if (!useElement) return;
    
    if (isFallback) {
        useElement.setAttribute('href', '#icon-storage-local');
    } else if (mode === 'sqlite') {
        useElement.setAttribute('href', '#icon-storage-server');
    } else {
        useElement.setAttribute('href', '#icon-storage-local');
    }
    
    indicator.dataset.mode = mode;
    indicator.dataset.isFallback = String(isFallback);
};

// 显示存储详情弹窗
Lumina.UI.showStorageInfo = async () => {
    const btn = document.getElementById('storageIndicator');
    if (!btn || btn.disabled) return;
    
    const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
    const t = Lumina.I18n.t;
    
    btn.disabled = true;
    
    // IndexedDB 模式
    if (!isSQLite) {
        try {
            const stats = await Lumina.DB.adapter.getStorageStats();
            renderContent(stats, false);
        } catch (err) {
            Lumina.UI.showToast(t('loadFailed'));
        } finally {
            setTimeout(() => btn.disabled = false, 500);
        }
        return;
    }
    
    // SQLite 模式：先显示骨架屏
    const html = `
        <div class="storage-modal" id="storageModal" onclick="if(event.target===this)Lumina.UI.closeStorageInfo()">
            <div class="storage-content">
                <div class="storage-header">
                    <span class="storage-title">${t('storageDetails')}</span>
                    <button class="storage-close" disabled style="cursor:not-allowed">
                        <svg class="icon"><use href="#icon-close"></use></svg>
                    </button>
                </div>
                <div class="storage-body" id="storageBody">
                    ${Array(4).fill(`
                        <div class="storage-item" style="pointer-events:none">
                            <div class="storage-icon skeleton-bg"></div>
                            <div class="storage-info">
                                <div class="skeleton-bg" style="height:12px;width:50%;margin-bottom:6px;border-radius:3px;"></div>
                                <div class="skeleton-bg" style="height:14px;width:80%;border-radius:3px;"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    
    // SQLite 加载数据后替换
    try {
        await new Promise(r => setTimeout(r, 50));
        const stats = await Lumina.DB.adapter.getStorageStats();
        
        const body = document.getElementById('storageBody');
        body.style.transition = 'opacity 0.15s';
        body.style.opacity = '0';
        
        setTimeout(() => {
            renderContent(stats, true, true); 
            body.style.opacity = '1';
        }, 150);
        
    } catch (err) {
        document.getElementById('storageBody').innerHTML = 
            `<div style="padding:20px;text-align:center;color:var(--warnning)">${t('loadFailed')}</div>`;
    } finally {
        setTimeout(() => btn.disabled = false, 500);
    }
    
    // 内部函数：渲染正式内容（IndexedDB 直接调用，SQLite 替换调用）
    function renderContent(stats, isSQLite, isReplace = false) {
        const isFallback = isSQLite && !Lumina.State.app.dbReady;
        let modeKey = isSQLite ? (isFallback ? 'storageFallback' : 'storageServer') : 'storageLocal';
        let statusClass = isSQLite ? (isFallback ? 'status-warning' : 'status-online') : 'status-offline';
        
        const items = [
            {
                icon: `<svg class="icon"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
                label: t('storageEngine'), value: t(modeKey), showStatus: true, statusClass
            },
            {
                icon: `<svg class="icon"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
                label: t('booksCountLabel'), value: t('booksCountValue', stats.totalFiles)
            },
            {
                icon: `<svg class="icon"><rect x="2" y="3" width="20" height="6" rx="2"/><rect x="2" y="15" width="20" height="6" rx="2"/></svg>`,
                label: t('storageUsedLabel'), value: Lumina.Utils.formatFileSize(stats.totalSize)
            }
        ];
        
        // SQLite 第4行：端点
        if (isSQLite) {
            items.push({
                icon: `<svg class="icon"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
                label: t('storageEndpoint'), value: 'localhost:8080'
            });
        }
        
        const listHtml = items.map(item => `
            <div class="storage-item">
                <div class="storage-icon">${item.icon}</div>
                <div class="storage-info">
                    <div class="storage-label">${item.label}</div>
                    <div class="storage-value">${item.value}</div>
                </div>
                ${item.showStatus ? `<div class="storage-status ${item.statusClass}"></div>` : ''}
            </div>
        `).join('');
        
        if (isReplace) {
            // SQLite 替换模式：直接替换 body 内容
            document.getElementById('storageBody').innerHTML = listHtml;
            const closeBtn = document.querySelector('#storageModal .storage-close');
            if (closeBtn) {
                closeBtn.disabled = false;
                closeBtn.style.opacity = '1';
                closeBtn.style.cursor = 'pointer';
                closeBtn.onclick = Lumina.UI.closeStorageInfo;
            }
        } else {
            // IndexedDB 直接模式：新建弹窗
            const html = `
                <div class="storage-modal" id="storageModal" onclick="if(event.target===this)Lumina.UI.closeStorageInfo()">
                    <div class="storage-content">
                        <div class="storage-header">
                            <span class="storage-title">${t('storageDetails')}</span>
                            <button class="storage-close" onclick="Lumina.UI.closeStorageInfo()" aria-label="${t('close')}">
                                <svg class="icon"><use href="#icon-close"></use></svg>
                            </button>
                        </div>
                        <div class="storage-body">${listHtml}</div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
            
            // ESC 关闭
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    Lumina.UI.closeStorageInfo();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
        }
    }
};

Lumina.UI.closeStorageInfo = () => {
    const modal = document.getElementById('storageModal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 200);
    }
};

// ==================== 18. 国际化更新 ====================

Lumina.I18n.updateUI = () => {
    const t = Lumina.I18n.t;
    document.title = t('appName');
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (Lumina.I18n.data[Lumina.State.settings.language]?.[key]) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        if (Lumina.I18n.data[Lumina.State.settings.language]?.[key]) el.placeholder = t(key);
    });
    document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
        const key = el.dataset.i18nTooltip;
        if (Lumina.I18n.data[Lumina.State.settings.language]?.[key]) el.dataset.tooltipText = t(key);
    });
    if (Lumina.State.app.currentFile.name) Lumina.DOM.fileInfo.textContent = Lumina.State.app.currentFile.name;
    Lumina.Renderer.updateChapterNavInfo();
    Lumina.DB.loadHistoryFromDB();
    Lumina.UI.updateRegexFeedback('chapter');
    Lumina.UI.updateRegexFeedback('section');
};

