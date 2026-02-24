package com.vocalshield.android.repository

import com.vocalshield.android.domain.ThreatLevel
import kotlinx.coroutines.flow.StateFlow

/**
 * Interface for call repository.
 * Orchestrates audio capture, streaming, and alert handling for active calls.
 */
interface ICallRepository {
    /**
     * Start monitoring a call session.
     * @param callId Unique identifier for the call
     * @return Result indicating success or failure
     */
    suspend fun startMonitoring(callId: String): Result<Unit>
    
    /**
     * Stop monitoring the current call session.
     * @return Result indicating success or failure
     */
    suspend fun stopMonitoring(): Result<Unit>
    
    /**
     * Get current threat level.
     * @return StateFlow of current threat level
     */
    fun getCurrentThreatLevel(): StateFlow<ThreatLevel>
    
    /**
     * Get live transcription text.
     * @return StateFlow of transcription text
     */
    fun getTranscription(): StateFlow<String>
    
    /**
     * Check if monitoring is active.
     * @return true if monitoring, false otherwise
     */
    fun isMonitoring(): Boolean
}
