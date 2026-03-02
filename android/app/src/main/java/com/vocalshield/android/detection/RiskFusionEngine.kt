package com.vocalshield.android.detection

import com.vocalshield.android.util.Logger

/**
 * Layer 3: Risk Fusion Engine
 * 
 * Combines multiple risk signals into unified threat assessment:
 * - Metadata risk (call patterns, timing, frequency)
 * - Manipulation risk (conversational patterns)
 * - Historical risk (past behavior)
 * 
 * Produces final risk score with confidence level.
 */
class RiskFusionEngine {
    
    companion object {
        // Fusion weights
        private const val METADATA_WEIGHT = 0.3f
        private const val MANIPULATION_WEIGHT = 0.6f
        private const val HISTORICAL_WEIGHT = 0.1f
        
        // Risk thresholds
        private const val SAFE_THRESHOLD = 3f
        private const val CAUTION_THRESHOLD = 7f
    }
    
    /**
     * Fuse multiple risk signals into final assessment
     */
    fun fuseRiskSignals(
        metadataRisk: MetadataRiskResult?,
        manipulationRisk: ManipulationResult?,
        historicalRisk: HistoricalRiskData? = null
    ): FusedRiskResult {
        
        // Calculate weighted scores
        val metadataScore = (metadataRisk?.riskScore ?: 0).toFloat() * METADATA_WEIGHT
        val manipulationScore = (manipulationRisk?.riskScore ?: 0).toFloat() * MANIPULATION_WEIGHT
        val historicalScore = (historicalRisk?.riskScore ?: 0).toFloat() * HISTORICAL_WEIGHT
        
        val totalScore = metadataScore + manipulationScore + historicalScore
        
        // Determine final risk level
        val finalRiskLevel = when {
            totalScore >= CAUTION_THRESHOLD -> RiskLevel.HIGH
            totalScore >= SAFE_THRESHOLD -> RiskLevel.MEDIUM
            else -> RiskLevel.LOW
        }
        
        // Calculate confidence (average of component confidences)
        val confidences = listOfNotNull(
            metadataRisk?.confidence,
            manipulationRisk?.confidence,
            historicalRisk?.confidence
        )
        val averageConfidence = if (confidences.isNotEmpty()) {
            confidences.average().toFloat()
        } else {
            0f
        }
        
        // Collect all triggers
        val allTriggers = mutableListOf<String>()
        metadataRisk?.triggers?.let { allTriggers.addAll(it) }
        manipulationRisk?.patterns?.map { it.description }?.let { allTriggers.addAll(it) }
        
        // Generate explanation
        val explanation = generateExplanation(
            metadataRisk,
            manipulationRisk,
            finalRiskLevel,
            totalScore
        )
        
        Logger.info("RiskFusionEngine", "Fused risk: $finalRiskLevel (score: $totalScore, confidence: $averageConfidence)")
        
        return FusedRiskResult(
            riskScore = totalScore,
            riskLevel = finalRiskLevel,
            confidence = averageConfidence,
            triggers = allTriggers,
            explanation = explanation,
            metadataContribution = metadataScore,
            manipulationContribution = manipulationScore,
            historicalContribution = historicalScore
        )
    }
    
    /**
     * Generate human-readable explanation
     */
    private fun generateExplanation(
        metadataRisk: MetadataRiskResult?,
        manipulationRisk: ManipulationResult?,
        riskLevel: RiskLevel,
        score: Float
    ): String {
        val parts = mutableListOf<String>()
        
        when (riskLevel) {
            RiskLevel.HIGH -> {
                parts.add("⚠️ HIGH RISK DETECTED")
                
                if (manipulationRisk != null && manipulationRisk.riskLevel == RiskLevel.HIGH) {
                    parts.add("Strong manipulation patterns detected: ${manipulationRisk.summary}")
                }
                
                if (metadataRisk != null && metadataRisk.riskLevel != RiskLevel.LOW) {
                    parts.add("Suspicious call metadata: ${metadataRisk.triggers.joinToString(", ")}")
                }
                
                parts.add("Recommendation: End call immediately and verify through official channels")
            }
            
            RiskLevel.MEDIUM -> {
                parts.add("⚠️ CAUTION ADVISED")
                
                if (manipulationRisk != null && manipulationRisk.patterns.isNotEmpty()) {
                    parts.add("Potential manipulation detected: ${manipulationRisk.summary}")
                }
                
                if (metadataRisk != null && metadataRisk.triggers.isNotEmpty()) {
                    parts.add("Unusual call patterns: ${metadataRisk.triggers.take(2).joinToString(", ")}")
                }
                
                parts.add("Recommendation: Be cautious, verify caller identity")
            }
            
            RiskLevel.LOW -> {
                parts.add("✅ Low Risk")
                parts.add("No significant threat indicators detected")
            }
        }
        
        return parts.joinToString("\n")
    }
    
    /**
     * Update historical risk data based on call outcome
     */
    fun updateHistoricalRisk(
        phoneNumber: String,
        wasScam: Boolean,
        riskScore: Float
    ): HistoricalRiskData {
        // In production, this would update a database
        // For now, return updated data structure
        
        return HistoricalRiskData(
            phoneNumber = phoneNumber,
            totalCalls = 1,
            scamCalls = if (wasScam) 1 else 0,
            averageRiskScore = riskScore,
            lastCallTime = System.currentTimeMillis(),
            riskScore = if (wasScam) 10 else 0,
            confidence = 0.8f
        )
    }
}

/**
 * Historical risk data for a phone number
 */
data class HistoricalRiskData(
    val phoneNumber: String,
    val totalCalls: Int,
    val scamCalls: Int,
    val averageRiskScore: Float,
    val lastCallTime: Long,
    val riskScore: Int,
    val confidence: Float
)

/**
 * Fused risk assessment result
 */
data class FusedRiskResult(
    val riskScore: Float,
    val riskLevel: RiskLevel,
    val confidence: Float,
    val triggers: List<String>,
    val explanation: String,
    val metadataContribution: Float,
    val manipulationContribution: Float,
    val historicalContribution: Float
) {
    /**
     * Get risk percentage (0-100)
     */
    fun getRiskPercentage(): Int {
        return ((riskScore / 15f) * 100f).toInt().coerceIn(0, 100)
    }
    
    /**
     * Get primary threat category
     */
    fun getPrimaryThreat(): String {
        return when {
            manipulationContribution > metadataContribution -> "Conversational Manipulation"
            metadataContribution > 0 -> "Suspicious Call Pattern"
            else -> "Unknown"
        }
    }
}
