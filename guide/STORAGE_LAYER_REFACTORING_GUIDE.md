# 流萤阅读器存储层重构与开发实践指南

> 版本：v3.0  
> 日期：2026-04-14  
> 适用范围：Web（IndexedDB / Web SQLite）+ APP（Capacitor SQLite）  
> 关键变更：引入 `db-helpers.js`，收敛数据合并与标准化逻辑

---

## 目录

1. [重构背景：为什么必须改](#1-重构背景为什么必须改)
2. [新架构总览](#2-新架构总览)
3. [核心设计：db-helpers.js](#3-核心设计db-helpersjs)
4. [四端实现类职责](#4-四端实现类职责)
5. [StorageAdapter 代理层](#5-storageadapter-代理层)
6. [关键数据流：保存一本书](#6-关键数据流保存一本书)
7. [业务与技术收益](#7-业务与技术收益)
8. [后续开发最佳实践](#8-后续开发最佳实践)
9. [常见陷阱与排查](#9-常见陷阱与排查)
10. [附录：接口契约速查](#10-附录接口契约速查)

---

## 1. 重构背景：为什么必须改

### 1.1 "三体问题"：一份逻辑写四遍

在 2026-04-14 重构之前，`db.js` 中并行存在 **4 个存储实现类**，它们处理同一套书籍Schema，但数据处理逻辑各自重复实现：

- `IndexedDBImpl` → Web 本地（`file://`）
- `CapacitorSQLiteImpl` → Android App（原生 SQLite）
- `SQLiteImpl` → Web + Python 后端（HTTP API）
- `WebCacheIndexedDBImpl` → Web SQLite 的本地二级缓存

重复的致命点：

| 重复逻辑 | 出现次数 | 风险 |
|---------|---------|------|
| `generateFileKey` | 3 处 | 改键规则必漏一端 |
| `getLocalTimeString` | 4 处 | 时间格式不一致 |
| `saveFile` 数据合并（merge） | **4 处** | 2026-04-02 的数据丢失修复就在此处 |
| `saveFile` 记录构造（字段默认值） | **4 处** | 新增字段需改 10 处 |
| `importBatch` 循环/验证/统计 | 3 处 | `CapacitorSQLiteImpl` 的 `onProgress` 签名曾与其他两端不一致 |
| `overwriteFile` | 3 处 | 字段保留逻辑略有差异 |

### 1.2 2026-04-02 补丁的警示

2026-04-02 修复了一个严重 Bug：**重新打开同一文件时会丢失阅读进度**。修复方案是在 `saveFile` 中增加合并逻辑：

```javascript
const mergedData = existingRecord ? {
    ...existingRecord,
    ...data,
    annotations: data.annotations !== undefined ? data.annotations : existingRecord.annotations,
    heatMap: data.heatMap !== undefined ? data.heatMap : existingRecord.heatMap,
    // ...
} : data;
```

这个修复必须在 **4 个实现类中同步修改**。漏掉任何一处，都会导致某个平台下的进度或批注丢失。这就是典型的 **"改一处、漏两处"** 风险。

### 1.3 重构决策

- **不引入 TypeScript / Webpack**：项目坚持零构建工具，保持 `<script>` 标签加载
- **不引入 class 继承**：IndexedDB 回调、Promise、fetch 三种异步模式差异大，继承反而增加耦合
- **采用 "工具对象 + 代理层"**：新建 `db-helpers.js`（纯函数工具集），`db.js` 只保留存储介质相关代码

---

## 2. 新架构总览

### 2.1 文件组织

```
app/www/js/modules/
├── db-helpers.js          ← 新增：数据处理唯一真理源
└── db.js                  ← 重写：只保留存储介质相关代码
```

`index.html` 加载顺序：

```html
<script src="./js/modules/db-helpers.js"></script>
<script src="./js/modules/db.js"></script>
```

### 2.2 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         调用方层                                    │
│   actions.js / data-manager.js / ui.js / init.js                   │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────┐
│                    StorageAdapter 代理层                            │
│        参数校验 + 分发 + 兼容层（getFileSmart / getStorageStats）   │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌──────────────────┐
│ IndexedDBImpl │ │ SQLiteImpl    │ │ CapacitorSQLite  │
│   (Web本地)    │ │ (Web+Python)  │ │   (App原生)       │
└───────────────┘ └───────┬───────┘ └──────────────────┘
                          │
                  ┌───────▼───────┐
                  │ WebCacheIDB   │
                  │   (二级缓存)   │
                  └───────────────┘
```

### 2.3 职责边界

| 模块 | 职责 | 禁止做的事 |
|------|------|-----------|
| `db-helpers.js` | 数据合并、标准化、验证、键生成、时间格式化、导入导出模板 | 禁止调用任何存储 API（IDB / fetch / dbBridge） |
| `db.js` 实现类 | 只负责 "怎么存" 和 "怎么取" | 禁止手写字段默认值、禁止复制 merge 逻辑 |
| `StorageAdapter` | 代理分发、参数守门、模式感知（如 sqlite 双写 webCache） | 禁止直接操作底层存储句柄 |

---

## 3. 核心设计：db-helpers.js

### 3.1 命名空间

```javascript
(function(global) {
    const Lumina = global.Lumina || (global.Lumina = {});
    Lumina.DB = Lumina.DB || {};
    Lumina.DB.Helpers = { /* ... */ };
})(window);
```

### 3.2 六大核心函数

#### 1) `mergeFileData(existing, incoming)`

**唯一的数据合并真理源。** 决定哪些字段该覆盖、哪些该保留。

```javascript
function mergeFileData(existing, incoming) {
    if (!existing) return incoming || {};
    return {
        ...existing,
        ...incoming,
        annotations: incoming.annotations !== undefined ? incoming.annotations : existing.annotations,
        heatMap:     incoming.heatMap     !== undefined ? incoming.heatMap     : existing.heatMap,
        metadata:    incoming.metadata    !== undefined ? incoming.metadata    : existing.metadata,
        cover:       incoming.cover       !== undefined ? incoming.cover       : existing.cover,
        content:     incoming.content     !== undefined ? incoming.content     : existing.content,
        customRegex: incoming.customRegex !== undefined ? incoming.customRegex : existing.customRegex,
        chapterNumbering: incoming.chapterNumbering !== undefined ? incoming.chapterNumbering : existing.chapterNumbering,
    };
}
```

**规则说明：**
- `undefined` 表示 "本次未提供该字段"，应保留旧值
- `null` 表示 "明确清空该字段"，应覆盖为 null
- 如果新增字段也需要 "未提供则保留旧值" 的语义，**必须在此函数中显式声明**

#### 2) `normalizeRecord(fileKey, mergedData, contentSize)`

**唯一的记录构造真理源。** 所有字段默认值集中在这里。

```javascript
function normalizeRecord(fileKey, mergedData, contentSize) {
    return {
        fileKey,
        fileName: mergedData.fileName,
        fileType: mergedData.fileType,
        fileSize: mergedData.fileSize || 0,
        contentSize: contentSize || 0,
        content: mergedData.content,
        wordCount: mergedData.wordCount || 0,
        totalItems: mergedData.totalItems || 0,
        lastChapter: mergedData.lastChapter || 0,
        lastScrollIndex: mergedData.lastScrollIndex || 0,
        chapterTitle: mergedData.chapterTitle || '',
        lastReadTime: mergedData.lastReadTime || getLocalTimeString(),
        created_at: mergedData.created_at || getLocalTimeString(),
        customRegex: mergedData.customRegex || { chapter: '', section: '' },
        chapterNumbering: mergedData.chapterNumbering || 'none',
        annotations: mergedData.annotations || [],
        cover: mergedData.cover || null,
        heatMap: mergedData.heatMap || null,
        metadata: mergedData.metadata || null,
    };
}
```

**关键意义：** 以后新增任何字段（如 `readingTimeMinutes`、`tags`），**只需改这里一处**，三个平台自动生效。

#### 3) `runImportBatch(adapter, books, onProgress)`

统一批量导入。 historically `CapacitorSQLiteImpl` 的 `onProgress` 第三参数传的是 `boolean`，其他两端传的是 `number`（成功数）。现在由 `runImportBatch` 统一控制，签名永远一致：

```javascript
if (onProgress) onProgress(i + 1, books.length, results.success);
```

#### 4) `runExportBatch(adapter)`

统一批量导出，返回结构标准化：

```javascript
{
    version: 2,
    exportType: 'batch',
    exportDate: '...',
    appName: 'Lumina Reader',
    books: [...],
    totalBooks: N,
    totalSize: 0   // 统一为数字，消费端自行格式化
}
```

#### 5) `validateBookData(book)` / `createImportRecord(book)`

导入前置校验和记录模板构造，避免三个实现类各自维护导入字段映射。

### 3.3 兼容性别名

旧代码中大量存在 `Lumina.DB.getLocalTimeString()` 和 `Lumina.DB.generateFileKey()` 的直接调用。为保持零侵入：

```javascript
Lumina.DB.getLocalTimeString = getLocalTimeString;
Lumina.DB.generateFileKey    = generateFileKey;
```

---

## 4. 四端实现类职责

### 4.1 IndexedDBImpl（Web 本地）

只负责 `IDBTransaction` 操作。`saveFile` 精简为：

```javascript
async saveFile(fileKey, data) {
    const existing = await this.getFile(fileKey);
    const merged   = H.mergeFileData(existing, data);
    const record   = H.normalizeRecord(fileKey, merged, contentSize);
    record.created_at = existing?.created_at || data.created_at || H.getLocalTimeString();
    // ... IDBRequest put
}
```

### 4.2 SQLiteImpl（Web + Python 后端）

只负责 `fetch` HTTP 通信和 `undefined→null` 清洗（Python `json` 模块不接受 `undefined`）。

**端点契约（必须与 `web/server.py` 保持一致）：**

| 操作 | 端点 | 方法 | Body |
|------|------|------|------|
| 健康检查 | `/api/health` | GET | - |
| 保存 | `/api/save` | POST | `{ fileKey, data }` |
| 读取 | `/api/file/${fileKey}` | GET | - |
| 删除 | `/api/file/${fileKey}` | DELETE | - |
| 批量查询 | `/api/batch` | POST | `{ requests: [...] }` |

### 4.3 CapacitorSQLiteImpl（Android App）

只负责 `window.dbBridge` 调用。桥接方法为：

- `dbBridge.save(fileKey, object)` — 注意传 **对象**，不要 `JSON.stringify`
- `dbBridge.get(fileKey)` — 返回解析后的对象
- `dbBridge.delete(fileKey)`
- `dbBridge.getList()` — 返回对象数组

### 4.4 WebCacheIndexedDBImpl（二级缓存）

作为 `SQLiteImpl` 的本地加速层，存储在独立的 IndexedDB 数据库 `LuminaWebCacheDB` 中。本身也复用 `H.mergeFileData` 和 `H.normalizeRecord`。

---

## 5. StorageAdapter 代理层

### 5.1 参数守门员

在数据进入实现类之前做轻量校验，减少底层重复防御代码：

```javascript
async saveFile(fileKey, data) {
    if (!fileKey || typeof fileKey !== 'string') {
        throw new Error('saveFile: fileKey must be a non-empty string');
    }
    if (!data || typeof data !== 'object') {
        throw new Error('saveFile: data must be an object');
    }
    // ...
}
```

### 5.2 模式感知双写

Web SQLite 模式下，`saveFile` / `deleteFile` / `updateCover` 会同时操作远程 SQLite 和本地 `webCache`：

```javascript
const result = await this.impl.saveFile(fileKey, data);
if (this.mode === 'sqlite' && this.webCache) {
    await this.webCache.saveFile(fileKey, data);
}
```

### 5.3 兼容性方法

以下方法旧代码直接调用，已在代理层提供兼容实现：

| 方法 | 说明 |
|------|------|
| `getFileSmart(fileKey)` | Web SQLite 模式下先查本地缓存，再查远程 |
| `getStorageStats()` | 自动调用 `impl.getStorageStats()` 或兜底包装 `getStorageInfo()` |
| `findByFileName(name)` | 自动调用 `impl.findByFileName()` 或返回 `null` |
| `clearFileCache(key)` / `clearAllCache()` | 优先操作 `webCache` |

---

## 6. 关键数据流：保存一本书

以 **App 端打开一本已有书籍并翻页** 为例，数据如何安全保存：

```
1. 用户翻页
   └─> actions.js 调用 Lumina.DB.adapter.saveFile(fileKey, {
          lastChapter: 5,
          lastScrollIndex: 120,
          lastReadTime: '...'
       })

2. StorageAdapter 校验参数后，分发给 CapacitorSQLiteImpl

3. CapacitorSQLiteImpl.saveFile
   ├─> this.getFile(fileKey) 读取现有记录（含 annotations、heatMap、cover 等）
   ├─> H.mergeFileData(existing, incoming)
   │      保留 existing 中的 annotations、heatMap、metadata、cover、content
   │      用 incoming 覆盖 lastChapter、lastScrollIndex、lastReadTime
   ├─> H.normalizeRecord(fileKey, merged, contentSize)
   │      补齐所有字段默认值
   ├─> 保留 created_at = existing.created_at（防止创建时间被刷新）
   └─> dbBridge.save(fileKey, record) 写入原生 SQLite

4. 下次打开同一本书
   └─> getFile(fileKey) 返回完整合并后的记录，阅读进度和批注都在
```

**关键安全点：** `mergeFileData` 确保 `undefined` 不会覆盖已有值，这是防止进度丢失的底线。

---

## 7. 业务与技术收益

### 7.1 维护成本断崖式下降

| 场景 | 重构前 | 重构后 |
|------|--------|--------|
| 新增一个书库字段 | 改 10 处 | **改 1 处**（`normalizeRecord`） |
| 修复数据合并逻辑 | 改 4 个 `saveFile` | **改 1 处**（`mergeFileData`） |
| 调整导入导出结构 | 改 3 个 `importBatch` / `exportBatch` | **改 1 处**（`runImportBatch` / `runExportBatch`） |
| 调整 `onProgress` 签名 | 改 3 处 | **改 1 处** |

### 7.2 新增字段的标准流程（示例）

假设要新增 `readingTimeMinutes`（阅读时长，单位分钟）：

1. **修改 `db-helpers.js` 的 `normalizeRecord`**：
   ```javascript
   readingTimeMinutes: mergedData.readingTimeMinutes || 0,
   ```
2. **（可选）如果该字段需要合并保留**：
   ```javascript
   // 在 mergeFileData 中增加
   readingTimeMinutes: incoming.readingTimeMinutes !== undefined
       ? incoming.readingTimeMinutes
       : existing.readingTimeMinutes,
   ```
3. **修改 `web/server.py` 的表结构**（如果是 Web SQLite 模式）：
   ```sql
   ALTER TABLE books ADD COLUMN readingTimeMinutes INTEGER DEFAULT 0;
   ```
4. **修改 `db-bridge.js` 的 `save` / `rowToFile` / `getList`**（如果是 APP 模式）
5. **在业务层（如 `actions.js` 或 `renderer.js`）使用该字段**

### 7.3 为 TypeScript 迁移铺路

当数据处理逻辑收敛到 `db-helpers.js` 后，未来引入 TS 时只需先给 `DBHelpers` 和 `StorageAdapter` 写类型定义。三个实现类因为职责变单纯，类型标注也变得非常简单。

---

## 8. 后续开发最佳实践

### 8.1 绝不复制 `mergeFileData` 逻辑

**禁止**在任何实现类、`data-manager.js`、`actions.js` 中手写类似下面的代码：

```javascript
// ❌ 错误示范
const merged = {
    ...existing,
    ...data,
    annotations: data.annotations || existing.annotations
};
```

**正确做法：** 永远调用 `H.mergeFileData(existing, data)`。

### 8.2 新增字段必须进 `normalizeRecord`

如果一个字段在数据库持久化中存在，**必须在 `normalizeRecord` 中给出默认值**。否则当旧数据被读取时，该字段会是 `undefined`，导致 JSON 序列化丢失或 UI 显示异常。

### 8.3 端点修改必须同步 `server.py`

`SQLiteImpl` 的 `fetch` 端点与 `web/server.py` 是硬契约。修改任何一方的端点路径、请求体结构、响应体结构，都必须同步修改另一方。

**推荐做法：** 在 `SQLiteImpl` 和 `server.py` 的对应位置添加同版本注释标记，如 `# API-v3.0`。

### 8.4 APP 桥接方法名核对清单

重构期间最大的坑就是把 `dbBridge.load()` 错写成 `dbBridge.get()`。每次修改 `CapacitorSQLiteImpl` 后，请核对：

| JS 层调用 | db-bridge.js 实际方法 | 参数类型 |
|-----------|----------------------|---------|
| `dbBridge.save(key, obj)` | `save(fileKey, data)` | `data` 是 **对象**，非 JSON 字符串 |
| `dbBridge.get(key)` | `get(fileKey)` | 返回 **对象** |
| `dbBridge.delete(key)` | `delete(fileKey)` | - |
| `dbBridge.getList()` | `getList()` | 返回 **对象数组** |

### 8.5 完整测试闭环（任何存储层改动后必须执行）

改动存储层后，必须在三种模式下跑通以下闭环：

```
打开书 → 翻页/添加批注 → 关闭 → 重新打开 → 确认进度和批注都在 → 导出 .lmn → 导入 .lmn → 确认数据完整
```

- **Web 本地（IndexedDB）**：Chrome DevTools → Application → IndexedDB 可观察数据
- **Web + Python（SQLite）**：启动 `python web/server.py`，观察控制台 `/api` 请求
- **APP（Capacitor SQLite）**：通过 Android Studio logcat 观察 `[DB]` / `[CapacitorSQLite]` 日志

### 8.6 避免 `instanceof` 检查存储模式

旧代码中有：

```javascript
// ❌ 已废弃
if (Lumina.DB.adapter instanceof Lumina.DB.SQLiteImpl) { ... }
```

重构后 `adapter` 永远是 `StorageAdapter` 实例。**正确做法：**

```javascript
if (Lumina.DB.adapter.getStorageMode() === 'sqlite') { ... }
```

---

## 9. 常见陷阱与排查

### 9.1 书库显示 "暂无本地数据"，但统计有数字

**原因：** `StorageAdapter.getStorageStats()` 的兜底逻辑返回了 `files: []`。

**修复状态：** 已修复。当前兜底逻辑会调用 `getAllFiles()` 填充 `files` 数组。

### 9.2 Web SQLite 模式回退到 IndexedDB

**原因 1：** `SQLiteImpl.init()` 没有 `return this.isReady`，导致 `init.js` 误判为失败。

**修复状态：** 已修复。所有 `init()` 方法现在都返回 `this.isReady`。

**原因 2：** Python 后端 `server.py` 未启动，或端口不一致。

**排查：** 浏览器 Network 面板查看 `/api/health` 是否 200。

### 9.3 APP 端导入成功但无法打开（0字 / Untitled）

**原因：** `CapacitorSQLiteImpl` 错误地调用了 `dbBridge.load()` 或 `dbBridge.list()`，或把 `JSON.stringify(record)` 传给 `dbBridge.save()`。

**修复状态：** 已修复。当前严格使用 `get` / `getList` / `save` 并传对象。

### 9.4 被动打开文件报错 "findByFileName is not a function"

**原因：** 重构时误删了 `findByFileName`。

**修复状态：** 已修复。`StorageAdapter` 和四个实现类均已恢复该方法。

---

## 10. 附录：接口契约速查

### 10.1 StorageAdapter 公开接口

```typescript
interface StorageAdapter {
    init(): Promise<void>;
    use(type: 'indexeddb' | 'sqlite' | 'capacitor'): Promise<boolean>;
    saveFile(fileKey: string, data: object): Promise<boolean>;
    getFile(fileKey: string): Promise<object | null>;
    getFileSmart(fileKey: string): Promise<object | null>;   // Web SQLite 优先读缓存
    deleteFile(fileKey: string): Promise<boolean>;
    getAllFiles(): Promise<object[]>;
    searchFiles(keyword: string): Promise<object[]>;
    importBatch(books: object[], onProgress?): Promise<{success, failed, errors}>;
    exportBatch(): Promise<object | null>;
    exportFile(fileKey: string): Promise<object | null>;
    updateCover(fileKey: string, coverDataUrl: string): Promise<boolean>;
    overwriteFile(oldKey, newKey, newData, oldData): Promise<boolean>;
    findByFileName(fileName: string): Promise<object | null>;
    getStorageStats(): Promise<{files, totalFiles, totalSize, imageCount, maxFiles}>;
    getStorageInfo(): Promise<{count, maxCount, totalSize}>;
    clearStorage(): Promise<boolean>;
    getStorageMode(): string;
    generateFileKey(file: File): string;
}
```

### 10.2 变更日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-04-02 | v2.0 | 修复 `saveFile` 合并逻辑，防止阅读进度丢失 |
| 2026-04-14 | v3.0 | 引入 `db-helpers.js`，重构四端实现类，收敛数据处理逻辑 |

### 10.3 责任人

- **存储层核心维护**：负责 `db-helpers.js`、`db.js`、`db-bridge.js`、`server.py` 的变更一致性审查
- **前端业务开发**：调用 `StorageAdapter` 接口，禁止绕过代理层直接访问 `impl`

---

**文档结束。如有存储层相关的设计变更，请先更新本文档，再提交代码。**
