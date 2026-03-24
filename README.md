# Lumina Reader 流萤阅读器

一款跨平台的沉浸式文档阅读器，支持 Web 和 Android App。

## 项目结构

```
LuminaReader/
├── app/                    # Android App (Capacitor)
│   ├── android/           # Android 原生项目
│   ├── www/               # Web 资源（与 Web 端共享）
│   │   ├── index.html     # 主页面
│   │   ├── css/           # 样式文件
│   │   ├── js/            # JS 模块
│   │   └── assets/        # 静态资源
│   ├── package.json       # Node 依赖
│   └── capacitor.config.json
├── web/                    # Web Python 服务端
│   ├── server.py          # Flask/FastAPI 服务器
│   ├── reader.html        # Web 版阅读器
│   ├── toyou.html         # 备用页面
│   └── start.bat          # Windows 启动脚本
├── data/                   # 数据文件（可选）
└── .gitignore             # Git 忽略规则
```

## 开发指南

### Web 端开发
```bash
cd web
python server.py
# 访问 http://localhost:5000
```

### Android App 开发
```bash
cd app
# 安装依赖
npm install

# 同步到 Android
npx cap sync android

# 构建 Debug APK
cd android
./gradlew assembleDebug
```

### 代码共享
- Web 和 App **共享同一套前端代码**（`app/www/`）
- 修改 `app/www/` 下的代码后：
  - Web：直接刷新浏览器
  - App：运行 `npx cap copy` 同步到 Android

## 技术栈

- **前端**：HTML5 + CSS3 + Vanilla JS
- **Android**：Capacitor 6 + Android SDK
- **Web 后端**：Python + Flask/FastAPI
- **存储**：IndexedDB / Capacitor SQLite

## Git 仓库

```bash
# 初始化
git init
git remote add origin https://gitee.com/boyryan85/lumina-reader.git

# 提交
git add .
git commit -m "Initial commit"
git push -u origin master
```
