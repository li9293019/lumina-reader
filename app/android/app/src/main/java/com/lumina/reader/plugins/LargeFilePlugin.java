package com.lumina.reader.plugins;

import android.net.Uri;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;

/**
 * 大文件处理插件 - 解决 Capacitor Bridge OOM 问题
 * 
 * 核心功能：
 * 1. 分块读取本地大文件（用于配置导入）
 * 2. 流式处理，避免一次性加载整个文件到内存
 * 3. 支持读取指定范围的块
 */
@CapacitorPlugin(name = "LargeFile")
public class LargeFilePlugin extends Plugin {
    private static final String TAG = "LargeFilePlugin";
    
    // 块大小 64KB - 平衡内存使用和传输效率
    public static final int CHUNK_SIZE = 64 * 1024;
    
    /**
     * 获取文件信息（大小、总块数）
     * 先调用这个，然后根据总块数分批读取
     */
    @PluginMethod
    public void getFileInfo(PluginCall call) {
        String path = call.getString("path");
        String directory = call.getString("directory", "DOCUMENTS");
        
        if (path == null || path.isEmpty()) {
            call.reject("路径不能为空");
            return;
        }
        
        try {
            java.io.File file = resolveFile(path, directory);
            if (!file.exists()) {
                call.reject("文件不存在: " + path);
                return;
            }
            
            long fileSize = file.length();
            int totalChunks = (int) Math.ceil((double) fileSize / CHUNK_SIZE);
            
            JSObject result = new JSObject();
            result.put("path", path);
            result.put("fileSize", fileSize);
            result.put("totalChunks", totalChunks);
            result.put("chunkSize", CHUNK_SIZE);
            result.put("exists", true);
            
            Log.d(TAG, "文件信息: " + path + ", 大小=" + fileSize + ", 块数=" + totalChunks);
            call.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "获取文件信息失败: " + e.getMessage(), e);
            call.reject("获取文件信息失败: " + e.getMessage());
        }
    }
    
    /**
     * 读取指定范围的块
     * 一次可以读取多个块（批量读取提高效率）
     */
    @PluginMethod
    public void readChunks(PluginCall call) {
        String path = call.getString("path");
        String directory = call.getString("directory", "DOCUMENTS");
        int startChunk = call.getInt("startChunk", 0);
        int chunkCount = call.getInt("chunkCount", 1);
        
        if (path == null || path.isEmpty()) {
            call.reject("路径不能为空");
            return;
        }
        
        if (chunkCount < 1 || chunkCount > 20) {
            call.reject("每次最多读取20个块");
            return;
        }
        
        try {
            java.io.File file = resolveFile(path, directory);
            if (!file.exists()) {
                call.reject("文件不存在: " + path);
                return;
            }
            
            long fileSize = file.length();
            int totalChunks = (int) Math.ceil((double) fileSize / CHUNK_SIZE);
            
            if (startChunk < 0 || startChunk >= totalChunks) {
                call.reject("起始块索引超出范围");
                return;
            }
            
            // 调整读取块数
            int actualChunkCount = Math.min(chunkCount, totalChunks - startChunk);
            
            InputStream is = new FileInputStream(file);
            
            // 定位到起始位置
            long startPos = (long) startChunk * CHUNK_SIZE;
            if (startPos > 0) {
                is.skip(startPos);
            }
            
            JSArray chunks = new JSArray();
            byte[] buffer = new byte[CHUNK_SIZE];
            
            for (int i = 0; i < actualChunkCount; i++) {
                int currentChunkIndex = startChunk + i;
                int bytesRead = is.read(buffer);
                
                if (bytesRead == -1) {
                    break; // 文件结束
                }
                
                // 复制实际读取的数据（最后一块可能不满）
                byte[] actualData = new byte[bytesRead];
                System.arraycopy(buffer, 0, actualData, 0, bytesRead);
                
                String base64Data = Base64.encodeToString(actualData, Base64.NO_WRAP);
                
                JSObject chunkObj = new JSObject();
                chunkObj.put("index", currentChunkIndex);
                chunkObj.put("data", base64Data);
                chunkObj.put("size", bytesRead);
                chunkObj.put("isLast", currentChunkIndex == totalChunks - 1);
                chunks.put(chunkObj);
            }
            
            is.close();
            
            JSObject result = new JSObject();
            result.put("path", path);
            result.put("startChunk", startChunk);
            result.put("chunksRead", chunks.length());
            result.put("totalChunks", totalChunks);
            result.put("chunks", chunks);
            result.put("hasMore", startChunk + actualChunkCount < totalChunks);
            
            call.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "读取块失败: " + e.getMessage(), e);
            call.reject("读取块失败: " + e.getMessage());
        }
    }
    
    /**
     * 删除文件
     */
    @PluginMethod
    public void deleteFile(PluginCall call) {
        String path = call.getString("path");
        String directory = call.getString("directory", "DOCUMENTS");
        
        if (path == null || path.isEmpty()) {
            call.reject("路径不能为空");
            return;
        }
        
        try {
            java.io.File file = resolveFile(path, directory);
            boolean deleted = file.delete();
            
            JSObject result = new JSObject();
            result.put("path", path);
            result.put("deleted", deleted);
            call.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "删除文件失败: " + e.getMessage(), e);
            call.reject("删除文件失败: " + e.getMessage());
        }
    }
    
    /**
     * 解析文件路径
     */
    private java.io.File resolveFile(String path, String directory) {
        java.io.File baseDir;
        
        switch (directory) {
            case "DATA":
                baseDir = getContext().getFilesDir();
                break;
            case "CACHE":
                baseDir = getContext().getCacheDir();
                break;
            case "DOCUMENTS":
            default:
                baseDir = getContext().getExternalFilesDir(null);
                if (baseDir == null) {
                    baseDir = getContext().getFilesDir();
                }
                break;
        }
        
        return new java.io.File(baseDir, path);
    }
}
