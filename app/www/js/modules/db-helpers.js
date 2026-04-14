/**
 * db-helpers.js — Lumina Reader 存储层通用工具
 * 职责：与后端无关的数据处理（合并、标准化、验证、导入导出、键生成等）
 * 约束：零依赖，纯函数优先，可直接被 db.js 中的任何实现类引用
 */
(function (global) {
    'use strict';

    const Lumina = global.Lumina || (global.Lumina = {});
    Lumina.DB = Lumina.DB || {};

    const MAX_FILES = 50;

    function getLocalTimeString() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    function generateFileKey(file) {
        if (!file || !file.name) return null;
        const base = file.name.replace(/\.(docx|epub|txt|md|html|json|pdf|lmn)$/i, '');
        const type = file.name.split('.').pop().toLowerCase();
        return `${base}_${Date.now()}.${type}`;
    }

    function mergeFileData(existing, incoming) {
        if (!existing) return incoming || {};
        return {
            ...existing,
            ...incoming,
            annotations: incoming.annotations !== undefined ? incoming.annotations : existing.annotations,
            heatMap: incoming.heatMap !== undefined ? incoming.heatMap : existing.heatMap,
            metadata: incoming.metadata !== undefined ? incoming.metadata : existing.metadata,
            cover: incoming.cover !== undefined ? incoming.cover : existing.cover,
            content: incoming.content !== undefined ? incoming.content : existing.content,
            customRegex: incoming.customRegex !== undefined ? incoming.customRegex : existing.customRegex,
            chapterNumbering: incoming.chapterNumbering !== undefined ? incoming.chapterNumbering : existing.chapterNumbering,
        };
    }

    function normalizeRecord(fileKey, mergedData, contentSize) {
        return {
            fileKey,
            fileName: mergedData.fileName,
            fileType: mergedData.fileType,
            fileSize: mergedData.fileSize || 0,
            contentSize: contentSize || 0,
            content: mergedData.content,
            wordCount: mergedData.wordCount || 0,
            totalItems: mergedData.totalItems || 0,
            lastChapter: mergedData.lastChapter || 0,
            lastScrollIndex: mergedData.lastScrollIndex || 0,
            chapterTitle: mergedData.chapterTitle || '',
            lastReadTime: mergedData.lastReadTime || getLocalTimeString(),
            created_at: mergedData.created_at || getLocalTimeString(),
            customRegex: mergedData.customRegex || { chapter: '', section: '' },
            chapterNumbering: mergedData.chapterNumbering || 'none',
            annotations: mergedData.annotations || [],
            cover: mergedData.cover || null,
            heatMap: mergedData.heatMap || null,
            metadata: mergedData.metadata || null,
        };
    }

    function validateBookData(book) {
        if (!book || !book.fileName || !Array.isArray(book.content)) {
            throw new Error('Invalid book data');
        }
    }

    function createImportRecord(book) {
        return {
            fileName: book.fileName,
            fileType: book.fileType || 'txt',
            fileSize: book.fileSize || 0,
            content: book.content,
            wordCount: book.wordCount || 0,
            cover: book.cover || null,
            customRegex: book.customRegex || { chapter: '', section: '' },
            chapterNumbering: book.chapterNumbering || 'none',
            annotations: book.annotations || [],
            heatMap: book.heatMap || null,
            metadata: book.metadata || null,
            lastChapter: book.lastChapter || 0,
            lastScrollIndex: book.lastScrollIndex || 0,
            chapterTitle: book.chapterTitle || '',
            lastReadTime: book.lastReadTime || getLocalTimeString(),
            created_at: book.created_at || book.lastReadTime || getLocalTimeString(),
        };
    }

    function createExportRecord(file) {
        return {
            version: 2,
            exportType: 'single',
            exportDate: getLocalTimeString(),
            appName: 'Lumina Reader',
            fileName: file.fileName,
            fileType: file.fileType,
            fileSize: file.fileSize || 0,
            content: file.content,
            wordCount: file.wordCount,
            cover: file.cover || null,
            customRegex: file.customRegex,
            chapterNumbering: file.chapterNumbering || 'none',
            annotations: file.annotations || [],
            heatMap: file.heatMap || null,
            metadata: file.metadata || null,
            lastChapter: file.lastChapter || 0,
            lastScrollIndex: file.lastScrollIndex || 0,
            chapterTitle: file.chapterTitle || '',
            lastReadTime: file.lastReadTime,
            created_at: file.created_at || file.lastReadTime,
        };
    }

    async function runImportBatch(adapter, books, onProgress) {
        const results = { success: 0, failed: 0, errors: [] };
        for (let i = 0; i < books.length; i++) {
            const book = books[i];
            try {
                validateBookData(book);
                const newKey = `${book.fileName}_${Date.now()}_${i}`;
                await adapter.saveFile(newKey, createImportRecord(book));
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push({ book: book.fileName, error: err.message });
            }
            if (onProgress) onProgress(i + 1, books.length, results.success);
        }
        return results;
    }

    async function runExportBatch(adapter) {
        const files = await adapter.getAllFiles();
        if (!files || files.length === 0) return null;
        const books = [];
        for (const file of files) {
            const fullData = await adapter.getFile(file.fileKey);
            if (fullData) books.push(fullData);
        }
        return {
            version: 2,
            exportType: 'batch',
            exportDate: getLocalTimeString(),
            appName: 'Lumina Reader',
            books,
            totalBooks: books.length,
            totalSize: 0,
        };
    }

    async function updateCover(adapter, fileKey, coverDataUrl) {
        const file = await adapter.getFile(fileKey);
        if (!file) return false;
        file.cover = coverDataUrl;
        return adapter.saveFile(fileKey, file);
    }

    async function exportFile(adapter, fileKey) {
        const file = await adapter.getFile(fileKey);
        return file ? createExportRecord(file) : null;
    }

    Lumina.DB.Helpers = {
        MAX_FILES,
        getLocalTimeString,
        generateFileKey,
        mergeFileData,
        normalizeRecord,
        validateBookData,
        createImportRecord,
        createExportRecord,
        runImportBatch,
        runExportBatch,
        updateCover,
        exportFile,
    };

    // 兼容性别名：旧代码通过 Lumina.DB.getLocalTimeString / generateFileKey 直接调用
    Lumina.DB.getLocalTimeString = getLocalTimeString;
    Lumina.DB.generateFileKey = generateFileKey;
})(window);
