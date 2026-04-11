# 流萤阅读器字体管理系统技术架构

> 版本：v1.1  
> 日期：2026-04-10  
> 适用范围：APP (Android) + Web 双平台

---

## 目录

1. [概述](#1-概述)
2. [系统架构](#2-系统架构)
3. [核心模块详解](#3-核心模块详解)
4. [平台适配策略](#4-平台适配策略)
5. [存储与持久化](#5-存储与持久化)
6. **【重要】并发控制机制（v1.1 新增）**
7. [性能优化](#7-性能优化)
8. [安全考虑](#8-安全考虑)
9. [配置与迁移](#9-配置与迁移)
10. [故障排查指南](#10-故障排查指南)
11. [后续迭代建议](#11-后续迭代建议)

---

## 1. 概述

### 1.1 设计目标

流萤阅读器字体管理系统旨在提供统一的跨平台字体管理体验，支持用户导入自定义 TTF/OTF 字体文件，并在阅读器中实时应用。

**核心特性：**
- 支持 TTF/OTF 格式字体导入
- 自动提取字体元数据（名称、家族名）
- 双平台存储：APP (Capacitor Filesystem) / Web (IndexedDB)
- **双目录存储（APP）：** 私有目录 + Documents 目录（用于导出携带）
- 实时预览和切换
- 配置持久化和跨设备迁移
- **防并发导入（v1.1 新增）**

### 1.2 约束条件

| 项目 | 限制 | 说明 |
|------|------|------|
| 单字体大小 | ≤ 30MB | 防止内存溢出和存储占用 |
| 字体数量上限 | 无硬性限制（建议 ≤10） | UI 显示考虑 |
| 支持格式 | TTF, OTF | 通过文件扩展名验证 |
| 命名空间 | `cf_{timestamp}` | 自定义字体 ID 前缀 |
| 并发导入 | ❌ 禁止 | 同一时间只能导入一个字体 |

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
│  ├── loading 视觉状态                                        │
│  └── disabled 按钮状态                                       │
├─────────────────────────────────────────────────────────────┤
│  核心层 (FontManager)                                        │
│  ├── 字体列表管理 (customFonts[])                            │
│  ├── 文件持久化 (_saveFontFile / _deleteFontFile)            │
│  ├── Documents 备份 (_saveFontFileToDocuments)               │
│  ├── CSS 生成与加载 (_injectFontCSS / loadFont)              │
│  └── 配置同步 (_saveCustomFonts / _loadCustomFonts)          │
├─────────────────────────────────────────────────────────────┤
│  解析层 (FontParser)                                         │
│  └── TTF/OTF Name Table 解析 (extractFontName)               │
├─────────────────────────────────────────────────────────────┤
│  存储层                                                      │
│  ├── APP 私有: DATA/fonts/user/ (运行时读取)                 │
│  ├── APP 文档: DOCUMENTS/fonts/user/ (导出备份)              │
│  └── Web: IndexedDB (LuminaFonts DB)                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户点击"添加字体"
    ↓
【并发检查】_isAdding === true ? 显示"正在导入，请稍候..." : 继续
    ↓
FontParser.extractFontName() → 提取字体家族名
    ↓
_saveFontFile() → 保存到 DATA/fonts/user/ (运行时)
_saveFontFileToDocuments() → 保存到 DOCUMENTS/fonts/user/ (备份)
    ↓
_injectFontCSS() → 生成 @font-face CSS
    ↓
loadFont() → 动态加载 CSS 到页面
    ↓
Settings.apply() → 应用字体到阅读视图
    ↓
【状态重置】_isAdding = false, loading = false
```

---

## 3. 核心模块详解

### 3.1 FontManager 核心

**文件位置：** `app/www/js/modules/font-manager.js`

#### 3.1.1 关键属性

```javascript
{
    STORAGE_KEY: 'customFonts',      // ConfigManager 存储键
    FONT_DIR: 'fonts/user',          // APP 端存储目录（同时用于 DATA 和 DOCUMENTS）
    customFonts: [],                 // 运行时字体列表
    loadedFonts: new Set(),          // 已加载字体缓存
    MAX_FONT_SIZE: 30 * 1024 * 1024 // 30MB 限制
}
```

#### 3.1.2 双目录存储（APP 端关键设计）

**为什么需要双目录？**

| 目录 | Capacitor Directory | 用途 | 权限 |
|------|---------------------|------|------|
| 私有目录 | `DATA` | APP 运行时读取字体 | 完全私有，外部不可见 |
| 文档目录 | `DOCUMENTS` | 导出配置时携带字体 | 用户可见，可分享 |

**代码实现：**

```javascript
// 保存到私有目录（用于 APP 内使用）
async _saveFontFile(fileName, arrayBuffer) {
    const { Filesystem } = Capacitor.Plugins;
    await Filesystem.writeFile({
        path: `${this.FONT_DIR}/${fileName}`,
        data: base64,
        directory: 'DATA'  // 私有目录
    });
}

// 保存到 Documents 目录（用于导出配置时恢复）
async _saveFontFileToDocuments(fileName, arrayBuffer) {
    const { Filesystem } = Capacitor.Plugins;
    await Filesystem.writeFile({
        path: `${this.FONT_DIR}/${fileName}`,
        data: base64,
        directory: 'DOCUMENTS'  // 公共目录
    });
}
```

### 3.2 FontManagerDialog 并发控制（v1.1 重要更新）

**问题场景：** 用户快速连续点击"添加字体"按钮，选择多个大字体文件，可能导致内存溢出或导入状态混乱。

**解决方案：**

```javascript
Lumina.FontManagerDialog = {
    _isAdding: false,  // 并发锁
    
    async _onAdd() {
        // 1. 并发检查
        if (this._isAdding) {
            Lumina.UI.showToast('正在导入字体，请稍候...');
            return;
        }
        
        const btn = document.getElementById('fontManagerAddBtn');
        
        // 2. 上锁 + UI 状态
        this._isAdding = true;
        btn?.classList.add('loading');
        btn && (btn.disabled = true);
        
        try {
            // 3. 执行导入
            const font = await Lumina.FontManager.addFont();
            if (font) this.render();
        } finally {
            // 4. 解锁 + 恢复 UI
            this._isAdding = false;
            btn?.classList.remove('loading');
            btn && (btn.disabled = false);
        }
    },
    
    close() {
        // 安全机制：关闭对话框时强制重置状态
        if (this._isAdding) {
            this._isAdding = false;
            const btn = document.getElementById('fontManagerAddBtn');
            btn?.classList.remove('loading');
            if (btn) btn.disabled = false;
        }
    }
}
```

**CSS 配合：**

```css
/* loading 状态 */
.font-manager-footer .btn-primary.loading {
    opacity: 0.7;
    cursor: not-allowed;
    pointer-events: none;
}

/* disabled 状态 */
.font-manager-footer .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
}
```

---

## 4. 平台适配策略

### 4.1 APP 端实现细节

**存储路径：**
- 私有目录：`/data/user/0/com.lumina.reader/files/fonts/user/{fontId}.ttf`
- Documents：`/storage/emulated/0/Documents/fonts/user/{fontId}.ttf`
- CSS 内联：直接读取 base64 嵌入 style 标签（避免路径权限问题）

**CSS 加载方式（v1.1 重要变更）：**

旧方案：生成 .css 文件，通过 `convertFileSrc()` 加载  
新方案：直接读取字体文件为 base64，内联到 style 标签

```javascript
async _injectFontCSS(font) {
    const { Filesystem } = Capacitor.Plugins;
    const result = await Filesystem.readFile({
        path: `${this.FONT_DIR}/${font.storedName}`,
        directory: 'DATA'
    });
    
    const base64Data = result.data;
    const fontUrl = `data:font/ttf;base64,${base64Data}`;
    const css = `@font-face{font-family:'${safeFontName}';src:url('${fontUrl}') format('truetype');font-display:swap}`;
    
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}
```

**优势：**
- 避免 Android 文件权限变更影响
- 重装 APP 后无需担心文件路径失效
- 导出配置时可从 Documents 目录读取字体数据

---

## 6. 【重要】并发控制机制（v1.1 新增）

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

**三管齐下：**

1. **状态锁 (`_isAdding`)** - 防止并发执行
2. **UI 反馈 (loading + disabled)** - 视觉提示用户
3. **安全重置 (close 方法)** - 防止异常状态残留

### 6.3 代码模板

```javascript
class ConcurrentOperation {
    constructor() {
        this._isProcessing = false;
    }
    
    async execute(operation, btnElement) {
        if (this._isProcessing) {
            Lumina.UI.showToast('操作进行中，请稍候...');
            return;
        }
        
        this._isProcessing = true;
        this._setUILoading(btnElement, true);
        
        try {
            return await operation();
        } finally {
            this._isProcessing = false;
            this._setUILoading(btnElement, false);
        }
    }
    
    _setUILoading(btn, loading) {
        btn?.classList.toggle('loading', loading);
        if (btn) btn.disabled = loading;
    }
    
    // 安全重置
    emergencyReset(btn) {
        this._isProcessing = false;
        this._setUILoading(btn, false);
    }
}
```

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

- `font-display: swap`：避免 FOIT
- 预加载：设置面板打开时预加载所有自定义字体 CSS
- 缓存：已加载字体记录在 `loadedFonts` Set 中

---

## 9. 配置与迁移

### 9.1 字体与配置导出（v1.1 重要特性）

**场景：** 用户导出配置到另一台设备，期望字体也能恢复。

**实现：**

```javascript
// 导出配置时，将字体文件转为 base64
async _exportFontsWithConfig(includeFonts) {
    if (!includeFonts) return null;
    
    const fontsData = [];
    for (const font of this.customFonts) {
        // 从 Documents 目录读取（私有目录在重装后无法访问）
        const result = await Filesystem.readFile({
            path: `${this.FONT_DIR}/${font.storedName}`,
            directory: 'DOCUMENTS'
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
    let restoredCount = 0;
    
    for (const fontData of fontsData) {
        // base64 转 Uint8Array
        const binary = atob(fontData.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        
        // 保存到两个目录
        await this._saveFontFile(fontData.storedName, bytes.buffer);
        await this._saveFontFileToDocuments(fontData.storedName, bytes.buffer);
        
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

**预防：** 确保所有代码路径都有 try-finally 包裹。

### 10.2 导出配置到新设备后字体丢失

**症状：** 新设备上字体列表显示正常，但实际渲染为系统字体。

**原因：**
1. 导出时未勾选"包含字体文件"选项
2. Documents 目录中的字体文件被用户手动删除

**排查：**
```javascript
// 检查字体文件是否存在（私有目录）
const exists = await FontManager._checkFontFileExists(font.storedName);
console.log('字体文件存在:', exists);
```

**解决：** 重新导入字体文件，或确保导出配置时包含字体数据。

### 10.3 大字体文件导入失败（> 20MB）

**症状：** 选择大字体文件后 APP 闪退或无响应。

**原因：** ArrayBuffer 转 Base64 时堆栈溢出。

**解决：** 已修复（使用分块转换），如仍有问题请检查 `_arrayBufferToBase64` 方法是否使用分块逻辑。

---

## 11. 后续迭代建议

### 11.1 短期优化（v1.2）

1. **字体导入进度条**
   - 大字体文件（> 10MB）显示读取进度
   - 技术方案：`FileReader` 的 `progress` 事件

2. **字体去重**
   - 导入前检查字体文件 hash，避免重复导入相同字体

3. **字体排序**
   - 支持拖拽排序自定义字体

### 11.2 中期功能（v1.3）

1. **字体子集化**
   - 导入时自动子集化，减少存储占用

2. **云同步**
   - 将字体文件同步到云端

### 11.3 长期规划（v2.0）

1. **Web Font 支持**
   - 支持在线字体 URL

---

**文档维护记录：**

- 2026-04-02: 初始版本 v1.0
- 2026-04-10: v1.1 更新 - 添加并发控制机制、双目录存储设计、Documents 导出支持

---

*本文档由开发团队维护，如有疑问请联系技术负责人。*
