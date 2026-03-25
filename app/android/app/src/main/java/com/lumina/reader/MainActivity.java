package com.lumina.reader;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.lumina.reader.plugins.TTSBackgroundPlugin;
import com.lumina.reader.plugins.TTSEnhancedPlugin;

public class MainActivity extends BridgeActivity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 注册 TTS 后台服务插件
        registerPlugin(TTSBackgroundPlugin.class);
        
        // 注册增强版 TTS 插件（支持 voiceURI 切换音色）
        registerPlugin(TTSEnhancedPlugin.class);
    }
}
