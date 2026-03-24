# Lumina Reader 流萤阅读器

一款跨平台的沉浸式文档阅读器，支持 Web 和 Android App。

## 项目结构

```
LuminaReader/
├── app/                    # Android App (Capacitor 6)
│   ├── android/           # Android 原生项目
│   ├── www/               # Web 资源（与 Web 端共享）
│   │   ├── index.html     # 主页面
│   │   ├── css/           # 样式文件
│   │   ├── js/            # JS 模块 (00-15)
│   │   └── assets/        # 静态资源
│   ├── package.json       # Node 依赖
│   └── capacitor.config.json
├── web/                    # Web Python 服务端
│   ├── server.py          # Flask/FastAPI 服务器
│   ├── reader.html        # Web 版阅读器
│   ├── toyou.html         # 备用页面
│   └── start.bat          # Windows 启动脚本
├── scripts/                # 开发工具脚本
├── .vscode/               # VS Code 配置
└── .gitignore             # Git 忽略规则
```

## 快速开始

### 1. Web 端开发

```bash
# 进入 Web 目录
cd web

# 安装依赖（首次）
pip install flask

# 启动服务器
python server.py
# 或双击 start.bat

# 访问 http://localhost:5000
```

### 2. Android App 开发

```bash
# 进入 App 目录
cd app

# 安装依赖（首次）
npm install

# 同步 Web 资源到 Android
npx cap sync android

# 打开 Android Studio
npx cap open android

# 构建 Debug APK
cd android
.\gradlew.bat assembleDebug
```

## 双端同步开发工作流

### 核心原则
**`app/www/` 目录是 Web 和 Android 的共享代码库**

### 开发流程

#### 方式一：优先开发 Web
```bash
# 1. 在 web/reader.html 开发新功能
# 2. 浏览器测试通过后，同步到 App

# 同步命令
copy web\reader.html app\www\index.html

# 然后同步到 Android
cd app
npx cap copy
```

#### 方式二：优先开发 App（推荐）
```bash
# 1. 直接在 app/www/ 修改代码
# 2. 浏览器打开 app/www/index.html 测试
# 3. 同步到 Android
cd app
npx cap copy

# 4. 如需同步回 Web
copy app\www\index.html web\reader.html
```

### 关键文件对应关系

| Web 文件 | App 文件 | 说明 |
|---------|---------|------|
| `web/reader.html` | `app/www/index.html` | 主页面 |
| `web/css/main.css` | `app/www/css/main.css` | 样式文件 |
| `web/js/modules/` | `app/www/js/modules/` | JS 模块 |

### Capacitor 命令速查

```bash
cd app

# 同步 Web 资源（修改 www/ 后执行）
npx cap copy

# 同步并更新原生插件
npx cap sync

# 打开 Android Studio
npx cap open android

# 运行到设备
npx cap run android
```

## Git 工作流

```bash
# 克隆仓库
git clone https://gitee.com/boyryan85/lumina-reader.git
cd lumina-reader

# 日常开发
git pull                    # 拉取最新代码
git add .
git commit -m "feat: xxx"
git push

# 分支管理（推荐）
git checkout -b feature/xxx  # 创建功能分支
git checkout master          # 切换回主分支
git merge feature/xxx        # 合并分支
```

## 技术栈

- **前端**：HTML5 + CSS3 + Vanilla JS（模块化架构）
- **Android**：Capacitor 6 + Android SDK 34
- **Web 后端**：Python 3 + Flask
- **存储**：IndexedDB (Web) / Capacitor SQLite (App)
- **字体**：霞鹜文楷 (LXGW WenKai)

## 功能特性

- [x] 多格式支持：DOCX, TXT, Markdown, HTML, PDF
- [x] 智能章节检测与层级识别
- [x] 20+ 主题配色
- [x] 字体切换与动态加载
- [x] 全文搜索与快速定位
- [x] TTS 语音朗读
- [x] 书签与注释管理
- [x] G点热力图
- [x] 本地书库管理
- [x] 分页阅读模式
- [x] 安全区域适配（刘海屏）

## 注意事项

1. **不要直接修改** `app/android/` 下的 Web 资源，这些是通过 `npx cap copy` 自动生成的
2. **字体文件**较大（~10MB），提交时请注意 Git 仓库大小
3. **node_modules** 和 **__pycache__** 已加入 .gitignore，不会提交

## License

MIT License © 2024
