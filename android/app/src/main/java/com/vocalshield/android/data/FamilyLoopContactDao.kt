package com.vocalshield.android.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

/**
 * DAO for Family Loop contact operations.
 * Manages trusted contacts who receive fraud alerts.
 */
@Dao
interface FamilyLoopContactDao {
    /**
     * Insert a new Family Loop contact.
     * @param contact Contact entity
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(contact: FamilyLoopContactEntity)
    
    /**
     * Get all Family Loop contacts.
     * @return Flow of contact list
     */
    @Query("SELECT * FROM family_loop_contacts ORDER BY addedTimestamp DESC")
    fun getAllContacts(): Flow<List<FamilyLoopContactEntity>>
    
    /**
     * Delete a Family Loop contact by ID.
     * @param contactId ID of contact to delete
     */
    @Query("DELETE FROM family_loop_contacts WHERE id = :contactId")
    suspend fun deleteById(contactId: String)
    
    /**
     * Get count of Family Loop contacts.
     * @return Number of stored contacts
     */
    @Query("SELECT COUNT(*) FROM family_loop_contacts")
    suspend fun getCount(): Int
    
    /**
     * Delete all Family Loop contacts.
     */
    @Query("DELETE FROM family_loop_contacts")
    suspend fun deleteAll()
}
