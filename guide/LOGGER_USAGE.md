# Logger 日志系统使用指南

## 概述

流萤阅读器内置了文件日志系统，可以自动捕获和保存应用运行时的日志信息，方便开发者排查问题。日志文件存储在 `Documents/LuminaReader/logs/` 目录下，可以直接通过文件管理器查看。

## 特性

- ✅ **自动捕获**：自动捕获所有 `console.log` 输出
- ✅ **分类标签**：支持按模块/功能分类记录
- ✅ **多级日志**：支持 debug、info、warn、error 四个级别
- ✅ **文件管理**：自动按天分割文件，保留最近7天日志
- ✅ **离线查看**：日志保存在 Documents 目录，无需 root 即可查看
- ✅ **权限容错**：APP 重装后自动处理文件权限问题，复用可写日志文件
- ✅ **生命周期监听**：监听 APP 前后台切换和退出事件

---

## 使用方法

### 1. 自动记录（推荐）

**无需修改代码**，继续使用 `console.log`，所有输出会自动保存到日志文件：

```javascript
// 这些都会自动记录到日志文件
console.log('普通调试信息');
console.info('信息提示');
console.warn('警告信息');
console.error('错误信息');
console.debug('调试信息');
```

**注意**：`console.error` 传入对象时会自动序列化为 JSON 字符串，避免显示 `[object Object]`

### 2. 手动记录（分类标签）

需要按功能模块分类记录时，使用 `logger` 对象（小写）：

```javascript
// 基础用法
logger.info('Database', '数据库初始化完成');
logger.warn('Network', '请求超时，正在重试');
logger.error('Import', '导入失败', { error: err.message });
logger.debug('Render', '渲染耗时', { time: 23 });
```

### 3. 方法说明

| 方法 | 级别 | 用途 | 控制台显示 |
|------|------|------|-----------|
| `logger.debug(tag, message, extra)` | debug | 详细调试信息 | 灰色 |
| `logger.info(tag, message, extra)` | info | 一般信息 | 普通 |
| `logger.warn(tag, message, extra)` | warn | 警告信息 | 黄色 |
| `logger.error(tag, message, extra)` | error | 错误信息 | 红色 |

**参数说明：**
- `tag`：分类标签，如 'Database'、'Network'、'UI' 等
- `message`：日志内容
- `extra`（可选）：附加数据对象，会自动序列化为 JSON

---

## 日志文件位置

### APP 环境
日志文件保存在外部存储的 Documents 目录：

```
Documents/
└── LuminaReader/
    └── logs/
        ├── app_2026-04-12.log
        ├── app_2026-04-12_abc123.log  (权限问题时的备选文件)
        ├── app_2026-04-11.log
        └── ...
```

### 文件命名策略

| 场景 | 文件名格式 | 说明 |
|------|-----------|------|
| 正常情况 | `app_YYYY-MM-DD.log` | 每天的默认日志文件 |
| 权限问题 | `app_YYYY-MM-DD_xxx.log` | APP 重装后原文件不可写时创建 |

**权限容错机制：**
- APP 重装后，之前创建的日志文件可能因权限变更而无法写入
- 系统会自动检测并复用今天已有的可写文件，或创建带随机后缀的新文件
- 同一天内的多次启动会复用同一个带后缀的文件，避免创建过多文件

### 查看方式

1. **文件管理器**：直接访问 `Documents/LuminaReader/logs/`
2. **ADB 命令**：
   ```bash
   adb shell cat /sdcard/Documents/LuminaReader/logs/app_2026-04-12.log
   ```
3. **手机连接电脑**：通过 USB 或微信传输文件查看

---

## 日志格式

日志文件为纯文本格式，每行一条记录：

```
[2026-04-12 10:30:45] [INFO] [Database] 数据库初始化完成
[2026-04-12 10:30:46] [WARN] [Network] 请求超时，正在重试
[2026-04-12 10:30:47] [ERROR] [Import] 导入失败 | {"error":"文件格式错误"}
[2026-04-12 10:30:48] [INFO] [Logger] APP 进入后台
[2026-04-12 10:30:52] [INFO] [Logger] APP 回到前台
```

格式说明：
- **时间戳**：本地时间格式 `YYYY-MM-DD HH:mm:ss`
- 日志级别（DEBUG/INFO/WARN/ERROR）
- 标签（分类标识）
- 消息内容
- 附加数据（JSON 格式，可选）

**时间格式变更说明**：
- 旧版本使用 ISO 8601 UTC 格式 (`2026-04-12T10:30:45.123Z`)
- 当前版本使用本地时间格式，更便于阅读

---

## 使用示例

### 示例 1：数据库操作

```javascript
// 记录数据库初始化
logger.info('Database', 'SQLite 数据库初始化开始');

try {
    await db.init();
    logger.info('Database', 'SQLite 数据库初始化成功');
} catch (err) {
    logger.error('Database', 'SQLite 数据库初始化失败', { 
        error: err.message,
        stack: err.stack 
    });
}
```

### 示例 2：网络请求

```javascript
logger.info('Network', '开始请求', { url: '/api/books' });

fetch('/api/books')
    .then(res => {
        logger.info('Network', '请求成功', { 
            url: '/api/books',
            status: res.status 
        });
    })
    .catch(err => {
        logger.error('Network', '请求失败', { 
            url: '/api/books',
            error: err.message 
        });
    });
```

### 示例 3：性能监控

```javascript
const startTime = performance.now();

// 执行某些操作...
await loadBookContent();

const duration = Math.round(performance.now() - startTime);
logger.debug('Performance', '加载书籍内容耗时', { 
    duration: duration + 'ms',
    bookId: book.id 
});
```

### 示例 4：APP 生命周期追踪

```javascript
// 这些日志会自动记录，无需手动调用
[2026-04-12 08:00:00] [INFO] [Init] APP 启动...
[2026-04-12 08:00:02] [INFO] [Logger] 复用今天日志文件: app_2026-04-12_wa5435.log
[2026-04-12 08:00:03] [INFO] [Init] 应用启动完成
[2026-04-12 08:30:15] [INFO] [Logger] APP 进入后台
[2026-04-12 08:30:15] [INFO] [Logger] APP 暂停（进入后台）
[2026-04-12 08:31:20] [INFO] [Logger] APP 恢复（回到前台）
[2026-04-12 08:31:20] [INFO] [Logger] APP 回到前台
```

---

## 配置说明

日志系统的配置在 `app/www/assets/js/app/logger.js` 中：

```javascript
config: {
    enabled: true,                    // 是否启用日志
    logDir: 'LuminaReader/logs',      // 日志目录（Documents下）
    maxFiles: 7,                      // 保留最近7天日志
    maxFileSize: 5 * 1024 * 1024,     // 单个文件最大5MB
    consoleOutput: true,              // 同时输出到控制台
    logLevel: 'info'                  // 最低记录级别
}
```

**日志级别优先级：** `debug` < `info` < `warn` < `error`

设置为 `info` 时，debug 级别的日志不会写入文件。

---

## 自动捕获的错误

以下错误会被 **自动捕获并记录**，无需手动调用：

1. **未处理的 Promise 错误**
   ```javascript
   Promise.reject(new Error('错误'));
   // 自动记录到日志
   ```

2. **全局 JS 错误**
   ```javascript
   throw new Error('未捕获的错误');
   // 自动记录到日志
   ```

3. **所有 console 输出**
   ```javascript
   console.error('手动错误');  // 自动记录
   console.warn('警告');       // 自动记录
   console.log('日志');        // 自动记录
   ```

4. **APP 生命周期事件**
   - APP 进入后台 / 回到前台
   - APP 暂停 / 恢复
   - APP 即将退出

---

## 日志管理 API

```javascript
// 获取日志文件列表（最近7天）
const files = await logger.getLogFiles();
// 返回: [{ name: 'app_2026-04-12.log', ... }, ...]

// 读取指定日志内容
const content = await logger.readLog('app_2026-04-12.log');

// 导出日志（合并最近3天为单个文件）
const exportPath = await logger.exportLogs();
// 返回: 'logs_export_2026-04-12T08-30-00-000Z.txt'
```

---

## 注意事项

1. **日志文件大小**：单个日志文件最大 5MB，超过后会自动创建新文件
2. **保留时间**：默认保留最近 7 天的日志，旧日志会自动清理
3. **性能影响**：日志写入是异步的，对应用性能影响极小
4. **隐私安全**：日志中可能包含用户数据，分享日志时注意脱敏
5. **权限处理**：APP 重装后会自动处理文件权限问题，无需手动干预

---

## 故障排查

### 找不到日志文件？

1. 确认 APP 已获取存储权限
2. 检查 `Documents/LuminaReader/logs/` 目录是否存在
3. 重启 APP 后等待几分钟，日志是批量写入的

### 日志没有内容？

1. 检查 `logger.js` 是否正确加载（控制台输入 `window.logger` 查看）
2. 确认日志级别设置（`logLevel` 配置）
3. 查看控制台是否有 `[logger]` 开头的初始化日志

### 日志文件太多？

如果发现很多带后缀的文件（如 `app_2026-04-12_abc.log`），这是正常的权限容错机制。系统会：
- 自动复用今天已有的可写文件
- 保留最近 7 天的日志，旧文件会自动清理

如需手动清理，可以删除整个 `logs` 目录，系统会自动重建。

---

## 版本记录

- **v1.1** (2026-04-12): 
  - 时间戳格式改为本地时间 `YYYY-MM-DD HH:mm:ss`
  - 新增权限容错机制，APP 重装后自动复用或创建新日志文件
  - 新增 APP 生命周期监听（前后台切换、退出）
  - 优化 console.error 对象序列化
- **v1.0** (2026-04-10): 初始版本，支持文件日志和 console 拦截
