// ==================== 关于面板模块 ====================

Lumina.About = {
    githubUsername: 'li9293019',

    get sponsorUrl() {
        return `https://${this.githubUsername}.github.io/lumina-reader/sponsor.html`;
    },

    _updateState: 'idle',
    _remoteInfo: null,
    _progressListener: null,
    _panelOpen: false,

    init() {
        this.bindEvents();
        this.renderVersion();
        this.initUpdateCheck();
        this.initUpdateDetailPanel();
    },

    bindEvents() {
        const closeBtn = document.getElementById('closeAbout');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        const panel = document.getElementById('aboutPanel');
        if (panel) {
            panel.addEventListener('click', (e) => {
                if (e.target === panel) {
                    this.close();
                }
            });
        }

        document.querySelectorAll('.about-opensource a, .about-link-external').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                Lumina.Utils.confirmExternalLink(link.href);
            });
        });
    },

    renderVersion() {
        const updateEl = document.getElementById('aboutLastUpdate');
        if (updateEl && Lumina.Config.version?.build) {
            updateEl.textContent = Lumina.Config.version.build;
        }
    },

    open() {
        const panel = document.getElementById('aboutPanel');
        if (panel) panel.classList.add('active');
    },

    close() {
        const panel = document.getElementById('aboutPanel');
        if (panel) panel.classList.remove('active');
    },

    confirmExternalLink(url) {
        Lumina.Utils.confirmExternalLink(url);
    },

    openExternal(url) {
        Lumina.Utils.openExternal(url);
    },

    openSponsor() {
        Lumina.Utils.confirmExternalLink(this.sponsorUrl);
    },

    // ==================== 更新检查 ====================

    initUpdateCheck() {
        const section = document.getElementById('aboutUpdateSection');
        if (!section) return;

        const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
        if (!isNative) {
            section.style.display = 'none';
            return;
        }
        section.style.display = 'block';

        const btn = document.getElementById('aboutUpdateBtn');
        if (btn) {
            btn.addEventListener('click', () => this.handleUpdateBtnClick());
        }

        this.renderUpdateVersion();

        const state = Lumina.UpdateManager.getState();
        if (state.hasReadyUpdate && state.remoteInfo) {
            this._remoteInfo = state.remoteInfo;
            this.setUpdateState('ready');
        }
    },

    initUpdateDetailPanel() {
        const panel = document.getElementById('updateDetailPanel');
        if (panel) {
            panel.addEventListener('click', (e) => {
                if (e.target === panel && panel._forceClose !== false) {
                    this.closeUpdateDetail();
                }
            });
        }

        const closeBtn = document.getElementById('updateDetailClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (closeBtn.disabled) return;
                this.closeUpdateDetail();
            });
        }

        const detailCancel = document.getElementById('updateDetailCancel');
        if (detailCancel) detailCancel.addEventListener('click', () => this.closeUpdateDetail());

        const detailConfirm = document.getElementById('updateDetailConfirm');
        if (detailConfirm) detailConfirm.addEventListener('click', () => this.startDownload());

        const progressBack = document.getElementById('updateProgressBack');
        if (progressBack) progressBack.addEventListener('click', () => this.switchPanelState('detail'));

        const readyRestart = document.getElementById('updateReadyRestart');
        if (readyRestart) readyRestart.addEventListener('click', () => this.handleRestart());
    },

    openUpdateDetail() {
        const panel = document.getElementById('updateDetailPanel');
        if (!panel) return;

        this._panelOpen = true;
        this.switchPanelState('detail');
        this.setPanelClosable(true);

        const t = Lumina.I18n?.t || ((k) => k);
        const remote = this._remoteInfo;

        document.getElementById('updateDetailCurrent').textContent = 'v' + (Lumina.Config.version?.toString?.() || '0.0.0');
        document.getElementById('updateDetailNew').textContent = 'v' + (remote?.version || '');
        document.getElementById('updateDetailChangelog').textContent = remote?.changelog || (t('noChangelog') || '暂无详细说明');

        panel.classList.add('active');
    },

    closeUpdateDetail() {
        const panel = document.getElementById('updateDetailPanel');
        if (panel) panel.classList.remove('active');
        this._panelOpen = false;
    },

    switchPanelState(state) {
        const detail = document.getElementById('updateStateDetail');
        const progress = document.getElementById('updateStateProgress');
        const ready = document.getElementById('updateStateReady');

        if (detail) detail.style.display = 'none';
        if (progress) progress.style.display = 'none';
        if (ready) ready.style.display = 'none';

        if (state === 'detail' && detail) detail.style.display = 'block';
        if (state === 'progress' && progress) progress.style.display = 'block';
        if (state === 'ready' && ready) ready.style.display = 'block';
    },

    handleUpdateBtnClick() {
        switch (this._updateState) {
            case 'idle':
            case 'uptodate':
            case 'error':
                this.handleCheckUpdate();
                break;
            case 'available':
                this.openUpdateDetail();
                break;
            case 'ready':
                this.handleRestart();
                break;
            case 'native_required':
                this.confirmNativeUpdate();
                break;
            default:
                break;
        }
    },

    confirmNativeUpdate() {
        const t = Lumina.I18n?.t || ((k) => k);
        const remote = this._remoteInfo;
        const version = remote?.version || '';
        const url = `https://github.com/${this.githubUsername}/lumina-reader/releases`;
        const message = (t('nativeUpdateConfirm') ||
            `检测到新版本 v${version} 需要重新下载安装包才能更新。\n\n` +
            `建议您在更新前通过「设置 → 数据管理 → 导出」功能备份书籍和配置数据，以防升级过程中数据丢失。\n\n` +
            `是否前往 GitHub Release 页面下载最新 APK？\n\n${url}`)
            .replace(/\$\{version\}/g, version)
            .replace(/\$\{url\}/g, url);
        Lumina.UI.showDialog(message, 'confirm', (result) => {
            if (result === true) Lumina.Utils.openExternal(url);
        });
    },

    async handleCheckUpdate() {
        this.setUpdateState('checking');
        const result = await Lumina.UpdateManager.check();

        if (result.error === 'not_native') {
            this.setUpdateState('idle');
            return;
        }
        if (result.error === 'plugin_not_ready') {
            this.setUpdateState('error', 'plugin_not_ready');
            return;
        }
        if (result.error === 'network') {
            this.setUpdateState('error', 'network');
            return;
        }
        if (result.error === 'not_found') {
            this.setUpdateState('error', 'not_found');
            return;
        }
        if (result.error === 'requires_native') {
            this._remoteInfo = result.remote;
            this.setUpdateState('native_required');
            return;
        }

        if (result.hasUpdate) {
            this._remoteInfo = result.remote;
            this.setUpdateState('available');
            this.openUpdateDetail();
        } else {
            this.setUpdateState('uptodate');
        }
    },

    async startDownload() {
        const remote = this._remoteInfo;
        if (!remote) return;

        this.switchPanelState('progress');
        this.setPanelClosable(false);

        // Reset progress UI
        const bar = document.getElementById('updateProgressBar');
        const percent = document.getElementById('updateProgressPercent');
        const errorEl = document.getElementById('updateProgressError');
        const actions = document.getElementById('updateProgressActions');
        if (bar) bar.style.width = '0%';
        if (percent) percent.textContent = '0%';
        if (errorEl) errorEl.textContent = '';
        if (actions) actions.style.display = 'none';

        const title = document.getElementById('updateProgressTitle');
        if (title) {
            const t = Lumina.I18n?.t || ((k) => k);
            title.textContent = (t('downloadingUpdate') || '正在下载更新') + ' v' + remote.version;
        }

        this.registerProgressListener();
        const result = await Lumina.UpdateManager.download(remote);
        this.unregisterProgressListener();

        if (result.success) {
            this.setPanelClosable(true);
            this.switchPanelState('ready');
            const readyVer = document.getElementById('updateReadyVersion');
            if (readyVer) readyVer.textContent = 'v' + remote.version;
            this.setUpdateState('ready');
        } else {
            this.setPanelClosable(true);
            if (this._panelOpen) {
                // 在进度界面原地显示错误，并提供返回按钮
                const t = Lumina.I18n?.t || ((k) => k);
                let errText = '';
                if (result.error === 'download_failed') errText = t('updateDownloadFailed') || '下载失败';
                else errText = (t('updateError') || '更新失败') + ': ' + String(result.error || t('updateUnknownError') || '出错了');
                if (errorEl) errorEl.textContent = errText;
                if (actions) actions.style.display = 'flex';
            } else {
                this.closeUpdateDetail();
                this.setUpdateState('error', result.error || 'download_failed');
            }
        }
    },

    handleRestart() {
        Lumina.UpdateManager.restart();
    },

    setPanelClosable(closable) {
        const panel = document.getElementById('updateDetailPanel');
        const closeBtn = document.getElementById('updateDetailClose');
        if (panel) {
            panel._forceClose = closable;
        }
        if (closeBtn) {
            closeBtn.disabled = !closable;
            closeBtn.style.opacity = closable ? '1' : '0.3';
        }
    },

    renderUpdateVersion() {
        const versionEl = document.getElementById('aboutUpdateVersion');
        if (versionEl && Lumina.Config.version) {
            versionEl.textContent = 'v' + Lumina.Config.version.toString();
        }
    },

    setUpdateState(state, detail) {
        this._updateState = state;
        const textEl = document.getElementById('aboutUpdateText');
        const btn = document.getElementById('aboutUpdateBtn');
        const label = btn?.querySelector('.update-btn-label');
        const progress = document.getElementById('aboutUpdateProgress');
        const t = Lumina.I18n?.t || ((k) => k);
        const remote = this._remoteInfo;

        if (progress) progress.style.width = '0%';
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('active');
        }

        switch (state) {
            case 'idle':
                if (textEl) {
                    textEl.innerHTML = `<span data-i18n="currentVersion">${t('currentVersion') || '版本'}</span>: <strong id="aboutUpdateVersion">v${Lumina.Config.version?.toString?.() || '0.0.0'}</strong>`;
                }
                if (label) label.textContent = t('checkUpdate') || '检查更新';
                break;
            case 'checking':
                if (textEl) textEl.innerHTML = `<span data-i18n="checkingUpdate">${t('checkingUpdate') || '正在检查更新'}</span>...`;
                if (label) label.textContent = t('checkUpdate') || '检查更新';
                if (btn) btn.disabled = true;
                break;
            case 'available':
                if (textEl) textEl.innerHTML = `<span style="color:var(--accent);">${t('newVersionAvailable') || '发现新版本'} v${remote?.version || ''}</span>`;
                if (label) label.textContent = t('viewUpdate') || '查看更新';
                if (btn) btn.classList.add('active');
                break;
            case 'downloading':
                if (textEl) textEl.innerHTML = `<span>${t('downloadingUpdate') || '正在下载更新'} v${remote?.version || ''}</span>`;
                if (label) label.textContent = '0%';
                if (btn) btn.disabled = true;
                break;
            case 'ready':
                if (textEl) textEl.innerHTML = `<span style="color:var(--accent);">${t('updateReady') || '更新就绪'} v${remote?.version || ''}</span>`;
                if (label) label.textContent = t('restartNow') || '重新启动';
                if (btn) btn.classList.add('active');
                break;
            case 'uptodate':
                if (textEl) textEl.innerHTML = `<span>${t('alreadyLatest') || '已是最新版本'}</span>`;
                if (label) label.textContent = t('checkUpdate') || '检查更新';
                break;
            case 'native_required':
                if (textEl) textEl.innerHTML = `<span style="color:var(--heart);">${t('nativeUpdateRequired') || '需要安装新版本'} v${remote?.version || ''}</span>`;
                if (label) label.textContent = t('goDownload') || '前往下载';
                if (btn) btn.classList.add('active');
                break;
            case 'error':
                let errText = '';
                if (detail === 'plugin_not_ready') errText = t('updatePluginNotReady') || '更新功能尚未就绪';
                else if (detail === 'network') errText = t('updateNetworkError') || '无法连接到更新服务器';
                else if (detail === 'not_found') errText = t('updateNotFound') || '暂无可用更新';
                else if (detail === 'download_failed') errText = t('updateDownloadFailed') || '下载失败';
                else errText = (t('updateError') || '更新失败') + ': ' + String(detail || t('updateUnknownError') || '出错了');
                if (textEl) textEl.innerHTML = `<span style="color:var(--text-tertiary);">${errText}</span>`;
                if (label) label.textContent = t('retry') || '重试';
                break;
        }
    },

    registerProgressListener() {
        this.unregisterProgressListener();
        if (!Lumina.UpdateManager.isAvailable) return;
        const plugin = Capacitor.Plugins.AppUpdater;
        this._progressListener = plugin.addListener('downloadProgress', (data) => {
            const pct = Math.max(0, Math.min(100, Math.round((data.progress / data.total) * 100)));
            const bar = document.getElementById('updateProgressBar');
            const percent = document.getElementById('updateProgressPercent');
            if (bar) bar.style.width = pct + '%';
            if (percent) percent.textContent = pct + '%';
        });
    },

    unregisterProgressListener() {
        if (this._progressListener) {
            try { this._progressListener.remove(); } catch (e) {}
            this._progressListener = null;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Lumina.About.init();
});
