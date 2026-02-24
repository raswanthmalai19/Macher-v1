package com.vocalshield.android.domain

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/**
 * Interface for WebSocket communication with AWS backend.
 * Handles bidirectional streaming of audio and fraud analysis results.
 */
interface IWebSocketClient {
    /**
     * Connect to AWS WebSocket API Gateway.
     * @param authToken JWT authentication token
     * @return Result indicating success or failure
     */
    suspend fun connect(authToken: String): Result<Unit>
    
    /**
     * Disconnect from WebSocket gracefully.
     * @return Result indicating success or failure
     */
    suspend fun disconnect(): Result<Unit>
    
    /**
     * Send an audio chunk to the backend.
     * @param chunk Processed audio chunk
     * @return Result indicating success or failure
     */
    suspend fun sendAudioChunk(chunk: AudioChunk): Result<Unit>
    
    /**
     * Receive fraud analysis results from backend.
     * @return Flow emitting fraud analysis results
     */
    fun receiveResults(): Flow<FraudAnalysisResult>
    
    /**
     * Get current connection state.
     * @return StateFlow of connection state
     */
    fun getConnectionState(): StateFlow<ConnectionState>
}

/**
 * Fraud analysis result from backend.
 * @property threatLevel Detected threat level
 * @property confidence Confidence score (0.0 to 1.0)
 * @property transcription Optional transcription text
 * @property timestamp Timestamp of analysis
 */
data class FraudAnalysisResult(
    val threatLevel: ThreatLevel,
    val confidence: Float,
    val transcription: String?,
    val timestamp: Long
)

/**
 * Threat level classification.
 */
enum class ThreatLevel {
    SAFE,      // Green - No threat detected
    CAUTION,   // Yellow - Suspicious activity
    DANGER     // Red - High threat detected
}

/**
 * WebSocket connection state.
 */
enum class ConnectionState {
    DISCONNECTED,  // Not connected
    CONNECTING,    // Connection in progress
    CONNECTED,     // Connected and ready
    ERROR          // Connection error
}
