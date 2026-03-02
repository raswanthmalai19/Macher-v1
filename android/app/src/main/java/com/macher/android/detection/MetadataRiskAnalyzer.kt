package com.macher.android.detection

import com.macher.android.util.Logger
import java.util.Calendar

/**
 * Layer 1: Metadata-Based Risk Detection
 * 
 * Analyzes call metadata to detect suspicious patterns WITHOUT audio.
 * Runs silently in background. No microphone needed.
 * 
 * Detection Patterns:
 * - Unknown number patterns
 * - Call frequency anomalies
 * - Repeated short calls
 * - International number patterns
 * - Midnight call anomalies
 * - Contact list mismatches
 */
class MetadataRiskAnalyzer {
    
    companion object {
        // Risk score thresholds
        private const val RISK_LOW = 0
        private const val RISK_MEDIUM = 4
        private const val RISK_HIGH = 8
        
        // Scoring weights
        private const val UNKNOWN_NUMBER_SCORE = 2
        private const val INTERNATIONAL_NUMBER_SCORE = 3
        private const val MIDNIGHT_CALL_SCORE = 4
        private const val REPEATED_SHORT_CALL_SCORE = 3
        private const val HIGH_FREQUENCY_SCORE = 2
        private const val NOT_IN_CONTACTS_SCORE = 1
    }
    
    /**
     * Analyze call metadata and return risk score
     */
    fun analyzeMetadata(metadata: CallMetadata): MetadataRiskResult {
        var riskScore = 0
        val triggers = mutableListOf<String>()
        
        // Pattern 1: Unknown number (not in contacts)
        if (!metadata.isInContacts) {
            riskScore += UNKNOWN_NUMBER_SCORE
            triggers.add("Unknown number")
        }
        
        // Pattern 2: International number
        if (isInternationalNumber(metadata.phoneNumber)) {
            riskScore += INTERNATIONAL_NUMBER_SCORE
            triggers.add("International number")
        }
        
        // Pattern 3: Midnight call (11 PM - 6 AM)
        if (isMidnightCall(metadata.callTime)) {
            riskScore += MIDNIGHT_CALL_SCORE
            triggers.add("Unusual time (midnight)")
        }
        
        // Pattern 4: Repeated short calls
        if (metadata.recentCallCount > 2 && metadata.averageCallDuration < 30) {
            riskScore += REPEATED_SHORT_CALL_SCORE
            triggers.add("Repeated short calls")
        }
        
        // Pattern 5: High frequency from same number
        if (metadata.recentCallCount > 5) {
            riskScore += HIGH_FREQUENCY_SCORE
            triggers.add("High call frequency")
        }
        
        // Pattern 6: Not in contacts but calls frequently
        if (!metadata.isInContacts && metadata.recentCallCount > 3) {
            riskScore += NOT_IN_CONTACTS_SCORE
            triggers.add("Persistent unknown caller")
        }
        
        val riskLevel = when {
            riskScore >= RISK_HIGH -> RiskLevel.HIGH
            riskScore >= RISK_MEDIUM -> RiskLevel.MEDIUM
            else -> RiskLevel.LOW
        }
        
        Logger.info("MetadataRiskAnalyzer", "Metadata risk: $riskLevel (score: $riskScore)")
        
        return MetadataRiskResult(
            riskScore = riskScore,
            riskLevel = riskLevel,
            triggers = triggers,
            confidence = calculateConfidence(riskScore, triggers.size)
        )
    }
    
    /**
     * Check if number is international
     */
    private fun isInternationalNumber(phoneNumber: String): Boolean {
        // Remove formatting
        val cleaned = phoneNumber.replace(Regex("[^0-9+]"), "")
        
        // Check for international prefix
        return cleaned.startsWith("+") && !cleaned.startsWith("+1") // Not US/Canada
    }
    
    /**
     * Check if call is during midnight hours (11 PM - 6 AM)
     */
    private fun isMidnightCall(callTime: Long): Boolean {
        val calendar = Calendar.getInstance()
        calendar.timeInMillis = callTime
        val hour = calendar.get(Calendar.HOUR_OF_DAY)
        
        return hour >= 23 || hour < 6
    }
    
    /**
     * Calculate confidence based on number of triggers
     */
    private fun calculateConfidence(score: Int, triggerCount: Int): Float {
        // More triggers = higher confidence
        val baseConfidence = (score.toFloat() / 20f).coerceIn(0f, 1f)
        val triggerBonus = (triggerCount.toFloat() / 10f).coerceIn(0f, 0.3f)
        
        return (baseConfidence + triggerBonus).coerceIn(0f, 1f)
    }
}

/**
 * Call metadata input
 */
data class CallMetadata(
    val phoneNumber: String,
    val callTime: Long = System.currentTimeMillis(),
    val callDuration: Int = 0, // seconds
    val isInContacts: Boolean = false,
    val recentCallCount: Int = 0, // calls from this number in last 24h
    val averageCallDuration: Int = 0 // average duration of recent calls
)

/**
 * Metadata risk analysis result
 */
data class MetadataRiskResult(
    val riskScore: Int,
    val riskLevel: RiskLevel,
    val triggers: List<String>,
    val confidence: Float
)

/**
 * Risk levels
 */
enum class RiskLevel {
    LOW,
    MEDIUM,
    HIGH
}
