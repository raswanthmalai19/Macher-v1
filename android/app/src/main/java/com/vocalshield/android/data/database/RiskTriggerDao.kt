package com.vocalshield.android.data.database

import androidx.room.*

/**
 * Data Access Object for risk triggers
 * 
 * Provides methods to query and insert individual threat patterns
 * detected during risk assessment. Triggers are linked to risk
 * assessments via foreign key.
 */
@Dao
interface RiskTriggerDao {
    /**
     * Get all triggers for a specific risk assessment
     */
    @Query("SELECT * FROM risk_triggers WHERE riskAssessmentId = :riskId ORDER BY score DESC")
    suspend fun getTriggersByRiskId(riskId: String): List<RiskTriggerEntity>
    
    /**
     * Insert multiple triggers in a batch
     */
    @Insert
    suspend fun insertTriggers(triggers: List<RiskTriggerEntity>)
    
    /**
     * Insert a single trigger
     */
    @Insert
    suspend fun insertTrigger(trigger: RiskTriggerEntity)
    
    /**
     * Get all triggers of a specific category
     */
    @Query("SELECT * FROM risk_triggers WHERE category = :category ORDER BY timestamp DESC")
    suspend fun getTriggersByCategory(category: String): List<RiskTriggerEntity>
    
    /**
     * Get triggers by severity level
     */
    @Query("SELECT * FROM risk_triggers WHERE severity = :severity ORDER BY timestamp DESC")
    suspend fun getTriggersBySeverity(severity: String): List<RiskTriggerEntity>
    
    /**
     * Get count of triggers by category (for statistics)
     * Returns a list of category-count pairs
     */
    @Query("SELECT category, COUNT(*) as count FROM risk_triggers GROUP BY category")
    suspend fun getTriggerCountsByCategory(): List<TriggerCategoryCount>
    
    /**
     * Get most common trigger categories
     */
    @Query("""
        SELECT category, COUNT(*) as count 
        FROM risk_triggers 
        GROUP BY category 
        ORDER BY count DESC 
        LIMIT :limit
    """)
    suspend fun getTopTriggerCategories(limit: Int = 10): List<TriggerCategoryCount>
    
    /**
     * Delete triggers for a specific risk assessment
     * (Usually handled by cascade delete, but provided for explicit control)
     */
    @Query("DELETE FROM risk_triggers WHERE riskAssessmentId = :riskId")
    suspend fun deleteTriggersByRiskId(riskId: String)
}

/**
 * Data class for trigger category statistics
 */
data class TriggerCategoryCount(
    val category: String,
    val count: Int
)
