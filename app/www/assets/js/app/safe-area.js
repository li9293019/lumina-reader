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

    // 通过屏幕尺寸计算安全区域（带设备检测）
    function calculateSafeAreaFromScreen() {
        const width = window.screen.width;
        const height = window.screen.height;
        const availHeight = window.screen.availHeight;
        const innerHeight = window.innerHeight;
        const pixelRatio = window.devicePixelRatio || 1;
        const clientWidth = document.documentElement.clientWidth || window.innerWidth;
        const clientHeight = document.documentElement.clientHeight || window.innerHeight;

        // 计算宽高比
        const ratio = height / width;

        // 根据屏幕尺寸判断设备类型（使用物理像素或 CSS 像素）
        const shortEdge = Math.min(width, height);
        const longEdge = Math.max(width, height);
        const isTablet = shortEdge > 600; // 平板判断
        const isFoldable = ratio > 0.8 && ratio < 1.3; // 折叠屏展开状态

        let top = 0;
        let bottom = 0;

        // 使用更可靠的检测：如果 innerHeight 比 screen height 小很多，说明有系统 UI
        const heightDiff = height - innerHeight;
        const hasSystemUI = heightDiff > 20; // 误差容忍

        if (isFoldable) {
            // 折叠屏展开状态，通常没有刘海，但可能有任务栏
            top = Math.round(0 * pixelRatio);
            bottom = Math.round(hasSystemUI ? 48 : 0);
        } else if (ratio > 2.0) {
            // 刘海屏设备 (iPhone X+ 风格)
            // 使用 CSS 像素而非物理像素
            top = 44; // 约 44pt
            bottom = hasSystemUI ? 34 : 0; // 底部安全区域约 34pt
        } else if (ratio > 1.9) {
            // Android 刘海屏/水滴屏
            top = 32; // 状态栏约 32dp
            bottom = hasSystemUI ? 48 : 0; // 虚拟按键 48dp
        } else if (ratio > 1.7) {
            // 标准全面屏
            top = 28;
            bottom = hasSystemUI ? 48 : 0;
        } else {
            // 标准屏幕或平板
            top = 24;
            bottom = hasSystemUI ? 48 : (isTablet ? 0 : 24);
        }

        // 最后兜底：如果 innerHeight 明显小于 availHeight，使用差值
        const systemUIHeight = availHeight - innerHeight;
        if (systemUIHeight > 20 && bottom === 0) {
            bottom = Math.max(systemUIHeight, 48);
        }

        // 确保有合理的非零值（防止计算错误）
        if (top === 0 && longEdge > 700) {
            top = 32; // 至少给个状态栏高度
        }
        if (bottom === 0 && hasSystemUI) {
            bottom = 48; // 如果有系统 UI，至少给个导航栏高度
        }

        console.log('[SafeArea] 屏幕计算值:', { 
            top, bottom, ratio, pixelRatio, 
            hasSystemUI, isTablet, isFoldable,
            screen: `${width}x${height}`,
            client: `${clientWidth}x${clientHeight}`
        });
        return { top, bottom, left: 0, right: 0 };
    }

    // 综合获取安全区域（带重试逻辑和首次启动优化）
    async function getSafeArea(allowSave = true) {
        // 如果已有内存缓存值，直接使用
        if (cachedSafeArea) {
            safeAreaData = cachedSafeArea;
            console.log('[SafeArea] 使用内存缓存值:', safeAreaData);
            return safeAreaData;
        }

        // 尝试从 localStorage 加载缓存（优先级最高，因为是之前从插件获取的准确值）
        const storageCache = loadCachedSafeAreaFromStorage();
        if (storageCache && (storageCache.top > 0 || storageCache.bottom > 0)) {
            console.log('[SafeArea] 使用 localStorage 缓存:', storageCache);
            safeAreaData = storageCache;
            cachedSafeArea = { ...storageCache };
            return safeAreaData;
        }
        
        // 首次启动（无缓存）：优先尝试插件获取（准确值）
        const pluginData = await fetchSafeAreaFromPlugin();
        if (pluginData && (pluginData.top > 0 || pluginData.bottom > 0)) {
            safeAreaData = pluginData;
            console.log('[SafeArea] 使用插件数据:', safeAreaData);
            cachedSafeArea = { ...safeAreaData };
            // 只有插件获取的准确值才保存到 localStorage
            if (allowSave) {
                saveSafeAreaToStorage(safeAreaData);
            }
            return safeAreaData;
        }
        
        // 插件返回 0 或未就绪，尝试 CSS env()
        let cssData = null;
        if (document.body) {
            cssData = getSafeAreaFromCSS();
        }
        if (cssData && (cssData.top > 0 || cssData.bottom > 0)) {
            safeAreaData = cssData;
            console.log('[SafeArea] 使用 CSS env() 数据:', safeAreaData);
            cachedSafeArea = { ...safeAreaData };
            // CSS env() 也是准确值，可以保存
            if (allowSave) {
                saveSafeAreaToStorage(safeAreaData);
            }
            return safeAreaData;
        }
        
        // 都失败了，使用屏幕计算值（估算值，仅临时使用）
        const calculatedData = calculateSafeAreaFromScreen();
        safeAreaData = calculatedData;
        console.log('[SafeArea] 使用屏幕计算数据(临时估算):', safeAreaData);
        // 注意：屏幕计算值不保存到 localStorage，等待后续获取准确值
        cachedSafeArea = { ...safeAreaData };
        
        return safeAreaData;
    }

    // 设置并应用安全区域
    async function setupSafeArea(isRetry = false) {
        try {
            // 首次调用允许保存，重试时也允许保存（如果获取到插件值）
            await getSafeArea(true);
        } catch (e) {
            console.error('[SafeArea] 获取安全区域失败:', e);
            // 保持默认值 { top: 0, bottom: 0, left: 0, right: 0 }
        }
        
        // 确保数据有效
        if (!safeAreaData || typeof safeAreaData.top !== 'number') {
            safeAreaData = { top: 0, bottom: 0, left: 0, right: 0 };
        }

        // 检查是否需要重试
        const isZeroValue = safeAreaData.top === 0 && safeAreaData.bottom === 0;
        const storageCache = loadCachedSafeAreaFromStorage();
        
        if (isZeroValue) {
            if (storageCache && (storageCache.top > 0 || storageCache.bottom > 0)) {
                // 有 localStorage 缓存，使用它（这是之前保存的准确值）
                console.log('[SafeArea] 使用 localStorage 缓存作为备选:', storageCache);
                safeAreaData = storageCache;
                cachedSafeArea = { ...storageCache };
            } else if (retryCount < MAX_RETRY_COUNT) {
                // 首次启动且都是0，需要重试（给插件更多时间初始化）
                retryCount++;
                const delay = 500 * retryCount; // 递增延迟：500, 1000, 1500...
                console.log(`[SafeArea] 安全区域为0，${retryCount}/${MAX_RETRY_COUNT} 次重试，${delay}ms 后重试...`);
                setTimeout(() => {
                    // 清除内存缓存，强制重新获取
                    cachedSafeArea = null;
                    setupSafeArea(true);
                }, delay);
                return;
            } else {
                // 重试次数用尽，使用屏幕计算值作为最后手段
                console.log('[SafeArea] 重试次数用尽，使用屏幕计算值作为最后手段');
                safeAreaData = calculateSafeAreaFromScreen();
                cachedSafeArea = { ...safeAreaData };
                // 注意：即使是最后手段，屏幕计算值也不保存到 localStorage
                // 下次启动会继续尝试获取插件的准确值
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

    // 初始化 - 确保 DOM 已准备好，并给 Capacitor 插件足够时间初始化
    function init() {
        if (!document.body) {
            // body 还未准备好，延迟执行
            setTimeout(init, 50);
            return;
        }
        
        // 检查是否有缓存，没有则认为是首次启动，增加延迟
        const hasCache = loadCachedSafeAreaFromStorage();
        if (!hasCache) {
            console.log('[SafeArea] 首次启动，等待 Capacitor 插件初始化...');
            // 首次启动：等待 500ms 让 Capacitor 插件初始化
            setTimeout(() => setupSafeArea(), 500);
        } else {
            // 有缓存，立即应用
            setupSafeArea();
        }
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

    // 测试安全区域数据来源（调试用）
    async function testSafeAreaSources() {
        const results = [];
        
        // 1. Device 插件
        try {
            const Device = Capacitor?.Plugins?.Device;
            if (Device) {
                const info = await Device.getInfo();
                results.push(`【Device 插件】`);
                results.push(`safeAreaInsets: ${JSON.stringify(info.safeAreaInsets || {})}`);
                results.push(`平台: ${info.platform || 'unknown'}`);
                results.push(`型号: ${info.model || 'unknown'}`);
            } else {
                results.push(`【Device 插件】未找到`);
            }
        } catch (e) {
            results.push(`【Device 插件】错误: ${e.message}`);
        }
        
        results.push(''); // 空行
        
        // 2. CSS env()
        try {
            const cssData = getSafeAreaFromCSS();
            results.push(`【CSS env()】`);
            results.push(`top: ${cssData.top}px`);
            results.push(`bottom: ${cssData.bottom}px`);
            results.push(`left: ${cssData.left}px`);
            results.push(`right: ${cssData.right}px`);
        } catch (e) {
            results.push(`【CSS env()】错误: ${e.message}`);
        }
        
        results.push(''); // 空行
        
        // 3. 屏幕计算
        try {
            const calcData = calculateSafeAreaFromScreen();
            results.push(`【屏幕计算】`);
            results.push(`top: ${calcData.top}px`);
            results.push(`bottom: ${calcData.bottom}px`);
            results.push(`屏幕: ${window.screen.width}x${window.screen.height}`);
            results.push(`DPR: ${window.devicePixelRatio}`);
            results.push(`比例: ${(window.screen.height / window.screen.width).toFixed(2)}`);
        } catch (e) {
            results.push(`【屏幕计算】错误: ${e.message}`);
        }
        
        results.push(''); // 空行
        
        // 4. localStorage 缓存
        try {
            const storage = loadCachedSafeAreaFromStorage();
            results.push(`【localStorage】`);
            if (storage) {
                results.push(`top: ${storage.top}px`);
                results.push(`bottom: ${storage.bottom}px`);
            } else {
                results.push(`无缓存`);
            }
        } catch (e) {
            results.push(`【localStorage】错误: ${e.message}`);
        }
        
        results.push(''); // 空行
        
        // 5. 当前使用值
        results.push(`【当前使用】`);
        results.push(`top: ${safeAreaData?.top || 0}px`);
        results.push(`bottom: ${safeAreaData?.bottom || 0}px`);
        results.push(`内存缓存: ${cachedSafeArea ? '有' : '无'}`);
        
        // 显示对话框
        const message = results.join('\n');
        if (typeof Lumina !== 'undefined' && Lumina.UI?.showDialog) {
            Lumina.UI.showDialog(message, 'alert', null, {
                title: '安全区域数据源测试'
            });
        } else {
            alert(message);
        }
        
        console.log('[SafeArea] 测试数据:\n' + message);
    }

    // 暴露到全局
    window.SafeArea = {
        setup: setupSafeArea,
        apply: applySafeArea,
        toggleImmersive: window.toggleImmersiveSafeArea,
        refresh: window.refreshSafeArea,
        getData: () => safeAreaData,
        test: testSafeAreaSources // 添加测试方法
    };
    
    // 自动运行测试（首次启动时）
    // setTimeout(testSafeAreaSources, 1000);
})();
