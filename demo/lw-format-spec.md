# Lumina Writing Document (.lw / .lwN) 格式规范

> 本文档是 `.lw` 与 `.lwN` 格式的权威技术规范，覆盖文件原理、ZIP 内部结构、`manifest.json` Schema、资产协议、伴侣文件机制及第三方集成指南。
>
> 版本：2.0  
> 最后更新：2026-05-20

---

## 目录

1. [概述](#1-概述)
2. [文件原理](#2-文件原理)
3. [ZIP 内部结构](#3-zip-内部结构)
4. [manifest.json](#4-manifestjson)
5. [资产协议](#5-资产协议)
6. [伴侣文件](#6-伴侣文件)
   - 6.1 [`.cv` — 封面参数伴侣](#61-cv--封面参数伴侣)
   - 6.2 [`.cvb` — 封面位图伴侣](#62-cvb--封面位图伴侣)
   - 6.3 [`.dic` — 词典伴侣](#63-dic--词典伴侣)
7. [导入流程](#7-导入流程)
8. [导出流程](#8-导出流程)
9. [第三方集成指南](#9-第三方集成指南)
10. [完整 Demo](#10-完整-demo)
11. [版本历史](#11-版本历史)

---

## 1. 概述

`.lw`（Lumina Writing Document）是 Lumina Writing 的**单文档交换格式**。其本质是一个标准 ZIP 压缩包，内部以纯文本和 JSON 存储文档内容、元数据及资产，以二进制存储嵌入的图片、音频、视频等资源。

`.lwN`（如 `.lw1`、`.lw2`…）是 `.lw` 的**分卷扩展**，内部结构与 `.lw` 完全一致，仅通过文件名后缀标识卷号，用于长篇作品的多卷管理。

### 设计原则

| 原则 | 说明 |
|------|------|
| **纯文本优先** | Markdown 正文、JSON 元数据、伴侣文件均为 UTF-8 纯文本，人类可读 |
| **自包含** | 单文件携带正文、元数据、资产及伴侣文件，无需外部依赖即可完整还原 |
| **扁平化** | 伴侣文件位于 ZIP 根目录，不嵌套子文件夹，便于扫描和解析 |
| **向后兼容** | 新增字段均为可选，旧版解析器可安全忽略未知字段 |

---

## 2. 文件原理

`.lw` 使用标准 **ZIP 容器**（PKZIP / Info-ZIP 兼容），运行时通过 [JSZip](https://stuk.github.io/jszip/) 生成与解析。

### 压缩策略

- **文本文件**（`content.md`、`manifest.json`、伴侣文件）：以 ZIP 默认压缩（DEFLATE）存储
- **资产文件**（`assets/` 目录）：以二进制原样存储，不额外压缩（避免对 JPEG/PNG 等已压缩格式做无用功）

### MIME 类型

| 场景 | MIME Type |
|------|-----------|
| 导出 Blob | `application/x-lumina-writing` |
| HTTP 上传 | `application/x-lumina-writing` 或 `application/zip` |

---

## 3. ZIP 内部结构

```
{title}.lw
├── content.md              # Markdown 正文（UTF-8 纯文本）
├── manifest.json           # 文档元数据（JSON）
├── assets/                 # 嵌入资产（可选）
│   └── {assetId}.{ext}
├── {basename}.cv           # 封面参数伴侣（可选）
├── {basename}.cvb          # 封面位图伴侣（可选）
└── *.dic                   # 词典伴侣（可选，可多个）
```

### 文件说明

| 路径 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content.md` | 文本 | 是 | Markdown 正文，缺失时导入回退为空字符串 |
| `manifest.json` | JSON | 是 | 文档元数据，包含格式标识、版本、资产清单及伴侣声明 |
| `assets/{id}.{ext}` | 二进制 | 否 | 嵌入资产，由正文 Markdown 通过 `asset://{id}` 引用 |
| `{basename}.cv` | JSON 文本 | 否 | 封面生成参数伴侣 |
| `{basename}.cvb` | Markdown 文本 | 否 | 封面位图引用伴侣，内容为一行 `![](asset://{id})` |
| `*.dic` | Markdown 文本 | 否 | 词典伴侣，可存在多个，任意命名 |

### 命名约定

```
basename = doc.title.replace(/\.md$/i, '')
```

**示例**：

| 主文档标题 | 封面参数伴侣 | 封面位图伴侣 |
|-----------|-------------|-------------|
| `诗意的正义.md` | `诗意的正义.cv` | `诗意的正义.cvb` |
| `魔法学院.lw1` | `魔法学院.cv` | `魔法学院.cvb` |

---

## 4. manifest.json

`manifest.json` 是 `.lw` 文件的元数据中心，解析器必须首先读取并校验此文件。

### 完整 Schema

```typescript
interface Manifest {
  format: string;           // 固定值 "lumina-writing-document"
  version: number;          // 格式版本，当前为 2
  title: string;            // 文档标题
  modified: string;         // ISO 8601 时间戳，导出时生成
  frontmatter?: object;     // YAML Frontmatter 的 JSON 等价物
  editorState?: object;     // 编辑器状态（选区、滚动位置等）
  wordCount?: number;       // 字数统计；缺失时导入端重新计算
  assets?: AssetMeta[];     // 资产清单
  companions?: Companions;  // 伴侣文件声明（可选，v2 新增）
}

interface AssetMeta {
  id: string;               // 资产唯一标识
  name: string;             // 原始文件名
  path: string;             // ZIP 内路径，如 "assets/doc_img_abc.png"
  mimeType: string;         // MIME 类型
  size: number;             // 字节大小
}

interface Companions {
  cover?: string;           // 封面参数伴侣文件名，如 "诗意的正义.cv"
  coverBitmap?: string;     // 封面位图伴侣文件名，如 "诗意的正义.cvb"
  dictionaries?: string[];  // 词典伴侣文件名列表，如 ["world.dic", "magic.dic"]
}
```

### 字段详解

#### `format` & `version`

解析器必须校验：

```js
if (manifest.format !== 'lumina-writing-document') {
  throw new Error('Format mismatch: not a valid .lw file');
}
if (manifest.version !== 2 && manifest.version !== 1) {
  throw new Error('Version mismatch: unsupported format version');
}
```

- **v1**（历史版本）：无 `companions` 字段，伴侣文件需通过扫描 ZIP 根目录发现
- **v2**（当前版本）：增加可选 `companions` 显式声明；解析器优先读取声明，缺失时回退扫描

#### `companions`（v2 新增）

显式声明伴侣文件名，使解析器无需依赖文件名约定即可定位伴侣文件。

**优先级策略**（推荐所有解析器实现）：

1. 若 `manifest.companions` 存在，按声明读取
2. 若不存在，回退扫描 ZIP 根目录中的 `.cv`、`.cvb`、`.dic` 文件
3. 扫描时排除已按声明读取的文件，避免重复

---

## 5. 资产协议

文档正文中通过 Markdown 扩展语法引用资产。

### 引用语法

| 类型 | Markdown 语法 | 说明 |
|------|--------------|------|
| 图片 | `![alt](asset://{assetId})` | 内嵌图片 |
| 链接附件 | `[label](asset://{assetId})` | 可下载附件 |
| 音频 | `::audio{id="{assetId}" name="..."}` | 内嵌音频播放器 |
| 视频 | `::video{id="{assetId}" name="..."}` | 内嵌视频播放器 |

### 资产存储

- **ZIP 内路径**：`assets/{assetId}.{ext}`
- **扩展名映射**：

| MIME 类型 | 扩展名 |
|-----------|--------|
| `image/png` | `png` |
| `image/jpeg` | `jpg` |
| `image/gif` | `gif` |
| `image/webp` | `webp` |
| `audio/mpeg` | `mp3` |
| `audio/wav` | `wav` |
| `video/mp4` | `mp4` |
| `video/webm` | `webm` |
| 其他 | `bin` |

### 编解码

**导出时**（内存 → ZIP）：

```js
// data URI (base64) -> Uint8Array -> ZIP binary
const base64 = dataUri.split(',')[1];
const binary = atob(base64);
const bytes = new Uint8Array(binary.length);
for (let i = 0; i < binary.length; i++) {
  bytes[i] = binary.charCodeAt(i);
}
zip.file(`assets/${assetId}.png`, bytes.buffer);
```

**导入时**（ZIP → 内存）：

```js
// ZIP binary -> ArrayBuffer -> base64 -> data URI
const buffer = await zipFile.async('arraybuffer');
const bytes = new Uint8Array(buffer);
let binary = '';
for (let i = 0; i < bytes.byteLength; i++) {
  binary += String.fromCharCode(bytes[i]);
}
const base64 = btoa(binary);
const dataUri = `data:${mimeType};base64,${base64}`;
```

---

## 6. 伴侣文件

伴侣文件（Companion Files）是与主文档**语义关联**的辅助文档，通过**命名约定**建立关系。它们不是独立导出格式，而是 `.lw` ZIP 包的可选组成部分。

### 核心原则

- **命名关联**：`{basename}.cv` / `{basename}.cvb` 与主文档通过 `basename` 关联
- **扁平存储**：所有伴侣文件位于 ZIP 根目录，不嵌套子文件夹
- **可选存在**：缺少伴侣文件不影响主文档的正常解析

---

### 6.1 `.cv` — 封面参数伴侣

**内容**：纯 JSON 字符串，存储封面生成器的全部参数。

**完整 Schema**：

```json
{
  "title": "书名",
  "author": "作者",
  "seed": 12345678,
  "hashMode": false,
  "pattern": "shanshui",
  "layout": "",
  "colorTheme": "",
  "density": 1.0,
  "width": 300,
  "height": 425,
  "titleFont": "'LXGW Neo Zhi Song', 'Noto Serif SC', serif",
  "authorFont": "'LXGW Neo Zhi Song', 'Noto Serif SC', serif",
  "spineEffect": true,
  "paperTexture": true
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 封面书名 |
| `author` | string | 作者名 |
| `seed` | number | 随机种子，控制封面图案确定性 |
| `hashMode` | boolean | 是否从标题哈希生成种子 |
| `pattern` | string | 封面图案类型，如 `"shanshui"`、`"dots"`、`"waves"` |
| `layout` | string | 布局模板 |
| `colorTheme` | string | 配色主题 |
| `density` | number | 图案密度，范围 0.0 ~ 2.0 |
| `width` | number | 封面宽度（像素） |
| `height` | number | 封面高度（像素） |
| `titleFont` | string | 书名 CSS font-family |
| `authorFont` | string | 作者名 CSS font-family |
| `spineEffect` | boolean | 是否启用书脊效果 |
| `paperTexture` | boolean | 是否启用纸张纹理 |

**使用场景**：
- 导出 HTML/DOCX 时，优先使用 `.cv` 参数实时生成 SVG 封面
- 若 `.cvb` 位图封面同时存在，`.cvb` 优先级更高

---

### 6.2 `.cvb` — 封面位图伴侣

**内容**：单行 Markdown 图片标签，引用全局资产库中的位图封面。

```markdown
![](asset://doc_img_1716180000000_abc)
```

**关键约束**：

1. `.cvb` 文件中**仅包含一个** `asset://` 引用
2. 被引用的 asset **必须** 被打包进 ZIP 的 `assets/` 目录
3. 解析器通过正则提取 asset ID：

```js
const match = cvbContent.match(/!\[.*?\]\(asset:\/\/([a-zA-Z0-9_-]+)\)/);
const assetId = match ? match[1] : null;
```

**与 `.cv` 的优先级**：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1（最高） | `.cvb` 位图 | 直接嵌入位图封面，fidelity 最高 |
| 2 | `.cv` 参数 | 使用参数实时生成 SVG 封面 |
| 3 | 默认值 | 从文档标题确定性生成默认封面 |

**导出时的资产处理**：

导出 `.lw` 前，必须扫描 `.cvb` 内容中的 `asset://` 引用，将对应资产加入打包列表：

```js
const assetIds = cvbContent.match(/asset:\/\/([a-zA-Z0-9_-]+)/g)
  ?.map(m => m.replace('asset://', '')) || [];
for (const id of assetIds) {
  if (!assetsToPack.has(id)) {
    const asset = await db.getAsset(id);
    assetsToPack.set(id, asset);
  }
}
```

---

### 6.3 `.dic` — 词典伴侣

**内容**：标准 Markdown，每级 heading 对应一个词条，heading 之间的正文为释义。

**词条结构示例**：

```markdown
# 魔法体系

## 元素魔法

### 火元素
> 别名: 火焰, 烈焰

火元素是最基础的攻击性魔法，施法者通过凝聚空气中的魔力因子...

### 水元素
> 别名: 流水, 碧浪

水元素擅长防御与治疗...

## 时空魔法

### 时间停止
时间停止魔法可以让施法者在极短时间内冻结周围时空...
```

**别名语法**：

- 行首以 `> 别名:` 或 `> 别名：`开头
- 多个别名以中文逗号 `，`或英文逗号 `,` 分隔
- 正则匹配：`/^>\s*别名[:：]\s*(.+)$/m`

**解析规则**：

1. 每个 heading（`#` ~ `######`）即为一个词条
2. heading 层级构成词条的层次结构（可用于分类导航）
3. heading 后的正文（直到下一个 heading）为词条释义
4. 释义中出现的 `> 别名:` 行被提取为词条别名

**作用域**：

- 词典为**文件
