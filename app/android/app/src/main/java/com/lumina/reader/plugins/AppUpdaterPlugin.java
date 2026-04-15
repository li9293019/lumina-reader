package com.lumina.reader.plugins;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * APP 热更新插件
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String TAG = "AppUpdater";
    private static final int DOWNLOAD_BUFFER_SIZE = 8192;
    private static final int CONNECT_TIMEOUT = 15000;
    private static final int READ_TIMEOUT = 30000;

    /**
     * 检查远程更新（原生层请求，绕过 WebView CORS 限制）
     */
    @PluginMethod
    public void checkUpdate(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("缺少 URL");
            return;
        }

        new Thread(() -> {
            try {
                String json = fetchString(url);
                if (json == null || json.isEmpty()) {
                    call.reject("empty_response");
                    return;
                }
                JSONObject remote = new JSONObject(json);
                JSObject result = new JSObject();
                result.put("version", remote.optString("version", "0.0.0"));
                result.put("build", remote.optString("build", ""));
                result.put("minNativeVersion", remote.optString("minNativeVersion", ""));
                result.put("requiresNativeUpdate", remote.optBoolean("requiresNativeUpdate", false));
                result.put("changelog", remote.optString("changelog", ""));
                result.put("updateUrl", remote.optString("updateUrl", ""));
                result.put("sha256", remote.optString("sha256", ""));
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "检查更新失败: " + e.getMessage(), e);
                call.reject(e.getMessage());
            }
        }).start();
    }

    /**
     * 获取当前前端版本
     */
    @PluginMethod
    public void getCurrentVersion(PluginCall call) {
        try {
            String versionJson = readVersionJson();
            if (versionJson == null || versionJson.isEmpty()) {
                call.resolve(new JSObject().put("version", "0.0.0").put("build", ""));
                return;
            }
            JSONObject json = new JSONObject(versionJson);
            JSObject result = new JSObject();
            result.put("version", json.optString("version", "0.0.0"));
            result.put("build", json.optString("build", ""));
            result.put("minNativeVersion", json.optString("minNativeVersion", ""));
            result.put("requiresNativeUpdate", json.optBoolean("requiresNativeUpdate", false));
            result.put("changelog", json.optString("changelog", ""));
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "读取版本失败", e);
            call.reject("读取版本失败: " + e.getMessage());
        }
    }

    /**
     * 下载并应用更新
     */
    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        String url = call.getString("url");
        String expectedSha256 = call.getString("sha256");

        if (url == null || url.isEmpty()) {
            call.reject("缺少下载 URL");
            return;
        }

        new Thread(() -> {
            try {
                File cacheDir = getContext().getCacheDir();
                File tempZip = new File(cacheDir, "lumina-update.zip");
                File updateDir = new File(getContext().getFilesDir(), "updates/www");
                File targetDir = new File(getContext().getFilesDir(), "www");

                Log.d(TAG, "开始下载更新包: " + url);
                downloadFile(url, tempZip);
                Log.d(TAG, "下载完成: " + tempZip.length() + " 字节");

                if (expectedSha256 != null && !expectedSha256.isEmpty()) {
                    String actualSha256 = computeSha256(tempZip);
                    if (!actualSha256.equalsIgnoreCase(expectedSha256)) {
                        tempZip.delete();
                        call.reject("SHA-256 校验失败");
                        return;
                    }
                    Log.d(TAG, "SHA-256 校验通过");
                }

                deleteRecursive(updateDir);
                updateDir.mkdirs();
                unzip(tempZip, updateDir);
                Log.d(TAG, "解压完成");

                File indexHtml = new File(updateDir, "index.html");
                if (!indexHtml.exists()) {
                    deleteRecursive(updateDir);
                    tempZip.delete();
                    call.reject("更新包结构异常，缺少 index.html");
                    return;
                }

                deleteRecursive(targetDir);
                if (!updateDir.renameTo(targetDir)) {
                    copyDirectory(updateDir, targetDir);
                    deleteRecursive(updateDir);
                }

                tempZip.delete();

                Log.d(TAG, "更新已应用到: " + targetDir.getAbsolutePath());
                call.resolve(new JSObject().put("success", true));
            } catch (Exception e) {
                Log.e(TAG, "更新失败", e);
                call.reject("更新失败: " + e.getMessage());
            }
        }).start();
    }

    /**
     * 重启应用（AlarmManager 实现真正自动重启）
     */
    @PluginMethod
    public void restartApp(PluginCall call) {
        call.resolve(new JSObject().put("success", true));

        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            Context ctx = getContext();
            Intent intent = new Intent(ctx, com.lumina.reader.MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            ctx.startActivity(intent);
            getActivity().finishAndRemoveTask();
            android.os.Process.killProcess(android.os.Process.myPid());
        }, 300);
    }

    // ==================== 私有方法 ====================

    private String readVersionJson() {
        File updatedVersion = new File(getContext().getFilesDir(), "www/version.json");
        if (updatedVersion.exists()) {
            return readFileToString(updatedVersion);
        }
        try (InputStream is = getContext().getAssets().open("public/version.json")) {
            return inputStreamToString(is);
        } catch (Exception e) {
            Log.w(TAG, "读取 assets version.json 失败", e);
            return null;
        }
    }

    private String readFileToString(File file) {
        try (FileInputStream fis = new FileInputStream(file)) {
            return inputStreamToString(fis);
        } catch (Exception e) {
            return null;
        }
    }

    private String inputStreamToString(InputStream is) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buffer = new byte[1024];
        int len;
        while ((len = is.read(buffer)) != -1) {
            baos.write(buffer, 0, len);
        }
        return baos.toString("UTF-8");
    }

    private void downloadFile(String urlStr, File destFile) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(CONNECT_TIMEOUT);
        conn.setReadTimeout(READ_TIMEOUT);
        conn.setInstanceFollowRedirects(true);

        int responseCode = conn.getResponseCode();
        if (responseCode >= 300 && responseCode < 400) {
            String location = conn.getHeaderField("Location");
            if (location != null) {
                conn.disconnect();
                downloadFile(location, destFile);
                return;
            }
        }

        if (responseCode != HttpURLConnection.HTTP_OK) {
            throw new Exception("HTTP " + responseCode);
        }

        long total = conn.getContentLengthLong();
        if (total <= 0) total = -1;

        try (InputStream in = new BufferedInputStream(conn.getInputStream());
             FileOutputStream out = new FileOutputStream(destFile)) {
            byte[] buffer = new byte[DOWNLOAD_BUFFER_SIZE];
            int len;
            long downloaded = 0;
            long lastEmit = 0;
            while ((len = in.read(buffer)) != -1) {
                out.write(buffer, 0, len);
                downloaded += len;

                long now = System.currentTimeMillis();
                if (total > 0 && (now - lastEmit > 200 || downloaded >= total)) {
                    JSObject data = new JSObject();
                    data.put("progress", downloaded);
                    data.put("total", total);
                    this.notifyListeners("downloadProgress", data, true);
                    lastEmit = now;
                } else if (total <= 0 && (now - lastEmit > 500)) {
                    JSObject data = new JSObject();
                    data.put("progress", downloaded);
                    data.put("total", downloaded);
                    this.notifyListeners("downloadProgress", data, true);
                    lastEmit = now;
                }
            }
            // 确保最后一次 100% 被通知
            if (total > 0 && downloaded >= total) {
                JSObject data = new JSObject();
                data.put("progress", total);
                data.put("total", total);
                this.notifyListeners("downloadProgress", data, true);
            }
        } finally {
            conn.disconnect();
        }
    }

    private String fetchString(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(CONNECT_TIMEOUT);
        conn.setReadTimeout(READ_TIMEOUT);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("Accept", "application/json");

        int responseCode = conn.getResponseCode();
        if (responseCode >= 300 && responseCode < 400) {
            String location = conn.getHeaderField("Location");
            if (location != null) {
                conn.disconnect();
                return fetchString(location);
            }
        }

        if (responseCode != HttpURLConnection.HTTP_OK) {
            throw new Exception("HTTP " + responseCode);
        }

        try (InputStream in = new BufferedInputStream(conn.getInputStream())) {
            return inputStreamToString(in);
        } finally {
            conn.disconnect();
        }
    }

    private String computeSha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream fis = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int len;
            while ((len = fis.read(buffer)) != -1) {
                digest.update(buffer, 0, len);
            }
        }
        byte[] hash = digest.digest();
        StringBuilder sb = new StringBuilder();
        for (byte b : hash) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private void unzip(File zipFile, File destDir) throws Exception {
        String canonicalDest = destDir.getCanonicalPath();
        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(zipFile))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                File outFile = new File(destDir, entry.getName());
                String canonicalEntry = outFile.getCanonicalPath();
                if (!canonicalEntry.startsWith(canonicalDest + File.separator)) {
                    throw new SecurityException("Zip entry path traversal: " + entry.getName());
                }
                if (entry.isDirectory()) {
                    outFile.mkdirs();
                } else {
                    outFile.getParentFile().mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        byte[] buffer = new byte[8192];
                        int len;
                        while ((len = zis.read(buffer)) != -1) {
                            fos.write(buffer, 0, len);
                        }
                    }
                }
                zis.closeEntry();
            }
        }
    }

    private void deleteRecursive(File fileOrDir) {
        if (fileOrDir == null || !fileOrDir.exists()) return;
        if (fileOrDir.isDirectory()) {
            File[] children = fileOrDir.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        fileOrDir.delete();
    }

    private void copyDirectory(File source, File target) throws Exception {
        if (source.isDirectory()) {
            if (!target.exists()) target.mkdirs();
            File[] children = source.listFiles();
            if (children != null) {
                for (File child : children) {
                    copyDirectory(child, new File(target, child.getName()));
                }
            }
        } else {
            try (FileInputStream in = new FileInputStream(source);
                 FileOutputStream out = new FileOutputStream(target)) {
                byte[] buffer = new byte[8192];
                int len;
                while ((len = in.read(buffer)) != -1) {
                    out.write(buffer, 0, len);
                }
            }
        }
    }
}
