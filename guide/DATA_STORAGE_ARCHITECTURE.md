# 流萤阅读器数据存储架构技术文档

> 版本: 2.0  
> 更新日期: 2026-04-02  
> 适用对象: 产品经理、前端/后端开发人员、架构师

---

## 目录

1. [架构概览](#1-架构概览)
2. [三种存储模式详解](#2-三种存储模式详解)
3. [数据流与一致性](#3-数据流与一致性)
4. [关键修复记录](#4-关键修复记录)
5. [性能对比](#5-性能对比)
6. [开发规范](#6-开发规范)
7. [故障排查](#7-故障排查)
8. [附录](#8-附录)

---

## 1. 架构概览

### 1.1 核心设计原则

流萤阅读器采用**"按需适配、本地优先、数据合并"**的存储架构：

```
┌─────────────────────────────────────────────────────────────────┐
│                      统一存储接口层                               │
│              Lumina.DB.StorageAdapter                           │
│  ┌──────────────┬──────────────┬──────────────────────────────┐ │
│  │  IndexedDB   │  HTTP+SQLite │     Capacitor SQLite         │ │
│  │   (本地)      │  (Web+Python)│       (App原生)               │ │
│  │  纯Web模式    │  开发/部署模式 │     移动端APP                │ │
│  └──────────────┴──────────────┴──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 模式选择逻辑 (db.js)

```javascript
const isCapacitor = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
let STORAGE_BACKEND = isCapacitor ? 'capacitor-sqlite' : 
                      (location.protocol === 'file:' ? 'indexeddb' : 'sqlite');
```

| 运行环境 | 自动选择模式 | 数据存储位置 | 文件 |
|---------|------------|-------------|------|
| 纯 Web (file://) | `indexeddb` | 浏览器 IndexedDB | `db.js` |
| Web + Python 后端 (http/https) | `sqlite` | 后端 SQLite + 浏览器 IndexedDB(缓存) | `db.js` |
| App (iOS/Android) | `capacitor-sqlite` | 设备本地 SQLite | `db.js` |

**注意:** 模式选择逻辑位于 `db.js` 的 `StorageAdapter.init()` 中。`db-helpers.js` 提供数据合并、标准化、导入导出等通用逻辑，被所有实现类共用。

---

## 2. 三种存储模式详解

### 2.1 IndexedDB 模式 (纯本地模式)

**适用场景:** 纯浏览器环境、无后端、本地文件打开 (`file://` 协议)

**实现类:** `Lumina.DB.IndexedDBImpl`

**数据模型:**
```javascript
{
    fileKey: "string",           // 文件唯一标识
    fileName: "string",          // 原始文件名
    fileType: "txt|epub|pdf",    // 文件类型
    fileSize: 12345,             // 原始文件字节数
    contentSize: 50000,          // 序列化后 content 字节数（用于存储统计）
    content: [...],              // 解析后的章节数组
    wordCount: 50000,            // 字数统计
    totalItems: 120,             // 章节/item 总数
    lastChapter: 5,              // 最后阅读章节
    lastScrollIndex: 100,        // 滚动位置
    chapterTitle: "第一章",      // 章节标题
    customRegex: {...},          // 自定义解析规则
    chapterNumbering: "chineseNovel",
    annotations: [...],          // 注释/书签
    cover: "data:image/...",     // 封面图片
    heatMap: {...},              // 热力图数据
    metadata: {...},             // 书籍元数据
    lastReadTime: "2026-04-02 10:00:00",
    created_at: "2026-04-02 10:00:00"
}
```

**存储限制:**
- 最大文件数: 50 本 (`MAX_FILES`)
- 单本大小: 受浏览器限制 (通常 50MB+)
- 总容量: 受浏览器存储配额限制

**saveFile 合并逻辑 (db-helpers.js):**

```javascript
// 关键：查询现有数据并合并，避免重新打开文件时丢失阅读进度
// 注意：lastChapter / lastScrollIndex / chapterTitle 不在显式保护列表中，
//       若传入的 data 包含这些字段（即使是 0 或空字符串），会直接覆盖 existing
const mergedData = existingRecord ? {
    ...existingRecord,  // 保留所有现有字段
    ...data,            // 用新数据覆盖
    // 显式保护：undefined 时保留 existing
    annotations: data.annotations !== undefined ? data.annotations : existingRecord.annotations,
    heatMap: data.heatMap !== undefined ? data.heatMap : existingRecord.heatMap,
    metadata: data.metadata !== undefined ? data.metadata : existingRecord.metadata,
    cover: data.cover !== undefined ? data.cover : existingRecord.cover,
    content: data.content !== undefined ? data.content : existingRecord.content,
    customRegex: data.customRegex !== undefined ? data.customRegex : existingRecord.customRegex,
    chapterNumbering: data.chapterNumbering !== undefined ? data.chapterNumbering : existingRecord.chapterNumbering,
} : data;
```

---

### 2.2 Web SQLite 模式 (HTTP + 本地缓存)

**适用场景:** 开发环境、桌面端配合 Python 后端、`http://localhost` 或部署环境

**实现类:** 
- 主存储: `Lumina.DB.SQLiteImpl` (HTTP API)
- 二级缓存: `Lumina.DB.WebCacheIndexedDBImpl` (IndexedDB)

**架构特点:**
```
┌─────────────────────────────────────────────────────────┐
│                    Web SQLite 模式                       │
├─────────────────────────────────────────────────────────┤
│  浏览器层                                                │
│  ┌─────────────────┐    ┌───────────────────────────┐  │
│  │ 内存缓存 (Map)   │    │ IndexedDB (WebCache)      │  │
│  │ - 热数据缓存     │    │ - content 字段专用缓存     │  │
│  │ - 页面刷新清空   │    │ - 持久化存储              │  │
│  └─────────────────┘    └───────────────────────────┘  │
│           │                          │                  │
│           └──────────┬───────────────┘                  │
│                      │ HTTP API                         │
│                      ▼                                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Python + SQLite 后端                 │  │
│  │  - 主数据源 (真相源)                               │  │
│  │  - 持久化存储                                     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**双写机制 (Write-Through):**
```
saveFile() 流程:
    1. 从服务器获取完整现有数据 (关键修复：不能仅依赖内存缓存)
    2. 合并数据 (服务器数据 + 新数据)
    3. POST 到 Python SQLite (主数据源)
    4. 成功后同时写入 IndexedDB 二级缓存
```

**读取优先级 (getFileSmart):**
```
getFileSmart() 流程:
    1. 查内存缓存 → 命中直接返回
    2. 查本地 IndexedDB → 命中返回，同时后台同步到 IndexedDB
    3. HTTP 从服务器获取 → 保存到 IndexedDB → 返回
```

**关键修复 (2026-04-02):**

| 组件 | 问题 | 修复方案 |
|------|------|----------|
| `SQLiteImpl.saveFile` | 只从内存缓存获取 existing 数据，页面刷新后缓存为空，导致数据丢失 | 先从服务器 `getFile` 获取完整数据，再合并 |
| `WebCacheIndexedDBImpl.saveFile` | 直接覆盖存储，不保留阅读进度等字段 | 查询现有数据并合并所有字段 |

**修复后的字段合并策略:**
```javascript
// SQLiteImpl 和 WebCacheIndexedDBImpl 统一处理
const record = {
    ...existing,           // 基础数据
    ...data,               // 新数据覆盖
    // 阅读进度：优先保留 existing（除非 data 中有更新的值）
    lastChapter: data.lastChapter || existing?.lastChapter || 0,
    lastScrollIndex: data.lastScrollIndex || existing?.lastScrollIndex || 0,
    chapterTitle: data.chapterTitle || existing?.chapterTitle || '',
    customRegex: data.customRegex || existing?.customRegex || { chapter: '', section: '' },
    chapterNumbering: data.chapterNumbering || existing?.chapterNumbering || 'none',
    // 其他字段：data 有则用 data，否则保留 existing
    annotations: data.annotations !== undefined ? data.annotations : existing?.annotations,
    heatMap: data.heatMap !== undefined ? data.heatMap : existing?.heatMap,
    metadata: data.metadata !== undefined ? data.metadata : existing?.metadata,
    cover: data.cover !== undefined ? data.cover : existing?.cover,
};
```

---

### 2.3 Capacitor SQLite 模式 (App 原生)

**适用场景:** iOS/Android App (Capacitor 打包)

**实现类:** `Lumina.DB.CapacitorSQLiteImpl`

**架构特点:**
```
┌─────────────────────────────────────┐
│       Capacitor SQLite 模式          │
├─────────────────────────────────────┤
│  App 层 (WebView)                   │
│  ┌───────────────────────────────┐ │
│  │ 内存缓存 (Map)                 │ │
│  │ - 单会话热数据缓存             │ │
│  │ - 减少原生桥接调用             │ │
│  │ - APP 生命周期内有效           │ │
│  └───────────────────────────────┘ │
│              │                      │
│              ▼ Capacitor Bridge    │
│  ┌───────────────────────────────┐ │
│  │   原生 SQLite 数据库           │ │
│  │   (iOS/Android 本地文件)       │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

**设计决策:**
- ❌ **无 IndexedDB 二级缓存** - 原生 SQLite 已足够快 (<1ms)
- ✅ **内存缓存保留** - 减少同一会话内的重复桥接调用
- ✅ **列表缓存** - 30 秒有效期，减少原生查询次数

**saveFile 合并逻辑:**
```javascript
// 复用 db-helpers.js 的 mergeFileData 进行统一合并
const existing = this.cache.get(fileKey) || await this.getFile(fileKey);
const mergedData = Lumina.DB.DBHelpers.mergeFileData(existing, data);
```

---

## 3. 数据流与一致性

### 3.1 文件打开流程

#### IndexedDB / Capacitor 模式
```
用户点击书籍
    ↓
getFile(fileKey)
    ↓
直接读取本地数据库
    ↓
返回数据渲染 (10-50ms)
```

#### Web SQLite 模式
```
用户点击书籍
    ↓
getFileSmart(fileKey)
    ↓
┌──────────────────────────────────────────┐
│ 1. 查本地 IndexedDB                      │
│    - 有 content?                         │
│      ↓ 是 → 立即返回本地数据 (秒开)       │
│      ↓ 否                                │
│        2. HTTP 从 Python 获取            │
│        3. 保存到 IndexedDB (延迟 500ms)  │
│        4. 返回数据                        │
└──────────────────────────────────────────┘
```

### 3.2 数据保存与合并流程

**统一合并策略 (三种模式均已实现):**

```javascript
// 保存前必须获取完整现有数据
let existing = this.cache.get(fileKey);
if (!existing && isHttpMode) {
    existing = await this.getFile(fileKey); // 从服务器获取
}

// 合并数据
const mergedData = {
    ...existing,
    ...data,
    // 字段级合并：data 有则用 data，否则保留 existing
    lastChapter: data.lastChapter || existing?.lastChapter || 0,
    lastScrollIndex: data.lastScrollIndex || existing?.lastScrollIndex || 0,
    chapterTitle: data.chapterTitle || existing?.chapterTitle || '',
    customRegex: data.customRegex || existing?.customRegex,
    chapterNumbering: data.chapterNumbering || existing?.chapterNumbering,
    annotations: data.annotations !== undefined ? data.annotations : existing?.annotations,
    heatMap: data.heatMap !== undefined ? data.heatMap : existing?.heatMap,
    metadata: data.metadata !== undefined ? data.metadata : existing?.metadata,
    cover: data.cover !== undefined ? data.cover : existing?.cover,
};
```

### 3.3 书库列表获取

| 模式 | 策略 | 延迟 |
|-----|------|------|
| IndexedDB | 直接查询 | < 10ms |
| Web SQLite | HTTP GET (禁用缓存) | 20-100ms |
| Capacitor | 查询原生 + 30秒缓存 | < 10ms |

---

## 4. 关键修复记录

### 4.1 2026-04-02 数据丢失修复

**问题描述:**
Web SQLite 模式下，重新打开书籍时，阅读进度、章节设置、批注等字段丢失。

**根本原因:**
1. `SQLiteImpl.saveFile` 只从内存缓存获取 existing 数据，HTTP 模式下内存缓存在页面刷新后清空
2. `WebCacheIndexedDBImpl.saveFile` 直接覆盖存储，不合并阅读进度字段
3. `IndexedDBImpl.saveFile` 同样存在合并逻辑缺失

**修复方案:**

| 文件 | 修复内容 |
|------|----------|
| `db.js` - `SQLiteImpl.saveFile` | 先从服务器 `getFile` 获取完整数据，再合并 |
| `db.js` - `WebCacheIndexedDBImpl.saveFile` | 查询现有数据并合并所有阅读进度字段 |
| `db.js` - `IndexedDBImpl.saveFile` | 添加相同的数据合并逻辑 |

**修复后的字段保护:**
- `lastChapter` / `lastScrollIndex` / `chapterTitle` - 阅读进度
- `customRegex` / `chapterNumbering` - 章节解析设置
- `annotations` - 批注数据
- `heatMap` - 热力图数据
- `metadata` - 书籍元数据
- `cover` - 封面图片

---

## 5. 性能对比

### 5.1 读取性能

| 操作 | IndexedDB | Web SQLite(有缓存) | Web SQLite(无缓存) | Capacitor |
|-----|-----------|-------------------|-------------------|-----------|
| 打开书籍 | 10ms | 5ms | 500ms | 10ms |
| 获取列表 | 10ms | 50ms | 50ms | 10ms |
| 搜索全文 | 100ms | 500ms | 500ms | 100ms |

### 5.2 写入性能

| 操作 | IndexedDB | Web SQLite | Capacitor |
|-----|-----------|-----------|-----------|
| 保存阅读进度 | 10ms | 100ms | 10ms |
| 添加注释 | 10ms | 100ms | 10ms |
| 导入大文件 | 1s | 5s | 1s |

---

## 6. 开发规范

### 6.1 添加新字段的规范

当需要为书籍数据添加新字段时:

1. **更新数据模型** - 在 `IndexedDBImpl`, `SQLiteImpl`, `CapacitorSQLiteImpl` 中统一添加
2. **saveFile 合并逻辑** - 确保新字段正确处理 `undefined` 值
3. **导出/导入** - 更新 `exportFile` 和 `importBatch` 方法
4. **向后兼容** - 旧数据读取时设置默认值

```javascript
// 合并模板
const mergedData = {
    ...existing,
    ...data,
    newField: data.newField !== undefined ? data.newField : existing?.newField
};
```

### 6.2 存储模式检测

```javascript
// 检测当前模式
const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
const isCapacitor = Lumina.DB.adapter.impl instanceof Lumina.DB.CapacitorSQLiteImpl;
const isIndexedDB = !isSQLite && !isCapacitor;

// 检测 HTTP 模式
const isHttpMode = location.href.startsWith('http');
```

### 6.3 调试技巧

```javascript
// 查看当前存储状态
console.log('Storage Mode:', Lumina.DB.adapter.impl.constructor.name);

// 查看缓存统计 (Web SQLite)
const stats = await Lumina.DB.adapter.impl.getCacheStats?.();
console.log('Cache Stats:', stats);

// 清空内存缓存 (调试用)
// 注意：IndexedDBImpl 没有 cache 属性，仅在 SQLiteImpl / CapacitorSQLiteImpl 下有效
Lumina.DB.adapter.impl.cache?.clear?.();
```

---

## 7. 故障排查

### 7.1 阅读进度丢失

**症状:** 重新打开书后，阅读进度、章节设置恢复默认值

**排查:**
1. 确认 `saveFile` 是否从服务器/本地获取了完整 existing 数据
2. 检查合并逻辑是否正确处理了 `undefined` 值
3. 查看控制台是否有 `getFile` 或 `saveFile` 报错

### 7.2 Web SQLite 后端无响应

**症状:** 书库列表加载失败，提示网络错误

**排查:**
1. 检查 Python 后端服务是否启动 (`localhost:8080`)
2. 检查 `/api/health` 接口是否返回 200
3. 查看浏览器 Network 面板是否有 CORS 错误

### 7.3 存储模式判断错误

**症状:** APP 模式下使用了 IndexedDB，或 Web 模式下未使用 SQLite

**排查:**
```javascript
// 在控制台执行检查
console.log('Capacitor:', typeof Capacitor !== 'undefined');
console.log('isNativePlatform:', Capacitor?.isNativePlatform?.());
console.log('href:', location.href);
console.log('Backend:', Lumina.DB.adapter.impl.constructor.name);
```

---

## 8. 附录

### 8.1 API 速查表

| 方法 | 描述 | IndexedDB | Web SQLite | Capacitor |
|-----|------|-----------|------------|-----------|
| `init()` | 初始化存储 | ✅ | ✅ | ✅ |
| `getFileSmart(fileKey)` | 智能读取 (优先缓存) | ✅ | ✅ | ✅ |
| `getFile(fileKey)` | 直接读取 | ✅ | ✅ | ✅ |
| `saveFile(fileKey, data)` | 保存文件（带合并） | ✅ | ✅ | ✅ |
| `deleteFile(fileKey)` | 删除文件 | ✅ | ✅ | ✅ |
| `getStorageStats()` | 获取书库统计 | ✅ | ✅ | ✅ |
| `getCacheStats()` | 获取缓存统计 | ❌ | ✅ | ❌ |
| `clearFileCache(fileKey)` | 清理单文件缓存 | ❌ | ✅ | ❌ |
| `clearAllCache()` | 清理全部缓存 | ❌ | ✅ | ❌ |

### 8.2 文件结构

```
app/www/js/modules/
├── db.js              # 核心存储层 (StorageAdapter + 三种实现 + WebCache)
├── db-helpers.js      # 数据合并/标准化/导入导出（被所有实现类共用）
├── cache-manager.js   # 缓存管理 UI (Web SQLite 专用)
└── data-manager.js    # 书库管理 UI

app/www/css/
├── main.css           # about-panel 样式 (复用)
└── cache-manager.css  # 缓存管理特有样式
```

### 8.3 历史变更

| 日期 | 变更 | 影响 |
|-----|------|------|
| 2026-04-02 | 修复三种模式的 `saveFile` 数据合并逻辑 | 解决重新打开文件时阅读进度丢失问题 |
| 2026-03-30 | 移除 Web SQLite 的 `syncFromRemote` | 简化逻辑，减少 HTTP 请求 |
| 2026-03-30 | 移除 Capacitor 的 IndexedDB 缓存 | 减少冗余，简化代码 |
| 2026-03-30 | 添加缓存管理 UI | 用户可控清理 Web SQLite 本地缓存 |

---

## 总结

流萤阅读器的存储架构通过**统一接口层**屏蔽底层差异，实现了一套代码适配三种运行环境：

| 模式 | 特点 | 适用场景 |
|-----|------|----------|
| **IndexedDB** | 纯浏览器，零依赖，完全离线 | 本地测试、离线使用 |
| **Web SQLite** | 后端持久化 + 前端缓存加速 | 开发调试、Web 部署 |
| **Capacitor SQLite** | 原生性能，最稳定 | 移动端 APP |

**核心设计思想:**
1. **本地优先** - 有缓存先用缓存，保证用户体验
2. **数据合并** - `saveFile` 必须合并现有数据，避免丢失用户进度
3. **后端为源** - Web SQLite 以 Python 后端为真相源
4. **简单可靠** - 避免过度设计，减少同步复杂度

---

*本文档由开发团队维护，如有疑问请联系架构负责人。*
