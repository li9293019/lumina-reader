# Lumina Reader 明度调节与 APP 系统栏适配指南

> **版本**：v1.0  
> **日期**：2026-06-07  
> **技术栈**：Capacitor 8 + Android WebView + CSS Filter Effects  
> **适用范围**：前端明度滑块、原生状态栏/导航栏颜色同步、沉浸模式适配

---

## 目录

1. [功能概述与架构定位](#1-功能概述与架构定位)
2. [CSS 层实现原理](#2-css-层实现原理)
3. [配置持久化设计](#3-配置持久化设计)
4. [原生系统栏颜色同步](#4-原生系统栏颜色同步)
5. [沉浸模式下的特殊处理](#5-沉浸模式下的特殊处理)
6. [透明方案的尝试与放弃](#6-透明方案的尝试与放弃)
7. [已知限制与约束](#7-已知限制与约束)
8. [调试与排查手册](#8-调试与排查手册)

---

## 1. 功能概述与架构定位

### 1.1 功能定义

**明度调节**允许用户在 **50% ~ 150%** 范围内调整阅读器和 UI 的整体亮度。不同于系统级亮度（控制屏幕背光），这是应用级渲染调整，通过 CSS `filter: brightness()` 实现。

| 维度 | 系统亮度 | 应用明度 |
|------|---------|---------|
| 控制对象 | 屏幕背光 LED | WebView 像素渲染 |
| 影响范围 | 整个屏幕（包括系统栏） | APP 内所有 Web 内容 |
| 耗电 | 直接影响 | 无额外耗电 |
| 夜间阅读 | 调低背光 + 高对比度主题 | 在任意主题上叠加亮度滤镜 |
| 默认值 | 系统决定 | 100%（无滤镜） |

### 1.2 为什么需要原生系统栏同步

当 `html { filter: brightness(0.8) }` 生效时，WebView 内所有像素都会变暗。但 **Android 原生状态栏和导航栏是独立于 WebView 的渲染层**，CSS filter 无法穿透到原生组件。

如果不做同步，状态栏和导航栏会保持原始颜色，与变暗的页面内容形成明显色差。因此需要前端计算调整后的颜色，通过 JSBridge 同步设置原生系统栏背景色，使其与 WebView 渲染效果一致。

---

## 2. CSS 层实现原理

### 2.1 为什么放在 `html` 而不是 `body`

方案演进：

| 方案 | 代码 | 问题 | 结论 |
|------|------|------|------|
| `body` | `body { filter: brightness() }` | 干扰 WebView 安全区域计算，导致底部白条/顶部截断 | 放弃 |
| `#contentWrapper` | `#contentWrapper { filter: brightness() }` | 只影响阅读内容，UI 面板、弹窗不受控制 | 放弃 |
| `html` | `html { filter: brightness() }` | 影响整个文档，不干扰 body 布局，安全区域正常 | 采用 |

```css
/* layout.css */
html {
    filter: brightness(var(--brightness, 1));
}
```

### 2.2 CSS 变量链路

```
settings.brightness (JS, 50~150)
    -> /100
--brightness (CSS 变量, 0.5~1.5)
    ->
filter: brightness(var(--brightness, 1))
```

`--brightness` 默认值 `1` 确保即使变量未定义也不会破坏布局。

### 2.3 滑块控制

复用现有 slider 控件系统，`data-setting-slider="brightness"` 自动绑定到 `Lumina.State.settings.brightness`。

---

## 3. 配置持久化设计

### 3.1 数据流

```
用户拖动滑块
    ->
Lumina.State.settings.brightness 更新
    ->
Lumina.Settings.save() -> ConfigManager.set('reading', { brightness })
    ->
localStorage (luminaConfig)
```

### 3.2 默认值

```javascript
// config-manager.js
reading: {
    // ... 其他字段 ...
    brightness: 100,
}
```

### 3.3 兼容性与迁移

新增字段 `brightness` 不影响旧配置读取。`config-manager.js` 的 `get()` 方法在旧配置缺少该字段时会使用默认值 `100`。

---

## 4. 原生系统栏颜色同步

### 4.1 架构概览

前端读取 `--bg-primary` 和 `settings.brightness`，通过 `adjustColorForBrightness()` 计算调整后的颜色，经 JSBridge 同步给原生 `setStatusBarColor()` / `setNavigationBarColor()`。

### 4.2 颜色调整算法

CSS `filter: brightness(factor)` 在主流浏览器中是在 **sRGB 空间** 对 RGB 三通道做线性乘法：

```
outputR = inputR * factor
outputG = inputG * factor
outputB = inputB * factor
```

因此前端的 `adjustColorForBrightness()` 使用完全相同的算法：

```javascript
// settings.js
adjustColorForBrightness(colorHex, factor) {
    const hex = colorHex.replace('#', '');
    if (hex.length !== 6) return colorHex;
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const newR = Math.min(255, Math.max(0, Math.round(r * factor)));
    const newG = Math.min(255, Math.max(0, Math.round(g * factor)));
    const newB = Math.min(255, Math.max(0, Math.round(b * factor)));
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}
```

### 4.3 调用时机

```javascript
// settings.js apply()
document.documentElement.style.setProperty('--brightness', ((settings.brightness ?? 100) / 100).toString());

// 在 brightness 设置之后调用，确保颜色计算使用最新值
this.applySystemBars();
```

### 4.4 图标颜色控制

系统栏 **文字/图标颜色** 只能设置为 **浅色或深色**（Android/iOS 系统限制），无法自定义颜色：

```java
// Android
controller.setAppearanceLightStatusBars(lightIcons);      // true=深色图标, false=浅色图标
controller.setAppearanceLightNavigationBars(lightIcons);  // 同上
```

```javascript
// Capacitor
StatusBar.setStyle({ style: isDarkTheme ? 'DARK' : 'LIGHT' });
```

图标颜色根据主题明暗自动切换，与明度无关。

---

## 5. 沉浸模式下的特殊处理

### 5.1 沉浸模式的行为差异

| 模式 | 导航栏行为 | 颜色处理 |
|------|-----------|---------|
| 普通模式 | 实色背景，与页面底部对齐 | `setNavigationBar(adjustedBg, lightIcons)` |
| 沉浸模式 | 半透明背景，内容延伸到下方 | `setNavigationBarTranslucent(adjustedBg, 40, lightIcons)` |

### 5.2 沉浸模式代码路径

```javascript
// ui.js - 进入沉浸
const brightnessFactor = ((Lumina.State.settings.brightness ?? 100) / 100);
const adjustedBg = Lumina.Settings.adjustColorForBrightness(bg, brightnessFactor);
window.NavigationBarInterface.setNavigationBarTranslucent(adjustedBg, 40, !isDark);

// ui.js - 退出沉浸
window.NavigationBarInterface.setNavigationBar(adjustedBg, !isDark);
```

**注意**：沉浸模式的导航栏恢复逻辑分散在三处（手动退出、`fullscreenchange` 事件、返回键处理），每处都必须使用 `adjustedBg` 而非原始 `bg`。

---

## 6. 透明方案的尝试与放弃

### 6.1 理想方案

如果状态栏和导航栏都是透明的，WebView 内容延伸到它们下方，CSS `filter: brightness()` 会自动影响这些区域，无需颜色同步。

### 6.2 尝试过程与失败原因

| 尝试 | 方案 | 结果 | 失败原因 |
|------|------|------|---------|
| 1 | `windowTranslucentNavigation=true` | 黑色半透明遮罩 | Android 系统强制叠加黑色背景 |
| 2 | `FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS + Color.TRANSPARENT` | 白色背景 | WebView 未延伸到导航栏下方 |
| 3 | + `SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION` | 同上 | 延伸区域不渲染页面内容 |
| 4 | + `WindowCompat.setDecorFitsSystemWindows(false)` | 白色背景 | CSS filter 不影响延伸区域 |

### 6.3 为什么状态栏透明可以而导航栏不行

- **状态栏**：Capacitor 默认行为使 WebView 延伸到状态栏下方，CSS filter 正常覆盖。
- **导航栏**：Android 对导航栏透明处理更严格，`windowTranslucentNavigation` 强制叠加黑色层；`setNavigationBarColor(TRANSPARENT)` 即使配合延伸 API，WebView 在导航栏区域的渲染内容也不保证受 CSS filter 影响。

### 6.4 最终决策

放弃透明方案，采用 **颜色同步方案**：前端计算调整后的颜色，经 JSBridge 同步给原生系统栏。

---

## 7. 已知限制与约束

### 7.1 色差限制

RGB 乘法算法与 CSS `filter: brightness()` 在数学上对齐，但实际显示可能存在 **微小色差**，原因包括：

- WebView GPU 渲染管线与原生颜色渲染管线的 gamma 差异
- 不同 Android 版本/厂商系统的实现差异
- OLED 屏幕像素自发光特性

**结论**：普通模式下色差可接受；极端明度值（< 60% 或 > 130%）色差可能更明显。

### 7.2 系统栏图标颜色限制

状态栏和导航栏文字/图标颜色 **只能为浅色或深色**，无法自定义。这是 Android/iOS 原生 API 限制。

### 7.3 沉浸模式限制

沉浸模式下导航栏使用半透明背景（alpha=40），WebView 内容会部分透过来。如果页面底部有复杂图案，可能与导航栏按钮产生视觉冲突。

---

## 8. 调试与排查手册

### 8.1 导航栏颜色不同步

检查清单：

1. `settings.js` 中 `applySystemBars()` 是否在 `--brightness` 设置之后调用
2. `adjustColorForBrightness()` 是否使用了正确的 `factor`
3. `MainActivity.java` 中 `applyNavigationBar()` 是否正常执行
4. `ui.js` 沉浸模式下的导航栏设置是否使用了 `adjustedBg`

### 8.2 底部出现白条

检查 `layout.css`，确保 `filter` 在 `html` 上而非 `body` 上：

```css
/* 正确 */
html { filter: brightness(var(--brightness, 1)); }

/* 错误 - 会导致安全区域错位 */
body { filter: brightness(var(--brightness, 1)); }
```

### 8.3 从后台恢复后颜色丢失

检查 `MainActivity.onResume()` 中的延迟恢复逻辑，以及 `init.js` 中的 `appStateChange` / `visibilitychange` 监听器。

### 8.4 日志定位

```javascript
// 前端
console.warn('[Settings] applySystemBars 失败:', e);

// 原生
Log.e(TAG, "applyNavigationBar failed: " + e.getMessage());
Log.e(TAG, "applyStatusBar failed: " + e.getMessage());
```

---

## 附录：关键文件速查

| 文件 | 职责 |
|------|------|
| `app/www/css/layout.css` | `html { filter: brightness(var(--brightness)) }` |
| `app/www/index.html` | 明度滑块 DOM |
| `app/www/js/modules/settings.js` | `adjustColorForBrightness()`, `applySystemBars()` |
| `app/www/js/modules/config-manager.js` | `brightness: 100` 默认值 |
| `app/www/js/modules/ui.js` | 沉浸模式导航栏颜色 |
| `app/www/js/i18n/zh.js` / `zh-TW.js` / `en.js` | `brightness` 翻译键 |
| `app/android/.../MainActivity.java` | `applyStatusBar()`, `applyNavigationBar()`, `NavigationBarInterface` |
| `app/android/app/src/main/res/values/styles.xml` | `statusBarColor` / `navigationBarColor` 初始值 |
