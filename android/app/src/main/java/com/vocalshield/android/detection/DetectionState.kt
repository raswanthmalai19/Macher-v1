package com.vocalshield.android.detection

/**
 * Comprehensive detection state exposed to UI components.
 * 
 * This data class encapsulates the complete state of the multi-layer detection system,
 * including results from metadata analysis, manipulation detection, and risk fusion.
 * It provides a unified view of the detection pipeline for UI rendering.
 * 
 * @property metadataRisk Result from Layer 1 (Metadata Risk Analysis), null if not yet analyzed
 * @property manipulationRisk Result from Layer 2 (Manipulation Detection), null if unavailable or in metadata-only mode
 * @property fusedRisk Result from Layer 3 (Risk Fusion), null if not yet calculated
 * @property mode Current detection mode (REAL_FULL, REAL_METADATA_ONLY, or DEMO)
 * @property timestamp Unix timestamp (milliseconds) when this state was created
 */
data class DetectionState(
    val metadataRisk: MetadataRiskResult?,
    val manipulationRisk: ManipulationResult?,
    val fusedRisk: FusedRiskResult?,
    val mode: DetectionMode,
    val timestamp: Long = System.currentTimeMillis()
) {
    /**
     * Check if the fused risk level is HIGH.
     * 
     * @return true if fusedRisk exists and riskLevel is HIGH, false otherwise
     */
    fun isHighRisk(): Boolean = fusedRisk?.riskLevel == RiskLevel.HIGH
    
    /**
     * Check if the fused risk level is MEDIUM.
     * 
     * @return true if fusedRisk exists and riskLevel is MEDIUM, false otherwise
     */
    fun isMediumRisk(): Boolean = fusedRisk?.riskLevel == RiskLevel.MEDIUM
    
    /**
     * Check if the fused risk level is LOW.
     * 
     * @return true if fusedRisk exists and riskLevel is LOW, false otherwise
     */
    fun isLowRisk(): Boolean = fusedRisk?.riskLevel == RiskLevel.LOW
}

/**
 * Detection operating mode.
 * 
 * Defines how the detection system operates, affecting which layers are active
 * and how data is sourced.
 */
enum class DetectionMode {
    /**
     * Full real-time detection with all layers active.
     * Requires AWS backend connectivity for manipulation detection.
     */
    REAL_FULL,
    
    /**
     * Fallback mode using only metadata analysis.
     * Used when AWS backend is unavailable or connection fails.
     */
    REAL_METADATA_ONLY,
    
    /**
     * Demo mode using preloaded scenarios.
     * Used for competition demonstrations and testing without live calls.
     */
    DEMO
}

/**
 * Detailed risk breakdown for UI visualization.
 * 
 * Provides a comprehensive decomposition of the risk score, showing how each
 * detection layer contributes to the final assessment. Includes all detected
 * triggers, confidence metrics, and human-readable explanations.
 * 
 * @property totalScore Combined risk score from all layers (0-15 scale)
 * @property riskPercentage Risk score as percentage (0-100%)
 * @property metadataContribution Contribution from metadata analysis layer
 * @property manipulationContribution Contribution from manipulation detection layer
 * @property historicalContribution Contribution from historical risk data
 * @property triggers List of all detected threat patterns
 * @property confidence Overall confidence in the assessment (0.0-1.0)
 * @property primaryThreat Main threat category identified
 * @property explanation Human-readable explanation of the risk assessment
 */
data class RiskBreakdown(
    val totalScore: Float,
    val riskPercentage: Int,
    val metadataContribution: Float,
    val manipulationContribution: Float,
    val historicalContribution: Float,
    val triggers: List<TriggerInfo>,
    val confidence: Float,
    val primaryThreat: String,
    val explanation: String
)

/**
 * Individual trigger information.
 * 
 * Represents a single threat pattern detected by one of the detection layers.
 * Each trigger contributes to the overall risk score and provides specific
 * evidence of potential fraud.
 * 
 * @property category Type of threat pattern detected
 * @property description Human-readable description of the trigger
 * @property score Contribution to risk score from this trigger
 * @property timestamp Unix timestamp (milliseconds) when trigger was detected
 * @property severity Risk level associated with this trigger
 */
data class TriggerInfo(
    val category: TriggerCategory,
    val description: String,
    val score: Int,
    val timestamp: Long,
    val severity: RiskLevel
)

/**
 * Trigger categories for threat classification.
 * 
 * Categorizes detected threat patterns by their source (metadata vs manipulation)
 * and specific type. Used for UI visualization and threat analysis.
 */
enum class TriggerCategory {
    // Metadata-based triggers (Layer 1)
    /**
     * Call from unknown/unrecognized phone number
     */
    METADATA_UNKNOWN_NUMBER,
    
    /**
     * International call from suspicious region
     */
    METADATA_INTERNATIONAL,
    
    /**
     * Call received during unusual hours (midnight-6am)
     */
    METADATA_MIDNIGHT_CALL,
    
    /**
     * Multiple calls from same number in short time
     */
    METADATA_REPEATED_CALLS,
    
    /**
     * High frequency of calls from this number
     */
    METADATA_HIGH_FREQUENCY,
    
    // Manipulation-based triggers (Layer 2)
    /**
     * Urgency pressure tactics detected in conversation
     */
    MANIPULATION_URGENCY,
    
    /**
     * Authority impersonation detected (bank, IRS, police, etc.)
     */
    MANIPULATION_AUTHORITY,
    
    /**
     * Emotional manipulation tactics detected
     */
    MANIPULATION_EMOTIONAL,
    
    /**
     * Financial coercion or payment demands detected
     */
    MANIPULATION_FINANCIAL,
    
    /**
     * Information extraction attempts detected
     */
    MANIPULATION_INFORMATION,
    
    // Historical-based triggers (Layer 3)
    /**
     * Phone number previously identified as scammer
     */
    HISTORICAL_KNOWN_SCAMMER
}

/**
 * Scenario progress tracking for demo mode.
 * 
 * Tracks the playback state of a demo scenario, including current position,
 * timing, and risk level. Used to provide real-time feedback during
 * competition demonstrations.
 * 
 * @property scenarioId Unique identifier of the scenario being played
 * @property scenarioTitle Display name of the scenario
 * @property currentSegment Current conversation segment index (0-based)
 * @property totalSegments Total number of segments in the scenario
 * @property elapsedTime Time elapsed since scenario started (milliseconds)
 * @property currentRiskLevel Current risk level at this point in the scenario
 * @property isPlaying True if scenario is actively playing
 * @property isPaused True if scenario is paused
 */
data class ScenarioProgress(
    val scenarioId: String,
    val scenarioTitle: String,
    val currentSegment: Int,
    val totalSegments: Int,
    val elapsedTime: Long,
    val currentRiskLevel: RiskLevel,
    val isPlaying: Boolean,
    val isPaused: Boolean
) {
    /**
     * Calculate progress as percentage.
     * 
     * @return Progress percentage (0-100) based on current segment position
     */
    fun getProgressPercentage(): Int {
        if (totalSegments == 0) return 0
        return ((currentSegment.toFloat() / totalSegments.toFloat()) * 100).toInt()
    }
}

/**
 * Performance metrics for monitoring detection latency (Task 10.4).
 * 
 * Tracks timing for each stage of the detection pipeline to ensure
 * the system meets the <500ms latency requirement. Used for dashboard
 * display and performance alerts.
 * 
 * @property totalLatency Total time from detection start to UI update (ms)
 * @property metadataLatency Time for metadata analysis (ms)
 * @property manipulationLatency Time for manipulation detection (ms), 0 if skipped
 * @property fusionLatency Time for risk fusion calculation (ms)
 * @property uiUpdateLatency Time for state flow emission and UI update (ms)
 * @property timestamp Unix timestamp when metrics were recorded
 */
data class PerformanceMetrics(
    val totalLatency: Long,
    val metadataLatency: Long,
    val manipulationLatency: Long,
    val fusionLatency: Long,
    val uiUpdateLatency: Long,
    val timestamp: Long = System.currentTimeMillis()
) {
    /**
     * Check if total latency exceeds the 500ms target.
     * 
     * @return true if latency is above target, indicating performance issue
     */
    fun exceedsTarget(): Boolean = totalLatency > 500L
    
    /**
     * Get a human-readable summary of the metrics.
     * 
     * @return Formatted string with all latency values
     */
    fun getSummary(): String {
        return "Total: ${totalLatency}ms (Metadata: ${metadataLatency}ms, " +
               "Manipulation: ${manipulationLatency}ms, Fusion: ${fusionLatency}ms, " +
               "UI: ${uiUpdateLatency}ms)"
    }
}
