# Lumina Reader APP 端技术架构与原生集成指南

> **文档定位**：面向 Android APP 开发的技术深度解析  
> **技术栈**：Capacitor 6 + Android Native + WebView  
> **核心挑战**：Web 与 Native 的无缝融合、离线优先的移动端实现

---

## 目录

1. [APP 端架构总览](#1-app-端架构总览)
   - 1.1 Capacitor 6 架构定位
   - 1.2 Web 与 Native 的边界划分
   - 1.3 离线优先的移动端实现
   - 1.4 APP 端特有挑战

2. [存储层深度解析](#2-存储层深度解析)
   - 2.1 Capacitor SQLite 原生存储
   - 2.2 存储适配器模式实现
   - 2.3 数据库 Schema 设计
   - 2.4 大数据量性能优化
   - 2.5 存储迁移策略（Web ↔ App）

3. [文件系统与桥接层](#3-文件系统与桥接层)
   - 3.1 Capacitor Filesystem API 封装
   - 3.2 文件导出/导入实现
   - 3.3 系统文件管理器集成（Intent）
   - 3.4 文件权限管理
   - 3.5 大文件处理与流式读写

4. [原生功能集成](#4-原生功能集成)
   - 4.1 状态栏与导航栏控制
   - 4.2 系统文件选择器（Android 原生）
   - 4.3 物理按键处理（返回键）
   - 4.4 通知与 Toast（原生 vs Web）
   - 4.5 电池与性能优化

5. [WebView 优化与安全](#5-webview-优化与安全)
   - 5.1 WebView 配置策略
   - 5.2 离线资源管理（file:// 协议）
   - 5.3 CORS 与混合内容策略
   - 5.4 JavaScript 桥接安全
   - 5.5 内存管理（图片、DOM）

6. [构建与打包系统](#6-构建与打包系统)
   - 6.1 Capacitor 配置详解
   - 6.2 Android Gradle 配置
   - 6.3 签名与发布流程
   - 6.4 多渠道打包策略
   - 6.5 热更新方案

7. [APP 端性能优化](#7-app-端性能优化)
   - 7.1 启动时间优化
   - 7.2 WebView 渲染加速
   - 7.3 图片内存管理
   - 7.4 数据库查询优化
   - 7.5 后台与前台切换处理

8. [调试与诊断](#8-调试与诊断)
   - 8.1 Chrome DevTools 远程调试
   - 8.2 Android Studio Logcat 分析
   - 8.3 性能分析工具
   - 8.4 错误上报与监控

9. [平台差异处理](#9-平台差异处理)
   - 9.1 Web vs App 能力检测
   - 9.2 平台特定代码隔离
   - 9.3 降级策略实现
   - 9.4 兼容性测试矩阵

10. [附录：API 参考](#10-附录api-参考)

---

## 1. APP 端架构总览

### 1.1 Capacitor 6 架构定位

Lumina Reader APP 端采用 **Capacitor 6** 作为跨平台桥梁。与 Cordova/Ionic 不同，Capacitor 的设计理念是：

> **"Native 是 Native，Web 是 Web，但两者可以优雅协作"**

**架构层级**：

```
┌─────────────────────────────────────────────────────────────┐
│                     Android Native Layer                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Activity   │  │ Capacitor    │  │   Native     │      │
│  │  (MainActivity)│  │   Bridge     │  │   Plugins    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │             │
│         └──────────────────┼──────────────────┘             │
│                            ▼                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    WebView Container                  │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │              Lumina Web App (www/)              │  │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐       │  │  │
│  │  │  │   Core   │ │  Plugins │ │ Bridges  │       │  │  │
│  │  │  │  Modules │ │  (Azure) │ │(DB/File) │       │  │  │
│  │  │  └──────────┘ └──────────┘ └──────────┘       │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**关键特点**：
- **零 Web 容器依赖**：Capacitor 不修改 Web 代码，纯 WebView 加载
- **按需 Native 能力**：仅需要的原生功能才通过 Bridge 暴露
- **标准 Web 技术**：HTML/CSS/JS 无需适配，可直接在浏览器开发测试

### 1.2 Web 与 Native 的边界划分

**Web 层负责**：
- 所有业务逻辑（解析、渲染、UI）
- 跨平台通用代码（90%+ 代码在此）
- 通过 Capacitor API 调用原生能力

**Native 层负责**：
- 文件系统访问（超出 WebView 沙盒）
- 原生 SQLite 数据库（比 Web SQL/IndexedDB 性能更好）
- 系统级集成（分享、通知、文件打开）
- 硬件访问（TTS 引擎、状态栏）

**桥接层（Bridges）职责**：
- 封装 Capacitor API 为应用级接口
- 处理平台差异（Web vs App）
- 提供降级策略（Capacitor 不可用时回退到 Web 实现）

### 1.3 离线优先的移动端实现

**核心理念**：APP 端必须是完全离线的，不依赖任何云服务。

**实现策略**：

1. **资源离线化**：
   - 所有 HTML/CSS/JS 打包在 APK 内（`app/src/main/assets/`）
   - 字体文件本地嵌入（避免网络加载失败）
   - 图片懒加载 + 本地缓存

2. **数据本地存储**：
   - 书籍内容：Capacitor SQLite（原生性能）
   - 用户配置：SharedPreferences（通过 Capacitor Preferences API）
   - 缓存文件：应用私有目录（`Context.getFilesDir()`）

3. **零外部请求**：
   - WebView 禁止加载远程资源（CSP 策略）
   - 字体、图标全部本地
   - 分析统计不上传

### 1.4 APP 端特有挑战

| 挑战 | Web 端 | APP 端 | 解决方案 |
|------|--------|--------|----------|
| 存储限制 | IndexedDB 50MB+ | SQLite 无限制 | Capacitor SQLite Plugin |
| 文件访问 | File System API（受限） | 完整文件系统 | Capacitor Filesystem API |
| 后台运行 | 页面冻结 | 可后台播放TTS | 原生服务绑定 |
| 权限管理 | 浏览器统一处理 | 运行时申请 | Android Permission API |
| 启动速度 | 网络下载 | 本地加载 | 资源预打包 |
| 内存管理 | 浏览器负责 | 需主动管理 | 图片懒加载、页面回收 |

---

## 2. 存储层深度解析

### 2.1 Capacitor SQLite 原生存储

**为什么选择 SQLite 而非 IndexedDB？**

1. **性能**：SQLite 是原生 C 实现，比 JavaScript 实现的 IndexedDB 快 5-10 倍
2. **容量**：IndexedDB 在 WebView 中有 50MB-250MB 限制，SQLite 无限制
3. **查询能力**：SQL 查询比 IndexedDB 的 cursor 遍历更灵活
4. **事务支持**：完整 ACID 事务，确保数据一致性

**技术实现**：

```javascript
// db.js - CapacitorSQLiteImpl 核心实现
class CapacitorSQLiteImpl {
    constructor() {
        this.db = null;
        this.isReady = false;
    }
    
    async init() {
        // 使用 @capacitor-community/sqlite 插件
        const sqlite = Capacitor.Plugins['SQLite'];
        
        // 创建/打开数据库
        this.db = await sqlite.createConnection({
            database: 'lumina_reader.db',
            encrypted: false,  // 如需加密可开启
            mode: 'no-encryption'
        });
        
        await this.db.open();
        await this.createTables();
        this.isReady = true;
        return true;
    }
    
    async createTables() {
        // 书籍表
        await this.db.execute(`
            CREATE TABLE IF NOT EXISTS books (
                fileKey TEXT PRIMARY KEY,
                fileName TEXT NOT NULL,
                fileType TEXT,
                fileSize INTEGER,
                content TEXT,           -- 文本内容（压缩存储）
                wordCount INTEGER,
                lastChapter INTEGER,
                lastScrollIndex INTEGER,
                chapterTitle TEXT,
                lastReadTime TEXT,
                customRegex TEXT,       -- JSON 字符串
                chapterNumbering TEXT,
                annotations TEXT,       -- JSON 数组
                cover TEXT,             -- Base64 封面
                heatMap TEXT            -- JSON 热力图数据
            )
        `);
        
        // 索引优化查询
        await this.db.execute(`
            CREATE INDEX IF NOT EXISTS idx_lastReadTime 
            ON books(lastReadTime DESC)
        `);
    }
    
    async saveFile(fileKey, data) {
        const sql = `
            INSERT OR REPLACE INTO books 
            (fileKey, fileName, fileType, content, ...)
            VALUES (?, ?, ?, ?, ...)
        `;
        await this.db.run(sql, [
            fileKey, 
            data.fileName, 
            data.fileType,
            this.compressContent(data.content),  // 压缩大文本
            ...
        ]);
    }
}
```

**内容压缩策略**：

```javascript
// 大文本压缩存储（减少 50%+ 存储空间）
compressContent(text) {
    if (!text || text.length < 1000) return text;
    
    try {
        // 使用 lz-string 库压缩
        return LZString.compressToUTF16(text);
    } catch (e) {
        return text;  // 压缩失败返回原文
    }
}

decompressContent(compressed) {
    if (!compressed) return '';
    if (compressed.length < 1000) return compressed;  // 未压缩
    
    try {
        return LZString.decompressFromUTF16(compressed);
    } catch (e) {
        return compressed;  // 解压失败返回原数据
    }
}
```

### 2.2 存储适配器模式实现

**为什么需要适配器模式？**

APP 端可能面临多种存储环境：
- 理想情况：Capacitor SQLite（性能最佳）
- 降级情况：Web SQLite（wasm 实现）
- 最坏情况：IndexedDB（兼容性最好）

**适配器实现**：

```javascript
// db.js - 存储适配器基类
class StorageAdapter {
    constructor() {
        this.impl = null;
        this.type = null;
    }
    
    async use(type) {
        this.type = type;
        
        switch(type) {
            case 'capacitor':
                this.impl = new CapacitorSQLiteImpl();
                break;
            case 'sqlite':
                this.impl = new WebSQLiteImpl();  // sql.js wasm
                break;
            case 'indexeddb':
                this.impl = new IndexedDBImpl();
                break;
            default:
                throw new Error(`Unknown storage type: ${type}`);
        }
        
        const ready = await this.impl.init();
        
        // 降级策略：如果首选存储失败，自动降级
        if (!ready && type === 'capacitor') {
            console.warn('Capacitor SQLite failed, fallback to IndexedDB');
            return this.use('indexeddb');
        }
        
        return ready;
    }
    
    // 统一接口
    async saveFile(fileKey, data) {
        return this.impl.saveFile(fileKey, data);
    }
    
    async getFile(fileKey) {
        return this.impl.getFile(fileKey);
    }
    
    async getAllFiles() {
        return this.impl.getAllFiles();
    }
    
    async deleteFile(fileKey) {
        return this.impl.deleteFile(fileKey);
    }
    
    // ... 更多统一接口
}
```

**初始化流程**：

```javascript
// init.js - 存储初始化
const initStorage = async () => {
    const isCapacitor = typeof Capacitor !== 'undefined' 
        && Capacitor.isNativePlatform?.();
    
    let storageType = 'indexeddb';
    
    if (isCapacitor) {
        storageType = 'capacitor';
    } else if (location.href.startsWith('http')) {
        storageType = 'sqlite';  // Web 端尝试 SQLite wasm
    }
    
    Lumina.DB.adapter = new StorageAdapter();
    const ready = await Lumina.DB.adapter.use(storageType);
    
    if (!ready) {
        console.error('All storage backends failed');
        // 进入只读模式或提示用户
    }
};
```

### 2.3 数据库 Schema 设计

**核心表结构**：

```sql
-- 主表：书籍存储
CREATE TABLE books (
    fileKey TEXT PRIMARY KEY,           -- 文件唯一标识
    fileName TEXT NOT NULL,             -- 原始文件名
    fileType TEXT,                      -- 扩展名（txt/md/pdf...）
    fileSize INTEGER,                   -- 文件大小（字节）
    content TEXT,                       -- 文本内容（可能压缩）
    wordCount INTEGER,                  -- 阅读字数统计
    
    -- 阅读进度
    lastChapter INTEGER DEFAULT 0,      -- 最后阅读章节索引
    lastScrollIndex INTEGER DEFAULT 0,  -- 最后阅读段落索引
    chapterTitle TEXT,                  -- 最后阅读章节标题
    lastReadTime TEXT,                  -- ISO 8601 时间戳
    
    -- 个性化设置
    customRegex TEXT,                   -- JSON：{chapter, section}
    chapterNumbering TEXT,              -- 编号策略
    annotations TEXT,                   -- JSON：批注数组
    
    -- 元数据
    cover TEXT,                         -- Base64 封面图
    heatMap TEXT,                       -- JSON：热力图数据
    importedAt TEXT                     -- 导入时间
);

-- 索引
CREATE INDEX idx_lastReadTime ON books(lastReadTime DESC);
CREATE INDEX idx_fileName ON books(fileName);

-- 辅助表：阅读统计（可选扩展）
CREATE TABLE reading_stats (
    fileKey TEXT,
    date TEXT,                          -- YYYY-MM-DD
    minutesRead INTEGER,                -- 阅读分钟数
    wordsRead INTEGER,                  -- 阅读字数
    FOREIGN KEY (fileKey) REFERENCES books(fileKey)
);
```

**字段设计原则**：
- **JSON 字段**：用于存储结构化但不常查询的数据（annotations, heatMap）
- **压缩字段**：大文本 content 使用 lz-string 压缩
- **时间戳**：使用 ISO 8601 字符串（SQLite 无原生 Date 类型）
- **外键约束**：阅读统计表关联书籍表

### 2.4 大数据量性能优化

**挑战**：百万字小说存储与查询

**优化策略**：

1. **分页查询**：
```javascript
// 书库列表分页加载（避免一次性加载全部）
async getBooksPage(page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    const sql = `
        SELECT fileKey, fileName, fileType, wordCount, 
               lastChapter, lastReadTime, cover
        FROM books
        ORDER BY lastReadTime DESC
        LIMIT ? OFFSET ?
    `;
    return this.db.query(sql, [pageSize, offset]);
}
```

2. **懒加载内容**：
```javascript
// 书籍元数据与内容分离
async getBookMetadata(fileKey) {
    // 只查询元数据，不查 content（可能几 MB）
    const sql = `
        SELECT fileKey, fileName, fileType, wordCount, 
               lastChapter, lastReadTime, cover
        FROM books WHERE fileKey = ?
    `;
    return this.db.query(sql, [fileKey]);
}

async getBookContent(fileKey) {
    // 单独查询内容
    const sql = `SELECT content FROM books WHERE fileKey = ?`;
    const result = await this.db.query(sql, [fileKey]);
    return this.decompressContent(result.values[0].content);
}
```

3. **批量操作事务**：
```javascript
// 批量导入使用事务
async importBatch(books, onProgress) {
    await this.db.execute('BEGIN TRANSACTION');
    
    try {
        for (let i = 0; i < books.length; i++) {
            await this.saveFile(books[i].fileKey, books[i]);
            onProgress?.(i + 1, books.length);
        }
        await this.db.execute('COMMIT');
    } catch (e) {
        await this.db.execute('ROLLBACK');
        throw e;
    }
}
```

### 2.5 存储迁移策略（Web ↔ App）

**场景**：用户在 Web 端阅读，迁移到 APP 端继续阅读

**实现方案**：

```javascript
// 通过配置文件实现数据迁移
class DataMigration {
    // 导出（Web 端）
    async exportForApp() {
        const books = await Lumina.DB.adapter.getAllFiles();
        
        // 构建迁移包
        const migrationPackage = {
            version: 1,
            exportTime: new Date().toISOString(),
            books: books.map(book => ({
                fileKey: book.fileKey,
                fileName: book.fileName,
                // 注意：不导出 content（太大），只导出进度和设置
                lastChapter: book.lastChapter,
                lastScrollIndex: book.lastScrollIndex,
                annotations: book.annotations,
                heatMap: book.heatMap,
                lastReadTime: book.lastReadTime
            })),
            settings: Lumina.ConfigManager.load()
        };
        
        return JSON.stringify(migrationPackage);
    }
    
    // 导入（APP 端）
    async importFromWeb(migrationJson) {
        const data = JSON.parse(migrationJson);
        
        // 导入设置
        Lumina.ConfigManager.save(data.settings);
        
        // 导入书籍元数据（等待用户重新打开文件时匹配）
        for (const book of data.books) {
            // 存储为"待匹配"状态
            await this.savePendingBook(book);
        }
    }
    
    // 文件打开时匹配进度
    async matchBookProgress(fileKey, fileName) {
        const pending = await this.getPendingBook(fileName);
        if (pending) {
            // 找到之前 Web 端的进度
            return {
                lastChapter: pending.lastChapter,
                lastScrollIndex: pending.lastScrollIndex,
                annotations: pending.annotations
            };
        }
        return null;
    }
}
```

---

## 3. 文件系统与桥接层

### 3.1 Capacitor Filesystem API 封装

**核心能力**：
- 读取/写入应用私有目录（`files/`、`cache/`）
- 访问公共目录（Downloads、Documents 等，需权限）
- 目录遍历、文件复制/移动/删除

**封装实现**：

```javascript
// exporter-bridge.js
class FileSystemBridge {
    constructor() {
        this.filesystem = Capacitor.Plugins['Filesystem'];
        this.isAvailable = !!this.filesystem;
    }
    
    // 检查可用性
    checkAvailability() {
        if (!this.isAvailable) {
            throw new Error('Filesystem API not available');
        }
    }
    
    // 写入文件（私有目录）
    async writePrivateFile(path, data, options = {}) {
        this.checkAvailability();
        
        const result = await this.filesystem.writeFile({
            path: path,
            data: data,
            directory: 'DOCUMENTS',  // 应用文档目录
            encoding: options.binary ? undefined : 'utf8',
            recursive: true  // 自动创建目录
        });
        
        return result.uri;  // 返回文件 URI
    }
    
    // 写入公共 Download 目录
    async writeDownloadFile(fileName, data) {
        this.checkAvailability();
        
        // Android 10+ 需要 REQUEST_LEGACY_STORAGE 或 MANAGE_EXTERNAL_STORAGE
        const result = await this.filesystem.writeFile({
            path: `Download/${fileName}`,
            data: data,
            directory: 'EXTERNAL_STORAGE',
            encoding: 'utf8'
        });
        
        return result.uri;
    }
    
    // 读取文件
    async readFile(path, options = {}) {
        this.checkAvailability();
        
        const result = await this.filesystem.readFile({
            path: path,
            directory: options.directory || 'DOCUMENTS',
            encoding: options.binary ? undefined : 'utf8'
        });
        
        return result.data;
    }
    
    // 获取应用私有目录路径
    async getPrivateDirectory() {
        const result = await this.filesystem.getUri({
            path: '',
            directory: 'DOCUMENTS'
        });
        return result.uri;
    }
}
```

### 3.2 文件导出/导入实现

**配置导出（.lmn 加密文件）**：

```javascript
// config-manager.js - APP 端下载实现
async download(filename, encrypt = false) {
    let data = await this.export(encrypt);
    const fullFilename = filename + (encrypt ? '.lmn' : '.json');
    
    if (isApp && Capacitor.Plugins?.Filesystem) {
        // APP 端：写入 Download 目录
        const fileData = encrypt 
            ? this.arrayBufferToBase64(data)  // 二进制转 base64
            : JSON.stringify(data, null, 2);
            
        await Filesystem.writeFile({
            path: `Download/${fullFilename}`,
            data: fileData,
            directory: 'EXTERNAL_STORAGE',
            encoding: encrypt ? undefined : 'utf8'
        });
        
        Lumina.UI.showToast('已保存到 Download 目录');
    } else {
        // Web 端：浏览器下载
        const blob = new Blob([data], { 
            type: encrypt ? 'application/octet-stream' : 'application/json' 
        });
        // ... 触发下载
    }
}
```

**文件导入**：

```javascript
// settings.js - APP 端文件选择
showAppFilePicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*/*';  // Android 不认识 .lmn，用 */*
    input.style.display = 'none';
    document.body.appendChild(input);
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // 验证扩展名
        if (!file.name.match(/\.(lmn|json)$/i)) {
            Lumina.UI.showToast('请选择 .json 或 .lmn 文件');
            return;
        }
        
        await this.handleConfigImport(file);
        document.body.removeChild(input);
    };
    
    input.click();
}
```

### 3.3 系统文件管理器集成（Intent）

**场景**：从 Android 系统文件管理器直接打开 Lumina 支持的文件

**实现方案**：

```javascript
// file-opener-bridge.js
class FileOpenerBridge {
    constructor() {
        this.isAvailable = !!Capacitor.Plugins['App'];
        this.pendingFile = null;
    }
    
    tryInit() {
        // 监听应用从后台恢复（可能携带文件 Intent）
        Capacitor.Plugins['App'].addListener('appUrlOpen', (data) => {
            console.log('[FileOpener] Received URL:', data.url);
            this.handleIncomingUrl(data.url);
        });
        
        // 检查启动时是否有 pending 文件
        if (window.pendingOpenUrl) {
            setTimeout(() => {
                this.handleIncomingUrl(window.pendingOpenUrl);
                window.pendingOpenUrl = null;
            }, 1000);  // 等待初始化完成
        }
    }
    
    async handleIncomingUrl(url) {
        // Android 文件 URI 格式：content://... 或 file://...
        if (url.startsWith('content://') || url.startsWith('file://')) {
            try {
                // 通过 Capacitor 读取文件
                const fileData = await this.readFileFromUri(url);
                await this.processFile(fileData);
            } catch (e) {
                console.error('[FileOpener] Failed to open file:', e);
                Lumina.UI.showToast('无法打开文件');
            }
        }
    }
    
    async readFileFromUri(uri) {
        // 使用 Capacitor FilePicker 或自定义插件读取
        const result = await Capacitor.Plugins['FilePicker']?.pickFile({
            uri: uri
        });
        return result.data;
    }
}

// Android MainActivity.java 关键配置
// AndroidManifest.xml
/*
<activity android:name=".MainActivity"
    android:launchMode="singleTask">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="text/plain" />
        <data android:mimeType="application/pdf" />
        <data android:mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
    </intent-filter>
</activity>
*/
```

### 3.4 文件权限管理

**Android 权限模型**：

```javascript
// 权限管理封装
class PermissionManager {
    async requestStoragePermission() {
        // Android 10+ 分区存储限制
        if (Capacitor.getPlatform() === 'android') {
            const permission = await Capacitor.Plugins['Permissions']
                .query({ name: 'storage' });
            
            if (permission.state !== 'granted') {
                const result = await Capacitor.Plugins['Permissions']
                    .request({ name: 'storage' });
                
                if (result.state !== 'granted') {
                    Lumina.UI.showDialog('需要存储权限才能导出文件');
                    return false;
                }
            }
        }
        return true;
    }
}

// AndroidManifest.xml 权限声明
/*
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" 
    android:maxSdkVersion="28" />  <!-- Android 10+ 使用分区存储 -->
<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" 
    tools:ignore="ScopedStorage" />  <!-- 如需访问全部文件 -->
*/
```

### 3.5 大文件处理与流式读写

**挑战**：导入 100MB+ 的 PDF 或 DOCX 文件

**流式处理策略**：

```javascript
// 大文件分片读取
async processLargeFile(file) {
    const chunkSize = 1024 * 1024;  // 1MB 分片
    const totalChunks = Math.ceil(file.size / chunkSize);
    
    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        
        // 处理分片
        await this.processChunk(chunk);
        
        // 更新进度
        onProgress?.(i + 1, totalChunks);
        
        // 每 10MB 让出主线程，避免 ANR
        if (i % 10 === 0) {
            await new Promise(r => setTimeout(r, 0));
        }
    }
}
```

---

## 4. 原生功能集成

### 4.1 状态栏与导航栏控制

**实现**：通过 Capacitor StatusBar 插件

```javascript
// 状态栏样式控制
const setStatusBarStyle = async (isDark) => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
        const StatusBar = Capacitor.Plugins['StatusBar'];
        
        // 设置状态栏文字颜色
        await StatusBar.setStyle({
            style: isDark ? 'DARK' : 'LIGHT'
        });
        
        // 设置状态栏背景色（可选）
        await StatusBar.setBackgroundColor({
            color: isDark ? '#000000' : '#ffffff'
        });
    } catch (e) {
        console.warn('StatusBar control failed:', e);
    }
};

// 沉浸模式（阅读时隐藏状态栏）
const enterImmersiveMode = async () => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
        const StatusBar = Capacitor.Plugins['StatusBar'];
        await StatusBar.hide();
        
        // Android 隐藏导航栏
        if (Capacitor.getPlatform() === 'android') {
            await StatusBar.setOverlaysWebView({ overlay: true });
        }
    } catch (e) {
        console.warn('Immersive mode failed:', e);
    }
};

// 退出沉浸模式
const exitImmersiveMode = async () => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
        const StatusBar = Capacitor.Plugins['StatusBar'];
        await StatusBar.show();
        await StatusBar.setOverlaysWebView({ overlay: false });
    } catch (e) {
        console.warn('Exit immersive mode failed:', e);
    }
};
```

### 4.2 系统文件选择器（Android 原生）

**改进 Web 文件选择器的限制**：

```javascript
// 使用 Capacitor FilePicker 插件
class NativeFilePicker {
    async pickFile(options = {}) {
        if (!Capacitor.isNativePlatform()) {
            // Web 端回退到 input[type=file]
            return this.webFilePicker(options);
        }
        
        try {
            const result = await Capacitor.Plugins['FilePicker'].pickFile({
                types: options.types || ['text/plain', 'application/pdf'],
                multiple: options.multiple || false
            });
            
            return {
                name: result.name,
                size: result.size,
                type: result.mimeType,
                data: result.data  // Base64 或 ArrayBuffer
            };
        } catch (e) {
            if (e.message !== 'User cancelled') {
                console.error('FilePicker error:', e);
            }
            return null;
        }
    }
}
```

### 4.3 物理按键处理（返回键）

**Android 返回键行为定制**：

```javascript
// 拦截返回键，实现阅读器导航
const initBackButtonHandler = () => {
    if (!Capacitor.isNativePlatform()) return;
    
    Capacitor.Plugins['App'].addListener('backButton', (event) => {
        const state = Lumina.State.app;
        
        // 优先级1：关闭打开的对话框
        const openDialog = document.querySelector('.dialog.active, .panel.open');
        if (openDialog) {
            openDialog.classList.remove('active', 'open');
            return;
        }
        
        // 优先级2：退出沉浸模式
        if (state.ui.isImmersive) {
            exitImmersiveMode();
            state.ui.isImmersive = false;
            return;
        }
        
        // 优先级3：关闭侧边栏
        if (Lumina.DOM.sidebarLeft.classList.contains('visible')) {
            Lumina.DOM.sidebarLeft.classList.remove('visible');
            return;
        }
        
        // 优先级4：提示退出应用
        if (state.document.items.length > 0) {
            Lumina.UI.showToast('再按一次返回键退出');
            // 实现双击退出逻辑...
        } else {
            // 首页直接退出
            Capacitor.Plugins['App'].exitApp();
        }
    });
};
```

### 4.4 通知与 Toast（原生 vs Web）

**策略**：优先使用 Web Toast，原生通知仅用于后台 TTS 播放

```javascript
// 原生通知（后台 TTS 播放时显示）
const showNativeNotification = async (title, body) => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
        const LocalNotifications = Capacitor.Plugins['LocalNotifications'];
        await LocalNotifications.schedule({
            notifications: [{
                title: title,
                body: body,
                id: 1,
                ongoing: true,  // 持续通知，不能滑动删除
                actionTypeId: 'tts-controls'
            }]
        });
    } catch (e) {
        console.warn('Notification failed:', e);
    }
};

// 取消通知
const cancelNotification = async () => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
        await Capacitor.Plugins['LocalNotifications'].cancel({
            notifications: [{ id: 1 }]
        });
    } catch (e) {
        console.warn('Cancel notification failed:', e);
    }
};
```

### 4.5 电池与性能优化

**后台播放 TTS 时的电池优化**：

```javascript
// 申请后台运行（Android）
const requestBackgroundRunning = async () => {
    if (Capacitor.getPlatform() !== 'android') return;
    
    try {
        // 使用 PowerManager 保持 CPU 唤醒（仅 TTS 播放时）
        await Capacitor.Plugins['PowerManager'].acquireWakeLock({
            level: 'PARTIAL_WAKE_LOCK',  // 保持 CPU，允许屏幕关闭
            timeout: 300000  // 5分钟超时
        });
    } catch (e) {
        console.warn('WakeLock failed:', e);
    }
};

// 释放唤醒锁
const releaseWakeLock = async () => {
    if (Capacitor.getPlatform() !== 'android') return;
    
    try {
        await Capacitor.Plugins['PowerManager'].releaseWakeLock();
    } catch (e) {
        console.warn('Release WakeLock failed:', e);
    }
};
```

---

## 5. WebView 优化与安全

### 5.1 WebView 配置策略

**Android WebView 关键配置**：

```java
// MainActivity.java 或 Capacitor 配置
WebSettings settings = webView.getSettings();

// 启用 JavaScript
settings.setJavaScriptEnabled(true);

// 允许本地文件访问（重要）
settings.setAllowFileAccess(true);
settings.setAllowFileAccessFromFileURLs(true);
settings.setAllowUniversalAccessFromFileURLs(true);

// 禁用缩放（应用内处理）
settings.setBuiltInZoomControls(false);
settings.setDisplayZoomControls(false);

// 缓存策略
settings.setCacheMode(WebSettings.LOAD_DEFAULT);
settings.setDomStorageEnabled(true);

// 性能优化
settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
settings.setEnableSmoothTransition(true);
```

**Capacitor 配置** (`capacitor.config.json`)：

```json
{
  "appId": "com.lumina.reader",
  "appName": "Lumina Reader",
  "webDir": "www",
  "bundledWebRuntime": false,
  "android": {
    "allowMixedContent": false,
    "captureInput": false,
    "webContentsDebuggingEnabled": true
  },
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 2000,
      "backgroundColor": "#ffffff"
    }
  }
}
```

### 5.2 离线资源管理（file:// 协议）

**挑战**：`file://` 协议下的 CORS 限制

**解决方案**：

```javascript
// 1. 字体加载策略
const loadFont = async () => {
    // file:// 协议下不能加载外部 CSS，使用内联 Data URL
    const fontFace = new FontFace(
        'LXGW Neo Zhi Song',
        'url(data:font/woff2;base64,...)',
        { weight: 'normal' }
    );
    await fontFace.load();
    document.fonts.add(fontFace);
};

// 2. 图片加载策略
// 使用 data URL 或 blob URL，避免 file:// 跨域
const loadImage = (base64Data) => {
    return `data:image/jpeg;base64,${base64Data}`;
};

// 3. AJAX 请求限制
// file:// 协议下不能发起 XMLHttpRequest
// 所有数据必须通过 Capacitor Bridge 获取
```

### 5.3 CORS 与混合内容策略

**严格的内容安全策略** (`index.html`)：

```html
<meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:;
    font-src 'self' data:;
    connect-src 'none';
    media-src 'self' blob:;
    object-src 'none';
">
```

**说明**：
- `default-src 'self'`：只允许加载同源资源
- `connect-src 'none'`：禁止所有网络请求（确保离线）
- `img-src data: blob:`：允许 Data URL 和 Blob URL 图片

### 5.4 JavaScript 桥接安全

**输入验证**：

```javascript
// 所有从 Native 接收的数据都要验证
Capacitor.Plugins['MyPlugin'].addListener('event', (data) => {
    // 验证数据类型和范围
    if (typeof data.value !== 'string') return;
    if (data.value.length > 10000) return;  // 长度限制
    
    // 使用 textContent 而非 innerHTML 防止 XSS
    element.textContent = data.value;
});
```

### 5.5 内存管理（图片、DOM）

**WebView 内存泄漏防护**：

```javascript
// 1. 图片内存管理
const releaseImageMemory = () => {
    // 释放不在视口的图片
    document.querySelectorAll('.doc-image').forEach(img => {
        if (!isInViewport(img)) {
            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        }
    });
};

// 2. 页面切换时清理
const onChapterChange = () => {
    // 清理上一页的 DOM 引用
    previousPageElements = null;
    
    // 强制垃圾回收提示（JS 没有直接 GC API，但可以通过内存压力触发）
    if (window.gc) window.gc();
};

// 3. 监听低内存警告（Android）
if (Capacitor.isNativePlatform()) {
    Capacitor.Plugins['App'].addListener('lowMemory', () => {
        console.warn('Low memory warning');
        // 释放缓存、清理大图
        Lumina.Renderer.clearImageCache();
    });
}
```

---

## 6. 构建与打包系统

### 6.1 Capacitor 配置详解

`capacitor.config.json` 完整配置：

```json
{
  "appId": "com.lumina.reader",
  "appName": "Lumina Reader",
  "webDir": "www",
  "bundledWebRuntime": false,
  "server": {
    "androidScheme": "https",
    "allowNavigation": []
  },
  "android": {
    "path": "android",
    "webContentsDebuggingEnabled": true,
    "useLegacyBridge": false,
    "allowMixedContent": false,
    "captureInput": false,
    "webViewClient": {
      "allowMultipleWindows": false
    }
  },
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 2000,
      "launchAutoHide": true,
      "backgroundColor": "#ffffff",
      "androidSplashResourceName": "splash",
      "androidScaleType": "CENTER_CROP"
    },
    "Keyboard": {
      "resize": "body",
      "style": "dark"
    }
  }
}
```

### 6.2 Android Gradle 配置

`android/app/build.gradle` 关键配置：

```gradle
android {
    compileSdkVersion 34
    
    defaultConfig {
        applicationId "com.lumina.reader"
        minSdkVersion 24  // Android 7.0
        targetSdkVersion 34
        versionCode 1
        versionName "1.0.0"
        
        // 多架构支持
        ndk {
            abiFilters 'arm64-v8a', 'armeabi-v7a', 'x86_64'
        }
    }
    
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
            
            // 签名配置
            signingConfig signingConfigs.release
        }
        debug {
            debuggable true
            minifyEnabled false
        }
    }
    
    // 依赖项
    dependencies {
        implementation 'androidx.appcompat:appcompat:1.6.1'
        implementation 'com.google.android.material:material:1.9.0'
        
        // Capacitor 核心
        implementation project(':capacitor-android')
        
        // Capacitor 插件
        implementation project(':capacitor-community-sqlite')
        implementation project(':capacitor-filesystem')
        implementation project(':capacitor-status-bar')
        implementation project(':capacitor-app')
        
        // PDF 解析（可选，如用 pdf.js 则不需要）
        // implementation 'com.github.barteksc:android-pdf-viewer:3.2.0-beta.1'
    }
}
```

### 6.3 签名与发布流程

**签名配置**：

```gradle
// android/app/build.gradle
android {
    signingConfigs {
        release {
            storeFile file("lumina-reader.keystore")
            storePassword System.getenv("STORE_PASSWORD")
            keyAlias "lumina"
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
}
```

**构建命令**：

```bash
# 1. 同步 Web 代码到 Android
cd app
npx cap sync android

# 2. 构建 Release APK
cd android
./gradlew assembleRelease

# 输出：android/app/build/outputs/apk/release/app-release.apk

# 3. 构建 AAB（Google Play 要求）
./gradlew bundleRelease

# 输出：android/app/build/outputs/bundle/release/app-release.aab
```

### 6.4 多渠道打包策略

**方案**：使用 productFlavors

```gradle
android {
    flavorDimensions "channel"
    
    productFlavors {
        standard {
            dimension "channel"
            applicationId "com.lumina.reader"
        }
        fdroid {
            dimension "channel"
            applicationId "com.lumina.reader.fdroid"
            // F-Droid 版本不含 Google 服务
        }
        china {
            dimension "channel"
            applicationId "com.lumina.reader.cn"
            // 国内版本（如有需要）
        }
    }
}
```

### 6.5 热更新方案

**限制**：由于完全离线设计，不支持远程热更新（避免网络请求）

**替代方案**：

1. **配置迁移**：通过导出/导入配置文件实现设置同步
2. **插件更新**：插件作为独立模块，可通过文件导入更新
3. **完整 APK 更新**：用户手动下载新版 APK 安装

---

## 7. APP 端性能优化

### 7.1 启动时间优化

**冷启动流程优化**：

```javascript
// 1. 延迟非关键初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 关键初始化（阻塞）
    await initCritical();
    
    // 非关键初始化（延迟）
    requestIdleCallback(() => {
        initNonCritical();
    });
});

// 2. 资源懒加载
const lazyLoadFonts = () => {
    // 非关键字体延迟加载
    setTimeout(() => {
        Lumina.Font.load('kai');  // 楷体延迟加载
    }, 2000);
};

// 3. SQLite 连接优化
// 使用连接池，避免频繁打开关闭数据库
```

### 7.2 WebView 渲染加速

**硬件加速**：

```java
// AndroidManifest.xml
<application
    android:hardwareAccelerated="true"
    ...>
```

**渲染优化配置**：

```javascript
// 减少重排重绘
Lumina.Renderer.renderCurrentChapter = () => {
    // 1. 先全部计算
    const elements = calculateAllElements();
    
    // 2. 批量 DOM 操作
    const fragment = document.createDocumentFragment();
    elements.forEach(el => fragment.appendChild(el));
    container.appendChild(fragment);
    
    // 3. 延迟读操作
    requestAnimationFrame(() => {
        // 滚动、高亮等读操作
    });
};
```

### 7.3 图片内存管理

**图片解码控制**：

```javascript
// 限制图片尺寸，避免 OOM
const MAX_IMAGE_SIZE = 4096;  // 最大边长

const processImage = (dataUrl) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            if (img.width > MAX_IMAGE_SIZE || img.height > MAX_IMAGE_SIZE) {
                // 缩放图片
                const canvas = document.createElement('canvas');
                const ratio = Math.min(
                    MAX_IMAGE_SIZE / img.width,
                    MAX_IMAGE_SIZE / img.height
                );
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            } else {
                resolve(dataUrl);
            }
        };
        img.src = dataUrl;
    });
};
```

### 7.4 数据库查询优化

**索引优化**：

```sql
-- 高频查询字段加索引
CREATE INDEX idx_lastReadTime ON books(lastReadTime DESC);
CREATE INDEX idx_fileName ON books(fileName);

-- 复合索引（如按类型+时间查询）
CREATE INDEX idx_type_lastRead ON books(fileType, lastReadTime DESC);
```

**查询优化**：

```javascript
// 只查询需要的字段
const sql = `
    SELECT fileKey, fileName, wordCount, lastReadTime, cover
    FROM books
    ORDER BY lastReadTime DESC
    LIMIT 20
`;
// 避免 SELECT *（content 字段可能很大）
```

### 7.5 后台与前台切换处理

**生命周期管理**：

```javascript
// 监听 APP 生命周期
Capacitor.Plugins['App'].addListener('pause', () => {
    // 进入后台
    console.log('App paused');
    
    // 保存当前阅读进度
    Lumina.DB.saveHistory(...);
    
    // 暂停 TTS（可选，或继续后台播放）
    if (!backgroundTTSEnabled) {
        Lumina.TTS.manager?.pause();
    }
    
    // 释放资源
    Lumina.Renderer.clearImageCache();
});

Capacitor.Plugins['App'].addListener('resume', () => {
    // 返回前台
    console.log('App resumed');
    
    // 恢复 UI
    Lumina.I18n.updateUI();
    
    // 检查是否需要刷新数据
    if (timeSinceLastUpdate > 60000) {
        Lumina.DB.loadHistoryFromDB();
    }
});
```

---

## 8. 调试与诊断

### 8.1 Chrome DevTools 远程调试

**开启调试**：

```java
// WebView 调试必须在应用启动时开启
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
    WebView.setWebContentsDebuggingEnabled(true);
}
```

**连接步骤**：
1. 手机开启开发者模式 + USB 调试
2. Chrome 打开 `chrome://inspect`
3. 找到目标 WebView，点击 "Inspect"

### 8.2 Android Studio Logcat 分析

**关键日志过滤**：

```bash
# 查看 Lumina 相关日志
adb logcat -s "Lumina:*" "Capacitor:*" "WebView:*" "*:E"

# 查看 SQLite 操作
adb logcat -s "SQLiteImpl:*"

# 查看文件操作
adb logcat -s "Filesystem:*"
```

**日志级别规范**：

```javascript
// APP 端日志规范
console.log('[Lumina] Info message');    // 普通信息
console.warn('[Lumina] Warning');        // 警告
console.error('[Lumina] Error:', error); // 错误（必须记录堆栈）

// 性能日志
console.time('[Perf] Render');
render();
console.timeEnd('[Perf] Render');
```

### 8.3 性能分析工具

**WebView 性能分析**：

```javascript
// 内存使用报告
const reportMemory = () => {
    if (performance.memory) {
        console.log('Memory used:', 
            (performance.memory.usedJSHeapSize / 1048576).toFixed(2), 'MB');
    }
};

// FPS 监控
let frameCount = 0;
const measureFPS = () => {
    frameCount++;
    requestAnimationFrame(measureFPS);
};
setInterval(() => {
    console.log('FPS:', frameCount);
    frameCount = 0;
}, 1000);
```

### 8.4 错误上报与监控

**本地错误日志**（完全离线）：

```javascript
class ErrorLogger {
    constructor() {
        this.maxLogs = 100;
        this.logs = [];
    }
    
    log(error, context = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            message: error.message,
            stack: error.stack,
            context: context,
            appVersion: APP_VERSION,
            platform: Capacitor.getPlatform()
        };
        
        this.logs.push(logEntry);
        
        // 限制日志数量
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // 保存到本地存储
        localStorage.setItem('lumina_error_logs', JSON.stringify(this.logs));
    }
    
    exportLogs() {
        return JSON.stringify(this.logs, null, 2);
    }
    
    clearLogs() {
        this.logs = [];
        localStorage.removeItem('lumina_error_logs');
    }
}

// 全局错误捕获
window.onerror = (msg, url, line, col, error) => {
    Lumina.ErrorLogger.log(error, { type: 'window.onerror' });
};

window.onunhandledrejection = (event) => {
    Lumina.ErrorLogger.log(event.reason, { type: 'unhandledrejection' });
};
```

---

## 9. 平台差异处理

### 9.1 Web vs App 能力检测

```javascript
// 平台检测工具
const Platform = {
    get isApp() {
        return typeof Capacitor !== 'undefined' && 
               Capacitor.isNativePlatform?.();
    },
    
    get isAndroid() {
        return this.isApp && Capacitor.getPlatform() === 'android';
    },
    
    get isIOS() {
        return this.isApp && Capacitor.getPlatform() === 'ios';
    },
    
    get isWeb() {
        return !this.isApp;
    },
    
    // 能力检测
    get supportsFilesystem() {
        return this.isApp && !!Capacitor.Plugins['Filesystem'];
    },
    
    get supportsSQLite() {
        return this.isApp && !!Capacitor.Plugins['SQLite'];
    }
};

// 使用示例
if (Platform.supportsFilesystem) {
    // 使用原生文件系统
    await saveToNativeFilesystem(data);
} else {
    // 使用浏览器下载
    triggerBrowserDownload(data);
}
```

### 9.2 平台特定代码隔离

**文件组织**：

```
js/
├── modules/
│   ├── db.js              # 通用接口
│   └── bridges/
│       ├── db-bridge.js         # 桥接层
│       ├── db-web.js            # Web 实现
│       └── db-native.js         # App 实现
```

**代码隔离模式**：

```javascript
// db-bridge.js
class DBBridge {
    async init() {
        if (Platform.isApp) {
            const { NativeDB } = await import('./db-native.js');
            this.impl = new NativeDB();
        } else {
            const { WebDB } = await import('./db-web.js');
            this.impl = new WebDB();
        }
        return this.impl.init();
    }
}
```

### 9.3 降级策略实现

```javascript
// 存储层降级链
async initStorage() {
    const backends = [];
    
    if (Platform.supportsSQLite) {
        backends.push('capacitor');
    }
    
    if (Platform.isWeb && 'sqlite' in window) {
        backends.push('websql');
    }
    
    backends.push('indexeddb');  // 最终回退
    
    for (const backend of backends) {
        try {
            const ready = await this.tryInitBackend(backend);
            if (ready) {
                console.log(`Storage backend: ${backend}`);
                return backend;
            }
        } catch (e) {
            console.warn(`${backend} failed:`, e);
        }
    }
    
    throw new Error('No storage backend available');
}
```

### 9.4 兼容性测试矩阵

| 功能 | Web (Chrome) | Web (Safari) | Android 10+ | Android 7-9 | iOS 14+ |
|------|--------------|--------------|-------------|-------------|---------|
| IndexedDB | ✅ | ✅ | ✅ | ✅ | ✅ |
| Capacitor SQLite | N/A | N/A | ✅ | ✅ | ⚠️ |
| Filesystem API | ✅ | ❌ | ✅ | ✅ | ✅ |
| StatusBar 控制 | N/A | N/A | ✅ | ✅ | ✅ |
| File System Access | ⚠️ | ❌ | ✅ | ✅ | ❌ |
| TTS (Web Speech) | ✅ | ✅ | ✅ | ✅ | ✅ |
| TTS (Azure) | ✅ | ✅ | ✅ | ✅ | ✅ |

**说明**：
- ✅ 完全支持
- ⚠️ 部分支持或有限制
- ❌ 不支持
- N/A 不适用

---

## 10. 附录：API 参考

### Capacitor Core APIs

```typescript
// Capacitor 全局对象
interface Capacitor {
    getPlatform(): 'ios' | 'android' | 'web';
    isNativePlatform(): boolean;
    convertFileSrc(filePath: string): string;
    Plugins: {
        [pluginName: string]: any;
    };
}
```

### 存储相关 APIs

```typescript
// Capacitor Community SQLite
interface SQLitePlugin {
    createConnection(options: {
        database: string;
        encrypted?: boolean;
        mode?: string;
    }): Promise<SQLiteConnection>;
}

interface SQLiteConnection {
    open(): Promise<void>;
    execute(sql: string): Promise<void>;
    run(sql: string, values?: any[]): Promise<void>;
    query(sql: string, values?: any[]): Promise<{ values: any[] }>;
    close(): Promise<void>;
}

// Capacitor Filesystem
interface FilesystemPlugin {
    readFile(options: {
        path: string;
        directory?: string;
        encoding?: 'utf8' | undefined;
    }): Promise<{ data: string }>;
    
    writeFile(options: {
        path: string;
        data: string;
        directory?: string;
        encoding?: 'utf8' | undefined;
        recursive?: boolean;
    }): Promise<{ uri: string }>;
    
    getUri(options: {
        path: string;
        directory: string;
    }): Promise<{ uri: string }>;
}
```

### 原生设备 APIs

```typescript
// Status Bar
interface StatusBarPlugin {
    setStyle(options: { style: 'DARK' | 'LIGHT' }): Promise<void>;
    setBackgroundColor(options: { color: string }): Promise<void>;
    show(): Promise<void>;
    hide(): Promise<void>;
    setOverlaysWebView(options: { overlay: boolean }): Promise<void>;
}

// App (生命周期)
interface AppPlugin {
    exitApp(): Promise<void>;
    getInfo(): Promise<{ name: string; id: string; build: string; version: string }>;
    addListener(event: 'pause' | 'resume' | 'backButton', callback: Function): void;
}

// Keyboard
interface KeyboardPlugin {
    show(): Promise<void>;
    hide(): Promise<void>;
    setStyle(options: { style: 'DARK' | 'LIGHT' }): Promise<void>;
}
```

### 自定义桥接 APIs

```typescript
// 项目中自定义的桥接接口
interface FileOpenerBridge {
    tryInit(): void;
    handleIncomingUrl(url: string): Promise<void>;
}

interface ExporterBridge {
    download(filename: string, data: Blob, encrypt?: boolean): Promise<void>;
    upload(): Promise<File>;
}
```

---

**文档结束**

*本文档是 Lumina Reader APP 端开发的权威参考，涵盖从架构设计到性能优化的完整技术栈。所有 APP 端开发应遵循本文档规范。*
