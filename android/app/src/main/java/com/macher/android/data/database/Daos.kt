package com.macher.android.data.database

import androidx.room.*
import kotlinx.coroutines.flow.Flow

/**
 * User DAO
 */
@Dao
interface UserDao {
    @Query("SELECT * FROM users WHERE userId = :userId")
    suspend fun getUser(userId: String): UserEntity?
    
    @Query("SELECT * FROM users WHERE userId = :userId")
    fun getUserFlow(userId: String): Flow<UserEntity?>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUser(user: UserEntity)
    
    @Update
    suspend fun updateUser(user: UserEntity)
    
    @Delete
    suspend fun deleteUser(user: UserEntity)
    
    @Query("SELECT * FROM users WHERE role = 'PROTECTED' AND linkedUserId = :guardianId")
    fun getProtectedUsers(guardianId: String): Flow<List<UserEntity>>
}

/**
 * Trusted Contact DAO
 */
@Dao
interface TrustedContactDao {
    @Query("SELECT * FROM trusted_contacts WHERE protectedUserId = :protectedUserId ORDER BY name ASC")
    fun getTrustedContacts(protectedUserId: String): Flow<List<TrustedContactEntity>>
    
    @Query("SELECT * FROM trusted_contacts WHERE id = :id")
    suspend fun getTrustedContact(id: String): TrustedContactEntity?
    
    @Query("SELECT * FROM trusted_contacts WHERE phoneNumber = :phoneNumber AND protectedUserId = :protectedUserId")
    suspend fun getTrustedContactByPhone(phoneNumber: String, protectedUserId: String): TrustedContactEntity?

    @Query("SELECT * FROM trusted_contacts WHERE phoneNumber = :phoneNumber LIMIT 1")
    suspend fun findByPhone(phoneNumber: String): TrustedContactEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTrustedContact(contact: TrustedContactEntity)
    
    @Update
    suspend fun updateTrustedContact(contact: TrustedContactEntity)
    
    @Delete
    suspend fun deleteTrustedContact(contact: TrustedContactEntity)
    
    @Query("DELETE FROM trusted_contacts WHERE protectedUserId = :protectedUserId")
    suspend fun deleteAllForProtectedUser(protectedUserId: String)
}

/**
 * Alert History DAO
 */
@Dao
interface AlertHistoryDao {
    @Query("SELECT * FROM alert_history WHERE protectedUserId = :protectedUserId ORDER BY timestamp DESC LIMIT :limit")
    fun getAlertHistory(protectedUserId: String, limit: Int = 100): Flow<List<AlertHistoryEntity>>
    
    @Query("SELECT * FROM alert_history WHERE protectedUserId = :protectedUserId AND threatLevel = :threatLevel ORDER BY timestamp DESC")
    fun getAlertHistoryByThreatLevel(protectedUserId: String, threatLevel: String): Flow<List<AlertHistoryEntity>>
    
    @Query("SELECT * FROM alert_history WHERE id = :id")
    suspend fun getAlert(id: String): AlertHistoryEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAlert(alert: AlertHistoryEntity)
    
    @Query("DELETE FROM alert_history WHERE timestamp < :timestamp")
    suspend fun deleteOldAlerts(timestamp: Long)
    
    @Query("SELECT COUNT(*) FROM alert_history WHERE protectedUserId = :protectedUserId AND threatLevel = 'DANGER'")
    fun getDangerAlertCount(protectedUserId: String): Flow<Int>
    
    @Query("SELECT COUNT(*) FROM alert_history WHERE protectedUserId = :protectedUserId AND timestamp > :since")
    fun getRecentAlertCount(protectedUserId: String, since: Long): Flow<Int>
}

/**
 * User Settings DAO
 */
@Dao
interface UserSettingsDao {
    @Query("SELECT * FROM user_settings WHERE userId = :userId")
    suspend fun getSettings(userId: String): UserSettingsEntity?
    
    @Query("SELECT * FROM user_settings WHERE userId = :userId")
    fun getSettingsFlow(userId: String): Flow<UserSettingsEntity?>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSettings(settings: UserSettingsEntity)
    
    @Update
    suspend fun updateSettings(settings: UserSettingsEntity)
    
    @Query("UPDATE user_settings SET sensitivity = :sensitivity WHERE userId = :userId")
    suspend fun updateSensitivity(userId: String, sensitivity: String)
    
    @Query("UPDATE user_settings SET enableHaptic = :enable WHERE userId = :userId")
    suspend fun updateHapticEnabled(userId: String, enable: Boolean)
    
    @Query("UPDATE user_settings SET enableOverlay = :enable WHERE userId = :userId")
    suspend fun updateOverlayEnabled(userId: String, enable: Boolean)
    
    @Query("UPDATE user_settings SET enableAutoDisconnect = :enable WHERE userId = :userId")
    suspend fun updateAutoDisconnectEnabled(userId: String, enable: Boolean)
    
    @Query("UPDATE user_settings SET enableAlerts = :enable WHERE userId = :userId")
    suspend fun updateAlertsEnabled(userId: String, enable: Boolean)
}
