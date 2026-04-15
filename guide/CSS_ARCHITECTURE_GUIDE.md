# Lumina Reader 样式架构与维护指南

> 版本：v1.0  
> 日期：2026-04-15  
> 适用范围：`app/www/css/` 全目录  
> 关键变更：`main.css` 从 5746 行单体拆分为 9 个语义化文件，彻底移除兜底文件

---

## 目录

1. [重构背景：为什么要拆分 `main.css`](#1-重构背景为什么要拆分-maincss)
2. [新架构总览](#2-新架构总览)
3. [九文件职责与加载顺序](#3-九文件职责与加载顺序)
4. [主题系统设计原理](#4-主题系统设计原理)
5. [新增样式的标准流程](#5-新增样式的标准流程)
6. [后续最佳实践](#6-后续最佳实践)
7. [常见陷阱与反模式](#7-常见陷阱与反模式)
8. [未来可做的优化方向](#8-未来可做的优化方向)
9. [附录：速查表](#9-附录速查表)

---

## 1. 重构背景：为什么要拆分 `main.css`

### 1.1 单体 CSS 的「心智负担」

重构前，`main.css` 高达 **5746 行**，包含：
- 37 个完整主题配色方案
- 60+ 个 `@media` 响应式断点
- 阅读器排版、书库卡片、设置面板、弹窗、动画、TTS 高亮等全部杂糅

其后果是：

| 场景 | 重构前成本 | 风险 |
|------|-----------|------|
| 改一个按钮圆角 | 在 5000+ 行里搜索 `.btn` 和 `.option-btn`，容易改漏 | UI 不一致 |
| 新增一个面板 | 不敢确定该插在哪一行，通常扔到文件末尾 | 选择器优先级失控 |
| 调整移动端书库布局 | `@media` 分散在 20+ 处，需全文搜索 `768px` | 样式回退、覆盖链断裂 |
| 新增/修改主题色 | 在 2000 行配色代码中定位变量，极易漏改深色/浅色对应值 | 主题切换后出现「刺眼」或「看不清」问题 |
| 排查样式冲突 | 无法快速判断某条规则属于「组件层」还是「面板层」 | 调试时间指数级增长 |

### 1.2 拆分决策

- **不引入 Sass/Less/PostCSS**：项目坚持零构建工具，保持纯 CSS + `<link>` 标签加载
- **不按组件做原子化拆分**（如 BEM 拆成几百个文件）：Vanilla JS 项目没有组件编译系统，过度拆分会导致 `index.html` 变成 `<link>` 清单灾难
- **按「功能域」物理拆分**：变量、重置、主题、布局、组件、阅读器、面板、动画、响应式——刚好 9 个文件，界限清晰

---

## 2. 新架构总览

```
app/www/css/
├── variables.css      ← 全局 CSS 变量（颜色、字体、尺寸、阴影）
├── reset.css          ← 浏览器重置 + H5 优化
├── themes.css         ← 37 套 [data-theme] 配色方案
├── layout.css         ← 页面骨架：sidebar、toolbar、欢迎页、主容器
├── components.css     ← 原子组件：按钮、输入框、滑块、开关、弹窗、图标、骨架屏
├── reader.css         ← 阅读器核心：doc-line、drop-cap、分页导航、目录、批注高亮
├── panels.css         ← 所有面板：设置、书库、关于、搜索、数据管理、更新、字体管理
├── animations.css     ← @keyframes 动画定义
├── responsive.css     ← 所有 @media 查询集中管理
└── main.legacy.css    ← 原始 5746 行完整备份（只读，不加载）
```

**`index.html` 加载顺序（严格不可颠倒）：**

```html
<link rel="stylesheet" href="./css/variables.css">
<link rel="stylesheet" href="./css/reset.css">
<link rel="stylesheet" href="./css/themes.css">
<link rel="stylesheet" href="./css/layout.css">
<link rel="stylesheet" href="./css/components.css">
<link rel="stylesheet" href="./css/reader.css">
<link rel="stylesheet" href="./css/panels.css">
<link rel="stylesheet" href="./css/animations.css">
<link rel="stylesheet" href="./css/responsive.css">
```

---

## 3. 九文件职责与加载顺序

### 3.1 为什么要严格排序？

CSS 是**层叠**的。后面的文件可以覆盖前面的文件，但不应反过来依赖。我们的顺序遵循：

```
地基（变量、重置） → 涂装（主题） → 结构（布局） → 家具（组件） → 房间（阅读器、面板） → 特效（动画） → 适配（响应式）
```

| 文件 | 行数 | 职责 | 覆盖关系 |
|------|------|------|----------|
| `variables.css` | 71 | `:root` 全局变量定义 | 最先加载，被所有人引用 |
| `reset.css` | 43 | `* { margin... }`、`-webkit-tap-highlight` 等 | 在变量之后，确保重置也能用变量 |
| `themes.css` | 493 | 37 个 `[data-theme="xxx"]` 块，覆盖变量实际值 | 覆盖 `variables.css` 的默认值 |
| `layout.css` | 500 | `#app`、`.sidebar`、`.toolbar`、`.content-wrapper`、`.welcome-screen` | 定义页面骨架 |
| `components.css` | 640 | `.btn-icon`、`.option-btn`、`.dialog`、`.slider`、`.skeleton` | 定义跨页面复用的原子 UI |
| `reader.css` | 820 | `.doc-line`、`.drop-cap`、`.page-nav`、`.toc-item`、`.annotation-highlight` | 只关心中央阅读区 |
| `panels.css` | 1735 | `.settings-content`、`.history-list`、`.search-tabs`、`.data-card`、`.lib-batch-header` | 只关心各类弹层面板 |
| `animations.css` | 123 | `@keyframes fadeIn`、`@keyframes pulseGlow` 等 | 被前面文件通过 `animation` 引用 |
| `responsive.css` | 334 | **所有** `@media (max-width: 768px)` 等 | 最后加载，对前面所有规则做覆盖 |

### 3.2 关键设计决策

**① 所有 `@media` 放在 `responsive.css`**

以前 `768px` 的媒体查询散落在 `main.css` 的各个角落。现在无论你要改「移动端书库卡片」还是「移动端目录宽度」，都只看 `responsive.css` 一处。

**② `reader.css` 与 `panels.css` 完全分离**

阅读器和面板是两个最复杂的视觉域。分离后：
- 改阅读排版（行高、段间距、首字下沉）不会误触设置面板样式
- 改设置面板滑动操作不会影响到 `.doc-line`

**③ `themes.css` 只干一件事：赋值变量**

每个主题块内部**不允许出现非变量规则**。例如：

```css
/* ✅ 正确 */
[data-theme="dark"] {
    --bg-primary: #1a1a1a;
    --text-primary: #e8e8e8;
}

/* ❌ 错误（这会导致主题文件再次膨胀） */
[data-theme="dark"] .sidebar {
    background: #1a1a1a;
}
```

如果某个主题需要对特定组件做微调，应通过增加一个 CSS 变量（如 `--sidebar-bg-override`）来实现，而不是直接写组件选择器。

---

## 4. 主题系统设计原理

### 4.1 三层变量模型

当前主题系统采用「地基变量 + 主题覆盖 + 组件消费」的三层模型：

```css
/* variables.css：定义语义变量名和兜底值 */
:root {
    --bg-primary: #ffffff;
    --text-primary: #333333;
    --accent-color: #4a90e2;
    --radius-md: 8px;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.1);
}

/* themes.css：根据 data-theme 覆盖实际值 */
[data-theme="dark"] {
    --bg-primary: #1a1a1a;
    --text-primary: #e8e8e8;
}

/* components.css / panels.css：只消费变量 */
.option-btn {
    background: var(--bg-primary);
    color: var(--text-primary);
    border-radius: var(--radius-md);
}
```

### 4.2 动态字体变量

项目中存在一个特殊的变量链：

```css
:root {
    --font-family-dynamic: "Noto Serif SC", serif;
}
```

用户可以在设置中切换字体。`components.css` 和 `reader.css` 中所有涉及用户可读文本的地方都应使用 `var(--font-family-dynamic)`，而非硬编码字体。

**已统一迁移的示例：**

```css
input::placeholder,
textarea::placeholder {
    font-family: var(--font-family-dynamic);
}
```

---

## 5. 新增样式的标准流程

当你需要为某个新功能（比如新增一个「阅读统计面板」）写 CSS 时，请遵循以下决策树：

### 5.1 该写进哪个文件？

```
是否是新的 CSS 变量（颜色、尺寸、阴影）？
    → 是 → variables.css

是否是新的主题配色差异？
    → 是 → themes.css（只改变量值）

是否是全局重置或 H5 适配？
    → 是 → reset.css

是否是页面整体布局（sidebar、toolbar、主容器）？
    → 是 → layout.css

是否是可复用的小组件（按钮、输入框、滑块、开关、弹窗、Toast）？
    → 是 → components.css

是否只在中央阅读区生效（文档行、分页、目录、批注、书签、TTS 高亮）？
    → 是 → reader.css

是否只在各类面板/弹层中生效（设置、书库、搜索、关于、数据管理、更新）？
    → 是 → panels.css

是否是新的 @keyframes？
    → 是 → animations.css

是否是移动端/平板适配或断点覆盖？
    → 是 → responsive.css
```

### 5.2 新增面板样式的标准模板

假设新增一个 `statsPanel`，请在 `panels.css` 中按以下格式书写：

```css
/* ==================== 阅读统计面板 ==================== */
#statsPanel .panel-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
}

.stats-chart {
    height: 120px;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
}

.stats-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--border-color);
}
```

**注意：**
- 使用 `#statsPanel` 作为前缀限定作用域，防止类名泄漏
- 颜色、圆角、间距全部使用变量
- 不同面板之间用 `/* ==================== ... ==================== */` 分隔

---

## 6. 后续最佳实践

### 6.1 永远不要重新创建 `main.css`

`main.css` 作为 5746 行的历史包袱已被彻底移除。**禁止**因为「不知道放哪」或「懒得拆」而把新样式写进一个兜底文件。如果某条样式确实跨越多个模块，请优先思考：
- 是否可以通过增加一个 CSS 变量来解决？
- 是否可以通过给 HTML 增加一个更具体的类名来解决？

### 6.2 颜色必须用变量

**禁止**在 `layout.css`、`components.css`、`reader.css`、`panels.css` 中写裸色值：

```css
/* ❌ 错误 */
.warning-text {
    color: #ff4444;
}

/* ✅ 正确 */
.warning-text {
    color: var(--warnning);  /* 项目现有变量名 */
}
```

如果确实需要一个主题无关的纯技术色（如半透明遮罩 `rgba(0,0,0,0.5)`），请在代码注释中说明原因。

### 6.3 响应式修改只在 `responsive.css` 中进行

**禁止**在其他文件中写 `@media`：

```css
/* ❌ 错误（出现在 panels.css 中） */
@media (max-width: 768px) {
    .history-list {
        padding: 10px;
    }
}
```

这样会导致响应式规则再次碎片化。如果某个组件在移动端差异很大，应在 `responsive.css` 中集中覆盖：

```css
/* ✅ 正确（出现在 responsive.css 中） */
@media (max-width: 768px) {
    .history-list {
        padding: 10px;
    }
}
```

### 6.4 避免深层选择器

Vanilla JS 项目没有 Shadow DOM，CSS 选择器越长越容易受到 HTML 结构变动的影响。

```css
/* ❌ 避免 */
#settingsPanel .settings-body .option-group .option-row .option-label {
    font-size: 14px;
}

/* ✅ 推荐 */
.settings-option-label {
    font-size: 14px;
}
```

### 6.5 优先使用类名，慎用 ID 选择器

ID 选择器权重过高（`1-0-0`），一旦使用，后续很难用类名覆盖。我们的约定是：
- ID 仅用于**面板根节点**（如 `#settingsPanel`）做作用域限定
- 面板内部所有样式尽量使用类名

```css
/* ✅ 可接受：用 ID 限定面板作用域 */
#settingsPanel .option-btn { }

/* ❌ 避免：ID 嵌套过深 */
#settingsPanel #fontSizeRow #fontSizeValue { }
```

---

## 7. 常见陷阱与反模式

### 7.1 陷阱：修改 `themes.css` 时误删主题分隔线

`themes.css` 中每个主题块之间有空行分隔。删除时务必确保选择器完整：

```css
/* 修改前请确认你选中的是整个 [data-theme] 块 */
[data-theme="dark"] { ... }

[data-theme="light"] { ... }
```

### 7.2 反模式：在 `reader.css` 中写面板样式

阅读器和面板的 HTML 结构偶尔会有同名类（如 `.content`）。 refactoring 后发现 `reader.css` 里有一条 `.search-content` 的规则，这就是典型的「跨界污染」。

**排查方法：** 如果改完某个面板样式后阅读区出现了异常，检查是否把规则写错了文件。

### 7.3 陷阱：在 `index.html` 中颠倒 CSS 加载顺序

比如把 `responsive.css` 放到 `layout.css` 之前，会导致移动端断点无法正确覆盖桌面端规则。加载顺序是唯一且固定的，新增文件时必须插入到正确的位置。

### 7.4 反模式：硬编码 `border-radius` 和 `box-shadow`

当前代码中仍有少量 `border-radius: 12px` 或 `box-shadow: 0 4px 12px rgba(0,0,0,0.15)` 的硬编码。虽然不影响功能，但会导致未来做「全局圆角风格升级」时需要全文替换。

**推荐：** 逐步把这些值收敛到 `variables.css`：

```css
:root {
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --shadow-dropdown: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

---

## 8. 未来可做的优化方向

### 8.1 变量体系进一步收敛（优先级：中）

当前仍有部分硬编码尺寸和阴影散落在各文件中。建议新增一批语义化变量：

```css
:root {
    /* 间距体系 */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;

    /* 圆角体系 */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-full: 9999px;

    /* 阴影体系 */
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.12);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.16);
}
```

完成后，`components.css` 和 `panels.css` 中应几乎见不到裸数字。

### 8.2 引入 CSS 自定义属性做「动态主题热切换」优化（优先级：低）

目前主题切换是通过修改 `<html data-theme="xxx">` 实现的，已经足够高效。未来如果要做「实时预览主题」（鼠标悬停在主题列表上时即时预览），可以引入一个过渡动画：

```css
html {
    transition: background-color 0.3s ease, color 0.3s ease;
}
```

但需注意：过渡动画在阅读器长文档中可能引发性能问题，建议仅在面板 UI 上启用。

### 8.3 夜间模式与 OLED 纯黑主题分离（优先级：低）

当前 `dark` 主题是深灰色（`#1a1a1a`）。部分用户（尤其是 OLED 屏幕）希望有纯黑（`#000000`）主题。可以新增 `[data-theme="amoled"]`，只改背景色和文字对比度，其他完全继承 `dark` 的强调色。

### 8.4 按需加载主题（优先级：低）

37 个主题全部在 `themes.css` 中，文件大小约 493 行，对现代设备来说微不足道。但如果未来主题数量膨胀到 100+，可考虑把每个主题拆成独立文件（如 `theme-dark.css`），由 JS 动态注入 `<link>`。当前**不建议做**，因为复杂度收益比太低。

---

## 9. 附录：速查表

### 9.1 文件定位速查

| 我要改…… | 去哪个文件 |
|----------|-----------|
| 主题色/背景色/强调色 | `themes.css` |
| 按钮/开关/滑块/弹窗/Toast | `components.css` |
| 页面整体布局/Sidebar/Toolbar | `layout.css` |
| 阅读区排版/目录/分页/drop-cap | `reader.css` |
| 设置/书库/搜索/关于/数据管理 | `panels.css` |
| 动画效果 | `animations.css` |
| 手机/平板适配 | `responsive.css` |
| 新增全局变量 | `variables.css` |

### 9.2 `index.html` 加载顺序（禁止修改）

```html
<!-- 1. 地基 -->
<link rel="stylesheet" href="./css/variables.css">
<link rel="stylesheet" href="./css/reset.css">

<!-- 2. 涂装 -->
<link rel="stylesheet" href="./css/themes.css">

<!-- 3. 结构 -->
<link rel="stylesheet" href="./css/layout.css">

<!-- 4. 家具 -->
<link rel="stylesheet" href="./css/components.css">

<!-- 5. 房间 -->
<link rel="stylesheet" href="./css/reader.css">
<link rel="stylesheet" href="./css/panels.css">

<!-- 6. 特效 -->
<link rel="stylesheet" href="./css/animations.css">

<!-- 7. 适配（必须最后） -->
<link rel="stylesheet" href="./css/responsive.css">
```

### 9.3 变更日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-04-15 | v1.0 | `main.css` 从 5746 行拆分为 9 个语义化文件，彻底移除兜底文件 |

---

**文档结束。如有新增 CSS 文件或调整加载顺序的需求，请先更新本文档，再提交代码。**
