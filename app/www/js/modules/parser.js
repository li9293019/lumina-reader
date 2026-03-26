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

Lumina.Parser.parseDOCX = async (arrayBuffer) => {
    const zip = await JSZip.loadAsync(arrayBuffer);
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

    return { items: results, type: 'docx' };
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

// ==================== PDF 解析器 ====================

// 初始化 PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = './assets/js/pdf.worker.min.js';
}

/**
 * 解析 PDF 文件
 * @param {ArrayBuffer} arrayBuffer - PDF 文件的 ArrayBuffer
 * @returns {Promise<{items: Array, type: string}>}
 */
Lumina.Parser.parsePDF = async (arrayBuffer, onProgress = null) => {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js library not loaded');
    }

    const results = [];
    let currentPdf = null;

    // 用户取消标记
    let userCancelled = false;
    let passwordHandled = false;

    try {
        const loadingTask = pdfjsLib.getDocument({
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
            
            const isRetry = reason === 2;
            const title = isRetry ? Lumina.I18n.t('pdfPasswordError') : Lumina.I18n.t('pdfPasswordRequired');
            const message = isRetry ? Lumina.I18n.t('pdfPasswordRetry') : Lumina.I18n.t('pdfPasswordPrompt');
            
            // 隐藏 loading，但保留状态标记以便后续恢复
            const wasLoadingActive = Lumina.DOM.loadingScreen?.classList.contains('active');
            const loadingText = Lumina.DOM.loadingScreen?.querySelector('.loading-text');
            const originalLoadingText = loadingText?.textContent;
            
            if (wasLoadingActive) Lumina.DOM.loadingScreen.classList.remove('active');
            
            Lumina.UI.showDialog(message, 'prompt', async (result) => {
                if (result === null || result === false) {
                    userCancelled = true;
                    // 用户取消，传入 null 让 PDF.js 抛出错误
                    updateCallback(null);
                    return;
                }
                
                // 恢复 loading 界面并显示解密中状态
                if (wasLoadingActive && Lumina.DOM.loadingScreen) {
                    Lumina.DOM.loadingScreen.classList.add('active');
                    if (loadingText) {
                        loadingText.textContent = `${Lumina.I18n.t('pdfDecrypting') || 'PDF 解密中'}...`;
                    }
                }
                
                // 延迟调用 updateCallback，让 UI 先更新
                await new Promise(resolve => setTimeout(resolve, 100));
                updateCallback(result);
            }, { title, inputType: 'password', placeholder: Lumina.I18n.t('pdfPasswordPlaceholder') });
        };

        currentPdf = await loadingTask.promise;
        const numPages = currentPdf.numPages;
        
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
            const { paragraphs, newCarryOver, newCarryOverY } = Lumina.Parser.processPDFPageText(
                textContent, 
                viewport.height, 
                carryOverText,
                carryOverY
            );

            // 更新跨页携带的文本
            carryOverText = newCarryOver || '';
            carryOverY = newCarryOverY || 0;

            // 提取图片
            const images = await Lumina.Parser.extractPDFImages(page, pageNum);
            
            // 图片处理后让出主线程（图片 base64 转换可能阻塞）
            await new Promise(r => setTimeout(r, 0));

            // 将段落转换为文本项
            const textItems = paragraphs.map(p => ({
                type: 'text',
                content: p.text,
                y: p.y,
                isHeading: p.isHeading,
                level: p.level
            }));

            // 合并文本和图片，按 Y 坐标排序
            const mergedItems = [...textItems, ...images].sort((a, b) => b.y - a.y);

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
 * 处理 PDF 单页文本（包含跨页合并、目录过滤、智能段落合并）
 * @param {Object} textContent - PDF.js getTextContent 的结果
 * @param {number} pageHeight - 页面高度
 * @param {string} carryOverText - 从上一页携带过来的未完结段落
 * @param {number} carryOverY - 携带段落的 Y 坐标
 * @returns {{paragraphs: Array<{text: string, y: number}>, newCarryOver: string, newCarryOverY: number}}
 */
Lumina.Parser.processPDFPageText = (textContent, pageHeight, carryOverText = '', carryOverY = 0) => {
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

    // 智能段落合并
    const paragraphs = [];
    let currentParagraph = carryOverText || '';
    let currentParagraphY = carryOverText ? (lineTexts[0]?.y || 0) : null;

    for (let i = 0; i < lineTexts.length; i++) {
        const line = lineTexts[i];
        
        // 【关键】检测是否为章节标题
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
        
        // 【关键】过滤目录行：包含 '........' 或目录标题
        if (/^\s*(目\s*录|Content|Contents|Catalog|Catalogs)\s*$/i.test(line.text) || line.text.includes('........')) {
            // 如果当前有未完成的段落，先保存
            if (currentParagraph.trim()) {
                paragraphs.push({ text: currentParagraph.trim(), y: currentParagraphY || line.y });
                currentParagraph = '';
                currentParagraphY = null;
            }
            continue;
        }

        // 如果不含有常规标点且较短，允许独立成段
        if (/[,.:;'"，。：；“”‘’!！]/.test(line.text) === false && line.text.length < 8) {
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
Lumina.Parser.extractPDFImages = async (page, pageNum) => {
    const images = [];
    
    try {
        const ops = await page.getOperatorList();
        const { objs, commonObjs } = page;

        for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i];
            const args = ops.argsArray[i];

            // 图片操作类型
            const imageOps = [
                pdfjsLib.OPS.paintImageXObject,
                pdfjsLib.OPS.paintJpegXObject,
                pdfjsLib.OPS.paintInlineImageXObject,
                pdfjsLib.OPS.paintImageMaskXObject,
                pdfjsLib.OPS.paintImageXObjectRepeat
            ];

            if (!imageOps.includes(fn)) continue;

            try {
                let imgData = null;
                let width = 0, height = 0, y = 0;

                // 内联图像
                if (fn === pdfjsLib.OPS.paintInlineImageXObject) {
                    const inline = args[0];
                    if (inline?.data) {
                        imgData = Lumina.Parser.imageDataToBase64(inline.data);
                        width = inline.width || 0;
                        height = inline.height || 0;
                        // 从变换矩阵获取 Y 坐标
                        const matrix = args[1] || [1, 0, 0, 1, 0, 0];
                        y = matrix[5] || 0;
                    }
                } else {
                    // 外部图像
                    const objId = args[0];
                    const matrix = Array.isArray(args[1]) ? args[1] : [1, 0, 0, 1, 0, 0];
                    y = matrix[5] || 0;

                    let obj = null;
                    if (objs.has(objId)) obj = objs.get(objId);
                    else if (commonObjs.has(objId)) obj = commonObjs.get(objId);

                    if (!obj) continue;

                    width = obj.width || 0;
                    height = obj.height || 0;

                    if (obj.bitmap) {
                        // 颜色过滤：跳过可能是文字的图片（颜色数≤3）
                        const colorCount = await Lumina.Parser.analyzeImageColorCount(obj.bitmap);
                        if (colorCount <= 3) continue;

                        imgData = await Lumina.Parser.bitmapToBase64(obj.bitmap);
                    } else if (obj.data) {
                        imgData = Lumina.Parser.imageDataToBase64(obj.data);
                    } else if (obj.imgData?.data) {
                        imgData = Lumina.Parser.imageDataToBase64(obj.imgData.data);
                    }
                }

                if (imgData) {
                    images.push({
                        type: 'image',
                        data: imgData,
                        y,
                        page: pageNum,
                        alt: `Page ${pageNum} image`
                    });
                }
            } catch (e) {
                console.warn(`提取第${pageNum}页图片失败:`, e);
            }
        }
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
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);

        // 采样中心区域
        const sampleSize = 50;
        const w = Math.min(bitmap.width, sampleSize);
        const h = Math.min(bitmap.height, sampleSize);
        const x = Math.floor((bitmap.width - w) / 2);
        const y = Math.floor((bitmap.height - h) / 2);

        const imageData = ctx.getImageData(x, y, w, h).data;
        const colors = new Set();

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
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
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

Lumina.Parser.parseTextFile = (content, ext) => {
    if (typeof content !== 'string') return { items: [], type: ext };
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

