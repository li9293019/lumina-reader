package com.lumina.reader;

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

public class MainActivity extends BridgeActivity {
    private static final String TAG = "LuminaFileOpener";
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 启用 WebView 调试（仅 DEBUG 模式）
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        
        // 注册 TTS 后台服务插件
        registerPlugin(TTSBackgroundPlugin.class);
        
        // 注册增强版 TTS 插件（支持 voiceURI 切换音色）
        registerPlugin(TTSEnhancedPlugin.class);
        
        // 检查启动 Intent
        handleIntent(getIntent());
    }
    
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // singleTask 模式下，应用已在运行时收到新的 Intent
        // 必须设置新的 Intent，否则 Capacitor 会保持旧的
        setIntent(intent);
        // 通知 Bridge 有新的 Intent
        bridge.onNewIntent(intent);
        
        // 处理新的 Intent
        handleIntent(intent);
    }
    
    private void handleIntent(Intent intent) {
        if (intent == null) {
            Log.d(TAG, "Intent is null");
            return;
        }
        
        String action = intent.getAction();
        Uri data = intent.getData();
        
        Log.d(TAG, "handleIntent: action=" + action + ", data=" + data);
        
        if (Intent.ACTION_VIEW.equals(action) && data != null) {
            Log.d(TAG, "VIEW action with URI: " + data.toString());
            // 获取文件信息并传递给 WebView
            sendFileToWebView(data);
        } else if (Intent.ACTION_SEND.equals(action)) {
            Uri sendData = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            Log.d(TAG, "SEND action with URI: " + sendData);
            if (sendData != null) {
                sendFileToWebView(sendData);
            }
        }
    }
    
    // 获取文件信息（URL、文件名、MIME类型）
    private FileInfo getFileInfo(Uri uri) {
        FileInfo info = new FileInfo();
        info.url = uri.toString();
        info.fileName = null;
        info.mimeType = null;
        
        // 查询 ContentResolver 获取文件名和 MIME 类型
        try {
            ContentResolver resolver = getContentResolver();
            
            // 获取 MIME 类型
            info.mimeType = resolver.getType(uri);
            Log.d(TAG, "MIME type: " + info.mimeType);
            
            // 查询文件名
            Cursor cursor = resolver.query(uri, null, null, null, null);
            if (cursor != null) {
                try {
                    if (cursor.moveToFirst()) {
                        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (nameIndex >= 0) {
                            info.fileName = cursor.getString(nameIndex);
                            Log.d(TAG, "File name from cursor: " + info.fileName);
                        }
                    }
                } finally {
                    cursor.close();
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error querying file info: " + e.getMessage());
        }
        
        // 如果无法获取文件名，从 URL 提取
        if (info.fileName == null || info.fileName.isEmpty()) {
            String path = uri.getLastPathSegment();
            if (path != null && !path.isEmpty()) {
                info.fileName = path;
            } else {
                info.fileName = "unknown";
            }
            // 添加默认扩展名
            if (!info.fileName.contains(".")) {
                info.fileName += ".txt";
            }
        }
        
        return info;
    }
    
    private void sendFileToWebView(Uri uri) {
        FileInfo info = getFileInfo(uri);
        Log.d(TAG, "Sending file to WebView: " + info.fileName + ", MIME: " + info.mimeType);
        
        // 转义特殊字符
        final String escapedUrl = info.url.replace("'", "\\'").replace("\\", "\\\\");
        final String escapedFileName = info.fileName.replace("'", "\\'").replace("\\", "\\\\");
        final String escapedMimeType = info.mimeType != null ? info.mimeType.replace("'", "\\'") : "text/plain";
        
        // 保存 URL 供重试使用
        pendingUrl = info.url;
        pendingFileName = info.fileName;
        pendingMimeType = info.mimeType;
        
        // 尝试发送
        trySendFile(escapedUrl, escapedFileName, escapedMimeType, 0);
    }
    
    private void trySendFile(final String escapedUrl, final String escapedFileName, 
                             final String escapedMimeType, final int attempt) {
        if (bridge == null || bridge.getWebView() == null) {
            Log.w(TAG, "Bridge not ready, attempt " + attempt);
            if (attempt < 10) {
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    trySendFile(escapedUrl, escapedFileName, escapedMimeType, attempt + 1);
                }, 500);
            }
            return;
        }
        
        // 构建 JavaScript 代码，传递 URL、文件名和 MIME 类型
        String js = "javascript:" +
            "(function() {" +
            "  try {" +
            "    if(window.Lumina && Lumina.FileOpener && Lumina.FileOpener.handleIncomingFile) {" +
            "      console.log('[FileOpener] 调用 handleIncomingFile');" +
            "      Lumina.FileOpener.handleIncomingFile('" + escapedUrl + "', '" + escapedFileName + "', '" + escapedMimeType + "');" +
            "      return 'success';" +
            "    } else {" +
            "      console.log('[FileOpener] 未就绪');" +
            "      return 'not_ready';" +
            "    }" +
            "  } catch(e) {" +
            "    console.error('[FileOpener] Error:', e);" +
            "    return 'error';" +
            "  }" +
            "})()";
        
        bridge.getWebView().post(() -> {
            bridge.getWebView().evaluateJavascript(js, result -> {
                Log.d(TAG, "Attempt " + attempt + " result: " + result);
                if (!"\"success\"".equals(result) && attempt < 10) {
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        trySendFile(escapedUrl, escapedFileName, escapedMimeType, attempt + 1);
                    }, 500);
                }
            });
        });
    }
    
    // 文件信息类
    private static class FileInfo {
        String url;
        String fileName;
        String mimeType;
    }
    
    private String pendingUrl = null;
    private String pendingFileName = null;
    private String pendingMimeType = null;
    
    @Override
    public void onResume() {
        super.onResume();
        // 如果 WebView 已准备好且有待处理的文件，发送它
        if (pendingUrl != null && bridge != null && bridge.getWebView() != null) {
            String escapedUrl = pendingUrl.replace("'", "\\'").replace("\\", "\\\\");
            String escapedFileName = pendingFileName != null ? pendingFileName.replace("'", "\\'") : "unknown";
            String escapedMimeType = pendingMimeType != null ? pendingMimeType.replace("'", "\\'") : "text/plain";
            trySendFile(escapedUrl, escapedFileName, escapedMimeType, 0);
            pendingUrl = null;
        }
    }
}
