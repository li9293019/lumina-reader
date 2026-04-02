# Lumina Reader 加密机制技术文档

## 文档信息

- **版本**: 1.1
- **日期**: 2026-04-02
- **适用范围**: Web端、Android APP端
- **关联模块**: `crypto.js`, `data-manager.js`, `config-manager.js`

---

## 1. 架构概述

### 1.1 设计目标

Lumina Reader 的加密机制主要用于保护用户导出数据的安全性，支持：
- **书籍数据导出**: 单本书籍、批量书库的加密备份
- **配置数据导出**: 应用设置的加密备份
- **跨平台互通**: Web端与APP端导出的文件可以互相导入

### 1.2 核心模块

```
┌─────────────────────────────────────────────────────────────┐
│                     Crypto.js (核心加密层)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  AES-GCM    │  │  PBKDF2     │  │  密钥派生/管理       │  │
│  │  加密/解密   │  │  密钥派生   │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   DataManager (书籍)     │     │ ConfigManager (配置)    │
│  - 导出: base64文本(.lmn)│     │  - 导出: base64文本(.lmn)│
│  - 导入: 自动检测格式     │     │  - 导入: base64文本     │
└─────────────────────────┘     └─────────────────────────┘
```

---

## 2. 数据格式层次结构

### 2.1 文件格式层次

LMN 文件采用**双层结构**：外层是 base64 文本包装，内层是二进制加密数据。

```
LMN 文件 (最终存储/传输格式 - 文本)
└── base64 编码字符串
    └── 原始二进制数据
        ├── 38字节头部 (MAGIC + 版本 + 标志 + Salt + IV + 长度)
        └── N字节密文 (AES-GCM 加密数据)
            └── JSON 字符串 (原始明文数据)
```

### 2.2 为什么要加 base64 层？

| 优势 | 说明 |
|------|------|
| **跨平台兼容性** | 文本文件比二进制文件更容易在不同系统间传输 |
| **APP 环境要求** | Capacitor Filesystem 插件写入文件时需要 base64 编码 |
| **调试友好** | 可以文本编辑器查看，便于调试和排查问题 |
| **存储管理** | Android 文档目录下文本文件更易于管理和分享 |

### 2.3 文件体积变化

- **原始 JSON** → 100 KB
- **加密二进制** → ~100 KB (加密增加少量头部)
- **base64 编码后** → ~133 KB (增加约 33%)

---

## 3. 加密算法详解

### 3.1 算法栈

| 层级 | 算法 | 用途 |
|------|------|------|
| 对称加密 | AES-GCM-256 | 数据加密，提供认证加密(防止篡改) |
| 密钥派生 | PBKDF2 (100000轮) | 从用户密码派生加密密钥 |
| 哈希 | SHA-256 | 密钥生成、数据完整性校验 |

### 3.2 密码处理机制

**用户密码** → PBKDF2 派生 → AES-GCM 密钥

```javascript
// 密钥派生参数
{
    name: 'PBKDF2',
    salt: randomBytes(16),      // 每次随机生成
    iterations: 100000,          // 100000轮哈希
    hash: 'SHA-256'
}
```

**重要说明**：
- 用户未设置密码时，使用**固定字符串**派生默认密钥（具体值见源码）
- 固定默认密钥确保无密码文件可以跨平台互通
- 如需安全保护，**必须**设置用户密码

### 3.3 LMN 二进制格式

```
┌────────────────────────────────────────────────────────────┐
│  偏移  │  长度  │  内容                    │  说明          │
├────────────────────────────────────────────────────────────┤
│  0x00  │   4    │  "LMNA" (0x4C4D4E41)     │  魔数 (MAGIC)  │
│  0x04  │   1    │  0x01                    │  版本号        │
│  0x05  │   1    │  0x00/0x01               │  标志位(密码)  │
│  0x06  │  16    │  Salt (随机)              │  PBKDF2盐值    │
│  0x16  │  12    │  IV (随机)                │  AES-GCM IV    │
│  0x22  │   4    │  原始数据长度 (uint32)    │  小端序        │
│  0x26  │   N    │  AES-GCM 密文            │  实际加密数据  │
│        │        │  (包含16字节认证标签)     │                │
└────────────────────────────────────────────────────────────┘
总头部: 38字节
```

## 4. 文件格式规范与编解码流程

### 4.1 导出文件格式对照

| 类型 | 扩展名 | Web端格式 | APP端格式 | 说明 |
|------|--------|-----------|-----------|------|
| 书籍单本 | .lmn | **base64文本** | **base64文本** | 统一格式 |
| 书籍批量 | .lmn | **base64文本** | **base64文本** | 统一格式 |
| 配置数据 | .lmn | **base64文本** | **base64文本** | 统一格式 |
| 明文书籍 | .json | JSON文本 | JSON文本 | 流式写入 |
| 明文配置 | .json | JSON文本 | JSON文本 | 直接文本 |

### 4.2 编解码流程

**导出时（对象 → 文件）**:
```
原始数据 (JSON对象)
    ↓ JSON.stringify()
JSON 字符串
    ↓ Crypto.encrypt()
LMN 二进制 (含38字节头部)
    ↓ base64 编码
base64 字符串
    ↓ 写入文件
.lmn 文本文件
```

**导入时（文件 → 对象）**:
```
.lmn 文本文件
    ↓ 读取文本
base64 字符串
    ↓ base64 解码
LMN 二进制
    ↓ Crypto.decrypt()
JSON 字符串
    ↓ JSON.parse()
原始数据 (JSON对象)
```

---

## 5. 魔数(MAGIC)设计说明

### 5.1 魔数的作用

魔数 `"LMNA"` 位于文件开头 4 字节，具有以下作用：

| 作用 | 说明 |
|------|------|
| **格式识别** | 快速判断文件是否为 LMN 格式，避免对非 LMN 文件尝试解密 |
| **版本管理** | 支持未来加密算法升级时向后兼容 |
| **密码标志** | 第 5 字节标志位可在不解密情况下知道是否需要密码 |

### 5.2 魔数与安全性的关系

**重要澄清**：
- 魔数**不是**安全措施，而是工程实践中的"最佳实践"
- 暴露魔数不会降低加密强度（没有密钥仍然无法解密）
- 魔数帮助提供**更好的错误提示**（"无效格式"vs"密码错误"）

**对专业人士**：
- base64 解码后直接可见 "LMNA"，反而降低了格式识别难度
- 但这不影响安全性，因为加密强度取决于算法和密钥

**对普通用户**：
- 文本格式的文件比普通二进制文件更具迷惑性
- 但这只是"障眼法"，不是真正的安全保护

### 5.3 是否可以去掉魔数？

**可以，但不建议**：
- 去掉魔数会增加导入逻辑复杂度（需要试错解密）
- 错误提示会变得模糊（无法区分"格式错误"和"密码错误"）
- 失去版本升级能力（无法识别新旧格式）

**如果追求隐蔽性**：
- 可以将 `"LMNA"` 改为随机字节（派生自固定密钥）
- 这样既保留了工程价值，又无法一眼识别

---

## 6. base64 与安全性

### 6.1 base64 是编码，不是加密

**关键理解**：
```
base64 编码 = 可逆的字符转换（任何人都可以解码）
AES 加密 = 需要密钥才能解密（真正的安全保护）
```

base64 只是让二进制数据能以文本形式存储和传输，**不涉及任何安全性**。

### 6.2 base64 对安全分析的影响

**对安全研究人员**：
- base64 实际上**降低**了分析门槛
- 文本格式比二进制更容易被自动化工具扫描
- 解码后直接暴露二进制头部结构

**对普通用户**：
- 文本文件比普通二进制文件更具迷惑性
- 无法直接双击打开查看内容

### 6.3 真正的安全性来源

- **算法强度**: AES-GCM-256（目前认为是安全的）
- **密钥强度**: PBKDF2 100000轮派生
- **密码复杂度**: 用户设置的密码强度

**安全建议**：
- 如需安全保护，**必须**设置用户密码
- 不要依赖"文件格式隐蔽性"来保护敏感数据

---

## 7. 模块实现详解

### 7.1 Crypto.js (核心层)

```javascript
// 加密方法
async encrypt(data, password = null, onProgress = null)
// 输入: 任意对象 + 密码
// 输出: ArrayBuffer (LMN格式二进制)

// 解密方法
async decrypt(arrayBuffer, password = null, onProgress = null)
// 输入: ArrayBuffer (LMN格式二进制) + 密码
// 输出: 解密后的对象

// 文件检测
isLmnFile(arrayBuffer)
// 检测前4字节是否为 "LMNA"
```

### 7.2 DataManager (书籍数据)

**导出流程**:
```javascript
// 1. 加密
const encryptedBuffer = await Lumina.Crypto.encrypt(data, password);

// 2. 转为base64
const base64Data = this.arrayBufferToBase64(encryptedBuffer);

// 3. 写入文件
await Filesystem.writeFile({ data: base64Data, encoding: 'utf8' });
```

**导入流程** (支持双格式兼容):
```javascript
// 1. 读取文本
const text = await file.text();

// 2. 检测格式
const isBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(text.replace(/\s/g, ''));

// 3. 获取二进制
const binary = isBase64 
    ? this.base64ToUint8Array(text)  // 新格式
    : new Uint8Array(await file.arrayBuffer());  // 旧格式兼容

// 4. 解密
const data = await Lumina.Crypto.decrypt(binary.buffer, password);
```

### 7.3 大文件分块处理 (APP端)

**问题**: 大文件 base64 编码后字符串过大，通过 Capacitor Bridge 时导致 OOM

**解决方案**:
```javascript
async writeLargeFileInChunks(filePath, arrayBuffer, chunkSize = 512 * 1024) {
    // 分块base64编码
    for (let offset = 0; offset < totalSize; offset += chunkSize) {
        const chunk = bytes.slice(offset, end);
        const base64Chunk = this.arrayBufferToBase64(chunk.buffer);
        
        // 追加写入
        await Filesystem.appendFile({
            path: filePath,
            data: base64Chunk,
            encoding: 'utf8'
        });
    }
}
```

---

## 8. 历史问题与解决方案

### 8.1 问题1: 格式混乱期

**时间**: 2026-04-02 之前

**现象**:
- Web端导出二进制LMN文件
- APP端导出base64文本LMN文件
- 两者无法互通

**解决方案**:
- 统一所有平台导出为base64文本格式
- 导入端自动检测格式(base64 vs 二进制)
- 保持对旧二进制文件的兼容

### 8.2 问题2: Capacitor Bridge OOM

**现象**: APP端批量导出大量书籍时闪退

**原因**: 一次性将整个ArrayBuffer转为base64字符串，通过Bridge时内存溢出

**解决方案**: 实现分块写入，每块512KB，多次append写入

### 8.3 问题3: 空密码处理不一致

**现象**: ConfigManager无密码导出文件无法解密

**原因**: 导出时传递空字符串 `""` 而非 `null`，导致加密标志位与密钥不匹配

**解决方案**: 统一使用 `password || null` 处理空密码

---

## 9. 开发规范与测试清单

### 9.1 添加新加密功能时

**必须遵循**:
1. 所有平台导出格式必须一致(base64文本)
2. 导入必须兼容旧格式(至少一个版本)
3. 大文件必须使用分块写入
4. 空密码必须显式转为 `null`

### 9.2 测试清单

新增加密功能后必须验证:
- [ ] Web端导出 → Web端导入
- [ ] Web端导出 → APP端导入
- [ ] APP端导出 → Web端导入
- [ ] APP端导出 → APP端导入
- [ ] 有密码文件导出/导入
- [ ] 无密码文件导出/导入
- [ ] 大文件(>50MB)导出不闪退
- [ ] 旧格式文件仍可导入

---

## 10. 附录

### 10.1 相关文件

| 文件 | 职责 |
|------|------|
| `app/www/js/modules/crypto.js` | 核心加密算法、LMN格式定义 |
| `app/www/js/modules/data-manager.js` | 书籍数据导出导入、分块写入 |
| `app/www/js/modules/config-manager.js` | 配置数据导出导入 |

### 10.2 参考资料

- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [AES-GCM](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams)
- [PBKDF2](https://developer.mozilla.org/en-US/docs/Web/API/Pbkdf2Params)
- [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem)

---

**文档维护**: 后续修改加密逻辑时，必须同步更新本文档。
