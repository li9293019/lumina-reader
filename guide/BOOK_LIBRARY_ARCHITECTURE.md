# Lumina Reader 书库管理系统架构文档

> **版本**: v1.0  
> **日期**: 2026-04-17  
> **适用范围**: 流萤阅读器 (Lumina Reader) v2.1.2+  
> **对应模块**: `app/www/js/modules/data-manager.js` (2737 行)

---

## 目录

1. [架构概览](#1-架构概览)
2. [数据流](#2-数据流)
3. [书库 UI](#3-书库-ui)
4. [导入/导出系统](#4-导入导出系统)
5. [阅读进度管理](#5-阅读进度管理)
6. [封面系统交互](#6-封面系统交互)
7. [核心 API](#7-核心-api)
8. [故障排查](#8-故障排查)

---

## 1. 架构概览

### 1.1 系统定位

`data-manager.js` 是流萤阅读器的**书库（Library）与历史记录管理中心**，承担书库面板管理、书籍列表展示、排序搜索、批量操作、导入导出、封面渲染等核心职责。

```
┌─────────────────────────────────────────────────────────────┐
│                   书库管理系统架构                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐    ┌───────────────────────────────┐   │
│  │   DataManager    │    │   历史记录子系统               │   │
│  │  (书库面板/UI)   │◄──►│  HistoryDataBuilder           │   │
│  │                  │    │  saveHistory / restoreFile    │   │
│  └─────────────────┘    └───────────────────────────────┘   │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              统一存储接口层 (StorageAdapter)          │   │
│  │         saveFile / getFile / deleteFile / ...        │   │
│  └─────────────────────────────────────────────────────┘   │
│           │                                                  │
│     ┌─────┴─────┐                                            │
│     ▼           ▼                                            │
│  IndexedDB   SQLite   CapacitorSQLite                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 文件结构

```
app/www/js/modules/
├── data-manager.js          # 书库管理核心（2737 行）
├── db.js                    # 存储适配器层
├── db-helpers.js            # 数据合并/标准化
├── export-utils.js          # 导出工具
├── exporter.js              # 导出功能（UI）
└── metadata-extractor.js    # 元数据提取
```

---

## 2. 数据流

### 2.1 文件导入流程

```
系统文件选择器 / 拖拽 / importFileFromPath
    │
    ▼
检测文件格式
    │
    ├── .json ──→ JSON.parse ──→ 验证结构
    │               │
    │               ├── 批量书籍 ──→ handleBatchImport() ──→ DB.adapter.importBatch()
    │               └── 单本书籍 ──→ importDataToDB() ──→ DB.adapter.saveFile()
    │
    ├── .lmn ───→ base64ToUint8Array ──→ Lumina.Crypto.decrypt()
    │               │
    │               └── 验证 exportType ──→ importDataToDB()
    │
    └── 配置文件 ──→ 恢复 ConfigManager 设置
    │
    ▼
refreshStats() + loadHistoryFromDB()
    │
    ▼
renderGrid() + renderHistoryFromDB()
```

### 2.2 打开书籍流程

```
用户点击卡片/历史记录项
    │
    ▼
openFile(fileKey)
    │
    ├── SQLite 模式: DB.adapter.getFileSmart(fileKey)（优先缓存）
    └── 其他模式:   DB.adapter.getFile(fileKey)
    │
    ▼
Lumina.DB.restoreFileFromDB(fileData)
    │
    ├── 恢复阅读状态: currentFile, document.items, metadata, heatMap
    ├── 恢复正则: customRegex, chapterNumbering
    ├── 重建目录: Parser.buildChapters() → generateTOC()
    ├── 恢复位置: currentChapterIndex = lastChapter
    │            renderCurrentChapter(savedScrollIndex)
    ├── 标记上次阅读位置: .last-read-marker CSS 动画
    ├── 启动热力图: HeatMap.onBookOpen()
    └── 恢复批注: annotations → renderAnnotations()
```

### 2.3 阅读进度保存流程

```
阅读中滚动/翻页
    │
    ▼
Lumina.DB.updateHistoryProgress() [防抖 1 秒]
    │
    ├── 增量保存 (isFullSave=false): 只更新进度字段
    │   lastChapter / lastScrollIndex / chapterTitle / lastReadTime / heatMap
    │
    └── 全量保存 (isFullSave=true): HistoryDataBuilder.build()
                                    │
                                    ├── 处理 content 数组（图片压缩/跳过）
                                    ├── 构建 metadata（title, author, coverBrightness...）
                                    └── 生成完整数据对象
                                    │
                                    ▼
                              DB.adapter.saveFile(fileKey, data)
```

**保存策略对比**：

| 策略 | 触发条件 | 保存内容 | 性能影响 |
|------|---------|---------|---------|
| **全量保存** | 首次打开、重新解析 | content + metadata + 进度 | 高（大文件可能卡顿）|
| **增量保存** | 滚动/翻页（防抖 1s）| 仅进度字段 | 低 |
| **不保存** | 用户选择"不保存" | 无 | 无 |

---

## 3. 书库 UI

### 3.1 面板结构

```
dataManagerPanel (全屏遮罩面板)
├── Header 区域
│   ├── libNormalHeader (常规模式)
│   │   └── 标题 + 视图切换 + 排序 + 批量导出 + 导入 + 清空
│   └── libBatchHeader (多选模式)
│       └── 选中计数 + 全选/反选 + 批量导出/删除 + 取消
├── libFilterBar (筛选栏)
│   └── 搜索输入框 + 统计信息(数量 / 大小)
└── dataGrid (书籍网格)
    └── .data-card (单本书籍卡片)
        ├── .card-checkbox (多选勾选框)
        └── .swipe-layer (滑动层)
            ├── .swipe-action.export-action (左滑：导出)
            ├── .swipe-content (主内容)
            │   ├── .card-cover (封面)
            │   ├── .card-info (标题/大小/时间/章节)
            │   └── .list-actions (列表视图操作按钮)
            └── .swipe-action.delete-action (右滑：删除)
```

### 3.2 三视图模式

由 CSS 控制，共享同一套 HTML 结构：

| 视图 | 布局 | 封面 | 适用场景 |
|------|------|------|---------|
| **card** | 网格 | 大图 | 默认，封面展示优先 |
| **list** | 横向列表 | 小图在左 | 信息密度优先 |
| **compact** | 紧凑列表 | 更小 | 大量书籍时 |

### 3.3 排序与搜索

**排序字段**：`time`(最新阅读) / `added`(添加时间) / `name`(名称) / `size`(大小)

**排序方向**：同字段再次点击切换升序/降序

**搜索**：实时过滤书名（不区分大小写）

### 3.4 移动端手势

| 手势 | 行为 |
|------|------|
| 左滑 | 删除操作露出 |
| 右滑 | 导出操作露出 |
| 长按 500ms | 进入多选模式 + 震动反馈 |
| 点击封面 | 直接打开书籍 |
| 点击其他区域 | 打开书籍详情面板 |

---

## 4. 导入/导出系统

### 4.1 支持格式

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| **JSON 明文** | `.json` | 标准 JSON，可跨平台迁移 |
| **LMN 加密** | `.lmn` | 自定义二进制加密格式，AES-256-GCM，支持密码保护 |
| **配置文件** | `.json`/`.lmn`（含 config 字样）| 仅恢复用户设置，不含书籍 |

### 4.2 LMN 文件格式

```
LMN 文件结构:
┌────────┬────────┬────────┬─────────────────────┐
│ MAGIC  │ 版本   │ 标志位 │ 加密数据...          │
│ "LMN"  │ 0x01   │ 1字节  │ (AES-256-GCM)       │
└────────┴────────┴────────┴─────────────────────┘

标志位:
  bit 0: hasPassword (是否需要密码解密)
  bit 1-7: 保留

支持两种包装格式:
  - Base64 文本格式（新版，与 APP 统一）
  - 原始二进制格式（兼容历史文件）
```

### 4.3 导出类型

| 类型 | 入口 | 大小限制 |
|------|------|---------|
| **单本导出** | 卡片操作按钮 / 历史记录 | 无 |
| **整库导出** | 书库面板"导出"按钮 | 50MB 预检 |
| **选中导出** | 多选模式"导出"按钮 | 50MB 预检 |

### 4.4 导出流程

```
batchExport() / exportSingle() / batchExportByKeys()
    │
    ▼
DB.adapter.exportBatch() / exportFile(fileKey)
    │
    ▼
检查 encryptedExport 设置
    │
    ├── 明文 ──→ Lumina.ExportUtils.exportBooks({ encrypted: false })
    │              ├── APP: 写入 Filesystem (Documents/LuminaReader/)
    │              └── Web: 浏览器下载
    │
    └── 加密 ──→ showPasswordDialog()
                   │
                   ▼
              Lumina.ExportUtils.exportBooks({ encrypted: true, password })
```

---

## 5. 阅读进度管理

### 5.1 保存字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `lastChapter` | number | 当前章节索引 |
| `lastScrollIndex` | number | 当前章节内段落索引 |
| `chapterTitle` | string | 当前章节标题 |
| `lastReadTime` | string | 最后阅读时间（ISO 本地时间）|
| `heatMap` | object | 阅读热力图数据 |
| `totalItems` | number | 文档总段落数 |

### 5.2 智能保留逻辑

- **重新打开已有文件**：若当前仍在第 0 章但数据库有更靠后的进度，**保留数据库进度不重置**
- **自动保留字段**：annotations（批注）、customRegex（自定义正则）、chapterNumbering（编号方式）

### 5.3 进度恢复标记

打开书籍后，在目标段落添加 `.last-read-marker` CSS 类：
- 显示脉冲高亮动画
- 用户首次滚动/点击后自动消失

---

## 6. 封面系统交互

### 6.1 hashCover 开关

`Lumina.State.settings.hashCover` 控制封面渲染方式：

| hashCover | 有封面图 | 无封面图 |
|-----------|---------|---------|
| **true** | `BibliomorphCover.wrapCover()` 包装为书籍效果 | `BibliomorphCover.generate()` 生成艺术封面 |
| **false** | 普通 `<img>` 显示 | 显示占位图标 |

### 6.2 封面亮度

`metadata.coverBrightness` 存储在数据库中，用于 `wrapCover()` 时调整书脊明暗色调。

---

## 7. 核心 API

### 7.1 面板生命周期

| 方法 | 说明 |
|------|------|
| `open()` / `close()` / `toggle()` | 书库面板开关 |
| `preload()` | 预加载书库数据（带防重入）|
| `invalidateCache()` | 标记缓存失效 |

### 7.2 文件操作

| 方法 | 说明 |
|------|------|
| `openFile(fileKey)` | 从书库打开书籍 |
| `openBookDetail(fileKey)` | 打开书籍详情面板 |
| `confirmDelete(fileKey)` | 确认删除单本 |
| `confirmClearLibrary()` | 确认清空书库 |

### 7.3 批量操作

| 方法 | 说明 |
|------|------|
| `enterBatchMode()` / `exitBatchMode()` | 进入/退出多选 |
| `toggleSelection(fileKey)` | 切换选中状态 |
| `selectAll()` / `invertSelection()` | 全选/反选 |
| `batchExportSelected()` / `batchDeleteSelected()` | 批量导出/删除 |

### 7.4 导入/导出

| 方法 | 说明 |
|------|------|
| `batchExport()` | 整库导出 |
| `exportSingle(fileKey)` | 单本导出 |
| `batchImport()` | 批量导入入口 |
| `importLmnFile(file)` | 导入 LMN 加密文件 |
| `importJSONFile(file)` | 导入 JSON 文件 |
| `handleBatchImport(books)` | 处理批量书籍导入 |

### 7.5 渲染

| 方法 | 说明 |
|------|------|
| `renderGrid()` | 渲染书籍网格 |
| `renderCard(file)` | 统一卡片 HTML 生成 |
| `renderStats()` | 更新统计数字 |
| `refreshStats()` | 主动刷新书库数据 |
| `updateGridSilently()` | 增量更新（无闪屏）|

---

## 8. 故障排查

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| 书库列表为空 | 首次使用 / 数据清除 | 正常，导入书籍后显示 |
| 导入失败 | 文件格式不支持 / 数据损坏 | 检查文件扩展名，尝试重新导出 |
| 打开书籍后进度丢失 | 未保存到书库 / 增量保存失败 | 确认"保存到书库"选项已勾选 |
| 封面不显示 | hashCover 关闭且无封面图 | 开启 hashCover 或导入带封面的文件 |
| 导出文件过大 | 批量导出超过 50MB | 分批导出或减少书籍数量 |
| 书库卡顿 | 大量书籍 / 大封面图 | 切换到 compact 视图，或导出后删除不常用书籍 |
| 历史记录不更新 | 未触发保存 / 数据库写入失败 | 检查控制台是否有 DB 报错 |

---

*本文档由开发团队维护，对应代码版本 v2.1.2。*
