package com.vocalshield.android.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Room entity for Family Loop contacts.
 * Stores trusted contacts who receive fraud alerts.
 */
@Entity(tableName = "family_loop_contacts")
data class FamilyLoopContactEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val phoneNumber: String,
    val email: String?,
    val addedTimestamp: Long
)

/**
 * Domain model for Family Loop contact.
 */
data class Contact(
    val id: String,
    val name: String,
    val phoneNumber: String,
    val email: String?,
    val addedTimestamp: Long
)

/**
 * Extension functions for conversion between entity and domain model.
 */
fun FamilyLoopContactEntity.toDomain(): Contact {
    return Contact(
        id = id,
        name = name,
        phoneNumber = phoneNumber,
        email = email,
        addedTimestamp = addedTimestamp
    )
}

fun Contact.toEntity(): FamilyLoopContactEntity {
    return FamilyLoopContactEntity(
        id = id,
        name = name,
        phoneNumber = phoneNumber,
        email = email,
        addedTimestamp = addedTimestamp
    )
}
