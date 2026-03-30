/**
 * 安全区域适配 - 使用 Capacitor 插件获取实际数值
 * 
 * 修复要点：
 * 1. localStorage 缓存安全区域值 - 防止新实例启动时获取不到
 * 2. 多层级重试机制 - 确保最终能获取到正确的值
 * 3. 校验机制 - 如果 CSS env() 返回 0，使用插件或缓存值
 */

(function() {
    // 检测是否在 APP 环境
    const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
    
    if (!isApp) {
        // console.log('[SafeArea] 非 APP 环境，跳过');
        return;
    }

    let safeAreaData = { top: 0, bottom: 0, left: 0, right: 0 };
    let cachedSafeArea = null; // 内存缓存
    const STORAGE_KEY = 'lumina_safe_area_cache';
    const MAX_RETRY_COUNT = 5;
    let retryCount = 0;

    // 从 localStorage 读取缓存的安全区域
    function loadCachedSafeAreaFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                // 验证数据有效性
                if (data && typeof data.top === 'number' && typeof data.bottom === 'number') {
                    console.log('[SafeArea] 从 localStorage 加载缓存:', data);
                    return data;
                }
            }
        } catch (e) {
            console.warn('[SafeArea] 读取 localStorage 缓存失败:', e);
        }
        return null;
    }

    // 保存安全区域到 localStorage
    function saveSafeAreaToStorage(data) {
        try {
            if (data && typeof data.top === 'number') {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                console.log('[SafeArea] 已保存到 localStorage:', data);
            }
        } catch (e) {
            console.warn('[SafeArea] 保存到 localStorage 失败:', e);
        }
    }

    // 从 Capacitor Device 插件获取安全区域
    async function fetchSafeAreaFromPlugin() {
        try {
            const Device = Capacitor.Plugins.Device;
            if (!Device) {
                console.warn('[SafeArea] Device 插件未找到');
                return null;
            }

            // 获取设备信息
            const info = await Device.getInfo();
            console.log('[SafeArea] Device info:', info);

            // 获取电池信息（某些版本包含安全区域）
            const battery = await Device.getBatteryInfo().catch(() => null);
            console.log('[SafeArea] Battery info:', battery);

            // 如果插件返回了安全区域数据
            if (info && info.safeAreaInsets) {
                return {
                    top: info.safeAreaInsets.top || 0,
                    bottom: info.safeAreaInsets.bottom || 0,
                    left: info.safeAreaInsets.left || 0,
                    right: info.safeAreaInsets.right || 0
                };
            }

            return null;
        } catch (e) {
            console.warn('[SafeArea] 插件获取失败:', e);
            return null;
        }
    }

    // 通过 CSS env() 获取安全区域
    function getSafeAreaFromCSS() {
        if (!document.body) {
            console.log('[SafeArea] body 不存在，跳过 CSS env() 检测');
            return { top: 0, bottom: 0, left: 0, right: 0 };
        }
        
        const testEl = document.createElement('div');
        testEl.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            padding-top: env(safe-area-inset-top);
            padding-bottom: env(safe-area-inset-bottom);
            padding-left: env(safe-area-inset-left);
            padding-right: env(safe-area-inset-right);
            pointer-events: none;
            visibility: hidden;
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
        console.log('[SafeArea] CSS env() 值:', result);
        return result;
    }

    // 通过屏幕尺寸计算安全区域
    function calculateSafeAreaFromScreen() {
        const width = window.screen.width;
        const height = window.screen.height;
        const availHeight = window.screen.availHeight;
        const innerHeight = window.innerHeight;
        const pixelRatio = window.devicePixelRatio || 1;

        // 计算宽高比
        const ratio = height / width;

        let top = 0;
        let bottom = 0;

        // 根据屏幕比例判断设备类型
        if (ratio > 2.0) {
            // 刘海屏设备 (iPhone X+ 风格)
            top = Math.round(44 * pixelRatio); // 约 44pt/132px
            bottom = Math.round(34 * pixelRatio); // 底部安全区域约 34pt/102px
        } else if (ratio > 1.9) {
            // Android 刘海屏/水滴屏
            top = Math.round(24 * pixelRatio); // 状态栏 24dp
            bottom = Math.round(48 * pixelRatio); // 虚拟按键 48dp
        } else {
            // 标准屏幕
            top = Math.round(24 * pixelRatio); // 标准状态栏
            // 检测是否有虚拟导航栏
            if (height - availHeight > 50) {
                bottom = Math.round(48 * pixelRatio);
            }
        }

        // 如果 innerHeight 明显小于 availHeight，说明有系统 UI
        const systemUIHeight = availHeight - innerHeight;
        if (systemUIHeight > 0 && bottom === 0) {
            bottom = systemUIHeight;
        }

        console.log('[SafeArea] 屏幕计算值:', { top, bottom, ratio, pixelRatio });
        return { top, bottom, left: 0, right: 0 };
    }

    // 综合获取安全区域（带重试逻辑）
    async function getSafeArea() {
        // 如果已有内存缓存值，直接使用
        if (cachedSafeArea) {
            safeAreaData = cachedSafeArea;
            console.log('[SafeArea] 使用内存缓存值:', safeAreaData);
            return safeAreaData;
        }

        // 尝试从 localStorage 加载缓存
        const storageCache = loadCachedSafeAreaFromStorage();
        
        // 优先从插件获取（包括0值，因为可能是正确的）
        const pluginData = await fetchSafeAreaFromPlugin();
        
        // 其次从 CSS env() 获取（如果 body 已准备好）
        let cssData = null;
        if (document.body) {
            cssData = getSafeAreaFromCSS();
        }
        
        // 决策逻辑：优先使用有正值的来源
        if (pluginData && (pluginData.top > 0 || pluginData.bottom > 0)) {
            // 插件有正值，使用插件
            safeAreaData = pluginData;
            console.log('[SafeArea] 使用插件数据:', safeAreaData);
        } else if (cssData && (cssData.top > 0 || cssData.bottom > 0)) {
            // CSS env() 有正值，使用 CSS
            safeAreaData = cssData;
            console.log('[SafeArea] 使用 CSS env() 数据:', safeAreaData);
        } else if (storageCache && (storageCache.top > 0 || storageCache.bottom > 0)) {
            // 两者都是0或无值，使用 localStorage 缓存
            safeAreaData = storageCache;
            console.log('[SafeArea] 使用 localStorage 缓存数据:', safeAreaData);
        } else if (pluginData) {
            // 优先使用插件（可能是正确的0）
            safeAreaData = pluginData;
            console.log('[SafeArea] 使用插件数据(0值):', safeAreaData);
        } else if (cssData) {
            // 只有 CSS 数据（可能是0）
            safeAreaData = cssData;
            console.log('[SafeArea] 使用 CSS env() 数据(0值):', safeAreaData);
        } else {
            // 最后通过屏幕计算
            safeAreaData = calculateSafeAreaFromScreen();
            console.log('[SafeArea] 使用屏幕计算数据:', safeAreaData);
        }
        
        // 缓存到内存
        if (safeAreaData && typeof safeAreaData.top === 'number') {
            cachedSafeArea = { ...safeAreaData };
            
            // 如果获取到了有效的安全区域值，保存到 localStorage
            if (safeAreaData.top > 0 || safeAreaData.bottom > 0) {
                saveSafeAreaToStorage(safeAreaData);
            }
        }
        
        return safeAreaData;
    }

    // 设置并应用安全区域
    async function setupSafeArea() {
        try {
            await getSafeArea();
        } catch (e) {
            console.error('[SafeArea] 获取安全区域失败:', e);
            // 保持默认值 { top: 0, bottom: 0, left: 0, right: 0 }
        }
        
        // 确保数据有效
        if (!safeAreaData || typeof safeAreaData.top !== 'number') {
            safeAreaData = { top: 0, bottom: 0, left: 0, right: 0 };
        }

        // 检查是否需要重试（如果安全区域为0且未达到最大重试次数）
        if (safeAreaData.top === 0 && safeAreaData.bottom === 0) {
            const storageCache = loadCachedSafeAreaFromStorage();
            if (storageCache && (storageCache.top > 0 || storageCache.bottom > 0)) {
                // 使用 localStorage 缓存作为备选
                console.log('[SafeArea] 使用 localStorage 缓存作为备选:', storageCache);
                safeAreaData = storageCache;
            } else if (retryCount < MAX_RETRY_COUNT) {
                retryCount++;
                console.log(`[SafeArea] 安全区域为0，${retryCount}/${MAX_RETRY_COUNT} 秒后重试...`);
                setTimeout(() => {
                    // 清除缓存强制重新获取
                    cachedSafeArea = null;
                    setupSafeArea();
                }, 500 * retryCount); // 递增延迟
                return;
            }
        } else {
            // 成功获取到有效值，重置重试计数
            retryCount = 0;
        }

        // 设置 CSS 变量
        const root = document.documentElement;
        const isKeyboardOpen = document.body.classList.contains('keyboard-open');
        root.style.setProperty('--safe-area-top', safeAreaData.top + 'px');
        // 键盘打开时不设置底部安全区域（避免双 padding）
        root.style.setProperty('--safe-area-bottom', isKeyboardOpen ? '0px' : (safeAreaData.bottom + 'px'));
        root.style.setProperty('--safe-area-left', safeAreaData.left + 'px');
        root.style.setProperty('--safe-area-right', safeAreaData.right + 'px');

        console.log('[SafeArea] CSS 变量已设置:', safeAreaData, '键盘状态:', isKeyboardOpen);

        // 应用样式
        applySafeArea();
    }

    // 应用安全区域样式
    function applySafeArea() {
        // 防止 safeAreaData 未定义或被重置，优先使用缓存值
        if (!safeAreaData || typeof safeAreaData.top !== 'number') {
            if (cachedSafeArea) {
                console.warn('[SafeArea] 数据丢失，使用内存缓存值');
                safeAreaData = cachedSafeArea;
            } else {
                const storageCache = loadCachedSafeAreaFromStorage();
                if (storageCache) {
                    console.warn('[SafeArea] 数据丢失，使用 localStorage 缓存值');
                    safeAreaData = storageCache;
                } else {
                    console.warn('[SafeArea] 数据不可用，使用默认值');
                    safeAreaData = { top: 0, bottom: 0, left: 0, right: 0 };
                }
            }
        }
        
        const top = safeAreaData.top + 'px';
        // 键盘打开时底部 padding 为 0
        const isKeyboardOpen = document.body.classList.contains('keyboard-open');
        const bottom = isKeyboardOpen ? '0px' : (safeAreaData.bottom + 'px');

        const elements = {
            topBar: document.querySelector('.top-bar'),
            mainFrame: document.querySelector('.main-frame'),
            sidebarLeft: document.querySelector('.sidebar-left'),
            panels: document.querySelectorAll('.panel')
        };

        // 工具栏：60px + 顶部安全区域
        if (elements.topBar) {
            elements.topBar.style.paddingTop = top;
            elements.topBar.style.height = 'calc(60px + ' + top + ')';
        }

        // 主框架：顶部避开工具栏，底部避开虚拟按键
        if (elements.mainFrame) {
            elements.mainFrame.style.paddingTop = 'calc(60px + ' + top + ')';
            elements.mainFrame.style.paddingBottom = bottom;
        }

        // 左侧边栏
        if (elements.sidebarLeft) {
            elements.sidebarLeft.style.top = 'calc(60px + ' + top + ')';
            elements.sidebarLeft.style.height = 'calc(100vh - 60px - ' + top + ' - ' + bottom + ')';
        }

        // 右侧面板
        elements.panels.forEach(panel => {
            panel.style.top = 'calc(60px + ' + top + ')';
            panel.style.height = 'calc(100vh - 60px - ' + top + ' - ' + bottom + ')';
        });

        console.log('[SafeArea] 样式已应用:', { top: safeAreaData.top, bottom: safeAreaData.bottom, keyboardOpen: isKeyboardOpen });
    }

    // 沉浸模式切换
    window.toggleImmersiveSafeArea = function(isImmersive) {
        // 防止 safeAreaData 未定义或被重置，优先使用缓存值
        if (!safeAreaData || typeof safeAreaData.top !== 'number') {
            if (cachedSafeArea) {
                console.warn('[SafeArea] toggle: 数据丢失，使用内存缓存值');
                safeAreaData = cachedSafeArea;
            } else {
                const storageCache = loadCachedSafeAreaFromStorage();
                if (storageCache) {
                    console.warn('[SafeArea] toggle: 数据丢失，使用 localStorage 缓存值');
                    safeAreaData = storageCache;
                } else {
                    console.warn('[SafeArea] toggle: 数据不可用，使用默认值');
                    safeAreaData = { top: 0, bottom: 0, left: 0, right: 0 };
                }
            }
        }
        
        const top = safeAreaData.top + 'px';
        const bottom = safeAreaData.bottom + 'px';

        const elements = {
            topBar: document.querySelector('.top-bar'),
            mainFrame: document.querySelector('.main-frame'),
            sidebarLeft: document.querySelector('.sidebar-left'),
            panels: document.querySelectorAll('.panel'),
            appContainer: document.querySelector('.app-container')
        };

        if (isImmersive) {
            // 沉浸模式：工具栏完全隐藏
            if (elements.topBar) {
                elements.topBar.style.paddingTop = '0px';
                elements.topBar.style.height = '0px';
            }
            // 主框架：保留安全区域，并设置顶部背景色与主题一致
            if (elements.mainFrame) {
                elements.mainFrame.style.paddingTop = top;
                elements.mainFrame.style.paddingBottom = bottom;
                // 设置顶部背景色为当前主题的背景色
                elements.mainFrame.style.backgroundColor = 'var(--bg-primary)';
            }
            // 侧边栏和面板也要调整
            if (elements.sidebarLeft) {
                elements.sidebarLeft.style.top = top;
                elements.sidebarLeft.style.height = 'calc(100vh - ' + top + ' - ' + bottom + ')';
            }
            elements.panels.forEach(panel => {
                panel.style.top = top;
                panel.style.height = 'calc(100vh - ' + top + ' - ' + bottom + ')';
            });
        } else {
            // 退出沉浸模式：恢复完整布局
            if (elements.mainFrame) {
                elements.mainFrame.style.backgroundColor = ''; // 清除内联背景色
            }
            applySafeArea();
        }
    };

    // 重新加载安全区域（用于手动触发）
    window.refreshSafeArea = function() {
        console.log('[SafeArea] 手动刷新安全区域');
        // 轻量级刷新：只重新应用样式（不重新获取数据），用于键盘状态变化
        applySafeArea();
        // 同时刷新 CSS 变量（因为 applySafeArea 可能使用内联样式）
        const root = document.documentElement;
        const isKeyboardOpen = document.body.classList.contains('keyboard-open');
        if (safeAreaData) {
            root.style.setProperty('--safe-area-bottom', isKeyboardOpen ? '0px' : (safeAreaData.bottom + 'px'));
        }
        console.log('[SafeArea] 轻量级刷新完成，键盘状态:', isKeyboardOpen);
    };

    // 初始化 - 确保 DOM 已准备好
    function init() {
        if (!document.body) {
            // body 还未准备好，延迟执行
            setTimeout(init, 50);
            return;
        }
        setupSafeArea();
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 屏幕变化时重新计算
    window.addEventListener('resize', () => {
        setTimeout(() => setupSafeArea(), 100);
    });

    // 应用从后台返回时重新应用安全边距（解决文件选择器返回后安全边距丢失问题）
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            console.log('[SafeArea] 应用返回前台，重新应用安全边距');
            setTimeout(() => {
                // 根据当前是否处于沉浸模式，选择正确的应用方式
                if (document.body.classList.contains('immersive-mode')) {
                    window.toggleImmersiveSafeArea(true);
                } else {
                    applySafeArea();
                }
            }, 100);
        }
    });

    // 暴露到全局
    window.SafeArea = {
        setup: setupSafeArea,
        apply: applySafeArea,
        toggleImmersive: window.toggleImmersiveSafeArea,
        refresh: window.refreshSafeArea,
        getData: () => safeAreaData
    };
})();
