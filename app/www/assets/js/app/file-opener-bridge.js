// ==================== 文件打开桥接 ====================
// 处理 APP 端被动打开文件（高性能批量传输版）

window.Lumina = window.Lumina || {};

Lumina.FileOpener = {
    // 状态
    _state: {
        isReceiving: false,
        fileName: null,
        mimeType: null,
        chunks: null,
        receivedCount: 0,
        totalChunks: 0,
        totalBytes: 0,
        startTime: null
    },
    
    // 防重复加载：记录最后处理的文件
    _lastProcessedFile: {
        name: null,
        time: 0,
        size: 0
    },
    // 重复加载检测间隔（毫秒）
    _duplicateThreshold: 5000,
    
    /**
     * 快速传输开始
     */
    fastStart(fileName, mimeType, totalChunks, totalBytes) {
        console.log('[FileOpener] 快速传输开始:', fileName, totalChunks, '块', totalBytes, '字节');
        
        // 检查是否重复加载（多实例防护）
        const now = performance.now();
        if (this._lastProcessedFile.name === fileName && 
            this._lastProcessedFile.size === totalBytes &&
            (now - this._lastProcessedFile.time) < this._duplicateThreshold) {
            console.warn('[FileOpener] 检测到重复文件请求，忽略:', fileName);
            return;
        }
        
        // 如果已有传输在进行，先清理
        if (this._state.isReceiving) {
            console.warn('[FileOpener] 有新的传输，取消之前的');
            this._cleanup();
        }
        
        this._state = {
            isReceiving: true,
            fileName: fileName,
            mimeType: mimeType,
            chunks: new Array(totalChunks),
            receivedCount: 0,
            totalChunks: totalChunks,
            totalBytes: totalBytes,
            startTime: now
        };
        
        Lumina.UI?.showToast?.(Lumina.I18n?.t?.('fileReceiving', fileName) || ('Receiving: ' + file.name));
        Lumina.UI?.showLoading?.((Lumina.I18n?.t?.('fileReceiveProgress', 0) || 'Receiving... 0%'));
    },
    
    /**
     * 快速块接收 - 批量处理
     */
    fastChunk(chunkIndex, base64Data) {
        if (!this._state.isReceiving) {
            console.warn('[FileOpener] 收到块但未在接收状态');
            return;
        }
        
        try {
            // 解码
            const bytes = this._base64ToUint8Array(base64Data);
            this._state.chunks[chunkIndex] = bytes;
            this._state.receivedCount++;
            
            // 更新进度（每 10%）
            const progress = Math.round((this._state.receivedCount / this._state.totalChunks) * 100);
            if (progress % 10 === 0) {
                Lumina.UI?.showLoading?.(Lumina.I18n?.t?.('fileReceiveProgress', progress) || (`Receiving... ${progress}%`));
            }
            
        } catch (err) {
            console.error('[FileOpener] 解码块失败:', err);
        }
    },
    
    /**
     * 快速传输完成
     */
    async fastComplete(fileName, mimeType, totalBytes) {
        console.log('[FileOpener] 快速传输完成:', fileName);
        
        const state = this._state;
        if (!state.isReceiving) return;
        
        const transferTime = performance.now() - state.startTime;
        console.log(`[FileOpener] 传输耗时: ${(transferTime/1000).toFixed(2)}s, 速度: ${(totalBytes/1024/1024/(transferTime/1000)).toFixed(2)} MB/s`);
        
        Lumina.UI?.showLoading?.(Lumina.I18n?.t?.('fileAssembling') || 'Assembling...');
        
        try {
            // 合并块
            const merged = new Uint8Array(totalBytes);
            let offset = 0;
            
            for (let i = 0; i < state.totalChunks; i++) {
                const chunk = state.chunks[i];
                if (!chunk) {
                    throw new Error(`缺少块 ${i}`);
                }
                merged.set(chunk, offset);
                offset += chunk.length;
            }
            
            // 创建 File
            const file = new File([merged], fileName, {
                type: mimeType || 'application/octet-stream',
                lastModified: Date.now()
            });
            
            console.log('[FileOpener] File 创建成功:', file.size);
            this._cleanup();
            
            // 处理文件
            await this._processFile(file);
            
        } catch (err) {
            console.error('[FileOpener] 组装失败:', err);
            Lumina.UI?.showToast?.(Lumina.I18n?.t?.('fileProcessFailed', err.message) || ('Processing failed: ' + err.message));
            this._cleanup();
        }
    },
    
    /**
     * 快速传输错误
     */
    fastError(error) {
        console.error('[FileOpener] 传输错误:', error);
        Lumina.UI?.showToast?.(Lumina.I18n?.t?.('fileTransferFailed', error) || ('Transfer failed: ' + error));
        this._cleanup();
    },
    
    /**
     * 清理状态
     */
    _cleanup() {
        this._state = {
            isReceiving: false,
            fileName: null,
            mimeType: null,
            chunks: null,
            receivedCount: 0,
            totalChunks: 0,
            totalBytes: 0,
            startTime: null
        };
        Lumina.UI?.hideLoading?.();
    },
    
    /**
     * Base64 解码 - 优化版
     */
    _base64ToUint8Array(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        
        // 使用循环展开优化
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return bytes;
    },
    
    /**
     * 等待 Lumina 就绪
     */
    async _waitForLumina() {
        let waitCount = 0;
        while (!Lumina.Actions?.processFile && waitCount < 50) {
            await new Promise(r => setTimeout(r, 100));
            waitCount++;
        }
        if (!Lumina.Actions?.processFile) {
            throw new Error('应用未就绪');
        }
    },
    
    /**
     * 处理文件
     */
    async _processFile(file) {
        Lumina.UI?.showLoading?.(Lumina.I18n?.t?.('fileParsing') || 'Parsing...');
        
        try {
            await this._waitForLumina();
            await Lumina.Actions.processFile(file);
            
            // 记录成功处理的文件（用于重复检测）
            this._lastProcessedFile = {
                name: file.name,
                size: file.size,
                time: performance.now()
            };
            
            Lumina.UI?.hideLoading?.();
            Lumina.UI?.showToast?.(Lumina.I18n?.t?.('fileOpened', file.name) || ('Opened: ' + file.name));
            console.log('[FileOpener] 完成:', file.name);
        } catch (err) {
            Lumina.UI?.hideLoading?.();
            // 即使失败也重置记录，允许重试
            this._lastProcessedFile = { name: null, time: 0, size: 0 };
            throw err;
        }
    },
    
    // 兼容旧接口
    handleIncomingFile() { console.log('[FileOpener] 旧版调用'); },
    transferStart() {},
    receiveChunkSimple() {},
    transferComplete() {},
    transferError() {},
    
    tryInit() {
        console.log('[FileOpener] 高性能版已初始化');
        
        // 检查是否有从 Android 原生层接收的待处理文件
        if (window.pendingOpenUrl) {
            console.log('[FileOpener] 发现待处理文件:', window.pendingOpenUrl);
            const url = window.pendingOpenUrl;
            window.pendingOpenUrl = null;
            setTimeout(() => this.handleIncomingUrl(url), 100);
        }
    }
};

// ==================== 大文件分块读取器 ====================
// 解决 Capacitor Bridge OOM 问题，用于配置导入等场景

Lumina.LargeFileReader = {
    // Capacitor Plugin 引用
    _plugin: null,
    
    /**
     * 获取插件实例
     */
    _getPlugin() {
        if (!this._plugin) {
            this._plugin = Capacitor?.Plugins?.LargeFile;
        }
        return this._plugin;
    },
    
    /**
     * 检查是否可用
     */
    isAvailable() {
        return !!this._getPlugin();
    },
    
    /**
     * 获取文件信息
     * @param {string} path - 相对路径（如 'LuminaReader/config.json'）
     * @param {string} directory - 目录类型（默认 'DOCUMENTS'）
     * @returns {Promise<{fileSize: number, totalChunks: number, chunkSize: number}>}
     */
    async getFileInfo(path, directory = 'DOCUMENTS') {
        const plugin = this._getPlugin();
        if (!plugin) {
            throw new Error('LargeFile plugin not available');
        }
        
        const result = await plugin.getFileInfo({ path, directory });
        return {
            fileSize: result.fileSize,
            totalChunks: result.totalChunks,
            chunkSize: result.chunkSize,
            path: result.path
        };
    },
    
    /**
     * 读取整个文件（分块自动处理）
     * @param {string} path - 文件路径
     * @param {string} directory - 目录类型
     * @param {Function} onProgress - 进度回调 (currentBytes, totalBytes, percent)
     * @returns {Promise<Uint8Array>} 文件数据
     */
    async readFile(path, directory = 'DOCUMENTS', onProgress = null) {
        // 1. 获取文件信息
        const info = await this.getFileInfo(path, directory);
        console.log('[LargeFileReader] 读取文件:', path, '大小:', info.fileSize, '块数:', info.totalChunks);
        
        // 小文件（< 1MB）直接用标准API读取，更快
        if (info.fileSize < 1024 * 1024) {
            const { Filesystem } = Capacitor.Plugins;
            const result = await Filesystem.readFile({ path, directory });
            const data = typeof result.data === 'string' 
                ? new TextEncoder().encode(result.data)
                : new Uint8Array(result.data);
            if (onProgress) onProgress(info.fileSize, info.fileSize, 100);
            return data;
        }
        
        // 2. 分块读取
        const chunks = [];
        const batchSize = 10; // 每次读取10个块
        let currentChunk = 0;
        
        while (currentChunk < info.totalChunks) {
            const result = await this._getPlugin().readChunks({
                path,
                directory,
                startChunk: currentChunk,
                chunkCount: Math.min(batchSize, info.totalChunks - currentChunk)
            });
            
            // 解码并存储
            for (const chunk of result.chunks) {
                const bytes = this._base64ToUint8Array(chunk.data);
                chunks.push(bytes);
            }
            
            currentChunk += result.chunksRead;
            
            // 进度回调
            if (onProgress) {
                const currentBytes = chunks.reduce((sum, c) => sum + c.length, 0);
                const percent = Math.round((currentBytes / info.fileSize) * 100);
                onProgress(currentBytes, info.fileSize, percent);
            }
            
            // 让出时间片，避免阻塞UI
            if (result.hasMore) {
                await new Promise(r => setTimeout(r, 0));
            }
        }
        
        // 3. 合并所有块
        console.log('[LargeFileReader] 合并', chunks.length, '个块');
        const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
        const result = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        
        return result;
    },
    
    /**
     * 读取并解析JSON文件
     * @param {string} path - 文件路径
     * @param {string} directory - 目录类型
     * @param {Function} onProgress - 进度回调
     * @returns {Promise<Object>} 解析后的JSON对象
     */
    async readJsonFile(path, directory = 'DOCUMENTS', onProgress = null) {
        const data = await this.readFile(path, directory, onProgress);
        const text = new TextDecoder('utf-8').decode(data);
        return JSON.parse(text);
    },
    
    /**
     * Base64 解码
     */
    _base64ToUint8Array(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    },
    
    /**
     * 删除临时文件
     */
    async deleteFile(path, directory = 'DOCUMENTS') {
        const plugin = this._getPlugin();
        if (!plugin) return false;
        
        try {
            await plugin.deleteFile({ path, directory });
            return true;
        } catch (e) {
            console.warn('[LargeFileReader] 删除文件失败:', e);
            return false;
        }
    }
};

// 自动初始化（如果 Lumina 已就绪）
if (typeof Lumina !== 'undefined' && Lumina.State?.app?.dbReady) {
    Lumina.FileOpener.tryInit();
}
