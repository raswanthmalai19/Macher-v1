package com.macher.android.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.macher.android.util.Logger

/**
 * Foreground Service that keeps the process alive during phone calls.
 *
 * Android kills audio recording from background apps. When a phone call starts,
 * the dialer takes the foreground and MACHER goes to background. This service
 * ensures the audio capture and WebSocket streaming continue uninterrupted.
 *
 * Lifecycle:
 *   MonitoringManager.startRealMonitoring() → startService()
 *   MonitoringManager.stopCallMonitoring()  → stopService()
 */
class CallMonitorForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "macher_call_monitor"
        private const val NOTIFICATION_ID = 1001
        const val ACTION_START = "com.macher.android.START_MONITORING"
        const val ACTION_STOP = "com.macher.android.STOP_MONITORING"

        fun start(context: Context) {
            val intent = Intent(context, CallMonitorForegroundService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, CallMonitorForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                Logger.info("ForegroundService", "Stopping call monitor service")
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                Logger.info("ForegroundService", "Starting call monitor foreground service")
                val notification = buildNotification()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    )
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Call Monitoring",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Active while monitoring a phone call for scam detection"
                setShowBadge(false)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        // Tapping the notification opens the app
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MACHER — Call Protection Active")
            .setContentText("Monitoring call for scam detection…")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }
}
