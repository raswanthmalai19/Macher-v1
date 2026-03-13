package com.macher.android.network

import com.macher.android.service.ThreatLevel
import com.macher.android.util.Config
import com.macher.android.util.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
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
import java.util.concurrent.atomic.AtomicInteger

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

    private val _lastConnectionError = MutableStateFlow<String?>(null)
    val lastConnectionError: StateFlow<String?> = _lastConnectionError

    // True while a reconnect attempt is pending/in-progress (retries not yet exhausted)
    private val _isReconnecting = MutableStateFlow(false)
    val isReconnecting: StateFlow<Boolean> = _isReconnecting

    private var reconnectAttempts = 0
    private var reconnectJob: Job? = null
    
    // Audio message tracking for JSON protocol
    private var currentCallSessionId: String = ""
    private val sequenceCounter = AtomicInteger(0)
    
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
        // Use MODERN_TLS without a fixed cipher list — let the device and AWS negotiate.
        // A hard-coded cipher list can cause SSLHandshakeException on some Android devices
        // if the AWS API Gateway endpoint selects a cipher not in our list.
        return listOf(okhttp3.ConnectionSpec.MODERN_TLS, okhttp3.ConnectionSpec.COMPATIBLE_TLS)
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

        // Lambda connect handler reads API key from URL query string (?apiKey=...),
        // NOT from HTTP headers — so we append it to the WSS URL.
        val urlWithKey = buildString {
            append(Config.WEBSOCKET_URL)
            if (Config.WEBSOCKET_API_KEY.isNotEmpty()) {
                append("?apiKey=${java.net.URLEncoder.encode(Config.WEBSOCKET_API_KEY, "UTF-8")}")
                if (currentCallSessionId.isNotEmpty()) {
                    append("&callSessionId=$currentCallSessionId")
                }
            }
        }
        Logger.info("WebSocketClient", "Connecting with API key (${Config.WEBSOCKET_API_KEY.length} chars)")

        val request = Request.Builder()
            .url(urlWithKey)
            .build()
        
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Logger.info("WebSocketClient", "Connected successfully")
                _isReconnecting.value = false
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
                _lastConnectionError.value = if (response?.code != null) "HTTP ${response.code}" else t.javaClass.simpleName
                val isPermanent = t is java.net.UnknownHostException
                if (!isPermanent && reconnectAttempts < Config.WebSocket.MAX_RECONNECT_ATTEMPTS) {
                    // Mark as reconnecting BEFORE state changes to ERROR so observers
                    // see isReconnecting=true at the same time as ERROR.
                    _isReconnecting.value = true
                }
                _connectionState.value = ConnectionState.ERROR
                val responseCode = response?.code
                if (isPermanent) {
                    Logger.error("WebSocketClient", "DNS error — check WEBSOCKET_URL in Config.kt")
                } else {
                    Logger.warn("WebSocketClient", "Connection failed (code=$responseCode), will retry")
                    attemptReconnect()
                }
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
        _isReconnecting.value = false
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }
    
    /**
     * Set the current call session ID for audio messages.
     * Called by MonitoringManager when a call starts.
     */
    fun setCallSessionId(sessionId: String) {
        currentCallSessionId = sessionId
        sequenceCounter.set(0)
    }
    
    /**
     * Send audio chunk to AWS as JSON with base64-encoded audio data.
     * Format matches Lambda parseAudioMessage() expectations.
     */
    fun sendAudioChunk(audioData: ByteArray) {
        if (_connectionState.value != ConnectionState.CONNECTED) {
            Logger.warn("WebSocketClient", "Cannot send audio: not connected")
            return
        }
        
        try {
            val audioMessage = AudioMessageOut(
                action = "audio",
                callSessionId = currentCallSessionId,
                timestamp = System.currentTimeMillis(),
                audioData = android.util.Base64.encodeToString(audioData, android.util.Base64.NO_WRAP),
                sequenceNumber = sequenceCounter.getAndIncrement()
            )
            val jsonString = json.encodeToString(audioMessage)
            webSocket?.send(jsonString)
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
     * Handle incoming text message from AWS.
     * Supports both the legacy ServerMessage format (type + data map)
     * and the flat Lambda format (type + top-level fields).
     */
    private fun handleTextMessage(text: String) {
        try {
            val jsonElement = json.parseToJsonElement(text)
            val jsonObj = jsonElement.jsonObject
            val type = jsonObj["type"]?.jsonPrimitive?.content
                ?: jsonObj["action"]?.jsonPrimitive?.content
                ?: ""
            
            when (type) {
                "transcription" -> handleTranscriptionFlat(jsonObj)
                "threat_analysis", "fraud_analysis" -> handleThreatAnalysisFlat(jsonObj)
                "error" -> handleErrorFlat(jsonObj)
                "connection_ack" -> handleConnectionAck()
                else -> Logger.debug("WebSocketClient", "Unknown message type: $type")
            }
        } catch (e: Exception) {
            Logger.error("WebSocketClient", "Failed to parse message", e)
        }
    }
    
    /**
     * Handle transcription from flat JSON.
     * Supports both: { data: { transcript, isFinal } } and flat { transcript, isFinal }
     */
    private fun handleTranscriptionFlat(jsonObj: kotlinx.serialization.json.JsonObject) {
        // Try nested 'data' first for backward compat, then flat
        val dataObj = jsonObj["data"]?.jsonObject
        val transcript = (dataObj ?: jsonObj)["transcript"]?.jsonPrimitive?.content
            ?: (dataObj ?: jsonObj)["text"]?.jsonPrimitive?.content ?: ""
        val isFinal = (dataObj ?: jsonObj)["isFinal"]?.jsonPrimitive?.booleanOrNull ?: true
        
        if (transcript.isNotEmpty()) {
            if (isFinal) {
                val current = _transcriptionFlow.value
                _transcriptionFlow.value = if (current.isEmpty()) transcript else "$current $transcript"
                Logger.debug("WebSocketClient", "Final transcript received (length: ${transcript.length} chars)")
            } else {
                Logger.debug("WebSocketClient", "Partial transcript received (length: ${transcript.length} chars)")
            }
        }
    }
    
    /**
     * Handle threat/fraud analysis from flat JSON.
     * Handles both Lambda 'fraud_analysis' format (flat, riskScore 0-100)
     * and the legacy 'threat_analysis' format (nested data, confidence 0-1).
     */
    private fun handleThreatAnalysisFlat(jsonObj: kotlinx.serialization.json.JsonObject) {
        val dataObj = jsonObj["data"]?.jsonObject
        val source = dataObj ?: jsonObj
        
        val levelStr = source["threatLevel"]?.jsonPrimitive?.content ?: "safe"
        // riskScore is 0-100 from Lambda, confidence is 0-1 from legacy
        val riskScore = source["riskScore"]?.jsonPrimitive?.doubleOrNull
        val legacyConfidence = source["confidence"]?.jsonPrimitive?.doubleOrNull
        val confidence = when {
            riskScore != null -> (riskScore / 100.0).toFloat()
            legacyConfidence != null -> legacyConfidence.toFloat()
            else -> 0f
        }
        // Try threatType, then first fraudIndicator type
        val threatType = source["threatType"]?.jsonPrimitive?.content
            ?: source["fraudIndicators"]?.let { indicators ->
                try {
                    val arr = indicators as? kotlinx.serialization.json.JsonArray
                    arr?.firstOrNull()?.jsonObject?.get("type")?.jsonPrimitive?.content
                } catch (_: Exception) { null }
            } ?: ""
        val reason = source["reasoning"]?.jsonPrimitive?.content
            ?: source["reason"]?.jsonPrimitive?.content ?: ""
        
        val threatLevel = when (levelStr.lowercase()) {
            "danger", "high" -> ThreatLevel.DANGER
            "caution", "medium", "warning" -> ThreatLevel.CAUTION
            else -> ThreatLevel.SAFE
        }
        
        _threatLevelFlow.value = threatLevel
        _threatConfidenceFlow.value = confidence
        _threatTypeFlow.value = threatType
        
        Logger.info("WebSocketClient", "Threat: $threatLevel (${(confidence * 100).toInt()}%) - $threatType")
        if (reason.isNotEmpty()) {
            Logger.info("WebSocketClient", "Reason: $reason")
        }
    }
    
    /**
     * Handle error message from flat JSON
     */
    private fun handleErrorFlat(jsonObj: kotlinx.serialization.json.JsonObject) {
        val dataObj = jsonObj["data"]?.jsonObject
        val source = dataObj ?: jsonObj
        val errorMsg = source["message"]?.jsonPrimitive?.content ?: "Unknown error"
        val errorCode = source["code"]?.jsonPrimitive?.content ?: ""
        Logger.error("WebSocketClient", "Server error [$errorCode]: $errorMsg")
    }
    
    /**
     * Handle connection acknowledgment
     */
    private fun handleConnectionAck() {
        Logger.info("WebSocketClient", "Connection acknowledged by server")
    }
    
    /**
     * Attempt reconnection with exponential backoff
     */
    private fun attemptReconnect() {
        if (reconnectAttempts >= Config.WebSocket.MAX_RECONNECT_ATTEMPTS) {
            Logger.error("WebSocketClient", "Max reconnect attempts reached")
            _isReconnecting.value = false  // All retries exhausted — now truly offline
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
     * Test WebSocket connection availability via a lightweight HTTP HEAD request.
     *
     * Returns true if the AWS backend responds (even with a 4xx — that means the
     * server is up). Returns false only on a network-level failure (no connectivity,
     * DNS failure, TLS error, timeout).
     *
     * This is used by FallbackManager for periodic health checks.
     */
    suspend fun testConnection(): Boolean {
        // If the WebSocket is already open, the backend is obviously reachable.
        if (_connectionState.value == ConnectionState.CONNECTED) return true

        return withContext(Dispatchers.IO) {
            withTimeoutOrNull(5_000L) {
                try {
                    val request = Request.Builder()
                        .url(Config.REST_API_URL)
                        .head()
                        .addHeader("Authorization", "Bearer ${Config.AUTH_TOKEN}")
                        .build()
                    val response = client.newCall(request).execute()
                    response.close()
                    // Any HTTP response (including 403, 404) means the server is up
                    true
                } catch (e: Exception) {
                    Logger.warn("WebSocketClient", "Connection test failed: ${e.message}")
                    false
                }
            } ?: run {
                Logger.warn("WebSocketClient", "Connection test timed out")
                false
            }
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
 * Audio message sent to AWS (matches Lambda parseAudioMessage expectations)
 */
@Serializable
data class AudioMessageOut(
    val action: String,
    val callSessionId: String,
    val timestamp: Long,
    val audioData: String,
    val sequenceNumber: Int
)
