package com.macher.android.data.database

import androidx.room.*

/**
 * Data Access Object for risk assessments
 * 
 * Provides methods to query and insert risk assessment data.
 * Risk assessments are linked to call records via foreign key.
 */
@Dao
interface RiskAssessmentDao {
    /**
     * Get risk assessment for a specific call
     */
    @Query("SELECT * FROM risk_assessments WHERE callId = :callId")
    suspend fun getRiskByCallId(callId: String): RiskAssessmentEntity?
    
    /**
     * Insert a new risk assessment (replaces if ID exists)
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRisk(risk: RiskAssessmentEntity)
    
    /**
     * Get recent risk assessments (last 100)
     */
    @Query("SELECT * FROM risk_assessments ORDER BY timestamp DESC LIMIT 100")
    suspend fun getRecentRisks(): List<RiskAssessmentEntity>
    
    /**
     * Get all risk assessments for a specific risk level
     */
    @Query("SELECT * FROM risk_assessments WHERE riskLevel = :riskLevel ORDER BY timestamp DESC")
    suspend fun getRisksByLevel(riskLevel: String): List<RiskAssessmentEntity>
    
    /**
     * Get high confidence risk assessments (confidence >= threshold)
     */
    @Query("SELECT * FROM risk_assessments WHERE confidence >= :minConfidence ORDER BY timestamp DESC")
    suspend fun getHighConfidenceRisks(minConfidence: Float = 0.8f): List<RiskAssessmentEntity>
    
    /**
     * Get average risk score across all assessments
     */
    @Query("SELECT AVG(totalScore) FROM risk_assessments")
    suspend fun getAverageRiskScore(): Float?
    
    /**
     * Get count of assessments by risk level
     */
    @Query("SELECT COUNT(*) FROM risk_assessments WHERE riskLevel = :riskLevel")
    suspend fun getCountByRiskLevel(riskLevel: String): Int
    
    /**
     * Delete old risk assessments (cleanup)
     */
    @Query("DELETE FROM risk_assessments WHERE timestamp < :timestamp")
    suspend fun deleteOldRisks(timestamp: Long)
}
