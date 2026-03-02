package com.vocalshield.android.data.database

import androidx.room.*

/**
 * Data Access Object for call records
 * 
 * Provides methods to query, insert, and manage call history.
 * All methods are suspend functions for coroutine support.
 */
@Dao
interface CallHistoryDao {
    /**
     * Get all call records ordered by most recent first
     */
    @Query("SELECT * FROM call_records ORDER BY timestamp DESC")
    suspend fun getAllCalls(): List<CallRecordEntity>
    
    /**
     * Get a specific call record by ID
     */
    @Query("SELECT * FROM call_records WHERE id = :callId")
    suspend fun getCallById(callId: String): CallRecordEntity?
    
    /**
     * Insert a new call record (replaces if ID exists)
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCall(call: CallRecordEntity)
    
    /**
     * Get all calls from a specific phone number, ordered by most recent first
     */
    @Query("SELECT * FROM call_records WHERE phoneNumber = :phoneNumber ORDER BY timestamp DESC")
    suspend fun getCallsByNumber(phoneNumber: String): List<CallRecordEntity>
    
    /**
     * Get paginated call records for efficient loading
     * @param limit Number of records to return
     * @param offset Starting position
     */
    @Query("SELECT * FROM call_records ORDER BY timestamp DESC LIMIT :limit OFFSET :offset")
    suspend fun getCallsPaginated(limit: Int = 50, offset: Int = 0): List<CallRecordEntity>
    
    /**
     * Get calls filtered by risk level
     * Requires join with risk_assessments table
     */
    @Query("""
        SELECT cr.* FROM call_records cr
        INNER JOIN risk_assessments ra ON cr.id = ra.callId
        WHERE ra.riskLevel = :riskLevel
        ORDER BY cr.timestamp DESC
    """)
    suspend fun getCallsByRiskLevel(riskLevel: String): List<CallRecordEntity>
    
    /**
     * Get calls within a date range
     */
    @Query("""
        SELECT * FROM call_records 
        WHERE timestamp >= :startTime AND timestamp <= :endTime
        ORDER BY timestamp DESC
    """)
    suspend fun getCallsByDateRange(startTime: Long, endTime: Long): List<CallRecordEntity>
    
    /**
     * Delete a specific call record (cascades to risk assessments and triggers)
     */
    @Delete
    suspend fun deleteCall(call: CallRecordEntity)
    
    /**
     * Delete all call records (for privacy/data deletion)
     */
    @Query("DELETE FROM call_records")
    suspend fun deleteAllCalls()
}
