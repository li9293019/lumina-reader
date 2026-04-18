/**
 * db.js — Lumina Reader 存储层
 * 重构后：数据处理逻辑收敛到 db-helpers.js，本文件只保留与存储介质相关的代码。
 */
(function (global) {
    'use strict';

    const H = global.Lumina?.DB?.Helpers;
    if (!H) {
        console.error('[db.js] Lumina.DB.Helpers not found. Ensure db-helpers.js is loaded before db.js');
    }

    // =================== StorageAdapter ===================
    class StorageAdapter {
        constructor() {
            this.impl = null;
            this.mode = 'indexeddb';
            this.webCache = null;
            this.isCapacitor = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
            this.isLocalFile = location.protocol === 'file:';
        }

        async init() {
            if (this.isCapacitor) {
                await this.use('capacitor');
            } else if (this.isLocalFile) {
                await this.use('indexeddb');
            } else {
                await this.use('sqlite');
            }
        }

        async use(type) {
            if (type === 'capacitor') {
                this.mode = 'capacitor-sqlite';
                this.impl = new CapacitorSQLiteImpl();
            } else if (type === 'sqlite') {
                this.mode = 'sqlite';
                this.impl = new SQLiteImpl();
                this.webCache = new WebCacheIndexedDBImpl();
                await this.webCache.init();
                // 兼容旧代码对 impl.localCache 的探测
                this.impl.localCache = this.webCache;
            } else if (type === 'indexeddb') {
                this.mode = 'indexeddb';
                this.impl = new IndexedDBImpl();
                this.webCache = null;
            } else {
                throw new Error(`Unknown storage type: ${type}`);
            }
            return this.impl.init();
        }

        async saveFile(fileKey, data) {
            if (!fileKey || typeof fileKey !== 'string') {
                throw new Error('saveFile: fileKey must be a non-empty string');
            }
            if (!data || typeof data !== 'object') {
                throw new Error('saveFile: data must be an object');
            }
            const result = await this.impl.saveFile(fileKey, data);
            if (this.mode === 'sqlite' && this.webCache) {
                await this.webCache.saveFile(fileKey, data);
            }
            return result;
        }

        async getFile(fileKey) {
            if (!fileKey || typeof fileKey !== 'string') return null;
            if (this.mode === 'sqlite' && this.webCache) {
                const cached = await this.webCache.getFile(fileKey);
                if (cached) return cached;
            }
            return this.impl.getFile(fileKey);
        }

        async getFileSmart(fileKey) {
            if (this.mode === 'sqlite' && this.webCache) {
                try {
                    const local = await this.webCache.getFile(fileKey);
                    if (local && Array.isArray(local.content) && local.content.length > 0 && local.fileName) {
                        return local;
                    }
                    if (typeof Lumina !== 'undefined' && Lumina.UI && Lumina.UI.showToast) {
                        Lumina.UI.showToast(Lumina.I18n.t('firstLoading'), 0);
                    }
                } catch (e) {
                    console.error('[getFileSmart] 本地缓存读取失败:', e);
                }
            }
            if (this.impl && this.impl.getFileSmart) {
                return this.impl.getFileSmart(fileKey);
            }
            const remote = await this.impl.getFile(fileKey);
            // 异步写回 webCache
            if (remote && this.mode === 'sqlite' && this.webCache) {
                setTimeout(async () => {
                    try {
                        const exists = await this.webCache.getFile(fileKey);
                        let shouldSave = true;
                        if (exists) {
                            const localTime = new Date(exists.lastReadTime || 0);
                            const remoteTime = new Date(remote.lastReadTime || 0);
                            if (remoteTime <= localTime) shouldSave = false;
                        }
                        if (shouldSave) await this.webCache.saveFile(fileKey, remote);
                    } catch (e) {}
                }, 0);
            }
            return remote;
        }

        async deleteFile(fileKey) {
            const result = await this.impl.deleteFile(fileKey);
            if (this.mode === 'sqlite' && this.webCache) {
                await this.webCache.deleteFile(fileKey);
            }
            return result;
        }

        async getAllFiles(includeCover = false) {
            return this.impl.getAllFiles ? this.impl.getAllFiles(includeCover) : this.impl.getAllFiles();
        }

        async searchFiles(keyword) {
            return this.impl.searchFiles(keyword);
        }

        async importBatch(books, onProgress) {
            if (!Array.isArray(books)) {
                throw new Error('importBatch: books must be an array');
            }
            return this.impl.importBatch(books, onProgress);
        }

        async exportBatch() {
            return this.impl.exportBatch();
        }

        async exportFile(fileKey) {
            return this.impl.exportFile(fileKey);
        }

        async updateCover(fileKey, coverDataUrl) {
            const result = await this.impl.updateCover(fileKey, coverDataUrl);
            if (this.mode === 'sqlite' && this.webCache) {
                await this.webCache.updateCover(fileKey, coverDataUrl);
            }
            return result;
        }

        async findByFileName(fileName) {
            return this.impl.findByFileName ? this.impl.findByFileName(fileName) : null;
        }

        async overwriteFile(oldKey, newKey, newData, oldData) {
            const result = await this.impl.overwriteFile(oldKey, newKey, newData, oldData);
            if (this.mode === 'sqlite' && this.webCache && oldKey) {
                await this.webCache.deleteFile(oldKey);
                await this.webCache.saveFile(newKey, newData);
            }
            return result;
        }

        getStorageMode() {
            return this.mode;
        }

        async getStorageInfo() {
            return this.impl.getStorageInfo ? this.impl.getStorageInfo() : null;
        }

        async getStorageStats() {
            if (this.impl && this.impl.getStorageStats) {
                return this.impl.getStorageStats();
            }
            const [info, files] = await Promise.all([
                this.getStorageInfo(),
                this.getAllFiles()
            ]);
            const fileList = files || [];
            fileList.forEach(f => {
                f.estimatedSize = f.estimatedSize || f.fileSize || 0;
            });
            return {
                files: fileList,
                totalFiles: info?.count || fileList.length || 0,
                totalSize: info?.totalSize || 0,
                imageCount: 0,
                maxFiles: String(info?.maxCount || H.MAX_FILES)
            };
        }

        async getCacheStats() {
            if (this.webCache && this.webCache.getCacheStats) {
                return this.webCache.getCacheStats();
            }
            if (this.impl && this.impl.getCacheStats) {
                return this.impl.getCacheStats();
            }
            return { enabled: false, size: 0, count: 0, files: [] };
        }

        async clearFileCache(fileKey) {
            if (this.webCache && this.webCache.clearFileCache) {
                return this.webCache.clearFileCache(fileKey);
            }
            if (this.impl && this.impl.clearFileCache) {
                return this.impl.clearFileCache(fileKey);
            }
            return false;
        }

        async clearAllCache() {
            if (this.webCache && this.webCache.clearAllCache) {
                return this.webCache.clearAllCache();
            }
            if (this.impl && this.impl.clearAllCache) {
                return this.impl.clearAllCache();
            }
            return { success: false, error: 'Not supported' };
        }

        async clearStorage() {
            let result = this.impl.clearStorage ? await this.impl.clearStorage() : false;
            if (this.webCache && this.webCache.clearStorage) {
                await this.webCache.clearStorage();
            }
            return result;
        }

        generateFileKey(file) {
            return H.generateFileKey(file);
        }
    }

    // =================== IndexedDBImpl ===================
    class IndexedDBImpl {
        constructor() {
            this.db = null;
            this.isReady = false;
        }

        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('LuminaReaderDB', 2);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('fileData')) {
                        db.createObjectStore('fileData', { keyPath: 'fileKey' });
                    }
                };
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.isReady = true;
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        }

        async saveFile(fileKey, data) {
            if (!this.isReady || !this.db) return false;
            try {
                const existing = await this.getFile(fileKey);
                if (!existing) {
                    const count = await new Promise((resolve) => {
                        const tx = this.db.transaction(['fileData'], 'readonly');
                        const store = tx.objectStore('fileData');
                        const req = store.count();
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => resolve(0);
                    });
                    if (count >= H.MAX_FILES) {
                        window.logger?.warn('IndexedDB', 'Max files limit reached', { count });
                        return false;
                    }
                }

                const merged = H.mergeFileData(existing, data);
                const contentJson = JSON.stringify(merged.content || []);
                const contentSize = new Blob([contentJson]).size;
                const record = H.normalizeRecord(fileKey, merged, contentSize);
                record.created_at = existing?.created_at || data.created_at || H.getLocalTimeString();

                return new Promise((resolve) => {
                    const tx = this.db.transaction(['fileData'], 'readwrite');
                    const store = tx.objectStore('fileData');
                    const req = store.put(record);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                });
            } catch (e) {
                window.logger?.error('IndexedDB', 'saveFile error', { error: e.message });
                return false;
            }
        }

        async getFile(fileKey) {
            if (!this.isReady || !this.db) return null;
            return new Promise((resolve) => {
                const tx = this.db.transaction(['fileData'], 'readonly');
                const store = tx.objectStore('fileData');
                const req = store.get(fileKey);
                req.onsuccess = () => {
                    const result = req.result;
                    if (result && result.content && typeof result.content === 'string') {
                        try { result.content = JSON.parse(result.content); } catch (e) {}
                    }
                    resolve(result || null);
                };
                req.onerror = () => resolve(null);
            });
        }

        async deleteFile(fileKey) {
            if (!this.isReady || !this.db) return false;
            return new Promise((resolve) => {
                const tx = this.db.transaction(['fileData'], 'readwrite');
                const store = tx.objectStore('fileData');
                const req = store.delete(fileKey);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            });
        }

        async getAllFiles() {
            if (!this.isReady || !this.db) return [];
            return new Promise((resolve) => {
                const tx = this.db.transaction(['fileData'], 'readonly');
                const store = tx.objectStore('fileData');
                const req = store.getAll();
                req.onsuccess = () => {
                    const files = req.result || [];
                    files.forEach(file => {
                        if (file.content && typeof file.content === 'string') {
                            try { file.content = JSON.parse(file.content); } catch (e) {}
                        }
                    });
                    resolve(files.sort((a, b) => new Date(b.lastReadTime || 0) - new Date(a.lastReadTime || 0)));
                };
                req.onerror = () => resolve([]);
            });
        }

        async searchFiles(keyword) {
            if (!keyword || !this.isReady || !this.db) return [];
            const lower = keyword.toLowerCase();
            const allFiles = await this.getAllFiles();
            return allFiles.filter(file => {
                if (file.fileName && file.fileName.toLowerCase().includes(lower)) return true;
                if (Array.isArray(file.annotations)) {
                    for (const a of file.annotations) {
                        if (a.text && a.text.toLowerCase().includes(lower)) return true;
                    }
                }
                return false;
            });
        }

        async importBatch(books, onProgress) {
            return H.runImportBatch(this, books, onProgress);
        }

        async exportBatch() {
            return H.runExportBatch(this);
        }

        async exportFile(fileKey) {
            return H.exportFile(this, fileKey);
        }

        async updateCover(fileKey, coverDataUrl) {
            return H.updateCover(this, fileKey, coverDataUrl);
        }

        async findByFileName(fileName) {
            if (!this.isReady || !this.db) return null;
            try {
                const all = await this.getAllFiles();
                return all.find(f => f.fileName === fileName) || null;
            } catch (e) {
                return null;
            }
        }

        async overwriteFile(oldKey, newKey, newData, oldData) {
            if (!this.isReady || !this.db) return false;
            try {
                await this.deleteFile(oldKey);
                const merged = H.mergeFileData(oldData, newData);
                const contentJson = JSON.stringify(merged.content || []);
                const contentSize = new Blob([contentJson]).size;
                const record = H.normalizeRecord(newKey, merged, contentSize);
                record.lastReadTime = H.getLocalTimeString();
                record.created_at = oldData?.created_at || H.getLocalTimeString();

                return new Promise((resolve) => {
                    const tx = this.db.transaction(['fileData'], 'readwrite');
                    const store = tx.objectStore('fileData');
                    const req = store.put(record);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                });
            } catch (e) {
                window.logger?.error('IndexedDB', 'overwriteFile error', { error: e.message });
                return false;
            }
        }

        async getStorageStats() {
            const files = await this.getAllFiles();
            let totalSize = 0;
            files.forEach(file => {
                const contentJson = JSON.stringify(file.content || []);
                const contentSize = new Blob([contentJson]).size;
                const coverSize = file.cover ? new Blob([file.cover]).size : 0;
                totalSize += contentSize + coverSize;
                file.estimatedSize = contentSize + coverSize;
            });
            return {
                files,
                totalFiles: files.length,
                totalSize,
                imageCount: 0,
                maxFiles: String(H.MAX_FILES)
            };
        }

        async getStorageInfo() {
            const stats = await this.getStorageStats();
            return { count: stats.totalFiles, maxCount: H.MAX_FILES, totalSize: stats.totalSize };
        }

        async clearStorage() {
            if (!this.isReady || !this.db) return false;
            return new Promise((resolve) => {
                const tx = this.db.transaction(['fileData'], 'readwrite');
                const store = tx.objectStore('fileData');
                const req = store.clear();
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            });
        }
    }

    // =================== CapacitorSQLiteImpl ===================
    class CapacitorSQLiteImpl {
        constructor() {
            this.dbBridge = null;
            this.isReady = false;
            this.fileCache = new Map();
            this.listCache = null;
            this.listCacheTime = 0;
            this.LIST_CACHE_TTL = 30 * 1000;
        }

        async init() {
            if (typeof window.dbBridge !== 'undefined' && window.dbBridge) {
                this.dbBridge = window.dbBridge;
                try {
                    await this.dbBridge.init();
                    this.isReady = true;
                } catch (e) {
                    window.logger?.error('CapacitorSQLite', 'Init failed', { error: e.message });
                    this.isReady = false;
                }
            } else {
                this.isReady = false;
            }
            return this.isReady;
        }

        async saveFile(fileKey, data) {
            if (!this.isReady || !this.dbBridge) return false;
            try {
                const existing = await this.getFile(fileKey);
                // 如果 data 中未包含 content（如只更新 lastReadTime），使用 patch 避免重新序列化大 content
                if (existing && data.content === undefined && this.dbBridge.patch) {
                    const merged = H.mergeFileData(existing, data);
                    const patchData = { ...data };
                    if (!patchData.created_at && existing.created_at) {
                        patchData.created_at = existing.created_at;
                    }
                    const result = await this.dbBridge.patch(fileKey, patchData);
                    if (result && result.success) {
                        this.fileCache.set(fileKey, merged);
                        this._invalidateListCache();
                    }
                    return result && result.success;
                }

                const merged = H.mergeFileData(existing, data);
                const contentJson = JSON.stringify(merged.content || []);
                const contentSize = new Blob([contentJson]).size;
                const record = H.normalizeRecord(fileKey, merged, contentSize);
                record.created_at = existing?.created_at || data.created_at || H.getLocalTimeString();

                await this.dbBridge.save(fileKey, record);
                this.fileCache.set(fileKey, record);
                this._invalidateListCache();
                return true;
            } catch (e) {
                window.logger?.error('CapacitorSQLite', 'saveFile error', { error: e.message });
                return false;
            }
        }

        async getFile(fileKey) {
            if (!this.isReady || !this.dbBridge) return null;
            if (this.fileCache.has(fileKey)) {
                return this.fileCache.get(fileKey);
            }
            try {
                const result = await this.dbBridge.get(fileKey);
                if (result) {
                    this.fileCache.set(fileKey, result);
                    return result;
                }
                return null;
            } catch (e) {
                window.logger?.error('CapacitorSQLite', 'getFile error', { error: e.message });
                return null;
            }
        }

        async deleteFile(fileKey) {
            if (!this.isReady || !this.dbBridge) return false;
            try {
                await this.dbBridge.delete(fileKey);
                this.fileCache.delete(fileKey);
                this._invalidateListCache();
                return true;
            } catch (e) {
                window.logger?.error('CapacitorSQLite', 'deleteFile error', { error: e.message });
                return false;
            }
        }

        async getAllFiles(includeCover = false) {
            if (!this.isReady || !this.dbBridge) return [];
            const now = Date.now();
            if (this.listCache && (now - this.listCacheTime) < this.LIST_CACHE_TTL) {
                const files = this.listCache;
                if (!includeCover) {
                    for (const f of files) {
                        if (this.dbBridge.coverCache.has(f.fileKey)) {
                            f.cover = this.dbBridge.coverCache.get(f.fileKey);
                        }
                    }
                }
                return files;
            }
            try {
                // 如果 cover 缓存为空，第一次全量拉取（包含 cover）以预热缓存
                const needWarm = this.dbBridge.coverCache.size === 0;
                const files = await this.dbBridge.getList(needWarm ? true : includeCover);
                files.sort((a, b) => new Date(b.lastReadTime || 0) - new Date(a.lastReadTime || 0));
                // 缓存已预热后，从内存补 cover（当查询本身不带 cover 时）
                if (!needWarm && !includeCover) {
                    for (const f of files) {
                        if (this.dbBridge.coverCache.has(f.fileKey)) {
                            f.cover = this.dbBridge.coverCache.get(f.fileKey);
                        }
                    }
                }
                this.listCache = files;
                this.listCacheTime = now;
                return files;
            } catch (e) {
                window.logger?.error('CapacitorSQLite', 'getAllFiles error', { error: e.message });
                return [];
            }
        }

        async searchFiles(keyword) {
            if (!keyword || !this.isReady || !this.dbBridge) return [];
            const lower = keyword.toLowerCase();
            const allFiles = await this.getAllFiles();
            return allFiles.filter(file => {
                if (file.fileName && file.fileName.toLowerCase().includes(lower)) return true;
                if (Array.isArray(file.annotations)) {
                    for (const a of file.annotations) {
                        if (a.text && a.text.toLowerCase().includes(lower)) return true;
                    }
                }
                return false;
            });
        }

        async importBatch(books, onProgress) {
            return H.runImportBatch(this, books, onProgress);
        }

        async exportBatch() {
            return H.runExportBatch(this);
        }

        async exportFile(fileKey) {
            return H.exportFile(this, fileKey);
        }

        async updateCover(fileKey, coverDataUrl) {
            return H.updateCover(this, fileKey, coverDataUrl);
        }

        async findByFileName(fileName) {
            if (!this.isReady || !this.dbBridge) return null;
            try {
                const all = await this.getAllFiles();
                return all.find(f => f.fileName === fileName) || null;
            } catch (e) {
                return null;
            }
        }

        async overwriteFile(oldKey, newKey, newData, oldData) {
            if (!this.isReady || !this.dbBridge) return false;
            try {
                await this.deleteFile(oldKey);
                const merged = H.mergeFileData(oldData, newData);
                const contentJson = JSON.stringify(merged.content || []);
                const contentSize = new Blob([contentJson]).size;
                const record = H.normalizeRecord(newKey, merged, contentSize);
                record.created_at = oldData?.created_at || H.getLocalTimeString();

                await this.dbBridge.save(newKey, record);
                this.fileCache.set(newKey, record);
                this._invalidateListCache();
                return true;
            } catch (e) {
                window.logger?.error('CapacitorSQLite', 'overwriteFile error', { error: e.message });
                return false;
            }
        }

        async getStorageStats() {
            const files = await this.getAllFiles();
            let totalSize = 0;
            files.forEach(file => {
                // APP 端 getAllFiles() 通过 dbBridge.getList() 获取，fileSize 已经是
                // content_size（或 content_size + cover 长度），直接使用即可
                const size = file.fileSize || 0;
                file.estimatedSize = size;
                totalSize += size;
            });
            return {
                files,
                totalFiles: files.length,
                totalSize,
                imageCount: 0,
                maxFiles: String(H.MAX_FILES)
            };
        }

        async getStorageInfo() {
            const stats = await this.getStorageStats();
            return { count: stats.totalFiles, maxCount: H.MAX_FILES, totalSize: stats.totalSize };
        }

        async clearStorage() {
            if (!this.isReady || !this.dbBridge) return false;
            try {
                await this.dbBridge.clear();
                this.fileCache.clear();
                this._invalidateListCache();
                return true;
            } catch (e) {
                window.logger?.error('CapacitorSQLite', 'clearStorage error', { error: e.message });
                return false;
            }
        }

        _invalidateListCache() {
            this.listCache = null;
            this.listCacheTime = 0;
        }
    }


    // =================== SQLiteImpl (Web + Python backend) ===================
    class SQLiteImpl {
        constructor() {
            this.baseUrl = 'http://localhost:8080/api';
            this.isReady = false;
            this.cache = new Map();
            this.errorCount = 0;
            this.MAX_ERRORS = 3;
        }

        async init() {
            try {
                const response = await fetch(`${this.baseUrl}/health`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(1500)
                });
                this.isReady = response.ok;
            } catch (e) {
                this.isReady = false;
            }
            return this.isReady;
        }

        async _fetch(endpoint, options = {}, timeoutMs = 10000) {
            const url = `${this.baseUrl}${endpoint}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(new Error('Request timeout')), timeoutMs);
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: { 'Content-Type': 'application/json', ...options.headers },
                    signal: controller.signal
                });
                clearTimeout(timeout);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.json();
            } catch (error) {
                clearTimeout(timeout);
                if (error.name !== 'AbortError') this.errorCount++;
                throw error;
            }
        }

        async getStorageStats() {
            try {
                const fresh = await this._fetch('/batch', {
                    method: 'POST',
                    body: JSON.stringify({ requests: [{ method: 'getList' }, { method: 'getStats' }] })
                });
                const files = fresh[0] || [];
                const stats = fresh[1] || { totalFiles: 0, totalSize: 0 };
                files.forEach(file => { file.estimatedSize = file.fileSize || 0; });
                this.errorCount = 0;
                return {
                    files,
                    totalFiles: stats.totalFiles,
                    totalSize: stats.totalSize,
                    imageCount: 0,
                    maxFiles: '无'
                };
            } catch (error) {
                this.errorCount++;
                throw error;
            }
        }

        async getFile(fileKey) {
            if (!this.isReady) return null;
            if (this.cache.has(fileKey)) return this.cache.get(fileKey);
            try {
                const result = await this._fetch(`/file/${encodeURIComponent(fileKey)}`, {}, 60000);
                if (result) {
                    this.cache.set(fileKey, result);
                    this.errorCount = 0;
                }
                return result;
            } catch (error) {
                window.logger?.error('SQLite', 'getFile error', { fileKey, error: error.message });
                return null;
            }
        }

        async saveFile(fileKey, data) {
            if (!this.isReady) return false;
            try {
                let existing = this.cache.get(fileKey);
                if (!existing) {
                    try { existing = await this.getFile(fileKey); } catch (e) {}
                }
                existing = existing || {};
                const merged = H.mergeFileData(existing, data);
                const contentJson = JSON.stringify(merged.content || []);
                const contentSize = new Blob([contentJson]).size;
                const record = H.normalizeRecord(fileKey, merged, contentSize);
                record.created_at = existing.created_at || data.created_at || H.getLocalTimeString();

                const dataToSend = JSON.parse(JSON.stringify(record, (k, v) => v === undefined ? null : v));
                const result = await this._fetch('/save', {
                    method: 'POST',
                    body: JSON.stringify({ fileKey, data: dataToSend })
                }, 5000);

                if (result && result.success) {
                    this.cache.set(fileKey, merged);
                    this.errorCount = 0;
                }
                return result && result.success;
            } catch (error) {
                window.logger?.error('SQLite', 'saveFile error', { error: error.message });
                return false;
            }
        }

        async deleteFile(fileKey) {
            if (!this.isReady) return false;
            try {
                const result = await this._fetch(`/file/${encodeURIComponent(fileKey)}`, { method: 'DELETE' });
                if (result) {
                    this.cache.delete(fileKey);
                }
                return result;
            } catch (error) {
                window.logger?.error('SQLite', 'deleteFile error', { error: error.message });
                return false;
            }
        }

        async getAllFiles() {
            if (!this.isReady) return [];
            try {
                const stats = await this.getStorageStats();
                return stats.files || [];
            } catch (error) {
                window.logger?.error('SQLite', 'getAllFiles error', { error: error.message });
                return [];
            }
        }

        async searchFiles(keyword) {
            if (!keyword || !this.isReady) return [];
            const lower = keyword.toLowerCase();
            const allFiles = await this.getAllFiles();
            return allFiles.filter(file => {
                if (file.fileName && file.fileName.toLowerCase().includes(lower)) return true;
                if (Array.isArray(file.annotations)) {
                    for (const a of file.annotations) {
                        if (a.text && a.text.toLowerCase().includes(lower)) return true;
                    }
                }
                return false;
            });
        }

        async importBatch(books, onProgress) {
            return H.runImportBatch(this, books, onProgress);
        }

        async exportBatch() {
            return H.runExportBatch(this);
        }

        async exportFile(fileKey) {
            return H.exportFile(this, fileKey);
        }

        async updateCover(fileKey, coverDataUrl) {
            return H.updateCover(this, fileKey, coverDataUrl);
        }

        async findByFileName(fileName) {
            if (!this.isReady) return null;
            try {
                const all = await this.getAllFiles();
                return all.find(f => f.fileName === fileName) || null;
            } catch (e) {
                return null;
            }
        }

        async overwriteFile(oldKey, newKey, newData, oldData) {
            if (!this.isReady) return false;
            try {
                await this.deleteFile(oldKey);
                const merged = H.mergeFileData(oldData, newData);
                const contentJson = JSON.stringify(merged.content || []);
                const contentSize = new Blob([contentJson]).size;
                const record = H.normalizeRecord(newKey, merged, contentSize);
                record.lastReadTime = H.getLocalTimeString();
                record.created_at = oldData?.created_at || H.getLocalTimeString();
                return this.saveFile(newKey, record);
            } catch (error) {
                window.logger?.error('SQLite', 'overwriteFile error', { error: error.message });
                return false;
            }
        }

        async getCacheStats() {
            if (!this.localCache || !this.localCache.getAllFiles) {
                return { enabled: false, size: 0, count: 0, files: [] };
            }
            try {
                const allFiles = await this.localCache.getAllFiles();
                let totalSize = 0;
                const fileList = [];
                for (const file of allFiles) {
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
                fileList.sort((a, b) => b.size - a.size);
                return { enabled: true, size: totalSize, count: fileList.length, files: fileList };
            } catch (e) {
                return { enabled: true, size: 0, count: 0, files: [], error: e.message };
            }
        }

        async clearFileCache(fileKey) {
            if (!this.localCache || !this.localCache.getFile) return false;
            try {
                const local = await this.localCache.getFile(fileKey);
                if (local && local.content) {
                    const { content, ...metaData } = local;
                    await this.localCache.saveFile(fileKey, { ...metaData, content: [] });
                    return true;
                }
                return false;
            } catch (e) {
                return false;
            }
        }

        async clearAllCache() {
            if (!this.localCache || !this.localCache.getAllFiles) return { success: false, error: 'No cache' };
            try {
                const allFiles = await this.localCache.getAllFiles();
                let cleared = 0;
                for (const file of allFiles) {
                    if (file.content && Array.isArray(file.content) && file.content.length > 0) {
                        const { content, ...metaData } = file;
                        await this.localCache.saveFile(file.fileKey, { ...metaData, content: [] });
                        cleared++;
                    }
                }
                this.cache.clear();
                return { success: true, cleared };
            } catch (e) {
                return { success: false, error: e.message };
            }
        }

        async getStorageInfo() {
            try {
                const stats = await this.getStorageStats();
                return { count: stats.totalFiles, maxCount: H.MAX_FILES, totalSize: stats.totalSize };
            } catch (e) {
                return { count: 0, maxCount: H.MAX_FILES, totalSize: 0 };
            }
        }
    }

    // =================== WebCacheIndexedDBImpl ===================
    class WebCacheIndexedDBImpl {
        constructor() {
            this.db = null;
            this.isReady = false;
        }

        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('LuminaWebCacheDB', 1);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('webCache')) {
                        db.createObjectStore('webCache', { keyPath: 'fileKey' });
                    }
                };
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.isReady = true;
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        }

        async saveFile(fileKey, data) {
            if (!this.isReady || !this.db) return false;
            try {
                const existing = await this.getFile(fileKey);
                const merged = H.mergeFileData(existing, data);
                const contentJson = JSON.stringify(merged.content || []);
                const contentSize = new Blob([contentJson]).size;
                const record = H.normalizeRecord(fileKey, merged, contentSize);
                record.created_at = existing?.created_at || data.created_at || H.getLocalTimeString();

                return new Promise((resolve) => {
                    const tx = this.db.transaction(['webCache'], 'readwrite');
                    const store = tx.objectStore('webCache');
                    const req = store.put(record);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                });
            } catch (e) {
                window.logger?.error('WebCache', 'saveFile error', { error: e.message });
                return false;
            }
        }

        async getFile(fileKey) {
            if (!this.isReady || !this.db) return null;
            return new Promise((resolve) => {
                const tx = this.db.transaction(['webCache'], 'readonly');
                const store = tx.objectStore('webCache');
                const req = store.get(fileKey);
                req.onsuccess = () => {
                    const result = req.result;
                    if (result && result.content && typeof result.content === 'string') {
                        try { result.content = JSON.parse(result.content); } catch (e) {}
                    }
                    resolve(result || null);
                };
                req.onerror = () => resolve(null);
            });
        }

        async deleteFile(fileKey) {
            if (!this.isReady || !this.db) return false;
            return new Promise((resolve) => {
                const tx = this.db.transaction(['webCache'], 'readwrite');
                const store = tx.objectStore('webCache');
                const req = store.delete(fileKey);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            });
        }

        async getAllFiles() {
            if (!this.isReady || !this.db) return [];
            return new Promise((resolve) => {
                const tx = this.db.transaction(['webCache'], 'readonly');
                const store = tx.objectStore('webCache');
                const req = store.getAll();
                req.onsuccess = () => {
                    const files = req.result || [];
                    files.forEach(file => {
                        if (file.content && typeof file.content === 'string') {
                            try { file.content = JSON.parse(file.content); } catch (e) {}
                        }
                    });
                    resolve(files.sort((a, b) => new Date(b.lastReadTime || 0) - new Date(a.lastReadTime || 0)));
                };
                req.onerror = () => resolve([]);
            });
        }

        async updateCover(fileKey, coverDataUrl) {
            return H.updateCover(this, fileKey, coverDataUrl);
        }

        async overwriteFile(oldKey, newKey, newData, oldData) {
            if (!this.isReady || !this.db) return false;
            try {
                await this.deleteFile(oldKey);
                const merged = H.mergeFileData(oldData, newData);
                const contentJson = JSON.stringify(merged.content || []);
                const contentSize = new Blob([contentJson]).size;
                const record = H.normalizeRecord(newKey, merged, contentSize);
                record.lastReadTime = H.getLocalTimeString();
                record.created_at = oldData?.created_at || H.getLocalTimeString();

                return new Promise((resolve) => {
                    const tx = this.db.transaction(['webCache'], 'readwrite');
                    const store = tx.objectStore('webCache');
                    const req = store.put(record);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                });
            } catch (e) {
                window.logger?.error('WebCache', 'overwriteFile error', { error: e.message });
                return false;
            }
        }

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

        async getCacheStats() {
            if (!this.isReady || !this.db) {
                return { enabled: false, size: 0, count: 0, files: [] };
            }
            try {
                const allFiles = await this.getAllFiles();
                let totalSize = 0;
                const fileList = [];
                for (const file of allFiles) {
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
                fileList.sort((a, b) => b.size - a.size);
                return { enabled: true, size: totalSize, count: fileList.length, files: fileList };
            } catch (e) {
                return { enabled: true, size: 0, count: 0, files: [], error: e.message };
            }
        }

        async clearFileCache(fileKey) {
            if (!this.isReady || !this.db) return false;
            try {
                const local = await this.getFile(fileKey);
                if (local && local.content) {
                    const { content, ...metaData } = local;
                    await this.saveFile(fileKey, { ...metaData, content: [] });
                    return true;
                }
                return false;
            } catch (e) {
                return false;
            }
        }

        async clearAllCache() {
            if (!this.isReady || !this.db) return { success: false, error: 'Not ready' };
            try {
                const allFiles = await this.getAllFiles();
                let cleared = 0;
                for (const file of allFiles) {
                    if (file.content && Array.isArray(file.content) && file.content.length > 0) {
                        const { content, ...metaData } = file;
                        await this.saveFile(file.fileKey, { ...metaData, content: [] });
                        cleared++;
                    }
                }
                return { success: true, cleared };
            } catch (e) {
                return { success: false, error: e.message };
            }
        }

        async clearStorage() {
            if (!this.isReady || !this.db) return false;
            return new Promise((resolve) => {
                const tx = this.db.transaction(['webCache'], 'readwrite');
                const store = tx.objectStore('webCache');
                const req = store.clear();
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            });
        }
    }

    // =================== 暴露到全局 ===================
    global.StorageAdapter = StorageAdapter;
    global.IndexedDBImpl = IndexedDBImpl;
    global.CapacitorSQLiteImpl = CapacitorSQLiteImpl;
    global.SQLiteImpl = SQLiteImpl;
    global.WebCacheIndexedDBImpl = WebCacheIndexedDBImpl;

    const Lumina = global.Lumina;
    if (Lumina && Lumina.DB) {
        Lumina.DB.StorageAdapter = StorageAdapter;
        Lumina.DB.IndexedDBImpl = IndexedDBImpl;
        Lumina.DB.CapacitorSQLiteImpl = CapacitorSQLiteImpl;
        Lumina.DB.SQLiteImpl = SQLiteImpl;
        Lumina.DB.WebCacheIndexedDBImpl = WebCacheIndexedDBImpl;
    }

})(window);
