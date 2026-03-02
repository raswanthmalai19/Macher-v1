package com.macher.android.data.database

import androidx.room.*

/**
 * Data Access Object for historical risk data
 * 
 * Provides methods to track and query phone number reputation
 * across multiple calls. Used for identifying repeat scammers
 * and improving detection accuracy.
 */
@Dao
interface HistoricalRiskDao {
    /**
     * Get historical risk data for a specific phone number
     */
    @Query("SELECT * FROM historical_risks WHERE phoneNumber = :phoneNumber")
    suspend fun getHistoricalRisk(phoneNumber: String): HistoricalRiskEntity?
    
    /**
     * Insert or update historical risk data
     * Uses REPLACE strategy to update existing records
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdateHistoricalRisk(risk: HistoricalRiskEntity)
    
    /**
     * Get all blacklisted phone numbers
     */
    @Query("SELECT * FROM historical_risks WHERE isBlacklisted = 1 ORDER BY lastCallTime DESC")
    suspend fun getBlacklistedNumbers(): List<HistoricalRiskEntity>
    
    /**
     * Get phone numbers with high scam rates (scamCalls / totalCalls >= threshold)
     */
    @Query("""
        SELECT * FROM historical_risks 
        WHERE (CAST(scamCalls AS FLOAT) / CAST(totalCalls AS FLOAT)) >= :threshold
        ORDER BY averageRiskScore DESC
    """)
    suspend fun getHighRiskNumbers(threshold: Float = 0.5f): List<HistoricalRiskEntity>
    
    /**
     * Get phone numbers with multiple calls
     */
    @Query("SELECT * FROM historical_risks WHERE totalCalls >= :minCalls ORDER BY totalCalls DESC")
    suspend fun getFrequentCallers(minCalls: Int = 3): List<HistoricalRiskEntity>
    
    /**
     * Get total number of blacklisted numbers
     */
    @Query("SELECT COUNT(*) FROM historical_risks WHERE isBlacklisted = 1")
    suspend fun getBlacklistCount(): Int
    
    /**
     * Get total number of tracked phone numbers
     */
    @Query("SELECT COUNT(*) FROM historical_risks")
    suspend fun getTotalTrackedNumbers(): Int
    
    /**
     * Update blacklist status for a phone number
     */
    @Query("UPDATE historical_risks SET isBlacklisted = :isBlacklisted WHERE phoneNumber = :phoneNumber")
    suspend fun updateBlacklistStatus(phoneNumber: String, isBlacklisted: Boolean)
    
    /**
     * Delete historical risk data for a phone number
     */
    @Query("DELETE FROM historical_risks WHERE phoneNumber = :phoneNumber")
    suspend fun deleteHistoricalRisk(phoneNumber: String)
    
    /**
     * Delete all historical risk data (for privacy/data deletion)
     */
    @Query("DELETE FROM historical_risks")
    suspend fun deleteAllHistoricalRisks()
    
    /**
     * Get recently active numbers (called within time window)
     */
    @Query("""
        SELECT * FROM historical_risks 
        WHERE lastCallTime >= :sinceTimestamp 
        ORDER BY lastCallTime DESC
    """)
    suspend fun getRecentlyActiveNumbers(sinceTimestamp: Long): List<HistoricalRiskEntity>
}
