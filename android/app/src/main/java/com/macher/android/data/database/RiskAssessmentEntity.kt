package com.macher.android.data.database

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

/**
 * Risk assessment entity for persisting detection results
 * 
 * Stores the complete risk analysis for a call including:
 * - Total risk score and level (HIGH, MEDIUM, LOW)
 * - Confidence level (0.0 - 1.0)
 * - Layer contributions (metadata, manipulation, historical)
 * - Primary threat category and human-readable explanation
 * 
 * Foreign key relationship: callId references call_records.id
 * Performance: Indexes on callId, riskLevel, and timestamp for efficient queries (Task 10.2)
 */
@Entity(
    tableName = "risk_assessments",
    foreignKeys = [
        ForeignKey(
            entity = CallRecordEntity::class,
            parentColumns = ["id"],
            childColumns = ["callId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["callId"]),
        Index(value = ["riskLevel"]),
        Index(value = ["timestamp"]),
        Index(value = ["confidence"])
    ]
)
data class RiskAssessmentEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val callId: String, // Foreign key to call_records
    val totalScore: Float,
    val riskLevel: String, // HIGH, MEDIUM, LOW
    val confidence: Float,
    val metadataScore: Float,
    val manipulationScore: Float,
    val historicalScore: Float,
    val primaryThreat: String,
    val explanation: String,
    val timestamp: Long
)
