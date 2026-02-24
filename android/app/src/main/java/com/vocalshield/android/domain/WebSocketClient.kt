package com.vocalshield.android.domain

import android.util.Base64
import android.util.Log
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * WebSocket client for AWS API Gateway communication.
 * Handles bidirectional streaming of audio chunks and fraud analysis results.
 * Uses WSS (encrypted WebSocket) protocol for security.
 */
class WebSocketClient(
    private val websocketUrl: String
) : IWebSocketClient {
    
    companion object {
        private const val TAG = "WebSocketClient"
        private const val CONNECT_TIMEOUT_SECONDS = 10L
        private const val READ_TIMEOUT_SECONDS = 30L
        private const val WRITE_TIMEOUT_SECONDS = 10L
        
        // Exponential backoff configuration
        private const val INITIAL_BACKOFF_MS = 1000L      // 1 second
        private const val MAX_BACKOFF_MS = 30000L         // 30 seconds
        private const val BACKOFF_MULTIPLIER = 2.0
    }
    
    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .build()
    
    private var webSocket: WebSocket? = null
    private var authToken: String? = null
    private var reconnectAttempts = 0
    private var currentBackoffMs = INITIAL_BACKOFF_MS
    
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    private val _fraudResults = MutableSharedFlow<FraudAnalysisResult>(
        replay = 0,
        extraBufferCapacity = 10,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    private val _offlineNotifications = MutableSharedFlow<String>(
        replay = 0,
        extraBufferCapacity = 5,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    
    override suspend fun connect(authToken: String): Result<Unit> {
        return try {
            if (_connectionState.value == ConnectionState.CONNECTED) {
                return Result.success(Unit)
            }
            
            this.authToken = authToken
            _connectionState.value = ConnectionState.CONNECTING
            
            val request = Request.Builder()
                .url(websocketUrl)
                .addHeader("Authorization", "Bearer $authToken")
                .build()
            
            webSocket = okHttpClient.newWebSocket(request, createWebSocketListener())
            
            Log.d(TAG, "WebSocket connection initiated")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "WebSocket connection failed", e)
            _connectionState.value = ConnectionState.ERROR
            Result.failure(e)
        }
    }
    
    override suspend fun disconnect(): Result<Unit> {
        return try {
            webSocket?.close(1000, "Normal closure")
            webSocket = null
            _connectionState.value = ConnectionState.DISCONNECTED
            Log.d(TAG, "WebSocket disconnected")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "WebSocket disconnect failed", e)
            Result.failure(e)
        }
    }
    
    override suspend fun sendAudioChunk(chunk: AudioChunk): Result<Unit> {
        return try {
            if (_connectionState.value != ConnectionState.CONNECTED) {
                return Result.failure(IllegalStateException("WebSocket not connected"))
            }
            
            // Encode audio data as base64
            val base64Audio = Base64.encodeToString(chunk.data, Base64.NO_WRAP)
            
            // Create JSON message
            val message = JSONObject().apply {
                put("type", "audio_chunk")
                put("timestamp", chunk.timestamp)
                put("audio", base64Audio)
            }
            
            val success = webSocket?.send(message.toString()) ?: false
            
            if (success) {
                Result.success(Unit)
            } else {
                Result.failure(IllegalStateException("Failed to send audio chunk"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send audio chunk", e)
            Result.failure(e)
        }
    }
    
    override fun receiveResults(): Flow<FraudAnalysisResult> = _fraudResults
    
    override fun getConnectionState(): StateFlow<ConnectionState> = _connectionState
    
    /**
     * Get offline notifications for user alerts.
     */
    fun getOfflineNotifications(): Flow<String> = _offlineNotifications
    
    /**
     * Create WebSocket listener for handling events.
     */
    private fun createWebSocketListener() = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.d(TAG, "WebSocket opened")
            _connectionState.value = ConnectionState.CONNECTED
            // Reset backoff on successful connection
            reconnectAttempts = 0
            currentBackoffMs = INITIAL_BACKOFF_MS
        }
        
        override fun onMessage(webSocket: WebSocket, text: String) {
            try {
                val json = JSONObject(text)
                val type = json.optString("type")
                
                when (type) {
                    "fraud_analysis" -> {
                        val result = parseFraudAnalysisResult(json)
                        _fraudResults.tryEmit(result)
                        Log.d(TAG, "Received fraud analysis: ${result.threatLevel}")
                    }
                    else -> {
                        Log.w(TAG, "Unknown message type: $type")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse message", e)
            }
        }
        
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket closing: $code - $reason")
            _connectionState.value = ConnectionState.DISCONNECTED
        }
        
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket closed: $code - $reason")
            _connectionState.value = ConnectionState.DISCONNECTED
        }
        
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "WebSocket failure: ${t.message}", t)
            _connectionState.value = ConnectionState.ERROR
            
            // Emit offline notification
            emitOfflineNotification(t)
            
            // Attempt reconnection with exponential backoff
            attemptReconnection()
        }
    }
    
    /**
     * Attempt reconnection with exponential backoff.
     */
    private fun attemptReconnection() {
        if (authToken == null) {
            Log.w(TAG, "Cannot reconnect: no auth token")
            return
        }
        
        reconnectAttempts++
        
        // Calculate backoff delay
        val delayMs = minOf(
            (currentBackoffMs * Math.pow(BACKOFF_MULTIPLIER, (reconnectAttempts - 1).toDouble())).toLong(),
            MAX_BACKOFF_MS
        )
        
        Log.d(TAG, "Reconnecting in ${delayMs}ms (attempt $reconnectAttempts)")
        
        // Schedule reconnection
        kotlinx.coroutines.GlobalScope.launch {
            kotlinx.coroutines.delay(delayMs)
            
            if (_connectionState.value == ConnectionState.ERROR) {
                Log.d(TAG, "Attempting reconnection...")
                connect(authToken!!)
            }
        }
    }
    
    /**
     * Emit offline notification to inform user that fraud detection is unavailable.
     */
    private fun emitOfflineNotification(error: Throwable) {
        val message = when {
            error.message?.contains("Unable to resolve host") == true -> 
                "No internet connection. Fraud detection unavailable."
            error.message?.contains("timeout") == true -> 
                "Connection timeout. Fraud detection unavailable."
            error.message?.contains("refused") == true -> 
                "Server unavailable. Fraud detection unavailable."
            else -> 
                "Connection failed. Fraud detection unavailable."
        }
        _offlineNotifications.tryEmit(message)
        Log.w(TAG, "Offline notification: $message")
    }
    
    /**
     * Parse fraud analysis result from JSON.
     */
    private fun parseFraudAnalysisResult(json: JSONObject): FraudAnalysisResult {
        val threatLevelStr = json.getString("threatLevel")
        val confidence = json.getDouble("confidence").toFloat()
        val transcription = json.optString("transcription", null)
        val timestamp = json.getLong("timestamp")
        
        val threatLevel = when (threatLevelStr.uppercase()) {
            "SAFE" -> ThreatLevel.SAFE
            "CAUTION" -> ThreatLevel.CAUTION
            "DANGER" -> ThreatLevel.DANGER
            else -> ThreatLevel.SAFE
        }
        
        return FraudAnalysisResult(
            threatLevel = threatLevel,
            confidence = confidence,
            transcription = transcription,
            timestamp = timestamp
        )
    }
}
