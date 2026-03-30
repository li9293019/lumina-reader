# Lumina Reader 数据存储技术指引

本文档旨在帮助开发人员理解 Lumina Reader 的存储架构，避免在迭代中出现数据不一致、字段丢失或跨平台兼容性问题。

---

## 目录

1. [架构概览](#架构概览)
2. [三种存储模式](#三种存储模式)
3. [核心数据模型](#核心数据模型)
4. [时间字段处理规范](#时间字段处理规范)
5. [数据导入导出](#数据导入导出)
6. [排序与查询](#排序与查询)
7. [最佳实践与避坑指南](#最佳实践与避坑指南)
8. [调试与问题排查](#调试与问题排查)

---

## 架构概览

### 设计原则

- **统一接口**: 通过 `Lumina.DB.adapter` 提供统一 API，业务代码无需关心底层实现
- **自动降级**: 按优先级自动选择可用存储（Capacitor SQLite → Web SQLite → IndexedDB）
- **数据兼容**: 所有存储模式使用相同的数据结构和字段命名
- **本地优先**: 优先使用本地缓存，异步同步远程数据

### 核心文件

```
app/www/js/modules/db.js          # 主存储实现（IndexedDB + Web SQLite）
app/www/js/modules/storage.js     # 存储模块（与 db.js 同步维护）
app/www/assets/js/app/db-bridge.js # Capacitor SQLite 桥接层
web/server.py                      # Web 后端 SQLite 服务
```

---

## 三种存储模式

### 1. IndexedDB（Web 本地模式）

**适用场景**: 浏览器环境，无后端服务

**实现类**: `Lumina.DB.IndexedDBImpl`

**特点**:
- 纯客户端存储，无网络依赖
- 通过 `fileKey`（文件名+大小+修改时间）唯一标识文件
- 使用 `put` 操作实现插入/更新

**关键代码**:
```javascript
// 保存时保留 created_at
const existingRecord = await this.getFile(fileKey);
const createdAt = existingRecord?.created_at || data.created_at || Lumina.DB.getLocalTimeString();
```

### 2. Web SQLite（HTTP 模式）

**适用场景**: 开发环境，需要跨设备同步

**实现类**: `Lumina.DB.SQLiteImpl`

**特点**:
- 通过 HTTP API 与本地 Python 服务通信
- 具备智能缓存系统（内存缓存 + IndexedDB 二级缓存）
- 自动处理离线/在线状态切换

**关键端点**:
- `POST /api/save` - 保存文件
- `GET /api/file/{fileKey}` - 获取文件
- `GET /api/files` - 获取列表

### 3. Capacitor SQLite（APP 模式）

**适用场景**: 原生 APP 环境

**实现类**: `Lumina.DB.CapacitorSQLiteImpl`

**桥接层**: `app/www/assets/js/app/db-bridge.js`

**特点**:
- 调用原生 SQLite 插件
- 支持 WAL 模式，读写不阻塞
- 自动降级到内存模式（如果插件不可用）

**数据库初始化**:
```javascript
// db-bridge.js
async createTables() {
    // 基础表结构
    await this.db.execute(baseSchema);
    
    // 兼容旧数据库：检查并添加 created_at 字段
    const checkResult = await this.db.query(
        "SELECT COUNT(*) as cnt FROM pragma_table_info('files') WHERE name='created_at'"
    );
    if (checkResult.values[0].cnt === 0) {
        await this.db.run('ALTER TABLE files ADD COLUMN created_at TEXT');
    }
}
```

---

## 核心数据模型

### 文件记录结构

```typescript
interface BookRecord {
    // 核心标识
    fileKey: string;           // 唯一标识：文件名_大小_修改时间
    fileName: string;          // 原始文件名
    fileType: string;          // 类型：txt/md/docx/html/pdf/epub
    fileSize: number;          // 文件大小（字节）
    
    // 内容数据
    content: Array<{
        type: string;          // paragraph/heading1-6/image/code
        text: string;          // 文本内容
        data?: string;         // 图片 base64（可选）
        // ... 其他渲染字段
    }>;
    
    // 阅读状态
    lastChapter: number;       // 当前章节索引
    lastScrollIndex: number;   // 当前滚动位置
    chapterTitle: string;      // 当前章节标题
    lastReadTime: string;      // 最后阅读时间（本地时间格式）
    
    // 配置
    customRegex: {
        chapter: string;       // 章节正则
        section: string;       // 小节正则
    };
    chapterNumbering: string;  // 编号风格
    
    // 扩展数据
    annotations: Annotation[]; // 注释/书签
    cover: string | null;      // 封面 base64
    heatMap: HeatMapData;      // 热力图数据
    
    // 时间戳（关键）
    created_at: string;        // 首次添加时间（一旦设置，永不改变）
    updated_at: string;        // 最后更新时间（Web 后端特有）
}
```

### 字段命名规范

| 存储模式 | 数据库字段 | JS 对象字段 | 说明 |
|---------|-----------|------------|------|
| IndexedDB | `fileKey` | `fileKey` | 一致 |
| SQLite | `file_key` | `fileKey` | 桥接层自动转换 |
| Python | `fileKey` | `fileKey` | 一致 |

**注意**: `db-bridge.js` 的 `rowToFile()` 方法会自动处理字段映射，提供双命名（snake_case 和 camelCase）以确保兼容性。

---

## 时间字段处理规范

### 时间格式

**统一使用本地时间格式**:
```
YYYY-MM-DD HH:mm:ss
```

**禁止使用**: ISO 8601 UTC 格式（`2026-03-30T03:22:55Z`）

**原因**:
- SQLite `CURRENT_TIMESTAMP` 返回的是 UTC 时间
- 用户期望看到本地时间
- 避免时区转换错误

### 辅助函数

```javascript
// db.js
Lumina.DB.getLocalTimeString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
};
```

### 三个时间字段的行为

| 字段 | 更新时机 | 是否可变 |
|-----|---------|---------|
| `created_at` | 首次创建记录时 | **不可变** |
| `lastReadTime` | 打开文件时、滚动/跳转时 | 可变 |
| `updated_at` | 每次保存时（Web 后端特有） | 自动更新 |

### created_at 保护机制

**必须实现的三级保护**:

1. **前端传值**: 增量保存时复用现有 `created_at`
2. **保存时检查**: 查询数据库获取现有 `created_at`
3. **后端校验**: 优先使用前端传入值，其次保留数据库值

```javascript
// 前端保存示例
const existing = await this.getFile(fileKey);
const createdAt = existing?.created_at || data.created_at || Lumina.DB.getLocalTimeString();

// 后端保存示例（Python）
existing_created_at = None
try:
    cursor = conn.execute("SELECT created_at FROM books WHERE fileKey = ?", (fileKey,))
    row = cursor.fetchone()
    if row:
        existing_created_at = row[0]
except:
    pass

created_at = data.get('created_at') or existing_created_at or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
```

---

## 数据导入导出

### 单文件导出格式

```json
{
    "version": 2,
    "exportType": "single",
    "exportDate": "2026-03-30 11:39:33",
    "appName": "Lumina Reader",
    "fileName": "xxx.md",
    "fileType": "md",
    "content": [...],
    "lastChapter": 5,
    "lastScrollIndex": 120,
    "chapterTitle": "第五章",
    "lastReadTime": "2026-03-30 11:39:33",
    "created_at": "2026-03-30 03:22:55",
    "annotations": [],
    "heatMap": {...},
    "cover": "data:image/jpeg;base64,..."
}
```

### 批量导出格式

```json
{
    "version": 2,
    "exportType": "batch",
    "exportDate": "2026-03-30 11:39:33",
    "appName": "Lumina Reader",
    "totalBooks": 10,
    "books": [
        // ...单文件格式数组
    ]
}
```

### 导入时的字段映射

```javascript
await this.saveFile(newKey, {
    fileName: book.fileName,
    fileType: book.fileType || 'txt',
    // ...
    lastReadTime: book.lastReadTime || Lumina.DB.getLocalTimeString(),
    created_at: book.created_at || book.lastReadTime || Lumina.DB.getLocalTimeString()
});
```

**注意**: 导入时 `created_at` 优先使用导出文件中的值，确保排序正确。

---

## 排序与查询

### 支持的排序方式

| 排序字段 | 数据库字段 | 说明 |
|---------|-----------|------|
| `time` | `lastReadTime` | 最近阅读（默认） |
| `added` | `created_at` | 添加时间 |
| `name` | `fileName` | 文件名 |
| `size` | `fileSize` | 文件大小 |

### 排序实现

```javascript
sortFiles(files) {
    const sorted = [...files];
    
    switch (this.currentSort) {
        case 'time':
            sorted.sort((a, b) => {
                const timeA = new Date(a.lastReadTime || 0).getTime();
                const timeB = new Date(b.lastReadTime || 0).getTime();
                return this.sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
            });
            break;
        case 'added':
            sorted.sort((a, b) => {
                const timeA = new Date(a.created_at || a.lastReadTime || 0).getTime();
                const timeB = new Date(b.created_at || b.lastReadTime || 0).getTime();
                return this.sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
            });
            break;
        // ...
    }
    return sorted;
}
```

### 兼容性处理

旧数据可能没有 `created_at`，排序时应回退到 `lastReadTime`:
```javascript
new Date(a.created_at || a.lastReadTime || 0)
```

---

## 最佳实践与避坑指南

### ✅ DO（推荐做法）

1. **始终通过 Adapter 访问存储**
   ```javascript
   // ✅ 正确
   await Lumina.DB.adapter.saveFile(fileKey, data);
   
   // ❌ 错误（直接访问实现）
   await Lumina.DB.impl.saveFile(fileKey, data);
   ```

2. **保存前检查必需字段**
   ```javascript
   if (!data.fileName || !Array.isArray(data.content)) {
       throw new Error('Invalid book data');
   }
   ```

3. **使用合并策略保留现有数据**
   ```javascript
   const existing = await this.getFile(fileKey) || {};
   const mergedData = {
       ...existing,
       ...data,
       // 特殊字段处理
       created_at: existing.created_at || data.created_at || getLocalTimeString()
   };
   ```

4. **时间字段使用 `getLocalTimeString()`**
   ```javascript
   lastReadTime: Lumina.DB.getLocalTimeString()
   ```

### ❌ DON'T（禁止做法）

1. **不要修改 `created_at` 字段**
   ```javascript
   // ❌ 永远不要这样做
   data.created_at = newTime;
   ```

2. **不要使用 `Date.now()` 或 `toISOString()` 直接作为时间戳**
   ```javascript
   // ❌ 错误
   lastReadTime: new Date().toISOString()  // 会产生 UTC 格式
   ```

3. **不要假设所有存储模式都支持相同的功能**
   ```javascript
   // ❌ 错误（Capacitor 模式不支持）
   if (impl instanceof Lumina.DB.SQLiteImpl) {
       // 特定逻辑
   }
   ```

4. **不要忘记处理异步错误**
   ```javascript
   // ❌ 错误
   await this.saveFile(key, data);
   
   // ✅ 正确
   try {
       await this.saveFile(key, data);
   } catch (err) {
       console.error('Save failed:', err);
   }
   ```

### ⚠️ 常见问题

**Q: 为什么 `created_at` 和 `lastReadTime` 变成一样了？**

A: 检查保存逻辑是否正确保留了 `created_at`。常见错误是增量保存时没有从现有记录中复制 `created_at`。

**Q: Web SQLite 模式下保存很慢？**

A: 这是正常的，因为涉及 HTTP 请求。考虑使用本地缓存或延迟保存策略。

**Q: 导入后排序不对？**

A: 确保导入时正确传递了 `created_at` 字段，且格式为 `YYYY-MM-DD HH:mm:ss`。

**Q: APP 模式下数据库初始化失败？**

A: 检查 `db-bridge.js` 是否正确处理了字段兼容性（`ALTER TABLE`）。

---

## 调试与问题排查

### 启用调试日志

```javascript
// 在浏览器控制台或 APP 调试器中执行
localStorage.setItem('debug_storage', 'true');
```

### 关键日志位置

| 文件 | 日志关键词 | 说明 |
|-----|-----------|------|
| `db.js` | `[IndexedDB]` `[SQLite]` `[CapacitorSQLite]` | 存储操作日志 |
| `db-bridge.js` | `[DB]` | Capacitor 桥接层日志 |
| `server.py` | `[DEBUG]` | Web 后端日志 |

### 数据库状态检查

**IndexedDB**:
```javascript
// 查看所有文件
(await Lumina.DB.adapter.getAllFiles()).map(f => ({
    name: f.fileName,
    created: f.created_at,
    read: f.lastReadTime
}));
```

**Web SQLite**:
```bash
# 查看数据库内容
sqlite3 web/data/lumina_reader.db "SELECT fileName, created_at, lastReadTime FROM books;"
```

**Capacitor SQLite**:
```javascript
// 在 APP 调试器中
await DatabaseBridge.query('SELECT file_name, created_at FROM files');
```

---

## 附录：修改历史与迁移指南

### v2.0 存储格式变更

- 新增 `created_at` 字段（所有存储模式）
- 统一时间格式为 `YYYY-MM-DD HH:mm:ss`
- 添加 `updated_at` 字段（Web 后端）

### 数据库迁移

**IndexedDB**: 自动迁移，无需处理

**SQLite**: 使用 `ALTER TABLE` 添加字段

```sql
ALTER TABLE books ADD COLUMN created_at TEXT;
ALTER TABLE files ADD COLUMN created_at TEXT;  -- Capacitor
```

---

*文档版本: 1.0*
*最后更新: 2026-03-30*
*维护者: Lumina Reader 开发团队*
