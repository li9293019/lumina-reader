// ==================== 法律协议页面模块 ====================
// 首次启动协议确认 + 关于页面入口

Lumina.LegalPage = {
    currentTab: 'terms',      // 'terms' | 'privacy'
    currentLang: 'zh',        // 当前语言
    mode: 'first-run',        // 'first-run' | 'about-entry'
    
    // 初始化
    init() {
        this.bindEvents();
    },
    
    bindEvents() {
        // Tab 切换
        document.querySelectorAll('.legal-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const type = e.target.dataset.tab;
                this.switchTab(type);
            });
        });
        
        // 关闭按钮
        const closeBtn = document.getElementById('legalCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
        
        // 同意复选框
        const checkbox = document.getElementById('legalAgreeCheck');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                const btn = document.getElementById('legalAcceptBtn');
                if (btn) btn.disabled = !e.target.checked;
            });
        }
        
        // 开始使用按钮
        const acceptBtn = document.getElementById('legalAcceptBtn');
        if (acceptBtn) {
            acceptBtn.addEventListener('click', () => this.onAccept());
        }
        
        // 不同意按钮
        const declineBtn = document.getElementById('legalDeclineBtn');
        if (declineBtn) {
            declineBtn.addEventListener('click', () => this.onDecline());
        }
    },
    
    // 显示页面
    async show(mode = 'first-run', defaultTab = null) {
        this.mode = mode;
        
        // 重新获取当前语言（确保跟随应用设置）
        this.currentLang = this.getLegalLang();
        
        // 更新 Tab 文本（多语言）
        this.updateTabText();
        
        // 更新UI模式
        this.updateUIMode();
        
        // 加载指定tab或默认tab
        this.currentTab = defaultTab || 'terms';
        this.updateTabUI();
        await this.loadContent();
        
        // 显示页面
        const page = document.getElementById('legalPage');
        if (page) {
            page.style.display = 'flex';
            // APP端添加安全距离类
            if (this.isCapacitor()) {
                page.classList.add('app-safe-area');
            } else {
                page.classList.remove('app-safe-area');
            }
        }
    },
    
    // 隐藏页面
    hide() {
        const page = document.getElementById('legalPage');
        if (page) page.style.display = 'none';
    },
    
    // 检测是否为 Capacitor APP 环境
    isCapacitor() {
        return typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform?.();
    },
    
    // 更新 Tab 文本（多语言）
    updateTabText() {
        const t = Lumina.I18n?.t || ((k) => k);
        const tabs = document.querySelectorAll('.legal-tab');
        tabs.forEach(tab => {
            const type = tab.dataset.tab;
            if (type === 'terms') {
                tab.textContent = t('termsTab') || '用户协议';
            } else if (type === 'privacy') {
                tab.textContent = t('privacyTab') || '隐私政策';
            }
        });
    },
    
    // 根据当前i18n语言获取协议语言
    getLegalLang() {
        // 从 Settings 获取当前语言（这是实际生效的语言）
        const settingsLang = Lumina.State?.settings?.language || 'zh';
        console.log('[LegalPage] 当前语言设置:', settingsLang);
        
        // 映射到协议数据键
        // 繁体中文可能是 'zh-TW' 或 'zh1'（i18n模块中繁体的key）
        if (settingsLang === 'zh-TW' || settingsLang === 'zh-Hant' || settingsLang === 'zh1') {
            // console.log('[LegalPage] 使用繁体中文');
            return 'zh-Hant';
        }
        if (settingsLang === 'en') return 'en';
        return 'zh';
    },
    
    // 更新UI模式（首次启动 vs 关于入口）
    updateUIMode() {
        const footer = document.getElementById('legalFooter');
        const closeBtn = document.getElementById('legalCloseBtn');
        const t = Lumina.I18n?.t || ((k) => k);
        
        // 控制关闭按钮显示：首次启动隐藏，关于入口显示
        if (closeBtn) {
            closeBtn.style.display = this.mode === 'first-run' ? 'none' : 'flex';
        }
        
        if (!footer) return;
        
        if (this.mode === 'first-run') {
            footer.classList.add('first-run');
            footer.innerHTML = `
                <label class="legal-checkbox">
                    <input type="checkbox" id="legalAgreeCheck">
                    <span>${t('legalAgreeLabel') || '我已阅读并同意以上协议'}</span>
                </label>
                <button class="btn-secondary" id="legalDeclineBtn">${t('declineExit') || '不同意'}</button>
                <button class="btn-primary" id="legalAcceptBtn" disabled>${t('startUsing') || '同意并继续'}</button>
            `;
            // 重新绑定事件
            this.bindEvents();
        } else {
            footer.classList.remove('first-run');
            footer.innerHTML = `
                <button class="btn-primary" onclick="Lumina.LegalPage.hide()">${t('back') || '返回'}</button>
            `;
        }
    },
    
    // 切换Tab
    async switchTab(type) {
        if (this.currentTab === type) return;
        this.currentTab = type;
        this.updateTabUI();
        await this.loadContent();
    },
    
    // 更新Tab UI
    updateTabUI() {
        document.querySelectorAll('.legal-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === this.currentTab);
        });
    },
    
    // 加载内容 - 使用内嵌的 JS 数据（完全兼容 file:// 模式）
    async loadContent() {
        const container = document.getElementById('legalContent');
        if (!container) return;
        
        try {
            // 从内嵌的 LegalContent 模块获取内容
            const content = Lumina.LegalContent?.get(this.currentLang, this.currentTab);
            
            if (!content) {
                throw new Error('Content not found');
            }
            
            // 插入内容
            container.innerHTML = content;
            
            // 滚动到顶部
            container.scrollTop = 0;
            
        } catch (e) {
            console.error('[LegalPage] 加载失败:', e);
            const t = Lumina.I18n?.t || ((k) => k);
            container.innerHTML = `<div class="legal-error">${t('loadFailed') || '加载失败'}</div>`;
        }
    },
    
    // 同意协议
    onAccept() {
        Lumina.ConfigManager?.set('meta.hasAgreedToTerms_v1', true);
        this.hide();
        
        // 触发事件通知 init 继续
        window.dispatchEvent(new CustomEvent('legalTermsAccepted'));
    },
    
    // 不同意并退出
    onDecline() {
        // 调用原生退出（如果可用）
        if (typeof window.Capacitor !== 'undefined' && window.Capacitor.Plugins?.App) {
            window.Capacitor.Plugins.App.exitApp();
        } else {
            // Web 环境：显示提示
            const t = Lumina.I18n?.t || ((k) => k);
            alert(t('mustAgreeToUse') || '您需要同意协议才能使用本应用');
        }
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    Lumina.LegalPage.init();
});
