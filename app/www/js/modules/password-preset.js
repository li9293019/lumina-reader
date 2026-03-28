/**
 * PDF 密码预设器 - 智能密码自动尝试
 * 
 * 配置项：
 * - enabled: 是否启用
 * - smartGuess: 启用智能猜测（文件名+数字组合）
 * - length: 密码长度
 * - prefix: 固定前缀
 * - commonPasswords: 常用密码列表（|分隔）
 */

Lumina.PasswordPreset = {
    // 默认配置
    defaultConfig: {
        enabled: false,
        smartGuess: true,
        length: 6,
        prefix: '',
        commonPasswords: '123456|888888|000000|666666|111111|123123'
    },

    // 获取配置
    getConfig() {
        const saved = localStorage.getItem('luminaPdfPasswordPreset');
        if (saved) {
            try {
                return {...this.defaultConfig, ...JSON.parse(saved)};
            } catch (e) {
                console.error('[PasswordPreset] Failed to parse config:', e);
            }
        }
        return {...this.defaultConfig};
    },

    // 保存配置
    saveConfig(config) {
        localStorage.setItem('luminaPdfPasswordPreset', JSON.stringify(config));
    },

    /**
     * 获取字符的拼音首字母（使用 pinyin-pro）
     * @param {string} char - 单个字符
     * @returns {string} - 首字母或0
     */
    getPinyinInitial(char) {
        // 英文/数字：直接使用
        if (/[a-zA-Z]/.test(char)) return char.toLowerCase();
        if (/\d/.test(char)) return char;
        
        // 使用 pinyin-pro 获取拼音首字母
        if (typeof pinyinPro !== 'undefined') {
            try {
                // 获取拼音首字母
                const first = pinyinPro.pinyin(char, { 
                    toneType: 'none',
                    type: 'array'
                })[0];
                if (first) return first[0].toLowerCase();
            } catch (e) {
                // 失败则返回0
            }
        }
        
        // 无法识别的字符返回0
        return '0';
    },

    /**
     * 小雨林密码专用：从文件名提取后三位字符
     * 规则：6位密码 = xyl + 文件名前三位转换
     * - 英文/数字：直接使用
     * - 中文：取拼音首字母
     * - 标点符号：跳过
     * - 日文/其他：用0代替
     * - 不足三位：末尾补0
     * 注意：只有固定前缀为 xyl 时才适用此规则
     * @param {string} fileName - 文件名
     * @returns {string|null} - 6位密码，不适用时返回 null
     */
    generateXylPassword(fileName) {
        // 获取配置，检查固定前缀是否为 xyl
        const config = this.getConfig();
        if (config.prefix !== 'xyl') {
            return null;
        }
        
        // 移除扩展名
        let name = fileName.replace(/\.[^/.]+$/, '');
        
        // 移除"作品合集"字样
        name = name.replace(/作品合集/g, '');
        
        let result = '';
        
        for (let char of name) {
            // 跳过空白和标点符号
            if (/[\s\p{P}]/u.test(char)) continue;
            
            result += this.getPinyinInitial(char);
            
            // 取满3位就停止
            if (result.length >= 3) break;
        }
        
        // 不足3位，末尾补0
        while (result.length < 3) {
            result += '0';
        }
        
        // 返回固定前缀 xyl + 后三位
        return 'xyl' + result;
    },

    /**
     * 生成候选密码列表
     * 优先级：1.智能猜测 2.常用密码 3.纯数字组合
     * @param {string} fileName - 文件名
     * @returns {string[]} - 候选密码列表
     */
    generatePasswords(fileName) {
        // 从 settings 读取开关状态
        const enabled = Lumina.State?.settings?.pdfPasswordPreset;
        const smartGuess = Lumina.State?.settings?.pdfSmartGuess;
        
        if (!enabled) {
            return [];
        }

        const config = this.getConfig();
        const passwords = [];
        const prefix = config.prefix || '';
        const targetLength = config.length || 6;
        
        // 1. 智能猜测（最高优先级）- 小雨林专用模式
        if (smartGuess && fileName) {
            const xylPassword = this.generateXylPassword(fileName);
            // 只有当固定前缀为 xyl 时才添加小雨林密码
            if (xylPassword) passwords.push(xylPassword);
        }
        
        // 2. 常用密码
        if (config.commonPasswords) {
            config.commonPasswords.split('|').forEach(pwd => {
                pwd = pwd.trim();
                if (pwd && pwd.length >= 3 && pwd.length <= 20 && !passwords.includes(pwd)) {
                    passwords.push(pwd);
                }
            });
        }
        
        // 3. 纯数字组合（最低优先级）
        const numericPatterns = [
            '000000', '111111', '888888', '666666', '123456',
            '12345678', '1234567890', '987654', '147258', '258369'
        ];
        numericPatterns.forEach(pwd => {
            const sliced = pwd.slice(0, targetLength);
            if (!passwords.includes(sliced)) passwords.push(sliced);
        });
        
        return passwords;
    }
};
