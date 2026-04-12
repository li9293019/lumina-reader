# 流萤阅读器字体管理系统技术架构

> 版本：v1.2  
> 日期：2026-04-12  
> 适用范围：APP (Android) + Web 双平台

---

## 目录

1. [概述](#1-概述)
2. [系统架构](#2-系统架构)
3. [核心模块详解](#3-核心模块详解)
4. [平台适配策略](#4-平台适配策略)
5. [存储与持久化](#5-存储与持久化)
6. [并发控制机制](#6-并发控制机制)
7. [性能优化](#7-性能优化)
8. [安全考虑](#8-安全考虑)
9. [配置与迁移](#9-配置与迁移)
10. [故障排查指南](#10-故障排查指南)
11. [版本变更记录](#11-版本变更记录)

---

## 1. 概述

### 1.1 设计目标

流萤阅读器字体管理系统旨在提供统一的跨平台字体管理体验，支持用户导入自定义 TTF/OTF 字体文件，并在阅读器中实时应用。

**核心特性：**
- 支持 TTF/OTF 格式字体导入
- 自动提取字体元数据（名称、家族名）
- 双平台存储：APP (Capacitor Filesystem) / Web (IndexedDB)
- **单目录存储（APP）：** 仅使用私有目录（DATA），取消 Documents 备份
- 实时预览和切换
- 配置持久化和跨设备迁移
- **防并发导入（v1.1 新增）**
- **孤儿文件清理（v1.2 新增）**

### 1.2 约束条件

| 项目 | 限制 | 说明 |
|------|------|------|
| 单字体大小 | ≤ 30MB | 防止内存溢出和存储占用 |
| 字体数量上限 | 无硬性限制（建议 ≤10） | UI 显示考虑 |
| 支持格式 | TTF, OTF | 通过文件扩展名验证 |
| 命名空间 | `cf_{timestamp}` | 自定义字体 ID 前缀 |
| 并发导入 | ❌ 禁止 | 同一时间只能导入一个字体 |
| 存储位置 | DATA/fonts/user/ | APP 端仅使用私有目录 |

---

## 2. 系统架构

### 2.1 模块结构

```
┌─────────────────────────────────────────────────────────────┐
│                        字体管理系统                          │
├─────────────────────────────────────────────────────────────┤
│  UI 层                                                       │
│  ├── 字体选择按钮 (setting-options)                          │
│  ├── 字体管理对话框 (FontManagerDialog)                      │
│  └── 自定义字体指示器 (custom-font-indicator)                │
├─────────────────────────────────────────────────────────────┤
│  对话框层 (FontManagerDialog)                                │
│  ├── _isAdding 并发锁                                        │
│  ├── _isWaitingFilePicker 文件选择器状态                     │
│  ├── loading 视觉状态                                        │
│  └── 超时保护机制 (10秒)                                     │
├─────────────────────────────────────────────────────────────┤
│  核心层 (FontManager)                                        │
│  ├── 字体列表管理 (customFonts[])                            │
│  ├── 文件持久化 (_saveFontFile / _deleteFontFile)            │
│  ├── CSS 内联注入 (_injectFontCSS / loadFont)                │
│  ├── 孤儿文件清理 (_cleanupOrphanFontFiles)                  │
│  └── 配置同步 (_saveCustomFonts / _loadCustomFonts)          │
├─────────────────────────────────────────────────────────────┤
│  解析层 (FontParser)                                         │
│  └── TTF/OTF Name Table 解析 (extractFontName)               │
├─────────────────────────────────────────────────────────────┤
│  存储层                                                      │
│  ├── APP: DATA/fonts/user/ (私有目录，v1.2 起取消 Documents) │
│  └── Web: IndexedDB (LuminaFonts DB)                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户点击"添加字体"
    ↓
【并发检查】_isAdding === true ? 显示"正在导入，请稍候..." : 继续
    ↓
【文件选择器】超时保护 10 秒
    ↓
FontParser.extractFontName() → 提取字体家族名
    ↓
_saveFontFile() → 保存到 DATA/fonts/user/ (唯一存储位置)
    ↓
_injectFontCSS() → 生成 base64 内联 CSS
    ↓
loadFont() → 动态注入 style 标签
    ↓
Settings.apply() → 应用字体到阅读视图
    ↓
【状态重置】_isAdding = false, _isWaitingFilePicker = false
```

---

## 3. 核心模块详解

### 3.1 FontManager 核心

**文件位置：** `app/www/js/modules/font-manager.js`

#### 3.1.1 关键属性

```javascript
{
    STORAGE_KEY: 'customFonts',      // ConfigManager 存储键
    FONT_DIR: 'fonts/user',          // APP 端存储目录（仅 DATA）
    customFonts: [],                 // 运行时字体列表
    loadedFonts: new Set(),          // 已加载字体缓存
    _fontCSSCache: new Map()         // SVG 导出用 CSS 缓存
}
```

#### 3.1.2 单目录存储设计（v1.2 重要变更）

**变更说明：**
- **v1.0-v1.1**：双目录存储（DATA + DOCUMENTS）
- **v1.2 起**：仅使用 DATA 目录，取消 Documents 备份

**原因：**
1. 简化存储逻辑，避免数据不一致
2. 配置导出时直接从 DATA 目录读取字体数据
3. 使用 base64 内联 CSS，避免文件路径权限问题

**存储位置：**

| 环境 | 目录 | 用途 |
|------|------|------|
| APP | `DATA/fonts/user/` | 字体文件唯一存储位置 |
| APP | `DATA/fonts/user/{fontId}.css` | 动态生成的 CSS 文件（可选） |
| Web | IndexedDB `LuminaFonts` | 字体文件存储 |

### 3.2 FontManagerDialog 并发控制

**问题场景：** 用户快速连续点击"添加字体"按钮，选择多个大字体文件，可能导致内存溢出或导入状态混乱。

**解决方案（v1.1 增强）：**

```javascript
Lumina.FontManagerDialog = {
    _isAdding: false,              // 并发锁
    _isWaitingFilePicker: false,   // 文件选择器状态
    
    async _onAdd() {
        // 1. 并发检查
        if (this._isAdding) {
            Lumina.UI.showToast('正在导入字体，请稍候...');
            return;
        }
        
        const btn = document.getElementById('fontManagerAddBtn');
        
        // 2. 上锁 + UI 状态
        this._isAdding = true;
        this._isWaitingFilePicker = true;
        btn?.classList.add('loading');
        btn && (btn.disabled = true);
        
        // 3. 安全机制：监听 APP 从后台返回
        const handleAppReturn = () => { /* 重置状态 */ };
        window.addEventListener('focus', handleAppReturn, { once: true });
        document.addEventListener('visibilitychange', ...);
        
        // 4. 超时保护（10秒）
        const safetyTimer = setTimeout(() => {
            this._resetAddingState();
            Lumina.UI.showToast('操作超时，请重试');
        }, 10000);
        
        try {
            const font = await Lumina.FontManager.addFont();
            if (font) this.render();
        } finally {
            clearTimeout(safetyTimer);
            this._resetAddingState();
        }
    },
    
    _resetAddingState() {
        this._isAdding = false;
        this._isWaitingFilePicker = false;
        // 恢复按钮状态...
    }
}
```

**安全机制：**
1. **并发锁**：`_isAdding` 防止重复点击
2. **文件选择器监听**：监听 `focus` 和 `visibilitychange` 事件，用户取消选择后恢复状态
3. **超时保护**：10 秒后强制重置状态，防止永久卡住

### 3.3 孤儿文件清理（v1.2 新增）

**功能说明：** 启动时清理 Documents 目录中遗留的字体文件（旧版本备份）。

```javascript
async _cleanupOrphanFontFiles() {
    // 读取 Documents/fonts/user/ 目录
    const result = await Filesystem.readdir({
        path: this.FONT_DIR,
        directory: 'DOCUMENTS'
    });
    
    // 获取当前有效的字体文件名集合
    const validFontFiles = new Set(this.customFonts.map(f => f.storedName));
    
    // 删除不在列表中的文件
    for (const file of result.files) {
        if (!validFontFiles.has(file.name)) {
            await Filesystem.deleteFile({
                path: `${this.FONT_DIR}/${file.name}`,
                directory: 'DOCUMENTS'
            });
        }
    }
}
```

---

## 4. 平台适配策略

### 4.1 APP 端实现细节

**存储路径：**
- 字体文件：`/data/user/0/com.lumina.reader/files/fonts/user/{fontId}.ttf`
- CSS 文件：`/data/user/0/com.lumina.reader/files/fonts/user/{fontId}.css`（可选）

**CSS 加载方式（v1.2）：**

统一使用 **base64 内联**方式注入字体，避免文件路径权限问题：

```javascript
async _injectFontCSS(font) {
    const { Filesystem } = Capacitor.Plugins;
    
    // 1. 从 DATA 目录读取字体文件
    const result = await Filesystem.readFile({
        path: `${this.FONT_DIR}/${font.storedName}`,
        directory: 'DATA'
    });
    
    // 2. 转为 base64 data URL
    const base64Data = result.data;
    const fontUrl = `data:font/ttf;base64,${base64Data}`;
    
    // 3. 生成内联 CSS
    const css = `@font-face{font-family:'${safeFontName}';src:url('${fontUrl}') format('truetype');font-display:swap}`;
    
    // 4. 注入到页面
    const style = document.createElement('style');
    style.id = `font-style-${font.id}`;
    style.textContent = css;
    document.head.appendChild(style);
}
```

**优势：**
- ✅ 避免 Android 文件权限变更影响
- ✅ 重装 APP 后无需担心文件路径失效
- ✅ 字体数据随页面加载，无需额外请求
- ✅ 简化导出逻辑（直接从 DATA 目录读取）

### 4.2 Web 端实现细节

**存储方案：** IndexedDB

```javascript
// 打开数据库
const request = indexedDB.open('LuminaFonts', 1);

// 存储字体
const tx = db.transaction('fonts', 'readwrite');
const store = tx.objectStore('fonts');
await store.put({ fileName, data: arrayBuffer });

// 读取字体
const result = await store.get(fileName);
const blob = new Blob([result.data], { type: 'font/ttf' });
const blobUrl = URL.createObjectURL(blob);
```

**Blob URL 管理：**
- 删除字体时调用 `URL.revokeObjectURL()` 释放内存
- 切换字体时自动清理旧 Blob URL

---

## 5. 存储与持久化

### 5.1 配置存储

字体列表（元数据）保存在 ConfigManager：

```javascript
// 存储结构
{
    customFonts: [
        {
            id: 'cf_lx2k9x4p',
            name: '霞鹜文楷',
            family: '霞鹜文楷',
            fileName: 'LXGWWenKai-Regular.ttf',
            storedName: 'cf_lx2k9x4p.ttf',
            size: 4567823,
            addedAt: 1712893400000,
            isBuiltIn: false
        }
    ]
}
```

### 5.2 文件存在性检查

启动时会验证字体文件是否存在：

```javascript
async _loadCustomFonts() {
    const validFonts = [];
    for (const font of data) {
        if (await this._checkFontFileExists(font.storedName)) {
            validFonts.push(font);
            this.loadFont(font.id).catch(() => {});
        }
    }
    
    // 如有失效字体，静默更新存储
    if (validFonts.length !== data.length) {
        await this._saveCustomFonts();
    }
}
```

### 5.3 删除清理

删除字体时同时清理：
1. DATA 目录中的字体文件
2. DATA 目录中的 CSS 文件（如果存在）
3. Documents 目录中的旧备份（兼容性清理）

```javascript
async _deleteFontFile(fileName) {
    // 1. 删除 DATA 目录字体文件
    await Filesystem.deleteFile({
        path: `${this.FONT_DIR}/${fileName}`,
        directory: 'DATA'
    });
    
    // 2. 删除 DATA 目录 CSS 文件
    const fontId = fileName.replace(/\.(ttf|otf)$/i, '');
    await Filesystem.deleteFile({
        path: `${this.FONT_DIR}/${fontId}.css`,
        directory: 'DATA'
    });
    
    // 3. 清理旧版本 Documents 备份
    await Filesystem.deleteFile({
        path: `${this.FONT_DIR}/${fileName}`,
        directory: 'DOCUMENTS'
    });
}
```

---

## 6. 并发控制机制

### 6.1 问题背景

在字体导入过程中，用户可能：
1. 多次点击"添加字体"按钮
2. 同时选择多个字体文件
3. 在导入过程中关闭对话框

这些问题可能导致：
- 内存溢出（同时加载多个大字体）
- UI 状态错乱（loading 状态未清除）
- 按钮永久禁用（异常时未重置状态）

### 6.2 解决方案

**四管齐下：**

1. **状态锁 (`_isAdding`)** - 防止并发执行
2. **文件选择器标记 (`_isWaitingFilePicker`)** - 监听用户取消
3. **UI 反馈 (loading + disabled)** - 视觉提示用户
4. **超时保护 (10秒)** - 强制重置异常状态

---

## 7. 性能优化

### 7.1 Base64 编码优化

**分块处理避免堆栈溢出（大字体文件）：**

```javascript
async _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 65536; // 64KB
    let binary = '';
    
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    
    return btoa(binary);
}
```

### 7.2 字体加载优化

- `font-display: swap`：避免 FOIT（Flash of Invisible Text）
- 预加载：设置面板打开时预加载所有自定义字体 CSS
- 缓存：已加载字体记录在 `loadedFonts` Set 中
- CSS 缓存：SVG 导出用 CSS 缓存避免重复生成

### 7.3 文件读取优化

**getFontCSSForSVG** - 为导出功能提供字体 CSS：
- APP：从 DATA 目录读取 base64
- Web：从 IndexedDB 读取 ArrayBuffer 转 base64
- 结果缓存到 `_fontCSSCache`，避免重复读取

---

## 8. 安全考虑

### 8.1 文件类型验证

仅接受 `.ttf` 和 `.otf` 扩展名：

```javascript
const file = await this._pickFontFile();
// FilePicker 配置：types: ['font/ttf', 'font/otf']
```

### 8.2 文件大小限制

```javascript
if (file.size > 30 * 1024 * 1024) {
    Lumina.UI.showToast('字体文件过大（最大 30MB）');
    return null;
}
```

### 8.3 文件名安全

CSS 中字体名称转义：

```javascript
const safeFontName = fontName.replace(/['"\\]/g, '\\$&');
```

---

## 9. 配置与迁移

### 9.1 配置导出时的字体处理

**v1.2 变更：** 直接从 DATA 目录读取字体数据用于导出

```javascript
// 导出配置时，将字体文件转为 base64
async _exportFontsWithConfig(includeFonts) {
    if (!includeFonts) return null;
    
    const fontsData = [];
    for (const font of this.customFonts) {
        // 从 DATA 目录读取（v1.2 起不再从 DOCUMENTS 读取）
        const result = await Filesystem.readFile({
            path: `${this.FONT_DIR}/${font.storedName}`,
            directory: 'DATA'
        });
        
        fontsData.push({
            name: font.name,
            storedName: font.storedName,
            data: result.data  // base64
        });
    }
    return fontsData;
}

// 导入配置时，恢复字体文件
async _restoreFontsFromConfig(customFonts, fontsData, onProgress) {
    for (const fontData of fontsData) {
        // base64 转 Uint8Array
        const binary = atob(fontData.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        
        // 保存到 DATA 目录（v1.2 起不再保存到 DOCUMENTS）
        await this._saveFontFile(fontData.storedName, bytes.buffer);
        
        onProgress?.(++restoredCount, fontsData.length, fontData.name);
    }
}
```

---

## 10. 故障排查指南

### 10.1 字体导入按钮卡住（loading 状态不消失）

**症状：** 点击"添加字体"后按钮一直转圈，无法再次点击。

**原因：** 导入过程中发生异常，finally 块未执行。

**解决：** 关闭并重新打开字体管理对话框（close 方法会强制重置状态）。

**预防：** 
- 确保所有代码路径都有 try-finally 包裹
- v1.1 起新增 10 秒超时保护，自动重置状态

### 10.2 导出配置到新设备后字体丢失

**症状：** 新设备上字体列表显示正常，但实际渲染为系统字体。

**原因：**
1. 导出时未勾选"包含字体文件"选项
2. 字体文件在私有目录中被清理（重装 APP）

**排查：**
```javascript
// 检查字体文件是否存在（DATA 目录）
const exists = await FontManager._checkFontFileExists(font.storedName);
console.log('字体文件存在:', exists);
```

**解决：** 重新导入字体文件，或确保导出配置时包含字体数据。

### 10.3 大字体文件导入失败（> 20MB）

**症状：** 选择大字体文件后 APP 闪退或无响应。

**原因：** ArrayBuffer 转 Base64 时堆栈溢出。

**解决：** 已修复（使用分块转换），如仍有问题请检查 `_arrayBufferToBase64` 方法是否使用分块逻辑。

### 10.4 字体列表为空但文件还存在

**症状：** 字体管理对话框显示"暂无自定义字体"，但文件系统中还有字体文件。

**原因：** 配置文件丢失或损坏，但字体文件未清理。

**解决：** 
1. 重新导入字体文件
2. 或手动清理 DATA/fonts/user/ 目录中的孤儿文件

---

## 11. 版本变更记录

### v1.2 (2026-04-12)

**重大变更：**
- ✅ **取消 Documents 目录备份**，仅使用 DATA 目录存储字体
- ✅ **孤儿文件清理**，启动时自动清理 Documents 中的历史遗留文件
- ✅ **删除时清理旧备份**，`_deleteFontFile` 同时清理 Documents 中的旧文件
- ✅ **简化导出逻辑**，直接从 DATA 目录读取字体数据

**存储变更对比：**

| 版本 | DATA 目录 | DOCUMENTS 目录 |
|------|-----------|----------------|
| v1.0-v1.1 | 运行时读取 | 导出备份 |
| **v1.2** | **唯一存储位置** | **清理遗留文件** |

### v1.1 (2026-04-10)

**新增功能：**
- ✅ **并发控制机制**，防止重复点击导入
- ✅ **文件选择器状态监听**，用户取消后恢复按钮状态
- ✅ **超时保护（10秒）**，异常情况下自动重置状态
- ✅ **安全重置机制**，关闭对话框时强制恢复状态

### v1.0 (2026-04-02)

**初始版本：**
- 基础字体导入/删除功能
- 双目录存储（DATA + DOCUMENTS）
- TTF/OTF 字体解析
- Web 端 IndexedDB 支持

---

*本文档由开发团队维护，如有疑问请联系技术负责人。*
