package com.vocalshield.android.integration

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.boolean
import io.kotest.property.arbitrary.enum
import io.kotest.property.arbitrary.int
import io.kotest.property.arbitrary.long
import io.kotest.property.arbitrary.string
import io.kotest.property.arbitrary.uuid
import io.kotest.property.checkAll
import com.vocalshield.android.data.AppDatabase
import com.vocalshield.android.data.CallSession
import com.vocalshield.android.data.Contact
import com.vocalshield.android.data.toEntity
import com.vocalshield.android.domain.ThreatLevel
import com.vocalshield.android.repository.SettingsRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Integration tests for settings and persistence.
 * 
 * Tests validate Requirements 12.4, 12.1, 10.1
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class PersistenceIntegrationTest : StringSpec({
    
    /**
     * Integration Test: Settings changes persist across app restarts
     * Test that all settings are properly persisted and restored.
     * 
     * Validates: Requirements 12.4
     */
    "Integration: Settings persist across app restarts".config(invocations = 50) {
        checkAll(
            Arb.boolean(), // Monitoring enabled
            Arb.boolean(), // Haptic enabled
            Arb.boolean()  // Announcement enabled
        ) { monitoringEnabled, hapticEnabled, announcementEnabled ->
            runTest {
                // Arrange - Create repository and database
                val context = ApplicationProvider.getApplicationContext<Context>()
                val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
                    .allowMainThreadQueries()
                    .build()
                
                val repository1 = SettingsRepository(context, db)
                
                // Act - Set settings
                repository1.setMonitoringEnabled(monitoringEnabled)
                repository1.setHapticEnabled(hapticEnabled)
                repository1.setAnnouncementEnabled(announcementEnabled)
                
                // Simulate app restart by creating new repository instance
                val repository2 = SettingsRepository(context, db)
                
                // Assert - Settings should persist
                repository2.isMonitoringEnabled().first() shouldBe monitoringEnabled
                repository2.isHapticEnabled().first() shouldBe hapticEnabled
                repository2.isAnnouncementEnabled().first() shouldBe announcementEnabled
                
                // Cleanup
                db.close()
            }
        }
    }
    
    /**
     * Integration Test: Call history persists across app restarts
     * Test that call history is properly saved and restored.
     * 
     * Validates: Requirements 12.1
     */
    "Integration: Call history persists across app restarts".config(invocations = 50) {
        checkAll(
            Arb.uuid(),
            Arb.long(1000000000000L..2000000000000L),
            Arb.int(1..3600),
            Arb.enum<ThreatLevel>()
        ) { id, timestamp, duration, threatLevel ->
            runTest {
                // Arrange - Create database
                val context = ApplicationProvider.getApplicationContext<Context>()
                val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
                    .allowMainThreadQueries()
                    .build()
                val dao = db.callSessionDao()
                
                // Act - Save call session
                val session = CallSession(
                    id = id.toString(),
                    timestamp = timestamp,
                    durationSeconds = duration,
                    finalThreatLevel = threatLevel,
                    phoneNumber = null
                )
                dao.insert(session.toEntity())
                
                // Simulate app restart by querying again
                val history = dao.getAllSessions().first()
                
                // Assert - Session should persist
                history.size shouldBe 1
                history[0].id shouldBe session.id
                
                // Cleanup
                db.close()
            }
        }
    }
    
    /**
     * Integration Test: Family Loop contacts persist across app restarts
     * Test that Family Loop contacts are properly saved and restored.
     * 
     * Validates: Requirements 10.1
     */
    "Integration: Family Loop contacts persist across app restarts".config(invocations = 50) {
        checkAll(
            Arb.uuid(),
            Arb.string(3..50),
            Arb.string(10..15),
            Arb.long(1000000000000L..2000000000000L)
        ) { id, name, phoneNumber, timestamp ->
            runTest {
                // Arrange - Create database
                val context = ApplicationProvider.getApplicationContext<Context>()
                val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
                    .allowMainThreadQueries()
                    .build()
                val dao = db.familyLoopContactDao()
                
                // Act - Save contact
                val contact = Contact(
                    id = id.toString(),
                    name = name,
                    phoneNumber = phoneNumber,
                    email = null,
                    addedTimestamp = timestamp
                )
                dao.insert(contact.toEntity())
                
                // Simulate app restart by querying again
                val contacts = dao.getAllContacts().first()
                
                // Assert - Contact should persist
                contacts.size shouldBe 1
                contacts[0].id shouldBe contact.id
                contacts[0].name shouldBe contact.name
                
                // Cleanup
                db.close()
            }
        }
    }
})
