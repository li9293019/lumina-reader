# Lumina Reader 流萤阅读器

一款跨平台的沉浸式文档阅读器，支持 Web 和 Android App。

## 项目结构

```
LuminaReader/
├── app/                          # Android App + Web 共享前端
│   ├── android/                 # Android 原生项目
│   ├── www/                     # 【核心】Web 前端代码（Web/App 共享）
│   │   ├── index.html           # 主页面
│   │   ├── css/
│   │   │   ├── main.css        # 主样式文件
│   │   │   └── markdown.css    # Markdown 插件样式
│   │   ├── js/
│   │   │   ├── modules/        # 核心模块
│   │   │   │   ├── plugin-manager.js    # 【新增】插件系统管理器
│   │   │   │   ├── namespace.js         # 命名空间初始化
│   │   │   │   ├── config.js            # 配置文件
│   │   │   │   ├── utils.js             # 工具函数
│   │   │   │   ├── i18n.js              # 国际化
│   │   │   │   ├── parser.js            # 文件解析器
│   │   │   │   ├── chapter.js           # 章节管理
│   │   │   │   ├── renderer.js          # 渲染引擎
│   │   │   │   ├── actions.js           # 操作事务
│   │   │   │   ├── ui.js                # UI 交互
│   │   │   │   ├── annotations.js       # 批注系统
│   │   │   │   ├── tts.js               # 语音朗读
│   │   │   │   ├── db.js                # 数据存储
│   │   │   │   ├── data-manager.js      # 书库管理
│   │   │   │   ├── settings.js          # 设置
│   │   │   │   ├── exporter.js          # 导入导出
│   │   │   │   └── init.js              # 初始化
│   │   │   └── plugins/        # 【新增】插件目录
│   │   │       └── markdown/            # Markdown 富文本渲染插件
│   │   │           ├── markdown.plugin.js      # 插件入口
│   │   │           ├── markdown.parser.js      # Markdown 解析器
│   │   │           ├── markdown.renderer.js    # Markdown 渲染器
│   │   │           ├── lib/              # 插件依赖
│   │   │           │   └── prism/        # 代码高亮库
│   │   │           │       ├── prism.min.js
│   │   │           │       ├── themes/   # 代码高亮主题（6种）
│   │   │           │       └── components/  # 语言组件（16种）
│   │   │           └── themes/           # 插件主题（可选）
│   │   └── assets/             # 字体、JS 库等静态资源
│   ├── package.json           # Node 依赖
│   └── capacitor.config.json
├── web/                        # Web 服务器
│   ├── server.py              # Python HTTP 服务器
│   ├── start.bat              # Windows 启动脚本
│   └── data/                  # 运行时数据（SQLite/书籍，自动创建）
└── reference/                  # 参考文件（不提交 Git）
```

## 核心设计：一次编写，两处运行

**`app/www/` 是唯一的 Web 前端代码仓库**

- **App**：Capacitor 加载 `app/www/` 打包成 APK
- **Web**：`web/server.py` 直接服务 `app/www/` 目录

## 插件系统

**【新增】** 项目采用插件化架构，核心功能与扩展功能解耦：

```
js/plugins/
└── markdown/           # Markdown 插件示例
    ├── markdown.plugin.js     # 插件入口：注册钩子、初始化
    ├── markdown.parser.js     # 解析器：Markdown → 结构化数据
    ├── markdown.renderer.js   # 渲染器：结构化数据 → DOM
    └── lib/                   # 插件私有依赖
```

**插件机制：**
- `plugin-manager.js` 提供钩子系统（`beforeParse`, `createElement` 等）
- 插件通过钩子扩展功能，不影响核心代码
- 无插件时，Markdown 文件按纯文本解析，保持向后兼容

## 快速开始

### Web 端

```bash
cd web
start.bat
# 或：python server.py
# 访问 http://localhost:8080
```

### Android App

```bash
cd app

# 安装依赖（首次）
npm install

# 同步 Web 代码到 Android
npx cap sync android

# 构建 APK
cd android
.\gradlew.bat assembleDebug
```

## 开发工作流

### 修改前端代码

**所有前端修改都在 `app/www/` 进行**

### 测试

| 平台 | 方式 |
|-----|------|
| Web | 运行 `web/start.bat`，浏览器打开 `http://localhost:8080` |
| App | `npx cap open android` → Android Studio 运行 |

### 同步

修改 `app/www/` 后同步到 Android：

```bash
cd app
npx cap copy
```

**不需要手动复制到 web/，server.py 自动读取 `app/www/`**

## Git 提交

```bash
# 克隆
git clone https://gitee.com/boyryan85/lumina-reader.git

# 日常提交
git add .
git commit -m "feat: xxx"
git push
```

### 不提交的文件

- `node_modules/` - Node 依赖
- `__pycache__/` - Python 缓存  
- `web/data/` - 运行时数据（书籍、数据库）
- `reference/` - 本地参考文件
- `*.rar`, `*.zip` - 压缩包

## 技术栈

- **前端**：HTML5 + CSS3 + Vanilla JS（模块化）
- **Android**：Capacitor 6 + Android SDK
- **Web 服务器**：Python 3 标准库（http.server）
- **存储**：IndexedDB (Web) / SQLite (App)
- **插件系统**：基于钩子的事件驱动架构
- **代码高亮**：PrismJS（按需加载语言组件）

## 功能特性

- [x] 多格式支持：DOCX, TXT, Markdown, HTML, PDF
- [x] **Markdown 富文本渲染**（标题、列表、代码块、表格等）
- [x] **代码高亮**（16种语言，6种主题，自动匹配阅读器主题）
- [x] 智能章节检测与层级识别
- [x] 20+ 主题配色
- [x] 字体切换（霞鹜文楷）
- [x] 全文搜索
- [x] TTS 语音朗读
- [x] 书签与注释
- [x] G点热力图
- [x] 本地书库管理
- [x] **插件化架构**（易于扩展）

## License

MIT License © 2024
