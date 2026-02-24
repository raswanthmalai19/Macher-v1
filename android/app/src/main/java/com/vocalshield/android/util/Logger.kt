package com.vocalshield.android.util

import android.util.Log

/**
 * Structured logging utility for VocalShield.
 * Provides consistent logging format across the application.
 * 
 * Log Format:
 * [LEVEL] [Component] Message
 * 
 * Privacy: Never logs PII (names, phone numbers, audio data)
 */
object Logger {
    
    private const val TAG = "VocalShield"
    
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
    const val DEBUG = true
}
