// ==================== 19. 操作分发器 ====================

Lumina.Actions = {
    // 支持的文件类型
    supportedFormats: ['docx', 'epub', 'txt', 'md', 'html', 'json', 'pdf', 'lmn'],
    
    async processFile(file) {
        if (Lumina.State.app.ui.isProcessing) return;
        if (Lumina.TTS.manager && Lumina.TTS.manager.isPlaying) Lumina.TTS.manager.stop();

        // 检查文件类型是否支持
        const fileExt = file.name.split('.').pop().toLowerCase();
        if (!this.supportedFormats.includes(fileExt)) {
            Lumina.UI.showDialog(Lumina.I18n.t('supportedFileFormatTip', fileExt.toUpperCase(), this.supportedFormats.join(', ').toUpperCase()));
            return;
        }

        // 处理导入文件（JSON 或 LMN 格式）- 支持配置、单本、批量
        if (fileExt === 'json' || fileExt === 'lmn') {
            await this.handleImportFile(file);
            return;
        }

        const fileKey = Lumina.DB.adapter.generateFileKey(file);
        Lumina.State.app.currentFile.fileKey = fileKey;
        Lumina.State.app.currentFile.handle = file;
        Lumina.State.app.currentFile.skipSave = false; // 重置保存标记

        // 重置页码为第一页（必须在 restoreFileFromDB 之前）
        Lumina.State.app.currentPageIdx = 0;
        
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
                        const success = await this.processFileContinue(file, fileKey);
        if (!success) return;  // 处理失败（如用户取消），不继续执行
                    }
                });
                return;
            }
        }
        await this.processFileContinue(file, fileKey);
    },

    async processFileContinue(file, fileKey) {
        // 移动端：关闭所有面板（热启动/文件唤醒时也生效）
        const isMobileView = window.innerWidth <= 768;
        if (isMobileView) {
            Lumina.DOM.sidebarRight?.classList.remove('open');
            Lumina.DOM.historyPanel?.classList.remove('open');
            Lumina.DOM.searchPanel?.classList.remove('open');
            Lumina.DOM.aboutPanel?.classList.remove('active');
            document.getElementById('annotationPanel')?.classList.remove('open');
        }
        
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
        
        // 重置 currentFile.heatMap，避免保留上一本书的数据
        Lumina.State.app.currentFile.heatMap = null;
        
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

            if (fileType === 'docx' || fileType === 'epub' || fileType === 'pdf') {
                const arrayBuffer = await file.arrayBuffer();
                if (fileType === 'docx') {
                    // DOCX 解析，支持加密文件
                    result = await this.parseDOCXWithPassword(arrayBuffer, file.name);
                    // DOCX 可能包含标题和作者元数据
                    if (result.docxMetadata?.title) {
                        Lumina.State.app.currentFile.docxMetadata = result.docxMetadata;
                    }
                } else if (fileType === 'epub') {
                    // EPUB 解析（ZIP 格式，轻量级提取 HTML 内容）
                    result = await Lumina.Parser.parseEPUB(arrayBuffer);
                    // EPUB 可能有 metadata 中定义的封面
                    if (result.coverImage) {
                        cover = result.coverImage;
                        // 异步检测亮度存入 metadata（不阻塞）
                        if (Lumina.BibliomorphCover?.detectCoverBrightness) {
                            Lumina.BibliomorphCover.detectCoverBrightness(cover).then(brightness => {
                                Lumina.State.app.currentFile.coverBrightness = brightness;
                            }).catch(() => {});
                        }
                    }
                    // EPUB 可能包含书名和作者元数据
                    if (result.epubMetadata?.title) {
                        Lumina.State.app.currentFile.epubMetadata = result.epubMetadata;
                    }
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
                        Lumina.DOM.loadingScreen.classList.remove('active');
                        Lumina.State.app.ui.isProcessing = false;
                        return false;  // 返回 false 表示处理失败
                    }
                }
                const firstImage = result.items.find(item => item.type === 'image');

                if (firstImage) {
                    cover = firstImage.data;
                    // 异步检测亮度存入 metadata（不阻塞）
                    if (Lumina.BibliomorphCover?.detectCoverBrightness) {
                        Lumina.BibliomorphCover.detectCoverBrightness(cover).then(brightness => {
                            Lumina.State.app.currentFile.coverBrightness = brightness;
                        }).catch(() => {});
                    }
                }
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

            // 提取元数据（书名、作者）
            const rawText = Lumina.State.app.currentFile.rawContent || 
                (result.items?.slice(0, 50).map(i => i.text).join('\n'));
            const metadata = Lumina.Parser.extractMetadata(file, result, rawText);
            
            // 保存提取的元数据
            Lumina.State.app.currentFile.metadata = metadata;
            
            console.log('[Metadata] Extracted:', metadata.title, '|', metadata.author, 
                '| Confidence:', metadata.confidence, '| Source:', metadata.source);

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

            // 显示书名（优先用 metadata.title，支持简繁转换）
            Lumina.DOM.fileInfo.textContent = Lumina.Converter?.getDisplayTitle?.(Lumina.State.app.currentFile) || file.name;
            Lumina.DOM.welcomeScreen.style.display = 'none';

            // 触发文件打开事件
            window.dispatchEvent(new CustomEvent('fileOpened', { 
                detail: { fileKey: Lumina.State.app.currentFile.fileKey }
            }));

            if (Lumina.State.app.currentFile.encoding && !['UTF-8', 'UTF8'].includes(Lumina.State.app.currentFile.encoding)) {
                Lumina.UI.showToast(`${Lumina.State.app.currentFile.encoding} → UTF-8`, 2000);
            }
            
            return true;  // 处理成功
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
            return false;  // 处理失败
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

    // 处理导入文件（JSON 或 LMN 格式，支持单本、批量和配置）
    async handleImportFile(file) {
        if (!Lumina.DataManager) {
            Lumina.UI.showDialog('导入系统未初始化');
            return;
        }
        
        try {
            let data;
            const isLmnFile = file.name.toLowerCase().endsWith('.lmn');
            
            if (isLmnFile) {
                // LMN 文件可能是 base64 文本格式（ConfigManager/APP）或二进制格式（DataManager Web）
                // 先尝试作为文本读取检测是否为 base64
                const text = await file.text();
                const trimmedText = text.trim();
                
                // 检测是否为 base64 编码（只包含 base64 字符且长度是4的倍数）
                const isBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(trimmedText.replace(/\s/g, '')) 
                    && trimmedText.replace(/\s/g, '').length % 4 === 0;
                
                let binary;
                if (isBase64 && trimmedText.length > 0) {
                    // base64 文本格式
                    binary = this._base64ToUint8Array(trimmedText);
                } else {
                    // 二进制格式，重新读取为 ArrayBuffer
                    binary = new Uint8Array(await file.arrayBuffer());
                }
                
                // 检查是否需要密码
                const hasPassword = (binary[5] & 0x01) !== 0;
                
                let password = null;
                if (hasPassword) {
                    password = await this._requestDecryptPassword();
                    if (password === null) return; // 用户取消
                }
                
                // 解密数据
                data = await Lumina.Crypto.decrypt(binary.buffer || binary, password);
            } else {
                // JSON 明文格式
                const text = await file.text();
                data = JSON.parse(text);
            }
            
            // 统一判断数据类型：配置文件 vs 书籍数据
            // 配置文件特征：有 version 字段，有 reading 配置节，没有书籍数据特征
            const hasVersion = data && typeof data.version === 'number';
            const hasReadingSection = data && data.reading && typeof data.reading === 'object';
            const hasBooksData = data && (data.exportType === 'batch' || data.exportType === 'single' || (data.fileName && Array.isArray(data.content)));
            const isConfigData = hasVersion && hasReadingSection && !hasBooksData;
            
            if (isConfigData) {
                // 配置文件导入
                if (!data.version) {
                    throw new Error('无效的配置文件');
                }
                
                const current = Lumina.ConfigManager.load();
                const merged = Lumina.ConfigManager.mergeDeep(
                    Lumina.ConfigManager.getDefaultConfig(), 
                    data
                );
                
                // 保留的元数据
                merged.meta.firstInstall = current.meta.firstInstall;
                merged.meta.importCount = (current.meta.importCount || 0) + 1;
                merged.meta.lastImport = Date.now();
                
                Lumina.ConfigManager.save(merged);
                
                // 刷新相关UI
                Lumina.Settings.load();
                await Lumina.Settings.apply();
                if (Lumina.HeatMap) Lumina.HeatMap.loadFromConfig?.();
                if (Lumina.Settings.reloadPasswordPresetUI) Lumina.Settings.reloadPasswordPresetUI();
                Lumina.I18n.updateUI();
                Lumina.UI.showToast(Lumina.I18n.t('configImportSuccess'));
                
            } else if (data.exportType === 'batch' && Array.isArray(data.books)) {
                // 批量书籍导入
                await Lumina.DataManager.handleBatchImport(data.books);
            } else if (data.exportType === 'single' && Array.isArray(data.books) && data.books.length === 1) {
                // 单本书籍导入（新格式）
                await Lumina.DataManager.importDataToDB(data.books[0]);
            } else if (data.fileName && Array.isArray(data.content)) {
                // 单本书籍导入（旧格式，兼容）
                await Lumina.DataManager.importDataToDB(data);
            } else {
                throw new Error('无效的文件格式');
            }
        } catch (err) {
            Lumina.UI.showDialog(Lumina.I18n.t('importFailed') + ': ' + err.message);
        }
    },

    // base64 解码为 Uint8Array
    _base64ToUint8Array(base64) {
        // 清理 base64 字符串（去除所有空白字符）
        const cleanBase64 = base64.replace(/[\s\r\n]+/g, '');
        
        try {
            const binaryString = atob(cleanBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        } catch (e) {
            throw new Error('文件格式错误：无效的 base64 编码');
        }
    },

    // 请求解密密码（内部方法）
    async _requestDecryptPassword() {
        return new Promise((resolve) => {
            const t = Lumina.I18n?.t || ((k) => k);
            Lumina.UI.showDialog(t('enterPasswordDesc') || '此文件已加密，请输入密码', 'prompt', (result) => {
                if (result === null || result === false) {
                    resolve(null); // 用户取消
                } else {
                    resolve(result);
                }
            }, {
                title: t('enterPassword') || '输入密码',
                inputType: 'password',
                placeholder: t('passwordPlaceholder') || '请输入密码'
            });
        });
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
        
        // 保存热力图数据
        const savedHeatMap = Lumina.State.app.currentFile?.heatMap ? 
            JSON.parse(JSON.stringify(Lumina.State.app.currentFile.heatMap)) : null;
        const savedHeatTags = Lumina.HeatMap?.tags ? [...Lumina.HeatMap.tags] : [];
        
        try {
            Lumina.State.settings.chapterRegex = chapterVal;
            Lumina.State.settings.sectionRegex = sectionVal;
            Lumina.Parser.RegexCache.updateCustomPatterns(chapterVal, sectionVal);
            Lumina.Settings.save();
            
            await Lumina.Parser.reparseWithRegex();
            
            // 恢复热力图数据
            if (savedHeatMap) {
                Lumina.State.app.currentFile.heatMap = savedHeatMap;
            }
            if (savedHeatTags.length > 0 && Lumina.HeatMap) {
                Lumina.HeatMap.tags = savedHeatTags;
                Lumina.HeatMap.renderTags();
                // 强制清除缓存，使用新的章节索引重新分析
                Lumina.HeatMap.cache = null;
                // 延迟一点等待DOM更新，然后重新分析
                setTimeout(() => {
                    Lumina.HeatMap.analyze();
                }, 100);
            }
            
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
                // 使用与 APP 返回按钮相同的优先级逻辑
                const handled = Lumina.BackButtonHandler?.handleBackButton?.();
                if (!handled) {
                    // 如果没有面板可关闭，且当前没有打开文件，则不做任何事
                    // 有文件打开时 handleBackButton 会返回到欢迎界面
                    Lumina.Search.clearHighlight();
                }
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

