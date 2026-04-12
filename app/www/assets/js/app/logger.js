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
            
            // 尝试使用默认文件名
            const defaultFile = this.getLogFileName();
            let success = await this._tryCreateLogFile(defaultFile);
            
            if (success) {
                this.currentFile = defaultFile;
                console.log('[Logger] 使用默认日志文件:', this.currentFile);
            } else {
                // 默认文件名不可用，查找今天已有的可写文件（可能是之前创建的）
                console.warn('[Logger] 默认文件名不可用，查找今天已有的日志文件');
                
                const todayFile = await this._findWritableTodayFile();
                if (todayFile) {
                    this.currentFile = todayFile;
                    console.log('[Logger] 复用今天已有的日志文件:', this.currentFile);
                } else {
                    // 没有可用文件，创建新的
                    console.log('[Logger] 没有找到可用文件，创建新的');
                    for (let i = 0; i < 10; i++) {
                        const suffix = Math.random().toString(36).substring(2, 8);
                        const newFile = this.getLogFileName(suffix);
                        success = await this._tryCreateLogFile(newFile);
                        
                        if (success) {
                            this.currentFile = newFile;
                            console.log('[Logger] 创建新日志文件:', this.currentFile);
                            break;
                        }
                    }
                    
                    if (!success) {
                        console.error('[Logger] 无法创建日志文件，禁用文件日志');
                        this.initialized = false;
                        return;
                    }
                }
            }
            
            // 清理旧日志（保留最近7天）
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
     * 获取日志文件名（按天，本地时间）
     */
    getLogFileName(suffix = '') {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const date = `${year}-${month}-${day}`;
        return suffix 
            ? `${this.config.logDir}/app_${date}_${suffix}.log`
            : `${this.config.logDir}/app_${date}.log`;
    },
    
    /**
     * 查找今天已有的可写日志文件
     * 用于APP重启后复用之前创建的带后缀文件
     * @returns {string|null} 可写文件路径或null
     */
    async _findWritableTodayFile() {
        try {
            const { Filesystem } = Capacitor.Plugins;
            const result = await Filesystem.readdir({
                path: this.config.logDir,
                directory: 'DOCUMENTS'
            });
            
            if (!result.files || result.files.length === 0) return null;
            
            // 获取今天日期前缀 app_2026-04-12
            const defaultFileName = this.getLogFileName().split('/').pop();
            const todayPrefix = defaultFileName.replace('.log', '');
            
            // 筛选今天的文件（app_2026-04-12_xxx.log）
            for (const file of result.files) {
                const fileName = file.name || file;
                
                if (!fileName.endsWith('.log')) continue;
                if (!fileName.startsWith(todayPrefix)) continue;
                
                const filePath = `${this.config.logDir}/${fileName}`;
                
                // 跳过默认文件名（不带后缀的），因为已知它不可写
                if (fileName === defaultFileName) continue;
                
                // 测试是否可写（追加空内容）
                try {
                    await Filesystem.appendFile({
                        path: filePath,
                        data: '',
                        directory: 'DOCUMENTS',
                        encoding: 'utf8'
                    });
                    console.log('[Logger] 复用今天日志文件:', fileName);
                    return filePath;
                } catch (e) {
                    continue;
                }
            }
            
            return null;
        } catch (e) {
            return null;
        }
    },
    
    /**
     * 尝试创建/验证日志文件
     * @param {string} filePath - 文件路径
     * @returns {boolean} 是否成功（文件可写）
     */
    async _tryCreateLogFile(filePath) {
        const { Filesystem } = Capacitor.Plugins;
        
        // 先检查文件是否存在
        let fileExists = false;
        let fileSize = 0;
        try {
            const stat = await Filesystem.stat({
                path: filePath,
                directory: 'DOCUMENTS'
            });
            fileExists = true;
            fileSize = stat.size || 0;
        } catch (e) {
            fileExists = false;
        }
        
        if (fileExists) {
            // 文件存在，测试是否可写（关键！）
            try {
                await Filesystem.appendFile({
                    path: filePath,
                    data: '',
                    directory: 'DOCUMENTS',
                    encoding: 'utf8'
                });
                console.log('[Logger] 现有文件可写:', filePath, '大小:', fileSize);
                return true;
            } catch (e) {
                console.warn('[Logger] 现有文件不可写:', filePath, e.message);
                return false;
            }
        }
        
        // 文件不存在，尝试创建
        try {
            await Filesystem.writeFile({
                path: filePath,
                data: `[${new Date().toLocaleString()}] [INFO] [Logger] 日志系统初始化\n`,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
            console.log('[Logger] 创建新日志文件:', filePath);
            return true;
        } catch (e) {
            console.warn('[Logger] 创建文件失败:', e.message);
            return false;
        }
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
        // 防止重复设置
        if (window.__logger_handlers_installed__) {
            console.log('[Logger] 错误处理程序已安装，跳过');
            return;
        }
        window.__logger_handlers_installed__ = true;
        
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
        
        // 监听 APP 生命周期事件（Capacitor 环境）
        this._setupAppLifecycleListeners();
    },
    
    /**
     * 设置 APP 生命周期监听
     */
    _setupAppLifecycleListeners() {
        // 页面即将卸载（APP 被关闭或切换）
        window.addEventListener('beforeunload', () => {
            console.log('[Logger] APP 即将退出');
            // 同步写入最后一条日志
            if (this.initialized && this.isNative && this.writeQueue.length > 0) {
                this._flushSync();
            }
        });
        
        // APP 切换到后台（visibilitychange 更可靠）
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                console.log('[Logger] APP 进入后台');
            } else if (document.visibilityState === 'visible') {
                console.log('[Logger] APP 回到前台');
            }
        });
        
        // Capacitor App 插件（如果可用）
        if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.App) {
            const { App } = Capacitor.Plugins;
            
            // APP 被暂停（进入后台）
            App.addListener('pause', () => {
                console.log('[Logger] APP 暂停（进入后台）');
            });
            
            // APP 被恢复（回到前台）
            App.addListener('resume', () => {
                console.log('[Logger] APP 恢复（回到前台）');
            });
            
            // APP 即将终止
            App.addListener('appStateChange', (state) => {
                if (!state.isActive) {
                    console.log('[Logger] APP 状态变为非活跃');
                }
            });
        }
    },
    
    /**
     * 同步刷新日志队列（用于页面卸载前）
     */
    _flushSync() {
        try {
            const content = this.writeQueue.join('');
            this.writeQueue = [];
            
            // 使用同步 XHR 发送日志（仅作为后备）
            // 实际文件写入是异步的，这里只能尽力而为
            if (content && typeof navigator !== 'undefined' && navigator.sendBeacon) {
                navigator.sendBeacon('data:text/plain,' + encodeURIComponent(content));
            }
        } catch (e) {
            // 忽略刷新失败
        }
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
        
        // 使用本地时间格式：YYYY-MM-DD HH:mm:ss
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
        const logLine = this.formatLog(timestamp, level, tag, message, extra);
        
        // 检查是否需要切换文件（跨天了）
        // 从 currentFile 中提取日期部分，与今天比较
        const todayFile = this.getLogFileName();
        const currentFileDate = this.currentFile.match(/app_(\d{4}-\d{2}-\d{2})/)?.[1];
        const todayDate = todayFile.match(/app_(\d{4}-\d{2}-\d{2})/)?.[1];
        
        if (currentFileDate !== todayDate) {
            // 跨天了，创建新文件（保留后缀）
            const suffix = this.currentFile.includes('_') ? 
                this.currentFile.split('_').pop().replace('.log', '') : '';
            this.currentFile = suffix ? this.getLogFileName(suffix) : todayFile;
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
            let success = false;
            try {
                await Filesystem.appendFile({
                    path: this.currentFile,
                    data: content,
                    directory: 'DOCUMENTS',
                    encoding: 'utf8'
                });
                success = true;
            } catch (e) {
                // 追加失败，尝试删除并重建
                try {
                    await Filesystem.deleteFile({
                        path: this.currentFile,
                        directory: 'DOCUMENTS'
                    });
                } catch (deleteErr) {
                    // 删除失败忽略
                }
                
                // 尝试重新创建
                try {
                    await Filesystem.writeFile({
                        path: this.currentFile,
                        data: content,
                        directory: 'DOCUMENTS',
                        encoding: 'utf8'
                    });
                    success = true;
                } catch (writeErr) {
                    // 重建也失败，需要切换文件
                    success = false;
                }
            }
            
            // 如果写入失败，切换到新文件
            if (!success) {
                console.error('[Logger] 写入失败，切换到新文件');
                const suffix = Math.random().toString(36).substring(2, 8);
                this.currentFile = this.getLogFileName(suffix);
                
                // 尝试写入新文件
                try {
                    await Filesystem.writeFile({
                        path: this.currentFile,
                        data: content,
                        directory: 'DOCUMENTS',
                        encoding: 'utf8'
                    });
                    console.log('[Logger] 已切换到新文件:', this.currentFile);
                } catch (e2) {
                    console.error('[Logger] 新文件也失败，丢弃日志:', e2.message);
                }
            }
        } catch (e) {
            console.error('[Logger] 写入异常:', e);
        } finally {
            this.writing = false;
            // 如果队列还有数据，继续处理
            if (this.writeQueue.length > 0) {
                setTimeout(() => this.processQueue(), 100);
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
