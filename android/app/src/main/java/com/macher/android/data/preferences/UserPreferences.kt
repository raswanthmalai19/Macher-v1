package com.macher.android.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import com.macher.android.data.model.UserRole
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

// Top-level singleton delegate – guarantees only one DataStore instance per process
private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "user_prefs")

/**
 * User preferences using DataStore
 */
class UserPreferences(private val context: Context) {
    
    companion object {
        private val USER_ID = stringPreferencesKey("user_id")
        private val USER_ROLE = stringPreferencesKey("user_role")
        private val USER_NAME = stringPreferencesKey("user_name")
        private val USER_PHONE = stringPreferencesKey("user_phone")
        private val LINKED_USER_ID = stringPreferencesKey("linked_user_id")
        private val ONBOARDING_COMPLETE = booleanPreferencesKey("onboarding_complete")
        private val CURRENT_APP_MODE = stringPreferencesKey("current_app_mode")
        private val IS_DARK_THEME = booleanPreferencesKey("is_dark_theme")
        // Role-scoped name/phone so Guardian and Protected profiles stay separate
        private val GUARDIAN_NAME = stringPreferencesKey("guardian_name")
        private val GUARDIAN_PHONE = stringPreferencesKey("guardian_phone")
        private val PROTECTED_NAME = stringPreferencesKey("protected_name")
        private val PROTECTED_PHONE = stringPreferencesKey("protected_phone")
    }
    
    /**
     * Get user ID
     */
    val userId: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[USER_ID]
    }
    
    /**
     * Get user role
     */
    val userRole: Flow<UserRole> = context.dataStore.data.map { prefs ->
        val roleString = prefs[USER_ROLE] ?: UserRole.NOT_SET.name
        try {
            UserRole.valueOf(roleString)
        } catch (e: IllegalArgumentException) {
            UserRole.NOT_SET
        }
    }
    
    /**
     * Get user name
     */
    val userName: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[USER_NAME]
    }
    
    /**
     * Get user phone
     */
    val userPhone: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[USER_PHONE]
    }
    
    /**
     * Get linked user ID
     */
    val linkedUserId: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[LINKED_USER_ID]
    }
    
    /**
     * Check if onboarding is complete
     */
    val isOnboardingComplete: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[ONBOARDING_COMPLETE] ?: false
    }
    
    /**
     * Get current app mode
     */
    val currentAppMode: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[CURRENT_APP_MODE]
    }
    
    /**
     * Save user profile
     */
    suspend fun saveUserProfile(
        userId: String,
        role: UserRole,
        name: String,
        phone: String,
        linkedUserId: String? = null
    ) {
        context.dataStore.edit { prefs ->
            prefs[USER_ID] = userId
            prefs[USER_ROLE] = role.name
            prefs[USER_NAME] = name
            prefs[USER_PHONE] = phone
            linkedUserId?.let { prefs[LINKED_USER_ID] = it }
        }
    }
    
    /**
     * Theme preference (true = dark, false = light). Defaults to dark.
     */
    val isDarkTheme: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[IS_DARK_THEME] ?: true
    }

    /**
     * Update user role
     */
    suspend fun updateUserRole(role: UserRole) {
        context.dataStore.edit { prefs ->
            prefs[USER_ROLE] = role.name
        }
    }

    /**
     * Update user name
     */
    suspend fun updateUserName(name: String) {
        context.dataStore.edit { prefs ->
            prefs[USER_NAME] = name
        }
    }

    /**
     * Update user phone
     */
    suspend fun updateUserPhone(phone: String) {
        context.dataStore.edit { prefs ->
            prefs[USER_PHONE] = phone
        }
    }

    /**
     * Set dark/light theme preference
     */
    suspend fun setDarkTheme(isDark: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[IS_DARK_THEME] = isDark
        }
    }

    /**
     * Link user accounts
     */
    suspend fun linkUser(linkedUserId: String) {
        context.dataStore.edit { prefs ->
            prefs[LINKED_USER_ID] = linkedUserId
        }
    }

    /**
     * Complete onboarding
     */
    suspend fun completeOnboarding() {
        context.dataStore.edit { prefs ->
            prefs[ONBOARDING_COMPLETE] = true
        }
    }

    /**
     * Set current app mode
     */
    suspend fun setAppMode(mode: String) {
        context.dataStore.edit { prefs ->
            prefs[CURRENT_APP_MODE] = mode
        }
    }

    /**
     * Clear all preferences (logout / reset)
     */
    suspend fun clear() {
        context.dataStore.edit { prefs ->
            prefs.clear()
        }
    }

    // ── Role-specific profile ─────────────────────────────────────────────────

    /** Returns the name stored for the given role (falls back to generic USER_NAME). */
    fun userNameForRole(role: UserRole): Flow<String?> = context.dataStore.data.map { prefs ->
        when (role) {
            UserRole.GUARDIAN  -> prefs[GUARDIAN_NAME]  ?: prefs[USER_NAME]
            UserRole.PROTECTED -> prefs[PROTECTED_NAME] ?: prefs[USER_NAME]
            else               -> prefs[USER_NAME]
        }
    }

    /** Returns the phone stored for the given role (falls back to generic USER_PHONE). */
    fun userPhoneForRole(role: UserRole): Flow<String?> = context.dataStore.data.map { prefs ->
        when (role) {
            UserRole.GUARDIAN  -> prefs[GUARDIAN_PHONE]  ?: prefs[USER_PHONE]
            UserRole.PROTECTED -> prefs[PROTECTED_PHONE] ?: prefs[USER_PHONE]
            else               -> prefs[USER_PHONE]
        }
    }

    /**
     * Save name + phone for the given role AND to the generic key.
     * Also generates a userId if one hasn't been assigned yet.
     */
    suspend fun saveProfileForRole(name: String, phone: String, role: UserRole) {
        context.dataStore.edit { prefs ->
            prefs[USER_NAME] = name
            prefs[USER_PHONE] = phone
            when (role) {
                UserRole.GUARDIAN -> {
                    prefs[GUARDIAN_NAME]  = name
                    prefs[GUARDIAN_PHONE] = phone
                }
                UserRole.PROTECTED -> {
                    prefs[PROTECTED_NAME]  = name
                    prefs[PROTECTED_PHONE] = phone
                }
                else -> {}
            }
            // Ensure every user has a stable ID
            if (prefs[USER_ID] == null) {
                prefs[USER_ID] = java.util.UUID.randomUUID().toString()
            }
        }
    }
}
