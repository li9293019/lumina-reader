/**
 * Share Card - 分享书签 v8
 * 双轨渲染架构：SVG 预览（丝滑） + Canvas 高清输出（精准）
 * 跟随阅读器字体，精确排版，中文两端对齐
 */

Lumina.ShareCard = {
    isDragging: false,
    startX: 0,
    currentX: 0,
    threshold: 80,
    usedSeeds: new Set(),
    currentPatternId: 0,
    
    // 缩放状态
    _scale: 1,
    _minScale: 0.5,
    _maxScale: 4,
    _isPinching: false,
    _pinchStartDistance: 0,
    _pinchStartScale: 1,
    _scaleResetting: false,
    _isAnimating: false,  // 入场/滑出/回弹动画期间锁
    
    // 统一品牌样式
    BRAND_OPACITY: 0.85,
    BRAND_Y: 22,
    
    // 品牌名字号：跟随正文字号的 0.618（黄金比例），最小 11px
    getBrandFontSize(baseFontSize) {
        return Math.max(11, Math.floor(baseFontSize * 0.618));
    },
    
    // 高清输出配置
    EXPORT_CONFIG: {
        baseWidth: 600,        // 固定输出宽度
        minScale: 3,           // 最小 3x 高清
        maxScale: 4,           // 最大 4x 超清
        quality: 1          // PNG 质量
    },
    
    // 获取当前阅读器字体
    getReaderFont() {
        // 从 CSS 变量或 State 获取当前字体
        // const root = document.documentElement;
        // const fontFamily = getComputedStyle(root).getPropertyValue('--font-family-dynamic').trim() || 
        //                   getComputedStyle(root).getPropertyValue('--reader-font').trim() ||
        //                   'system-ui, -apple-system, sans-serif';
        // return fontFamily;
        // 字体版权风险考虑，使用无风险字体
        return 'LXGW Neo Zhi Song, sans-serif';
    },
    
    // 响应式基础宽度
    getBaseWidth() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let w;
        
        if (vw < 640) {
            w = Math.max(320, vw - 40);
        } else {
            w = 600.0;
            if (vw / w * vh > vh) {
                w = (vh - 40) / 3 * 2;
            }
        }
        
        this.EXPORT_CONFIG.baseWidth = w;
        return w;
    },
    
    show(selectedText) {
        // 重置状态
        this._isClosing = false;
        this.currentX = 0;
        this._scale = 1;
        
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
            author: file?.metadata?.author || Lumina.I18n.t('anonymousAuthor') || '佚名'
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
        const isMobile = window.innerWidth <= 480;
        const shortCount = isMobile ? 30 : 35;
        const longCount = isMobile ? 56 : 100;
        if (visualLength <= shortCount) return 'short'; 
        if (visualLength <= longCount) return 'medium';  
        return 'long';
    },
    
    generateCard() {
        // 强制重置 transform 状态，避免上一场动画残留
        this.currentX = 0;
        
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
        const CoverCore = Lumina.PatternWarehouse.CoverCore;
        this.currentPatternId = seed % CoverCore.PATTERNS.length;
        
        const svg = this.renderCard(width, height, layoutType, seed);
        
        this.cardEl.innerHTML = svg;
        this.cardEl.style.width = width + 'px';
        this.cardEl.style.height = height + 'px';
        
        this._scale = 1;
        this.cardEl.style.transform = 'scale(0.95)';
        this.cardEl.style.opacity = '0';
        requestAnimationFrame(() => {
            this.cardEl.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            this.cardEl.style.transform = 'scale(1)';
            this.cardEl.style.opacity = '1';
        });
    },
    
    renderCard(w, h, layoutType, seed) {
        const CoverCore = Lumina.PatternWarehouse.CoverCore;
        const palette = CoverCore.generatePalette(seed, 'auto');
        this.currentPalette = palette;
        
        // 字体嵌入 SVG
        const fontFamily = this.currentFont.replace(/"/g, "'");
        
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" color="${palette.accent}">`;
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
        
        // 底部渐变遮罩（在图案之上、白色卡片之下，优化品牌文字显示）
        const maskHeight = Math.floor(h * 0.28);
        const gradientId = `bottomMask-${seed}`;
        svg += `<defs>
            <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="${palette.bg}" stop-opacity="0.3" />
                <stop offset="50%" stop-color="${palette.bg}" stop-opacity="0.6" />
                <stop offset="100%" stop-color="${palette.bg}" stop-opacity="1" />
            </linearGradient>
        </defs>`;
        svg += `<rect x="0" y="${h - maskHeight}" width="${w}" height="${maskHeight}" fill="url(#${gradientId})" />`;
        
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
        const textStartY = cardY + quoteH + padding + (availableH - totalTextH) / 2 + lineHeight * 0.5;
        
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
        svg += `<text x="${Math.floor(w/2)}" y="${brandY}" text-anchor="middle" font-size="${this.getBrandFontSize(fontSize)}" fill="${palette.accent}" fill-opacity="${this.BRAND_OPACITY}">${this.escapeXml(t('fromLuminaReader'))}</text>`;
        
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
        const fontSize = Math.max(18, Math.floor(w * 0.036));
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
        
        // 最后保底检查：确保没有超长（与长版式一致的两阶段截断）
        const bottomAreaH = Math.floor(h * 0.04);
        const availableH = h - halfH - lineGap * 2 - fontSize - bottomAreaH;
        let paraExtraH = paragraphBreaks.length * Math.floor(lineHeight * 0.5);
        let totalContentH = allLines.length * lineHeight + paraExtraH;
        
        if (totalContentH > availableH && allLines.length > 1) {
            // 需要进一步截断，但要保留未受影响的段落标记
            const maxContentLines = Math.floor((availableH - paraExtraH) / lineHeight);
            allLines = allLines.slice(0, maxContentLines);
            // 只保留截断点之前的段落标记（原地修改）
            for (let i = paragraphBreaks.length - 1; i >= 0; i--) {
                if (paragraphBreaks[i] >= maxContentLines) {
                    paragraphBreaks.splice(i, 1);
                }
            }
            // 最后一行添加省略号
            const lastIdx = allLines.length - 1;
            const isCJK = /[\u4e00-\u9fa5]/.test(allLines[lastIdx]);
            allLines[lastIdx] = allLines[lastIdx].substring(0, allLines[lastIdx].length - 2) + (isCJK ? '……' : '...');
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
        
        // 顶部渐变遮罩 + 品牌（右上角，避免与来源重叠）
        const topMaskH = Math.floor(h * 0.12);
        const topGradId = `topMask-${seed}`;
        svg += `<defs><linearGradient id="${topGradId}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${palette.bg}" stop-opacity="0.85"/><stop offset="100%" stop-color="${palette.bg}" stop-opacity="0"/></linearGradient></defs>`;
        svg += `<rect x="0" y="0" width="${w}" height="${topMaskH}" fill="url(#${topGradId})"/>`;
        
        const t = Lumina.I18n.t;
        const brandY = Math.floor(h * 0.04);
        svg += `<text x="${w - padding}" y="${brandY}" text-anchor="end" font-size="${this.getBrandFontSize(fontSize)}" fill="${palette.accent}" fill-opacity="${this.BRAND_OPACITY}">${this.escapeXml(t('fromLuminaReader'))}</text>`;
        
        return svg;
    },
    
    // ========== 长文字: 2:3 顶部30%图案+底部70%文字 ==========
    renderLong(w, h, palette, seed) {
        const visualH = Math.floor(h * 0.30);
        const padding = Math.floor(w * 0.08);
        const fontSize = Math.max(18, Math.floor(w * 0.033));
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
                allLines[lastIdx] = allLines[lastIdx].substring(0, allLines[lastIdx].length - 2) + (isCJK ? '……' : '...');
                break;
            }
        }
        
        // 最后保底检查：确保没有超长
        let paraExtraH = paragraphBreaks.length * Math.floor(lineHeight * 0.5);
        let totalContentH = allLines.length * lineHeight + paraExtraH;
        const maxContentH = h - currentY - bottomGap;
        
        if (totalContentH > maxContentH && allLines.length > 1) {
            // 需要进一步截断，但要保留未受影响的段落标记
            const maxContentLines = Math.floor((maxContentH - paraExtraH) / lineHeight);
            allLines = allLines.slice(0, maxContentLines);
            // 只保留截断点之前的段落标记（原地修改）
            for (let i = paragraphBreaks.length - 1; i >= 0; i--) {
                if (paragraphBreaks[i] >= maxContentLines) {
                    paragraphBreaks.splice(i, 1);
                }
            }
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
        svg += `<text x="${textRightX}" y="${brandY}" text-anchor="end" font-size="${this.getBrandFontSize(fontSize)}" fill="${palette.accent}" fill-opacity="${this.BRAND_OPACITY}">${this.escapeXml(t('fromLuminaReader'))}</text>`;
        
        return svg;
    },
    
    renderPatternFull(w, h, palette, seed, intensity = 1) {
        const CoverCore = Lumina.PatternWarehouse.CoverCore;
        const PATTERNS = CoverCore.PATTERNS;
        const PatternDrawers = CoverCore.PatternDrawers;
        const params = CoverCore.extractParams(seed, 40);
        
        const patternCode = PATTERNS[this.currentPatternId]?.code || 'lines';
        const drawer = PatternDrawers[patternCode];
        if (!drawer) return `<rect width="${w}" height="${h}" fill="${palette.bg}"/>`;
        
        const SVGRenderer = Lumina.PatternWarehouse.SVGRenderer;
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
    
    measureText(text, maxWidth, fontSize, fontStack = null) {

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        // 优先使用传入的字体栈，否则使用当前阅读器字体
        ctx.font = `${fontSize}px ${fontStack || this.currentFont}`;
        
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
            // console.log('[measureText] CJK lines result:', lines);
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
        
        if (!source) return Lumina.I18n.t('anonymousAuthor');
        
        if (maxWidth) {
            const metrics = ctx.measureText(source);
            if (metrics.width > maxWidth) {
                const author = this.bookInfo.author || Lumina.I18n.t('anonymousAuthor');
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
    
    // 统一更新 transform，避免散落各地的 style.transform 互相覆盖
    _updateTransform({ x = this.currentX, rotate = this.currentX * 0.03, scale = this._scale, transition = false } = {}) {
        if (!this.cardEl) return;
        this.cardEl.style.transition = transition ? 'transform 0.3s ease, opacity 0.3s ease' : 'none';
        this.cardEl.style.transform = `translateX(${x}px) rotate(${rotate}deg) scale(${scale})`;
    },
    
    // 缩放回弹到 1:1
    _resetScale() {
        if (this._scale === 1) return;
        if (this._isAnimating) return;
        this._scale = 1;
        this._scaleResetting = true;
        this.currentX = 0;
        this._updateTransform({ x: 0, rotate: 0, scale: 1, transition: true });
        setTimeout(() => { this._scaleResetting = false; }, 300);
    },
    
    bindGestures() {
        // 触摸：双指缩放 + 单指滑动
        this.wrapper.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: false });
        this.wrapper.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
        this.wrapper.addEventListener('touchend', this._onTouchEnd.bind(this));
        
        // 鼠标：拖动
        this.wrapper.addEventListener('mousedown', this._onMouseDown.bind(this));
        document.addEventListener('mousemove', this._onMouseMove.bind(this));
        document.addEventListener('mouseup', this._onMouseUp.bind(this));
        
        // 滚轮：缩放（PC）
        this.wrapper.addEventListener('wheel', this._onWheel.bind(this), { passive: false });
    },
    
    // ========== 触摸事件 ==========
    _onTouchStart(e) {
        if (e.touches.length === 2) {
            // 双指：进入缩放模式
            this._isPinching = true;
            this.isDragging = false;
            
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            this._pinchStartDistance = Math.hypot(dx, dy);
            this._pinchStartScale = this._scale;
            
            e.preventDefault();
        } else if (e.touches.length === 1 && !this._isPinching) {
            // 单指：如果当前有缩放，先回弹，不进入拖动
            if (this._scale !== 1) {
                this._resetScale();
                return;
            }
            this._startDrag(e.touches[0].clientX);
        }
    },
    
    _onTouchMove(e) {
        if (this._isPinching && e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const distance = Math.hypot(dx, dy);
            
            if (this._pinchStartDistance > 0) {
                const ratio = distance / this._pinchStartDistance;
                this._scale = Math.max(this._minScale, Math.min(this._maxScale, this._pinchStartScale * ratio));
                this._updateTransform({ scale: this._scale });
            }
        } else if (!this._isPinching && this.isDragging && e.touches.length === 1) {
            if (this._scaleResetting) return;
            this._doDrag(e.touches[0].clientX);
        }
    },
    
    _onTouchEnd(e) {
        if (this._isPinching && e.touches.length < 2) {
            this._isPinching = false;
        } else if (!this._isPinching) {
            this._endDrag();
        }
    },
    
    // ========== 鼠标事件 ==========
    _onMouseDown(e) {
        if (this._scale !== 1) {
            this._resetScale();
            return;
        }
        this._startDrag(e.clientX);
    },
    
    _onMouseMove(e) {
        if (!this.isDragging) return;
        if (this._scaleResetting) return;
        this._doDrag(e.clientX);
    },
    
    _onMouseUp() {
        this._endDrag();
    },
    
    // ========== 滚轮缩放（PC） ==========
    _onWheel(e) {
        e.preventDefault();
        if (this._isAnimating || this._scaleResetting) return;
        const delta = e.deltaY > 0 ? 0.92 : 1.08;
        this._scale = Math.max(this._minScale, Math.min(this._maxScale, this._scale * delta));
        this._updateTransform({ transition: true });
    },
    
    // ========== 拖动核心 ==========
    _startDrag(clientX) {
        this.isDragging = true;
        this.startX = clientX;
        this.currentX = 0;
        this._updateTransform({ transition: false });
    },
    
    _doDrag(clientX) {
        this.currentX = clientX - this.startX;
        const rotate = this.currentX * 0.03;
        const opacity = 1 - Math.abs(this.currentX) / 300;
        this._updateTransform({ rotate });
        this.cardEl.style.opacity = Math.max(0.4, opacity);
    },
    
    _endDrag() {
        if (!this.isDragging) return;
        this.isDragging = false;
        
        if (this.currentX > this.threshold) {
            this.onSave();
        } else if (this.currentX < -this.threshold) {
            this.onSwitch();
        } else {
            this.currentX = 0;
            this._updateTransform({ x: 0, rotate: 0, transition: true });
            this.cardEl.style.opacity = '1';
        }
    },
    
    async onSave() {
        this._isAnimating = true;
        this._scale = 1;
        this.cardEl.style.transition = 'transform 0.3s ease, opacity 0.2s ease';
        this.cardEl.style.transform = 'translateX(120%) rotate(15deg) scale(1)';
        this.cardEl.style.opacity = '0';
        
        // 使用 Canvas 高清渲染
        try {
            await this.saveCardHD();
        } catch (err) {
            console.error('[ShareCard] 高清渲染失败，降级到 SVG:', err);
            await this.saveCard(); // 降级
        }
        
        // 等待退场动画精确完成后再关闭，避免 setTimeout 与 CSS transition 竞态
        let ended = false;
        const onEnd = (e) => {
            if (ended || e.propertyName !== 'transform') return;
            ended = true;
            this.cardEl.removeEventListener('transitionend', onEnd);
            clearTimeout(fallbackTimer);
            this._isAnimating = false;
            this.close();
        };
        this.cardEl.addEventListener('transitionend', onEnd);
        const fallbackTimer = setTimeout(() => {
            if (ended) return;
            this.cardEl.removeEventListener('transitionend', onEnd);
            this._isAnimating = false;
            this.close();
        }, 400);
    },
    
    /**
     * Canvas 高清渲染并保存
     */
    async saveCardHD() {
        const { baseWidth, minScale, maxScale, quality } = this.EXPORT_CONFIG;
        const layoutType = this.currentLayout;
        
        // 计算高度（与 SVG 一致）
        let height = baseWidth;
        if (layoutType === 'long') height = Math.floor(baseWidth * 1.5);
        else if (layoutType === 'medium') height = Math.floor(baseWidth * 1.33);
        
        // 高 DPI 设置
        const dpr = Math.min(Math.max(window.devicePixelRatio || 1, minScale), maxScale);
        
        // 创建 Canvas
        const canvas = document.createElement('canvas');
        canvas.width = baseWidth * dpr;
        canvas.height = height * dpr;
        
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // 准备渲染数据
        const renderData = {
            paragraphs: this.paragraphs,
            bookInfo: this.bookInfo,
            palette: this.currentPalette,
            fontFamily: this.currentFont  // 传递当前字体
        };
        
        // 根据版式绘制（图案+内容一体化，确保区域一致）
        switch(layoutType) {
            case 'short': this.renderShortToCanvas(ctx, baseWidth, height, renderData); break;
            case 'medium': this.renderMediumToCanvas(ctx, baseWidth, height, renderData); break;
            case 'long': this.renderLongToCanvas(ctx, baseWidth, height, renderData); break;
        }
        
        // 导出
        await this.exportCanvas(canvas);
    },
    
    /**
     * 获取 Canvas 字体栈（使用阅读器当前字体）
     */
    getCanvasFontStack() {
        // 优先使用阅读器当前字体，然后系统字体回退
        const readerFont = this.currentFont || '';
        
        // 提取字体族名（去除引号）
        const cleanFont = readerFont
            .replace(/["']/g, '')
            .split(',')[0]
            .trim();
        
        if (cleanFont && cleanFont !== 'system-ui') {
            // 使用阅读器字体 + 系统字体回退
            return `${readerFont}, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
        }
        
        // 默认系统字体栈
        return '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';
    },
    
    /**
     * 绘制图案到指定区域（与 SVG renderPatternFull 完全一致）
     */
    renderPatternArea(ctx, x, y, w, h, palette, seed, intensity = 1) {
        const CoverCore = Lumina.PatternWarehouse.CoverCore;
        const patternCode = CoverCore.PATTERNS[this.currentPatternId]?.code || 'lines';
        const drawer = CoverCore.PatternDrawers[patternCode];
        
        if (!drawer) {
            ctx.fillStyle = palette.bg;
            ctx.fillRect(x, y, w, h);
            return;
        }
        
        const params = CoverCore.extractParams(seed, 40);
        
        ctx.save();
        
        // 填充背景（与 SVG renderPatternFull 一致使用 palette.bg）
        ctx.fillStyle = palette.bg;
        ctx.fillRect(x, y, w, h);
        
        // 设置图案绘制样式（与 SVG 一致）
        ctx.strokeStyle = palette.accent;
        ctx.fillStyle = palette.accent;
        ctx.globalAlpha = Math.min(0.7 * intensity, 1);
        ctx.lineWidth = Math.max(1.5, w * 0.003);
        
        // 在指定区域绘制图案
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();  // 限制绘制区域
        
        drawer(ctx, w, h, params, 1.0);
        
        ctx.restore();
    },
    
    /**
     * Canvas 工具：圆角矩形
     */
    roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    },
    
    /**
     * Canvas 工具：绘制引号装饰
     */
    drawQuoteMark(ctx, x, y, size, color) {
        ctx.save();
        ctx.fillStyle = color;
        // 引号不使用透明度，与 SVG 一致
        ctx.globalAlpha = 1.0;
        
        const s = size;
        
        // 左双引号路径（与 SVG path 数据一致）
        ctx.beginPath();
        ctx.moveTo(x + s * 0.9, y + s * 0.1);
        ctx.bezierCurveTo(x + s * 0.5, y + s * 0.1, x + s * 0.2, y + s * 0.3, x + s * 0.15, y + s * 0.55);
        ctx.bezierCurveTo(x + s * 0.1, y + s * 0.75, x + s * 0.25, y + s * 0.9, x + s * 0.4, y + s * 0.85);
        ctx.bezierCurveTo(x + s * 0.55, y + s * 0.8, x + s * 0.6, y + s * 0.65, x + s * 0.55, y + s * 0.55);
        ctx.bezierCurveTo(x + s * 0.5, y + s * 0.45, x + s * 0.35, y + s * 0.35, x + s * 0.6, y + s * 0.25);
        ctx.bezierCurveTo(x + s * 0.75, y + s * 0.2, x + s * 0.85, y + s * 0.15, x + s * 0.9, y + s * 0.1);
        ctx.fill();
        
        // 右双引号（偏移）
        ctx.translate(s * 0.9, 0);
        ctx.beginPath();
        ctx.moveTo(x + s * 0.9, y + s * 0.1);
        ctx.bezierCurveTo(x + s * 0.5, y + s * 0.1, x + s * 0.2, y + s * 0.3, x + s * 0.15, y + s * 0.55);
        ctx.bezierCurveTo(x + s * 0.1, y + s * 0.75, x + s * 0.25, y + s * 0.9, x + s * 0.4, y + s * 0.85);
        ctx.bezierCurveTo(x + s * 0.55, y + s * 0.8, x + s * 0.6, y + s * 0.65, x + s * 0.55, y + s * 0.55);
        ctx.bezierCurveTo(x + s * 0.5, y + s * 0.45, x + s * 0.35, y + s * 0.35, x + s * 0.6, y + s * 0.25);
        ctx.bezierCurveTo(x + s * 0.75, y + s * 0.2, x + s * 0.85, y + s * 0.15, x + s * 0.9, y + s * 0.1);
        ctx.fill();
        
        ctx.restore();
    },
    
    /**
     * 短版式 Canvas 渲染（与 SVG renderShort 逐行对照）
     */
    renderShortToCanvas(ctx, w, h, data) {
        const { paragraphs, bookInfo, palette, fontFamily } = data;
        const padding = Math.floor(w * 0.08);
        const fontStack = this.getCanvasFontStack();
        
        // --- 全图背景图案（intensity=1.0，与 SVG 一致）---
        this.renderPatternArea(ctx, 0, 0, w, h, palette, this.currentSeed, 1.0);
        
        // --- 底部渐变遮罩（在图案之上、白色卡片之下，与 SVG 一致）---
        const maskHeight = Math.floor(h * 0.28);
        const gradient = ctx.createLinearGradient(0, h - maskHeight, 0, h);
        gradient.addColorStop(0, this.hexToRgba(palette.bg, 0.3));
        gradient.addColorStop(0.5, this.hexToRgba(palette.bg, 0.6));
        gradient.addColorStop(1, this.hexToRgba(palette.bg, 1));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, h - maskHeight, w, maskHeight);
        
        // --- 卡片背景 ---
        const cardW = Math.floor(w * 0.82);
        const cardH = Math.floor(h * 0.68);
        const cardX = Math.floor((w - cardW) / 2);
        const cardY = Math.floor((h - cardH) / 2);
        
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        this.roundRect(ctx, cardX, cardY, cardW, cardH, 4);
        ctx.fill();
        
        // --- 引号装饰 ---
        this.drawQuoteMark(ctx, cardX + padding, cardY + padding, 26, palette.accent);
        
        // --- 文字排版 ---
        const fontSize = Math.max(20, Math.floor(w * 0.045));
        const lineHeight = Math.floor(fontSize * 1.6);
        const quoteH = 35;
        const lineAndSourceH = Math.floor(h * 0.12);
        const availableH = cardH - quoteH - lineAndSourceH - padding * 2;
        const contentW = cardW - padding * 2;
        
        // 测量文本（使用当前字体栈）
        let lines = this.measureText(paragraphs.join(''), contentW, fontSize, fontStack);
        const maxLines = Math.floor(availableH / lineHeight);
        
        if (lines.length > maxLines) {
            lines = lines.slice(0, maxLines);
            const last = lines.length - 1;
            const isCJK = /[\u4e00-\u9fa5]/.test(lines[last]);
            lines[last] = lines[last].substring(0, lines[last].length - 2) + (isCJK ? '……' : '...');
        }
        
        const totalTextH = lines.length * lineHeight;
        const textStartY = cardY + quoteH + padding + (availableH - totalTextH) / 2 + lineHeight * 0.5;
        
        // 绘制文字（使用阅读器字体）
        ctx.font = `600 ${fontSize}px ${fontStack}`;
        ctx.fillStyle = '#2c3e50';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        
        lines.forEach((line, i) => {
            ctx.fillText(line, w / 2, textStartY + i * lineHeight);
        });
        
        // --- 装饰线 ---
        const lineY = cardY + cardH - Math.floor(h * 0.12);
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cardX + Math.floor(cardW * 0.2), lineY);
        ctx.lineTo(cardX + Math.floor(cardW * 0.8), lineY);
        ctx.stroke();
        
        // --- 来源（使用阅读器字体，与 SVG 一致）---
        const source = this.buildSource(contentW);
        const sourceSize = Math.max(12, Math.floor(w * 0.024));
        ctx.font = `italic ${sourceSize}px ${fontStack}`;
        ctx.fillStyle = '#666';
        ctx.fillText(source, w / 2, cardY + cardH - Math.floor(h * 0.06));
        
        // --- 品牌 ---
        const brandY = h - Math.floor(h * 0.04);
        const brandSize = this.getBrandFontSize(fontSize);
        ctx.font = `${brandSize}px ${fontStack}`;
        ctx.fillStyle = palette.accent;
        ctx.globalAlpha = 0.85;
        ctx.fillText(Lumina.I18n.t('fromLuminaReader'), w / 2, brandY);
        ctx.globalAlpha = 1;
    },
    
    // 辅助方法：将颜色值转换为 rgba
    hexToRgba(color, alpha) {
        if (!color || typeof color !== 'string') {
            // 默认返回深色背景
            return `rgba(30, 30, 35, ${alpha})`;
        }
        
        let hex = color.trim();
        
        // 处理 rgb/rgba 格式
        if (hex.startsWith('rgb')) {
            const match = hex.match(/rgba?\(([^)]+)\)/);
            if (match) {
                const parts = match[1].split(',').map(p => parseFloat(p.trim()));
                const r = parts[0] || 0;
                const g = parts[1] || 0;
                const b = parts[2] || 0;
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
        }
        
        // 处理 hex 格式
        if (hex.startsWith('#')) {
            // 简写形式 #rgb 或 #rgba
            if (hex.length === 4 || hex.length === 5) {
                const r = hex[1], g = hex[2], b = hex[3], a = hex[4];
                hex = '#' + r + r + g + g + b + b + (a ? a + a : '');
            }
            
            const r = parseInt(hex.slice(1, 3), 16) || 0;
            const g = parseInt(hex.slice(3, 5), 16) || 0;
            const b = parseInt(hex.slice(5, 7), 16) || 0;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        
        // 处理命名颜色或 hsl（简单回退）
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = color;
        const computed = ctx.fillStyle;
        if (computed && computed.startsWith('#')) {
            return this.hexToRgba(computed, alpha);
        }
        
        // 默认回退
        return `rgba(30, 30, 35, ${alpha})`;
    },
    
    /**
     * 中版式 Canvas 渲染（与 SVG renderMedium 逐行对照）
     */
    renderMediumToCanvas(ctx, w, h, data) {
        const { paragraphs, bookInfo, palette } = data;
        const halfH = Math.floor(h / 2);
        const padding = Math.floor(w * 0.08);
        const fontStack = this.getCanvasFontStack();
        
        // --- 上半部分图案背景（intensity=1.0，与 SVG 一致）---
        this.renderPatternArea(ctx, 0, 0, w, halfH, palette, this.currentSeed, 1.0);
        
        // --- 顶部渐变遮罩 ---
        const topMaskH = Math.floor(h * 0.12);
        const topGradient = ctx.createLinearGradient(0, 0, 0, topMaskH);
        topGradient.addColorStop(0, this.hexToRgba(palette.bg, 0.85));
        topGradient.addColorStop(1, this.hexToRgba(palette.bg, 0));
        ctx.fillStyle = topGradient;
        ctx.fillRect(0, 0, w, topMaskH);
        
        // --- 下半部分白色背景 ---
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, halfH, w, h - halfH);
        
        // --- 装饰线 ---
        const lineGap = Math.floor(h * 0.04);
        const lineY = halfH + lineGap;
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.floor(w * 0.08), lineY);
        ctx.lineTo(Math.floor(w * 0.92), lineY);
        ctx.stroke();
        
        // --- 文字排版 ---
        const fontSize = Math.max(18, Math.floor(w * 0.036));
        const lineHeight = Math.floor(fontSize * 1.7);
        const contentW = w - padding * 2 - Math.floor(fontSize * 0.3);
        const textStartY = lineY + lineGap + fontSize;
        
        // --- 品牌（右上角，fontSize 已定义后绘制）---
        ctx.textAlign = 'right';
        const brandSize = this.getBrandFontSize(fontSize);
        ctx.font = `${brandSize}px ${fontStack}`;
        ctx.fillStyle = palette.accent;
        ctx.globalAlpha = 0.85;
        ctx.fillText(Lumina.I18n.t('fromLuminaReader'), w - padding, Math.floor(h * 0.04));
        ctx.globalAlpha = 1;
        
        // 分段渲染（使用当前字体栈）
        let allLines = [];
        const paragraphBreaks = [];
        
        paragraphs.forEach((para, idx) => {
            const paraLines = this.measureText(para, contentW, fontSize, fontStack)
                .filter(line => line.trim());
            if (paraLines.length === 0) return;
            
            allLines.push(...paraLines);
            if (idx < paragraphs.length - 1) {
                paragraphBreaks.push(allLines.length);
            }
        });
        
        // 最后保底检查：确保没有超长（与 SVG renderMedium 一致的两阶段截断）
        const bottomAreaH = Math.floor(h * 0.04);
        const availableH = h - halfH - lineGap * 2 - fontSize - bottomAreaH;
        let paraExtraH = paragraphBreaks.length * Math.floor(lineHeight * 0.5);
        let totalContentH = allLines.length * lineHeight + paraExtraH;
        
        if (totalContentH > availableH && allLines.length > 1) {
            // 需要进一步截断，但要保留未受影响的段落标记
            const maxContentLines = Math.floor((availableH - paraExtraH) / lineHeight);
            allLines = allLines.slice(0, maxContentLines);
            // 只保留截断点之前的段落标记
            for (let i = paragraphBreaks.length - 1; i >= 0; i--) {
                if (paragraphBreaks[i] >= maxContentLines) {
                    paragraphBreaks.splice(i, 1);
                }
            }
            const lastIdx = allLines.length - 1;
            const isCJK = /[\u4e00-\u9fa5]/.test(allLines[lastIdx]);
            allLines[lastIdx] = allLines[lastIdx].substring(0, allLines[lastIdx].length - 2) + (isCJK ? '……' : '...');
        }
        
        // 计算文本块居中
        ctx.font = `400 ${fontSize}px ${fontStack}`;
        const maxLineWidth = Math.max(...allLines.map(l => ctx.measureText(l).width));
        const textBlockX = Math.floor((w - maxLineWidth) / 2);
        
        // 绘制文字（使用阅读器字体，段落间距与 SVG 一致）
        ctx.fillStyle = '#2c3e50';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        
        let paraGapAccumulated = 0;
        allLines.forEach((line, i) => {
            if (i > 0 && paragraphBreaks.includes(i)) {
                paraGapAccumulated += Math.floor(lineHeight * 0.5);
            }
            ctx.fillText(line, textBlockX, textStartY + i * lineHeight + paraGapAccumulated);
        });
        
        // --- 底部信息 ---
        const bottomY = h - Math.floor(h * 0.04);
        
        // 来源（左对齐，使用阅读器字体，与 SVG 一致）
        const source = this.buildSource(contentW);
        const sourceSize = Math.max(11, Math.floor(w * 0.022));
        ctx.font = `italic ${sourceSize}px ${fontStack}`;
        ctx.fillStyle = '#888';
        ctx.textAlign = 'left';
        ctx.fillText(source, padding, bottomY);
    },
    
    /**
     * 长版式 Canvas 渲染（与 SVG renderLong 逐行对照）
     */
    renderLongToCanvas(ctx, w, h, data) {
        const { paragraphs, bookInfo, palette } = data;
        const visualH = Math.floor(h * 0.30);
        const padding = Math.floor(w * 0.08);
        const fontSize = Math.max(18, Math.floor(w * 0.033));
        const fontStack = this.getCanvasFontStack();
        
        // --- 顶部图案区域（intensity=1.1，与 SVG 一致）---
        this.renderPatternArea(ctx, 0, 0, w, visualH, palette, this.currentSeed, 1.1);
        
        // --- 内容区域背景 ---
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, visualH, w, h - visualH);
        
        // --- 装饰条 ---
        ctx.fillStyle = palette.accent;
        ctx.fillRect(0, visualH, w, Math.max(4, Math.floor(h * 0.006)));
        
        // --- 呼吸间隙 ---
        const topGap = Math.floor(h * 0.06);
        const chapterGap = Math.floor(h * 0.08);
        const bottomGap = Math.floor(h * 0.10);
        
        // --- 章节标题 ---
        const hasChapter = bookInfo.chapterTitle && 
            bookInfo.chapterTitle !== bookInfo.bookTitle &&
            bookInfo.chapterTitle.length < 20;
        
        // 计算章节标题高度（与 SVG 一致）
        const chapterH = hasChapter ? Math.floor(h * 0.045) : 0;
        
        const contentW = w - padding * 2 - Math.floor(fontSize * 0.5);
        const lineHeight = Math.floor(fontSize * 1.8);
        
        // 分段和截断（与 SVG 一致，初次不考虑段落间距）
        let allLines = [];
        let paragraphBreaks = [];
        const currentY = visualH + topGap + chapterH + chapterGap;
        const maxContentH = h - currentY - bottomGap;
        let linesRemaining = Math.floor(maxContentH / lineHeight);
        
        for (let idx = 0; idx < paragraphs.length && linesRemaining > 0; idx++) {
            const para = paragraphs[idx];
            const paraLines = this.measureText(para, contentW, fontSize, fontStack)
                .filter(line => line.trim());
            if (paraLines.length === 0) continue;
            
            if (paraLines.length <= linesRemaining) {
                allLines.push(...paraLines);
                linesRemaining -= paraLines.length;
                if (idx < paragraphs.length - 1) {
                    paragraphBreaks.push(allLines.length);
                }
            } else {
                const partialLines = paraLines.slice(0, linesRemaining);
                allLines.push(...partialLines);
                const lastIdx = allLines.length - 1;
                const isCJK = /[\u4e00-\u9fa5]/.test(allLines[lastIdx]);
                allLines[lastIdx] = allLines[lastIdx].substring(0, allLines[lastIdx].length - 2) + (isCJK ? '……' : '...');
                break;
            }
        }
        
        // 保底检查：考虑段落间距后的最终截断（与 SVG 一致）
        let paraExtraH = paragraphBreaks.length * Math.floor(lineHeight * 0.5);
        let totalContentH = allLines.length * lineHeight + paraExtraH;
        
        if (totalContentH > maxContentH && allLines.length > 1) {
            const maxContentLines = Math.floor((maxContentH - paraExtraH) / lineHeight);
            allLines = allLines.slice(0, maxContentLines);
            // 只保留截断点之前的段落标记
            for (let i = paragraphBreaks.length - 1; i >= 0; i--) {
                if (paragraphBreaks[i] >= maxContentLines) {
                    paragraphBreaks.splice(i, 1);
                }
            }
            const lastIdx = allLines.length - 1;
            const isCJK = /[\u4e00-\u9fa5]/.test(allLines[lastIdx]);
            allLines[lastIdx] = allLines[lastIdx].substring(0, allLines[lastIdx].length - 2) + (isCJK ? '……' : '...');
        }
        
        // 计算文本边界（使用阅读器字体）
        ctx.font = `400 ${fontSize}px ${fontStack}`;
        const maxLineWidth = Math.max(...allLines.map(l => ctx.measureText(l).width), contentW * 0.5);
        const textLeftX = Math.floor((w - maxLineWidth) / 2);
        const textRightX = textLeftX + maxLineWidth;
        
        // --- 绘制章节标题（使用阅读器字体）---
        let renderY = visualH + topGap;
        if (hasChapter) {
            ctx.font = `600 ${Math.max(13, Math.floor(w * 0.028))}px ${fontStack}`;
            ctx.fillStyle = palette.accent;
            ctx.textAlign = 'left';
            ctx.fillText(bookInfo.chapterTitle, textLeftX, renderY);
            renderY += chapterGap;
        }
        
        // --- 绘制正文（使用阅读器字体，段落间距与 SVG 一致）---
        ctx.font = `400 ${fontSize}px ${fontStack}`;
        ctx.fillStyle = '#2c3e50';
        
        let paraGapAccumulated = 0;
        allLines.forEach((line, i) => {
            if (i > 0 && paragraphBreaks.includes(i)) {
                paraGapAccumulated += Math.floor(lineHeight * 0.5);
            }
            ctx.fillText(line, textLeftX, renderY + i * lineHeight + paraGapAccumulated);
        });
        
        // --- 底部信息 ---
        const textEndY = renderY + allLines.length * lineHeight + paragraphBreaks.length * Math.floor(lineHeight * 0.5);
        const separatorY = textEndY + Math.floor(h * 0.04);
        
        // 分隔线（左对齐）
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(textLeftX, separatorY);
        ctx.lineTo(textLeftX + Math.min(maxLineWidth, Math.floor(w * 0.15)), separatorY);
        ctx.stroke();
        
        // 来源（左对齐，使用阅读器字体，与 SVG 一致）
        const source = this.buildSource(maxLineWidth);
        ctx.font = `italic ${Math.max(11, Math.floor(w * 0.022))}px ${fontStack}`;
        ctx.fillStyle = '#888';
        ctx.fillText(source, textLeftX, separatorY + Math.floor(h * 0.035));
        
        // 品牌（右对齐，与文本右边界对齐，使用阅读器字体）
        ctx.textAlign = 'right';
        const brandSize = this.getBrandFontSize(fontSize);
        ctx.font = `${brandSize}px ${fontStack}`;
        ctx.fillStyle = palette.accent;
        ctx.globalAlpha = 0.85;
        ctx.fillText(Lumina.I18n.t('fromLuminaReader'), textRightX, h - Math.floor(h * 0.04));
        ctx.globalAlpha = 1;
    },
    
    /**
     * 导出 Canvas（跨平台）
     */
    async exportCanvas(canvas) {
        // 添加圆角效果
        const roundedCanvas = this.applyRoundedCorners(canvas, 24);
        
        const isApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();
        
        if (isApp) {
            await this.saveCanvasApp(roundedCanvas);
        } else {
            await this.saveCanvasWeb(roundedCanvas);
        }
    },
    
    // 为 Canvas 添加圆角
    applyRoundedCorners(sourceCanvas, radius) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;
        
        // 创建新 canvas
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        
        // 绘制圆角矩形路径作为裁剪区域
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(w - radius, 0);
        ctx.quadraticCurveTo(w, 0, w, radius);
        ctx.lineTo(w, h - radius);
        ctx.quadraticCurveTo(w, h, w - radius, h);
        ctx.lineTo(radius, h);
        ctx.quadraticCurveTo(0, h, 0, h - radius);
        ctx.lineTo(0, radius);
        ctx.quadraticCurveTo(0, 0, radius, 0);
        ctx.closePath();
        
        // 裁剪并绘制原图
        ctx.clip();
        ctx.drawImage(sourceCanvas, 0, 0);
        
        return canvas;
    },
    
    async saveCanvasWeb(canvas) {
        const blob = await new Promise(resolve => 
            canvas.toBlob(resolve, 'image/png', this.EXPORT_CONFIG.quality)
        );
        
        // 下载
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Lumina-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        
        // 复制到剪贴板
        if (navigator.clipboard?.write) {
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                Lumina.UI.showToast(Lumina.I18n.t('savedAndCopied'));
            } catch (e) {
                Lumina.UI.showToast(Lumina.I18n.t('savedToDownloads'));
            }
        }
    },
    
    async saveCanvasApp(canvas) {
        const t = Lumina.I18n.t;
        const { Filesystem, Share } = Capacitor.Plugins;
        const fileName = `Lumina-${Date.now()}.png`;
        
        try {
            const base64Data = canvas.toDataURL('image/png', this.EXPORT_CONFIG.quality).split(',')[1];
            
            const result = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: 'CACHE',
                recursive: true
            });
            
            await Share.share({
                title: t('shareCardTitle') || '分享书签',
                text: t('fromLuminaReader') || '来自流萤阅读器',
                url: result.uri,
                dialogTitle: t('saveToAlbumOrShare') || '保存到相册或分享'
            });
            
            // 清理缓存文件
            setTimeout(async () => {
                try {
                    await Filesystem.deleteFile({ path: fileName, directory: 'CACHE' });
                } catch (e) {}
            }, 60000);
            
        } catch (err) {
            console.error('[ShareCard] APP save failed:', err);
            Lumina.UI.showToast((t('saveFailed') || '保存失败') + ': ' + err.message);
        }
    },
    
    onSwitch() {
        this._isAnimating = true;
        this._scale = 1;
        this.cardEl.style.transition = 'transform 0.3s ease, opacity 0.2s ease';
        this.cardEl.style.transform = 'translateX(-120%) rotate(-15deg) scale(1)';
        this.cardEl.style.opacity = '0';
        
        // 等待退场动画精确完成后再生成新卡片，避免 setTimeout 与 CSS transition 竞态
        let ended = false;
        const onEnd = (e) => {
            if (ended || e.propertyName !== 'transform') return;
            ended = true;
            this.cardEl.removeEventListener('transitionend', onEnd);
            clearTimeout(fallbackTimer);
            this._isAnimating = false;
            this._scale = 1;
            this.generateCard();
        };
        this.cardEl.addEventListener('transitionend', onEnd);
        const fallbackTimer = setTimeout(() => {
            if (ended) return;
            this.cardEl.removeEventListener('transitionend', onEnd);
            this._isAnimating = false;
            this._scale = 1;
            this.generateCard();
        }, 400);
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
