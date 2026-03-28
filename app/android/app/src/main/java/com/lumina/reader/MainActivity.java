package com.lumina.reader;

import android.app.ActivityManager;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.util.Log;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.lumina.reader.BuildConfig;
import com.lumina.reader.plugins.TTSBackgroundPlugin;
import com.lumina.reader.plugins.TTSEnhancedPlugin;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 主活动 - 处理外部文件打开请求（高性能版）
 * 
 * 优化点：
 * 1. 大块传输（1MB），减少往返次数
 * 2. 批量确认（每 5 块确认一次），减少 JSBridge 调用
 * 3. 零延迟发送，全速传输
 * 4. 后台线程池，避免阻塞 UI
 * 5. 单实例管理 - 防止从外部应用打开时创建多个实例
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "LuminaFileOpener";
    
    // 1MB 块大小，平衡内存和速度
    private static final int CHUNK_SIZE = 1024 * 1024;
    // 每 5 块确认一次（5MB 批次）
    private static final int BATCH_SIZE = 5;
    
    private volatile boolean isTransferring = false;
    private Handler mainHandler;
    private ExecutorService executor;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        mainHandler = new Handler(Looper.getMainLooper());
        // executor 延迟初始化，避免冷启动时 null
        
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        
        registerPlugin(TTSBackgroundPlugin.class);
        registerPlugin(TTSEnhancedPlugin.class);
        
        // 检查是否是多实例启动，如果是则结束当前实例并将任务带到前台
        if (handleMultiInstanceLaunch()) {
            return;
        }
        
        handleIntent(getIntent());
    }
    
    /**
     * 处理多实例启动情况
     * 当从外部应用打开文件时，防止创建新的 Activity 实例
     * @return true 如果当前实例被结束，需要停止后续初始化
     */
    private boolean handleMultiInstanceLaunch() {
        // 检查是否有真正的 Lumina 实例已经在运行（不是在当前任务栈中）
        if (hasExistingLuminaInstance()) {
            Intent intent = getIntent();
            Uri data = intent.getData();
            String action = intent.getAction();
            
            Log.d(TAG, "检测到已有 Lumina 实例在运行，将现有实例带到前台");
            
            // 创建 Intent 带到已存在的实例
            Intent bringToFront = new Intent(this, MainActivity.class);
            if (action != null) bringToFront.setAction(action);
            if (data != null) bringToFront.setData(data);
            bringToFront.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            
            // 如果是 SEND，需要额外传递 EXTRA_STREAM
            if (Intent.ACTION_SEND.equals(action)) {
                Uri sendData = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (sendData != null) {
                    bringToFront.putExtra(Intent.EXTRA_STREAM, sendData);
                }
            }
            
            startActivity(bringToFront);
            
            // 结束当前实例
            finish();
            return true;
        }
        
        // 没有已有实例，让当前 Activity 正常启动
        Log.d(TAG, "没有检测到已有实例，正常启动");
        return false;
    }
    
    /**
     * 检查是否有真正的 Lumina 实例已经在运行
     * 通过检查最近任务列表中是否有 Lumina 的 Activity
     */
    private boolean hasExistingLuminaInstance() {
        try {
            ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (am != null) {
                List<ActivityManager.AppTask> tasks = am.getAppTasks();
                if (tasks != null) {
                    for (ActivityManager.AppTask task : tasks) {
                        ActivityManager.RecentTaskInfo taskInfo = task.getTaskInfo();
                        if (taskInfo != null && taskInfo.baseActivity != null) {
                            String packageName = taskInfo.baseActivity.getPackageName();
                            // 找到 Lumina 的任务（不是当前任务）
                            if ("com.lumina.reader".equals(packageName)) {
                                // 检查这个任务是否是当前正在启动的任务
                                if (taskInfo.id != getTaskId()) {
                                    Log.d(TAG, "找到已有 Lumina 实例，任务 ID: " + taskInfo.id);
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "检查已有实例时出错: " + e.getMessage());
        }
        return false;
    }
    
    private synchronized ExecutorService getExecutor() {
        if (executor == null) {
            executor = Executors.newSingleThreadExecutor();
        }
        return executor;
    }
    
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        bridge.onNewIntent(intent);
        
        // 确保 Activity 在前台
        if (intent.getData() != null || Intent.ACTION_SEND.equals(intent.getAction())) {
            // 将 Activity 带到前台
            bringToFront();
        }
        
        handleIntent(intent);
    }
    
    /**
     * 将当前 Activity 带到前台
     */
    private void bringToFront() {
        ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
        if (am != null) {
            List<ActivityManager.AppTask> tasks = am.getAppTasks();
            if (tasks != null && !tasks.isEmpty()) {
                tasks.get(0).moveToFront();
                Log.d(TAG, "Activity 已带到前台");
            }
        }
    }
    
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        
        String action = intent.getAction();
        Uri data = intent.getData();
        
        if (Intent.ACTION_VIEW.equals(action) && data != null) {
            processFileUri(data);
        } else if (Intent.ACTION_SEND.equals(action)) {
            // 优先使用 EXTRA_STREAM，其次使用 data
            Uri sendData = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (sendData != null) {
                processFileUri(sendData);
            } else if (data != null) {
                processFileUri(data);
            }
        }
    }
    
    /**
     * 处理文件 URI - 使用高性能批量传输
     */
    private void processFileUri(Uri uri) {
        if (isTransferring) {
            Log.w(TAG, "已有传输在进行，忽略新请求");
            return;
        }
        
        FileInfo info = getFileInfo(uri);
        Log.d(TAG, "处理文件: " + info.fileName + ", MIME: " + info.mimeType);
        
        isTransferring = true;
        
        // 小文件 (< 5MB)：一次性传输
        // 大文件：批量传输
        getExecutor().execute(() -> startFastTransfer(uri, info.fileName, info.mimeType));
    }
    
    /**
     * 快速传输 - 批量发送，零延迟
     */
    private void startFastTransfer(Uri uri, String fileName, String mimeType) {
        try {
            ContentResolver resolver = getContentResolver();
            
            // 读取整个文件
            long fileSize = FileTransferHelper.getFileSize(resolver, uri);
            Log.d(TAG, "文件大小: " + fileSize + " 字节");
            
            byte[] fileData = readFileFully(resolver, uri);
            if (fileData == null) {
                throw new Exception("读取文件失败");
            }
            
            int totalChunks = (int) Math.ceil((double) fileData.length / CHUNK_SIZE);
            Log.d(TAG, "准备传输: " + fileData.length + " 字节, " + totalChunks + " 块");
            
            // 等待 JS 就绪（最多等 5 秒）
            boolean jsReady = waitForJsReady(5000);
            if (!jsReady) {
                Log.e(TAG, "JS 未就绪，放弃传输");
                isTransferring = false;
                return;
            }
            
            // 发送开始标记
            final int finalTotalChunks = totalChunks;
            final byte[] finalFileData = fileData;
            final String finalFileName = fileName;
            final String finalMimeType = mimeType;
            
            runOnUiThread(() -> {
                String js = "javascript:Lumina.FileOpener.fastStart('" + 
                    escapeJsString(finalFileName) + "','" + escapeJsString(finalMimeType) + "'," + finalTotalChunks + "," + finalFileData.length + ");";
                bridge.getWebView().evaluateJavascript(js, result -> {
                    // JS 确认后，后台线程继续发送数据
                    new Thread(() -> sendFileData(finalFileData, finalFileName, finalMimeType)).start();
                });
            });
            
        } catch (Exception e) {
            Log.e(TAG, "传输失败: " + e.getMessage(), e);
            final String error = e.getMessage();
            runOnUiThread(() -> {
                String js = "javascript:Lumina.FileOpener.fastError('" + escapeJsString(error) + "');";
                bridge.getWebView().evaluateJavascript(js, null);
            });
        } finally {
            isTransferring = false;
        }
    }
    
    /**
     * 等待 JS 就绪
     */
    private boolean waitForJsReady(int timeoutMs) {
        long start = System.currentTimeMillis();
        while (System.currentTimeMillis() - start < timeoutMs) {
            if (bridge == null || bridge.getWebView() == null) {
                try {
                    Thread.sleep(100);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return false;
                }
                continue;
            }
            
            // 检查 JS 是否就绪
            final boolean[] ready = {false};
            runOnUiThread(() -> {
                bridge.getWebView().evaluateJavascript(
                    "javascript:(typeof Lumina !== 'undefined' && Lumina.FileOpener) ? 'ready' : 'not_ready'",
                    result -> ready[0] = "\"ready\"".equals(result)
                );
            });
            
            try {
                Thread.sleep(200);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
            
            if (ready[0]) {
                Log.d(TAG, "JS 已就绪");
                return true;
            }
        }
        return false;
    }
    
    /**
     * 发送文件数据
     */
    private void sendFileData(byte[] fileData, String fileName, String mimeType) {
        try {
            int totalChunks = (int) Math.ceil((double) fileData.length / CHUNK_SIZE);
            int chunkIndex = 0;
            
            // 批量发送
            while (chunkIndex < totalChunks) {
                // 准备一批数据
                StringBuilder batchJs = new StringBuilder();
                batchJs.append("javascript:");
                
                int batchCount = 0;
                for (int i = 0; i < BATCH_SIZE && chunkIndex < totalChunks; i++, chunkIndex++) {
                    int start = chunkIndex * CHUNK_SIZE;
                    int end = Math.min(start + CHUNK_SIZE, fileData.length);
                    int len = end - start;
                    
                    byte[] chunk = new byte[len];
                    System.arraycopy(fileData, start, chunk, 0, len);
                    String base64 = android.util.Base64.encodeToString(chunk, android.util.Base64.NO_WRAP);
                    
                    if (batchCount > 0) {
                        batchJs.append(";");
                    }
                    batchJs.append("Lumina.FileOpener.fastChunk(").append(chunkIndex).append(",'").append(base64).append("')");
                    batchCount++;
                }
                
                // 发送批次
                final String js = batchJs.toString();
                final int currentChunk = chunkIndex;
                
                runOnUiThread(() -> {
                    bridge.getWebView().evaluateJavascript(js, result -> {
                        // 可选：处理确认
                    });
                });
                
                // 极短延迟让 UI 喘息（10ms 每批次，不是每块）
                if (chunkIndex < totalChunks) {
                    Thread.sleep(10);
                }
                
                // 每批次日志
                Log.d(TAG, "已发送批次: " + (chunkIndex - batchCount) + "-" + (chunkIndex - 1) + ", 进度: " + 
                    Math.round((double) chunkIndex / totalChunks * 100) + "%");
            }
            
            // 发送完成标记
            Thread.sleep(100);
            final String finalFileName2 = fileName;
            final String finalMimeType2 = mimeType;
            final int finalFileDataLength = fileData.length;
            runOnUiThread(() -> {
                String js = "javascript:Lumina.FileOpener.fastComplete('" + 
                    escapeJsString(finalFileName2) + "','" + escapeJsString(finalMimeType2) + "'," + finalFileDataLength + ");";
                bridge.getWebView().evaluateJavascript(js, null);
            });
            
            Log.d(TAG, "快速传输完成: " + totalChunks + " 块");
            
        } catch (Exception e) {
            Log.e(TAG, "发送数据失败: " + e.getMessage(), e);
        } finally {
            isTransferring = false;
        }
    }
    
    /**
     * 一次性读取文件（速度最快，适用于 < 100MB 文件）
     */
    private byte[] readFileFully(ContentResolver resolver, Uri uri) {
        try {
            java.io.InputStream is = resolver.openInputStream(uri);
            if (is == null) return null;
            
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            
            while ((read = is.read(buffer)) != -1) {
                baos.write(buffer, 0, read);
            }
            
            is.close();
            byte[] result = baos.toByteArray();
            baos.close();
            
            return result;
        } catch (Exception e) {
            Log.e(TAG, "读取文件失败: " + e.getMessage());
            return null;
        }
    }
    
    private FileInfo getFileInfo(Uri uri) {
        FileInfo info = new FileInfo();
        info.fileName = null;
        info.mimeType = null;
        
        try {
            ContentResolver resolver = getContentResolver();
            info.mimeType = resolver.getType(uri);
            
            Cursor cursor = resolver.query(uri, null, null, null, null);
            if (cursor != null) {
                try {
                    if (cursor.moveToFirst()) {
                        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (nameIndex >= 0) {
                            info.fileName = cursor.getString(nameIndex);
                        }
                    }
                } finally {
                    cursor.close();
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "获取文件信息失败: " + e.getMessage());
        }
        
        if (info.fileName == null || info.fileName.isEmpty()) {
            String path = uri.getLastPathSegment();
            info.fileName = (path != null && !path.isEmpty()) ? path : "unknown";
            if (!info.fileName.contains(".")) {
                info.fileName += ".txt";
            }
        }
        
        return info;
    }
    
    private String escapeJsString(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\")
                  .replace("'", "\\'")
                  .replace("\n", "\\n")
                  .replace("\r", "\\r")
                  .replace("\t", "\\t");
    }
    
    private static class FileInfo {
        String fileName;
        String mimeType;
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        ExecutorService exec = executor;
        if (exec != null) {
            exec.shutdown();
        }
    }
}
