# Lumina Reader 文件解析系统架构文档

> **版本**: v1.0  
> **日期**: 2026-04-17  
> **适用范围**: 流萤阅读器 (Lumina Reader) v2.1.2+  
> **对应模块**: `app/www/js/modules/parser.js` (2132 行)

---

## 目录

1. [架构概览](#1-架构概览)
2. [编码检测系统](#2-编码检测系统)
3. [格式解析详解](#3-格式解析详解)
4. [章节检测系统](#4-章节检测系统)
5. [核心 API](#5-核心-api)
6. [扩展指南](#6-扩展指南)
7. [故障排查](#7-故障排查)

---

## 1. 架构概览

### 1.1 系统定位

解析器是流萤阅读器的**文档处理入口**，负责将二进制文件转换为结构化的阅读数据。支持 6 种文档格式，采用"**编码检测 → 格式解析 → 章节识别 → 标准化输出**"的流水线架构。

```
┌─────────────────────────────────────────────────────────────┐
│                     解析器流水线                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  原始文件 (ArrayBuffer/File)                                  │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────────────────────────┐                   │
│  │  步骤1: 编码检测 (EncodingManager)   │                   │
│  │  BOM检测 → 置信度评分 → 尝试解码      │                   │
│  └─────────────────────────────────────┘                   │
│       │                                                      │
│       ▼  UTF-8 文本                                          │
│  ┌─────────────────────────────────────┐                   │
│  │  步骤2: 格式解析 (格式专用解析器)     │                   │
│  │  DOCX / PDF / EPUB / HTML / MD / TXT │                   │
│  └─────────────────────────────────────┘                   │
│       │                                                      │
│       ▼  [{type, content, level}, ...]                       │
│  ┌─────────────────────────────────────┐                   │
│  │  步骤3: 章节检测 (RegexCache)        │                   │
│  │  内置正则 → 自定义正则 → 标题编号     │                   │
│  └─────────────────────────────────────┘                   │
│       │                                                      │
│       ▼                                                      │
│  标准化输出: { items, metadata, coverImage? }               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 支持的格式

| 格式 | 扩展名 | 特点 | 技术实现 |
|------|--------|------|---------|
| **DOCX** | .docx | Word 文档，支持密码保护、图片提取 | JSZip + OOXML + officecrypto |
| **PDF** | .pdf | 支持密码保护、文本提取、图片嵌入 | pdf.js + StructTree |
| **EPUB** | .epub | 电子书，支持目录、封面、CSS 样式 | JSZip + OPF/XML |
| **Markdown** | .md | 富文本，支持代码块、表格 | 标题语法解析 + 通用正则 |
| **HTML** | .html | 网页文档，标签清理 | DOMParser |
| **TXT** | .txt | 纯文本，智能编码检测 | Encoding API + 行分割 |

### 1.3 文件结构

```
app/www/js/modules/
└── parser.js              # 解析器核心（2132 行）

app/www/assets/js/lib/
├── jszip.min.js           # ZIP 解压（DOCX / EPUB）
├── pdf.min.js             # PDF.js 主库
├── pdf.worker.min.js      # PDF.js Worker
├── docx.min.js            # DOCX 解析辅助
└── pinyin-pro.min.js      # 拼音转换（PDF 密码智能猜测）
```

---

## 2. 编码检测系统

### 2.1 设计目标

中文 TXT 文档常见编码包括 UTF-8、GBK、Big5、ANSI（Windows-1252），错误的编码会导致乱码。EncodingManager 采用**多编码置信度评分**机制，自动选择最优编码。

### 2.2 检测流程

```
原始字节流
    │
    ├──→ BOM 检测（文件头标记）
    │      EF BB BF → UTF-8
    │      FF FE → UTF-16 LE
    │      FE FF → UTF-16 BE
    │      命中 → 直接返回，置信度 100%
    │
    └──→ 采样前 2000 字节进行置信度评分
           │
           ├── UTF-8 评分：验证多字节序列合法性
           ├── GBK 评分：检查双字节范围 0x81-0xFE，常用汉字加分
           ├── Big5 评分：检查繁体汉字范围
           ├── ANSI 评分：检测孤立扩展字符
           ├── EUC-JP / Shift_JIS / EUC-KR 评分
           │
           └──→ 生成候选列表（按分数降序）
                    │
                    └──→ 逐个尝试解码（TextDecoder fatal: true）
                             │
                             └──→ 验证解码结果
                                    ├─ 无替换字符（�）
                                    ├─ 控制字符 < 1%
                                    └─ 可读字符 > 30%
                             │
                             └──→ 全部失败 → GB18030 兜底（置信度 30）
```

### 2.3 置信度阈值

```javascript
confidenceThreshold: {
    HIGH: 85,    // 高置信度，直接采用
    MEDIUM: 70,  // 中等置信度，需二次验证
    LOW: 50      // 低置信度，提示用户
}
```

### 2.4 核心 API

```javascript
// 主入口：自动检测编码并返回文本
Lumina.Parser.EncodingManager.processFile(file)
    → { text, originalEncoding, confidence }
```

---

## 3. 格式解析详解

### 3.1 DOCX 解析

```javascript
parseDOCX(arrayBuffer, password?) → { items, type: 'docx', metadata? }
```

**流程**：
1. **解密**（可选）：若文件加密，使用 `officecrypto` 解密
2. **解压**：JSZip 解压 OOXML 包
3. **解析 XML**：读取 `word/document.xml`，提取段落和样式
4. **样式映射**：建立样式 ID → 样式名称映射（Heading 1-6、Title、Subtitle、List）
5. **图片提取**：读取 `word/_rels/document.xml.rels` + `word/media/`，内联为 Base64

### 3.2 PDF 解析

```javascript
parsePDF(arrayBuffer, onProgress?, fileName?) → { items, type: 'pdf', metadata? }
```

**流程**：
1. **加载文档**：`pdfjsLib.getDocument({data: arrayBuffer, ...})`
2. **密码处理**：
   - 若启用 `PasswordPreset`，先按文件名生成密码候选列表批量尝试
   - 预设失败后弹出 UI 密码输入框
3. **结构树提取**：`page.getStructTree()` 识别标题层级
4. **文本提取**：逐页提取文本，跨页段落合并
5. **图片提取**（可选）：`extractPDFImages()` 提取并过滤透明图片

**图片提取细节**：
- 两阶段处理：先收集元数据，再分批并行转换（`BATCH_SIZE = 3`）
- 透明度过滤：PNG 检查 `colorType`（4/6 为有 alpha），JPEG 视为不透明
- 尺寸限制：最大边不超过 2000px
- Canvas 复用池：避免重复创建 OffscreenCanvas

### 3.3 EPUB 解析

```javascript
parseEPUB(arrayBuffer) → { items, type: 'epub', coverImage?, epubMetadata? }
```

**流程**：
1. **解压**：JSZip 加载
2. **定位 OPF**：读取 `META-INF/container.xml` → 找到 `content.opf`
3. **解析 OPF**：
   - `manifest`：id → {href, mediaType, fullPath}
   - `spine`：有序 idref 列表（阅读顺序）
   - `metadata`：提取封面信息
4. **扫描图片**：建立 ZIP 内图片路径 → Base64 DataURL 映射
5. **遍历内容**：按 spine 顺序遍历 HTML/XHTML，提取文本和图片

**智能图片路径解析**（`findImage`）：
1. 相对路径解析（处理 `../`）
2. URL 解码（`%20` 等）
3. 尝试去掉前导 `/`
4. 尝试仅匹配文件名（不区分大小写）
5. 尝试匹配无扩展名的文件名

### 3.4 TXT / Markdown / HTML 通用解析

```javascript
parseTextFile(content, ext, file?) → { items, type }
```

| 扩展名 | 处理方式 |
|--------|---------|
| `md` | 解析 `#` 语法标题，回退通用章节正则 |
| `html` | DOMParser 解析，提取 `h1-h6`/`p`/`li`/`img` |
| 其他 | 按行分割，通用章节正则检测 |

---

## 4. 章节检测系统

### 4.1 双层检测

```
输入文本行
    │
    ├──→ 第一层：内置正则检测
    │      chineseChapter  → 第X章/回/篇/节
    │      englishChapter  → Chapter/Part X
    │      sectionDash     → 短横线分隔小节
    │      sectionCn       → 中文小节
    │      sectionEn       → 英文小节
    │      specialTitles   → 前言/后记/附录
    │
    └──→ 第二层：自定义正则（用户配置）
           chapterPattern → level: 1
           sectionPattern → level: 2
```

### 4.2 宏定义系统

自定义正则支持**宏定义**，降低用户编写正则的难度：

| 宏 | 含义 | 示例 |
|---|------|------|
| `\C` | 中文数字 | 一、二、三... |
| `\R` / `\r` | 罗马数字（大小写） | I、II、III... |
| `\N` | 阿拉伯数字 | 1、2、3... |
| `\U` / `\L` | 字母（大小写） | A、a... |
| `\W` | 单词 | [A-Za-z]+ |
| `\Z` | 汉字 | [\u4e00-\u9fa5]+ |
| `\S` | 空白 | \s+ |

**示例**：`第\C章` → `第[一二三四五六七八九十百千万亿]+章`

### 4.3 标题编号策略

`processHeading(level, rawText, cleanText)` 根据 `settings.chapterNumbering` 生成显示文本：

| 策略 | 说明 |
|------|------|
| `none` | 不编号，保留原文 |
| `chineseNovel` | 中文小说风格：第 X 章 |
| `englishNovel` | 英文小说风格：Chapter X |
| `academic` | 学术风格：1.1、1.2... |
| `technical` | 技术文档：1、1.1、1.1.1... |

---

## 5. 核心 API

### 5.1 解析入口

| API | 签名 | 说明 |
|-----|------|------|
| `parseDOCX` | `(arrayBuffer, password?) → ParseResult` | Word 文档解析 |
| `parsePDF` | `(arrayBuffer, onProgress?, fileName?) → ParseResult` | PDF 解析 |
| `parseEPUB` | `(arrayBuffer) → ParseResult` | EPUB 解析 |
| `parseTextFile` | `(content, ext, file?) → ParseResult` | TXT/HTML/MD 通用解析 |

### 5.2 编码与章节

| API | 签名 | 说明 |
|-----|------|------|
| `EncodingManager.processFile` | `(file) → {text, originalEncoding, confidence}` | 自动编码检测 |
| `RegexCache.detectChapter` | `(text, useCustom?) → ChapterInfo\|null` | 检测章节标题 |
| `RegexCache.updateCustomPatterns` | `(chapterRegex, sectionRegex) → void` | 更新自定义正则 |
| `processHeading` | `(level, rawText, cleanText?) → HeadingItem` | 生成标准化标题 |

### 5.3 辅助方法

| API | 说明 |
|-----|------|
| `decryptDOCX(arrayBuffer, password)` | DOCX 解密（加载 officecrypto） |
| `extractPDFImages(page, pageNum)` | PDF 图片提取 |
| `processSinglePDFImage(...)` | 单张 PDF 图片处理 |

---

## 6. 扩展指南

### 6.1 添加新格式支持

1. 在 `parseTextFile()` 或新增方法中实现解析逻辑
2. 返回标准化 `ParseResult`：
   ```javascript
   {
       items: [
           { type: 'heading', level: 1, content: '标题' },
           { type: 'paragraph', content: '段落文本' },
           { type: 'image', src: 'data:image/...', alt: '描述' }
       ],
       type: 'newformat',
       metadata: { title, author, ... }
   }
   ```
3. 在 `data-manager.js` 的文件类型判断中注册新扩展名
4. 在 UI 的文件选择器 `accept` 属性中添加新扩展名

### 6.2 自定义章节正则

通过设置面板的"章节正则"功能：
1. 输入 chapter 正则（一级标题）
2. 输入 section 正则（二级标题）
3. 使用宏定义简化书写
4. 实时预览匹配结果

---

## 7. 故障排查

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| TXT 文件乱码 | 编码检测失败 | 手动选择编码重新打开 |
| DOCX 打开失败 | 文件加密 / 格式不标准 | 输入密码 / 尝试另存为标准格式 |
| PDF 图片不显示 | 图片被透明度过滤 | 检查 `pdfExtractImages` 设置 |
| 章节识别错误 | 正则不匹配 | 使用自定义正则或调整编号策略 |
| EPUB 目录页混入正文 | 目录页未被过滤 | 检查 EPUB 的 nav 标签结构 |
| 大文件解析卡顿 | 单线程阻塞 | 正常现象，已分批处理图片转换 |

---

*本文档由开发团队维护，对应代码版本 v2.1.2。*
