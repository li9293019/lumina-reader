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
import android.webkit.JavascriptInterface;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.lumina.reader.BuildConfig;
import com.lumina.reader.plugins.TTSBackgroundPlugin;
import com.lumina.reader.plugins.TTSEnhancedPlugin;
import com.lumina.reader.plugins.LargeFilePlugin;
import com.lumina.reader.plugins.AppUpdaterPlugin;

import java.io.File;

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
    
    // 跨实例传输状态（防止多实例同时处理文件）
    private static volatile boolean isTransferring = false;
    private static volatile long lastTransferTime = 0;
    private static final long TRANSFER_LOCK_TIMEOUT = 30000; // 30秒超时
    
    private Handler mainHandler;
    private ExecutorService executor;
    
    // 静态标记：是否有主实例正在运行
    private static MainActivity sActiveInstance = null;
    private static Intent sPendingIntent = null;
    
    /**
     * 检查主实例是否还活着
     */
    private static boolean isActiveInstanceAlive() {
        if (sActiveInstance == null) return false;
        // 检查 Activity 是否已销毁
        return !sActiveInstance.isDestroyed();
    }
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Capacitor 8: Bridge 在 super.onCreate 内部就被创建，
        // 所以自定义插件必须在 super.onCreate 之前注册
        registerPlugin(TTSBackgroundPlugin.class);
        registerPlugin(TTSEnhancedPlugin.class);
        registerPlugin(LargeFilePlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        
        super.onCreate(savedInstanceState);
        mainHandler = new Handler(Looper.getMainLooper());
        
        // 允许混合内容：HTTPS 页面加载 HTTP 资源（本地 AI 服务通常是 HTTP）
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().getSettings().setMixedContentMode(
                android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            );
        }
        
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        
        // 检查并应用热更新资源
        applyHotUpdateIfExists();
        
        // Capacitor 社区插件自动注册，无需手动注册
        
        // 检查是否是从其他应用（如TG）启动的，如果是，确保我们在自己的任务中
        if (handleExternalIntent()) {
            return; // 已经重新启动到新任务，结束当前实例
        }
        
        // 检查是否已有主实例在运行（且还活着）
        if (isActiveInstanceAlive() && sActiveInstance != this) {
            Log.d(TAG, "已有主实例运行，将文件传递给主实例");
            // 保存 Intent 给主实例处理
            sPendingIntent = getIntent();
            // 唤醒主实例
            try {
                sActiveInstance.runOnUiThread(() -> {
                    if (isActiveInstanceAlive()) {
                        sActiveInstance.handlePendingIntent();
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "传递 Intent 给主实例失败", e);
                // 主实例可能已死，清理并自己成为主实例
                sActiveInstance = null;
            }
            finish();
            return;
        }
        
        // 成为主实例
        sActiveInstance = this;
        handleIntent(getIntent());
        
        // 注册返回按钮处理器（AndroidX 推荐方式）
        registerBackPressedHandler();
        
        // 添加 JS 接口支持退出应用
        bridge.getWebView().addJavascriptInterface(new ExitAppInterface(), "ExitAppInterface");
    }
    
    /**
     * JS 接口：退出应用
     */
    public class ExitAppInterface {
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> {
                Log.d(TAG, "JS 请求退出应用");
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().removeAllViews();
                    bridge.getWebView().destroy();
                }
                finishAndRemoveTask();
                System.exit(0);
            });
        }
    }
    
    /**
     * 注册返回按钮处理器（兼容 Android 13+ 返回手势）
     */
    private void registerBackPressedHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                MainActivity.this.handleBackPressed();
            }
        });
    }
    
    /**
     * 处理待处理的 Intent（由其他实例传递过来的）
     */
    private void handlePendingIntent() {
        if (sPendingIntent != null) {
            Intent intent = sPendingIntent;
            sPendingIntent = null;
            Log.d(TAG, "处理待处理 Intent: " + intent);
            
            // 强制重置传输状态，确保新文件能被处理
            if (isTransferring) {
                Log.d(TAG, "强制重置传输状态以处理新文件");
                isTransferring = false;
                lastTransferTime = 0;
            }
            
            // 确保在前台
            bringToFront();
            // 处理文件
            handleIntent(intent);
        }
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
            bringToFront();
        }
        
        // 确保我们在自己的任务中，如果不是，尝试修复
        if (!isTaskRoot()) {
            Log.w(TAG, "onNewIntent: 检测到不在正确任务中，尝试重新定位");
            ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (am != null) {
                List<ActivityManager.AppTask> tasks = am.getAppTasks();
                for (ActivityManager.AppTask task : tasks) {
                    ActivityManager.RecentTaskInfo info = task.getTaskInfo();
                    if (info != null && info.baseIntent != null && 
                        info.baseIntent.getComponent() != null &&
                        info.baseIntent.getComponent().getPackageName().equals(getPackageName())) {
                        task.moveToFront();
                        Log.d(TAG, "已移动到正确的任务");
                        break;
                    }
                }
            }
        }
        
        handleIntent(intent);
    }
    
    @Override
    public void onDestroy() {
        // 清理主实例标记（必须在 super.onDestroy 之前）
        if (sActiveInstance == this) {
            Log.d(TAG, "主实例销毁，清理标记");
            sActiveInstance = null;
        }
        ExecutorService exec = executor;
        if (exec != null) {
            exec.shutdown();
        }
        super.onDestroy();
    }
    
    /**
     * 处理从外部应用（如TG）启动的情况
     * 确保 Activity 运行在自己的独立任务中，而不是嵌入到调用者的任务里
     * 
     * @return true 如果 Activity 已重新启动到新任务，当前实例应该结束
     */
    private boolean handleExternalIntent() {
        Intent intent = getIntent();
        if (intent == null) return false;
        
        String action = intent.getAction();
        boolean isExternalOpen = Intent.ACTION_VIEW.equals(action) || 
                                 Intent.ACTION_SEND.equals(action) ||
                                 Intent.ACTION_SEND_MULTIPLE.equals(action);
        
        if (!isExternalOpen) return false;
        
        // 检查当前是否在正确的任务中
        // 如果 isTaskRoot() 返回 false，说明我们被嵌入到了其他应用的任务中
        if (!isTaskRoot()) {
            Log.d(TAG, "检测到被嵌入外部任务，重新启动到独立任务");
            
            // 创建新的 Intent，添加 NEW_TASK 标志
            Intent newIntent = new Intent(intent);
            newIntent.setClass(this, MainActivity.class);
            newIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | 
                              Intent.FLAG_ACTIVITY_CLEAR_TOP |
                              Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            
            // 传递原始数据
            if (intent.getData() != null) {
                newIntent.setData(intent.getData());
            }
            if (intent.getExtras() != null) {
                newIntent.putExtras(intent.getExtras());
            }
            
            // 启动新的独立任务实例
            startActivity(newIntent);
            
            // 结束当前的嵌入实例
            finish();
            return true;
        }
        
        return false;
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
        // 只有主实例才能处理文件
        if (sActiveInstance != this) {
            Log.w(TAG, "非主实例尝试处理文件，忽略");
            return;
        }
        
        // 检查是否正在传输（防止重复加载）
        if (isTransferring) {
            // 检查是否超时（防止死锁）
            if (System.currentTimeMillis() - lastTransferTime < TRANSFER_LOCK_TIMEOUT) {
                Log.w(TAG, "正在传输中，忽略新请求");
                return;
            } else {
                Log.w(TAG, "检测到超时传输，强制重置状态");
                isTransferring = false;
            }
        }
        
        FileInfo info = getFileInfo(uri);
        Log.d(TAG, "处理文件: " + info.fileName + ", MIME: " + info.mimeType);
        
        isTransferring = true;
        lastTransferTime = System.currentTimeMillis();
        
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
                lastTransferTime = 0;
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
                    // 注意：isTransferring 状态由 sendFileData 在完成后重置
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
            isTransferring = false;
            lastTransferTime = 0;
        }
        // 注意：不要在 finally 中重置 isTransferring，因为 sendFileData 在新线程中运行
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
            // 通知 JS 传输错误
            final String errorMsg = e.getMessage();
            runOnUiThread(() -> {
                String js = "javascript:Lumina.FileOpener.fastError('" + escapeJsString(errorMsg) + "');";
                bridge.getWebView().evaluateJavascript(js, null);
            });
        } finally {
            isTransferring = false;
            lastTransferTime = 0;
            Log.d(TAG, "传输状态已重置");
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
    
    /**
     * 应用热更新：如果 files/www/index.html 存在，则让 Capacitor 从该目录加载
     */
    private void applyHotUpdateIfExists() {
        try {
            File updatedIndex = new File(getFilesDir(), "www/index.html");
            if (updatedIndex.exists()) {
                File wwwDir = updatedIndex.getParentFile();
                if (bridge != null && wwwDir != null) {
                    bridge.setServerBasePath(wwwDir.getAbsolutePath());
                    Log.d(TAG, "热更新已应用: " + wwwDir.getAbsolutePath());
                }
            } else {
                Log.d(TAG, "无热更新资源，使用内置 assets");
            }
        } catch (Exception e) {
            Log.e(TAG, "应用热更新失败", e);
        }
    }

    private static class FileInfo {
        String fileName;
        String mimeType;
    }
    
    // ==================== 返回按钮处理 ====================
    // 记录上次返回键时间（用于双击退出）
    private long lastBackTime = 0;
    private static final long DOUBLE_PRESS_INTERVAL = 2000;
    
    /**
     * 处理返回按钮（供 OnBackPressedDispatcher 调用）
     */
    private void handleBackPressed() {
        // 将返回键事件转发给 WebView，让 JS 处理
        if (bridge != null && bridge.getWebView() != null) {
            // 执行 JS 检查是否有面板打开
            bridge.getWebView().evaluateJavascript(
                "javascript:(function() { " +
                "  if (document.querySelector('.share-card-overlay')) return 'shareCard'; " +  // 分享卡片（最高优先级）
                "  if (document.getElementById('aiChatOverlay')?.classList.contains('active')) return 'aiChat'; " +
                "  if (document.getElementById('aiPanel')?.classList.contains('active')) return 'aiTask'; " +
                "  if (document.getElementById('bookDetailPanel')?.classList.contains('active')) return 'bookDetail'; " +
                "  if (document.getElementById('fileBrowserPanel')?.classList.contains('active')) return 'fileBrowser'; " +
                "  if (document.getElementById('dataManagerPanel')?.classList.contains('active')) return 'dataManager'; " +
                "  if (document.getElementById('aboutPanel')?.classList.contains('active')) return 'about'; " +
                "  if (document.getElementById('cacheManagerPanel')?.classList.contains('active')) return 'cacheManager'; " +
                "  if (document.getElementById('regexHelpPanel')?.classList.contains('active')) return 'regexHelp'; " +
                "  if (document.getElementById('azureTtsDialog')?.classList.contains('active')) return 'azureTts'; " +
                "  if (document.getElementById('heatMapPresetsDialog')?.classList.contains('active')) return 'heatMap'; " +
                "  if (document.getElementById('fontManagerDialog')?.classList.contains('active')) return 'fontManager'; " +
                "  if (document.getElementById('historyPanel')?.classList.contains('open')) return 'historyPanel'; " +
                "  if (document.getElementById('searchPanel')?.classList.contains('open')) return 'searchPanel'; " +
                "  if (document.getElementById('annotationPanel')?.classList.contains('open')) return 'annotationPanel'; " +
                "  if (document.getElementById('sidebarRight')?.classList.contains('open')) return 'sidebarRight'; " +
                "  if (document.getElementById('sidebarLeft')?.classList.contains('visible')) return 'sidebarLeft'; " +
                "  if (Lumina?.State?.app?.currentFile?.name) return 'hasFile'; " +
                "  return 'welcome'; " +
                "})()", 
                result -> {
                    // 解析结果
                    String state = result != null ? result.replace("\"", "") : "welcome";
                    handleBackButtonState(state);
                }
            );
        } else {
            // 如果 bridge 不可用，执行默认行为
            finish();
        }
    }
    
    private void handleBackButtonState(String state) {
        Log.d(TAG, "Back button state: " + state);
        
        switch (state) {
            case "shareCard":
            case "aiChat":
            case "aiTask":
            case "bookDetail":
            case "dataManager":
            case "about":
            case "cacheManager":
            case "regexHelp":
            case "azureTts":
            case "heatMap":
            case "fontManager":
            case "fileBrowser":
            case "historyPanel":
            case "searchPanel":
            case "annotationPanel":
            case "sidebarRight":
            case "sidebarLeft":
            case "hasFile":
                // 有面板或文件打开，让 JS 处理关闭
                // 触发 JS 的返回按钮处理逻辑
                runOnUiThread(() -> {
                    if (bridge != null && bridge.getWebView() != null) {
                        bridge.getWebView().evaluateJavascript(
                            "javascript:if (Lumina.BackButtonHandler) Lumina.BackButtonHandler.handleBackButton()",
                            null
                        );
                    }
                });
                break;
                
            case "welcome":
            default:
                // 在欢迎界面，处理双击退出
                long now = System.currentTimeMillis();
                if (now - lastBackTime < DOUBLE_PRESS_INTERVAL) {
                    // 双击确认，退出应用
                    Log.d(TAG, "Double press confirmed, exiting app");
                    // 先清理 WebView 避免 renderer 崩溃
                    if (bridge != null && bridge.getWebView() != null) {
                        bridge.getWebView().removeAllViews();
                        bridge.getWebView().destroy();
                    }
                    finishAndRemoveTask();
                    System.exit(0);
                } else {
                    // 首次按下，提示再按一次
                    lastBackTime = now;
                    // 发送 Toast 提示给 JS 显示
                    runOnUiThread(() -> {
                        if (bridge != null && bridge.getWebView() != null) {
                            bridge.getWebView().evaluateJavascript(
                                "javascript:Lumina.UI.showToast(Lumina.I18n.t('pressBackAgainToExit'))",
                                null
                            );
                        }
                    });
                }
                // 阻止默认返回行为（由我们控制）
                return;
        }
    }
}
