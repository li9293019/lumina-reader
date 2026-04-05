// ==================== 元数据自动提取器 v2.0 ====================
// 支持从文件名、文件头、文档结构等多维度自动识别元数据

Lumina.Parser.MetadataExtractor = {
    DEFAULT_AUTHOR: '',
    
    // 文件名分隔符模式
    FILE_NAME_PATTERNS: [
        { pattern: /^(.+?)\s*[-–—_]\s*(.+)$/, authorIndex: 1, titleIndex: 2 },
        { pattern: /^(.+?)\s*[-–—_]\s*(.+)$/, authorIndex: 2, titleIndex: 1 },
        { pattern: /^(.+?)_(.+)$/, authorIndex: 1, titleIndex: 2 },
        { pattern: /^\[(.+?)\]\s*(.+)$/, authorIndex: 1, titleIndex: 2 },
        { pattern: /^\((.+?)\)\s*(.+)$/, authorIndex: 1, titleIndex: 2 },
        { pattern: /^(.+?)《(.+?)》$/, authorIndex: 1, titleIndex: 2 },
        { pattern: /^《(.+?)》\s*(.+)$/, authorIndex: 2, titleIndex: 1 },
    ],
    
    // 作者关键词
    AUTHOR_KEYWORDS: [
        '著', '作者', 'writer', 'author', 'by', 'written by', '文',
        '编', '编著', '主编', '译', '翻译', '原著', '原作'
    ],
    
    // 无效书名
    INVALID_TITLES: [
        '前言', '序言', '目录', 'contents', 'table of contents',
        '简介', 'introduction', 'preface', 'prologue', 'foreword',
        '说明', 'readme', 'readme.txt', '说明.txt', '新建文本文档',
        'untitled', '未命名', 'document', '文档', 'book', 'book1'
    ],
    
    // 无效作者（新增系统用户名）
    INVALID_AUTHORS: [
        '未知', 'unknown', '佚名', 'anonymous', 'unk', 'n/a', 'na',
        '作者', 'author', 'writer', '著者', '编者', '编辑',
        // Windows/Linux 系统用户名
        'administrator', 'admin', 'guest', 'user', 'root', 'system', 
        'owner', 'default', '管理员', '用户', '访客', '计算机',
        'pc', 'desktop', 'laptop', 'device', 'home', 'work',
        // 常见默认账户
        'test', 'temp', 'temporary', 'public', 'shared'
    ],
    
    // 标签过滤词
    TAG_FILTER: [
        '小说', 'novel', 'text', '文档', 'document',
        '更新', '连载中', '完结', '未完结',
        '简介', 'description', '标签', 'tags', 'tag',
        '作者', 'author', '书名', 'title'
    ],
    
    // 知名平台映射
    PLATFORM_DOMAINS: {
        'pixiv.net': 'Pixiv',
        'lofter.com': 'Lofter',
        'weibo.com': '微博',
        'archiveofourown.org': 'AO3',
        'fanfiction.net': 'FanFiction',
        'syosetu.com': '成为小说家吧',
        'syosetu.org': '成为小说家吧',
        'kakuyomu.jp': 'Kakuyomu',
        'hameln.jp': 'Hameln',
        'novel18.syosetu.com': '成为小说家吧(R18)',
        'ciweimao.com': '刺猬猫',
        'qidian.com': '起点中文网',
        'jjwxc.net': '晋江文学城',
        'douban.com': '豆瓣',
        'wattpad.com': 'Wattpad',
        'zhihu.com': '知乎',
        'bilibili.com': '哔哩哔哩',
        'tieba.baidu.com': '百度贴吧'
    },
    
    // 元数据区块结束标记
    META_END_MARKERS: [
        /^-----+/,                    // -----
        /^===+/,                      // ===
        /^---+/,                      // ---
        /^第[一二三四五六七八九十\d]+章/i,
        /^Chapter\s+\d+/i,
        /^\d+[\.\s][^\d]/,
        /^正文[：:]/i,
        /^\*{3,}/,
        /^#{3,}/
    ],
    
    /**
     * 主入口：从文件和解析结果中提取元数据
     */
    extract(file, parseResult, rawText = null) {
        const results = {
            title: null,
            author: null,
            publishDate: null,
            sourceUrl: null,
            publisher: null,
            description: null,
            tags: [],
            confidence: { title: 0, author: 0, publishDate: 0, sourceUrl: 0 },
            source: { title: null, author: null, publishDate: null, sourceUrl: null }
        };
        
        const fileName = this.getFileNameWithoutExt(file.name);
        const candidates = [];
        
        // 1. 从文件内容提取（优先级最高，包含URL、日期、标签等）
        if (rawText) {
            const contentMeta = this.extractFromContent(rawText, parseResult?.type);
            candidates.push({
                meta: contentMeta,
                source: 'content',
                priority: 5
            });
            // 直接复制多字段
            results.tags = contentMeta.tags || [];
            results.description = contentMeta.description || null;
            results.publishDate = contentMeta.publishDate || null;
            results.sourceUrl = contentMeta.sourceUrl || null;
            results.publisher = contentMeta.publisher || null;
        }
        
        // 2. EPUB/DOCX metadata
        if (parseResult?.epubMetadata) {
            candidates.push({
                meta: {
                    title: parseResult.epubMetadata.title,
                    author: parseResult.epubMetadata.author
                },
                source: 'epub',
                priority: 4
            });
        }
        
        if (parseResult?.docxMetadata) {
            const docxAuthor = parseResult.docxMetadata.author;
            // DOCX creator 可能是系统名，检查有效性
            const isSystemUser = docxAuthor && this.INVALID_AUTHORS.includes(docxAuthor.toLowerCase());
            candidates.push({
                meta: {
                    title: parseResult.docxMetadata.title,
                    author: isSystemUser ? null : docxAuthor
                },
                source: 'docx',
                priority: isSystemUser ? 1 : 4  // 系统名降低优先级
            });
        }
        
        // 3. 文件名提取
        candidates.push({
            meta: this.extractFromFileName(fileName),
            source: 'filename',
            priority: 2
        });
        
        // 4. 文档结构
        if (parseResult?.items?.length > 0) {
            candidates.push({
                meta: this.extractFromStructure(parseResult.items),
                source: 'structure',
                priority: 1
            });
        }
        
        // 选择最佳书名和作者
        results.title = this.selectBestCandidate(candidates, 'title');
        results.author = this.selectBestCandidate(candidates, 'author');
        
        // 记录来源
        const bestTitleCandidate = candidates.find(c => c.meta.title === results.title);
        const bestAuthorCandidate = candidates.find(c => c.meta.author === results.author);
        results.source.title = bestTitleCandidate?.source || 'default';
        results.source.author = bestAuthorCandidate?.source || 'default';
        
        // 如果没有作者，设为空字符串
        if (!results.author) results.author = '';
        
        // 计算置信度
        results.confidence.title = this.calculateConfidence(results.title, 'title', candidates);
        results.confidence.author = results.author ? this.calculateConfidence(results.author, 'author', candidates) : 0;
        results.confidence.publishDate = results.publishDate ? 35 : 0;
        results.confidence.sourceUrl = results.sourceUrl ? 35 : 0;
        
        return results;
    },
    
    /**
     * 从文件内容提取元数据（增强版）
     */
    extractFromContent(text, fileType) {
        const result = { 
            title: null, author: null, publishDate: null, 
            sourceUrl: null, publisher: null, description: null, tags: [] 
        };
        
        if (!text) return result;
        
        // 取前5000字符，最多100行
        const sampleText = text.slice(0, 5000);
        const allLines = sampleText.split(/\r?\n/);
        const lines = allLines.slice(0, 100).map(l => l.trim()).filter(l => l.length > 0);
        
        // 1. YAML Front Matter
        const yamlMeta = this.parseYAMLFrontMatter(sampleText);
        if (yamlMeta.title) result.title = yamlMeta.title;
        if (yamlMeta.author) result.author = yamlMeta.author;
        if (yamlMeta.tags) result.tags = yamlMeta.tags;
        
        // 2. 逐行解析元数据区块（直到遇到结束标记）
        let inDescription = false;
        let descLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // 检查是否元数据结束
            if (this.isMetaEndMarker(line)) break;
            
            // 书名：第一行（如果无标记且符合质量）
            if (i === 0 && !result.title && this.isValidTitle(line)) {
                const cleaned = this.cleanTitle(line);
                if (cleaned && cleaned.length <= 50) {
                    result.title = cleaned;
                }
            }
            
            // 作者（明确标记）- 最高置信度
            if (!result.author) {
                const authorMatch = line.match(/^(?:作者|author)[:：\s]+(.+)$/i);
                if (authorMatch) {
                    const author = this.cleanAuthor(authorMatch[1]);
                    if (this.isValidAuthor(author)) result.author = author;
                }
            }
            
            // 作者（by XXX）- 中等置信度
            if (!result.author) {
                const byMatch = line.match(/\bby[:：\s]+(.+)$/i);
                if (byMatch) {
                    const author = this.cleanAuthor(byMatch[1]);
                    if (this.isValidAuthor(author)) result.author = author;
                }
            }
            
            // URL
            if (!result.sourceUrl) {
                const urlMatch = line.match(/(https?:\/\/[^\s]+)/i);
                if (urlMatch) {
                    result.sourceUrl = urlMatch[1];
                    result.publisher = this.extractPlatformFromUrl(urlMatch[1]);
                }
            }
            
            // 日期（多种格式）
            if (!result.publishDate) {
                const dateMatch = this.parseDate(line);
                if (dateMatch) result.publishDate = dateMatch;
            }
            
            // 标签
            const tagsFromLine = this.extractTags(line);
            if (tagsFromLine.length > 0) {
                result.tags.push(...tagsFromLine);
            }
            
            // 简介开始标记
            if (!inDescription) {
                if (/^(?:简介|description|summary|概要)[:：]?$/i.test(line)) {
                    inDescription = true;
                    continue;
                }
            } else {
                // 收集简介行（非空且不是结束标记）
                if (line.length > 0 && !this.isMetaEndMarker(line)) {
                    descLines.push(line);
                }
            }
        }
        
        // 处理简介（截断到1000字符，优先段落结束）
        if (descLines.length > 0) {
            result.description = this.truncateDescription(descLines.join('\n'));
        }
        
        // 标签去重（保留顺序）
        result.tags = [...new Set(result.tags)].slice(0, 20);
        
        return result;
    },
    
    /**
     * 解析日期（多种格式）
     */
    parseDate(line) {
        // 带前缀的日期
        const prefixed = line.match(/(?:更新日期|日期|date|published)[:：\s]*(\d{4}[-年/]\d{1,2}([-月/]\d{1,2})?)/i);
        if (prefixed) return this.normalizeDate(prefixed[1]);
        
        // 独立日期格式
        // 2024-07-04, 2024/07/04, 2024.07.04
        const isoMatch = line.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (isoMatch) return this.normalizeDate(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
        
        // 2024年7月4日
        const cnMatch = line.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?/);
        if (cnMatch) return this.normalizeDate(`${cnMatch[1]}-${cnMatch[2]}-${cnMatch[3]}`);
        
        // 24.07.04（两位数年份）
        const shortMatch = line.match(/\b(\d{2})[-.](\d{1,2})[-.](\d{1,2})\b/);
        if (shortMatch) {
            const year = parseInt(shortMatch[1]);
            const fullYear = year > 26 ? 1900 + year : 2000 + year;
            return this.normalizeDate(`${fullYear}-${shortMatch[2]}-${shortMatch[3]}`);
        }
        
        // 年月（无时日）
        const ymMatch = line.match(/(\d{4})[-年/](\d{1,2})/);
        if (ymMatch) return this.normalizeDate(`${ymMatch[1]}-${ymMatch[2]}-01`);
        
        return null;
    },
    
    /**
     * 规范化日期为存储格式
     */
    normalizeDate(dateStr) {
        if (!dateStr) return '';
        
        // 已经是完整格式
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) return dateStr;
        
        // 解析组件
        const parts = dateStr.split(/[-/]/).map(p => parseInt(p));
        if (parts.length < 2) return '';
        
        const year = parts[0];
        const month = String(parts[1]).padStart(2, '0');
        const day = parts[2] ? String(parts[2]).padStart(2, '0') : '01';
        
        return `${year}-${month}-${day} 00:00:00`;
    },
    
    /**
     * 从URL提取平台名
     */
    extractPlatformFromUrl(url) {
        if (!url) return null;
        
        try {
            const hostname = new URL(url).hostname.toLowerCase();
            
            // 去掉 www/m 前缀
            const domain = hostname.replace(/^(www\.|m\.|mobile\.)/, '');
            
            // 查找已知平台
            for (const [pattern, name] of Object.entries(this.PLATFORM_DOMAINS)) {
                if (domain.includes(pattern)) return name;
            }
            
            // 未知域名，取主域名（去掉 .com/.cn 等后缀）
            const mainDomain = domain.split('.')[0];
            return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
        } catch {
            return null;
        }
    },
    
    /**
     * 提取标签
     */
    extractTags(line) {
        const tags = [];
        
        // 格式1: #标签1 #标签2
        const hashTags = line.match(/#([\w\u4e00-\u9fa5]+(?:\s[\w\u4e00-\u9fa5]+)?)/g);
        if (hashTags) {
            hashTags.forEach(tag => {
                const clean = tag.slice(1).trim(); // 去掉#
                if (clean && !this.TAG_FILTER.includes(clean.toLowerCase())) {
                    tags.push(clean);
                }
            });
        }
        
        // 格式2: Tags: 标签1, 标签2 / 标签：a, b, c
        const tagListMatch = line.match(/(?:tags?|标签)[:：\s]+(.+)/i);
        if (tagListMatch) {
            const parts = tagListMatch[1].split(/[,，\/]/).map(s => s.trim());
            parts.forEach(tag => {
                if (tag && !this.TAG_FILTER.includes(tag.toLowerCase())) {
                    tags.push(tag);
                }
            });
        }
        
        // 格式3: #标签1, #标签2（逗号分隔的hash标签）
        const commaHashMatch = line.match(/^(#[^#]+)$/);
        if (commaHashMatch) {
            line.split(/[,，]/).forEach(part => {
                const clean = part.trim().replace(/^#/, '');
                if (clean && !this.TAG_FILTER.includes(clean.toLowerCase())) {
                    tags.push(clean);
                }
            });
        }
        
        return tags;
    },
    
    /**
     * 截断简介
     */
    truncateDescription(text) {
        if (!text) return '';
        if (text.length <= 1000) return text;
        
        // 尝试在1000字符内找最后一个句号
        const truncated = text.slice(0, 1000);
        const lastCnPeriod = truncated.lastIndexOf('。');
        const lastEnPeriod = truncated.lastIndexOf('.');
        const lastBreak = Math.max(lastCnPeriod, lastEnPeriod);
        
        if (lastBreak > 800) {
            return truncated.slice(0, lastBreak + 1);
        }
        
        // 找最后一个换行
        const lastNewline = truncated.lastIndexOf('\n');
        if (lastNewline > 600) {
            return truncated.slice(0, lastNewline);
        }
        
        return truncated + '...';
    },
    
    /**
     * 检查是否元数据结束标记
     */
    isMetaEndMarker(line) {
        return this.META_END_MARKERS.some(pattern => pattern.test(line));
    },
    
    /**
     * 解析 YAML Front Matter
     */
    parseYAMLFrontMatter(text) {
        const result = { title: null, author: null, tags: [] };
        
        const yamlMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!yamlMatch) return result;
        
        const yamlContent = yamlMatch[1];
        
        // title
        const titleMatch = yamlContent.match(/^title:\s*(.+)$/m);
        if (titleMatch) {
            result.title = this.cleanTitle(titleMatch[1].replace(/^["']|["']$/g, ''));
        }
        
        // author
        const authorPatterns = [/^author:\s*(.+)$/m, /^creator:\s*(.+)$/m];
        for (const pattern of authorPatterns) {
            const match = yamlContent.match(pattern);
            if (match) {
                result.author = this.cleanAuthor(match[1].replace(/^["']|["']$/g, ''));
                break;
            }
        }
        
        // tags
        const tagsMatch = yamlContent.match(/^tags:\s*\n((?:\s+-\s*.+\n?)+)/m);
        if (tagsMatch) {
            const tagItems = tagsMatch[1].match(/-\s*(.+)/g);
            if (tagItems) {
                result.tags = tagItems.map(t => t.replace(/^-\s*/, '').trim());
            }
        }
        
        return result;
    },
    
    // ==================== 原有方法（保持）====================
    
    extractFromFileName(fileName) {
        const result = { title: null, author: null };
        
        let cleanName = fileName.replace(/\.(txt|md|docx|epub|pdf|html?)$/i, '').trim();
        
        for (const rule of this.FILE_NAME_PATTERNS) {
            const match = cleanName.match(rule.pattern);
            if (match) {
                const possibleAuthor = match[rule.authorIndex].trim();
                const possibleTitle = match[rule.titleIndex].trim();
                
                if (this.isValidTitle(possibleTitle) && this.isValidAuthor(possibleAuthor)) {
                    result.title = this.cleanTitle(possibleTitle);
                    result.author = this.cleanAuthor(possibleAuthor);
                    break;
                }
            }
        }
        
        if (!result.title && this.isValidTitle(cleanName)) {
            result.title = this.cleanTitle(cleanName);
        }
        
        return result;
    },
    
    extractFromStructure(items) {
        const result = { title: null, author: null };
        if (!items || items.length === 0) return result;
        
        const firstItems = items.slice(0, 10);
        
        const titleItem = firstItems.find(item => 
            item.type === 'title' || (item.type === 'heading1' && item.level === 1)
        );
        if (titleItem && this.isValidTitle(titleItem.text)) {
            result.title = this.cleanTitle(titleItem.text);
        }
        
        const subtitleItem = firstItems.find(item => 
            item.type === 'subtitle' ||
            (item.type === 'paragraph' && this.containsAuthorKeyword(item.text))
        );
        if (subtitleItem) {
            const authorPart = this.extractAuthorFromLine(subtitleItem.text);
            if (authorPart) result.author = authorPart;
        }
        
        return result;
    },
    
    // ==================== 工具方法 ====================
    
    getFileNameWithoutExt(fileName) {
        return fileName.replace(/\.[^/.]+$/, '');
    },
    
    cleanTitle(title) {
        if (!title) return null;
        return title
            .replace(/^[\s\[\](){}【】「」『』"'`]+|[\s\[\](){}【】「」『』"'`]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    },
    
    cleanAuthor(author) {
        if (!author) return null;
        return author
            .replace(/^[\s\[\](){}【】「」『』"'`\-–—:]+|[\s\[\](){}【】「」『』"'`\-–—:]+$/g, '')
            .replace(/\s+/g, ' ')
            .replace(/(?:著|作者?|writer|author|by|文|编|译|译著)$/i, '')
            .trim();
    },
    
    isValidTitle(title) {
        if (!title || title.length < 1 || title.length > 100) return false;
        const lower = title.toLowerCase().trim();
        if (this.INVALID_TITLES.some(inv => lower === inv || lower.includes(inv))) return false;
        
        const specialChars = title.match(/[%&_\/\\<>@#$^*+=|\[\]{}~`\d]/g);
        if (specialChars && specialChars.length > title.length * 0.2) return false;
        
        const readablePattern = /[\u4e00-\u9fa5a-zA-Z\d\s，。！？、：；""''（）《》【】]/g;
        const readableChars = title.match(readablePattern);
        const readableRatio = readableChars ? readableChars.length / title.length : 0;
        
        if (readableRatio < 0.6) return false;
        
        return true;
    },
    
    isValidAuthor(author) {
        if (!author || author.length < 1 || author.length > 50) return false;
        const lower = author.toLowerCase().trim();
        if (this.INVALID_AUTHORS.some(inv => lower === inv)) return false;
        if (author.length > 20 && !author.includes(' ')) return false;
        return true;
    },
    
    isChapterTitle(text) {
        if (!text) return false;
        const p = Lumina.Config.regexPatterns;
        const trimmed = text.trim();
        
        return p.chineseChapter.test(trimmed) ||
               p.englishChapter.test(trimmed) ||
               p.sectionDash.test(trimmed) ||
               p.sectionCn.test(trimmed) ||
               p.sectionEn.test(trimmed) ||
               p.specialTitles.test(trimmed) ||
               p.mdHeading.test(trimmed);
    },
    
    containsAuthorKeyword(text) {
        if (!text) return false;
        const lower = text.toLowerCase();
        return this.AUTHOR_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
    },
    
    extractAuthorFromLine(line) {
        if (!line) return null;
        
        const patterns = [
            /(?:作者|author|writer|by|文)[:：\s]+(.+?)(?:\s|$)/i,
            /(.+?)(?:\s+著|編|编|译|译著)$/,
            /^(.+?)$/
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
        const sorted = candidates
            .filter(c => c.meta[field] && (field === 'author' ? this.isValidAuthor(c.meta[field]) : this.isValidTitle(c.meta[field])))
            .sort((a, b) => b.priority - a.priority);
        
        if (sorted.length > 0) {
            const best = sorted[0];
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
        
        const sourceWeights = {
            'content': 40,
            'filename': 30,
            'structure': 20,
            'epub': 40,
            'docx': 20,  // 降低，因为可能是系统名
            'default': 10
        };
        
        const candidate = candidates.find(c => c.meta[field] === value);
        if (candidate) {
            score += sourceWeights[candidate.source] || 10;
        }
        
        if (field === 'title') {
            if (value.length >= 2 && value.length <= 30) score += 20;
            if (!/[。，；：！？.!?;:]$/g.test(value)) score += 10;
            if (!/\d/.test(value)) score += 10;
        } else if (field === 'author') {
            if (value.length >= 2 && value.length <= 15) score += 20;
            if (!/\d/.test(value)) score += 10;
        }
        
        return Math.min(score, 100);
    },
    
    extractFromEPUBOPF(opfDoc) {
        const result = { title: null, author: null };
        if (!opfDoc) return result;
        
        const titleEl = opfDoc.querySelector('metadata dc\\:title, metadata title');
        if (titleEl) result.title = this.cleanTitle(titleEl.textContent);
        
        const creatorEl = opfDoc.querySelector('metadata dc\\:creator, metadata creator, metadata dc\\:author, metadata author');
        if (creatorEl) result.author = this.cleanAuthor(creatorEl.textContent);
        
        return result;
    },
    
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
                const creator = creatorEl.textContent.trim();
                // 过滤系统名
                if (!this.INVALID_AUTHORS.includes(creator.toLowerCase())) {
                    result.author = this.cleanAuthor(creator);
                }
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
