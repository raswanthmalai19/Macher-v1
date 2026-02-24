package com.vocalshield.android.domain

/**
 * Interface for notification service.
 * Displays system notifications for fraud alerts.
 */
interface INotificationService {
    /**
     * Show a threat notification.
     * @param threatLevel The threat level
     * @param description Brief description of the threat
     */
    fun showThreatNotification(threatLevel: ThreatLevel, description: String)
    
    /**
     * Dismiss the current notification.
     */
    fun dismissNotification()
    
    /**
     * Check if notifications are enabled.
     * @return true if enabled, false otherwise
     */
    fun isNotificationEnabled(): Boolean
}
