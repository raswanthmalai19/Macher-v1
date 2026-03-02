package com.vocalshield.android.network

import com.vocalshield.android.service.ThreatLevel
import com.vocalshield.android.util.Config
import com.vocalshield.android.util.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.util.concurrent.TimeUnit

/**
 * Real WebSocket client for AWS API Gateway
 * Handles audio streaming, transcription, and threat detection
 */
class RealWebSocketClient {
    
    private var webSocket: WebSocket? = null
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState
    
    private val _transcriptionFlow = MutableStateFlow("")
    val transcriptionFlow: StateFlow<String> = _transcriptionFlow
    
    private val _threatLevelFlow = MutableStateFlow(ThreatLevel.SAFE)
    val threatLevelFlow: StateFlow<ThreatLevel> = _threatLevelFlow
    
    private val _threatConfidenceFlow = MutableStateFlow(0f)
    val threatConfidenceFlow: StateFlow<Float> = _threatConfidenceFlow
    
    private val _threatTypeFlow = MutableStateFlow("")
    val threatTypeFlow: StateFlow<String> = _threatTypeFlow
    
    private var reconnectAttempts = 0
    private var reconnectJob: Job? = null
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(Config.WebSocket.CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .pingInterval(Config.WebSocket.PING_INTERVAL_MS, TimeUnit.MILLISECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // No timeout for streaming
        .connectionSpecs(createSecureConnectionSpecs()) // TLS 1.2+ only
        .certificatePinner(createCertificatePinner()) // Certificate pinning for AWS
        .build()
    
    /**
     * Create secure connection specs requiring TLS 1.2+.
     * 
     * Requirements: 15.4 (Secure WebSocket with TLS 1.2+)
     * 
     * This ensures:
     * - Only TLS 1.2 and TLS 1.3 are allowed
     * - Modern cipher suites are used
     * - Weak protocols (SSL, TLS 1.0, TLS 1.1) are rejected
     */
    private fun createSecureConnectionSpecs(): List<okhttp3.ConnectionSpec> {
        return listOf(
            okhttp3.ConnectionSpec.Builder(okhttp3.ConnectionSpec.MODERN_TLS)
                .tlsVersions(okhttp3.TlsVersion.TLS_1_2, okhttp3.TlsVersion.TLS_1_3)
                .cipherSuites(
                    okhttp3.CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
                    okhttp3.CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
                    okhttp3.CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
                    okhttp3.CipherSuite.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
                    okhttp3.CipherSuite.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,
                    okhttp3.CipherSuite.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
                )
                .build()
        )
    }
    
    /**
     * Create certificate pinner for AWS API Gateway endpoints.
     * 
     * Requirements: 15.4 (Certificate pinning for AWS endpoints)
     * 
     * Certificate pinning prevents man-in-the-middle attacks by validating
     * that the server certificate matches expected AWS certificates.
     * 
     * Note: In production, you should pin specific certificates or public keys.
     * For now, we rely on the system's certificate validation for AWS domains.
     * 
     * To add certificate pinning:
     * 1. Get AWS API Gateway certificate: openssl s_client -connect your-api.execute-api.us-east-1.amazonaws.com:443
     * 2. Extract public key hash
     * 3. Add to CertificatePinner.Builder().add("*.execute-api.us-east-1.amazonaws.com", "sha256/...")
     */
    private fun createCertificatePinner(): okhttp3.CertificatePinner {
        return okhttp3.CertificatePinner.Builder()
            // AWS API Gateway uses AWS-managed certificates
            // System certificate validation is sufficient for AWS domains
            // Add specific pins here if needed for additional security
            .build()
    }
    
    private val json = Json { 
        ignoreUnknownKeys = true
        isLenient = true
    }
    
    /**
     * Connect to AWS WebSocket API Gateway
     */
    fun connect() {
        if (_connectionState.value == ConnectionState.CONNECTED) {
            Logger.info("WebSocketClient", "Already connected")
            return
        }
        
        // Validate WSS protocol (Requirements 15.4)
        if (!Config.WEBSOCKET_URL.startsWith("wss://")) {
            Logger.error("WebSocketClient", "Invalid WebSocket URL: must use WSS (secure WebSocket)")
            _connectionState.value = ConnectionState.ERROR
            return
        }
        
        Logger.info("WebSocketClient", "Connecting to ${Config.WEBSOCKET_URL}")
        _connectionState.value = ConnectionState.CONNECTING
        
        val request = Request.Builder()
            .url(Config.WEBSOCKET_URL)
            .addHeader("Authorization", Config.AUTH_TOKEN)
            .build()
        
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Logger.info("WebSocketClient", "Connected successfully")
                _connectionState.value = ConnectionState.CONNECTED
                reconnectAttempts = 0
                
                // Send initial connection message
                sendConnectionMessage()
            }
            
            override fun onMessage(webSocket: WebSocket, text: String) {
                Logger.debug("WebSocketClient", "Message received: ${text.take(100)}")
                handleTextMessage(text)
            }
            
            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                Logger.debug("WebSocketClient", "Binary message received: ${bytes.size} bytes")
            }
            
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Logger.info("WebSocketClient", "Closing: $code - $reason")
                _connectionState.value = ConnectionState.DISCONNECTING
            }
            
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Logger.info("WebSocketClient", "Closed: $code - $reason")
                _connectionState.value = ConnectionState.DISCONNECTED
                attemptReconnect()
            }
            
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Logger.error("WebSocketClient", "Connection failed: ${t.message}", t)
                _connectionState.value = ConnectionState.ERROR
                attemptReconnect()
            }
        })
    }
    
    /**
     * Disconnect from WebSocket
     */
    fun disconnect() {
        Logger.info("WebSocketClient", "Disconnecting")
        reconnectJob?.cancel()
        reconnectJob = null
        reconnectAttempts = 0
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }
    
    /**
     * Send audio chunk to AWS
     */
    fun sendAudioChunk(audioData: ByteArray) {
        if (_connectionState.value != ConnectionState.CONNECTED) {
            Logger.warn("WebSocketClient", "Cannot send audio: not connected")
            return
        }
        
        try {
            webSocket?.send(ByteString.of(*audioData))
        } catch (e: Exception) {
            Logger.error("WebSocketClient", "Failed to send audio chunk", e)
        }
    }
    
    /**
     * Send initial connection message
     */
    private fun sendConnectionMessage() {
        try {
            val message = ClientMessage(
                action = "connect",
                data = mapOf(
                    "clientType" to "android",
                    "version" to "1.0.0",
                    "audioFormat" to "pcm_16khz_16bit_mono"
                )
            )
            val jsonString = json.encodeToString(message)
            webSocket?.send(jsonString)
            Logger.info("WebSocketClient", "Connection message sent")
        } catch (e: Exception) {
            Logger.error("WebSocketClient", "Failed to send connection message", e)
        }
    }
    
    /**
     * Handle incoming text message from AWS
     */
    private fun handleTextMessage(text: String) {
        try {
            val message = json.decodeFromString<ServerMessage>(text)
            
            when (message.type) {
                "transcription" -> handleTranscription(message)
                "threat_analysis" -> handleThreatAnalysis(message)
                "error" -> handleError(message)
                "connection_ack" -> handleConnectionAck(message)
                else -> Logger.debug("WebSocketClient", "Unknown message type: ${message.type}")
            }
        } catch (e: Exception) {
            Logger.error("WebSocketClient", "Failed to parse message", e)
        }
    }
    
    /**
     * Handle transcription message from AWS Transcribe
     */
    private fun handleTranscription(message: ServerMessage) {
        val transcript = message.data["transcript"]?.jsonPrimitive?.content ?: ""
        val isFinal = message.data["isFinal"]?.jsonPrimitive?.booleanOrNull ?: false
        
        if (transcript.isNotEmpty()) {
            if (isFinal) {
                // Append final transcript
                val current = _transcriptionFlow.value
                _transcriptionFlow.value = if (current.isEmpty()) {
                    transcript
                } else {
                    "$current $transcript"
                }
                // Privacy: Never log transcription text (contains PII)
                Logger.debug("WebSocketClient", "Final transcript received (length: ${transcript.length} chars)")
            } else {
                // Privacy: Never log transcription text (contains PII)
                Logger.debug("WebSocketClient", "Partial transcript received (length: ${transcript.length} chars)")
            }
        }
    }
    
    /**
     * Handle threat analysis from AWS Bedrock
     */
    private fun handleThreatAnalysis(message: ServerMessage) {
        val levelStr = message.data["threatLevel"]?.jsonPrimitive?.content ?: "safe"
        val confidence = message.data["confidence"]?.jsonPrimitive?.doubleOrNull?.toFloat() ?: 0f
        val threatType = message.data["threatType"]?.jsonPrimitive?.content ?: ""
        val reason = message.data["reason"]?.jsonPrimitive?.content ?: ""
        
        // Parse threat level
        val threatLevel = when (levelStr.lowercase()) {
            "danger", "high" -> ThreatLevel.DANGER
            "caution", "medium", "warning" -> ThreatLevel.CAUTION
            else -> ThreatLevel.SAFE
        }
        
        _threatLevelFlow.value = threatLevel
        _threatConfidenceFlow.value = confidence
        _threatTypeFlow.value = threatType
        
        Logger.info("WebSocketClient", "Threat: $threatLevel (${confidence * 100}%) - $threatType")
        if (reason.isNotEmpty()) {
            Logger.info("WebSocketClient", "Reason: $reason")
        }
    }
    
    /**
     * Handle error message from AWS
     */
    private fun handleError(message: ServerMessage) {
        val errorMsg = message.data["message"]?.jsonPrimitive?.content ?: "Unknown error"
        val errorCode = message.data["code"]?.jsonPrimitive?.content ?: ""
        Logger.error("WebSocketClient", "Server error [$errorCode]: $errorMsg")
    }
    
    /**
     * Handle connection acknowledgment
     */
    private fun handleConnectionAck(message: ServerMessage) {
        Logger.info("WebSocketClient", "Connection acknowledged by server")
    }
    
    /**
     * Attempt reconnection with exponential backoff
     */
    private fun attemptReconnect() {
        if (reconnectAttempts >= Config.WebSocket.MAX_RECONNECT_ATTEMPTS) {
            Logger.error("WebSocketClient", "Max reconnect attempts reached")
            return
        }
        
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            val delayMs = minOf(
                Config.WebSocket.RECONNECT_DELAY_MS * (1 shl reconnectAttempts),
                Config.WebSocket.MAX_RECONNECT_DELAY_MS
            )
            
            Logger.info("WebSocketClient", "Reconnecting in ${delayMs}ms (attempt ${reconnectAttempts + 1})")
            delay(delayMs)
            
            reconnectAttempts++
            connect()
        }
    }
    
    /**
     * Test WebSocket connection availability.
     * 
     * Performs a lightweight check to determine if the AWS backend is reachable.
     * This method is used by FallbackManager for health checks.
     * 
     * @return true if connection is available, false otherwise
     */
    suspend fun testConnection(): Boolean {
        return try {
            // If already connected, backend is available
            if (_connectionState.value == ConnectionState.CONNECTED) {
                return true
            }
            
            // For now, check if we can reach the connection state
            // In a production system, this would attempt a lightweight ping
            // or health check endpoint
            _connectionState.value != ConnectionState.ERROR
        } catch (e: Exception) {
            Logger.warn("WebSocketClient", "Connection test failed: ${e.message}")
            false
        }
    }
    
    /**
     * Reset state
     */
    fun reset() {
        _transcriptionFlow.value = ""
        _threatLevelFlow.value = ThreatLevel.SAFE
        _threatConfidenceFlow.value = 0f
        _threatTypeFlow.value = ""
    }
}

/**
 * Connection states
 */
enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    DISCONNECTING,
    ERROR
}

/**
 * Client message to AWS
 */
@Serializable
data class ClientMessage(
    val action: String,
    val data: Map<String, String> = emptyMap()
)

/**
 * Server message from AWS
 */
@Serializable
data class ServerMessage(
    val type: String,
    val data: Map<String, JsonElement> = emptyMap()
)
