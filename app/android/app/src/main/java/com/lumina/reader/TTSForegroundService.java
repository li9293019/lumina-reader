package com.lumina.reader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

public class TTSForegroundService extends Service {
    
    private static final String CHANNEL_ID = "LuminaTTS";
    private static final String CHANNEL_NAME = "语音朗读";
    private static final int NOTIFICATION_ID = 1001;
    
    private MediaSessionCompat mediaSession;
    private PowerManager.WakeLock wakeLock;
    private Handler keepAliveHandler;
    private Runnable keepAliveRunnable;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private boolean isPlaying = false;
    
    private final IBinder binder = new LocalBinder();
    
    public class LocalBinder extends Binder {
        TTSForegroundService getService() {
            return TTSForegroundService.this;
        }
    }
    
    @Override
    public void onCreate() {
        super.onCreate();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        keepAliveHandler = new Handler(Looper.getMainLooper());
        initMediaSession();
        createNotificationChannel();
    }
    
    private void initMediaSession() {
        mediaSession = new MediaSessionCompat(this, "LuminaReader");
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                sendBroadcast(new Intent("com.lumina.reader.TTS_RESUME"));
            }
            
            @Override
            public void onPause() {
                sendBroadcast(new Intent("com.lumina.reader.TTS_PAUSE"));
            }
            
            @Override
            public void onStop() {
                sendBroadcast(new Intent("com.lumina.reader.TTS_STOP"));
            }
        });
        
        mediaSession.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | 
                             MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setActive(true);
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        
        String action = intent.getAction();
        if ("START".equals(action)) {
            startTTSService();
        } else if ("STOP".equals(action)) {
            stopTTSService();
        } else if ("UPDATE".equals(action)) {
            boolean playing = intent.getBooleanExtra("isPlaying", false);
            String title = intent.getStringExtra("title");
            updateState(playing, title);
        }
        
        return START_STICKY;
    }
    
    private void startTTSService() {
        if (isPlaying) return;
        
        // 请求音频焦点
        requestAudioFocus();
        
        // 获取 WakeLock - 关键：保持 CPU 运行
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK | 
                PowerManager.ON_AFTER_RELEASE, 
                "LuminaReader:TTS");
            wakeLock.acquire(60 * 60 * 1000); // 1小时
        }
        
        isPlaying = true;
        
        // 启动前台服务（必须第一时间调用）
        Notification notification = buildNotification("正在朗读...", true);
        startForeground(NOTIFICATION_ID, notification);
        
        // 设置媒体会话状态
        updatePlaybackState(true);
        
        // 启动保活机制 - 每 5 秒发送一次广播唤醒 WebView
        startKeepAlive();
    }
    
    private void stopTTSService() {
        isPlaying = false;
        
        stopKeepAlive();
        
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        
        abandonAudioFocus();
        
        updatePlaybackState(false);
        stopForeground(true);
        stopSelf();
    }
    
    private void updateState(boolean playing, String title) {
        isPlaying = playing;
        updatePlaybackState(playing);
        
        if (playing) {
            Notification notification = buildNotification(title != null ? title : "正在朗读...", true);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, notification);
            }
            
            if (!wakeLock.isHeld()) {
                wakeLock.acquire(60 * 60 * 1000);
            }
            
            if (keepAliveRunnable == null) {
                startKeepAlive();
            }
        } else {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            stopKeepAlive();
        }
    }
    
    private void startKeepAlive() {
        keepAliveRunnable = new Runnable() {
            @Override
            public void run() {
                if (isPlaying) {
                    // 发送广播给 WebView，防止其被系统休眠
                    Intent intent = new Intent("com.lumina.reader.KEEP_ALIVE");
                    sendBroadcast(intent);
                    
                    // 确保 WakeLock 仍然持有
                    if (wakeLock != null && !wakeLock.isHeld()) {
                        wakeLock.acquire(60 * 60 * 1000);
                    }
                    
                    // 每 3 秒唤醒一次
                    keepAliveHandler.postDelayed(this, 3000);
                }
            }
        };
        keepAliveHandler.postDelayed(keepAliveRunnable, 3000);
    }
    
    private void stopKeepAlive() {
        if (keepAliveHandler != null && keepAliveRunnable != null) {
            keepAliveHandler.removeCallbacks(keepAliveRunnable);
        }
        keepAliveRunnable = null;
    }
    
    private void requestAudioFocus() {
        if (audioManager == null) return;
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
            
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setAcceptsDelayedFocusGain(true)
                .setWillPauseWhenDucked(false)
                .setOnAudioFocusChangeListener(focusChange -> {})
                .build();
            
            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN);
        }
    }
    
    private void abandonAudioFocus() {
        if (audioManager == null) return;
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        } else {
            audioManager.abandonAudioFocus(null);
        }
    }
    
    private void updatePlaybackState(boolean playing) {
        PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | 
                       PlaybackStateCompat.ACTION_STOP)
            .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                     playing ? SystemClock.elapsedRealtime() : 0, 1.0f);
        
        mediaSession.setPlaybackState(stateBuilder.build());
        mediaSession.setMetadata(new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "流萤阅读器")
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "语音朗读")
            .build());
    }
    
    private Notification buildNotification(String text, boolean playing) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        
        Intent pauseIntent = new Intent(this, TTSForegroundService.class);
        pauseIntent.setAction("PAUSE");
        PendingIntent pausePending = PendingIntent.getService(this, 1, pauseIntent,
            PendingIntent.FLAG_IMMUTABLE);
        
        Intent stopIntent = new Intent(this, TTSForegroundService.class);
        stopIntent.setAction("STOP");
        PendingIntent stopPending = PendingIntent.getService(this, 2, stopIntent,
            PendingIntent.FLAG_IMMUTABLE);
        
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("流萤阅读器")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setStyle(new MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1))
            .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "暂停" : "继续", pausePending)
            .addAction(android.R.drawable.ic_delete, "停止", stopPending);
        
        return builder.build();
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager == null) return;
            
            // 检查渠道是否已存在
            if (manager.getNotificationChannel(CHANNEL_ID) != null) {
                return;
            }
            
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("语音朗读后台播放");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true); // 绕过勿扰模式
            
            manager.createNotificationChannel(channel);
        }
    }
    
    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        stopKeepAlive();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        abandonAudioFocus();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
    }
}
