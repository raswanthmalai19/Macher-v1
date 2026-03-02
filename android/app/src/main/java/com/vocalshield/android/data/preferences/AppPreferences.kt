package com.vocalshield.android.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * MACHER App-level settings preferences using DataStore.
 * Controls monitoring, protection, and notification settings.
 */
class AppPreferences(private val context: Context) {

    private val Context.appSettingsStore: DataStore<Preferences> by preferencesDataStore(
        name = "app_settings"
    )

    companion object {
        // Protection settings
        val KEY_ENABLE_MONITORING       = booleanPreferencesKey("enable_monitoring")
        val KEY_ENABLE_HAPTIC           = booleanPreferencesKey("enable_haptic")
        val KEY_ENABLE_OVERLAY          = booleanPreferencesKey("enable_overlay")
        val KEY_ENABLE_TRANSCRIPTION    = booleanPreferencesKey("enable_transcription")
        val KEY_AUTO_START_MONITORING   = booleanPreferencesKey("auto_start_monitoring")
        val KEY_AUTO_DISCONNECT         = booleanPreferencesKey("auto_disconnect")

        // Notification settings
        val KEY_ENABLE_NOTIFICATIONS    = booleanPreferencesKey("enable_notifications")
        val KEY_ALERT_GUARDIAN          = booleanPreferencesKey("alert_guardian")

        // AI sensitivity (0f=Low, 1f=Medium, 2f=High)
        val KEY_AI_SENSITIVITY          = floatPreferencesKey("ai_sensitivity")

        // Defaults
        const val DEFAULT_SENSITIVITY  = 1f
    }

    // ── Read flows ─────────────────────────────────────────────

    val enableMonitoring: Flow<Boolean> = context.appSettingsStore.data.map { prefs ->
        prefs[KEY_ENABLE_MONITORING] ?: true
    }

    val enableHaptic: Flow<Boolean> = context.appSettingsStore.data.map { prefs ->
        prefs[KEY_ENABLE_HAPTIC] ?: true
    }

    val enableOverlay: Flow<Boolean> = context.appSettingsStore.data.map { prefs ->
        prefs[KEY_ENABLE_OVERLAY] ?: true
    }

    val enableTranscription: Flow<Boolean> = context.appSettingsStore.data.map { prefs ->
        prefs[KEY_ENABLE_TRANSCRIPTION] ?: true
    }

    val autoStartMonitoring: Flow<Boolean> = context.appSettingsStore.data.map { prefs ->
        prefs[KEY_AUTO_START_MONITORING] ?: false
    }

    val autoDisconnect: Flow<Boolean> = context.appSettingsStore.data.map { prefs ->
        prefs[KEY_AUTO_DISCONNECT] ?: false
    }

    val enableNotifications: Flow<Boolean> = context.appSettingsStore.data.map { prefs ->
        prefs[KEY_ENABLE_NOTIFICATIONS] ?: true
    }

    val alertGuardian: Flow<Boolean> = context.appSettingsStore.data.map { prefs ->
        prefs[KEY_ALERT_GUARDIAN] ?: true
    }

    val aiSensitivity: Flow<Float> = context.appSettingsStore.data.map { prefs ->
        prefs[KEY_AI_SENSITIVITY] ?: DEFAULT_SENSITIVITY
    }

    // ── Write operations ───────────────────────────────────────

    suspend fun setEnableMonitoring(value: Boolean) = context.appSettingsStore.edit { prefs ->
        prefs[KEY_ENABLE_MONITORING] = value
    }

    suspend fun setEnableHaptic(value: Boolean) = context.appSettingsStore.edit { prefs ->
        prefs[KEY_ENABLE_HAPTIC] = value
    }

    suspend fun setEnableOverlay(value: Boolean) = context.appSettingsStore.edit { prefs ->
        prefs[KEY_ENABLE_OVERLAY] = value
    }

    suspend fun setEnableTranscription(value: Boolean) = context.appSettingsStore.edit { prefs ->
        prefs[KEY_ENABLE_TRANSCRIPTION] = value
    }

    suspend fun setAutoStartMonitoring(value: Boolean) = context.appSettingsStore.edit { prefs ->
        prefs[KEY_AUTO_START_MONITORING] = value
    }

    suspend fun setAutoDisconnect(value: Boolean) = context.appSettingsStore.edit { prefs ->
        prefs[KEY_AUTO_DISCONNECT] = value
    }

    suspend fun setEnableNotifications(value: Boolean) = context.appSettingsStore.edit { prefs ->
        prefs[KEY_ENABLE_NOTIFICATIONS] = value
    }

    suspend fun setAlertGuardian(value: Boolean) = context.appSettingsStore.edit { prefs ->
        prefs[KEY_ALERT_GUARDIAN] = value
    }

    suspend fun setAiSensitivity(value: Float) = context.appSettingsStore.edit { prefs ->
        prefs[KEY_AI_SENSITIVITY] = value.coerceIn(0f, 2f)
    }

    /** Reset all app settings to factory defaults */
    suspend fun resetToDefaults() = context.appSettingsStore.edit { prefs ->
        prefs[KEY_ENABLE_MONITORING]     = true
        prefs[KEY_ENABLE_HAPTIC]         = true
        prefs[KEY_ENABLE_OVERLAY]        = true
        prefs[KEY_ENABLE_TRANSCRIPTION]  = true
        prefs[KEY_AUTO_START_MONITORING] = false
        prefs[KEY_AUTO_DISCONNECT]       = false
        prefs[KEY_ENABLE_NOTIFICATIONS]  = true
        prefs[KEY_ALERT_GUARDIAN]        = true
        prefs[KEY_AI_SENSITIVITY]        = DEFAULT_SENSITIVITY
    }
}
