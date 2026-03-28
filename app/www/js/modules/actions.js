// ==================== 19. 操作分发器 ====================

Lumina.Actions = {
    // 支持的文件类型
    supportedFormats: ['docx', 'txt', 'md', 'html', 'json', 'pdf', 'lmn'],
    
    async processFile(file) {
        if (Lumina.State.app.ui.isProcessing) return;
        if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) Lumina.TTS.manager.stop();

        // 检查文件类型是否支持
        const fileExt = file.name.split('.').pop().toLowerCase();
        if (!this.supportedFormats.includes(fileExt)) {
            Lumina.UI.showDialog(`不支持的文件格式: .${fileExt}\n\n支持的格式: DOCX, TXT, MD, HTML, PDF, JSON, LMN`);
            return;
        }

        // 处理导入文件（JSON 或 LMN 格式）
        if (fileExt === 'json' || fileExt === 'lmn') { 
            await this.handleImportFile(file); 
            return; 
        }

        const fileKey = Lumina.DB.adapter.generateFileKey(file);
        Lumina.State.app.currentFile.fileKey = fileKey;
        Lumina.State.app.currentFile.handle = file;
        Lumina.State.app.currentFile.skipSave = false; // 重置保存标记

        if (Lumina.State.app.dbReady) {
            const exactMatch = await Lumina.DB.adapter.getFile(fileKey);
            if (exactMatch) {
                Lumina.UI.showToast(Lumina.I18n.t('dbUsingCache'));
                await Lumina.DB.restoreFileFromDB(exactMatch);
                return;
            }
            const existingByName = await Lumina.DB.adapter.findByFileName(file.name);
            if (existingByName) {
                Lumina.UI.showDialog(Lumina.I18n.t('confirmOverwrite', file.name), 'confirm', async (confirmed) => {
                    if (confirmed) {
                        await Lumina.DB.adapter.deleteFile(existingByName.fileKey);
                        await Lumina.DB.loadHistoryFromDB();
                        await this.processFileContinue(file, fileKey);
                    }
                });
                return;
            }
        }
        await this.processFileContinue(file, fileKey);
    },

    async processFileContinue(file, fileKey) {
        // 重置章节正则表达式设置
        Lumina.State.settings.chapterNumbering = 'none';
        Lumina.State.settings.chapterRegex = '';
        Lumina.State.settings.sectionRegex = '';
        Lumina.Parser.RegexCache.updateCustomPatterns('', '');
        Lumina.UI.updateActiveButtons();
        
        // 重置正则表达式反馈UI
        const chapterRegexFeedback = document.getElementById('chapterRegexFeedback');
        const sectionRegexFeedback = document.getElementById('sectionRegexFeedback');
        if (chapterRegexFeedback) {
            chapterRegexFeedback.textContent = '';
            chapterRegexFeedback.classList.remove('error', 'valid', 'info');
        }
        if (sectionRegexFeedback) {
            sectionRegexFeedback.textContent = '';
            sectionRegexFeedback.classList.remove('error', 'valid', 'info');
        }
        
        // 重置热力图关键词UI
        const heatTagList = document.getElementById('heatTagList');
        if (heatTagList) {
            heatTagList.innerHTML = '';
        }
        
        // 重置热力图输入框
        const heatTagInput = document.getElementById('heatTagInput');
        if (heatTagInput) {
            heatTagInput.value = '';
        }
        
        // 重置热力图状态
        if (Lumina.HeatMap) {
            Lumina.HeatMap.tags = [];
            Lumina.HeatMap.cache = null;
            Lumina.HeatMap.currentResult = null;
            Lumina.HeatMap.updateAnalyzeButton();
        }
        
        // 重置页码为第一页
        Lumina.State.app.currentPageIdx = 0;

        Lumina.State.app.ui.isProcessing = true;
        Lumina.DOM.loadingScreen.classList.add('active');
        
        // 关键：给浏览器时间渲染 loading 界面
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 50));

        try {
            let result, wordCount = 0;
            const fileType = file.name.split('.').pop().toLowerCase();
            Lumina.State.app.currentFile.type = fileType;
            let cover = null;

            if (fileType === 'docx' || fileType === 'pdf') {
                const arrayBuffer = await file.arrayBuffer();
                if (fileType === 'docx') {
                    // DOCX 解析，支持加密文件
                    result = await this.parseDOCXWithPassword(arrayBuffer, file.name);
                } else {
                    // PDF 解析带进度显示，传入文件名用于密码预设器
                    const t = Lumina.I18n.t;
                    const loadingText = Lumina.DOM.loadingScreen?.querySelector('.loading-text');
                    const fileName = file.name || '';
                    
                    if (!loadingText) {
                        result = await Lumina.Parser.parsePDF(arrayBuffer, null, fileName);
                    } else {
                        // 设置初始文本
                        loadingText.textContent = `${t('pdfParsing') || 'PDF 解析中'}...`;
                        
                        // 给浏览器渲染时间
                        await new Promise(r => setTimeout(r, 50));
                        
                        result = await Lumina.Parser.parsePDF(arrayBuffer, (current, total) => {
                            const percent = Math.round((current / total) * 100);
                            loadingText.textContent = `${t('pdfParsing') || 'PDF 解析中'} ${percent}% (${current}/${total})`;
                        }, fileName);
                    }
                    
                    // 用户取消了密码输入
                    if (!result) {
                        return;
                    }
                }
                const firstImage = result.items.find(item => item.type === 'image');
                if (firstImage) cover = firstImage.data;
            } else {
                const { text, originalEncoding } = await Lumina.Parser.EncodingManager.processFile(file);
                Lumina.State.app.currentFile.rawContent = text;
                Lumina.State.app.currentFile.encoding = originalEncoding;
                const parser = Lumina.Config.fileTypes[fileType]?.parser;
                if (!parser) throw new Error('Unsupported format');
                result = Lumina.Parser[parser](text, fileType, file);
            }

            wordCount = Lumina.Utils.calculateWordCount(result.items);
            Lumina.State.app.document = result;
            Lumina.State.app.currentFile.wordCount = wordCount;
            Lumina.State.app.currentFile.name = file.name;
            Lumina.State.app.currentFile.file = file;

            Lumina.State.sectionCounters = [0, 0, 0, 0, 0, 0];
            Lumina.State.app.chapters = Lumina.Parser.buildChapters(result.items);
            Lumina.State.app.currentChapterIndex = 0;

            // 检查内容大小，大文件提示用户选择保存模式
            const contentSize = Lumina.Utils.estimateContentSize(result.items);
            const SIZE_THRESHOLD = 50 * 1024 * 1024; // 50MB
            
            let saveMode = 'full';
            if (contentSize > SIZE_THRESHOLD && Lumina.State.app.dbReady) {
                // 先隐藏 loading 界面，让对话框能显示
                Lumina.DOM.loadingScreen.classList.remove('active');
                await new Promise(r => setTimeout(r, 100)); // 等待过渡动画
                saveMode = await Lumina.DB.promptForSaveMode(contentSize);
            }
            
            // 重新显示 loading 界面进行保存
            Lumina.DOM.loadingScreen.classList.add('active');
            Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = 
                saveMode === 'text-only' ? (Lumina.I18n.t('savingText') || '正在保存文本...') : (Lumina.I18n.t('saving') || '正在保存...');
            
            const saveResult = await Lumina.DB.saveHistory(file.name, fileType, wordCount, cover, true, saveMode);
            
            // 保存完成，隐藏 loading
            Lumina.DOM.loadingScreen.classList.remove('active');
            Lumina.DOM.loadingScreen.querySelector('.loading-text').textContent = Lumina.I18n.t('loading') || '正在解析文件...';
            
            if (saveResult.mode === 'no-save') {
                Lumina.State.app.currentFile.skipSave = true;
                Lumina.UI.showToast(Lumina.I18n.t('fileNotSaved') || '文件未保存到书库，仍可继续阅读');
            } else if (saveResult.mode === 'text-only') {
                Lumina.State.app.currentFile.skipSave = false;
                Lumina.UI.showToast(Lumina.I18n.t('fileSavedTextOnly') || '已仅保存文本到书库（图片未保存）');
            }
            
            await Lumina.DB.loadHistoryFromDB();
            Lumina.Search.clearResults();

            Lumina.Renderer.generateTOC();
            Lumina.Renderer.renderCurrentChapter();
            
            // 初始化 G点热力图
            Lumina.HeatMap.onBookOpen();
            
            // 重置注释/书签
            Lumina.State.app.annotations = [];
            Lumina.Annotations.renderAnnotations();

            const isMobileView = window.innerWidth <= 768;
            if (!isMobileView) {
                // 桌面端：显示目录
                Lumina.DOM.sidebarLeft.classList.add('visible');
                Lumina.DOM.readingArea.classList.add('with-sidebar');
                Lumina.State.settings.sidebarVisible = true;
            } else {
                // 移动端：默认隐藏目录，专注阅读
                Lumina.DOM.sidebarLeft.classList.remove('visible');
                Lumina.DOM.readingArea.classList.remove('with-sidebar');
                Lumina.State.settings.sidebarVisible = false;
            }
            Lumina.Settings.save();

            Lumina.DOM.fileInfo.textContent = file.name;
            Lumina.DOM.welcomeScreen.style.display = 'none';

            if (Lumina.State.app.currentFile.encoding && !['UTF-8', 'UTF8'].includes(Lumina.State.app.currentFile.encoding)) {
                Lumina.UI.showToast(`${Lumina.State.app.currentFile.encoding} → UTF-8`, 2000);
            }
        } catch (err) {
            // 忽略用户取消操作（PDF/DOCX 密码输入取消等）
            const isCancelled = err.message === 'Password cancelled' || 
                               err.message?.includes('cancelled') ||
                               err.message?.includes('No password') ||
                               err.message?.includes('need password') ||
                               err.name === 'PasswordException';
            if (isCancelled) {
                console.log('[Actions] 用户取消操作');
            } else {
                Lumina.UI.showDialog(`Error: ${err.message}`);
            }
        } finally {
            Lumina.State.app.ui.isProcessing = false;
            Lumina.DOM.loadingScreen.classList.remove('active');
        }
    },

    /**
     * 解析 DOCX 文件，支持密码保护
     * @param {ArrayBuffer} arrayBuffer - 文件内容
     * @param {string} fileName - 文件名（用于错误提示）
     * @returns {Promise<{items: Array, type: string}>}
     */
    async parseDOCXWithPassword(arrayBuffer, fileName) {
        let password = null;
        let isRetry = false;
        
        while (true) {
            try {
                // 尝试解析（带密码或不带密码）
                return await Lumina.Parser.parseDOCX(arrayBuffer, password);
            } catch (err) {
                console.log('[DOCX] Parse error:', err.message);
                
                // 检查是否是解密库问题（Web/APP 端加密 DOCX 支持有限）
                // 这种情况直接显示不支持，不进入密码重试循环
                if (err.message === 'DOCX decryption library not available' || 
                    err.message?.includes('not a function')) {
                    const t = Lumina.I18n.t;
                    Lumina.UI.showDialog(
                        t('docxEncryptedNotSupported') || 
                        '加密的 DOCX 文档暂不支持。建议：\n1. 在 Word 中打开并另存为 PDF\n2. 或使用未加密的 DOCX 文件',
                        'alert'
                    );
                    throw new Error('Password cancelled');
                }
                
                // 检查是否是加密文件或密码错误
                const isEncrypted = err.message === 'DOCX encrypted' || 
                                   err.message === 'Password incorrect' ||
                                   (err.message && err.message.includes('end of central directory'));
                
                if (!isEncrypted) {
                    // 不是加密相关的错误，直接抛出
                    throw err;
                }
                
                // 检查是否第一次尝试（无密码）且是加密文件
                // 如果是，说明是加密文件但库不可用，直接提示不支持
                if (!password && err.message === 'DOCX encrypted') {
                    const t = Lumina.I18n.t;
                    Lumina.UI.showDialog(
                        t('docxEncryptedNotSupported') || 
                        '加密的 DOCX 文档暂不支持。建议：\n1. 在 Word 中打开并另存为 PDF\n2. 或使用未加密的 DOCX 文件',
                        'alert'
                    );
                    throw new Error('Password cancelled');
                }
                
                // 隐藏 loading 界面，显示密码对话框
                const wasLoadingActive = Lumina.DOM.loadingScreen?.classList.contains('active');
                if (wasLoadingActive) {
                    Lumina.DOM.loadingScreen.classList.remove('active');
                }
                
                // 获取密码
                const t = Lumina.I18n.t;
                const title = isRetry ? (t('docxPasswordError') || '密码错误') : (t('docxPasswordRequired') || '需要密码');
                const message = isRetry ? (t('docxPasswordRetry') || '密码不正确，请重试') : (t('docxPasswordPrompt') || '此 DOCX 文档已加密，请输入密码');
                
                const inputPassword = await new Promise((resolve) => {
                    Lumina.UI.showDialog(message, 'prompt', (result) => {
                        resolve(result);
                    }, { 
                        title, 
                        inputType: 'password', 
                        placeholder: t('pdfPasswordPlaceholder') || '请输入密码' 
                    });
                });
                
                // 恢复 loading 界面
                if (wasLoadingActive) {
                    Lumina.DOM.loadingScreen.classList.add('active');
                }
                
                // 用户取消
                if (inputPassword === null || inputPassword === false) {
                    throw new Error('Password cancelled');
                }
                
                password = inputPassword;
                isRetry = true;
                
                // 延迟一下让 UI 更新
                await new Promise(r => setTimeout(r, 100));
            }
        }
    },

    // 处理导入文件（JSON 或 LMN 格式，支持单本和批量）
    async handleImportFile(file) {
        if (!Lumina.DataManager) {
            Lumina.UI.showDialog('导入系统未初始化');
            return;
        }
        
        try {
            if (file.name.endsWith('.lmn')) {
                // LMN 加密格式
                await Lumina.DataManager.importLmnFile(file);
            } else {
                // JSON 明文格式 - 需要检测是否为批量格式
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (data.exportType === 'batch' && Array.isArray(data.books)) {
                    // 批量导入模式
                    await Lumina.DataManager.handleBatchImport(data.books);
                } else if (data.fileName && Array.isArray(data.content)) {
                    // 单本导入模式
                    await Lumina.DataManager.importDataToDB(data);
                } else {
                    throw new Error('无效的文件格式');
                }
            }
        } catch (err) {
            Lumina.UI.showDialog(Lumina.I18n.t('importFailed') + ': ' + err.message);
        }
    },

    prevChapter() {
        const state = Lumina.State.app;
        if (state.currentChapterIndex > 0) {
            if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) {
                Lumina.TTS.manager.pauseForAction(async () => {
                    state.currentChapterIndex--;
                    state.currentPageIdx = 0; 
                    Lumina.Renderer.renderCurrentChapter();
                    Lumina.DB.updateHistoryProgress();
                }, 400);
            } else {
                state.currentChapterIndex--;
                Lumina.Renderer.renderCurrentChapter();
                Lumina.DB.updateHistoryProgress();
            }
        }
    },

    nextChapter() {
        const state = Lumina.State.app;
        if (state.currentChapterIndex < state.chapters.length - 1) {
            if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) {
                Lumina.TTS.manager.pauseForAction(async () => {
                    state.currentChapterIndex++;
                    state.currentPageIdx = 0; 
                    Lumina.Renderer.renderCurrentChapter();
                    Lumina.DB.updateHistoryProgress();
                }, 400);
            } else {
                state.currentChapterIndex++;
                Lumina.Renderer.renderCurrentChapter();
                Lumina.DB.updateHistoryProgress();
            }
        }
    },

    navigateToChapter(chIdx, targetIndex = null) {
        const state = Lumina.State.app;

        if (chIdx < 0 || chIdx >= state.chapters.length) return;
        
        // 立即更新状态（不操作 DOM）
        state.currentChapterIndex = chIdx;
        state.currentPageIdx = 0;
        
        const chapter = state.chapters[chIdx];
        if (!chapter.pageRanges) {
            chapter.pageRanges = Lumina.Pagination.calculateRanges(chapter.items);
        }
        
        if (targetIndex !== null) {
            const relativeIdx = targetIndex - chapter.startIndex;
            state.currentPageIdx = Lumina.Pagination.findPageIndex(chapter.pageRanges, relativeIdx);
        }
        
        // 7.1 目录导航自动隐藏面板：移动端点击目录项后自动隐藏
        if (window.innerWidth <= 768 && Lumina.DOM.sidebarLeft?.classList.contains('visible')) {
            Lumina.DOM.sidebarLeft.classList.remove('visible');
            Lumina.DOM.readingArea?.classList.remove('with-sidebar');
            Lumina.State.settings.sidebarVisible = false;
            Lumina.Settings.save();
        }
        
        // 关键：异步执行渲染，让 click 事件立即完成
        requestAnimationFrame(() => {
            Lumina.Renderer.renderCurrentChapter(targetIndex);
            Lumina.DB.updateHistoryProgress();
        });
    },

    async applyRegexRules() {
        const chapterVal = document.getElementById('chapterRegex').value;
        const sectionVal = document.getElementById('sectionRegex').value;
        if (!Lumina.Utils.validateRegex(chapterVal) || !Lumina.Utils.validateRegex(sectionVal)) {
            Lumina.UI.showDialog(Lumina.I18n.t('errorInvalidRegex'));
            return;
        }
        
        // 保存原始状态，以便在出错时恢复
        const originalItems = [...Lumina.State.app.document.items];
        
        try {
            Lumina.State.settings.chapterRegex = chapterVal;
            Lumina.State.settings.sectionRegex = sectionVal;
            Lumina.Parser.RegexCache.updateCustomPatterns(chapterVal, sectionVal);
            Lumina.Settings.save();
            
            await Lumina.Parser.reparseWithRegex();
            
            if (Lumina.State.app.currentFile.name && Lumina.State.app.dbReady && Lumina.State.app.currentFile.fileKey) {
                await Lumina.DB.saveHistory(Lumina.State.app.currentFile.name, Lumina.State.app.currentFile.type, Lumina.State.app.currentFile.wordCount);
                await Lumina.DB.loadHistoryFromDB();
            }
            Lumina.UI.showDialog(Lumina.I18n.t('ruleApplied'));
        } catch (err) {
            console.error('应用正则规则失败:', err);
            // 恢复原始状态
            Lumina.State.app.document.items = originalItems;
            Lumina.UI.showDialog(Lumina.I18n.t('ruleApplyFailed') || '应用规则失败: ' + err.message);
        }
    },

    handleKeyboard(e) {
        // 在输入框、文本域或可编辑元素中输入时，不触发全局快捷键
        const target = e.target;
        const isInputElement = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
        const isContentEditable = target.isContentEditable || target.contentEditable === 'true';
        
        if (isInputElement || isContentEditable) {
            if (e.key === 'Escape') { 
                target.blur(); 
                Lumina.DOM.customDialog?.classList.remove('active'); 
            }
            return;
        }

        const keyMap = {
            'f': () => document.getElementById('searchToggle').click(),
            'h': () => document.getElementById('historyBtn').click(),
            's': () => document.getElementById('settingsBtn').click(),
            'a': () => Lumina.Annotations.togglePanel(),
            'b': () => { if (Lumina.DataManager) Lumina.DataManager.toggle(); },
            'r': () => Lumina.TTS.manager.toggle(),
            'escape': () => {
                [Lumina.DOM.sidebarRight, Lumina.DOM.historyPanel, Lumina.DOM.searchPanel].forEach(p => p.classList.remove('open'));
                Lumina.DOM.aboutPanel.classList.remove('active');
                Lumina.DOM.customDialog.classList.remove('active');
                if (Lumina.DataManager) Lumina.DataManager.close();
                Lumina.Search.clearHighlight();
            },
            'arrowup': () => { e.preventDefault(); Lumina.Actions.prevChapter(); },
            'arrowdown': () => { e.preventDefault(); Lumina.Actions.nextChapter(); },
            'arrowleft': () => {
                e.preventDefault();
                if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) {
                    Lumina.TTS.manager.pauseForAction(() => {
                        Lumina.DOM.contentScroll.scrollBy({ top: -Lumina.DOM.contentScroll.clientHeight * 0.9, behavior: Lumina.State.settings.smoothScroll ? 'smooth' : 'auto' });
                    });
                } else {
                    Lumina.DOM.contentScroll.scrollBy({ top: -Lumina.DOM.contentScroll.clientHeight * 0.9, behavior: Lumina.State.settings.smoothScroll ? 'smooth' : 'auto' });
                }
            },
            'arrowright': () => {
                e.preventDefault();
                if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) {
                    Lumina.TTS.manager.pauseForAction(() => {
                        Lumina.DOM.contentScroll.scrollBy({ top: Lumina.DOM.contentScroll.clientHeight * 0.9, behavior: Lumina.State.settings.smoothScroll ? 'smooth' : 'auto' });
                    });
                } else {
                    Lumina.DOM.contentScroll.scrollBy({ top: Lumina.DOM.contentScroll.clientHeight * 0.9, behavior: Lumina.State.settings.smoothScroll ? 'smooth' : 'auto' });
                }
            }
        };

        if (keyMap[e.key.toLowerCase()]) keyMap[e.key.toLowerCase()]();
    },

    returnToWelcome() {
        if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) {
            Lumina.TTS.manager.stop();
        }
        
        Lumina.State.app.currentFile = { 
            name: '', 
            type: '', 
            handle: null, 
            rawContent: null, 
            wordCount: 0, 
            openedAt: null, 
            fileKey: null 
        };
        Lumina.State.app.document = { items: [], type: '' };
        Lumina.State.app.chapters = [];
        Lumina.State.app.currentChapterIndex = 0;
        Lumina.State.app.search = { matches: [], currentQuery: '', highlightedIndex: -1 };
        Lumina.State.app.ui.isProcessing = false;
        
        Lumina.DOM.fileInfo.textContent = Lumina.I18n.t('noFile');
        Lumina.DOM.chapterNavInfo.textContent = '';

        if (Lumina.DOM.fileInput) {
            Lumina.DOM.fileInput.value = '';
        }
                    
        Lumina.DOM.contentWrapper.innerHTML = '';
        Lumina.DOM.contentWrapper.appendChild(Lumina.DOM.welcomeScreen);
        Lumina.DOM.welcomeScreen.style.display = 'flex';
        
        Lumina.DOM.tocList.innerHTML = '';
        
        Lumina.DOM.sidebarLeft.classList.remove('visible');
        Lumina.DOM.readingArea.classList.remove('with-sidebar');
        Lumina.State.settings.sidebarVisible = false;
        Lumina.Settings.save();
        
        Lumina.DOM.sidebarRight.classList.remove('open');
        Lumina.DOM.historyPanel.classList.remove('open');
        Lumina.DOM.searchPanel.classList.remove('open');
        Lumina.DOM.aboutPanel.classList.remove('active');
        if (Lumina.DOM.dataManagerPanel) {
            Lumina.DOM.dataManagerPanel.classList.remove('active');
        }
        
        Lumina.Search.clearResults();
        
        Lumina.DOM.contentScroll.scrollTop = 0;
    }
};

Lumina.Actions.nextPage = () => {
    const state = Lumina.State.app;
    const chapter = state.chapters[state.currentChapterIndex];
    const ranges = state.pageRanges;
    
    if (!ranges || ranges.length <= 1) {
        // 无分页，直接下一章
        state.currentChapterIndex++;
        state.currentPageIdx = 0; // ✅ 确保从第1页开始
        Lumina.Renderer.renderCurrentChapter();
        Lumina.DB.updateHistoryProgress();
        return;
    }
    
    if (state.currentPageIdx < ranges.length - 1) {
        // 当前章还有下一页
        state.currentPageIdx++;
        Lumina.Renderer.renderCurrentChapter();
        Lumina.DB.updateHistoryProgress();
    } else {
        // ✅ 当前章最后一页，进入下一章第1页
        if (state.currentChapterIndex < state.chapters.length - 1) {
            state.currentChapterIndex++;
            state.currentPageIdx = 0; // 关键：重置为第1页
            Lumina.Renderer.renderCurrentChapter();
            Lumina.DB.updateHistoryProgress();
        }
    }
};

Lumina.Actions.prevPage = () => {
    const state = Lumina.State.app;
    
    if (state.currentPageIdx > 0) {
        // 当前章还有上一页
        state.currentPageIdx--;
        Lumina.Renderer.renderCurrentChapter();
        Lumina.DB.updateHistoryProgress();
    } else {
        // ✅ 当前章第1页，回退到上一章最后一页
        if (state.currentChapterIndex > 0) {
            state.currentChapterIndex--;
            const prevChapter = state.chapters[state.currentChapterIndex];
            
            // 确保有分页数据
            if (!prevChapter.pageRanges) {
                prevChapter.pageRanges = Lumina.Pagination.calculateRanges(prevChapter.items);
            }
            
            // 跳到上一章最后一页
            state.currentPageIdx = Math.max(0, prevChapter.pageRanges.length - 1);
            Lumina.Renderer.renderCurrentChapter();
            Lumina.DB.updateHistoryProgress();
        }
    }
};

Lumina.Actions.goToPage = (pageIdx) => {
    const state = Lumina.State.app;
    if (pageIdx < 0 || pageIdx >= state.pageRanges.length) return;
    if (pageIdx === state.currentPageIdx) return;
    
    state.currentPageIdx = pageIdx;
    Lumina.Renderer.renderCurrentChapter();
    Lumina.DB.updateHistoryProgress();
};

Lumina.Actions.goToPrevChapterLastPage = () => {
    const state = Lumina.State.app;
    if (state.currentChapterIndex <= 0) return;
    
    const prevIdx = state.currentChapterIndex - 1;
    const prevChapter = state.chapters[prevIdx];
    
    // 确保有分页数据
    if (!prevChapter.pageRanges) {
        prevChapter.pageRanges = Lumina.Pagination.calculateRanges(prevChapter.items);
    }
    
    // 切换到上一章最后一页
    state.currentChapterIndex = prevIdx;
    state.currentPageIdx = prevChapter.pageRanges.length - 1;
    Lumina.Renderer.renderCurrentChapter();
    Lumina.DB.updateHistoryProgress();
};

Lumina.Actions.goToNextChapterFirstPage = () => {
    const state = Lumina.State.app;
    if (state.currentChapterIndex >= state.chapters.length - 1) return;
    
    state.currentChapterIndex++;
    state.currentPageIdx = 0;
    Lumina.Renderer.renderCurrentChapter();
    Lumina.DB.updateHistoryProgress();
};

// 可选：点击 ... 展开更多页码（简化版直接显示全部）
Lumina.Actions.togglePageRange = () => {
    // 简单实现：临时展开显示全部页码，再次点击恢复折叠
    const state = Lumina.State.app;
    state.showAllPages = !state.showAllPages;
    Lumina.Renderer.addPaginationNav(); // 重新渲染
};

