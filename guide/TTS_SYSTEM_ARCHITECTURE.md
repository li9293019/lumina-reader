# Lumina Reader TTS 语音朗读系统架构文档

> **版本**: v1.0  
> **日期**: 2026-04-17  
> **适用范围**: 流萤阅读器 (Lumina Reader) v2.1.2+  
> **对应模块**: `app/www/js/modules/tts.js` (2488 行)

---

## 目录

1. [架构概览](#1-架构概览)
2. [三层降级引擎](#2-三层降级引擎)
3. [双模式播放](#3-双模式播放)
4. [APP 端保活机制](#4-app-端保活机制)
5. [ROM 引导弹窗](#5-rom-引导弹窗)
6. [核心 API](#6-核心-api)
7. [事件与状态同步](#7-事件与状态同步)
8. [故障排查](#8-故障排查)

---

## 1. 架构概览

### 1.1 系统定位

TTS 模块是流萤阅读器的**语音朗读中枢**，采用"**三层降级 + 双模式播放 + 多层保活**"的架构设计：

```
┌─────────────────────────────────────────────────────────────┐
│                     TTS 系统架构                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 引擎分发层                            │   │
│  │  speakCurrent() → 自动选择可用引擎                     │   │
│  └─────────────────────────────────────────────────────┘   │
│              │              │              │                │
│     ┌────────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐         │
│     │ Azure TTS 插件 │ │ 原生 TTS  │ │ Web Speech │         │
│     │ (在线/高品质)  │ │ (APP离线) │ │ (Web离线)  │         │
│     └────────────────┘ └──────────┘ └────────────┘         │
│              │              │              │                │
│              └──────────────┴──────────────┘                │
│                         │                                   │
│              ┌──────────▼──────────┐                       │
│              │   双模式播放层       │                       │
│              │  段落模式 / 页面模式  │                       │
│              └─────────────────────┘                       │
│                         │                                   │
│              ┌──────────▼──────────┐                       │
│              │   保活与交互层       │                       │
│              │ 前台服务/心跳/高亮   │                       │
│              └─────────────────────┘                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 文件结构

```
app/www/js/modules/
└── tts.js                    # TTS 核心模块（2488 行）

app/www/js/plugins/azure-tts/
├── azure-tts.plugin.js       # Azure TTS 插件入口
├── azure-tts.engine.js       # Azure 语音合成引擎
├── azure-tts.task-manager.js # 语音任务调度器
└── speech-sdk.bundle.js      # Azure Speech SDK
```

### 1.3 核心依赖

- `@capacitor-community/text-to-speech` — APP 端原生 TTS
- `Capacitor.Plugins.TTSBackground` — 自定义前台服务插件（APP 端）
- `speechSynthesis` / `SpeechSynthesisUtterance` — Web Speech API
- `Lumina.Plugin.AzureTTS` — Azure TTS 插件（可选）

---

## 2. 三层降级引擎

### 2.1 降级顺序

```
Azure TTS 插件 → 原生 TTS (Capacitor) → Web Speech API
```

| 层级 | 引擎 | 适用场景 | 降级触发条件 |
|------|------|---------|-------------|
| **L1** | Azure TTS 插件 | 有网络、配置了密钥 | 网络超时 / 调用失败 / 用户禁用 |
| **L2** | 原生 TTS (`@capacitor-community/text-to-speech`) | APP 端离线 | 插件未安装 / 初始化失败 |
| **L3** | Web Speech API (`speechSynthesis`) | Web 端离线 / 兜底 | 浏览器不支持 |

### 2.2 降级决策逻辑

```javascript
speakCurrent() {
    // L1: Azure TTS
    const pluginEngine = this.getPluginEngine();
    if (pluginEngine && !this._azureDisabledForSession) {
        this.speakWithPlugin(text, pluginEngine);
        return;
    }
    
    // L2: 原生 TTS (APP)
    if (this.isApp && this.nativeTTS) {
        this.speakCurrentNative(text);
        return;
    }
    
    // L3: Web Speech API
    if (this.synth) {
        this._speakWithSystemTTS(text);
        return;
    }
}
```

**关键设计**：
- `_azureDisabledForSession`：会话级禁用标志。Azure 超时/失败后自动降级，直到用户手动 `stop()` 才重置
- `clearPluginEngine()`：手动清除 Azure 引擎缓存，强制重新初始化
- `_fallbackToSystemTTSForSentences()`：Azure 超时后接管剩余句子

### 2.3 引擎特性对比

| 特性 | Azure TTS | 原生 TTS | Web Speech |
|------|-----------|----------|------------|
| 网络依赖 | ✅ 需要 | ❌ 离线 | ❌ 离线 |
| 语音品质 | 🔴 极高（神经网络） | 🟡 系统默认 | 🟡 浏览器默认 |
| 音色选择 | 20+ 种 | 系统提供 | 浏览器提供 |
| 角色风格 | 助手/聊天/新闻等 | 无 | 无 |
| 预加载缓存 | ✅ | ❌ | ❌ |
| 句子边界事件 | ✅ | 视系统而定 | 视浏览器而定 |
| 适用平台 | 全平台 | APP 端 | Web 端 |

---

## 3. 双模式播放

### 3.1 段落模式（默认）

**行为**：逐句朗读当前段落，句子级高亮

```
用户点击段落
    ↓
提取段落文本 → 分句
    ↓
逐句 speakCurrent() → 高亮当前句子
    ↓
句子结束 → boundary 事件 → 下一句
    ↓
段落结束 → 自动滚动到下一段落 → 继续
```

**特点**：
- 精确到句子的高亮（依赖引擎的 `boundary` 事件）
- 若引擎不支持 boundary，回退到段落级高亮 + 固定延迟
- 支持跨段落自动衔接

### 3.2 页面模式（长按触发）

**行为**：整页连续朗读，解决熄屏间隔问题

```
用户长按 TTS 按钮
    ↓
标记 isPageMode = true
    ↓
计算当前页所有文本 → 合并为长文本
    ↓
一次性 speakCurrent() → 整页连续播放
    ↓
页面结束 → 自动翻页 → 继续下一页
```

**特点**：
- 适合"听书"场景，不需要看屏幕
- 减少频繁的句子 boundary 事件处理开销
- 解决某些引擎在句子间有明显停顿的问题

### 3.3 模式切换

| 操作 | 段落模式 | 页面模式 |
|------|---------|---------|
| **启动** | 短按 TTS 按钮 / 点击段落 | 长按 TTS 按钮 (>500ms) |
| **暂停** | 再次短按 | 再次长按 |
| **高亮粒度** | 句子级 | 段落级 |
| **翻页行为** | 读完当前段落后手动/自动滚动 | 读完当前页面后自动翻页 |

---

## 4. APP 端保活机制

### 4.1 多层保活架构

APP 端 TTS 面临的核心挑战：**系统电池优化会在后台杀死 TTS 进程**。

```
┌─────────────────────────────────────────────┐
│              APP 保活多层防御                  │
├─────────────────────────────────────────────┤
│                                              │
│  第一层：前台服务通知                          │
│  ├─ startService() → 系统通知栏显示"正在朗读"  │
│  └─ 通知栏带播放控制按钮                       │
│                                              │
│  第二层：定期心跳                              │
│  ├─ 每 5 秒 updateTTSBackground('update')     │
│  └─ 防止系统判定为"闲置进程"                   │
│                                              │
│  第三层：合成器卡住检测                         │
│  ├─ 每 2 秒检查 synth.paused/speaking/pending │
│  └─ 卡住超 5 秒强制 speakCurrent()            │
│                                              │
│  第四层：定时器聚合                             │
│  ├─ _speakAfter(ms) 先 clear 再 setTimeout    │
│  └─ 避免多个 speakCurrent 并发导致状态混乱      │
│                                              │
└─────────────────────────────────────────────┘
```

### 4.2 前台服务生命周期

```javascript
setBackgroundService(enable, title) {
    if (enable) {
        // 启动前台服务
        TTSBackground.startService();
        TTSBackground.updatePlaying({ isPlaying: true, title });
        
        // 启动心跳
        this.startServiceKeepAlive();
        
        // 首次启动时检查 ROM 引导
        this.checkBatteryOptimization();
    } else {
        // 停止前台服务
        this.stopServiceKeepAlive();
        TTSBackground.updatePlaying({ isPlaying: false });
        TTSBackground.stopService();
    }
}
```

### 4.3 心跳机制

```javascript
startServiceKeepAlive() {
    this._keepAliveTimer = setInterval(() => {
        // 每 5 秒更新通知栏，保持服务活跃
        this.updateTTSBackground('update');
    }, 5000);
}
```

---

## 5. ROM 引导弹窗

### 5.1 问题背景

不同 Android ROM（小米、华为、OPPO、vivo、三星等）对后台服务的限制策略各不相同。用户需要手动将应用加入电池优化白名单，否则 TTS 后台服务会被系统杀死。

### 5.2 引导流程

```
首次启动 TTS 后台服务
    ↓
checkBatteryOptimization()
    ↓
已展示过？（ConfigManager.get('meta.romGuideShown')）
    ├─ 是 → 跳过
    └─ 否 → 检测 ROM 品牌
              ↓
        显示定向引导弹窗
              ↓
        用户点击"去设置"
              ↓
        标记已展示（meta.romGuideShown = true）
```

### 5.3 ROM 检测

```javascript
_detectROM() {
    // 通过原生插件获取 ROM 品牌（WebView UA 不可靠）
    const brand = Capacitor.Plugins.TTSBackground.getROMBrand();
    // 返回：'xiaomi' | 'huawei' | 'oppo' | 'vivo' | 'samsung' | 'generic'
}
```

### 5.4 持久化

- **Key**: `meta.romGuideShown`
- **位置**: `Lumina.ConfigManager`
- **行为**: 首次展示后写入，生命周期内不再打扰

---

## 6. 核心 API

### 6.1 生命周期控制

| 方法 | 说明 |
|------|------|
| `start()` | 启动段落模式（从当前可见位置或选中文本开始） |
| `stop()` | 停止播放，重置状态，清理所有定时器和后台服务 |
| `toggle()` | 播放中→停止，未播放→根据当前模式启动 |
| `toggleParagraphMode()` | 短按触发：段落模式开关 |
| `togglePageMode()` | 长按触发：页面模式开关 |
| `restartIfPlaying()` | 设置变更后，若正在播放则自动重启 |

### 6.2 设置控制

| 方法 | 说明 |
|------|------|
| `updateSettings(key, value)` | 修改语音设置（`voice`/`rate`/`pitch`/`volume`），自动重启 |
| `setBackgroundService(enable, title)` | 启停后台前台服务 |
| `clearPluginEngine()` | 手动清除 Azure 引擎缓存 |

### 6.3 内部方法

| 方法 | 说明 |
|------|------|
| `speakCurrent()` | 引擎分发入口，自动选择可用引擎 |
| `speakWithPlugin(text, engine)` | Azure TTS 插件调用 |
| `speakCurrentNative(text)` | 原生 TTS 调用 |
| `_speakWithSystemTTS(text)` | Web Speech API 调用 |
| `_speakAfter(ms)` | 聚合 setTimeout，避免并发 |
| `extractItemText(item)` | 从渲染项提取纯文本 |
| `splitIntoSentences(text)` | 智能分句（支持中英文） |

### 6.4 配置项

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `tts.rate` | number | 10 | 语速（1-10，运行时转为 0.1-2.0） |
| `tts.pitch` | number | 10 | 音调（1-10，运行时转为 0.1-2.0） |
| `tts.voiceURI` | string | null | Web 端选中的 voiceURI |
| `tts.volume` | number | 1.0 | 音量（0-1） |
| `meta.romGuideShown` | boolean | false | ROM 引导弹窗是否已展示 |

---

## 7. 事件与状态同步

### 7.1 无自定义事件系统

TTS 模块**未使用** `dispatchEvent` / `CustomEvent` / 观察者模式。状态同步通过**直接调用**完成：

| 调用目标 | 用途 |
|---------|------|
| `Lumina.UI.showToast(msg)` | 播放状态提示 |
| `Lumina.Renderer.renderCurrentChapter()` | 自动翻页 |
| `Lumina.ConfigManager.set/get()` | 配置读写 |
| DOM class 操作 | `.tts-highlight` / `.tts-sentence-highlight` / `.tts-active` |

### 7.2 边界检测自适应

```javascript
// 三态检测引擎的 boundary 支持能力
supportsBoundary: true   // 明确支持（Azure、部分原生）
supportsBoundary: false  // 明确不支持（部分 Web Speech）
supportsBoundary: undefined // 未知，首次播放后检测

// 若 300ms 内未收到 boundary 事件，自动降级为段落级高亮
```

---

## 8. 故障排查

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| TTS 播放几秒后停止 | 系统电池优化杀死后台服务 | 按 ROM 引导弹窗设置白名单 |
| Azure TTS 不工作 | 网络问题 / 密钥错误 | 检查网络、确认 speechKey 和 region |
| 句子高亮不准确 | 引擎不支持 boundary 事件 | 正常现象，已自动降级为段落级高亮 |
| 页面模式翻页不顺畅 | 翻页动画与 TTS 节奏冲突 | 使用 `pauseForAction()` 暂停→翻页→恢复 |
| Web 端无声音 | 浏览器未授权 / 不支持 Web Speech | 检查浏览器权限、换用 Chrome/Edge |
| 多个句子同时播放 | setTimeout 未清理 | `_speakAfter()` 已聚合处理，若仍发生请检查 `stop()` 是否被调用 |

---

*本文档由开发团队维护，对应代码版本 v2.1.2。*
