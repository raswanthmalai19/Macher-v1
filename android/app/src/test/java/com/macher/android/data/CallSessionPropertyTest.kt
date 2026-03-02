package com.macher.android.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.*
import io.kotest.property.checkAll
import com.macher.android.domain.ThreatLevel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Property-based tests for call session storage.
 * 
 * Tests validate Requirements 12.1, 12.3
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class CallSessionPropertyTest : StringSpec({
    
    /**
     * Property 40: Call history round-trip
     * For any completed call session, saving the session metadata and then
     * retrieving call history should include that session with matching
     * timestamp, duration, and threat level.
     * 
     * Feature: android-mobile-client, Property 40: Call history round-trip
     * Validates: Requirements 12.1, 12.3
     */
    "Property 40: Call history round-trip".config(invocations = 100) {
        checkAll(
            Arb.uuid(),
            Arb.long(1000000000000L..2000000000000L), // Reasonable timestamp range
            Arb.int(1..3600), // Duration 1 second to 1 hour
            Arb.enum<ThreatLevel>(),
            Arb.string(10..15).orNull() // Phone number or null
        ) { id, timestamp, duration, threatLevel, phoneNumber ->
            runTest {
                // Arrange - Create in-memory database
                val context = ApplicationProvider.getApplicationContext<Context>()
                val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
                    .allowMainThreadQueries()
                    .build()
                val dao = db.callSessionDao()
                
                // Create call session
                val session = CallSession(
                    id = id.toString(),
                    timestamp = timestamp,
                    durationSeconds = duration,
                    finalThreatLevel = threatLevel,
                    phoneNumber = phoneNumber
                )
                
                // Act - Save session
                dao.insert(session.toEntity())
                
                // Act - Retrieve call history
                val history = dao.getAllSessions().first()
                
                // Assert - Session should be in history with matching data
                history.size shouldBe 1
                val retrieved = history[0].toDomain()
                retrieved.id shouldBe session.id
                retrieved.timestamp shouldBe session.timestamp
                retrieved.durationSeconds shouldBe session.durationSeconds
                retrieved.finalThreatLevel shouldBe session.finalThreatLevel
                retrieved.phoneNumber shouldBe session.phoneNumber
                
                // Cleanup
                db.close()
            }
        }
    }
})
