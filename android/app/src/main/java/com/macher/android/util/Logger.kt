package com.macher.android.util

import android.util.Log

/**
 * Structured logging utility for MACHER.
 * Provides consistent logging format across the application.
 * 
 * Log Format:
 * [LEVEL] [Component] Message
 * 
 * Privacy: Never logs PII (names, phone numbers, audio data)
 * All PII must be hashed using ErrorLog.hashPhoneNumber() or ErrorLog.hashPII()
 * 
 * Enhanced with structured error logging (Task 9.5):
 * - ErrorLog support for structured error tracking
 * - PII hashing utilities
 * - JSON-formatted error logs
 * - Severity-based filtering
 */
object Logger {
    
    private const val TAG = "MACHER"
    
    /**
     * Log levels matching Android Log levels.
     */
    enum class Level {
        DEBUG, INFO, WARN, ERROR
    }
    
    /**
     * Log an info message.
     */
    fun info(component: String, message: String, metadata: Map<String, Any>? = null) {
        val formattedMessage = formatMessage(component, message, metadata)
        Log.i(TAG, formattedMessage)
    }
    
    /**
     * Log a warning message.
     */
    fun warn(component: String, message: String, metadata: Map<String, Any>? = null) {
        val formattedMessage = formatMessage(component, message, metadata)
        Log.w(TAG, formattedMessage)
    }
    
    /**
     * Log an error message.
     */
    fun error(component: String, message: String, throwable: Throwable? = null, metadata: Map<String, Any>? = null) {
        val formattedMessage = formatMessage(component, message, metadata)
        if (throwable != null) {
            Log.e(TAG, formattedMessage, throwable)
        } else {
            Log.e(TAG, formattedMessage)
        }
    }
    
    /**
     * Log a debug message (only in debug builds).
     */
    fun debug(component: String, message: String, metadata: Map<String, Any>? = null) {
        if (BuildConfig.DEBUG) {
            val formattedMessage = formatMessage(component, message, metadata)
            Log.d(TAG, formattedMessage)
        }
    }
    
    /**
     * Log a structured error with full context (Task 9.5).
     * 
     * This method logs errors in JSON format for structured analysis.
     * All PII in the ErrorLog must be pre-hashed.
     * 
     * @param errorLog Structured error log entry
     */
    fun logError(errorLog: ErrorLog) {
        val jsonLog = errorLog.toJson()
        
        when (errorLog.severity) {
            ErrorSeverity.LOW -> {
                Log.i(TAG, "[ERROR_LOG] $jsonLog")
            }
            ErrorSeverity.MEDIUM -> {
                Log.w(TAG, "[ERROR_LOG] $jsonLog")
            }
            ErrorSeverity.HIGH, ErrorSeverity.CRITICAL -> {
                Log.e(TAG, "[ERROR_LOG] $jsonLog")
            }
        }
    }
    
    /**
     * Log an error with automatic ErrorLog creation (Task 9.5).
     * 
     * Convenience method that creates an ErrorLog from an exception
     * and logs it in structured format.
     * 
     * @param component Component where error occurred
     * @param errorType Type of error
     * @param message Error message (must not contain PII)
     * @param exception Exception that was caught
     * @param severity Severity level
     * @param context Additional context (PII must be pre-hashed)
     */
    fun logStructuredError(
        component: String,
        errorType: ErrorType,
        message: String,
        exception: Exception,
        severity: ErrorSeverity,
        context: Map<String, String> = emptyMap()
    ) {
        val errorLog = ErrorLog.fromException(
            component = component,
            errorType = errorType,
            message = message,
            exception = exception,
            severity = severity,
            context = context
        )
        logError(errorLog)
    }
    
    /**
     * Hash phone number for privacy-preserving logging (Task 9.5).
     * 
     * Use this when you need to log a phone number for correlation
     * but want to preserve user privacy.
     * 
     * @param phoneNumber Phone number to hash
     * @return SHA-256 hash as hex string
     */
    fun hashPhoneNumber(phoneNumber: String): String {
        return ErrorLog.hashPhoneNumber(phoneNumber)
    }
    
    /**
     * Hash any PII for privacy-preserving logging (Task 9.5).
     * 
     * Use this for caller names, email addresses, or any other PII.
     * 
     * @param pii PII string to hash
     * @return SHA-256 hash as hex string
     */
    fun hashPII(pii: String): String {
        return ErrorLog.hashPII(pii)
    }
    
    /**
     * Format log message with component and metadata.
     */
    private fun formatMessage(component: String, message: String, metadata: Map<String, Any>?): String {
        val builder = StringBuilder()
        builder.append("[$component] $message")
        
        metadata?.let {
            builder.append(" | ")
            it.forEach { (key, value) ->
                builder.append("$key=$value ")
            }
        }
        
        return builder.toString().trim()
    }
}

/**
 * BuildConfig placeholder for Logger.
 * In a real build, this would come from the generated BuildConfig class.
 */
private object BuildConfig {
    val DEBUG = com.macher.android.BuildConfig.DEBUG
}
