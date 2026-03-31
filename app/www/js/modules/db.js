// ==================== 4. 存储层 ====================

Lumina.DB.StorageAdapter = class {
    constructor() { this.impl = null; }

    async use(type) {
        if (type === 'indexeddb') this.impl = new Lumina.DB.IndexedDBImpl();
        else if (type === 'sqlite') this.impl = new Lumina.DB.SQLiteImpl();
        else if (type === 'capacitor') this.impl = new Lumina.DB.CapacitorSQLiteImpl();
        else throw new Error(`Unknown storage type: ${type}`);
        return this.impl.init();
    }

    async getFileSmart(fileKey) {
        if (this.impl && this.impl.getFileSmart) {
            return this.impl.getFileSmart(fileKey);
        }
        // 降级到普通 getFile
        return this.impl.getFile(fileKey);
    }

    async saveFile(fileKey, data) { return this.impl.saveFile(fileKey, data); }
    async getFile(fileKey) { return this.impl.getFile(fileKey); }
    async getAllFiles() { return this.impl.getAllFiles(); }
    async deleteFile(fileKey) { return this.impl.deleteFile(fileKey); }
    async findByFileName(fileName) { return this.impl.findByFileName(fileName); }
    async overwriteFile(oldKey, newKey, newData, oldData) { return this.impl.overwriteFile(oldKey, newKey, newData, oldData); }
    generateFileKey(file) { return this.impl.generateFileKey(file); }
    async getStorageStats() { return this.impl.getStorageStats(); }
    async exportBatch() { return this.impl.exportBatch(); }
    async importBatch(books, onProgress) { return this.impl.importBatch(books, onProgress); }
    async updateCover(fileKey, coverDataUrl) { return this.impl.updateCover(fileKey, coverDataUrl); }
    async exportFile(fileKey) { return this.impl.exportFile(fileKey); }
};

// 获取本地时间字符串（格式：YYYY-MM-DD HH:mm:ss）
Lumina.DB.getLocalTimeString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
};

Lumina.DB.IndexedDBImpl = class {
    constructor() {
        this.db = null;
        this.DB_NAME = 'LuminaReaderDB';
        this.DB_VERSION = 2;
        this.MAX_FILES = 50;
        this.isReady = false;
    }

    async init() {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onerror = () => { this.isReady = false; resolve(false); };
            request.onsuccess = (event) => {
                this.db = event.target.result;
                if (!this.db.objectStoreNames.contains('fileData')) {
                    this.db.close();
                    const deleteReq = indexedDB.deleteDatabase(this.DB_NAME);
                    deleteReq.onsuccess = () => {
                        this.DB_VERSION = 1;
                        this.init().then(resolve);
                    };
                    deleteReq.onerror = () => { this.isReady = false; resolve(false); };
                    return;
                }
                this.isReady = true;
                resolve(true);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('fileData')) {
                    const store = db.createObjectStore('fileData', { keyPath: 'fileKey' });
                    store.createIndex('lastReadTime', 'lastReadTime', { unique: false });
                    store.createIndex('fileName', 'fileName', { unique: false });
                }
            };
        });
    }

    generateFileKey(file) {
        const name = file.name || file;
        const size = file.size || 0;
        const mtime = file.lastModified || 0;
        return `${name}_${size}_${mtime}`;
    }

    async saveFile(fileKey, data) {
        if (!this.isReady || !this.db) return false;
        try {
            // 获取现有记录，以保留 created_at（首次创建时间）
            const existingRecord = await this.getFile(fileKey);
            const createdAt = existingRecord?.created_at || data.created_at || Lumina.DB.getLocalTimeString();
            
            const transaction = this.db.transaction(['fileData'], 'readwrite');
            const store = transaction.objectStore('fileData');
            
            const record = {
                fileKey,
                fileName: data.fileName,
                fileType: data.fileType,
                fileSize: data.fileSize || 0,
                content: data.content,
                wordCount: data.wordCount,
                lastChapter: data.lastChapter || 0,
                lastScrollIndex: data.lastScrollIndex || 0,
                chapterTitle: data.chapterTitle || '',
                lastReadTime: data.lastReadTime || Lumina.DB.getLocalTimeString(),
                created_at: createdAt,  // 文件首次添加到库的时间（不变）
                customRegex: data.customRegex || { chapter: '', section: '' },
                chapterNumbering: data.chapterNumbering || 'none',
                annotations: data.annotations || [],
                cover: data.cover || null,
                heatMap: data.heatMap || null,
                metadata: data.metadata || null  // 书籍元数据（书名、作者、简介、标签等）
            };
            
            return new Promise((resolve) => {
                const request = store.put(record);
                request.onsuccess = () => {
                    resolve(true);
                };
                request.onerror = (e) => {
                    resolve(false);
                };
            });
        } catch (e) { 
            console.error('[IndexedDB] 异常:', e);
            return false; 
        }
    }

    async getFile(fileKey) {
        if (!this.isReady || !this.db) return null;
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['fileData'], 'readonly');
                const store = transaction.objectStore('fileData');
                const request = store.get(fileKey);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    }

    async getAllFiles() {
        if (!this.isReady || !this.db) return [];
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['fileData'], 'readonly');
                const store = transaction.objectStore('fileData');
                const index = store.index('lastReadTime');
                const request = index.openCursor(null, 'prev');
                const files = [];
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) { 
                        const file = cursor.value;
                        // 计算 estimatedSize = content长度 + cover长度（与后端一致）
                        const contentSize = JSON.stringify(file.content || []).length * 2;
                        const coverSize = file.cover ? file.cover.length * 0.75 : 0;
                        file.estimatedSize = Math.round(contentSize + coverSize);
                        files.push(file); 
                        cursor.continue(); 
                    }
                    else resolve(files);
                };
                request.onerror = () => resolve([]);
            } catch (e) { resolve([]); }
        });
    }

    async deleteFile(fileKey) {
        if (!this.isReady || !this.db) return false;
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['fileData'], 'readwrite');
                const store = transaction.objectStore('fileData');
                const request = store.delete(fileKey);
                request.onsuccess = () => resolve(true);
                request.onerror = () => resolve(false);
            } catch (e) { resolve(false); }
        });
    }

    async findByFileName(fileName) {
        if (!this.isReady || !this.db) return null;
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['fileData'], 'readonly');
                const store = transaction.objectStore('fileData');
                const index = store.index('fileName');
                const request = index.get(fileName);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    }

    async overwriteFile(oldKey, newKey, newData, oldData) {
        await this.deleteFile(oldKey);
        const mergedData = {
            ...newData,
            lastChapter: oldData.lastChapter || 0,
            lastScrollIndex: oldData.lastScrollIndex || 0,
            chapterTitle: oldData.chapterTitle || '',
            customRegex: oldData.customRegex || { chapter: '', section: '' },
            chapterNumbering: oldData.chapterNumbering || 'none',
            annotations: oldData.annotations || [],
            cover: newData.cover || oldData.cover || null,
            metadata: newData.metadata || oldData.metadata || null,
            lastReadTime: Lumina.DB.getLocalTimeString()
        };
        return this.saveFile(newKey, mergedData);
    }

    async cleanupOldFiles(keepCount) {
        try {
            const files = await this.getAllFiles();
            if (files.length <= keepCount) return;
            const toDelete = files.slice(keepCount);
            for (const file of toDelete) await this.deleteFile(file.fileKey);
        } catch (e) { }
    }

    async getStorageStats() {
        const files = await this.getAllFiles();
        let totalSize = 0, imageCount = 0;
        files.forEach(file => {
            // estimatedSize 已在 getAllFiles 中计算好
            totalSize += file.estimatedSize || 0;
            if (file.cover) imageCount++;
        });
        return { files, totalFiles: files.length, totalSize: totalSize, imageCount, maxFiles: this.MAX_FILES };
    }

    async exportBatch() {
        const files = await this.getAllFiles();
        if (!files.length) return null;
        const books = files.map(file => ({
            fileKey: file.fileKey, 
            fileName: file.fileName, 
            fileType: file.fileType,
            fileSize: file.fileSize, 
            wordCount: file.wordCount, 
            content: file.content,
            cover: file.cover || null, 
            customRegex: file.customRegex || { chapter: '', section: '' },
            chapterNumbering: file.chapterNumbering || 'none',
            annotations: file.annotations || [],
            heatMap: file.heatMap || null,  // 导出热力图数据
            lastChapter: file.lastChapter || 0, 
            lastScrollIndex: file.lastScrollIndex || 0,
            chapterTitle: file.chapterTitle || '',
            lastReadTime: file.lastReadTime
        }));
        return {
            version: this.DB_VERSION, 
            exportType: 'batch', 
            exportDate: Lumina.DB.getLocalTimeString(),
            appName: 'Lumina Reader', 
            books, 
            totalBooks: books.length, 
            totalSize: '0MB'
        };
    }

    async importBatch(books, onProgress) {
        const results = { success: 0, failed: 0, errors: [] };
        for (let i = 0; i < books.length; i++) {
            const book = books[i];
            try {
                if (!book.fileName || !Array.isArray(book.content)) throw new Error('Invalid book data');
                const newKey = `${book.fileName}_${Date.now()}_${i}`;
                await this.cleanupOldFiles(this.MAX_FILES - (books.length - i) - 1);
                await this.saveFile(newKey, {
                    fileName: book.fileName, fileType: book.fileType || 'txt', fileSize: book.fileSize || 0,
                    content: book.content, wordCount: book.wordCount || 0, cover: book.cover || null,
                    customRegex: book.customRegex || { chapter: '', section: '' },
                    chapterNumbering: book.chapterNumbering || 'none',
                    annotations: book.annotations || [],
                    heatMap: book.heatMap || null,
                    lastChapter: book.lastChapter || 0, chapterTitle: book.chapterTitle || '',
                    lastScrollIndex: book.lastScrollIndex || 0,
                    lastReadTime: book.lastReadTime || Lumina.DB.getLocalTimeString(),
                    created_at: book.created_at || book.lastReadTime || Lumina.DB.getLocalTimeString()
                });
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push({ book: book.fileName, error: err.message });
            }
            if (onProgress) onProgress(i + 1, books.length, results.success);
        }
        return results;
    }

    async updateCover(fileKey, coverDataUrl) {
        const fileData = await this.getFile(fileKey);
        if (fileData) {
            fileData.cover = coverDataUrl;
            return this.saveFile(fileKey, fileData);
        }
        return false;
    }

    async exportFile(fileKey) {
        const file = await this.getFile(fileKey);
        if (!file) return null;
        return {
            version: this.DB_VERSION, 
            exportType: 'single', 
            exportDate: Lumina.DB.getLocalTimeString(),
            appName: 'Lumina Reader', 
            fileName: file.fileName, 
            fileType: file.fileType,
            content: file.content, 
            wordCount: file.wordCount, 
            cover: file.cover || null,
            customRegex: file.customRegex,
            chapterNumbering: file.chapterNumbering || 'none',
            annotations: file.annotations || [],
            heatMap: file.heatMap || null,
            lastChapter: file.lastChapter || 0,
            lastScrollIndex: file.lastScrollIndex || 0,
            chapterTitle: file.chapterTitle || '',
            lastReadTime: file.lastReadTime,
            created_at: file.created_at || file.lastReadTime  // 使用创建时间，兼容旧数据
        };
    }
};

// ========== Capacitor SQLite 实现（原生APP模式）==========
Lumina.DB.CapacitorSQLiteImpl = class {
    constructor() {
        this.isReady = false;
        this.dbBridge = null;
        this.cache = new Map();
        this.listCache = null;
        this.listTimestamp = 0;
        this.CACHE_VALID_MS = 30000;
        this.isRefreshing = false;
    }

    async init() {
        try {
            // 动态导入 db-bridge
            const module = await import('./assets/js/db-bridge.js');
            this.dbBridge = module.dbBridge;
            
            // 等待桥接初始化
            if (!this.dbBridge.initialized) {
                await this.dbBridge.init();
            }
            
            this.isReady = true;
            this.backgroundRefresh();
            return true;
        } catch (e) {
            console.error('[CapacitorSQLite] 初始化失败:', e);
            this.isReady = false;
            return false;
        }
    }

    generateFileKey(file) {
        const name = file.name || file;
        const size = file.size || 0;
        const mtime = file.lastModified || 0;
        return `${name}_${size}_${mtime}`;
    }

    async getStorageStats(forceRefresh = false) {
        const now = Date.now();
        
        if (!forceRefresh && this.listCache && (now - this.listTimestamp < this.CACHE_VALID_MS)) {
            if (!this.isRefreshing) {
                this.backgroundRefresh();
            }
            return this.listCache;
        }
        
        try {
            const fresh = await this.fetchFromDB();
            this.listCache = fresh;
            this.listTimestamp = now;
            return fresh;
        } catch (error) {
            if (this.listCache) {
                return {...this.listCache, _stale: true};
            }
            throw error;
        }
    }

    async backgroundRefresh() {
        if (this.isRefreshing) return;
        this.isRefreshing = true;
        
        try {
            const fresh = await this.fetchFromDB();
            const oldCount = this.listCache?.totalFiles || 0;
            const newCount = fresh.totalFiles;
            
            this.listCache = fresh;
            this.listTimestamp = Date.now();
            
            if (document.getElementById('dataManagerPanel')?.classList.contains('active')) {
                if (newCount !== oldCount || JSON.stringify(fresh.files) !== JSON.stringify(this.listCache?.files)) {
                    if (Lumina.DataManager) {
                        Lumina.DataManager.updateGridSilently(fresh);
                    }
                }
            }
        } catch (e) {
            // 静默失败
        } finally {
            this.isRefreshing = false;
        }
    }

    async fetchFromDB() {
        const [files, stats] = await Promise.all([
            this.dbBridge.getList(),
            this.dbBridge.getStats()
        ]);
        
        // 重新计算 estimatedSize = content长度 + cover长度
        files.forEach(file => {
            const contentSize = JSON.stringify(file.content || []).length * 2;
            const coverSize = file.cover ? file.cover.length * 0.75 : 0;
            file.estimatedSize = Math.round(contentSize + coverSize);
        });
        
        return {
            files,
            totalFiles: stats.totalFiles,
            totalSize: stats.totalSize, // 保持为数字
            imageCount: 0,
            maxFiles: '∞'
        };
    }

    async getFile(fileKey) {
        if (this.cache.has(fileKey)) {
            return this.cache.get(fileKey);
        }
        
        try {
            const result = await this.dbBridge.get(fileKey);
            if (result) {
                this.cache.set(fileKey, result);
            }
            return result;
        } catch (error) {
            console.error(`[CapacitorSQLite] 获取文件失败 ${fileKey}:`, error);
            throw error;
        }
    }

    async getFileSmart(fileKey) {
        // App 端直接从原生 SQLite 读取，无需二级缓存
        return await this.getFile(fileKey);
    }

    async saveFile(fileKey, data) {
        try {
            const existing = this.cache.get(fileKey) || {};
            
            const mergedAnnotations = (data.annotations === undefined || 
                (Array.isArray(data.annotations) && data.annotations.length === 0 && existing.annotations?.length > 0))
                ? existing.annotations 
                : data.annotations;
            
            let mergedHeatMap;
            if (data.heatMap === undefined && existing.heatMap) {
                mergedHeatMap = existing.heatMap;
            } else if (data.heatMap === undefined) {
                mergedHeatMap = null;
            } else {
                mergedHeatMap = data.heatMap;
            }
            
            // 合并 metadata（如果 data.metadata 未设置但 existing 有，保留 existing）
            let mergedMetadata;
            if (data.metadata === undefined && existing.metadata) {
                mergedMetadata = existing.metadata;
            } else if (data.metadata === undefined) {
                mergedMetadata = null;
            } else {
                mergedMetadata = data.metadata;
            }
            
            const mergedData = {
                ...existing,
                ...data,
                annotations: mergedAnnotations,
                heatMap: mergedHeatMap,
                metadata: mergedMetadata,
                fileKey
            };
            
            const result = await this.dbBridge.save(fileKey, mergedData);
            
            if (result.success) {
                this.cache.set(fileKey, mergedData);
                this.listTimestamp = 0;
                setTimeout(() => this.backgroundRefresh(), 500);
            }
            return result.success;
        } catch (error) {
            console.error('[CapacitorSQLite] saveFile 失败:', error);
            return false;
        }
    }

    async deleteFile(fileKey) {
        try {
            const result = await this.dbBridge.delete(fileKey);
            if (result.success) {
                this.cache.delete(fileKey);
                this.listCache = null;  // 彻底清除列表缓存
                this.listTimestamp = 0;
            }
            return result;
        } catch (error) {
            console.error('[CapacitorSQLite] deleteFile 失败:', error);
            return { success: false };
        }
    }

    async getAllFiles() {
        const stats = await this.getStorageStats();
        return stats.files;
    }

    async findByFileName(fileName) {
        const files = await this.getAllFiles();
        return files.find(f => f.fileName === fileName) || null;
    }

    async overwriteFile(oldKey, newKey, newData, oldData) {
        await this.deleteFile(oldKey);
        const mergedData = {
            ...newData,
            lastChapter: oldData.lastChapter || 0,
            lastScrollIndex: oldData.lastScrollIndex || 0,
            chapterTitle: oldData.chapterTitle || '',
            customRegex: oldData.customRegex || {chapter: '', section: ''},
            chapterNumbering: oldData.chapterNumbering || 'none',
            annotations: oldData.annotations || [],
            cover: newData.cover || oldData.cover || null,
            lastReadTime: Lumina.DB.getLocalTimeString()
        };
        return this.saveFile(newKey, mergedData);
    }

    async exportBatch() {
        const files = await this.getAllFiles();
        if (!files.length) return null;
        
        const books = [];
        for (const file of files) {
            const fullData = await this.getFile(file.fileKey);
            if (fullData) books.push(fullData);
        }
        
        return {
            version: 2,
            exportType: 'batch',
            exportDate: Lumina.DB.getLocalTimeString(),
            appName: 'Lumina Reader',
            books,
            totalBooks: books.length
        };
    }

    async importBatch(books, onProgress) {
        const results = {success: 0, failed: 0, errors: []};
        for (let i = 0; i < books.length; i++) {
            const book = books[i];
            try {
                if (!book.fileName || !Array.isArray(book.content)) {
                    throw new Error('Invalid book data');
                }
                const newKey = `${book.fileName}_${Date.now()}_${i}`;
                await this.saveFile(newKey, {
                    fileName: book.fileName,
                    fileType: book.fileType || 'txt',
                    fileSize: book.fileSize || 0,
                    content: book.content,
                    wordCount: book.wordCount || 0,
                    lastChapter: book.lastChapter || 0,
                    lastScrollIndex: book.lastScrollIndex || 0,
                    chapterTitle: book.chapterTitle || '',
                    customRegex: book.customRegex || {},
                    chapterNumbering: book.chapterNumbering || 'none',
                    annotations: book.annotations || [],
                    cover: book.cover || null,
                    heatMap: book.heatMap || null,
                    lastReadTime: Lumina.DB.getLocalTimeString(),
                    created_at: book.created_at || book.lastReadTime || Lumina.DB.getLocalTimeString()
                });
                results.success++;
                if (onProgress) onProgress(i + 1, books.length, true);
            } catch (e) {
                results.failed++;
                results.errors.push(`${book.fileName}: ${e.message}`);
                if (onProgress) onProgress(i + 1, books.length, false);
            }
        }
        return results;
    }

    async exportFile(fileKey) {
        const file = await this.getFile(fileKey);
        if (!file) return null;
        return {
            version: 2,
            exportType: 'single',
            exportDate: Lumina.DB.getLocalTimeString(),
            appName: 'Lumina Reader',
            fileName: file.fileName,
            fileType: file.fileType,
            content: file.content,
            wordCount: file.wordCount,
            cover: file.cover || null,
            customRegex: file.customRegex,
            chapterNumbering: file.chapterNumbering || 'none',
            annotations: file.annotations || [],
            heatMap: file.heatMap || null,
            lastChapter: file.lastChapter || 0,
            lastScrollIndex: file.lastScrollIndex || 0,
            chapterTitle: file.chapterTitle || '',
            lastReadTime: file.lastReadTime,
            created_at: file.created_at || file.lastReadTime
        };
    }
};

// ========== Web SQLite 实现（HTTP 模式，含 Content 缓存）==========
// 优化策略：
// 1. 书库列表（getStorageStats）不走缓存，每次实时获取（数据量小，保证准确）
// 2. 文件内容（getFile）优先查本地 IndexedDB 缓存，加速二次打开
// 3. 提供缓存管理接口，用户可查看和清理
Lumina.DB.SQLiteImpl = class {
    constructor() {
        this.baseUrl = 'http://localhost:8080/api';
        this.isReady = false;
        
        // 内存缓存（仅当前会话）
        this.cache = new Map();
        
        // 本地 IndexedDB 缓存（用于 content 持久化）
        this.localCache = null; 
        this.localCacheReady = false;
        
        // 错误计数
        this.errorCount = 0;
        this.MAX_ERRORS = 3;
        
        // 缓存配置
        this.MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB 上限
        this.CACHE_KEY_PREFIX = 'lumina_web_cache_'; // 区分于 App 的缓存
    }

    async init() {
        try {
            const response = await fetch(`${this.baseUrl}/health`, { 
                method: 'GET', 
                signal: AbortSignal.timeout(1500) 
            });
            this.isReady = response.ok;
            
            // 初始化本地 IndexedDB 缓存（独立实例，避免污染 App 数据）
            if (this.isReady) {
                this.localCache = new Lumina.DB.WebCacheIndexedDBImpl();
                this.localCacheReady = await this.localCache.init();
            }
            return this.isReady;
        } catch (e) { 
            return false; 
        }
    }

    async _fetch(endpoint, options = {}, timeoutMs = 5000) {
        const url = `${this.baseUrl}${endpoint}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        
        try {
            const response = await fetch(url, {
                ...options,
                headers: { 'Content-Type': 'application/json', ...options.headers },
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.errorCount++;
            }
            throw error;
        }
    }

    generateFileKey(file) {
        const name = file.name || file;
        const size = file.size || 0;
        const mtime = file.lastModified || 0;
        return `${name}_${size}_${mtime}`;
    }

    // ========== 核心优化：智能获取（先本地后远程） ==========
    async getFileSmart(fileKey) {
        // 1. 先查本地 IndexedDB（秒开）
        if (this.localCacheReady) {
            try {
                const local = await this.localCache.getFile(fileKey);
                if (local) {
                    const hasContent = local.content && Array.isArray(local.content) && local.content.length > 0;
                    const hasFileName = local.fileName && local.fileName.length > 0;
                    
                    if (hasContent && hasFileName) {
                        // 本地缓存有效，直接返回（双写机制已保证一致性）
                        return local;
                    }
                }
            } catch (e) {
                console.error('[getFileSmart] 本地缓存读取失败:', e);
            }
        }
        
        // 2. 本地没有，从服务器加载
        Lumina.UI.showToast('首次加载中...', 0);
        
        const remote = await this.getFile(fileKey);
        
        // 3. 保存到本地缓存（比较数据新旧）
        if (remote && this.localCacheReady) {
            console.log('[SQLite] 准备保存到本地缓存...');
            
            // 延迟保存，避免与 saveFile 冲突
            setTimeout(async () => {
                try {
                    // 检查是否已存在，并比较数据新旧
                    const exists = await this.localCache.getFile(fileKey);
                    let shouldSave = true;
                    
                    if (exists) {
                        // 比较更新时间，远程数据更新才保存
                        const localTime = new Date(exists.lastReadTime || 0);
                        const remoteTime = new Date(remote.lastReadTime || 0);
                        
                        // 检查热力图是否需要更新
                        let heatMapNeedsUpdate = false;
                        if (remote.heatMap && !exists.heatMap) {
                            heatMapNeedsUpdate = true;
                        } else if (remote.heatMap && exists.heatMap) {
                            const remoteHeatTime = remote.heatMap.updatedAt || 0;
                            const localHeatTime = exists.heatMap.updatedAt || 0;
                            heatMapNeedsUpdate = remoteHeatTime > localHeatTime;
                        }
                        
                        // 如果远程数据不更新且热力图也不需要更新，则跳过
                        if (remoteTime <= localTime && !heatMapNeedsUpdate) {
                            console.log('[SQLite] 本地缓存已是最新，跳过保存');
                            shouldSave = false;
                        } else {
                            console.log('[SQLite] 远程数据更新，需要同步到本地缓存:', {
                                timeUpdated: remoteTime > localTime,
                                heatMapUpdated: heatMapNeedsUpdate
                            });
                        }
                    }
                    
                    if (shouldSave) {
                        await this.localCache.saveFile(fileKey, remote);
                    }
                } catch (e) {
                    console.error('[SQLite] 缓存保存错误:', e);
                }
            }, 500); // 延迟500ms，确保 saveFile 先完成
        }
        
        return remote;
    }

    // 获取书库列表 - 直接走 HTTP，不缓存（保证数据准确）
    async getStorageStats() {
        try {
            const fresh = await this.fetchFromServer();
            this.errorCount = 0;
            return fresh;
        } catch (error) {
            this.errorCount++;
            throw error;
        }
    }

    async fetchFromServer() {
        const results = await this._fetch('/batch', {
            method: 'POST',
            body: JSON.stringify({
                requests: [{method: 'getList'}, {method: 'getStats'}]
            })
        });
        
        const files = results[0];
        const stats = results[1];
        
        // 直接使用后端计算好的 fileSize（因为 getList 不返回 content 字段，前端无法重新计算）
        files.forEach(file => {
            file.estimatedSize = file.fileSize || 0;
        });
        
        return {
            files,
            totalFiles: stats.totalFiles,
            totalSize: stats.totalSize, // 保持为数字
            imageCount: 0,
            maxFiles: '∞'
        };
    }

    async getFile(fileKey) {
        if (this.cache.has(fileKey)) {
            return this.cache.get(fileKey);
        }
        
        try {
            const result = await this._fetch(
                `/file/${encodeURIComponent(fileKey)}`, 
                {}, 
                60000  // 大文件60秒超时
            );
            
            if (result) {
                this.cache.set(fileKey, result);
                this.errorCount = 0;
            }
            return result;
        } catch (error) {
            console.error(`[SQLite] 获取文件失败 ${fileKey}:`, error);
            throw error;
        }
    }

    async saveFile(fileKey, data) {            
        try {
            // 关键修复：合并数据而不是完全替换，避免丢失 annotations 和 heatMap
            const existing = this.cache.get(fileKey) || {};
            
            // 特殊处理 annotations：如果 data.annotations 是空数组但 existing 有数据，保留 existing
            const mergedAnnotations = (data.annotations === undefined || 
                (Array.isArray(data.annotations) && data.annotations.length === 0 && existing.annotations?.length > 0))
                ? existing.annotations 
                : data.annotations;
            
            // 特殊处理 heatMap：如果 data.heatMap 为 undefined（未设置）但 existing 有数据，保留 existing
            // 注意：如果明确设置为 null，则允许删除
            // 如果两者都是 undefined，则显式设置为 null，避免 JSON 序列化时忽略该字段
            let mergedHeatMap;
            if (data.heatMap === undefined && existing.heatMap) {
                mergedHeatMap = existing.heatMap;
            } else if (data.heatMap === undefined) {
                mergedHeatMap = null;  // 显式设置为 null，不是 undefined
            } else {
                mergedHeatMap = data.heatMap;
            }
            
            // 特殊处理 metadata：如果 data.metadata 为 undefined（未设置）但 existing 有数据，保留 existing
            let mergedMetadata;
            if (data.metadata === undefined && existing.metadata) {
                mergedMetadata = existing.metadata;
            } else if (data.metadata === undefined) {
                mergedMetadata = null;
            } else {
                mergedMetadata = data.metadata;
            }
            
            const mergedData = {
                ...existing,
                ...data,
                annotations: mergedAnnotations,
                heatMap: mergedHeatMap,
                metadata: mergedMetadata,
                fileKey
            };
            
            // 关键修复：将 undefined 转换为 null，否则 JSON.stringify 会忽略该字段
            const dataToSend = JSON.parse(JSON.stringify(mergedData, (key, value) => 
                value === undefined ? null : value
            ));
            
            // 先保存到远程 SQLite
            const result = await this._fetch(
                '/save',
                {
                    method: 'POST',
                    body: JSON.stringify({fileKey, data: dataToSend})
                },
                5000
            );
            
            if (result && result.success) {
                // 更新内存缓存（使用合并后的数据）
                this.cache.set(fileKey, mergedData);
                this.errorCount = 0;
                
                // 同步更新本地缓存（content缓存）
                if (this.localCacheReady) {
                    try {
                        await this.localCache.saveFile(fileKey, mergedData);
                    } catch (e) {
                        console.warn('[SQLite] 本地缓存更新失败:', e);
                    }
                }
            }
            return result && result.success;
        } catch (error) {
            console.log('[SQLite] saveFile 失败:', error);
            return false;
        }
    }

    async deleteFile(fileKey) {
        const result = await this._fetch(
            `/file/${encodeURIComponent(fileKey)}`, 
            {method: 'DELETE'}
        );
        
        if (result) {
            this.cache.delete(fileKey);
            this.listCache = null;  // 彻底清除列表缓存
            this.listTimestamp = 0;
            
            // 同时删除本地缓存
            if (this.localCacheReady) {
                await this.localCache.deleteFile(fileKey);
            }
        }
        return result;
    }

    async getAllFiles() {
        const stats = await this.getStorageStats();
        return stats.files;
    }

    async findByFileName(fileName) {
        const files = await this.getAllFiles();
        return files.find(f => f.fileName === fileName) || null;
    }

    async overwriteFile(oldKey, newKey, newData, oldData) {
        await this.deleteFile(oldKey);
        const mergedData = {
            ...newData,
            lastChapter: oldData.lastChapter || 0,
            lastScrollIndex: oldData.lastScrollIndex || 0,
            chapterTitle: oldData.chapterTitle || '',
            customRegex: oldData.customRegex || {chapter: '', section: ''},
            chapterNumbering: oldData.chapterNumbering || 'none',
            annotations: oldData.annotations || [],
            cover: newData.cover || oldData.cover || null,
            lastReadTime: Lumina.DB.getLocalTimeString()
        };
        return this.saveFile(newKey, mergedData);
    }

    async exportBatch() {
        const files = await this.getAllFiles();
        if (!files.length) return null;
        
        const books = [];
        for (const file of files) {
            const fullData = await this.getFile(file.fileKey);
            if (fullData) books.push(fullData);
        }
        
        return {
            version: 2,
            exportType: 'batch',
            exportDate: Lumina.DB.getLocalTimeString(),
            appName: 'Lumina Reader',
            books,
            totalBooks: books.length
        };
    }

    async importBatch(books, onProgress) {
        const results = {success: 0, failed: 0, errors: []};
        for (let i = 0; i < books.length; i++) {
            const book = books[i];
            try {
                if (!book.fileName || !Array.isArray(book.content)) {
                    throw new Error('Invalid book data');
                }
                const newKey = `${book.fileName}_${Date.now()}_${i}`;
                await this.saveFile(newKey, {
                    fileName: book.fileName,
                    fileType: book.fileType || 'txt',
                    fileSize: book.fileSize || 0,
                    content: book.content,
                    wordCount: book.wordCount || 0,
                    cover: book.cover || null,
                    customRegex: book.customRegex || {chapter: '', section: ''},
                    chapterNumbering: book.chapterNumbering || 'none',
                    annotations: book.annotations || [],
                    heatMap: book.heatMap || null,
                    lastChapter: book.lastChapter || 0,
                    lastScrollIndex: book.lastScrollIndex || 0,
                    chapterTitle: book.chapterTitle || '',
                    lastReadTime: book.lastReadTime || Lumina.DB.getLocalTimeString(),
                    created_at: book.created_at || book.lastReadTime || Lumina.DB.getLocalTimeString()
                });
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push({book: book.fileName, error: err.message});
            }
            if (onProgress) onProgress(i + 1, books.length, results.success);
        }
        return results;
    }

    async updateCover(fileKey, coverDataUrl) {
        const fileData = await this.getFile(fileKey);
        if (fileData) {
            fileData.cover = coverDataUrl;
            return this.saveFile(fileKey, fileData);
        }
        return false;
    }

    async exportFile(fileKey) {
        return await this.getFile(fileKey);
    }

    // ========== Content 缓存管理方法（供缓存管理界面调用） ==========
    
    // 获取缓存统计信息
    async getCacheStats() {
        if (!this.localCacheReady) {
            return { enabled: false, size: 0, count: 0, files: [] };
        }
        
        try {
            const allFiles = await this.localCache.getAllFiles();
            let totalSize = 0;
            const fileList = [];
            
            for (const file of allFiles) {
                // 只统计有 content 的文件（真正的缓存数据）
                if (file.content && Array.isArray(file.content) && file.content.length > 0) {
                    const contentSize = JSON.stringify(file.content).length * 2;
                    totalSize += contentSize;
                    fileList.push({
                        fileKey: file.fileKey,
                        fileName: file.fileName,
                        size: contentSize,
                        createdAt: file.created_at || file.lastReadTime || null,
                        updatedAt: file.lastReadTime || file.updated_at || null
                    });
                }
            }
            
            // 按大小排序
            fileList.sort((a, b) => b.size - a.size);
            
            return {
                enabled: true,
                size: totalSize,
                count: fileList.length,
                files: fileList
            };
        } catch (e) {
            console.error('[CacheManager] 获取缓存统计失败:', e);
            return { enabled: true, size: 0, count: 0, files: [], error: e.message };
        }
    }
    
    // 清理指定文件的缓存
    async clearFileCache(fileKey) {
        if (!this.localCacheReady) return false;
        
        try {
            // 删除本地缓存中的 content，保留元数据
            const local = await this.localCache.getFile(fileKey);
            if (local && local.content) {
                // 只删除 content，保留其他元数据
                const { content, ...metaData } = local;
                await this.localCache.saveFile(fileKey, metaData);
                return true;
            }
            return false;
        } catch (e) {
            console.error('[CacheManager] 清理缓存失败:', e);
            return false;
        }
    }
    
    // 清理所有缓存（保留元数据列表）
    async clearAllCache() {
        if (!this.localCacheReady) return false;
        
        try {
            const allFiles = await this.localCache.getAllFiles();
            let cleared = 0;
            
            for (const file of allFiles) {
                if (file.content && Array.isArray(file.content) && file.content.length > 0) {
                    const { content, ...metaData } = file;
                    await this.localCache.saveFile(file.fileKey, metaData);
                    cleared++;
                }
            }
            
            // 同时清理内存缓存
            this.cache.clear();
            
            return { success: true, cleared };
        } catch (e) {
            console.error('[CacheManager] 清理所有缓存失败:', e);
            return { success: false, error: e.message };
        }
    }
    
    // 预加载指定文件到缓存
    async preloadToCache(fileKey) {
        if (!this.localCacheReady) return false;
        
        try {
            // 检查是否已缓存
            const local = await this.localCache.getFile(fileKey);
            if (local && local.content && local.content.length > 0) {
                return { success: true, cached: true, message: '已缓存' };
            }
            
            // 从远程加载
            const remote = await this.getFile(fileKey);
            if (remote && remote.content) {
                await this.localCache.saveFile(fileKey, remote);
                return { success: true, cached: false, message: '缓存成功' };
            }
            
            return { success: false, message: '文件无内容' };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
};


// ========== Web Content 缓存专用 IndexedDB 实现 ==========
// 独立的数据库，专门用于缓存文件内容，与 App 的 IndexedDB 完全隔离
Lumina.DB.WebCacheIndexedDBImpl = class {
    constructor() {
        this.db = null;
        this.DB_NAME = 'LuminaWebContentCache';  // 独立数据库名
        this.DB_VERSION = 1;
        this.isReady = false;
    }

    async init() {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            
            request.onerror = () => {
                this.isReady = false;
                resolve(false);
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isReady = true;
                resolve(true);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // 只创建对象存储，不预先填充数据
                if (!db.objectStoreNames.contains('fileData')) {
                    const store = db.createObjectStore('fileData', { keyPath: 'fileKey' });
                    store.createIndex('lastReadTime', 'lastReadTime', { unique: false });
                }
            };
        });
    }

    async getFile(fileKey) {
        if (!this.isReady || !this.db) return null;
        
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['fileData'], 'readonly');
                const store = transaction.objectStore('fileData');
                const request = store.get(fileKey);
                
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    }

    async saveFile(fileKey, data) {
        if (!this.isReady || !this.db) return false;
        
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['fileData'], 'readwrite');
                const store = transaction.objectStore('fileData');
                
                // 先查询是否已存在，以保留 created_at
                const getRequest = store.get(fileKey);
                getRequest.onsuccess = () => {
                    const existing = getRequest.result;
                    const now = new Date().toISOString();
                    
                    const record = {
                        fileKey,
                        fileName: data.fileName,
                        fileType: data.fileType,
                        content: data.content,
                        cover: data.cover,
                        heatMap: data.heatMap,
                        annotations: data.annotations,
                        metadata: data.metadata,
                        lastReadTime: data.lastReadTime || now,
                        updated_at: now,
                        // 保留原有的 created_at，或者设置新的
                        // 保留原有创建时间，或使用数据中的创建时间，或使用最后阅读时间（首次缓存时应该用数据中的时间）
                        created_at: existing?.created_at || data.created_at || data.lastReadTime || now
                    };
                    
                    const putRequest = store.put(record);
                    putRequest.onsuccess = () => resolve(true);
                    putRequest.onerror = () => resolve(false);
                };
                getRequest.onerror = () => resolve(false);
            } catch (e) { resolve(false); }
        });
    }

    async getAllFiles() {
        if (!this.isReady || !this.db) return [];
        
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['fileData'], 'readonly');
                const store = transaction.objectStore('fileData');
                const index = store.index('lastReadTime');
                const request = index.openCursor(null, 'prev');
                const files = [];
                
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        files.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(files);
                    }
                };
                request.onerror = () => resolve([]);
            } catch (e) { resolve([]); }
        });
    }

    async deleteFile(fileKey) {
        if (!this.isReady || !this.db) return false;
        
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['fileData'], 'readwrite');
                const store = transaction.objectStore('fileData');
                const request = store.delete(fileKey);
                request.onsuccess = () => resolve(true);
                request.onerror = () => resolve(false);
            } catch (e) { resolve(false); }
        });
    }

    // 获取缓存总大小（估算）
    async getCacheSize() {
        const files = await this.getAllFiles();
        let totalSize = 0;
        
        for (const file of files) {
            if (file.content) {
                totalSize += JSON.stringify(file.content).length * 2;
            }
        }
        
        return totalSize;
    }
};

