package com.vocalshield.android.repository

import com.vocalshield.android.data.Contact
import kotlinx.coroutines.flow.Flow

/**
 * Interface for settings repository.
 * Manages user preferences, consent, and Family Loop configuration.
 */
interface ISettingsRepository {
    /**
     * Check if monitoring is enabled.
     * @return Flow of monitoring enabled state
     */
    fun isMonitoringEnabled(): Flow<Boolean>
    
    /**
     * Enable or disable monitoring.
     * @param enabled true to enable, false to disable
     */
    fun setMonitoringEnabled(enabled: Boolean)
    
    /**
     * Check if user has granted consent.
     * @return true if consent granted, false otherwise
     */
    fun hasUserConsent(): Boolean
    
    /**
     * Record user consent with timestamp.
     * @param timestamp Timestamp of consent
     */
    fun recordConsent(timestamp: Long)
    
    /**
     * Check if haptic feedback is enabled.
     * @return Flow of haptic enabled state
     */
    fun isHapticEnabled(): Flow<Boolean>
    
    /**
     * Enable or disable haptic feedback.
     * @param enabled true to enable, false to disable
     */
    fun setHapticEnabled(enabled: Boolean)
    
    /**
     * Check if call announcement is enabled.
     * @return Flow of announcement enabled state
     */
    fun isAnnouncementEnabled(): Flow<Boolean>
    
    /**
     * Enable or disable call announcement.
     * @param enabled true to enable, false to disable
     */
    fun setAnnouncementEnabled(enabled: Boolean)
    
    /**
     * Get Family Loop contacts.
     * @return Flow of contact list
     */
    fun getFamilyLoopContacts(): Flow<List<Contact>>
    
    /**
     * Add a Family Loop contact.
     * @param contact Contact to add
     * @return Result indicating success or failure
     */
    fun addFamilyLoopContact(contact: Contact): Result<Unit>
    
    /**
     * Remove a Family Loop contact.
     * @param contactId ID of contact to remove
     * @return Result indicating success or failure
     */
    fun removeFamilyLoopContact(contactId: String): Result<Unit>
}
