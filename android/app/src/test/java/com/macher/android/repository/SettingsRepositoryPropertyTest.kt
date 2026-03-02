package com.macher.android.repository

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.boolean
import io.kotest.property.arbitrary.long
import io.kotest.property.checkAll
import com.macher.android.data.AppDatabase
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Property-based tests for settings persistence.
 * 
 * Tests validate Requirements 12.4, 4.3
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class SettingsRepositoryPropertyTest : StringSpec({
    
    /**
     * Property 41: Settings persistence
     * For any settings change, the new value should be persisted to storage
     * and retrievable after app restart.
     * 
     * Feature: android-mobile-client, Property 41: Settings persistence
     * Validates: Requirements 12.4
     */
    "Property 41: Settings persistence".config(invocations = 100) {
        checkAll(
            Arb.boolean(),
            Arb.boolean(),
            Arb.boolean()
        ) { monitoringEnabled, hapticEnabled, announcementEnabled ->
            runTest {
                // Arrange - Create repository
                val context = ApplicationProvider.getApplicationContext<Context>()
                val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
                    .allowMainThreadQueries()
                    .build()
                
                val repository1 = SettingsRepository(context, db)
                
                // Act - Set settings
                repository1.setMonitoringEnabled(monitoringEnabled)
                repository1.setHapticEnabled(hapticEnabled)
                repository1.setAnnouncementEnabled(announcementEnabled)
                
                // Act - Create new repository instance (simulating app restart)
                val repository2 = SettingsRepository(context, db)
                
                // Assert - Settings should persist across instances
                repository2.isMonitoringEnabled().first() shouldBe monitoringEnabled
                repository2.isHapticEnabled().first() shouldBe hapticEnabled
                repository2.isAnnouncementEnabled().first() shouldBe announcementEnabled
                
                // Cleanup
                db.close()
            }
        }
    }
    
    /**
     * Property 14: Consent timestamp recording
     * For any user action enabling monitoring, a consent timestamp should be
     * persisted to storage within 1 second.
     * 
     * Feature: android-mobile-client, Property 14: Consent timestamp recording
     * Validates: Requirements 4.3
     */
    "Property 14: Consent timestamp recording".config(invocations = 100) {
        checkAll(
            Arb.long(1000000000000L..2000000000000L) // Reasonable timestamp range
        ) { timestamp ->
            runTest {
                // Arrange - Create repository
                val context = ApplicationProvider.getApplicationContext<Context>()
                val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
                    .allowMainThreadQueries()
                    .build()
                
                val repository = SettingsRepository(context, db)
                
                // Act - Record consent
                val startTime = System.currentTimeMillis()
                repository.recordConsent(timestamp)
                val endTime = System.currentTimeMillis()
                
                // Assert - Consent should be recorded within 1 second
                val recordingTime = endTime - startTime
                recordingTime shouldBe { it < 1000 }
                
                // Assert - Consent should be retrievable
                repository.hasUserConsent() shouldBe true
                
                // Cleanup
                db.close()
            }
        }
    }
})
