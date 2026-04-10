/**
 * Bibliomorph Cover Generator v1.0
 * 流萤阅读器 - 书籍封面生成器
 * 
 * 基于 Hash 科学的确定性封面生成系统
 * - 50种精心策划的色板（深/中/浅三色系）
 * - 智能排版：CJK竖排 / 英文词级竖排 / 混合横排
 * - 纸张质感：噪点、纤维纹理、书脊高光
 * 
 * 替代原有的 cover-generator.js 用于书库和详情页封面
 */

(function() {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        width: 176,           // B5宽度 (mm)
        height: 250,          // B5高度 (mm)
        scale: 3,             // 渲染精度
        maxVerticalPerCol: 9, // 竖排每列最大字数
        maxVerticalCols: 3,   // 竖排最大列数
        minOrphanUnits: 3,    // 最小孤儿字避免
        maxHorizontalLines: 6,// 横排最大行数
        maxHorizontalChars: 8,// 横排每行最大字符
        maxCJKForVertical: 24 // 触发竖排的最大CJK字数
    };

    // ==================== 哈希与随机 ====================
    
    function djb2(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }
        return hash >>> 0;
    }

    function mulberry32(seed) {
        return function() {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ==================== 色彩科学 ====================

    function parseHSL(hslStr) {
        const match = hslStr.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (!match) return { h: 0, s: 0, l: 50 };
        return {
            h: parseInt(match[1]),
            s: parseInt(match[2]),
            l: parseInt(match[3])
        };
    }

    function shouldUseDarkText(stops) {
        const avgLightness = stops.reduce((sum, stop) => {
            const hsl = parseHSL(stop.color);
            return sum + hsl.l;
        }, 0) / stops.length;
        return avgLightness > 55;
    }

    // 50种精心策划的色板
    const COLOR_THEMES = [
        // 深色系（12种，亮度12-32%，配白字）
        { id: 'midnight', baseHue: 235, hueVar: 12, sat: [25, 40], light: [12, 22] },
        { id: 'forest_deep', baseHue: 145, hueVar: 20, sat: [20, 35], light: [15, 28] },
        { id: 'graphite', baseHue: 210, hueVar: 10, sat: [8, 18], light: [18, 30] },
        { id: 'ink', baseHue: 25, hueVar: 8, sat: [30, 45], light: [18, 28] },
        { id: 'lapis_deep', baseHue: 225, hueVar: 15, sat: [35, 50], light: [20, 32] },
        { id: 'abyss', baseHue: 195, hueVar: 18, sat: [28, 42], light: [15, 25] },
        { id: 'wine', baseHue: 340, hueVar: 10, sat: [35, 50], light: [18, 28] },
        { id: 'pine', baseHue: 165, hueVar: 12, sat: [22, 35], light: [16, 26] },
        { id: 'obsidian', baseHue: 260, hueVar: 15, sat: [20, 32], light: [14, 24] },
        { id: 'espresso', baseHue: 25, hueVar: 6, sat: [25, 38], light: [15, 22] },
        { id: 'rust', baseHue: 15, hueVar: 10, sat: [40, 55], light: [22, 32] },
        { id: 'thistle', baseHue: 280, hueVar: 12, sat: [25, 38], light: [20, 30] },

        // 中色系（26种，亮度38-58%，配白字）
        // 暖调中色
        { id: 'morandi_warm', baseHue: 35, hueVar: 15, sat: [15, 28], light: [40, 52] },
        { id: 'ochre', baseHue: 25, hueVar: 12, sat: [40, 55], light: [42, 52] },
        { id: 'olive', baseHue: 85, hueVar: 15, sat: [25, 40], light: [40, 52] },
        { id: 'twilight', baseHue: 275, hueVar: 20, sat: [22, 38], light: [35, 48] },
        { id: 'sandstone', baseHue: 30, hueVar: 10, sat: [20, 35], light: [45, 55] },
        { id: 'terracotta', baseHue: 20, hueVar: 8, sat: [45, 58], light: [48, 56] },
        { id: 'caramel', baseHue: 30, hueVar: 12, sat: [35, 48], light: [50, 58] },
        { id: 'cocoa', baseHue: 25, hueVar: 10, sat: [30, 42], light: [42, 50] },
        { id: 'camel', baseHue: 35, hueVar: 8, sat: [28, 40], light: [52, 60] },
        { id: 'copper', baseHue: 25, hueVar: 12, sat: [38, 52], light: [48, 56] },
        // 冷调中色
        { id: 'morandi_cool', baseHue: 215, hueVar: 18, sat: [18, 32], light: [38, 50] },
        { id: 'slate', baseHue: 205, hueVar: 15, sat: [16, 28], light: [42, 52] },
        { id: 'steel', baseHue: 210, hueVar: 12, sat: [20, 35], light: [40, 50] },
        { id: 'sage', baseHue: 100, hueVar: 15, sat: [22, 35], light: [45, 55] },
        { id: 'moss', baseHue: 95, hueVar: 18, sat: [25, 38], light: [40, 50] },
        { id: 'fog', baseHue: 195, hueVar: 10, sat: [15, 25], light: [48, 58] },
        { id: 'storm', baseHue: 220, hueVar: 12, sat: [18, 30], light: [38, 48] },
        { id: 'eucalyptus', baseHue: 165, hueVar: 10, sat: [20, 32], light: [42, 52] },
        { id: 'denim', baseHue: 215, hueVar: 15, sat: [28, 42], light: [45, 55] },
        { id: 'seafoam', baseHue: 170, hueVar: 12, sat: [25, 38], light: [50, 58] },
        // 中性中色
        { id: 'pearl', baseHue: 45, hueVar: 5, sat: [12, 22], light: [52, 60] },
        { id: 'silver', baseHue: 210, hueVar: 8, sat: [10, 20], light: [55, 62] },
        { id: 'smoke', baseHue: 200, hueVar: 10, sat: [12, 22], light: [48, 56] },
        { id: 'warm_grey', baseHue: 40, hueVar: 6, sat: [14, 24], light: [50, 58] },
        { id: 'cool_grey', baseHue: 215, hueVar: 6, sat: [12, 22], light: [50, 58] },
        { id: 'taupe', baseHue: 30, hueVar: 8, sat: [18, 28], light: [48, 56] },

        // 浅色系（12种，亮度78-96%，配黑字）
        { id: 'cream_paper', baseHue: 45, hueVar: 10, sat: [10, 20], light: [88, 95] },
        { id: 'slate_light', baseHue: 200, hueVar: 15, sat: [12, 22], light: [82, 90] },
        { id: 'bamboo', baseHue: 95, hueVar: 12, sat: [15, 25], light: [78, 88] },
        { id: 'tea_stain', baseHue: 40, hueVar: 8, sat: [18, 30], light: [80, 90] },
        { id: 'moon_white', baseHue: 195, hueVar: 10, sat: [8, 18], light: [92, 97] },
        { id: 'ivory', baseHue: 50, hueVar: 8, sat: [12, 22], light: [90, 96] },
        { id: 'almond', baseHue: 40, hueVar: 6, sat: [15, 25], light: [85, 92] },
        { id: 'mist', baseHue: 180, hueVar: 8, sat: [10, 18], light: [88, 94] },
        { id: 'dawn', baseHue: 35, hueVar: 5, sat: [12, 22], light: [90, 96] },
        { id: 'shell', baseHue: 25, hueVar: 6, sat: [14, 24], light: [86, 93] },
        { id: 'silk', baseHue: 55, hueVar: 5, sat: [10, 18], light: [92, 97] },
        { id: 'porcelain', baseHue: 200, hueVar: 5, sat: [8, 15], light: [94, 98] }
    ];

    function generateHashGradient(title, author) {
        const seedStr = `${(title || '未命名').trim()}|${(author || '佚名').trim()}`;
        const hash = djb2(seedStr);
        const themeIndex = hash % COLOR_THEMES.length;
        const theme = COLOR_THEMES[themeIndex];
        const rng = mulberry32(hash);
        
        const wordCount = seedStr.length;
        const hueShift = (wordCount % 5) * 3 - 6;
        const baseHue = ((theme.baseHue + hueShift) % 360 + 360) % 360;
        
        const stopCount = 2 + (hash % 3);
        const stops = [];
        const GOLDEN_ANGLE = 137.5077640500378;
        
        for (let i = 0; i < stopCount; i++) {
            let t = i / (stopCount - 1);
            let hue = baseHue + (i * GOLDEN_ANGLE * 0.3);
            hue = ((hue % 360) + 360) % 360;
            
            const hueDiff = Math.abs(hue - theme.baseHue);
            if (hueDiff > theme.hueVar && hueDiff < (360 - theme.hueVar)) {
                hue = baseHue + (i % 2 === 0 ? 1 : -1) * (theme.hueVar * 0.5);
            }
            
            const satBase = theme.sat[0] + rng() * (theme.sat[1] - theme.sat[0]);
            const sat = Math.floor(satBase * 0.9);
            const light = Math.floor(theme.light[0] + rng() * (theme.light[1] - theme.light[0]));
            
            stops.push({
                offset: t,
                color: `hsl(${Math.floor(hue)}, ${sat}%, ${light}%)`,
                hue: Math.floor(hue),
                saturation: sat,
                lightness: light
            });
        }
        
        const angle = 30 + (hash % 120);
        const useDarkText = shouldUseDarkText(stops);
        
        return {
            stops: stops,
            angle: angle,
            isDark: !useDarkText,
            theme: theme.id
        };
    }

    // ==================== 文本处理 ====================

    // 使用 Unicode 转义避免引号问题
    const FULL_WIDTH_PUNCTS = '\uFF0C\u3002\u3001\uFF1B\uFF1A\uFF01\uFF1F\u2018\u2019\u201C\u201D\uFF08\uFF09\u3010\u3011\u300A\u300B\u3008\u3009\u300E\u300F\u300C\u300D\u3014\u3015\u2026\u2014\uFF5E\uFF5C';

    function addSpaces(text) {
        text = text.replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2');
        text = text.replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
        return text;
    }

    function tokenize(text, forVertical) {
        const units = [];
        let i = 0;
        while (i < text.length) {
            const char = text[i];
            
            if (/\s/.test(char)) {
                if (!forVertical) {
                    units.push({ text: ' ', type: 'space', width: 0.6 });
                }
                i++;
                continue;
            }
            
            if (/[\u4e00-\u9fa5]/.test(char)) {
                units.push({ text: char, type: 'cjk', width: 1 });
                i++;
            } else if (FULL_WIDTH_PUNCTS.includes(char) || /[\u3000-\u303F\uFF00-\uFFEF]/.test(char)) {
                units.push({ text: char, type: 'punct', width: 0.5, isFullWidth: true });
                i++;
            } else if (/[,.!?;:'"()[\]{}]/.test(char)) {
                units.push({ text: char, type: 'punct', width: 0.3, isFullWidth: false });
                i++;
            } else if (/[a-zA-Z]/.test(char)) {
                let word = '';
                while (i < text.length && /[a-zA-Z]/.test(text[i])) word += text[i++];
                let width = 0;
                for (let c of word) width += (c >= 'A' && c <= 'Z') ? 0.9 : 0.55;
                units.push({ text: word, type: 'latin', width: width, chars: word, hasLower: /[a-z]/.test(word) });
            } else if (/[0-9]/.test(char)) {
                let num = '';
                while (i < text.length && /[0-9]/.test(text[i])) num += text[i++];
                units.push({ text: num, type: 'number', width: num.length * 0.6 });
            } else {
                units.push({ text: char, type: 'punct', width: 0.5 });
                i++;
            }
        }
        return units;
    }

    function analyzeText(units, originalText) {
        const contentUnits = units.filter(u => u.type !== 'space');
        const hasCJK = contentUnits.some(u => u.type === 'cjk');
        const hasLowercase = /[a-z]/.test(originalText);
        
        if (hasCJK && hasLowercase) {
            return { mode: 'horizontal', units: units, strict: false, reason: 'contains_lowercase' };
        }
        
        const latinWords = contentUnits.filter(u => u.type === 'latin');
        const hasLatin = latinWords.length > 0;
        
        if (!hasCJK && hasLatin && latinWords.length <= 6) {
            const verticalUnits = contentUnits.filter(u => 
                u.type === 'latin' || u.type === 'number'
            );
            return {
                mode: 'vertical-words',
                words: verticalUnits,
                strict: true,
                reason: 'english_words_vertical'
            };
        }
        
        const isCJKCompatible = contentUnits.every(u => 
            u.type === 'cjk' || u.type === 'punct' || u.type === 'number'
        );
        
        if (isCJKCompatible && contentUnits.length <= CONFIG.maxCJKForVertical) {
            return { 
                mode: 'vertical-cjk', 
                units: contentUnits,
                unitCount: contentUnits.length,
                strict: true 
            };
        }
        
        return { 
            mode: 'horizontal', 
            units: units,
            contentUnits: contentUnits,
            strict: false,
            reason: hasLatin ? 'too_many_words' : 'too_long'
        };
    }

    // ==================== 排版计算 ====================

    function balanceColumns(total, maxPerCol, minOrphan) {
        if (total <= maxPerCol) return [total];
        const cols = Math.ceil(total / maxPerCol);
        const distribution = new Array(cols).fill(0);
        let remaining = total;
        
        for (let i = cols - 1; i >= 0; i--) {
            if (i === cols - 1) {
                let count = total % maxPerCol;
                if (count === 0) count = maxPerCol;
                if (count < minOrphan && total > minOrphan) count = minOrphan;
                distribution[i] = count;
                remaining -= count;
            } else {
                distribution[i] = Math.min(remaining, maxPerCol);
                remaining -= distribution[i];
            }
        }
        return distribution;
    }

    function balanceLinesForOrphan(total, maxPerLine, minOrphan) {
        const lines = Math.ceil(total / maxPerLine);
        const avg = Math.floor(total / lines);
        const remainder = total % lines;
        const distribution = [];
        
        for (let i = 0; i < lines; i++) {
            let count = avg;
            if (i < remainder) count++;
            if (i === lines - 1 && count < minOrphan && distribution.length > 0) {
                const prev = distribution[distribution.length - 1];
                if (prev > minOrphan) {
                    distribution[distribution.length - 1] = prev - (minOrphan - count);
                    count = minOrphan;
                }
            }
            distribution.push(count);
        }
        return distribution;
    }

    function calculateVerticalCJK(units, zone, config) {
        const { letterSpacing, lineSpacingMm, visualRatio } = config;
        const { width: zoneW, height: zoneH } = zone;
        let total = units.length;
        
        if (total > 27) {
            units = units.slice(0, 27);
            units[26] = { text: '\u2026', type: 'punct', width: 0.5, isFullWidth: true };
            total = 27;
        }
        
        const distribution = balanceColumns(total, CONFIG.maxVerticalPerCol, CONFIG.minOrphanUnits);
        const cols = distribution.length;
        
        let fontSize = Math.min(
            zoneH / (Math.max(...distribution) * 1.1),
            zoneW / (cols * 1.3)
        );
        fontSize = Math.min(fontSize, zoneH * 0.12);
        
        let bestLayout = null;
        let bestError = Infinity;
        
        for (let iter = 0; iter < 25; iter++) {
            const charGap = fontSize * letterSpacing;
            const lineHeight = fontSize + charGap;
            const colGap = lineSpacingMm;
            
            const actualHeight = Math.max(...distribution) * fontSize + 
                                (Math.max(...distribution) - 1) * charGap;
            const actualWidth = cols * fontSize + (cols - 1) * colGap;
            
            const zoneArea = zoneW * zoneH;
            const actualArea = actualWidth * actualHeight;
            const ratio = actualArea / zoneArea;
            
            const withinBounds = actualWidth <= zoneW * 0.95 && actualHeight <= zoneH * 0.95;
            
            if (withinBounds) {
                const error = Math.abs(ratio - visualRatio);
                if (error < bestError) {
                    bestError = error;
                    bestLayout = {
                        mode: 'vertical-cjk',
                        cols: cols,
                        distribution: distribution,
                        units: units,
                        fontSize: fontSize,
                        letterSpacing: letterSpacing,
                        lineSpacingMm: lineSpacingMm,
                        charGap: charGap,
                        colGap: colGap,
                        lineHeight: lineHeight,
                        actualWidth: actualWidth,
                        actualHeight: actualHeight,
                        zone: zone
                    };
                }
                if (error < 0.03) break;
            }
            
            if (ratio < visualRatio && withinBounds) fontSize *= 1.04;
            else fontSize *= 0.96;
            
            fontSize = Math.max(8, Math.min(fontSize, zoneH / 4));
        }
        
        return bestLayout || createFallbackVertical(units, zone, config);
    }

    function createFallbackVertical(units, zone, config) {
        const fontSize = zone.height / 12;
        const charGap = fontSize * config.letterSpacing;
        return {
            mode: 'vertical-cjk',
            cols: 1,
            distribution: [Math.min(units.length, 9)],
            units: units.slice(0, 9),
            fontSize: fontSize,
            letterSpacing: config.letterSpacing,
            lineSpacingMm: config.lineSpacingMm,
            charGap: charGap,
            colGap: config.lineSpacingMm,
            lineHeight: fontSize + charGap,
            actualWidth: fontSize,
            actualHeight: 9 * fontSize + 8 * charGap,
            zone: zone
        };
    }

    function calculateVerticalWords(words, zone, config) {
        const { lineSpacingMm, visualRatio } = config;
        const { width: zoneW, height: zoneH } = zone;
        const wordCount = words.length;
        
        // 修复：计算最长单词的字符数，用于预估宽度
        const maxCharCount = Math.max(...words.map(w => w.text.length));
        const maxWord = words.find(w => w.text.length === maxCharCount);
        
        // 保守估算：每个大写字母约 0.7em 宽，小写约 0.55em
        const estimatedCharWidth = 0.65; 
        const maxEstimatedWidth = maxCharCount * estimatedCharWidth;
        
        // 初始字号取 min(高度限制, 宽度限制)
        const sizeByHeight = zoneH / (wordCount * 1.3);
        const sizeByWidth = (zoneW * 0.85) / maxEstimatedWidth; // 留 15% 边距
        let fontSize = Math.min(sizeByHeight, sizeByWidth, zoneW / 2);
        
        // 辅助函数：测量文本宽度
        function measureWord(text, size) {
            let w = 0;
            for (let c of text) {
                w += (c >= 'A' && c <= 'Z') ? 0.9 : 0.55;
            }
            return w * size;
        }
        
        let bestLayout = null;
        let bestError = Infinity;
        
        for (let iter = 0; iter < 35; iter++) { // 增加迭代次数至35
            const lineHeight = fontSize + lineSpacingMm;
            const colWidths = words.map(w => measureWord(w.text, fontSize));
            const actualWidth = Math.max(...colWidths);
            const actualHeight = wordCount * fontSize + (wordCount - 1) * (lineHeight - fontSize);
            
            const withinBounds = actualWidth <= zoneW * 0.9 && actualHeight <= zoneH * 0.95;
            
            if (withinBounds) {
                const ratio = (actualWidth * actualHeight) / (zoneW * zoneH);
                const error = Math.abs(ratio - visualRatio);
                if (error < bestError) {
                    bestError = error;
                    bestLayout = {
                        mode: 'vertical-words',
                        words,
                        fontSize,
                        lineSpacingMm,
                        lineHeight,
                        colWidths,
                        actualWidth,
                        actualHeight,
                        zone
                    };
                }
                if (error < 0.03) break;
            }
            
            // 修复：根据溢出方向动态调整，加速收敛
            if (actualWidth > zoneW * 0.9 || actualHeight > zoneH * 0.95) {
                // 超出边界，激进缩小（按超出比例）
                const widthRatio = actualWidth / (zoneW * 0.9);
                const heightRatio = actualHeight / (zoneH * 0.95);
                const shrinkFactor = 0.9 / Math.max(widthRatio, heightRatio, 1.1);
                fontSize *= Math.max(0.85, shrinkFactor); // 不低于 0.85 倍，避免震荡
            } else {
                // 未超出，按视觉比例微调
                const currentRatio = (actualWidth * actualHeight) / (zoneW * zoneH);
                fontSize *= (currentRatio < visualRatio) ? 1.02 : 0.98;
            }
            
            fontSize = Math.max(8, Math.min(fontSize, zoneH / 2)); // 下限设为8mm
        }
        
        // 修复：改进 fallback，确保绝对安全
        if (!bestLayout) {
            const safeFontSize = Math.min(
                zoneH / (wordCount * 2.0),              // 更保守的高度
                zoneW * 0.8 / maxEstimatedWidth,        // 确保最长单词能放入
                zoneW / 3                               // 硬上限
            );
            const safeLineHeight = safeFontSize + lineSpacingMm;
            const safeColWidths = words.map(w => measureWord(w.text, safeFontSize));
            
            return {
                mode: 'vertical-words',
                words,
                fontSize: safeFontSize,
                lineSpacingMm,
                lineHeight: safeLineHeight,
                colWidths: safeColWidths,
                actualWidth: Math.max(...safeColWidths),
                actualHeight: wordCount * safeFontSize + (wordCount - 1) * (safeLineHeight - safeFontSize),
                zone
            };
        }
        
        return bestLayout;
    }

    function calculateHorizontal(units, zone, config, isCJK) {
        const { letterSpacing, lineSpacingMm, visualRatio } = config;
        const { width: zoneW, height: zoneH } = zone;
        
        let fontSize = Math.min(zoneH / 4, zoneW / 8);
        let bestLayout = null;
        let bestError = Infinity;
        
        function measureText(text, size) {
            let w = 0;
            for (let c of text) {
                if (/[\u4e00-\u9fa5]/.test(c)) w += size;
                else if (/[A-Z]/.test(c)) w += size * 0.9;
                else if (/[a-z]/.test(c)) w += size * 0.55;
                else if (/\d/.test(c)) w += size * 0.6;
                else w += size * 0.5;
            }
            return w;
        }
        
        function wrapLinesCJK(contentUnits, maxWidth, fSize, charGap) {
            const total = Math.min(contentUnits.length, 48);
            const actualUnits = contentUnits.slice(0, total);
            if (contentUnits.length > 48) {
                actualUnits[47] = { text: '\u2026', type: 'punct', width: 0.5, isFullWidth: true };
            }
            
            const distribution = balanceLinesForOrphan(actualUnits.length, CONFIG.maxHorizontalChars, CONFIG.minOrphanUnits);
            const lines = [];
            let idx = 0;
            for (let count of distribution) {
                if (idx >= actualUnits.length) break;
                lines.push(actualUnits.slice(idx, idx + count));
                idx += count;
            }
            return lines;
        }
        
        function wrapLinesMixed(allUnits, maxWidth, fSize, charGap) {
            const lines = [];
            let currentLine = [];
            let currentWidth = 0;
            let currentUnits = 0;
            
            for (let i = 0; i < allUnits.length; i++) {
                const unit = allUnits[i];
                if (unit.type === 'space' && currentLine.length === 0) continue;
                
                let unitCjkUnits = 0;
                let unitPxWidth = 0;
                
                if (unit.type === 'cjk') { unitCjkUnits = 1; unitPxWidth = fSize; }
                else if (unit.type === 'space') { unitCjkUnits = 0.6; unitPxWidth = fSize * 0.6; }
                else if (unit.type === 'latin') { unitCjkUnits = unit.width; unitPxWidth = measureText(unit.text, fSize); }
                else if (unit.type === 'number') { unitCjkUnits = unit.width; unitPxWidth = measureText(unit.text, fSize); }
                else if (unit.type === 'punct') { unitCjkUnits = 0.5; unitPxWidth = fSize * 0.5; }
                
                const newUnits = currentUnits + unitCjkUnits;
                const newWidth = currentWidth + (currentLine.length > 0 ? charGap : 0) + unitPxWidth;
                
                if ((newUnits > CONFIG.maxHorizontalChars || newWidth > maxWidth * 0.95) && currentLine.length > 0) {
                    lines.push(currentLine);
                    currentLine = unit.type === 'space' ? [] : [unit];
                    currentWidth = unit.type === 'space' ? 0 : unitPxWidth;
                    currentUnits = unit.type === 'space' ? 0 : unitCjkUnits;
                    
                    if (lines.length >= CONFIG.maxHorizontalLines) {
                        const remaining = allUnits.slice(i);
                        const lastLine = lines[lines.length - 1];
                        for (let unit of remaining) {
                            let unitW = (unit.type === 'cjk') ? fSize : measureText(unit.text, fSize);
                            if (currentWidth + (lastLine.length > 0 ? charGap : 0) + unitW > maxWidth * 0.95) {
                                lastLine.push({ text: '\u2026', type: 'punct', width: 0.5, isFullWidth: true });
                                return lines;
                            }
                            lastLine.push(unit);
                        }
                        return lines;
                    }
                } else {
                    currentLine.push(unit);
                    currentWidth = newWidth;
                    currentUnits = newUnits;
                }
            }
            
            if (currentLine.length > 0) lines.push(currentLine);
            return lines;
        }
        
        for (let iter = 0; iter < 20; iter++) {
            const charGap = fontSize * letterSpacing;
            const lineHeight = fontSize + lineSpacingMm;
            
            const contentUnits = units.filter(u => u.type !== 'space');
            const lines = isCJK 
                ? wrapLinesCJK(contentUnits, zoneW, fontSize, charGap)
                : wrapLinesMixed(units, zoneW, fontSize, charGap);
            
            let actualHeight = lines.length === 1 ? fontSize : fontSize + (lines.length - 1) * lineHeight;
            let actualWidth = 0;
            lines.forEach(line => {
                let lineWidth = 0;
                let first = true;
                line.forEach(unit => {
                    if (!first) lineWidth += charGap;
                    if (unit.type === 'cjk') lineWidth += fontSize;
                    else lineWidth += measureText(unit.text, fontSize);
                    first = false;
                });
                actualWidth = Math.max(actualWidth, lineWidth);
            });
            
            const zoneArea = zoneW * zoneH;
            const actualArea = actualWidth * actualHeight;
            const ratio = actualArea / zoneArea;
            
            const withinBounds = actualWidth <= zoneW * 0.95 && actualHeight <= zoneH * 0.95 
                && lines.length <= CONFIG.maxHorizontalLines;
            
            if (withinBounds) {
                const error = Math.abs(ratio - visualRatio);
                if (error < bestError) {
                    bestError = error;
                    bestLayout = {
                        mode: 'horizontal',
                        fontSize: fontSize,
                        letterSpacing: letterSpacing,
                        lineSpacingMm: lineSpacingMm,
                        lineHeight: lineHeight,
                        lines: lines,
                        actualWidth: actualWidth,
                        actualHeight: actualHeight,
                        zone: zone
                    };
                }
                if (error < 0.03) break;
            }
            
            if (ratio < visualRatio && withinBounds) fontSize *= 1.04;
            else fontSize *= 0.96;
            
            fontSize = Math.max(10, Math.min(fontSize, zoneH / 2));
        }
        
        return bestLayout || createFallbackHorizontal(units, zone, config);
    }

    function createFallbackHorizontal(units, zone, config) {
        const fontSize = zone.height / 6;
        return {
            mode: 'horizontal',
            fontSize: fontSize,
            letterSpacing: config.letterSpacing,
            lineSpacingMm: config.lineSpacingMm,
            lineHeight: fontSize + config.lineSpacingMm,
            lines: [units.slice(0, 8)],
            actualWidth: fontSize * 8,
            actualHeight: fontSize,
            zone: zone
        };
    }

    function calculateAuthor(units, zone, config) {
        const { letterSpacing, lineSpacingMm } = config;
        const { width: zoneW, height: zoneH } = zone;
        
        let fontSize = Math.min(11, zoneH / 2.5);
        const lineHeight = fontSize + lineSpacingMm;
        const charGap = fontSize * letterSpacing;
        
        function measureText(text, size) {
            let w = 0;
            for (let c of text) {
                if (/[\u4e00-\u9fa5]/.test(c)) w += size;
                else if (/[A-Z]/.test(c)) w += size * 0.9;
                else if (/[a-z]/.test(c)) w += size * 0.55;
                else if (/\d/.test(c)) w += size * 0.6;
                else w += size * 0.5;
            }
            return w;
        }
        
        const lines = [];
        let currentLine = [];
        let currentWidth = 0;
        
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            if (unit.type === 'space' && currentLine.length === 0) continue;
            
            let unitW = (unit.type === 'cjk') ? fontSize : measureText(unit.text, fontSize);
            if (unit.type === 'punct') unitW = fontSize * 0.5;
            
            if (currentWidth + (currentLine.length > 0 ? charGap : 0) + unitW > zoneW * 0.9 && currentLine.length > 0) {
                lines.push(currentLine);
                if (lines.length >= 2) {
                    const remaining = units.slice(i);
                    const line = [];
                    let w = 0;
                    for (let unit of remaining) {
                        let uw = (unit.type === 'cjk') ? fontSize : measureText(unit.text, fontSize);
                        if (w + (line.length > 0 ? charGap : 0) + uw > zoneW * 0.9 && line.length > 0) {
                            line.push({ text: '\u2026', type: 'punct', width: 0.5, isFullWidth: true });
                            break;
                        }
                        line.push(unit);
                        w += (line.length > 1 ? charGap : 0) + uw;
                    }
                    lines[1] = line;
                    return {
                        mode: 'horizontal',
                        fontSize: fontSize,
                        letterSpacing: letterSpacing,
                        lineSpacingMm: lineSpacingMm,
                        lineHeight: lineHeight,
                        lines: lines,
                        actualHeight: lines.length === 1 ? fontSize : fontSize + lineHeight,
                        actualWidth: zoneW * 0.9,
                        zone: zone
                    };
                }
                currentLine = unit.type === 'space' ? [] : [unit];
                currentWidth = unit.type === 'space' ? 0 : unitW;
            } else {
                currentLine.push(unit);
                currentWidth += (currentLine.length > 1 ? charGap : 0) + unitW;
            }
        }
        
        if (currentLine.length > 0) lines.push(currentLine);
        const actualHeight = lines.length === 1 ? fontSize : fontSize + lineHeight;
        
        return {
            mode: 'horizontal',
            fontSize: fontSize,
            letterSpacing: letterSpacing,
            lineSpacingMm: lineSpacingMm,
            lineHeight: lineHeight,
            lines: lines,
            actualHeight: actualHeight,
            actualWidth: zoneW * 0.9,
            zone: zone
        };
    }

    // ==================== SVG渲染 ====================

    // 用于生成唯一ID的计数器
    let svgIdCounter = 0;
    
    function renderSVG(titleLayout, authorLayout, gradient, options) {
        options = options || {};
        const width = options.width || CONFIG.width;
        const height = options.height || CONFIG.height;
        const titleFont = options.titleFont || 'Noto Serif SC';
        const authorFont = options.authorFont || 'Noto Sans SC';
        
        // 生成唯一的ID后缀，避免多个SVG在同一页面时ID冲突
        const idSuffix = svgIdCounter++;
        const gradId = `bgGrad-${idSuffix}`;
        const spineId = `spineGrad-${idSuffix}`;
        const noiseId = `noise-${idSuffix}`;
        
        const isDark = gradient.isDark;
        const textColor = isDark ? '#ffffff' : '#0f172a';
        
        // 构建渐变定义
        const rad = (gradient.angle * Math.PI) / 180;
        const cx = width / 2;
        const cy = height / 2;
        const diag = Math.sqrt(width*width + height*height);
        const x1 = cx - Math.cos(rad) * diag / 2;
        const y1 = cy - Math.sin(rad) * diag / 2;
        const x2 = cx + Math.cos(rad) * diag / 2;
        const y2 = cy + Math.sin(rad) * diag / 2;
        
        const stopsHtml = gradient.stops.map(s => 
            `<stop offset="${s.offset}" stop-color="${s.color}"/>`
        ).join('');
        
        // 根据主题生成书脊高光颜色
        const c = isDark ? '255,255,255' : '0,0,0';
        const spineStops = isDark ? [
            { offset: '0%', color: `rgba(${c},0.90)` },
            { offset: '2%', color: `rgba(${c},0.90)` },
            { offset: '5%', color: `rgba(${c},0.12)` },
            { offset: '25%', color: `rgba(${c},0.55)` },
            { offset: '45%', color: `rgba(${c},0.50)` },
            { offset: '65%', color: `rgba(${c},0.20)` },
            { offset: '85%', color: `rgba(${c},0.06)` },
            { offset: '100%', color: `rgba(${c},0)` }
        ] : [
            { offset: '0%', color: `rgba(${c},0.3)` },
            { offset: '2%', color: `rgba(${c},0.05)` },
            { offset: '5%', color: `rgba(${c},0.06)` },
            { offset: '25%', color: `rgba(${c},0.08)` },
            { offset: '45%', color: `rgba(${c},0.12)` },
            { offset: '65%', color: `rgba(${c},0.1)` },
            { offset: '85%', color: `rgba(${c},0.03)` },
            { offset: '100%', color: `rgba(${c},0)` }
        ];
        const spineStopsHtml = spineStops.map(s => 
            `<stop offset="${s.offset}" stop-color="${s.color}"/>`
        ).join('');
        
        // 纸张噪点滤镜（简化版）
        const noiseFilter = isDark 
            ? `<filter id="${noiseId}" x="0%" y="0%" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="5"/>
                <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0"/>
               </filter>`
            : `<filter id="${noiseId}" x="0%" y="0%" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="5"/>
                <feColorMatrix type="matrix" values="0 0 0 0 0.4  0 0 0 0 0.4  0 0 0 0 0.4  0 0 0 0.04 0"/>
               </filter>`;
        
        // 渲染标题
        let titleHtml = '';
        if (titleLayout.mode === 'vertical-cjk') {
            titleHtml = renderVerticalCJKSVG(titleLayout, textColor, titleFont);
        } else if (titleLayout.mode === 'vertical-words') {
            titleHtml = renderVerticalWordsSVG(titleLayout, textColor, titleFont);
        } else {
            titleHtml = renderHorizontalSVG(titleLayout, textColor, titleFont, false);
        }
        
        // 渲染作者
        const authorHtml = renderHorizontalSVG(authorLayout, textColor, authorFont, true);
        
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
    <defs>
        <linearGradient id="${gradId}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
            ${stopsHtml}
        </linearGradient>
        <linearGradient id="${spineId}" x1="0%" y1="0%" x2="100%" y2="0%">
            ${spineStopsHtml}
        </linearGradient>
        ${noiseFilter}
    </defs>
    <rect width="${width}" height="${height}" fill="url(#${gradId})"/>
    ${titleHtml}
    ${authorHtml}
    <rect width="${width}" height="${height}" filter="url(#${noiseId})" style="mix-blend-mode: ${isDark ? 'overlay' : 'multiply'}; opacity: 0.6;"/>
    <rect x="0" y="0" width="12" height="${height}" fill="url(#${spineId})" style="mix-blend-mode: ${isDark ? 'overlay' : 'multiply'};"/>
</svg>`;
    }

    function renderVerticalCJKSVG(layout, color, fontFamily) {
        const cols = layout.cols;
        const distribution = layout.distribution;
        const units = layout.units;
        const fontSize = layout.fontSize;
        const charGap = layout.charGap;
        const colGap = layout.colGap;
        const zone = layout.zone;
        
        const offsetX = (zone.width - layout.actualWidth) / 2;
        const offsetY = (zone.height - layout.actualHeight) / 2;
        const startX = zone.x + offsetX + layout.actualWidth - fontSize/2;
        const startY = zone.y + offsetY + fontSize/2;
        
        // 直接使用 FULL_WIDTH_PUNCTS
        const rotatedPuncts = FULL_WIDTH_PUNCTS;
        
        let texts = '';
        let unitIdx = 0;
        for (let col = 0; col < cols; col++) {
            const colCount = distribution[col];
            const colX = startX - col * (fontSize + colGap);
            
            for (let i = 0; i < colCount; i++) {
                if (unitIdx >= units.length) break;
                const unit = units[unitIdx++];
                const charY = startY + i * (fontSize + charGap);
                
                const transform = (unit.type === 'punct' && unit.isFullWidth && rotatedPuncts.indexOf(unit.text) >= 0)
                    ? ` transform="rotate(90, ${colX.toFixed(2)}, ${charY.toFixed(2)})"`
                    : '';
                const baseline = (unit.type === 'punct' && unit.isFullWidth) ? 'middle' : 'central';
                
                texts += `        <text x="${colX.toFixed(2)}" y="${charY.toFixed(2)}" text-anchor="middle" dominant-baseline="${baseline}" font-size="${fontSize.toFixed(2)}"${transform}>${escapeXml(unit.text)}</text>\n`;
            }
        }
        
        return `    <g fill="${color}" font-family="${fontFamily}, serif">\n${texts}    </g>`;
    }

    function renderVerticalWordsSVG(layout, color, fontFamily) {
        const words = layout.words;
        const fontSize = layout.fontSize;
        const lineHeight = layout.lineHeight;
        const zone = layout.zone;
        
        const actualHeight = words.length * fontSize + (words.length - 1) * (lineHeight - fontSize);
        const startY = zone.y + (zone.height - actualHeight) / 2 + fontSize / 2;
        const centerX = zone.x + zone.width / 2;
        
        const texts = words.map((word, idx) => {
            const y = startY + idx * lineHeight;
            return `        <text x="${centerX.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize.toFixed(2)}">${escapeXml(word.text)}</text>`;
        }).join('\n');
        
        return `    <g fill="${color}" font-family="${fontFamily}, serif">\n${texts}\n    </g>`;
    }

    function renderHorizontalSVG(layout, color, fontFamily, isAuthor) {
        const fontSize = layout.fontSize;
        const letterSpacing = layout.letterSpacing;
        const lineHeight = layout.lineHeight;
        const lines = layout.lines;
        const zone = layout.zone;
        
        const offsetX = (zone.width - layout.actualWidth) / 2;
        const offsetY = (zone.height - layout.actualHeight) / 2;
        
        const startX = zone.x + zone.width / 2;
        const startY = zone.y + offsetY + fontSize/2;
        
        const opacity = isAuthor ? ' opacity="0.85"' : '';
        const letterSpacingAttr = letterSpacing > 0 ? ` letter-spacing="${letterSpacing}em"` : '';
        
        const texts = lines.map((line, idx) => {
            const y = startY + idx * lineHeight;
            const lineText = line.map(u => u.text).join('');
            return `        <text x="${startX.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize.toFixed(2)}"${letterSpacingAttr}${opacity}>${escapeXml(lineText)}</text>`;
        }).join('\n');
        
        return `    <g fill="${color}" font-family="${fontFamily}, serif">\n${texts}\n    </g>`;
    }

    function escapeXml(str) {
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&apos;');
    }

    // ==================== 主API ====================

    function generate(title, author, options) {
        try {
            options = options || {};
            const titleFont = options.titleFont || 'Noto Serif SC';
            const authorFont = options.authorFont || 'Noto Sans SC';
            const visualRatio = options.visualRatio || 0.65;
            const letterSpacing = options.letterSpacing || 0.05;
            const lineSpacingMm = options.lineSpacingMm || 3;
            const bodyRatio = options.bodyRatio || 0.75;
            const titleMaxWidth = options.titleMaxWidth || 0.70;
            const titleMaxHeight = options.titleMaxHeight || 0.80;
            const authorMaxWidth = options.authorMaxWidth || 0.60;
            const authorMaxHeight = options.authorMaxHeight || 0.90;
            const sectionGap = options.sectionGap || 2;
            const bleed = options.bleed || 3;
            
            // 使用固定B5尺寸，SVG会自适应缩放
            const width = CONFIG.width;
            const height = CONFIG.height;
            
            // 生成渐变
            const gradient = generateHashGradient(title, author);
            
            // 处理文本
            const spacedTitle = addSpaces(title || '未命名');
            const spacedAuthor = addSpaces(author || '佚名');
            
            const titleUnits = tokenize(spacedTitle, false);
            const authorUnits = tokenize(spacedAuthor, false);
            
            // 分析标题排版模式
            const analysis = analyzeText(titleUnits, title || '');
            
            // 计算版心几何
            const availableH = height - bleed * 2;
            const titleZoneH = availableH * bodyRatio - sectionGap/2;
            const authorZoneH = availableH * (1 - bodyRatio) - sectionGap/2;
            
            const titleZoneRaw = {
                x: (width - width * titleMaxWidth) / 2,
                y: bleed + 3,
                width: width * titleMaxWidth,
                height: titleZoneH * titleMaxHeight
            };
            titleZoneRaw.y += (titleZoneH - titleZoneRaw.height) / 2;
            
            const authorZoneRaw = {
                x: (width - width * authorMaxWidth) / 2,
                y: bleed + titleZoneH + sectionGap,
                width: width * authorMaxWidth,
                height: authorZoneH * authorMaxHeight
            };
            authorZoneRaw.y += (authorZoneH - authorZoneRaw.height) / 2;
            
            const config = {
                visualRatio: visualRatio,
                letterSpacing: letterSpacing,
                lineSpacingMm: lineSpacingMm
            };
            
            // 计算标题排版
            let titleLayout;
            if (analysis.mode === 'vertical-cjk') {
                titleLayout = calculateVerticalCJK(analysis.units, titleZoneRaw, config);
            } else if (analysis.mode === 'vertical-words') {
                titleLayout = calculateVerticalWords(analysis.words, titleZoneRaw, config);
            } else {
                const isCJK = /[\u4e00-\u9fa5]/.test(title || '') && analysis.reason !== 'contains_lowercase';
                titleLayout = calculateHorizontal(titleUnits, titleZoneRaw, config, isCJK);
            }
            
            // 计算作者排版
            const authorLayout = calculateAuthor(authorUnits, authorZoneRaw, config);
            
            // 确保布局有效
            if (!titleLayout || !authorLayout) {
                console.warn('[BibliomorphCover] Layout calculation failed, using fallback');
                return null;
            }
            
            // 渲染SVG
            return renderSVG(titleLayout, authorLayout, gradient, {
                width: width, 
                height: height, 
                titleFont: titleFont, 
                authorFont: authorFont
            });
        } catch (error) {
            console.error('[BibliomorphCover] Generate failed:', error);
            return null;
        }
    }

    // 导出模块
    const BibliomorphCover = {
        generate: generate,
        generateGradient: generateHashGradient,
        // 保留供其他模块使用的工具函数
        utils: {
            djb2: djb2,
            mulberry32: mulberry32,
            COLOR_THEMES: COLOR_THEMES
        }
    };

    // 兼容多种模块系统
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = BibliomorphCover;
    }
    
    if (typeof window !== 'undefined') {
        // 注册到全局和 Lumina 命名空间
        window.BibliomorphCover = BibliomorphCover;
        if (window.Lumina) {
            window.Lumina.BibliomorphCover = BibliomorphCover;
        }
    }

})();
