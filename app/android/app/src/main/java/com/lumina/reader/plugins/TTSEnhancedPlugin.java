package com.lumina.reader.plugins;

import android.os.Bundle;
import android.speech.tts.Voice;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Locale;
import java.util.Set;

/**
 * 增强版 TTS 插件，支持通过 voiceURI 设置音色
 */
@CapacitorPlugin(name = "TTSEnhanced")
public class TTSEnhancedPlugin extends Plugin {
    
    private static final String LOG_TAG = "TTSEnhanced";
    private android.speech.tts.TextToSpeech tts = null;
    private boolean isInitialized = false;
    
    @Override
    public void load() {
        tts = new android.speech.tts.TextToSpeech(getContext(), status -> {
            isInitialized = (status == android.speech.tts.TextToSpeech.SUCCESS);
            Log.d(LOG_TAG, "TTS 初始化状态: " + isInitialized);
        });
    }
    
    /**
     * 获取支持的音色列表，包含更详细的信息
     */
    @PluginMethod
    public void getSupportedVoices(PluginCall call) {
        if (!isInitialized || tts == null) {
            call.reject("TTS 未初始化");
            return;
        }
        
        try {
            Set<Voice> voices = tts.getVoices();
            JSArray voicesArray = new JSArray();
            
            int index = 0;
            for (Voice v : voices) {
                JSObject obj = new JSObject();
                obj.put("index", index++);
                obj.put("name", v.getName());
                obj.put("voiceURI", v.getName()); // Voice 的唯一标识就是 name
                obj.put("locale", v.getLocale().toString());
                obj.put("languageTag", v.getLocale().toLanguageTag());
                obj.put("displayName", v.getLocale().getDisplayName());
                obj.put("isNetworkRequired", v.isNetworkConnectionRequired());
                obj.put("quality", v.getQuality());
                obj.put("latency", v.getLatency());
                
                // 检查音色是否当前可用
                int features = v.getFeatures() != null ? v.getFeatures().size() : 0;
                obj.put("features", features);
                
                voicesArray.put(obj);
            }
            
            JSObject result = new JSObject();
            result.put("voices", voicesArray);
            result.put("count", voices.size());
            call.resolve(result);
            
        } catch (Exception e) {
            Log.e(LOG_TAG, "获取音色列表失败", e);
            call.reject("获取音色失败: " + e.getMessage());
        }
    }
    
    /**
     * 通过 voiceURI 设置音色
     */
    @PluginMethod
    public void setVoiceByURI(PluginCall call) {
        if (!isInitialized || tts == null) {
            call.reject("TTS 未初始化");
            return;
        }
        
        String voiceURI = call.getString("voiceURI");
        if (voiceURI == null || voiceURI.isEmpty()) {
            call.reject("voiceURI 不能为空");
            return;
        }
        
        try {
            Set<Voice> voices = tts.getVoices();
            Voice targetVoice = null;
            
            for (Voice v : voices) {
                if (v.getName().equals(voiceURI)) {
                    targetVoice = v;
                    break;
                }
            }
            
            if (targetVoice == null) {
                call.reject("找不到音色: " + voiceURI);
                return;
            }
            
            int result = tts.setVoice(targetVoice);
            
            JSObject ret = new JSObject();
            ret.put("success", result == android.speech.tts.TextToSpeech.SUCCESS);
            ret.put("resultCode", result);
            ret.put("voiceName", targetVoice.getName());
            ret.put("voiceLocale", targetVoice.getLocale().toString());
            
            if (result == android.speech.tts.TextToSpeech.SUCCESS) {
                call.resolve(ret);
            } else {
                call.reject("设置音色失败，错误码: " + result, ret);
            }
            
        } catch (Exception e) {
            Log.e(LOG_TAG, "设置音色失败", e);
            call.reject("设置音色异常: " + e.getMessage());
        }
    }
    
    /**
     * 朗读文本，支持通过 voiceURI 指定音色
     */
    @PluginMethod
    public void speak(PluginCall call) {
        if (!isInitialized || tts == null) {
            call.reject("TTS 未初始化");
            return;
        }
        
        String text = call.getString("text");
        if (text == null || text.isEmpty()) {
            call.reject("文本不能为空");
            return;
        }
        
        // 可选参数
        String voiceURI = call.getString("voiceURI", null);
        String lang = call.getString("lang", "zh-CN");
        float rate = call.getFloat("rate", 1.0f);
        float pitch = call.getFloat("pitch", 1.0f);
        float volume = call.getFloat("volume", 1.0f);
        
        try {
            // 如果指定了 voiceURI，先设置音色
            if (voiceURI != null && !voiceURI.isEmpty()) {
                Set<Voice> voices = tts.getVoices();
                for (Voice v : voices) {
                    if (v.getName().equals(voiceURI)) {
                        int setResult = tts.setVoice(v);
                        Log.d(LOG_TAG, "设置音色 " + voiceURI + " 结果: " + setResult);
                        break;
                    }
                }
            }
            
            // 设置语言和其他参数
            Locale locale = Locale.forLanguageTag(lang);
            tts.setLanguage(locale);
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);
            
            // 朗读
            Bundle params = new Bundle();
            params.putFloat(android.speech.tts.TextToSpeech.Engine.KEY_PARAM_VOLUME, volume);
            
            int speakResult = tts.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, params, "utterance-id");
            
            JSObject ret = new JSObject();
            ret.put("success", speakResult == android.speech.tts.TextToSpeech.SUCCESS);
            ret.put("resultCode", speakResult);
            call.resolve(ret);
            
        } catch (Exception e) {
            Log.e(LOG_TAG, "朗读失败", e);
            call.reject("朗读异常: " + e.getMessage());
        }
    }
    
    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) {
            tts.stop();
        }
        call.resolve();
    }
    
    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.handleOnDestroy();
    }
}
