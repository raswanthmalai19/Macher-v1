package com.vocalshield.android.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

/**
 * DAO for call session operations.
 * Manages call history metadata (no audio data).
 */
@Dao
interface CallSessionDao {
    /**
     * Insert a new call session.
     * @param session Call session entity
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(session: CallSessionEntity)
    
    /**
     * Get all call sessions ordered by timestamp (newest first).
     * Limited to 100 most recent sessions.
     * @return Flow of call session list
     */
    @Query("SELECT * FROM call_sessions ORDER BY timestamp DESC LIMIT 100")
    fun getAllSessions(): Flow<List<CallSessionEntity>>
    
    /**
     * Get call sessions filtered by threat level.
     * @param threatLevel Threat level to filter by
     * @return Flow of filtered call session list
     */
    @Query("SELECT * FROM call_sessions WHERE finalThreatLevel = :threatLevel ORDER BY timestamp DESC")
    fun getSessionsByThreatLevel(threatLevel: String): Flow<List<CallSessionEntity>>
    
    /**
     * Delete all call sessions.
     */
    @Query("DELETE FROM call_sessions")
    suspend fun deleteAll()
    
    /**
     * Get count of call sessions.
     * @return Number of stored sessions
     */
    @Query("SELECT COUNT(*) FROM call_sessions")
    suspend fun getCount(): Int
    
    /**
     * Delete oldest sessions when limit exceeded.
     * Keeps only the 100 most recent sessions.
     */
    @Query("DELETE FROM call_sessions WHERE id NOT IN (SELECT id FROM call_sessions ORDER BY timestamp DESC LIMIT 100)")
    suspend fun deleteOldestSessions()
}
