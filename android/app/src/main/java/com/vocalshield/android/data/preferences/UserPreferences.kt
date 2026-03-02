package com.vocalshield.android.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import com.vocalshield.android.data.model.UserRole
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * User preferences using DataStore
 */
class UserPreferences(private val context: Context) {
    
    private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "user_prefs")
    
    companion object {
        private val USER_ID = stringPreferencesKey("user_id")
        private val USER_ROLE = stringPreferencesKey("user_role")
        private val USER_NAME = stringPreferencesKey("user_name")
        private val USER_PHONE = stringPreferencesKey("user_phone")
        private val LINKED_USER_ID = stringPreferencesKey("linked_user_id")
        private val ONBOARDING_COMPLETE = booleanPreferencesKey("onboarding_complete")
        private val CURRENT_APP_MODE = stringPreferencesKey("current_app_mode")
        private val IS_DARK_THEME = booleanPreferencesKey("is_dark_theme")
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
}
