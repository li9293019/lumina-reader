package com.lumina.reader.plugins;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;
import com.lumina.reader.TTSForegroundService;

@CapacitorPlugin(name = "TTSBackground")
public class TTSBackgroundPlugin extends Plugin {

    @PluginMethod
    public void startService(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Intent serviceIntent = new Intent(getContext(), TTSForegroundService.class);
                serviceIntent.setAction("START");
                
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    getContext().startForegroundService(serviceIntent);
                } else {
                    getContext().startService(serviceIntent);
                }
                
                call.resolve();
            } catch (Exception e) {
                call.reject("启动服务失败: " + e.getMessage());
            }
        });
    }
    
    @PluginMethod
    public void stopService(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Intent serviceIntent = new Intent(getContext(), TTSForegroundService.class);
                serviceIntent.setAction("STOP");
                getContext().startService(serviceIntent);
                call.resolve();
            } catch (Exception e) {
                call.reject("停止服务失败: " + e.getMessage());
            }
        });
    }
    
    @PluginMethod
    public void updatePlaying(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                boolean isPlaying = call.getBoolean("isPlaying", false);
                String title = call.getString("title", "正在朗读...");
                
                Intent serviceIntent = new Intent(getContext(), TTSForegroundService.class);
                serviceIntent.setAction("UPDATE_PLAYING");
                serviceIntent.putExtra("isPlaying", isPlaying);
                serviceIntent.putExtra("title", title);
                getContext().startService(serviceIntent);
                
                call.resolve();
            } catch (Exception e) {
                call.reject("更新状态失败: " + e.getMessage());
            }
        });
    }
    
    @PluginMethod
    public void checkBatteryOptimization(PluginCall call) {
        JSObject result = new JSObject();
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            boolean isIgnoring = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
            result.put("isIgnoring", isIgnoring);
            result.put("needRequest", !isIgnoring);
        } else {
            result.put("isIgnoring", true);
            result.put("needRequest", false);
        }
        
        call.resolve(result);
    }
    
    @PluginMethod
    public void requestBatteryOptimization(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("请求失败: " + e.getMessage());
            }
        } else {
            call.resolve(); // 低版本不需要
        }
    }
}
