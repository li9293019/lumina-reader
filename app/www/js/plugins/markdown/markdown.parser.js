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

        // 与阅读器章节系统兼容：输出 heading1, heading2 等格式
        return {
            type: `heading${level}`,
            level,
            text,
            display: text,
            inlineContent,
            raw: line
        };
    },

    /**
     * 解析 Setext 标题 (underline style)
     */
    parseSetextHeading(lines, startIndex) {
        if (startIndex + 1 >= lines.length) return null;
        
        const line = lines[startIndex];
        const nextLine = lines[startIndex + 1];
        
        if (/^={3,}\s*$/.test(nextLine)) {
            const text = line.trim();
            const inlineContent = this.parseInline(text);
            return {
                type: 'heading1',
                level: 1,
                text,
                display: text,
                inlineContent,
                raw: line + '\n' + nextLine
            };
        }
        
        if (/^-{3,}\s*$/.test(nextLine)) {
            const text = line.trim();
            const inlineContent = this.parseInline(text);
            return {
                type: 'heading2',
                level: 2,
                text,
                display: text,
                inlineContent,
                raw: line + '\n' + nextLine
            };
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
                raw: lines.slice(startIndex, i).join('\n')
            },
            nextIndex: i
        };
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
            line.match(/^\|/)                     // 表格
        );
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
        const strongRegex = /\*\*([^\*]+)\*\*|__([^_]+)__/g;
        while ((match = strongRegex.exec(text)) !== null) {
            if (!this.isInsideCode(match.index, matches)) {
                matches.push({
                    type: 'strong',
                    start: match.index,
                    end: match.index + match[0].length,
                    content: match[1] || match[2]
                });
            }
        }

        // 斜体（但要排除已经是粗体的一部分）
        const emRegex = /\*([^\*]+)\*|_([^_]+)_/g;
        while ((match = emRegex.exec(text)) !== null) {
            if (!this.isInsideCode(match.index, matches) && 
                !this.isInsideStrong(match.index, match[0].length, matches)) {
                matches.push({
                    type: 'em',
                    start: match.index,
                    end: match.index + match[0].length,
                    content: match[1] || match[2]
                });
            }
        }

        // 删除线
        const delRegex = /~~([^~]+)~~/g;
        while ((match = delRegex.exec(text)) !== null) {
            if (!this.isInsideCode(match.index, matches)) {
                matches.push({
                    type: 'del',
                    start: match.index,
                    end: match.index + match[0].length,
                    content: match[1]
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
            } else {
                item.content = m.content;
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
     * 检查位置是否在粗体内
     */
    isInsideStrong(pos, length, matches) {
        return matches.some(m => m.type === 'strong' && pos >= m.start && pos + length <= m.end);
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
