package com.macher.android.util

import kotlinx.coroutines.delay

/**
 * Error handling utilities for MACHER.
 * Provides retry logic, exponential backoff, and error categorization.
 * 
 * Requirements: 2.5, 3.5, 11.1
 */
object ErrorHandler {
    
    /**
     * Error categories for different types of failures.
     */
    enum class ErrorCategory {
        NETWORK,           // Network connectivity issues
        AUTHENTICATION,    // Auth token expired or invalid
        PERMISSION,        // Missing required permissions
        DEVICE,           // Device incompatibility or hardware issues
        STORAGE,          // Database or file system errors
        AUDIO,            // Audio capture or processing errors
        UNKNOWN           // Unclassified errors
    }
    
    /**
     * Categorize an exception into an error category.
     */
    fun categorizeError(throwable: Throwable): ErrorCategory {
        return when {
            throwable is java.net.UnknownHostException ||
            throwable is java.net.SocketTimeoutException ||
            throwable is java.io.IOException -> ErrorCategory.NETWORK
            
            throwable.message?.contains("auth", ignoreCase = true) == true ||
            throwable.message?.contains("token", ignoreCase = true) == true -> ErrorCategory.AUTHENTICATION
            
            throwable is SecurityException ||
            throwable.message?.contains("permission", ignoreCase = true) == true -> ErrorCategory.PERMISSION
            
            throwable.message?.contains("audio", ignoreCase = true) == true -> ErrorCategory.AUDIO
            
            throwable is android.database.SQLException ||
            throwable.message?.contains("database", ignoreCase = true) == true -> ErrorCategory.STORAGE
            
            else -> ErrorCategory.UNKNOWN
        }
    }
    
    /**
     * Get user-friendly error message for an error category.
     */
    fun getUserMessage(category: ErrorCategory): String {
        return when (category) {
            ErrorCategory.NETWORK -> "Network connection unavailable. Please check your internet connection."
            ErrorCategory.AUTHENTICATION -> "Authentication failed. Please sign in again."
            ErrorCategory.PERMISSION -> "Required permissions not granted. Please enable permissions in settings."
            ErrorCategory.DEVICE -> "Your device is not compatible with this feature."
            ErrorCategory.STORAGE -> "Storage error occurred. Please try again."
            ErrorCategory.AUDIO -> "Audio capture failed. Please check microphone permissions."
            ErrorCategory.UNKNOWN -> "An unexpected error occurred. Please try again."
        }
    }
    
    /**
     * Retry a suspending operation with exponential backoff.
     * 
     * @param maxAttempts Maximum number of retry attempts (default: 3)
     * @param initialDelayMs Initial delay in milliseconds (default: 1000)
     * @param maxDelayMs Maximum delay in milliseconds (default: 30000)
     * @param factor Exponential backoff factor (default: 2.0)
     * @param block The operation to retry
     * @return Result of the operation
     */
    suspend fun <T> retryWithExponentialBackoff(
        maxAttempts: Int = 3,
        initialDelayMs: Long = 1000,
        maxDelayMs: Long = 30000,
        factor: Double = 2.0,
        block: suspend () -> T
    ): Result<T> {
        var currentDelay = initialDelayMs
        var lastException: Throwable? = null
        
        repeat(maxAttempts) { attempt ->
            try {
                return Result.success(block())
            } catch (e: Exception) {
                lastException = e
                
                Logger.warn(
                    "ErrorHandler",
                    "Retry attempt ${attempt + 1}/$maxAttempts failed",
                    mapOf(
                        "error" to e.message.orEmpty(),
                        "category" to categorizeError(e).name
                    )
                )
                
                if (attempt < maxAttempts - 1) {
                    delay(currentDelay)
                    currentDelay = (currentDelay * factor).toLong().coerceAtMost(maxDelayMs)
                }
            }
        }
        
        return Result.failure(lastException ?: Exception("Retry failed after $maxAttempts attempts"))
    }
    
    /**
     * Execute a block with error handling and logging.
     * 
     * @param component Component name for logging
     * @param operation Operation description for logging
     * @param block The operation to execute
     * @return Result of the operation
     */
    suspend fun <T> withErrorHandling(
        component: String,
        operation: String,
        block: suspend () -> T
    ): Result<T> {
        return try {
            Logger.debug(component, "Starting: $operation")
            val result = block()
            Logger.debug(component, "Completed: $operation")
            Result.success(result)
        } catch (e: Exception) {
            val category = categorizeError(e)
            Logger.error(
                component,
                "Failed: $operation",
                e,
                mapOf("category" to category.name)
            )
            Result.failure(e)
        }
    }
}
