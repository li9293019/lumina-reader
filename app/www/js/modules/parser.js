// ==================== 5. 编码管理器 ====================

Lumina.Parser.EncodingManager = {
    confidenceThreshold: { HIGH: 85, MEDIUM: 70, LOW: 50 },

    async processFile(file) {
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

        const bom = this.detectBOM(uint8);
        if (bom) return { text: new TextDecoder(bom.encoding).decode(uint8.slice(bom.skip)), originalEncoding: bom.encoding, confidence: 100 };

        const scores = this.calculateConfidenceScores(uint8);
        const candidates = this.generateCandidates(scores);

        for (const { encoding, confidence } of candidates) {
            try {
                const result = this.tryDecode(uint8, encoding);
                if (result && this.validateDecodedText(result)) return { text: result, originalEncoding: encoding, confidence };
            } catch (e) { continue; }
        }

        const text = new TextDecoder('GB18030').decode(uint8);
        return { text, originalEncoding: 'GB18030', confidence: 30 };
    },

    calculateConfidenceScores(bytes) {
        const scores = [], sampleSize = Math.min(bytes.length, 2000);
        const utf8Score = this.calculateUTF8Score(bytes, sampleSize);
        if (utf8Score > 0) scores.push({ encoding: 'UTF-8', score: utf8Score, reason: 'valid_utf8' });
        const gbkScore = this.calculateGBKScore(bytes, sampleSize);
        if (gbkScore > 0) scores.push({ encoding: 'GBK', score: gbkScore, reason: 'gbk_pairs' });
        const big5Score = this.calculateBig5Score(bytes, sampleSize);
        if (big5Score > 0) scores.push({ encoding: 'Big5', score: big5Score, reason: 'big5_pairs' });
        const ansiScore = this.calculateANSIScore(bytes, sampleSize);
        if (ansiScore > 0) scores.push({ encoding: 'Windows-1252', score: ansiScore, reason: 'ansi_extended' });
        return scores.sort((a, b) => b.score - a.score);
    },

    calculateUTF8Score(bytes, sampleSize) {
        let validSequences = 0, invalidSequences = 0, multiByteChars = 0, i = 0;
        while (i < sampleSize && i < bytes.length) {
            const b1 = bytes[i];
            if (b1 < 0x80) { validSequences++; i++; continue; }
            const seqLen = this.getUTF8SequenceLength(b1);
            if (seqLen === 0 || i + seqLen > bytes.length) { invalidSequences++; i++; continue; }
            let valid = true;
            for (let j = 1; j < seqLen; j++) if ((bytes[i + j] & 0xC0) !== 0x80) { valid = false; break; }
            if (valid && seqLen > 1) {
                const codePoint = this.extractUTF8CodePoint(bytes, i, seqLen);
                const minVal = [0, 0, 0x80, 0x800, 0x10000][seqLen];
                if (codePoint < minVal) valid = false;
                if (codePoint >= 0xD800 && codePoint <= 0xDFFF) valid = false;
                if (valid) multiByteChars++;
            }
            if (valid) validSequences++; else invalidSequences++;
            i += seqLen;
        }
        const total = validSequences + invalidSequences;
        if (total === 0) return 0;
        const ratio = validSequences / total;
        if (ratio > 0.98 && multiByteChars > 0) return 95;
        if (ratio > 0.95 && multiByteChars > 0) return 85;
        if (ratio > 0.90 && multiByteChars > 0) return 70;
        return 0;
    },

    getUTF8SequenceLength(b1) {
        if ((b1 & 0x80) === 0) return 1;
        if ((b1 & 0xE0) === 0xC0) return 2;
        if ((b1 & 0xF0) === 0xE0) return 3;
        if ((b1 & 0xF8) === 0xF0) return 4;
        return 0;
    },

    extractUTF8CodePoint(bytes, start, len) {
        if (len === 2) return ((bytes[start] & 0x1F) << 6) | (bytes[start + 1] & 0x3F);
        if (len === 3) return ((bytes[start] & 0x0F) << 12) | ((bytes[start + 1] & 0x3F) << 6) | (bytes[start + 2] & 0x3F);
        if (len === 4) return ((bytes[start] & 0x07) << 18) | ((bytes[start + 1] & 0x3F) << 12) | ((bytes[start + 2] & 0x3F) << 6) | (bytes[start + 3] & 0x3F);
        return bytes[start];
    },

    calculateGBKScore(bytes, sampleSize) {
        let validPairs = 0, invalidPairs = 0, commonChars = 0, i = 0;
        while (i < sampleSize - 1) {
            const b1 = bytes[i];
            if (b1 >= 0x81 && b1 <= 0xFE) {
                const b2 = bytes[i + 1];
                const validB2 = (b2 >= 0x40 && b2 <= 0x7E) || (b2 >= 0x80 && b2 <= 0xFE);
                if (validB2) {
                    const isCommon = (b1 >= 0xB0 && b1 <= 0xF7 && b2 >= 0xA1 && b2 <= 0xFE);
                    if (isCommon) commonChars++;
                    validPairs++; i += 2; continue;
                } else invalidPairs++;
            } else if (b1 > 0x7F) invalidPairs++;
            i++;
        }
        const total = validPairs + invalidPairs;
        if (total < 10) return 0;
        const ratio = validPairs / total;
        const commonBonus = Math.min(commonChars * 2, 20);
        if (ratio > 0.95) return Math.min(90 + commonBonus, 95);
        if (ratio > 0.90) return Math.min(80 + commonBonus, 85);
        if (ratio > 0.80) return Math.min(65 + commonBonus, 75);
        return 0;
    },

    calculateBig5Score(bytes, sampleSize) {
        let validPairs = 0, i = 0;
        while (i < sampleSize - 1) {
            const b1 = bytes[i];
            if (b1 >= 0x81 && b1 <= 0xFE) {
                const b2 = bytes[i + 1];
                if ((b2 >= 0x40 && b2 <= 0x7E) || (b2 >= 0xA1 && b2 <= 0xFE)) { validPairs++; i += 2; continue; }
            }
            i++;
        }
        if (validPairs < 20) return 0;
        return Math.min(85, 70 + validPairs / 10);
    },

    calculateANSIScore(bytes, sampleSize) {
        let extendedChars = 0, isolatedExtended = 0;
        for (let i = 0; i < sampleSize; i++) {
            const b = bytes[i];
            if (b >= 0x80 && b <= 0xFF) {
                extendedChars++;
                const isDoubleByteLead = b >= 0x81 && b <= 0xFE;
                if (!isDoubleByteLead || i === bytes.length - 1) isolatedExtended++;
            }
        }
        if (isolatedExtended > 10 && isolatedExtended > extendedChars * 0.7) return Math.min(75, 50 + isolatedExtended / 5);
        return 0;
    },

    generateCandidates(scores) {
        const candidates = [];
        for (const { encoding, score } of scores) if (score >= this.confidenceThreshold.MEDIUM) candidates.push({ encoding, confidence: score });
        candidates.push({ encoding: 'UTF-8', confidence: 50 });
        candidates.push({ encoding: 'GB18030', confidence: 40 });
        return candidates;
    },

    tryDecode(bytes, encoding) {
        try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); } catch { return null; }
    },

    validateDecodedText(text) {
        if (text.includes('\uFFFD')) return false;
        const controlChars = text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || [];
        if (controlChars.length > text.length * 0.01) return false;
        let readableCount = 0;
        const checkLen = Math.min(text.length, 500);
        for (let i = 0; i < checkLen; i++) {
            const c = text.charCodeAt(i);
            if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3040 && c <= 0x309F) || (c >= 0x30A0 && c <= 0x30FF) || (c >= 0xAC00 && c <= 0xD7AF) ||
                (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || (c >= 0x30 && c <= 0x39) || (c >= 0x2000 && c <= 0x206F) || c === 0x20 || c === 0x0A || c === 0x0D) readableCount++;
        }
        return readableCount > checkLen * 0.3 || text.length === 0;
    },

    detectBOM(bytes) {
        if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return { encoding: 'UTF-8', skip: 3 };
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return { encoding: 'UTF-16LE', skip: 2 };
        if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return { encoding: 'UTF-16BE', skip: 2 };
        return null;
    }
};

// ==================== 6. 章节解析与处理 ====================

Lumina.Parser.RegexCache = {
    customPatterns: { chapter: null, section: null },
    rawPatterns: { chapter: '', section: '' },

    // 宏定义系统
    macros: {
        // 中文数字（大小写混合）
        '\\C': '[一二三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟萬零〇]',
        
        // 罗马数字（大写）
        '\\R': '[IVXLCDM]+',
        // 罗马数字（小写）
        '\\r': '[ivxlcdm]+',
        
        // 英文字母（大写）
        '\\U': '[A-Z]',
        // 英文字母（小写）
        '\\L': '[a-z]',
        // 英文字母（大小写混合）
        '\\A': '[A-Za-z]',
        // 英文单词（多字母）
        '\\W': '[A-Za-z]+',
        
        // 中文字符（汉字、中文标点等）
        '\\Z': '[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+',
        
        // 数字（阿拉伯数字，多个）
        '\\N': '\\d+',
        // 空白字符（简化）
        '\\S': '\\s+'
    },

    expandMacros(pattern) {
        if (!pattern) return pattern;
        let result = pattern;
        // 按长度降序排序，避免短匹配干扰长匹配（如 \R 和 \r）
        const sortedKeys = Object.keys(this.macros).sort((a, b) => b.length - a.length);
        for (const key of sortedKeys) {
            result = result.split(key).join(this.macros[key]);
        }
        return result;
    },

    updateCustomPatterns(chapterRegex, sectionRegex) {
        this.rawPatterns.chapter = chapterRegex || '';
        this.rawPatterns.section = sectionRegex || '';
        
        const expandedChapter = this.expandMacros(chapterRegex);
        const expandedSection = this.expandMacros(sectionRegex);

        this.customPatterns.chapter = null;
        this.customPatterns.section = null;

        if (chapterRegex) {
            try {
                let pattern = expandedChapter;
                if (!pattern.startsWith('^')) pattern = '^' + pattern;
                if (!pattern.includes('(')) pattern = pattern + '\\s*(.*)';
                this.customPatterns.chapter = new RegExp(pattern, 'i');
            } catch (e) {}
        }

        if (sectionRegex) {
            try {
                let pattern = expandedSection;
                if (!pattern.startsWith('^')) pattern = '^' + pattern;
                if (!pattern.includes('(')) pattern = pattern + '\\s*(.*)';
                this.customPatterns.section = new RegExp(pattern, 'i');
            } catch (e) {}
        }
    },

    detectChapter(text, useCustom = false) {
        if (!text) return null;
        if (text.includes('.........')) return null;
        const trimmed = text.trim();

        if (useCustom) {
            if (!this.customPatterns.chapter && !this.customPatterns.section) return this.detectChapter(text, false);

            if (this.customPatterns.chapter) {
                const match = trimmed.match(this.customPatterns.chapter);
                if (match) {
                    let cleanText = match.length > 1 ? match[match.length - 1] : trimmed.slice(match[0].length).trim().replace(/^[:：\-]\s*/, '').trim();
                    if (!cleanText) cleanText = trimmed;
                    return { level: 1, text: cleanText, raw: trimmed };
                }
            }

            if (this.customPatterns.section) {
                const match = trimmed.match(this.customPatterns.section);
                if (match) {
                    let cleanText = match.length > 1 ? match[match.length - 1] : trimmed.slice(match[0].length).trim().replace(/^[:：\-]\s*/, '').trim();
                    if (!cleanText) cleanText = trimmed;
                    return { level: 2, text: cleanText, raw: trimmed };
                }
            }

            if (!this.customPatterns.chapter && this.customPatterns.section) return this.detectChapter(text, false);
            return null;
        }

        const p = Lumina.Config.regexPatterns;
        
        const chMatch = trimmed.match(p.chineseChapter);
        if (chMatch) {
            const cleanTitle = chMatch[1]?.trim() || chMatch[0].trim();
            return { level: 1, text: cleanTitle, raw: trimmed };
        }

        const enMatch = trimmed.match(p.englishChapter);
        if (enMatch) return { level: 1, text: enMatch[3] ? enMatch[3].trim() : trimmed, raw: trimmed };

        const dashMatch = trimmed.match(p.sectionDash);
        if (dashMatch) return { level: 2, text: dashMatch[3] ? dashMatch[3].trim() : trimmed, raw: trimmed };

        const cnSecMatch = trimmed.match(p.sectionCn);
        if (cnSecMatch) return { level: 2, text: cnSecMatch[1] ? cnSecMatch[1].trim() : trimmed, raw: trimmed };

        const enSecMatch = trimmed.match(p.sectionEn);
        if (enSecMatch) return { level: 2, text: enSecMatch[2] ? enSecMatch[2].trim() : trimmed, raw: trimmed };

        if (p.specialTitles.test(trimmed)) return { level: 1, text: trimmed, raw: trimmed, isSpecial: true };

        return null;
    }
};

Lumina.Parser.processHeading = (level, rawText, cleanText = null) => {
    level = Math.max(1, Math.min(6, level));
    Lumina.State.sectionCounters[level - 1]++;
    for (let i = level; i < 6; i++) Lumina.State.sectionCounters[i] = 0;

    const textForDisplay = cleanText !== null ? cleanText : rawText;
    const display = Lumina.Config.numberingStrategies[Lumina.State.settings.chapterNumbering](level, Lumina.State.sectionCounters, textForDisplay);

    return {
        type: `heading${level}`,
        level,
        text: rawText,
        display,
        cleanText: cleanText !== null ? cleanText : rawText
    };
};

// ==================== 7. 文件解析器 ====================

/**
 * DOCX 解密辅助函数
 */
Lumina.Parser.decryptDOCX = async (arrayBuffer, password) => {
    // 检查库是否可用
    const cryptoLib = window.officeCrypto;
    if (!cryptoLib || typeof cryptoLib.decrypt !== 'function') {
        console.error('[DOCX] officeCrypto not available');
        throw new Error('DOCX decryption library not available');
    }
    
    // 注意：officecrypto-tool 依赖 Node.js 的 Buffer 和 crypto 模块
    // browserify 打包后在浏览器/APP WebView 中可能无法正常工作
    // 这里尝试调用，如果失败会抛出错误
    
    // 转换为 Uint8Array，库需要这种格式
    const inputData = new Uint8Array(arrayBuffer);
    console.log('[DOCX] Calling officeCrypto.decrypt...');
    
    // 调用解密函数
    const result = await cryptoLib.decrypt(inputData, {password});
    console.log('[DOCX] Decryption successful');
    
    // 返回 ArrayBuffer
    if (result.buffer) {
        return result.buffer;
    }
    return result;
};

/**
 * 解析 DOCX 文件
 * @param {ArrayBuffer} arrayBuffer - DOCX 文件的 ArrayBuffer
 * @param {string} password - 可选的解密密码
 * @returns {Promise<{items: Array, type: string}>}
 */
Lumina.Parser.parseDOCX = async (arrayBuffer, password = null) => {
    let zip;
    
    // 尝试用密码解密（如果需要）
    if (password) {
        try {
            const decryptedBuffer = await Lumina.Parser.decryptDOCX(arrayBuffer, password);
            zip = await JSZip.loadAsync(decryptedBuffer);
        } catch (decryptError) {
            console.error('[DOCX] Decryption error:', decryptError);
            // 检查错误类型来给出更准确的提示
            const errorMsg = decryptError.message ? decryptError.message.toLowerCase() : '';
            if (errorMsg.includes('password') || errorMsg.includes('incorrect') || errorMsg.includes('invalid') || errorMsg.includes('not available')) {
                throw new Error('Password incorrect');
            }
            // 其他错误也视为密码错误
            throw new Error('Password incorrect');
        }
    } else {
        try {
            zip = await JSZip.loadAsync(arrayBuffer);
        } catch (zipError) {
            // 检查是否是加密文件（JSZip 无法读取加密文件）
            if (zipError.message && zipError.message.includes('end of central directory')) {
                throw new Error('DOCX encrypted');
            }
            throw zipError;
        }
    }
    let styleDefs = {};
    const images = {}, relsMap = {};

    const imageFiles = Object.keys(zip.files).filter(name => name.startsWith('word/media/') && /\.(png|jpg|jpeg|gif|bmp|svg)$/i.test(name));
    for (const imgPath of imageFiles) {
        const imgData = await zip.file(imgPath).async('base64');
        const ext = imgPath.split('.').pop().toLowerCase();
        const mimeType = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' }[ext] || 'image/png';
        images[imgPath] = `data:${mimeType};base64,${imgData}`;
    }

    try {
        const relsXml = await zip.file('word/_rels/document.xml.rels').async('text');
        const relsDoc = new DOMParser().parseFromString(relsXml, 'text/xml');
        Array.from(relsDoc.getElementsByTagName('Relationship')).forEach(rel => {
            const id = rel.getAttribute('Id'), target = rel.getAttribute('Target'), type = rel.getAttribute('Type');
            if (type && type.includes('image')) {
                const fullPath = target.startsWith('word/') ? target : `word/${target}`;
                relsMap[id] = fullPath;
            }
        });
    } catch (e) { }

    try {
        const stylesXml = await zip.file('word/styles.xml').async('text');
        const stylesDoc = new DOMParser().parseFromString(stylesXml, 'text/xml');
        Array.from(stylesDoc.getElementsByTagName('w:style')).forEach(style => {
            const styleId = style.getAttribute('w:styleId');
            const nameNode = style.getElementsByTagName('w:name')[0];
            const name = nameNode ? nameNode.getAttribute('w:val') : '';
            if (name || styleId) styleDefs[styleId.toLowerCase()] = { name: (name || '').toLowerCase(), styleId: styleId.toLowerCase() };
        });
    } catch (e) { }

    // 尝试读取 core.xml 获取元数据（标题、作者等）
    let docxMetadata = null;
    try {
        const coreXml = await zip.file('docProps/core.xml').async('text');
        docxMetadata = Lumina.Parser.MetadataExtractor?.extractFromDOCXCore(coreXml);
    } catch (e) { /* 忽略元数据读取失败 */ }

    const xmlContent = await zip.file('word/document.xml').async('text');
    const xmlDoc = new DOMParser().parseFromString(xmlContent, 'text/xml');
    const body = xmlDoc.getElementsByTagName('w:body')[0];
    const paragraphs = Array.from(body.getElementsByTagName('w:p'));

    Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
    const results = [];

    paragraphs.forEach(p => {
        const text = Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('');
        const pPr = p.getElementsByTagName('w:pPr')[0];
        const styleId = pPr ? (pPr.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') || '').toLowerCase() : '';

        // 关键修复：只排除目录，不排除空段落
        const isToc = styleId && ['toc', '目录', 'table of contents'].some(keyword => styleId.includes(keyword));
        
        if (!isToc) {
            const styleInfo = Lumina.Parser.getDOCXStyleInfo(pPr, styleId, styleDefs[styleId]?.name || '');
            const item = Lumina.Parser.processDOCXStyleInfo(styleInfo, text);
            
            // 确保空段落也被处理为 paragraph 类型
            if (item) {
                // 如果文本为空且不是特殊类型，确保标记为空段落
                if (!text.trim() && item.type === 'paragraph') {
                    item.isEmpty = true; // 标记为空，便于后续渲染特殊处理
                }
                results.push(item);
            }
        }

        const drawings = p.getElementsByTagName('w:drawing');
        if (drawings.length > 0) {
            for (const drawing of drawings) {
                const blip = drawing.getElementsByTagName('a:blip')[0] || drawing.getElementsByTagName('c:blip')[0];
                if (blip) {
                    const embedId = blip.getAttribute('r:embed');
                    const imgPath = relsMap[embedId];
                    if (imgPath && images[imgPath]) results.push({ type: 'image', data: images[imgPath], alt: 'Image' });
                }
            }
        }

        const picts = p.getElementsByTagName('w:pict');
        if (picts.length > 0) {
            for (const pict of picts) {
                const imagedata = pict.getElementsByTagName('v:imagedata')[0];
                if (imagedata) {
                    const relId = imagedata.getAttribute('r:id');
                    const imgPath = relsMap[relId];
                    if (imgPath && images[imgPath]) results.push({ type: 'image', data: images[imgPath], alt: 'Image' });
                }
                const binData = pict.getElementsByTagName('w:binData')[0];
                if (binData) {
                    const base64 = binData.textContent.trim();
                    if (base64) results.push({ type: 'image', data: `data:image/png;base64,${base64}`, alt: 'Image' });
                }
            }
        }
    });

    return { items: results, type: 'docx', docxMetadata };
};

Lumina.Parser.processDOCXStyleInfo = (styleInfo, text) => {
    if (styleInfo.isSubtitle) return { type: 'subtitle', text, display: `${text}` };
    if (styleInfo.isTitle) return { type: 'title', text, display: `${text}` };
    if (styleInfo.level >= 1 && styleInfo.level <= 6) return Lumina.Parser.processHeading(styleInfo.level, text);
    if (styleInfo.isList) return { type: 'list', level: styleInfo.listLevel, text, display: '  '.repeat(styleInfo.listLevel) + '• ' + text };
    return { type: 'paragraph', text, display: text };
};

Lumina.Parser.getDOCXStyleInfo = (pPr, styleId, styleName) => {
    const info = { level: 0, isTitle: false, isSubtitle: false, isList: false, listLevel: 0 };
    if (!pPr && !styleId) return info;

    const checkId = styleId || '', checkName = styleName || '';
    if ((checkId === 'title' || checkName === 'title' || checkId === '标题' || checkName === '标题') && !checkId.includes('副')) {
        info.isTitle = true; return info;
    }
    if (checkId === 'subtitle' || checkName === 'subtitle' || checkId.includes('副标题') || checkName.includes('副标题')) {
        info.isSubtitle = true; return info;
    }

    const headingMatch = checkId.match(/^heading\s*(\d)$/) || checkName.match(/^heading\s*(\d)$/);
    if (headingMatch) { info.level = parseInt(headingMatch[1]); return info; }

    const cnMatch = checkId.match(/标题\s*([1-6])/) || checkName.match(/标题\s*([1-6])/);
    if (cnMatch) { info.level = parseInt(cnMatch[1]); return info; }

    if (pPr) {
        const outline = pPr.getElementsByTagName('w:outlineLvl')[0];
        if (outline) {
            const lvl = parseInt(outline.getAttribute('w:val'));
            if (lvl >= 0 && lvl <= 5) { info.level = lvl + 1; return info; }
        }
        const numPr = pPr.getElementsByTagName('w:numPr')[0];
        if (numPr) {
            info.isList = true;
            const ilvl = numPr.getElementsByTagName('w:ilvl')[0];
            info.listLevel = ilvl ? parseInt(ilvl.getAttribute('w:val')) : 0;
        }
    }
    return info;
};

// ==================== EPUB 解析器 ====================

/**
 * 解析 EPUB 文件
 * EPUB 本质：ZIP 包 + XML 清单 + HTML 内容
 * 策略：递归遍历所有节点，智能识别标题和段落，正确处理图片
 * @param {ArrayBuffer} arrayBuffer - EPUB 文件的 ArrayBuffer
 * @returns {Promise<{items: Array, type: string}>}
 */
Lumina.Parser.parseEPUB = async (arrayBuffer) => {
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 1. 找到 content.opf 路径
    const containerXml = await zip.file('META-INF/container.xml').async('text');
    const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
    const rootfile = containerDoc.querySelector('rootfile');
    const opfPath = rootfile?.getAttribute('full-path');
    if (!opfPath) throw new Error('Invalid EPUB: content.opf not found');

    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    // 2. 解析 content.opf
    const opfXml = await zip.file(opfPath).async('text');
    const opfDoc = new DOMParser().parseFromString(opfXml, 'text/xml');

    // manifest: id -> { href, media-type, fullPath }
    const manifest = new Map();
    opfDoc.querySelectorAll('manifest > item').forEach(item => {
        const id = item.getAttribute('id');
        const href = item.getAttribute('href');
        const mediaType = item.getAttribute('media-type');
        if (id && href) manifest.set(id, { href, mediaType, fullPath: opfDir + href });
    });

    // spine: 阅读顺序
    const spineIds = Array.from(opfDoc.querySelectorAll('spine > itemref'))
        .map(ref => ref.getAttribute('idref'))
        .filter(Boolean);

    // 3. 扫描 ZIP 中所有图片
    const images = new Map(); // fullPath -> dataURL
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico'];
    
    for (const [fileName, fileObj] of Object.entries(zip.files)) {
        if (fileObj.dir) continue;
        const lowerName = fileName.toLowerCase();
        if (imageExtensions.some(ext => lowerName.endsWith(ext))) {
            try {
                const imgData = await fileObj.async('base64');
                const ext = lowerName.split('.').pop();
                const mimeType = {
                    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                    gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', 
                    webp: 'image/webp', ico: 'image/x-icon'
                }[ext] || 'image/png';
                images.set(fileName, `data:${mimeType};base64,${imgData}`);
            } catch (e) { /* 忽略 */ }
        }
    }
    
    // 提取封面（EPUB metadata中的 cover 或第一个图片）
    let coverImage = null;
    const metaCover = opfDoc.querySelector('meta[name="cover"]');
    if (metaCover) {
        const coverId = metaCover.getAttribute('content');
        const coverItem = manifest.get(coverId);
        if (coverItem) {
            coverImage = images.get(coverItem.fullPath);
        }
    }
    // 如果没有metadata cover，尝试找名为 cover/cover-image 的图片
    if (!coverImage) {
        for (const [path, data] of images) {
            if (path.toLowerCase().includes('cover') && !path.toLowerCase().includes('spine')) {
                coverImage = data;
                break;
            }
        }
    }
    
    // console.log(`[EPUB] 加载了 ${images.size} 张图片${coverImage ? ', 找到封面' : ''}`);

    // 4. 解析工具函数
    const resolveHref = (href, basePath) => {
        if (href.startsWith('http')) return href;
        // 处理相对路径
        const parts = (basePath + href).split('/');
        const resolved = [];
        for (const part of parts) {
            if (part === '..') resolved.pop();
            else if (part && part !== '.') resolved.push(part);
        }
        return resolved.join('/');
    };
    
    // 智能图片查找（处理各种路径变体）
    const findImage = (src, basePath) => {
        // URL 解码（处理 %20 等编码）
        const decodedSrc = decodeURIComponent(src);
        
        // 尝试直接路径
        let fullPath = resolveHref(src, basePath);
        let data = images.get(fullPath);
        if (data) return data;
        
        // 尝试解码后的路径
        if (decodedSrc !== src) {
            fullPath = resolveHref(decodedSrc, basePath);
            data = images.get(fullPath);
            if (data) return data;
        }
        
        // 尝试去掉开头的 /
        if (src.startsWith('/')) {
            data = images.get(src.substring(1));
            if (data) return data;
        }
        
        // 尝试不带 basePath
        data = images.get(src);
        if (data) return data;
        
        data = images.get(decodedSrc);
        if (data) return data;
        
        // 尝试只匹配文件名
        const fileName = src.split('/').pop().toLowerCase();
        const decodedFileName = decodedSrc.split('/').pop().toLowerCase();
        
        for (const [path, imgData] of images) {
            const pathLower = path.toLowerCase();
            if (pathLower.endsWith('/' + fileName) || pathLower === fileName ||
                pathLower.endsWith('/' + decodedFileName) || pathLower === decodedFileName) {
                return imgData;
            }
        }
        
        // 尝试匹配文件名（不含扩展名）
        const nameNoExt = fileName.replace(/\.[^.]+$/, '');
        const decodedNameNoExt = decodedFileName.replace(/\.[^.]+$/, '');
        
        for (const [path, imgData] of images) {
            const pathName = path.split('/').pop().toLowerCase().replace(/\.[^.]+$/, '');
            if (pathName === nameNoExt || pathName === decodedNameNoExt) {
                return imgData;
            }
        }
        
        return null;
    };

    // 5. 按 spine 顺序解析 HTML
    Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
    const results = [];
    let skippedTocPages = 0;
    
    // 目录检测函数
    const isTocElement = (el) => {
        const tag = el.tagName?.toLowerCase();
        const className = (el.getAttribute('class') || '').toLowerCase();
        const id = (el.getAttribute('id') || '').toLowerCase();
        
        // 1. EPUB 3 的 nav 标签（通常是目录）
        if (tag === 'nav') return true;
        
        // 2. class/id 包含目录关键词
        const tocKeywords = ['toc', 'table-of-contents', 'tableofcontents', 'index', 'contents', 'list-of-illustrations', 'illustrations'];
        if (tocKeywords.some(kw => className.includes(kw) || id.includes(kw))) return true;
        
        // 3. 检查文本内容是否像目录（大量罗马数字/章节编号 + 点号连接符）
        const text = el.textContent || '';
        if (text.length > 100) {
            // 检查是否包含大量章节编号模式
            const chapterPatterns = /\b(chapter|chap|第[一二三四五六七八九十百千万零〇\d]+章|chapter\s+[ivx0-9]+)\b/gi;
            const pagePatterns = /\.{3,}|\u2026|\u00A0|\d+\s*$/gm; // 点号连接符或页码
            const chapterMatches = text.match(chapterPatterns);
            const pageMatches = text.match(pagePatterns);
            
            // 如果包含多个章节标记和页码标记，可能是目录
            if (chapterMatches && chapterMatches.length > 3 && pageMatches && pageMatches.length > 3) {
                return true;
            }
            
            // 检查是否包含大量罗马数字列表（I., II., III., IV., V.）
            const romanPattern = /\b[IVXivx]+\.\s+/g;
            const romanMatches = text.match(romanPattern);
            if (romanMatches && romanMatches.length > 10) {
                return true;
            }
        }
        
        return false;
    };

    for (const id of spineIds) {
        const item = manifest.get(id);
        if (!item || !(item.mediaType?.includes('html') || item.mediaType?.includes('xhtml'))) continue;

        try {
            const htmlContent = await zip.file(item.fullPath)?.async('text');
            if (!htmlContent) continue;

            const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
            const body = doc.body;
            const basePath = item.fullPath.includes('/') 
                ? item.fullPath.substring(0, item.fullPath.lastIndexOf('/') + 1) 
                : opfDir;
            
            // 预检查：如果 body 本身像目录页，跳过整个文件
            if (isTocElement(body)) {
                // console.log(`[EPUB] 跳过疑似目录页: ${item.fullPath}`);
                skippedTocPages++;
                continue;
            }

            // 递归遍历函数
            const walk = (node, inParagraph = false) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    // 文本节点
                    const text = node.textContent?.trim();
                    if (!text) return;
                    
                    // 如果已经在段落处理中，不重复提取
                    if (inParagraph) return;
                    
                    // 检查父级
                    const parent = node.parentElement;
                    if (!parent) return;
                    
                    const parentTag = parent.tagName.toLowerCase();
                    
                    // 如果父级是已处理的块级标签，跳过
                    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'script', 'style'].includes(parentTag)) {
                        return;
                    }
                    
                    // 如果父级是行内元素，继续向上检查
                    if (['a', 'span', 'em', 'strong', 'i', 'b', 'small', 'mark', 'del', 'ins', 'sub', 'sup'].includes(parentTag)) {
                        // 检查祖父级
                        const grandparent = parent.parentElement;
                        if (grandparent) {
                            const gpTag = grandparent.tagName.toLowerCase();
                            if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(gpTag)) {
                                return; // 在段落/标题/列表内，不重复提取
                            }
                        }
                    }
                    
                    // 其他情况，创建段落
                    results.push({ type: 'paragraph', text, display: text });
                    return;
                }

                if (node.nodeType !== Node.ELEMENT_NODE) return;

                const tag = node.tagName.toLowerCase();
                
                // 跳过目录元素
                if (isTocElement(node)) {
                    return;
                }
                
                // 跳过脚本和样式
                if (tag === 'script' || tag === 'style') return;

                // 标题 h1-h6
                if (/^h[1-6]$/.test(tag)) {
                    const text = node.textContent?.trim();
                    if (text) {
                        const level = parseInt(tag[1]);
                        results.push(Lumina.Parser.processHeading(level, text));
                    }
                    return; // 不递归子元素
                }

                // 图片 img
                if (tag === 'img') {
                    const src = node.getAttribute('src');
                    if (src) {
                        const data = findImage(src, basePath);
                        if (data) {
                            results.push({ type: 'image', data, alt: node.getAttribute('alt')?.trim() || '' });
                        } else {
                            // console.warn(`[EPUB] Image not found: ${src}`);
                        }
                    }
                    return;
                }
                
                // SVG 图片
                if (tag === 'image') {
                    const href = node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                    if (href) {
                        const data = findImage(href, basePath);
                        if (data) {
                            results.push({ type: 'image', data, alt: '' });
                        } else {
                            // console.warn(`[EPUB] SVG image not found: ${href}`);
                        }
                    }
                    return;
                }

                // 段落 p
                if (tag === 'p') {
                    // 提取所有文本片段和图片
                    const parts = [];
                    
                    const extractNodes = (n) => {
                        for (const child of n.childNodes) {
                            if (child.nodeType === Node.TEXT_NODE) {
                                const text = child.textContent?.trim();
                                if (text) parts.push({ type: 'text', text });
                            } else if (child.nodeType === Node.ELEMENT_NODE) {
                                const childTag = child.tagName.toLowerCase();
                                if (childTag === 'img') {
                                    const src = child.getAttribute('src');
                                    if (src) {
                                        const data = findImage(src, basePath);
                                        if (data) {
                                            parts.push({ type: 'image', data, alt: child.getAttribute('alt')?.trim() || '' });
                                        }
                                    }
                                } else if (['script', 'style'].includes(childTag)) {
                                    // 跳过
                                } else {
                                    // 递归处理其他内联元素
                                    extractNodes(child);
                                }
                            }
                        }
                    };
                    
                    extractNodes(node);
                    
                    // 合并连续的文本片段
                    let currentText = '';
                    for (const part of parts) {
                        if (part.type === 'text') {
                            currentText += (currentText ? ' ' : '') + part.text;
                        } else if (part.type === 'image') {
                            if (currentText) {
                                results.push({ type: 'paragraph', text: currentText, display: currentText });
                                currentText = '';
                            }
                            results.push({ type: 'image', data: part.data, alt: part.alt });
                        }
                    }
                    if (currentText) {
                        results.push({ type: 'paragraph', text: currentText, display: currentText });
                    }
                    return; // 不递归子元素
                }

                // 列表项
                if (tag === 'li') {
                    const text = node.textContent?.trim();
                    if (text) {
                        results.push({ type: 'list', text, display: '• ' + text });
                    }
                    return;
                }

                // 换行分隔符
                if (tag === 'hr') {
                    results.push({ type: 'paragraph', text: '---', display: '---' });
                    return;
                }
                
                // 链接 a（独立的链接，不在段落内）
                if (tag === 'a') {
                    const text = node.textContent?.trim();
                    if (text) {
                        results.push({ type: 'paragraph', text, display: text });
                    }
                    return;
                }

                // 块引用
                if (tag === 'blockquote') {
                    const text = node.textContent?.trim();
                    if (text) {
                        results.push({ type: 'paragraph', text, display: text });
                    }
                    return;
                }
                
                // figure 标签（图片容器）
                if (tag === 'figure') {
                    // 查找 figure 中的图片
                    const figImg = node.querySelector('img');
                    if (figImg) {
                        const src = figImg.getAttribute('src');
                        if (src) {
                            const data = findImage(src, basePath);
                            if (data) {
                                results.push({ type: 'image', data, alt: figImg.getAttribute('alt')?.trim() || '' });
                            }
                        }
                    }
                    // 查找 figcaption 作为段落
                    const caption = node.querySelector('figcaption');
                    if (caption) {
                        const text = caption.textContent?.trim();
                        if (text) results.push({ type: 'paragraph', text, display: text });
                    }
                    return; // 处理完 figure 不递归
                }

                // 其他元素：递归处理子节点
                for (const child of node.childNodes) {
                    walk(child, inParagraph);
                }
            };

            // 开始遍历
            for (const child of body.childNodes) {
                walk(child, false);
            }

        } catch (e) {
            console.warn(`[EPUB] Failed to parse ${item.fullPath}:`, e);
        }
    }

    // 统计信息
    const headingCount = results.filter(r => r.type?.startsWith('heading')).length;
    const imageCount = results.filter(r => r.type === 'image').length;
    const textCount = results.filter(r => r.type === 'paragraph').length;
    const listCount = results.filter(r => r.type === 'list').length;
    
    // 调试：列出所有可用的图片路径
    // if (images.size > 0 && imageCount < images.size) {
    //     console.log(`[EPUB] 可用图片路径:`, Array.from(images.keys()));
    // }
    
    // console.log(`[EPUB] 解析完成: ${results.length} 个元素, ${headingCount} 个标题, ${textCount} 段文本, ${listCount} 个列表项, ${imageCount}/${images.size} 张图片${skippedTocPages > 0 ? ', 跳过' + skippedTocPages + '个目录页' : ''}`);
    
    // 提取 EPUB 元数据（用于自动识别书名、作者）
    const epubMetadata = Lumina.Parser.MetadataExtractor?.extractFromEPUBOPF(opfDoc) || {};
    
    return { items: results, type: 'epub', coverImage, epubMetadata };
};

// ==================== PDF 解析器 ====================

// 初始化 PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = './assets/js/pdf.worker.min.js';
}

/**
 * 解析 PDF 文件
 * @param {ArrayBuffer} arrayBuffer - PDF 文件的 ArrayBuffer
 * @param {Function} onProgress - 进度回调函数
 * @param {string} fileName - 文件名（用于密码预设器）
 * @returns {Promise<{items: Array, type: string}>}
 */
Lumina.Parser.parsePDF = async (arrayBuffer, onProgress = null, fileName = '') => {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js library not loaded');
    }

    const results = [];
    let currentPdf = null;

    // 用户取消标记
    let userCancelled = false;
    
    // 密码预设相关状态（闭包变量，在 onPassword 多次调用间保持状态）
    const passwordState = {
        initialized: false,
        passwords: [],
        currentIndex: 0,
        wasLoadingActive: false
    };
    
    // 读取设置：是否提取图片
    const extractImages = Lumina.State?.settings?.pdfExtractImages !== false;
    // console.log(`[PDF] Extract images: ${extractImages}`);

    let loadingTask = null;
    
    try {
        loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            useSystemFonts: true,
            cMapUrl: './assets/js/cmaps/',
            cMapPacked: true
        });

        // 处理密码保护
        loadingTask.onPassword = (updateCallback, reason) => {
            // 用户已取消，抛出异常终止解析
            if (userCancelled) {
                throw new Error('Password cancelled');
            }
            
            const t = Lumina.I18n.t;
            const isRetry = reason === 2;
            
            // 第一次被调用：尝试预设密码
            if (!isRetry && !passwordState.initialized && Lumina.PasswordPreset) {
                passwordState.initialized = true;
                passwordState.passwords = Lumina.PasswordPreset.generatePasswords(fileName);
                passwordState.currentIndex = 0;
                
                if (passwordState.passwords.length > 0) {
                    const loadingText = Lumina.DOM.loadingScreen?.querySelector('.loading-text');
                    if (loadingText) {
                        loadingText.textContent = `${t('pdfTryingPresetPasswords') || '正在尝试预设密码'} (${passwordState.passwords.length})...`;
                    }
                }
            }
            
            // 尝试下一个预设密码
            if (passwordState.currentIndex < passwordState.passwords.length) {
                const password = passwordState.passwords[passwordState.currentIndex++];
                updateCallback(password);
                return;
            }
            
            // 预设密码都试完了，显示输入对话框
            const title = isRetry ? t('pdfPasswordError') : t('pdfPasswordRequired');
            const message = isRetry ? t('pdfPasswordRetry') : 
                           (passwordState.passwords.length > 0 ? t('pdfPresetPasswordsFailed') || '预设密码尝试失败，请手动输入' : t('pdfPasswordPrompt'));
            
            // 隐藏 loading
            const wasLoadingActive = Lumina.DOM.loadingScreen?.classList.contains('active');
            const loadingText = Lumina.DOM.loadingScreen?.querySelector('.loading-text');
            
            if (wasLoadingActive) Lumina.DOM.loadingScreen.classList.remove('active');
            
            Lumina.UI.showDialog(message, 'prompt', async (result) => {
                if (result === null || result === false) {
                    userCancelled = true;
                    // 用户取消，传入 null 让 PDF.js 抛出错误
                    updateCallback(null);
                    return;
                }
                
                // 恢复 loading 界面
                if (wasLoadingActive && Lumina.DOM.loadingScreen) {
                    Lumina.DOM.loadingScreen.classList.add('active');
                    if (loadingText) {
                        loadingText.textContent = `${t('pdfDecrypting') || 'PDF 解密中'}...`;
                    }
                }
                
                // 延迟调用 updateCallback，让 UI 先更新
                await new Promise(resolve => setTimeout(resolve, 100));
                updateCallback(result);
            }, { title, inputType: 'password', placeholder: t('pdfPasswordPlaceholder') });
        };

        currentPdf = await loadingTask.promise;
        const numPages = currentPdf.numPages;
        
        // 【优化】检测文档级根结构树，避免后续每页重复检测
        let documentHasStructure = false;
        let structureTreeHasMCID = false; // 关键：是否有mcid/bbox可用于匹配
        
        try {
            const testPage = await currentPdf.getPage(1);
            const pageProto = Object.getPrototypeOf(testPage);
            const pageMethods = Object.getOwnPropertyNames(pageProto).filter(m => typeof testPage[m] === 'function');
            const hasStructTree = pageMethods.includes('getStructTree');
            
            if (hasStructTree) {
                const firstPageTree = await testPage.getStructTree();
                if (firstPageTree && firstPageTree.children && firstPageTree.children.length > 0) {
                    // 检查是否有mcid或bbox
                    const checkUsable = (node) => {
                        if (!node) return false;
                        if (node.type === 'content' && node.mcid !== undefined) return true;
                        if (node.box) return true;
                        if (node.children) return node.children.some(checkUsable);
                        return false;
                    };
                    structureTreeHasMCID = firstPageTree.children.some(checkUsable);
                    documentHasStructure = true;
                    
                    // 关键判断：有mcid才继续每页检测，否则跳过
                    console.log(`[PDF] 结构树: ${structureTreeHasMCID ? '可用' : '无mcid(后续跳过)'}`);
                } else {
                    console.log('[PDF] 结构树: 无');
                }
            } else {
                console.log('[PDF] 结构树: 不支持');
            }
        } catch (e) {
            documentHasStructure = false;
            console.log(`[PDF] 文档结构树检测: 获取失败 (${e.message})`);
        }
        
        // 如果有密码保护，此时需要恢复解析进度显示
        if (onProgress && numPages > 0) {
            onProgress(0, numPages);
        }

        // 用于跨页段落合并
        let carryOverText = '';
        let carryOverY = 0;

        // 存储每页的段落和图片
        const pageContents = [];

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            // 更新进度
            if (onProgress) {
                onProgress(pageNum, numPages);
                // 让出主线程，确保 UI 更新
                await new Promise(r => setTimeout(r, 0));
            }

            const page = await currentPdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.0 });
            const textContent = await page.getTextContent();

            // 提取并处理文本（包含跨页合并逻辑）
            const { paragraphs, newCarryOver, newCarryOverY } = await Lumina.Parser.processPDFPageText(
                textContent, 
                viewport.height, 
                carryOverText,
                carryOverY,
                page,
                documentHasStructure,   // 是否有结构树
                structureTreeHasMCID    // 是否有mcid/box可用（关键性能优化）
            );

            // 更新跨页携带的文本
            carryOverText = newCarryOver || '';
            carryOverY = newCarryOverY || 0;

            // 提取图片（根据设置决定是否提取）
            const images = extractImages ? await Lumina.Parser.extractPDFImages(page, pageNum) : [];
            
            // 图片处理后让出主线程（图片 base64 转换可能阻塞）
            if (extractImages) {
                await new Promise(r => setTimeout(r, 0));
            }

            // 将段落转换为文本项
            const textItems = paragraphs.map(p => ({
                type: 'text',
                content: p.text,
                y: p.y,
                isHeading: p.isHeading,
                level: p.level
            }));

            // 合并文本和图片，按 Y 坐标排序
            const mergedItems = extractImages 
                ? [...textItems, ...images].sort((a, b) => b.y - a.y)
                : textItems;

            pageContents.push({
                pageNum,
                items: mergedItems
            });

            page.cleanup();
        }

        // 处理最后一页残留的跨页文本
        if (carryOverText) {
            pageContents[pageContents.length - 1]?.items.push({
                type: 'text',
                content: carryOverText,
                y: 0
            });
        }

        // 将所有内容转换为阅读器格式
        for (const page of pageContents) {
            for (const item of page.items) {
                if (item.type === 'text') {
                    // 检查是否是标题
                    if (item.isHeading) {
                        results.push({
                            type: `heading${item.level || 1}`,
                            level: item.level || 1,
                            text: item.content,
                            display: item.content
                        });
                    } else {
                        // 将 PDF 文本转换为段落
                        results.push({
                            type: 'paragraph',
                            text: item.content,
                            display: item.content
                        });
                    }
                } else if (item.type === 'image') {
                    results.push({
                        type: 'image',
                        data: item.data,
                        alt: item.alt || `Page ${item.page} image`
                    });
                }
            }
        }

    } catch (error) {
        // 用户取消或密码错误，统一返回取消标记
        if (userCancelled || error.name === 'PasswordException') {
            throw new Error('Password cancelled');
        }
        throw error;
    }

    return { items: results, type: 'pdf' };
};

/**
 * 提取 PDF 文本项
 * @param {Object} textContent - PDF.js getTextContent 的结果
 * @param {number} pageHeight - 页面高度
 * @returns {Array<{type: string, content: string, y: number}>}
 */
/**
 * 检查是否为段落结束
 * @param {string} text - 文本内容
 * @returns {boolean}
 */
Lumina.Parser.isParagraphEnd = (text) => {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.length === 0) return false;
    const endPunctuations = /[。.！!；;…—~～"”’)）]$/;
    const abbreviations = /(?:Mr|Mrs|Ms|Dr|Prof|No|vol|vs|etc|i\.e|e\.g|et\s+al|fig|Fig|Inc|Ltd|Jr|Sr|St|Ave|Rd|Blvd|Dept|Univ|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?$/i;
    return endPunctuations.test(trimmed) && !abbreviations.test(trimmed);
};

/**
 * 从 PDF 结构树中提取标题信息
 * @param {Object} structTree - PDF.js getStructTree 的结果
 * @returns {Array<{role: string, level: number, ids: Array<string>}>} - 标题角色和对应的 mcids
 */
Lumina.Parser.extractHeadingFromStructTree = (structTree) => {
    const headings = [];
    
    if (!structTree || !structTree.children) return headings;
    
    const traverse = (node, depth = 0) => {
        if (!node) return;
        
        // 检查是否是标题角色 (H, H1-H6)
        if (node.role) {
            const roleMatch = node.role.match(/^H([1-6])?$/);
            if (roleMatch || node.role === 'H') {
                const level = roleMatch ? parseInt(roleMatch[1]) : 1;
                // 收集所有子节点中的 content id
                const ids = [];
                const collectIds = (n) => {
                    if (!n) return;
                    if (n.type === 'content' && n.id) {
                        ids.push(n.id);
                    }
                    if (n.children) {
                        n.children.forEach(collectIds);
                    }
                };
                collectIds(node);
                
                if (ids.length > 0) {
                    headings.push({ role: node.role, level, ids });
                }
            }
        }
        
        // 递归遍历子节点
        if (node.children) {
            node.children.forEach(child => traverse(child, depth + 1));
        }
    };
    
    traverse(structTree);
    return headings;
};

/**
 * 处理 PDF 单页文本（包含跨页合并、目录过滤、智能段落合并）
 * @param {Object} textContent - PDF.js getTextContent 的结果
 * @param {number} pageHeight - 页面高度
 * @param {string} carryOverText - 从上一页携带过来的未完结段落
 * @param {number} carryOverY - 携带段落的 Y 坐标
 * @param {Object} page - PDF.js 页面对象（可选，用于获取结构树）
 * @returns {{paragraphs: Array<{text: string, y: number}>, newCarryOver: string, newCarryOverY: number}}
 */
Lumina.Parser.processPDFPageText = async (textContent, pageHeight, carryOverText = '', carryOverY = 0, page = null, documentHasStructure = true, structureTreeHasMCID = false) => {
    const items = textContent.items;
    if (items.length === 0) {
        return { paragraphs: [], newCarryOver: carryOverText, newCarryOverY: carryOverY };
    }

    // 增强文本项，添加坐标信息
    const enhancedItems = items.map(item => {
        const x = item.transform[4];
        const y = item.transform[5];
        // 过滤页眉页脚（距离顶部或底部 5% 区域的内容）
        const isHeader = y > pageHeight * 0.95;
        const isFooter = y < pageHeight * 0.05;
        
        return {
            str: item.str,
            x,
            y,
            isHeader,
            isFooter
        };
    }).filter(item => {
        // 过滤页眉页脚中的页码
        if (item.isHeader || item.isFooter) {
            if (/^\s*\d+\s*$/.test(item.str) || item.str.trim().length < 10) {
                return false;
            }
        }
        return true;
    });

    if (enhancedItems.length === 0) {
        return { paragraphs: [], newCarryOver: carryOverText, newCarryOverY: carryOverY };
    }

    // 按 Y 坐标排序，Y 坐标接近的归为一行
    enhancedItems.sort((a, b) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 3) return yDiff;
        return a.x - b.x;
    });

    // 按 Y 坐标分组（合并同一行的文本）
    const lines = [];
    let currentLine = [];
    let currentLineY = null;

    enhancedItems.forEach(item => {
        if (currentLineY === null || Math.abs(item.y - currentLineY) > 3) {
            if (currentLine.length > 0) {
                currentLine.sort((a, b) => a.x - b.x);
                lines.push({ items: currentLine, y: currentLineY });
            }
            currentLine = [item];
            currentLineY = item.y;
        } else {
            currentLine.push(item);
        }
    });

    if (currentLine.length > 0) {
        currentLine.sort((a, b) => a.x - b.x);
        lines.push({ items: currentLine, y: currentLineY });
    }

    // 合并每行的文本
    const lineTexts = lines.map(line => {
        let text = line.items[0].str;
        for (let i = 1; i < line.items.length; i++) {
            text += line.items[i].str;
        }
        return { text: text.trim(), y: line.y };
    }).filter(line => line.text.length > 0);

    // 【优化】从 PDF 结构树中提取标题标记
    let structHeadings = [];
    const structHeadingMap = new Map();
    
    // 关键：只有有mcid/bbox时才调用getStructTree，否则跳过（节省性能）
    if (documentHasStructure && structureTreeHasMCID && page && page.getStructTree) {
        try {
            const structTree = await page.getStructTree();
            if (structTree && structTree.children && structTree.children.length > 0) {
                structHeadings = Lumina.Parser.extractHeadingFromStructTree(structTree);
            }
        } catch (e) {
            // 静默处理
        }
    }
    
    // 【日志】只有真正有mcid时才记录
    if (structureTreeHasMCID && structHeadings.length > 0) {
        const summary = structHeadings.map(h => `${h.role}(L${h.level})`).join(', ');
        console.log(`[PDF] 第${page?._pageIndex + 1 || '?'}页结构树: ${summary}`);
    }
    
    // 【优化】将结构树标题映射到行（通过 marked content id 匹配）
    if (structHeadings.length > 0 && textContent.items) {
        // 先建立所有 items 的 mcid 索引
        const itemByMCID = new Map();
        textContent.items.forEach((item, idx) => {
            if (item.mcid !== undefined) {
                itemByMCID.set(String(item.mcid), idx);
            }
        });
        // 将结构树标题的 ids 映射到行索引
        structHeadings.forEach(heading => {
            heading.ids.forEach(id => {
                // 查找这个 id 属于哪一行
                for (let i = 0; i < lines.length; i++) {
                    const lineHasId = lines[i].items.some(item => {
                        const itemIdx = textContent.items.indexOf(item);
                        return itemIdx !== -1 && textContent.items[itemIdx].mcid !== undefined 
                            && heading.ids.includes(String(textContent.items[itemIdx].mcid));
                    });
                    if (lineHasId) {
                        // 记录这一行是标题
                        const yKey = Math.round(lines[i].y);
                        if (!structHeadingMap.has(yKey) || structHeadingMap.get(yKey).level > heading.level) {
                            structHeadingMap.set(yKey, { level: heading.level, role: heading.role });
                        }
                        break;
                    }
                }
            });
        });
    }

    // 智能段落合并
    const paragraphs = [];
    let currentParagraph = carryOverText || '';
    let currentParagraphY = carryOverText ? (lineTexts[0]?.y || 0) : null;

    for (let i = 0; i < lineTexts.length; i++) {
        const line = lineTexts[i];
        
        // 【关键】检测是否为章节标题（优先使用 PDF 结构树标记）
        const yKey = Math.round(line.y);
        const structHeading = structHeadingMap.get(yKey);
        
        if (structHeading) {
            // PDF 结构树标记的标题优先
            // 先保存当前段落
            if (currentParagraph.trim()) {
                paragraphs.push({ text: currentParagraph.trim(), y: currentParagraphY || line.y });
                currentParagraph = '';
                currentParagraphY = null;
            }
            // 标题独立成段，不参与后续合并
            paragraphs.push({ text: line.text, y: line.y, isHeading: true, level: structHeading.level });
            continue;
        }
        
        // 【关键】回退到正则检测章节标题
        const chapterInfo = Lumina.Parser.RegexCache.detectChapter(line.text, true);
        if (chapterInfo) {
            // 先保存当前段落
            if (currentParagraph.trim()) {
                paragraphs.push({ text: currentParagraph.trim(), y: currentParagraphY || line.y });
                currentParagraph = '';
                currentParagraphY = null;
            }
            // 标题独立成段，不参与后续合并
            paragraphs.push({ text: line.text, y: line.y, isHeading: true, level: chapterInfo.level });
            continue;
        }
        
        // 【关键】过滤目录行：包含 '.........' 或目录标题
        if (/^\s*(目\s*录|Content|Contents|Catalog|Catalogs)\s*$/i.test(line.text) || 
            /^\s*(page|第)\s*\d+\s*页?\s*$/i.test(line.text) ||
            line.text.includes('.........')) {
            // 如果当前有未完成的段落，先保存
            if (currentParagraph.trim()) {
                paragraphs.push({ text: currentParagraph.trim(), y: currentParagraphY || line.y });
                currentParagraph = '';
                currentParagraphY = null;
            }
            continue;
        }

        // 如果不含有常规标点且较短，允许独立成段
        if (/[,.:;'"，。：；“”‘’!！]/.test(line.text) === false && line.text.length < 20) {
            if (currentParagraph !== line.text) {
                if (currentParagraph.trim()) {
                    paragraphs.push({ text: currentParagraph.trim(), y: currentParagraphY || line.y });
                }
                paragraphs.push({ text: line.text, y: line.y });
                currentParagraph = '';
                currentParagraphY = null;
            }
            continue;
        }

        if (!currentParagraph) {
            currentParagraph = line.text;
            currentParagraphY = line.y;
            continue;
        }

        const prevLine = lineTexts[i - 1];
        if (prevLine && Lumina.Parser.isParagraphEnd(prevLine.text)) {
            // 前一行以标点结尾，开始新段落
            paragraphs.push({ text: currentParagraph.trim(), y: currentParagraphY });
            currentParagraph = line.text;
            currentParagraphY = line.y;
        } else {
            // 合并到当前段落（处理连字符）
            if (currentParagraph.endsWith('-') || currentParagraph.endsWith('－')) {
                currentParagraph = currentParagraph.slice(0, -1) + line.text;
            } else {
                currentParagraph += line.text;
            }
        }
    }

    // 判断最后一行是否是段落结束
    const lastLine = lineTexts[lineTexts.length - 1];
    let newCarryOver = '';
    let newCarryOverY = 0;

    if (currentParagraph && lastLine && !Lumina.Parser.isParagraphEnd(currentParagraph)) {
        // 段落未结束，携带到下一页
        newCarryOver = currentParagraph;
        newCarryOverY = currentParagraphY;
        currentParagraph = '';
    }

    if (currentParagraph.trim()) {
        paragraphs.push({ text: currentParagraph.trim(), y: currentParagraphY });
    }

    return { paragraphs, newCarryOver, newCarryOverY };
};

/**
 * 提取 PDF 图片
 * @param {Object} page - PDF.js 页面对象
 * @param {number} pageNum - 页码
 * @returns {Promise<Array<{type: string, data: string, y: number, page: number, alt: string}>>}
 */
// 【优化】Canvas 复用池
Lumina.Parser._canvasPool = {
    colorAnalysis: null,
    imageConvert: null
};

/**
 * 【优化】单图处理逻辑抽取，保持业务逻辑不变
 */
Lumina.Parser.processSinglePDFImage = async (meta, objs, commonObjs, pageNum) => {
    const { fn, args, y, objId } = meta;
    
    try {
        let imgData = null;

        // 内联图像
        if (fn === pdfjsLib.OPS.paintInlineImageXObject) {
            const inline = args[0];
            if (inline?.data) {
                // 【关键】内联图像检测透明度（原始像素数据）
                const hasTransparent = Lumina.Parser.checkRawDataTransparency(inline.data, inline.width, inline.height);
                if (hasTransparent) return null;
                
                imgData = Lumina.Parser.imageDataToBase64(inline.data);
            }
        } else {
            // 外部图像
            let obj = null;
            if (objs.has(objId)) obj = objs.get(objId);
            else if (commonObjs.has(objId)) obj = commonObjs.get(objId);

            if (!obj) return null;

            // 【关键】所有图片类型都检测透明度
            let hasTransparent = false;
            
            if (obj.bitmap) {
                // Bitmap类型：用Canvas检测
                hasTransparent = await Lumina.Parser.checkBitmapTransparency(obj.bitmap);
            } else if (obj.data || obj.imgData?.data) {
                // 原始数据类型：检测数据本身
                const rawData = obj.data || obj.imgData?.data;
                // PNG格式检测：检查IHDR和是否有tRNS或alpha通道
                hasTransparent = Lumina.Parser.checkImageFormatTransparency(rawData);
            }
            
            // 【关键】发现任何透明像素，直接过滤
            if (hasTransparent) {
                return null;
            }

            if (obj.bitmap) {
                imgData = await Lumina.Parser.bitmapToBase64(obj.bitmap);
            } else if (obj.data) {
                imgData = Lumina.Parser.imageDataToBase64(obj.data);
            } else if (obj.imgData?.data) {
                imgData = Lumina.Parser.imageDataToBase64(obj.imgData.data);
            }
        }

        // 返回格式与原有代码完全一致
        return imgData ? {
            type: 'image',
            data: imgData,
            y,                      // 保留原始Y坐标
            page: pageNum,
            alt: `Page ${pageNum} image`
        } : null;

    } catch (e) {
        console.warn(`提取第${pageNum}页图片失败:`, e);
        return null;
    }
};

/**
 * 检测内联图像原始数据的透明度
 * 内联图像通常是RGBA格式的原始像素数据
 */
Lumina.Parser.checkRawDataTransparency = (data, width, height) => {
    try {
        if (!data || data.length === 0) return false;
        
        // 内联图像数据通常是RGBA格式，每像素4字节
        // 检查alpha通道是否有<255的值
        const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
        
        // 如果数据长度符合RGBA格式
        if (u8.length === width * height * 4) {
            for (let i = 3; i < u8.length; i += 4) {
                if (u8[i] < 255) {
                    return true; // 发现透明像素
                }
            }
            return false;
        }
        
        // 如果数据格式不确定，保守处理（不过滤）
        return false;
    } catch (e) {
        return false;
    }
};

/**
 * 检测Bitmap的透明度（用Canvas）
 */
Lumina.Parser.checkBitmapTransparency = async (bitmap) => {
    try {
        const canvas = new OffscreenCanvas(Math.min(bitmap.width, 100), Math.min(bitmap.height, 100));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        
        for (let i = 3; i < imageData.length; i += 4) {
            if (imageData[i] < 255) {
                return true; // 发现透明像素
            }
        }
        return false;
    } catch (e) {
        return false;
    }
};

/**
 * 检测图像数据格式的透明度（通过文件头）
 * PNG: 检查是否有alpha通道
 * JPEG: 一定没有透明度
 */
Lumina.Parser.checkImageFormatTransparency = (data) => {
    try {
        if (!data || data.length < 10) return false;
        
        const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
        
        // PNG文件头: 89 50 4E 47
        if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) {
            // PNG可能有透明度，需要检查IHDR的color type
            // PNG格式: 前8字节是签名，然后是一个个chunk
            // 第一个chunk是IHDR，包含color type
            
            // 跳过签名(8) + IHDR长度(4) + IHDR类型(4) = 16
            // 或者直接查找IHDR
            let pos = 8; // 跳过PNG签名
            
            while (pos < u8.length - 12) {
                const length = (u8[pos] << 24) | (u8[pos+1] << 16) | (u8[pos+2] << 8) | u8[pos+3];
                const type = String.fromCharCode(u8[pos+4], u8[pos+5], u8[pos+6], u8[pos+7]);
                
                if (type === 'IHDR' && pos + 17 < u8.length) {
                    // IHDR结构: width(4) + height(4) + bitDepth(1) + colorType(1) + ...
                    // colorType在width和height之后，即pos+8+8+1 = pos+17
                    const colorType = u8[pos + 17];
                    // colorType: 0=Gray, 2=RGB, 3=Indexed, 4=Gray+Alpha, 6=RGB+Alpha
                    // 4或6表示有alpha通道
                    return colorType === 4 || colorType === 6;
                }
                
                if (type === 'IDAT' || type === 'IEND') {
                    break; // 过了IHDR还没找到，不再继续
                }
                
                // 跳到下一个chunk: 当前pos + 4(长度) + 4(类型) + length(数据) + 4(CRC)
                pos += 12 + length;
            }
            
            // 如果解析失败，保守假设PNG可能有透明
            return true;
        }
        
        // JPEG文件头: FF D8 FF
        if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) {
            // JPEG一定没有透明度
            return false;
        }
        
        // 未知格式，保守处理（可能有透明）
        return true;
    } catch (e) {
        // 解析失败，保守假设可能有透明
        return true;
    }
};

Lumina.Parser.extractPDFImages = async (page, pageNum) => {
    const images = [];
    
    try {
        const ops = await page.getOperatorList();
        const { objs, commonObjs } = page;

        // ========== 【优化】阶段1：快速收集所有图片的元数据（不处理数据）==========
        const imageMetas = [];
        
        for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i];
            const args = ops.argsArray[i];

            // 图片操作类型 - 原有逻辑不变
            const imageOps = [
                pdfjsLib.OPS.paintImageXObject,
                pdfjsLib.OPS.paintJpegXObject,
                pdfjsLib.OPS.paintInlineImageXObject,
                pdfjsLib.OPS.paintImageMaskXObject,
                pdfjsLib.OPS.paintImageXObjectRepeat
            ];

            if (!imageOps.includes(fn)) continue;

            // 只提取坐标和引用，不转换数据
            const matrix = Array.isArray(args[1]) ? args[1] : [1, 0, 0, 1, 0, 0];
            
            imageMetas.push({
                index: i,           // 保持原始顺序用于最终排序
                fn: fn,
                args: args,
                y: matrix[5] || 0,  // Y坐标原样保存
                objId: args[0]
            });
        }

        // 如果没有图片，直接返回
        if (imageMetas.length === 0) {
            return images;
        }

        // ========== 【优化】阶段2：分批并行处理图片数据 ==========
        const BATCH_SIZE = 3; // 每批3张并行处理，平衡速度和UI响应
        
        for (let i = 0; i < imageMetas.length; i += BATCH_SIZE) {
            const batch = imageMetas.slice(i, Math.min(i + BATCH_SIZE, imageMetas.length));
            
            // 并行处理一批图片
            const batchResults = await Promise.all(
                batch.map(meta => Lumina.Parser.processSinglePDFImage(meta, objs, commonObjs, pageNum))
            );
            
            // 收集非空结果，保留排序信息
            batchResults.forEach((result, idx) => {
                if (result) {
                    result._sortIndex = batch[idx].index;  // 用于最终排序
                    images.push(result);
                }
            });
            
            // 【优化】让出主线程，确保UI响应
            if (i + BATCH_SIZE < imageMetas.length) {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        // ========== 【优化】阶段3：按原始操作顺序排序（确保与文本合并时位置正确）==========
        images.sort((a, b) => a._sortIndex - b._sortIndex);
        
        // 清理临时字段，返回格式与原有代码完全一致
        images.forEach(img => delete img._sortIndex);

    } catch (e) {
        console.error('extractPDFImages 失败:', e);
    }

    return images;
};

/**
 * 创建"图片未保存"占位符 SVG
 * @returns {string} - Base64 SVG 数据 URL
 */
Lumina.Utils.createImagePlaceholder = () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#f5f5f5"/><text x="150" y="100" font-size="14" fill="#999" text-anchor="middle" dy=".3em">图片（未保存到书库）</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
};

/**
 * 分析图片颜色数量（用于过滤文字/简单图形）
 * @param {ImageBitmap} bitmap - 图片位图
 * @returns {Promise<number>} - 颜色数量
 */
Lumina.Parser.analyzeImageColorCount = async (bitmap) => {
    try {
        // 【优化】复用 Canvas，避免重复创建
        if (!Lumina.Parser._canvasPool.colorAnalysis) {
            Lumina.Parser._canvasPool.colorAnalysis = new OffscreenCanvas(100, 100);
        }
        const canvas = Lumina.Parser._canvasPool.colorAnalysis;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // 限制采样尺寸，避免超大图片分析耗时过长
        const MAX_SAMPLE_SIZE = 100;
        const w = Math.min(bitmap.width, MAX_SAMPLE_SIZE);
        const h = Math.min(bitmap.height, MAX_SAMPLE_SIZE);
        
        // 调整canvas尺寸（如有必要）
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        
        ctx.drawImage(bitmap, 0, 0, w, h);

        // 采样中心区域 - 原有逻辑不变
        const sampleSize = 50;
        const sw = Math.min(w, sampleSize);
        const sh = Math.min(h, sampleSize);
        const x = Math.floor((w - sw) / 2);
        const y = Math.floor((h - sh) / 2);

        const imageData = ctx.getImageData(x, y, sw, sh).data;
        const colors = new Set();

        // 原有像素分析逻辑完全不变
        for (let i = 0; i < imageData.length; i += 4) {
            const alpha = imageData[i + 3];
            if (alpha < 128) continue;

            // 颜色量化（合并相近颜色）
            const r = Math.round(imageData[i] / 36);
            const g = Math.round(imageData[i + 1] / 36);
            const b = Math.round(imageData[i + 2] / 36);
            colors.add(`${r},${g},${b}`);

            // 提前退出
            if (colors.size > 8) return colors.size;
        }

        return colors.size;
    } catch (e) {
        console.warn('颜色分析失败:', e);
        return 999; // 出错时保守保留
    }
};

/**
 * 将 ImageBitmap 转为 Base64
 * @param {ImageBitmap} bitmap - 图片位图
 * @returns {Promise<string|null>} - Base64 数据 URL
 */
Lumina.Parser.bitmapToBase64 = async (bitmap) => {
    try {
        // 【优化】复用 Canvas，避免重复创建
        if (!Lumina.Parser._canvasPool.imageConvert) {
            Lumina.Parser._canvasPool.imageConvert = document.createElement('canvas');
        }
        const canvas = Lumina.Parser._canvasPool.imageConvert;
        
        // 【优化】限制最大尺寸，避免超大图片转换耗时过长
        const MAX_DIMENSION = 2000;
        let width = bitmap.width;
        let height = bitmap.height;
        
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        
        // 返回格式与原有代码一致
        return canvas.toDataURL('image/png');
    } catch (e) {
        console.error('Bitmap 转换失败:', e);
        return null;
    }
};

/**
 * 将 Uint8Array 转为 Base64 数据 URL
 * @param {Uint8Array|Array} data - 图像数据
 * @returns {string|null} - Base64 数据 URL
 */
Lumina.Parser.imageDataToBase64 = (data) => {
    try {
        if (!data) return null;
        let u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
        if (u8.length === 0) return null;

        // 检测 MIME 类型
        let mime = 'image/png';
        if (u8[0] === 0xFF && u8[1] === 0xD8) mime = 'image/jpeg';
        else if (u8[0] === 0x89 && u8[1] === 0x50) mime = 'image/png';
        else if (u8[0] === 0x47 && u8[1] === 0x49) mime = 'image/gif';

        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < u8.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunkSize));
        }
        return `data:${mime};base64,${btoa(binary)}`;
    } catch (e) {
        console.error('Base64 转换失败:', e);
        return null;
    }
};

Lumina.Parser.parseTextFile = (content, ext, file = null) => {
    if (typeof content !== 'string') return { items: [], type: ext };
    
    // 【插件钩子】尝试让插件处理
    if (Lumina.PluginManager) {
        const hookResult = Lumina.PluginManager.executeHook('beforeParse', file, content);
        if (hookResult && hookResult.handled && hookResult.data) {
            return hookResult.data;
        }
    }
    
    const lines = content.split(/\r?\n/);
    const results = [];
    Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];

    const p = Lumina.Config.regexPatterns;

    if (ext === 'html') {
        const doc = new DOMParser().parseFromString(content, 'text/html');
        doc.querySelectorAll('img').forEach(img => results.push({ type: 'image', data: img.src, alt: img.alt || '' }));
        doc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li').forEach(el => {
            const text = el.textContent.trim();
            const tag = el.tagName.toLowerCase();
            if (tag === 'h1') results.push({ type: 'title', text, display: text });
            else if (tag.startsWith('h')) results.push(Lumina.Parser.processHeading(parseInt(tag[1]), text));
            else if (tag === 'li') results.push({ type: 'list', text, display: '• ' + text });
            else results.push({ type: 'paragraph', text, display: '    ' + text });
        });
    } else {
        lines.forEach(line => {
            const trimmed = line.trim();
            let item = null;

            if (p.specialTitles.test(trimmed)) {
                const matched = trimmed.match(p.specialTitles)[0];
                item = { type: 'title', text: matched, display: `${matched}` };
            } else if (p.titleTag.test(trimmed)) {
                item = { type: 'title', text: trimmed.replace(p.titleTag, ''), display: trimmed };
            } else if (p.subtitleTag.test(trimmed)) {
                item = { type: 'subtitle', text: trimmed.replace(p.subtitleTag, ''), display: trimmed };
            } else if (ext === 'md' && trimmed.startsWith('#')) {
                const match = trimmed.match(p.mdHeading);
                item = match ? Lumina.Parser.processHeading(match[1].length, match[2].trim()) : { type: 'paragraph', text: trimmed, display: trimmed };
            } else {
                const chapterInfo = Lumina.Parser.RegexCache.detectChapter(trimmed, true);
                item = chapterInfo ? Lumina.Parser.processHeading(chapterInfo.level, chapterInfo.raw, chapterInfo.text) : { type: 'paragraph', text: trimmed, display: trimmed };
            }
            if (item) results.push(item);
        });
    }
    return { items: results, type: ext };
};

