// ==================== Markdown 解析器 ====================
// 将 Markdown 文本解析为结构化数据
// 支持：标题、段落、列表、引用、代码块、表格、分隔线、链接、图片、行内格式

Lumina.Plugin = Lumina.Plugin || {};
Lumina.Plugin.Markdown = Lumina.Plugin.Markdown || {};

Lumina.Plugin.Markdown.Parser = {
    // 配置
    config: {
        // 块级语法
        blockPatterns: {
            codeBlock: /^```(\w+)?\n([\s\S]*?)^```$/m,
            codeBlockAlt: /^~~~(\w+)?\n([\s\S]*?)^~~~$/m,
            heading: /^(#{1,6})\s+(.+)$/,
            headingAlt: /^(.+)\n(={3,}|-{3,})\s*$/m,
            hr: /^(?:\*{3,}|-{3,}|_{3,})\s*$/,
            blockquote: /^>\s?(.*)$/,
            listOrdered: /^(\d+)\.\s+(.+)$/,
            listUnordered: /^([\*\-\+])\s+(.+)$/,
            table: /^\|(.+)\|\s*$/,
            tableSeparator: /^\|[\s\-:|]+\|\s*$/
        },
        // 行内语法
        inlinePatterns: [
            { type: 'code', regex: /`([^`]+)`/g },
            { type: 'strong', regex: /\*\*([^\*]+)\*\*|__([^_]+)__/g },
            { type: 'em', regex: /\*([^\*]+)\*|_([^_]+)_/g },
            { type: 'del', regex: /~~([^~]+)~~/g },
            { type: 'link', regex: /\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g },
            { type: 'image', regex: /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g }
        ]
    },

    /**
     * 主解析入口
     * @param {string} content - Markdown 内容
     * @returns {Object} - { items: [], type: 'markdown' }
     */
    parse(content) {
        if (!content || typeof content !== 'string') {
            return { items: [], type: 'markdown' };
        }

        const lines = content.split(/\r?\n/);
        
        const items = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            
            // 跳过空行
            if (!line.trim()) {
                i++;
                continue;
            }

            // 尝试各种块级解析
            let consumed = 0;
            let item = null;

            // 代码块（优先，避免被其他规则干扰）
            if ((consumed = this.parseCodeBlock(lines, i))) {
                item = consumed.item;
                i = consumed.nextIndex;
            }
            // 表格
            else if ((consumed = this.parseTable(lines, i))) {
                item = consumed.item;
                i = consumed.nextIndex;
            }
            // 标题（Setext 风格）
            else if ((item = this.parseSetextHeading(lines, i))) {
                i += 2;
            }
            // ATX 标题
            else if ((item = this.parseATXHeading(line))) {
                i++;
            }
            // 分隔线
            else if ((item = this.parseHR(line))) {
                i++;
            }
            // 引用块
            else if ((consumed = this.parseBlockquote(lines, i))) {
                item = consumed.item;
                i = consumed.nextIndex;
            }
            // 列表
            else if ((consumed = this.parseList(lines, i))) {
                item = consumed.item;
                i = consumed.nextIndex;
            }
            // 块级图片（独占一行的图片）
            else if ((item = this.parseBlockImage(line))) {
                i++;
            }
            // 普通段落
            else {
                item = this.parseParagraph(lines, i);
                i = item.nextIndex;
            }

            if (item) {
                items.push(item);
            }
        }

        return { items, type: 'markdown' };
    },

    /**
     * 解析 ATX 标题 (# Heading)
     */
    parseATXHeading(line) {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (!match) return null;

        const level = match[1].length;
        const text = match[2].trim();
        const inlineContent = this.parseInline(text);
        const cleanText = Lumina.Parser?.stripInlineMarkdown ? Lumina.Parser.stripInlineMarkdown(text) : text;

        // 与阅读器章节系统兼容：输出 heading1, heading2 等格式
        // 复用 processHeading 以应用章节编号策略
        const heading = Lumina.Parser?.processHeading
            ? Lumina.Parser.processHeading(level, text, cleanText)
            : { type: `heading${level}`, level, text: cleanText, display: cleanText, cleanText };
        heading.inlineContent = inlineContent;
        heading.raw = line;
        return heading;
    },

    /**
     * 解析 Setext 标题 (underline style)
     */
    parseSetextHeading(lines, startIndex) {
        if (startIndex + 1 >= lines.length) return null;
        
        const line = lines[startIndex];
        const nextLine = lines[startIndex + 1];
        const trimmed = line.trim();
        
        // 空行不能作为 Setext 标题内容
        if (!trimmed) return null;
        
        // 阅读器场景优化：长段落末尾的 --- 应作为分隔线而非 Setext 下划线
        // 如果候选标题行以句子结束标点结尾，或长度超过阈值，则不认为是 Setext 标题
        if (/[。.！!？?；;…—~～""')）]$/.test(trimmed) || trimmed.length > 80) {
            return null;
        }
        
        if (/^={3,}\s*$/.test(nextLine)) {
            const text = line.trim();
            const inlineContent = this.parseInline(text);
            const cleanText = Lumina.Parser?.stripInlineMarkdown ? Lumina.Parser.stripInlineMarkdown(text) : text;
            const heading = Lumina.Parser?.processHeading
                ? Lumina.Parser.processHeading(1, text, cleanText)
                : { type: 'heading1', level: 1, text: cleanText, display: cleanText, cleanText };
            heading.inlineContent = inlineContent;
            heading.raw = line + '\n' + nextLine;
            return heading;
        }
        
        if (/^-{3,}\s*$/.test(nextLine)) {
            const text = line.trim();
            const inlineContent = this.parseInline(text);
            const cleanText = Lumina.Parser?.stripInlineMarkdown ? Lumina.Parser.stripInlineMarkdown(text) : text;
            const heading = Lumina.Parser?.processHeading
                ? Lumina.Parser.processHeading(2, text, cleanText)
                : { type: 'heading2', level: 2, text: cleanText, display: cleanText, cleanText };
            heading.inlineContent = inlineContent;
            heading.raw = line + '\n' + nextLine;
            return heading;
        }
        
        return null;
    },

    /**
     * 解析代码块
     * 修复：正确处理嵌套代码块（如 markdown 代码块内包含其他代码块）
     */
    parseCodeBlock(lines, startIndex) {
        const line = lines[startIndex];
        const fenceMatch = line.match(/^(```+)(\w*)\s*$/);
        
        if (!fenceMatch) return null;

        const fence = fenceMatch[1];  // 围栏标记（反引号数量）
        const language = fenceMatch[2] || '';
        let content = '';
        let i = startIndex + 1;
        
        // 安全限制：最多解析 10000 行代码块
        const MAX_CODE_BLOCK_LINES = 10000;
        let lineCount = 0;
        
        // 嵌套深度计数：遇到相同长度的围栏开始加一，遇到结束减一
        let depth = 1;
        
        while (i < lines.length && lineCount < MAX_CODE_BLOCK_LINES) {
            const currentLine = lines[i];
            
            // 检查是否是相同长度的围栏
            const startMatch = currentLine.match(/^(```+)(\w*)\s*$/);
            if (startMatch) {
                const currentFence = startMatch[1];
                if (currentFence.length === fence.length) {
                    // 相同长度的围栏
                    if (startMatch[2]) {
                        // 有语言标识，是嵌套代码块开始
                        depth++;
                        content += currentLine + '\n';
                    } else {
                        // 无语言标识，是代码块结束
                        depth--;
                        if (depth === 0) {
                            i++;
                            break;
                        } else {
                            // 嵌套代码块的结束
                            content += currentLine + '\n';
                        }
                    }
                    i++;
                    lineCount++;
                    continue;
                }
            }
            
            content += currentLine + '\n';
            i++;
            lineCount++;
        }
        
        // 如果达到行数限制，记录警告
        if (lineCount >= MAX_CODE_BLOCK_LINES && i < lines.length) {
            console.warn('[Markdown] 代码块超过最大行数限制，已截断');
        }

        // 安全处理
        const safeContent = typeof content === 'string' ? content.slice(0, -1) : '';

        return {
            item: {
                type: 'codeblock',
                language: language.toLowerCase().trim(),
                text: safeContent,
                inlineContent: [{ type: 'text', content: safeContent }],
                raw: lines.slice(startIndex, i).join('\n')
            },
            nextIndex: i
        };
    },

    /**
     * 解析表格
     * 优化：超大表格使用简化解析避免卡顿
     */
    parseTable(lines, startIndex) {
        const headerLine = lines[startIndex];
        if (!headerLine.includes('|')) return null;
        
        // 检查下一行是否是分隔符
        if (startIndex + 1 >= lines.length) return null;
        
        const separatorLine = lines[startIndex + 1];
        if (!/^\|[\s\-:|]+\|\s*$/.test(separatorLine)) return null;

        // 解析表头
        const headers = this.parseTableRow(headerLine);
        
        // 解析对齐方式
        const aligns = this.parseTableAlign(separatorLine);
        
        // 解析数据行
        const rows = [];
        let i = startIndex + 2;
        
        // 估算表格大小，超大表格使用简化解析
        let estimatedCells = 0;
        const MAX_CELLS_FOR_FULL_PARSE = 200; // 最多 200 个单元格完整解析
        
        while (i < lines.length && lines[i].includes('|')) {
            const row = this.parseTableRow(lines[i]);
            estimatedCells += row.length;
            if (estimatedCells > MAX_CELLS_FOR_FULL_PARSE) break;
            i++;
        }
        
        const useSimpleParse = estimatedCells > MAX_CELLS_FOR_FULL_PARSE;
        
        // 重新遍历解析
        i = startIndex + 2;
        while (i < lines.length && lines[i].includes('|')) {
            const row = this.parseTableRow(lines[i]);
            if (row.length > 0) {
                rows.push(row.map((cell, idx) => ({
                    text: cell,
                    inlineContent: useSimpleParse 
                        ? this.parseInlineSimple(cell)  // 简化解析
                        : this.parseInline(cell),        // 完整解析
                    align: aligns[idx] || 'left'
                })));
            }
            i++;
        }

        if (rows.length === 0) return null;

        // 计算智能列宽比例（PC端自适应布局用）
        const columnWidths = this.calculateColumnWidths(headers, rows);

        return {
            item: {
                type: 'table',
                headers: headers.map((h, idx) => ({
                    text: h,
                    inlineContent: useSimpleParse 
                        ? this.parseInlineSimple(h)
                        : this.parseInline(h),
                    align: aligns[idx] || 'left'
                })),
                rows,
                columnWidths,
                raw: lines.slice(startIndex, i).join('\n')
            },
            nextIndex: i
        };
    },

    /**
     * 智能计算表格列宽比例
     * 基于每列内容的文本长度（区分中英文宽度）分配比例，
     * 同时设置上限保护（单列不超过50%）和下限保护（避免过度压缩）
     */
    calculateColumnWidths(headers, rows) {
        const colCount = headers.length;
        if (colCount === 0) return [];

        // 测量文本的"自然宽度"：中文按1.8、英文/数字/符号按1.0估算
        const measure = (text) => {
            if (!text) return 0;
            let w = 0;
            for (const c of String(text)) {
                const code = c.charCodeAt(0);
                // CJK 统一表意文字及扩展区、全角标点
                w += (code >= 0x4E00 && code <= 0x9FFF) ||
                     (code >= 0x3400 && code <= 0x4DBF) ||
                     (code >= 0xF900 && code <= 0xFAFF) ||
                     (code >= 0x3000 && code <= 0x303F) ||
                     (code >= 0xFF00 && code <= 0xFFEF) ? 1.8 : 1.0;
            }
            return w;
        };

        // 收集每列的最大内容宽度
        const maxWidths = new Array(colCount).fill(0);

        headers.forEach((h, i) => {
            maxWidths[i] = Math.max(maxWidths[i], measure(h));
        });

        rows.forEach(row => {
            row.forEach((cell, i) => {
                if (i < colCount) {
                    maxWidths[i] = Math.max(maxWidths[i], measure(cell.text));
                }
            });
        });

        const totalWidth = maxWidths.reduce((a, b) => a + b, 0);
        if (totalWidth === 0) {
            return new Array(colCount).fill(parseFloat((100 / colCount).toFixed(1)));
        }

        // 识别短列（序号、编号、排名等），这类列不应占太多宽度
        const shortColPattern = /^(序号|编号|排名|索引|序|Rank|No\.?|Index|ID|#)$/i;
        const isShortCol = headers.map(h => shortColPattern.test(String(h || '').trim()));

        // 初始百分比
        let percentages = maxWidths.map(w => (w / totalWidth) * 100);

        // 约束策略
        const MAX_COL_PERCENT = 50;  // 单列上限，防止一列独占
        const SHORT_COL_MAX = 10;    // 短列（如序号）最大占比，保持紧凑
        // 动态下限：列数越多，单列最小占比越低，但不低于3%
        const MIN_COL_PERCENT = Math.min(8, Math.max(3, (100 / colCount) * 0.35));

        let excess = 0;
        let flexibleCols = 0;

        // 第一轮：应用上下限约束（短列额外限制为 10%）
        percentages = percentages.map((p, idx) => {
            const hardMax = isShortCol[idx] ? SHORT_COL_MAX : MAX_COL_PERCENT;
            if (p > hardMax) {
                excess += p - hardMax;
                return hardMax;
            }
            if (p < MIN_COL_PERCENT) {
                excess -= MIN_COL_PERCENT - p;
                return MIN_COL_PERCENT;
            }
            flexibleCols++;
            return p;
        });

        // 第二轮：将多余空间重新分配给灵活的列
        if (excess > 0 && flexibleCols > 0) {
            const addPerCol = excess / flexibleCols;
            percentages = percentages.map((p, idx) => {
                const hardMax = isShortCol[idx] ? SHORT_COL_MAX : MAX_COL_PERCENT;
                if (p < hardMax && p >= MIN_COL_PERCENT) {
                    return Math.min(p + addPerCol, hardMax);
                }
                return p;
            });
        }

        // 归一化到100%，保留一位小数
        const sum = percentages.reduce((a, b) => a + b, 0);
        return percentages.map(p => parseFloat(((p / sum) * 100).toFixed(1)));
    },

    parseTableRow(line) {
        return line
            .split('|')
            .slice(1, -1)  // 去掉首尾
            .map(cell => cell.trim());
    },

    parseTableAlign(line) {
        return line
            .split('|')
            .slice(1, -1)
            .map(cell => {
                cell = cell.trim();
                if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
                if (cell.endsWith(':')) return 'right';
                return 'left';
            });
    },

    /**
     * 解析引用块
     * 保留换行符，让渲染器正确处理多行
     */
    parseBlockquote(lines, startIndex) {
        if (!lines[startIndex].startsWith('>')) return null;

        const content = [];
        let i = startIndex;
        
        while (i < lines.length) {
            const line = lines[i];
            if (!line.startsWith('>')) break;
            
            // 提取引用内容（去掉 > 和空格）
            const text = line.replace(/^>\s?/, '');
            content.push(text);
            i++;
        }

        // 保留原始换行，不递归解析为段落（避免 parseParagraph 把换行替换为空格）
        const innerText = content.join('\n');
        
        // 只有当内容包含块级结构（如列表、代码块等）时才递归解析
        // 简单文本直接保留换行，让渲染器按行分割
        const hasBlockStructure = content.some(line => 
            line.match(/^[\*\-\+\d]\.\s/) ||  // 列表
            line.match(/^```/) ||               // 代码块
            line.match(/^#{1,6}\s/)             // 标题
        );
        
        const innerItems = hasBlockStructure ? this.parse(innerText).items : [];

        return {
            item: {
                type: 'blockquote',
                text: innerText,
                items: innerItems,  // 嵌套解析结果（仅当包含块级结构时）
                inlineContent: this.parseInline(innerText),
                raw: lines.slice(startIndex, i).join('\n')
            },
            nextIndex: i
        };
    },

    /**
     * 解析列表（支持嵌套）
     */
    parseList(lines, startIndex, baseIndent = 0) {
        const firstLine = lines[startIndex];
        const firstIndent = firstLine.match(/^(\s*)/)[1].length;
        
        // 判断列表类型
        const orderedMatch = firstLine.trim().match(/^(\d+)\.\s+(.+)$/);
        const unorderedMatch = firstLine.trim().match(/^([\*\-\+])\s+(.+)$/);
        
        if (!orderedMatch && !unorderedMatch) return null;

        const isOrdered = !!orderedMatch;
        const listMarker = isOrdered ? '' : unorderedMatch[1]; // 记录无序列表的标记符
        const items = [];
        let i = startIndex;
        
        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();
            const currentIndent = line.match(/^(\s*)/)[1].length;
            
            // 检查是否是当前层级的列表项
            const oMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
            const uMatch = trimmed.match(/^([\*\-\+])\s+(.+)$/);
            
            // 必须是相同缩进且匹配列表类型
            const isSameLevel = currentIndent === firstIndent;
            const isListItem = (isOrdered && oMatch) || (!isOrdered && uMatch);
            
            if (isSameLevel && isListItem) {
                // 解析列表项内容
                const text = isOrdered ? oMatch[2] : uMatch[2];
                const item = {
                    text,
                    inlineContent: this.parseInline(text),
                    raw: line
                };
                
                // 检查下一行是否是嵌套列表
                i++;
                if (i < lines.length) {
                    const nextLine = lines[i];
                    const nextTrimmed = nextLine.trim();
                    const nextIndent = nextLine.match(/^(\s*)/)[1].length;
                    
                    // 如果下一行缩进更大，可能是嵌套列表
                    if (nextIndent > firstIndent) {
                        // 检查是否是子列表
                        const nextOrdered = nextTrimmed.match(/^(\d+)\.\s+/);
                        const nextUnordered = nextTrimmed.match(/^([\*\-\+])\s+/);
                        
                        if (nextOrdered || nextUnordered) {
                            const nestedResult = this.parseList(lines, i, nextIndent);
                            if (nestedResult) {
                                item.items = [nestedResult.item];
                                i = nestedResult.nextIndex;
                            }
                        }
                    }
                }
                
                items.push(item);
            } else if (trimmed === '' && i + 1 < lines.length) {
                // 空行，检查下一行
                const nextLine = lines[i + 1];
                const nextIndent = nextLine.match(/^(\s*)/)[1].length;
                const nextTrimmed = nextLine.trim();
                
                // 如果下一行是同层级的列表项，继续
                const nextOrdered = nextTrimmed.match(/^(\d+)\.\s+/);
                const nextUnordered = nextTrimmed.match(/^([\*\-\+])\s+/);
                
                if (nextIndent === firstIndent && 
                    ((isOrdered && nextOrdered) || (!isOrdered && nextUnordered))) {
                    i++;
                    continue;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        if (items.length === 0) return null;

        return {
            item: {
                type: 'list',
                ordered: isOrdered,
                start: isOrdered ? parseInt(orderedMatch[1]) : 1,
                items,
                raw: lines.slice(startIndex, i).join('\n')
            },
            nextIndex: i
        };
    },

    /**
     * 解析分隔线
     */
    parseHR(line) {
        if (/^(?:\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
            return {
                type: 'hr',
                text: '',
                inlineContent: [],
                raw: line
            };
        }
        return null;
    },

    /**
     * 解析段落（多行合并）
     */
    parseParagraph(lines, startIndex) {
        const content = [];
        let i = startIndex;
        
        while (i < lines.length) {
            const line = lines[i];
            
            // 遇到空行或块级元素终止
            if (line.trim() === '') break;
            if (this.isBlockStart(line)) break;
            
            content.push(line);
            i++;
        }

        const text = content.join(' ').trim();
        
        return {
            type: 'paragraph',
            text,
            inlineContent: this.parseInline(text),
            raw: content.join('\n'),
            nextIndex: i
        };
    },

    /**
     * 检查是否是块级元素开始
     */
    isBlockStart(line) {
        return (
            line.match(/^#{1,6}\s/) ||           // 标题
            line.match(/^```/) ||                 // 代码块
            line.match(/^>/) ||                   // 引用
            line.match(/^\d+\.\s/) ||             // 有序列表
            line.match(/^[\*\-\+]\s/) ||         // 无序列表
            line.match(/^(?:\*{3,}|-{3,}|_{3,})\s*$/) ||  // 分隔线
            line.match(/^\|/) ||                  // 表格
            line.match(/^\s*!\[[^\]]*\]\([^)]+\)\s*$/)  // 块级图片
        );
    },

    /**
     * 解析块级图片（独占一行的图片）
     */
    parseBlockImage(line) {
        const match = line.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/);
        if (!match) return null;

        const alt = match[1];
        const srcAndTitle = match[2].trim();

        // 提取 URL 和可选 title
        let src = srcAndTitle;
        let title = '';
        const titleMatch = srcAndTitle.match(/^([^\s"]+)\s+"([^"]*)"$/);
        if (titleMatch) {
            src = titleMatch[1];
            title = titleMatch[2];
        }

        return {
            type: 'image',
            src: src,
            data: src,
            alt: alt,
            title: title,
            raw: line
        };
    },

    /**
     * 解析行内元素
     * @param {string} text - 纯文本
     * @returns {Array} - inlineContent 数组
     */
    parseInline(text) {
        if (!text) return [];
        
        const result = [];
        let currentText = text;
        let pos = 0;

        // 收集所有匹配
        const matches = [];
        
        // 行内代码（优先，不解析内部）
        const codeRegex = /`([^`]+)`/g;
        let match;
        while ((match = codeRegex.exec(text)) !== null) {
            if (this.isEscaped(text, match.index)) {
                codeRegex.lastIndex = match.index + 1;
                continue;
            }
            matches.push({
                type: 'code',
                start: match.index,
                end: match.index + match[0].length,
                content: match[1]
            });
        }

        // 图片（在链接之前）
        const imageRegex = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g;
        while ((match = imageRegex.exec(text)) !== null) {
            if (this.isEscaped(text, match.index)) {
                imageRegex.lastIndex = match.index + 1;
                continue;
            }
            // 检查是否与代码冲突
            if (!this.isInsideCode(match.index, matches)) {
                matches.push({
                    type: 'image',
                    start: match.index,
                    end: match.index + match[0].length,
                    alt: match[1],
                    src: match[2],
                    title: match[3] || ''
                });
            }
        }

        // 链接
        const linkRegex = /\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g;
        while ((match = linkRegex.exec(text)) !== null) {
            if (this.isEscaped(text, match.index)) {
                linkRegex.lastIndex = match.index + 1;
                continue;
            }
            if (!this.isInsideCode(match.index, matches)) {
                matches.push({
                    type: 'link',
                    start: match.index,
                    end: match.index + match[0].length,
                    content: match[1],
                    href: match[2],
                    title: match[3] || ''
                });
            }
        }

        // 粗体
        // 使用 (.+?) 非贪婪匹配，允许 content 内部包含 *（支持嵌套斜体）
        const strongRegex = /\*\*(.+?)\*\*|__(.+?)__/g;
        while ((match = strongRegex.exec(text)) !== null) {
            if (this.isEscaped(text, match.index)) {
                strongRegex.lastIndex = match.index + 1;
                continue;
            }
            if (!this.isInsideCode(match.index, matches)) {
                const content = match[1] || match[2];
                matches.push({
                    type: 'strong',
                    start: match.index,
                    end: match.index + match[0].length,
                    content: content,
                    inlineContent: this.parseInline(content)
                });
            } else {
                // 同样处理：被排除的 match 回退 lastIndex
                strongRegex.lastIndex = match.index + 1;
            }
        }

        // 斜体（但要排除与粗体标记符直接重叠的情况，允许嵌套在粗体内部）
        const emRegex = /\*([^\*]+)\*|_([^_]+)_/g;
        while ((match = emRegex.exec(text)) !== null) {
            if (this.isEscaped(text, match.index)) {
                emRegex.lastIndex = match.index + 1;
                continue;
            }
            if (!this.isInsideCode(match.index, matches) && 
                !this.isOverlappingStrongMarker(match.index, match[0].length, matches)) {
                const content = match[1] || match[2];
                matches.push({
                    type: 'em',
                    start: match.index,
                    end: match.index + match[0].length,
                    content: content,
                    inlineContent: this.parseInline(content)
                });
            } else {
                // 被排除的 match 仍会推进 lastIndex，导致中间内容被跳过
                // 回退到 match.index + 1 重新搜索，避免遗漏
                emRegex.lastIndex = match.index + 1;
            }
        }

        // 删除线
        const delRegex = /~~([^~]+)~~/g;
        while ((match = delRegex.exec(text)) !== null) {
            if (this.isEscaped(text, match.index)) {
                delRegex.lastIndex = match.index + 1;
                continue;
            }
            if (!this.isInsideCode(match.index, matches)) {
                const content = match[1];
                matches.push({
                    type: 'del',
                    start: match.index,
                    end: match.index + match[0].length,
                    content: content,
                    inlineContent: this.parseInline(content)
                });
            }
        }

        // 高亮标记 ==text==（Pixiv 语法）
        const markRegex = /==([^=\n]+?)==/g;
        while ((match = markRegex.exec(text)) !== null) {
            if (this.isEscaped(text, match.index)) {
                markRegex.lastIndex = match.index + 1;
                continue;
            }
            if (!this.isInsideCode(match.index, matches)) {
                matches.push({
                    type: 'mark',
                    start: match.index,
                    end: match.index + match[0].length,
                    content: match[1]
                });
            }
        }

        // 注音 [[rb:汉字 > ruby]]
        const rubyRegex = /\[\[rb:([^>]+?)\s*>\s*([^\]]+?)\]\]/g;
        while ((match = rubyRegex.exec(text)) !== null) {
            if (this.isEscaped(text, match.index)) {
                rubyRegex.lastIndex = match.index + 1;
                continue;
            }
            if (!this.isInsideCode(match.index, matches)) {
                matches.push({
                    type: 'ruby',
                    start: match.index,
                    end: match.index + match[0].length,
                    base: match[1].trim(),
                    ruby: match[2].trim()
                });
            }
        }

        // 着重号 [[emphasismark:文字 > mark]]
        const emphasisMarkRegex = /\[\[emphasismark:([^>]+?)\s*>\s*([^\]]+?)\]\]/g;
        while ((match = emphasisMarkRegex.exec(text)) !== null) {
            if (this.isEscaped(text, match.index)) {
                emphasisMarkRegex.lastIndex = match.index + 1;
                continue;
            }
            if (!this.isInsideCode(match.index, matches)) {
                matches.push({
                    type: 'emphasisMark',
                    start: match.index,
                    end: match.index + match[0].length,
                    content: match[1].trim(),
                    mark: match[2].trim()
                });
            }
        }

        // 跳转链接 [[jumpuri:文字 > url]]
        const jumpuriRegex = /\[\[jumpuri:([^>]+?)\s*>\s*([^\]]+?)\]\]/g;
        while ((match = jumpuriRegex.exec(text)) !== null) {
            if (this.isEscaped(text, match.index)) {
                jumpuriRegex.lastIndex = match.index + 1;
                continue;
            }
            if (!this.isInsideCode(match.index, matches)) {
                matches.push({
                    type: 'jumpuri',
                    start: match.index,
                    end: match.index + match[0].length,
                    content: match[1].trim(),
                    href: match[2].trim()
                });
            }
        }

        // 批注 [[type:content]] — 放在最后，排除已匹配区域
        const annotationRegex = /\[\[(\w+):([^\]]+)\]\]/g;
        while ((match = annotationRegex.exec(text)) !== null) {
            if (this.isEscaped(text, match.index)) {
                annotationRegex.lastIndex = match.index + 1;
                continue;
            }
            if (!this.isInsideCode(match.index, matches) && !this.isOverlappingAny(match.index, match[0].length, matches)) {
                matches.push({
                    type: 'annotation',
                    start: match.index,
                    end: match.index + match[0].length,
                    annoType: match[1],
                    content: match[2].trim()
                });
            }
        }

        // 按位置排序
        matches.sort((a, b) => a.start - b.start);

        // 合并相邻且同类型的
        const merged = this.mergeAdjacentMatches(matches);

        // 构建结果
        let lastEnd = 0;
        for (const m of merged) {
            // 添加前面的普通文本
            if (m.start > lastEnd) {
                result.push({
                    type: 'text',
                    content: text.slice(lastEnd, m.start)
                });
            }
            
            // 添加匹配的元素
            const item = { type: m.type };
            if (m.type === 'image') {
                item.alt = m.alt;
                item.src = m.src;
                item.title = m.title;
            } else if (m.type === 'link') {
                item.content = m.content;
                item.href = m.href;
                item.title = m.title;
                // 链接内容可能还有行内格式，递归解析
                item.inlineContent = this.parseInline(m.content);
            } else if (m.type === 'mark') {
                item.content = m.content;
            } else if (m.type === 'ruby') {
                item.base = m.base;
                item.ruby = m.ruby;
            } else if (m.type === 'emphasisMark') {
                item.content = m.content;
                item.mark = m.mark;
            } else if (m.type === 'jumpuri') {
                item.content = m.content;
                item.href = m.href;
            } else if (m.type === 'annotation') {
                item.annoType = m.annoType;
                item.content = m.content;
            } else {
                item.content = m.content;
                // 复制递归解析的内部格式（strong/em/del 的嵌套内容）
                if (m.inlineContent) {
                    item.inlineContent = m.inlineContent;
                }
            }
            result.push(item);
            
            lastEnd = m.end;
        }

        // 添加剩余文本
        if (lastEnd < text.length) {
            result.push({
                type: 'text',
                content: text.slice(lastEnd)
            });
        }

        return result.length > 0 ? result : [{ type: 'text', content: text }];
    },

    /**
     * 检查位置是否在代码块内
     */
    isInsideCode(pos, matches) {
        return matches.some(m => m.type === 'code' && pos >= m.start && pos < m.end);
    },

    /**
     * 检查位置是否被反斜杠转义
     * 例：\* 中 * 的位置会被视为已转义
     */
    isEscaped(text, pos) {
        let count = 0;
        for (let i = pos - 1; i >= 0 && text[i] === '\\'; i--) {
            count++;
        }
        return count % 2 === 1;
    },

    /**
     * 去除 Markdown 行内转义符
     * \\ -> \, \* -> *, \_ -> _, 等等
     */
    unescapeMarkdown(text) {
        if (!text || typeof text !== 'string') return text;
        const specialChars = new Set(['\\', '`', '*', '_', '{', '}', '[', ']', '(', ')', '#', '+', '-', '.', '!', '|']);
        let result = '';
        let i = 0;
        while (i < text.length) {
            if (text[i] === '\\' && i + 1 < text.length && specialChars.has(text[i + 1])) {
                let backslashCount = 1;
                for (let j = i - 1; j >= 0 && text[j] === '\\'; j--) {
                    backslashCount++;
                }
                if (backslashCount % 2 === 1) {
                    result += text[i + 1];
                    i += 2;
                    continue;
                }
            }
            result += text[i];
            i++;
        }
        return result;
    },

    /**
     * 检查是否与任何已匹配区域重叠
     */
    isOverlappingAny(pos, length, matches) {
        return matches.some(m => pos < m.end && pos + length > m.start);
    },

    /**
     * 检查位置是否在粗体内（完全包含）
     */
    isInsideStrong(pos, length, matches) {
        return matches.some(m => m.type === 'strong' && pos >= m.start && pos + length <= m.end);
    },

    /**
     * 检查 em 标记是否与 strong 的标记符（**）直接重叠
     * 用于避免 ***text*** 被同时解析为 strong 和 em，但允许 **text *em* text**
     */
    isOverlappingStrongMarker(pos, length, matches) {
        return matches.some(m => {
            if (m.type !== 'strong') return false;
            // em 完全在 strong 的 content 范围内（非标记符位置）→ 允许嵌套
            // 使用 <= 确保边界上的 em（如 strong 结束前刚好结束）也能被识别为嵌套
            if (pos > m.start + 2 && pos + length <= m.end - 2) return false;
            // em 与 strong 的标记符区域重叠 → 排除
            return pos < m.end && pos + length > m.start;
        });
    },

    /**
     * 合并相邻的同类型匹配
     */
    mergeAdjacentMatches(matches) {
        if (matches.length === 0) return matches;
        
        const result = [matches[0]];
        for (let i = 1; i < matches.length; i++) {
            const current = matches[i];
            const last = result[result.length - 1];
            
            // 如果重叠或包含，跳过
            if (current.start < last.end) continue;
            
            result.push(current);
        }
        return result;
    },

    /**
     * 简化版行内解析（用于超大表格）
     * 只处理代码和加粗，跳过复杂格式，性能更好
     */
    parseInlineSimple(text) {
        if (!text) return [{ type: 'text', content: '' }];
        
        const result = [];
        let lastEnd = 0;
        
        // 简单的代码和加粗正则，不递归、不嵌套
        const simpleRegex = /(`[^`]+`)|(\*\*[^*]+\*\*)/g;
        let match;
        
        while ((match = simpleRegex.exec(text)) !== null) {
            if (this.isEscaped(text, match.index)) {
                simpleRegex.lastIndex = match.index + 1;
                continue;
            }
            // 添加前面的普通文本
            if (match.index > lastEnd) {
                result.push({
                    type: 'text',
                    content: text.slice(lastEnd, match.index)
                });
            }
            
            if (match[1]) {
                // 代码 `...`
                result.push({
                    type: 'code',
                    content: match[1].slice(1, -1)
                });
            } else if (match[2]) {
                // 加粗 **...**
                result.push({
                    type: 'strong',
                    content: match[2].slice(2, -2)
                });
            }
            
            lastEnd = match.index + match[0].length;
        }
        
        // 添加剩余文本
        if (lastEnd < text.length) {
            result.push({
                type: 'text',
                content: text.slice(lastEnd)
            });
        }
        
        return result.length > 0 ? result : [{ type: 'text', content: text }];
    }
};
