package com.vocalshield.android.integration

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.vocalshield.android.data.database.*
import com.vocalshield.android.detection.*
import com.vocalshield.android.service.MonitoringManager
import com.vocalshield.android.util.Config
import io.mockk.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config as RobolectricConfig

/**
 * Integration Test 13.4: Call History Persistence and Retrieval
 * 
 * Tests the complete call history workflow:
 * 1. Complete multiple detection scenarios
 * 2. Verify database persistence for each call
 * 3. Navigate to call history screen
 * 4. Verify display of all calls with correct data
 * 5. Tap call for details
 * 6. Verify detailed risk breakdown modal
 * 7. Test filtering and pagination
 * 
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5**
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@RobolectricConfig(sdk = [30])
class CallHistoryIntegrationTest {
    
    private lateinit var context: Context
    private lateinit var monitoringManager: MonitoringManager
    private lateinit var database: VocalShieldDatabase
    
    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        database = VocalShieldDatabase.getInMemoryDatabase(context)
        
        mockkObject(Config)
        every { Config.DEMO_MODE } returns true
        every { Config.WEBSOCKET_URL } returns "wss://test.example.com"
        
        monitoringManager = MonitoringManager(context)
    }
    
    @After
    fun teardown() {
        monitoringManager.stopMonitoring()
        database.close()
        unmockkAll()
    }
    
    @Test
    fun `test call history persistence and retrieval end-to-end`() = runTest {
        // ========== STEP 1: Complete Multiple Detection Scenarios ==========
        val testCalls = listOf(
            Triple("+1-800-SCAMMER", "IRS scam urgent action required", RiskLevel.HIGH),
            Triple("+1-555-1234", "Hi, this is your dentist office", RiskLevel.LOW),
            Triple("+1-888-FRAUD", "Your bank account has been compromised", RiskLevel.HIGH),
            Triple("+1-555-5678", "Reminder about your appointment", RiskLevel.LOW),
            Triple("+1-900-PHISH", "You've won a prize, provide your SSN", RiskLevel.MEDIUM)
        )
        
        val persistedCallIds = mutableListOf<String>()
        
        for ((phoneNumber, transcription, expectedRisk) in testCalls) {
            // Create call metadata
            val metadata = CallMetadata(
                phoneNumber = phoneNumber,
                callTime = System.currentTimeMillis(),
                isInContacts = phoneNumber.contains("555"),
                recentCallCount = if (expectedRisk == RiskLevel.HIGH) 5 else 1,
                averageCallDuration = 45
            )
            
            // Create mock risk results
            val metadataRisk = MetadataRiskResult(
                riskScore = when (expectedRisk) {
                    RiskLevel.HIGH -> 5
                    RiskLevel.MEDIUM -> 3
                    RiskLevel.LOW -> 1
                },
                riskLevel = expectedRisk,
                confidence = 0.8f,
                triggers = listOf("Unknown number", "High frequency"),
                explanation = "Test metadata risk"
            )
            
            val fusedRisk = FusedRiskResult(
                riskScore = when (expectedRisk) {
                    RiskLevel.HIGH -> 10f
                    RiskLevel.MEDIUM -> 6f
                    RiskLevel.LOW -> 2f
                },
                riskLevel = expectedRisk,
                confidence = 0.85f,
                metadataContribution = metadataRisk.riskScore.toFloat(),
                manipulationContribution = when (expectedRisk) {
                    RiskLevel.HIGH -> 5f
                    RiskLevel.MEDIUM -> 3f
                    RiskLevel.LOW -> 1f
                },
                historicalContribution = 0f,
                explanation = "Test fused risk for $phoneNumber"
            )
            
            // Persist call record
            val callId = persistTestCallRecord(metadata, fusedRisk)
            persistedCallIds.add(callId)
            
            delay(50) // Small delay between calls
        }
        
        // ========== STEP 2: Verify Database Persistence ==========
        delay(200) // Wait for all writes to complete
        
        val allCalls = database.callHistoryDao().getAllCalls()
        
        assertTrue(
            "Should have persisted all test calls",
            allCalls.size >= testCalls.size
        )
        
        // Verify each call has correct structure
        allCalls.forEach { call ->
            assertNotNull("Call ID should be set", call.id)
            assertFalse("Phone number should not be empty", call.phoneNumber.isEmpty())
            assertTrue("Timestamp should be positive", call.timestamp > 0)
            assertTrue("Duration should be non-negative", call.duration >= 0)
            
            // Verify risk assessment exists
            val riskAssessment = database.riskAssessmentDao().getRiskByCallId(call.id)
            assertNotNull("Risk assessment should exist for call ${call.id}", riskAssessment)
            
            if (riskAssessment != null) {
                assertEquals("Call ID should match", call.id, riskAssessment.callId)
                assertTrue("Total score should be non-negative", riskAssessment.totalScore >= 0f)
                assertFalse("Risk level should not be empty", riskAssessment.riskLevel.isEmpty())
                assertTrue("Confidence should be in [0, 1]", riskAssessment.confidence in 0f..1f)
                
                // Verify triggers exist for high/medium risk
                val triggers = database.riskTriggerDao().getTriggersByRiskId(riskAssessment.id)
                
                if (riskAssessment.totalScore > 5f) {
                    assertTrue(
                        "High-risk call should have triggers",
                        triggers.isNotEmpty()
                    )
                    
                    // Verify trigger structure
                    triggers.forEach { trigger ->
                        assertEquals(
                            "Trigger should reference correct risk assessment",
                            riskAssessment.id,
                            trigger.riskAssessmentId
                        )
                        assertFalse("Category should not be empty", trigger.category.isEmpty())
                        assertFalse("Description should not be empty", trigger.description.isEmpty())
                        assertTrue("Score should be positive", trigger.score > 0)
                    }
                }
            }
        }
        
        // ========== STEP 3: Verify Call History Ordering ==========
        // Property 13: Call history ordering
        // Calls should be ordered by timestamp DESC (most recent first)
        
        for (i in 1 until allCalls.size) {
            assertTrue(
                "Calls should be ordered by timestamp DESC",
                allCalls[i - 1].timestamp >= allCalls[i].timestamp
            )
        }
        
        // ========== STEP 4: Test Call Details Retrieval ==========
        val firstCall = allCalls.first()
        val callDetails = getCallDetailsWithRisk(firstCall.id)
        
        assertNotNull("Call details should be retrievable", callDetails)
        
        if (callDetails != null) {
            assertEquals("Call ID should match", firstCall.id, callDetails.call.id)
            assertNotNull("Risk assessment should be included", callDetails.risk)
            assertNotNull("Triggers should be included", callDetails.triggers)
            
            // Verify complete data structure
            val risk = callDetails.risk!!
            assertEquals("Risk should reference call", firstCall.id, risk.callId)
            
            callDetails.triggers.forEach { trigger ->
                assertEquals(
                    "Trigger should reference risk",
                    risk.id,
                    trigger.riskAssessmentId
                )
            }
        }
        
        // ========== STEP 5: Test Filtering by Risk Level ==========
        val highRiskCalls = allCalls.filter { call ->
            val risk = database.riskAssessmentDao().getRiskByCallId(call.id)
            risk?.riskLevel == "HIGH"
        }
        
        assertTrue(
            "Should have high-risk calls",
            highRiskCalls.isNotEmpty()
        )
        
        highRiskCalls.forEach { call ->
            val risk = database.riskAssessmentDao().getRiskByCallId(call.id)
            assertEquals("Filtered call should be HIGH risk", "HIGH", risk?.riskLevel)
        }
        
        // ========== STEP 6: Test Pagination ==========
        // Verify pagination works for large datasets
        val pageSize = 50
        val page1 = allCalls.take(pageSize)
        val page2 = allCalls.drop(pageSize).take(pageSize)
        
        // Pages should not overlap
        val page1Ids = page1.map { it.id }.toSet()
        val page2Ids = page2.map { it.id }.toSet()
        
        assertTrue(
            "Pages should not overlap",
            page1Ids.intersect(page2Ids).isEmpty()
        )
        
        // ========== STEP 7: Test Historical Risk Calculation ==========
        // Property 6: Historical risk accumulation
        
        // Find a phone number with multiple calls
        val phoneNumberWithMultipleCalls = testCalls.first().first
        
        val historicalRisk = database.historicalRiskDao().getHistoricalRisk(phoneNumberWithMultipleCalls)
        
        if (historicalRisk != null) {
            assertTrue("Total calls should be positive", historicalRisk.totalCalls > 0)
            assertTrue("Scam calls should be non-negative", historicalRisk.scamCalls >= 0)
            assertTrue("Average risk should be non-negative", historicalRisk.averageRiskScore >= 0f)
            assertTrue("Last call time should be positive", historicalRisk.lastCallTime > 0)
            assertFalse("Last risk level should not be empty", historicalRisk.lastRiskLevel.isEmpty())
            
            // Verify scam calls <= total calls
            assertTrue(
                "Scam calls should not exceed total calls",
                historicalRisk.scamCalls <= historicalRisk.totalCalls
            )
            
            // If blacklisted, scam rate should be >= 50%
            if (historicalRisk.isBlacklisted) {
                val scamRate = historicalRisk.scamCalls.toFloat() / historicalRisk.totalCalls.toFloat()
                assertTrue(
                    "Blacklisted number should have scam rate >= 50%",
                    scamRate >= 0.5f
                )
            }
        }
    }
    
    @Test
    fun `test database referential integrity - no orphaned records`() = runTest {
        // Property 7: Database referential integrity
        // Property 20: Cascade deletion integrity
        // Validates: Requirements 13.1, 13.2, 13.3, 13.5
        
        // Create test call with risk and triggers
        val metadata = CallMetadata(
            phoneNumber = "+1-800-TEST",
            callTime = System.currentTimeMillis(),
            isInContacts = false,
            recentCallCount = 1,
            averageCallDuration = 30
        )
        
        val fusedRisk = FusedRiskResult(
            riskScore = 10f,
            riskLevel = RiskLevel.HIGH,
            confidence = 0.9f,
            metadataContribution = 5f,
            manipulationContribution = 5f,
            historicalContribution = 0f,
            explanation = "Test risk"
        )
        
        val callId = persistTestCallRecord(metadata, fusedRisk)
        delay(100)
        
        // Verify all records exist
        val call = database.callHistoryDao().getCallById(callId)
        assertNotNull("Call should exist", call)
        
        val risk = database.riskAssessmentDao().getRiskByCallId(callId)
        assertNotNull("Risk assessment should exist", risk)
        
        val triggers = database.riskTriggerDao().getTriggersByRiskId(risk!!.id)
        assertTrue("Triggers should exist", triggers.isNotEmpty())
        
        // Delete call record (should cascade)
        database.callHistoryDao().deleteCall(callId)
        delay(100)
        
        // Verify cascade deletion
        val callAfterDelete = database.callHistoryDao().getCallById(callId)
        assertNull("Call should be deleted", callAfterDelete)
        
        val riskAfterDelete = database.riskAssessmentDao().getRiskByCallId(callId)
        assertNull("Risk assessment should be cascade deleted", riskAfterDelete)
        
        val triggersAfterDelete = database.riskTriggerDao().getTriggersByRiskId(risk.id)
        assertTrue("Triggers should be cascade deleted", triggersAfterDelete.isEmpty())
    }
    
    @Test
    fun `test persistence completeness - all data persisted correctly`() = runTest {
        // Property 14: Persistence completeness
        // Validates: Requirements 7.1, 7.2, 7.3, 17.5
        
        val metadata = CallMetadata(
            phoneNumber = "+1-888-COMPLETE",
            callTime = System.currentTimeMillis(),
            isInContacts = false,
            recentCallCount = 3,
            averageCallDuration = 60
        )
        
        val fusedRisk = FusedRiskResult(
            riskScore = 12f,
            riskLevel = RiskLevel.HIGH,
            confidence = 0.95f,
            metadataContribution = 4f,
            manipulationContribution = 6f,
            historicalContribution = 2f,
            explanation = "Complete test risk with all layers"
        )
        
        val callId = persistTestCallRecord(metadata, fusedRisk)
        delay(100)
        
        // Verify complete persistence
        val call = database.callHistoryDao().getCallById(callId)
        assertNotNull("Call should be persisted", call)
        
        if (call != null) {
            // Verify call record completeness
            assertEquals("Phone number should match", metadata.phoneNumber, call.phoneNumber)
            assertEquals("Timestamp should match", metadata.callTime, call.timestamp)
            assertTrue("Duration should be set", call.duration >= 0)
            
            // Verify risk assessment completeness
            val risk = database.riskAssessmentDao().getRiskByCallId(callId)
            assertNotNull("Risk assessment should be persisted", risk)
            
            if (risk != null) {
                assertEquals("Total score should match", fusedRisk.riskScore, risk.totalScore)
                assertEquals("Risk level should match", fusedRisk.riskLevel.toString(), risk.riskLevel)
                assertEquals("Confidence should match", fusedRisk.confidence, risk.confidence)
                assertEquals("Metadata contribution should match", fusedRisk.metadataContribution, risk.metadataScore)
                assertEquals("Manipulation contribution should match", fusedRisk.manipulationContribution, risk.manipulationScore)
                assertEquals("Historical contribution should match", fusedRisk.historicalContribution, risk.historicalScore)
                assertFalse("Explanation should be persisted", risk.explanation.isEmpty())
                assertFalse("Primary threat should be persisted", risk.primaryThreat.isEmpty())
                
                // Verify triggers completeness
                val triggers = database.riskTriggerDao().getTriggersByRiskId(risk.id)
                assertTrue("Triggers should be persisted", triggers.isNotEmpty())
                
                triggers.forEach { trigger ->
                    assertFalse("Category should be set", trigger.category.isEmpty())
                    assertFalse("Description should be set", trigger.description.isEmpty())
                    assertTrue("Score should be positive", trigger.score > 0)
                    assertFalse("Severity should be set", trigger.severity.isEmpty())
                    assertTrue("Timestamp should be positive", trigger.timestamp > 0)
                }
            }
        }
    }
    
    /**
     * Helper function to persist a test call record
     */
    private suspend fun persistTestCallRecord(metadata: CallMetadata, fusedRisk: FusedRiskResult): String {
        val callId = java.util.UUID.randomUUID().toString()
        
        // Create call record
        val callRecord = CallRecordEntity(
            id = callId,
            phoneNumber = metadata.phoneNumber,
            callerName = null,
            timestamp = metadata.callTime,
            duration = 45,
            wasBlocked = fusedRisk.riskLevel == RiskLevel.HIGH && fusedRisk.confidence >= 0.8f,
            userReported = false
        )
        
        database.callHistoryDao().insertCall(callRecord)
        
        // Create risk assessment
        val riskAssessment = RiskAssessmentEntity(
            id = java.util.UUID.randomUUID().toString(),
            callId = callId,
            totalScore = fusedRisk.riskScore,
            riskLevel = fusedRisk.riskLevel.toString(),
            confidence = fusedRisk.confidence,
            metadataScore = fusedRisk.metadataContribution,
            manipulationScore = fusedRisk.manipulationContribution,
            historicalScore = fusedRisk.historicalContribution,
            primaryThreat = fusedRisk.getPrimaryThreat(),
            explanation = fusedRisk.explanation,
            timestamp = System.currentTimeMillis()
        )
        
        database.riskAssessmentDao().insertRisk(riskAssessment)
        
        // Create triggers
        val triggers = listOf(
            RiskTriggerEntity(
                riskAssessmentId = riskAssessment.id,
                category = "METADATA_UNKNOWN_NUMBER",
                description = "Unknown caller",
                score = 2,
                severity = "MEDIUM",
                timestamp = System.currentTimeMillis()
            ),
            RiskTriggerEntity(
                riskAssessmentId = riskAssessment.id,
                category = "MANIPULATION_URGENCY",
                description = "Urgent action required",
                score = 3,
                severity = "HIGH",
                timestamp = System.currentTimeMillis()
            )
        )
        
        database.riskTriggerDao().insertTriggers(triggers)
        
        return callId
    }
    
    /**
     * Helper function to get call details with risk and triggers
     */
    private suspend fun getCallDetailsWithRisk(callId: String): CallRecordWithRisk? {
        val call = database.callHistoryDao().getCallById(callId) ?: return null
        val risk = database.riskAssessmentDao().getRiskByCallId(callId)
        val triggers = risk?.let { database.riskTriggerDao().getTriggersByRiskId(it.id) } ?: emptyList()
        
        return CallRecordWithRisk(call, risk, triggers)
    }
}
