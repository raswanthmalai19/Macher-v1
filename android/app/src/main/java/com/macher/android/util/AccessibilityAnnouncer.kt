package com.macher.android.util

import android.content.Context
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView

/**
 * Accessibility announcer for TalkBack screen reader support.
 * 
 * Provides voice announcements for critical events like threat level changes,
 * ensuring hearing-impaired and visually-impaired users can use MACHER.
 * 
 * Task 12.2: Implement TalkBack announcements for threat changes
 * Requirement 18.4: Announce risk level changes via TalkBack
 * 
 * @param context Android context for accessing accessibility services
 */
class AccessibilityAnnouncer(private val context: Context) {
    
    private val accessibilityManager: AccessibilityManager? =
        context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
    
    /**
     * Check if TalkBack or other screen readers are enabled.
     * 
     * @return true if accessibility services are enabled
     */
    fun isAccessibilityEnabled(): Boolean {
        return accessibilityManager?.isEnabled == true &&
                accessibilityManager?.isTouchExplorationEnabled == true
    }
    
    /**
     * Announce a message to TalkBack screen reader.
     * 
     * Uses AccessibilityEvent.TYPE_ANNOUNCEMENT for immediate announcements
     * that interrupt current speech. Use for critical alerts only.
     * 
     * @param message The message to announce
     * @param priority Priority level (true for interrupting announcements)
     */
    fun announce(message: String, priority: Boolean = false) {
        if (!isAccessibilityEnabled()) {
            Logger.debug("AccessibilityAnnouncer", "TalkBack not enabled, skipping announcement")
            return
        }
        
        try {
            val event = AccessibilityEvent.obtain(AccessibilityEvent.TYPE_ANNOUNCEMENT)
            event.text.add(message)
            
            // For high priority announcements, we want to interrupt
            if (priority) {
                event.contentDescription = message
            }
            
            accessibilityManager?.sendAccessibilityEvent(event)
            
            Logger.info("AccessibilityAnnouncer", "Announced: $message")
        } catch (e: Exception) {
            Logger.warn("AccessibilityAnnouncer", "Failed to announce: ${e.message}")
        }
    }
    
    /**
     * Announce threat level change with appropriate urgency.
     * 
     * Formats the announcement based on threat level:
     * - HIGH: "High risk detected! Potential scam call."
     * - MEDIUM: "Medium caution. Suspicious activity detected."
     * - LOW: "Safe. No threats detected."
     * 
     * @param threatLevel The current threat level
     */
    fun announceThreatLevel(threatLevel: String) {
        val message = when (threatLevel.uppercase()) {
            "HIGH", "DANGER" -> "High risk detected! Potential scam call."
            "MEDIUM", "CAUTION" -> "Medium caution. Suspicious activity detected."
            "LOW", "SAFE" -> "Safe. No threats detected."
            else -> "Threat level: $threatLevel"
        }
        
        // High risk announcements are high priority (interrupt current speech)
        val priority = threatLevel.uppercase() in listOf("HIGH", "DANGER")
        
        announce(message, priority)
    }
    
    /**
     * Announce detection mode change.
     * 
     * Informs users when the protection level changes due to AWS availability.
     * 
     * @param mode The current detection mode
     */
    fun announceDetectionMode(mode: String) {
        val message = when (mode.uppercase()) {
            "REAL_FULL" -> "Full protection active. All detection layers operational."
            "REAL_METADATA_ONLY" -> "Limited protection. Using call pattern analysis only."
            "DEMO" -> "Demo mode active."
            else -> "Detection mode: $mode"
        }
        
        announce(message, priority = false)
    }
    
    /**
     * Announce scenario progress for demo mode.
     * 
     * @param scenarioTitle The scenario name
     * @param percentage Progress percentage
     */
    fun announceScenarioProgress(scenarioTitle: String, percentage: Int) {
        val message = "$scenarioTitle scenario: $percentage percent complete"
        announce(message, priority = false)
    }
}

/**
 * Composable effect for announcing threat level changes.
 * 
 * Automatically announces when the threat level changes, ensuring
 * users with screen readers are immediately notified of threats.
 * 
 * Usage:
 * ```
 * val threatLevel by monitoringManager.threatLevel.collectAsState()
 * AnnounceThreatLevel(threatLevel)
 * ```
 * 
 * @param threatLevel Current threat level to announce
 */
@Composable
fun AnnounceThreatLevel(threatLevel: String?) {
    val context = LocalContext.current
    val announcer = remember { AccessibilityAnnouncer(context) }
    
    LaunchedEffect(threatLevel) {
        if (threatLevel != null && announcer.isAccessibilityEnabled()) {
            announcer.announceThreatLevel(threatLevel)
        }
    }
}

/**
 * Composable effect for announcing detection mode changes.
 * 
 * Automatically announces when the detection mode changes, informing
 * users about their current level of protection.
 * 
 * Usage:
 * ```
 * val detectionMode by monitoringManager.detectionMode.collectAsState()
 * AnnounceDetectionMode(detectionMode)
 * ```
 * 
 * @param detectionMode Current detection mode to announce
 */
@Composable
fun AnnounceDetectionMode(detectionMode: String?) {
    val context = LocalContext.current
    val announcer = remember { AccessibilityAnnouncer(context) }
    
    LaunchedEffect(detectionMode) {
        if (detectionMode != null && announcer.isAccessibilityEnabled()) {
            announcer.announceDetectionMode(detectionMode)
        }
    }
}

/**
 * Composable effect for announcing custom messages.
 * 
 * Generic announcement composable for any accessibility message.
 * 
 * @param message Message to announce
 * @param priority Whether this is a high-priority interrupting announcement
 */
@Composable
fun AnnounceMessage(message: String?, priority: Boolean = false) {
    val context = LocalContext.current
    val announcer = remember { AccessibilityAnnouncer(context) }
    
    LaunchedEffect(message) {
        if (message != null && announcer.isAccessibilityEnabled()) {
            announcer.announce(message, priority)
        }
    }
}
