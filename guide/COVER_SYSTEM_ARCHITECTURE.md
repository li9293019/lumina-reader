# Lumina 封面系统架构文档

> **版本**: v3.0 (Bibliomorph Cover System)  
> **日期**: 2026-04-10  
> **作者**: Kimi Code CLI  
> **适用范围**: 流萤阅读器 (Lumina Reader) v3.0+

---

## 目录

1. [架构概览](#1-架构概览)
2. [Bibliomorph Cover System](#2-bibliomorph-cover-system)
3. [Pattern Warehouse（图案库）](#3-pattern-warehouse图案库)
4. [亮度检测系统](#4-亮度检测系统)
5. [封面包装系统（wrapCover）](#5-封面包装系统wrapcover)
6. [配置与开关](#6-配置与开关)
7. [扩展指南](#7-扩展指南)
8. [故障排查](#8-故障排查)

---

## 1. 架构概览

### 1.1 系统演进

流萤阅读器的封面系统经历了三个阶段的演进：

| 阶段 | 系统 | 用途 | 状态 |
|------|------|------|------|
| v1.0 | 简单占位符 | 默认书籍图标 | 已废弃 |
| v2.0 | Pattern Warehouse | 50种几何图案封面 | 降级为分享卡专用 |
| v3.0 | Bibliomorph Cover | 文字排版+渐变+书脊 | **当前主力** |

### 1.2 双系统并存架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Lumina 封面系统架构                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐    ┌───────────────────────────┐   │
│  │ Bibliomorph Cover   │    │ Pattern Warehouse         │   │
│  │ bibliomorph-cover.js│    │ pattern-warehouse.js      │   │
│  ├─────────────────────┤    ├───────────────────────────┤   │
│  │ • 书库封面          │    │ • 分享卡片（书签）        │   │
│  │ • 详情页封面        │    │ • 50种几何图案            │   │
│  │ • 文字排版生成      │    │ • Canvas/SVG 双轨渲染     │   │
│  │ • base64包装        │    │                           │   │
│  └─────────────────────┘    └───────────────────────────┘   │
│                                                              │
│  开关控制：Lumina.State.settings.hashCover                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 核心设计原则

> **"确定性美学"** —— 同一本书永远得到相同的视觉风格

> **"用户选择权"** —— hashCover 开关让用户决定启用与否

> **"base64优先，生成兜底"** —— 有真实封面时优先使用，删除后自动生成

---

## 2. Bibliomorph Cover System

### 2.1 系统定位

Bibliomorph 是一个**基于文字排版的书籍封面生成系统**，灵感来自日本文库本的极简美学。

**核心特点**：
- 纯 SVG 输出，矢量无损
- 50种精心策划的莫兰迪色板
- 智能排版引擎（CJK竖排/英文竖排/混合横排）
- 纸张质感（噪点纹理、书脊高光）

### 2.2 文件结构

```
app/www/js/modules/
├── bibliomorph-cover.js      # 主模块（文字封面生成 + base64包装）
├── pattern-warehouse.js      # 图案库（分享卡专用，原名 cover-generator.js）
└── share-card.js             # 分享卡片（使用 Pattern Warehouse）
```

### 2.3 色彩系统

#### 50种色板分类

```javascript
COLOR_THEMES = [
    // 深色系（12种，亮度12-32%，配白字）
    { id: 'midnight', baseHue: 235, hueVar: 12, sat: [25, 40], light: [12, 22] },
    { id: 'forest_deep', baseHue: 145, hueVar: 20, sat: [20, 35], light: [15, 28] },
    // ... 共12种
    
    // 中色系（26种，亮度38-58%）
    { id: 'morandi_warm', baseHue: 35, hueVar: 15, sat: [15, 28], light: [40, 52] },
    // ... 共26种
    
    // 浅色系（12种，亮度62-85%，配黑字）
    { id: 'shell', baseHue: 25, hueVar: 6, sat: [14, 24], light: [86, 93] },
    // ... 共12种
];
```

#### 色彩确定算法

```javascript
// djb2 哈希确保确定性
djb2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return hash >>> 0;
}

// 从书名+作者生成唯一色板
const seedStr = `${title}|${author}`;
const hash = djb2(seedStr);
const themeIndex = hash % COLOR_THEMES.length;
```

### 2.4 排版引擎

#### 三种排版模式

| 模式 | 触发条件 | 示例 |
|------|----------|------|
| **CJK竖排** | 纯CJK且≤24字 | 「正太胶囊公司」竖排显示 |
| **英文词级竖排** | 英文单词≤6个 | "Lumina Reader" 词级竖排 |
| **混合横排** | 其他情况 | 书名+作者横排显示 |

#### 竖排算法（CJK）

```javascript
// 最大 3列 × 9字 = 27字
calculateVerticalCJK(units, zone, config) {
    // 均衡分布到各列
    const distribution = balanceColumns(total, maxPerCol, minOrphan);
    
    // 计算字号自适应
    let fontSize = Math.min(
        zoneH / (Math.max(...distribution) * 1.1),
        zoneW / (cols * 1.3)
    );
    
    // 标点旋转处理
    const rotatedPuncts = '，。！？、；：""''（）【】';
}
```

#### 书脊渲染

```javascript
// 暗色封面 → 白色书脊（overlay混合）
const spineStops = [
    { offset: '0%', color: 'rgba(255,255,255,0.90)' },
    { offset: '25%', color: 'rgba(255,255,255,0.55)' },
    { offset: '100%', color: 'rgba(255,255,255,0)' }
];

// 亮色封面 → 黑色书脊（multiply混合）
const spineStops = [
    { offset: '0%', color: 'rgba(0,0,0,0.30)' },
    { offset: '25%', color: 'rgba(0,0,0,0.08)' },
    { offset: '100%', color: 'rgba(0,0,0,0)' }
];
```

---

## 3. Pattern Warehouse（图案库）

### 3.1 系统定位

Pattern Warehouse 是 v2.0 的封面系统，现降级为**分享卡专用**。

**保留用途**：
- 书签分享卡片背景
- 金句摘录卡片装饰
- 社交分享的视觉生成

### 3.2 与 Bibliomorph 的区别

| 特性 | Bibliomorph | Pattern Warehouse |
|------|-------------|-------------------|
| **输出格式** | SVG（矢量） | Canvas/SVG 双轨 |
| **设计风格** | 极简文字排版 | 几何图案装饰 |
| **使用场景** | 书库/详情页封面 | 分享卡片 |
| **可定制性** | 文字内容驱动 | 图案参数驱动 |
| **性能** | 纯SVG，轻量 | Canvas渲染，略重 |

### 3.3 为何分离两个系统

1. **视觉风格差异** —— 图案封面过于花哨，不适合阅读器书库
2. **功能需求不同** —— 分享卡需要导出高清图，书库封面需要秒开
3. **维护成本** —— 分离后各自迭代，互不干扰

---

## 4. 亮度检测系统

### 4.1 设计动机

base64 封面来自用户上传或书籍提取，背景色不可预测。为了让书脊效果在所有封面上都可见，需要**检测封面明暗**并自适应调整书脊颜色。

### 4.2 检测算法

```javascript
async function detectCoverBrightness(coverUrl) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // 50x50 缩略图采样
    canvas.width = 50;
    canvas.height = 50;
    
    // 绘制并提取像素
    ctx.drawImage(img, 0, 0, 50, 50);
    const imageData = ctx.getImageData(0, 0, 50, 50);
    
    // 每4像素采样1个，计算平均亮度
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 16) {
        const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
        totalBrightness += brightness;
    }
    
    // 阈值128（0-255中点）
    return avgBrightness < 128 ? 'dark' : 'light';
}
```

### 4.3 检测时机

```
┌─────────────────────────────────────────────────────────┐
│                    亮度检测流程                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. EPUB/PDF/DOCX 导入                                   │
│     └── 解析器提取封面 → 异步检测 → 存入 metadata        │
│                                                          │
│  2. 用户上传封面                                         │
│     └── saveCover() → 异步检测 → 存入 metadata           │
│                                                          │
│  3. 删除封面                                             │
│     └── deleteCover() → brightness 设为 null             │
│                                                          │
│  4. 渲染时                                               │
│     └── 读取 metadata.coverBrightness → 同步渲染         │
│         （无数据默认暗色兜底）                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 4.4 元数据存储

```javascript
// 存储结构
metadata: {
    title: "书名",
    author: "作者",
    coverBrightness: "dark" | "light" | null,  // 新增字段
    // ... 其他字段
}
```

**默认值策略**：
- `dark` → 白色书脊（高可见性）
- `light` → 黑色书脊（柔和阴影）
- `null` → 默认暗色（白色书脊，适合大多数封面）

---

## 5. 封面包装系统（wrapCover）

### 5.1 系统定位

`wrapCover` 用于将**已有的 base64 封面图片**包装为带纹理和书脊效果的 SVG。

**使用场景**：
- EPUB/PDF/DOCX 中提取的封面图
- 用户上传的自定义封面
- 网络下载的封面资源

### 5.2 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    wrapCover 渲染层                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  输入：base64 图片 + brightness（可选）                   │
│                      ↓                                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │  SVG 结构（从下到上）                             │  │
│  │  1. <image> - base64 封面图（铺满）               │  │
│  │  2. <rect>  - 噪点纹理层（overlay/multiply）      │  │
│  │  3. <rect>  - 书脊渐变层（左边缘12px）            │  │
│  └──────────────────────────────────────────────────┘  │
│                      ↓                                   │
│  输出：完整 SVG 字符串                                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 5.3 与 generate() 的书脊一致性

`wrapCover` 的书脊渲染逻辑与 `generate()` 生成的纯文字封面**完全一致**：

| 封面亮度 | 书脊颜色 | 混合模式 | 噪点滤镜 |
|----------|----------|----------|----------|
| dark | 白色系 | overlay | 白色噪点 |
| light | 黑色系 | multiply | 灰色噪点 |

```javascript
// 书脊渐变参数（与 renderSVG 一致）
const spineStops = isDark ? [
    { offset: '0%', color: 'rgba(255,255,255,0.90)' },
    { offset: '2%', color: 'rgba(255,255,255,0.90)' },
    { offset: '5%', color: 'rgba(255,255,255,0.12)' },
    { offset: '25%', color: 'rgba(255,255,255,0.55)' },
    { offset: '45%', color: 'rgba(255,255,255,0.50)' },
    { offset: '65%', color: 'rgba(255,255,255,0.20)' },
    { offset: '85%', color: 'rgba(255,255,255,0.06)' },
    { offset: '100%', color: 'rgba(255,255,255,0)' }
] : [
    // 亮色封面使用更柔和的阴影
    { offset: '0%', color: 'rgba(0,0,0,0.30)' },
    { offset: '2%', color: 'rgba(0,0,0,0.05)' },
    { offset: '5%', color: 'rgba(0,0,0,0.06)' },
    // ...
];
```

### 5.4 同步渲染设计

**关键决策**：`wrapCover` 设计为**同步函数**。

```javascript
// 同步渲染，不阻塞 UI
function wrapCover(coverUrl, options) {
    const isDark = options.brightness !== 'light';  // 默认暗色兜底
    // ... 直接返回 SVG 字符串
}
```

**原因**：
1. 亮度检测已在导入/保存时完成
2. 渲染时只需读取 `metadata.coverBrightness`
3. 书库列表渲染多张封面，同步避免回调地狱

---

## 6. 配置与开关

### 6.1 hashCover 设置

```javascript
// 设置位置：Lumina.State.settings.hashCover
// 默认值：true

Lumina.ConfigManager.set('reader.hashCover', true);
```

### 6.2 开关行为矩阵

| hashCover | 有 base64 封面 | 无封面 | 删除封面后 |
|-----------|---------------|--------|-----------|
| **开启** | `wrapCover` 包装（纹理+书脊） | `generate()` 生成 | 自动 `generate()` |
| **关闭** | 原图 `<img>` 显示 | 占位符图标 | 占位符图标 |

### 6.3 渲染优先级

```
1. 文件有 cover 且 hashCover 开启
   └── wrapCover(cover, { brightness })

2. 文件有 cover 但 hashCover 关闭
   └── <img src="cover">

3. 文件无 cover 且 hashCover 开启
   └── generate(title, author)

4. 文件无 cover 且 hashCover 关闭
   └── 占位符图标
```

---

## 7. 扩展指南

### 7.1 添加新色板

```javascript
// bibliomorph-cover.js
COLOR_THEMES.push({
    id: 'new_theme',
    baseHue: 180,      // 基础色相
    hueVar: 15,        // 色相变化范围
    sat: [20, 40],     // 饱和度范围
    light: [30, 50]    // 亮度范围（决定白字/黑字）
});
```

**设计原则**：
- 深色系：`light: [12, 32]`，配白字
- 中色系：`light: [38, 58]`，根据具体颜色选择
- 浅色系：`light: [62, 85]`，配黑字

### 7.2 修改书脊效果

书脊渲染逻辑有两处，必须保持一致：

```javascript
// 1. renderSVG() - 纯文字封面
// 位于 generate() → renderSVG() 中

// 2. wrapCover() - base64封面包装
// 独立函数，但使用相同的 spineStops 定义
```

### 7.3 添加新排版模式

```javascript
// 在 analyzeText() 中添加新规则
if (isPoemFormat(text)) {
    return { mode: 'poem-vertical', ... };
}
```

### 7.4 调试技巧

```javascript
// 强制指定色板
Lumina.BibliomorphCover.generate('测试', '作者', {
    forceTheme: 'midnight'  // 强制使用深色系
});

// 查看当前亮度检测
console.log(file.metadata.coverBrightness);

// 测试不同亮度的书脊效果
Lumina.BibliomorphCover.wrapCover(cover, { brightness: 'dark' });
Lumina.BibliomorphCover.wrapCover(cover, { brightness: 'light' });
```

---

## 8. 故障排查

### 8.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 书脊颜色不正确 | brightness 未检测或丢失 | 检查 metadata.coverBrightness 是否存在 |
| base64 封面无书脊 | hashCover 开关关闭 | 开启开关或检查设置 |
| 封面闪烁/重绘 | 异步检测阻塞渲染 | 确保 detectCoverBrightness 在导入时完成 |
| 亮色封面书脊太淡 | 亮色书脊参数不合适 | 调整 light 模式下的 spineStops 透明度 |
| 噪点纹理不明显 | mix-blend-mode 不支持 | 检查浏览器兼容性 |

### 8.2 亮度检测失败排查

```javascript
// 检测流程验证
async function debugBrightness(coverUrl) {
    try {
        const brightness = await Lumina.BibliomorphCover.detectCoverBrightness(coverUrl);
        console.log('检测结果:', brightness);
        
        // 验证 canvas 是否成功
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        // ... 调试图像加载
    } catch (e) {
        console.error('检测失败:', e);
    }
}
```

### 8.3 性能优化

**书库列表渲染大量封面时**：

```javascript
// ✅ 好的做法：同步渲染，避免 async/await
renderCard(file) {
    if (file.cover && hashCover) {
        // 直接渲染，不等待
        const svg = Lumina.BibliomorphCover.wrapCover(file.cover, {
            brightness: file.metadata?.coverBrightness
        });
        return svg;
    }
}

// ❌ 坏的做法：在渲染路径上做异步检测
renderCard(file) {
    const brightness = await detectCoverBrightness(file.cover);  // 阻塞！
}
```

---

## 附录：API 速查

### BibliomorphCover

```javascript
// 生成纯文字封面
BibliomorphCover.generate(title, author, options)

// 包装 base64 封面（同步）
BibliomorphCover.wrapCover(coverUrl, { brightness })

// 检测亮度（异步）
BibliomorphCover.detectCoverBrightness(coverUrl)

// 工具函数
BibliomorphCover.utils.djb2(str)
BibliomorphCover.utils.COLOR_THEMES
```

### 元数据字段

```javascript
metadata: {
    title: string,
    author: string,
    coverBrightness: 'dark' | 'light' | null,  // v3.0 新增
    // ... 其他字段
}
```

### 设置项

```javascript
Lumina.State.settings.hashCover  // boolean，控制封面系统开关
```

---

**文档结束**

*本文档应随 Bibliomorph Cover System 迭代更新。最后更新：2026-04-10*
