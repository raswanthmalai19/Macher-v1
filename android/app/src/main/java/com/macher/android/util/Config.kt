package com.macher.android.util

/**
 * Configuration constants for MACHER app.
 * 
 * IMPORTANT: Update these values with your actual AWS deployment URLs.
 */
object Config {
    /**
     * WebSocket API Gateway URL for real-time audio streaming.
     * 
     * CONFIGURED: Real AWS deployment
     * Endpoint: wss://mg1nazug3m.execute-api.us-east-1.amazonaws.com/dev
     * Stage 'dev' matches the CDK-deployed WebSocket stage name.
     */
    const val WEBSOCKET_URL = "wss://mg1nazug3m.execute-api.us-east-1.amazonaws.com/dev"
    
    /**
     * REST API URL for mobile analytics and management.
     * 
     * CONFIGURED: Real AWS deployment
     * Stage 'dev' matches the CDK-deployed API stage name.
     */
    const val REST_API_URL = "https://mg1nazug3m.execute-api.us-east-1.amazonaws.com/dev"

    /**
     * WebSocket API key — passed as ?apiKey=<value> in the WSS connection URL.
     *
     * The Lambda connect handler (lambda/connect/index.ts) validates this from
     * queryStringParameters?.apiKey — NOT from HTTP headers.
     *
     * Value retrieved from AWS Secrets Manager (macher/api-keys → websocketApiKey).
     */
    const val WEBSOCKET_API_KEY = "jeZDr<SRz4frUp@8%GR|^-rp]I-8l7Kw"

    /**
     * Authentication token for REST API access.
     * 
     * Loaded at runtime from secure storage (KeyManager).
     * Fallback default is empty — the app will prompt the user to configure.
     */
    var AUTH_TOKEN: String = ""
        private set

    /**
     * Set the auth token at runtime (loaded from KeyManager on app startup).
     */
    fun setAuthToken(token: String) {
        AUTH_TOKEN = token
    }
    
    /**
     * Enable demo mode for testing without real call audio.
     *
     * When true:
     * - Runs realistic scam-detection demo scenarios
     * - No live audio capture required
     * - No AWS backend connection needed
     * - Full UI flow works end-to-end
     *
     * When false (DEFAULT — real mode):
     * - Auto-detects incoming calls
     * - Captures live audio via Accessibility Service
     * - Streams to AWS for Bedrock analysis
     * - Runs local ManipulationDetector in parallel
     * - Auto-hangs up and notifies guardian on scam detection
     *
     * Toggle via Settings screen at runtime.
     */
    var DEMO_MODE: Boolean = false
        private set

    /**
     * Toggle demo mode at runtime from settings UI.
     */
    fun setDemoMode(enabled: Boolean) {
        DEMO_MODE = enabled
    }
    
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
        const val MAX_RECONNECT_ATTEMPTS = 3   // Reduced: save AWS credits on failures
        const val RECONNECT_DELAY_MS = 2000L   // Start with 2 seconds (less aggressive)
        const val MAX_RECONNECT_DELAY_MS = 60000L  // Max 60 seconds between retries
    }
    
    /**
     * AWS Credit Efficiency — reduces unnecessary backend calls
     */
    object CreditSaver {
        /** Health check interval in ms. Higher = fewer AWS hits, slower failover */
        const val HEALTH_CHECK_INTERVAL_MS = 60000L     // 60s instead of 30s
        /** Only do health checks while actively monitoring a call */
        const val HEALTH_CHECK_ONLY_DURING_CALLS = true
        /** Batch audio chunks to reduce WebSocket messages. e.g. 10 = send every 1s */
        const val AUDIO_CHUNK_BATCH_SIZE = 10
        /** Skip transcription requests for the first N seconds of a call (usually greetings) */
        const val SKIP_FIRST_SECONDS = 5
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
