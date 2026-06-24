# 墨水屏模式适配指南

> 本文档记录 Lumina Reader 墨水屏（E-ink）模式的实现原理、关键决策与迭代注意事项，供后续维护参考。

---

## 目录

1. [概述](#1-概述)
2. [开关与状态](#2-开关与状态)
3. [主题系统](#3-主题系统)
4. [视口与布局](#4-视口与布局)
5. [交互与组件](#5-交互与组件)
6. [相关文件清单](#6-相关文件清单)
7. [测试建议](#7-测试建议)
8. [迭代检查清单](#8-迭代检查清单)

---

## 1. 概述

### 1.1 目标设备

- 6–7 寸高分墨水屏阅读器（如汉王 Kirin 1272×1696 @ 300ppi）。
- 这类设备在 WebView 中报告的 CSS 像素宽度常落在 **768px–1024px** 之间，不能简单依赖 `max-width: 768px` 触发移动端布局。

### 1.2 设计原则

1. **手动开关**：不自动检测设备，由用户在“阅读设置”中手动开启。  
   原因：墨水屏设备 UA/分辨率差异大，自动检测容易误判。
2. **独立样式文件**：所有墨水屏覆盖样式集中在 `css/eink.css`，不污染现有响应式逻辑。
3. **视为移动端**：开启后 `Lumina.Utils.isMobile()` 返回 `true`，触摸手势、分页提示等统一走移动端路径。
4. **高对比、无动画、无阴影**：适配墨水屏低刷新、无色彩的特性。

---

## 2. 开关与状态

### 2.1 手动开关

- 入口：`index.html` 设置面板中的 `data-setting-toggle="einkMode"` 开关。
- 事件处理：`js/modules/ui.js` 监听点击，切换 `Lumina.State.settings.einkMode`。

### 2.2 持久化

- `Lumina.Settings.save()` 将 `einkMode` 写入 `luminaConfig.reading.einkMode`（localStorage）。
- `Lumina.Settings.apply()` 根据该值给 `<html>` 添加/移除 `eink-mode` 类。

### 2.3 启动时提前应用（避免 FOUC）

在 `index.html` `<head>` 的内联脚本中直接读取 `localStorage`：

```html
<script>
(function() {
    try {
        const settings = JSON.parse(localStorage.getItem('luminaConfig') || '{}');
        const lang = settings.reading?.language || 'zh';
        const theme = settings.reading?.theme || 'light';
        document.documentElement.lang = lang;
        document.documentElement.setAttribute('data-theme', theme);
        if (settings.reading?.einkMode) {
            document.documentElement.classList.add('eink-mode');
        }
        // ...
    } catch(e) {}
})();
</script>
```

这样 CSS 渲染前就已经带上 `eink-mode`，避免 1024px 视口下从“普通桌面布局”跳到“全视口布局”的闪烁。

---

## 3. 主题系统

### 3.1 两个专用主题

- **`paper`（纸白）**：白底黑字，浅色边框，无阴影。
- **`ink`（墨黑）**：黑底白字，深灰边框，无阴影。

定义位置：`css/themes.css`。

### 3.2 自动按时间切换

开启墨水屏开关时，`js/modules/ui.js` 会根据当前小时自动选择主题：

```js
if (key === 'einkMode' && !wasEnabled) {
    const hour = new Date().getHours();
    Lumina.State.settings.theme = (hour >= 6 && hour < 18) ? 'paper' : 'ink';
}
```

> 注意：关闭墨水屏模式**不会**自动恢复之前的主题，仅移除 `eink-mode` 视口类。

### 3.3 需要在状态栏逻辑中注册的主题

APP 状态栏/导航栏颜色根据 `darkThemes` 列表判断图标颜色：

```js
// js/modules/settings.js
const darkThemes = ['olive', 'taupe', 'dusk', 'moss', 'dark', 'amoled', 'midnight', 'nebula', 'espresso', 'ink'];
```

- `ink` 是暗色主题，已加入该列表。
- `paper` 是浅色主题，走默认浅色逻辑，不需要加入。
- `js/modules/ui.js` 退出沉浸模式时也有同一份 `darkThemes` 列表，需保持同步。

### 3.4 DOCX 导出颜色映射

`js/modules/exporter.js` 中 `themeColors` 需要为 `paper` / `ink` 提供导出配色，否则导出会回退到 `light`：

```js
paper: { bg: 'FFFFFF', text: '000000', secondary: '555555', accent: '333333', border: 'CCCCCC' },
ink:   { bg: '000000', text: 'FFFFFF', secondary: 'CCCCCC', accent: '555555', border: '555555' },
```

---

## 4. 视口与布局

### 4.1 为什么用 `max-width: 1024px`

- 6–7 寸高分屏常报告 768px–1024px 的 CSS 宽度。
- 现有响应式断点是 `768px`，在这些设备上不会触发移动端布局。
- `eink.css` 使用 `@media (max-width: 1024px)` 覆盖，确保上述设备强制走移动端路径。

### 4.2 强制移动端布局的关键覆盖

```css
@media (max-width: 1024px) {
    html.eink-mode {
        --content-max-width: 100%;
        --content-padding: 16px;
        --sidebar-width: 90%;
        --nav-info-display: none;
        --mobile-hidden-display: none;
        /* ... */
    }

    .eink-mode .reading-area.with-sidebar { margin-left: 0; }
    .eink-mode .content-wrapper { box-shadow: none; border-radius: 0; }
    .eink-mode .content-scroll { padding: 0; }
}
```

### 4.3 右侧面板

- 普通响应式在 768px–1024px 之间宽度为 `360px`。
- 墨水屏下强制 `width: 100%`、关闭时 `right: -100%`、打开时 `right: 0`：

```css
.eink-mode .panel {
    width: 100%;
    border: none;
}
.eink-mode .panel:not(.open) {
    right: -100%;
}
```

- 同时去掉了 `border-left`，避免全宽面板左侧出现突兀的竖线。

### 4.4 左侧边栏

```css
.eink-mode .sidebar-left.visible {
    width: 100%;
}
```

### 4.5 书库管理全屏

```css
.eink-mode #dataManagerPanel.panel-overlay {
    padding: 0;
    align-items: stretch;
    justify-content: stretch;
    background: none;
}

.eink-mode #dataManagerPanel .data-manager {
    max-width: 100%;
    max-height: 100vh;
    height: 100vh;
    border-radius: 0;
}

.eink-mode #dataManagerPanel .data-manager .data-grid {
    max-height: none;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
}
```

---

## 5. 交互与组件

### 5.1 全局 Tooltip

墨水屏下长按/悬停提示会干扰操作，直接隐藏：

```css
.eink-mode #global-tooltip {
    display: none !important;
}
```

### 5.2 面板遮罩模糊

墨水屏性能与显示效果不适合 `backdrop-filter`：

```css
.eink-mode .panel-overlay {
    backdrop-filter: none;
}
```

### 5.3 about-panel 宽度与边框

- 默认 `.about-content` 宽度 `90%`、最大 `600px`，在 6–7 寸设备两侧留白过多。
- 墨水屏下加宽到 `96%`：

```css
.eink-mode .about-panel {
    padding: 20px 2%;
}
.eink-mode .about-content {
    width: 96%;
    max-width: none;
}
```

- 暗色主题下 `.about-content` 与背景融合，轮廓不可见，因此给 `.about-content` 统一加了：

```css
border: 1px solid var(--border-color);
```

### 5.4 书库卡片列数

墨水屏下强制使用移动端列数，避免 6–7 寸设备出现过多列：

```css
.eink-mode .data-grid { grid-template-columns: repeat(2, 1fr); }
.eink-mode .data-grid[data-view="list"] { grid-template-columns: 1fr; }
.eink-mode .data-grid[data-view="card"] { grid-template-columns: repeat(2, 1fr); }
.eink-mode .data-grid[data-view="compact"] { grid-template-columns: repeat(3, 1fr); }
```

---

## 6. 相关文件清单

| 文件 | 作用 |
|------|------|
| `css/eink.css` | 墨水屏专用覆盖样式 |
| `css/themes.css` | `paper` / `ink` 主题定义 |
| `css/panels.css` | `.about-content` 边框 |
| `css/responsive.css` | 移动端 `.panel` 去边框 |
| `index.html` | 开关入口、`<head>` 提前应用 `eink-mode` |
| `js/modules/settings.js` | 应用/保存设置、状态栏暗色主题列表 |
| `js/modules/ui.js` | 开关事件、沉浸恢复时的状态栏暗色列表 |
| `js/modules/utils.js` | `isMobile()` 增加 `eink-mode` 判断 |
| `js/modules/config-manager.js` | `einkMode` 持久化默认值 |
| `js/modules/exporter.js` | DOCX 导出 `paper` / `ink` 颜色映射 |
| `js/i18n/zh.js` / `zh-TW.js` / `en.js` | 开关与主题名称翻译 |

---

## 7. 测试建议

1. **浏览器模拟**：使用 Chrome DevTools，设备尺寸设为 900×1200 / 1024×1696，DPR 1。
2. **开启方式**：
   - 首次加载：提前应用脚本会读取 localStorage，可先通过控制台执行 `localStorage.setItem('luminaConfig', JSON.stringify({ reading: { einkMode: true, theme: 'paper' } }))` 后刷新。
   - 手动开启：设置面板 → 墨水屏模式。
3. **重点检查项**：
   - 启动时无布局跳变。
   - 设置/历史/搜索面板全宽显示。
   - 书库面板高度填满视口、卡片列数合理。
   - `paper` / `ink` 主题下状态栏/导航栏图标颜色正确。
   - DOCX 导出颜色与当前主题一致。

---

## 8. 迭代检查清单

新增主题、组件或断点时，请确认：

- [ ] 新主题是否加入了 `js/modules/settings.js` 的 `darkThemes`（如为暗色）。
- [ ] 新主题是否加入了 `js/modules/ui.js` 的 `darkThemes`（如为暗色）。
- [ ] 新主题是否加入了 `js/modules/exporter.js` 的 `themeColors`。
- [ ] 新增右侧面板是否使用 `.panel` 类（自动继承 eink/mobile 全宽与去边框）。
- [ ] 新增全屏覆盖面板（如书库）是否考虑 `.eink-mode` 下的 `100vh` / `border-radius: 0`。
- [ ] 新增悬浮提示是否应在 `.eink-mode #global-tooltip` 或相关选择器中隐藏。
- [ ] 新增阴影/模糊效果是否应在墨水屏下关闭。
- [ ] 修改 `luminaConfig` 结构时，同步更新 `index.html` `<head>` 中的提前读取脚本。

---

*最后更新：2026-06-24*
