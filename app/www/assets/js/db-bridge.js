/**
 * 流萤阅读器 - Capacitor 数据库桥接层
 * 兼容原 Web 版的 REST API 调用方式
 */

import { Capacitor } from '@capacitor/core';

// 检测运行环境
const isNative = Capacitor.isNativePlatform();

class DatabaseBridge {
    constructor() {
        this.db = null;
        this.sqlite = null;
        this.initialized = false;
        this.mockMode = false; // 如果 SQLite 失败，使用内存模式
        this.memoryStore = new Map(); // 内存存储（降级方案）
    }

    /**
     * 初始化数据库
     */
    async init() {
        console.log('[DB] 初始化开始，环境:', isNative ? 'APP' : 'Web');

        if (!isNative) {
            console.log('[DB] Web 模式：使用 fetch API');
            this.initialized = true;
            return;
        }

        try {
            // 动态导入 SQLite 模块
            const sqliteModule = await import('@capacitor-community/sqlite');
            this.sqlite = new sqliteModule.SQLiteConnection(sqliteModule.CapacitorSQLite);

            // 创建/打开数据库
            this.db = await this.sqlite.createConnection(
                'lumina_reader',    // 数据库名
                false,              // 不加密
                'no-encryption',    // 加密模式
                1,                  // 版本号
                false               // 不 readonly
            );

            await this.db.open();
            console.log('[DB] SQLite 数据库已打开');

            // 创建表结构（与原 Python 版本一致）
            await this.createTables();
            
            this.initialized = true;
            console.log('[DB] 初始化完成');

        } catch (error) {
            console.error('[DB] SQLite 初始化失败，降级到内存模式:', error);
            this.mockMode = true;
            this.initialized = true;
        }
    }

    /**
     * 创建数据表（与原结构完全一致）
     */
    async createTables() {
        const createBooksTable = `
            CREATE TABLE IF NOT EXISTS books (
                fileKey TEXT PRIMARY KEY,
                fileName TEXT NOT NULL,
                fileType TEXT,
                fileSize INTEGER DEFAULT 0,
                content TEXT,
                wordCount INTEGER DEFAULT 0,
                lastChapter INTEGER DEFAULT 0,
                lastScrollIndex INTEGER DEFAULT 0,
                chapterTitle TEXT,
                lastReadTime TEXT,
                customRegex TEXT,
                chapterNumbering TEXT DEFAULT 'none',
                annotations TEXT,
                cover TEXT,
                heatMap TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.db.execute(createBooksTable);
        console.log('[DB] books 表已创建/确认');

        // 创建索引
        try {
            await this.db.execute('CREATE INDEX IF NOT EXISTS idx_filename ON books(fileName)');
            await this.db.execute('CREATE INDEX IF NOT EXISTS idx_lastread ON books(lastReadTime)');
        } catch (e) {
            // 索引可能已存在，忽略错误
        }
    }

    /**
     * 获取书籍列表（不含 content，节省内存）
     */
    async getList() {
        if (!isNative) {
            const response = await fetch('/api/files');
            return await response.json();
        }

        if (this.mockMode) {
            return Array.from(this.memoryStore.values()).map(item => {
                const { content, ...rest } = item;
                return rest;
            });
        }

        const result = await this.db.query(`
            SELECT fileKey, fileName, fileType, fileSize, wordCount, 
                lastChapter, lastScrollIndex, chapterTitle, lastReadTime, 
                chapterNumbering, updated_at, cover
            FROM books 
            ORDER BY lastReadTime DESC
        `);

        return result.values || [];
    }

    /**
     * 获取单本书籍详情（含 content）
     */
    async get(fileKey) {
        if (!isNative) {
            const response = await fetch('/api/file/' + encodeURIComponent(fileKey));
            return await response.json();
        }

        if (this.mockMode) {
            return this.memoryStore.get(fileKey) || null;
        }

        const result = await this.db.query(
            'SELECT * FROM books WHERE fileKey = ?',
            [fileKey]
        );

        if (!result.values || result.values.length === 0) {
            return null;
        }

        const row = result.values[0];
        
        // 解析 JSON 字段
        return this.parseBookData(row);
    }

    /**
     * 保存书籍
     */
    async save(fileKey, data) {
        if (!isNative) {
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileKey, data })
            });
            return await response.json();
        }

        // 序列化 JSON 字段
        const content = JSON.stringify(data.content || []);
        const customRegex = JSON.stringify(data.customRegex || {});
        const annotations = JSON.stringify(data.annotations || []);
        const heatMap = JSON.stringify(data.heatMap || null);

        if (this.mockMode) {
            this.memoryStore.set(fileKey, {
                fileKey,
                fileName: data.fileName || '',
                fileType: data.fileType || 'txt',
                fileSize: data.fileSize || 0,
                content,
                wordCount: data.wordCount || 0,
                lastChapter: data.lastChapter || 0,
                lastScrollIndex: data.lastScrollIndex || 0,
                chapterTitle: data.chapterTitle || '',
                lastReadTime: data.lastReadTime || new Date().toISOString(),
                customRegex,
                chapterNumbering: data.chapterNumbering || 'none',
                annotations,
                cover: data.cover || null,
                heatMap,
                updated_at: new Date().toISOString()
            });
            return { success: true };
        }

        const sql = `
            INSERT OR REPLACE INTO books (
                fileKey, fileName, fileType, fileSize, content, wordCount,
                lastChapter, lastScrollIndex, chapterTitle, lastReadTime,
                customRegex, chapterNumbering, annotations, cover, heatMap, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `;

        const values = [
            fileKey,
            data.fileName || '',
            data.fileType || 'txt',
            data.fileSize || 0,
            content,
            data.wordCount || 0,
            data.lastChapter || 0,
            data.lastScrollIndex || 0,
            data.chapterTitle || '',
            data.lastReadTime || new Date().toISOString(),
            customRegex,
            data.chapterNumbering || 'none',
            annotations,
            data.cover || null,
            heatMap
        ];

        try {
            await this.db.run(sql, values);
            return { success: true };
        } catch (error) {
            console.error('[DB] 保存失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 删除书籍
     */
    async delete(fileKey) {
        if (!isNative) {
            const response = await fetch('/api/file/' + encodeURIComponent(fileKey), {
                method: 'DELETE'
            });
            return await response.json();
        }

        if (this.mockMode) {
            this.memoryStore.delete(fileKey);
            return { success: true };
        }

        try {
            await this.db.run('DELETE FROM books WHERE fileKey = ?', [fileKey]);
            return { success: true };
        } catch (error) {
            console.error('[DB] 删除失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取统计信息
     */
    async getStats() {
        if (!isNative) {
            const response = await fetch('/api/stats');
            return await response.json();
        }

        if (this.mockMode) {
            let totalSize = 0;
            this.memoryStore.forEach(item => {
                totalSize += (item.content?.length || 0) + (item.cover?.length || 0);
            });
            return {
                totalFiles: this.memoryStore.size,
                totalSize: Math.round(totalSize / (1024 * 1024) * 100) / 100,
                imageCount: 0
            };
        }

        const result = await this.db.query(`
            SELECT COUNT(*) as count, 
                COALESCE(SUM(LENGTH(content)), 0) as content_size,
                COALESCE(SUM(LENGTH(cover)), 0) as cover_size
            FROM books
        `);

        const row = result.values?.[0];
        const totalMB = (row.content_size + row.cover_size) / (1024 * 1024);

        return {
            totalFiles: row?.count || 0,
            totalSize: Math.round(totalMB * 100) / 100,
            imageCount: 0
        };
    }

    /**
     * 批量操作（兼容原 API）
     */
    async batch(requests) {
        if (!isNative) {
            const response = await fetch('/api/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requests })
            });
            return await response.json();
        }

        const results = [];
        for (const req of requests) {
            const { method, params = {} } = req;
            try {
                if (method === 'getList') {
                    results.push(await this.getList());
                } else if (method === 'getStats') {
                    results.push(await this.getStats());
                } else if (method === 'getFile') {
                    results.push(await this.get(params.fileKey));
                } else {
                    results.push(null);
                }
            } catch (e) {
                results.push({ error: e.message });
            }
        }
        return results;
    }

    /**
     * 解析数据库返回的数据（反序列化 JSON）
     */
    parseBookData(row) {
        const result = { ...row };
        
        try {
            if (result.content) result.content = JSON.parse(result.content);
            if (result.customRegex) result.customRegex = JSON.parse(result.customRegex);
            if (result.annotations) result.annotations = JSON.parse(result.annotations);
            if (result.heatMap) result.heatMap = JSON.parse(result.heatMap);
        } catch (e) {
            console.warn('[DB] JSON 解析失败:', e);
        }
        
        return result;
    }

    /**
     * 检查数据库健康状态
     */
    async health() {
        if (!isNative) {
            try {
                const response = await fetch('/api/health');
                return await response.json();
            } catch (e) {
                return { status: 'error', mode: 'web' };
            }
        }

        if (this.mockMode) {
            return { status: 'ok', mode: 'memory' };
        }

        try {
            await this.db.query('SELECT 1');
            return { status: 'ok', mode: 'sqlite' };
        } catch (e) {
            return { status: 'error', error: e.message };
        }
    }
}

// 导出单例
export const dbBridge = new DatabaseBridge();

// 为了兼容性，也挂载到 window 对象
window.dbBridge = dbBridge;
