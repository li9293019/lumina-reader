// ==================== 导出工具模块 ====================
// 统一处理 APP 和 Web 端的导出逻辑，包括进度条和分块写入

Lumina.ExportUtils = {
    // 检测是否在 APP 环境
    isApp() {
        return typeof Capacitor !== 'undefined' && 
               Capacitor.isNativePlatform && 
               Capacitor.isNativePlatform();
    },

    // 显示进度对话框
    showProgressDialog(title, options = {}) {
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay active';
        dialog.id = 'exportProgressDialog';
        dialog.innerHTML = `
            <div class="dialog-content" style="text-align: center; min-width: 320px;">
                <div class="dialog-header">
                    <div class="dialog-title">${Lumina.Utils.escapeHtml(title)}</div>
                </div>
                <div class="dialog-body" style="padding: 24px;">
                    <div class="progress-step" style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;"></div>
                    <div class="progress-bar" style="width: 100%; height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden; margin-bottom: 12px;">
                        <div class="progress-fill" style="width: 0%; height: 100%; background: var(--accent-color); transition: width 0.2s;"></div>
                    </div>
                    <div class="progress-text" style="font-size: 14px; color: var(--text-secondary);">0%</div>
                    <div class="progress-detail" style="font-size: 12px; color: var(--text-muted); margin-top: 8px; min-height: 18px;"></div>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        const progressFill = dialog.querySelector('.progress-fill');
        const progressText = dialog.querySelector('.progress-text');
        const progressStep = dialog.querySelector('.progress-step');
        const progressDetail = dialog.querySelector('.progress-detail');
        
        return {
            dialog,
            update: (percent, detail = '') => {
                const p = Math.min(100, Math.max(0, percent));
                progressFill.style.width = p + '%';
                progressText.textContent = Math.round(p) + '%';
                if (detail && progressDetail) {
                    progressDetail.textContent = detail;
                }
            },
            updateStep: (current, total, stepName = '') => {
                if (progressStep) {
                    progressStep.textContent = `步骤 ${current}/${total}${stepName ? ': ' + stepName : ''}`;
                }
            },
            updateDetail: (detail) => {
                if (progressDetail) {
                    progressDetail.textContent = detail;
                }
            },
            close: () => {
                if (dialog.parentNode) {
                    dialog.parentNode.removeChild(dialog);
                }
            }
        };
    },

    // 估算数据大小（字节）
    estimateDataSize(data) {
        try {
            const json = JSON.stringify(data);
            return new Blob([json]).size;
        } catch (e) {
            return 0;
        }
    },

    // 格式化文件大小显示
    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    },

    // APP 端：分块写入 JSON 文件
    async writeJsonInChunks(filePath, data, onProgress = null) {
        const { Filesystem } = Capacitor.Plugins;
        const books = data.books || [];
        const totalBooks = books.length;
        
        // 构建文件头（不包含 books 数组）
        const headerObj = { ...data };
        delete headerObj.books;
        
        let header = JSON.stringify(headerObj, null, 2);
        header = header.slice(0, -1); // 移除最后的 }
        header += ',\n  "books": [\n';
        
        await Filesystem.writeFile({
            path: filePath,
            data: header,
            directory: 'DOCUMENTS',
            encoding: 'utf8'
        });
        
        // 分块写入每本书
        for (let i = 0; i < totalBooks; i++) {
            const book = books[i];
            let bookJson = JSON.stringify(book, null, 4);
            
            // 添加缩进
            bookJson = bookJson.split('\n').map(line => '    ' + line).join('\n');
            
            // 添加逗号（除了最后一本）
            if (i < totalBooks - 1) {
                bookJson += ',';
            }
            bookJson += '\n';
            
            await Filesystem.appendFile({
                path: filePath,
                data: bookJson,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
            
            if (onProgress) {
                onProgress((i + 1) / totalBooks);
            }
        }
        
        // 写入文件尾
        await Filesystem.appendFile({
            path: filePath,
            data: '  ]\n}',
            directory: 'DOCUMENTS',
            encoding: 'utf8'
        });
    },

    // APP 端：分块写入配置 JSON（支持任意对象）
    async writeConfigInChunks(filePath, config, onProgress = null) {
        const { Filesystem } = Capacitor.Plugins;
        
        // 如果数据不大，直接写入
        const estimatedSize = this.estimateDataSize(config);
        if (estimatedSize < 512 * 1024) { // < 512KB 直接写入
            await Filesystem.writeFile({
                path: filePath,
                data: JSON.stringify(config, null, 2),
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
            if (onProgress) onProgress(1);
            return;
        }
        
        // 大配置分块写入（主要是包含字体数据时）
        const keys = Object.keys(config);
        const totalKeys = keys.length;
        
        // 写入开头
        await Filesystem.writeFile({
            path: filePath,
            data: '{\n',
            directory: 'DOCUMENTS',
            encoding: 'utf8'
        });
        
        for (let i = 0; i < totalKeys; i++) {
            const key = keys[i];
            const value = config[key];
            let chunk = `  "${key}": ${JSON.stringify(value, null, 2).split('\n').join('\n  ')}`;
            
            if (i < totalKeys - 1) {
                chunk += ',';
            }
            chunk += '\n';
            
            await Filesystem.appendFile({
                path: filePath,
                data: chunk,
                directory: 'DOCUMENTS',
                encoding: 'utf8'
            });
            
            if (onProgress) {
                onProgress((i + 1) / totalKeys);
            }
        }
        
        // 写入结尾
        await Filesystem.appendFile({
            path: filePath,
            data: '}',
            directory: 'DOCUMENTS',
            encoding: 'utf8'
        });
    },

    // APP 端：分块写入加密文件
    async writeEncryptedInChunks(filePath, encryptedBuffer, onProgress = null) {
        const { Filesystem } = Capacitor.Plugins;
        const bytes = new Uint8Array(encryptedBuffer);
        const totalSize = bytes.length;
        
        // 调整块大小为 3 的倍数（base64 每 3 字节编码为 4 字符）
        const chunkSize = 510 * 1024; // 510KB
        const adjustedChunkSize = Math.floor(chunkSize / 3) * 3;
        
        const totalChunks = Math.ceil(totalSize / adjustedChunkSize);
        
        for (let offset = 0; offset < totalSize; offset += adjustedChunkSize) {
            const end = Math.min(offset + adjustedChunkSize, totalSize);
            const chunk = bytes.slice(offset, end);
            const base64Chunk = this.arrayBufferToBase64(chunk.buffer);
            
            if (offset === 0) {
                await Filesystem.writeFile({
                    path: filePath,
                    data: base64Chunk,
                    directory: 'DOCUMENTS',
                    encoding: 'utf8'
                });
            } else {
                await Filesystem.appendFile({
                    path: filePath,
                    data: base64Chunk,
                    directory: 'DOCUMENTS',
                    encoding: 'utf8'
                });
            }
            
            if (onProgress) {
                const progress = Math.min(1, end / totalSize);
                onProgress(progress);
            }
        }
    },

    // Web 端：下载 JSON 文件
    downloadJson(data, fileName) {
        const jsonContent = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // Web 端：下载加密文件
    downloadEncrypted(encryptedBuffer, fileName) {
        // 转为 base64 文本下载
        const base64Data = this.arrayBufferToBase64(encryptedBuffer);
        const blob = new Blob([base64Data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // ArrayBuffer 转 Base64
    arrayBufferToBase64(buffer) {
        if (typeof buffer === 'string') return buffer;
        const bytes = new Uint8Array(buffer);
        const chunkSize = 65536;
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    },

    // 创建导出目录（APP 端）
    async ensureExportDir() {
        if (!this.isApp()) return true;
        
        const { Filesystem } = Capacitor.Plugins;
        try {
            await Filesystem.mkdir({
                path: 'LuminaReader',
                directory: 'DOCUMENTS',
                recursive: true
            });
            return true;
        } catch (e) {
            // 目录已存在或创建失败
            return true;
        }
    },

    // 通用导出方法 - 书籍数据
    async exportBooks(batchData, options = {}) {
        const {
            fileName = `Lumina_Library_${Date.now()}.json`,
            encrypted = false,
            password = null,
            onProgress = null
        } = options;

        const isApp = this.isApp();
        
        // 确保导出目录存在（APP 端）
        if (isApp) {
            await this.ensureExportDir();
        }

        if (encrypted && password !== null) {
            // 加密导出
            const progressDialog = onProgress ? null : this.showProgressDialog(
                Lumina.I18n?.t?.('encrypting') || '正在加密...'
            );
            
            try {
                const encryptedBuffer = await Lumina.Crypto.encrypt(
                    batchData, 
                    password || null, 
                    (progress) => {
                        if (onProgress) {
                            onProgress(progress);
                        } else if (progressDialog) {
                            progressDialog.update(progress * 100);
                        }
                    }
                );
                
                if (progressDialog) progressDialog.close();
                
                // 确保加密文件有 .lmn 扩展名
                let encFileName = fileName;
                if (fileName.endsWith('.json')) {
                    encFileName = fileName.replace('.json', '.lmn');
                } else if (!fileName.endsWith('.lmn')) {
                    encFileName = fileName + '.lmn';
                }
                
                if (isApp) {
                    await this.writeEncryptedInChunks(
                        `LuminaReader/${encFileName}`, 
                        encryptedBuffer,
                        onProgress
                    );
                } else {
                    this.downloadEncrypted(encryptedBuffer, encFileName);
                }
                
                return { success: true, fileName: encFileName };
            } catch (err) {
                if (progressDialog) progressDialog.close();
                throw err;
            }
        } else {
            // 明文导出
            // 确保文件名有 .json 扩展名
            const jsonFileName = fileName.endsWith('.json') ? fileName : fileName + '.json';
            
            if (isApp) {
                await this.writeJsonInChunks(
                    `LuminaReader/${jsonFileName}`, 
                    batchData, 
                    onProgress
                );
            } else {
                this.downloadJson(batchData, jsonFileName);
            }
            return { success: true, fileName: jsonFileName };
        }
    },

    // 通用导出方法 - 配置数据
    async exportConfig(config, options = {}) {
        const {
            fileName = `Lumina_Config_${Date.now()}.json`,
            encrypted = false,
            password = null,
            includeFonts = false,
            onProgress = null
        } = options;

        const isApp = this.isApp();
        
        // 确保导出目录存在（APP 端）
        if (isApp) {
            await this.ensureExportDir();
        }

        let exportConfig = { ...config };
        
        // 计算总步骤数
        const hasFonts = includeFonts && config.customFonts?.length > 0 && isApp;
        const totalSteps = hasFonts ? 2 : 1;
        let currentStep = 1;

        // 步骤1：处理字体打包（仅 APP 端）
        if (hasFonts) {
            if (onProgress) {
                onProgress(0, { step: currentStep, total: totalSteps, stepName: '打包字体' });
            }
            
            const fontsData = await this.packCustomFonts(
                config.customFonts, 
                onProgress ? (p) => {
                    onProgress(p * 100, { step: currentStep, total: totalSteps, stepName: '打包字体' });
                } : null
            );
            
            if (fontsData.length > 0) {
                exportConfig.customFontsData = fontsData;
            }
            currentStep++;
        }

        // 最后一步：加密/写入文件
        if (encrypted && password !== null) {
            // 加密导出
            const encFileName = fileName.replace('.json', '.lmn');
            
            try {
                if (onProgress) {
                    onProgress(0, { step: currentStep, total: totalSteps, stepName: '加密并写入文件' });
                }
                
                const encryptedBuffer = await Lumina.Crypto.encrypt(
                    exportConfig, 
                    password || null, 
                    (progress) => {
                        if (onProgress) {
                            onProgress(progress, { step: currentStep, total: totalSteps, stepName: '加密并写入文件' });
                        }
                    }
                );
                
                if (isApp) {
                    await this.writeEncryptedInChunks(
                        `LuminaReader/${encFileName}`, 
                        encryptedBuffer,
                        onProgress ? (p) => {
                            onProgress(p * 100, { step: currentStep, total: totalSteps, stepName: '加密并写入文件' });
                        } : null
                    );
                } else {
                    this.downloadEncrypted(encryptedBuffer, encFileName);
                }
                
                if (onProgress) {
                    onProgress(100, { step: currentStep, total: totalSteps, stepName: '完成' });
                }
                
                return { success: true, fileName: encFileName };
            } catch (err) {
                throw err;
            }
        } else {
            // 明文导出
            if (onProgress) {
                onProgress(0, { step: currentStep, total: totalSteps, stepName: '写入文件' });
            }
            
            if (isApp) {
                await this.writeConfigInChunks(
                    `LuminaReader/${fileName}`, 
                    exportConfig, 
                    onProgress ? (p) => {
                        onProgress(p * 100, { step: currentStep, total: totalSteps, stepName: '写入文件' });
                    } : null
                );
            } else {
                this.downloadJson(exportConfig, fileName);
            }
            
            if (onProgress) {
                onProgress(100, { step: currentStep, total: totalSteps, stepName: '完成' });
            }
            
            return { success: true, fileName };
        }
    },

    // 打包自定义字体文件为 base64
    async packCustomFonts(customFonts, onProgress = null) {
        const fontsData = [];
        
        if (!this.isApp()) {
            // Web 端从 IndexedDB 读取字体数据
            // 这需要 FontManager 支持获取字体原始数据
            console.log('[ExportUtils] Web 端字体打包暂未实现，跳过');
            // 延迟一帧确保进度更新被渲染
            await new Promise(resolve => requestAnimationFrame(resolve));
            if (onProgress) onProgress(1); // 通知完成
            return fontsData;
        }
        
        const { Filesystem } = Capacitor.Plugins;
        const totalFonts = customFonts.length;
        
        for (let i = 0; i < totalFonts; i++) {
            const font = customFonts[i];
            try {
                // 优先从私有目录读取
                let result = null;
                try {
                    result = await Filesystem.readFile({
                        path: `fonts/user/${font.storedName}`,
                        directory: 'DATA'
                    });
                } catch {
                    // 私有目录没有，尝试 Documents
                    try {
                        result = await Filesystem.readFile({
                            path: `fonts/user/${font.storedName}`,
                            directory: 'DOCUMENTS'
                        });
                    } catch {}
                }
                
                if (result?.data) {
                    const fontData = {
                        id: font.id,
                        name: font.name,
                        fileName: font.fileName,
                        storedName: font.storedName,
                        data: typeof result.data === 'string' ? 
                            result.data : 
                            await this.arrayBufferToBase64(result.data)
                    };
                    fontsData.push(fontData);
                }
            } catch (e) {
                console.warn('[ExportUtils] 打包字体失败:', font.name, e);
            }
            
            if (onProgress) {
                onProgress((i + 1) / totalFonts);
            }
        }
        
        return fontsData;
    }
};
