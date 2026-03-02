package com.vocalshield.android.util

/**
 * Privacy validation utilities to ensure no PII leaks in logs or storage.
 * 
 * This utility provides validation methods to detect and prevent PII from
 * being logged or stored inappropriately. All validation is done at runtime
 * to catch privacy violations during development and testing.
 * 
 * Privacy Rules (Requirements 15.1, 15.3):
 * 1. Never log raw phone numbers - always hash with SHA-256
 * 2. Never log transcription text - contains conversation content
 * 3. Never log caller names - always hash with SHA-256
 * 4. Never store raw audio data - process in RAM only
 * 
 * Usage:
 * ```
 * // Validate before logging
 * val safeMessage = PrivacyValidator.sanitizeForLogging(message)
 * Logger.info("Component", safeMessage)
 * 
 * // Check if string contains PII
 * if (PrivacyValidator.containsPII(text)) {
 *     throw IllegalArgumentException("Cannot log PII")
 * }
 * ```
 */
object PrivacyValidator {
    
    // Phone number patterns (various formats)
    private val PHONE_PATTERNS = listOf(
        Regex("""\b\d{3}[-.]?\d{3}[-.]?\d{4}\b"""),  // 123-456-7890, 123.456.7890, 1234567890
        Regex("""\b\+\d{1,3}[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b"""),  // +1-123-456-7890
        Regex("""\(\d{3}\)\s?\d{3}[-.]?\d{4}""")  // (123) 456-7890
    )
    
    // Common PII indicators
    private val PII_KEYWORDS = listOf(
        "transcript", "transcription", "conversation", "audio",
        "caller name", "contact name", "full name"
    )
    
    /**
     * Check if a string contains potential PII.
     * 
     * This is a heuristic check and may have false positives/negatives.
     * Use for development and testing to catch obvious PII leaks.
     * 
     * @param text Text to check
     * @return true if text likely contains PII
     */
    fun containsPII(text: String): Boolean {
        val lowerText = text.lowercase()
        
        // Check for phone numbers
        for (pattern in PHONE_PATTERNS) {
            if (pattern.containsMatchIn(text)) {
                return true
            }
        }
        
        // Check for PII keywords
        for (keyword in PII_KEYWORDS) {
            if (lowerText.contains(keyword)) {
                return true
            }
        }
        
        return false
    }
    
    /**
     * Sanitize text for logging by removing potential PII.
     * 
     * This method attempts to redact phone numbers and other PII
     * from log messages. Use this as a safety net, but prefer
     * not including PII in the first place.
     * 
     * @param text Text to sanitize
     * @return Sanitized text with PII redacted
     */
    fun sanitizeForLogging(text: String): String {
        var sanitized = text
        
        // Redact phone numbers
        for (pattern in PHONE_PATTERNS) {
            sanitized = pattern.replace(sanitized, "[PHONE_REDACTED]")
        }
        
        return sanitized
    }
    
    /**
     * Validate that a phone number is hashed before logging.
     * 
     * Checks if the string looks like a SHA-256 hash (64 hex characters).
     * Throws exception if it appears to be a raw phone number.
     * 
     * @param phoneIdentifier Phone number or hash to validate
     * @throws IllegalArgumentException if appears to be raw phone number
     */
    fun validatePhoneHash(phoneIdentifier: String) {
        // Check if it's a valid SHA-256 hash (64 hex characters)
        val isHash = phoneIdentifier.matches(Regex("^[a-f0-9]{64}$"))
        
        if (!isHash) {
            // Check if it looks like a phone number
            for (pattern in PHONE_PATTERNS) {
                if (pattern.matches(phoneIdentifier)) {
                    throw IllegalArgumentException(
                        "Raw phone number detected in log. Use Logger.hashPhoneNumber() first."
                    )
                }
            }
        }
    }
    
    /**
     * Assert that no transcription text is being logged.
     * 
     * Throws exception if the message appears to contain conversation content.
     * Use this in debug builds to catch transcription logging violations.
     * 
     * @param message Log message to validate
     * @throws IllegalArgumentException if transcription detected
     */
    fun assertNoTranscription(message: String) {
        val lowerMessage = message.lowercase()
        
        val transcriptionIndicators = listOf(
            "transcript:", "transcription:", "said:", "caller said",
            "user said", "conversation:", "audio content"
        )
        
        for (indicator in transcriptionIndicators) {
            if (lowerMessage.contains(indicator)) {
                throw IllegalArgumentException(
                    "Transcription text detected in log. Never log conversation content."
                )
            }
        }
    }
    
    /**
     * Validate that no audio data is being persisted.
     * 
     * Checks if a file path or data structure appears to contain audio data.
     * Throws exception if audio storage is detected.
     * 
     * @param path File path or identifier to validate
     * @throws IllegalArgumentException if audio storage detected
     */
    fun assertNoAudioStorage(path: String) {
        val lowerPath = path.lowercase()
        
        val audioExtensions = listOf(
            ".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac",
            ".pcm", ".raw", ".opus"
        )
        
        for (extension in audioExtensions) {
            if (lowerPath.endsWith(extension)) {
                throw IllegalArgumentException(
                    "Audio file storage detected: $path. Never store raw audio data."
                )
            }
        }
        
        if (lowerPath.contains("audio") && (lowerPath.contains("save") || lowerPath.contains("store"))) {
            throw IllegalArgumentException(
                "Audio storage operation detected. Never store raw audio data."
            )
        }
    }
    
    /**
     * Create a privacy-safe summary of call metadata for logging.
     * 
     * Returns a sanitized string with hashed phone number and safe metadata.
     * 
     * @param phoneNumber Phone number (will be hashed)
     * @param duration Call duration in seconds
     * @param riskLevel Risk level (safe to log)
     * @return Privacy-safe log message
     */
    fun createSafeCallSummary(
        phoneNumber: String,
        duration: Int,
        riskLevel: String
    ): String {
        val phoneHash = ErrorLog.hashPhoneNumber(phoneNumber).take(8)
        return "Call: hash=$phoneHash..., duration=${duration}s, risk=$riskLevel"
    }
}
