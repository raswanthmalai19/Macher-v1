package com.vocalshield.android.service

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.vocalshield.android.util.Config
import com.vocalshield.android.util.Logger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Progressive Intervention Engine
 * 
 * Implements 3-level escalation system:
 * - Level 1 (Suspicion): Haptic pulse (3 sharp buzzes)
 * - Level 2 (High Threat): Screen overlay warning
 * - Level 3 (Critical): Autonomous call disconnect
 */
class InterventionEngine(private val context: Context) {
    
    private val _currentLevel = MutableStateFlow(InterventionLevel.NONE)
    val currentLevel: StateFlow<InterventionLevel> = _currentLevel
    
    private val _overlayVisible = MutableStateFlow(false)
    val overlayVisible: StateFlow<Boolean> = _overlayVisible
    
    /**
     * Trigger intervention based on threat level
     */
    fun triggerIntervention(threatLevel: ThreatLevel, confidence: Float) {
        Logger.info("InterventionEngine", "Triggering intervention: $threatLevel (confidence: $confidence)")
        
        when (threatLevel) {
            ThreatLevel.SAFE -> {
                // No intervention needed
                _currentLevel.value = InterventionLevel.NONE
                dismissOverlay()
            }
            
            ThreatLevel.CAUTION -> {
                // Level 1: Haptic pulse
                if (Config.Features.ENABLE_HAPTIC_FEEDBACK) {
                    triggerLevel1Haptic()
                }
                _currentLevel.value = InterventionLevel.LEVEL_1_HAPTIC
            }
            
            ThreatLevel.DANGER -> {
                if (confidence >= 0.8f) {
                    // Level 3: Autonomous disconnect (high confidence)
                    triggerLevel3Disconnect()
                } else {
                    // Level 2: Screen overlay (medium confidence)
                    triggerLevel2Overlay()
                }
            }
        }
    }
    
    /**
     * Level 1: Haptic Pulse
     * Three sharp buzzes to break psychological trance
     */
    private fun triggerLevel1Haptic() {
        Logger.info("InterventionEngine", "Level 1: Haptic pulse")
        
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) 
                    as VibratorManager
                vibratorManager.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            
            // Three sharp buzzes: 200ms on, 100ms off, 200ms on, 100ms off, 200ms on
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val timings = longArrayOf(0, 200, 100, 200, 100, 200)
                val amplitudes = intArrayOf(0, 255, 0, 255, 0, 255)
                val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
                vibrator.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(longArrayOf(0, 200, 100, 200, 100, 200), -1)
            }
            
            Logger.info("InterventionEngine", "Haptic pulse triggered successfully")
        } catch (e: Exception) {
            Logger.error("InterventionEngine", "Failed to trigger haptic pulse", e)
        }
    }
    
    /**
     * Level 2: Screen Overlay
     * Display warning overlay over phone dialer
     */
    private fun triggerLevel2Overlay() {
        Logger.info("InterventionEngine", "Level 2: Screen overlay")
        
        _currentLevel.value = InterventionLevel.LEVEL_2_OVERLAY
        _overlayVisible.value = true
        
        // Trigger haptic as well
        if (Config.Features.ENABLE_HAPTIC_FEEDBACK) {
            triggerLevel1Haptic()
        }
    }
    
    /**
     * Level 3: Autonomous Disconnect
     * Programmatically hang up the call
     */
    private fun triggerLevel3Disconnect() {
        Logger.info("InterventionEngine", "Level 3: Autonomous disconnect")
        
        _currentLevel.value = InterventionLevel.LEVEL_3_DISCONNECT
        
        // Show overlay first
        _overlayVisible.value = true
        
        // Trigger haptic
        if (Config.Features.ENABLE_HAPTIC_FEEDBACK) {
            triggerLevel1Haptic()
        }
        
        // TODO: Check if user has granted "Protector" permission
        // TODO: Use Telecom API to disconnect call
        // For now, just log
        Logger.warn("InterventionEngine", "Autonomous disconnect requested but not yet implemented")
    }
    
    /**
     * Dismiss the overlay (user pressed "Safe Word" override)
     */
    fun dismissOverlay() {
        Logger.info("InterventionEngine", "Dismissing overlay")
        _overlayVisible.value = false
        _currentLevel.value = InterventionLevel.NONE
    }
    
    /**
     * Reset intervention state
     */
    fun reset() {
        _currentLevel.value = InterventionLevel.NONE
        _overlayVisible.value = false
    }
}

/**
 * Intervention levels
 */
enum class InterventionLevel {
    NONE,
    LEVEL_1_HAPTIC,
    LEVEL_2_OVERLAY,
    LEVEL_3_DISCONNECT
}
