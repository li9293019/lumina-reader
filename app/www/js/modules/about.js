// ==================== 关于面板模块 ====================

Lumina.About = {
    // GitHub 用户名配置
    githubUsername: 'JLinMr', // 请修改为你的 GitHub 用户名
    
    // 赞助页面 URL
    get sponsorUrl() {
        return `https://${this.githubUsername}.github.io/lumina-reader/sponsor.html`;
    },
    
    // 初始化
    init() {
        this.bindEvents();
        this.renderVersion();
    },
    
    // 绑定事件
    bindEvents() {
        // 关闭按钮
        const closeBtn = document.getElementById('closeAbout');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        // 点击遮罩关闭
        const panel = document.getElementById('aboutPanel');
        if (panel) {
            panel.addEventListener('click', (e) => {
                if (e.target === panel) {
                    this.close();
                }
            });
        }
        
        // 所有外部链接添加 confirm
        document.querySelectorAll('.about-opensource a, .about-link-external').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const url = link.href;
                this.confirmExternalLink(url);
            });
        });
    },
    
    // 渲染版本信息
    renderVersion() {
        const versionEl = document.getElementById('aboutVersion');
        if (versionEl && Lumina.Config.version) {
            versionEl.textContent = `v${Lumina.Config.version.toString()}`;
        }
        
        // 渲染最后更新日期
        const updateEl = document.getElementById('aboutLastUpdate');
        if (updateEl && Lumina.Config.version?.build) {
            updateEl.textContent = Lumina.Config.version.build;
        }
    },
    
    // 打开面板
    open() {
        const panel = document.getElementById('aboutPanel');
        if (panel) {
            panel.classList.add('active');
        }
    },
    
    // 关闭面板
    close() {
        const panel = document.getElementById('aboutPanel');
        if (panel) {
            panel.classList.remove('active');
        }
    },
    
    // 外部链接确认
    confirmExternalLink(url) {
        const t = Lumina.I18n?.t || ((k) => k);
        const message = (t('externalLinkConfirm') || '将访问阅读器外地址，是否跳转？\n\n$1').replace('$1', url);
        
        Lumina.UI.showDialog(message, 'confirm', (result) => {
            if (result === true) {
                this.openExternal(url);
            }
        });
    },
    
    // 打开外部链接
    openExternal(url) {
        // APP 环境
        if (typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform?.()) {
            // 使用 InAppBrowser 或系统浏览器
            window.open(url, '_system');
        } else {
            // Web 环境
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    },
    
    // 打开赞助页面
    openSponsor() {
        this.confirmExternalLink(this.sponsorUrl);
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    Lumina.About.init();
});
