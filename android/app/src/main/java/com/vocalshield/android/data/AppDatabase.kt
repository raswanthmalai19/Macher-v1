package com.vocalshield.android.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Room database for VocalShield.
 * Stores call history metadata and Family Loop contacts.
 * 
 * Privacy: NO audio data is stored in this database.
 */
@Database(
    entities = [
        CallSessionEntity::class,
        FamilyLoopContactEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun callSessionDao(): CallSessionDao
    abstract fun familyLoopContactDao(): FamilyLoopContactDao
    
    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null
        
        /**
         * Get database instance (singleton).
         * @param context Application context
         * @return Database instance
         */
        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "vocalshield_database"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
