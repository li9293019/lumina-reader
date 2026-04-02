# 流萤阅读器字体管理系统技术架构

> 版本：v1.0  
> 日期：2026-04-02  
> 适用范围：APP (Android) + Web 双平台

---

## 目录

1. [概述](#1-概述)
2. [系统架构](#2-系统架构)
3. [核心模块详解](#3-核心模块详解)
4. [平台适配策略](#4-平台适配策略)
5. [存储与持久化](#5-存储与持久化)
6. [性能优化](#6-性能优化)
7. [安全考虑](#7-安全考虑)
8. [配置与迁移](#8-配置与迁移)
9. [故障排查指南](#9-故障排查指南)
10. [后续迭代建议](#10-后续迭代建议)

---

## 1. 概述

### 1.1 设计目标

流萤阅读器字体管理系统旨在提供统一的跨平台字体管理体验，支持用户导入自定义 TTF/OTF 字体文件，并在阅读器中实时应用。

**核心特性：**
- 支持 TTF/OTF 格式字体导入
- 自动提取字体元数据（名称、家族名）
- 双平台存储：APP (Capacitor Filesystem) / Web (IndexedDB)
- 实时预览和切换
- 配置持久化和跨设备迁移

### 1.2 约束条件

| 项目 | 限制 | 说明 |
|------|------|------|
| 单字体大小 | ≤ 30MB | 防止内存溢出和存储占用 |
| 字体数量上限 | 3 个 | 控制存储空间和性能 |
| 支持格式 | TTF, OTF | 通过文件扩展名和 Magic Number 验证 |
| 命名空间 | `cf_{timestamp}` | 自定义字体 ID 前缀 |

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
│  核心层 (FontManager)                                        │
│  ├── 字体列表管理 (customFonts[])                            │
│  ├── 文件持久化 (_saveFontFile / _deleteFontFile)            │
│  ├── CSS 生成与加载 (_generateFontCSS / loadFont)            │
│  └── 配置同步 (_saveCustomFonts / _loadCustomFonts)          │
├─────────────────────────────────────────────────────────────┤
│  解析层 (FontParser)                                         │
│  └── TTF/OTF Name Table 解析 (extractFontName)               │
├─────────────────────────────────────────────────────────────┤
│  存储层                                                      │
│  ├── APP: Capacitor Filesystem (Documents/fonts/user/)       │
│  └── Web: IndexedDB (LuminaFonts DB)                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户选择字体文件
    ↓
FontParser.extractFontName() → 提取字体家族名
    ↓
_saveFontFile() → 持久化到存储层
    ↓
_generateFontCSS() → 生成 @font-face CSS
    ↓
loadFont() → 动态加载 CSS 到页面
    ↓
Settings.apply() → 应用字体到阅读视图
```

---

## 3. 核心模块详解

### 3.1 FontManager 核心

**文件位置：** `app/www/js/modules/font-manager.js`

#### 3.1.1 关键属性

```javascript
{
    STORAGE_KEY: 'customFonts',      // ConfigManager 存储键
    FONT_DIR: 'fonts/user',          // APP 端存储目录
    customFonts: [],                 // 运行时字体列表
    loadedFonts: new Set(),          // 已加载字体缓存
    MAX_FONT_SIZE: 30 * 1024 * 1024, // 30MB 限制
    MAX_FONT_COUNT: 3                // 最多 3 个自定义字体
}
```

#### 3.1.2 字体数据结构

```javascript
{
    id: 'cf_mnhlddxr',           // 唯一标识 (cf_ + base36 时间戳)
    name: '方正聚珍新仿简体',     // 从字体文件解析的显示名
    family: '方正聚珍新仿简体',   // CSS font-family 值
    fileName: 'original.ttf',    // 原始文件名
    storedName: 'cf_mnhlddxr.ttf', // 存储文件名
    size: 4812345,               // 文件大小 (bytes)
    addedAt: 1712054400000,      // 添加时间戳
    isBuiltIn: false             // 区分内置/自定义字体
}
```

#### 3.1.3 核心方法

| 方法 | 说明 | 触发场景 |
|------|------|----------|
| `init()` | 初始化，加载已保存字体列表 | APP 启动时 |
| `addFont()` | 添加新字体 | 用户点击"添加字体" |
| `removeFont(id)` | 删除字体 | 用户点击删除按钮 |
| `loadFont(id)` | 加载字体 CSS | 设置应用、阅读器初始化 |
| `getFontFamily(id)` | 获取字体家族名 | 渲染文本时 |

### 3.2 FontParser 字体解析

**实现方式：** 轻量级 TTF/OTF Name Table 解析器

#### 3.2.1 解析逻辑

```
1. 读取文件头 (sfntVersion)
   - 0x00010000 → TrueType
   - 0x4F54544F ('OTTO') → OpenType CFF
   - 0x74727565 ('true') → TrueType Apple

2. 定位 name table
   - 遍历 Table Directory 找到 tag 为 'name' 的表

3. 提取 nameID = 1 (Font Family)
   - 优先 platformID=3 (Windows), encodingID=1 (Unicode), languageID=0x0804 (zh-CN)
   - 备选 platformID=1 (Mac), languageID=0 (English)
```

#### 3.2.2 容错机制

- 解析失败 → 使用原始文件名（去除扩展名）
- 空 name table → fallback 到文件名
- 编码问题 → 尝试多种编码解码

### 3.3 CSS 生成与加载

#### 3.3.1 APP 端 (Capacitor)

```javascript
// 生成 CSS 内容
const fontUrl = Capacitor.convertFileSrc(`${this.FONT_DIR}/${fileName}`);
const css = `@font-face{font-family:'${safeFontName}';src:url('${fontUrl}') format('truetype');font-display:swap}`;

// 写入文件
await Filesystem.writeFile({
    path: `${this.FONT_DIR}/${fontId}.css`,
    data: css,
    directory: 'DOCUMENTS',
    encoding: 'utf8'
});

// 加载时
const fileUrl = Capacitor.convertFileSrc(cssStat.uri);
await this._loadCSS(fileUrl);
```

**关键点：** 必须使用 `convertFileSrc()` 将文件路径转换为 WebView 可访问的 URL (`https://localhost/_capacitor_file_/...`)

#### 3.3.2 Web 端 (Browser)

```javascript
// 从 IndexedDB 读取字体数据
const result = await store.get(fileName);
const blob = new Blob([result.data], { type: 'font/ttf' });
const blobUrl = URL.createObjectURL(blob);

// 创建 style 标签
const css = `@font-face{font-family:'${safeFontName}';src:url('${blobUrl}') format('truetype');font-display:swap}`;
const style = document.createElement('style');
style.id = `font-style-${fontId}`;
style.textContent = css;
document.head.appendChild(style);
```

**内存管理：** 删除字体时需调用 `URL.revokeObjectURL()` 释放 Blob URL

---

## 4. 平台适配策略

### 4.1 平台检测

```javascript
const isApp = typeof Capacitor !== 'undefined' && 
              Capacitor.Plugins?.Filesystem;
```

### 4.2 APP 端实现细节

**存储路径：**
- 字体文件：`/storage/emulated/0/Documents/fonts/user/{fontId}.ttf`
- CSS 文件：`/storage/emulated/0/Documents/fonts/user/{fontId}.css`

**文件选择：**
- 使用 `@capacitor/filesystem` 的 `pickFiles` 方法
- 类型限制：`['font/ttf', 'font/otf']`
- 注意：Android 系统文件选择器不支持设置默认目录

**权限要求：**
```xml
<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" 
    android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" 
    android:minSdkVersion="33" />
```

### 4.3 Web 端实现细节

**IndexedDB 结构：**
```javascript
{
    dbName: 'LuminaFonts',
    version: 1,
    storeName: 'fonts',
    keyPath: 'fileName'
}
```

**存储限制：**
- 受浏览器配额限制（通常可用空间较大）
- 需处理 `QuotaExceededError`

---

## 5. 存储与持久化

### 5.1 配置持久化

字体元数据通过 `ConfigManager` 存储：

```javascript
// 保存
await Lumina.ConfigManager.set('customFonts', this.customFonts);

// 加载
const data = Lumina.ConfigManager.get('customFonts');
```

**导出/导入：** 自定义字体配置会随 `config.lmn` 一起导出，但**字体二进制文件不会**（设备特定）。

### 5.2 跨设备迁移限制

| 项目 | 是否可迁移 | 说明 |
|------|-----------|------|
| 字体元数据 | ✅ 是 | 包含在配置文件中 |
| 字体文件 | ❌ 否 | 存储路径设备特定 |
| 当前选中字体 | ✅ 是 | 配置的一部分 |

**迁移后处理：** 导入配置后，若自定义字体文件不存在，系统会静默跳过，用户需重新添加字体。

---

## 6. 性能优化

### 6.1 大文件处理

**Base64 编码优化（APP 端）：**
```javascript
// 分块处理避免堆栈溢出
const chunkSize = 65536; // 64KB
let binary = '';
for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
}
const base64 = btoa(binary);
```

### 6.2 字体加载优化

- `font-display: swap`：避免 FOIT（Flash of Invisible Text）
- 预加载：设置面板打开时预加载所有自定义字体 CSS
- 缓存：已加载字体记录在 `loadedFonts` Set 中，避免重复加载

### 6.3 存储优化

- 限制数量：最多 3 个字体
- 限制大小：单文件 30MB
- 自动清理：删除字体时同步删除存储文件和 CSS

---

## 7. 安全考虑

### 7.1 输入验证

1. **文件类型验证**
   - 扩展名检查：`.ttf`, `.otf`
   - MIME 类型：`font/ttf`, `font/otf`, `application/x-font-ttf`
   - Magic Number：TTF (`0x00010000` 或 `0x74727565`), OTF (`0x4F54544F`)

2. **文件大小验证**
   ```javascript
   if (file.size > 30 * 1024 * 1024) {
       Lumina.UI.showToast('字体文件过大（最大 30MB）');
       return null;
   }
   ```

3. **字体名转义**
   ```javascript
   const safeFontName = fontName.replace(/['"\\]/g, '\\$&');
   ```

### 7.2 存储安全

- 文件名使用随机 ID，避免覆盖
- 不执行字体文件内容，仅作为二进制数据存储
- CSS URL 使用引号包裹，防止注入

---

## 8. 配置与迁移

### 8.1 配置结构

```json
{
    "customFonts": [
        {
            "id": "cf_mnhlddxr",
            "name": "方正聚珍新仿简体",
            "family": "方正聚珍新仿简体",
            "fileName": "方正聚珍新仿.ttf",
            "storedName": "cf_mnhlddxr.ttf",
            "size": 4812345,
            "addedAt": 1712054400000,
            "isBuiltIn": false
        }
    ],
    "reading": {
        "font": "cf_mnhlddxr"
    }
}
```

### 8.2 版本兼容

- **v1.0 之前**：无自定义字体功能
- **v1.0+**：支持自定义字体
- **向前兼容**：旧版本导入含自定义字体的配置时，会忽略不存在的字体，回退到内置字体

---

## 9. 故障排查指南

### 9.1 字体加载失败

**症状：** 选择字体后显示为系统默认字体

**排查步骤：**
1. 检查控制台是否有 CSS 404 错误
2. 确认 `convertFileSrc()` 正确转换了路径
3. 验证字体文件是否存在于 `Documents/fonts/user/`
4. 检查 CSS 内容是否正确（可手动访问 `{fontId}.css` 文件）

### 9.2 字体名解析错误

**症状：** 字体显示为文件名而非实际字体名

**原因：**
- TTF name table 使用非标准编码
- 字体文件损坏

**解决：** 使用文件名作为 fallback，不影响功能

### 9.3 存储空间不足

**症状：** 添加字体时提示失败

**排查：**
- APP：检查 `Documents/fonts/user/` 目录权限
- Web：检查浏览器存储配额 `navigator.storage.estimate()`

### 9.4 跨设备迁移后字体丢失

**症状：** 新设备上字体列表显示为空白或灰色

**原因：** 字体二进制文件未随配置一起导出

**解决：** 在新设备上重新导入字体文件

---

## 10. 后续迭代建议

### 10.1 短期优化（v1.1）

1. **字体预览**
   - 在字体按钮上显示字体预览（Abc 样例）
   - 实现方式：使用 `FontFace.load()` API

2. **字体排序**
   - 支持拖拽排序自定义字体
   - 影响设置面板中的显示顺序

3. **搜索过滤**
   - 字体管理对话框支持搜索字体名

### 10.2 中期功能（v1.2）

1. **字体子集化**
   - 导入时自动子集化（基于常用字表）
   - 减少存储占用和加载时间
   - 技术方案：集成 `subset-font` 或类似库

2. **云同步**
   - 将字体文件同步到云端
   - 跨设备自动下载字体
   - 需考虑存储成本和带宽

3. **字体推荐**
   - 内置字体商店/推荐列表
   - 一键下载热门开源字体（如霞鹜文楷、思源宋体）

### 10.3 长期规划（v2.0）

1. **Web Font 支持**
   - 支持在线字体 URL
   - Google Fonts / 阿里巴巴普惠体 等

2. **字体组合**
   - 支持为不同语言指定不同字体
   - 如：中文用"思源宋体"，英文用"Times New Roman"

3. **高级排版**
   - 字间距、行间距精细调整
   - OpenType 特性支持（ligatures, old-style figures 等）

---

## 附录 A：API 参考

### FontManager 公共方法

```typescript
interface FontManager {
    init(): Promise<void>;
    addFont(): Promise<FontInfo | null>;
    removeFont(fontId: string): Promise<boolean>;
    loadFont(fontId: string): Promise<void>;
    getFontFamily(fontId: string): string;
    getAllFonts(): FontInfo[];
    customFonts: FontInfo[];
}

interface FontInfo {
    id: string;
    name: string;
    family: string;
    fileName: string;
    storedName: string;
    size: number;
    addedAt: number;
    isBuiltIn: boolean;
}
```

### 内置字体配置

```javascript
builtInFonts: {
    serif: { id: 'serif', name: '宋体', family: '"LXGW Neo Zhi Song", ...', cssUrl: './assets/fonts/LXGWNeoZhiSong.css' },
    sans: { id: 'sans', name: '黑体', family: '"LXGW Neo XiHei", ...', cssUrl: './assets/fonts/LXGWNeoXiHei.css' },
    kai: { id: 'kai', name: '楷体', family: '"LXGW WenKai", ...', cssUrl: './assets/fonts/lxgwwenkai.css' },
    mono: { id: 'mono', name: '等宽', family: '"JetBrains Mono", ...', cssUrl: null }
}
```

---

## 附录 B：相关文件清单

| 文件路径 | 说明 |
|----------|------|
| `app/www/js/modules/font-manager.js` | 字体管理器核心 |
| `app/www/js/modules/settings.js` | 设置面板集成 |
| `app/www/index.html` | UI 结构定义 |
| `app/www/css/main.css` | 样式定义 |
| `app/android/app/src/main/AndroidManifest.xml` | Android 权限配置 |

---

**文档维护记录：**

- 2026-04-02: 初始版本，基于自定义字体功能实现

---

*本文档由开发团队维护，如有疑问请联系技术负责人。*
