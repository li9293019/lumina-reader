package com.lumina.reader;

import android.content.ContentResolver;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * 文件传输助手 - 流式分批传输大文件到 WebView
 * 
 * 核心设计：
 * 1. 使用流式读取，不一次性加载整个文件到内存
 * 2. 每读取一块立即通过回调发送，不累积
 * 3. 支持暂停/继续，由 JS 层控制传输节奏
 * 
 * 内存优化：
 * - 任何时候内存中只保留一块数据（64KB）
 * - 不累积块数据，避免大文件 JSONArray.toString() 内存爆炸
 */
public class FileTransferHelper {
    private static final String TAG = "FileTransfer";
    
    // 每块大小 64KB
    public static final int CHUNK_SIZE = 64 * 1024;
    
    /**
     * 流式传输回调
     */
    public interface StreamCallback {
        /**
         * 传输每一块数据
         * @param chunkIndex 当前块索引
         * @param totalChunks 总块数
         * @param base64Data Base64 数据
         * @return true 继续传输，false 暂停/中断
         */
        boolean onChunk(int chunkIndex, int totalChunks, String base64Data);
        
        void onComplete(long totalBytes);
        void onError(String error);
    }
    
    /**
     * 流式传输文件 - 内存友好的大文件处理
     * 
     * 工作流程：
     * 1. 先计算总块数（通过文件大小）
     * 2. 流式读取文件，每读取一块立即回调
     * 3. 回调返回 false 时暂停传输
     * 4. 内存中只保留当前块
     * 
     * @param resolver ContentResolver
     * @param uri 文件 URI
     * @param callback 流式回调
     */
    public static void streamFile(ContentResolver resolver, Uri uri, StreamCallback callback) {
        InputStream inputStream = null;
        try {
            // 获取文件大小
            long fileSize = getFileSize(resolver, uri);
            if (fileSize < 0) {
                callback.onError("无法获取文件大小");
                return;
            }
            
            int totalChunks = (int) Math.ceil((double) fileSize / CHUNK_SIZE);
            Log.d(TAG, "开始流式传输: " + fileSize + " 字节, " + totalChunks + " 块");
            
            // 打开输入流
            inputStream = resolver.openInputStream(uri);
            if (inputStream == null) {
                callback.onError("无法打开文件输入流");
                return;
            }
            
            byte[] buffer = new byte[CHUNK_SIZE];
            int chunkIndex = 0;
            int bytesRead;
            
            // 流式读取并立即发送
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                // 复制实际读取的数据（最后一块可能不满）
                byte[] chunk = new byte[bytesRead];
                System.arraycopy(buffer, 0, chunk, 0, bytesRead);
                
                // Base64 编码
                String base64Chunk = Base64.encodeToString(chunk, Base64.NO_WRAP);
                
                // 立即发送，不累积
                boolean shouldContinue = callback.onChunk(chunkIndex, totalChunks, base64Chunk);
                
                if (!shouldContinue) {
                    Log.d(TAG, "传输被暂停在第 " + chunkIndex + " 块");
                    return; // 暂停传输
                }
                
                chunkIndex++;
                
                // 每 10 块日志记录一次，避免日志刷屏
                if (chunkIndex % 10 == 0 || chunkIndex == totalChunks) {
                    Log.d(TAG, "已传输 " + chunkIndex + "/" + totalChunks + " 块");
                }
            }
            
            callback.onComplete(fileSize);
            Log.d(TAG, "流式传输完成: " + fileSize + " 字节");
            
        } catch (Exception e) {
            Log.e(TAG, "传输文件失败: " + e.getMessage(), e);
            callback.onError("传输失败: " + e.getMessage());
        } finally {
            try {
                if (inputStream != null) {
                    inputStream.close();
                }
            } catch (Exception e) {
                Log.w(TAG, "关闭输入流失败: " + e.getMessage());
            }
        }
    }
    
    /**
     * 获取文件大小（通过读取，某些 URI 不支持直接查询）
     */
    public static long getFileSize(ContentResolver resolver, Uri uri) {
        try {
            // 尝试查询 OpenableColumns.SIZE
            android.database.Cursor cursor = resolver.query(uri, 
                new String[]{android.provider.OpenableColumns.SIZE}, null, null, null);
            if (cursor != null) {
                try {
                    if (cursor.moveToFirst()) {
                        int sizeIndex = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE);
                        if (sizeIndex >= 0) {
                            long size = cursor.getLong(sizeIndex);
                            if (size > 0) {
                                return size;
                            }
                        }
                    }
                } finally {
                    cursor.close();
                }
            }
            
            // 备用方案：通过读取计算（较慢）
            InputStream is = resolver.openInputStream(uri);
            if (is == null) return -1;
            
            long size = 0;
            byte[] buffer = new byte[8192];
            int read;
            while ((read = is.read(buffer)) != -1) {
                size += read;
            }
            is.close();
            return size;
            
        } catch (Exception e) {
            Log.e(TAG, "获取文件大小失败: " + e.getMessage());
            return -1;
        }
    }
    
    /**
     * 小文件一次性读取（< 1MB 的文件使用）
     */
    public static String readSmallFileAsBase64(ContentResolver resolver, Uri uri) {
        try {
            InputStream inputStream = resolver.openInputStream(uri);
            if (inputStream == null) return null;
            
            ByteArrayOutputStream byteBuffer = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int bytesRead;
            
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                byteBuffer.write(buffer, 0, bytesRead);
            }
            inputStream.close();
            
            byte[] fileBytes = byteBuffer.toByteArray();
            byteBuffer.close();
            
            return Base64.encodeToString(fileBytes, Base64.NO_WRAP);
            
        } catch (Exception e) {
            Log.e(TAG, "读取小文件失败: " + e.getMessage(), e);
            return null;
        }
    }
}
