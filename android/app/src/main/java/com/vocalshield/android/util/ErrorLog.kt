package com.vocalshield.android.util

import java.security.MessageDigest

/**
 * Structured error log entry with privacy-preserving PII hashing.
 * 
 * This class represents a single error event in the VocalShield system.
 * All PII (phone numbers, caller names) must be hashed before logging.
 * Transcription text must never be logged.
 * 
 * Usage:
 * ```
 * val errorLog = ErrorLog(
 *     component = "MonitoringManager",
 *     errorType = ErrorType.DATABASE_ERROR,
 *     message = "Failed to persist call record",
 *     severity = ErrorSeverity.MEDIUM,
 *     context = mapOf("phoneHash" to hashPhoneNumber(phoneNumber))
 * )
 * Logger.logError(errorLog)
 * ```
 * 
 * @property timestamp Unix timestamp in milliseconds when error occurred
 * @property component Component where error occurred (e.g., "MonitoringManager", "DemoScenarioController")
 * @property errorType Type of error for categorization
 * @property message Human-readable error message (must not contain PII)
 * @property stackTrace Optional stack trace for debugging
 * @property context Additional context as key-value pairs (PII must be hashed)
 * @property severity Severity level for prioritization
 */
data class ErrorLog(
    val timestamp: Long = System.currentTimeMillis(),
    val component: String,
    val errorType: ErrorType,
    val message: String,
    val stackTrace: String? = null,
    val context: Map<String, String> = emptyMap(),
    val severity: ErrorSeverity
) {
    /**
     * Convert to JSON string for structured logging
     */
    fun toJson(): String {
        val contextJson = context.entries.joinToString(",") { (k, v) ->
            "\"$k\":\"${v.replace("\"", "\\\"")}\""
        }
        
        return buildString {
            append("{")
            append("\"timestamp\":$timestamp,")
            append("\"component\":\"$component\",")
            append("\"errorType\":\"${errorType.name}\",")
            append("\"message\":\"${message.replace("\"", "\\\"")}\",")
            if (stackTrace != null) {
                append("\"stackTrace\":\"${stackTrace.replace("\"", "\\\"").replace("\n", "\\n")}\",")
            }
            append("\"context\":{$contextJson},")
            append("\"severity\":\"${severity.name}\"")
            append("}")
        }
    }
    
    companion object {
        /**
         * Hash phone number using SHA-256 for privacy-preserving logging.
         * 
         * This ensures phone numbers cannot be reverse-engineered from logs
         * while still allowing correlation of errors for the same number.
         * 
         * @param phoneNumber Phone number to hash
         * @return SHA-256 hash as hex string
         */
        fun hashPhoneNumber(phoneNumber: String): String {
            return try {
                val digest = MessageDigest.getInstance("SHA-256")
                val hashBytes = digest.digest(phoneNumber.toByteArray())
                hashBytes.joinToString("") { "%02x".format(it) }
            } catch (e: Exception) {
                "hash_error"
            }
        }
        
        /**
         * Hash any PII string using SHA-256.
         * 
         * Use this for caller names, email addresses, or any other PII
         * that needs to be logged for debugging purposes.
         * 
         * @param pii PII string to hash
         * @return SHA-256 hash as hex string
         */
        fun hashPII(pii: String): String {
            return hashPhoneNumber(pii) // Same implementation
        }
        
        /**
         * Create error log from exception with automatic stack trace extraction.
         * 
         * @param component Component where error occurred
         * @param errorType Type of error
         * @param message Error message
         * @param exception Exception that was caught
         * @param severity Severity level
         * @param context Additional context (PII must be pre-hashed)
         * @return ErrorLog instance
         */
        fun fromException(
            component: String,
            errorType: ErrorType,
            message: String,
            exception: Exception,
            severity: ErrorSeverity,
            context: Map<String, String> = emptyMap()
        ): ErrorLog {
            val stackTrace = exception.stackTraceToString()
            return ErrorLog(
                component = component,
                errorType = errorType,
                message = "$message: ${exception.message}",
                stackTrace = stackTrace,
                context = context,
                severity = severity
            )
        }
    }
}

/**
 * Error type categories for classification and filtering.
 */
enum class ErrorType {
    /** AWS connection or network errors */
    AWS_CONNECTION_ERROR,
    
    /** Database read/write errors */
    DATABASE_ERROR,
    
    /** Detection engine failures (metadata, manipulation, fusion) */
    DETECTION_ERROR,
    
    /** State flow emission errors */
    STATE_FLOW_ERROR,
    
    /** Demo scenario playback errors */
    DEMO_SCENARIO_ERROR,
    
    /** Validation errors (invalid data) */
    VALIDATION_ERROR,
    
    /** Intervention engine errors */
    INTERVENTION_ERROR,
    
    /** Audio capture errors */
    AUDIO_CAPTURE_ERROR,
    
    /** WebSocket communication errors */
    WEBSOCKET_ERROR,
    
    /** Unknown or uncategorized errors */
    UNKNOWN_ERROR
}

/**
 * Error severity levels for prioritization and alerting.
 */
enum class ErrorSeverity {
    /** Low severity - informational, no user impact */
    LOW,
    
    /** Medium severity - degraded functionality, user may notice */
    MEDIUM,
    
    /** High severity - significant functionality loss, user impacted */
    HIGH,
    
    /** Critical severity - system failure, monitoring stopped */
    CRITICAL
}
