// ==================== 加密模块 - Lumina 专用格式 (.lmn) ====================

Lumina.Crypto = {
    // 魔数和版本
    MAGIC: new Uint8Array([0x4C, 0x4D, 0x4E, 0x41]), // "LMNA"
    VERSION: 0x01,
    
    // 默认设备密钥（无密码时使用）
    // 使用固定值确保 WEB 和 APP 导出的文件可以互相通用
    async getDefaultKey() {
        // 使用固定的默认密钥（不依赖设备信息）
        const defaultKeyString = 'LuminaReaderDefaultKey2024v2.0';
        const encoder = new TextEncoder();
        const data = encoder.encode(defaultKeyString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return new Uint8Array(hashBuffer);
    },
    
    // 从密码派生密钥
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );
        
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },
    
    // 加密数据并生成 .lmn 二进制文件
    async encrypt(data, password = null, onProgress = null) {
        const startTime = performance.now();
        
        // 1. 准备原始数据
        const jsonStr = JSON.stringify(data);
        const encoder = new TextEncoder();
        const plaintext = encoder.encode(jsonStr);
        
        if (onProgress) onProgress(10);
        
        // 2. 生成随机盐值和 IV
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        // 3. 获取密钥
        let key;
        if (password) {
            key = await this.deriveKey(password, salt);
        } else {
            // 无密码时使用默认密钥
            const defaultKeyBytes = await this.getDefaultKey();
            key = await crypto.subtle.importKey(
                'raw',
                defaultKeyBytes,
                'AES-GCM',
                false,
                ['encrypt', 'decrypt']
            );
        }
        
        if (onProgress) onProgress(30);
        
        // 4. 加密数据
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            plaintext
        );
        
        if (onProgress) onProgress(80);
        
        // 5. 组装二进制文件
        const header = new Uint8Array(38);
        header.set(this.MAGIC, 0);           // 魔数
        header[4] = this.VERSION;            // 版本
        header[5] = password ? 0x01 : 0x00;  // 标志位：是否使用密码
        header.set(salt, 6);                 // Salt
        header.set(iv, 22);                  // IV
        
        // 原始数据长度（4字节 uint32，小端序）
        const view = new DataView(header.buffer);
        view.setUint32(34, plaintext.length, true);
        
        // 合并所有部分
        const result = new Uint8Array(header.length + ciphertext.byteLength);
        result.set(header, 0);
        result.set(new Uint8Array(ciphertext), header.length);
        
        if (onProgress) onProgress(100);
        
        const duration = (performance.now() - startTime).toFixed(0);
        console.log(`[Crypto] 加密完成，耗时 ${duration}ms，原数据 ${plaintext.length} bytes`);
        
        return result.buffer;
    },
    
    // 解密 .lmn 文件
    async decrypt(arrayBuffer, password = null, onProgress = null) {
        const startTime = performance.now();
        // 确保 data 是 Uint8Array，并复制数据以避免 buffer 偏移问题
        const data = new Uint8Array(arrayBuffer);
        
        // 1. 检查魔数
        const magic = data.slice(0, 4);
        if (!this.arrayEquals(magic, this.MAGIC)) {
            throw new Error('无效的 .lmn 文件格式');
        }
        
        // 2. 解析头部
        const version = data[4];
        if (version !== this.VERSION) {
            throw new Error(`不支持的文件版本: ${version}`);
        }
        
        const flags = data[5];
        const hasPassword = (flags & 0x01) !== 0;
        
        // 3. 提取参数
        const salt = data.slice(6, 22);
        const iv = data.slice(22, 34);
        
        // 使用 data.buffer 创建 DataView，但要注意 byteOffset
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const ciphertext = data.slice(38);
        
        if (onProgress) onProgress(20);
        
        // 4. 获取密钥
        let key;
        if (hasPassword) {
            if (!password) {
                throw new Error('此文件需要密码才能打开');
            }
            key = await this.deriveKey(password, salt);
        } else {
            const defaultKeyBytes = await this.getDefaultKey();
            key = await crypto.subtle.importKey(
                'raw',
                defaultKeyBytes,
                'AES-GCM',
                false,
                ['encrypt', 'decrypt']
            );
        }
        
        if (onProgress) onProgress(50);
        
        // 5. 解密
        let plaintext;
        try {
            plaintext = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                ciphertext
            );
        } catch (e) {
            throw new Error('解密失败：密码错误或文件已损坏');
        }
        
        if (onProgress) onProgress(90);
        
        // 6. 解析 JSON
        const decoder = new TextDecoder();
        const jsonStr = decoder.decode(plaintext);
        const result = JSON.parse(jsonStr);
        
        if (onProgress) onProgress(100);
        
        return result;
    },
    
    // 辅助函数：比较两个 Uint8Array
    arrayEquals(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    },
    
    // 检测文件是否为 .lmn 格式
    isLmnFile(arrayBuffer) {
        if (arrayBuffer.byteLength < 4) return false;
        const view = new Uint8Array(arrayBuffer);
        return this.arrayEquals(view.slice(0, 4), this.MAGIC);
    }
};
