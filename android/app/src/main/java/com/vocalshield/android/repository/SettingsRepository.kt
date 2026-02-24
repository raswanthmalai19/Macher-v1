package com.vocalshield.android.repository

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.vocalshield.android.data.AppDatabase
import com.vocalshield.android.data.Contact
import com.vocalshield.android.data.toDomain
import com.vocalshield.android.data.toEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/**
 * Repository for managing user settings, consent, and Family Loop configuration.
 * Uses EncryptedSharedPreferences for sensitive data.
 */
class SettingsRepository(
    private val context: Context,
    private val database: AppDatabase
) : ISettingsRepository {
    
    companion object {
        private const val PREFS_NAME = "vocalshield_settings"
        private const val KEY_MONITORING_ENABLED = "monitoring_enabled"
        private const val KEY_USER_CONSENT = "user_consent"
        private const val KEY_CONSENT_TIMESTAMP = "consent_timestamp"
        private const val KEY_HAPTIC_ENABLED = "haptic_enabled"
        private const val KEY_ANNOUNCEMENT_ENABLED = "announcement_enabled"
        private const val KEY_NOTIFICATION_ENABLED = "notification_enabled"
        private const val KEY_TRANSCRIPTION_ENABLED = "transcription_enabled"
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_USER_EMAIL = "user_email"
        private const val KEY_USER_ID = "user_id"
        private const val MAX_FAMILY_LOOP_CONTACTS = 5
    }
    
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    
    private val encryptedPrefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    // StateFlows for reactive settings
    private val _monitoringEnabled = MutableStateFlow(
        encryptedPrefs.getBoolean(KEY_MONITORING_ENABLED, false)
    )
    
    private val _hapticEnabled = MutableStateFlow(
        encryptedPrefs.getBoolean(KEY_HAPTIC_ENABLED, true)
    )
    
    private val _announcementEnabled = MutableStateFlow(
        encryptedPrefs.getBoolean(KEY_ANNOUNCEMENT_ENABLED, true)
    )
    
    override fun isMonitoringEnabled(): Flow<Boolean> = _monitoringEnabled
    
    override fun setMonitoringEnabled(enabled: Boolean) {
        encryptedPrefs.edit().putBoolean(KEY_MONITORING_ENABLED, enabled).apply()
        _monitoringEnabled.value = enabled
    }
    
    override fun hasUserConsent(): Boolean {
        return encryptedPrefs.getBoolean(KEY_USER_CONSENT, false)
    }
    
    override fun recordConsent(timestamp: Long) {
        encryptedPrefs.edit()
            .putBoolean(KEY_USER_CONSENT, true)
            .putLong(KEY_CONSENT_TIMESTAMP, timestamp)
            .apply()
    }
    
    override fun isHapticEnabled(): Flow<Boolean> = _hapticEnabled
    
    override fun setHapticEnabled(enabled: Boolean) {
        encryptedPrefs.edit().putBoolean(KEY_HAPTIC_ENABLED, enabled).apply()
        _hapticEnabled.value = enabled
    }
    
    override fun isAnnouncementEnabled(): Flow<Boolean> = _announcementEnabled
    
    override fun setAnnouncementEnabled(enabled: Boolean) {
        encryptedPrefs.edit().putBoolean(KEY_ANNOUNCEMENT_ENABLED, enabled).apply()
        _announcementEnabled.value = enabled
    }
    
    override fun getFamilyLoopContacts(): Flow<List<Contact>> {
        return database.familyLoopContactDao()
            .getAllContacts()
            .map { entities -> entities.map { it.toDomain() } }
    }
    
    override fun addFamilyLoopContact(contact: Contact): Result<Unit> {
        return try {
            // Check contact limit
            val currentCount = database.familyLoopContactDao().getCount()
            if (currentCount >= MAX_FAMILY_LOOP_CONTACTS) {
                return Result.failure(
                    IllegalStateException("Maximum $MAX_FAMILY_LOOP_CONTACTS Family Loop contacts allowed")
                )
            }
            
            // Insert contact
            kotlinx.coroutines.runBlocking {
                database.familyLoopContactDao().insert(contact.toEntity())
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    override fun removeFamilyLoopContact(contactId: String): Result<Unit> {
        return try {
            kotlinx.coroutines.runBlocking {
                database.familyLoopContactDao().deleteById(contactId)
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    /**
     * Store auth token securely using EncryptedSharedPreferences.
     */
    fun setAuthToken(token: String) {
        encryptedPrefs.edit().putString(KEY_AUTH_TOKEN, token).apply()
    }
    
    /**
     * Retrieve auth token from encrypted storage.
     */
    fun getAuthToken(): String? {
        return encryptedPrefs.getString(KEY_AUTH_TOKEN, null)
    }
    
    /**
     * Store user credentials securely using EncryptedSharedPreferences.
     */
    fun setUserCredentials(userId: String, email: String) {
        encryptedPrefs.edit()
            .putString(KEY_USER_ID, userId)
            .putString(KEY_USER_EMAIL, email)
            .apply()
    }
    
    /**
     * Retrieve user ID from encrypted storage.
     */
    fun getUserId(): String? {
        return encryptedPrefs.getString(KEY_USER_ID, null)
    }
    
    /**
     * Retrieve user email from encrypted storage.
     */
    fun getUserEmail(): String? {
        return encryptedPrefs.getString(KEY_USER_EMAIL, null)
    }
    
    /**
     * Clear all auth tokens and credentials (for logout).
     */
    fun clearAuthData() {
        encryptedPrefs.edit()
            .remove(KEY_AUTH_TOKEN)
            .remove(KEY_USER_ID)
            .remove(KEY_USER_EMAIL)
            .apply()
    }
}
