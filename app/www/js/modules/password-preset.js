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
     * 旧版智能密码生成（文件名前三位 + 数字组合）
     * 用于非小雨林前缀的普通智能猜测
     */
    generateLegacySmartPasswords(fileName, length = 6) {
        const result = [];
        
        // 提取文件名前三位
        let cleanName = fileName
            .replace(/\.[^.]+$/, '')
            .replace(/[（(【\[][^）)】\]]+[）)】\]]/g, '')
            .trim();
        
        const prefixChars = cleanName.slice(0, 3).split('');
        let prefix = '';
        
        for (const char of prefixChars) {
            if (/[a-zA-Z0-9]/.test(char)) {
                prefix += char.toLowerCase();
            } else if (/[\u4e00-\u9fa5]/.test(char)) {
                prefix += this.getPinyinInitial(char);
            } else {
                continue;
            }
        }
        
        if (!prefix) prefix = 'xyl';
        
        // 生成数字组合
        const numLength = Math.max(0, length - prefix.length);
        if (numLength === 0) {
            result.push(prefix);
        } else {
            const commonNums = ['0', '00', '000', '1', '01', '001', '123', '888', '666', '520'];
            for (const num of commonNums) {
                if (num.length <= numLength) {
                    result.push(prefix + num.padStart(numLength, '0'));
                }
            }
            for (let i = 0; i < Math.pow(10, numLength); i++) {
                const num = i.toString().padStart(numLength, '0');
                result.push(prefix + num);
            }
        }
        
        return [...new Set(result)];
    },

    /**
     * 小雨林密码规则 - 生成作者名/文件名前三位
     * @param {string} name - 作者名或文件名
     * @param {number} maxLen - 最大长度（默认3）
     * @returns {string} - 处理后的三位字符
     */
    generateXiaoyulinSuffix(name, maxLen = 3) {
        let result = '';
        
        for (const char of name) {
            if (result.length >= maxLen) break;
            
            // 英文或数字：直接使用（小写）
            if (/[a-zA-Z0-9]/.test(char)) {
                result += char.toLowerCase();
            }
            // 中文：取拼音首字母
            else if (/[\u4e00-\u9fa5]/.test(char)) {
                result += this.getPinyinInitial(char);
            }
            // 标点符号：跳过不计
            else if (/[\p{P}\s]/u.test(char)) {
                continue;
            }
            // 日文或其他字符：用0代替
            else {
                result += '0';
            }
        }
        
        // 不足三位，结尾补0
        while (result.length < maxLen) {
            result += '0';
        }
        
        return result;
    },

    /**
     * 生成智能密码（小雨林规则）
     * @param {string} fileName - 文件名
     * @param {number} length - 密码长度（固定6位）
     * @returns {string[]} - 密码候选列表
     */
    generateSmartPasswords(fileName, length = 6) {
        const config = this.getConfig();
        
        console.log('[PasswordPreset] 生成小雨林密码 - 文件名:', fileName);
        
        // 判断是合集还是单篇
        const isCollection = /作品合集|合集/.test(fileName);
        console.log('[PasswordPreset] 类型:', isCollection ? '合集' : '单篇');
        
        // 清理文件名
        let cleanName = fileName
            .replace(/\.[^.]+$/, '')  // 去掉扩展名
            .replace(/[（(【\[][^）)】\]]+[）)】\]]/g, '')  // 去掉括号内容
            .replace(/作品合集/g, '')  // 去掉"作品合集"
            .trim();
        
        let suffix = '';
        
        if (isCollection) {
            // 合集：取作者名前三字符
            suffix = this.generateXiaoyulinSuffix(cleanName, 3);
        } else {
            // 单篇：取文件名前三字符
            suffix = this.generateXiaoyulinSuffix(cleanName, 3);
        }
        
        // 小雨林固定前缀 + 处理后缀
        const password = 'xyl' + suffix;
        console.log('[PasswordPreset] 生成的密码:', password);
        
        return [password];
    },

    /**
     * 生成完整密码候选列表
     * @param {string} fileName - 文件名
     * @returns {string[]} - 所有密码候选
     */
    generatePasswords(fileName) {
        const config = this.getConfig();
        const passwords = [];
        
        console.log('[PasswordPreset] ====== 生成密码列表 ======');
        console.log('[PasswordPreset] 配置:', JSON.stringify(config));
        
        // 优先级1：小雨林规则（固定前缀为 xyl）
        if (config.prefix === 'xyl') {
            console.log('[PasswordPreset] 使用小雨林规则 (xyl)');
            passwords.push(...this.generateSmartPasswords(fileName, config.length));
        }
        // 优先级2：其他固定前缀 + 数字组合
        else if (config.prefix) {
            console.log('[PasswordPreset] 使用固定前缀:', config.prefix);
            const numLength = Math.max(0, config.length - config.prefix.length);
            for (let i = 0; i < Math.pow(10, numLength); i++) {
                const num = i.toString().padStart(numLength, '0');
                passwords.push(config.prefix + num);
            }
        }
        // 优先级3：普通智能猜测（文件名前三位 + 数字）
        else if (config.smartGuess) {
            console.log('[PasswordPreset] 启用智能猜测（文件名前三位+数字）');
            // 旧逻辑：生成大量组合
            const smartPasswords = this.generateLegacySmartPasswords(fileName, config.length);
            passwords.push(...smartPasswords);
        }
        
        // 3. 常用密码（始终添加）
        if (config.commonPasswords) {
            const commonList = config.commonPasswords.split('|');
            console.log('[PasswordPreset] 常用密码:', commonList.length, '个');
            passwords.push(...commonList);
        }
        
        // 去重
        const uniquePasswords = [...new Set(passwords)];
        console.log('[PasswordPreset] 密码列表生成完成，共', uniquePasswords.length, '个唯一密码');
        if (uniquePasswords.length <= 10) {
            console.log('[PasswordPreset] 所有密码:', uniquePasswords);
        } else {
            console.log('[PasswordPreset] 前10个密码:', uniquePasswords.slice(0, 10));
        }
        return uniquePasswords;
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
        console.log('[PasswordPreset] ====== 开始尝试解密 ======');
        console.log('[PasswordPreset] 文件名:', fileName);
        console.log('[PasswordPreset] 预设是否启用:', config.enabled);
        
        if (!config.enabled) {
            console.log('[PasswordPreset] 密码预设未启用，跳过');
            return { success: false, error: '密码预设未启用' };
        }

        const passwords = this.generatePasswords(fileName);
        const attempts = passwords.slice(0, maxAttempts);
        console.log('[PasswordPreset] 实际尝试数量:', attempts.length, '(最多', maxAttempts, ')');
        
        let triedCount = 0;
        for (const password of attempts) {
            triedCount++;
            // 密码数量少时全部显示，多时只显示前5个和每10个
            if (attempts.length <= 5 || triedCount <= 3 || triedCount % 10 === 0) {
                console.log(`[PasswordPreset] 尝试第 ${triedCount}/${attempts.length} 个密码: "${password}"`);
            }
            try {
                const result = await Lumina.Crypto.tryDecryptPDF(arrayBuffer, password);
                if (result.success) {
                    console.log('[PasswordPreset] ✓ 成功破解密码:', password);
                    return { success: true, data: result.data, password };
                }
            } catch (e) {
                // 继续尝试
            }
        }
        
        console.log('[PasswordPreset] ✗ 所有密码尝试失败');
        return { success: false, error: `尝试了 ${attempts.length} 个密码均未成功` };
    }
};
