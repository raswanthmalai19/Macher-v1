package com.macher.android.repository

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.ints.shouldBeLessThanOrEqual
import io.kotest.matchers.shouldBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.*
import io.kotest.property.checkAll
import com.macher.android.data.AppDatabase
import com.macher.android.data.CallSession
import com.macher.android.data.toEntity
import com.macher.android.domain.ThreatLevel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Property-based tests for call history management.
 * 
 * Tests validate Requirements 12.5, 12.6
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class CallHistoryRepositoryPropertyTest : StringSpec({
    
    /**
     * Property 42: Call history clearing
     * For any call history state, when the user clears history, retrieving
     * call history should return an empty list.
     * 
     * Feature: android-mobile-client, Property 42: Call history clearing
     * Validates: Requirements 12.5
     */
    "Property 42: Call history clearing".config(invocations = 100) {
        checkAll(
            Arb.int(1..10) // Number of sessions to create
        ) { numSessions ->
            runTest {
                // Arrange - Create in-memory database
                val context = ApplicationProvider.getApplicationContext<Context>()
                val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
                    .allowMainThreadQueries()
                    .build()
                val dao = db.callSessionDao()
                
                // Add sessions
                repeat(numSessions) { i ->
                    val session = CallSession(
                        id = "session-$i",
                        timestamp = System.currentTimeMillis() + i,
                        durationSeconds = 60,
                        finalThreatLevel = ThreatLevel.SAFE,
                        phoneNumber = null
                    )
                    dao.insert(session.toEntity())
                }
                
                // Verify sessions exist
                val beforeClear = dao.getAllSessions().first()
                beforeClear.size shouldBe numSessions
                
                // Act - Clear history
                dao.deleteAll()
                
                // Assert - History should be empty
                val afterClear = dao.getAllSessions().first()
                afterClear.size shouldBe 0
                
                // Cleanup
                db.close()
            }
        }
    }
    
    /**
     * Property 43: Call history size limit
     * For any sequence of call sessions, when more than 100 sessions are
     * saved, only the 100 most recent sessions should be retained.
     * 
     * Feature: android-mobile-client, Property 43: Call history size limit
     * Validates: Requirements 12.6
     */
    "Property 43: Call history size limit".config(invocations = 50) {
        checkAll(
            Arb.int(101..150) // Number of sessions (more than limit)
        ) { numSessions ->
            runTest {
                // Arrange - Create in-memory database
                val context = ApplicationProvider.getApplicationContext<Context>()
                val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
                    .allowMainThreadQueries()
                    .build()
                val dao = db.callSessionDao()
                
                // Add sessions
                repeat(numSessions) { i ->
                    val session = CallSession(
                        id = "session-$i",
                        timestamp = System.currentTimeMillis() + i,
                        durationSeconds = 60,
                        finalThreatLevel = ThreatLevel.SAFE,
                        phoneNumber = null
                    )
                    dao.insert(session.toEntity())
                }
                
                // Act - Delete oldest sessions to enforce limit
                dao.deleteOldestSessions()
                
                // Assert - Should have at most 100 sessions
                val count = dao.getCount()
                count shouldBeLessThanOrEqual 100
                
                // Cleanup
                db.close()
            }
        }
    }
})
