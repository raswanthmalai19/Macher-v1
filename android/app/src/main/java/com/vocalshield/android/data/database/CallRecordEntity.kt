package com.vocalshield.android.data.database

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

/**
 * Call record entity for persisting call metadata
 * 
 * Stores basic information about monitored calls including phone number,
 * timestamp, duration, and whether the call was blocked.
 * 
 * Privacy: Phone numbers are stored but should be hashed in logs.
 * No audio data or transcription text is stored.
 * 
 * Performance: Indexes on phoneNumber and timestamp for efficient queries (Task 10.2)
 */
@Entity(
    tableName = "call_records",
    indices = [
        Index(value = ["phoneNumber"]),
        Index(value = ["timestamp"]),
        Index(value = ["wasBlocked"])
    ]
)
data class CallRecordEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val phoneNumber: String,
    val callerName: String?,
    val timestamp: Long,
    val duration: Int, // seconds
    val wasBlocked: Boolean,
    val userReported: Boolean = false
)
