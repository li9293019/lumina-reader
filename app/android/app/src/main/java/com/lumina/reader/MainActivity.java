package com.lumina.reader;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.lumina.reader.plugins.TTSBackgroundPlugin;

public class MainActivity extends BridgeActivity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 注册 TTS 后台服务插件
        registerPlugin(TTSBackgroundPlugin.class);
    }
}
