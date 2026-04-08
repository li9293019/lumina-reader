# OpenCC 简繁转换数据

## 文件说明

此目录用于存放 OpenCC 简繁转换所需的字典数据文件。

## 需要的文件

### 方案1：使用官方 OpenCC 字典（推荐）

从 [OpenCC 官方仓库](https://github.com/BYVoid/OpenCC/tree/master/data) 下载：

```bash
# 配置文件
curl -O https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/config/s2t.json
curl -O https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/config/t2s.json

# 字典文件
curl -O https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/STCharacters.txt
curl -O https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/TSCharacters.txt
```

### 方案2：使用内置降级方案

如果不下载 OpenCC 字典，系统会自动使用内置的约1000个常用字的映射表。

## 配置说明

当前实现使用**字符级转换**（s2t/t2s），确保字数严格不变，以支持：
- TTS 句子级高亮对齐
- 注释位置精确匹配
- 搜索索引一致性

## 注意事项

1. 不使用地区化转换（如 s2tw、s2hk），因为词汇级转换会导致字数变化
2. 字符级转换足以满足阅读需求
3. 港台用户看到的"博客"而非"部落格"，但这不影响阅读理解
