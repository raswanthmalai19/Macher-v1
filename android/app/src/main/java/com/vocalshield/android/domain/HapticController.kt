package com.vocalshield.android.domain

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import com.vocalshield.android.repository.ISettingsRepository

/**
 * Haptic feedback controller for threat notifications.
 * 
 * Vibration Patterns:
 * - SAFE: No vibration
 * - CAUTION: Moderate double pulse (200ms on, 100ms off, 200ms on)
 * - DANGER: Urgent rapid pulses (4 pulses: 100ms on, 50ms off)
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
class HapticController(
    private val context: Context,
    private val settingsRepository: ISettingsRepository
) : IHapticController {
    
    companion object {
        private const val TAG = "HapticController"
        
        // Vibration patterns (timings in milliseconds)
        // Pattern format: [delay, vibrate, sleep, vibrate, ...]
        private val CAUTION_PATTERN = longArrayOf(0, 200, 100, 200)
        private val DANGER_PATTERN = longArrayOf(0, 100, 50, 100, 50, 100, 50, 100)
        
        // Amplitudes for Android O+ (0-255, 255 = max)
        private val CAUTION_AMPLITUDES = intArrayOf(0, 180, 0, 180)
        private val DANGER_AMPLITUDES = intArrayOf(0, 255, 0, 255, 0, 255, 0, 255)
    }
    
    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        vibratorManager?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
    
    override fun triggerHaptic(threatLevel: ThreatLevel) {
        // Check if haptic is enabled in settings
        if (!isHapticEnabled()) {
            Log.d(TAG, "Haptic feedback disabled in settings")
            return
        }
        
        // Check if device has vibrator
        if (vibrator == null || !vibrator.hasVibrator()) {
            Log.w(TAG, "Device does not have vibrator capability")
            return
        }
        
        when (threatLevel) {
            ThreatLevel.SAFE -> {
                // No vibration for SAFE
                Log.d(TAG, "SAFE threat level - no vibration")
            }
            ThreatLevel.CAUTION -> {
                vibrateWithPattern(CAUTION_PATTERN, CAUTION_AMPLITUDES)
                Log.i(TAG, "Triggered CAUTION haptic pattern")
            }
            ThreatLevel.DANGER -> {
                vibrateWithPattern(DANGER_PATTERN, DANGER_AMPLITUDES)
                Log.i(TAG, "Triggered DANGER haptic pattern")
            }
        }
    }
    
    override fun isHapticEnabled(): Boolean {
        // This is a synchronous call - in production, consider caching the value
        var enabled = true
        try {
            // Note: Flow collection should be done in a coroutine
            // For now, we'll assume haptic is enabled by default
            // The SettingsRepository should provide a synchronous getter
            enabled = true // TODO: Get from settings synchronously
        } catch (e: Exception) {
            Log.e(TAG, "Error checking haptic enabled state", e)
        }
        return enabled
    }
    
    override fun setHapticEnabled(enabled: Boolean) {
        // Delegate to settings repository
        // This should be called from a coroutine context
        Log.d(TAG, "Haptic enabled set to: $enabled")
    }
    
    /**
     * Vibrate with the given pattern and amplitudes.
     * Uses VibrationEffect API for Android O+ for better control.
     */
    private fun vibrateWithPattern(pattern: LongArray, amplitudes: IntArray) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Use VibrationEffect for Android O+
                val effect = VibrationEffect.createWaveform(pattern, amplitudes, -1)
                vibrator?.vibrate(effect)
            } else {
                // Fallback for older Android versions
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, -1)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error triggering vibration", e)
        }
    }
}
