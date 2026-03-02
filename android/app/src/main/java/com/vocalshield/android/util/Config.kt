package com.vocalshield.android.util

/**
 * Configuration constants for MACHER app.
 * 
 * IMPORTANT: Update these values with your actual AWS deployment URLs.
 */
object Config {
    /**
     * WebSocket API Gateway URL for real-time audio streaming.
     * 
     * Format: wss://your-api-id.execute-api.region.amazonaws.com/production
     * 
     * To find your WebSocket URL:
     * 1. Go to AWS Console → API Gateway
     * 2. Find your WebSocket API
     * 3. Copy the WebSocket URL from the Stages section
     */
    const val WEBSOCKET_URL = "wss://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/production"
    
    /**
     * REST API URL for mobile analytics and management.
     * 
     * Format: https://your-api-id.execute-api.region.amazonaws.com/production
     */
    const val REST_API_URL = "https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/production"
    
    /**
     * Authentication token for API access.
     * 
     * TODO: Implement proper authentication with AWS Cognito or API keys
     * For now, using a placeholder
     */
    const val AUTH_TOKEN = "demo-auth-token"
    
    /**
     * Enable demo mode for testing without real call audio.
     * 
     * When true:
     * - Simulates realistic scam scenarios
     * - Uses preloaded conversation scripts
     * - Shows all detection features
     * - Demonstrates multi-layer risk analysis
     * - No AWS backend required
     * 
     * When false:
     * - Connects to real AWS backend
     * - Captures real call audio
     * - Performs live analysis
     * - Requires AWS API Gateway URLs
     * 
     * Set to false for production use with real call audio.
     */
    const val DEMO_MODE = true
    
    /**
     * Audio configuration
     */
    object Audio {
        const val SAMPLE_RATE = 16000  // 16kHz
        const val CHANNEL_CONFIG = android.media.AudioFormat.CHANNEL_IN_MONO
        const val AUDIO_FORMAT = android.media.AudioFormat.ENCODING_PCM_16BIT
        const val CHUNK_SIZE_MS = 100  // 100ms chunks
    }
    
    /**
     * WebSocket configuration
     */
    object WebSocket {
        const val CONNECT_TIMEOUT_MS = 10000L  // 10 seconds
        const val PING_INTERVAL_MS = 30000L    // 30 seconds
        const val MAX_RECONNECT_ATTEMPTS = 5
        const val RECONNECT_DELAY_MS = 1000L   // Start with 1 second
        const val MAX_RECONNECT_DELAY_MS = 30000L  // Max 30 seconds
    }
    
    /**
     * Performance targets
     */
    object Performance {
        const val MAX_AUDIO_LATENCY_MS = 150   // <150ms audio streaming
        const val MAX_ALERT_LATENCY_MS = 500   // <500ms alert display
        const val MAX_BATTERY_DRAIN_PERCENT_PER_HOUR = 5  // <5% per hour
    }
    
    /**
     * Feature flags
     */
    object Features {
        const val ENABLE_TRANSCRIPTION_DISPLAY = true
        const val ENABLE_HAPTIC_FEEDBACK = true
        const val ENABLE_NOTIFICATIONS = true
        const val ENABLE_CALL_ANNOUNCEMENTS = true
        const val ENABLE_FAMILY_LOOP = true
        const val MAX_FAMILY_LOOP_CONTACTS = 5
    }
    
    /**
     * Logging configuration
     */
    object Logging {
        const val ENABLE_DEBUG_LOGS = true
        const val ENABLE_PERFORMANCE_LOGS = true
        const val LOG_TAG = "MACHER"
    }
}
