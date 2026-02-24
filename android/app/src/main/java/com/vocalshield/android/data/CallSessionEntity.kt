package com.vocalshield.android.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.vocalshield.android.domain.ThreatLevel

/**
 * Room entity for call session metadata.
 * Privacy: NO audio data is stored, only metadata.
 */
@Entity(tableName = "call_sessions")
data class CallSessionEntity(
    @PrimaryKey
    val id: String,
    val timestamp: Long,
    val durationSeconds: Int,
    val finalThreatLevel: String,  // Stored as String for Room compatibility
    val phoneNumber: String?
)

/**
 * Domain model for call session.
 */
data class CallSession(
    val id: String,
    val timestamp: Long,
    val durationSeconds: Int,
    val finalThreatLevel: ThreatLevel,
    val phoneNumber: String?
)

/**
 * Extension functions for conversion between entity and domain model.
 */
fun CallSessionEntity.toDomain(): CallSession {
    return CallSession(
        id = id,
        timestamp = timestamp,
        durationSeconds = durationSeconds,
        finalThreatLevel = ThreatLevel.valueOf(finalThreatLevel),
        phoneNumber = phoneNumber
    )
}

fun CallSession.toEntity(): CallSessionEntity {
    return CallSessionEntity(
        id = id,
        timestamp = timestamp,
        durationSeconds = durationSeconds,
        finalThreatLevel = finalThreatLevel.name,
        phoneNumber = phoneNumber
    )
}
