// ==================== 17. UI交互模块 ====================

Lumina.UI = {
    els: {},

    init() {
        this.cacheElements();
        this.bindEvents();
        this.setupCustomTooltip();
        this.setupRegexRealtimeFeedback();
        this.regexToolbar.init();
        if (Lumina.Editor) Lumina.Editor.init();
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
        d.searchModeContent = document.getElementById('searchModeContent');
        d.replaceModeContent = document.getElementById('replaceModeContent');
        d.clipboardPastePanel = document.getElementById('clipboardPastePanel');
        d.clipboardPasteTextarea = document.getElementById('clipboardPasteTextarea');
    },

    bindEvents() {
        this.setupClipboardLongPress('openFileBtn');
        this.setupClipboardLongPress('welcomeOpenBtn');
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
                // 统一使用 processFile 处理，内部会检测配置文件并路由
                await Lumina.Actions.processFile(file);
            }
        });

        const toggleSidebar = () => {
            const isVisible = Lumina.DOM.sidebarLeft.classList.toggle('visible');
            Lumina.DOM.readingArea.classList.toggle('with-sidebar', isVisible);
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
            Lumina.State.settings.sidebarVisible = isVisible;
            Lumina.Settings.save();
        };

        // 侧边栏 Tab 切换
        this.switchSidebarTab = (tabName) => {
            const tabs = document.querySelectorAll('#sidebarTabs .sidebar-tab');
            const contents = document.querySelectorAll('#sidebarTabContents .sidebar-tab-content');
            const titleEl = document.getElementById('sidebarPanelTitle');
            const countEl = document.getElementById('sidebarCount');

            tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabName));
            contents.forEach(content => content.classList.toggle('active', content.dataset.tabContent === tabName));

            // 更新标题和统计
            if (titleEl) {
                const tabEl = document.querySelector(`#sidebarTabs .sidebar-tab[data-tab="${tabName}"]`);
                titleEl.textContent = tabEl ? (Lumina.I18n.t(tabName) || tabName) : tabName;
            }
            if (countEl) {
                let count = '';
                if (tabName === 'toc') {
                    const chapters = Lumina.State.app.chapters;
                    count = chapters ? `${chapters.length} ${Lumina.I18n.t('chapters') || '章节'}` : '';
                }
                countEl.textContent = count;
            }

            // 触发渲染
            if (tabName === 'annotations' && Lumina.Annotations) {
                Lumina.Annotations.renderAnnotationList();
            } else if (tabName === 'dictionary' && Lumina.Dictionary) {
                Lumina.Dictionary.renderPanel();
            } else if (tabName === 'materials') {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => this.renderMaterialsPanel());
                });
            }
        };

        // 更新侧边栏各 Tab 的徽标数字
        this.updateSidebarTabBadges = () => {
            const annotations = Lumina.State.app.annotations || [];
            const annoBadge = document.getElementById('tabBadgeAnnotations');
            if (annoBadge) annoBadge.textContent = annotations.length > 0 ? annotations.length : '';

            const dictEntries = Lumina.Dictionary?.index?.entries;
            const dictBadge = document.getElementById('tabBadgeDictionary');
            if (dictBadge) dictBadge.textContent = dictEntries?.length > 0 ? dictEntries.length : '';

            const imageCount = this.countDocumentImages();
            const matBadge = document.getElementById('tabBadgeMaterials');
            if (matBadge) matBadge.textContent = imageCount > 0 ? imageCount : '';

            // 如果素材面板当前可见，同步刷新网格
            const matContent = document.querySelector('.sidebar-tab-content.active[data-tab-content="materials"]');
            if (matContent) this.renderMaterialsPanel();
        };

        // 统计文档中的图片数量
        this.countDocumentImages = () => {
            let count = 0;
            const items = Lumina.State.app.document?.items || [];
            items.forEach(item => {
                if (item.type === 'image') {
                    count++;
                } else if (item.type === 'paragraph' && item.inlineContent) {
                    item.inlineContent.forEach(ic => {
                        if (ic.type === 'image') count++;
                    });
                } else if (item.type && item.type.startsWith('heading') && item.inlineContent) {
                    item.inlineContent.forEach(ic => {
                        if (ic.type === 'image') count++;
                    });
                }
            });
            return count;
        };

        // 渲染素材面板（图片网格）
        this.renderMaterialsPanel = () => {
            const grid = document.getElementById('materialsGrid');
            if (!grid) return;

            const images = [];
            const items = Lumina.State.app.document?.items || [];
            items.forEach(item => {
                if (item.type === 'image') {
                    images.push({ src: item.src || item.data, alt: item.alt || '', name: item.alt || 'image' });
                } else if (item.type === 'paragraph' && item.inlineContent) {
                    item.inlineContent.forEach(ic => {
                        if (ic.type === 'image') {
                            images.push({ src: ic.src, alt: ic.alt || '', name: ic.alt || 'image' });
                        }
                    });
                } else if (item.type && item.type.startsWith('heading') && item.inlineContent) {
                    item.inlineContent.forEach(ic => {
                        if (ic.type === 'image') {
                            images.push({ src: ic.src, alt: ic.alt || '', name: ic.alt || 'image' });
                        }
                    });
                }
            });

            if (images.length === 0) {
                const emptyText = Lumina.I18n?.t('materialsEmpty') || '素材面板';
                grid.innerHTML = `<div class="materials-empty"><svg class="icon"><use href="#icon-image"/></svg><div>${emptyText}</div></div>`;
                return;
            }

            grid.innerHTML = images.map((img, idx) => `
                <div class="materials-grid-item" data-index="${idx}">
                    <div class="materials-grid-item__sizer"></div>
                    <img class="materials-grid-item__thumb" src="${Lumina.Utils.escapeHtml(img.src)}" alt="${Lumina.Utils.escapeHtml(img.alt)}" loading="lazy">
                    <div class="materials-grid-item__name">${Lumina.Utils.escapeHtml(img.name)}</div>
                </div>
            `).join('');

            grid.querySelectorAll('.materials-grid-item').forEach(item => {
                item.addEventListener('click', () => {
                    const img = item.querySelector('img');
                    const src = img?.src;
                    const alt = img?.alt || '';
                    if (src && Lumina.UI?.viewImageFull) {
                        Lumina.UI.viewImageFull(src, alt);
                    }
                });
            });
        };

        // 绑定 Tab 点击
        const sidebarTabs = document.getElementById('sidebarTabs');
        if (sidebarTabs) {
            sidebarTabs.addEventListener('click', (e) => {
                const tab = e.target.closest('.sidebar-tab');
                if (!tab) return;
                this.switchSidebarTab(tab.dataset.tab);
            });
        }

        // 大纲/词典 全部展开/收缩手势
        const bindToggleAllGesture = (container, nodeSelector) => {
            if (!container) return;
            let gestureTriggered = false;

            // 捕获阶段拦截 click，避免手势误触发子元素点击
            container.addEventListener('click', (e) => {
                if (gestureTriggered) {
                    e.preventDefault();
                    e.stopPropagation();
                    gestureTriggered = false;
                }
            }, true);

            // 移动端双指
            let twoFingerActive = false;
            container.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    twoFingerActive = true;
                }
            }, { passive: true });
            container.addEventListener('touchend', (e) => {
                if (twoFingerActive && e.touches.length === 0) {
                    twoFingerActive = false;
                    gestureTriggered = true;
                    toggleAll(container, nodeSelector);
                } else if (e.touches.length === 0) {
                    twoFingerActive = false;
                }
            });

            // PC端长按
            let longPressTimer = null;
            const LONG_PRESS_MS = 800;
            container.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                gestureTriggered = false;
                longPressTimer = setTimeout(() => {
                    longPressTimer = null;
                    gestureTriggered = true;
                    toggleAll(container, nodeSelector);
                }, LONG_PRESS_MS);
            });
            container.addEventListener('mouseup', () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
            container.addEventListener('mouseleave', () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
        };

        const toggleAll = (container, nodeSelector) => {
            const nodes = container.querySelectorAll(nodeSelector);
            if (nodes.length === 0) return;
            const allCollapsed = Array.from(nodes).every(n => n.classList.contains('collapsed'));
            nodes.forEach(n => n.classList.toggle('collapsed', !allCollapsed));
        };

        bindToggleAllGesture(document.getElementById('tocList'), '.toc-node');
        bindToggleAllGesture(document.getElementById('sidebarDictionaryList'), '.dict-tree-folder');

        // PC Web: 点击 fileInfo 打开/关闭书籍详情页
        const fileInfoEl = document.getElementById('fileInfo');
        if (fileInfoEl) {
            fileInfoEl.style.cursor = 'pointer';
            fileInfoEl.addEventListener('click', () => {
                const currentFileKey = Lumina.State.app.currentFile?.fileKey;
                if (!currentFileKey) return; // 没有打开书籍时不响应
                
                // 如果详情页已打开则关闭，否则打开
                const panel = document.getElementById('bookDetailPanel');
                if (panel?.classList.contains('active')) {
                    Lumina.BookDetail?.close();
                } else {
                    window.dataManager?.openBookDetail(currentFileKey);
                }
            });
        }
        
        // 移动端: 两次短按目录图标打开/关闭书籍详情页
        const tocBtn = document.getElementById('toggleToc');
        let lastTapTime = 0;
        let tapTimer = null;
        const DOUBLE_TAP_DELAY = 300; // 毫秒
        
        tocBtn.addEventListener('click', (e) => {
            const currentTime = new Date().getTime();
            const tapInterval = currentTime - lastTapTime;
            
            // 检测是否为双击（两次点击间隔小于设定值）
            if (tapInterval < DOUBLE_TAP_DELAY && tapInterval > 0) {
                // 双击检测到，取消单击定时器
                if (tapTimer) {
                    clearTimeout(tapTimer);
                    tapTimer = null;
                }
                lastTapTime = 0;
                
                const currentFileKey = Lumina.State.app.currentFile?.fileKey;
                if (!currentFileKey) return; // 没有打开书籍时不响应
                
                // 如果详情页已打开则关闭，否则打开
                const panel = document.getElementById('bookDetailPanel');
                if (panel?.classList.contains('active')) {
                    Lumina.BookDetail?.close();
                } else {
                    window.dataManager?.openBookDetail(currentFileKey);
                }
            } else {
                // 单击：延迟执行切换侧边栏，等待可能的双击
                lastTapTime = currentTime;
                tapTimer = setTimeout(() => {
                    tapTimer = null;
                    toggleSidebar();
                }, DOUBLE_TAP_DELAY);
            }
        });
        
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
                if (panel.classList.contains('open') && key === 'search') {
                    const isReplaceMode = document.getElementById('replaceModeContent')?.style.display !== 'none';
                    if (isReplaceMode) {
                        setTimeout(() => document.getElementById('replaceFindInput')?.focus(), 50);
                    } else {
                        Lumina.DOM.searchPanelInput.focus();
                    }
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
            this.switchSearchPanelMode('search');
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
        
        // 侧边栏词典搜索输入
        const sidebarDictionarySearchInput = document.getElementById('sidebarDictionarySearchInput');
        if (sidebarDictionarySearchInput) {
            sidebarDictionarySearchInput.addEventListener('input', (e) => {
                if (Lumina.Dictionary) Lumina.Dictionary.filterPanel(e.target.value);
            });
        }

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
                } else if (group === 'language') {
                    // 触发语言变更事件
                    window.dispatchEvent(new CustomEvent('languageChanged', { 
                        detail: { language: btn.dataset.value }
                    }));
                    Lumina.I18n.updateUI();
                }
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

            const passwordInput = e.target.closest('#defaultExportPasswordInput');
            if (passwordInput) {
                Lumina.State.settings.defaultExportPassword = passwordInput.value;
                Lumina.Settings.save();
            }
        });

        Lumina.DOM.sidebarRight.addEventListener('input', (e) => {
            const passwordInput = e.target.closest('#defaultExportPasswordInput');
            if (passwordInput) {
                Lumina.State.settings.defaultExportPassword = passwordInput.value;
                Lumina.Settings.save();
            }

            const watermarkInput = e.target.closest('#shareCardWatermarkInput');
            if (watermarkInput) {
                Lumina.State.settings.shareCardWatermark = watermarkInput.value;
                Lumina.Settings.save();
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
                    Lumina.UI.showToast(Lumina.I18n.t('exportFailed'));
                }
            }
        });

        // 设置面板元素（可能延迟加载）
        const applyRegexBtn = document.getElementById('applyRegex');
        const resetSettingsBtn = document.getElementById('resetSettings');
        if (applyRegexBtn) applyRegexBtn.addEventListener('click', Lumina.Actions.applyRegexRules);
        if (resetSettingsBtn) resetSettingsBtn.addEventListener('click', () => Lumina.Settings.reset());

        Lumina.DOM.searchPanelInput.addEventListener('input', (e) => Lumina.Search.perform(e.target.value));

        this.bindReplaceEvents();

        document.addEventListener('click', (e) => {
            // 点击面板、按钮或子面板(about-panel)时不关闭
            if (!e.target.closest('.panel, .btn-icon, .about-panel, .sidebar-left')) {
                Object.values(panels).forEach(({ panel }) => panel?.classList.remove('open'));
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

        // resize 防抖：APP 环境下键盘弹出/收起会高频触发 resize
        let resizeDebounceTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeDebounceTimer);
            resizeDebounceTimer = setTimeout(() => Lumina.Settings.apply(), 300);
        });

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

        // 分页扩展面板：关闭按钮 + 遮罩点击关闭
        document.getElementById('closePagePanel')?.addEventListener('click', () => {
            Lumina.Actions.closePagePanel();
        });
        document.getElementById('pagePanel')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('pagePanel')) {
                Lumina.Actions.closePagePanel();
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

    // ==================== 剪贴板粘贴功能 ====================

    setupClipboardLongPress(btnId) {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        let pressTimer = null;
        let isLongPress = false;
        const LONG_PRESS_DURATION = 700;
        let touchTriggered = false;

        const startPress = () => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                this.handleClipboardPaste();
            }, LONG_PRESS_DURATION);
        };

        const endPress = (e) => {
            clearTimeout(pressTimer);
            if (isLongPress) {
                // 长按已触发，阻止默认行为即可
                e.preventDefault();
                e.stopPropagation();
            } else {
                // 短按：打开文件选择器
                Lumina.DOM.fileInput.click();
            }
        };

        btn.addEventListener('touchstart', (e) => {
            touchTriggered = true;
            startPress();
        }, { passive: true });

        btn.addEventListener('touchend', (e) => {
            endPress(e);
        });

        btn.addEventListener('mousedown', (e) => {
            if (touchTriggered) return;
            startPress();
        });

        btn.addEventListener('mouseup', (e) => {
            if (touchTriggered) {
                touchTriggered = false;
                return;
            }
            endPress(e);
        });

        // 阻止长按后的 click 事件干扰
        btn.addEventListener('click', (e) => {
            if (isLongPress) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
    },

    async handleClipboardPaste() {
        const t = Lumina.I18n.t;
        let text = null;

        try {
            // Capacitor 环境
            if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.Clipboard) {
                const result = await Capacitor.Plugins.Clipboard.read({ type: 'string' });
                text = result.value;
            } else if (navigator.clipboard?.readText) {
                // Web 环境
                text = await navigator.clipboard.readText();
            }
        } catch (e) {
            console.log('[Clipboard] 读取失败:', e);
        }

        // 成功读到有效文本
        if (text && text.trim().length >= 50) {
            await this.processClipboardText(text);
            return;
        }

        // App 端：toast 提示
        const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
        if (isApp) {
            Lumina.UI.showToast(text ? t('clipboardTooShort') : t('clipboardNoText'));
            return;
        }

        // PC 端：打开手动粘贴面板
        this.openClipboardPastePanel();
    },

    detectMarkdown(text) {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 3) return false;

        const mdPatterns = [
            /^#{1,6}\s+/,       /^[-*+]\s+/,       /^>\s*/,
            /```/,              /\[.+?\]\(.+?\)/,  /!\[.+?\]\(.+?\)/,
            /^\d+\.\s+/,        /\*\*.+?\*\*/,     /\*.+?\*/,
            /^\|(.+\|)+/,       /^---+/,           /^___+/,
        ];

        let mdLines = 0;
        for (const line of lines) {
            if (mdPatterns.some(p => p.test(line))) mdLines++;
        }
        return mdLines / lines.length > 0.15;
    },

    async generateTextHash(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const num = parseInt(hex.substring(0, 8), 16) % 1000000000;
        return String(num).padStart(9, '0');
    },

    async processClipboardText(text) {
        const hash = await this.generateTextHash(text);
        const fileKey = `clipboard_${hash}`;

        // 检查是否已存在（防重复入库）
        if (Lumina.State.app.dbReady) {
            const existing = await Lumina.DB.adapter.getFile(fileKey);
            if (existing?.content?.length) {
                Lumina.UI.showToast(Lumina.I18n.t('dbUsingCache') || '该文本已存在，从历史记录打开');
                await Lumina.DB.restoreFileFromDB(existing);
                return;
            }
        }

        const isMd = this.detectMarkdown(text);
        const ext = isMd ? 'md' : 'txt';
        const filename = `TMP${hash.substring(0, 8)}.${ext}`;

        const blob = new Blob([text], { type: isMd ? 'text/markdown' : 'text/plain' });
        const file = new File([blob], filename, { type: blob.type });

        await Lumina.Actions.processFile(file, { fileKey });
    },

    openClipboardPastePanel() {
        const panel = Lumina.DOM.clipboardPastePanel;
        const textarea = Lumina.DOM.clipboardPasteTextarea;
        if (!panel) return;
        panel.classList.add('active');
        if (textarea) {
            textarea.value = '';
            setTimeout(() => textarea.focus(), 50);
        }

        // 绑定面板事件（只绑定一次）
        if (!panel._eventsBound) {
            panel._eventsBound = true;
            panel.addEventListener('click', (e) => {
                if (e.target === panel) this.closeClipboardPastePanel();
            });
            document.getElementById('closeClipboardPaste')?.addEventListener('click', () => this.closeClipboardPastePanel());
            document.getElementById('clipboardPasteCancel')?.addEventListener('click', () => this.closeClipboardPastePanel());
            document.getElementById('clipboardPasteConfirm')?.addEventListener('click', async () => {
                const text = textarea?.value || '';
                if (!text.trim()) {
                    Lumina.UI.showToast(Lumina.I18n.t('clipboardEmpty'));
                    return;
                }
                this.closeClipboardPastePanel();
                await this.processClipboardText(text);
            });
        }
    },

    closeClipboardPastePanel() {
        Lumina.DOM.clipboardPastePanel?.classList.remove('active');
    },

    // 打开 TTS 使用指南
    async openTTSGuide() {
        const guideFileName = Lumina.I18n.t('ttsGuideFileName');
        
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
                Lumina.UI.showToast(Lumina.I18n.t('ttsGuideLoadFailed'));
                return;
            }
            
            const text = await response.text();
            if (!text || text.length < 100) {
                Lumina.UI.showToast(Lumina.I18n.t('ttsGuideInvalidContent'));
                return;
            }
            
            // 3. 解析 Markdown
            const parsed = Lumina.Plugin?.Markdown?.Parser?.parse 
                ? Lumina.Plugin.Markdown.Parser.parse(text) 
                : Lumina.Parser.parseTXT(text);
            
            if (!parsed?.items?.length) {
                Lumina.UI.showToast(Lumina.I18n.t('ttsGuideParseFailed'));
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
                Lumina.UI.showToast(Lumina.I18n.t('ttsGuideSaveFailed'));
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
            Lumina.UI.showToast(Lumina.I18n.t('ttsGuideOpenFailed'));
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
                // 使用原生沉浸布局完全隐藏状态栏和导航栏
                window.NavigationBarInterface?.setImmersiveLayout(true);
                // 关闭所有面板
                Lumina.DOM.sidebarRight?.classList.remove('open');
                Lumina.DOM.historyPanel?.classList.remove('open');
                Lumina.DOM.searchPanel?.classList.remove('open');
                Lumina.DOM.aboutPanel?.classList.remove('active');
                // 移动端关闭侧边栏
                if (Lumina.Utils.isMobile()) {
                    Lumina.DOM.sidebarLeft?.classList.remove('visible');
                    Lumina.DOM.readingArea?.classList.remove('with-sidebar');
                    Lumina.State.settings.sidebarVisible = false;
                }
                // 应用沉浸模式安全区域
                if (window.toggleImmersiveSafeArea) {
                    window.toggleImmersiveSafeArea(true);
                }
                // 系统栏已由 setImmersiveLayout(true) 完全隐藏，无需再设置半透明颜色
                showHint(true);
            } else {
                // 退出沉浸
                document.body.classList.remove('immersive-mode');
                window.NavigationBarInterface?.setImmersiveLayout(false);
                showHint(false);
                // 恢复安全区域
                if (window.toggleImmersiveSafeArea) {
                    window.toggleImmersiveSafeArea(false);
                } else if (window.SafeArea) {
                    window.SafeArea.apply();
                }
                // 恢复状态栏与导航栏配色（按明度调整）
                const darkThemes = ['olive', 'taupe', 'dusk', 'moss', 'dark', 'amoled', 'midnight', 'nebula', 'espresso'];
                const isDark = darkThemes.includes(Lumina.State.settings.theme);
                const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim();
                if (bg && window.NavigationBarInterface) {
                    const brightnessFactor = ((Lumina.State.settings.brightness ?? 100) / 100);
                    const adjustedBg = Lumina.Settings.adjustColorForBrightness(bg, brightnessFactor);
                    window.NavigationBarInterface.setStatusBar(adjustedBg, !isDark);
                    window.NavigationBarInterface.setNavigationBar(adjustedBg, !isDark);
                }
            }
        };
        

        // 触摸开始 - 绑定在阅读区
        readingArea.addEventListener('touchstart', (e) => {
            // 排除交互元素：按钮、输入框、文本域、链接、图片（放大查看）、可编辑元素
            if (e.target.closest('button, input, textarea, a, .doc-image, .pagination-nav, .cover-btn, [contenteditable="true"], .doc-line-editor')) {
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
        
        // 双击退出沉浸（PC端专用；App端通过长按 700ms 进入/退出沉浸）
        readingArea.addEventListener('dblclick', (e) => {
            if (Lumina.Utils.isMobile()) return;
            // 双击时如果处于沉浸模式，退出
            if (Lumina.State.app.ui.isImmersive) {
                toggleImmersive(e);
            }
        });
    },

    bindReplaceEvents() {
        // 模式切换
        const modeTabs = document.getElementById('searchPanelModes');
        if (modeTabs) {
            modeTabs.addEventListener('click', (e) => {
                const tab = e.target.closest('.mode-tab');
                if (!tab) return;
                this.switchSearchPanelMode(tab.dataset.mode);
            });
        }

        // 替换查找输入框防抖
        const replaceFindInput = document.getElementById('replaceFindInput');
        if (replaceFindInput) {
            replaceFindInput.addEventListener('input', () => {
                clearTimeout(Lumina.Search.replaceState.previewDebounceTimer);
                Lumina.Search.replaceState.previewDebounceTimer = setTimeout(() => {
                    this.updateReplacePreview();
                }, 300);
            });
        }

        // 范围胶囊
        const scopePills = document.getElementById('replaceScopePills');
        if (scopePills) {
            scopePills.addEventListener('click', (e) => {
                const pill = e.target.closest('.pill');
                if (!pill) return;
                scopePills.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                Lumina.Search.replaceState.scope = pill.dataset.scope;
                this.updateReplacePreview();
            });
        }

        // 忽略大小写
        const ignoreCasePill = document.getElementById('replaceIgnoreCasePill');
        if (ignoreCasePill) {
            ignoreCasePill.addEventListener('click', () => {
                ignoreCasePill.classList.toggle('active');
                Lumina.Search.replaceState.ignoreCase = ignoreCasePill.classList.contains('active');
                this.updateReplacePreview();
            });
        }

        // 正则
        const regexPill = document.getElementById('replaceRegexPill');
        if (regexPill) {
            regexPill.addEventListener('click', () => {
                regexPill.classList.toggle('active');
                Lumina.Search.replaceState.useRegex = regexPill.classList.contains('active');
                this.updateReplacePreview();
            });
        }

        // 操作按钮
        document.getElementById('replaceFindNextBtn')?.addEventListener('click', () => Lumina.Search.findNextMatch());
        document.getElementById('replaceSingleBtn')?.addEventListener('click', () => Lumina.Search.replaceCurrentMatch());
        document.getElementById('replaceAllBtn')?.addEventListener('click', () => Lumina.Search.replaceAllMatches());
    },

    switchSearchPanelMode(mode) {
        const searchModeContent = document.getElementById('searchModeContent');
        const replaceModeContent = document.getElementById('replaceModeContent');
        const modeTabs = document.querySelectorAll('#searchPanelModes .mode-tab');

        modeTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));

        if (mode === 'replace') {
            if (searchModeContent) searchModeContent.style.display = 'none';
            if (replaceModeContent) replaceModeContent.style.display = '';
            setTimeout(() => document.getElementById('replaceFindInput')?.focus(), 50);
        } else {
            if (searchModeContent) searchModeContent.style.display = '';
            if (replaceModeContent) replaceModeContent.style.display = 'none';
            setTimeout(() => Lumina.DOM.searchPanelInput?.focus(), 50);
        }
    },

    updateReplacePreview() {
        const findInput = document.getElementById('replaceFindInput');
        const withInput = document.getElementById('replaceWithInput');
        if (!findInput) return;

        const query = findInput.value;
        const replacement = withInput?.value || '';
        const state = Lumina.Search.replaceState;

        if (!query) {
            state.matches = [];
            state.currentMatchIndex = -1;
            Lumina.Search.renderReplacePreview([], query, replacement);
            return;
        }

        const matches = Lumina.Search.findMatches(state.scope, query, {
            ignoreCase: state.ignoreCase,
            useRegex: state.useRegex
        });

        if (matches.error) {
            Lumina.UI.showToast(Lumina.I18n.t('replaceInvalidRegex'));
            state.matches = [];
            state.currentMatchIndex = -1;
            Lumina.Search.renderReplacePreview([], query, replacement);
            return;
        }

        state.matches = matches;
        state.currentMatchIndex = -1;
        Lumina.Search.renderReplacePreview(matches, query, replacement);
    },

    setupCustomTooltip() {
        // 移动端/APP 环境不显示 tooltip（注释内容的 tooltip 除外，单独处理）
        const isMobile = Lumina.Utils.isMobile();
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
        if (!Lumina.Utils.isMobile()) return;
        
        let initialPinchDistance = 0;
        let initialFontSize = 0;
        let lastScale = 1;
        let pinchStartTime = 0;
        let tripleTapStartTime = 0;
        // 暴露到全局，供其他模块检查双指缩放状态
        window.LuminaPinchState = { isPinching: false, isTripleTap: false };
        
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
            toast.textContent = Lumina.I18n.t('fontSizeLabel') + ': ' + Math.round(size) + 'px';
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
            } else if (e.touches.length === 3) {
                window.LuminaPinchState.isTripleTap = true;
                tripleTapStartTime = Date.now();
                console.log('[PinchZoom] 三指按下，准备短按检测');
                // 不阻止默认行为，避免与系统三指手势（截屏等）冲突
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
        
        // 触摸结束
        readingArea.addEventListener('touchend', (e) => {
            // 优先处理三指短按
            if (window.LuminaPinchState.isTripleTap) {
                if (e.touches.length < 3) {
                    const tapDuration = Date.now() - tripleTapStartTime;
                    window.LuminaPinchState.isTripleTap = false;
                    console.log('[PinchZoom] 三指抬起，持续时间:', tapDuration, 'ms');
                    
                    // 三指短按重置字号：三指按下很快抬起（< 350ms），重置为默认字号
                    if (tapDuration < 350) {
                        const defaultFontSize = Lumina.Config?.defaultSettings?.fontSize || 20;
                        const finalSize = applyFontSize(defaultFontSize);
                        showFontSizeToast(finalSize);
                        console.log('[PinchZoom] 三指短按触发，恢复默认字号:', finalSize);
                    }
                    
                    // 三指操作期间可能同时激活了双指状态，一并重置避免后续 touchend 误触发
                    if (window.LuminaPinchState.isPinching) {
                        window.LuminaPinchState.isPinching = false;
                        initialPinchDistance = 0;
                        lastScale = 1;
                    }
                }
                return; // 已处理三指，不再执行双指逻辑
            }
            
            if (window.LuminaPinchState.isPinching) {
                // 双指变单指或全部抬起
                if (e.touches.length < 2) {
                    window.LuminaPinchState.isPinching = false;
                    
                    if (lastScale > 0 && initialFontSize > 0) {
                        // 有效缩放，应用新字号
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
        
        // 触摸取消（系统手势介入时可能触发 touchcancel 而非 touchend）
        readingArea.addEventListener('touchcancel', () => {
            // 三指短按备选：部分系统在三指截屏等手势时会发送 touchcancel
            if (window.LuminaPinchState.isTripleTap) {
                const tapDuration = Date.now() - tripleTapStartTime;
                window.LuminaPinchState.isTripleTap = false;
                console.log('[PinchZoom] touchcancel，三指持续时间:', tapDuration, 'ms');
                
                if (tapDuration < 350) {
                    const defaultFontSize = Lumina.Config?.defaultSettings?.fontSize || 20;
                    const finalSize = applyFontSize(defaultFontSize);
                    showFontSizeToast(finalSize);
                    console.log('[PinchZoom] touchcancel 触发三指短按，恢复默认字号:', finalSize);
                }
            }
            
            if (window.LuminaPinchState.isPinching) {
                window.LuminaPinchState.isPinching = false;
                // 恢复原字体
                document.documentElement.style.setProperty('--font-size', `${Lumina.State.settings.fontSize}px`);
                initialPinchDistance = 0;
                lastScale = 1;
            }
        });
    },

    // ==================== 正则表达式辅助工具栏 ====================
    regexToolbar: {
        currentInput: null,
        toolbarEl: null,
        isVisible: false,
        hideTimer: null, // 用于取消延迟隐藏
        
        // 符号布局定义：第一行9个，第二行9个
        symbols: [
            // 第一行：元字符 + 结构
            [
                { symbol: '^', desc: Lumina.I18n.t('regexDescStart') },
                { symbol: '.', desc: Lumina.I18n.t('regexDescAny') },
                { symbol: '+', desc: Lumina.I18n.t('regexDescOneOrMore') },
                { symbol: '*', desc: Lumina.I18n.t('regexDescZeroOrMore') },
                { symbol: '-', desc: Lumina.I18n.t('regexDescHyphen') },
                { symbol: '?', desc: Lumina.I18n.t('regexDescZeroOrOne') },
                { symbol: '()', desc: Lumina.I18n.t('regexDescCapture'), cursorOffset: 1 },
                { symbol: '[]', desc: Lumina.I18n.t('regexDescGroup'), cursorOffset: 1 },
                { symbol: '{}', desc: Lumina.I18n.t('regexDescQuantifier'), cursorOffset: 1 }
            ],
            // 第二行：位置 + 宏 + 转义 + 逻辑
            [
                { symbol: '$', desc: Lumina.I18n.t('regexDescEnd') },
                { symbol: '\\', desc: Lumina.I18n.t('regexDescEscape') },
                { symbol: '\\C', desc: Lumina.I18n.t('regexDescCN') },
                { symbol: '\\Z', desc: Lumina.I18n.t('regexDescZhong') },
                { symbol: '\\A', desc: Lumina.I18n.t('regexDescAlpha') },
                { symbol: '\\R', desc: Lumina.I18n.t('regexDescRomanU') },
                { symbol: '\\s', desc: Lumina.I18n.t('regexDescSpace') },
                { symbol: '\\d', desc: Lumina.I18n.t('regexDescNum') },
                { symbol: '|', desc: Lumina.I18n.t('regexDescOr') }
            ]
        ],

        init() {
            // 只在 APP 环境（Capacitor）显示正则工具栏
            const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
            if (!isApp) return;
            
            this.createToolbar();
            this.bindEvents();
        },

        createToolbar() {
            const toolbar = document.createElement('div');
            toolbar.className = 'regex-toolbar';
            toolbar.id = 'regexToolbar';

            this.symbols.forEach((row) => {
                const rowEl = document.createElement('div');
                rowEl.className = 'regex-toolbar-row';

                row.forEach(item => {
                    const btn = document.createElement('button');
                    btn.className = 'regex-toolbar-btn';
                    btn.textContent = item.symbol;
                    btn.dataset.symbol = item.symbol;
                    btn.dataset.desc = item.desc;
                    if (item.cursorOffset !== undefined) {
                        btn.dataset.cursorOffset = item.cursorOffset;
                    }

                    btn.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    });

                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.insertSymbol(item);
                    });

                    btn.addEventListener('touchstart', (e) => {
                        e.preventDefault();
                        btn.classList.add('active');
                    }, { passive: false });

                    btn.addEventListener('touchend', (e) => {
                        e.preventDefault();
                        btn.classList.remove('active');
                        this.insertSymbol(item);
                    });

                    rowEl.appendChild(btn);
                });

                toolbar.appendChild(rowEl);
            });

            document.body.appendChild(toolbar);
            this.toolbarEl = toolbar;
        },

        bindEvents() {
            const chapterInput = document.getElementById('chapterRegex');
            const sectionInput = document.getElementById('sectionRegex');

            [chapterInput, sectionInput].forEach(input => {
                if (!input) return;

                input.addEventListener('focus', () => {
                    // 清除可能存在的延迟隐藏定时器
                    if (this.hideTimer) {
                        clearTimeout(this.hideTimer);
                        this.hideTimer = null;
                    }
                    this.show(input);
                });

                input.addEventListener('blur', () => {
                    this.hideTimer = setTimeout(() => {
                        if (!this.isClickOnToolbar) this.hide();
                        this.hideTimer = null;
                    }, 150);
                });
            });

            if (this.toolbarEl) {
                this.toolbarEl.addEventListener('mousedown', (e) => {
                    if (e.target.closest('.regex-toolbar-btn')) {
                        this.isClickOnToolbar = true;
                        return;
                    }
                    this.isClickOnToolbar = true;
                    e.preventDefault();
                });

                this.toolbarEl.addEventListener('mouseup', () => {
                    setTimeout(() => { this.isClickOnToolbar = false; }, 100);
                });

                this.toolbarEl.addEventListener('touchstart', (e) => {
                    if (e.target.closest('.regex-toolbar-btn')) {
                        this.isClickOnToolbar = true;
                        return;
                    }
                    this.isClickOnToolbar = true;
                }, { passive: false });

                this.toolbarEl.addEventListener('touchend', () => {
                    setTimeout(() => { this.isClickOnToolbar = false; }, 100);
                });

                this.toolbarEl.addEventListener('click', (e) => {
                    if (e.target.closest('.regex-toolbar-btn')) return;
                    e.stopPropagation();
                });
            }

            document.addEventListener('click', (e) => {
                const clickedInsideToolbar = e.target.closest('.regex-toolbar');
                const clickedInsideInput = e.target.closest('#chapterRegex') || e.target.closest('#sectionRegex');
                if (!clickedInsideToolbar && !clickedInsideInput) this.hide();
            });

            const settingsCloseBtn = document.getElementById('settingsClose');
            if (settingsCloseBtn) {
                settingsCloseBtn.addEventListener('click', () => this.hide());
            }
        },

        insertSymbol(item) {
            if (!this.currentInput) return;

            const input = this.currentInput;
            const symbol = item.symbol;
            const cursorOffset = item.cursorOffset;
            const start = input.selectionStart || 0;
            const end = input.selectionEnd || 0;
            const value = input.value;
            const hasSelection = start !== end;
            const selectedText = value.substring(start, end);

            let newValue, newSelectionStart, newSelectionEnd;

            if (hasSelection && cursorOffset !== undefined) {
                const openChar = symbol[0];
                const closeChar = symbol[1];
                const before = value.substring(0, start);
                const after = value.substring(end);
                newValue = before + openChar + selectedText + closeChar + after;
                newSelectionStart = start + 1;
                newSelectionEnd = start + 1 + selectedText.length;
            } else {
                const before = value.substring(0, start);
                const after = value.substring(end);
                newValue = before + symbol + after;
                const newCursorPos = cursorOffset !== undefined ? start + cursorOffset : start + symbol.length;
                newSelectionStart = newSelectionEnd = newCursorPos;
            }

            input.value = newValue;
            input.selectionStart = newSelectionStart;
            input.selectionEnd = newSelectionEnd;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
            Lumina.UI.updateRegexFeedback(input.id === 'chapterRegex' ? 'chapter' : 'section');
        },

        show(input) {
            this.currentInput = input;
            this.isVisible = true;
            if (this.toolbarEl) this.toolbarEl.classList.add('visible');
            const settingsContent = document.querySelector('.settings-content');
            if (settingsContent) settingsContent.classList.add('with-regex-toolbar');
        },

        hide() {
            this.isVisible = false;
            this.currentInput = null;
            if (this.toolbarEl) this.toolbarEl.classList.remove('visible');
            const settingsContent = document.querySelector('.settings-content');
            if (settingsContent) settingsContent.classList.remove('with-regex-toolbar');
        }
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
                            Lumina.Parser.reparseWithRegex();
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
        
        const margin = 10;
        const tooltipWidth = tooltipRect.width;
        const tooltipHeight = tooltipRect.height;
        
        // 垂直位置：默认在目标元素下方
        let top = rect.bottom + 10;
        if (top + tooltipHeight > window.innerHeight - margin) {
            // 下方空间不足，显示在上方
            top = rect.top - tooltipHeight - 10;
        }
        
        // 水平位置：优先尝试居中
        let left = rect.left + rect.width / 2;
        const halfWidth = tooltipWidth / 2;
        
        // 检查是否会溢出右边缘
        if (left + halfWidth > window.innerWidth - margin) {
            // 靠近右边缘：右对齐，距离右边缘 margin
            left = window.innerWidth - margin - halfWidth;
        } else if (left - halfWidth < margin) {
            // 靠近左边缘：左对齐
            left = margin + halfWidth;
        }
        
        Lumina.DOM.tooltip.style.left = `${left}px`;
        Lumina.DOM.tooltip.style.top = `${top}px`;
    },

    hideTooltip() { Lumina.DOM.tooltip.classList.remove('visible'); },
    CustomSelect: class {
        constructor(container, options = {}) {
            this.container = typeof container === 'string' ? document.getElementById(container) : container;
            this.options = {
                placeholder: options.placeholder || '',
                value: options.value || '',
                onChange: options.onChange || null,
                menuMaxHeight: options.menuMaxHeight || 240,
                ...options
            };
            this.items = [];
            this.value = this.options.value;
            this.opened = false;
            this._render();
            this._bindEvents();
            this.setValue(this.value, true);
        }

        _render() {
            if (!this.container) return;
            this.container.innerHTML = '';
            this.container.classList.add('lumina-custom-select');

            this.trigger = document.createElement('button');
            this.trigger.className = 'lumina-custom-select__trigger';
            this.trigger.type = 'button';
            this.trigger.innerHTML = '<span class="lumina-custom-select__label"></span><svg class="icon lumina-custom-select__arrow"><use href="#icon-caret-down"/></svg>';
            this.labelEl = this.trigger.querySelector('.lumina-custom-select__label');

            this.dropdown = document.createElement('div');
            this.dropdown.className = 'lumina-custom-select__dropdown';
            this.dropdown.innerHTML = '<div class="lumina-custom-select__menu"></div>';
            this.menu = this.dropdown.querySelector('.lumina-custom-select__menu');

            this.container.appendChild(this.trigger);
            this.container.appendChild(this.dropdown);
        }

        _bindEvents() {
            if (!this.trigger) return;
            this.trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
            this._outsideClick = (e) => {
                if (!this.container.contains(e.target)) this.close();
            };
            document.addEventListener('click', this._outsideClick);
        }

        setItems(items) {
            this.items = items || [];
            if (!this.menu) return;
            this.menu.innerHTML = '';
            this.items.forEach(item => {
                const el = document.createElement('div');
                el.className = 'lumina-custom-select__item';
                el.dataset.value = item.value;
                el.textContent = item.label;
                el.addEventListener('click', () => {
                    this.setValue(item.value);
                    this.close();
                });
                this.menu.appendChild(el);
            });
            this.setValue(this.value, true);
        }

        setValue(value, silent = false) {
            this.value = value;
            if (this.labelEl) {
                const active = this.menu?.querySelector(`[data-value="${CSS.escape(value)}"]`);
                // 如果 menu 中找不到对应 item，但 value 非空，直接显示 value（避免已保存的值被 placeholder 覆盖）
                this.labelEl.textContent = active ? active.textContent : (value || this.options.placeholder);
            }
            this.menu?.querySelectorAll('.lumina-custom-select__item').forEach(el => {
                el.classList.toggle('active', el.dataset.value === String(value));
            });
            if (!silent && this.options.onChange) {
                this.options.onChange(value);
            }
        }

        getValue() { return this.value; }
        open() { this.opened = true; this.dropdown?.classList.add('open'); }
        close() { this.opened = false; this.dropdown?.classList.remove('open'); }
        toggle() { this.opened ? this.close() : this.open(); }
        destroy() {
            if (this._outsideClick) document.removeEventListener('click', this._outsideClick);
            if (this.container) this.container.innerHTML = '';
        }
    },


    // 全屏查看图片
    viewImageFull(src, alt = '', gallery = null, currentIndex = 0) {
        // 如果没有传入 gallery，从当前文档自动收集
        if (!gallery) {
            gallery = this._collectDocumentImages();
            const idx = gallery.findIndex(img => img.src === src);
            currentIndex = idx >= 0 ? idx : 0;
        }
        if (!gallery.length) gallery = [{ src, alt }];
        let currentIdx = Math.max(0, Math.min(currentIndex, gallery.length - 1));

        // 创建全屏遮罩
        const overlay = document.createElement('div');
        overlay.className = 'image-viewer-overlay';

        // 创建图片
        const img = document.createElement('img');
        img.className = 'image-viewer-overlay__img';

        const showImage = (idx) => {
            const item = gallery[idx];
            if (!item) return;
            img.src = item.src;
            img.alt = item.alt || '';
            currentIdx = idx;
        };
        showImage(currentIdx);

        // 关闭按钮（使用 SVG icon）
        const closeBtn = document.createElement('button');
        closeBtn.className = 'image-viewer-overlay__close';
        closeBtn.innerHTML = '<svg class="icon"><use href="#icon-close"/></svg>';
        closeBtn.onclick = (e) => { e.stopPropagation(); close(); };

        overlay.appendChild(img);
        overlay.appendChild(closeBtn);

        // 左右导航按钮（多图时显示）
        let prevBtn = null, nextBtn = null;
        if (gallery.length > 1) {
            prevBtn = document.createElement('button');
            prevBtn.className = 'image-viewer-overlay__nav image-viewer-overlay__nav--prev';
            prevBtn.innerHTML = '<svg class="icon"><use href="#icon-chevron-left"/></svg>';
            prevBtn.onclick = (e) => { e.stopPropagation(); showPrev(); };

            nextBtn = document.createElement('button');
            nextBtn.className = 'image-viewer-overlay__nav image-viewer-overlay__nav--next';
            nextBtn.innerHTML = '<svg class="icon"><use href="#icon-chevron-right"/></svg>';
            nextBtn.onclick = (e) => { e.stopPropagation(); showNext(); };

            overlay.appendChild(prevBtn);
            overlay.appendChild(nextBtn);
        }

        document.body.appendChild(overlay);

        // 动画显示
        requestAnimationFrame(() => overlay.classList.add('active'));

        // 切换函数
        const showPrev = () => {
            if (gallery.length <= 1) return;
            const newIdx = (currentIdx - 1 + gallery.length) % gallery.length;
            showImage(newIdx);
        };
        const showNext = () => {
            if (gallery.length <= 1) return;
            const newIdx = (currentIdx + 1) % gallery.length;
            showImage(newIdx);
        };

        // 关闭函数
        const close = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
            document.removeEventListener('keydown', keyHandler);
            overlay.removeEventListener('touchstart', touchStartHandler);
            overlay.removeEventListener('touchend', touchEndHandler);
        };

        // PC端：点击遮罩区域 —— 左1/4上一张，右1/4下一张，中间关闭
        overlay.onclick = (e) => {
            if (e.target.closest('.image-viewer-overlay__close')) return;
            if (e.target.closest('.image-viewer-overlay__nav')) return;
            const rect = overlay.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const width = rect.width;
            if (gallery.length > 1) {
                if (x < width * 0.25) { showPrev(); return; }
                if (x > width * 0.75) { showNext(); return; }
            }
            close();
        };

        // 移动端：触摸滑动
        let touchStartX = 0, touchStartY = 0;
        const touchStartHandler = (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        };
        const touchEndHandler = (e) => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            const dy = e.changedTouches[0].clientY - touchStartY;
            if (gallery.length > 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
                dx > 0 ? showPrev() : showNext();
            }
        };
        overlay.addEventListener('touchstart', touchStartHandler, { passive: true });
        overlay.addEventListener('touchend', touchEndHandler, { passive: true });

        // 键盘：左右箭头切换（ESC 由 BackButtonHandler 统一处理）
        const keyHandler = (e) => {
            if (gallery.length > 1 && e.key === 'ArrowLeft') {
                e.preventDefault();
                showPrev();
                return;
            }
            if (gallery.length > 1 && e.key === 'ArrowRight') {
                e.preventDefault();
                showNext();
                return;
            }
        };
        document.addEventListener('keydown', keyHandler);
    },

    _collectDocumentImages() {
        const images = [];
        const items = Lumina.State.app.document?.items || [];
        items.forEach(item => {
            if (item.type === 'image' && (item.src || item.data)) {
                images.push({ src: item.src || item.data, alt: item.alt || '' });
            } else if (item.inlineContent) {
                item.inlineContent.forEach(ic => {
                    if (ic.type === 'image' && ic.src) {
                        images.push({ src: ic.src, alt: ic.alt || '' });
                    }
                });
            }
        });
        return images;
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
        // 容错处理：如果 toast 元素不存在，创建临时 toast
        let toast = Lumina.DOM?.toast;
        if (!toast) {
            toast = document.getElementById('toast');
            if (!toast) {
                // 创建临时 toast
                toast = document.createElement('div');
                toast.id = 'temp-toast';
                toast.className = 'toast';
                toast.style.cssText = `
                    position: fixed;
                    bottom: 80px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: var(--tooltip-bg, rgba(33, 37, 41, 0.95));
                    color: var(--tooltip-text, #fff);
                    padding: 10px 20px;
                    border-radius: 24px;
                    font-size: 14px;
                    z-index: 99999;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                    pointer-events: none;
                    min-width: min(120px, 90vw);
                    max-width: 75vw;
                    text-align: center;
                    word-break: break-word;
                `;
                document.body.appendChild(toast);
                // 强制重绘
                toast.offsetHeight;
            }
        }
        toast.textContent = message;
        toast.classList.add('show');
        if (toast.style) toast.style.opacity = '1';
        setTimeout(() => {
            toast.classList.remove('show');
            if (toast.style) toast.style.opacity = '0';
            // 如果是临时 toast，清理掉
            if (toast.id === 'temp-toast') {
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    },

    updateActiveButtons() {
        const groups = ['language', 'theme', 'font', 'chapterNumbering', 'shareCardExportQuality'];
        groups.forEach(group => {
            document.querySelectorAll(`[data-setting-group="${group}"] .option-btn, [data-setting-group="${group}"] .numbering-btn`).forEach(btn => {
                btn.classList.toggle('active', btn.dataset.value === Lumina.State.settings[group]);
            });
        });
        
        // 更新自定义字体按钮状态
        document.querySelectorAll('.option-btn-custom').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === Lumina.State.settings.font);
        });
        
        // 渲染自定义字体按钮（如果有变化）
        Lumina.Settings?.renderFontButtons?.();
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
    
    const isSQLite = Lumina.DB.adapter.mode === 'sqlite';
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
    const language = Lumina.State.settings.language;
    
    document.title = t('appName');
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (Lumina.I18n.data[language]?.[key]) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        if (Lumina.I18n.data[language]?.[key]) el.placeholder = t(key);
    });
    document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
        const key = el.dataset.i18nTooltip;
        if (Lumina.I18n.data[language]?.[key]) el.dataset.tooltipText = t(key);
    });
    // 更新书名（优先用 metadata.title，支持简繁转换）
    const currentFile = Lumina.State.app.currentFile;
    if (currentFile.name || currentFile.fileName) {
        Lumina.DOM.fileInfo.textContent = Lumina.Converter?.getDisplayTitle?.(currentFile) 
            || currentFile.name 
            || currentFile.fileName;
    }
    Lumina.Renderer.updateChapterNavInfo();
    Lumina.DB.loadHistoryFromDB();
    Lumina.UI.updateRegexFeedback('chapter');
    Lumina.UI.updateRegexFeedback('section');
    
};

