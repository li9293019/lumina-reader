/**
 * 流萤阅读器 - 后台文件日志系统
 * 自动收集重要日志和报错，存储到 APP 目录，方便定期分析
 */

const logger = {
    // 配置
    config: {
        enabled: true,
        logDir: 'LuminaReader/logs',  // 日志目录（在 Documents 目录下，方便查看）
        maxFiles: 7,                   // 保留最近 7 天日志
        maxFileSize: 5 * 1024 * 1024,  // 单个文件最大 5MB
        consoleOutput: true,           // 同时输出到控制台
        logLevel: 'info'               // 最低记录级别: debug < info < warn < error
    },
    
    // 级别权重
    levels: { debug: 0, info: 1, warn: 2, error: 3 },
    
    // 状态
    isNative: false,
    initialized: false,
    currentFile: null,
    writeQueue: [],
    writing: false,
    
    /**
     * 初始化日志系统
     */
    async init() {
        if (this.initialized) return;
        
        this.isNative = typeof Capacitor !== 'undefined' && 
                        Capacitor.isNativePlatform?.() &&
                        Capacitor.Plugins?.Filesystem;
        
        console.log('[Logger] 初始化检查:', { 
            hasCapacitor: typeof Capacitor !== 'undefined',
            isNativePlatform: Capacitor?.isNativePlatform?.(),
            hasFilesystem: !!Capacitor?.Plugins?.Filesystem,
            isNative: this.isNative
        });
        
        if (!this.isNative) {
            console.log('[Logger] Web 环境，跳过文件日志');
            this.initialized = true;
            return;
        }
        
        try {
            const { Filesystem } = Capacitor.Plugins;
            
            // 创建日志目录
            try {
                await Filesystem.mkdir({
                    path: this.config.logDir,
                    directory: 'DOCUMENTS',
                    recursive: true
                });
                console.log('[Logger] 日志目录创建成功:', this.config.logDir);
            } catch (e) {
                // 目录可能已存在，尝试读取目录验证
                try {
                    const result = await Filesystem.readdir({
                        path: this.config.logDir,
                        directory: 'DOCUMENTS'
                    });
                    console.log('[Logger] 日志目录已存在，文件数:', result.files?.length || 0);
                } catch (readdirErr) {
                    console.error('[Logger] 目录创建失败且无法读取:', e.message, readdirErr.message);
                }
            }
            
            // 设置当前日志文件
            this.currentFile = this.getLogFileName();
            
            // 先测试写入一个空文件
            try {
                await Filesystem.writeFile({
                    path: this.currentFile,
                    data: '',
                    directory: 'DOCUMENTS',
                    encoding: 'utf8'
                });
                console.log('[Logger] 测试文件创建成功:', this.currentFile);
            } catch (writeErr) {
                console.error('[Logger] 测试文件创建失败:', writeErr.message);
            }
            
            // 清理旧日志
            await this.cleanupOldLogs();
            
            // 监听全局错误
            this.setupErrorHandlers();
            
            this.initialized = true;
            console.log('[Logger] 初始化完成，当前日志文件:', this.currentFile);
            
        } catch (e) {
            console.error('[Logger] 初始化失败:', e);
            this.initialized = false;
        }
    },
    
    /**
     * 获取日志文件名（按天）
     */
    getLogFileName() {
        const now = new Date();
        const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
        return `${this.config.logDir}/app_${date}.log`;
    },
    
    /**
     * 清理旧日志文件
     */
    async cleanupOldLogs() {
        try {
            const { Filesystem } = Capacitor.Plugins;
            const result = await Filesystem.readdir({
                path: this.config.logDir,
                directory: 'DOCUMENTS'
            });
            
            if (!result.files || result.files.length <= this.config.maxFiles) return;
            
            // 按文件名排序（日期）
            const logFiles = result.files
                .filter(f => f.name.endsWith('.log'))
                .sort((a, b) => a.name.localeCompare(b.name));
            
            // 删除旧文件
            const filesToDelete = logFiles.slice(0, logFiles.length - this.config.maxFiles);
            for (const file of filesToDelete) {
                try {
                    await Filesystem.deleteFile({
                        path: `${this.config.logDir}/${file.name}`,
                        directory: 'DOCUMENTS'
                    });
                } catch (e) {
                    // 忽略删除失败
                }
            }
            
            if (filesToDelete.length > 0) {
                console.log(`[Logger] 清理 ${filesToDelete.length} 个旧日志文件`);
            }
        } catch (e) {
            // 忽略清理失败
        }
    },
    
    /**
     * 设置全局错误监听
     */
    setupErrorHandlers() {
        // 捕获未处理的 Promise 错误
        window.addEventListener('unhandledrejection', (event) => {
            this.error('UnhandledRejection', '未处理的 Promise 错误', {
                reason: event.reason?.message || String(event.reason),
                stack: event.reason?.stack
            });
        });
        
        // 捕获全局 JS 错误
        window.addEventListener('error', (event) => {
            this.error('GlobalError', '全局 JS 错误', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error?.stack
            });
        });
        
        // 拦截 console.error
        const originalError = console.error;
        console.error = (...args) => {
            originalError.apply(console, args);
            if (this.initialized) {
                const message = args.map(a => this.stringify(a)).join(' ');
                this.write('error', 'Console', message);
            }
        };
        
        // 拦截 console.warn
        const originalWarn = console.warn;
        console.warn = (...args) => {
            originalWarn.apply(console, args);
            if (this.initialized) {
                const message = args.map(a => this.stringify(a)).join(' ');
                this.write('warn', 'Console', message);
            }
        };
        
        // 拦截 console.log
        const originalLog = console.log;
        console.log = (...args) => {
            originalLog.apply(console, args);
            if (this.initialized) {
                const message = args.map(a => this.stringify(a)).join(' ');
                this.write('info', 'Console', message);
            }
        };
        
        // 拦截 console.info
        const originalInfo = console.info;
        console.info = (...args) => {
            originalInfo.apply(console, args);
            if (this.initialized) {
                const message = args.map(a => this.stringify(a)).join(' ');
                this.write('info', 'Console', message);
            }
        };
        
        // 拦截 console.debug
        const originalDebug = console.debug;
        console.debug = (...args) => {
            originalDebug.apply(console, args);
            if (this.initialized) {
                const message = args.map(a => this.stringify(a)).join(' ');
                this.write('debug', 'Console', message);
            }
        };
    },
    
    /**
     * 序列化对象
     */
    stringify(obj) {
        if (typeof obj === 'string') return obj;
        if (obj instanceof Error) return obj.stack || obj.message;
        try {
            return JSON.stringify(obj);
        } catch (e) {
            return String(obj);
        }
    },
    
    /**
     * 写入日志（内部方法）
     */
    async write(level, tag, message, extra = null) {
        if (!this.initialized || !this.isNative) return;
        if (this.levels[level] < this.levels[this.config.logLevel]) return;
        
        const timestamp = new Date().toISOString();
        const logLine = this.formatLog(timestamp, level, tag, message, extra);
        
        // 检查是否需要切换文件（跨天了）
        const newFile = this.getLogFileName();
        if (newFile !== this.currentFile) {
            this.currentFile = newFile;
            await this.cleanupOldLogs();
        }
        
        // 加入写入队列
        this.writeQueue.push(logLine);
        this.processQueue();
    },
    
    /**
     * 格式化日志行
     */
    formatLog(timestamp, level, tag, message, extra) {
        let line = `[${timestamp}] [${level.toUpperCase()}] [${tag}] ${message}`;
        if (extra) {
            try {
                line += ' | ' + JSON.stringify(extra);
            } catch (e) {
                line += ' | [Object]';
            }
        }
        return line + '\n';
    },
    
    /**
     * 处理写入队列
     */
    async processQueue() {
        if (this.writing || this.writeQueue.length === 0) return;
        
        this.writing = true;
        
        try {
            const { Filesystem } = Capacitor.Plugins;
            
            // 批量写入（最多 50 条）
            const batch = this.writeQueue.splice(0, 50);
            const content = batch.join('');
            
            // 追加到文件
            try {
                await Filesystem.appendFile({
                    path: this.currentFile,
                    data: content,
                    directory: 'DOCUMENTS',
                    encoding: 'utf8'
                });
            } catch (e) {
                // 文件可能不存在，尝试创建
                await Filesystem.writeFile({
                    path: this.currentFile,
                    data: content,
                    directory: 'DOCUMENTS',
                    encoding: 'utf8'
                });
            }
        } catch (e) {
            console.error('[Logger] 写入失败:', e);
        } finally {
            this.writing = false;
            // 如果队列还有数据，继续处理
            if (this.writeQueue.length > 0) {
                setTimeout(() => this.processQueue(), 10);
            }
        }
    },
    
    // ========== 公共日志方法 ==========
    
    debug(tag, message, extra) {
        if (this.config.consoleOutput) console.debug(`[${tag}]`, message, extra || '');
        this.write('debug', tag, message, extra);
    },
    
    info(tag, message, extra) {
        if (this.config.consoleOutput) console.info(`[${tag}]`, message, extra || '');
        this.write('info', tag, message, extra);
    },
    
    warn(tag, message, extra) {
        if (this.config.consoleOutput) console.warn(`[${tag}]`, message, extra || '');
        this.write('warn', tag, message, extra);
    },
    
    error(tag, message, extra) {
        if (this.config.consoleOutput) console.error(`[${tag}]`, message, extra || '');
        this.write('error', tag, message, extra);
    },
    
    // ========== 日志管理 ==========
    
    /**
     * 获取日志文件列表
     */
    async getLogFiles() {
        if (!this.isNative) return [];
        
        try {
            const { Filesystem } = Capacitor.Plugins;
            const result = await Filesystem.readdir({
                path: this.config.logDir,
                directory: 'DOCUMENTS'
            });
            
            return result.files
                .filter(f => f.name.endsWith('.log'))
                .sort((a, b) => b.name.localeCompare(a.name));
        } catch (e) {
            return [];
        }
    },
    
    /**
     * 读取日志内容
     */
    async readLog(filename) {
        if (!this.isNative) return null;
        
        try {
            const { Filesystem } = Capacitor.Plugins;
            const result = await Filesystem.readFile({
                path: `${this.config.logDir}/${filename}`,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
            return result.data;
        } catch (e) {
            return null;
        }
    },
    
    /**
     * 导出日志（返回文件路径）
     */
    async exportLogs() {
        if (!this.isNative) return null;
        
        try {
            const files = await this.getLogFiles();
            if (files.length === 0) return null;
            
            const { Filesystem } = Capacitor.Plugins;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const exportName = `logs_export_${timestamp}.txt`;
            
            // 合并所有日志
            let allLogs = `=== 流萤阅读器日志导出 ===\n生成时间: ${new Date().toISOString()}\n\n`;
            
            for (const file of files.slice(0, 3)) { // 最近 3 天
                const content = await this.readLog(file.name);
                if (content) {
                    allLogs += `\n=== ${file.name} ===\n${content}\n`;
                }
            }
            
            // 保存到导出目录
            await Filesystem.writeFile({
                path: exportName,
                data: allLogs,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
            
            return exportName;
        } catch (e) {
            console.error('[Logger] 导出失败:', e);
            return null;
        }
    }
};

// 全局导出
window.logger = logger;
console.log('[logger] 日志系统已加载');
