# 流萤阅读器导入导出系统技术架构

> 版本：v1.0  
> 日期：2026-04-10  
> 适用范围：APP (Android) + Web 双平台  
> 涉及模块：配置导入导出、书籍数据导入导出、大文件处理

---

## 目录

1. [概述](#1-概述)
2. [系统架构](#2-系统架构)
3. **【核心】配置导入导出机制**
4. **【核心】书籍数据导入导出机制**
5. **【关键】大文件处理与 OOM 防护**
6. [平台适配策略](#6-平台适配策略)
7. [数据格式规范](#7-数据格式规范)
8. [故障排查指南](#8-故障排查指南)
9. [后续迭代建议](#9-后续迭代建议)

---

## 1. 概述

### 1.1 设计目标

流萤阅读器导入导出系统需要解决以下核心问题：
- **配置迁移**：用户重装 APP 或换设备时恢复设置
- **数据备份**：书籍数据（解析后的结构化数据）导出，实现跨设备传输
- **大文件支持**：APP 端导入大配置（含字体 base64）时避免 OOM
- **向后兼容**：旧版本导出的文件能在新版本正常导入

### 1.2 导出类型矩阵

| 类型 | 内容 | 格式 | 适用场景 | 存储位置（APP） |
|------|------|------|----------|----------------|
| 配置导出 | 设置项、自定义字体 | .json / .lmn | 备份设置 | `Documents/LuminaReader/` |
| 单书导出 | 单本书籍数据 | .json / .lmn | 分享单本书 | `Documents/LuminaReader/` |
| 批量导出 | 多本书籍数据 | .json / .lmn | 整库备份 | `Documents/LuminaReader/` |
| DOCX 导出 | 排版后的文档 | .docx | 外部编辑 | `Documents/LuminaReader/` |
| TXT/HTML 导出 | 纯文本/网页 | .txt / .html | 其他用途 | `Documents/LuminaReader/` |

### 1.3 加密支持

所有 .json 格式导出均可选择加密为 .lmn 格式：
- 加密算法：AES-256-GCM
- 密钥派生：PBKDF2 (100,000 轮)
- 密码策略：用户自定义或默认密钥

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        导入导出系统                              │
├─────────────────────────────────────────────────────────────────┤
│  UI 层                                                          │
│  ├── 设置面板 → 配置导出/导入按钮                               │
│  ├── 历史面板 → 右滑/悬浮按钮 → 单书导出                        │
│  ├── 书库面板 → 批量导出/选中导出                               │
│  └── 阅读器 → 导出格式按钮（DOCX/TXT/HTML）                     │
├─────────────────────────────────────────────────────────────────┤
│  业务层                                                         │
│  ├── ConfigManager.export() / .upload()                         │
│  ├── DataManager.exportSingle() / .exportBatch()                │
│  ├── ExportUtils.exportBooks() / .exportConfig()                │
│  └── Exporter.exportDocument()                                  │
├─────────────────────────────────────────────────────────────┬───┤
│  核心层                                                      │   │
│  ├── 配置导入: settings.js + config-manager.js               │   │
│  ├── 数据导入: data-manager.js + ImportLmnConfigData()       │   │
│  └── 大文件处理: LargeFilePlugin.java (Native)               │   │
├─────────────────────────────────────────────────────────────┼───┤
│  存储层 (APP)                                                │   │
│  ├── 配置导出路径: Documents/LuminaReader/config_*.json      │   │
│  ├── 书籍导出路径: Documents/LuminaReader/Lumina_*.json      │   │
│  ├── 文档导出路径: Documents/LuminaReader/*.docx             │   │
│  └── 临时文件: cache/temp_*.lmn (导入时)                     │   │
└─────────────────────────────────────────────────────────────┴───┘
```

### 2.2 关键文件位置

| 文件 | 说明 |
|------|------|
| `app/www/js/modules/config-manager.js` | 配置导出导入核心 |
| `app/www/js/modules/data-manager.js` | 书籍数据导出导入 |
| `app/www/js/modules/export-utils.js` | 导出工具类（含分块写入） |
| `app/www/js/modules/exporter.js` | 文档导出（DOCX/TXT/HTML） |
| `app/www/js/modules/settings.js` | 设置面板导入逻辑 |
| `app/src/main/java/.../LargeFilePlugin.java` | Native 大文件读取插件 |
| `app/www/assets/js/app/exporter-bridge.js` | APP 端文件保存桥接 |

---

## 3. 【核心】配置导入导出机制

### 3.1 配置导出流程

```
用户点击"导出配置"
    ↓
显示密码对话框（加密导出时）
    ↓
收集配置数据
├── settings.load() → 所有设置项
├── customFonts → 字体元数据
└── includeFonts ? → customFontsData (base64)
    ↓
导出处理
├── 明文: JSON.stringify(config) → writeFile
└── 加密: Crypto.encrypt(config, password) → writeFile
    ↓
提示: "已导出到: Documents/LuminaReader/config_xxx.json"
```

**关键代码：**

```javascript
// ConfigManager.export()
async export(encrypt = false, includeFonts = false) {
    const config = {
        version: CONFIG_VERSION,
        exportDate: new Date().toISOString(),
        settings: this.load(),
        customFonts: Lumina.FontManager.customFonts,
        customFontsData: includeFonts ? await this._exportFontsData() : null
    };
    
    const result = await Lumina.ExportUtils.exportConfig(config, {
        fileName: `config_backup_${timestamp}.json`,
        encrypted: encrypt,
        password: encrypt ? await this._getPassword() : null
    });
}
```

### 3.2 配置导入流程（含 OOM 防护）

**问题背景：** APP 端导入大配置（含字体 base64，可能 150MB+）时，Capacitor Bridge 会因单次传输过大而 OOM。

**解决方案：分块读取 + 进度反馈**

```
用户选择 .json/.lmn 文件
    ↓
【Web 端】直接读取文件内容 → JSON.parse → 导入
【APP 端】大文件分块处理
    ↓
显示进度对话框
    ├── 步骤1: 准备文件
    ├── 步骤2: 分块读取 (64KB/块)
    ├── 步骤3: 解密 (加密文件)
    ├── 步骤4: 解析配置
    └── 步骤5: 恢复字体数据
    ↓
合并配置 → ConfigManager.set()
    ↓
恢复字体（如有 fontsData）
    ↓
清理临时文件
    ↓
完成提示
```

**核心代码 - APP 端分块读取：**

```javascript
// LargeFilePlugin.java (Native)
@CapacitorPlugin(name = "LargeFile")
public class LargeFilePlugin extends Plugin {
    private static final int CHUNK_SIZE = 64 * 1024; // 64KB
    
    @PluginMethod
    public void getFileInfo(PluginCall call) {
        long fileSize = file.length();
        int totalChunks = (int) Math.ceil((double) fileSize / CHUNK_SIZE);
        // 返回: { fileSize, totalChunks }
    }
    
    @PluginMethod
    public void readChunks(PluginCall call) {
        int startChunk = call.getInt("startChunk");
        int chunkCount = call.getInt("chunkCount");
        
        // 读取指定范围的 chunks，返回 base64 数组
        for (int i = 0; i < chunkCount; i++) {
            byte[] buffer = new byte[CHUNK_SIZE];
            int read = inputStream.read(buffer);
            String base64 = Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP);
            chunks.put(base64);
        }
    }
}

// JS 端使用
async readLargeFile(filePath) {
    const info = await LargeFile.getFileInfo({ path: filePath });
    let allChunks = [];
    
    // 每次读取 20 个 chunks (~1.3MB)
    for (let i = 0; i < info.totalChunks; i += 20) {
        const result = await LargeFile.readChunks({
            path: filePath,
            startChunk: i,
            chunkCount: Math.min(20, info.totalChunks - i)
        });
        allChunks.push(...result.chunks);
    }
    
    // 合并并解析
    const fullBase64 = allChunks.join('');
    const jsonString = atob(fullBase64);
    return JSON.parse(jsonString);
}
```

**JS 端封装 - LargeFileReader：**

```javascript
Lumina.LargeFileReader = {
    async readFile(path, directory, onProgress) {
        const info = await Capacitor.Plugins.LargeFile.getFileInfo({ path, directory });
        
        for (let i = 0; i < info.totalChunks; i += 20) {
            const result = await Capacitor.Plugins.LargeFile.readChunks({
                path, directory,
                startChunk: i,
                chunkCount: Math.min(20, info.totalChunks - i)
            });
            
            // 合并 chunks...
            onProgress?.(i + result.chunks.length, info.totalChunks);
        }
        
        return reconstructedData;
    }
};
```

### 3.3 字体数据恢复

配置导入时，如果包含 `customFontsData`，需要：
1. 解码 base64
2. 保存到两个目录（DATA + DOCUMENTS）
3. 加载字体 CSS

```javascript
async _restoreFontsFromConfig(customFonts, fontsData, onProgress) {
    let restoredCount = 0;
    
    for (const fontData of fontsData) {
        // base64 → Uint8Array（循环展开优化性能）
        const binary = atob(fontData.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < len - 7; i += 8) {
            bytes[i] = binary.charCodeAt(i);
            // ... 展开 8 字节
        }
        
        // 保存到两个目录
        await Lumina.FontManager._saveFontFile(fontData.storedName, bytes.buffer);
        await Lumina.FontManager._saveFontFileToDocuments(fontData.storedName, bytes.buffer);
        
        onProgress?.(++restoredCount, fontsData.length, fontData.name);
    }
}
```

---

## 4. 【核心】书籍数据导入导出机制

### 4.1 数据格式

```typescript
interface BookData {
    fileName: string;          // 原始文件名
    fileType: string;          // txt/epub/pdf/md
    fileSize: number;          // 字节数
    content: Array<{
        type: 'title' | 'paragraph' | 'subtitle';
        text: string;
        display?: string;      // 处理后的显示文本
    }>;
    wordCount: number;
    lastChapter: number;
    lastScrollIndex: number;
    chapterTitle: string;
    customRegex: { chapter: string; section: string };
    chapterNumbering: string;
    annotations: Array<{
        chapterIndex: number;
        scrollIndex: number;
        type: 'highlight' | 'underline' | 'bookmark';
        text: string;
        note?: string;
    }>;
    cover?: string;            // data:image/... base64
    heatMap?: {
        keywords: string;
        chapters: Array<{ index: number; width: number; opacity: number }>;
    };
    metadata?: {
        title?: string;
        author?: string;
        tags?: string[];
        description?: string;
    };
    lastReadTime: string;
    exportType: 'single' | 'batch';
    exportDate: string;
}

interface BatchData {
    books: BookData[];
    totalBooks: number;
    exportType: 'batch';
    exportDate: string;
}
```

### 4.2 导出流程

**单书导出：**

```javascript
async exportSingle(fileKey) {
    const data = await Lumina.DB.adapter.exportFile(fileKey);
    const bookName = data.metadata?.title || data.fileName.replace(/\.[^/.]+$/, '');
    
    const result = await Lumina.ExportUtils.exportBooks(
        { books: [data], totalBooks: 1, exportType: 'single' },
        { fileName: `Lumina_${bookName}_${timestamp}`, encrypted: ... }
    );
    
    Lumina.UI.showToast(`已导出到: Documents/LuminaReader/${result.fileName}`);
}
```

**批量导出：**

```javascript
async exportBatchData(batchData) {
    // 支持加密/明文两种模式
    if (Lumina.State.settings.encryptedExport) {
        await this.batchExportEncrypted(batchData);
    } else {
        await this.batchExportPlain(batchData);
    }
}
```

### 4.3 导入流程

```javascript
async importLmnConfigData(data) {
    // 1. 验证格式
    if (!data || !data.version) throw new Error('Invalid format');
    
    // 2. 合并配置
    const currentConfig = this.loadConfig();
    const mergedConfig = { ...currentConfig, ...data.settings };
    this.saveConfig(mergedConfig);
    
    // 3. 恢复字体（APP 端且有字体数据）
    if (isApp && data.customFontsData?.length > 0) {
        await Lumina.ConfigManager._restoreFontsFromConfig(
            data.customFonts,
            data.customFontsData,
            (current, total, name) => {
                progressDialog.updateStep(current, total, `恢复字体: ${name}`);
            }
        );
    }
    
    // 4. 导入书籍数据
    if (data.books?.length > 0) {
        for (const book of data.books) {
            await Lumina.DB.adapter.saveFile(this.generateKey(book), book);
        }
    }
    
    // 5. 重新加载
    await Lumina.DB.loadHistoryFromDB();
    Lumina.Renderer.renderHistoryFromDB();
}
```

---

## 5. 【关键】大文件处理与 OOM 防护

### 5.1 问题场景

| 场景 | 文件大小 | 风险 |
|------|----------|------|
| 配置导出含字体 | 100-200MB | Bridge OOM |
| 批量导出 50 本书 | 50-100MB | 内存溢出 |
| 加密大文件 | 200MB+ | 加密过程内存暴涨 |

### 5.2 防护策略

**1. 分块读取（Native）**

```java
// LargeFilePlugin.java
public static final int CHUNK_SIZE = 64 * 1024; // 64KB

@PluginMethod
public void readChunks(PluginCall call) {
    // 避免一次性读取大文件
    // 返回 base64 字符串数组，每个元素 64KB
}
```

**2. 分块写入（APP 端 JSON 导出）**

```javascript
// ExportUtils.writeJsonInChunks()
async writeJsonInChunks(fileName, data, onProgress) {
    const jsonStr = JSON.stringify(data);
    const chunkSize = 512 * 1024; // 512KB
    const totalSize = jsonStr.length;
    
    // 先写入临时文件
    await Filesystem.writeFile({
        path: `cache/temp_${timestamp}.lmn`,
        data: '',
        directory: 'DATA'
    });
    
    // 分块追加
    for (let i = 0; i < totalSize; i += chunkSize) {
        const chunk = jsonStr.substring(i, i + chunkSize);
        await Filesystem.appendFile({
            path: `cache/temp_${timestamp}.lmn`,
            data: chunk,
            directory: 'DATA'
        });
        onProgress?.(i / totalSize);
    }
    
    // 移动到最终位置
    await Filesystem.rename({
        from: `cache/temp_${timestamp}.lmn`,
        to: `LuminaReader/${fileName}`
    });
}
```

**3. 流式加密**

```javascript
// Crypto.encrypt() 支持进度回调
const encryptedBuffer = await Lumina.Crypto.encrypt(
    data,
    password,
    (progress) => progressDialog.update(progress * 100)
);
```

### 5.3 内存管理检查清单

- [ ] ArrayBuffer → Base64 使用分块（64KB/chunk）
- [ ] JSON.stringify 大对象时考虑分块写入
- [ ] 加密过程提供进度回调，避免阻塞主线程
- [ ] 导入完成后清理临时文件
- [ ] Native 层读取大文件使用流式 API

---

## 6. 平台适配策略

### 6.1 APP 端 (Android)

**存储目录：**

```javascript
const EXPORT_DIR = 'LuminaReader'; // 在 Documents 下

// 导出文件
await Filesystem.writeFile({
    path: `${EXPORT_DIR}/${fileName}`,
    data: content,
    directory: 'DOCUMENTS', // /storage/emulated/0/Documents/
    recursive: true
});
```

**文件分享：**
- 目标目录：`/storage/emulated/0/Documents/LuminaReader/`
- 用户可通过文件管理器直接访问
- 支持通过系统分享功能发送

### 6.2 Web 端

**下载方式：**

```javascript
downloadJson(data, fileName) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}
```

**文件选择：**

```javascript
// Web 端使用原生 input
createFileInput(accept, callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept; // '.json,.lmn'
    input.onchange = (e) => callback(e.target.files[0]);
    input.click();
}
```

### 6.3 跨平台兼容性

**路径处理：**

```javascript
// 不要硬编码路径分隔符
const path = `${EXPORT_DIR}/${fileName}`; // 正确
const path = EXPORT_DIR + '/' + fileName;  // 不推荐
```

---

## 7. 数据格式规范

### 7.1 版本控制

```javascript
const CONFIG_VERSION = '1.0';

// 导出时
config.version = CONFIG_VERSION;

// 导入时校验
if (!data.version) {
    // 旧版本兼容处理
} else if (data.version !== CONFIG_VERSION) {
    // 版本升级处理
}
```

### 7.2 文件命名规范

| 类型 | 命名格式 | 示例 |
|------|----------|------|
| 配置导出 | `config_backup_${timestamp}.json` | `config_backup_1712750400000.json` |
| 单书导出 | `Lumina_${bookName}_${timestamp}.json` | `Lumina_三体_1712750400000.json` |
| 批量导出 | `Lumina_Library_${timestamp}.json` | `Lumina_Library_1712750400000.json` |
| 加密文件 | `${original}.lmn` | `config_backup_xxx.lmn` |

---

## 8. 故障排查指南

### 8.1 配置导入导致 APP 闪退（OOM）

**症状：** 导入大配置文件（> 50MB）时 APP 直接闪退。

**原因：** Capacitor Bridge 单次传输数据过大。

**解决：** 确保使用 `LargeFilePlugin` 分块读取机制。

**验证：**
```javascript
// 检查是否走大文件通道
if (fileSize > 5 * 1024 * 1024) {
    // 必须使用 LargeFileReader
}
```

### 8.2 导出文件找不到

**症状：** 导出成功但用户无法在文件管理器中找到文件。

**排查：**

```javascript
// 检查目录是否正确
const result = await Filesystem.readdir({
    path: 'LuminaReader',
    directory: 'DOCUMENTS'
});
console.log('导出目录文件:', result.files);
```

**常见原因：**
1. 目录权限被拒绝（Android 11+ 需要 `MANAGE_EXTERNAL_STORAGE` 或正确使用 `Documents` 目录）
2. 文件名包含非法字符
3. 存储空间不足

### 8.3 导入后字体不生效

**症状：** 配置导入成功，但字体渲染为系统字体。

**排查步骤：**

```javascript
// 1. 检查字体元数据是否导入
console.log('Custom fonts:', Lumina.FontManager.customFonts);

// 2. 检查字体文件是否存在
const exists = await Lumina.FontManager._checkFontFileExists(font.storedName);
console.log('Font file exists:', exists);

// 3. 检查 CSS 是否加载
document.querySelectorAll('style[id^="font-style-"]').forEach(s => console.log(s.id));
```

### 8.4 加密文件无法解密

**症状：** 导入 .lmn 文件时提示"解密失败"。

**原因：**
1. 密码错误
2. 文件损坏
3. 加密算法版本不匹配

**解决：**
- 提供"使用默认密钥"选项
- 添加"尝试修复"功能（跳过损坏的书籍数据，保留配置）

---

## 9. 后续迭代建议

### 9.1 短期优化（v1.1）

1. **导入取消功能**
   - 大文件导入过程中允许用户取消
   - 清理已写入的临时数据

2. **导出预览**
   - 显示导出文件预估大小
   - 提示"是否包含字体文件"

3. **自动备份**
   - 定期自动导出配置到 Documents
   - 保留最近 3 个备份版本

### 9.2 中期功能（v1.2）

1. **云同步**
   - 接入 WebDAV / iCloud / Google Drive
   - 自动同步阅读进度和配置

2. **增量导出**
   - 只导出自上次备份后变更的书籍
   - 减少导出时间和文件大小

3. **压缩支持**
   - 导出为 .zip 格式，包含书籍和配置
   - 减少存储占用

### 9.3 长期规划（v2.0）

1. **多端同步协议**
   - 自定义同步协议，支持冲突解决
   - 端到端加密

2. **Web 版云盘**
   - 在线备份和恢复
   - 二维码跨设备传输

---

## 附录 A：相关文件清单

| 文件路径 | 说明 |
|----------|------|
| `app/www/js/modules/config-manager.js` | 配置导入导出 |
| `app/www/js/modules/data-manager.js` | 书籍数据导入导出 |
| `app/www/js/modules/export-utils.js` | 导出工具类（含分块写入） |
| `app/www/js/modules/exporter.js` | 文档导出（DOCX/TXT/HTML） |
| `app/www/js/modules/settings.js` | 设置面板导入逻辑 |
| `app/www/js/modules/font-manager.js` | 字体导出导入 |
| `app/www/js/modules/crypto.js` | 加密解密 |
| `app/android/app/src/main/java/.../LargeFilePlugin.java` | Native 大文件读取 |
| `app/www/assets/js/app/exporter-bridge.js` | APP 端文件保存桥接 |
| `app/www/js/modules/file-opener-bridge.js` | 文件选择桥接 |

---

## 附录 B：关键 i18n 键值

| 键 | 中文 | 英文 |
|----|------|------|
| `exportSuccess` | 导出成功 | Exported |
| `exportFailed` | 导出失败 | Export failed |
| `exportLocation` | 已导出到: $1 | Exported to: $1 |
| `batchExportSuccess` | 成功导出 $1 本书 | $1 books exported |
| `importProgress` | 导入进度 | Import progress |
| `restoringFonts` | 正在恢复字体... | Restoring fonts... |

---

**文档维护记录：**

- 2026-04-10: 初始版本 v1.0 - 基于导入导出系统实现

---

*本文档由开发团队维护，如有疑问请联系技术负责人。*
