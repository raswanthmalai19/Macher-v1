package com.macher.android.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.SmsManager
import androidx.core.app.NotificationCompat
import com.macher.android.util.Logger

/**
 * Service for Family Loop alerting system.
 * Sends notifications and SMS to guardians when threats are detected.
 */
class FamilyLoopService(private val context: Context) {
    
    companion object {
        private const val CHANNEL_ID = "macher_alerts"
        private const val CHANNEL_NAME = "MACHER Alerts"
        private const val NOTIFICATION_ID = 1001
    }
    
    init {
        createNotificationChannel()
    }
    
    /**
     * Send alert to guardian
     */
    fun sendAlert(
        threatLevel: ThreatLevel,
        threatType: String,
        confidence: Float,
        guardianPhoneNumber: String? = null
    ) {
        Logger.info("FamilyLoopService", "Sending alert: $threatLevel - $threatType")
        
        // Send local notification
        sendLocalNotification(threatLevel, threatType, confidence)
        
        // Send SMS if phone number provided
        if (!guardianPhoneNumber.isNullOrEmpty()) {
            sendSmsAlert(guardianPhoneNumber, threatLevel, threatType, confidence)
        }
    }
    
    /**
     * Send local notification
     */
    private fun sendLocalNotification(
        threatLevel: ThreatLevel,
        threatType: String,
        confidence: Float
    ) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        
        val title = when (threatLevel) {
            ThreatLevel.DANGER -> "🚨 URGENT: High Threat Detected"
            ThreatLevel.CAUTION -> "⚠️ Warning: Suspicious Activity"
            ThreatLevel.SAFE -> "✅ All Clear"
        }
        
        val message = "$threatType detected with ${(confidence * 100).toInt()}% confidence"
        
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setVibrate(longArrayOf(0, 500, 200, 500))
            .build()
        
        notificationManager.notify(NOTIFICATION_ID, notification)
        
        Logger.info("FamilyLoopService", "Local notification sent")
    }
    
    /**
     * Send SMS alert to guardian
     */
    private fun sendSmsAlert(
        phoneNumber: String,
        threatLevel: ThreatLevel,
        threatType: String,
        confidence: Float
    ) {
        try {
            val message = buildSmsMessage(threatLevel, threatType, confidence)
            
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
            
            smsManager.sendTextMessage(
                phoneNumber,
                null,
                message,
                null,
                null
            )
            
            val phoneHash = Logger.hashPhoneNumber(phoneNumber).take(8)
            Logger.info("FamilyLoopService", "SMS sent to hash=$phoneHash...")
            
        } catch (e: SecurityException) {
            Logger.error("FamilyLoopService", "SMS permission denied", e)
        } catch (e: Exception) {
            Logger.error("FamilyLoopService", "Failed to send SMS", e)
        }
    }
    
    /**
     * Build SMS message content
     */
    private fun buildSmsMessage(
        threatLevel: ThreatLevel,
        threatType: String,
        confidence: Float
    ): String {
        return when (threatLevel) {
            ThreatLevel.DANGER -> {
                "🚨 URGENT: MACHER detected a HIGH THREAT on your loved one's phone. " +
                "Threat: $threatType (${(confidence * 100).toInt()}% confidence). " +
                "Please call them immediately to check if they're safe."
            }
            ThreatLevel.CAUTION -> {
                "⚠️ MACHER detected suspicious activity on your loved one's phone. " +
                "Threat: $threatType (${(confidence * 100).toInt()}% confidence). " +
                "You may want to check in with them."
            }
            ThreatLevel.SAFE -> {
                "✅ MACHER: All clear. No threats detected."
            }
        }
    }
    
    /**
     * Create notification channel (Android 8.0+)
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts for detected scam calls and threats"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500)
            }
            
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
            
            Logger.info("FamilyLoopService", "Notification channel created")
        }
    }
    
    /**
     * Check if SMS permission is granted
     */
    fun hasSmsPermission(): Boolean {
        return android.content.pm.PackageManager.PERMISSION_GRANTED ==
            androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.SEND_SMS
            )
    }
}
