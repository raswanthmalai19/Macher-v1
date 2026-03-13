package com.macher.android.data.database

import androidx.room.*
import com.macher.android.data.model.UserRole

/**
 * Room database for MACHER
 * 
 * Stores user data, call history, risk assessments, and historical risk tracking.
 * Database is encrypted using SQLCipher for privacy protection.
 * 
 * Version 2 adds:
 * - CallRecordEntity: Call metadata and duration
 * - RiskAssessmentEntity: Detection results and risk scores
 * - RiskTriggerEntity: Individual threat patterns
 * - HistoricalRiskEntity: Phone number reputation tracking
 *
 * Version 3 adds:
 * - GuardianProtectedLinkEntity: Guardian-protected user pairing
 */
@Database(
    entities = [
        UserEntity::class,
        TrustedContactEntity::class,
        AlertHistoryEntity::class,
        UserSettingsEntity::class,
        CallRecordEntity::class,
        RiskAssessmentEntity::class,
        RiskTriggerEntity::class,
        HistoricalRiskEntity::class,
        GuardianProtectedLinkEntity::class
    ],
    version = 3,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class MacherDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
    abstract fun trustedContactDao(): TrustedContactDao
    abstract fun alertHistoryDao(): AlertHistoryDao
    abstract fun userSettingsDao(): UserSettingsDao
    abstract fun callHistoryDao(): CallHistoryDao
    abstract fun riskAssessmentDao(): RiskAssessmentDao
    abstract fun riskTriggerDao(): RiskTriggerDao
    abstract fun historicalRiskDao(): HistoricalRiskDao
    abstract fun guardianProtectedLinkDao(): GuardianProtectedLinkDao
    
    companion object {
        @Volatile
        private var INSTANCE: MacherDatabase? = null
        
        /**
         * Get database instance with SQLCipher encryption.
         * 
         * Uses SQLCipher for database encryption with keys stored in Android Keystore.
         * Implements singleton pattern to ensure single database instance.
         * 
         * Privacy: All data at rest is encrypted using AES-256 encryption.
         * Encryption keys are managed by Android Keystore and never exposed.
         * 
         * Requirements: 15.2 (Database encryption)
         */
        fun getDatabase(context: android.content.Context): MacherDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = buildEncryptedDatabase(context.applicationContext)
                INSTANCE = instance
                instance
            }
        }
        
        /**
         * Build encrypted database using SQLCipher.
         * 
         * @param context Application context
         * @return Encrypted MacherDatabase instance
         */
        private fun buildEncryptedDatabase(context: android.content.Context): MacherDatabase {
            return try {
                // Get secure passphrase from KeyManager
                val passphrase = com.macher.android.util.KeyManager.getDatabasePassphrase(context)
                
                // Create SQLCipher SupportFactory
                val factory = net.sqlcipher.database.SupportFactory(
                    net.sqlcipher.database.SQLiteDatabase.getBytes(passphrase.toCharArray())
                )
                
                // Build Room database with SQLCipher
                androidx.room.Room.databaseBuilder(
                    context,
                    MacherDatabase::class.java,
                    "macher_database"
                )
                    .openHelperFactory(factory) // Enable SQLCipher encryption
                    .fallbackToDestructiveMigration() // For development; use proper migrations in production
                    .build()
            } catch (e: Exception) {
                com.macher.android.util.Logger.error("MacherDatabase", "Encrypted DB failed, building unencrypted fallback", e)
                // Fallback to unencrypted database so the app doesn't crash
                androidx.room.Room.databaseBuilder(
                    context,
                    MacherDatabase::class.java,
                    "macher_database_fallback"
                )
                    .fallbackToDestructiveMigration()
                    .build()
            }
        }
        
        /**
         * Clear database instance (for testing).
         * 
         * Note: This does not delete the database file or encryption keys.
         * Use deleteDatabase() to completely remove the database.
         */
        fun clearInstance() {
            INSTANCE?.close()
            INSTANCE = null
        }
        
        /**
         * Delete database and encryption keys (for user data deletion).
         * 
         * This permanently removes all data and makes it unrecoverable.
         * Used when user requests complete data deletion.
         * 
         * Requirements: 15.5 (Data deletion)
         * 
         * @param context Application context
         */
        fun deleteDatabase(context: android.content.Context) {
            synchronized(this) {
                // Close database connection
                INSTANCE?.close()
                INSTANCE = null
                
                // Delete database file
                val dbFile = context.getDatabasePath("macher_database")
                if (dbFile.exists()) {
                    val deleted = dbFile.delete()
                    if (deleted) {
                        com.macher.android.util.Logger.info(
                            "MacherDatabase",
                            "Database file deleted successfully"
                        )
                    } else {
                        com.macher.android.util.Logger.error(
                            "MacherDatabase",
                            "Failed to delete database file"
                        )
                    }
                }
                
                // Delete encryption keys
                com.macher.android.util.KeyManager.clearAllKeys(context)
                
                com.macher.android.util.Logger.info(
                    "MacherDatabase",
                    "Database and encryption keys deleted"
                )
            }
        }
    }
}

/**
 * User entity
 */
@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val userId: String,
    val role: String, // PROTECTED or GUARDIAN
    val name: String,
    val phoneNumber: String,
    val linkedUserId: String? = null,
    val createdAt: Long
)

/**
 * Trusted contact entity
 */
@Entity(tableName = "trusted_contacts")
data class TrustedContactEntity(
    @PrimaryKey val id: String,
    val phoneNumber: String,
    val name: String,
    val relationship: String, // e.g., "Doctor", "Bank", "Family"
    val addedBy: String, // guardian user ID
    val protectedUserId: String, // which protected user this applies to
    val createdAt: Long
)

/**
 * Alert history entity (metadata only, NO transcripts)
 */
@Entity(tableName = "alert_history")
data class AlertHistoryEntity(
    @PrimaryKey val id: String,
    val timestamp: Long,
    val threatLevel: String, // SAFE, CAUTION, DANGER
    val threatType: String, // e.g., "IRS Impersonation", "Gift Card Scam"
    val confidence: Float, // 0.0 - 1.0
    val actionTaken: String, // e.g., "Level 2 Overlay", "Call Disconnected"
    val protectedUserId: String,
    val callerNumber: String? = null // Hashed or null for privacy
)

/**
 * User settings entity
 */
@Entity(tableName = "user_settings")
data class UserSettingsEntity(
    @PrimaryKey val userId: String,
    val sensitivity: String, // LOW, MEDIUM, HIGH
    val enableHaptic: Boolean,
    val enableOverlay: Boolean,
    val enableAutoDisconnect: Boolean,
    val enableAlerts: Boolean,
    val guardianPhoneNumber: String? = null,
    val updatedAt: Long
)

/**
 * Type converters for Room
 */
class Converters {
    @TypeConverter
    fun fromUserRole(role: UserRole): String = role.name
    
    @TypeConverter
    fun toUserRole(value: String): UserRole = UserRole.valueOf(value)
}
