package com.macher.android.service

import android.content.Context
import com.macher.android.detection.DetectionMode
import com.macher.android.network.RealWebSocketClient
import com.macher.android.util.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

/**
 * Manages graceful degradation when AWS services become unavailable.
 * 
 * FallbackManager monitors AWS backend availability and automatically switches
 * between full detection mode (with AWS) and metadata-only mode (without AWS).
 * This ensures MACHER continues protecting users even when cloud services
 * are unavailable.
 * 
 * Key Features:
 * - Periodic health checks every 30 seconds
 * - Automatic mode switching based on AWS availability
 * - User notifications on mode changes
 * - 5-second timeout for availability checks
 * - Automatic recovery when AWS becomes available
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 14.1, 16.1, 16.2
 * 
 * @property context Android context for notifications
 * @property webSocketClient WebSocket client for testing AWS connectivity
 */
class FallbackManager(
    private val context: Context,
    private val webSocketClient: RealWebSocketClient
) {
    private val _currentMode = MutableStateFlow(DetectionMode.REAL_FULL)
    val currentMode: StateFlow<DetectionMode> = _currentMode
    
    private val _awsAvailable = MutableStateFlow(true)
    val awsAvailable: StateFlow<Boolean> = _awsAvailable
    
    private var healthCheckJob: Job? = null
    
    /**
     * Check AWS backend availability.
     * 
     * Attempts to test the WebSocket connection with a 5-second timeout.
     * Updates the awsAvailable state flow based on the result.
     * 
     * This method is suspend and should be called from a coroutine context.
     * It will not block the calling thread beyond the 5-second timeout.
     * 
     * @return true if AWS backend is available, false otherwise
     * 
     * Requirements: 5.1, 5.5, 6.1
     */
    suspend fun checkAWSAvailability(): Boolean {
        return try {
            // Attempt WebSocket connection with 5-second timeout
            withTimeout(5000L) {
                val testConnection = webSocketClient.testConnection()
                _awsAvailable.value = testConnection
                
                Logger.info(
                    "FallbackManager",
                    "AWS availability check: ${if (testConnection) "available" else "unavailable"}"
                )
                
                testConnection
            }
        } catch (e: Exception) {
            Logger.warn("FallbackManager", "AWS availability check failed: ${e.message}")
            _awsAvailable.value = false
            false
        }
    }
    
    /**
     * Switch to metadata-only detection mode.
     * 
     * Called automatically when AWS backend becomes unavailable. Updates the
     * current mode to REAL_METADATA_ONLY and shows a user notification explaining
     * the degraded service level.
     * 
     * In metadata-only mode, MACHER continues to analyze call patterns using
     * MetadataRiskAnalyzer without AWS dependencies (Layer 1 only).
     * 
     * Requirements: 5.1, 5.2, 5.4, 6.2, 6.3, 6.4
     */
    fun switchToMetadataOnly() {
        Logger.info("FallbackManager", "Switching to metadata-only mode")
        _currentMode.value = DetectionMode.REAL_METADATA_ONLY
        
        // Show user notification
        showFallbackNotification()
    }
    
    /**
     * Switch back to full detection mode.
     * 
     * Called automatically when AWS backend becomes available again. Updates the
     * current mode to REAL_FULL and shows a user notification confirming the
     * restoration of full protection.
     * 
     * In full mode, MACHER uses all three detection layers including
     * AWS-powered manipulation detection.
     * 
     * Requirements: 5.3, 6.2, 6.3, 6.4
     */
    fun switchToFullDetection() {
        Logger.info("FallbackManager", "Switching to full detection mode")
        _currentMode.value = DetectionMode.REAL_FULL
        
        // Show user notification
        showFullModeNotification()
    }
    
    /**
     * Start periodic health checks.
     * 
     * Launches a coroutine that checks AWS availability every 30 seconds and
     * automatically switches modes based on state transitions:
     * - If AWS becomes unavailable while in REAL_FULL mode, switch to REAL_METADATA_ONLY
     * - If AWS becomes available while in REAL_METADATA_ONLY mode, switch to REAL_FULL
     * - DEMO mode is never affected by AWS availability
     * 
     * Health checks run on Dispatchers.IO to avoid blocking the main thread.
     * 
     * Requirements: 5.5, 6.1
     */
    fun startHealthChecks() {
        // Cancel any existing health check job
        healthCheckJob?.cancel()
        
        Logger.info("FallbackManager", "Starting periodic health checks (30s interval)")
        
        healthCheckJob = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                delay(30000L) // Check every 30 seconds
                
                // Skip health checks in demo mode
                if (_currentMode.value == DetectionMode.DEMO) {
                    continue
                }
                
                val available = checkAWSAvailability()
                
                // Auto-switch modes based on availability
                if (!available && _currentMode.value == DetectionMode.REAL_FULL) {
                    switchToMetadataOnly()
                } else if (available && _currentMode.value == DetectionMode.REAL_METADATA_ONLY) {
                    switchToFullDetection()
                }
            }
        }
    }
    
    /**
     * Stop health checks.
     * 
     * Cancels the periodic health check coroutine. Should be called when
     * monitoring stops to free resources.
     * 
     * Requirements: 5.5
     */
    fun stopHealthChecks() {
        Logger.info("FallbackManager", "Stopping health checks")
        healthCheckJob?.cancel()
        healthCheckJob = null
    }
    
    /**
     * Show fallback mode notification to user.
     * 
     * Displays an in-app notification explaining that AWS backend is unavailable
     * and the system has switched to metadata-only detection mode.
     * 
     * Requirements: 5.4, 6.2, 6.3, 6.4
     */
    private fun showFallbackNotification() {
        val notification = "⚠️ AWS backend unavailable. Using metadata-only detection."
        Logger.info("FallbackManager", "Notification: $notification")
        
        // TODO: Trigger UI notification through MonitoringManager
        // This will be implemented when UI notification system is added
    }
    
    /**
     * Show full mode restoration notification to user.
     * 
     * Displays an in-app notification confirming that AWS backend has reconnected
     * and full detection mode has been restored.
     * 
     * Requirements: 5.4, 6.2, 6.3, 6.4
     */
    private fun showFullModeNotification() {
        val notification = "✅ AWS backend reconnected. Full detection restored."
        Logger.info("FallbackManager", "Notification: $notification")
        
        // TODO: Trigger UI notification through MonitoringManager
        // This will be implemented when UI notification system is added
    }
}
