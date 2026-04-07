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
            
            // 支持渐变填充
            let fillAttr = fill;
            if (fill && fill.id) {
                fillAttr = `url(#${fill.id})`;
            }
            
            const clip = this.clipPath ? `clip-path="url(#${this.clipPath})"` : '';
            this.elements.push(`<path d="${d}" fill="${fillAttr}" fill-opacity="${opacity}" stroke="none" ${clip}/>`);
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
            
            // 支持渐变填充
            let fillAttr = fill;
            if (fill && fill.id) {
                fillAttr = `url(#${fill.id})`;
            }
            
            const clip = this.clipPath ? `clip-path="url(#${this.clipPath})"` : '';
            this.elements.push(`<rect x="${nx.toFixed(2)}" y="${ny.toFixed(2)}" width="${nw.toFixed(2)}" height="${nh.toFixed(2)}" fill="${fillAttr}" fill-opacity="${opacity}" ${clip}/>`);
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
            
            // 支持渐变填充
            let fillAttr = fill;
            if (fill && fill.id) {
                fillAttr = `url(#${fill.id})`;
            }
            
            // 关键修复：font-family 使用单引号包裹，避免与内部双引号冲突
            this.elements.push(`<text x="${nx.toFixed(2)}" y="${ny.toFixed(2)}" font-family='${font.family}' font-size="${font.size}" font-weight="${font.weight}" fill="${fillAttr}" fill-opacity="${opacity}" text-anchor="${anchor}" dominant-baseline="alphabetic" ${clip}>${safeText}</text>`);
        }

        clip() {
            if (this.currentPath.length > 0) {
                const id = `clip-${++this.defId}`;
                const d = this.currentPath.join(' ');
                this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
                this.clipPath = id;
            }
        }

        createLinearGradient(x0, y0, x1, y1) {
            const id = `grad-${++this.defId}`;
            
            // 关键修复：应用当前变换矩阵到渐变端点（与Canvas行为一致）
            const t = this.state.transform;
            const nx0 = t[0]*x0 + t[2]*y0 + t[4];
            const ny0 = t[1]*x0 + t[3]*y0 + t[5];
            const nx1 = t[0]*x1 + t[2]*y1 + t[4];
            const ny1 = t[1]*x1 + t[3]*y1 + t[5];
            
            const gradient = {
                type: 'linear',
                id: id,
                x0: nx0, y0: ny0, x1: nx1, y1: ny1,  // 存储变换后的绝对坐标
                stops: [],
                addColorStop(pos, color) {
                    this.stops.push({pos, color});
                }
            };
            
            this.pendingGradient = gradient;
            return gradient;
        }

        createRadialGradient(x0, y0, r0, x1, y1, r1) {
            const id = `radial-${++this.defId}`;
            
            // 应用当前变换矩阵到渐变端点
            const t = this.state.transform;
            const nx0 = t[0]*x0 + t[2]*y0 + t[4];
            const ny0 = t[1]*x0 + t[3]*y0 + t[5];
            const nx1 = t[0]*x1 + t[2]*y1 + t[4];
            const ny1 = t[1]*x1 + t[3]*y1 + t[5];
            // 半径缩放（取变换矩阵的平均缩放因子）
            const scale = Math.sqrt(t[0]*t[0] + t[1]*t[1]);
            const nr0 = r0 * scale;
            const nr1 = r1 * scale;
            
            const gradient = {
                type: 'radial',
                id: id,
                x0: nx0, y0: ny0, r0: nr0,
                x1: nx1, y1: ny1, r1: nr1,
                stops: [],
                addColorStop(pos, color) {
                    this.stops.push({pos, color});
                }
            };
            
            this.pendingGradient = gradient;
            return gradient;
        }

        applyGradient(gradient) {
            if (!gradient || !gradient.stops || gradient.stops.length === 0) return;
            
            // 解析颜色：支持 'currentColor' 关键字
            const resolveColor = (color) => {
                if (color === 'currentColor') return this.state.strokeStyle;
                if (color === 'transparent') return 'rgba(0,0,0,0)';
                return color;
            };
            
            const stops = gradient.stops.map(s => 
                `<stop offset="${s.pos}" stop-color="${resolveColor(s.color)}"/>`
            ).join('');
            
            if (gradient.type === 'radial') {
                // SVG 径向渐变：cx,cy,r 定义外圆，fx,fy 定义焦点（内圆中心）
                // fr（内圆半径）是 SVG 新特性，用 r0 映射
                this.defs.push(`<radialGradient id="${gradient.id}" 
                    cx="${gradient.x1.toFixed(2)}" cy="${gradient.y1.toFixed(2)}" r="${gradient.r1.toFixed(2)}"
                    fx="${gradient.x0.toFixed(2)}" fy="${gradient.y0.toFixed(2)}"
                    gradientUnits="userSpaceOnUse">${stops}</radialGradient>`);
            } else {
                // 线性渐变（原有逻辑）
                this.defs.push(`<linearGradient id="${gradient.id}" 
                    x1="${gradient.x0.toFixed(2)}" y1="${gradient.y0.toFixed(2)}" 
                    x2="${gradient.x1.toFixed(2)}" y2="${gradient.y1.toFixed(2)}" 
                    gradientUnits="userSpaceOnUse">${stops}</linearGradient>`);
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

        set fillStyle(val) { 
            // 如果 val 是渐变对象（有 id 属性），先应用它
            if (val && val.id) {
                this.applyGradient(val);
            }
            // 支持 'currentColor' 关键字：解析为当前 strokeStyle
            this.state.fillStyle = (val === 'currentColor') ? this.state.strokeStyle : val; 
        }
        get fillStyle() { return this.state.fillStyle; }
        set strokeStyle(val) { this.state.strokeStyle = val; }
        get strokeStyle() { return this.state.strokeStyle; }
        set lineWidth(val) { this.state.lineWidth = val; }
        set lineCap(val) { this.state.lineCap = val; }
        set lineJoin(val) { this.state.lineJoin = val; }
        setLineDash(val) { this.state.lineDash = val && val.length > 0 ? val : null; }
        getLineDash() { return this.state.lineDash ? [...this.state.lineDash] : []; }
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
            { code: 'grid', name: { 'zh-CN': '精密网格', 'en': 'Precision Grid' }},
            { code: 'waves', name: { 'zh-CN': '正弦波浪', 'en': 'Sine Waves' }},
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
            { code: 'maze', name: { 'zh-CN': '迷宫路径', 'en': 'Labyrinth' }},
            { code: 'crystal', name: { 'zh-CN': '晶体结构', 'en': 'Crystal' }},
            { code: 'gravity', name: { 'zh-CN': '引力透镜', 'en': 'Gravity' }},
            { code: 'textile', name: { 'zh-CN': '纺织纹理', 'en': 'Textile' }},
            { code: 'ripple', name: { 'zh-CN': '水波涟漪', 'en': 'Ripples' }},
            { code: 'trails', name: { 'zh-CN': '粒子轨迹', 'en': 'Trails' }},
            { code: 'constellation', name: { 'zh-CN': '星座连线', 'en': 'Constellation' }},
            { code: 'paperplane', name: { 'zh-CN': '纸飞机群', 'en': 'Paper Planes' }},
            { code: 'rain', name: { 'zh-CN': '雨滴下落', 'en': 'Rain Drops' }},
            { code: 'circuit', name: { 'zh-CN': '电路板纹', 'en': 'Circuit' }},
            { code: 'glitch', name: { 'zh-CN': '故障艺术', 'en': 'Glitch' }},
            { code: 'perforation', name: { 'zh-CN': '邮票齿孔', 'en': 'Perforation' }},
            { code: 'origami', name: { 'zh-CN': '折纸褶皱', 'en': 'Origami' }},
            { code: 'fibonacci', name: { 'zh-CN': '斐波那契螺旋', 'en': 'Fibonacci' }},
            { code: 'cardioid', name: { 'zh-CN': '心形线', 'en': 'Cardioid' }},
            { code: 'rose', name: { 'zh-CN': '玫瑰花瓣', 'en': 'Rose Curve' }},
            { code: 'lissajous', name: { 'zh-CN': '利萨茹曲线', 'en': 'Lissajous' }},
            { code: 'phyllotaxis', name: { 'zh-CN': '叶序螺旋', 'en': 'Phyllotaxis' }},
            { code: 'superellipse', name: { 'zh-CN': '超椭圆', 'en': 'Superellipse' }},
            { code: 'tessellation', name: { 'zh-CN': '密铺镶嵌', 'en': 'Tessellation' }},
            { code: 'halftone', name: { 'zh-CN': '半调网点', 'en': 'Halftone' }},
            { code: 'kintsugi', name: { 'zh-CN': '金缮裂纹', 'en': 'Kintsugi' }},
            { code: 'contour', name: { 'zh-CN': '等高线', 'en': 'Contour' }},
            { code: 'noiseField', name: { 'zh-CN': '数字噪点', 'en': 'Noise' }},
            { code: 'isometric', name: { 'zh-CN': '等距网格', 'en': 'Isometric' }},
            { code: 'turing', name: { 'zh-CN': '反应扩散', 'en': 'Turing Patterns' }},
            { code: 'dendrite', name: { 'zh-CN': '枝晶生长', 'en': 'Dendrite' }},
            { code: 'droste', name: { 'zh-CN': '递归画框', 'en': 'Droste Effect' }},
            { code: 'inkBleed', name: { 'zh-CN': '水墨晕染', 'en': 'Ink Bleed' }},
            { code: 'snowflake', name: { 'zh-CN': '雪花冰晶', 'en': 'Snowflake' }},
            { code: 'sunburst', name: { 'zh-CN': '太阳光芒', 'en': 'Sunburst' }},
            { code: 'bricks', name: { 'zh-CN': '砖墙纹理', 'en': 'Bricks' }},
            { code: 'maple', name: { 'zh-CN': '飘落枫叶', 'en': 'Maple Leaves' }},
            { code: 'typewriter', name: { 'zh-CN': '打字机文字', 'en': 'Typewriter' }},
            { code: 'shanshui', name: { 'zh-CN': '水墨山水', 'en': 'Shanshui' }},
            { code: 'stripes', name: { 'zh-CN': '斜条纹', 'en': 'Stripes' }},
            { code: 'hexagon', name: { 'zh-CN': '六边形蜂巢', 'en': 'Honeycomb' }},
            { code: 'goldenSpiral', name: { 'zh-CN': '黄金螺线', 'en': 'Golden Spiral' }},
            { code: 'cropCircles', name: { 'zh-CN': '麦田圈', 'en': 'Crop Circles' }},
            { code: 'fractalPeaks', name: { 'zh-CN': '分形山脉', 'en': 'Fractal Peaks' }},
            { code: 'moirePattern', name: { 'zh-CN': '莫列波纹', 'en': 'Moire Pattern' }},
            { code: 'attractor', name: { 'zh-CN': '奇异吸引子', 'en': 'Strange Attractor' }},
            { code: 'mycelium', name: { 'zh-CN': '菌丝网络', 'en': 'Mycelium' }},
            { code: 'gol', name: { 'zh-CN': '细胞自动机', 'en': 'Cellular Automata' }},
            { code: 'holographic', name: { 'zh-CN': '全息干涉', 'en': 'Holographic' }},
            { code: 'islamicTile', name: { 'zh-CN': '伊斯兰密铺', 'en': 'Islamic Tile' }},
            { code: 'dragonCurve', name: { 'zh-CN': '龙形分形', 'en': 'Dragon Curve' }},
            { code: 'galaxy', name: { 'zh-CN': '螺旋星系', 'en': 'Spiral Galaxy' }},
            { code: 'bridge', name: { 'zh-CN': '悬索桥梁', 'en': 'Suspension Bridge' }},
            { code: 'sandDune', name: { 'zh-CN': '沙丘波纹', 'en': 'Sand Dunes' }},
            { code: 'knots', name: { 'zh-CN': '拓扑绳结', 'en': 'Topological Knots' }},
            { code: 'fractalTree', name: { 'zh-CN': '自适应分形树', 'en': 'Adaptive Fractal Tree' }},
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

        // 图案绘制器（兼容 Canvas 和 SVG）
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
            
            grid(ctx, w, h, p, density) {
                const cols = Math.floor((8 + p[2] * 12) * Math.sqrt(density));
                const rows = Math.floor((10 + p[3] * 14) * Math.sqrt(density));
                const cw = w / cols, rh = h / rows;
                ctx.lineWidth = 0.4;
                ctx.globalAlpha = 0.5;
                
                for (let i = 0; i <= cols; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * cw, 0);
                    ctx.lineTo(i * cw, h);
                    ctx.stroke();
                }
                for (let j = 0; j <= rows; j++) {
                    ctx.beginPath();
                    ctx.moveTo(0, j * rh);
                    ctx.lineTo(w, j * rh);
                    ctx.stroke();
                }
            },

            waves(ctx, w, h, p, density) {
                const lines = Math.floor((30 + p[0] * 40) * density);
                ctx.lineWidth = 1;
                for (let i = 0; i < lines; i++) {
                    ctx.globalAlpha = 0.25 + (i / lines) * 0.15;
                    const y = (h / lines) * i;
                    const phase = i * 0.3;
                    ctx.beginPath();
                    for (let x = 0; x <= w; x += 2) {
                        const yOffset = Math.sin(x * 0.01 + phase) * 8 + Math.sin(x * 0.02) * 4;
                        if (x === 0) ctx.moveTo(x, y + yOffset);
                        else ctx.lineTo(x, y + yOffset);
                    }
                    ctx.stroke();
                }
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
                        ctx.beginPath();
                        ctx.arc(x, y, 3 + (layers - layer), 0, Math.PI * 2);
                        ctx.fill();
                        
                        if (i % 2 === 0) {
                            ctx.lineWidth = 0.5;
                            ctx.globalAlpha = 0.1;
                            ctx.beginPath();
                            ctx.moveTo(cx, cy);
                            ctx.lineTo(x, y);
                            ctx.stroke();
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
                        ctx.globalAlpha = 0.12;
                        ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
                    }
                    ctx.lineWidth = 1.5;
                    ctx.globalAlpha = 0.3;
                    ctx.strokeRect(bx, by, bw, bh);
                });
            },

            tree(ctx, w, h, p, density) {
                const drawBranch = (x, y, angle, len, depth) => {
                    if (depth <= 0 || len < 2) return;
                    const endX = x + Math.cos(angle) * len;
                    const endY = y + Math.sin(angle) * len;
                    
                    ctx.lineWidth = depth * 0.8;
                    ctx.globalAlpha = 0.1 + depth * 0.04;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(endX, endY);
                    ctx.stroke();
                    
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
                    let x = p[i % 40] * w;
                    let y = p[(i + 15) % 40] * h;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.globalAlpha = 0.15;
                    
                    for (let j = 0; j < 30; j++) {
                        const angle = (Math.sin(x * 0.005) + Math.cos(y * 0.005)) * Math.PI * 2 + p[20];
                        x += Math.cos(angle) * 5;
                        y += Math.sin(angle) * 5;
                        ctx.lineTo(x, y);
                        if (x < 0 || x > w || y < 0 || y > h) break;
                    }
                    ctx.stroke();
                }
            },

            arcs(ctx, w, h, p, density) {
                const count = Math.floor((15 + p[0] * 20) * density);
                for (let i = 0; i < count; i++) {
                    const cx = p[i % 40] * w;
                    const cy = p[(i + 10) % 40] * h;
                    const r = 20 + p[(i + 20) % 40] * 80;
                    
                    ctx.lineWidth = 1.5;
                    ctx.globalAlpha = 0.12;
                    
                    for (let j = 0; j < 3; j++) {
                        const start = j * Math.PI * 2 / 3 + i * 0.2;
                        ctx.beginPath();
                        ctx.arc(cx, cy, r, start, start + Math.PI * 1.5);
                        ctx.stroke();
                    }
                }
            },

            moire(ctx, w, h, p, density) {
                const count = Math.floor((25 + p[0] * 20) * density);
                const amplitude = 3 + p[1] * 5;
                const frequency = 0.02 + p[2] * 0.02;
                
                ctx.lineWidth = 0.8;
                
                for (let i = 0; i <= count; i++) {
                    const x = (w / count) * i;
                    ctx.globalAlpha = 0.35;
                    ctx.beginPath();
                    for (let y = 0; y <= h; y += 4) {
                        const xOffset = Math.sin(y * frequency + i * 0.5) * amplitude * (i % 3 === 0 ? 1.5 : 0.5);
                        if (y === 0) ctx.moveTo(x + xOffset, y);
                        else ctx.lineTo(x + xOffset, y);
                    }
                    ctx.stroke();
                }
                
                for (let i = 0; i <= count; i++) {
                    const y = (h / count) * i;
                    ctx.globalAlpha = 0.12;
                    ctx.beginPath();
                    for (let x = 0; x <= w; x += 4) {
                        const yOffset = Math.sin(x * frequency + i * 0.5) * amplitude * (i % 3 === 0 ? 1.5 : 0.5);
                        if (x === 0) ctx.moveTo(x, y + yOffset);
                        else ctx.lineTo(x, y + yOffset);
                    }
                    ctx.stroke();
                }
            },

            voronoi(ctx, w, h, p, density) {
                const points = Math.floor((25 + p[0] * 20) * density);
                const seeds = [];
                for (let i = 0; i < points; i++) {
                    seeds.push({x: p[i % 40] * w, y: p[(i + 20) % 40] * h});
                }
                
                ctx.lineWidth = 0.8;
                seeds.forEach((seed, i) => {
                    const neighbors = seeds.map((s, j) => ({
                        dist: Math.hypot(s.x - seed.x, s.y - seed.y),
                        idx: j
                    })).filter(n => n.dist > 0 && n.dist < 70 * density)
                    .sort((a, b) => a.dist - b.dist)
                    .slice(0, 3);
                    
                    ctx.globalAlpha = 0.15;
                    neighbors.forEach(n => {
                        ctx.beginPath();
                        ctx.moveTo(seed.x, seed.y);
                        ctx.lineTo(seeds[n.idx].x, seeds[n.idx].y);
                        ctx.stroke();
                    });
                    
                    ctx.globalAlpha = 0.3;
                    ctx.beginPath();
                    ctx.arc(seed.x, seed.y, 2 + (i % 3), 0, Math.PI * 2);
                    ctx.fill();
                });
            },

            terrain(ctx, w, h, p, density) {
                const lines = Math.floor((25 + p[0] * 20) * density);
                const scale = 0.008 + p[1] * 0.015;
                
                for (let y = 0; y < lines; y++) {
                    const baseY = (h / lines) * y;
                    ctx.beginPath();
                    ctx.globalAlpha = 0.35;
                    ctx.lineWidth = 1;
                    
                    for (let x = 0; x <= w; x += 2) {
                        const elevation = Math.sin(x * scale + y * 0.5) * 10 + 
                                        Math.sin(x * scale * 2.2) * 5 +
                                        Math.sin(x * scale * 4.5) * 2;
                        if (x === 0) ctx.moveTo(x, baseY + elevation);
                        else ctx.lineTo(x, baseY + elevation);
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
                        const t = i / particles;
                        const angle = armAngle + t * Math.PI * 8;
                        const r = t * Math.min(w, h) * 0.45;
                        
                        ctx.globalAlpha = 0.25 * (1 - t);
                        ctx.beginPath();
                        ctx.arc(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 
                            (1 - t) * 3 + 0.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            },

            rays(ctx, w, h, p, density) {
                const rays = Math.floor((20 + p[0] * 15) * density);
                const cx = p[1] * w, cy = p[2] * h;
                
                for (let i = 0; i < rays; i++) {
                    const angle = (Math.PI * 2 * i) / rays + p[3];
                    const len = Math.max(w, h) * 1.2;
                    
                    ctx.globalAlpha = 0.08;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    
                    let curX = cx, curY = cy;
                    for (let j = 1; j <= 4; j++) {
                        const segLen = (len / 4) * j;
                        const tx = cx + Math.cos(angle) * segLen;
                        const ty = cy + Math.sin(angle) * segLen;
                        curX = tx + (p[(i + j) % 40] - 0.5) * 20 * (j / 4);
                        curY = ty + (p[(i + j + 10) % 40] - 0.5) * 20 * (j / 4);
                        ctx.lineTo(curX, curY);
                    }
                    ctx.stroke();
                    
                    ctx.globalAlpha = 0.3;
                    ctx.beginPath();
                    ctx.arc(curX, curY, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            },

            dots(ctx, w, h, p, density) {
                const cols = Math.floor((15 + p[0] * 10) * Math.sqrt(density));
                const rows = Math.floor((20 + p[1] * 10) * Math.sqrt(density));
                const spacingX = w / cols, spacingY = h / rows;
                
                ctx.fillStyle = ctx.strokeStyle;
                for (let i = 0; i < cols; i++) {
                    for (let j = 0; j < rows; j++) {
                        const x = i * spacingX + spacingX/2;
                        const y = j * spacingY + spacingY/2;
                        const size = (Math.sin(i * 0.6) + Math.cos(j * 0.4) + 2) * 1.5 + p[2];
                        
                        ctx.globalAlpha = 0.12 + (Math.sin(i * 0.8 + j * 0.6) + 1) * 0.1;
                        ctx.beginPath();
                        ctx.arc(x, y, Math.max(1, size), 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            },

            maze(ctx, w, h, p, density) {
                const cols = Math.floor((10 + p[0] * 8) * Math.sqrt(density));
                const rows = Math.floor((14 + p[1] * 8) * Math.sqrt(density));
                const cw = w / cols, rh = h / rows;
                
                ctx.lineWidth = 2;
                ctx.lineCap = 'square';
                
                for (let i = 0; i < cols; i++) {
                    for (let j = 0; j < rows; j++) {
                        if (((i * 7 + j * 13 + Math.floor(p[2] * 100)) % 5) < 3) {
                            ctx.globalAlpha = 0.3;
                            if ((i + j) % 2 === 0) {
                                ctx.beginPath();
                                ctx.moveTo((i + 1) * cw, j * rh);
                                ctx.lineTo((i + 1) * cw, (j + 1) * rh);
                                ctx.stroke();
                            } else {
                                ctx.beginPath();
                                ctx.moveTo(i * cw, (j + 1) * rh);
                                ctx.lineTo((i + 1) * cw, (j + 1) * rh);
                                ctx.stroke();
                            }
                        }
                    }
                }
            },

            crystal(ctx, w, h, p, density) {
                const cells = Math.floor((8 + p[0] * 6) * Math.sqrt(density));
                
                for (let i = 0; i < cells; i++) {
                    const x = p[i % 40] * w;
                    const y = p[(i + 15) % 40] * h;
                    const size = 25 + p[(i + 30) % 40] * 60;
                    
                    ctx.globalAlpha = 0.35;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(x, y - size);
                    ctx.lineTo(x + size * 0.7, y);
                    ctx.lineTo(x, y + size);
                    ctx.lineTo(x - size * 0.7, y);
                    ctx.closePath();
                    ctx.stroke();
                    
                    ctx.globalAlpha = 0.15;
                    ctx.beginPath();
                    ctx.moveTo(x, y - size);
                    ctx.lineTo(x, y + size);
                    ctx.moveTo(x - size * 0.7, y);
                    ctx.lineTo(x + size * 0.7, y);
                    ctx.stroke();
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
                    
                    ctx.globalAlpha = 0.15 + t * 0.2;
                    ctx.lineWidth = Math.max(0.5, 2.5 - t * 2);
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.stroke();
                }
                
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.arc(cx, cy, 4, 0, Math.PI * 2);
                ctx.fill();
            },

            textile(ctx, w, h, p, density) {
                const threads = Math.floor((20 + p[0] * 15) * density);
                const spacing = h / threads;
                ctx.lineWidth = 2;
                
                for (let i = 0; i < threads; i++) {
                    const y = i * spacing;
                    ctx.globalAlpha = 0.3;
                    ctx.beginPath();
                    for (let x = 0; x <= w; x += 4) {
                        const yOffset = (i % 2 === 0 ? 1 : -1) * Math.sin(x * 0.04) * 4;
                        if (x === 0) ctx.moveTo(x, y + yOffset);
                        else ctx.lineTo(x, y + yOffset);
                    }
                    ctx.stroke();
                    
                    if (i % 4 === 0) {
                        ctx.globalAlpha = 0.2;
                        ctx.beginPath();
                        for (let x = 0; x <= w; x += 6) {
                            const weave = Math.sin(x * 0.08 + i) * 5;
                            if (x === 0) ctx.moveTo(x, y + spacing/2 + weave);
                            else ctx.lineTo(x, y + spacing/2 + weave);
                        }
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
                    
                    ctx.globalAlpha = 0.3 + (i / ripples) * 0.15;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.stroke();
                    
                    const dots = 8;
                    for (let j = 0; j < dots; j++) {
                        const angle = (Math.PI * 2 * j) / dots + i * 0.15;
                        ctx.globalAlpha = 0.35;
                        ctx.fillRect(cx + Math.cos(angle) * r - 1.5, cy + Math.sin(angle) * r - 1.5, 3, 3);
                    }
                }
            },

            trails(ctx, w, h, p, density) {
                const count = Math.floor((30 + p[0] * 25) * density);
                
                for (let i = 0; i < count; i++) {
                    const x = p[i % 40] * w;
                    const y = p[(i + 15) % 40] * h;
                    const angle = p[(i + 30) % 40] * Math.PI * 2;
                    const len = 15 + p[(i + 5) % 40] * 50;
                    
                    ctx.globalAlpha = 0.2;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
                    ctx.stroke();
                    
                    ctx.globalAlpha = 0.4;
                    ctx.beginPath();
                    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            },

            constellation(ctx, w, h, p, density) {
                const stars = Math.floor((20 + p[0] * 15) * density);
                const positions = [];
                
                for (let i = 0; i < stars; i++) {
                    positions.push({
                        x: p[i % 40] * w,
                        y: p[(i + 20) % 40] * h,
                        size: 1.5 + p[(i + 30) % 40] * 3.5
                    });
                }
                
                ctx.lineWidth = 0.8;
                ctx.globalAlpha = 0.2;
                
                for (let i = 0; i < positions.length; i++) {
                    for (let j = i + 1; j < positions.length; j++) {
                        const dist = Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y);
                        if (dist < 70) {
                            ctx.beginPath();
                            ctx.moveTo(positions[i].x, positions[i].y);
                            ctx.lineTo(positions[j].x, positions[j].y);
                            ctx.stroke();
                        }
                    }
                }
                
                positions.forEach(pos => {
                    ctx.globalAlpha = 0.9;
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, pos.size, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.globalAlpha = 0.3;
                    ctx.lineWidth = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(pos.x - pos.size * 4, pos.y);
                    ctx.lineTo(pos.x + pos.size * 4, pos.y);
                    ctx.moveTo(pos.x, pos.y - pos.size * 4);
                    ctx.lineTo(pos.x, pos.y + pos.size * 4);
                    ctx.stroke();
                });
            },

            paperplane(ctx, w, h, p, density) {
                const planes = Math.floor((4 + p[0] * 6) * density);
                
                for (let i = 0; i < planes; i++) {
                    const x = p[i % 40] * w;
                    const y = p[(i + 15) % 40] * h;
                    const angle = -Math.PI / 4 + (p[(i + 25) % 40] - 0.5) * 0.8;
                    const size = 12 + p[(i + 35) % 40] * 30;
                    
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(angle);
                    ctx.globalAlpha = 0.5;
                    ctx.lineWidth = 1.5;
                    
                    ctx.beginPath();
                    ctx.moveTo(0, -size);
                    ctx.lineTo(size * 0.6, size * 0.3);
                    ctx.lineTo(0, size * 0.1);
                    ctx.lineTo(-size * 0.6, size * 0.3);
                    ctx.closePath();
                    ctx.stroke();
                    
                    ctx.globalAlpha = 0.3;
                    ctx.setLineDash([4, 8]);
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(-size * 2.5, size * 2.5);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.restore();
                }
            },

            rain(ctx, w, h, p, density) {
                const drops = Math.floor((40 + p[0] * 40) * density);
                
                for (let i = 0; i < drops; i++) {
                    const x = p[i % 40] * w;
                    const y = p[(i + 20) % 40] * h;
                    const len = 8 + p[(i + 30) % 40] * 25;
                    
                    ctx.globalAlpha = 0.2;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x - 3, y + len);
                    ctx.stroke();
                }
            },

            circuit(ctx, w, h, p, density) {
                const nodes = Math.floor((12 + p[0] * 10) * density);
                const nodePos = [];
                
                for (let i = 0; i < nodes; i++) {
                    nodePos.push({
                        x: 0.08 + p[i % 40] * 0.84,
                        y: 0.08 + p[(i + 20) % 40] * 0.84
                    });
                }
                
                ctx.lineWidth = 2;
                ctx.lineCap = 'square';
                
                nodePos.forEach((node, i) => {
                    nodePos.slice(i + 1).forEach(other => {
                        if (Math.abs(node.x - other.x) < 0.25 || Math.abs(node.y - other.y) < 0.25) {
                            ctx.globalAlpha = 0.25;
                            ctx.beginPath();
                            ctx.moveTo(node.x * w, node.y * h);
                            
                            if (Math.abs(node.x - other.x) < 0.25) {
                                ctx.lineTo(node.x * w, other.y * h);
                            } else {
                                ctx.lineTo(other.x * w, node.y * h);
                            }
                            ctx.lineTo(other.x * w, other.y * h);
                            ctx.stroke();
                        }
                    });
                    
                    ctx.globalAlpha = 0.6;
                    ctx.fillRect(node.x * w - 3, node.y * h - 3, 6, 6);
                });
            },

            glitch(ctx, w, h, p, density) {
                const slices = Math.floor((12 + p[0] * 15) * density);
                
                for (let i = 0; i < slices; i++) {
                    const y = (h / slices) * i;
                    const offset = (p[i % 40] - 0.5) * 30 * ((i % 3) + 1);
                    
                    ctx.globalAlpha = 0.15;
                    ctx.fillRect(0, y, w, h / slices);
                    
                    if (i % 2 === 0) {
                        ctx.globalAlpha = 0.25;
                        ctx.fillRect(offset, y, w, h / slices);
                    }
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
                        
                        ctx.globalAlpha = 0.4 + (p[(i * cols + j) % 40] * 0.4);
                        ctx.beginPath();
                        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
                        ctx.fill();
                        
                        if (j < cols - 1) {
                            ctx.globalAlpha = 0.2;
                            ctx.lineWidth = 0.5;
                            ctx.beginPath();
                            ctx.moveTo(x + dotSize, y);
                            ctx.lineTo(x + spacingX - dotSize, y);
                            ctx.stroke();
                            ctx.globalAlpha = 0.4 + (p[(i * cols + j) % 40] * 0.4);
                        }
                    }
                }
            },

            origami(ctx, w, h, p, density) {
                const folds = Math.floor((4 + p[0] * 4) * density);
                
                for (let i = 0; i < folds; i++) {
                    const x1 = p[i % 40] * w;
                    const y1 = p[(i + 15) % 40] * h;
                    const x2 = p[(i + 30) % 40] * w;
                    const y2 = p[(i + 5) % 40] * h;
                    
                    ctx.globalAlpha = 0.35;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                    
                    ctx.globalAlpha = 0.12;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x1 + (x2 - x1) * 0.5 + 15, y1 + (y2 - y1) * 0.5);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
            },

            fibonacci(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const phi = 1.618033988749;
                const count = Math.floor((12 + p[0] * 8) * density);
                
                for (let i = 0; i < count; i++) {
                    const r = 10 * Math.pow(phi, i / 2) * (1 + p[1]);
                    const angle = i * Math.PI * 2 / phi;
                    
                    ctx.globalAlpha = 0.35 - (i / count) * 0.15;
                    ctx.lineWidth = 2 - (i / count);
                    ctx.beginPath();
                    ctx.arc(cx + Math.cos(angle) * r * 0.3, cy + Math.sin(angle) * r * 0.3, r, angle, angle + Math.PI * 1.618);
                    ctx.stroke();
                }
            },

            cardioid(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const scale = Math.min(w, h) * 0.4;
                const count = Math.floor((3 + p[0] * 5) * density);
                
                for (let j = 0; j < count; j++) {
                    ctx.globalAlpha = 0.35;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    
                    for (let t = 0; t <= Math.PI * 2; t += 0.05) {
                        const a = scale * (0.5 + j * 0.3);
                        const r = a * (1 - Math.sin(t));
                        const x = cx + r * Math.cos(t) + (p[1] - 0.5) * 20;
                        const y = cy + r * Math.sin(t) * 0.9;
                        
                        if (t === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
            },

            rose(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const petals = 3 + Math.floor(p[0] * 8);
                const scale = Math.min(w, h) * 0.4;
                const layers = Math.floor((3 + p[1] * 4) * density);
                
                for (let layer = 0; layer < layers; layer++) {
                    ctx.globalAlpha = 0.2 - layer * 0.03;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    
                    for (let t = 0; t <= Math.PI * 2; t += 0.02) {
                        const r = scale * (1 - layer * 0.15) * Math.cos(petals * t);
                        const x = cx + r * Math.cos(t);
                        const y = cy + r * Math.sin(t);
                        
                        if (t === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
            },

            lissajous(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const scaleX = w * 0.4;
                const scaleY = h * 0.4;
                const a = 3 + Math.floor(p[0] * 4);
                const b = 2 + Math.floor(p[1] * 4);
                const delta = p[2] * Math.PI;
                const count = Math.floor((8 + p[3] * 8) * density);
                
                for (let i = 0; i < count; i++) {
                    ctx.globalAlpha = 0.2 - (i / count) * 0.15;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    
                    for (let t = 0; t <= Math.PI * 2; t += 0.02) {
                        const phase = i * 0.1;
                        const x = cx + scaleX * Math.sin(a * t + delta + phase);
                        const y = cy + scaleY * Math.sin(b * t + phase);
                        
                        if (t === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
            },

            phyllotaxis(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const count = Math.floor((80 + p[0] * 100) * density);
                const angle = 137.508 * (Math.PI / 180);
                const spread = 6 + p[1] * 4;
                
                for (let i = 0; i < count; i++) {
                    const r = spread * Math.sqrt(i);
                    const theta = i * angle;
                    const x = cx + r * Math.cos(theta);
                    const y = cy + r * Math.sin(theta);
                    
                    if (x < 0 || x > w || y < 0 || y > h) continue;
                    
                    const size = 2 + (i / count) * 4;
                    ctx.globalAlpha = 0.3 - (i / count) * 0.2;
                    ctx.beginPath();
                    ctx.arc(x, y, size, 0, Math.PI * 2);
                    ctx.fill();
                }
            },

            superellipse(ctx, w, h, p, density) {
                const cx = w / 2;
                const cy = h / 2;
                
                // 层数随密度增加（更多细微变化）
                const layers = Math.floor((6 + p[0] * 10) * density);
                const maxR = Math.min(w, h) * 0.45;
                
                // 级次参数定义（从外到内的进化路径）
                const nStart = 0.6 + p[1] * 1.0;   // 起始：尖角星形 (n<1)
                const nEnd = 4 + p[2] * 4;         // 结束：超方圆 (n>4)
                const rotAccum = (0.03 + p[3] * 0.12) * Math.PI; // 每级累积旋转（螺旋扭转）
                const baseRot = p[4] * Math.PI * 2;
                
                for (let i = 0; i < layers; i++) {
                    const t = i / (layers - 1); // 0(外) → 1(内) 的级次
                    
                    // 1. 曲率指数 n 的非线性级次变化
                    // 使用幂函数使变化先快后慢（或反之），产生韵律感
                    const nCurve = Math.pow(t, 0.7); // 缓动曲线
                    const n = nStart + (nEnd - nStart) * nCurve;
                    
                    // 2. 旋转级次（累积扭转，形成螺旋进动）
                    const rotation = baseRot + i * rotAccum;
                    
                    // 3. 半径级次（非线性衰减，内层更密）
                    const rDecay = Math.pow(1 - t, 1.2); // 内层收缩更快
                    const r = maxR * rDecay;
                    
                    // 4. 视觉属性级次
                    ctx.lineWidth = 2.2 - t * 1.5; // 外粗内细
                    ctx.globalAlpha = 0.08 + (1 - t) * 0.6; // 外淡内浓（强调中心）
                    
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(rotation);
                    
                    // 绘制超椭圆：|x/a|^n + |y/b|^n = 1
                    ctx.beginPath();
                    const steps = 120; // 平滑度
                    
                    for (let j = 0; j <= steps; j++) {
                        const theta = (j / steps) * Math.PI * 2;
                        const cosT = Math.cos(theta);
                        const sinT = Math.sin(theta);
                        
                        // 超椭圆参数方程（带符号处理）
                        const x = r * Math.sign(cosT) * Math.pow(Math.abs(cosT), 2/n);
                        const y = r * Math.sign(sinT) * Math.pow(Math.abs(sinT), 2/n);
                        
                        if (j === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    
                    ctx.closePath();
                    ctx.stroke();
                    ctx.restore();
                }
                
                // 5. 中心核心（n=2的完美圆，作为视觉锚点）
                ctx.globalAlpha = 0.9;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, maxR * 0.06, 0, Math.PI * 2);
                ctx.stroke();
            },

            tessellation(ctx, w, h, p, density) {
                const cols = Math.floor((5 + p[0] * 5) * Math.sqrt(density));
                const cellSize = w / cols;
                const rows = Math.floor(h / cellSize);
                const startY = (h - rows * cellSize) / 2;
                
                const gap = cellSize * (0.08 + p[1] * 0.07);
                const drawSize = cellSize - gap;
                
                for (let i = 0; i < cols; i++) {
                    for (let j = 0; j < rows; j++) {
                        const x = i * cellSize + gap/2;
                        const y = startY + j * cellSize + gap/2;
                        const type = (i + j + Math.floor(p[2] * 3)) % 3;
                        
                        ctx.globalAlpha = 0.4;
                        ctx.lineWidth = 1.2;
                        
                        if (type === 0) {
                            // 关键修改：正方形 → 六边形（平顶）
                            const cx = x + drawSize/2;
                            const cy = y + drawSize/2;
                            const r = drawSize * 0.45; // 内切半径
                            
                            ctx.beginPath();
                            for (let k = 0; k < 6; k++) {
                                // 从 -30° 开始，使上下边水平（平顶六边形）
                                const angle = (k * Math.PI) / 3 - Math.PI / 6;
                                const hx = cx + r * Math.cos(angle);
                                const hy = cy + r * Math.sin(angle);
                                if (k === 0) ctx.moveTo(hx, hy);
                                else ctx.lineTo(hx, hy);
                            }
                            ctx.closePath();
                            ctx.stroke();
                            
                        } else if (type === 1) {
                            // 菱形（保持）
                            const cx = x + drawSize/2;
                            const cy = y + drawSize/2;
                            const half = drawSize * 0.45;
                            
                            ctx.beginPath();
                            ctx.moveTo(cx, y);
                            ctx.lineTo(x + drawSize, cy);
                            ctx.lineTo(cx, y + drawSize);
                            ctx.lineTo(x, cy);
                            ctx.closePath();
                            ctx.stroke();
                            
                        } else {
                            // 三角形（保持）
                            ctx.beginPath();
                            if ((i + j) % 2 === 0) {
                                ctx.moveTo(x + drawSize/2, y);
                                ctx.lineTo(x + drawSize, y + drawSize);
                                ctx.lineTo(x, y + drawSize);
                            } else {
                                ctx.moveTo(x, y);
                                ctx.lineTo(x + drawSize, y);
                                ctx.lineTo(x + drawSize/2, y + drawSize);
                            }
                            ctx.closePath();
                            ctx.stroke();
                        }
                    }
                }
            },

            halftone(ctx, w, h, p, density) {
                const spacing = 8 / density;
                for (let x = 0; x < w; x += spacing) {
                    for (let y = 0; y < h; y += spacing) {
                        const dist = Math.hypot(x - w/2, y - h/2);
                        const radius = (Math.sin(dist * 0.05) + 1) * 1.5 * (p[0] + 0.5);
                        ctx.globalAlpha = 0.6;
                        ctx.beginPath();
                        ctx.arc(x, y, radius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            },

            kintsugi(ctx, w, h, p, density) {
                const accentColor = ctx.strokeStyle;
                const cracks = Math.floor((4 + p[0] * 6) * density);
                
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                for (let i = 0; i < cracks; i++) {
                    // 起始点
                    let x = p[i * 5] * w;
                    let y = p[(i * 5 + 1) % 40] * h;
                    
                    // 自然弯曲的裂纹路径（3-5个控制点）
                    const points = [{x, y}];
                    const segments = 3 + Math.floor(p[(i + 2) % 40] * 3);
                    const len = 60 + p[(i + 3) % 40] * 120;
                    
                    for (let j = 1; j <= segments; j++) {
                        const t = j / segments;
                        // 随机游走式弯曲（自然断裂）
                        x += (p[(i + j * 2) % 40] - 0.5) * len * 0.4;
                        y += (p[(i + j * 2 + 1) % 40] - 0.5) * len * 0.4;
                        // 总体趋势向外扩散
                        x += Math.cos(p[(i + 4) % 40] * Math.PI * 2) * len * 0.3 * t;
                        y += Math.sin(p[(i + 4) % 40] * Math.PI * 2) * len * 0.3 * t;
                        points.push({x, y});
                    }
                    
                    // 偶尔分叉（简单的一次性分叉，不递归）
                    const hasBranch = p[(i + 5) % 40] > 0.6;
                    
                    // 绘制主裂纹（单一粗细，自然透明度变化）
                    ctx.globalAlpha = 0.6 + p[i % 40] * 0.3;
                    ctx.lineWidth = 1.5 + p[(i + 1) % 40] * 1.5;
                    ctx.strokeStyle = accentColor;
                    
                    ctx.beginPath();
                    ctx.moveTo(points[0].x, points[0].y);
                    // 使用二次曲线使线条更自然顺滑
                    for (let j = 1; j < points.length - 1; j++) {
                        const xc = (points[j].x + points[j + 1].x) / 2;
                        const yc = (points[j].y + points[j + 1].y) / 2;
                        ctx.quadraticCurveTo(points[j].x, points[j].y, xc, yc);
                    }
                    if (points.length > 1) {
                        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
                    }
                    ctx.stroke();
                    
                    // 简单分叉（短小细线）
                    if (hasBranch && points.length > 2) {
                        const branchIdx = Math.floor(points.length * 0.6);
                        const bx = points[branchIdx].x;
                        const by = points[branchIdx].y;
                        const branchLen = len * 0.3;
                        const branchAngle = Math.atan2(
                            points[branchIdx].y - points[branchIdx - 1].y,
                            points[branchIdx].x - points[branchIdx - 1].x
                        ) + (p[(i + 6) % 40] - 0.5);
                        
                        ctx.globalAlpha = 0.4;
                        ctx.lineWidth = 0.8;
                        ctx.beginPath();
                        ctx.moveTo(bx, by);
                        ctx.quadraticCurveTo(
                            bx + Math.cos(branchAngle) * branchLen * 0.5 + (p[(i+7)%40]-0.5)*10,
                            by + Math.sin(branchAngle) * branchLen * 0.5 + (p[(i+8)%40]-0.5)*10,
                            bx + Math.cos(branchAngle) * branchLen,
                            by + Math.sin(branchAngle) * branchLen
                        );
                        ctx.stroke();
                    }
                }
                
                // 细微填充裂纹（更淡更细，增加自然密度）
                const microCracks = Math.floor(8 * density);
                ctx.globalAlpha = 0.25;
                ctx.lineWidth = 0.6;
                
                for (let i = 0; i < microCracks; i++) {
                    const x1 = p[i * 2] * w;
                    const y1 = p[(i * 2 + 1) % 40] * h;
                    const angle = p[(i + 20) % 40] * Math.PI * 2;
                    const len = 15 + p[(i + 30) % 40] * 30;
                    
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(
                        x1 + Math.cos(angle) * len,
                        y1 + Math.sin(angle) * len
                    );
                    ctx.stroke();
                }
            },

            contour(ctx, w, h, p, density) {
                const centers = 3 + Math.floor(p[0] * 4);
                
                for (let c = 0; c < centers; c++) {
                    const cx = p[c*3] * w;
                    const cy = p[(c*3+1) % 40] * h;
                    const maxR = Math.min(w, h) * (0.15 + p[(c*3+2) % 40] * 0.25);
                    const rings = Math.floor((8 + p[c] * 6) * density);
                    
                    for (let i = 0; i < rings; i++) {
                        const r = maxR * (i / rings);
                        if (r < 3) continue;
                        
                        ctx.globalAlpha = 0.35 - (i / rings) * 0.15;
                        ctx.lineWidth = (i % 2 === 0) ? 1.2 : 0.6;
                        
                        ctx.beginPath();
                        for (let angle = 0; angle <= Math.PI * 2; angle += 0.03) {
                            const noise1 = Math.sin(angle * 3 + c * 2) * 0.4;
                            const noise2 = Math.cos(angle * 5 + i) * 0.25;
                            const noise3 = Math.sin(angle * 8 + p[c]) * 0.15;
                            const deformR = r * (1 + (noise1 + noise2 + noise3) * 0.5);
                            
                            const x = cx + deformR * Math.cos(angle);
                            const y = cy + deformR * Math.sin(angle);
                            
                            if (angle === 0) ctx.moveTo(x, y);
                            else ctx.lineTo(x, y);
                        }
                        ctx.closePath();
                        ctx.stroke();
                    }
                }
            },

            noiseField(ctx, w, h, p, density) {
                const step = 4;
                for (let x = 0; x < w; x += step) {
                    for (let y = 0; y < h; y += step) {
                        const noise = Math.sin(x * 0.03) * Math.cos(y * 0.03) * Math.sin((x+y) * 0.01);
                        ctx.globalAlpha = Math.abs(noise) * 0.25 * density;
                        ctx.fillRect(x, y, step, step);
                    }
                }
            },

            isometric(ctx, w, h, p, density) {
                const size = 30 / density;
                ctx.lineWidth = 0.8;
                for (let y = -h; y < h * 2; y += size * 0.866) {
                    for (let x = -w; x < w * 2; x += size) {
                        const offset = (Math.floor(y / (size * 0.866)) % 2) * (size / 2);
                        ctx.globalAlpha = 0.35;
                        ctx.beginPath();
                        ctx.moveTo(x + offset, y);
                        ctx.lineTo(x + offset + size/2, y - size * 0.433);
                        ctx.lineTo(x + offset + size, y);
                        ctx.lineTo(x + offset + size/2, y + size * 0.433);
                        ctx.closePath();
                        ctx.stroke();
                    }
                }
            },

            turing(ctx, w, h, p, density) {
                const spots = Math.floor((15 + p[0] * 25) * density);
                for (let i = 0; i < spots; i++) {
                    const cx = p[i % 40] * w;
                    const cy = p[(i + 10) % 40] * h;
                    const r = 10 + p[(i + 20) % 40] * 40;
                    
                    ctx.globalAlpha = 0.3;
                    ctx.beginPath();
                    for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
                        const noise = Math.sin(angle * 3 + i) * Math.cos(angle * 5) * 3;
                        const x = cx + (r + noise) * Math.cos(angle);
                        const y = cy + (r + noise) * Math.sin(angle);
                        if (angle === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    ctx.fill();
                    
                    ctx.globalAlpha = 0.15;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
                    ctx.stroke();
                }
            },

            dendrite(ctx, w, h, p, density) {
                const centers = Math.floor((2 + p[0] * 3) * density);
                
                for (let c = 0; c < centers; c++) {
                    const cx = (0.2 + p[c*4] * 0.6) * w;
                    const cy = (0.2 + p[(c*4+1)%40] * 0.6) * h;
                    const branches = 6 + Math.floor(p[(c*4+2)%40] * 6);
                    
                    for (let i = 0; i < branches; i++) {
                        const angle = (Math.PI * 2 * i) / branches + p[(c*4+3)%40];
                        let x = cx, y = cy;
                        let len = 20 + p[i%40] * 60;
                        
                        ctx.globalAlpha = 0.4;
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        
                        for (let gen = 0; gen < 4; gen++) {
                            const subBranches = gen < 2 ? 2 : 1;
                            for (let sb = 0; sb < subBranches; sb++) {
                                const subAngle = angle + (sb - 0.5) * 0.4 * (gen + 1);
                                const subLen = len * Math.pow(0.6, gen);
                                const ex = x + Math.cos(subAngle) * subLen;
                                const ey = y + Math.sin(subAngle) * subLen;
                                ctx.lineTo(ex, ey);
                                ctx.moveTo(ex, ey);
                            }
                        }
                        ctx.stroke();
                    }
                }
            },

            droste(ctx, w, h, p, density) {
                let size = Math.min(w, h) * 0.9;
                let x = (w - size) / 2;
                let y = (h - size) / 2;
                const count = Math.floor((8 + p[0] * 12) * density);
                const rotStep = (p[1] - 0.5) * 0.1;
                
                ctx.save();
                ctx.translate(w/2, h/2);
                
                for (let i = 0; i < count; i++) {
                    const scale = Math.pow(0.85, i);
                    const rotation = i * rotStep;
                    
                    ctx.save();
                    ctx.scale(scale, scale);
                    ctx.rotate(rotation);
                    
                    ctx.globalAlpha = 0.25 - (i / count) * 0.15;
                    ctx.lineWidth = 2 / scale;
                    ctx.strokeRect(-size/2, -size/2, size, size);
                    
                    if (i % 2 === 0) {
                        ctx.globalAlpha = 0.1;
                        ctx.beginPath();
                        ctx.moveTo(-size/2, 0);
                        ctx.lineTo(size/2, 0);
                        ctx.moveTo(0, -size/2);
                        ctx.lineTo(0, size/2);
                        ctx.stroke();
                    }
                    
                    ctx.restore();
                }
                
                ctx.restore();
            },

            inkBleed(ctx, w, h, p, density) {
                const drops = Math.floor((3 + p[0] * 5) * density);
                
                for (let i = 0; i < drops; i++) {
                    const cx = p[i*5] * w;
                    const cy = p[(i*5+1)%40] * h;
                    const maxR = 50 + p[(i*5+2)%40] * 100;
                    
                    for (let r = maxR; r > 0; r -= 3) {
                        const alpha = 0.05 * (r / maxR);
                        ctx.globalAlpha = alpha;
                        
                        ctx.beginPath();
                        for (let angle = 0; angle <= Math.PI * 2; angle += 0.2) {
                            const irregular = Math.sin(angle * 4 + i) * 2 + Math.cos(angle * 7) * 1.5;
                            const x = cx + (r + irregular) * Math.cos(angle);
                            const y = cy + (r + irregular) * Math.sin(angle);
                            if (angle === 0) ctx.moveTo(x, y);
                            else ctx.lineTo(x, y);
                        }
                        ctx.closePath();
                        ctx.fill();
                    }
                    
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            },

            snowflake(ctx, w, h, p, density) {
                const cx = w / 2, cy = h / 2;
                const maxRadius = Math.min(w, h) * 0.4;
                const arms = 6;
                
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                for (let arm = 0; arm < arms; arm++) {
                    const baseAngle = (arm * Math.PI * 2) / 6;
                    
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(baseAngle);
                    
                    const mainLen = maxRadius * (0.75 + p[arm % 40] * 0.15);
                    const branches = Math.floor((3 + p[(arm + 5) % 40] * 3) * density);
                    
                    ctx.globalAlpha = 0.8;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(0, -mainLen);
                    ctx.stroke();
                    
                    for (let i = 1; i <= branches; i++) {
                        const pos = (i / (branches + 1)) * mainLen;
                        const branchLen = mainLen * 0.4 * (1 - i / (branches + 1));
                        
                        for (let side of [-1, 1]) {
                            ctx.save();
                            ctx.translate(0, -pos);
                            ctx.rotate(side * (Math.PI / 4 + (p[(arm + i) % 40] - 0.5) * 0.1));
                            
                            ctx.globalAlpha = 0.6 - (i / branches) * 0.3;
                            ctx.lineWidth = 1.5 - (i / branches) * 0.8;
                            ctx.beginPath();
                            ctx.moveTo(0, 0);
                            ctx.lineTo(0, -branchLen);
                            ctx.stroke();
                            
                            if (i < branches && p[(arm + i * 2) % 40] > 0.3) {
                                ctx.translate(0, -branchLen * 0.6);
                                ctx.rotate(side * Math.PI / 6);
                                ctx.globalAlpha = 0.4;
                                ctx.lineWidth = 0.8;
                                ctx.beginPath();
                                ctx.moveTo(0, 0);
                                ctx.lineTo(0, -branchLen * 0.3);
                                ctx.stroke();
                            }
                            
                            ctx.restore();
                        }
                    }
                    
                    ctx.translate(0, -mainLen);
                    ctx.globalAlpha = 0.5;
                    ctx.lineWidth = 1;
                    for (let k = 0; k < 6; k++) {
                        ctx.save();
                        ctx.rotate((k * Math.PI * 2) / 6);
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.lineTo(0, -8);
                        ctx.stroke();
                        ctx.restore();
                    }
                    
                    ctx.restore();
                }
                
                ctx.globalAlpha = 0.9;
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (i * Math.PI * 2) / 6;
                    const r = 12;
                    const x = cx + r * Math.cos(angle);
                    const y = cy + r * Math.sin(angle);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.stroke();
                
                ctx.globalAlpha = 0.08;
                ctx.lineWidth = 0.5;
                for (let ring = 1; ring <= 3; ring++) {
                    ctx.beginPath();
                    const r = maxRadius * 0.3 * ring;
                    for (let i = 0; i <= 6; i++) {
                        const angle = (i * Math.PI * 2) / 6;
                        const x = cx + r * Math.cos(angle);
                        const y = cy + r * Math.sin(angle);
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
            },

            sunburst(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const rays = Math.floor((24 + p[0] * 16) * density);
                const maxLen = Math.min(w, h) * 0.5;
                for (let i = 0; i < rays; i++) {
                    const angle = (Math.PI * 2 * i) / rays + p[1] * 0.2;
                    const len = maxLen * (0.4 + p[i % 40] * 0.6);
                    const width = 1 + (i % 5) * 0.8;
                    ctx.lineWidth = width;
                    ctx.globalAlpha = 0.15 + (p[(i + 10) % 40] * 0.25);
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(angle) * maxLen * 0.1, cy + Math.sin(angle) * maxLen * 0.1);
                    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
                    ctx.stroke();
                }
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.arc(cx, cy, maxLen * 0.08, 0, Math.PI * 2);
                ctx.fill();
            },

            bricks(ctx, w, h, p, density) {
                const rows = Math.floor((8 + p[0] * 6) * Math.sqrt(density));
                const cols = Math.floor((6 + p[1] * 4) * Math.sqrt(density));
                const brickH = h / rows;
                const brickW = w / cols;
                ctx.lineWidth = 1.5;
                for (let row = 0; row < rows; row++) {
                    const offset = (row % 2) * (brickW / 2);
                    for (let col = -1; col < cols; col++) {
                        const x = col * brickW + offset;
                        const y = row * brickH;
                        if (p[(row * cols + col + 20) % 40] > 0.15) {
                            ctx.globalAlpha = 0.12 + (p[(row * cols + col) % 40] * 0.15);
                            ctx.strokeRect(x + 2, y + 2, brickW - 4, brickH - 4);
                            if (p[(row * cols + col + 30) % 40] > 0.85) {
                                ctx.globalAlpha = 0.08;
                                ctx.beginPath();
                                ctx.moveTo(x + 5, y + brickH/2);
                                ctx.lineTo(x + brickW - 5, y + brickH/2);
                                ctx.stroke();
                            }
                        }
                    }
                }
            },

            maple(ctx, w, h, p, density) {
                const drawLeaf = (x, y, scale, rotation) => {
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(rotation);
                    ctx.globalAlpha = 0.35;
                    ctx.lineWidth = 1.5;
                    
                    const s = scale;
                    
                    // 简化的优雅枫叶形状 - 五角星形但更圆润
                    ctx.beginPath();
                    // 从顶部开始，顺时针绘制
                    ctx.moveTo(0, -s);                    // 顶部尖
                    ctx.quadraticCurveTo(s * 0.15, -s * 0.7, s * 0.5, -s * 0.6);  // 右上肩
                    ctx.lineTo(s * 0.85, -s * 0.75);     // 右上尖
                    ctx.quadraticCurveTo(s * 0.6, -s * 0.35, s * 0.5, 0);         // 右凹
                    ctx.lineTo(s * 0.9, s * 0.2);        // 右下尖
                    ctx.quadraticCurveTo(s * 0.35, s * 0.3, s * 0.15, s * 0.6);   // 右下肩
                    ctx.lineTo(0, s * 0.9);              // 底部尖（叶柄连接）
                    ctx.lineTo(-s * 0.15, s * 0.6);      // 左下肩
                    ctx.quadraticCurveTo(-s * 0.35, s * 0.3, -s * 0.9, s * 0.2);  // 左下尖
                    ctx.lineTo(-s * 0.5, 0);             // 左凹
                    ctx.quadraticCurveTo(-s * 0.6, -s * 0.35, -s * 0.85, -s * 0.75); // 左上尖
                    ctx.lineTo(-s * 0.5, -s * 0.6);      // 左上肩
                    ctx.quadraticCurveTo(-s * 0.15, -s * 0.7, 0, -s);             // 回到顶部
                    ctx.closePath();
                    ctx.stroke();
                    
                    // 主叶脉
                    ctx.globalAlpha = 0.25;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(0, -s * 0.85);
                    ctx.lineTo(0, s * 0.75);
                    ctx.stroke();
                    
                    // 侧叶脉（简化）
                    ctx.globalAlpha = 0.2;
                    const veins = [
                        {x: s * 0.6, y: -s * 0.4},   // 右上
                        {x: s * 0.65, y: 0.1},       // 右中
                        {x: s * 0.4, y: 0.45},       // 右下
                        {x: -s * 0.6, y: -s * 0.4},  // 左上
                        {x: -s * 0.65, y: 0.1},      // 左中
                        {x: -s * 0.4, y: 0.45},      // 左下
                    ];
                    veins.forEach(v => {
                        ctx.beginPath();
                        ctx.moveTo(0, -s * 0.1);
                        ctx.lineTo(v.x, v.y);
                        ctx.stroke();
                    });
                    
                    ctx.restore();
                };
                
                // 散落放置，大尺寸
                const count = Math.floor((6 + p[0] * 8) * density);
                const sizes = [55, 45, 38]; // 大、中、小三种规格
                
                for (let i = 0; i < count; i++) {
                    const x = p[i * 3 % 40] * w;
                    const y = p[(i * 3 + 15) % 40] * h;
                    const sizeIdx = Math.floor(p[(i + 30) % 40] * sizes.length);
                    const scale = sizes[sizeIdx];
                    const rotation = p[(i + 5) % 40] * Math.PI * 2;
                    drawLeaf(x, y, scale, rotation);
                }
            },

            typewriter(ctx, w, h, p, density) {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*';
                const lines = Math.floor((12 + p[0] * 8) * density);
                const charsPerLine = Math.floor((15 + p[1] * 10) * density);
                for (let line = 0; line < lines; line++) {
                    const y = (h / lines) * line + (h / lines) * 0.7;
                    const lineOffset = (line % 2) * 10;
                    for (let i = 0; i < charsPerLine; i++) {
                        if (p[(line * charsPerLine + i + 10) % 40] > 0.3) {
                            const x = (w / charsPerLine) * i + lineOffset;
                            const char = chars[Math.floor(p[(line * charsPerLine + i) % 40] * chars.length)];
                            const size = 10 + p[(line * charsPerLine + i + 20) % 40] * 14;
                            ctx.globalAlpha = 0.3 + p[(line * charsPerLine + i + 5) % 40] * 0.2;
                            ctx.font = `${Math.floor(size)}px monospace`;
                            ctx.fillText(char, x, y);
                        }
                    }
                }
            },

            shanshui(ctx, w, h, p, density) {
                const layers = Math.floor((4 + p[0] * 3) * density);
                
                for (let layer = 0; layer < layers; layer++) {
                    const yBase = h * (0.3 + layer * 0.2);
                    const alpha = 0.3 + (layer / layers) * 0.15;
                    
                    ctx.globalAlpha = alpha;
                    ctx.lineWidth = 1 + (layers - layer) * 0.5;
                    ctx.beginPath();
                    
                    // 从画布左侧外开始（延伸出画布）
                    let x = -50;
                    let y = yBase + Math.sin(p[layer % 40] * Math.PI) * 30;
                    ctx.moveTo(x, y);
                    
                    // 绘制到画布右侧外（超出画布边界）
                    while (x < w + 50) {
                        x += 5 + p[(layer + Math.floor((x + 50) / 10)) % 40] * 15;
                        y = yBase + Math.sin(((x + 50) * 0.01) + p[layer % 40] * Math.PI) * (20 + layer * 10);
                        y += Math.sin((x + 50) * 0.03) * 10;
                        ctx.lineTo(x, y);
                    }
                    
                    // 不闭合路径，让线条自然结束在画布外
                    // 画布边界会自动裁剪显示
                    ctx.stroke();
                }
                
                // 点缀的"飞鸟"（向下弧线，飞翔姿态）
                const birds = Math.floor((4 + p[5] * 6) * density);
                ctx.globalAlpha = 0.28;
                ctx.lineWidth = 1.5;
                for (let i = 0; i < birds; i++) {
                    const bx = p[i * 2 % 40] * w;
                    const by = h * (0.08 + p[(i * 2 + 1) % 40] * 0.22);
                    const size = 3 + p[(i + 10) % 40] * 5;
                    const flip = p[(i + 20) % 40] > 0.5 ? 1 : -1;
                    ctx.beginPath();
                    ctx.moveTo(bx - size * flip, by);
                    ctx.quadraticCurveTo(bx, by + size * 0.6, bx + size * flip, by);
                    ctx.stroke();
                }
            },

            stripes(ctx, w, h, p, density) {
                const angle = p[0] * Math.PI; // 0-180度随机角度
                const spacing = (8 + p[1] * 12) / density;
                const lineWidth = 1 + p[2] * 1;
                
                ctx.save();
                ctx.translate(w/2, h/2);
                ctx.rotate(angle);
                ctx.translate(-w/2, -h/2);
                
                const diag = Math.sqrt(w*w + h*h);
                ctx.lineWidth = lineWidth;
                ctx.globalAlpha = 0.3 + p[3] * 0.3;
                
                for (let i = -diag; i < diag * 2; i += spacing) {
                    ctx.beginPath();
                    ctx.moveTo(i, -diag);
                    ctx.lineTo(i, diag * 2);
                    ctx.stroke();
                }
                ctx.restore();
            },

            hexagon(ctx, w, h, p, density) {
                const r = 18 / Math.sqrt(density);     // 六边形半径（中心到顶点距离）
                const scale = 0.98;                     // 0.98=几乎无缝(如图), 0.8=有间隙
                
                // 标准蜂窝密铺几何（平顶六边形）
                // 水平方向：中心距 = 2r（边对边接触）
                // 垂直方向：中心距 = √3 * r（行间交错）
                const xStep = 2 * r;                    // 水平步进
                const yStep = Math.sqrt(3) * r;         // 垂直步进
                const rowOffset = r;                    // 奇偶行偏移半个格子
                
                const drawR = r * scale;                // 实际绘制半径
                ctx.lineWidth = 1.5;
                let index = 0;
                
                // 计算所需行列
                const rows = Math.ceil(h / yStep) + 2;
                const cols = Math.ceil(w / xStep) + 2;
                
                for (let row = -1; row < rows; row++) {
                    // 垂直中心位置
                    const cy = row * yStep + (yStep / 2);
                    
                    // 奇偶行水平偏移（蜂窝交错）
                    const xShift = (row % 2 === 1) ? rowOffset : 0;
                    
                    for (let col = -1; col < cols; col++) {
                        const cx = col * xStep + xShift;
                        
                        // 边界检查（用原始半径）
                        if (cx < -r || cx > w + r || cy < -r || cy > h + r) {
                            index++;
                            continue;
                        }
                        
                        // 绘制平顶正六边形
                        ctx.beginPath();
                        for (let i = 0; i < 6; i++) {
                            // -30°起始使上下边水平（平顶）
                            const angle = (Math.PI / 3) * i - Math.PI / 6;
                            const px = cx + drawR * Math.cos(angle);
                            const py = cy + drawR * Math.sin(angle);
                            if (i === 0) ctx.moveTo(px, py);
                            else ctx.lineTo(px, py);
                        }
                        ctx.closePath();
                        
                        // 描边
                        ctx.globalAlpha = 0.35;
                        ctx.stroke();
                        
                        // 随机填充（像参考图那样的多彩效果）
                        if (p[index % 40] > 0.65) {
                            ctx.globalAlpha = 0.2 + p[(index + 20) % 40] * 0.15;
                            ctx.fill();
                        }
                        
                        index++;
                    }
                }
            },

            goldenSpiral(ctx, w, h, p, density) {
                const cx = w / 2;
                const cy = h / 2;
                
                // 起始半径减半（4），展示更大区域
                const baseScale = 4 / Math.sqrt(density);
                const scale = baseScale * (0.8 + p[0] * 0.4);
                const color = ctx.strokeStyle;
                
                // 斐波那契初始化（0, 0, 1）
                let i = 0, j = 0, k = 1;
                let dir = 0;
                let x = cx + (p[1] - 0.5) * 10;
                let y = cy + (p[2] - 0.5) * 10;
                
                const squares = [];
                const maxBound = Math.max(w, h) * 1.2;
                
                while (k * scale < maxBound) {
                    const size = k * scale;
                    let squareX = x, squareY = y;
                    let arcX, arcY, startAngle, endAngle;
                    
                    // 关键修复：使用负角度确保 |end-start| = π/2，强制 SVG 绘制小弧（90°）
                    switch(dir) {
                        case 0: // 北（上）：圆心左下角，从右(0)到上(-π/2)
                            x = x - (i * scale);
                            y = y - (k * scale);
                            squareX = x; 
                            squareY = y;
                            arcX = x; 
                            arcY = y + size;
                            startAngle = 0;           // 右
                            endAngle = -Math.PI / 2;  // 上（负角度）
                            break;
                        case 1: // 西（左）：圆心右下角，从上(-π/2)到左(-π)
                            x = x - (k * scale);
                            squareX = x; 
                            squareY = y;
                            arcX = x + size; 
                            arcY = y + size;
                            startAngle = -Math.PI / 2; // 上
                            endAngle = -Math.PI;       // 左（负角度）
                            break;
                        case 2: // 南（下）：圆心右上角，从左(-π或π)到下(π/2)
                            y = y + (j * scale);
                            squareX = x; 
                            squareY = y;
                            arcX = x + size; 
                            arcY = y;
                            startAngle = Math.PI;      // 左（或 -Math.PI）
                            endAngle = Math.PI / 2;    // 下
                            break;
                        case 3: // 东（右）：圆心左上角，从下(π/2)到右(0)
                            x = x + (j * scale);
                            y = y - (i * scale);
                            squareX = x; 
                            squareY = y;
                            arcX = x; 
                            arcY = y;
                            startAngle = Math.PI / 2;  // 下
                            endAngle = 0;              // 右
                            break;
                    }
                    
                    squares.push({
                        x: squareX, y: squareY, size, dir,
                        arc: { x: arcX, y: arcY, startAngle, endAngle }
                    });
                    
                    i = j; j = k; k = i + j;
                    dir = (dir + 1) % 4;
                }
                
                // 绘制正方形网格
                ctx.globalAlpha = 0.12;
                ctx.lineWidth = 0.6;
                ctx.strokeStyle = color;
                squares.forEach(sq => {
                    ctx.strokeRect(sq.x, sq.y, sq.size, sq.size);
                });
                
                // 绘制斐波那契螺旋（连续路径）
                ctx.globalAlpha = 0.95;
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                
                squares.forEach((sq, idx) => {
                    const a = sq.arc;
                    if (idx === 0) {
                        const sx = a.x + sq.size * Math.cos(a.startAngle);
                        const sy = a.y + sq.size * Math.sin(a.startAngle);
                        ctx.moveTo(sx, sy);
                    }
                    // anticlockwise=true 确保绘制 90° 小弧（而非 270° 大弧）
                    ctx.arc(a.x, a.y, sq.size, a.startAngle, a.endAngle, true);
                });
                
                ctx.stroke();
                
                // 中心标记
                ctx.globalAlpha = 0;
                ctx.beginPath();
                ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
                ctx.fill();
            },

            cropCircles(ctx, w, h, p, density) {
                const cx = w / 2;
                const cy = h / 2;
                const maxR = Math.min(w, h) * 0.48;
                
                // 对称阶数（3-12重旋转对称）
                const symmetry = 3 + Math.floor(p[0] * 9);
                
                // 层数（根据密度调整）
                const layers = Math.floor((4 + p[1] * 6) * Math.sqrt(density));
                
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                // 1. 外圈编织纹理（模拟麦秆倒伏的编织效果）
                const weaveRings = Math.floor(3 + p[2] * 4);
                ctx.globalAlpha = 0.3;
                ctx.lineWidth = 0.8;
                
                for (let i = 0; i < weaveRings; i++) {
                    const r = maxR * (0.85 + i * 0.05);
                    const segments = symmetry * 4;
                    
                    for (let j = 0; j < segments; j++) {
                        const angle = (Math.PI * 2 * j) / segments;
                        const nextAngle = (Math.PI * 2 * (j + 1)) / segments;
                        
                        // 交替倒伏方向（编织感）
                        if ((i + j) % 2 === 0) {
                            ctx.beginPath();
                            ctx.arc(cx, cy, r, angle, nextAngle);
                            ctx.stroke();
                        } else {
                            // 压扁的直线段（麦秆倒伏痕迹）
                            const x1 = cx + r * Math.cos(angle);
                            const y1 = cy + r * Math.sin(angle);
                            const x2 = cx + r * Math.cos(nextAngle);
                            const y2 = cy + r * Math.sin(nextAngle);
                            ctx.beginPath();
                            ctx.moveTo(x1, y1);
                            ctx.lineTo(x2, y2);
                            ctx.stroke();
                        }
                    }
                }
                
                // 2. 主要几何层（从外向内构建）
                for (let layer = layers; layer > 0; layer--) {
                    const t = layer / layers;
                    const rOuter = maxR * t * 0.9;
                    const rInner = maxR * (t - 1/layers) * 0.9;
                    const rMid = (rOuter + rInner) / 2;
                    
                    // 每层不同的图案类型
                    const patternType = Math.floor(p[(layer + 3) % 40] * 4);
                    
                    ctx.globalAlpha = 0.35 + (1 - t) * 0.5;
                    ctx.lineWidth = 1.5 - t * 0.8;
                    
                    switch(patternType) {
                        case 0: // 星芒射线
                            for (let i = 0; i < symmetry; i++) {
                                const angle = (Math.PI * 2 * i) / symmetry + p[layer % 40] * 0.2;
                                ctx.beginPath();
                                ctx.moveTo(cx + rInner * Math.cos(angle), cy + rInner * Math.sin(angle));
                                ctx.lineTo(cx + rOuter * Math.cos(angle), cy + rOuter * Math.sin(angle));
                                ctx.stroke();
                                
                                // 次级射线（更细）
                                if (symmetry > 6) {
                                    ctx.globalAlpha = 0.15;
                                    const subAngle = angle + Math.PI / symmetry;
                                    ctx.beginPath();
                                    ctx.moveTo(cx + rInner * 1.1 * Math.cos(subAngle), cy + rInner * 1.1 * Math.sin(subAngle));
                                    ctx.lineTo(cx + rOuter * 0.9 * Math.cos(subAngle), cy + rOuter * 0.9 * Math.sin(subAngle));
                                    ctx.stroke();
                                    ctx.globalAlpha = 0.35 + (1 - t) * 0.3;
                                }
                            }
                            break;
                            
                        case 1: // 同心圆环带切口
                            const arcGap = Math.PI / symmetry;
                            for (let i = 0; i < symmetry; i++) {
                                const startAngle = (Math.PI * 2 * i) / symmetry;
                                ctx.beginPath();
                                ctx.arc(cx, cy, rMid, startAngle, startAngle + arcGap * 0.8);
                                ctx.stroke();
                            }
                            break;
                            
                        case 2: // 螺旋花瓣（涡旋）
                            const petals = symmetry;
                            for (let i = 0; i < petals; i++) {
                                const baseAngle = (Math.PI * 2 * i) / petals;
                                ctx.beginPath();
                                
                                for (let step = 0; step <= 20; step++) {
                                    const t2 = step / 20;
                                    const r = rInner + (rOuter - rInner) * t2;
                                    const twist = t2 * Math.PI * 0.5; // 涡旋扭曲
                                    const angle = baseAngle + twist;
                                    
                                    const x = cx + r * Math.cos(angle);
                                    const y = cy + r * Math.sin(angle);
                                    
                                    if (step === 0) ctx.moveTo(x, y);
                                    else ctx.lineTo(x, y);
                                }
                                ctx.stroke();
                            }
                            break;
                            
                        case 3: // 几何多边形（嵌套）
                            ctx.beginPath();
                            for (let i = 0; i <= symmetry; i++) {
                                const angle = (Math.PI * 2 * i) / symmetry - Math.PI / 2;
                                const x = cx + rMid * Math.cos(angle);
                                const y = cy + rMid * Math.sin(angle);
                                if (i === 0) ctx.moveTo(x, y);
                                else ctx.lineTo(x, y);
                            }
                            ctx.closePath();
                            ctx.stroke();
                            
                            // 内部交叉线（神圣几何）
                            ctx.globalAlpha = 0.12;
                            for (let i = 0; i < symmetry; i++) {
                                for (let j = i + 2; j < symmetry; j++) {
                                    if (Math.abs(i - j) === symmetry / 2) continue; // 避免直径重复
                                    const angle1 = (Math.PI * 2 * i) / symmetry - Math.PI / 2;
                                    const angle2 = (Math.PI * 2 * j) / symmetry - Math.PI / 2;
                                    ctx.beginPath();
                                    ctx.moveTo(cx + rMid * Math.cos(angle1), cy + rMid * Math.sin(angle1));
                                    ctx.lineTo(cx + rMid * Math.cos(angle2), cy + rMid * Math.sin(angle2));
                                    ctx.stroke();
                                }
                            }
                            ctx.globalAlpha = 0.25 + (1 - t) * 0.3;
                            break;
                    }
                }
                
                // 3. 中心核心（种子图案）
                const centerR = maxR * 0.08;
                const centerType = Math.floor(p[5] * 3);
                
                ctx.globalAlpha = 0.5;
                ctx.lineWidth = 2;
                
                if (centerType === 0) { // 同心圆核心
                    for (let i = 3; i > 0; i--) {
                        ctx.beginPath();
                        ctx.arc(cx, cy, centerR * (i / 3), 0, Math.PI * 2);
                        ctx.stroke();
                    }
                } else if (centerType === 1) { // 星形核心
                    const points = 5 + Math.floor(p[6] * 4);
                    ctx.beginPath();
                    for (let i = 0; i <= points * 2; i++) {
                        const r = (i % 2 === 0) ? centerR : centerR * 0.4;
                        const angle = (Math.PI * i) / points - Math.PI / 2;
                        const x = cx + r * Math.cos(angle);
                        const y = cy + r * Math.sin(angle);
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    ctx.stroke();
                } else { // 螺旋核心
                    ctx.beginPath();
                    for (let i = 0; i < 50; i++) {
                        const t = i / 50;
                        const r = centerR * t;
                        const angle = t * Math.PI * 4;
                        const x = cx + r * Math.cos(angle);
                        const y = cy + r * Math.sin(angle);
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                }
                
                // 4. 神秘连接线（暗示非人类智慧的几何关联）
                ctx.globalAlpha = 0.25;
                ctx.lineWidth = 0.6;
                const connectPoints = [];
                for (let i = 0; i < symmetry * 2; i++) {
                    const angle = (Math.PI * i) / symmetry;
                    const r = maxR * (0.3 + p[(i + 10) % 40] * 0.6);
                    connectPoints.push({
                        x: cx + r * Math.cos(angle),
                        y: cy + r * Math.sin(angle)
                    });
                }
                
                // 连接特定节点形成隐藏多边形
                for (let i = 0; i < connectPoints.length; i++) {
                    const next = (i + 3) % connectPoints.length;
                    ctx.beginPath();
                    ctx.moveTo(connectPoints[i].x, connectPoints[i].y);
                    ctx.lineTo(connectPoints[next].x, connectPoints[next].y);
                    ctx.stroke();
                }
                
                // 5. 压扁麦秆纹理（随机细线模拟田野质感）
                ctx.globalAlpha = 0.15;
                for (let i = 0; i < 30 * density; i++) {
                    const angle = p[i % 40] * Math.PI * 2;
                    const r = maxR * (0.1 + p[(i + 5) % 40] * 0.9);
                    const len = 5 + p[(i + 10) % 40] * 15;
                    
                    const x = cx + r * Math.cos(angle);
                    const y = cy + r * Math.sin(angle);
                    
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + len * Math.cos(angle), y + len * Math.sin(angle));
                    ctx.stroke();
                }
            },

            fractalPeaks(ctx, w, h, p, density) {
                const iterations = Math.floor(8 + density * 6);
                const roughness = 0.5 + p[0] * 0.3;
                
                // 生成多层山脉（远景到近景）
                const layers = Math.floor(3 + p[1] * 3);
                
                for (let layer = 0; layer < layers; layer++) {
                    const baseHeight = h * (0.2 + layer * 0.25); // 逐层抬高
                    const amplitude = h * (0.15 - layer * 0.03); // 逐层降低振幅（透视）
                    const colorAlpha = 0.15 + (layer / layers) * 0.5; // 近景更清晰
                    
                    // 中点位移生成地形线
                    let points = [{x:0, y:baseHeight}, {x:w, y:baseHeight}];
                    
                    for (let i = 0; i < iterations; i++) {
                        const newPoints = [];
                        for (let j = 0; j < points.length - 1; j++) {
                            const p1 = points[j];
                            const p2 = points[j + 1];
                            const midX = (p1.x + p2.x) / 2;
                            const midY = (p1.y + p2.y) / 2 + (Math.random() - 0.5) * amplitude * Math.pow(roughness, i);
                            
                            newPoints.push(p1);
                            newPoints.push({x:midX, y:midY});
                        }
                        newPoints.push(points[points.length - 1]);
                        points = newPoints;
                    }
                    
                    // 绘制填充山体
                    ctx.globalAlpha = colorAlpha;
                    ctx.beginPath();
                    ctx.moveTo(0, h);
                    points.forEach(pt => ctx.lineTo(pt.x, pt.y));
                    ctx.lineTo(w, h);
                    ctx.closePath();
                    ctx.fill();
                    
                    // 绘制山脊线
                    ctx.lineWidth = 1.5 - layer * 0.3;
                    ctx.beginPath();
                    points.forEach((pt, idx) => {
                        if (idx === 0) ctx.moveTo(pt.x, pt.y);
                        else ctx.lineTo(pt.x, pt.y);
                    });
                    ctx.stroke();
                }
            },

            moirePattern(ctx, w, h, p, density) {
                const lineCount = Math.floor(40 * density);
                const spacing = Math.min(w, h) / lineCount;
                
                // 第一层网格（基础）
                ctx.globalAlpha = 0.25;
                ctx.lineWidth = 0.8;
                
                for (let i = -lineCount; i <= lineCount; i++) {
                    const x = w/2 + i * spacing;
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, h);
                    ctx.stroke();
                    
                    const y = h/2 + i * spacing;
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(w, y);
                    ctx.stroke();
                }
                
                // 第二层网格（旋转2-5度）
                ctx.save();
                ctx.translate(w/2, h/2);
                const angle = (2 + p[0] * 3) * Math.PI / 180; // 2-5度
                ctx.rotate(angle);
                ctx.translate(-w/2, -h/2);
                
                ctx.globalAlpha = 0.25;
                for (let i = -lineCount; i <= lineCount; i++) {
                    const x = w/2 + i * spacing * 0.98; // 微小间距差异增强干涉
                    ctx.beginPath();
                    ctx.moveTo(x, -h);
                    ctx.lineTo(x, h * 2);
                    ctx.stroke();
                    
                    const y = h/2 + i * spacing * 0.98;
                    ctx.beginPath();
                    ctx.moveTo(-w, y);
                    ctx.lineTo(w * 2, y);
                    ctx.stroke();
                }
                ctx.restore();
                
                // 添加同心圆莫列（可选，增加层次）
                if (p[1] > 0.5) {
                    ctx.globalAlpha = 0.15;
                    const rings = Math.floor(lineCount * 0.7);
                    for (let i = 1; i <= rings; i++) {
                        ctx.beginPath();
                        ctx.arc(w/2, h/2, i * spacing, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
            },

            attractor(ctx, w, h, p, density) {
                const sigma = 10 + p[0] * 2;
                const rho = 28 + p[1] * 4;
                const beta = 8/3 + p[2] * 0.5;
                
                let x = p[3] * 0.1;
                let y = p[4] * 0.1;
                let z = p[5] * 25 + 20;
                
                const points = [];
                const dt = 0.008;
                const iterations = Math.floor(8000 * density);
                
                // 生成轨迹
                for (let i = 0; i < iterations; i++) {
                    const dx = sigma * (y - x) * dt;
                    const dy = (x * (rho - z) - y) * dt;
                    const dz = (x * y - beta * z) * dt;
                    x += dx;
                    y += dy;
                    z += dz;
                    
                    // 投影到2D，带视角旋转
                    const viewAngle = p[6] * Math.PI;
                    const px = w/2 + (x * Math.cos(viewAngle) - z * Math.sin(viewAngle)) * 6;
                    const py = h/2 + y * 6;
                    
                    if (i > 100) points.push({x: px, y: py, intensity: i/iterations});
                }
                
                // 绘制渐变轨迹
                ctx.lineWidth = 1.5;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                for (let i = 1; i < points.length; i++) {
                    const alpha = 0.05 + points[i].intensity * 0.35;
                    ctx.globalAlpha = alpha;
                    ctx.beginPath();
                    ctx.moveTo(points[i-1].x, points[i-1].y);
                    ctx.lineTo(points[i].x, points[i].y);
                    ctx.stroke();
                }
                
                // 添加核心光晕
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.arc(w/2, h/2, 4, 0, Math.PI * 2);
                ctx.fill();
            },

            gol(ctx, w, h, p, density) {
                const cellSize = Math.floor(8 / Math.sqrt(density));
                const cols = Math.floor(w / cellSize);
                const rows = Math.floor(h / cellSize);
                
                // 初始化随机状态
                let grid = [];
                for (let i = 0; i < cols; i++) {
                    grid[i] = [];
                    for (let j = 0; j < rows; j++) {
                        grid[i][j] = p[(i*j) % 40] > 0.7 ? 1 : 0; // 30%存活率
                    }
                }
                
                // 迭代5步
                for (let gen = 0; gen < 5; gen++) {
                    const newGrid = [];
                    for (let i = 0; i < cols; i++) {
                        newGrid[i] = [];
                        for (let j = 0; j < rows; j++) {
                            // 计算邻居
                            let neighbors = 0;
                            for (let di = -1; di <= 1; di++) {
                                for (let dj = -1; dj <= 1; dj++) {
                                    if (di === 0 && dj === 0) continue;
                                    const ni = (i + di + cols) % cols;
                                    const nj = (j + dj + rows) % rows;
                                    neighbors += grid[ni][nj];
                                }
                            }
                            
                            // 规则应用
                            if (grid[i][j] === 1 && (neighbors < 2 || neighbors > 3)) {
                                newGrid[i][j] = 0;
                            } else if (grid[i][j] === 0 && neighbors === 3) {
                                newGrid[i][j] = 1;
                            } else {
                                newGrid[i][j] = grid[i][j];
                            }
                        }
                    }
                    grid = newGrid;
                }
                
                // 绘制（代数越高越透明）
                ctx.fillStyle = ctx.strokeStyle;
                for (let i = 0; i < cols; i++) {
                    for (let j = 0; j < rows; j++) {
                        if (grid[i][j] === 1) {
                            const age = (i + j) % 3; // 模拟不同代数
                            ctx.globalAlpha = 0.2 + age * 0.15;
                            ctx.fillRect(i * cellSize, j * cellSize, cellSize - 1, cellSize - 1);
                        }
                    }
                }
                
                // 添加网格线
                ctx.globalAlpha = 0.05;
                ctx.lineWidth = 0.5;
                for (let i = 0; i <= cols; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * cellSize, 0);
                    ctx.lineTo(i * cellSize, h);
                    ctx.stroke();
                }
                for (let j = 0; j <= rows; j++) {
                    ctx.beginPath();
                    ctx.moveTo(0, j * cellSize);
                    ctx.lineTo(w, j * cellSize);
                    ctx.stroke();
                }
            },

            mycelium(ctx, w, h, p, density) {
                const hyphae = Math.floor(12 + 18*density);
                const particles = [];
                
                // 初始化多个生长点
                for(let i=0; i<hyphae; i++) {
                    particles.push({
                        x: p[i*3%40]*w,
                        y: p[(i*3+1)%40]*h,
                        angle: p[(i*3+2)%40]*Math.PI*2,
                        active: true,
                        generation: 0
                    });
                }
                
                const steps = 80;
                ctx.lineWidth = 0.8;
                
                for(let step=0; step<steps; step++) {
                    particles.forEach((pt, idx) => {
                        if(!pt.active) return;
                        
                        // 随机游走（持续性转向）
                        pt.angle += (p[(step*idx)%40]-0.5)*0.8;
                        const speed = 2 + (pt.generation)*0.5;
                        const newX = pt.x + Math.cos(pt.angle)*speed;
                        const newY = pt.y + Math.sin(pt.angle)*speed;
                        
                        // 边界检查
                        if(newX<0 || newX>w || newY<0 || newY>h) {
                            pt.active = false;
                            return;
                        }
                        
                        // 绘制线段
                        ctx.globalAlpha = 0.15 - pt.generation*0.03;
                        ctx.beginPath();
                        ctx.moveTo(pt.x, pt.y);
                        ctx.lineTo(newX, newY);
                        ctx.stroke();
                        
                        pt.x = newX;
                        pt.y = newY;
                        
                        // 融合检测（与其他菌丝距离过近则停止并连接）
                        let fused = false;
                        for(let other of particles) {
                            if(other === pt || other.generation !== pt.generation) continue;
                            const dist = Math.hypot(pt.x-other.x, pt.y-other.y);
                            if(dist < 15 && p[(step+idx)%40] > 0.8) {
                                ctx.globalAlpha = 0.25;
                                ctx.lineWidth = 1.5;
                                ctx.beginPath();
                                ctx.moveTo(pt.x, pt.y);
                                ctx.lineTo(other.x, other.y);
                                ctx.stroke();
                                ctx.lineWidth = 0.8;
                                fused = true;
                                break;
                            }
                        }
                        
                        if(fused) pt.active = false;
                        
                        // 分叉（低概率）
                        if(p[(step+idx*2)%40] > 0.92 && pt.generation < 2) {
                            particles.push({
                                x: pt.x,
                                y: pt.y,
                                angle: pt.angle + (p[(step)%40]-0.5),
                                active: true,
                                generation: pt.generation + 1
                            });
                        }
                    });
                }
                
                // 绘制节点（融合点）
                ctx.globalAlpha = 0.4;
                particles.forEach(pt => {
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 2, 0, Math.PI*2);
                    ctx.fill();
                });
            },

            holographic(ctx, w, h, p, density) {
                const lines = Math.floor(40 + 60*density);
                
                // 基础网格（细密对角线）
                ctx.lineWidth = 0.5;
                for(let i=-lines; i<lines; i++) {
                    const offset = i * 8;
                    ctx.globalAlpha = 0.08;
                    ctx.beginPath();
                    ctx.moveTo(offset, 0);
                    ctx.lineTo(offset + h*0.5, h);
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(offset + h*0.5, 0);
                    ctx.lineTo(offset, h);
                    ctx.stroke();
                }
                
                // 多层波纹干涉（不同频率和角度）
                const waves = 3;
                for(let wv=0; wv<waves; wv++) {
                    const cx = p[wv*3%40]*w;
                    const cy = p[(wv*3+1)%40]*h;
                    const freq = 0.02 + p[(wv*3+2)%40]*0.03;
                    const radius = Math.min(w,h)*0.6;
                    
                    for(let r=10; r<radius; r+=3) {
                        const intensity = Math.sin(r*freq + wv)*0.5 + 0.5;
                        if(intensity > 0.6) {
                            ctx.globalAlpha = (intensity - 0.6) * 0.4;
                            ctx.lineWidth = 1.5 - wv*0.3;
                            ctx.beginPath();
                            ctx.arc(cx, cy, r, 0, Math.PI*2);
                            ctx.stroke();
                        }
                    }
                }
                
                // 添加闪光颗粒（模拟全息颗粒感）
                ctx.globalAlpha = 0.4;
                for(let i=0; i<100*density; i++) {
                    const x = p[i*2%40]*w;
                    const y = p[(i*2+1)%40]*h;
                    const len = 2 + p[i%40]*4;
                    const angle = p[(i+20)%40]*Math.PI;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x+Math.cos(angle)*len, y+Math.sin(angle)*len);
                    ctx.stroke();
                }
            },

            islamicTile(ctx, w, h, p, density) {
                const scale = 40 / Math.sqrt(density);
                const rows = Math.ceil(h / scale) + 2;
                const cols = Math.ceil(w / scale) + 2;
                ctx.lineWidth = 1.2;
                
                for (let row = -1; row < rows; row++) {
                    for (let col = -1; col < cols; col++) {
                        const x = col * scale * 1.5;
                        const y = row * scale * Math.sqrt(3) + (col % 2) * scale * Math.sqrt(3) / 2;
                        
                        // 六边形基础
                        ctx.globalAlpha = 0.3;
                        ctx.beginPath();
                        for (let i = 0; i < 6; i++) {
                            const angle = (i * Math.PI) / 3;
                            const hx = x + scale * 0.5 * Math.cos(angle);
                            const hy = y + scale * 0.5 * Math.sin(angle);
                            if (i === 0) ctx.moveTo(hx, hy);
                            else ctx.lineTo(hx, hy);
                        }
                        ctx.closePath();
                        ctx.stroke();
                        
                        // 内部六角星
                        if (p[(row * cols + col) % 40] > 0.3) {
                            ctx.globalAlpha = 0.4;
                            ctx.beginPath();
                            for (let i = 0; i < 6; i++) {
                                const angle1 = (i * Math.PI) / 3 + Math.PI / 6;
                                const angle2 = ((i + 1) * Math.PI) / 3 + Math.PI / 6;
                                const r1 = scale * 0.4;
                                const r2 = scale * 0.15;
                                
                                ctx.moveTo(x + r1 * Math.cos(angle1), y + r1 * Math.sin(angle1));
                                ctx.lineTo(x + r2 * Math.cos(angle1 + Math.PI / 6), y + r2 * Math.sin(angle1 + Math.PI / 6));
                                ctx.lineTo(x + r1 * Math.cos(angle2), y + r1 * Math.sin(angle2));
                            }
                            ctx.stroke();
                        }
                        
                        // 连接线形成大卫之星
                        if (p[(row * cols + col + 10) % 40] > 0.7) {
                            ctx.globalAlpha = 0.5;
                            ctx.lineWidth = 2;
                            ctx.beginPath();
                            for (let i = 0; i < 3; i++) {
                                const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2;
                                const r = scale * 0.35;
                                if (i === 0) ctx.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
                                else ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
                            }
                            ctx.closePath();
                            ctx.stroke();
                        }
                    }
                }
            },

            dragonCurve(ctx, w, h, p, density) {
                const iterations = Math.floor(8 + p[0] * 6 * density);
                let sequence = [1]; // 1 = 右转, -1 = 左转
                
                // 生成龙形曲线序列
                for (let i = 0; i < iterations; i++) {
                    const newSeq = [...sequence, 1, ...sequence.slice().reverse().map(x => -x)];
                    sequence = newSeq;
                    if (sequence.length > 2000) break; // 防止过大
                }
                
                const step = Math.min(w, h) / Math.sqrt(sequence.length) * 0.8;
                let x = w * 0.3;
                let y = h * 0.6;
                let angle = 0;
                
                const points = [{x, y}];
                
                // 计算路径点
                for (let turn of sequence) {
                    angle += turn * Math.PI / 2;
                    x += step * Math.cos(angle);
                    y += step * Math.sin(angle);
                    points.push({x, y});
                }
                
                // 绘制（带发光效果的多层渲染）
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                // 外层发光
                ctx.globalAlpha = 0.1;
                ctx.lineWidth = 8;
                ctx.beginPath();
                points.forEach((pt, i) => {
                    if (i === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                });
                ctx.stroke();
                
                // 中层
                ctx.globalAlpha = 0.2;
                ctx.lineWidth = 4;
                ctx.stroke();
                
                // 主线
                ctx.globalAlpha = 0.8;
                ctx.lineWidth = 1.5;
                ctx.stroke();
                
                // 随机起点和终点装饰
                ctx.globalAlpha = 1;
                ctx.beginPath();
                ctx.arc(points[0].x, points[0].y, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(points[points.length - 1].x, points[points.length - 1].y, 3, 0, Math.PI * 2);
                ctx.fill();
            },

            galaxy(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const arms = Math.floor(2 + p[0] * 3);
                const particles = Math.floor(200 * density);
                
                for(let arm=0; arm<arms; arm++) {
                    const baseAngle = (Math.PI*2*arm)/arms;
                    for(let i=0; i<particles; i++) {
                        const t = i/particles;
                        const r = t * Math.min(w,h) * 0.45;
                        const spiralOffset = t * Math.PI * 4;
                        const angle = baseAngle + spiralOffset + (p[i%40]-0.5)*0.3;
                        const x = cx + r * Math.cos(angle);
                        const y = cy + r * Math.sin(angle);
                        
                        ctx.globalAlpha = 0.4 * (1-t);
                        const size = (1-t) * 2.5 + 0.5;
                        ctx.beginPath();
                        ctx.arc(x, y, size, 0, Math.PI*2);
                        ctx.fill();
                    }
                }
                
                // 核心黑洞
                ctx.globalAlpha = 0.9;
                const coreR = 8 + p[1]*6;
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
                grad.addColorStop(0, ctx.fillStyle);
                grad.addColorStop(1, 'transparent');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, coreR, 0, Math.PI*2);
                ctx.fill();
            },

            bridge(ctx, w, h, p, density) {
                const towers = Math.floor(2 + p[0] * 2);
                const span = w / (towers + 1);
                const towerH = h * (0.4 + p[1]*0.2);
                const deckY = h * 0.7;
                
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.5;
                
                for(let i=1; i<=towers; i++) {
                    const x = i * span;
                    
                    // 桥塔
                    ctx.beginPath();
                    ctx.moveTo(x-5, deckY);
                    ctx.lineTo(x-5, deckY - towerH);
                    ctx.lineTo(x+5, deckY - towerH);
                    ctx.lineTo(x+5, deckY);
                    ctx.stroke();
                    
                    // 主缆
                    ctx.globalAlpha = 0.3;
                    ctx.beginPath();
                    const prevX = (i-1)*span;
                    const nextX = (i+1)*span;
                    
                    if(i===1) {
                        ctx.moveTo(0, deckY);
                        ctx.quadraticCurveTo(x/2, deckY-towerH*0.8, x, deckY-towerH);
                    } else {
                        ctx.moveTo(prevX, deckY-towerH);
                        ctx.quadraticCurveTo((prevX+x)/2, deckY-towerH*0.9, x, deckY-towerH);
                    }
                    ctx.stroke();
                    
                    // 吊索
                    if(i < towers || towers === 1) {
                        const cables = Math.floor(3 + p[i%40]*5 * density);
                        const startX = towers === 1 ? 0 : prevX;
                        const endX = towers === 1 ? w : x;
                        
                        for(let c=1; c<cables; c++) {
                            const cx = startX + (endX-startX)*(c/cables);
                            const cableY = deckY - towerH*0.6; // 简化计算
                            ctx.globalAlpha = 0.2;
                            ctx.lineWidth = 0.8;
                            ctx.beginPath();
                            ctx.moveTo(cx, deckY);
                            ctx.lineTo(cx, cableY);
                            ctx.stroke();
                        }
                    }
                }
                
                // 桥面
                ctx.globalAlpha = 0.6;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, deckY);
                ctx.lineTo(w, deckY);
                ctx.stroke();
            },

            sandDune(ctx, w, h, p, density) {
                const ridges = Math.floor(8 + p[0] * 8 * density);
                
                for(let i=0; i<ridges; i++) {
                    const y = h * (0.3 + i/ridges*0.6);
                    const amplitude = 15 + p[i%40] * 25;
                    const freq = 0.02 + p[(i+5)%40] * 0.03;
                    
                    ctx.globalAlpha = 0.25;
                    ctx.lineWidth = 1 + (1-i/ridges)*2;
                    ctx.beginPath();
                    
                    for(let x=0; x<=w; x+=3) {
                        const wave = Math.sin(x*freq + i)*amplitude 
                                + Math.sin(x*freq*2.5)*amplitude*0.3;
                        const py = y + wave;
                        if(x===0) ctx.moveTo(x, py);
                        else ctx.lineTo(x, py);
                    }
                    ctx.stroke();
                    
                    // 阴影填充（沙丘背光面）
                    ctx.globalAlpha = 0.08;
                    ctx.lineTo(w, h);
                    ctx.lineTo(0, h);
                    ctx.closePath();
                    ctx.fill();
                }
            },

            knots(ctx, w, h, p, density) {
                const cx = w/2, cy = h/2;
                const strands = Math.floor(3 + p[0] * 4); // 绳股数
                const crossings = Math.floor((8 + p[1] * 12) * density);
                const radius = Math.min(w, h) * 0.35;
                
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                // 生成交叉序列（上/下编织模式）
                const pattern = [];
                for (let i = 0; i < crossings; i++) {
                    pattern.push({
                        over: p[i%40] > 0.5,
                        angle: (Math.PI * 2 * i) / crossings + p[(i+10)%40] * 0.2,
                        offset: (p[(i+20)%40] - 0.5) * radius * 0.3
                    });
                }
                
                // 绘制每根绳股
                for (let s = 0; s < strands; s++) {
                    const phase = (Math.PI * 2 * s) / strands;
                    const path = [];
                    
                    for (let i = 0; i <= crossings; i++) {
                        const pt = pattern[i % crossings];
                        const a = pt.angle + phase;
                        const r = radius + pt.offset * Math.sin(s * 2 + i);
                        
                        path.push({
                            x: cx + Math.cos(a) * r,
                            y: cy + Math.sin(a) * r,
                            over: pt.over // 记录此处是否为"上跨"
                        });
                    }
                    
                    // 绘制带间隙的绳（模拟上下穿插）
                    for (let i = 0; i < path.length - 1; i++) {
                        const current = path[i];
                        const next = path[i + 1];
                        
                        // 如果在交叉点，根据over/under决定颜色/间隙
                        if (current.over) {
                            ctx.globalAlpha = 0.9; // 上跨：实线
                            ctx.strokeStyle = ctx.strokeStyle;
                        } else {
                            ctx.globalAlpha = 0.3; // 下跨：虚线/淡线
                        }
                        
                        ctx.beginPath();
                        ctx.moveTo(current.x, current.y);
                        ctx.lineTo(next.x, next.y);
                        ctx.stroke();
                        
                        // 在交叉点画小圆（编织结点）
                        if (i < path.length - 2) {
                            ctx.globalAlpha = 0.6;
                            ctx.fillStyle = ctx.strokeStyle;
                            ctx.beginPath();
                            ctx.arc(next.x, next.y, 2, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }
                
                // 装饰性外环
                ctx.globalAlpha = 0.4;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, radius * 1.15, 0, Math.PI * 2);
                ctx.stroke();
            },

            fractalTree(ctx, w, h, p, density) {
                const startX = w/2;
                const startY = h;
                const initialLength = h * 0.25;
                const angle = -Math.PI/2; // 向上
                
                const drawBranch = (x, y, len, ang, depth, maxDepth) => {
                    if (depth > maxDepth || len < 2) return;
                    
                    const endX = x + Math.cos(ang) * len;
                    const endY = y + Math.sin(ang) * len;
                    
                    // 线条粗细随深度递减
                    ctx.lineWidth = Math.max(0.5, (maxDepth - depth) * 0.8);
                    ctx.globalAlpha = 0.4 + (depth/maxDepth) * 0.4;
                    
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(endX, endY);
                    ctx.stroke();
                    
                    // 递归分支
                    const nBranches = Math.floor(2 + p[depth % 40] * 2); // 2-3分支
                    for (let i = 0; i < nBranches; i++) {
                        const offset = (i - (nBranches-1)/2) * 0.6; // 扇形分布
                        const newAngle = ang + offset + (p[(depth*3+i)%40] - 0.5) * 0.4;
                        const newLength = len * (0.6 + p[(depth*2+i)%40] * 0.2);
                        
                        drawBranch(endX, endY, newLength, newAngle, depth+1, maxDepth);
                    }
                    
                    // 叶子（末端）
                    if (depth === maxDepth || len < 10) {
                        ctx.globalAlpha = 0.3;
                        ctx.beginPath();
                        ctx.arc(endX, endY, 2 + p[depth%40]*2, 0, Math.PI*2);
                        ctx.fill();
                    }
                };
                
                const maxDepth = Math.floor(6 + p[0] * 4 * density);
                drawBranch(startX, startY, initialLength, angle, 0, maxDepth);
            },
        
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

        // 返回 generate 函数和需要暴露的内部函数
        return { 
            generate,
            PATTERNS,
            PatternDrawers,
            generatePalette,
            extractParams,
            djb2
        };
    })();

    // ========== 对外接口 ==========
    Lumina.CoverGenerator = {
        // 暴露类和内部模块供其他模块使用
        SVGRenderer: SVGRenderer,
        CoverCore: CoverCore,
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
            const title = metadata.title || book.title || book.fileName.replace(/\.[^/.]+$/, '') || 'Untitled';
            const author = metadata.author || book.author || '';
            const fontId = Lumina.State?.settings?.font;
            return this.generateSVGHTML(title, author, fontId);
        },
        
        clearCache() { 
            this._cache.clear();
        },
        
        // 生成分享卡片（带正文内容）
        generateShareCard(options) {
            const { text, source, theme = 'elegant' } = options;
            
            // 分析文本长度选择版式
            const charCount = text.length;
            let layout = 'short';
            if (charCount > 60) layout = 'paragraph';
            else if (charCount > 20) layout = 'quote';
            
            // 随机配色
            const seed = Date.now();
            const hue = seed % 360;
            const palettes = [
                { bg: `hsl(${hue}, 30%, 12%)`, pattern: `hsl(${(hue+30)%360}, 25%, 20%)`, accent: `hsl(${(hue+180)%360}, 70%, 55%)`, textBg: '#f5f5f0', text: '#1a1a2e' },
                { bg: `hsl(${hue}, 25%, 15%)`, pattern: `hsl(${(hue-30+360)%360}, 30%, 22%)`, accent: `hsl(${(hue+150)%360}, 65%, 60%)`, textBg: '#fafafa', text: '#2a2a3e' },
                { bg: '#2d3436', pattern: '#636e72', accent: '#dfe6e9', textBg: '#f5f5f0', text: '#2d3436' },
                { bg: '#1e272e', pattern: '#485460', accent: '#ffa502', textBg: '#f5f5f0', text: '#1e272e' }
            ];
            const palette = palettes[seed % palettes.length];
            
            // 创建 SVG 渲染器
            const renderer = new SVGRenderer(600, 600);
            
            // 绘制背景
            renderer.fillStyle = palette.bg;
            renderer.fillRect(0, 0, 600, 600);
            
            // 绘制简单图案（圆点网格）
            renderer.fillStyle = palette.pattern;
            const p = [];
            for (let i = 0; i < 40; i++) p.push(Math.random());
            const density = 0.5;
            const count = Math.floor((50 + p[0] * 50) * density);
            for (let i = 0; i < count; i++) {
                const x = p[i % 40] * 600, y = p[(i + 10) % 40] * 600, r = 2 + p[(i + 20) % 40] * 20;
                renderer.globalAlpha = 0.08;
                renderer.beginPath();
                renderer.arc(x, y, r, 0, Math.PI * 2);
                renderer.fill();
            }
            renderer.globalAlpha = 1;
            
            // 根据版式绘制文本
            if (layout === 'short') {
                this._renderShortQuote(renderer, text, source, palette);
            } else if (layout === 'quote') {
                this._renderQuote(renderer, text, source, palette);
            } else {
                this._renderParagraph(renderer, text, source, palette);
            }
            
            return renderer.getSVG(palette.bg, true);
        },
        
        _renderShortQuote(ctx, text, source, palette) {
            // 大引号
            ctx.fillStyle = palette.accent;
            ctx.globalAlpha = 0.3;
            ctx.font = 'bold 120px Georgia, serif';
            ctx.fillText('"', 50, 120);
            ctx.globalAlpha = 1;
            
            // 正文
            ctx.fillStyle = palette.textBg;
            ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
            this._wrapText(ctx, text, 300, 280, 500, 50, 'center');
            
            // 来源
            ctx.fillStyle = palette.accent;
            ctx.font = 'italic 18px Georgia, serif';
            ctx.fillText(`— ${source}`, 300, 500, 500);
        },
        
        _renderQuote(ctx, text, source, palette) {
            // 顶部装饰条
            ctx.fillStyle = palette.accent;
            ctx.globalAlpha = 0.15;
            ctx.fillRect(50, 40, 500, 80);
            ctx.globalAlpha = 1;
            
            // 大引号
            ctx.fillStyle = palette.accent;
            ctx.globalAlpha = 0.4;
            ctx.font = 'bold 80px Georgia, serif';
            ctx.fillText('"', 60, 140);
            ctx.globalAlpha = 1;
            
            // 正文
            ctx.fillStyle = palette.textBg;
            ctx.font = '28px system-ui, -apple-system, sans-serif';
            this._wrapText(ctx, text, 300, 280, 480, 40, 'center');
            
            // 来源
            ctx.fillStyle = palette.accent;
            ctx.font = 'italic 16px Georgia, serif';
            ctx.fillText(`— ${source}`, 300, 520, 480);
        },
        
        _renderParagraph(ctx, text, source, palette) {
            // 左侧装饰条
            ctx.fillStyle = palette.accent;
            ctx.fillRect(30, 60, 6, 480);
            
            // 大引号
            ctx.fillStyle = palette.accent;
            ctx.globalAlpha = 0.5;
            ctx.font = 'bold 40px Georgia, serif';
            ctx.fillText('"', 55, 100);
            ctx.globalAlpha = 1;
            
            // 正文
            ctx.fillStyle = palette.textBg;
            ctx.font = '22px system-ui, -apple-system, sans-serif';
            this._wrapText(ctx, text, 320, 300, 460, 36, 'left');
            
            // 来源
            ctx.fillStyle = palette.accent;
            ctx.font = 'italic 14px Georgia, serif';
            ctx.fillText(`— ${source}`, 320, 540, 460);
        },
        
        _wrapText(ctx, text, x, y, maxWidth, lineHeight, align) {
            const chars = text.split('');
            let line = '';
            const lines = [];
            
            for (let i = 0; i < chars.length; i++) {
                const testLine = line + chars[i];
                const metrics = ctx.measureText(testLine);
                
                if (metrics.width > maxWidth && line.length > 0) {
                    lines.push(line);
                    line = chars[i];
                    if (lines.length >= 5) {
                        line += chars.slice(i + 1).join('');
                        break;
                    }
                } else {
                    line = testLine;
                }
            }
            if (line) lines.push(line);
            
            // 居中对齐
            const totalHeight = lines.length * lineHeight;
            const startY = y - totalHeight / 2 + lineHeight / 2;
            
            lines.forEach((line, i) => {
                let drawX = x;
                if (align === 'center') {
                    const metrics = ctx.measureText(line);
                    drawX = x - metrics.width / 2;
                }
                ctx.fillText(line, drawX, startY + i * lineHeight);
            });
        }
    };

})();
