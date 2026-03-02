package com.macher.android.data.database

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Historical risk entity for tracking phone number reputation
 * 
 * Aggregates risk data for each phone number across multiple calls.
 * Used to identify repeat scammers and improve detection accuracy.
 * 
 * Key metrics:
 * - totalCalls: Total number of calls from this number
 * - scamCalls: Number of calls identified as scams (HIGH risk)
 * - averageRiskScore: Running average of risk scores
 * - isBlacklisted: True if scam rate >= 50% or high confidence scammer
 * 
 * Privacy: Phone numbers stored but hashed in logs. No transcription data.
 */
@Entity(tableName = "historical_risks")
data class HistoricalRiskEntity(
    @PrimaryKey val phoneNumber: String,
    val totalCalls: Int,
    val scamCalls: Int,
    val averageRiskScore: Float,
    val lastCallTime: Long,
    val lastRiskLevel: String, // HIGH, MEDIUM, LOW
    val isBlacklisted: Boolean = false
)
