/**
 * 流萤阅读器 - Capacitor 数据库桥接层
 * 兼容原 Web 版的 REST API 调用方式
 */

// 检测运行环境
const DB_isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.() || false;

// 获取本地时间字符串（格式：YYYY-MM-DD HH:mm:ss）
function getLocalTimeString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

class DatabaseBridge {
    constructor() {
        this.db = null;
        this.sqlite = null;
        this.initialized = false;
        this.mockMode = false;
        this.memoryStore = new Map();
    }

    async init() {
        console.log('[DB] 初始化开始，环境:', DB_isNative ? 'APP' : 'Web');

        if (!DB_isNative) {
            console.log('[DB] Web 模式：使用 fetch API');
            this.initialized = true;
            return;
        }

        try {
            // 动态加载 SQLite 模块（通过全局变量）
            if (typeof CapacitorSQLite === 'undefined') {
                console.warn('[DB] CapacitorSQLite 未找到，使用内存模式');
                this.mockMode = true;
                this.initialized = true;
                return;
            }
            
            const sqlitePlugin = CapacitorSQLite;
            this.sqlite = new SQLiteConnection(sqlitePlugin);

            this.db = await this.sqlite.createConnection(
                'lumina_reader',
                false,
                'no-encryption',
                1,
                false
            );

            await this.db.open();
            console.log('[DB] SQLite 数据库已打开');

            await this.createTables();
            this.initialized = true;
        } catch (err) {
            console.error('[DB] 初始化失败:', err);
            console.log('[DB] 降级到内存模式');
            this.mockMode = true;
            this.initialized = true;
        }
    }

    async createTables() {
        // 先创建基础表结构
        const baseSchema = `
            CREATE TABLE IF NOT EXISTS files (
                file_key TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                file_type TEXT,
                file_size INTEGER,
                content_size INTEGER DEFAULT 0,
                content TEXT,
                word_count INTEGER DEFAULT 0,
                last_chapter INTEGER DEFAULT 0,
                last_scroll_index INTEGER DEFAULT 0,
                chapter_title TEXT,
                last_read_time TEXT,
                custom_regex TEXT,
                chapter_numbering TEXT DEFAULT 'none',
                cover_data_url TEXT,
                created_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_last_read ON files(last_read_time);
            CREATE INDEX IF NOT EXISTS idx_file_name ON files(file_name);
        `;
        await this.db.execute(baseSchema);
        
        // 兼容旧数据库：检查并添加 created_at 字段
        try {
            const checkResult = await this.db.query(
                "SELECT COUNT(*) as cnt FROM pragma_table_info('files') WHERE name='created_at'"
            );
            if (checkResult.values && checkResult.values[0].cnt === 0) {
                await this.db.run('ALTER TABLE files ADD COLUMN created_at TEXT');
                console.log('[DB] 已添加 created_at 字段');
            }
        } catch (e) {
            console.log('[DB] 检查/添加字段失败（可能已存在）:', e);
        }
    }

    async query(sql, params = []) {
        if (!this.initialized) await this.init();
        
        if (this.mockMode) {
            return this.mockQuery(sql, params);
        }

        try {
            const result = await this.db.query(sql, params);
            return { success: true, data: result.values || [] };
        } catch (err) {
            console.error('[DB] 查询失败:', err);
            return { success: false, error: err.message };
        }
    }

    async run(sql, params = []) {
        if (!this.initialized) await this.init();
        
        if (this.mockMode) {
            return this.mockRun(sql, params);
        }

        try {
            await this.db.run(sql, params);
            return { success: true };
        } catch (err) {
            console.error('[DB] 执行失败:', err);
            return { success: false, error: err.message };
        }
    }

    mockQuery(sql, params) {
        console.log('[DB] 内存模式查询:', sql);
        return { success: true, data: [] };
    }

    mockRun(sql, params) {
        console.log('[DB] 内存模式执行:', sql);
        return { success: true };
    }

    // ========== 高层数据库操作方法 ==========

    async save(fileKey, data) {
        if (this.mockMode) {
            this.memoryStore.set(fileKey, data);
            return { success: true };
        }

        try {
            // 检查是否已存在，以保留 created_at
            const existing = await this.get(fileKey);
            const createdAt = existing?.created_at || data.created_at || getLocalTimeString();

            // 【优化】预计算 contentSize
            const contentJson = JSON.stringify(data.content || []);
            const contentSize = new Blob([contentJson]).size;

            const sql = `
                INSERT OR REPLACE INTO files (
                    file_key, file_name, file_type, file_size, content_size, content, word_count,
                    last_chapter, last_scroll_index, chapter_title, last_read_time,
                    custom_regex, chapter_numbering, cover_data_url, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                fileKey,
                data.fileName || data.file_name || '',
                data.fileType || data.file_type || 'txt',
                data.fileSize || data.file_size || 0,
                contentSize,
                contentJson,
                data.wordCount || data.word_count || 0,
                data.lastChapter || data.last_chapter || 0,
                data.lastScrollIndex || data.last_scroll_index || 0,
                data.chapterTitle || data.chapter_title || '',
                data.lastReadTime || data.last_read_time || getLocalTimeString(),
                JSON.stringify(data.customRegex || data.custom_regex || {}),
                data.chapterNumbering || data.chapter_numbering || 'none',
                data.cover || data.cover_data_url || null,
                createdAt
            ];
            await this.db.run(sql, params);
            return { success: true };
        } catch (err) {
            console.error('[DB] 保存失败:', err);
            return { success: false, error: err.message };
        }
    }

    async get(fileKey) {
        if (this.mockMode) {
            return this.memoryStore.get(fileKey) || null;
        }

        try {
            const result = await this.db.query(
                'SELECT * FROM files WHERE file_key = ?',
                [fileKey]
            );
            if (result.values && result.values.length > 0) {
                return this.rowToFile(result.values[0]);
            }
            return null;
        } catch (err) {
            console.error('[DB] 获取失败:', err);
            return null;
        }
    }

    async delete(fileKey) {
        if (this.mockMode) {
            this.memoryStore.delete(fileKey);
            return { success: true };
        }

        try {
            await this.db.run('DELETE FROM files WHERE file_key = ?', [fileKey]);
            return { success: true };
        } catch (err) {
            console.error('[DB] 删除失败:', err);
            return { success: false, error: err.message };
        }
    }

    async getList() {
        if (this.mockMode) {
            return Array.from(this.memoryStore.values());
        }

        try {
            // 【优化】不返回 content 和 cover 数据，减少传输
            const result = await this.db.query(
                `SELECT file_key, file_name, file_type, (content_size + LENGTH(COALESCE(cover_data_url, ""))) as file_size, 
                    word_count, last_chapter, last_scroll_index, chapter_title, 
                    last_read_time, chapter_numbering, created_at 
                FROM files ORDER BY last_read_time DESC`
            );
            return (result.values || []).map(row => ({
                fileKey: row.file_key,
                fileName: row.file_name,
                fileType: row.file_type,
                fileSize: row.file_size,
                wordCount: row.word_count,
                lastChapter: row.last_chapter,
                lastScrollIndex: row.last_scroll_index,
                chapterTitle: row.chapter_title,
                lastReadTime: row.last_read_time,
                chapterNumbering: row.chapter_numbering,
                created_at: row.created_at
            }));
        } catch (err) {
            console.error('[DB] 获取列表失败:', err);
            return [];
        }
    }

    async getStats() {
        if (this.mockMode) {
            return {
                totalFiles: this.memoryStore.size,
                totalSize: 0
            };
        }

        try {
            // 【优化】使用 content_size + cover 长度作为总大小
            const result = await this.db.query(
                'SELECT COUNT(*) as count, COALESCE(SUM(content_size + LENGTH(COALESCE(cover_data_url, ""))), 0) as size FROM files'
            );
            if (result.values && result.values.length > 0) {
                return {
                    totalFiles: result.values[0].count,
                    totalSize: result.values[0].size
                };
            }
            return { totalFiles: 0, totalSize: 0 };
        } catch (err) {
            console.error('[DB] 获取统计失败:', err);
            return { totalFiles: 0, totalSize: 0 };
        }
    }

    // 将数据库行转换为文件对象
    rowToFile(row) {
        try {
            return {
                fileKey: row.file_key,
                fileName: row.file_name,
                fileType: row.file_type,
                fileSize: row.file_size,
                content: JSON.parse(row.content || '[]'),
                wordCount: row.word_count,
                lastChapter: row.last_chapter,
                lastScrollIndex: row.last_scroll_index,
                chapterTitle: row.chapter_title,
                lastReadTime: row.last_read_time,
                customRegex: JSON.parse(row.custom_regex || '{}'),
                chapterNumbering: row.chapter_numbering,
                cover: row.cover_data_url,
                created_at: row.created_at,
                // 兼容字段
                file_key: row.file_key,
                file_name: row.file_name,
                file_type: row.file_type,
                file_size: row.file_size,
                word_count: row.word_count,
                last_chapter: row.last_chapter,
                last_scroll_index: row.last_scroll_index,
                chapter_title: row.chapter_title,
                last_read_time: row.last_read_time,
                custom_regex: row.custom_regex,
                chapter_numbering: row.chapter_numbering,
                cover_data_url: row.cover_data_url
            };
        } catch (e) {
            console.error('[DB] 数据转换失败:', e);
            return null;
        }
    }

    async close() {
        if (this.db && !this.mockMode) {
            await this.db.close();
            this.initialized = false;
        }
    }
}

// 创建全局实例
window.DatabaseBridge = new DatabaseBridge();
console.log('[DB Bridge] 数据库桥接模块已加载，APP 环境:', DB_isNative);
