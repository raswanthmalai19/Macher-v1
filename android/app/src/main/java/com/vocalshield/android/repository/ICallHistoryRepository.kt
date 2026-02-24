package com.vocalshield.android.repository

import com.vocalshield.android.data.CallSession
import kotlinx.coroutines.flow.Flow

/**
 * Interface for call history repository.
 * Manages local storage of call metadata (no audio data).
 */
interface ICallHistoryRepository {
    /**
     * Save a completed call session.
     * @param session Call session metadata
     * @return Result indicating success or failure
     */
    suspend fun saveCallSession(session: CallSession): Result<Unit>
    
    /**
     * Get call history.
     * @return Flow of call session list
     */
    fun getCallHistory(): Flow<List<CallSession>>
    
    /**
     * Clear all call history.
     * @return Result indicating success or failure
     */
    suspend fun clearHistory(): Result<Unit>
}
