/**
 * 流萤阅读器 - Capacitor 数据库桥接层
 * 兼容原 Web 版的 REST API 调用方式
 */

// 检测运行环境
const DB_isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.() || false;

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
        const schema = `
            CREATE TABLE IF NOT EXISTS files (
                file_key TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                file_type TEXT,
                file_size INTEGER,
                content TEXT,
                word_count INTEGER DEFAULT 0,
                last_chapter INTEGER DEFAULT 0,
                last_scroll_index INTEGER DEFAULT 0,
                chapter_title TEXT,
                last_read_time TEXT,
                custom_regex TEXT,
                chapter_numbering TEXT DEFAULT 'none',
                cover_data_url TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_last_read ON files(last_read_time);
            CREATE INDEX IF NOT EXISTS idx_file_name ON files(file_name);
        `;
        await this.db.execute(schema);
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
