# 书名和作者自动识别方案

## 概述

本方案实现了在文件初次解析时自动识别书名和作者，支持多种来源和文件格式。

## 文件结构

```
app/www/js/modules/
├── metadata-extractor.js      # 新增：元数据自动提取器
└── metadata-extractor-README.md   # 本文档
```

## 工作原理

### 1. 多源提取策略

元数据提取器从以下多个来源尝试提取书名和作者，按优先级排序：

| 优先级 | 来源 | 适用格式 | 说明 |
|--------|------|----------|------|
| 4 | EPUB/DOCX 内部元数据 | EPUB, DOCX | 从文件标准 metadata 提取，最准确 |
| 3 | 文件内容分析 | TXT, MD, HTML | 解析 YAML Front Matter、标题行等 |
| 2 | 文件名解析 | 所有格式 | 智能识别常见命名格式 |
| 1 | 文档结构分析 | 所有格式 | 从标题、副标题等元素提取 |

### 2. 文件名解析规则

支持以下常见文件名格式：

```
作者 - 书名.txt
书名 - 作者.txt
作者_书名.txt
[作者] 书名.txt
(作者) 书名.txt
作者《书名》.txt
《书名》作者.txt
```

### 3. 内容分析规则

#### YAML Front Matter（Markdown/TXT）
```yaml
---
title: 书名
author: 作者名
---
```

#### 头部信息格式
```
书名：XXX
作者：XXX
```

#### 智能标题识别
- 第一行如果是短文本（<50字）且不是章节标题，识别为书名
- 第二行如果包含"作者"关键词，识别为作者

### 4. EPUB 元数据提取

从 `content.opf` 读取：
- `<dc:title>` → 书名
- `<dc:creator>` → 作者

### 5. DOCX 元数据提取

从 `docProps/core.xml` 读取：
- `<dc:title>` → 书名
- `<dc:creator>` / `<cp:lastModifiedBy>` → 作者

## 使用方式

### 自动提取

文件打开时自动执行，无需用户干预：

```javascript
// 在 actions.js 中
const extractedMeta = Lumina.Parser.extractMetadata(file, result, rawText);
// 结果: { title, author, confidence, source }
```

### 置信度机制

每个提取结果都有置信度评分（0-100）：

| 来源 | 基础置信度 | 质量加分 |
|------|-----------|----------|
| EPUB/DOCX | 40 | 格式规范 +20 |
| 内容分析 | 40 | 长度合适 +20，无标点 +10 |
| 文件名 | 30 | 匹配模式 +20 |
| 结构分析 | 20 | 标题层级 +10 |

**显示规则：**
- 置信度 ≥ 70：显示为"自动识别"（带斜体和圆点标记）
- 置信度 < 70：显示为普通文本，但仍建议用户检查

### 用户编辑

在书籍详情面板中：
1. 点击书名/作者即可编辑
2. 编辑后自动清除"自动识别"标记
3. 置信度设为 100（用户确认）

## 数据结构

### 存储到数据库的元数据格式

```javascript
metadata: {
    title: "提取的书名",
    author: "提取的作者",
    publishDate: "",
    publisher: "",
    language: "",
    description: "",
    tags: [],
    _extracted: {
        confidence: { title: 85, author: 70 },
        source: { title: "filename", author: "content" }
    }
}
```

## 界面反馈

### 视觉标记

自动提取的字段显示为斜体，并在悬停时显示"自动识别"提示：

```css
/* 斜体显示 */
#bookDetailName[data-auto-extracted="true"] {
    font-style: italic;
}

/* 小圆点提示 */
#bookDetailName[data-auto-extracted="true"]::after {
    content: '';
    width: 6px;
    height: 6px;
    background: var(--accent-color);
    border-radius: 50%;
}
```

### 国际化

支持三种语言提示：
- 简体中文："自动识别"
- 繁體中文："自動識別"
- English："Auto Extracted"

## 扩展建议

### 添加更多提取规则

在 `metadata-extractor.js` 中修改相应的方法：

```javascript
// 添加新的文件名模式
FILE_NAME_PATTERNS: [
    // ... 现有规则
    { pattern: /^(.+?)《(.+?)》$/, authorIndex: 2, titleIndex: 1 }, // 新书名号格式
]

// 添加新的内容模式
extractFromContent(text, fileType) {
    // ... 现有逻辑
    // 添加自定义格式识别
    const customPattern = /您的正则/;
    const match = text.match(customPattern);
    if (match) {
        result.title = match[1];
    }
}
```

### 添加 AI 识别（未来扩展）

```javascript
// 使用 NLP 模型识别
async extractWithAI(text) {
    const result = await nlpModel.predict(text);
    return {
        title: result.title,
        author: result.author,
        confidence: result.confidence
    };
}
```

## 调试

在浏览器控制台查看提取日志：

```
[Metadata] Extracted: 书名 | 作者 | Confidence: {title: 85, author: 70} | Source: {title: "filename", author: "content"}
```

## 注意事项

1. **隐私保护**：所有提取逻辑都在本地执行，不上传任何数据
2. **性能优化**：只分析文件前 5000 字符，避免大文件卡顿
3. **容错处理**：提取失败时回退到文件名作为书名，作者留空
4. **用户主权**：用户编辑的元数据始终优先于自动提取
