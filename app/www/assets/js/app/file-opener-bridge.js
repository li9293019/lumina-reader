// ==================== 文件打开桥接 ====================

window.Lumina = window.Lumina || {};

Lumina.FileOpener = {
    // 处理传入的文件（包含 URL、文件名、MIME 类型）
    async handleIncomingFile(url, fileName, mimeType) {
        console.log('[FileOpener] handleIncomingFile:', url, fileName, mimeType);
        
        try {
            // 等待 Lumina 就绪
            let waitCount = 0;
            while (!Lumina.Actions?.processFile && waitCount < 50) {
                await new Promise(r => setTimeout(r, 100));
                waitCount++;
            }
            
            if (!Lumina.Actions?.processFile) {
                throw new Error('应用未就绪');
            }
            
            Lumina.UI?.showToast?.('正在打开: ' + fileName);
            
            // 使用 fetch API 直接读取文件内容为 ArrayBuffer
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            
            console.log('[FileOpener] 获取 ArrayBuffer:', arrayBuffer.byteLength, '字节');
            
            // 创建 File 对象（使用真实文件名和 MIME 类型）
            const file = new File([arrayBuffer], fileName, { type: mimeType || 'application/octet-stream' });
            
            console.log('[FileOpener] 创建 File 对象:', file.name, file.size, file.type);
            
            // 处理文件
            await Lumina.Actions.processFile(file);
            
            Lumina.UI?.showToast?.('已打开: ' + fileName);
            
        } catch (err) {
            console.error('[FileOpener] 失败:', err);
            Lumina.UI?.showToast?.('打开失败: ' + err.message);
            Lumina.UI?.showDialog?.('无法打开文件: ' + err.message, 'alert');
        }
    }
};

Lumina.FileOpener.tryInit = function() {
    console.log('[FileOpener] tryInit');
};

console.log('[FileOpener] 模块已加载');
