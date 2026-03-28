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
    // 使用统一配置管理器
    getConfig() {
        const config = Lumina.ConfigManager.get('pdf.passwordPreset');
        return config || {
            enabled: false,
            smartGuess: true,
            length: 6,
            prefix: '',
            commonPasswords: ''
        };
    },

    saveConfig(config) {
        Lumina.ConfigManager.set('pdf.passwordPreset', config);
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
                const first = pinyinPro.pinyin(char, { 
                    toneType: 'none',
                    type: 'array'
                })[0];
                if (first) return first[0].toLowerCase();
            } catch (e) {}
        }
        return '0';
    },

    /**
     * 生成智能密码（文件名前三位 + 数字组合）
     * @param {string} fileName - 文件名
     * @param {number} length - 密码长度（含前缀）
     * @returns {string[]} - 密码候选列表
     */
    generateSmartPasswords(fileName, length = 6) {
        const config = this.getConfig();
        const result = [];
        
        // 提取文件名前三位（去除"作品合集"等后缀）
        let cleanName = fileName
            .replace(/\.[^.]+$/, '')
            .replace(/[（(【\[][^）)】\]]+[）)】\]]/g, '')
            .replace(/作品合集/g, '')
            .trim();
        
        // 取前三位
        const prefixChars = cleanName.slice(0, 3).split('');
        let prefix = '';
        
        for (const char of prefixChars) {
            if (/[a-zA-Z0-9]/.test(char)) {
                prefix += char.toLowerCase();
            } else if (/[\u4e00-\u9fa5]/.test(char)) {
                // 中文转拼音首字母
                prefix += this.getPinyinInitial(char);
            } else {
                // 标点符号等跳过
                continue;
            }
        }
        
        if (!prefix) prefix = 'xyl'; // 默认前缀（小雨林）
        
        // 生成数字组合
        const numLength = Math.max(0, length - prefix.length);
        if (numLength === 0) {
            result.push(prefix);
        } else {
            // 常见数字组合
            const commonNums = ['0', '00', '000', '1', '01', '001', '123', '888', '666', '520'];
            for (const num of commonNums) {
                if (num.length <= numLength) {
                    result.push(prefix + num.padStart(numLength, '0'));
                }
            }
            // 0-9 组合
            for (let i = 0; i < Math.pow(10, numLength); i++) {
                const num = i.toString().padStart(numLength, '0');
                result.push(prefix + num);
            }
        }
        
        return [...new Set(result)];
    },

    /**
     * 生成完整密码候选列表
     * @param {string} fileName - 文件名
     * @returns {string[]} - 所有密码候选
     */
    generatePasswords(fileName) {
        const config = this.getConfig();
        const passwords = [];
        
        // 1. 智能猜测（如果启用）
        if (config.smartGuess) {
            passwords.push(...this.generateSmartPasswords(fileName, config.length));
        }
        
        // 2. 固定前缀 + 数字
        if (config.prefix) {
            const numLength = Math.max(0, config.length - config.prefix.length);
            for (let i = 0; i < Math.pow(10, numLength); i++) {
                const num = i.toString().padStart(numLength, '0');
                passwords.push(config.prefix + num);
            }
        }
        
        // 3. 常用密码
        if (config.commonPasswords) {
            passwords.push(...config.commonPasswords.split('|'));
        }
        
        // 去重
        return [...new Set(passwords)];
    },

    /**
     * 尝试自动解密
     * @param {ArrayBuffer} arrayBuffer - PDF 文件数据
     * @param {string} fileName - 文件名
     * @param {number} maxAttempts - 最大尝试次数
     * @returns {Promise<{success: boolean, data?: ArrayBuffer, password?: string, error?: string}>}
     */
    async tryDecrypt(arrayBuffer, fileName, maxAttempts = 50) {
        const config = this.getConfig();
        if (!config.enabled) {
            return { success: false, error: '密码预设未启用' };
        }

        const passwords = this.generatePasswords(fileName);
        const attempts = passwords.slice(0, maxAttempts);
        
        for (const password of attempts) {
            try {
                const result = await Lumina.Crypto.tryDecryptPDF(arrayBuffer, password);
                if (result.success) {
                    console.log('[PasswordPreset] 成功破解密码:', password);
                    return { success: true, data: result.data, password };
                }
            } catch (e) {
                // 继续尝试
            }
        }
        
        return { success: false, error: `尝试了 ${attempts.length} 个密码均未成功` };
    }
};
