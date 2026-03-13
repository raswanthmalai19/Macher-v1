package com.macher.android.data.database

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Combined data class for UI display
 * 
 * Joins call record with its risk assessment and triggers for
 * comprehensive display in call history and detail screens.
 * 
 * Note: Room @Relation annotations were removed because the actual
 * data loading is done manually via getCallHistory() queries —
 * the relations are assembled in code, not via Room's automatic join.
 */
data class CallRecordWithRisk(
    val call: CallRecordEntity,
    val risk: RiskAssessmentEntity?,
    val triggers: List<RiskTriggerEntity> = emptyList()
) {
    /**
     * Format timestamp as human-readable date/time
     * Example: "Feb 16, 2026 10:30 AM"
     */
    fun getFormattedTimestamp(): String {
        val date = Date(call.timestamp)
        val format = SimpleDateFormat("MMM dd, yyyy hh:mm a", Locale.getDefault())
        return format.format(date)
    }
    
    /**
     * Format timestamp as relative time
     * Examples: "2 minutes ago", "1 hour ago", "Yesterday", "Feb 15"
     */
    fun getRelativeTimestamp(): String {
        val now = System.currentTimeMillis()
        val diff = now - call.timestamp
        
        return when {
            diff < TimeUnit.MINUTES.toMillis(1) -> "Just now"
            diff < TimeUnit.HOURS.toMillis(1) -> {
                val minutes = TimeUnit.MILLISECONDS.toMinutes(diff)
                "$minutes ${if (minutes == 1L) "minute" else "minutes"} ago"
            }
            diff < TimeUnit.DAYS.toMillis(1) -> {
                val hours = TimeUnit.MILLISECONDS.toHours(diff)
                "$hours ${if (hours == 1L) "hour" else "hours"} ago"
            }
            diff < TimeUnit.DAYS.toMillis(2) -> "Yesterday"
            diff < TimeUnit.DAYS.toMillis(7) -> {
                val days = TimeUnit.MILLISECONDS.toDays(diff)
                "$days days ago"
            }
            else -> {
                val date = Date(call.timestamp)
                val format = SimpleDateFormat("MMM dd", Locale.getDefault())
                format.format(date)
            }
        }
    }
    
    /**
     * Format duration as MM:SS
     * Example: "02:45" for 165 seconds
     */
    fun getFormattedDuration(): String {
        val minutes = call.duration / 60
        val seconds = call.duration % 60
        return String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds)
    }
    
    /**
     * Get risk level as string (HIGH, MEDIUM, LOW, or UNKNOWN)
     */
    fun getRiskLevel(): String {
        return risk?.riskLevel ?: "UNKNOWN"
    }
    
    /**
     * Get risk score as percentage (0-100)
     */
    fun getRiskPercentage(): Int {
        return risk?.let {
            // Assuming max score is 15 (5 from each layer)
            ((it.totalScore / 15f) * 100).toInt().coerceIn(0, 100)
        } ?: 0
    }
    
    /**
     * Get confidence as percentage (0-100)
     */
    fun getConfidencePercentage(): Int {
        return risk?.let {
            (it.confidence * 100).toInt().coerceIn(0, 100)
        } ?: 0
    }
    
    /**
     * Get primary threat or "No threat detected"
     */
    fun getPrimaryThreat(): String {
        return risk?.primaryThreat?.takeIf { it.isNotEmpty() } ?: "No threat detected"
    }
    
    /**
     * Get trigger count
     */
    fun getTriggerCount(): Int {
        return triggers.size
    }
    
    /**
     * Check if call was high risk
     */
    fun isHighRisk(): Boolean {
        return risk?.riskLevel == "HIGH"
    }
    
    /**
     * Check if call was medium risk
     */
    fun isMediumRisk(): Boolean {
        return risk?.riskLevel == "MEDIUM"
    }
    
    /**
     * Check if call was low risk
     */
    fun isLowRisk(): Boolean {
        return risk?.riskLevel == "LOW"
    }
    
    /**
     * Get caller display name (caller name or phone number)
     */
    fun getCallerDisplayName(): String {
        return call.callerName ?: call.phoneNumber
    }
    
    /**
     * Format phone number for display
     * Example: "+1 (555) 123-4567" or original if formatting fails
     */
    fun getFormattedPhoneNumber(): String {
        val number = call.phoneNumber
        
        // Simple US phone number formatting
        if (number.length == 10 && number.all { it.isDigit() }) {
            return "(${number.substring(0, 3)}) ${number.substring(3, 6)}-${number.substring(6)}"
        }
        
        // International format with country code
        if (number.startsWith("+") && number.length > 10) {
            val countryCode = number.substring(0, 2)
            val rest = number.substring(2)
            if (rest.length == 10 && rest.all { it.isDigit() }) {
                return "$countryCode (${rest.substring(0, 3)}) ${rest.substring(3, 6)}-${rest.substring(6)}"
            }
        }
        
        // Return original if formatting not applicable
        return number
    }
}

/**
 * Extension function to get CallRecordWithRisk from DAOs
 * 
 * Usage:
 * ```
 * val callWithRisk = database.getCallWithRisk(callId)
 * ```
 */
suspend fun MacherDatabase.getCallWithRisk(callId: String): CallRecordWithRisk? {
    val call = callHistoryDao().getCallById(callId) ?: return null
    val risk = riskAssessmentDao().getRiskByCallId(callId)
    val triggers = risk?.let { riskTriggerDao().getTriggersByRiskId(it.id) } ?: emptyList()
    
    return CallRecordWithRisk(call, risk, triggers)
}

/**
 * Extension function to get all calls with risk data
 */
suspend fun MacherDatabase.getAllCallsWithRisk(): List<CallRecordWithRisk> {
    val calls = callHistoryDao().getAllCalls()
    
    return calls.map { call ->
        val risk = riskAssessmentDao().getRiskByCallId(call.id)
        val triggers = risk?.let { riskTriggerDao().getTriggersByRiskId(it.id) } ?: emptyList()
        CallRecordWithRisk(call, risk, triggers)
    }
}
