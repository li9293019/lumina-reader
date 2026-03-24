/**
 * 安全区域适配 - 使用 Capacitor 插件获取实际数值
 */

(function() {
    // 检测是否在 APP 环境
    const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
    
    if (!isApp) {
        console.log('[SafeArea] 非 APP 环境，跳过');
        return;
    }

    let safeAreaData = { top: 0, bottom: 0, left: 0, right: 0 };

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

    // 综合获取安全区域
    async function getSafeArea() {
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
        } else if (pluginData) {
            // 两者都是0或无值，优先使用插件（可能是正确的0）
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
        
        return safeAreaData;
    }

    // 设置并应用安全区域
    async function setupSafeArea() {
        await getSafeArea();

        // 设置 CSS 变量
        const root = document.documentElement;
        root.style.setProperty('--safe-area-top', safeAreaData.top + 'px');
        root.style.setProperty('--safe-area-bottom', safeAreaData.bottom + 'px');
        root.style.setProperty('--safe-area-left', safeAreaData.left + 'px');
        root.style.setProperty('--safe-area-right', safeAreaData.right + 'px');

        console.log('[SafeArea] CSS 变量已设置:', safeAreaData);

        // 应用样式
        applySafeArea();
    }

    // 应用安全区域样式
    function applySafeArea() {
        const top = safeAreaData.top + 'px';
        const bottom = safeAreaData.bottom + 'px';

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

        console.log('[SafeArea] 样式已应用');
    }

    // 沉浸模式切换
    window.toggleImmersiveSafeArea = function(isImmersive) {
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

    // 暴露到全局
    window.SafeArea = {
        setup: setupSafeArea,
        apply: applySafeArea,
        toggleImmersive: window.toggleImmersiveSafeArea,
        getData: () => safeAreaData
    };
})();
