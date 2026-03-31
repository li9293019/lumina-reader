# Lumina Reader 数据存取架构技术文档

> 版本: 1.0  
> 更新日期: 2026-03-30  
> 适用对象: 产品经理、前端/后端开发人员、架构师

---

## 目录

1. [架构概览](#1-架构概览)
2. [三种存储模式详解](#2-三种存储模式详解)
3. [数据流分析](#3-数据流分析)
4. [缓存策略](#4-缓存策略)
5. [性能对比](#5-性能对比)
6. [一致性保障](#6-一致性保障)
7. [错误处理与降级](#7-错误处理与降级)
8. [开发规范与最佳实践](#8-开发规范与最佳实践)
9. [附录](#9-附录)

---

## 1. 架构概览

### 1.1 核心设计原则

Lumina Reader 采用**"按需适配、本地优先"**的存储架构，根据运行环境自动选择最优存储后端：

```
┌─────────────────────────────────────────────────────────────────┐
│                      统一存储接口层                               │
│              Lumina.DB.StorageAdapter                           │
│  ┌──────────────┬──────────────┬──────────────────────────────┐ │
│  │  IndexedDB   │  HTTP+SQLite │     Capacitor SQLite         │ │
│  │   (本地)      │  (Web+Python)│       (App原生)               │ │
│  └──────────────┴──────────────┴──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 模式选择逻辑

| 运行环境 | 自动选择模式 | 数据存储位置 |
|---------|------------|-------------|
| 纯 Web (file://) | IndexedDB | 浏览器 IndexedDB |
| Web + Python 后端 | Web SQLite | 后端 SQLite + 浏览器 IndexedDB(缓存) |
| App (iOS/Android) | Capacitor SQLite | 设备本地 SQLite |

---

## 2. 三种存储模式详解

### 2.1 IndexedDB 模式 (纯本地模式)

**适用场景:** 纯浏览器环境、无后端、本地文件打开

**实现类:** `Lumina.DB.IndexedDBImpl`

**数据模型:**
```javascript
{
    fileKey: "string",           // 文件唯一标识
    fileName: "string",          // 原始文件名
    fileType: "txt|epub|pdf",    // 文件类型
    fileSize: 12345,             // 字节数
    content: [...],              // 解析后的章节数组
    wordCount: 50000,            // 字数统计
    lastChapter: 5,              // 最后阅读章节
    lastScrollIndex: 100,        // 滚动位置
    chapterTitle: "第一章",      // 章节标题
    customRegex: {...},          // 自定义解析规则
    chapterNumbering: "chineseNovel",
    annotations: [...],          // 注释/书签
    cover: "data:image/...",     // 封面图片
    heatMap: {...},              // 热力图数据
    lastReadTime: "2026-03-30 10:00:00",
    created_at: "2026-03-30 10:00:00"
}
```

**存储限制:**
- 最大文件数: 50 本
- 单本大小: 受浏览器限制 (通常 50MB+)
- 总容量: 受浏览器存储配额限制

**特性:**
- ✅ 完全离线可用
- ✅ 秒级读写
- ✅ 无网络依赖
- ❌ 多设备无法同步
- ❌ 浏览器清理数据时可能丢失

---

### 2.2 Web SQLite 模式 (HTTP + 本地缓存)

**适用场景:** 开发环境、桌面端配合 Python 后端

**实现类:** `Lumina.DB.SQLiteImpl`

**架构特点:**
```
┌─────────────────────────────────────────────────────────┐
│                    Web SQLite 模式                       │
├─────────────────────────────────────────────────────────┤
│  浏览器层                                                │
│  ┌─────────────────┐    ┌───────────────────────────┐  │
│  │ 内存缓存 (Map)   │    │ IndexedDB (WebCache)      │  │
│  │ - 热数据缓存     │    │ - content 字段专用缓存     │  │
│  │ - 减少重复解析   │    │ - 加速二次打开            │  │
│  └─────────────────┘    └───────────────────────────┘  │
│           │                          │                  │
│           └──────────┬───────────────┘                  │
│                      │ HTTP API                         │
│                      ▼                                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Python + SQLite 后端                 │  │
│  │  - 主数据源                                       │  │
│  │  - 持久化存储                                     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**双写机制 (Write-Through):**
```
saveFile() 流程:
    1. 合并数据 (内存缓存 + 新数据)
    2. POST 到 Python SQLite (主数据源)
    3. 成功后同时写入 IndexedDB 缓存
```

**读取优先级:**
```
getFileSmart() 流程:
    1. 检查内存缓存 → 命中直接返回
    2. 检查 IndexedDB → 命中返回，同时后台静默保存到 IndexedDB
    3. HTTP 获取 → 保存到 IndexedDB → 返回
```

**关键优化点:**

| 优化项 | 策略 | 效果 |
|-------|------|------|
| 书库列表 | 始终走 HTTP，不缓存 | 保证列表准确性 |
| 文件内容 | IndexedDB 缓存 | 二次打开秒开 |
| 双写一致性 | 先写后端，成功后写本地 | 数据一致性 |
| 延迟保存 | setTimeout 500ms | 避免与 saveFile 冲突 |

---

### 2.3 Capacitor SQLite 模式 (App 原生)

**适用场景:** iOS/Android App

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
- ❌ **无 IndexedDB 二级缓存** (2026-03-30 优化移除)
  - 原因: 原生 SQLite 已足够快 (<1ms)
  - 减少代码复杂度和存储冗余
- ✅ **内存缓存保留** - 减少同一会话内的重复桥接调用
- ✅ **列表缓存** - 30 秒有效期，减少原生查询次数

**与 Web SQLite 的关键差异:**

| 特性 | Web SQLite | Capacitor SQLite |
|-----|-----------|------------------|
| 主数据源 | Python 后端 | 本地 SQLite |
| 网络依赖 | 需要 | 不需要 |
| 二级缓存 | IndexedDB | 无 |
| 列表缓存 | ❌ 禁用 | ✅ 30 秒缓存 |
| 同步机制 | 后台 sync | 不需要 |

---

## 3. 数据流分析

### 3.1 文件打开流程对比

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

### 3.2 数据保存流程

#### 三种模式统一流程
```
用户操作 (添加注释/更新进度)
    ↓
saveFile(fileKey, data)
    ↓
合并数据 (内存缓存 + 新数据)
    ↓
┌───────────────────────────────────────────────┐
│ Web SQLite: POST 到后端 + 写入 IndexedDB      │
│ Capacitor: 写入原生 SQLite                    │
│ IndexedDB: 写入浏览器 IndexedDB               │
└───────────────────────────────────────────────┘
    ↓
更新内存缓存
    ↓
返回成功
```

### 3.3 书库列表获取

| 模式 | 策略 | 延迟 |
|-----|------|------|
| IndexedDB | 直接查询 | < 10ms |
| Web SQLite | HTTP GET (禁用缓存) | 20-100ms |
| Capacitor | 查询原生 + 30秒缓存 | < 10ms |

**Web SQLite 禁用列表缓存的原因:**
- 列表数据包含 `lastReadTime`、`annotations` 等频繁变化字段
- 缓存会导致"刚添加的书看不到"、"阅读进度不更新"等问题
- 列表数据量小 (KB 级)，实时获取可接受

---

## 4. 缓存策略

### 4.1 缓存层级

```
L1: 内存缓存 (Map)
    ├── 生命周期: 页面会话
    ├── 容量: 无限制 (GC 自动回收)
    └── 用途: 热数据，减少重复解析

L2: IndexedDB (仅 Web SQLite)
    ├── 生命周期: 持久化
    ├── 容量: 磁盘剩余空间
    └── 用途: content 字段专用，加速二次打开

L3: 原生 SQLite (Capacitor)
    ├── 生命周期: 持久化
    ├── 容量: 设备存储
    └── 用途: 完整数据源
```

### 4.2 缓存失效策略

| 操作 | Web SQLite | Capacitor |
|-----|-----------|-----------|
| 保存文件 | 内存 + IndexedDB 双写 | 内存 + SQLite 双写 |
| 删除文件 | 删除后端 + 删除 IndexedDB | 删除 SQLite |
| 导入批量 | 逐本保存，每本更新缓存 | 逐本保存 |
| 清理缓存 | 仅删 IndexedDB，保留后端 | 不适用 |

### 4.3 缓存管理 UI

提供用户可控的缓存清理功能 (仅 Web SQLite):

```
设置面板 → 书库管理 → 管理缓存数据
    ├── 显示: 已缓存书籍数、缓存大小
    ├── 列表: 书名、创建时间、更新时间、大小
    ├── 操作: 单个删除、全部清理
    └── 效果: 仅删除 content 字段，保留元数据
```

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

### 5.3 优化建议

**Web SQLite 优化:**
- 首次加载大文件时显示加载动画
- 利用缓存实现"二次打开秒开"
- 列表页面实时刷新，不依赖缓存

**Capacitor 优化:**
- 依赖原生性能，无需额外缓存层
- 大文件导入时考虑分片处理

---

## 6. 一致性保障

### 6.1 Web SQLite 双写一致性

```javascript
// 伪代码
async saveFile(fileKey, data) {
    // 1. 合并数据
    const merged = merge(memoryCache.get(fileKey), data);
    
    // 2. 先写后端 (主数据源)
    const result = await fetch('/save', { body: JSON.stringify(merged) });
    
    if (result.success) {
        // 3. 再写本地缓存 (从数据源)
        await indexedDB.saveFile(fileKey, merged);
        memoryCache.set(fileKey, merged);
    }
}
```

**一致性保证:**
- 写操作原子性: 后端成功才写本地
- 读操作优先级: 内存 > 本地 > 后端
- 冲突解决: 以 `lastReadTime` 最新为准

### 6.2 多标签页/多设备场景

| 场景 | 行为 | 建议 |
|-----|------|------|
| 单标签使用 | 双写保证一致 | 无需额外处理 |
| 多标签页 | 各自独立缓存 | 刷新页面可同步 |
| 多设备 | 完全隔离 | 导出/导入传输 |

**注意:** Web SQLite 模式不处理实时多标签同步，刷新页面时从后端获取最新数据。

---

## 7. 错误处理与降级

### 7.1 错误分级

| 级别 | 场景 | 处理策略 |
|-----|------|---------|
| 致命 | 后端无响应 | 显示错误提示，禁止操作 |
| 警告 | 缓存写入失败 | 静默忽略，不影响主流程 |
| 信息 | 后台同步失败 | 静默忽略，下次重试 |

### 7.2 降级策略

```
Web SQLite 模式:
    后端不可用 → 提示用户检查 Python 服务
    IndexedDB 失败 → 降级为纯 HTTP 模式 (无缓存加速)

Capacitor 模式:
    原生 SQLite 失败 → 尝试使用 IndexedDB 降级
```

---

## 8. 开发规范与最佳实践

### 8.1 添加新字段的规范

当需要为书籍数据添加新字段时:

1. **更新数据模型** - 在 `IndexedDBImpl`, `SQLiteImpl`, `CapacitorSQLiteImpl` 中统一添加
2. **saveFile 合并逻辑** - 确保新字段在合并时正确处理 `undefined` 值
3. **导出/导入** - 更新 `exportFile` 和 `importBatch` 方法
4. **向后兼容** - 旧数据读取时设置默认值

```javascript
// 合并示例
const mergedData = {
    ...existing,           // 旧数据
    ...data,               // 新数据
    newField: data.newField !== undefined ? data.newField : existing.newField
};
```

### 8.2 存储模式检测

```javascript
// 检测当前模式
const isSQLite = Lumina.DB.adapter.impl instanceof Lumina.DB.SQLiteImpl;
const isCapacitor = Lumina.DB.adapter.impl instanceof Lumina.DB.CapacitorSQLiteImpl;
const isIndexedDB = !isSQLite && !isCapacitor;

// 检测 HTTP 模式 (用于 UI 显示判断)
const isHttpMode = location.href.startsWith('http');
```

### 8.3 调试技巧

```javascript
// 查看当前存储状态
console.log('Storage Mode:', Lumina.DB.adapter.impl.constructor.name);

// 查看缓存统计 (Web SQLite)
const stats = await Lumina.DB.adapter.impl.getCacheStats();
console.log('Cache Stats:', stats);

// 清空内存缓存 (调试用)
Lumina.DB.adapter.impl.cache.clear();
```

---

## 9. 附录

### 9.1 API 速查表

| 方法 | 描述 | 所有模式支持 |
|-----|------|------------|
| `init()` | 初始化存储 | ✅ |
| `getFileSmart(fileKey)` | 智能读取 (优先缓存) | Web SQLite 特有 |
| `getFile(fileKey)` | 直接读取 | ✅ |
| `saveFile(fileKey, data)` | 保存文件 | ✅ |
| `deleteFile(fileKey)` | 删除文件 | ✅ |
| `getStorageStats()` | 获取书库统计 | ✅ |
| `getCacheStats()` | 获取缓存统计 | Web SQLite 特有 |
| `clearFileCache(fileKey)` | 清理单文件缓存 | Web SQLite 特有 |
| `clearAllCache()` | 清理全部缓存 | Web SQLite 特有 |

### 9.2 文件结构

```
app/www/js/modules/
├── db.js              # 核心存储层 (三种实现)
├── cache-manager.js   # 缓存管理 UI (Web SQLite)
└── data-manager.js    # 书库管理 UI

app/www/css/
├── main.css           # about-panel 样式 (复用)
└── cache-manager.css  # 缓存管理特有样式
```

### 9.3 历史变更

| 日期 | 变更 | 影响 |
|-----|------|------|
| 2026-03-30 | 移除 Web SQLite 的 `syncFromRemote` | 简化逻辑，减少 HTTP 请求 |
| 2026-03-30 | 移除 Capacitor 的 IndexedDB 缓存 | 减少冗余，简化代码 |
| 2026-03-30 | 添加缓存管理 UI | 用户可控清理 |

---

## 总结

Lumina Reader 的存储架构通过**统一接口层**屏蔽底层差异，实现了一套代码适配三种运行环境：

- **IndexedDB**: 纯浏览器，零依赖
- **Web SQLite**: 开发/桌面，后端持久化 + 前端加速
- **Capacitor SQLite**: 移动端，原生性能

**核心设计思想:**
1. **本地优先** - 有缓存先用缓存，保证用户体验
2. **后端为源** - Web SQLite 以 Python 后端为真相源
3. **简单可靠** - 避免过度设计，减少同步复杂度

---

*本文档由开发团队维护，如有疑问请联系架构负责人。*
