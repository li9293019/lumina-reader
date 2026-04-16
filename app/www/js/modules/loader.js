// ==================== 按需加载管理器 ====================
// 负责动态加载外部 JS/CSS 库，减少首屏负担

Lumina.Loader = {
    // 加载缓存：src -> Promise
    _scriptCache: new Map(),
    _cssCache: new Set(),

    /**
     * 动态加载 JavaScript 文件
     * @param {string} src - 脚本路径
     * @param {number} timeout - 超时毫秒（默认 15000）
     * @returns {Promise<void>}
     */
    loadScript(src, timeout = 15000) {
        if (this._scriptCache.has(src)) {
            return this._scriptCache.get(src);
        }

        const promise = new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;

            let timer = null;
            const cleanup = () => {
                if (timer) clearTimeout(timer);
                script.onerror = null;
                script.onload = null;
            };

            script.onload = () => {
                cleanup();
                resolve();
            };
            script.onerror = () => {
                cleanup();
                this._scriptCache.delete(src);
                reject(new Error(`Failed to load script: ${src}`));
            };

            timer = setTimeout(() => {
                cleanup();
                this._scriptCache.delete(src);
                // 尝试移除未完成的脚本标签
                if (script.parentNode) script.parentNode.removeChild(script);
                reject(new Error(`Timeout loading script: ${src}`));
            }, timeout);

            document.head.appendChild(script);
        });

        this._scriptCache.set(src, promise);
        return promise;
    },

    /**
     * 动态加载 CSS 文件
     * @param {string} href - 样式路径
     * @param {string} [id] - 可选 id，用于去重识别
     * @returns {Promise<void>}
     */
    loadCSS(href, id) {
        const key = id || href;
        if (this._cssCache.has(key)) return Promise.resolve();

        const existing = id ? document.getElementById(id) : document.querySelector(`link[href="${href}"]`);
        if (existing) {
            this._cssCache.add(key);
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            if (id) link.id = id;

            link.onload = () => {
                this._cssCache.add(key);
                resolve();
            };
            link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));

            document.head.appendChild(link);
        });
    },

    /**
     * 等待某个全局条件成立（例如库加载后初始化）
     * @param {Function} checkFn - 返回 boolean 的检查函数
     * @param {number} timeout - 超时毫秒（默认 2000）
     * @param {number} interval - 轮询间隔（默认 50）
     * @returns {Promise<void>}
     */
    waitFor(checkFn, timeout = 2000, interval = 50) {
        if (checkFn()) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timer = setInterval(() => {
                if (checkFn()) {
                    clearInterval(timer);
                    resolve();
                    return;
                }
                if (Date.now() - start > timeout) {
                    clearInterval(timer);
                    reject(new Error('waitFor timeout'));
                }
            }, interval);
        });
    },

    /**
     * 按名称加载库（高级封装，带缓存键）
     * @param {string} name - 缓存名称
     * @param {string} src - 脚本路径
     * @param {number} timeout - 超时毫秒
     * @returns {Promise<void>}
     */
    loadLibrary(name, src, timeout = 15000) {
        if (this._scriptCache.has(name)) {
            return this._scriptCache.get(name);
        }
        const promise = this.loadScript(src, timeout);
        this._scriptCache.set(name, promise);
        return promise;
    }
};
