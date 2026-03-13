package com.macher.android.detection

import com.macher.android.util.Logger

/**
 * Layer 2: Conversational Manipulation Detection
 * 
 * Detects psychological manipulation patterns in conversation.
 * Goes beyond keyword detection to identify behavioral fraud signals.
 * 
 * Detection Categories:
 * 1. Urgency Pressure - "Do it immediately", "Last chance", "Account will be blocked"
 * 2. Authority Impersonation - "I am from RBI", "This is police department"
 * 3. Emotional Manipulation - "Your son is in danger", "Card compromised"
 * 4. Financial Coercion - "Transfer money now", "Share OTP", "Verify account"
 * 5. Information Extraction - "Confirm your details", "What's your password"
 */
class ManipulationDetector {
    
    companion object {
        // Scoring weights
        private const val URGENCY_SCORE = 2
        private const val AUTHORITY_SCORE = 3
        private const val EMOTIONAL_SCORE = 5
        private const val FINANCIAL_SCORE = 4
        private const val INFORMATION_SCORE = 3
        
        // Pattern definitions
        private val URGENCY_PATTERNS = listOf(
            "immediately", "right now", "urgent", "last chance", "expire",
            "within minutes", "act fast", "limited time", "hurry",
            "account will be blocked", "suspended", "locked out",
            "before it's too late", "deadline", "time sensitive"
        )
        
        private val AUTHORITY_PATTERNS = listOf(
            "rbi", "reserve bank", "police", "government", "tax department",
            "income tax", "customs", "enforcement", "legal action",
            "court", "warrant", "arrest", "investigation", "officer",
            "official", "authorized", "federal", "ministry"
        )
        
        private val EMOTIONAL_PATTERNS = listOf(
            "danger", "emergency", "accident", "hospital", "injured",
            "arrested", "trouble", "problem", "compromised", "hacked",
            "fraud", "suspicious activity", "unauthorized", "breach",
            "your son", "your daughter", "family member", "loved one"
        )
        
        private val FINANCIAL_PATTERNS = listOf(
            "transfer money", "send payment", "otp", "one time password",
            "cvv", "card number", "pin", "password", "account number",
            "verify payment", "refund", "cashback", "prize money",
            "lottery", "won", "claim", "deposit", "withdraw"
        )
        
        private val INFORMATION_PATTERNS = listOf(
            "confirm your", "verify your", "share your", "provide your",
            "what is your", "tell me your", "need your", "update your",
            "personal details", "bank details", "card details",
            "social security", "aadhar", "pan card", "date of birth"
        )
    }
    
    /**
     * Analyze conversation text for manipulation patterns
     */
    fun analyzeConversation(text: String): ManipulationResult {
        val lowerText = text.lowercase()
        var totalScore = 0
        val detectedPatterns = mutableListOf<ManipulationPattern>()
        
        // Check urgency patterns — cap score per category to prevent inflation
        val urgencyMatches = URGENCY_PATTERNS.filter { lowerText.contains(it) }
        if (urgencyMatches.isNotEmpty()) {
            val categoryScore = URGENCY_SCORE * urgencyMatches.size.coerceAtMost(3)
            totalScore += categoryScore
            detectedPatterns.add(
                ManipulationPattern(
                    category = ManipulationCategory.URGENCY,
                    matches = urgencyMatches,
                    score = categoryScore,
                    description = "Urgency pressure detected"
                )
            )
        }
        
        // Check authority patterns
        val authorityMatches = AUTHORITY_PATTERNS.filter { lowerText.contains(it) }
        if (authorityMatches.isNotEmpty()) {
            val categoryScore = AUTHORITY_SCORE * authorityMatches.size.coerceAtMost(3)
            totalScore += categoryScore
            detectedPatterns.add(
                ManipulationPattern(
                    category = ManipulationCategory.AUTHORITY,
                    matches = authorityMatches,
                    score = categoryScore,
                    description = "Authority impersonation detected"
                )
            )
        }
        
        // Check emotional patterns
        val emotionalMatches = EMOTIONAL_PATTERNS.filter { lowerText.contains(it) }
        if (emotionalMatches.isNotEmpty()) {
            val categoryScore = EMOTIONAL_SCORE * emotionalMatches.size.coerceAtMost(3)
            totalScore += categoryScore
            detectedPatterns.add(
                ManipulationPattern(
                    category = ManipulationCategory.EMOTIONAL,
                    matches = emotionalMatches,
                    score = categoryScore,
                    description = "Emotional manipulation detected"
                )
            )
        }
        
        // Check financial patterns
        val financialMatches = FINANCIAL_PATTERNS.filter { lowerText.contains(it) }
        if (financialMatches.isNotEmpty()) {
            val categoryScore = FINANCIAL_SCORE * financialMatches.size.coerceAtMost(3)
            totalScore += categoryScore
            detectedPatterns.add(
                ManipulationPattern(
                    category = ManipulationCategory.FINANCIAL,
                    matches = financialMatches,
                    score = categoryScore,
                    description = "Financial coercion detected"
                )
            )
        }
        
        // Check information extraction patterns
        val infoMatches = INFORMATION_PATTERNS.filter { lowerText.contains(it) }
        if (infoMatches.isNotEmpty()) {
            val categoryScore = INFORMATION_SCORE * infoMatches.size.coerceAtMost(3)
            totalScore += categoryScore
            detectedPatterns.add(
                ManipulationPattern(
                    category = ManipulationCategory.INFORMATION,
                    matches = infoMatches,
                    score = categoryScore,
                    description = "Information extraction attempt"
                )
            )
        }
        
        val riskLevel = when {
            totalScore >= 8 -> RiskLevel.HIGH
            totalScore >= 4 -> RiskLevel.MEDIUM
            else -> RiskLevel.LOW
        }
        
        val confidence = calculateConfidence(totalScore, detectedPatterns.size)
        
        Logger.info("ManipulationDetector", "Manipulation risk: $riskLevel (score: $totalScore, patterns: ${detectedPatterns.size})")
        
        return ManipulationResult(
            riskScore = totalScore,
            riskLevel = riskLevel,
            patterns = detectedPatterns,
            confidence = confidence,
            summary = generateSummary(detectedPatterns)
        )
    }
    
    /**
     * Calculate confidence based on score and pattern diversity
     */
    private fun calculateConfidence(score: Int, patternCount: Int): Float {
        // Higher score and more diverse patterns = higher confidence
        val scoreConfidence = (score.toFloat() / 20f).coerceIn(0f, 0.7f)
        val diversityBonus = (patternCount.toFloat() / 5f).coerceIn(0f, 0.3f)
        
        return (scoreConfidence + diversityBonus).coerceIn(0f, 1f)
    }
    
    /**
     * Generate human-readable summary
     */
    private fun generateSummary(patterns: List<ManipulationPattern>): String {
        if (patterns.isEmpty()) return "No manipulation patterns detected"
        
        val categories = patterns.map { it.category.displayName }
        return "Detected: ${categories.joinToString(", ")}"
    }
}

/**
 * Manipulation pattern detected
 */
data class ManipulationPattern(
    val category: ManipulationCategory,
    val matches: List<String>,
    val score: Int,
    val description: String
)

/**
 * Manipulation categories
 */
enum class ManipulationCategory(val displayName: String) {
    URGENCY("Urgency Pressure"),
    AUTHORITY("Authority Impersonation"),
    EMOTIONAL("Emotional Manipulation"),
    FINANCIAL("Financial Coercion"),
    INFORMATION("Information Extraction")
}

/**
 * Manipulation analysis result
 */
data class ManipulationResult(
    val riskScore: Int,
    val riskLevel: RiskLevel,
    val patterns: List<ManipulationPattern>,
    val confidence: Float,
    val summary: String
)
