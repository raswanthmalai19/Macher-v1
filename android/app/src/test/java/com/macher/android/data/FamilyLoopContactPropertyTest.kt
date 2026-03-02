package com.macher.android.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.*
import io.kotest.property.checkAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Property-based tests for Family Loop contact management.
 * 
 * Tests validate Requirements 10.1, 10.2
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class FamilyLoopContactPropertyTest : StringSpec({
    
    /**
     * Property 31: Family Loop contact round-trip
     * For any valid contact, adding it to Family Loop and then retrieving
     * the contact list should include that contact with matching information.
     * 
     * Feature: android-mobile-client, Property 31: Family Loop contact round-trip
     * Validates: Requirements 10.1, 10.2
     */
    "Property 31: Family Loop contact round-trip".config(invocations = 100) {
        checkAll(
            Arb.uuid(),
            Arb.string(3..50), // Name
            Arb.string(10..15), // Phone number
            Arb.string(5..50).orNull(), // Email or null
            Arb.long(1000000000000L..2000000000000L) // Timestamp
        ) { id, name, phoneNumber, email, timestamp ->
            runTest {
                // Arrange - Create in-memory database
                val context = ApplicationProvider.getApplicationContext<Context>()
                val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
                    .allowMainThreadQueries()
                    .build()
                val dao = db.familyLoopContactDao()
                
                // Create contact
                val contact = Contact(
                    id = id.toString(),
                    name = name,
                    phoneNumber = phoneNumber,
                    email = email,
                    addedTimestamp = timestamp
                )
                
                // Act - Add contact
                dao.insert(contact.toEntity())
                
                // Act - Retrieve contacts
                val contacts = dao.getAllContacts().first()
                
                // Assert - Contact should be in list with matching data
                contacts.size shouldBe 1
                val retrieved = contacts[0].toDomain()
                retrieved.id shouldBe contact.id
                retrieved.name shouldBe contact.name
                retrieved.phoneNumber shouldBe contact.phoneNumber
                retrieved.email shouldBe contact.email
                retrieved.addedTimestamp shouldBe contact.addedTimestamp
                
                // Cleanup
                db.close()
            }
        }
    }
})
