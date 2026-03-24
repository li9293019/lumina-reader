/**
 * 导出文件桥接层 - 支持 Web 和 APP 环境
 */

// 检测是否在 APP 环境
const isNative = (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform) ? Capacitor.isNativePlatform() : false;

// 获取 Capacitor 插件（APP 环境）
function getFilesystemPlugin() {
    if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.Filesystem) {
        return Capacitor.Plugins.Filesystem;
    }
    return null;
}

const FileExporter = {
    /**
     * 下载/保存文件
     */
    async saveFile(content, fileName, mimeType) {
        if (!isNative) {
            // Web 环境：使用 Blob 下载
            const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return true;
        }
        
        // APP 环境：使用原生文件系统
        try {
            const fs = getFilesystemPlugin();
            if (!fs) {
                throw new Error('文件系统插件未找到');
            }
            
            // 保存到 Documents 目录
            await fs.writeFile({
                path: `LuminaReader/${fileName}`,
                data: content,
                directory: 'DOCUMENTS', // Directory.Documents 的字符串值
                encoding: 'utf8',
                recursive: true
            });
            
            console.log('[Export] 文件已保存:', `Documents/LuminaReader/${fileName}`);
            return true;
        } catch (e) {
            console.error('[Export] 保存失败:', e);
            throw e;
        }
    },
    
    /**
     * 保存二进制文件（如 DOCX）
     */
    async saveBinary(base64Data, fileName) {
        if (!isNative) {
            // Web 环境
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray]);
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return true;
        }
        
        // APP 环境
        try {
            const fs = getFilesystemPlugin();
            if (!fs) {
                throw new Error('文件系统插件未找到');
            }
            
            await fs.writeFile({
                path: `LuminaReader/${fileName}`,
                data: base64Data,
                directory: 'DOCUMENTS',
                recursive: true
            });
            
            return true;
        } catch (e) {
            console.error('[Export] 保存失败:', e);
            throw e;
        }
    }
};

// 挂载到全局
window.FileExporter = FileExporter;
console.log('[Exporter] 桥接模块已加载，APP 环境:', isNative);
