package com.pantrysync.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);

            // Default channel — must match channel_id in FCM payload
            NotificationChannel defaultChannel = new NotificationChannel(
                "default",
                "General",
                NotificationManager.IMPORTANCE_HIGH
            );
            defaultChannel.setDescription("General notifications");
            defaultChannel.enableVibration(true);
            manager.createNotificationChannel(defaultChannel);

            // Mentions channel for chat mentions
            NotificationChannel mentionsChannel = new NotificationChannel(
                "mentions",
                "Mentions",
                NotificationManager.IMPORTANCE_HIGH
            );
            mentionsChannel.setDescription("Chat mention notifications");
            mentionsChannel.enableVibration(true);
            manager.createNotificationChannel(mentionsChannel);
        }
    }
}
