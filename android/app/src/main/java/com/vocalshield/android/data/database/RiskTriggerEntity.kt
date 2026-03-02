package com.vocalshield.android.data.database

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Risk trigger entity for persisting individual threat patterns
 * 
 * Stores each detected threat pattern (trigger) that contributed to the
 * overall risk assessment. Multiple triggers can be associated with a
 * single risk assessment.
 * 
 * Examples:
 * - METADATA_UNKNOWN_NUMBER: "Unknown caller from international number"
 * - MANIPULATION_URGENCY: "Urgent language detected: 'act now or lose money'"
 * - MANIPULATION_AUTHORITY: "Authority impersonation: claims to be IRS agent"
 * 
 * Foreign key relationship: riskAssessmentId references risk_assessments.id
 */
@Entity(
    tableName = "risk_triggers",
    foreignKeys = [
        ForeignKey(
            entity = RiskAssessmentEntity::class,
            parentColumns = ["id"],
            childColumns = ["riskAssessmentId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["riskAssessmentId"])]
)
data class RiskTriggerEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val riskAssessmentId: String, // Foreign key to risk_assessments
    val category: String, // TriggerCategory enum as string
    val description: String,
    val score: Int,
    val severity: String, // HIGH, MEDIUM, LOW
    val timestamp: Long
)
