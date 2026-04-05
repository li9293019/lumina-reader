/**
 * Cover Generator - 哈希封面生成器 v2.0
 * 大字报版式(typographic) + 50种图案
 * 基于 coverStudioV2.3.html 核心逻辑提取
 */

(function() {
    'use strict';

    // ========== SVGRenderer - Canvas API 到 SVG 适配器 ==========
    class SVGRenderer {
        constructor(width, height) {
            this.width = width;
            this.height = height;
            this.svgNS = "http://www.w3.org/2000/svg";
            this.elements = [];
            this.defs = [];
            this.defId = 0;
            this.currentPath = [];
            this.isPathOpen = false;
            
            this.stateStack = [];
            this.state = {
                fillStyle: '#000',
                strokeStyle: '#000',
                lineWidth: 1,
                lineCap: 'butt',
                lineJoin: 'miter',
                lineDash: null,
                globalAlpha: 1,
                font: '10px sans-serif',
                textAlign: 'start',
                textBaseline: 'alphabetic',
                transform: [1, 0, 0, 1, 0, 0]
            };
            this.clipPath = null;
        }

        save() {
            this.stateStack.push({
                ...this.state,
                transform: [...this.state.transform],
                clipPath: this.clipPath
            });
        }

        restore() {
            if (this.stateStack.length > 0) {
                const prev = this.stateStack.pop();
                this.state = { ...prev };
                this.clipPath = prev.clipPath;
            }
        }

        scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
        translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
        rotate(angle) { const cos = Math.cos(angle), sin = Math.sin(angle); this.transform(cos, sin, -sin, cos, 0, 0); }
        transform(a, b, c, d, e, f) {
            const m = this.state.transform;
            this.state.transform = [
                m[0]*a + m[2]*b, m[1]*a + m[3]*b,
                m[0]*c + m[2]*d, m[1]*c + m[3]*d,
                m[0]*e + m[2]*f + m[4], m[1]*e + m[3]*f + m[5]
            ];
        }

        beginPath() { this.currentPath = []; this.isPathOpen = false; }
        moveTo(x, y) { const t = this.state.transform; this.currentPath.push(`M ${(t[0]*x+t[2]*y+t[4]).toFixed(2)} ${(t[1]*x+t[3]*y+t[5]).toFixed(2)}`); this.isPathOpen = true; }
        lineTo(x, y) { const t = this.state.transform; this.currentPath.push(`L ${(t[0]*x+t[2]*y+t[4]).toFixed(2)} ${(t[1]*x+t[3]*y+t[5]).toFixed(2)}`); }
        
        arc(x, y, r, start, end, anticlockwise = false) {
            const t = this.state.transform;
            const scale = Math.sqrt(t[0]*t[0] + t[1]*t[1]);
            const rx = r * scale, ry = r * scale;
            const cx = t[0]*x + t[2]*y + t[4];
            const cy = t[1]*x + t[3]*y + t[5];
            const delta = Math.abs(end - start);
            if (delta >= 2 * Math.PI - 0.001) {
                const mid = start + (anticlockwise ? -Math.PI : Math.PI);
                this._addArcToPath(cx, cy, rx, ry, start, mid, anticlockwise);
                this._addArcToPath(cx, cy, rx, ry, mid, end, anticlockwise);
            } else {
                this._addArcToPath(cx, cy, rx, ry, start, end, anticlockwise);
            }
        }
        
        _addArcToPath(cx, cy, rx, ry, start, end, anticlockwise) {
            const largeArc = Math.abs(end - start) > Math.PI ? 1 : 0;
            const sweep = anticlockwise ? 0 : 1;
            const x1 = cx + rx * Math.cos(start);
            const y1 = cy + ry * Math.sin(start);
            const x2 = cx + rx * Math.cos(end);
            const y2 = cy + ry * Math.sin(end);
            if (!this.isPathOpen) {
                this.currentPath.push(`M ${x1.toFixed(2)} ${y1.toFixed(2)}`);
                this.isPathOpen = true;
            } else {
                this.currentPath.push(`L ${x1.toFixed(2)} ${y1.toFixed(2)}`);
            }
            this.currentPath.push(`A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 ${largeArc} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`);
        }

        rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x+w, y); this.lineTo(x+w, y+h); this.lineTo(x, y+h); this.closePath(); }
        quadraticCurveTo(cpx, cpy, x, y) { 
            const t = this.state.transform; 
            this.currentPath.push(`Q ${(t[0]*cpx+t[2]*cpy+t[4]).toFixed(2)} ${(t[1]*cpx+t[3]*cpy+t[5]).toFixed(2)} ${(t[0]*x+t[2]*y+t[4]).toFixed(2)} ${(t[1]*x+t[3]*y+t[5]).toFixed(2)}`); 
        }
        
        bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
            const t = this.state.transform;
            const nc1x = t[0]*cp1x + t[2]*cp1y + t[4];
            const nc1y = t[1]*cp1x + t[3]*cp1y + t[5];
            const nc2x = t[0]*cp2x + t[2]*cp2y + t[4];
            const nc2y = t[1]*cp2x + t[3]*cp2y + t[5];
            const nx = t[0]*x + t[2]*y + t[4];
            const ny = t[1]*x + t[3]*y + t[5];
            this.currentPath.push(`C ${nc1x.toFixed(2)} ${nc1y.toFixed(2)} ${nc2x.toFixed(2)} ${nc2y.toFixed(2)} ${nx.toFixed(2)} ${ny.toFixed(2)}`);
        }
        closePath() { this.currentPath.push('Z'); }
        
        fill() {
            if (this.currentPath.length === 0) return;
            const d = this.currentPath.join(' ');
            const fill = this.state.fillStyle;
            const opacity = this.state.globalAlpha;
            const clip = this.clipPath ? `clip-path="url(#${this.clipPath})"` : '';
            this.elements.push(`<path d="${d}" fill="${fill}" fill-opacity="${opacity}" stroke="none" ${clip}/>`);
        }
        
        stroke() {
            if (this.currentPath.length === 0) return;
            const d = this.currentPath.join(' ');
            const stroke = this.state.strokeStyle;
            const width = this.state.lineWidth;
            const opacity = this.state.globalAlpha;
            const cap = this.state.lineCap;
            const join = this.state.lineJoin;
            const clip = this.clipPath ? `clip-path="url(#${this.clipPath})"` : '';
            const dashAttr = this.state.lineDash ? `stroke-dasharray="${this.state.lineDash.join(',')}"` : '';
            this.elements.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="${cap}" stroke-linejoin="${join}" ${dashAttr} ${clip}/>`);
        }

        fillRect(x, y, w, h) {
            const t = this.state.transform;
            const nx = t[0]*x + t[2]*y + t[4];
            const ny = t[1]*x + t[3]*y + t[5];
            const nw = Math.abs(t[0]*w + t[2]*h);
            const nh = Math.abs(t[1]*w + t[3]*h);
            const fill = this.state.fillStyle;
            const opacity = this.state.globalAlpha;
            const clip = this.clipPath ? `clip-path="url(#${this.clipPath})"` : '';
            this.elements.push(`<rect x="${nx.toFixed(2)}" y="${ny.toFixed(2)}" width="${nw.toFixed(2)}" height="${nh.toFixed(2)}" fill="${fill}" fill-opacity="${opacity}" ${clip}/>`);
        }

        strokeRect(x, y, w, h) {
            this.beginPath();
            this.moveTo(x, y); this.lineTo(x+w, y); this.lineTo(x+w, y+h); this.lineTo(x, y+h);
            this.closePath(); this.stroke();
        }

        fillText(text, x, y) {
            const t = this.state.transform;
            const nx = t[0]*x + t[2]*y + t[4];
            const ny = t[1]*x + t[3]*y + t[5];
            const font = this.parseFont(this.state.font);
            const fill = this.state.fillStyle;
            const opacity = this.state.globalAlpha;
            const anchor = this.state.textAlign === 'center' ? 'middle' : this.state.textAlign === 'right' ? 'end' : 'start';
            const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const clip = this.clipPath ? `clip-path="url(#${this.clipPath})"` : '';
            // 关键修复：font-family 使用单引号包裹，避免与内部双引号冲突
            this.elements.push(`<text x="${nx.toFixed(2)}" y="${ny.toFixed(2)}" font-family='${font.family}' font-size="${font.size}" font-weight="${font.weight}" fill="${fill}" fill-opacity="${opacity}" text-anchor="${anchor}" dominant-baseline="alphabetic" ${clip}>${safeText}</text>`);
        }

        clip() {
            if (this.currentPath.length > 0) {
                const id = `clip-${++this.defId}`;
                const d = this.currentPath.join(' ');
                this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
                this.clipPath = id;
            }
        }

        parseFont(fontString) {
            const weightMatch = fontString.match(/\b(bold|700|600|500|400|300)\b/i);
            const weight = weightMatch ? weightMatch[1].replace(/bold/i, '700') : '400';
            const sizeMatch = fontString.match(/(\d+(?:\.\d+)?)\s*(px|pt|em|rem)/i);
            const size = sizeMatch ? sizeMatch[1] + 'px' : '16px';
            
            // 提取字体家族部分
            let familyPart = fontString
                .replace(/\d+(?:\.\d+)?\s*(px|pt|em|rem)/gi, '')
                .replace(/\b(bold|700|600|500|400|300|lighter|bolder|normal)\b/gi, '')
                .replace(/\b(italic|oblique)\b/gi, '')
                .trim();
            
            // 处理字体栈：分割、清理、为含空格的字体名添加引号
            if (!familyPart) {
                familyPart = 'sans-serif';
            } else {
                const fonts = familyPart.split(',').map(f => {
                    const trimmed = f.trim();
                    // 如果字体名包含空格且未被引号包裹，添加引号
                    if (trimmed.includes(' ') && !(/^['"].*['"]$/).test(trimmed)) {
                        return `"${trimmed}"`;
                    }
                    return trimmed;
                });
                familyPart = fonts.join(', ');
            }
            
            return { weight, size, family: familyPart };
        }

        measureText(text) {
            if (!this._measureCanvas) {
                this._measureCanvas = document.createElement('canvas');
                this._measureCtx = this._measureCanvas.getContext('2d');
            }
            this._measureCtx.font = this.state.font;
            return this._measureCtx.measureText(text);
        }

        set fillStyle(val) { this.state.fillStyle = val; }
        get fillStyle() { return this.state.fillStyle; }
        set strokeStyle(val) { this.state.strokeStyle = val; }
        get strokeStyle() { return this.state.strokeStyle; }
        set lineWidth(val) { this.state.lineWidth = val; }
        set lineCap(val) { this.state.lineCap = val; }
        set lineJoin(val) { this.state.lineJoin = val; }
        set globalAlpha(val) { this.state.globalAlpha = val; }
        set font(val) { this.state.font = val; if (this._measureCtx) this._measureCtx.font = val; }
        get font() { return this.state.font; }
        set textAlign(val) { this.state.textAlign = val; }
        set textBaseline(val) { this.state.textBaseline = val; }

        getSVG(bgColor, asHTML = false) {
            const defs = this.defs.length > 0 ? `<defs>${this.defs.join('')}</defs>` : '';
            const background = bgColor || '#2a2a2a';
            // asHTML 模式：使用 100% 宽高 + preserveAspectRatio 模拟 object-fit: cover
            // Data URL 模式：使用固定宽高
            const width = asHTML ? '100%' : this.width;
            const height = asHTML ? '100%' : this.height;
            const preserveAspectRatio = asHTML ? ' preserveAspectRatio="xMidYMid slice"' : '';
            return `<?xml version="1.0" encoding="UTF-8"?>\n<svg width="${width}" height="${height}" viewBox="0 0 ${this.width} ${this.height}"${preserveAspectRatio} xmlns="${this.svgNS}" style="background-color:${background}">\n    ${defs}\n    ${this.elements.join('')}\n</svg>`;
        }

        getDataURL(bgColor) {
            const svg = this.getSVG(bgColor);
            return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
        }
    }

    // ========== CoverCore 核心引擎 ==========
    const CoverCore = (function() {
        const CONFIG = {
            baseWidth: 500,
            baseHeight: 710,
            minFontSize: 9,
            maxFontSize: 56,
            lineHeightRatio: 1.35,
            titleAuthorGapRatio: 0.45,
            maxRecursionDepth: 5
        };

        const PATTERNS = [
            { code: 'lines', name: { 'zh-CN': '流动线条', 'en': 'Flow Lines' }},
            { code: 'rings', name: { 'zh-CN': '同心圆', 'en': 'Concentric' }},
            { code: 'grid', name: { 'zh-CN': '精密网格', 'en': 'Precision Grid' }},
            { code: 'waves', name: { 'zh-CN': '正弦波浪', 'en': 'Sine Waves' }},
            { code: 'cells', name: { 'zh-CN': '有机细胞', 'en': 'Organic Cells' }},
            { code: 'radial', name: { 'zh-CN': '放射星光', 'en': 'Radial Star' }},
            { code: 'blocks', name: { 'zh-CN': '黄金分割', 'en': 'Golden Blocks' }},
            { code: 'tree', name: { 'zh-CN': '分形树枝', 'en': 'Fractal Tree' }},
            { code: 'flow', name: { 'zh-CN': '流场轨迹', 'en': 'Flow Field' }},
            { code: 'arcs', name: { 'zh-CN': '几何圆弧', 'en': 'Geometric Arcs' }},
            { code: 'moire', name: { 'zh-CN': '摩尔波纹', 'en': 'Moire' }},
            { code: 'voronoi', name: { 'zh-CN': '泰森多边形', 'en': 'Voronoi' }},
            { code: 'terrain', name: { 'zh-CN': '地形等高', 'en': 'Topographic' }},
            { code: 'spiral', name: { 'zh-CN': '对数螺旋', 'en': 'Log Spiral' }},
            { code: 'rays', name: { 'zh-CN': '光束射线', 'en': 'Light Rays' }},
            { code: 'dots', name: { 'zh-CN': '波点矩阵', 'en': 'Dot Matrix' }},
            { code: 'overlap', name: { 'zh-CN': '叠印圆圈', 'en': 'Overlapping' }},
            { code: 'maze', name: { 'zh-CN': '迷宫路径', 'en': 'Labyrinth' }},
            { code: 'crystal', name: { 'zh-CN': '晶体结构', 'en': 'Crystal' }},
            { code: 'spectrum', name: { 'zh-CN': '频谱柱状', 'en': 'Spectrum' }},
            { code: 'gravity', name: { 'zh-CN': '引力透镜', 'en': 'Gravity' }},
            { code: 'weave', name: { 'zh-CN': '纺织纹理', 'en': 'Textile' }},
            { code: 'ripple', name: { 'zh-CN': '水波涟漪', 'en': 'Ripples' }},
            { code: 'trails', name: { 'zh-CN': '粒子轨迹', 'en': 'Trails' }},
            { code: 'constellation', name: { 'zh-CN': '星座连线', 'en': 'Constellation' }},
            { code: 'paperplane', name: { 'zh-CN': '纸飞机群', 'en': 'Paper Planes' }},
            { code: 'rain', name: { 'zh-CN': '雨滴下落', 'en': 'Rain Drops' }},
            { code: 'circuit', name: { 'zh-CN': '电路板纹', 'en': 'Circuit' }},
            { code: 'glitch', name: { 'zh-CN': '故障艺术', 'en': 'Glitch' }},
            { code: 'perforation', name: { 'zh-CN': '邮票齿孔', 'en': 'Perforation' }},
            { code: 'origami', name: { 'zh-CN': '折纸褶皱', 'en': 'Origami' }},
            { code: 'soundwave', name: { 'zh-CN': '声波震动', 'en': 'Sound Wave' }},
            { code: 'fibonacci', name: { 'zh-CN': '斐波那契螺旋', 'en': 'Fibonacci' }},
            { code: 'cardioid', name: { 'zh-CN': '心形线', 'en': 'Cardioid' }},
            { code: 'rose', name: { 'zh-CN': '玫瑰花瓣', 'en': 'Rose Curve' }},
            { code: 'lissajous', name: { 'zh-CN': '利萨茹曲线', 'en': 'Lissajous' }},
            { code: 'mandala', name: { 'zh-CN': '曼陀罗几何', 'en': 'Mandala' }},
            { code: 'phyllotaxis', name: { 'zh-CN': '叶序螺旋', 'en': 'Phyllotaxis' }},
            { code: 'superellipse', name: { 'zh-CN': '超椭圆', 'en': 'Superellipse' }},
            { code: 'tessellation', name: { 'zh-CN': '密铺镶嵌', 'en': 'Tessellation' }},
            { code: 'halftone', name: { 'zh-CN': '半调网点', 'en': 'Halftone' }},
            { code: 'kintsugi', name: { 'zh-CN': '金缮裂纹', 'en': 'Kintsugi' }},
            { code: 'contour', name: { 'zh-CN': '等高线', 'en': 'Contour' }},
            { code: 'noiseField', name: { 'zh-CN': '数字噪点', 'en': 'Noise' }},
            { code: 'stringArt', name: { 'zh-CN': '线绕艺术', 'en': 'String Art' }},
            { code: 'isometric', name: { 'zh-CN': '等距网格', 'en': 'Isometric' }},
            { code: 'turing', name: { 'zh-CN': '反应扩散', 'en': 'Turing Patterns' }},
            { code: 'dendrite', name: { 'zh-CN': '枝晶生长', 'en': 'Dendrite' }},
            { code: 'droste', name: { 'zh-CN': '递归画框', 'en': 'Droste Effect' }},
            { code: 'inkBleed', name: { 'zh-CN': '水墨晕染', 'en': 'Ink Bleed' }},
            { code: 'snowflake', name: { 'zh-CN': '雪花冰晶', 'en': 'Snowflake' }}
        ];

        function djb2(str) { let hash = 5381; for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) + str.charCodeAt(i); return Math.abs(hash); }
        function extractParams(seed, count = 40) { const params = []; let n = seed; for (let i = 0; i < count; i++) { params.push((n % 997) / 997); n = Math.floor(n / 31); if (n === 0) n = seed + (i + 1) * 17; } return params; }
        
        const PALETTE_STRATEGIES = ['monochrome', 'complementary', 'analogous', 'triadic', 'split'];

        function generatePalette(seed, mode) {
            const p = extractParams(seed, 10);
            const baseHue = p[0] * 360;
            // auto 模式：根据 hash 自动选择配色策略
            let strategy = mode === 'auto' ? PALETTE_STRATEGIES[Math.floor(p[1] * PALETTE_STRATEGIES.length)] : mode;
            
            const palettes = {
                monochrome: {
                    bg: `hsl(${baseHue}, 20%, 8%)`,
                    pattern: `hsl(${baseHue}, 30%, 18%)`,
                    accent: `hsl(${baseHue}, 60%, 55%)`,
                    textBg: `hsl(${baseHue}, 10%, 96%)`,
                    text: `hsl(${baseHue}, 40%, 12%)`
                },
                complementary: {
                    bg: `hsl(${baseHue}, 25%, 10%)`,
                    pattern: `hsl(${(baseHue + 180) % 360}, 35%, 20%)`,
                    accent: `hsl(${baseHue}, 70%, 60%)`,
                    textBg: `hsl(${(baseHue + 180) % 360}, 15%, 95%)`,
                    text: `hsl(${baseHue}, 50%, 12%)`
                },
                analogous: {
                    bg: `hsl(${baseHue}, 20%, 9%)`,
                    pattern: `hsl(${(baseHue + 30) % 360}, 30%, 18%)`,
                    accent: `hsl(${(baseHue - 30 + 360) % 360}, 65%, 58%)`,
                    textBg: `hsl(${baseHue}, 12%, 96%)`,
                    text: `hsl(${baseHue}, 35%, 15%)`
                },
                triadic: {
                    bg: `hsl(${baseHue}, 25%, 8%)`,
                    pattern: `hsl(${(baseHue + 120) % 360}, 30%, 22%)`,
                    accent: `hsl(${(baseHue + 240) % 360}, 70%, 55%)`,
                    textBg: `hsl(${baseHue}, 10%, 95%)`,
                    text: `hsl(${baseHue}, 40%, 12%)`
                },
                split: {
                    bg: `hsl(${baseHue}, 22%, 9%)`,
                    pattern: `hsl(${(baseHue + 150) % 360}, 32%, 19%)`,
                    accent: `hsl(${(baseHue + 210) % 360}, 65%, 60%)`,
                    textBg: `hsl(${baseHue}, 8%, 96%)`,
                    text: `hsl(${baseHue}, 45%, 10%)`
                }
            };
            
            return { ...palettes[strategy], strategy };
        }

        // 智能换行：CJK字符级，英文单词级，平衡最后一行
        function smartWrap(text, maxWidth, maxLines, ctx, isCJK) {
            if (isCJK) {
                // 中文：字符级换行
                const chars = text.split('');
                const lines = [];
                let currentLine = '';
                
                for (let i = 0; i < chars.length; i++) {
                    const testLine = currentLine + chars[i];
                    const metrics = ctx.measureText(testLine);
                    
                    if (metrics.width > maxWidth && currentLine.length > 0) {
                        lines.push(currentLine);
                        currentLine = chars[i];
                        if (lines.length >= maxLines - 1) {
                            // 最后一行，加入剩余所有字符
                            currentLine += chars.slice(i + 1).join('');
                            break;
                        }
                    } else {
                        currentLine = testLine;
                    }
                }
                
                if (currentLine) lines.push(currentLine);
                
                // 平衡最后一行：如果少于3个字，从上一行借字
                if (lines.length >= 2) {
                    const lastIdx = lines.length - 1;
                    const prevIdx = lines.length - 2;
                    
                    if (lines[lastIdx].length < 3 && lines[prevIdx].length > 4) {
                        const need = 3 - lines[lastIdx].length;
                        const borrow = Math.min(need, Math.floor((lines[prevIdx].length - 3) / 2));
                        if (borrow > 0) {
                            lines[lastIdx] = lines[prevIdx].slice(-borrow) + lines[lastIdx];
                            lines[prevIdx] = lines[prevIdx].slice(0, -borrow);
                        }
                    }
                    
                    // 如果最后一行还是太短，加省略号
                    if (lines[lastIdx].length < 2 && text.length > lines.join('').length) {
                        lines[lastIdx] = lines[lastIdx] + '...';
                    }
                }
                
                return lines;
            } else {
                // 英文：单词级换行
                const words = text.split(/\s+/);
                const lines = [];
                let currentLine = '';
                
                for (let i = 0; i < words.length; i++) {
                    const word = words[i];
                    const testLine = currentLine ? currentLine + ' ' + word : word;
                    const metrics = ctx.measureText(testLine);
                    
                    if (metrics.width > maxWidth && currentLine) {
                        lines.push(currentLine);
                        currentLine = word;
                        if (lines.length >= maxLines - 1) {
                            // 最后一行，加入剩余所有单词
                            currentLine += ' ' + words.slice(i + 1).join(' ');
                            break;
                        }
                    } else {
                        currentLine = testLine;
                    }
                }
                
                if (currentLine) lines.push(currentLine);
                return lines;
            }
        }

        // 计算文字排版指标：大字报风格，宽度65%，垂直居中
        function calculateTextMetrics(ctx, title, author, availableWidth, availableHeight, scaleFactor, fontStack) {
            const isCJK = /[\u4e00-\u9fa5]/.test(title);
            
            // 固定字号：中文46px，英文42px（基准）
            const baseTitleSize = isCJK ? 46 : 42;
            const titleSize = Math.floor(baseTitleSize * scaleFactor);
            
            // 作者字号为标题的52%，最小18px
            const authorSize = Math.max(Math.floor(18 * scaleFactor), Math.floor(titleSize * 0.52));
            
            // 行高和间距
            const lineHeight = titleSize * 1.2;  // 行高系数1.2
            const gap = titleSize * 0.45;         // 标题作者间距
            
            // 最大宽度：封面的65%
            const maxTextWidth = availableWidth * 0.65;
            const maxLines = 4;  // 最多4行
            
            ctx.font = `700 ${titleSize}px ${fontStack}`;
            const titleLines = smartWrap(title, maxTextWidth, maxLines, ctx, isCJK);
            
            const titleHeight = titleLines.length * lineHeight;
            const totalHeight = titleHeight + gap + authorSize;
            
            return {
                titleSize,
                authorSize,
                lineHeight,
                gap,
                titleLines,
                titleHeight,
                totalHeight,
                maxTextWidth,
                isCJK
            };
        }

        // 绘制文字块：大字报风格，垂直居中，宽度65%
        function drawTextBlock(ctx, title, author, areaX, areaY, areaW, areaH, scaleFactor, color, fontStack) {
            ctx.save();
            
            // 计算排版指标
            const metrics = calculateTextMetrics(ctx, title, author, areaW, areaH, scaleFactor, fontStack);
            
            // 垂直居中计算
            const centerY = areaY + areaH / 2;
            const contentTop = centerY - metrics.totalHeight / 2;
            const firstLineY = contentTop + metrics.titleSize * 0.85;  // 基线偏移
            const startX = areaX + areaW / 2;  // 水平居中
            
            // 绘制标题
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = color;
            ctx.font = `700 ${metrics.titleSize}px ${fontStack}`;
            
            metrics.titleLines.forEach((line, i) => {
                ctx.fillText(line, startX, firstLineY + i * metrics.lineHeight);
            });
            
            // 处理作者：空作者显示"佚名"
            let normalizedAuthor = (author || '').trim();
            if (!normalizedAuthor || normalizedAuthor.toLowerCase() === 'unknown') {
                normalizedAuthor = '佚名';
            }
            
            // 绘制作者
            ctx.font = `400 ${metrics.authorSize}px ${fontStack}`;
            ctx.globalAlpha = 0.85;
            ctx.fillText(normalizedAuthor, startX, firstLineY + metrics.titleHeight + metrics.gap);
            
            ctx.restore();
        }

        function drawPatternArea(ctx, x, y, w, h, seed, palette, patternId, density) {
            // 填充背景色
            ctx.save();
            ctx.fillStyle = palette.pattern;
            ctx.fillRect(x, y, w, h);
            
            // 绘制图案
            ctx.strokeStyle = palette.accent;
            ctx.fillStyle = palette.accent;
            
            const p = extractParams(seed, 40);
            const pattern = PATTERNS[patternId] || PATTERNS[0];
            const drawer = PatternDrawers[pattern.code];
            if (drawer) drawer(ctx, w, h, p, density);
            ctx.restore();
        }

        // 50种图案绘制器
        const PatternDrawers = {
            lines(ctx, w, h, p, density) {
                const count = Math.floor((20 + p[0] * 30) * density);
                ctx.lineCap = 'round';
                for (let i = 0; i < count; i++) {
                    ctx.lineWidth = 0.5 + (i % 5) * 0.8;
                    ctx.globalAlpha = 0.1 + (i / count) * 0.3;
                    ctx.beginPath();
                    const y = h * (i / count);
                    const wave = Math.sin(i * 0.5) * 20;
                    ctx.moveTo(0, y);
                    ctx.bezierCurveTo(w/3, y + wave, w*2/3, y - wave, w, y + (p[i % 40] - 0.5) * 30);
                    ctx.stroke();
                }
            },
            
            rings(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const maxR = Math.min(w, h) * 0.48;
                const count = Math.floor((20 + p[1] * 25) * density);
                for (let i = 0; i < count; i++) {
                    ctx.lineWidth = (i % 4 === 0) ? 2 : 0.5;
                    ctx.globalAlpha = 0.08 + Math.sin(i * 0.4) * 0.08;
                    ctx.beginPath();
                    const r = maxR * Math.pow(i / count, 0.7);
                    ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2);
                    ctx.stroke();
                }
            },
            
            grid(ctx, w, h, p, density) {
                const cols = Math.floor((8 + p[2] * 12) * Math.sqrt(density));
                const rows = Math.floor((10 + p[3] * 14) * Math.sqrt(density));
                const cw = w / cols, rh = h / rows;
                ctx.lineWidth = 0.4;
                ctx.globalAlpha = 0.25;
                for (let i = 0; i <= cols; i++) {
                    ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, h); ctx.stroke();
                }
                for (let j = 0; j <= rows; j++) {
                    ctx.beginPath(); ctx.moveTo(0, j * rh); ctx.lineTo(w, j * rh); ctx.stroke();
                }
            },

            waves(ctx, w, h, p, density) {
                const lines = Math.floor((30 + p[0] * 40) * density);
                ctx.lineWidth = 1;
                for (let i = 0; i < lines; i++) {
                    ctx.globalAlpha = 0.18 + (i / lines) * 0.12;
                    const y = (h / lines) * i;
                    const phase = i * 0.3;
                    ctx.beginPath();
                    for (let x = 0; x <= w; x += 2) {
                        const yOffset = Math.sin(x * 0.01 + phase) * 8 + Math.sin(x * 0.02) * 4;
                        if (x === 0) ctx.moveTo(x, y + yOffset); else ctx.lineTo(x, y + yOffset);
                    }
                    ctx.stroke();
                }
            },

            cells(ctx, w, h, p, density) {
                const cellCount = Math.floor((50 + p[0] * 50) * density);
                const cells = [];
                for (let i = 0; i < cellCount; i++) {
                    cells.push({x: p[i % 40] * w, y: p[(i + 10) % 40] * h, r: 5 + p[(i + 20) % 40] * 30});
                }
                ctx.globalAlpha = 0.15;
                cells.forEach((cell, i) => {
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.arc(cell.x, cell.y, cell.r, 0, Math.PI * 2); ctx.stroke();
                    cells.slice(i + 1, i + 8).forEach(other => {
                        const dist = Math.hypot(cell.x - other.x, cell.y - other.y);
                        if (dist < 60 * density && (i + Math.floor(dist)) % 3 === 0) {
                            ctx.lineWidth = 0.5; ctx.globalAlpha = 0.06;
                            ctx.beginPath(); ctx.moveTo(cell.x, cell.y); ctx.lineTo(other.x, other.y); ctx.stroke();
                            ctx.globalAlpha = 0.15;
                        }
                    });
                });
            },

            radial(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const arms = Math.floor((12 + p[0] * 8) * Math.sqrt(density));
                const layers = Math.floor((5 + p[1] * 5) * Math.sqrt(density));
                for (let layer = 0; layer < layers; layer++) {
                    const dist = (Math.min(w, h) * 0.42) * ((layer + 1) / layers);
                    for (let i = 0; i < arms; i++) {
                        const angle = (Math.PI * 2 * i) / arms + layer * 0.1;
                        const x = cx + Math.cos(angle) * dist;
                        const y = cy + Math.sin(angle) * dist;
                        ctx.globalAlpha = 0.25 * (1 - layer * 0.2);
                        ctx.beginPath(); ctx.arc(x, y, 3 + (layers - layer), 0, Math.PI * 2); ctx.fill();
                        if (i % 2 === 0) {
                            ctx.lineWidth = 0.5; ctx.globalAlpha = 0.1;
                            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
                        }
                    }
                }
            },

            blocks(ctx, w, h, p, density) {
                const phi = 0.618;
                const blocks = [
                    {x: 0, y: 0, w: phi, h: phi},
                    {x: phi, y: 0, w: 1-phi, h: phi},
                    {x: phi, y: phi, w: 1-phi, h: 1-phi},
                    {x: 0, y: phi, w: phi, h: 1-phi}
                ];
                blocks.forEach((blk, i) => {
                    const bx = blk.x * w, by = blk.y * h, bw = blk.w * w, bh = blk.h * h;
                    if ((i + Math.floor(p[2] * 10)) % 2 === 0) {
                        ctx.globalAlpha = 0.12; ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
                    }
                    ctx.lineWidth = 1.5; ctx.globalAlpha = 0.3; ctx.strokeRect(bx, by, bw, bh);
                });
            },

            tree(ctx, w, h, p, density) {
                const drawBranch = (x, y, angle, len, depth) => {
                    if (depth <= 0 || len < 2) return;
                    const endX = x + Math.cos(angle) * len;
                    const endY = y + Math.sin(angle) * len;
                    ctx.lineWidth = depth * 0.8; ctx.globalAlpha = 0.1 + depth * 0.04;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke();
                    const spread = 0.4 + p[depth % 40] * 0.3;
                    drawBranch(endX, endY, angle - spread, len * 0.7, depth - 1);
                    drawBranch(endX, endY, angle + spread, len * 0.7, depth - 1);
                };
                const roots = Math.floor((3 + p[0] * 4) * Math.sqrt(density));
                for (let i = 0; i < roots; i++) {
                    const x = w * (0.1 + 0.8 * (i / (roots - 1 || 1)));
                    drawBranch(x, h * 0.95, -Math.PI / 2 + (p[i % 40] - 0.5) * 0.5, h * 0.25, 7);
                }
            },

            flow(ctx, w, h, p, density) {
                const particles = Math.floor((80 + p[0] * 60) * density);
                ctx.lineWidth = 0.8;
                for (let i = 0; i < particles; i++) {
                    let x = p[i % 40] * w, y = p[(i + 15) % 40] * h;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.globalAlpha = 0.15;
                    for (let j = 0; j < 30; j++) {
                        const angle = (Math.sin(x * 0.005) + Math.cos(y * 0.005)) * Math.PI * 2 + p[20];
                        x += Math.cos(angle) * 5; y += Math.sin(angle) * 5;
                        ctx.lineTo(x, y);
                        if (x < 0 || x > w || y < 0 || y > h) break;
                    }
                    ctx.stroke();
                }
            },

            arcs(ctx, w, h, p, density) {
                const count = Math.floor((15 + p[0] * 20) * density);
                for (let i = 0; i < count; i++) {
                    const cx = p[i % 40] * w, cy = p[(i + 10) % 40] * h;
                    const r = 20 + p[(i + 20) % 40] * 80;
                    ctx.lineWidth = 1.5; ctx.globalAlpha = 0.12;
                    for (let j = 0; j < 3; j++) {
                        const start = j * Math.PI * 2 / 3 + i * 0.2;
                        ctx.beginPath(); ctx.arc(cx, cy, r, start, start + Math.PI * 1.5); ctx.stroke();
                    }
                }
            },

            moire(ctx, w, h, p, density) {
                const count = Math.floor((25 + p[0] * 20) * density);
                const amplitude = 3 + p[1] * 5, frequency = 0.02 + p[2] * 0.02;
                ctx.lineWidth = 0.8;
                for (let i = 0; i <= count; i++) {
                    const x = (w / count) * i; ctx.globalAlpha = 0.12; ctx.beginPath();
                    for (let y = 0; y <= h; y += 4) {
                        const xOffset = Math.sin(y * frequency + i * 0.5) * amplitude * (i % 3 === 0 ? 1.5 : 0.5);
                        if (y === 0) ctx.moveTo(x + xOffset, y); else ctx.lineTo(x + xOffset, y);
                    }
                    ctx.stroke();
                }
                for (let i = 0; i <= count; i++) {
                    const y = (h / count) * i; ctx.globalAlpha = 0.12; ctx.beginPath();
                    for (let x = 0; x <= w; x += 4) {
                        const yOffset = Math.sin(x * frequency + i * 0.5) * amplitude * (i % 3 === 0 ? 1.5 : 0.5);
                        if (x === 0) ctx.moveTo(x, y + yOffset); else ctx.lineTo(x, y + yOffset);
                    }
                    ctx.stroke();
                }
            },

            voronoi(ctx, w, h, p, density) {
                const points = Math.floor((25 + p[0] * 20) * density);
                const seeds = [];
                for (let i = 0; i < points; i++) seeds.push({x: p[i % 40] * w, y: p[(i + 20) % 40] * h});
                ctx.lineWidth = 0.8;
                seeds.forEach((seed, i) => {
                    const neighbors = seeds.map((s, j) => ({dist: Math.hypot(s.x - seed.x, s.y - seed.y), idx: j}))
                        .filter(n => n.dist > 0 && n.dist < 70 * density).sort((a, b) => a.dist - b.dist).slice(0, 3);
                    ctx.globalAlpha = 0.15;
                    neighbors.forEach(n => { ctx.beginPath(); ctx.moveTo(seed.x, seed.y); ctx.lineTo(seeds[n.idx].x, seeds[n.idx].y); ctx.stroke(); });
                    ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(seed.x, seed.y, 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
                });
            },

            terrain(ctx, w, h, p, density) {
                const lines = Math.floor((25 + p[0] * 20) * density);
                const scale = 0.008 + p[1] * 0.015;
                for (let y = 0; y < lines; y++) {
                    const baseY = (h / lines) * y; ctx.beginPath(); ctx.globalAlpha = 0.2; ctx.lineWidth = 1;
                    for (let x = 0; x <= w; x += 2) {
                        const elevation = Math.sin(x * scale + y * 0.5) * 10 + Math.sin(x * scale * 2.2) * 5 + Math.sin(x * scale * 4.5) * 2;
                        if (x === 0) ctx.moveTo(x, baseY + elevation); else ctx.lineTo(x, baseY + elevation);
                    }
                    ctx.stroke();
                }
            },

            spiral(ctx, w, h, p, density) {
                const arms = Math.floor((3 + p[0] * 4) * Math.sqrt(density));
                const particles = Math.floor((60 + p[1] * 40) * density);
                const cx = w/2, cy = h/2;
                for (let arm = 0; arm < arms; arm++) {
                    const armAngle = (Math.PI * 2 * arm) / arms;
                    for (let i = 0; i < particles; i++) {
                        const t = i / particles, angle = armAngle + t * Math.PI * 8;
                        const r = t * Math.min(w, h) * 0.45;
                        ctx.globalAlpha = 0.25 * (1 - t);
                        ctx.beginPath(); ctx.arc(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, (1 - t) * 3 + 0.5, 0, Math.PI * 2); ctx.fill();
                    }
                }
            },

            rays(ctx, w, h, p, density) {
                const rays = Math.floor((20 + p[0] * 15) * density);
                const cx = p[1] * w, cy = p[2] * h;
                for (let i = 0; i < rays; i++) {
                    const angle = (Math.PI * 2 * i) / rays + p[3];
                    const len = Math.max(w, h) * 1.2; ctx.globalAlpha = 0.3; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(cx, cy);
                    let curX = cx, curY = cy;
                    for (let j = 1; j <= 4; j++) {
                        const segLen = (len / 4) * j;
                        const tx = cx + Math.cos(angle) * segLen, ty = cy + Math.sin(angle) * segLen;
                        curX = tx + (p[(i + j) % 40] - 0.5) * 20 * (j / 4);
                        curY = ty + (p[(i + j + 10) % 40] - 0.5) * 20 * (j / 4);
                        ctx.lineTo(curX, curY);
                    }
                    ctx.stroke(); ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(curX, curY, 2, 0, Math.PI * 2); ctx.fill();
                }
            },

            dots(ctx, w, h, p, density) {
                const cols = Math.floor((15 + p[0] * 10) * Math.sqrt(density));
                const rows = Math.floor((20 + p[1] * 10) * Math.sqrt(density));
                const spacingX = w / cols, spacingY = h / rows;
                ctx.fillStyle = ctx.strokeStyle;
                for (let i = 0; i < cols; i++) {
                    for (let j = 0; j < rows; j++) {
                        const x = i * spacingX + spacingX/2, y = j * spacingY + spacingY/2;
                        const size = (Math.sin(i * 0.6) + Math.cos(j * 0.4) + 2) * 1.5 + p[2];
                        ctx.globalAlpha = 0.12 + (Math.sin(i * 0.8 + j * 0.6) + 1) * 0.1;
                        ctx.beginPath(); ctx.arc(x, y, Math.max(1, size), 0, Math.PI * 2); ctx.fill();
                    }
                }
            },

            overlap(ctx, w, h, p, density) {
                const count = Math.floor((10 + p[0] * 8) * density);
                const baseR = Math.min(w, h) * 0.2;
                for (let i = 0; i < count; i++) {
                    const angle = (Math.PI * 2 * i) / count;
                    const cx = w/2 + Math.cos(angle) * baseR * 0.5;
                    const cy = h/2 + Math.sin(angle) * baseR * 0.5;
                    const r = baseR * (0.9 + p[i % 40] * 0.5);
                    ctx.lineWidth = 1.5; ctx.globalAlpha = 0.12;
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
                    if (i % 3 === 0) { ctx.globalAlpha = 0.2; ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.stroke(); }
                }
                ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(w/2, h/2, baseR * 0.15, 0, Math.PI * 2); ctx.fill();
            },

            maze(ctx, w, h, p, density) {
                const cols = Math.floor((10 + p[0] * 8) * Math.sqrt(density));
                const rows = Math.floor((14 + p[1] * 8) * Math.sqrt(density));
                const cw = w / cols, rh = h / rows;
                ctx.lineWidth = 2; ctx.lineCap = 'square';
                for (let i = 0; i < cols; i++) {
                    for (let j = 0; j < rows; j++) {
                        if (((i * 7 + j * 13 + Math.floor(p[2] * 100)) % 5) < 3) {
                            ctx.globalAlpha = 0.15;
                            if ((i + j) % 2 === 0) { ctx.beginPath(); ctx.moveTo((i + 1) * cw, j * rh); ctx.lineTo((i + 1) * cw, (j + 1) * rh); ctx.stroke(); }
                            else { ctx.beginPath(); ctx.moveTo(i * cw, (j + 1) * rh); ctx.lineTo((i + 1) * cw, (j + 1) * rh); ctx.stroke(); }
                        }
                    }
                }
            },

            crystal(ctx, w, h, p, density) {
                const cells = Math.floor((8 + p[0] * 6) * Math.sqrt(density));
                for (let i = 0; i < cells; i++) {
                    const x = p[i % 40] * w, y = p[(i + 15) % 40] * h, size = 25 + p[(i + 30) % 40] * 60;
                    ctx.globalAlpha = 0.12; ctx.lineWidth = 1; ctx.beginPath();
                    ctx.moveTo(x, y - size); ctx.lineTo(x + size * 0.7, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size * 0.7, y); ctx.closePath(); ctx.stroke();
                    ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.moveTo(x - size * 0.7, y); ctx.lineTo(x + size * 0.7, y); ctx.stroke();
                }
            },

            spectrum(ctx, w, h, p, density) {
                const bars = Math.floor((30 + p[0] * 20) * density);
                const barW = w / bars;
                for (let i = 0; i < bars; i++) {
                    const height = (p[i % 40] * 0.7 + 0.15) * h * 0.8;
                    const y = h - height;
                    ctx.globalAlpha = 0.2 + p[i % 40] * 0.25; ctx.fillRect(i * barW + 1, y, barW - 2, height);
                }
            },

            gravity(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const rings = Math.floor((10 + p[0] * 8) * density);
                for (let i = 0; i < rings; i++) {
                    const t = i / rings;
                    const baseR = (1 - t) * Math.min(w, h) * 0.45;
                    const distortion = Math.sin(t * Math.PI * 6) * 15 * t;
                    const r = Math.max(2, baseR + distortion);
                    ctx.globalAlpha = 0.15 + t * 0.2; ctx.lineWidth = Math.max(0.5, 2.5 - t * 2);
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
            },

            weave(ctx, w, h, p, density) {
                const threads = Math.floor((20 + p[0] * 15) * density);
                const spacing = h / threads; ctx.lineWidth = 2;
                for (let i = 0; i < threads; i++) {
                    const y = i * spacing; ctx.globalAlpha = 0.12; ctx.beginPath();
                    for (let x = 0; x <= w; x += 4) {
                        const yOffset = (i % 2 === 0 ? 1 : -1) * Math.sin(x * 0.04) * 4;
                        if (x === 0) ctx.moveTo(x, y + yOffset); else ctx.lineTo(x, y + yOffset);
                    }
                    ctx.stroke();
                    if (i % 4 === 0) {
                        ctx.globalAlpha = 0.18; ctx.beginPath();
                        for (let x = 0; x <= w; x += 6) { const weave = Math.sin(x * 0.08 + i) * 5; if (x === 0) ctx.moveTo(x, y + spacing/2 + weave); else ctx.lineTo(x, y + spacing/2 + weave); }
                        ctx.stroke();
                    }
                }
            },

            ripple(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const ripples = Math.floor((6 + p[0] * 6) * density);
                for (let i = 0; i < ripples; i++) {
                    const maxR = Math.min(w, h) * 0.45;
                    const r = maxR * (i + 1) / (ripples + 1);
                    ctx.globalAlpha = 0.15 + (i / ripples) * 0.15; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
                    const dots = 8;
                    for (let j = 0; j < dots; j++) {
                        const angle = (Math.PI * 2 * j) / dots + i * 0.15;
                        ctx.globalAlpha = 0.35; ctx.fillRect(cx + Math.cos(angle) * r - 1.5, cy + Math.sin(angle) * r - 1.5, 3, 3);
                    }
                }
            },

            trails(ctx, w, h, p, density) {
                const count = Math.floor((30 + p[0] * 25) * density);
                for (let i = 0; i < count; i++) {
                    const x = p[i % 40] * w, y = p[(i + 15) % 40] * h;
                    const angle = p[(i + 30) % 40] * Math.PI * 2, len = 15 + p[(i + 5) % 40] * 50;
                    ctx.globalAlpha = 0.2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len); ctx.stroke();
                    ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
                }
            },

            constellation(ctx, w, h, p, density) {
                const stars = Math.floor((20 + p[0] * 15) * density);
                const positions = [];
                for (let i = 0; i < stars; i++) positions.push({x: p[i % 40] * w, y: p[(i + 20) % 40] * h, size: 1.5 + p[(i + 30) % 40] * 3.5});
                ctx.lineWidth = 0.8; ctx.globalAlpha = 0.2;
                for (let i = 0; i < positions.length; i++) {
                    for (let j = i + 1; j < positions.length; j++) {
                        const dist = Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y);
                        if (dist < 70) { ctx.beginPath(); ctx.moveTo(positions[i].x, positions[i].y); ctx.lineTo(positions[j].x, positions[j].y); ctx.stroke(); }
                    }
                }
                positions.forEach(pos => { ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(pos.x, pos.y, pos.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.3; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(pos.x - pos.size * 4, pos.y); ctx.lineTo(pos.x + pos.size * 4, pos.y); ctx.moveTo(pos.x, pos.y - pos.size * 4); ctx.lineTo(pos.x, pos.y + pos.size * 4); ctx.stroke(); });
            },

            paperplane(ctx, w, h, p, density) {
                const planes = Math.floor((4 + p[0] * 6) * density);
                for (let i = 0; i < planes; i++) {
                    const x = p[i % 40] * w, y = p[(i + 15) % 40] * h;
                    const angle = -Math.PI / 4 + (p[(i + 25) % 40] - 0.5) * 0.8, size = 12 + p[(i + 35) % 40] * 30;
                    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = 0.25; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.6, size * 0.3); ctx.lineTo(0, size * 0.1); ctx.lineTo(-size * 0.6, size * 0.3); ctx.closePath(); ctx.stroke();
                    ctx.globalAlpha = 0.12; ctx.setLineDash([4, 8]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-size * 2.5, size * 2.5); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
                }
            },

            rain(ctx, w, h, p, density) {
                const drops = Math.floor((40 + p[0] * 40) * density);
                for (let i = 0; i < drops; i++) {
                    const x = p[i % 40] * w, y = p[(i + 20) % 40] * h, len = 8 + p[(i + 30) % 40] * 25;
                    ctx.globalAlpha = 0.2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + len); ctx.stroke();
                }
            },

            circuit(ctx, w, h, p, density) {
                const nodes = Math.floor((12 + p[0] * 10) * density);
                const nodePos = [];
                for (let i = 0; i < nodes; i++) nodePos.push({x: 0.08 + p[i % 40] * 0.84, y: 0.08 + p[(i + 20) % 40] * 0.84});
                ctx.lineWidth = 2; ctx.lineCap = 'square';
                nodePos.forEach((node, i) => {
                    nodePos.slice(i + 1).forEach(other => {
                        if (Math.abs(node.x - other.x) < 0.25 || Math.abs(node.y - other.y) < 0.25) {
                            ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(node.x * w, node.y * h);
                            if (Math.abs(node.x - other.x) < 0.25) ctx.lineTo(node.x * w, other.y * h);
                            else ctx.lineTo(other.x * w, node.y * h);
                            ctx.lineTo(other.x * w, other.y * h); ctx.stroke();
                        }
                    });
                    ctx.globalAlpha = 0.6; ctx.fillRect(node.x * w - 3, node.y * h - 3, 6, 6);
                });
            },

            glitch(ctx, w, h, p, density) {
                const slices = Math.floor((12 + p[0] * 15) * density);
                for (let i = 0; i < slices; i++) {
                    const y = (h / slices) * i;
                    const offset = (p[i % 40] - 0.5) * 30 * ((i % 3) + 1);
                    ctx.globalAlpha = 0.15; ctx.fillRect(0, y, w, h / slices);
                    if (i % 2 === 0) { ctx.globalAlpha = 0.25; ctx.fillRect(offset, y, w, h / slices); }
                }
            },

            perforation(ctx, w, h, p, density) {
                const rows = Math.floor((10 + p[0] * 6) * density);
                const spacingY = h / rows;
                for (let i = 0; i < rows; i++) {
                    const y = (i + 0.5) * spacingY;
                    const dotSize = 1.5 + p[i % 40] * 2;
                    const cols = Math.floor((20 + p[(i + 5) % 40] * 15) * density);
                    const spacingX = w / cols;
                    for (let j = 0; j < cols; j++) {
                        const x = (j + 0.5) * spacingX;
                        ctx.globalAlpha = 0.4 + (p[(i * cols + j) % 40] * 0.4); ctx.beginPath(); ctx.arc(x, y, dotSize, 0, Math.PI * 2); ctx.fill();
                        if (j < cols - 1) { ctx.globalAlpha = 0.2; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x + dotSize, y); ctx.lineTo(x + spacingX - dotSize, y); ctx.stroke(); ctx.globalAlpha = 0.4 + (p[(i * cols + j) % 40] * 0.4); }
                    }
                }
            },

            origami(ctx, w, h, p, density) {
                const folds = Math.floor((4 + p[0] * 4) * density);
                for (let i = 0; i < folds; i++) {
                    const x1 = p[i % 40] * w, y1 = p[(i + 15) % 40] * h;
                    const x2 = p[(i + 30) % 40] * w, y2 = p[(i + 5) % 40] * h;
                    ctx.globalAlpha = 0.2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                    ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + (x2 - x1) * 0.5 + 15, y1 + (y2 - y1) * 0.5); ctx.lineTo(x2, y2); ctx.stroke();
                }
            },

            soundwave(ctx, w, h, p, density) {
                const waves = 4;
                for (let wave = 0; wave < waves; wave++) {
                    const y = (h / (waves + 1)) * (wave + 1);
                    const amp = 12 + wave * 6, freq = 0.015 + wave * 0.008;
                    ctx.globalAlpha = 0.25; ctx.lineWidth = 2.5; ctx.beginPath();
                    for (let x = 0; x <= w; x += 2) {
                        const dy = Math.sin(x * freq) * amp * (0.6 + 0.4 * Math.sin(x * 0.005));
                        if (x === 0) ctx.moveTo(x, y + dy); else ctx.lineTo(x, y + dy);
                    }
                    ctx.stroke();
                }
            },

            fibonacci(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2, phi = 1.618033988749;
                const count = Math.floor((12 + p[0] * 8) * density);
                for (let i = 0; i < count; i++) {
                    const r = 10 * Math.pow(phi, i / 2) * (1 + p[1]);
                    const angle = i * Math.PI * 2 / phi;
                    ctx.globalAlpha = 0.3 - (i / count) * 0.2; ctx.lineWidth = 2 - (i / count);
                    ctx.beginPath(); ctx.arc(cx + Math.cos(angle) * r * 0.3, cy + Math.sin(angle) * r * 0.3, r, angle, angle + Math.PI * 1.618); ctx.stroke();
                }
            },

            cardioid(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2, scale = Math.min(w, h) * 0.4;
                const count = Math.floor((3 + p[0] * 5) * density);
                for (let j = 0; j < count; j++) {
                    ctx.globalAlpha = 0.28; ctx.lineWidth = 1.5; ctx.beginPath();
                    for (let t = 0; t <= Math.PI * 2; t += 0.05) {
                        const a = scale * (0.5 + j * 0.3);
                        const r = a * (1 - Math.sin(t));
                        const x = cx + r * Math.cos(t) + (p[1] - 0.5) * 20;
                        const y = cy + r * Math.sin(t) * 0.9;
                        if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.closePath(); ctx.stroke();
                }
            },

            rose(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2, petals = 3 + Math.floor(p[0] * 8);
                const scale = Math.min(w, h) * 0.4, layers = Math.floor((3 + p[1] * 4) * density);
                for (let layer = 0; layer < layers; layer++) {
                    ctx.globalAlpha = 0.3 - layer * 0.04; ctx.lineWidth = 2; ctx.beginPath();
                    for (let t = 0; t <= Math.PI * 2; t += 0.02) {
                        const r = scale * (1 - layer * 0.15) * Math.cos(petals * t);
                        const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
                        if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.closePath(); ctx.stroke();
                }
            },

            lissajous(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2, scaleX = w * 0.4, scaleY = h * 0.4;
                const a = 3 + Math.floor(p[0] * 4), b = 2 + Math.floor(p[1] * 4), delta = p[2] * Math.PI;
                const count = Math.floor((8 + p[3] * 8) * density);
                for (let i = 0; i < count; i++) {
                    ctx.globalAlpha = 0.3 - (i / count) * 0.2; ctx.lineWidth = 1.5; ctx.beginPath();
                    for (let t = 0; t <= Math.PI * 2; t += 0.02) {
                        const phase = i * 0.1;
                        const x = cx + scaleX * Math.sin(a * t + delta + phase);
                        const y = cy + scaleY * Math.sin(b * t + phase);
                        if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.closePath(); ctx.stroke();
                }
            },

            mandala(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2, rings = Math.floor((6 + p[0] * 8) * density);
                for (let r = 1; r <= rings; r++) {
                    const radius = (r / rings) * Math.min(w, h) * 0.45, segments = 6 + r * 2;
                    ctx.globalAlpha = 0.28; ctx.lineWidth = 1; ctx.beginPath();
                    for (let i = 0; i <= segments; i++) {
                        const angle = (i / segments) * Math.PI * 2;
                        const x = cx + radius * Math.cos(angle), y = cy + radius * Math.sin(angle);
                        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                        if (i < segments && r % 2 === 0) { ctx.moveTo(x, y); ctx.lineTo(cx, cy); }
                    }
                    ctx.closePath(); ctx.stroke();
                }
            },

            phyllotaxis(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const count = Math.floor((80 + p[0] * 100) * density);
                const angle = 137.508 * (Math.PI / 180), spread = 6 + p[1] * 4;
                for (let i = 0; i < count; i++) {
                    const r = spread * Math.sqrt(i), theta = i * angle;
                    const x = cx + r * Math.cos(theta), y = cy + r * Math.sin(theta);
                    if (x < 0 || x > w || y < 0 || y > h) continue;
                    const size = 2 + (i / count) * 4; ctx.globalAlpha = 0.45 - (i / count) * 0.25;
                    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
                }
            },

            superellipse(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2, n = 2 + p[0] * 4;
                const count = Math.floor((5 + p[1] * 6) * density);
                for (let i = 0; i < count; i++) {
                    const a = (w * 0.4) * (1 - i * 0.12), b = (h * 0.4) * (1 - i * 0.12);
                    ctx.globalAlpha = 0.28; ctx.lineWidth = 2 - i * 0.2; ctx.beginPath();
                    for (let t = 0; t <= Math.PI * 2; t += 0.02) {
                        const cosT = Math.cos(t), sinT = Math.sin(t);
                        const x = cx + a * Math.sign(cosT) * Math.pow(Math.abs(cosT), 2/n);
                        const y = cy + b * Math.sign(sinT) * Math.pow(Math.abs(sinT), 2/n);
                        if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.closePath(); ctx.stroke();
                }
            },

            tessellation(ctx, w, h, p, density) {
                const cols = Math.floor((6 + p[0] * 6) * Math.sqrt(density));
                const rows = Math.floor((8 + p[1] * 6) * Math.sqrt(density));
                const cw = w / cols, rh = h / rows;
                for (let i = 0; i < cols; i++) {
                    for (let j = 0; j < rows; j++) {
                        const x = i * cw, y = j * rh, type = (i + j + Math.floor(p[2] * 3)) % 3;
                        ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5; ctx.beginPath();
                        if (type === 0) { ctx.moveTo(x + cw/2, y); ctx.lineTo(x + cw, y + rh); ctx.lineTo(x, y + rh); }
                        else if (type === 1) { ctx.moveTo(x + cw*0.3, y); ctx.lineTo(x + cw*0.7, y); ctx.lineTo(x + cw, y + rh*0.5); ctx.lineTo(x + cw*0.7, y + rh); ctx.lineTo(x + cw*0.3, y + rh); ctx.lineTo(x, y + rh*0.5); }
                        else { ctx.moveTo(x + cw/2, y); ctx.lineTo(x + cw, y + rh/2); ctx.lineTo(x + cw/2, y + rh); ctx.lineTo(x, y + rh/2); }
                        ctx.closePath(); ctx.stroke();
                    }
                }
            },

            halftone(ctx, w, h, p, density) {
                const spacing = 8 / density;
                for (let x = 0; x < w; x += spacing) {
                    for (let y = 0; y < h; y += spacing) {
                        const dist = Math.hypot(x - w/2, y - h/2);
                        const radius = (Math.sin(dist * 0.05) + 1) * 1.5 * (p[0] + 0.5);
                        ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
                    }
                }
            },

            kintsugi(ctx, w, h, p, density) {
                const accentColor = ctx.strokeStyle;
                const cracks = Math.floor(5 * density);
                for (let i = 0; i < cracks; i++) {
                    let x = p[i*3] * w, y = p[i*3+1] * h;
                    ctx.globalAlpha = 0.8; ctx.strokeStyle = accentColor; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y);
                    for (let j = 0; j < 5; j++) { x += (p[(i+j)%40] - 0.5) * 80; y += (p[(i+j+10)%40] - 0.5) * 80; ctx.lineTo(x, y); }
                    ctx.stroke();
                    ctx.globalAlpha = 0.2; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; ctx.stroke();
                }
            },

            contour(ctx, w, h, p, density) {
                const centers = 3 + Math.floor(p[0] * 4);
                for (let c = 0; c < centers; c++) {
                    const cx = p[c*3] * w, cy = p[(c*3+1) % 40] * h;
                    const maxR = Math.min(w, h) * (0.15 + p[(c*3+2) % 40] * 0.25);
                    const rings = Math.floor((8 + p[c] * 6) * density);
                    for (let i = 0; i < rings; i++) {
                        const r = maxR * (i / rings); if (r < 3) continue;
                        ctx.globalAlpha = 0.25 - (i / rings) * 0.15; ctx.lineWidth = (i % 2 === 0) ? 1.2 : 0.6; ctx.beginPath();
                        for (let angle = 0; angle <= Math.PI * 2; angle += 0.03) {
                            const noise1 = Math.sin(angle * 3 + c * 2) * 0.4;
                            const noise2 = Math.cos(angle * 5 + i) * 0.25;
                            const noise3 = Math.sin(angle * 8 + p[c]) * 0.15;
                            const deformR = r * (1 + (noise1 + noise2 + noise3) * 0.5);
                            const x = cx + deformR * Math.cos(angle), y = cy + deformR * Math.sin(angle);
                            if (angle === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                        }
                        ctx.closePath(); ctx.stroke();
                    }
                }
            },

            noiseField(ctx, w, h, p, density) {
                const step = 4;
                for (let x = 0; x < w; x += step) {
                    for (let y = 0; y < h; y += step) {
                        const noise = Math.sin(x * 0.03) * Math.cos(y * 0.03) * Math.sin((x+y) * 0.01);
                        ctx.globalAlpha = Math.abs(noise) * 0.15 * density; ctx.fillRect(x, y, step, step);
                    }
                }
            },

            stringArt(ctx, w, h, p, density) {
                const pins = Math.floor((24 + p[0] * 8) * density);
                const cx = w/2, cy = h/2, r = Math.min(w, h) * 0.42;
                for (let i = 0; i < pins; i++) {
                    for (let j = i + 1; j < pins; j += 2) {
                        const angle1 = (i / pins) * Math.PI * 2, angle2 = (j / pins) * Math.PI * 2;
                        ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(cx + r * Math.cos(angle1), cy + r * Math.sin(angle1));
                        ctx.lineTo(cx + r * Math.cos(angle2), cy + r * Math.sin(angle2)); ctx.stroke();
                    }
                }
            },

            isometric(ctx, w, h, p, density) {
                const size = 30 / density; ctx.lineWidth = 1;
                for (let y = -h; y < h * 2; y += size * 0.866) {
                    for (let x = -w; x < w * 2; x += size) {
                        const offset = (Math.floor(y / (size * 0.866)) % 2) * (size / 2);
                        ctx.globalAlpha = 0.35; ctx.beginPath();
                        ctx.moveTo(x + offset, y); ctx.lineTo(x + offset + size/2, y - size * 0.433);
                        ctx.lineTo(x + offset + size, y); ctx.lineTo(x + offset + size/2, y + size * 0.433); ctx.closePath(); ctx.stroke();
                    }
                }
            },

            turing(ctx, w, h, p, density) {
                const spots = Math.floor((15 + p[0] * 25) * density);
                for (let i = 0; i < spots; i++) {
                    const cx = p[i % 40] * w, cy = p[(i + 10) % 40] * h, r = 10 + p[(i + 20) % 40] * 40;
                    ctx.globalAlpha = 0.45; ctx.beginPath();
                    for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
                        const noise = Math.sin(angle * 3 + i) * Math.cos(angle * 5) * 3;
                        const x = cx + (r + noise) * Math.cos(angle), y = cy + (r + noise) * Math.sin(angle);
                        if (angle === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.closePath(); ctx.fill();
                    ctx.globalAlpha = 0.15; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.stroke();
                }
            },

            dendrite(ctx, w, h, p, density) {
                const centers = Math.floor((2 + p[0] * 3) * density);
                for (let c = 0; c < centers; c++) {
                    const cx = (0.2 + p[c*4] * 0.6) * w, cy = (0.2 + p[(c*4+1)%40] * 0.6) * h;
                    const branches = 6 + Math.floor(p[(c*4+2)%40] * 6);
                    for (let i = 0; i < branches; i++) {
                        const angle = (Math.PI * 2 * i) / branches + p[(c*4+3)%40];
                        let x = cx, y = cy, len = 20 + p[i%40] * 60;
                        ctx.globalAlpha = 0.4; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y);
                        for (let gen = 0; gen < 4; gen++) {
                            const subBranches = gen < 2 ? 2 : 1;
                            for (let sb = 0; sb < subBranches; sb++) {
                                const subAngle = angle + (sb - 0.5) * 0.4 * (gen + 1);
                                const subLen = len * Math.pow(0.6, gen);
                                const ex = x + Math.cos(subAngle) * subLen, ey = y + Math.sin(subAngle) * subLen;
                                ctx.lineTo(ex, ey); ctx.moveTo(ex, ey);
                            }
                        }
                        ctx.stroke();
                    }
                }
            },

            droste(ctx, w, h, p, density) {
                let size = Math.min(w, h) * 0.9, x = (w - size) / 2, y = (h - size) / 2;
                const count = Math.floor((8 + p[0] * 12) * density), rotStep = (p[1] - 0.5) * 0.1;
                ctx.save(); ctx.translate(w/2, h/2);
                for (let i = 0; i < count; i++) {
                    const scale = Math.pow(0.85, i), rotation = i * rotStep;
                    ctx.save(); ctx.scale(scale, scale); ctx.rotate(rotation);
                    ctx.globalAlpha = 0.4 - (i / count) * 0.2; ctx.lineWidth = 2.5 / scale;
                    ctx.strokeRect(-size/2, -size/2, size, size);
                    if (i % 2 === 0) { ctx.globalAlpha = 0.1; ctx.beginPath(); ctx.moveTo(-size/2, 0); ctx.lineTo(size/2, 0); ctx.moveTo(0, -size/2); ctx.lineTo(0, size/2); ctx.stroke(); }
                    ctx.restore();
                }
                ctx.restore();
            },

            inkBleed(ctx, w, h, p, density) {
                const drops = Math.floor((3 + p[0] * 5) * density);
                for (let i = 0; i < drops; i++) {
                    const cx = p[i*5] * w, cy = p[(i*5+1)%40] * h, maxR = 50 + p[(i*5+2)%40] * 100;
                    for (let r = maxR; r > 0; r -= 3) {
                        const alpha = 0.05 * (r / maxR); ctx.globalAlpha = alpha; ctx.beginPath();
                        for (let angle = 0; angle <= Math.PI * 2; angle += 0.2) {
                            const irregular = Math.sin(angle * 4 + i) * 2 + Math.cos(angle * 7) * 1.5;
                            const x = cx + (r + irregular) * Math.cos(angle), y = cy + (r + irregular) * Math.sin(angle);
                            if (angle === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                        }
                        ctx.closePath(); ctx.fill();
                    }
                    ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
                }
            },

            snowflake(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2, maxRadius = Math.min(w, h) * 0.4, arms = 6;
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                for (let arm = 0; arm < arms; arm++) {
                    const baseAngle = (arm * Math.PI * 2) / 6; ctx.save(); ctx.translate(cx, cy); ctx.rotate(baseAngle);
                    const mainLen = maxRadius * (0.6 + p[arm % 40] * 0.3);
                    const branches = Math.floor((3 + p[(arm + 5) % 40] * 3) * density);
                    ctx.globalAlpha = 0.95; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -mainLen); ctx.stroke();
                    for (let i = 1; i <= branches; i++) {
                        const pos = (i / (branches + 1)) * mainLen, branchLen = mainLen * 0.4 * (1 - i / (branches + 1));
                        for (let side of [-1, 1]) {
                            ctx.save(); ctx.translate(0, -pos); ctx.rotate(side * (Math.PI / 4 + p[(arm + i) % 40] * 0.2));
                            ctx.globalAlpha = 0.75 - (i / branches) * 0.3; ctx.lineWidth = 1.8 - (i / branches) * 0.8;
                            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -branchLen); ctx.stroke();
                            if (i < branches && p[(arm + i * 2) % 40] > 0.3) {
                                ctx.translate(0, -branchLen * 0.6); ctx.rotate(side * Math.PI / 6); ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
                                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -branchLen * 0.3); ctx.stroke();
                            }
                            ctx.restore();
                        }
                    }
                    ctx.translate(0, -mainLen); ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2;
                    for (let k = 0; k < 6; k++) { ctx.save(); ctx.rotate((k * Math.PI * 2) / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -8); ctx.stroke(); ctx.restore(); }
                    ctx.restore();
                }
                ctx.globalAlpha = 0.95; ctx.lineWidth = 2.5; ctx.beginPath();
                for (let i = 0; i < 6; i++) { const angle = (i * Math.PI * 2) / 6, r = 12, x = cx + r * Math.cos(angle), y = cy + r * Math.sin(angle); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
                ctx.closePath(); ctx.stroke();
                ctx.globalAlpha = 0.2; ctx.lineWidth = 0.8;
                for (let ring = 1; ring <= 3; ring++) {
                    ctx.beginPath(); const r = maxRadius * 0.3 * ring;
                    for (let i = 0; i <= 6; i++) { const angle = (i * Math.PI * 2) / 6, x = cx + r * Math.cos(angle), y = cy + r * Math.sin(angle); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
                    ctx.closePath(); ctx.stroke();
                }
            }
        };

        // typographic（大字报）布局
        function typographic(ctx, w, h, title, author, scaleFactor, seed, palette, patternId, density, fontStack) {
            drawPatternArea(ctx, 0, 0, w, h, seed, palette, patternId, density);
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(0, 0, w, h);
            drawTextBlock(ctx, title, author, 0, 0, w, h, scaleFactor, palette.textBg, fontStack);
        }

        function generate(options) {
            const config = {
                title: options.title || 'Untitled',
                author: options.author || 'Unknown',
                scaleFactor: options.scaleFactor || 1.0,
                pattern: options.pattern !== undefined ? options.pattern : -1,
                paletteMode: options.paletteMode || 'auto',  // 支持配色策略选择
                seed: options.seed !== undefined ? options.seed : null,
                density: options.density || 1.0,
                fontStack: options.fontStack || 'sans-serif',
                hashMode: options.hashMode || false,
                asHTML: options.asHTML || false
            };

            const baseW = CONFIG.baseWidth;
            const baseH = CONFIG.baseHeight;
            const width = Math.floor(baseW * config.scaleFactor);
            const height = Math.floor(baseH * config.scaleFactor);
            
            let baseSeed;
            if (config.hashMode) {
                baseSeed = djb2(config.title + '|' + config.author);
            } else {
                baseSeed = config.seed !== null ? parseInt(config.seed) : djb2(config.title + config.author + Date.now());
            }
            
            const patternId = config.pattern >= 0 ? config.pattern : (baseSeed % PATTERNS.length);
            const palette = generatePalette(baseSeed, config.paletteMode);

            const renderer = new SVGRenderer(width, height);
            renderer.fillStyle = palette.pattern; // 设置背景色
            typographic(renderer, width, height, config.title, config.author, config.scaleFactor, baseSeed, palette, patternId, config.density, config.fontStack);
            
            // 支持返回 SVG HTML 字符串（直接插入 DOM）或 Data URL（作为图片）
            if (config.asHTML) {
                return renderer.getSVG(palette.pattern, true);
            }
            return renderer.getDataURL(palette.pattern);
        }

        return { generate };
    })();

    // ========== 对外接口 ==========
    Lumina.CoverGenerator = {
        _cache: new Map(),
        _maxCacheSize: 50,
        
        // 生成 SVG HTML（直接插入 DOM，继承页面字体）
        generateSVGHTML(title, author, fontId) {
            // 缓存 key 包含字体信息，切换字体后自动失效
            const cacheKey = `${title}|${author}|${fontId || 'default'}`;
            if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);
            
            try {
                let fontStack = 'system-ui, -apple-system, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif';
                if (typeof Lumina !== 'undefined' && Lumina.FontManager) {
                    if (fontId) {
                        fontStack = Lumina.FontManager.getFontFamily(fontId);
                    } else if (Lumina.State?.settings?.font) {
                        fontStack = Lumina.FontManager.getFontFamily(Lumina.State.settings.font);
                    }
                }
                
                const svgHTML = CoverCore.generate({
                    title: title || 'Untitled',
                    author: author || '',
                    scaleFactor: 1.0,
                    hashMode: true,
                    fontStack: fontStack,
                    asHTML: true
                });
                
                this._cache.set(cacheKey, svgHTML);
                if (this._cache.size > this._maxCacheSize) {
                    const firstKey = this._cache.keys().next().value;
                    this._cache.delete(firstKey);
                }
                
                return svgHTML;
            } catch (e) {
                console.error('[CoverGenerator] 生成封面失败:', e);
                return null;
            }
        },
        
        // 获取封面 SVG HTML（直接插入 DOM）
        getCoverSVG(book) {
            if (!book || book.cover) return null;
            const metadata = book.metadata || {};
            const title = metadata.title || book.title || book.fileName || 'Untitled';
            const author = metadata.author || book.author || '';
            const fontId = Lumina.State?.settings?.font;
            return this.generateSVGHTML(title, author, fontId);
        },
        
        clearCache() { 
            this._cache.clear();
        }
    };

})();
