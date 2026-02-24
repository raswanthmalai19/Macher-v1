package com.vocalshield.android.domain

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import android.util.Log
import com.vocalshield.android.R

/**
 * Notification service for fraud alerts.
 * 
 * Priority Levels:
 * - DANGER: High priority, heads-up notification
 * - CAUTION: Default priority
 * - SAFE: No notification
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.3
 */
class NotificationService(
    private val context: Context
) : INotificationService {
    
    companion object {
        private const val TAG = "NotificationService"
        private const val CHANNEL_ID = "fraud_alerts"
        private const val NOTIFICATION_ID = 1001
    }
    
    private val notificationManager: NotificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    
    init {
        createNotificationChannel()
    }
    
    override fun showThreatNotification(threatLevel: ThreatLevel, description: String) {
        if (!isNotificationEnabled()) {
            Log.d(TAG, "Notifications disabled in settings")
            return
        }
        
        when (threatLevel) {
            ThreatLevel.SAFE -> {
                // No notification for SAFE
                Log.d(TAG, "SAFE threat level - no notification")
                return
            }
            ThreatLevel.CAUTION -> {
                showNotification(
                    title = "⚠️ Caution: Potential Scam",
                    description = description,
                    priority = NotificationCompat.PRIORITY_DEFAULT
                )
            }
            ThreatLevel.DANGER -> {
                showNotification(
                    title = "🚨 DANGER: Scam Detected!",
                    description = description,
                    priority = NotificationCompat.PRIORITY_HIGH
                )
            }
        }
    }
    
    override fun dismissNotification() {
        notificationManager.cancel(NOTIFICATION_ID)
        Log.d(TAG, "Notification dismissed")
    }
    
    override fun isNotificationEnabled(): Boolean {
        // Check if notification channel is enabled (Android O+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = notificationManager.getNotificationChannel(CHANNEL_ID)
            if (channel?.importance == NotificationManager.IMPORTANCE_NONE) {
                return false
            }
        }
        
        // Check if notifications are enabled for the app
        return notificationManager.areNotificationsEnabled()
    }
    
    /**
     * Create notification channel for fraud alerts (Android O+).
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Fraud Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Real-time fraud detection alerts"
                enableVibration(true)
                enableLights(true)
            }
            
            notificationManager.createNotificationChannel(channel)
            Log.d(TAG, "Notification channel created")
        }
    }
    
    /**
     * Show a notification with the given parameters.
     */
    private fun showNotification(title: String, description: String, priority: Int) {
        try {
            // Create intent to open app when notification is tapped
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            intent?.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            
            // Build notification
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification) // TODO: Add icon resource
                .setContentTitle(title)
                .setContentText(description)
                .setPriority(priority)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .apply {
                    if (priority == NotificationCompat.PRIORITY_HIGH) {
                        setDefaults(NotificationCompat.DEFAULT_ALL)
                    }
                }
                .build()
            
            notificationManager.notify(NOTIFICATION_ID, notification)
            Log.i(TAG, "Notification shown: $title")
        } catch (e: Exception) {
            Log.e(TAG, "Error showing notification", e)
        }
    }
}
