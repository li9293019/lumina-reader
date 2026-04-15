// ==================== APP 热更新管理器（第一阶段） ====================
// 职责：检查更新、下载更新、提示重启
// 仅在有 Capacitor 原生环境时生效

Lumina.UpdateManager = {
    // GitHub Release 上的 version.json 地址
    // 使用 latest/download 可自动跟随最新 Release
    REMOTE_VERSION_URL: 'https://github.com/li9293019/lumina-reader/releases/latest/download/version.json',

    // 状态缓存
    _state: {
        checking: false,
        downloading: false,
        hasReadyUpdate: false,
        remoteInfo: null
    },

    // 是否可用
    get isAvailable() {
        return typeof Capacitor !== 'undefined'
            && Capacitor.isNativePlatform?.()
            && Capacitor.Plugins?.AppUpdater;
    },

    /**
     * 获取当前本地版本
     */
    async getLocalVersion() {
        if (!this.isAvailable) {
            return { version: '0.0.0', build: '' };
        }
        try {
            const result = await Capacitor.Plugins.AppUpdater.getCurrentVersion();
            return result;
        } catch (e) {
            console.error('[UpdateManager] 获取本地版本失败:', e);
            return { version: '0.0.0', build: '' };
        }
    },

    /**
     * 检查是否有新版本
     * @returns {Promise<{hasUpdate: boolean, remote: object|null, local: object, error: string|null}>}
     */
    async check() {
        if (!this.isAvailable) {
            const hasCapacitor = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
            if (hasCapacitor && !Capacitor.Plugins?.AppUpdater) {
                return { hasUpdate: false, remote: null, local: null, error: 'plugin_not_ready' };
            }
            return { hasUpdate: false, remote: null, local: null, error: 'not_native' };
        }
        if (this._state.checking) {
            return { hasUpdate: false, remote: null, local: null, error: 'checking' };
        }

        this._state.checking = true;
        try {
            const local = await this.getLocalVersion();
            let remote;
            try {
                remote = await Capacitor.Plugins.AppUpdater.checkUpdate({
                    url: this.REMOTE_VERSION_URL
                });
            } catch (e) {
                const msg = e?.message || String(e);
                if (msg.includes("404") || msg.includes("HTTP 404") || msg.includes("Not Found")) {
                    return { hasUpdate: false, remote: null, local, error: 'not_found' };
                }
                console.warn('[UpdateManager] 检查更新失败:', msg);
                return { hasUpdate: false, remote: null, local, error: 'network' };
            }

            // 如果需要原生更新，直接返回特殊标记
            if (remote.requiresNativeUpdate) {
                return { hasUpdate: true, remote, local, error: 'requires_native' };
            }

            const cmp = this._compareVersion(remote.version, local.version);
            if (cmp > 0) {
                this._state.remoteInfo = remote;
                return { hasUpdate: true, remote, local, error: null };
            }

            return { hasUpdate: false, remote, local, error: null };
        } finally {
            this._state.checking = false;
        }
    },

    /**
     * 下载并应用更新
     */
    async download(remote) {
        if (!this.isAvailable) {
            return { success: false, error: 'not_native' };
        }
        if (this._state.downloading) {
            return { success: false, error: 'downloading' };
        }

        this._state.downloading = true;
        try {
            const result = await Capacitor.Plugins.AppUpdater.downloadUpdate({
                url: remote.updateUrl,
                sha256: remote.sha256 || ''
            });
            this._state.hasReadyUpdate = true;
            return { success: true, error: null };
        } catch (e) {
            console.error('[UpdateManager] 下载更新失败:', e);
            return { success: false, error: e.message || 'download_failed' };
        } finally {
            this._state.downloading = false;
        }
    },

    /**
     * 重启应用使更新生效
     */
    async restart() {
        if (!this.isAvailable) return;
        try {
            await Capacitor.Plugins.AppUpdater.restartApp();
        } catch (e) {
            console.error('[UpdateManager] 重启失败:', e);
        }
    },

    /**
     * 获取缓存的状态（用于 UI 恢复）
     */
    getState() {
        return { ...this._state };
    },

    // ==================== 私有方法 ====================

    _compareVersion(a, b) {
        const parse = (v) => String(v).split('.').map(n => parseInt(n, 10) || 0);
        const av = parse(a);
        const bv = parse(b);
        const len = Math.max(av.length, bv.length);
        for (let i = 0; i < len; i++) {
            const ai = av[i] || 0;
            const bi = bv[i] || 0;
            if (ai > bi) return 1;
            if (ai < bi) return -1;
        }
        return 0;
    }
};
