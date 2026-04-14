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
        this.coverCache = new Map(); // 内存缓存大封面数据，避免 getList() 反复搬运 base64
    }

    async init() {
        console.log('[DB] 初始化开始，环境:', DB_isNative ? 'APP' : 'Web');

        if (!DB_isNative) {
            console.log('[DB] Web 模式：使用 fetch API');
            this.initialized = true;
            return;
        }

        try {
            // 获取 Capacitor SQLite 插件（通过 Capacitor.Plugins）
            const sqlitePlugin = Capacitor?.Plugins?.CapacitorSQLite;
            if (!sqlitePlugin) {
                console.warn('[DB] CapacitorSQLite 插件未找到，使用内存模式');
                console.warn('[DB] 可用插件:', Object.keys(Capacitor?.Plugins || {}));
                this.mockMode = true;
                this.initialized = true;
                return;
            }
            
            console.log('[DB] CapacitorSQLite 插件已找到');
            this.sqlite = sqlitePlugin;
            
            // 使用插件原生方法创建数据库连接
            await this.sqlite.createConnection({
                database: 'lumina_reader',
                encrypted: false,
                mode: 'no-encryption',
                version: 1
            });
            
            await this.sqlite.open({ database: 'lumina_reader' });
            console.log('[DB] SQLite 数据库已打开');
            
            // 创建 db 适配器，保持与原 SQLiteConnection 相同的 API
            const DB_NAME = 'lumina_reader';
            this.db = {
                execute: async (statements) => {
                    return this.sqlite.execute({ database: DB_NAME, statements });
                },
                query: async (statement, values = []) => {
                    const result = await this.sqlite.query({ database: DB_NAME, statement, values });
                    return { values: result.values || [] };
                },
                run: async (statement, values = []) => {
                    return this.sqlite.run({ database: DB_NAME, statement, values });
                },
                close: async () => {
                    return this.sqlite.closeConnection({ database: DB_NAME });
                }
            };

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
                total_items INTEGER DEFAULT 0,
                last_chapter INTEGER DEFAULT 0,
                last_scroll_index INTEGER DEFAULT 0,
                chapter_title TEXT,
                last_read_time TEXT,
                custom_regex TEXT,
                chapter_numbering TEXT DEFAULT 'none',
                cover_data_url TEXT,
                heat_map TEXT,
                metadata TEXT,
                created_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_last_read ON files(last_read_time);
            CREATE INDEX IF NOT EXISTS idx_file_name ON files(file_name);
        `;
        await this.db.execute(baseSchema);
        
        // 兼容旧数据库：检查并添加新字段
        await this.addColumnIfNotExists('files', 'created_at', 'TEXT');
        await this.addColumnIfNotExists('files', 'heat_map', 'TEXT');
        await this.addColumnIfNotExists('files', 'metadata', 'TEXT');
        await this.addColumnIfNotExists('files', 'total_items', 'INTEGER DEFAULT 0');
        await this.addColumnIfNotExists('files', 'content_size', 'INTEGER DEFAULT 0');
    }

    async addColumnIfNotExists(table, column, type) {
        try {
            const checkResult = await this.db.query(
                `SELECT COUNT(*) as cnt FROM pragma_table_info('${table}') WHERE name='${column}'`
            );
            if (checkResult.values && checkResult.values[0].cnt === 0) {
                await this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
                console.log(`[DB] 已添加 ${column} 字段`);
            }
        } catch (e) {
            console.log(`[DB] 检查/添加 ${column} 字段失败:`, e);
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
                    file_key, file_name, file_type, file_size, content_size, content, word_count, total_items,
                    last_chapter, last_scroll_index, chapter_title, last_read_time,
                    custom_regex, chapter_numbering, cover_data_url, heat_map, metadata, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                fileKey,
                data.fileName || data.file_name || '',
                data.fileType || data.file_type || 'txt',
                data.fileSize || data.file_size || 0,
                contentSize,
                contentJson,
                data.wordCount || data.word_count || 0,
                data.totalItems || data.total_items || 0,  // 总段落数，用于精确计算阅读进度
                data.lastChapter || data.last_chapter || 0,
                data.lastScrollIndex || data.last_scroll_index || 0,
                data.chapterTitle || data.chapter_title || '',
                data.lastReadTime || data.last_read_time || getLocalTimeString(),
                JSON.stringify(data.customRegex || data.custom_regex || {}),
                data.chapterNumbering || data.chapter_numbering || 'none',
                data.cover || data.cover_data_url || null,
                data.heatMap ? JSON.stringify(data.heatMap) : null,
                data.metadata ? JSON.stringify(data.metadata) : null,
                createdAt
            ];
            await this.db.run(sql, params);
            if (data.cover !== undefined) {
                this.coverCache.set(fileKey, data.cover || null);
            }
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
                const file = this.rowToFile(result.values[0]);
                if (file && file.cover) {
                    this.coverCache.set(fileKey, file.cover);
                }
                return file;
            }
            return null;
        } catch (err) {
            console.error('[DB] 获取失败:', err);
            return null;
        }
    }

    async patch(fileKey, data) {
        // 部分更新：只更新 data 中显式提供的字段，不触碰 content
        if (this.mockMode) {
            const existing = this.memoryStore.get(fileKey) || {};
            this.memoryStore.set(fileKey, { ...existing, ...data });
            return { success: true };
        }

        try {
            // 注意：不预先 get()，避免解析大 content 的 JSON；直接执行 UPDATE
            const fieldMap = {
                fileName: 'file_name',
                fileType: 'file_type',
                fileSize: 'file_size',
                contentSize: 'content_size',
                // content 被有意排除：patch 不触碰 content 列
                wordCount: 'word_count',
                totalItems: 'total_items',
                lastChapter: 'last_chapter',
                lastScrollIndex: 'last_scroll_index',
                chapterTitle: 'chapter_title',
                lastReadTime: 'last_read_time',
                customRegex: 'custom_regex',
                chapterNumbering: 'chapter_numbering',
                cover: 'cover_data_url',
                heatMap: 'heat_map',
                metadata: 'metadata',
                created_at: 'created_at'
            };

            const updates = [];
            const values = [];
            for (const [key, col] of Object.entries(fieldMap)) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    let val = data[key];
                    if (key === 'customRegex' || key === 'heatMap' || key === 'metadata') {
                        val = val ? JSON.stringify(val) : null;
                    }
                    updates.push(`${col} = ?`);
                    values.push(val);
                }
            }
            if (updates.length === 0) {
                return { success: true };
            }
            values.push(fileKey);
            const sql = `UPDATE files SET ${updates.join(', ')} WHERE file_key = ?`;
            await this.db.run(sql, values);
            if (data.cover !== undefined) {
                this.coverCache.set(fileKey, data.cover || null);
            }
            return { success: true };
        } catch (err) {
            console.error('[DB] Patch failed:', err);
            return { success: false, error: err.message };
        }
    }

    async delete(fileKey) {
        if (this.mockMode) {
            this.memoryStore.delete(fileKey);
            this.coverCache.delete(fileKey);
            return { success: true };
        }

        try {
            await this.db.run('DELETE FROM files WHERE file_key = ?', [fileKey]);
            this.coverCache.delete(fileKey);
            return { success: true };
        } catch (err) {
            console.error('[DB] 删除失败:', err);
            return { success: false, error: err.message };
        }
    }

    async getList(includeCover = false) {
        if (this.mockMode) {
            return Array.from(this.memoryStore.values());
        }

        try {
            const coverCol = includeCover ? ', cover_data_url' : '';
            // 与 WEB 端统一：file_size 始终为 content_size + cover 长度
            const sizeExpr = '(content_size + LENGTH(COALESCE(cover_data_url, "")))';
            const result = await this.db.query(
                `SELECT file_key, file_name, file_type, ${sizeExpr} as file_size,
                    word_count, total_items, last_chapter, last_scroll_index, chapter_title,
                    last_read_time, chapter_numbering, created_at, metadata${coverCol}
                FROM files ORDER BY last_read_time DESC`
            );
            return (result.values || []).map(row => {
                const item = {
                    fileKey: row.file_key,
                    fileName: row.file_name,
                    fileType: row.file_type,
                    fileSize: row.file_size,
                    wordCount: row.word_count,
                    totalItems: row.total_items || 0,
                    lastChapter: row.last_chapter,
                    lastScrollIndex: row.last_scroll_index,
                    chapterTitle: row.chapter_title,
                    lastReadTime: row.last_read_time,
                    chapterNumbering: row.chapter_numbering,
                    created_at: row.created_at,
                    metadata: row.metadata
                };
                if (includeCover && row.cover_data_url) {
                    item.cover = row.cover_data_url;
                    this.coverCache.set(row.file_key, row.cover_data_url);
                }
                // 解析 metadata JSON
                if (row.metadata) {
                    try {
                        item.metadata = JSON.parse(row.metadata);
                    } catch (e) {
                        item.metadata = {};
                    }
                } else {
                    item.metadata = {};
                }
                return item;
            });
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
            const file = {
                fileKey: row.file_key,
                fileName: row.file_name,
                fileType: row.file_type,
                fileSize: row.file_size,
                content: JSON.parse(row.content || '[]'),
                wordCount: row.word_count,
                totalItems: row.total_items || 0,  // 总段落数，用于精确计算阅读进度
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
                total_items: row.total_items || 0,
                last_chapter: row.last_chapter,
                last_scroll_index: row.last_scroll_index,
                chapter_title: row.chapter_title,
                last_read_time: row.last_read_time,
                custom_regex: row.custom_regex,
                chapter_numbering: row.chapter_numbering,
                cover_data_url: row.cover_data_url
            };
            // 解析 heatMap
            if (row.heat_map) {
                try {
                    file.heatMap = JSON.parse(row.heat_map);
                } catch (e) {
                    file.heatMap = null;
                }
            }
            // 解析 metadata
            if (row.metadata) {
                try {
                    file.metadata = JSON.parse(row.metadata);
                } catch (e) {
                    file.metadata = null;
                }
            }
            return file;
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
const dbBridge = new DatabaseBridge();
window.dbBridge = dbBridge;
window.DatabaseBridge = dbBridge;
console.log('[DB Bridge] 数据库桥接模块已加载，APP 环境:', DB_isNative);
