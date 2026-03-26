// ==================== 插件管理器 ====================
// 提供钩子系统，让插件可以扩展核心功能
// 完全解耦：无插件时核心功能不受影响

Lumina.PluginManager = {
    // 钩子注册表
    hooks: {},
    
    // 已注册插件
    plugins: new Map(),
    
    // 插件状态
    states: new Map(),

    /**
     * 初始化插件管理器
     */
    init() {
        this.hooks = {
            'beforeParse': [],      // 解析前：返回数据可接管解析
            'afterParse': [],       // 解析后：修改解析结果
            'beforeRender': [],     // 渲染前：修改 item 数据
            'createElement': [],    // 创建元素：返回 DOM 可自定义渲染
            'afterRender': [],      // 渲染后：DOM 操作
            'fileLoad': [],         // 文件加载时：检测文件类型
            'settingsRender': []    // 设置面板渲染：添加插件设置
        };
        
        this.loadPluginStates();
    },

    /**
     * 注册钩子回调
     * @param {string} hookName - 钩子名称
     * @param {Function} callback - 回调函数
     * @param {number} priority - 优先级（数字越小越早执行）
     */
    registerHook(hookName, callback, priority = 10) {
        if (!this.hooks[hookName]) {
            console.warn(`未知钩子: ${hookName}`);
            return;
        }
        
        this.hooks[hookName].push({ callback, priority });
        this.hooks[hookName].sort((a, b) => a.priority - b.priority);
    },

    /**
     * 执行钩子（顺序执行，有返回则中断）
     * @param {string} hookName - 钩子名称
     * @param {...any} args - 参数
     * @returns {any|null} - 第一个有返回值的回调结果
     */
    executeHook(hookName, ...args) {
        const hooks = this.hooks[hookName];
        if (!hooks || hooks.length === 0) return null;
        
        for (const { callback } of hooks) {
            try {
                const result = callback(...args);
                if (result !== null && result !== undefined) {
                    return result;
                }
            } catch (e) {
                console.error(`钩子执行失败 [${hookName}]:`, e);
            }
        }
        return null;
    },

    /**
     * 执行钩子（不中断，收集所有结果）
     * @param {string} hookName - 钩子名称
     * @param {...any} args - 参数
     * @returns {Array} - 所有返回值
     */
    executeHookAll(hookName, ...args) {
        const hooks = this.hooks[hookName];
        if (!hooks || hooks.length === 0) return [];
        
        const results = [];
        for (const { callback } of hooks) {
            try {
                const result = callback(...args);
                if (result !== null && result !== undefined) {
                    results.push(result);
                }
            } catch (e) {
                console.error(`钩子执行失败 [${hookName}]:`, e);
            }
        }
        return results;
    },

    /**
     * 注册插件
     * @param {Object} plugin - 插件对象
     */
    register(plugin) {
        if (!plugin || !plugin.name) {
            console.error('插件注册失败：缺少 name 属性');
            return;
        }
        
        // 检查是否被禁用
        const state = this.getPluginState(plugin.name);
        if (state.enabled === false) {
            console.log(`插件 [${plugin.name}] 已禁用，跳过注册`);
            this.plugins.set(plugin.name, { ...plugin, _disabled: true });
            return;
        }
        
        // 保存插件
        this.plugins.set(plugin.name, plugin);
        
        // 初始化
        try {
            if (plugin.init) {
                plugin.init();
            }
            // console.log(`插件 [${plugin.name}] v${plugin.version || '1.0'} 已加载`);
        } catch (e) {
            console.error(`插件 [${plugin.name}] 初始化失败:`, e);
        }
    },

    /**
     * 获取插件
     * @param {string} name - 插件名称
     */
    get(name) {
        return this.plugins.get(name);
    },

    /**
     * 从 localStorage 加载插件状态
     */
    loadPluginStates() {
        try {
            const saved = localStorage.getItem('lumina_plugin_states');
            if (saved) {
                const states = JSON.parse(saved);
                Object.entries(states).forEach(([name, state]) => {
                    this.states.set(name, state);
                });
            }
        } catch (e) {
            console.warn('加载插件状态失败:', e);
        }
    },

    /**
     * 保存插件状态
     */
    savePluginStates() {
        try {
            const states = Object.fromEntries(this.states);
            localStorage.setItem('lumina_plugin_states', JSON.stringify(states));
        } catch (e) {
            console.warn('保存插件状态失败:', e);
        }
    },

    /**
     * 获取插件状态
     * @param {string} name - 插件名称
     */
    getPluginState(name) {
        return this.states.get(name) || { enabled: true };
    },

    /**
     * 设置插件状态
     * @param {string} name - 插件名称
     * @param {Object} state - 状态对象
     */
    setPluginState(name, state) {
        this.states.set(name, { ...this.getPluginState(name), ...state });
        this.savePluginStates();
    },

    /**
     * 启用/禁用插件
     * @param {string} name - 插件名称
     * @param {boolean} enabled - 是否启用
     */
    togglePlugin(name, enabled) {
        this.setPluginState(name, { enabled });
        // 需要重启应用才能生效
        return enabled;
    }
};

// 自动初始化
Lumina.PluginManager.init();
