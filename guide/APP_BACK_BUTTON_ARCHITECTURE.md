# 流萤阅读器 APP 返回按钮架构指南

> **文档定位**：移动端 Android APP 物理返回键处理机制的技术规范与维护手册  
> **适用对象**：产品经理、前端开发工程师、Android 原生开发工程师  
> **版本**：v1.0  
> **最后更新**：2026-04-02

---

## 目录

1. [架构概述](#1-架构概述)
2. [业务层级结构](#2-业务层级结构)
   - 2.1 [层级顺序（从高到低）](#21-层级顺序从高到低)
   - 2.2 [层级关系图](#22-层级关系图)
3. [技术实现细节](#3-技术实现细节)
   - 3.1 [原生层（Android Java）](#31-原生层android-java)
   - 3.2 [Web 层（JavaScript）](#32-web-层javascript)
   - 3.3 [通信机制](#33-通信机制)
4. [如何新增/修改面板](#4-如何新增修改面板)
   - 4.1 [新增独立面板](#41-新增独立面板)
   - 4.2 [新增关于面板类](#42-新增关于面板类)
   - 4.3 [修改层级顺序](#43-修改层级顺序)
5. [调试与测试](#5-调试与测试)
   - 5.1 [日志查看](#51-日志查看)
   - 5.2 [常见问题排查](#52-常见问题排查)
6. [最佳实践](#6-最佳实践)

---

## 1. 架构概述

流萤阅读器 APP 的返回按钮处理采用**原生层拦截 + Web 层处理**的混合架构：

```
┌─────────────────────────────────────────────────────────────┐
│                    用户按下物理返回键                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 Android 原生层 (MainActivity.java)            │
│  - 拦截 onBackPressed() 事件                                │
│  - 执行 JS 查询当前 UI 状态                                  │
│  - 决策：交给 JS 关闭面板 / 执行双击退出                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼  evaluateJavascript()
┌─────────────────────────────────────────────────────────────┐
│                 Web 层 (init.js)                             │
│  - Lumina.BackButtonHandler.handleBackButton()              │
│  - 按优先级逐个检查面板状态                                   │
│  - 执行关闭操作                                              │
└─────────────────────────────────────────────────────────────┘
```

### 为什么选择这种架构？

| 方案 | 优点 | 缺点 | 本项目选择 |
|:---|:---|:---|:---|
| 纯 JS 处理 (`App.addListener`) | 简单 | Capacitor 8 无法真正拦截系统返回键 | ❌ |
| 纯原生处理 | 可靠 | 无法操作 Web 层的 DOM | ❌ |
| **混合架构** | 原生拦截可靠 + JS 灵活操作 DOM | 复杂度略高 | ✅ |

---

## 2. 业务层级结构

### 2.1 层级顺序（从高到低）

| 优先级 | 面板/元素 | z-index | DOM ID | 关闭类名/方式 | 说明 |
|:---:|:---|:---:|:---|:---|:---|
| 1 | 书籍详情页 | 300 | `bookDetailPanel` | `active` → JS 方法 | 从书库点击进入 |
| 2 | 书库面板 | 250 | `dataManagerPanel` | `active` | 书库管理主界面 |
| 3 | **关于面板类** | 200 | - | `active` | 统一处理的一类面板 |
| 3.1 | 关于面板 | 200 | `aboutPanel` | `active` | 应用信息 |
| 3.2 | 缓存管理 | 200 | `cacheManagerPanel` | `active` | 缓存清理 |
| 3.3 | 正则帮助 | 200 | `regexHelpPanel` | `active` | 正则表达式帮助 |
| 3.4 | Azure TTS 设置 | 200 | `azureTtsDialog` | `active` | 语音配置 |
| 3.5 | 热力图预设 | 200 | `heatMapPresetsDialog` | `active` | 热力图标签预设 |
| 4 | **右侧面板组** | 95 | - | `open` | 互斥显示 |
| 4.1 | 设置面板 | 95 | `sidebarRight` | `open` | 阅读设置 |
| 4.2 | 历史面板 | 95 | `historyPanel` | `open` | 最近打开 |
| 4.3 | 搜索面板 | 95 | `searchPanel` | `open` | 全文搜索 |
| 4.4 | 注释面板 | 95 | `annotationPanel` | `open` | 书签注释 |
| 5 | 左侧面板（目录） | 95 | `sidebarLeft` | `visible` | 章节目录 |
| 6 | 阅读区/欢迎页 | 0 | - | - | 关闭文件回到此处 |
| 7 | 退出确认 | - | - | - | 双击退出提示 |

### 2.2 层级关系图

```
                    ┌─────────────────┐
                    │   书籍详情页     │  ← z-index: 300 (最高)
                    │  (bookDetail)   │
                    └────────┬────────┘
                             │ 关闭后
                    ┌────────▼────────┐
                    │    书库面板      │  ← z-index: 250
                    │  (dataManager)  │
                    └────────┬────────┘
                             │ 关闭后
            ┌────────────────┼────────────────┐
            │         关于面板类 (z:200)       │
            │  ┌────────┬────────┬────────┐  │
            │  │ about  │ cache  │ regex  │  │  ← 任意一个打开
            │  │ azure  │ heatMap│        │  │
            │  └────────┴────────┴────────┘  │
            └────────────────┬────────────────┘
                             │ 关闭后
            ┌────────────────┼────────────────┐
            │        右侧面板组 (z:95)         │
            │  ┌────────┬────────┬────────┐  │
            │  │sidebarR│ history│ search │  │  ← 互斥，只会有一个
            │  │annotat │        │        │  │
            │  └────────┴────────┴────────┘  │
            └────────────────┬────────────────┘
                             │ 关闭后
                    ┌────────▼────────┐
                    │  左侧面板(目录)  │  ← z-index: 95
                    │  (sidebarLeft)  │
                    └────────┬────────┘
                             │ 关闭后
                    ┌────────▼────────┐
                    │  阅读区/欢迎页   │  ← 关闭文件回到这里
                    │  (currentFile)  │
                    └────────┬────────┘
                             │ 返回键 (双击)
                    ┌────────▼────────┐
                    │   退出应用       │
                    └─────────────────┘
```

---

## 3. 技术实现细节

### 3.1 原生层（Android Java）

**文件位置**：`app/android/app/src/main/java/com/lumina/reader/MainActivity.java`

#### 核心方法

```java
@Override
public void onBackPressed() {
    // 1. 执行 JS 查询当前状态
    bridge.getWebView().evaluateJavascript(
        "javascript:(function() { " +
        "  // 按优先级检查各面板状态 " +
        "  if (document.getElementById('bookDetailPanel')?.classList.contains('active')) ..." +
        "})()",
        result -> {
            String state = result.replace("\"", "");
            handleBackButtonState(state);
        }
    );
}

private void handleBackButtonState(String state) {
    switch (state) {
        case "bookDetail":
        case "dataManager":
        // ... 其他面板
            // 有面板打开 → 交给 JS 处理
            bridge.getWebView().evaluateJavascript(
                "javascript:Lumina.BackButtonHandler.handleBackButton()",
                null
            );
            break;
            
        case "welcome":
        default:
            // 在欢迎界面 → 处理双击退出
            long now = System.currentTimeMillis();
            if (now - lastBackTime < DOUBLE_PRESS_INTERVAL) {
                finishAndRemoveTask();  // 退出应用
            } else {
                lastBackTime = now;
                // 显示"再按一次退出"提示
                bridge.getWebView().evaluateJavascript(
                    "javascript:Lumina.UI.showToast(...)",
                    null
                );
            }
            break;
    }
}
```

#### 关键设计决策

| 决策 | 说明 |
|:---|:---|
| **JS 查询状态** | 原生层不直接操作 DOM，通过 `evaluateJavascript` 查询 |
| **状态字符串** | 返回预定义的字符串标识（如 `"bookDetail"`、`"historyPanel"`） |
| **双击退出在原生层** | 避免 JS 与原生之间复杂的状态同步问题 |
| **Toast 提示走 JS** | 保持 UI 风格统一，使用 Web 层的 Toast |

---

### 3.2 Web 层（JavaScript）

**文件位置**：`app/www/js/modules/init.js`

#### 核心方法

```javascript
Lumina.BackButtonHandler = {
    handleBackButton() {
        // 按优先级逐个检查
        
        // 优先级1: 书籍详情页
        if (document.getElementById('bookDetailPanel')?.classList.contains('active')) {
            Lumina.BookDetail.close();
            return true;  // 已处理
        }
        
        // 优先级2: 书库面板
        if (document.getElementById('dataManagerPanel')?.classList.contains('active')) {
            Lumina.DataManager.close();
            return true;
        }
        
        // 优先级3: 关于面板类（数组遍历）
        const aboutPanels = [
            document.getElementById('aboutPanel'),
            document.getElementById('cacheManagerPanel'),
            // ...
        ];
        for (const panel of aboutPanels) {
            if (panel?.classList.contains('active')) {
                panel.classList.remove('active');
                return true;
            }
        }
        
        // 优先级4: 右侧面板组
        const rightPanels = [
            { id: 'sidebarRight', close: (el) => el.classList.remove('open') },
            { id: 'historyPanel', close: (el) => el.classList.remove('open') },
            { id: 'searchPanel', close: (el) => el.classList.remove('open') },
            { id: 'annotationPanel', close: (el) => el.classList.remove('open') }
        ];
        for (const panel of rightPanels) {
            const el = document.getElementById(panel.id);
            if (el?.classList.contains('open')) {
                panel.close(el);
                return true;
            }
        }
        
        // 优先级5: 左侧面板
        if (document.getElementById('sidebarLeft')?.classList.contains('visible')) {
            // 关闭逻辑...
            return true;
        }
        
        // 优先级6: 关闭当前文件
        if (Lumina.State.app.currentFile.name) {
            Lumina.Actions.returnToWelcome();
            return true;
        }
        
        return false;  // 未处理，原生层将执行退出
    }
};
```

#### 两种面板关闭模式

| 模式 | 示例 | 适用场景 |
|:---|:---|:---|
| **简单类名切换** | `panel.classList.remove('active')` | 关于面板类（只需隐藏） |
| **自定义关闭逻辑** | `Lumina.BookDetail.close()` | 需要清理状态的复杂面板 |

---

### 3.3 通信机制

```
原生层 ──────────────────────────────────────► Web 层
                                                    │
  1. evaluateJavascript("检查状态")                  │
        │                                           │
        ▼                                           │
  2. 返回状态字符串                                │
        │                                           │
        ▼                                           ▼
  3. handleBackButtonState(state)                   
     如果是有面板状态 ──────► evaluateJavascript("handleBackButton()")
        │                                           │
        ▼                                           ▼
  4. 原生层等待（不执行默认行为）              JS 关闭面板
        │                                           │
        ▼                                           ▼
  5. 用户再次按返回键                        面板已关闭
        │                                           │
        ▼                                           ▼
  6. 重复步骤 1                          返回"welcome"或其他状态
```

---

## 4. 如何新增/修改面板

### 4.1 新增独立面板

**场景**：新增一个与设置、历史、搜索同级的右侧面板

**假设**：新增一个"笔记面板" (`notesPanel`)

#### 步骤 1: HTML 结构

```html
<!-- index.html -->
<aside class="panel notes-panel" id="notesPanel">
    <!-- 面板内容 -->
</aside>
```

#### 步骤 2: 原生层添加状态检查

```java
// MainActivity.java
bridge.getWebView().evaluateJavascript(
    "javascript:(function() { " +
    "  // ... 其他面板检查 " +
    "  if (document.getElementById('notesPanel')?.classList.contains('open')) return 'notesPanel'; " +  // 新增
    "  // ... 其他面板检查 " +
    "})()",
    result -> { /* ... */ }
);
```

#### 步骤 3: 原生层添加 switch case

```java
// MainActivity.java - handleBackButtonState 方法
switch (state) {
    // ... 其他 case
    case "notesPanel":  // 新增
    case "historyPanel":
    case "searchPanel":
    // ...
}
```

#### 步骤 4: Web 层添加关闭逻辑

```javascript
// init.js - handleBackButton 方法
// 优先级4: 右侧面板组
const rightPanels = [
    // ... 其他面板
    { id: 'notesPanel', close: (el) => el.classList.remove('open') },  // 新增
];
```

---

### 4.2 新增关于面板类

**场景**：新增一个类似"关于面板"的全屏对话框

**假设**：新增"插件管理面板" (`pluginManagerPanel`)

#### 步骤 1: HTML 结构

```html
<!-- index.html -->
<div class="about-panel" id="pluginManagerPanel">
    <div class="about-content">
        <!-- 内容 -->
    </div>
</div>
```

#### 步骤 2: 原生层添加状态检查

```java
// MainActivity.java
"  if (document.getElementById('pluginManagerPanel')?.classList.contains('active')) return 'pluginManager'; " +
```

#### 步骤 3: 原生层添加 switch case

```java
case "pluginManager":
case "about":
case "cacheManager":
// ...
```

#### 步骤 4: Web 层添加关闭逻辑

```javascript
// 优先级3: 关于面板类
const aboutPanels = [
    document.getElementById('aboutPanel'),
    document.getElementById('cacheManagerPanel'),
    // ...
    document.getElementById('pluginManagerPanel'),  // 新增
];
```

---

### 4.3 修改层级顺序

**场景**：调整面板的关闭优先级

**假设**：让"搜索面板"优先级高于"书库面板"

#### 当前顺序
```
1. 书籍详情页
2. 书库面板
3. 关于面板类
...
```

#### 修改后顺序
```
1. 书籍详情页
2. 搜索面板      ← 提升
3. 书库面板
4. 关于面板类
...
```

#### 修改步骤

**步骤 1: 原生层调整查询顺序**

```java
// MainActivity.java
"javascript:(function() { " +
"  if (document.getElementById('bookDetailPanel')?.classList.contains('active')) return 'bookDetail'; " +
// 将搜索面板检查提前
"  if (document.getElementById('searchPanel')?.classList.contains('open')) return 'searchPanel'; " +  // 提前
"  if (document.getElementById('dataManagerPanel')?.classList.contains('active')) return 'dataManager'; " +
// ...
```

**步骤 2: Web 层调整处理顺序**

```javascript
// init.js - handleBackButton 方法

// 优先级2: 搜索面板（从右侧面板组中提升）
if (document.getElementById('searchPanel')?.classList.contains('open')) {
    document.getElementById('searchPanel').classList.remove('open');
    return true;
}

// 优先级3: 书库面板
if (document.getElementById('dataManagerPanel')?.classList.contains('active')) {
    Lumina.DataManager.close();
    return true;
}

// 优先级4: 其他右侧面板
const rightPanels = [
    { id: 'sidebarRight', close: (el) => el.classList.remove('open') },
    { id: 'historyPanel', close: (el) => el.classList.remove('open') },
    // 注意：searchPanel 已从列表中移除
    { id: 'annotationPanel', close: (el) => el.classList.remove('open') }
];
```

---

## 5. 调试与测试

### 5.1 日志查看

#### Android Studio Logcat

```
过滤标签：LuminaFileOpener、BackButton
```

#### 关键日志

| 日志内容 | 说明 |
|:---|:---|
| `Back button state: bookDetail` | 检测到书籍详情页打开 |
| `Double press confirmed, exiting app` | 双击退出已触发 |
| `[BackButton] Handler ready (native-driven)` | JS 层初始化完成 |

### 5.2 常见问题排查

#### 问题 1: 返回键无反应

**排查步骤**：
1. 检查 Logcat 是否有 `onBackPressed` 日志
2. 确认 JS 层 `Lumina.BackButtonHandler` 已挂载
3. 检查 `evaluateJavascript` 回调是否执行

#### 问题 2: 面板无法关闭

**排查步骤**：
1. 确认面板 ID 拼写正确
2. 检查关闭的 className（`active` vs `open` vs `visible`）
3. 在 Chrome DevTools 中手动执行关闭代码测试

#### 问题 3: 双击退出失效

**排查步骤**：
1. 确认 `DOUBLE_PRESS_INTERVAL` 值（默认 2000ms）
2. 检查 `lastBackTime` 是否正确更新
3. 确认 `finishAndRemoveTask()` 被调用

---

## 6. 最佳实践

### 6.1 新增面板的 Checklist

- [ ] HTML 中已添加正确的 `id` 和 class
- [ ] 原生层 JS 查询中已添加状态检查
- [ ] 原生层 `switch` 语句中已添加 case
- [ ] Web 层 `handleBackButton` 中已添加关闭逻辑
- [ ] 已测试返回键能正常关闭新面板
- [ ] 已测试在新面板打开时双击退出不会误触发

### 6.2 命名规范

| 类型 | 命名规范 | 示例 |
|:---|:---|:---|
| 独立面板 | `xxxPanel` | `notesPanel` |
| 关于面板类 | `xxxPanel` / `xxxDialog` | `cacheManagerPanel`、`azureTtsDialog` |
| 状态字符串 | 与 ID 一致或简化 | `notesPanel` → `"notesPanel"` |

### 6.3 性能建议

1. **避免在 `onBackPressed` 中执行复杂查询**
   - 只检查 class 是否存在，不读取其他属性
   
2. **减少 JS 与原生之间的往返次数**
   - 一次性查询所有状态，而非逐个查询

3. **优先使用简单关闭逻辑**
   - 除非必要，避免在 `close` 回调中执行异步操作

---

## 附录

### A. 相关文件路径

```
项目根目录/
├── app/
│   ├── android/app/src/main/java/com/lumina/reader/
│   │   └── MainActivity.java          # 原生层返回键处理
│   └── www/js/modules/
│       └── init.js                     # Web 层返回键处理
│       └── i18n.js                     # 翻译（pressBackAgainToExit）
├── APP_BACK_BUTTON_ARCHITECTURE.md     # 本文档
└── README.md
```

### B. 相关资源

- [Capacitor App Plugin Documentation](https://capacitorjs.com/docs/apis/app)
- [Android Activity Lifecycle](https://developer.android.com/guide/components/activities/activity-lifecycle)

---

**维护记录**

| 日期 | 版本 | 修改内容 | 作者 |
|:---|:---|:---|:---|
| 2026-04-02 | v1.0 | 初始版本 | Assistant |
