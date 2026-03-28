# Prism.js 语法高亮组件说明

本文档说明 Lumina Reader 中 Prism.js 语法高亮组件的管理方式。

## 当前已安装组件（33个）

### 核心组件
| 文件名 | 语言 | 大小 | 用途 |
|--------|------|------|------|
| `prism-markup.min.js` | Markup (HTML/XML) | 2.78 KB | 基础标记语言 |
| `prism-markdown.min.js` | Markdown | 5.02 KB | MD 文档高亮 |
| `prism-json.min.js` | JSON | 0.44 KB | 配置文件 |

### 编程语言
| 文件名 | 语言 | 大小 | 用途 |
|--------|------|------|------|
| `prism-c.min.js` | C | 1.85 KB | C 语言 |
| `prism-cpp.min.js` | C++ | 2.54 KB | C++ 语言 |
| `prism-csharp.min.js` | C# | 6.03 KB | .NET 开发 |
| `prism-java.min.js` | Java | 2.71 KB | Java 开发 |
| `prism-javascript.min.js` | JavaScript | 4.50 KB | Web 开发 |
| `prism-typescript.min.js` | TypeScript | 1.26 KB | 类型化 JS |
| `prism-python.min.js` | Python | 2.06 KB | Python 开发 |
| `prism-go.min.js` | Go | 0.95 KB | Go 语言 |
| `prism-rust.min.js` | Rust | 2.41 KB | Rust 开发 |
| `prism-kotlin.min.js` | Kotlin | 1.88 KB | Android/Kotlin |
| `prism-php.min.js` | PHP | 6.18 KB | Web 后端 |
| `prism-ruby.min.js` | Ruby | 3.43 KB | Ruby 开发 |
| `prism-lua.min.js` | Lua | 0.58 KB | 脚本语言 |
| `prism-asm6502.min.js` | 6502 Assembly | 0.84 KB | 汇编语言 |
| `prism-vbnet.min.js` | VB.NET | 1.68 KB | Visual Basic |

### 配置与脚本
| 文件名 | 语言 | 大小 | 用途 |
|--------|------|------|------|
| `prism-bash.min.js` | Bash/Shell | 6.00 KB | Shell 脚本 |
| `prism-powershell.min.js` | PowerShell | 2.09 KB | Windows 脚本 |
| `prism-yaml.min.js` | YAML | 1.92 KB | 配置文件 |
| `prism-toml.min.js` | TOML | 0.93 KB | 配置文件 |
| `prism-ini.min.js` | INI | 0.59 KB | 配置文件 |
| `prism-css.min.js` | CSS | 1.20 KB | 样式表 |
| `prism-sql.min.js` | SQL | 3.18 KB | 数据库查询 |
| `prism-regex.min.js` | Regex | 1.26 KB | 正则表达式 |
| `prism-makefile.min.js` | Makefile | 0.92 KB | 构建脚本 |
| `prism-gradle.min.js` | Gradle | 1.34 KB | Android 构建 |
| `prism-nginx.min.js` | Nginx | 0.71 KB | Web 服务器 |
| `prism-docker.min.js` | Docker | 1.49 KB | 容器配置 |

### 工具与格式
| 文件名 | 语言 | 大小 | 用途 |
|--------|------|------|------|
| `prism-git.min.js` | Git | 0.23 KB | 版本控制 |
| `prism-http.min.js` | HTTP | 1.82 KB | HTTP 协议 |
| `prism-diff.min.js` | Diff | 0.59 KB | 代码对比 |
| `prism-log.min.js` | Log | 2.44 KB | 日志文件 |

---

## 如何下载新的语言组件

### 方法一：使用 jsdelivr CDN（推荐）

Prism.js 官方组件托管在 jsdelivr CDN 上，下载地址格式：

```
https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-{语言标识}.min.js
```

**示例：**
- Docker: `https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-docker.min.js`
- C#: `https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-csharp.min.js`
- Swift: `https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-swift.min.js`

### 方法二：使用 cdnjs（备选）

```
https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-{语言标识}.min.js
```

### 方法三：从 GitHub 获取完整列表

1. 访问 Prism.js GitHub 仓库：
   ```
   https://github.com/PrismJS/prism/tree/v1.29.0/components
   ```

2. 或在线查看所有可用语言：
   ```
   https://prismjs.com/#supported-languages
   ```

---

## 常用语言标识速查表

| 语言 | 标识 | 下载地址示例 |
|------|------|--------------|
| Swift | `swift` | `prism-swift.min.js` |
| Dart | `dart` | `prism-dart.min.js` |
| Scala | `scala` | `prism-scala.min.js` |
| Haskell | `haskell` | `prism-haskell.min.js` |
| Clojure | `clojure` | `prism-clojure.min.js` |
| Erlang | `erlang` | `prism-erlang.min.js` |
| Elixir | `elixir` | `prism-elixir.min.js` |
| F# | `fsharp` | `prism-fsharp.min.js` |
| Groovy | `groovy` | `prism-groovy.min.js` |
| Perl | `perl` | `prism-perl.min.js` |
| R | `r` | `prism-r.min.js` |
| Matlab | `matlab` | `prism-matlab.min.js` |
| Arduino | `arduino` | `prism-arduino.min.js` |
| GraphQL | `graphql` | `prism-graphql.min.js` |
| JSX | `jsx` | `prism-jsx.min.js` |
| TSX | `tsx` | `prism-tsx.min.js` |
| Vue | `vue` | `prism-vue.min.js` |
| SASS/SCSS | `scss` | `prism-scss.min.js` |
| Less | `less` | `prism-less.min.js` |
| Stylus | `stylus` | `prism-stylus.min.js` |
| WebAssembly | `wasm` | `prism-wasm.min.js` |

---

## 下载命令示例（PowerShell）

```powershell
# 进入组件目录
cd "app\www\js\plugins\markdown\lib\prism\components"

# 下载单个组件
curl.exe -sL "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-swift.min.js" -o "prism-swift.min.js"

# 批量下载多个组件
$languages = @("swift", "dart", "scala", "haskell")
foreach ($lang in $languages) {
    curl.exe -sL "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-$lang.min.js" -o "prism-$lang.min.js"
    Write-Host "Downloaded: prism-$lang.min.js"
}
```

---

## 在 Markdown 中使用

安装组件后，代码块会自动高亮：

````markdown
```csharp
// C# 代码示例
public class Program {
    public static void Main() {
        Console.WriteLine("Hello, World!");
    }
}
```

```gradle
// Gradle 构建脚本
plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}

android {
    compileSdk 34
    defaultConfig {
        minSdk 24
        targetSdk 34
    }
}
```

```nginx
# Nginx 配置
server {
    listen 80;
    server_name example.com;
    location / {
        proxy_pass http://localhost:8080;
    }
}
```
````

---

## 版本信息

- **Prism.js 版本**: 1.29.0
- **最后更新**: 2026-03-28
- **组件总数**: 33 个

## 注意事项

1. 所有组件文件使用 `.min.js` 后缀（已压缩版本）
2. 组件大小在 0.2 KB - 6.5 KB 之间，对应用体积影响很小
3. 无需修改代码，Markdown 插件会自动按需加载对应语言的组件
4. 如果加载不存在的语言组件，会在控制台显示 404 错误，但不会影响其他功能
