// ==================== 元数据自动提取器 ====================
// 支持从文件名、文件头、文档结构等多维度自动识别书名和作者

Lumina.Parser.MetadataExtractor = {
    // 默认作者名称（当无法识别时使用）
    // 注意：实际显示值根据用户语言设置从 i18n 获取
    // 简中：佚名，繁中：佚名，英文：Anonymous
    DEFAULT_AUTHOR: '',
    
    // 文件名分隔符模式（用于从文件名提取书名和作者）
    // 【正则规则说明】
    // - ^(.+?)   ：非贪婪捕获任意字符（作者或书名部分）
    // - \s*      ：零或多个空白
    // - [-–—_]   ：匹配各种连字符（短横线、长横线、下划线）
    // - authorIndex/titleIndex ：指定捕获组对应的位置
    FILE_NAME_PATTERNS: [
        // 格式：作者 - 书名
        // 示例："金庸 - 天龙八部.txt" → author: "金庸", title: "天龙八部"
        { pattern: /^(.+?)\s*[-–—_]\s*(.+)$/, authorIndex: 1, titleIndex: 2 },
        
        // 格式：书名 - 作者（同上正则，但索引互换）
        // 示例："天龙八部 - 金庸.txt" → author: "金庸", title: "天龙八部"
        { pattern: /^(.+?)\s*[-–—_]\s*(.+)$/, authorIndex: 2, titleIndex: 1 },
        
        // 格式：作者_书名
        // 示例："金庸_天龙八部.txt" → author: "金庸", title: "天龙八部"
        { pattern: /^(.+?)_(.+)$/, authorIndex: 1, titleIndex: 2 },
        
        // 格式：[作者] 书名
        // 示例："[金庸] 天龙八部.txt" → author: "金庸", title: "天龙八部"
        { pattern: /^\[(.+?)\]\s*(.+)$/, authorIndex: 1, titleIndex: 2 },
        
        // 格式：(作者) 书名
        // 示例："(金庸) 天龙八部.txt" → author: "金庸", title: "天龙八部"
        { pattern: /^\((.+?)\)\s*(.+)$/, authorIndex: 1, titleIndex: 2 },
        
        // 格式：作者《书名》
        // 示例："金庸《天龙八部》.txt" → author: "金庸", title: "天龙八部"
        { pattern: /^(.+?)《(.+?)》$/, authorIndex: 1, titleIndex: 2 },
        
        // 格式：《书名》作者
        // 示例："《天龙八部》金庸.txt" → author: "金庸", title: "天龙八部"
        { pattern: /^《(.+?)》\s*(.+)$/, authorIndex: 2, titleIndex: 1 },
    ],
    
    // 常见作者名称关键词（用于内容识别时过滤）
    AUTHOR_KEYWORDS: [
        '著', '作者', 'writer', 'author', 'by', 'written by', '文',
        '编', '编著', '主编', '译', '翻译', '原著', '原作'
    ],
    
    // 需要过滤掉的常见无效书名/作者
    INVALID_TITLES: [
        '前言', '序言', '目录', 'contents', 'table of contents',
        '简介', 'introduction', 'preface', 'prologue', 'foreword',
        '说明', 'readme', 'readme.txt', '说明.txt', '新建文本文档',
        'untitled', '未命名', 'document', '文档', 'book', 'book1'
    ],
    
    INVALID_AUTHORS: [
        '未知', 'unknown', '佚名', 'anonymous', 'unk', 'n/a', 'na',
        '作者', 'author', 'writer', '著者', '编者', '编辑'
    ],

    /**
     * 主入口：从文件和解析结果中提取元数据
     * @param {File} file - 原始文件对象
     * @param {Object} parseResult - 解析结果 { items, type, coverImage? }
     * @param {string} rawText - 原始文本内容（TXT/Markdown 等）
     * @returns {Object} { title, author, confidence: {title, author} }
     */
    extract(file, parseResult, rawText = null) {
        const results = {
            title: null,
            author: null,
            source: { title: null, author: null },
            confidence: { title: 0, author: 0 }
        };
        
        const fileName = this.getFileNameWithoutExt(file.name);
        const candidates = [];
        
        // 1. 尝试从文件内容提取（优先级最高）
        if (rawText) {
            candidates.push({
                meta: this.extractFromContent(rawText, parseResult?.type),
                source: 'content',
                priority: 3
            });
        }
        
        // 2. 尝试从 EPUB/DOCX 专用 metadata 提取（如果有）
        if (parseResult?.epubMetadata) {
            candidates.push({
                meta: {
                    title: parseResult.epubMetadata.title,
                    author: parseResult.epubMetadata.author
                },
                source: 'epub',
                priority: 4 // EPUB metadata 优先级最高
            });
        }
        
        if (parseResult?.docxMetadata) {
            candidates.push({
                meta: {
                    title: parseResult.docxMetadata.title,
                    author: parseResult.docxMetadata.author
                },
                source: 'docx',
                priority: 4 // DOCX metadata 同样高优先级
            });
        }
        
        // 3. 尝试从文件名提取
        candidates.push({
            meta: this.extractFromFileName(fileName),
            source: 'filename',
            priority: 2
        });
        
        // 3. 尝试从解析结果的文档结构中识别
        if (parseResult?.items?.length > 0) {
            candidates.push({
                meta: this.extractFromStructure(parseResult.items),
                source: 'structure',
                priority: 1
            });
        }
        
        // 选择最佳结果
        results.title = this.selectBestCandidate(candidates, 'title');
        results.author = this.selectBestCandidate(candidates, 'author');
        
        // 记录来源
        const bestTitleCandidate = candidates.find(c => c.meta.title === results.title);
        const bestAuthorCandidate = candidates.find(c => c.meta.author === results.author);
        results.source.title = bestTitleCandidate?.source || 'default';
        results.source.author = bestAuthorCandidate?.source || 'default';
        
        // 【调试日志】记录提取结果和选择原因
        console.log('[MetadataExtractor] 提取候选:', candidates.map(c => ({
            source: c.source,
            priority: c.priority,
            title: c.meta.title?.substring(0, 30),
            titleValid: c.meta.title ? this.isValidTitle(c.meta.title) : false
        })));
        console.log('[MetadataExtractor] 最终选择:', {
            title: results.title?.substring(0, 30),
            source: results.source.title,
            confidence: results.confidence.title
        });
        
        // 计算置信度
        results.confidence.title = this.calculateConfidence(results.title, 'title', candidates);
        results.confidence.author = results.author ? this.calculateConfidence(results.author, 'author', candidates) : 0;
        
        // 如果没有识别到作者，返回空字符串而不是 null
        if (!results.author) {
            results.author = '';
        }
        
        return results;
    },

    /**
     * 从文件内容提取元数据（YAML Front Matter、特定格式等）
     * 
     * 【性能限制】只分析前100行非空文本，避免大文件卡顿
     * 【正则规则】参见文件顶部 REGEX_RULES 说明
     */
    extractFromContent(text, fileType) {
        const result = { title: null, author: null };
        
        if (!text) return result;
        
        // 【性能优化】只检查前 5000 字符，且最多前 100 行
        const sampleText = text.slice(0, 5000);
        const allLines = sampleText.split(/\r?\n/);
        // 取前100行非空行，避免大文件影响性能
        const lines = allLines
            .slice(0, 100)
            .map(l => l.trim())
            .filter(l => l.length > 0);
        
        // 1. 尝试解析 YAML Front Matter (--- ... ---)
        const yamlMeta = this.parseYAMLFrontMatter(sampleText);
        if (yamlMeta.title) result.title = yamlMeta.title;
        if (yamlMeta.author) result.author = yamlMeta.author;
        
        if (result.title && result.author) return result;
        
        // 2. 尝试解析特定格式的头部信息
        // 【正则说明】
        // - (?:书名|标题|title)  ：非捕获组，匹配"书名"或"标题"或"title"
        // - [：:]                ：匹配中文或英文冒号
        // - \s*                  ：匹配零或多个空白
        // - (.+?)                ：非贪婪捕获，捕获书名内容
        // - (?:\s|$)             ：非捕获组，匹配空白或行尾（结束条件）
        const headerPatterns = [
            // 中文格式：书名：XXX / 作者：XXX
            { 
                title: /(?:书名|标题|title)[：:]\s*(.+?)(?:\s|$)/i,
                author: /(?:作者|author|writer|by)[：:]\s*(.+?)(?:\s|$)/i
            },
            // EPUB/DOCX 内部 XML 格式残留（如复制粘贴时带入）
            // <dc:title>书名</dc:title> / <dc:creator>作者</dc:creator>
            {
                title: /<dc:title>(.+?)<\/dc:title>/i,
                author: /<dc:creator[^>]*>(.+?)<\/dc:creator>/i
            },
            // 简单的 Markdown 标题格式
            {
                title: /^#\s*(.+)$/m,
                author: null
            }
        ];
        
        for (const pattern of headerPatterns) {
            if (!result.title && pattern.title) {
                const match = sampleText.match(pattern.title);
                if (match) result.title = this.cleanTitle(match[1]);
            }
            if (!result.author && pattern.author) {
                const match = sampleText.match(pattern.author);
                if (match) result.author = this.cleanAuthor(match[1]);
            }
        }
        
        if (result.title && result.author) return result;
        
        // 3. 智能识别前 N 行
        // 如果第一行很短（<30字），可能是书名
        // 如果第二行包含"作者"或"著"，可能是作者
        if (!result.title && lines.length > 0) {
            const firstLine = lines[0];
            // 第一行如果是标题样式（短、居中、无标点）
            if (firstLine.length > 0 && firstLine.length <= 50 && !this.hasPunctuationEnd(firstLine)) {
                // 检查是否是章节标题（如"第一章"）
                if (!this.isChapterTitle(firstLine)) {
                    const cleanedTitle = this.cleanTitle(firstLine);
                    // 【关键】质量检查：只有标题质量过关才使用
                    if (this.isValidTitle(cleanedTitle)) {
                        result.title = cleanedTitle;
                    } else {
                        console.log('[MetadataExtractor] 第一行标题质量不佳，放弃使用:', firstLine);
                    }
                }
            }
        }
        
        if (!result.author && lines.length > 1 && result.title) {
            const secondLine = lines[1];
            // 第二行包含作者关键词
            if (this.containsAuthorKeyword(secondLine)) {
                const authorPart = this.extractAuthorFromLine(secondLine);
                if (authorPart) result.author = authorPart;
            }
        }
        
        // 【关键】最终质量检查：如果提取的标题质量不佳，清空它（让系统回退到文件名）
        if (result.title && !this.isValidTitle(result.title)) {
            console.log('[MetadataExtractor] 提取的标题质量不佳，回退到文件名:', result.title);
            result.title = null;
        }
        
        return result;
    },

    /**
     * 解析 YAML Front Matter
     */
    parseYAMLFrontMatter(text) {
        const result = { title: null, author: null };
        
        // 匹配 --- 开头和结尾的 YAML 块
        const yamlMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!yamlMatch) return result;
        
        const yamlContent = yamlMatch[1];
        
        // 提取 title
        const titleMatch = yamlContent.match(/^title:\s*(.+)$/m);
        if (titleMatch) {
            result.title = this.cleanTitle(titleMatch[1].replace(/^["']|["']$/g, ''));
        }
        
        // 提取 author/creator
        const authorPatterns = [
            /^author:\s*(.+)$/m,
            /^creator:\s*(.+)$/m,
            /^authors?:\s*\n\s*-\s*(.+)$/m
        ];
        
        for (const pattern of authorPatterns) {
            const match = yamlContent.match(pattern);
            if (match) {
                result.author = this.cleanAuthor(match[1].replace(/^["']|["']$/g, ''));
                break;
            }
        }
        
        return result;
    },

    /**
     * 从文件名提取元数据
     */
    extractFromFileName(fileName) {
        const result = { title: null, author: null };
        
        // 清理文件名
        let cleanName = fileName
            .replace(/\.(txt|md|docx|epub|pdf|html?)$/i, '')
            .replace(/[_\-]+$/g, '')
            .trim();
        
        // 尝试匹配各种模式
        for (const rule of this.FILE_NAME_PATTERNS) {
            const match = cleanName.match(rule.pattern);
            if (match) {
                const possibleAuthor = match[rule.authorIndex].trim();
                const possibleTitle = match[rule.titleIndex].trim();
                
                // 验证提取结果
                if (this.isValidTitle(possibleTitle) && this.isValidAuthor(possibleAuthor)) {
                    result.title = this.cleanTitle(possibleTitle);
                    result.author = this.cleanAuthor(possibleAuthor);
                    break;
                }
            }
        }
        
        // 如果没有匹配到，整个文件名作为书名
        if (!result.title && this.isValidTitle(cleanName)) {
            result.title = this.cleanTitle(cleanName);
        }
        
        return result;
    },

    /**
     * 从文档结构（标题、段落）提取元数据
     */
    extractFromStructure(items) {
        const result = { title: null, author: null };
        
        if (!items || items.length === 0) return result;
        
        // 查找前 10 个元素中的标题
        const firstItems = items.slice(0, 10);
        
        // 1. 查找 document title 或 level 1 heading
        const titleItem = firstItems.find(item => 
            item.type === 'title' || 
            (item.type === 'heading1' && item.level === 1)
        );
        
        if (titleItem && this.isValidTitle(titleItem.text)) {
            result.title = this.cleanTitle(titleItem.text);
        }
        
        // 2. 查找 subtitle 或包含作者信息的段落
        const subtitleItem = firstItems.find(item => 
            item.type === 'subtitle' ||
            (item.type === 'paragraph' && this.containsAuthorKeyword(item.text))
        );
        
        if (subtitleItem) {
            const authorPart = this.extractAuthorFromLine(subtitleItem.text);
            if (authorPart) {
                result.author = authorPart;
            }
        }
        
        return result;
    },

    // ==================== 工具方法 ====================

    getFileNameWithoutExt(fileName) {
        return fileName.replace(/\.[^/.]+$/, '');
    },

    /**
     * 清理标题文本
     * 【正则规则说明】
     * 1. /^[\s\[\](){}【】「」『』"'"'`]+|[\s\[\](){}【】「」『』"'"'`]+$/g
     *    - ^[...]+  ：匹配行首的空白或括号类符号（一个或多个）
     *    - |        ：或
     *    - [...]+$  ：匹配行尾的空白或括号类符号
     *    - 示例："《三体》" → "三体", "[小说]标题" → "标题"
     * 
     * 2. /\s+/g  → 将多个连续空白替换为单个空格
     */
    cleanTitle(title) {
        if (!title) return null;
        return title
            .replace(/^[\s\[\](){}【】「」『』"'"'`]+|[\s\[\](){}【】「」『』"'"'`]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    },

    /**
     * 清理作者文本
     * 【正则规则说明】
     * 1. /^[\s\[\](){}【】「」『』"'"'`\-–—:]+|[\s\[\](){}【】「」『』"'"'`\-–—:]+$/g
     *    - 比 title 多添加了 \-–—:（连字符和冒号）
     * 
     * 2. /(?:著|作者?|writer|author|by|文|编|译|译著)$/i
     *    - (?:...)  ：非捕获组
     *    - 著|作者? ：匹配"著"或"作"或"作者"
     *    - writer|author|by|文|编|译|译著 ：其他作者关键词
     *    - $        ：行尾
     *    - i        ：不区分大小写
     *    - 示例："鲁迅著" → "鲁迅", "金庸 编" → "金庸"
     */
    cleanAuthor(author) {
        if (!author) return null;
        return author
            .replace(/^[\s\[\](){}【】「」『』"'"'`\-–—:]+|[\s\[\](){}【】「」『』"'"'`\-–—:]+$/g, '')
            .replace(/\s+/g, ' ')
            .replace(/(?:著|作者?|writer|author|by|文|编|译|译著)$/i, '')
            .trim();
    },

    /**
     * 验证标题是否有效
     * 【质量检测规则】
     * 1. 长度检查：1-100字符
     * 2. 黑名单检查：不在无效标题列表中
     * 3. 【新增】乱码检测：中文/英文占比过低则视为无效
     * 4. 【新增】特殊字符检测：包含过多特殊符号则视为无效
     */
    isValidTitle(title) {
        if (!title || title.length < 1 || title.length > 100) return false;
        const lower = title.toLowerCase().trim();
        if (this.INVALID_TITLES.some(inv => lower === inv || lower.includes(inv))) return false;
        
        // 【质量检测】乱码/特殊字符检测
        // 如果包含大量非文字字符（如 % & _ / 等），视为低质量标题
        const specialChars = title.match(/[%&_\/\\<>@#$^*+=|\[\]{}~`\d]/g);
        if (specialChars && specialChars.length > title.length * 0.2) {
            // 特殊字符超过20%，视为乱码或低质量标题
            console.log('[MetadataExtractor] 标题质量低（特殊字符过多）:', title);
            return false;
        }
        
        // 【质量检测】可读字符比例检查
        // 中文：\u4e00-\u9fa5，英文：[a-zA-Z]，数字：\d，常用标点
        const readablePattern = /[\u4e00-\u9fa5a-zA-Z\d\s，。！？、：；""''（）《》【】]/g;
        const readableChars = title.match(readablePattern);
        const readableRatio = readableChars ? readableChars.length / title.length : 0;
        
        if (readableRatio < 0.6) {
            // 可读字符低于60%，视为乱码或低质量标题
            console.log('[MetadataExtractor] 标题质量低（可读字符比例低）:', title, `比例: ${(readableRatio * 100).toFixed(1)}%`);
            return false;
        }
        
        return true;
    },

    isValidAuthor(author) {
        if (!author || author.length < 1 || author.length > 50) return false;
        const lower = author.toLowerCase().trim();
        if (this.INVALID_AUTHORS.some(inv => lower === inv)) return false;
        // 作者名不应该太长（可能是书名误判）
        if (author.length > 20 && !author.includes(' ')) return false;
        return true;
    },

    /**
     * 判断是否为章节标题（用于过滤，避免将章节名误判为书名）
     * 
     * 【重要】使用 config.js 中已定义的章节正则，不重复定义
     * Lumina.Config.regexPatterns 包含：
     * - chineseChapter: 中文章节（第X章）
     * - englishChapter: 英文章节（Chapter X）
     * - sectionDash: 数字节（1.1）
     * - sectionCn: 中文节（第X节）
     * - sectionEn: 英文节（Section X）
     * - specialTitles: 特殊标题（前言、序言等）
     * - mdHeading: Markdown 标题（# ##）
     */
    isChapterTitle(text) {
        if (!text) return false;
        const p = Lumina.Config.regexPatterns;
        const trimmed = text.trim();
        
        // 使用 config 中已有的章节检测正则
        return p.chineseChapter.test(trimmed) ||
               p.englishChapter.test(trimmed) ||
               p.sectionDash.test(trimmed) ||
               p.sectionCn.test(trimmed) ||
               p.sectionEn.test(trimmed) ||
               p.specialTitles.test(trimmed) ||
               p.mdHeading.test(trimmed);
    },

    /**
     * 检测文本是否以标点符号结尾
     * 【用途】书名通常不以标点结尾（用于区分书名和正文段落）
     * 【正则】/[。，；：！？.!?;:]$/g
     *    - [...]  ：字符集，匹配中文和英文标点
     *    - $      ：行尾
     *    - g      ：全局匹配（虽然这里用不到，但习惯保留）
     */
    hasPunctuationEnd(text) {
        return /[。，；：！？.!?;:]$/g.test(text.trim());
    },

    containsAuthorKeyword(text) {
        if (!text) return false;
        const lower = text.toLowerCase();
        return this.AUTHOR_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
    },

    /**
     * 从包含作者关键字的行中提取作者名
     * 
     * 【正则规则说明】
     * 
     * 1. /(?:作者|author|writer|by|文)[:：\s]+(.+?)(?:\s|$)/i
     *    - (?:作者|author|writer|by|文)  ：非捕获组，匹配作者关键词
     *    - [:：\s]+                     ：匹配冒号(中英文)或空白（1个或多个）
     *    - (.+?)                        ：非贪婪捕获作者名
     *    - (?:\s|$)                     ：非捕获组，匹配空白或行尾（结束条件）
     *    - i                            ：不区分大小写
     *    - 示例："作者：鲁迅" → "鲁迅", "Author: John" → "John"
     * 
     * 2. /(.+?)(?:\s+著|編|编|译|译著)$/
     *    - (.+?)                        ：非贪婪捕获作者名
     *    - (?:\s+著|編|编|译|译著)       ：非捕获组，匹配尾部关键词
     *    - $                             ：行尾
     *    - 示例："鲁迅 著" → "鲁迅", "金庸 编著" → "金庸"
     * 
     * 3. /^(.+?)$/
     *    - 备用方案：如果整行就是作者名（前面两个都未匹配时）
     *    - 示例："鲁迅" → "鲁迅"
     */
    extractAuthorFromLine(line) {
        if (!line) return null;
        
        const patterns = [
            /(?:作者|author|writer|by|文)[:：\s]+(.+?)(?:\s|$)/i,
            /(.+?)(?:\s+著|編|编|译|译著)$/,
            /^(.+?)$/  // 如果整行就是作者名
        ];
        
        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
                const author = this.cleanAuthor(match[1]);
                if (this.isValidAuthor(author)) return author;
            }
        }
        
        return null;
    },

    selectBestCandidate(candidates, field) {
        // 按优先级排序
        const sorted = candidates
            .filter(c => c.meta[field] && this.isValidTitle(c.meta[field]))
            .sort((a, b) => b.priority - a.priority);
        
        // 优先返回高优先级的，如果相同优先级则返回内容更长的（通常更完整）
        if (sorted.length > 0) {
            const best = sorted[0];
            // 检查是否有相同优先级的更长结果
            const samePriority = sorted.filter(c => c.priority === best.priority);
            if (samePriority.length > 1) {
                return samePriority.reduce((max, c) => 
                    c.meta[field].length > max.meta[field].length ? c : max
                ).meta[field];
            }
            return best.meta[field];
        }
        
        return null;
    },

    calculateConfidence(value, field, candidates) {
        if (!value) return 0;
        
        let score = 0;
        
        // 来源权重
        const sourceWeights = {
            'content': 40,
            'filename': 30,
            'structure': 20,
            'default': 10
        };
        
        const candidate = candidates.find(c => c.meta[field] === value);
        if (candidate) {
            score += sourceWeights[candidate.source] || 10;
        }
        
        // 内容质量加分
        if (field === 'title') {
            if (value.length >= 2 && value.length <= 30) score += 20;
            if (!this.hasPunctuationEnd(value)) score += 10;
            if (!/\d/.test(value)) score += 10; // 不包含数字更可能是书名
        } else if (field === 'author') {
            if (value.length >= 2 && value.length <= 15) score += 20;
            if (!/\d/.test(value)) score += 10;
        }
        
        return Math.min(score, 100);
    },

    /**
     * 从 EPUB OPF 元数据提取（增强版）
     * 这个函数可以被 parseEPUB 调用
     */
    extractFromEPUBOPF(opfDoc) {
        const result = { title: null, author: null };
        
        if (!opfDoc) return result;
        
        // 查找 title
        const titleEl = opfDoc.querySelector('metadata dc\\:title, metadata title');
        if (titleEl) {
            result.title = this.cleanTitle(titleEl.textContent);
        }
        
        // 查找 creator/author
        const creatorEl = opfDoc.querySelector('metadata dc\\:creator, metadata creator, metadata dc\\:author, metadata author');
        if (creatorEl) {
            result.author = this.cleanAuthor(creatorEl.textContent);
        }
        
        return result;
    },

    /**
     * 从 DOCX core.xml 提取元数据
     */
    extractFromDOCXCore(coreXml) {
        const result = { title: null, author: null };
        
        if (!coreXml) return result;
        
        try {
            const doc = new DOMParser().parseFromString(coreXml, 'text/xml');
            
            const titleEl = doc.querySelector('dc\\:title, title');
            if (titleEl && titleEl.textContent.trim()) {
                result.title = this.cleanTitle(titleEl.textContent);
            }
            
            const creatorEl = doc.querySelector('dc\\:creator, creator, cp\\:lastModifiedBy, lastModifiedBy');
            if (creatorEl && creatorEl.textContent.trim()) {
                result.author = this.cleanAuthor(creatorEl.textContent);
            }
        } catch (e) {
            console.warn('[MetadataExtractor] DOCX core.xml parse error:', e);
        }
        
        return result;
    }
};

// 导出便捷方法
Lumina.Parser.extractMetadata = (file, parseResult, rawText) => {
    return Lumina.Parser.MetadataExtractor.extract(file, parseResult, rawText);
};
