/**
 * 安全区域适配 - 重构版
 *
 * 核心设计：
 * 1. 启动时一次性获取安全区域值（localStorage → 插件 → CSS env() → 屏幕计算），终身缓存
 * 2. 运行时所有事件（键盘/resize/沉浸/visibilitychange）只走 applySafeArea()，不再获取插件值
 * 3. applySafeArea() 带状态去重 + DOM 缓存 + 统一防抖，杜绝重复 DOM 操作
 * 4. 一台手机的安全区域值是固定的，不需要运行时反复读取
 */

(function() {
    const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
    if (!isApp) return;

    // ==================== 常量 ====================
    const STORAGE_KEY = 'lumina_safe_area_cache';
    const DEBOUNCE_MS = 80;

    // ==================== 状态 ====================
    let safeAreaData = { top: 0, bottom: 0, left: 0, right: 0 };
    let _initComplete = false;
    let _lastAppliedKey = null;
    let _domElements = null;
    let _refreshTimer = null;

    // ==================== localStorage ====================
    function loadCachedSafeAreaFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                if (data && typeof data.top === 'number' && typeof data.bottom === 'number') {
                    return data;
                }
            }
        } catch (e) {
            console.warn('[SafeArea] 读取 localStorage 失败:', e);
        }
        return null;
    }

    function saveSafeAreaToStorage(data) {
        try {
            if (data && typeof data.top === 'number') {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            }
        } catch (e) {
            console.warn('[SafeArea] 保存 localStorage 失败:', e);
        }
    }

    // ==================== 获取层（只在初始化时调用一次） ====================
    // 已移除：Capacitor Device 插件在 Android 上不返回 safeAreaInsets，该路径无效。
    // 主力方案改为 CSS env() + 屏幕估算兜底。

    function getSafeAreaFromCSS() {
        if (!document.body) return { top: 0, bottom: 0, left: 0, right: 0 };
        const testEl = document.createElement('div');
        testEl.style.cssText = `
            position:fixed;left:0;top:0;width:100%;height:100%;
            padding-top:env(safe-area-inset-top);
            padding-bottom:env(safe-area-inset-bottom);
            padding-left:env(safe-area-inset-left);
            padding-right:env(safe-area-inset-right);
            pointer-events:none;visibility:hidden;
        `;
        document.body.appendChild(testEl);
        const style = getComputedStyle(testEl);
        const result = {
            top: parseInt(style.paddingTop) || 0,
            bottom: parseInt(style.paddingBottom) || 0,
            left: parseInt(style.paddingLeft) || 0,
            right: parseInt(style.paddingRight) || 0
        };
        document.body.removeChild(testEl);
        return result;
    }

    function calculateSafeAreaFromScreen() {
        const width = window.screen.width;
        const height = window.screen.height;
        const innerHeight = window.innerHeight;
        const ratio = height / width;
        const shortEdge = Math.min(width, height);
        const longEdge = Math.max(width, height);
        const isTablet = shortEdge > 600;
        const isFoldable = ratio > 0.8 && ratio < 1.3;
        const hasSystemUI = (height - innerHeight) > 20;

        let top = 0, bottom = 0;

        if (isFoldable) {
            top = 0;
            bottom = hasSystemUI ? 48 : 0;
        } else if (ratio > 2.0) {
            top = 44;
            bottom = hasSystemUI ? 34 : 0;
        } else if (ratio > 1.9) {
            top = 32;
            bottom = hasSystemUI ? 48 : 0;
        } else if (ratio > 1.7) {
            top = 28;
            bottom = hasSystemUI ? 48 : 0;
        } else {
            top = 24;
            bottom = hasSystemUI ? 48 : (isTablet ? 0 : 24);
        }

        const systemUIHeight = window.screen.availHeight - innerHeight;
        if (systemUIHeight > 20 && bottom === 0) {
            bottom = Math.max(systemUIHeight, 48);
        }
        if (top === 0 && longEdge > 700) top = 32;
        if (bottom === 0 && hasSystemUI) bottom = 48;

        return { top, bottom, left: 0, right: 0 };
    }

    // ==================== 初始化（每次启动都重新检测，避免缓存错误值） ====================
    async function initSafeArea() {
        if (_initComplete) return;

        // 主力：CSS env() —— 每次启动都重新读取，避免初次安装记录错误值
        if (document.body) {
            const cssData = getSafeAreaFromCSS();
            if (cssData && (cssData.top > 0 || cssData.bottom > 0)) {
                safeAreaData = cssData;
                saveSafeAreaToStorage(safeAreaData);
                _initComplete = true;
                applySafeArea();
                return;
            }
        }

        // 兜底：屏幕比例估算
        safeAreaData = calculateSafeAreaFromScreen();
        _initComplete = true;
        applySafeArea();
    }

    // ==================== 统一防抖调度 ====================
    function scheduleSafeAreaRefresh() {
        clearTimeout(_refreshTimer);
        _refreshTimer = setTimeout(() => {
            _refreshTimer = null;
            applySafeArea();
        }, DEBOUNCE_MS);
    }

    // ==================== DOM 缓存 ====================
    function getSafeAreaElements() {
        if (!_domElements) {
            _domElements = {
                topBar: document.querySelector('.top-bar'),
                mainFrame: document.querySelector('.main-frame'),
                sidebarLeft: document.querySelector('.sidebar-left'),
                panels: Array.from(document.querySelectorAll('.panel'))
            };
        }
        return _domElements;
    }

    // ==================== 应用层（运行时唯一入口） ====================
    function applySafeArea() {
        if (!_initComplete) return;

        const isKeyboardOpen = document.body.classList.contains('keyboard-open');
        const isImmersive = document.body.classList.contains('immersive-mode');

        // 状态去重：值 + 键盘 + 沉浸 都没变就跳过
        const stateKey = `${safeAreaData.top}|${safeAreaData.bottom}|${safeAreaData.left}|${safeAreaData.right}|${isKeyboardOpen}|${isImmersive}`;
        if (_lastAppliedKey === stateKey) return;
        _lastAppliedKey = stateKey;

        const top = safeAreaData.top + 'px';
        const bottom = isKeyboardOpen ? '0px' : (safeAreaData.bottom + 'px');
        const elements = getSafeAreaElements();

        // 工具栏
        if (elements.topBar) {
            if (isImmersive) {
                elements.topBar.style.paddingTop = '0px';
                elements.topBar.style.height = '0px';
            } else {
                elements.topBar.style.paddingTop = top;
                elements.topBar.style.height = 'calc(60px + ' + top + ')';
            }
        }

        // 主框架
        if (elements.mainFrame) {
            if (isImmersive) {
                elements.mainFrame.style.paddingTop = top;
                elements.mainFrame.style.paddingBottom = '0px';
            } else {
                elements.mainFrame.style.paddingTop = 'calc(60px + ' + top + ')';
                elements.mainFrame.style.paddingBottom = bottom;
            }
        }

        // 左侧边栏
        if (elements.sidebarLeft) {
            if (isImmersive) {
                elements.sidebarLeft.style.top = top;
                elements.sidebarLeft.style.height = 'calc(100vh - ' + top + ')';
            } else {
                elements.sidebarLeft.style.top = 'calc(60px + ' + top + ')';
                elements.sidebarLeft.style.height = 'calc(100vh - 60px - ' + top + ' - ' + bottom + ')';
            }
        }

        // 右侧面板
        elements.panels.forEach(panel => {
            if (isImmersive) {
                panel.style.top = top;
                panel.style.height = 'calc(100vh - ' + top + ')';
            } else {
                panel.style.top = 'calc(60px + ' + top + ')';
                panel.style.height = 'calc(100vh - 60px - ' + top + ' - ' + bottom + ')';
            }
        });

        // 同步 CSS 变量
        const root = document.documentElement;
        root.style.setProperty('--safe-area-top', top);
        root.style.setProperty('--safe-area-bottom', bottom);
        root.style.setProperty('--safe-area-left', safeAreaData.left + 'px');
        root.style.setProperty('--safe-area-right', safeAreaData.right + 'px');
    }

    // ==================== 沉浸模式切换（保留外部接口） ====================
    window.toggleImmersiveSafeArea = function(isImmersive) {
        if (!_initComplete) {
            // 初始化未完成，延迟重试
            setTimeout(() => window.toggleImmersiveSafeArea(isImmersive), 100);
            return;
        }

        const top = safeAreaData.top + 'px';
        const bottom = safeAreaData.bottom + 'px';
        const elements = getSafeAreaElements();

        if (isImmersive) {
            if (elements.topBar) {
                elements.topBar.style.paddingTop = '0px';
                elements.topBar.style.height = '0px';
            }
            if (elements.mainFrame) {
                elements.mainFrame.style.paddingTop = top;
                elements.mainFrame.style.paddingBottom = '0px';
                elements.mainFrame.style.backgroundColor = 'var(--bg-primary)';
            }
            if (elements.sidebarLeft) {
                elements.sidebarLeft.style.top = top;
                elements.sidebarLeft.style.height = 'calc(100vh - ' + top + ')';
            }
            elements.panels.forEach(panel => {
                panel.style.top = top;
                panel.style.height = 'calc(100vh - ' + top + ')';
            });
        } else {
            if (elements.mainFrame) {
                elements.mainFrame.style.backgroundColor = '';
            }
            _lastAppliedKey = null; // 强制让 applySafeArea 重新生效
            applySafeArea();
            // 保险：显式恢复底部安全边距，避免 applySafeArea 去重或缓存导致遗漏
            const bottomPx = safeAreaData.bottom + 'px';
            if (elements.mainFrame) {
                elements.mainFrame.style.paddingBottom = bottomPx;
            }
            if (elements.sidebarLeft) {
                elements.sidebarLeft.style.height = 'calc(100vh - 60px - ' + top + ' - ' + bottomPx + ')';
            }
            elements.panels.forEach(panel => {
                panel.style.height = 'calc(100vh - 60px - ' + top + ' - ' + bottomPx + ')';
            });
        }
    };

    // ==================== 轻量级刷新（保留外部接口） ====================
    window.refreshSafeArea = function() {
        scheduleSafeAreaRefresh();
    };

    // ==================== 初始化入口 ====================
    function init() {
        if (!document.body) {
            setTimeout(init, 50);
            return;
        }
        initSafeArea();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ==================== 事件监听（运行时只调度 applySafeArea） ====================
    window.addEventListener('resize', () => {
        scheduleSafeAreaRefresh();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            scheduleSafeAreaRefresh();
        }
    });

    // ==================== 测试接口（保留） ====================
    async function testSafeAreaSources() {
        const results = [];
        try {
            const Device = Capacitor?.Plugins?.Device;
            if (Device) {
                const info = await Device.getInfo();
                results.push('【Device 插件】');
                results.push('safeAreaInsets: ' + JSON.stringify(info.safeAreaInsets || {}));
                results.push('平台: ' + (info.platform || 'unknown'));
            } else {
                results.push('【Device 插件】未找到');
            }
        } catch (e) {
            results.push('【Device 插件】错误: ' + e.message);
        }
        results.push('');

        try {
            const cssData = getSafeAreaFromCSS();
            results.push('【CSS env()】');
            results.push('top: ' + cssData.top + 'px');
            results.push('bottom: ' + cssData.bottom + 'px');
        } catch (e) {
            results.push('【CSS env()】错误: ' + e.message);
        }
        results.push('');

        try {
            const calcData = calculateSafeAreaFromScreen();
            results.push('【屏幕计算】');
            results.push('top: ' + calcData.top + 'px');
            results.push('bottom: ' + calcData.bottom + 'px');
        } catch (e) {
            results.push('【屏幕计算】错误: ' + e.message);
        }
        results.push('');

        try {
            const storage = loadCachedSafeAreaFromStorage();
            results.push('【localStorage】');
            results.push(storage ? 'top: ' + storage.top + 'px' : '无缓存');
        } catch (e) {
            results.push('【localStorage】错误: ' + e.message);
        }
        results.push('');

        results.push('【当前使用】');
        results.push('top: ' + (safeAreaData?.top || 0) + 'px');
        results.push('bottom: ' + (safeAreaData?.bottom || 0) + 'px');

        const message = results.join('\n');
        if (typeof Lumina !== 'undefined' && Lumina.UI?.showDialog) {
            Lumina.UI.showDialog(message, 'alert', null, { title: '安全区域数据源测试' });
        } else {
            alert(message);
        }
        console.log('[SafeArea] 测试数据:\n' + message);
    }

    // ==================== 全局暴露 ====================
    window.SafeArea = {
        setup: () => { applySafeArea(); },
        apply: applySafeArea,
        toggleImmersive: window.toggleImmersiveSafeArea,
        refresh: window.refreshSafeArea,
        getData: () => safeAreaData,
        test: testSafeAreaSources
    };
})();
