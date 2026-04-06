# Lumina 封面与书签生成系统架构文档

> **版本**: v2.0  
> **日期**: 2026-04-06  
> **作者**: Kimi Code CLI  
> **适用范围**: 流萤阅读器 (Lumina Reader) 封面生成与分享卡片系统

---

## 目录

1. [架构概览](#1-架构概览)
2. [核心机制详解](#2-核心机制详解)
3. [双轨渲染系统](#3-双轨渲染系统)
4. [图案系统](#4-图案系统)
5. [版式系统](#5-版式系统)
6. [扩展指南](#6-扩展指南)
7. [最佳实践](#7-最佳实践)
8. [故障排查](#8-故障排查)

---

## 1. 架构概览

### 1.1 系统定位

Lumina 封面与书签生成系统是一个**跨平台视觉生成引擎**，核心设计理念是：

> **"一次编写，两处运行"** —— 同一套算法逻辑同时支持 Web 预览和原生 App 导出。

### 1.2 文件结构

```
app/www/js/modules/
├── cover-generator.js    # 封面生成核心 (50图案 + SVGRenderer)
└── share-card.js         # 分享卡片 (3种版式 + 双轨渲染)

demo/
└── coverStudioV2.3.html  # 图案设计工作室 (原型/调试工具)
```

### 1.3 核心依赖关系

```
share-card.js
    ├── 复用 CoverCore (种子/图案/调色板)
    ├── 复用 PatternDrawers (50个图案渲染器)
    └── 依赖 SVGRenderer (Canvas→SVG适配器)
```

---

## 2. 核心机制详解

### 2.1 种子驱动的确定性随机

系统所有随机性都来自**单一整数种子**，确保同一本书始终生成相同的视觉风格。

```javascript
// djb2 哈希算法 - 核心中的核心
djb2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return hash >>> 0; // 转为无符号32位整数
}

// 从种子提取参数
extractParams(seed, count) {
    const params = [];
    let current = seed;
    for (let i = 0; i < count; i++) {
        current = this.djb2(current.toString());
        params.push(current / 0xFFFFFFFF); // 归一化到 0-1
    }
    return params;
}
```

**关键特性**:
- 相同的 `bookId` → 相同的 `seed` → 相同的图案和颜色
- 支持 40 个独立随机参数，满足复杂图案需求
- 完全可重现，便于缓存和测试

### 2.2 SVGRenderer - Canvas API 到 SVG 的桥梁

这是系统最精巧的设计之一。**PatternDrawers** 使用原生 Canvas 2D API 编写，但通过 `SVGRenderer` 可以同时输出 SVG。

#### 工作原理

```javascript
class SVGRenderer {
    // 模拟 Canvas 2D Context 的 API
    moveTo(x, y)     // → 转换坐标系 → 生成 SVG path 命令
    lineTo(x, y)     // → 同上
    arc(x, y, r...)  // → 计算椭圆弧 → SVG arc 命令
    fill()           // → 包装为 <path fill="..."/>
    stroke()         // → 包装为 <path stroke="..."/>
    
    // 状态管理 (模拟 Canvas 的 save/restore)
    save()           // 压栈
    restore()        // 弹栈
    
    // 矩阵变换支持
    transform(a,b,c,d,e,f)  // 3×3 矩阵乘法
}
```

#### 使用模式

```javascript
// 同一套代码，两种输出
function drawPattern(renderer, w, h, params) {
    renderer.beginPath();
    renderer.moveTo(0, 0);
    renderer.lineTo(w, h);
    renderer.stroke();
}

// 输出 Canvas
const ctx = canvas.getContext('2d');
drawPattern(ctx, 600, 800, params);

// 输出 SVG
const renderer = new SVGRenderer(600, 800);
drawPattern(renderer, 600, 800, params);
const svgString = renderer.getSVG();
```

**设计优势**:
1. **单一数据源** - 图案代码只写一次
2. **Canvas 调试** - 使用 HTML Demo 实时调试图案
3. **SVG 输出** - 矢量无损，支持动画和交互
4. **原生性能** - 导出时使用真 Canvas，性能最佳

### 2.3 调色板系统

```javascript
generatePalette(seed, mode = 'vibrant') {
    const params = this.extractParams(seed, 5);
    const baseHue = params[0] * 360;
    
    return {
        bg: hslToHex(baseHue, 20 + params[1]*20, 85 + params[2]*10),
        accent: hslToHex(baseHue, 70 + params[3]*20, 45 + params[4]*15),
        pattern: hslToHex(baseHue, 30, 95)
    };
}
```

**配色模式**:
- `vibrant` - 高饱和度，适合封面
- `soft` - 低饱和度，适合阅读背景
- `dark` - 深色模式

---

## 3. 双轨渲染系统

### 3.1 架构设计

Share Card 采用**双轨渲染**架构，平衡预览体验与导出质量：

| 场景 | 技术 | 特点 |
|------|------|------|
| **实时预览** | SVG | 矢量缩放、继承 CSS 字体、60fps 动画 |
| **导出分享** | Canvas HD | 3-4x 超采样、系统字体兜底、跨平台兼容 |

### 3.2 尺寸体系

```javascript
EXPORT_CONFIG: {
    baseWidth: 600,    // 逻辑宽度 (类似设计稿基准)
    minScale: 3,       // 至少 3x (1800px)
    maxScale: 4,       // 最高 4x (2400px)
    quality: 0.95      // PNG 压缩质量
}

// 版式比例
短版式 (short)   → 1:1    → 600×600 逻辑 → 1800×1800 实际
中版式 (medium)  → 3:4    → 600×798 逻辑 → 1800×2394 实际  
长版式 (long)    → 2:3    → 600×900 逻辑 → 1800×2700 实际
```

### 3.3 渲染管线

```
┌─────────────────────────────────────────────────────────────┐
│                    Share Card 渲染管线                        │
├─────────────────────────────────────────────────────────────┤
│  1. 生成阶段                                                  │
│     ├── 计算 seed (从 bookId)                                 │
│     ├── 选择 patternId (循环使用 50 种图案)                    │
│     └── 生成调色板 (bg/accent/pattern)                        │
├─────────────────────────────────────────────────────────────┤
│  2. 预览轨道 (SVG)                                           │
│     ├── 使用 SVGRenderer 绘制图案                            │
│     ├── 拼接 SVG 字符串 (卡片 + 文字)                         │
│     └── 注入 DOM (支持 CSS 动画)                             │
├─────────────────────────────────────────────────────────────┤
│  3. 导出轨道 (Canvas HD)                                     │
│     ├── 创建高分辨率 Canvas (width × dpr)                    │
│     ├── ctx.scale(dpr, dpr) 设置逻辑坐标系                   │
│     ├── 使用 PatternDrawers 绘制图案 (真 Canvas)             │
│     ├── 绘制版式元素 (卡片/文字/装饰线)                       │
│     └── 导出 (Web: 下载+剪贴板 / App: 分享)                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 关键实现细节

#### 字体一致性处理

```javascript
// Canvas 无法直接使用 CSS 加载的自定义字体
getCanvasFontStack() {
    const readerFont = this.currentFont || '';
    // 提取字体族名，添加系统字体回退
    return `${readerFont}, "PingFang SC", "Hiragino Sans GB", sans-serif`;
}

// 测量与渲染必须使用同一字体栈
ctx.font = `${fontSize}px ${fontStack}`;
const lines = this.measureText(text, maxWidth, fontSize, fontStack);
```

#### 文本截断策略

```javascript
// 两阶段截断 (与 SVG 完全一致)

// 阶段 1: 按行数填充 (不考虑段落间距)
for (每个段落) {
    if (能放下) {
        lines.push(...paragraphLines);
        paragraphBreaks.push(lines.length); // 标记段落边界
    } else {
        // 部分截断，添加省略号
        lines.push(...partial);
        lines[last] += '……';
        break;
    }
}

// 阶段 2: 保底检查 (考虑段落间距)
const paraExtraH = paragraphBreaks.length * lineHeight * 0.5;
const totalH = lines.length * lineHeight + paraExtraH;
if (totalH > maxH) {
    // 二次截断，保留完整段落
    lines = lines.slice(0, adjustedMaxLines);
    paragraphBreaks = paragraphBreaks.filter(pos => pos < adjustedMaxLines);
    lines[last] += '……';
}
```

---

## 4. 图案系统

### 4.1 PatternDrawers 架构

50 种图案统一接口：

```javascript
PatternDrawers: {
    lines(ctx, w, h, params, intensity) {
        // params[0-9] 是归一化随机数
        const lineCount = 5 + Math.floor(params[0] * 15);
        const angle = params[1] * Math.PI;
        // ... 绘制代码
    },
    
    waves(ctx, w, h, params, intensity) {
        // 使用 params[2], params[3]...
    },
    
    // ... 共 50 个
}
```

### 4.2 图案参数约定

每个图案接收 40 个归一化参数 (`0-1`)，按功能分区：

```
params[0-4]   → 基础几何 (数量、角度、半径等)
params[5-9]   → 位置分布
params[10-19] → 次级元素 (如小圆点、交叉线)
params[20-29] → 随机扰动 (让图案更自然)
params[30-39] → 预留扩展
```

### 4.3 图案设计最佳实践

**调试流程**:

1. 在 `demo/coverStudioV2.3.html` 中开发新图案
2. 使用滑块调整参数，观察视觉效果
3. 确定参数范围后，提取为 PatternDrawer
4. 测试不同种子下的表现 (避免某些种子下图案难看)

**设计原则**:

```javascript
// ✅ 好的图案：使用所有 params，避免规律性
const count = 3 + Math.floor(params[0] * 8);  // 3-10 个元素
const rotation = params[1] * Math.PI * 2;      // 0-360度随机

// ❌ 坏的图案：固定值，导致重复
const count = 5;  // 太死板
const rotation = 0; // 无变化
```

---

## 5. 版式系统

### 5.1 三种版式对比

| 版式 | 比例 | 适用场景 | 特点 |
|------|------|----------|------|
| **short** | 1:1 | 金句/短句 | 居中对齐，引号装饰，卡片遮罩 |
| **medium** | 3:4 | 中篇摘录 | 上下分栏，上半图案，下半文字 |
| **long** | 2:3 | 长段落 | 顶部 30% 图案，底部 70% 文字 |

### 5.2 版式布局坐标系

所有版式使用**相对坐标**（基于宽度百分比），确保缩放一致性：

```javascript
const padding = Math.floor(w * 0.08);    // 8% 边距
const fontSize = Math.floor(w * 0.045);  // 4.5% 字高
const lineHeight = Math.floor(fontSize * 1.6); // 1.6倍行距
```

### 5.3 新增版式指南

假设要新增 `square` (方形海报) 版式：

**步骤 1: 在 share-card.js 中添加 SVG 渲染器**

```javascript
renderSquare(w, h, palette, seed) {
    let svg = this.renderPatternFull(w, h, palette, seed, 1.0);
    
    // 版式特定布局
    const padding = Math.floor(w * 0.06);
    const fontSize = Math.max(18, Math.floor(w * 0.04));
    
    // ... 布局计算 ...
    
    return svg;
}
```

**步骤 2: 添加 Canvas 渲染器**

```javascript
renderSquareToCanvas(ctx, w, h, data) {
    const { paragraphs, bookInfo, palette } = data;
    const fontStack = this.getCanvasFontStack();
    
    // 1. 绘制背景图案
    this.renderPatternArea(ctx, 0, 0, w, h, palette, this.currentSeed, 1.0);
    
    // 2. 绘制版式元素 (与 SVG 逐行对照)
    // ...
}
```

**步骤 3: 注册到主渲染器**

```javascript
// 在 generateCard() 中
case 'square': svg += this.renderSquare(w, h, palette, seed); break;

// 在 saveCardHD() 中
case 'square': this.renderSquareToCanvas(ctx, baseWidth, height, renderData); break;
```

**步骤 4: 添加切换逻辑**

```javascript
// 在 switchLayout() 中确保能循环到新版型
```

---

## 6. 扩展指南

### 6.1 添加新图案

**场景**: 设计了一个新图案 "星空" (starry)

```javascript
// cover-generator.js → PatternDrawers
starry(ctx, w, h, params, intensity) {
    const starCount = 50 + Math.floor(params[0] * 200);
    const baseSize = Math.max(2, w * 0.002);
    
    ctx.fillStyle = '#fff';
    for (let i = 0; i < starCount; i++) {
        const x = params[i * 2 % 40] * w;
        const y = params[(i * 2 + 1) % 40] * h;
        const r = baseSize * (0.5 + params[(i + 20) % 40]);
        
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 注册到 PATTERNS 数组
PATTERNS.push({ id: 50, code: 'starry', name: '星空' });
```

**测试要点**:
1. 不同种子下星星分布是否自然
2. 在深色/浅色背景下是否都可见
3. 导出为 Canvas 时性能是否可接受

### 6.2 修改调色板

```javascript
// 添加新配色方案
generatePalette(seed, mode = 'vibrant') {
    const params = this.extractParams(seed, 5);
    const baseHue = params[0] * 360;
    
    switch(mode) {
        case 'newMode':
            return {
                bg: hslToHex(baseHue, 10, 95),      // 更淡背景
                accent: hslToHex(baseHue + 180, 80, 50), // 互补色强调
                pattern: hslToHex(baseHue, 20, 90)
            };
        // ...
    }
}
```

### 6.3 国际化扩展

所有文本使用 `Lumina.I18n.t()` 包裹：

```javascript
const t = Lumina.I18n.t;
ctx.fillText(t('fromLuminaReader'), x, y);
```

---

## 7. 最佳实践

### 7.1 开发新功能清单

- [ ] 是否同时更新 SVG 和 Canvas 两个渲染器？
- [ ] 是否测试了不同字体下的文本截断？
- [ ] 是否测试了极端长文本的表现？
- [ ] 是否在不同 DPR 设备上测试导出质量？
- [ ] 是否添加了对应的国际化键？

### 7.2 性能优化

```javascript
// ✅ 好的做法：复用 Canvas 测量
measureText(text, maxWidth, fontSize, fontStack) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize}px ${fontStack}`;
    // 一次性测量所有字符
}

// ❌ 坏的做法：每次都创建新 Canvas
for (每个字符) {
    const canvas = document.createElement('canvas'); // 内存泄漏！
}
```

### 7.3 调试技巧

**查看当前生成的参数**:
```javascript
// 浏览器控制台
Lumina.ShareCard.currentSeed       // 当前种子
Lumina.ShareCard.currentPatternId  // 当前图案ID
Lumina.ShareCard.currentPalette    // 当前调色板
```

**强制指定图案**:
```javascript
Lumina.ShareCard.currentPatternId = 25; // 使用第25个图案
Lumina.ShareCard.refresh();             // 刷新
```

---

## 8. 故障排查

### 8.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| SVG 和 Canvas 文字行数不同 | 字体测量差异 | 确保使用相同 `fontStack` 测量和渲染 |
| 图案在 Canvas 中偏移 | `renderPatternArea` clip 区域错误 | 检查 clip 坐标是否与 fillRect 一致 |
| 导出图片模糊 | DPR 计算错误 | 检查 `ctx.scale(dpr, dpr)` 是否调用 |
| 某些种子下图案难看 | 参数范围未限制 | 使用 `Math.max/min` 约束随机值 |

### 8.2 设计哲学

> **"确定性美学"**
> 
> 系统的核心不是"随机"，而是"确定性"。同一本书永远得到相同的封面，
> 这种可预测性本身就是一种设计承诺。

> **"双轨一致"**
> 
> 预览和导出的差异应该只在于分辨率和文件格式，而不在于视觉内容。
> 任何不一致都是 Bug。

---

## 附录：核心 API 速查

### CoverCore

```javascript
CoverCore.djb2(str)                    // 哈希算法
CoverCore.extractParams(seed, count)   // 提取随机参数
CoverCore.generatePalette(seed, mode)  // 生成调色板
CoverCore.PATTERNS[0].code             // 获取图案代码
CoverCore.PatternDrawers.lines(...)    // 绘制图案
```

### SVGRenderer

```javascript
const renderer = new SVGRenderer(w, h);
// 使用 Canvas API...
const svgString = renderer.getSVG(bgColor, isStandalone);
```

### ShareCard

```javascript
ShareCard.open(selection, bookInfo)    // 打开分享卡片
ShareCard.switchLayout()               // 切换版式 (左滑)
ShareCard.onSave()                     // 保存 (右滑)
ShareCard.saveCardHD()                 // Canvas 高清导出
```

---

**文档结束**

*本文档应随代码迭代更新。最后更新：2026-04-06*
