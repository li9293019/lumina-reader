/**
 * Share Card - 分享书签 v7
 * 跟随阅读器字体，精确排版，中文两端对齐
 */

Lumina.ShareCard = {
    isDragging: false,
    startX: 0,
    currentX: 0,
    threshold: 80,
    usedSeeds: new Set(),
    currentPatternId: 0,
    
    // 统一品牌样式
    BRAND_SIZE: 11,
    BRAND_OPACITY: 0.6,
    BRAND_Y: 22,
    
    // 获取当前阅读器字体
    getReaderFont() {
        // 从 CSS 变量或 State 获取当前字体
        const root = document.documentElement;
        const fontFamily = getComputedStyle(root).getPropertyValue('--font-family-dynamic').trim() || 
                          getComputedStyle(root).getPropertyValue('--reader-font').trim() ||
                          'system-ui, -apple-system, sans-serif';
        return fontFamily;
    },
    
    // 响应式基础宽度
    getBaseWidth() {
        const vw = window.innerWidth;
        if (vw < 640) return Math.max(320, vw - 40);
        return 600;
    },
    
    show(selectedText) {
        // 重置关闭标志，允许再次关闭
        this._isClosing = false;
        
        // 保留分段信息（按换行符分割段落，过滤空段落和纯空白段落）
        this.paragraphs = selectedText
            .split(/\n+/)
            .map(p => p.trim())
            .filter(p => p && p.length > 0 && !/^(&nbsp;|\s)*$/.test(p));
        this.selectedText = selectedText;
        
        // 调试日志

        this.currentFont = this.getReaderFont();
        
        const state = Lumina.State.app;
        const file = state.currentFile;
        const chapters = state.chapters || [];
        const chapterIndex = state.currentChapterIndex || 0;
        const chapter = chapters[chapterIndex];
        
        this.bookInfo = {
            chapterTitle: chapter?.title || '',
            bookTitle: file?.metadata?.title || file?.title || file?.name?.replace(/\.[^/.]+$/, '') || 'Untitled',
            author: file?.metadata?.author || '佚名'
        };
        
        this.usedSeeds.clear();
        this.baseWidth = this.getBaseWidth();
        this.createPanel();
        this.generateCard();
        this.bindGestures();
    },
    
    createPanel() {
        const overlay = document.createElement('div');
        overlay.className = 'share-card-overlay';
        overlay.innerHTML = `<div class="share-card-wrapper"><div class="share-card" id="shareCard"></div></div>`;
        document.body.appendChild(overlay);
        this.overlay = overlay;
        this.cardEl = overlay.querySelector('#shareCard');
        this.wrapper = overlay.querySelector('.share-card-wrapper');
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });
        requestAnimationFrame(() => { overlay.style.opacity = '1'; });
    },
    
    getLayoutType(text) {
        const isCJK = /[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text);
        const visualLength = isCJK ? text.length : text.length * 0.6;
        
        if (visualLength <= 35) return 'short';   // 短版式：35字符
        if (visualLength <= 160) return 'medium'; // 中版式：160字符
        return 'long';
    },
    
    generateCard() {
        const layoutType = this.getLayoutType(this.selectedText);
        
        const baseW = this.baseWidth;
        let width = baseW;
        let height = baseW;
        
        if (layoutType === 'long') {
            height = Math.floor(baseW * 1.5);
        } else if (layoutType === 'medium') {
            height = Math.floor(baseW * 1.33);
        }
        
        this.currentWidth = width;
        this.currentHeight = height;
        this.currentLayout = layoutType;
        
        let seed;
        do { seed = Date.now() + Math.floor(Math.random() * 10000); } 
        while (this.usedSeeds.has(seed));
        
        this.usedSeeds.add(seed);
        this.currentSeed = seed;
        this.currentPatternId = seed % 51;
        
        const svg = this.renderCard(width, height, layoutType, seed);
        
        this.cardEl.innerHTML = svg;
        this.cardEl.style.width = width + 'px';
        this.cardEl.style.height = height + 'px';
        
        this.cardEl.style.transform = 'scale(0.95)';
        this.cardEl.style.opacity = '0';
        requestAnimationFrame(() => {
            this.cardEl.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            this.cardEl.style.transform = 'scale(1)';
            this.cardEl.style.opacity = '1';
        });
    },
    
    renderCard(w, h, layoutType, seed) {
        const CoverCore = Lumina.CoverGenerator.CoverCore;
        const palette = CoverCore.generatePalette(seed, 'auto');
        this.currentPalette = palette;
        
        // 字体嵌入 SVG
        const fontFamily = this.currentFont.replace(/"/g, "'");
        
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
        svg += `<defs><style>text { font-family: ${fontFamily}; }</style></defs>`;
        
        switch(layoutType) {
            case 'short': svg += this.renderShort(w, h, palette, seed); break;
            case 'medium': svg += this.renderMedium(w, h, palette, seed); break;
            case 'long': svg += this.renderLong(w, h, palette, seed); break;
        }
        
        svg += '</svg>';
        return svg;
    },
    
    // ========== 优雅的 SVG 引号 ==========
    renderQuoteMark(x, y, size, color) {
        // 改进的双引号形状 - 更像印刷体的引号
        const s = size;
        // 左双引号 - 水滴形状
        return `<path d="M${x + s*0.9},${y + s*0.1} 
            C${x + s*0.5},${y + s*0.1} ${x + s*0.2},${y + s*0.3} ${x + s*0.15},${y + s*0.55}
            C${x + s*0.1},${y + s*0.75} ${x + s*0.25},${y + s*0.9} ${x + s*0.4},${y + s*0.85}
            C${x + s*0.55},${y + s*0.8} ${x + s*0.6},${y + s*0.65} ${x + s*0.55},${y + s*0.55}
            C${x + s*0.5},${y + s*0.45} ${x + s*0.35},${y + s*0.35} ${x + s*0.6},${y + s*0.25}
            C${x + s*0.75},${y + s*0.2} ${x + s*0.85},${y + s*0.15} ${x + s*0.9},${y + s*0.1}Z
            M${x + s*1.8},${y + s*0.1}
            C${x + s*1.4},${y + s*0.1} ${x + s*1.1},${y + s*0.3} ${x + s*1.05},${y + s*0.55}
            C${x + s*1.0},${y + s*0.75} ${x + s*1.15},${y + s*0.9} ${x + s*1.3},${y + s*0.85}
            C${x + s*1.45},${y + s*0.8} ${x + s*1.5},${y + s*0.65} ${x + s*1.45},${y + s*0.55}
            C${x + s*1.4},${y + s*0.45} ${x + s*1.25},${y + s*0.35} ${x + s*1.5},${y + s*0.25}
            C${x + s*1.65},${y + s*0.2} ${x + s*1.75},${y + s*0.15} ${x + s*1.8},${y + s*0.1}Z" 
            fill="${color}"/>`;
    },
    
    // ========== 短文字: 1:1 居中卡片 ==========
    renderShort(w, h, palette, seed) {
        let svg = this.renderPatternFull(w, h, palette, seed, 1.0);
        
        const cardW = Math.floor(w * 0.82);
        const cardH = Math.floor(h * 0.68);
        const cardX = Math.floor((w - cardW) / 2);
        const cardY = Math.floor((h - cardH) / 2);
        
        svg += `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="rgba(255,255,255,0.96)" rx="4"/>`;
        
        const padding = Math.floor(w * 0.08);
        const contentW = cardW - padding * 2;
        
        // SVG path 引号
        svg += this.renderQuoteMark(cardX + padding, cardY + padding, 26, palette.accent);
        
        const fontSize = Math.max(20, Math.floor(w * 0.045));
        const lineHeight = Math.floor(fontSize * 1.6);
        
        // 计算可用文本区域（减去引号、横线、来源等占用的空间）
        const quoteH = 35;
        const lineAndSourceH = Math.floor(h * 0.12);
        const availableH = cardH - quoteH - lineAndSourceH - padding * 2;
        const maxLines = Math.floor(availableH / lineHeight);
        
        let lines = this.measureText(this.selectedText, contentW, fontSize);
        
        // 检查是否超长，超长则截断
        if (lines.length > maxLines) {
            lines = lines.slice(0, maxLines);
            // 最后一行添加省略号
            const lastIdx = lines.length - 1;
            const isCJK = /[\u4e00-\u9fa5]/.test(lines[lastIdx]);
            lines[lastIdx] = lines[lastIdx].substring(0, lines[lastIdx].length - 2) + (isCJK ? '……' : '...');
        }
        
        const totalTextH = lines.length * lineHeight;
        const textStartY = cardY + quoteH + padding + (availableH - totalTextH) / 2 + lineHeight * 0.3;
        
        svg += `<text x="${Math.floor(w/2)}" y="${textStartY}" text-anchor="middle" font-size="${fontSize}" font-weight="600" fill="#2c3e50">`;
        lines.forEach((line, i) => {
            svg += `<tspan x="${Math.floor(w/2)}" dy="${i === 0 ? 0 : lineHeight}">${this.escapeXml(line)}</tspan>`;
        });
        svg += '</text>';
        
        const lineY = cardY + cardH - Math.floor(h * 0.12);
        svg += `<line x1="${cardX + Math.floor(cardW*0.2)}" y1="${lineY}" x2="${cardX + Math.floor(cardW*0.8)}" y2="${lineY}" stroke="${palette.accent}" stroke-width="2"/>`;
        
        const source = this.buildSource(cardW - padding * 2);
        svg += `<text x="${Math.floor(w/2)}" y="${cardY + cardH - Math.floor(h * 0.06)}" text-anchor="middle" font-size="${Math.max(12, Math.floor(w * 0.024))}" font-style="italic" fill="#666">${this.escapeXml(source)}</text>`;
        
        const t = Lumina.I18n.t;
        const brandY = h - Math.floor(h * 0.04);
        svg += `<text x="${Math.floor(w/2)}" y="${brandY}" text-anchor="middle" font-size="${this.BRAND_SIZE}" fill="${palette.accent}" fill-opacity="${this.BRAND_OPACITY}">${this.escapeXml(t('fromLuminaReader'))}</text>`;
        
        return svg;
    },
    
    // ========== 中文字: 3:4 上下各50% ==========
    renderMedium(w, h, palette, seed) {
        const halfH = Math.floor(h / 2);
        
        let svg = '';
        svg += this.renderPatternFull(w, halfH, palette, seed, 1.2);
        svg += `<rect x="0" y="${halfH}" width="${w}" height="${h - halfH}" fill="#ffffff"/>`;
        
        const lineGap = Math.floor(h * 0.04);
        const lineY = halfH + lineGap;
        svg += `<line x1="${Math.floor(w*0.08)}" y1="${lineY}" x2="${Math.floor(w*0.92)}" y2="${lineY}" stroke="${palette.accent}" stroke-width="2"/>`;
        
        const padding = Math.floor(w * 0.08);
        const fontSize = Math.max(16, Math.floor(w * 0.036));
        // 调整后的内容宽度（减少右边留白）
        const contentW = w - padding * 2 - Math.floor(fontSize * 0.3);
        const lineHeight = Math.floor(fontSize * 1.7);
        const textStartY = lineY + lineGap + fontSize;
        
        // 分段渲染
        let allLines = [];
        const paragraphBreaks = [];
        
        this.paragraphs.forEach((para, idx) => {
            const paraLines = this.measureText(para, contentW, fontSize)
                .filter(line => line.trim() && !/^(&nbsp;|\s)*$/.test(line));
            if (paraLines.length === 0) return; // 跳过空段落
            
            allLines.push(...paraLines);
            if (idx < this.paragraphs.length - 1) {
                paragraphBreaks.push(allLines.length);
            }
        });
        
        // 检查是否超长（考虑段落间距占用的额外高度）
        const bottomAreaH = Math.floor(h * 0.04); // 底部区域高度
        const availableH = h - halfH - lineGap * 2 - fontSize - bottomAreaH;
        const paraExtraH = paragraphBreaks.length * Math.floor(lineHeight * 0.5);
        const maxLines = Math.floor((availableH - paraExtraH) / lineHeight);
        
        if (allLines.length > maxLines) {
            // 需要截断，优先保留完整段落
            let linesToKeep = maxLines;
            // 从后往前检查，如果截断点在某个段落中间，则退到该段落开头
            for (let i = paragraphBreaks.length - 1; i >= 0; i--) {
                if (paragraphBreaks[i] < maxLines) {
                    // 可以保留到该段落
                    linesToKeep = paragraphBreaks[i];
                    break;
                }
            }
            // 如果还是太长，强行截断
            if (allLines.length > linesToKeep) {
                allLines = allLines.slice(0, linesToKeep);
                paragraphBreaks.length = 0; // 清空段落标记
                // 最后一行添加省略号
                const lastIdx = allLines.length - 1;
                const isCJK = /[\u4e00-\u9fa5]/.test(allLines[lastIdx]);
                allLines[lastIdx] = allLines[lastIdx].substring(0, allLines[lastIdx].length - 2) + (isCJK ? '……' : '...');
            }
        }
        
        // 计算实际文本宽度，实现整体居中
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = `${fontSize}px ${this.currentFont}`;
        const maxLineWidth = Math.max(...allLines.map(l => ctx.measureText(l).width));
        const textBlockX = Math.floor((w - maxLineWidth) / 2);
        
        // 渲染文本（左对齐，段落间有间距）
        svg += `<text x="${textBlockX}" y="${textStartY}" font-size="${fontSize}" fill="#2c3e50">`;
        allLines.forEach((line, i) => {
            // 段落开始的新一行添加额外间距
            const extraGap = (i > 0 && paragraphBreaks.includes(i)) ? Math.floor(lineHeight * 0.5) : 0;
            svg += `<tspan x="${textBlockX}" dy="${i === 0 ? 0 : lineHeight + extraGap}">${this.escapeXml(line)}</tspan>`;
        });
        svg += '</text>';
        
        const bottomY = h - Math.floor(h * 0.04);
        const source = this.buildSource(contentW);
        svg += `<text x="${padding}" y="${bottomY}" font-size="${Math.max(11, Math.floor(w * 0.022))}" font-style="italic" fill="#888">${this.escapeXml(source)}</text>`;
        
        const t = Lumina.I18n.t;
        const brandY = h - Math.floor(h * 0.04);
        svg += `<text x="${w - padding}" y="${brandY}" text-anchor="end" font-size="${this.BRAND_SIZE}" fill="${palette.accent}" fill-opacity="${this.BRAND_OPACITY}">${this.escapeXml(t('fromLuminaReader'))}</text>`;
        
        return svg;
    },
    
    // ========== 长文字: 2:3 顶部30%图案+底部70%文字 ==========
    renderLong(w, h, palette, seed) {
        const visualH = Math.floor(h * 0.30);
        const padding = Math.floor(w * 0.08);
        const fontSize = Math.max(15, Math.floor(w * 0.033));
        // 调整后的内容宽度（减少右边留白约半个字符）
        const contentW = w - padding * 2 - Math.floor(fontSize * 0.5);
        const lineHeight = Math.floor(fontSize * 1.8);
        
        // 增加呼吸感：章节与图案、长文本的间隙
        const topGap = Math.floor(h * 0.06);      // 图案与章节标题的间隙（减小一点）
        const chapterGap = Math.floor(h * 0.08);  // 章节标题与正文间隙（增大到8%）
        const bottomGap = Math.floor(h * 0.10);   // 底部预留空间（稍微减小）
        
        // 计算正文起始位置（考虑章节标题）
        let chapterH = 0;
        const hasChapter = this.bookInfo.chapterTitle && 
            this.bookInfo.chapterTitle !== this.bookInfo.bookTitle &&
            this.bookInfo.chapterTitle.length < 20;
        if (hasChapter) {
            chapterH = Math.floor(h * 0.045); // 章节标题高度
        }
        
        // 先计算文本渲染，确定最大行数
        let currentY = visualH + topGap + chapterH + chapterGap;
        const maxLines = Math.floor((h - currentY - bottomGap) / lineHeight);
        
        // 分段渲染（带截断限制）
        let allLines = [];
        const paragraphBreaks = [];
        let linesRemaining = maxLines;
        
        for (let idx = 0; idx < this.paragraphs.length; idx++) {
            const para = this.paragraphs[idx];
            const paraLines = this.measureText(para, contentW, fontSize)
                .filter(line => line.trim() && !/^(&nbsp;|\s)*$/.test(line));
            if (paraLines.length === 0) continue; // 跳过空段落
            
            if (paraLines.length <= linesRemaining) {
                allLines.push(...paraLines);
                linesRemaining -= paraLines.length;
                // 标记段落结束位置（用于视觉间距）
                if (idx < this.paragraphs.length - 1) {
                    paragraphBreaks.push(allLines.length);
                }
            } else {
                // 只能放下部分
                const partialLines = paraLines.slice(0, linesRemaining);
                allLines.push(...partialLines);
                // 添加省略号
                const lastIdx = allLines.length - 1;
                const isCJK = /[\u4e00-\u9fa5]/.test(allLines[lastIdx]);
                allLines[lastIdx] = allLines[lastIdx] + (isCJK ? '……' : '...');
                break;
            }
        }
        
        // 最后保底检查：确保没有超长
        const paraExtraH = paragraphBreaks.length * Math.floor(lineHeight * 0.5);
        const totalContentH = allLines.length * lineHeight + paraExtraH;
        const maxContentH = h - currentY - bottomGap;
        
        if (totalContentH > maxContentH && allLines.length > 1) {
            // 需要进一步截断
            const maxContentLines = Math.floor((maxContentH - paraExtraH) / lineHeight);
            allLines = allLines.slice(0, maxContentLines);
            // 清空段落标记（因为可能截断在段落中间）
            paragraphBreaks.length = 0;
            // 最后一行添加省略号
            const lastIdx = allLines.length - 1;
            const isCJK = /[\u4e00-\u9fa5]/.test(allLines[lastIdx]);
            allLines[lastIdx] = allLines[lastIdx].substring(0, allLines[lastIdx].length - 2) + (isCJK ? '……' : '...');
        }
        
        // 计算实际文本边界
        const canvas2 = document.createElement('canvas');
        const ctx2 = canvas2.getContext('2d');
        ctx2.font = `${fontSize}px ${this.currentFont}`;
        const lineWidths = allLines.map(l => ctx2.measureText(l).width);
        const maxLineWidth = Math.max(...lineWidths);
        
        // 文本块的实际左右边界（左对齐）
        const textLeftX = Math.floor((w - maxLineWidth) / 2);
        const textRightX = textLeftX + maxLineWidth;
        
        // ===== 构建 SVG：按顺序渲染 =====
        let svg = '';
        
        // 1. 顶部图案
        svg += this.renderPatternFull(w, visualH, palette, seed, 1.1);
        svg += `<rect x="0" y="${visualH}" width="${w}" height="${h - visualH}" fill="#fafafa"/>`;
        svg += `<rect x="0" y="${visualH}" width="${w}" height="${Math.max(4, Math.floor(h * 0.006))}" fill="${palette.accent}"/>`;
        
        // 2. 章节标题（与文本左对齐，有呼吸间隙）
        let renderY = visualH + topGap;
        if (hasChapter) {
            svg += `<text x="${textLeftX}" y="${renderY}" font-size="${Math.max(13, Math.floor(w * 0.028))}" font-weight="600" fill="${palette.accent}">${this.escapeXml(this.bookInfo.chapterTitle)}</text>`;
            renderY += chapterGap;
        }
        
        // 3. 长文本正文（左对齐）
        svg += `<text x="${textLeftX}" y="${renderY}" font-size="${fontSize}" fill="#2c3e50">`;
        allLines.forEach((line, i) => {
            const extraGap = (i > 0 && paragraphBreaks.includes(i)) ? Math.floor(lineHeight * 0.5) : 0;
            svg += `<tspan x="${textLeftX}" dy="${i === 0 ? 0 : lineHeight + extraGap}">${this.escapeXml(line)}</tspan>`;
        });
        svg += '</text>';
        
        // 4. 底部信息（与文本左右边界对齐）
        const textEndY = renderY + allLines.length * lineHeight + paragraphBreaks.length * Math.floor(lineHeight * 0.5);
        const separatorY = textEndY + Math.floor(h * 0.04);
        
        // 分隔线（左对齐）
        svg += `<line x1="${textLeftX}" y1="${separatorY}" x2="${textLeftX + Math.min(maxLineWidth, Math.floor(w * 0.15))}" y2="${separatorY}" stroke="#ddd" stroke-width="1"/>`;
        
        // 来源（左对齐）
        const source = this.buildSource(maxLineWidth);
        svg += `<text x="${textLeftX}" y="${separatorY + Math.floor(h * 0.035)}" font-size="${Math.max(11, Math.floor(w * 0.022))}" font-style="italic" fill="#888">${this.escapeXml(source)}</text>`;
        
        // 品牌（右对齐，与文本右边界对齐）
        const t = Lumina.I18n.t;
        const brandY = h - Math.floor(h * 0.04);
        svg += `<text x="${textRightX}" y="${brandY}" text-anchor="end" font-size="${this.BRAND_SIZE}" fill="${palette.accent}" fill-opacity="${this.BRAND_OPACITY}">${this.escapeXml(t('fromLuminaReader'))}</text>`;
        
        return svg;
    },
    
    renderPatternFull(w, h, palette, seed, intensity = 1) {
        const CoverCore = Lumina.CoverGenerator.CoverCore;
        const PATTERNS = CoverCore.PATTERNS;
        const PatternDrawers = CoverCore.PatternDrawers;
        const params = CoverCore.extractParams(seed, 40);
        
        const patternCode = PATTERNS[this.currentPatternId]?.code || 'lines';
        const drawer = PatternDrawers[patternCode];
        if (!drawer) return `<rect width="${w}" height="${h}" fill="${palette.bg}"/>`;
        
        const SVGRenderer = Lumina.CoverGenerator.SVGRenderer;
        const renderer = new SVGRenderer(w, h);
        
        renderer.fillStyle = palette.bg;
        renderer.fillRect(0, 0, w, h);
        
        renderer.strokeStyle = palette.accent;
        renderer.fillStyle = palette.accent;
        renderer.globalAlpha = Math.min(0.7 * intensity, 1);
        renderer.lineWidth = Math.max(1.5, w * 0.003);
        
        try { drawer(renderer, w, h, params, 1.0); } catch(e) {}
        
        const fullSvg = renderer.getSVG(palette.bg, true);
        const contentMatch = fullSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
        return contentMatch ? contentMatch[1] : '';
    },
    
    measureText(text, maxWidth, fontSize) {

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        // 使用阅读器字体
        ctx.font = `${fontSize}px ${this.currentFont}`;
        
        // 微调安全边距
        const safeWidth = maxWidth - 2;
        
        const isCJK = /[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text);
        const lines = [];
        
        if (isCJK) {
            // 避头尾：不能出现在行首的标点
            const noStartPuncts = "，。、；：！？）】》」』\"\"''.,;:!?)\]}>";
            let line = '';
            
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                
                // 预判：如果加入这个字符会超宽
                const testLine = line + char;
                const metrics = ctx.measureText(testLine);
                
                if (metrics.width > safeWidth && line.length > 0) {
                    // 如果当前字符是避头标点
                    if (noStartPuncts.includes(char) && line.length > 1) {
                        // 把上一行最后一个字符移到下一行
                        const lastChar = line.slice(-1);
                        line = line.slice(0, -1);
                        lines.push(line);
                        line = lastChar;
                        i--; // 回退，下次循环再处理当前标点字符
                    } else {
                        lines.push(line);
                        line = char;
                    }
                } else {
                    line = testLine;
                }
            }
            if (line) lines.push(line);
            console.log('[measureText] CJK lines result:', lines);
        } else {
            const words = text.split(/(\s+)/);
            let line = '';
            
            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                if (!word) continue;
                
                const testLine = line + word;
                const metrics = ctx.measureText(testLine);
                
                if (metrics.width > safeWidth && line.trim().length > 0) {
                    lines.push(line.trim());
                    line = word.trim() + ' ';
                } else {
                    line = testLine;
                }
            }
            if (line.trim()) lines.push(line.trim());

        }
        
        return lines;
    },
    
    measureTextWithLimit(text, maxWidth, fontSize, maxLines) {
        const allLines = this.measureText(text, maxWidth, fontSize);
        
        if (allLines.length <= maxLines) {
            return allLines;
        }
        
        let cutIndex = maxLines - 1;
        
        for (let i = maxLines - 1; i >= Math.max(0, maxLines - 3); i--) {
            if (allLines[i] && /[。\.]$/.test(allLines[i])) {
                cutIndex = i + 1;
                break;
            }
            if (allLines[i] && /[。\.][^。\.]*$/.test(allLines[i])) {
                const match = allLines[i].match(/^(.*?[。\.])([^。\.]*)$/);
                if (match) {
                    allLines[i] = match[1];
                    cutIndex = i + 1;
                    break;
                }
            }
        }
        
        const result = allLines.slice(0, cutIndex);
        
        const lastLine = result[result.length - 1];
        const isCJK = /[\u4e00-\u9fa5]/.test(lastLine);
        result[result.length - 1] = lastLine + (isCJK ? '……' : '...');
        
        return result;
    },
    
    buildSource(maxWidth) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = `italic 14px ${this.currentFont}`;
        
        let source = '';
        if (this.bookInfo.bookTitle && this.bookInfo.bookTitle !== 'Untitled') {
            source = this.bookInfo.bookTitle;
        }
        if (this.bookInfo.author) {
            source = source ? `${source} · ${this.bookInfo.author}` : this.bookInfo.author;
        }
        
        if (!source) return '佚名';
        
        if (maxWidth) {
            const metrics = ctx.measureText(source);
            if (metrics.width > maxWidth) {
                const author = this.bookInfo.author || '佚名';
                const maxTitleWidth = maxWidth - ctx.measureText(` · ${author}`).width - 20;
                
                let title = this.bookInfo.bookTitle || '';
                while (title.length > 3 && ctx.measureText(title + '...').width > maxTitleWidth) {
                    title = title.slice(0, -1);
                }
                
                source = title + '... · ' + author;
            }
        }
        
        return source;
    },
    
    escapeXml(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    
    bindGestures() {
        this.wrapper.addEventListener('touchstart', this.onStart.bind(this), { passive: true });
        this.wrapper.addEventListener('touchmove', this.onMove.bind(this), { passive: true });
        this.wrapper.addEventListener('touchend', this.onEnd.bind(this));
        this.wrapper.addEventListener('mousedown', this.onStart.bind(this));
        document.addEventListener('mousemove', this.onMove.bind(this));
        document.addEventListener('mouseup', this.onEnd.bind(this));
    },
    
    onStart(e) {
        this.isDragging = true;
        this.startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        this.cardEl.style.transition = 'none';
    },
    
    onMove(e) {
        if (!this.isDragging) return;
        const x = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        this.currentX = x - this.startX;
        const rotate = this.currentX * 0.03;
        this.cardEl.style.transform = `translateX(${this.currentX}px) rotate(${rotate}deg)`;
        const opacity = 1 - Math.abs(this.currentX) / 300;
        this.cardEl.style.opacity = Math.max(0.4, opacity);
    },
    
    onEnd() {
        if (!this.isDragging) return;
        this.isDragging = false;
        
        if (this.currentX > this.threshold) {
            this.onSave();
        } else if (this.currentX < -this.threshold) {
            this.onSwitch();
        } else {
            this.cardEl.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            this.cardEl.style.transform = 'translateX(0) rotate(0)';
            this.cardEl.style.opacity = '1';
        }
        this.currentX = 0;
    },
    
    async onSave() {
        this.cardEl.style.transition = 'transform 0.3s ease, opacity 0.2s ease';
        this.cardEl.style.transform = 'translateX(120%) rotate(15deg)';
        this.cardEl.style.opacity = '0';
        await this.saveCard();
        setTimeout(() => this.close(), 300);
    },
    
    onSwitch() {
        this.cardEl.style.transition = 'transform 0.3s ease, opacity 0.2s ease';
        this.cardEl.style.transform = 'translateX(-120%) rotate(-15deg)';
        this.cardEl.style.opacity = '0';
        setTimeout(() => this.generateCard(), 300);
    },
    
    async saveCard() {
        const svg = this.cardEl.querySelector('svg');
        if (!svg) return;
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const svgData = new XMLSerializer().serializeToString(svg);
        
        const scale = 2;
        canvas.width = this.currentWidth * scale;
        canvas.height = this.currentHeight * scale;
        
        const img = new Image();
        await new Promise((resolve) => {
            img.onload = resolve;
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        });
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // 检查是否在 APP 环境
        const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
        
        if (isApp) {
            // APP 端：保存到文件 + 系统分享 + 剪贴板
            await this.saveCardApp(canvas);
        } else {
            // PC/Web 端：下载 + 剪贴板
            await this.saveCardWeb(canvas);
        }
    },
    
    // PC/Web 端保存
    async saveCardWeb(canvas) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        
        // 下载
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Lumina-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        
        // 复制到剪贴板
        if (navigator.clipboard?.write) {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
        }
    },
    
    // APP 端保存
    async saveCardApp(canvas) {
        const t = Lumina.I18n.t;
        const { Filesystem, Share } = Capacitor.Plugins;
        const fileName = `Lumina-${Date.now()}.png`;
        
        try {
            // 获取 base64 数据
            const base64Data = canvas.toDataURL('image/png').split(',')[1];
            
            // 保存到缓存目录
            const result = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: 'CACHE',
                recursive: true
            });
            
            // 调起系统分享（可选择保存到相册）
            await Share.share({
                title: t('shareCardTitle') || '分享书签',
                text: t('fromLuminaReader') || '来自流萤阅读器',
                url: result.uri,
                dialogTitle: t('saveToAlbumOrShare') || '保存到相册或分享'
            });
            
            // 清理缓存文件
            setTimeout(async () => {
                try {
                    await Filesystem.deleteFile({
                        path: fileName,
                        directory: 'CACHE'
                    });
                } catch (e) {}
            }, 60000); // 1分钟后删除
            
        } catch (err) {
            console.error('[ShareCard] APP save failed:', err);
            Lumina.UI.showToast((t('saveFailed') || '保存失败') + ': ' + err.message);
        }
    },
    
    close() {
        // 防止重复关闭
        if (this._isClosing) return;
        this._isClosing = true;
        
        if (this.overlay) {
            this.overlay.style.opacity = '0';
            const overlayRef = this.overlay;
            setTimeout(() => {
                overlayRef?.remove();
            }, 200);
            this.overlay = null;
        }
    }
};
