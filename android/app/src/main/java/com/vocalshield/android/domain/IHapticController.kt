package com.vocalshield.android.domain

/**
 * Interface for haptic feedback controller.
 * Provides distinct vibration patterns for different threat levels.
 */
interface IHapticController {
    /**
     * Trigger haptic feedback based on threat level.
     * @param threatLevel The threat level to trigger feedback for
     */
    fun triggerHaptic(threatLevel: ThreatLevel)
    
    /**
     * Check if haptic feedback is enabled.
     * @return true if enabled, false otherwise
     */
    fun isHapticEnabled(): Boolean
    
    /**
     * Enable or disable haptic feedback.
     * @param enabled true to enable, false to disable
     */
    fun setHapticEnabled(enabled: Boolean)
}
