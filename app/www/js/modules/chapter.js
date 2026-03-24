// ==================== 8. 章节管理 ====================

Lumina.Parser.buildChapters = (items) => {
    const newChapters = [];
    let currentChapter = null, buffer = [], globalIndex = 0;

    const flushBuffer = () => {
        if (!buffer.length) return;
        const startIdx = globalIndex - buffer.length;
        newChapters.push({
            id: `preface-${newChapters.length}`, title: Lumina.I18n.t('preface'), isPreface: true,
            startIndex: startIdx, endIndex: globalIndex - 1, items: [...buffer]
        });
        buffer = [];
    };

    items.forEach((item, index) => {
        globalIndex = index;
        if (Lumina.Parser.isChapterStart(item)) {
            flushBuffer();
            currentChapter = {
                id: `chapter-${newChapters.length}`, title: Lumina.Parser.extractChapterTitle(item),
                isPreface: false, startIndex: index, endIndex: items.length - 1, items: [item]
            };
            newChapters.push(currentChapter);
        } else {
            if (currentChapter) { currentChapter.items.push(item); currentChapter.endIndex = index; }
            else buffer.push(item);
        }
    });

    flushBuffer();
    return newChapters;
};

Lumina.Parser.isChapterStart = (item) => item.type === 'title' || item.type === 'heading1';

Lumina.Parser.extractChapterTitle = (item) => item.display?.replace(/^\[T\]/, '') || item.text;

Lumina.Parser.applyNumberingStyle = () => {
    if (!Lumina.State.app.document.items.length) return;
    
    // 重置计数器
    Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
    
    // 遍历现有文档项，仅更新 display 字段
    Lumina.State.app.document.items.forEach(item => {
        if (item.type && item.type.startsWith('heading')) {
            const level = parseInt(item.type.replace('heading', '')) || 1;
            
            // 更新层级计数器
            Lumina.State.sectionCounters[level - 1]++;
            for (let i = level; i < 6; i++) Lumina.State.sectionCounters[i] = 0;
            
            // 使用 cleanText（去除了"第X章"前缀的纯标题）重新生成序号
            const textForDisplay = item.cleanText !== undefined ? item.cleanText : item.text;
            item.display = Lumina.Config.numberingStrategies[Lumina.State.settings.chapterNumbering](
                level, 
                Lumina.State.sectionCounters, 
                textForDisplay
            );
        }
    });

    // 重建章节索引（因为标题文字变了，但结构不变）
    Lumina.State.app.chapters = Lumina.Parser.buildChapters(Lumina.State.app.document.items);
    
    // 防止当前章节索引越界
    if (Lumina.State.app.currentChapterIndex >= Lumina.State.app.chapters.length) {
        Lumina.State.app.currentChapterIndex = 0;
    }

    Lumina.Renderer.generateTOC();
    Lumina.Renderer.renderCurrentChapter();

    // 自动保存进度
    if (Lumina.State.app.currentFile.name && Lumina.State.app.dbReady && Lumina.State.app.currentFile.fileKey) {
        Lumina.DB.saveHistory(Lumina.State.app.currentFile.name, Lumina.State.app.currentFile.type, Lumina.State.app.currentFile.wordCount, null, false);
    }
};

Lumina.Parser.reparseDocumentStructure = async () => {
    if (!Lumina.State.app.document.items.length) return;
    
    // 重置计数器
    Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
    
    const ext = Lumina.State.app.currentFile.type;

    // 重新解析：根据新的正则规则重新识别标题级别
    // PDF 和 DOCX 都是二进制格式，需要重新分析已有 items，而不是重新解析原始内容
    if (ext === 'docx' || ext === 'pdf') {
        Lumina.Parser.reanalyzeDocumentItems();
    } else {
        const result = Lumina.Parser.parseTextFile(Lumina.State.app.currentFile.rawContent, ext);
        Lumina.State.app.document = result;
    }

    // 重建章节
    Lumina.State.app.chapters = Lumina.Parser.buildChapters(Lumina.State.app.document.items);
    if (Lumina.State.app.currentChapterIndex >= Lumina.State.app.chapters.length) {
        Lumina.State.app.currentChapterIndex = 0;
    }

    Lumina.Renderer.generateTOC();
    Lumina.Renderer.renderCurrentChapter();

    if (Lumina.State.app.currentFile.name && Lumina.State.app.dbReady && Lumina.State.app.currentFile.fileKey) {
        await Lumina.DB.saveHistory(Lumina.State.app.currentFile.name, Lumina.State.app.currentFile.type, Lumina.State.app.currentFile.wordCount, null);
    }
};

Lumina.Parser.reanalyzeDocumentItems = () => {
    const newItems = [];
    Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];

    Lumina.State.app.document.items.forEach((item, index) => {
        try {
            if (!item) return; // 跳过空项
            if (item.type === 'image') { newItems.push(item); return; }

            const text = item.text || '';
            const trimmed = text.trim();
            const chapterInfo = Lumina.Parser.RegexCache.detectChapter(trimmed, true);

            if (chapterInfo) {
                const newItem = Lumina.Parser.processHeading(chapterInfo.level, chapterInfo.raw, chapterInfo.text);
                newItems.push(newItem);
            } else if (item.type && item.type.startsWith('heading')) {
                const level = parseInt(item.type.replace('heading', '')) || 1;
                const newItem = Lumina.Parser.processHeading(level, item.text || '');
                newItems.push(newItem);
            } else {
                // 确保段落有 display 字段
                if (!item.display && item.text) {
                    item.display = item.text;
                }
                newItems.push(item);
            }
        } catch (err) {
            console.warn(`处理 item ${index} 时出错:`, err, item);
            // 如果处理失败，保留原始 item
            newItems.push(item);
        }
    });

    Lumina.State.app.document.items = newItems;
};

Lumina.Parser.reparseWithRegex = async () => {
    if (!Lumina.State.app.currentFile.name || !Lumina.State.app.document.items.length) {
        Lumina.UI.showDialog(Lumina.I18n.t('errorNoFile'));
        return;
    }

    try {
        Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
        await Lumina.Parser.reparseDocumentStructure();
    } catch (err) {
        Lumina.UI.showDialog(`Error: ${err.message}`);
    }
};

Lumina.Pagination = {
    calculateRanges(items) {
        // 解构时提供默认值，防止配置缺失导致 NaN
        const { 
            enabled = true, 
            maxReadingWords = 1500, 
            imageEquivalentWords = 300 
        } = Lumina.Config.pagination || {};
        
        // 如果禁用分页，返回单页
        if (!enabled) {
            return [{ start: 0, end: items.length - 1, words: items.length }];
        }
        
        if (!items || items.length === 0) return [{ start: 0, end: 0 }];
        
        // 计算总阅读字数
        const totalWords = items.reduce((sum, item) => {
            if (item.type === 'image') {
                return sum + (imageEquivalentWords || 300); // 双重保护
            }
            const stats = Lumina.Utils.calculateContentStats(item.text || '');
            return sum + (stats.readingWords || 0);
        }, 0);
        
        // 关键调试：如果 totalWords 为 0 或 NaN，说明解析有问题
        if (isNaN(totalWords)) {
            console.warn('分页计算错误：totalWords 为 NaN，检查 imageEquivalentWords 配置');
            return [{ start: 0, end: items.length - 1, words: 0 }];
        }
        
        // 如果总字数不足一页，返回单页（包含所有空段落）
        if (totalWords <= maxReadingWords) {
            return [{ start: 0, end: items.length - 1, words: totalWords }];
        }

        // 分页逻辑...
        const ranges = [];
        let currentWords = 0;
        let pageStart = 0;
        
        items.forEach((item, idx) => {
            let itemWords = 0;
            
            if (item.type === 'image') {
                itemWords = imageEquivalentWords || 300;
            } else {
                const stats = Lumina.Utils.calculateContentStats(item.text || '');
                itemWords = stats.readingWords || 0;
            }
            
            // 防止 NaN 污染
            if (isNaN(itemWords)) itemWords = 0;
            
            // 如果加入此项会超限，且当前页已有内容，则新开一页
            if (currentWords + itemWords > maxReadingWords && currentWords > 0) {
                ranges.push({ 
                    start: pageStart, 
                    end: idx - 1,
                    words: currentWords 
                });
                pageStart = idx;
                currentWords = 0;
            }
            
            currentWords += itemWords;
        });
        
        // 最后一页
        if (pageStart < items.length) {
            ranges.push({ 
                start: pageStart, 
                end: items.length - 1,
                words: currentWords 
            });
        }
        
        return ranges.length ? ranges : [{ start: 0, end: items.length - 1, words: 0 }];
    },
    
    findPageIndex(ranges, relativeIdx) {
        if (!ranges || ranges.length === 0) return 0;
        const idx = ranges.findIndex(r => relativeIdx >= r.start && relativeIdx <= r.end);
        return idx === -1 ? 0 : idx;
    }
};

