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
        // 保留分段信息（按换行符分割段落）
        this.paragraphs = selectedText.split(/\n+/).filter(p => p.trim());
        this.selectedText = selectedText;
        
        // 调试日志
        console.log('[ShareCard] selectedText:', JSON.stringify(selectedText));
        console.log('[ShareCard] paragraphs:', this.paragraphs);
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
        
        if (visualLength <= 45) return 'short';   // 放宽到45
        if (visualLength <= 180) return 'medium'; // 放宽到180
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
        
        const lines = this.measureText(this.selectedText, contentW, fontSize);
        const totalTextH = lines.length * lineHeight;
        const textStartY = cardY + (cardH - totalTextH) / 2 + lineHeight * 0.3;
        
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
        svg += `<text x="${Math.floor(w/2)}" y="${h - this.BRAND_Y}" text-anchor="middle" font-size="${this.BRAND_SIZE}" fill="${palette.accent}" fill-opacity="${this.BRAND_OPACITY}">${this.escapeXml(t('fromLuminaReader'))}</text>`;
        
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
        const allLines = [];
        const paragraphBreaks = [];
        
        this.paragraphs.forEach((para, idx) => {
            const paraLines = this.measureText(para, contentW, fontSize);
            console.log(`[ShareCard] Paragraph ${idx}:`, JSON.stringify(para), 'lines:', paraLines);
            allLines.push(...paraLines);
            if (idx < this.paragraphs.length - 1) {
                paragraphBreaks.push(allLines.length);
            }
        });
        
        console.log('[ShareCard] allLines:', allLines, 'paragraphBreaks:', paragraphBreaks);
        
        // 计算实际文本宽度，实现整体居中
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = `${fontSize}px ${this.currentFont}`;
        const maxLineWidth = Math.max(...allLines.map(l => ctx.measureText(l).width));
        const textBlockX = Math.floor((w - maxLineWidth) / 2);
        
        // 中文两端对齐
        const isCJK = /[\u4e00-\u9fa5]/.test(this.selectedText);
        if (isCJK && allLines.length > 1) {
            svg += `<text x="${textBlockX}" y="${textStartY}" font-size="${fontSize}" fill="#2c3e50">`;
            allLines.forEach((line, i) => {
                const isParaEnd = paragraphBreaks.includes(i + 1);
                const isLast = i === allLines.length - 1;
                const justify = !isLast && !isParaEnd && line.length > 4;
                // 段落开始的新一行添加额外间距
                const extraGap = (i > 0 && paragraphBreaks.includes(i)) ? Math.floor(lineHeight * 0.5) : 0;
                
                if (justify) {
                    svg += `<tspan x="${textBlockX}" dy="${i === 0 ? 0 : lineHeight + extraGap}" textLength="${maxLineWidth}" lengthAdjust="spacing">${this.escapeXml(line)}</tspan>`;
                } else {
                    svg += `<tspan x="${textBlockX}" dy="${i === 0 ? 0 : lineHeight + extraGap}">${this.escapeXml(line)}</tspan>`;
                }
            });
            svg += '</text>';
        } else {
            svg += `<text x="${textBlockX}" y="${textStartY}" font-size="${fontSize}" fill="#2c3e50">`;
            allLines.forEach((line, i) => {
                const extraGap = (i > 0 && paragraphBreaks.includes(i)) ? Math.floor(lineHeight * 0.5) : 0;
                svg += `<tspan x="${textBlockX}" dy="${i === 0 ? 0 : lineHeight + extraGap}">${this.escapeXml(line)}</tspan>`;
            });
            svg += '</text>';
        }
        
        const bottomY = h - Math.floor(h * 0.04);
        const source = this.buildSource(contentW);
        svg += `<text x="${padding}" y="${bottomY}" font-size="${Math.max(11, Math.floor(w * 0.022))}" font-style="italic" fill="#888">${this.escapeXml(source)}</text>`;
        
        const t = Lumina.I18n.t;
        svg += `<text x="${w - padding}" y="${bottomY}" text-anchor="end" font-size="${this.BRAND_SIZE}" fill="${palette.accent}" fill-opacity="${this.BRAND_OPACITY}">${this.escapeXml(t('fromLuminaReader'))}</text>`;
        
        return svg;
    },
    
    // ========== 长文字: 2:3 顶部30%图案+底部70%文字 ==========
    renderLong(w, h, palette, seed) {
        const visualH = Math.floor(h * 0.30);
        
        let svg = '';
        svg += this.renderPatternFull(w, visualH, palette, seed, 1.1);
        svg += `<rect x="0" y="${visualH}" width="${w}" height="${h - visualH}" fill="#fafafa"/>`;
        svg += `<rect x="0" y="${visualH}" width="${w}" height="${Math.max(4, Math.floor(h * 0.006))}" fill="${palette.accent}"/>`;
        
        const padding = Math.floor(w * 0.08);
        const fontSize = Math.max(15, Math.floor(w * 0.033));
        // 调整后的内容宽度（减少右边留白约半个字符）
        const contentW = w - padding * 2 - Math.floor(fontSize * 0.5);
        
        let currentY = visualH + Math.floor(h * 0.05);
        
        // 章节标题
        if (this.bookInfo.chapterTitle && 
            this.bookInfo.chapterTitle !== this.bookInfo.bookTitle &&
            this.bookInfo.chapterTitle.length < 20) {
            svg += `<text x="${padding}" y="${currentY}" font-size="${Math.max(13, Math.floor(w * 0.028))}" font-weight="600" fill="${palette.accent}">${this.escapeXml(this.bookInfo.chapterTitle)}</text>`;
            currentY += Math.floor(h * 0.045);
        }
        
        const lineHeight = Math.floor(fontSize * 1.8);
        const maxLines = Math.floor((h - currentY - Math.floor(h * 0.15)) / lineHeight);
        
        // 分段渲染（带截断限制）
        const allLines = [];
        const paragraphBreaks = [];
        let linesRemaining = maxLines;
        
        for (let idx = 0; idx < this.paragraphs.length; idx++) {
            const para = this.paragraphs[idx];
            const paraLines = this.measureText(para, contentW, fontSize);
            
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
        
        // 计算实际文本宽度，实现整体居中
        const canvas2 = document.createElement('canvas');
        const ctx2 = canvas2.getContext('2d');
        ctx2.font = `${fontSize}px ${this.currentFont}`;
        const maxLineWidth = Math.max(...allLines.map(l => ctx2.measureText(l).width));
        const textBlockX = Math.floor((w - maxLineWidth) / 2);
        
        // 中文两端对齐
        const isCJK = /[\u4e00-\u9fa5]/.test(this.selectedText);
        if (isCJK && allLines.length > 1) {
            svg += `<text x="${textBlockX}" y="${currentY}" font-size="${fontSize}" fill="#2c3e50">`;
            allLines.forEach((line, i) => {
                // isParaEnd: 当前行是否是段落最后一行
                const isParaEnd = paragraphBreaks.includes(i + 1);
                const isLast = i === allLines.length - 1;
                const justify = !isLast && !isParaEnd && line.length > 4;
                // 段落结束后的下一行添加额外间距
                const extraGap = (i > 0 && paragraphBreaks.includes(i)) ? Math.floor(lineHeight * 0.5) : 0;
                
                if (justify) {
                    svg += `<tspan x="${textBlockX}" dy="${i === 0 ? 0 : lineHeight + extraGap}" textLength="${maxLineWidth}" lengthAdjust="spacing">${this.escapeXml(line)}</tspan>`;
                } else {
                    svg += `<tspan x="${textBlockX}" dy="${i === 0 ? 0 : lineHeight + extraGap}">${this.escapeXml(line)}</tspan>`;
                }
            });
            svg += '</text>';
        } else {
            svg += `<text x="${textBlockX}" y="${currentY}" font-size="${fontSize}" fill="#2c3e50">`;
            allLines.forEach((line, i) => {
                const extraGap = (i > 0 && paragraphBreaks.includes(i)) ? Math.floor(lineHeight * 0.5) : 0;
                svg += `<tspan x="${textBlockX}" dy="${i === 0 ? 0 : lineHeight + extraGap}">${this.escapeXml(line)}</tspan>`;
            });
            svg += '</text>';
        }
        
        const textEndY = currentY + allLines.length * lineHeight + paragraphBreaks.length * Math.floor(lineHeight * 0.5);
        
        svg += `<line x1="${padding}" y1="${textEndY + Math.floor(h * 0.03)}" x2="${padding + Math.floor(w * 0.15)}" y2="${textEndY + Math.floor(h * 0.03)}" stroke="#ddd" stroke-width="1"/>`;
        
        const source = this.buildSource(contentW);
        svg += `<text x="${padding}" y="${textEndY + Math.floor(h * 0.065)}" font-size="${Math.max(11, Math.floor(w * 0.022))}" font-style="italic" fill="#888">${this.escapeXml(source)}</text>`;
        
        const t = Lumina.I18n.t;
        svg += `<text x="${w - padding}" y="${h - this.BRAND_Y}" text-anchor="end" font-size="${this.BRAND_SIZE}" fill="${palette.accent}" fill-opacity="${this.BRAND_OPACITY}">${this.escapeXml(t('fromLuminaReader'))}</text>`;
        
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
        console.log('[measureText] Input:', JSON.stringify(text.substring(0, 50)), 'maxWidth:', maxWidth);
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
            console.log('[measureText] Non-CJK lines result:', lines);
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
        const t = Lumina.I18n.t;
        this.cardEl.style.transition = 'transform 0.3s ease, opacity 0.2s ease';
        this.cardEl.style.transform = 'translateX(120%) rotate(15deg)';
        this.cardEl.style.opacity = '0';
        await this.saveCard();
        Lumina.UI.showToast(t('cardSaved') || '已保存');
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
        
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Lumina-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
            
            if (navigator.clipboard?.write) {
                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
            }
        }, 'image/png');
    },
    
    close() {
        if (this.overlay) {
            this.overlay.style.opacity = '0';
            setTimeout(() => this.overlay.remove(), 200);
        }
    }
};
