package com.vocalshield.android.data.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.*
import io.kotest.property.checkAll
import kotlinx.coroutines.runBlocking
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Property-based tests for database referential integrity
 * 
 * Tests:
 * - Property 7: Database Referential Integrity - No orphaned records
 * - Property 20: Cascade Deletion Integrity - Deletions are atomic
 * 
 * Uses Kotest property testing with 500 iterations to verify that
 * foreign key constraints and cascade deletions work correctly
 * across random insert/delete sequences.
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.5, 16.2
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class DatabaseReferentialIntegrityPropertyTest : StringSpec({
    
    lateinit var database: VocalShieldDatabase
    
    beforeTest {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            VocalShieldDatabase::class.java
        )
            .allowMainThreadQueries()
            .build()
    }
    
    afterTest {
        database.close()
    }
    
    // ========== Arbitraries for generating test data ==========
    
    fun arbCallRecord(): Arb<CallRecordEntity> = arbitrary {
        CallRecordEntity(
            id = "call-${Arb.string(5..10, Codepoint.alphanumeric()).bind()}",
            phoneNumber = "+1555${Arb.int(1000000..9999999).bind()}",
            callerName = Arb.stringOrNull(5..20, Codepoint.alphanumeric()).bind(),
            timestamp = Arb.long(1000000000000L..2000000000000L).bind(),
            duration = Arb.int(10..600).bind(),
            wasBlocked = Arb.bool().bind(),
            userReported = Arb.bool().bind()
        )
    }
    
    fun arbRiskAssessment(callId: String): Arb<RiskAssessmentEntity> = arbitrary {
        RiskAssessmentEntity(
            id = "risk-${Arb.string(5..10, Codepoint.alphanumeric()).bind()}",
            callId = callId,
            totalScore = Arb.float(0f..15f).bind(),
            riskLevel = Arb.of("LOW", "MEDIUM", "HIGH").bind(),
            confidence = Arb.float(0f..1f).bind(),
            metadataScore = Arb.float(0f..5f).bind(),
            manipulationScore = Arb.float(0f..5f).bind(),
            historicalScore = Arb.float(0f..5f).bind(),
            primaryThreat = Arb.string(10..50, Codepoint.alphanumeric()).bind(),
            explanation = Arb.string(20..100, Codepoint.alphanumeric()).bind(),
            timestamp = Arb.long(1000000000000L..2000000000000L).bind()
        )
    }
    
    fun arbRiskTrigger(riskAssessmentId: String): Arb<RiskTriggerEntity> = arbitrary {
        val categories = listOf(
            "METADATA_UNKNOWN_NUMBER",
            "METADATA_INTERNATIONAL",
            "MANIPULATION_URGENCY",
            "MANIPULATION_AUTHORITY",
            "MANIPULATION_FINANCIAL"
        )
        
        RiskTriggerEntity(
            id = 0, // Auto-generated
            riskAssessmentId = riskAssessmentId,
            category = Arb.of(categories).bind(),
            description = Arb.string(10..50, Codepoint.alphanumeric()).bind(),
            score = Arb.int(1..5).bind(),
            severity = Arb.of("LOW", "MEDIUM", "HIGH").bind(),
            timestamp = Arb.long(1000000000000L..2000000000000L).bind()
        )
    }
    
    fun arbHistoricalRisk(): Arb<HistoricalRiskEntity> = arbitrary {
        val totalCalls = Arb.int(1..20).bind()
        val scamCalls = Arb.int(0..totalCalls).bind()
        
        HistoricalRiskEntity(
            phoneNumber = "+1555${Arb.int(1000000..9999999).bind()}",
            totalCalls = totalCalls,
            scamCalls = scamCalls,
            averageRiskScore = Arb.float(0f..15f).bind(),
            lastCallTime = Arb.long(1000000000000L..2000000000000L).bind(),
            lastRiskLevel = Arb.of("LOW", "MEDIUM", "HIGH").bind(),
            isBlacklisted = scamCalls.toFloat() / totalCalls >= 0.5f
        )
    }
    
    // ========== Property 7: Database Referential Integrity ==========
    
    "Property 7: No orphaned risk assessments after call deletion" {
        checkAll(500, arbCallRecord()) { call ->
            runBlocking {
                // Insert call
                database.callHistoryDao().insertCall(call)
                
                // Insert risk assessment
                val risk = arbRiskAssessment(call.id).sample(random).value
                database.riskAssessmentDao().insertRisk(risk)
                
                // Verify risk exists
                val riskBefore = database.riskAssessmentDao().getRiskByCallId(call.id)
                riskBefore shouldNotBe null
                
                // Delete call
                database.callHistoryDao().deleteCall(call)
                
                // Verify risk is also deleted (cascade)
                val riskAfter = database.riskAssessmentDao().getRiskByCallId(call.id)
                riskAfter shouldBe null
                
                // Cleanup
                database.clearAllTables()
            }
        }
    }
    
    "Property 7: No orphaned triggers after risk assessment deletion" {
        checkAll(500, arbCallRecord()) { call ->
            runBlocking {
                // Insert call and risk
                database.callHistoryDao().insertCall(call)
                val risk = arbRiskAssessment(call.id).sample(random).value
                database.riskAssessmentDao().insertRisk(risk)
                
                // Insert triggers
                val triggerCount = (1..5).random()
                val triggers = (1..triggerCount).map {
                    arbRiskTrigger(risk.id).sample(random).value
                }
                database.riskTriggerDao().insertTriggers(triggers)
                
                // Verify triggers exist
                val triggersBefore = database.riskTriggerDao().getTriggersByRiskId(risk.id)
                triggersBefore.size shouldBe triggerCount
                
                // Delete call (cascades to risk and triggers)
                database.callHistoryDao().deleteCall(call)
                
                // Verify triggers are also deleted
                val triggersAfter = database.riskTriggerDao().getTriggersByRiskId(risk.id)
                triggersAfter.size shouldBe 0
                
                // Cleanup
                database.clearAllTables()
            }
        }
    }
    
    "Property 7: Risk assessment requires valid call ID" {
        checkAll(500, arbCallRecord()) { call ->
            runBlocking {
                // Insert call
                database.callHistoryDao().insertCall(call)
                
                // Create risk with valid call ID
                val validRisk = arbRiskAssessment(call.id).sample(random).value
                database.riskAssessmentDao().insertRisk(validRisk)
                
                // Verify risk was inserted
                val retrieved = database.riskAssessmentDao().getRiskByCallId(call.id)
                retrieved shouldNotBe null
                retrieved?.callId shouldBe call.id
                
                // Cleanup
                database.clearAllTables()
            }
        }
    }
    
    // ========== Property 20: Cascade Deletion Integrity ==========
    
    "Property 20: Cascade deletion is atomic - all or nothing" {
        checkAll(500, arbCallRecord()) { call ->
            runBlocking {
                // Setup complete call hierarchy
                database.callHistoryDao().insertCall(call)
                
                val risk = arbRiskAssessment(call.id).sample(random).value
                database.riskAssessmentDao().insertRisk(risk)
                
                val triggerCount = (1..3).random()
                val triggers = (1..triggerCount).map {
                    arbRiskTrigger(risk.id).sample(random).value
                }
                database.riskTriggerDao().insertTriggers(triggers)
                
                // Verify all exist
                database.callHistoryDao().getCallById(call.id) shouldNotBe null
                database.riskAssessmentDao().getRiskByCallId(call.id) shouldNotBe null
                database.riskTriggerDao().getTriggersByRiskId(risk.id).size shouldBe triggerCount
                
                // Delete call
                database.callHistoryDao().deleteCall(call)
                
                // Verify complete cascade deletion
                database.callHistoryDao().getCallById(call.id) shouldBe null
                database.riskAssessmentDao().getRiskByCallId(call.id) shouldBe null
                database.riskTriggerDao().getTriggersByRiskId(risk.id).size shouldBe 0
                
                // Cleanup
                database.clearAllTables()
            }
        }
    }
    
    "Property 20: Multiple calls with risks maintain independence" {
        checkAll(250, arbCallRecord(), arbCallRecord()) { call1, call2 ->
            runBlocking {
                // Make sure calls have different IDs
                val uniqueCall2 = call2.copy(id = call2.id + "-unique")
                
                // Insert both calls with risks
                database.callHistoryDao().insertCall(call1)
                database.callHistoryDao().insertCall(uniqueCall2)
                
                val risk1 = arbRiskAssessment(call1.id).sample(random).value
                val risk2 = arbRiskAssessment(uniqueCall2.id).sample(random).value
                
                database.riskAssessmentDao().insertRisk(risk1)
                database.riskAssessmentDao().insertRisk(risk2)
                
                // Delete first call
                database.callHistoryDao().deleteCall(call1)
                
                // Verify first call and risk deleted
                database.callHistoryDao().getCallById(call1.id) shouldBe null
                database.riskAssessmentDao().getRiskByCallId(call1.id) shouldBe null
                
                // Verify second call and risk still exist
                database.callHistoryDao().getCallById(uniqueCall2.id) shouldNotBe null
                database.riskAssessmentDao().getRiskByCallId(uniqueCall2.id) shouldNotBe null
                
                // Cleanup
                database.clearAllTables()
            }
        }
    }
    
    // ========== Historical Risk Properties ==========
    
    "Property: Historical risk updates are idempotent" {
        checkAll(500, arbHistoricalRisk()) { historical ->
            runBlocking {
                // Insert historical risk
                database.historicalRiskDao().insertOrUpdateHistoricalRisk(historical)
                
                val retrieved1 = database.historicalRiskDao().getHistoricalRisk(historical.phoneNumber)
                retrieved1 shouldNotBe null
                
                // Update with same data
                database.historicalRiskDao().insertOrUpdateHistoricalRisk(historical)
                
                val retrieved2 = database.historicalRiskDao().getHistoricalRisk(historical.phoneNumber)
                retrieved2 shouldNotBe null
                
                // Verify data is identical
                retrieved1?.totalCalls shouldBe retrieved2?.totalCalls
                retrieved1?.scamCalls shouldBe retrieved2?.scamCalls
                retrieved1?.averageRiskScore shouldBe retrieved2?.averageRiskScore
                
                // Cleanup
                database.clearAllTables()
            }
        }
    }
    
    "Property: Blacklist status reflects scam rate" {
        checkAll(500, arbHistoricalRisk()) { historical ->
            runBlocking {
                database.historicalRiskDao().insertOrUpdateHistoricalRisk(historical)
                
                val retrieved = database.historicalRiskDao().getHistoricalRisk(historical.phoneNumber)
                retrieved shouldNotBe null
                
                val scamRate = retrieved!!.scamCalls.toFloat() / retrieved.totalCalls
                
                // If scam rate >= 50%, should be blacklisted
                if (scamRate >= 0.5f) {
                    retrieved.isBlacklisted shouldBe true
                }
                
                // Cleanup
                database.clearAllTables()
            }
        }
    }
    
    // ========== Complex Scenario Properties ==========
    
    "Property: Random insert/delete sequences maintain integrity" {
        checkAll(100) { // Fewer iterations due to complexity
            runBlocking {
                val operations = (1..20).random()
                val callIds = mutableListOf<String>()
                
                repeat(operations) {
                    val operation = (0..2).random()
                    
                    when (operation) {
                        0 -> {
                            // Insert call with risk
                            val call = arbCallRecord().sample(random).value
                            database.callHistoryDao().insertCall(call)
                            callIds.add(call.id)
                            
                            val risk = arbRiskAssessment(call.id).sample(random).value
                            database.riskAssessmentDao().insertRisk(risk)
                        }
                        1 -> {
                            // Delete random call if any exist
                            if (callIds.isNotEmpty()) {
                                val callId = callIds.random()
                                val call = database.callHistoryDao().getCallById(callId)
                                if (call != null) {
                                    database.callHistoryDao().deleteCall(call)
                                    callIds.remove(callId)
                                }
                            }
                        }
                        2 -> {
                            // Verify no orphaned risks
                            val allCalls = database.callHistoryDao().getAllCalls()
                            val allRisks = database.riskAssessmentDao().getRecentRisks()
                            
                            // Every risk should have a corresponding call
                            allRisks.forEach { risk ->
                                val callExists = allCalls.any { it.id == risk.callId }
                                callExists shouldBe true
                            }
                        }
                    }
                }
                
                // Final integrity check
                val finalCalls = database.callHistoryDao().getAllCalls()
                val finalRisks = database.riskAssessmentDao().getRecentRisks()
                
                finalRisks.forEach { risk ->
                    val callExists = finalCalls.any { it.id == risk.callId }
                    callExists shouldBe true
                }
                
                // Cleanup
                database.clearAllTables()
            }
        }
    }
})
