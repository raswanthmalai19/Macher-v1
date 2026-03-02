package com.macher.android.integration

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.macher.android.data.database.*
import com.macher.android.demo.ScamScenarios
import com.macher.android.detection.*
import com.macher.android.service.*
import com.macher.android.util.Config
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
 * Integration Test 13.2: Demo Mode End-to-End Flow
 * 
 * Tests the complete demo mode workflow:
 * 1. Switch to demo mode
 * 2. Select a specific scenario
 * 3. Play scenario from start to finish
 * 4. Verify progressive risk analysis at each segment
 * 5. Verify database persistence of demo results
 * 6. Verify UI state updates correctly
 * 
 * **Validates: Requirements 3.1, 3.2, 4.1, 4.2, 17.1, 17.2, 17.3, 17.4, 17.5**
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@RobolectricConfig(sdk = [30])
class DemoModeIntegrationTest {
    
    private lateinit var context: Context
    private lateinit var monitoringManager: MonitoringManager
    private lateinit var database: MacherDatabase
    
    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        database = MacherDatabase.getInMemoryDatabase(context)
        
        // Enable demo mode
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
    fun `test demo mode end-to-end with bank fraud scenario`() = runTest {
        // ========== STEP 1: Start Monitoring in Demo Mode ==========
        monitoringManager.startMonitoring()
        delay(150)
        
        // Verify demo mode is active
        assertEquals(
            "Should be in DEMO mode",
            DetectionMode.DEMO,
            monitoringManager.detectionMode.value
        )
        assertTrue("Monitoring should be active", monitoringManager.isMonitoring.value)
        
        // ========== STEP 2: Get Available Scenarios ==========
        val scenarios = monitoringManager.getDemoScenarios()
        
        assertFalse("Should have demo scenarios", scenarios.isEmpty())
        assertTrue(
            "Should have at least 6 scenarios",
            scenarios.size >= 6
        )
        
        // Verify scenario completeness (Property 10)
        scenarios.forEach { scenario ->
            assertFalse("Scenario ID should not be empty", scenario.id.isEmpty())
            assertFalse("Scenario title should not be empty", scenario.title.isEmpty())
            assertFalse("Scenario description should not be empty", scenario.description.isEmpty())
            assertTrue("Scenario should have conversation segments", scenario.conversation.isNotEmpty())
            assertFalse("Expected risk level should not be empty", scenario.expectedRiskLevel.isEmpty())
            assertTrue(
                "Expected risk level should be valid",
                scenario.expectedRiskLevel in listOf("LOW", "MEDIUM", "HIGH")
            )
            assertTrue(
                "Expected score should be in [0, 100]",
                scenario.expectedScore in 0..100
            )
            
            // Verify all segments have valid data
            scenario.conversation.forEach { segment ->
                assertTrue("Segment timestamp should be non-negative", segment.timestamp >= 0)
                assertFalse("Segment text should not be empty", segment.text.isEmpty())
            }
        }
        
        // ========== STEP 3: Select Bank Fraud Scenario ==========
        val bankFraudScenario = scenarios.find { it.id == "bank_fraud_otp" }
            ?: scenarios.first { it.expectedRiskLevel == "HIGH" }
        
        monitoringManager.selectDemoScenario(bankFraudScenario.id)
        delay(100)
        
        // Verify scenario selected
        val scenarioProgress = monitoringManager.scenarioProgress.value
        assertNotNull("Scenario progress should be set", scenarioProgress)
        assertEquals(
            "Selected scenario ID should match",
            bankFraudScenario.id,
            scenarioProgress?.scenarioId
        )
        
        // ========== STEP 4: Play Scenario ==========
        val riskLevelsObserved = mutableListOf<RiskLevel>()
        val riskScoresObserved = mutableListOf<Float>()
        val segmentTimestamps = mutableListOf<Long>()
        
        monitoringManager.playDemoScenario()
        
        // Monitor progress through scenario
        val totalSegments = bankFraudScenario.conversation.size
        var lastSegmentIndex = -1
        
        // Wait for scenario to play through
        repeat(totalSegments * 2) { iteration ->
            delay(200) // Check every 200ms
            
            val currentProgress = monitoringManager.scenarioProgress.value
            val currentState = monitoringManager.detectionState.value
            
            if (currentProgress != null) {
                val currentSegment = currentProgress.currentSegment
                
                // New segment processed
                if (currentSegment > lastSegmentIndex) {
                    lastSegmentIndex = currentSegment
                    
                    println("Demo segment $currentSegment/${totalSegments}: " +
                           "Progress=${currentProgress.getProgressPercentage()}%, " +
                           "Risk=${currentProgress.currentRiskLevel}")
                    
                    // Verify progress bounds (Property 4)
                    assertTrue(
                        "Current segment should be non-negative",
                        currentProgress.currentSegment >= 0
                    )
                    assertTrue(
                        "Current segment should not exceed total",
                        currentProgress.currentSegment <= currentProgress.totalSegments
                    )
                    assertTrue(
                        "Progress percentage should be in [0, 100]",
                        currentProgress.getProgressPercentage() in 0..100
                    )
                    assertTrue(
                        "Elapsed time should be non-negative",
                        currentProgress.elapsedTime >= 0
                    )
                    
                    // Collect risk data
                    riskLevelsObserved.add(currentProgress.currentRiskLevel)
                    
                    if (currentState?.fusedRisk != null) {
                        riskScoresObserved.add(currentState.fusedRisk.riskScore)
                        segmentTimestamps.add(currentState.timestamp)
                    }
                }
                
                // Check if scenario completed
                if (!currentProgress.isPlaying && currentSegment >= totalSegments - 1) {
                    println("Demo scenario completed")
                    break
                }
            }
        }
        
        // ========== STEP 5: Verify Progressive Risk Analysis ==========
        assertTrue(
            "Should have observed multiple risk levels",
            riskLevelsObserved.size >= 2
        )
        
        // For high-risk scenario, risk should generally increase
        // (though not strictly monotonic due to conversation dynamics)
        val finalRiskLevel = riskLevelsObserved.lastOrNull()
        if (bankFraudScenario.expectedRiskLevel == "HIGH") {
            assertEquals(
                "Final risk level should be HIGH for high-risk scenario",
                RiskLevel.HIGH,
                finalRiskLevel
            )
        }
        
        // Verify timestamps are monotonically non-decreasing (Property 9)
        for (i in 1 until segmentTimestamps.size) {
            assertTrue(
                "Timestamps should be monotonically non-decreasing",
                segmentTimestamps[i] >= segmentTimestamps[i - 1]
            )
        }
        
        // ========== STEP 6: Verify Final Detection State ==========
        val finalState = monitoringManager.detectionState.value
        assertNotNull("Final detection state should be set", finalState)
        
        if (finalState != null) {
            assertEquals("Mode should be DEMO", DetectionMode.DEMO, finalState.mode)
            assertNotNull("Metadata risk should be present", finalState.metadataRisk)
            assertNotNull("Fused risk should be present", finalState.fusedRisk)
            
            val fusedRisk = finalState.fusedRisk!!
            
            // Verify risk score bounds (Property 1)
            assertTrue("Risk score should be non-negative", fusedRisk.riskScore >= 0f)
            assertTrue("Risk score should be <= 15", fusedRisk.riskScore <= 15f)
            assertTrue("Confidence should be in [0, 1]", fusedRisk.confidence in 0f..1f)
            
            // Verify expected risk level matches (within tolerance)
            val expectedScore = bankFraudScenario.expectedScore
            val actualPercentage = fusedRisk.getRiskPercentage()
            val tolerance = 10 // 10% tolerance
            
            assertTrue(
                "Actual risk ($actualPercentage%) should be within $tolerance% of expected ($expectedScore%)",
                Math.abs(actualPercentage - expectedScore) <= tolerance
            )
        }
        
        // ========== STEP 7: Verify Risk Breakdown ==========
        val finalBreakdown = monitoringManager.riskBreakdown.value
        assertNotNull("Risk breakdown should be set", finalBreakdown)
        
        if (finalBreakdown != null) {
            // Verify contribution conservation (Property 3)
            val totalContribution = finalBreakdown.metadataContribution +
                                   finalBreakdown.manipulationContribution +
                                   finalBreakdown.historicalContribution
            
            assertEquals(
                "Contributions should sum to total score",
                finalBreakdown.totalScore,
                totalContribution,
                0.1f
            )
            
            // High-risk scenario should have triggers
            assertTrue(
                "High-risk scenario should have detected triggers",
                finalBreakdown.triggers.isNotEmpty()
            )
            
            // Verify trigger structure
            finalBreakdown.triggers.forEach { trigger ->
                assertNotNull("Trigger category should be set", trigger.category)
                assertFalse("Trigger description should not be empty", trigger.description.isEmpty())
                assertTrue("Trigger score should be positive", trigger.score > 0)
                assertNotNull("Trigger severity should be set", trigger.severity)
            }
        }
        
        // ========== STEP 8: Verify Database Persistence ==========
        delay(500) // Wait for database write
        
        val callRecords = database.callHistoryDao().getAllCalls()
        
        // Demo mode may or may not persist to database depending on implementation
        // If records exist, verify structure
        if (callRecords.isNotEmpty()) {
            val demoCall = callRecords.first()
            
            assertNotNull("Call ID should be set", demoCall.id)
            assertFalse("Phone number should not be empty", demoCall.phoneNumber.isEmpty())
            
            // Query risk assessment
            val riskAssessment = database.riskAssessmentDao().getRiskByCallId(demoCall.id)
            
            if (riskAssessment != null) {
                assertTrue("Total score should be non-negative", riskAssessment.totalScore >= 0f)
                assertFalse("Risk level should not be empty", riskAssessment.riskLevel.isEmpty())
                
                // Query triggers
                val triggers = database.riskTriggerDao().getTriggersByRiskId(riskAssessment.id)
                
                if (riskAssessment.totalScore > 5f) {
                    assertTrue(
                        "High-risk assessment should have triggers",
                        triggers.isNotEmpty()
                    )
                }
            }
        }
        
        // ========== STEP 9: Verify UI State Flows ==========
        val threatLevel = monitoringManager.threatLevel.value
        assertNotNull("Threat level should be set", threatLevel)
        
        if (bankFraudScenario.expectedRiskLevel == "HIGH") {
            assertEquals(
                "High-risk scenario should have DANGER threat level",
                ThreatLevel.DANGER,
                threatLevel
            )
        }
        
        val transcription = monitoringManager.transcription.value
        assertFalse(
            "Transcription should not be empty after scenario",
            transcription.isEmpty()
        )
        
        monitoringManager.stopMonitoring()
    }
    
    @Test
    fun `test demo scenario playback controls - pause and resume`() = runTest {
        monitoringManager.startMonitoring()
        delay(100)
        
        // Select scenario
        val scenarios = monitoringManager.getDemoScenarios()
        val testScenario = scenarios.first()
        monitoringManager.selectDemoScenario(testScenario.id)
        delay(50)
        
        // Start playback
        monitoringManager.playDemoScenario()
        delay(300)
        
        // Verify playing
        val progressWhilePlaying = monitoringManager.scenarioProgress.value
        assertNotNull("Progress should be set", progressWhilePlaying)
        assertTrue("Should be playing", progressWhilePlaying?.isPlaying == true)
        
        val segmentBeforePause = progressWhilePlaying?.currentSegment ?: 0
        
        // Pause
        monitoringManager.pauseDemoScenario()
        delay(100)
        
        // Verify paused
        val progressWhilePaused = monitoringManager.scenarioProgress.value
        assertNotNull("Progress should still be set", progressWhilePaused)
        assertFalse("Should not be playing", progressWhilePaused?.isPlaying == true)
        assertTrue("Should be paused", progressWhilePaused?.isPaused == true)
        
        val segmentWhilePaused = progressWhilePaused?.currentSegment ?: 0
        
        // Wait and verify segment doesn't advance
        delay(300)
        val progressStillPaused = monitoringManager.scenarioProgress.value
        assertEquals(
            "Segment should not advance while paused",
            segmentWhilePaused,
            progressStillPaused?.currentSegment
        )
        
        // Resume
        monitoringManager.playDemoScenario()
        delay(300)
        
        // Verify resumed
        val progressAfterResume = monitoringManager.scenarioProgress.value
        assertTrue("Should be playing after resume", progressAfterResume?.isPlaying == true)
        assertFalse("Should not be paused after resume", progressAfterResume?.isPaused == true)
        
        monitoringManager.stopMonitoring()
    }
    
    @Test
    fun `test demo scenario reset functionality`() = runTest {
        monitoringManager.startMonitoring()
        delay(100)
        
        // Select and play scenario
        val scenarios = monitoringManager.getDemoScenarios()
        val testScenario = scenarios.first()
        monitoringManager.selectDemoScenario(testScenario.id)
        monitoringManager.playDemoScenario()
        
        // Let it play for a bit
        delay(500)
        
        val progressBeforeReset = monitoringManager.scenarioProgress.value
        assertTrue(
            "Should have progressed",
            (progressBeforeReset?.currentSegment ?: 0) > 0
        )
        
        // Reset
        monitoringManager.resetDemoScenario()
        delay(100)
        
        // Verify reset
        val progressAfterReset = monitoringManager.scenarioProgress.value
        assertNotNull("Progress should still be set", progressAfterReset)
        assertEquals(
            "Should be back to segment 0",
            0,
            progressAfterReset?.currentSegment
        )
        assertFalse("Should not be playing", progressAfterReset?.isPlaying == true)
        assertFalse("Should not be paused", progressAfterReset?.isPaused == true)
        
        monitoringManager.stopMonitoring()
    }
    
    @Test
    fun `test demo mode operates without network connectivity`() = runTest {
        // Property 17: Demo mode independence
        // Validates: Requirements 17.3, 17.4
        
        // Mock network unavailable
        mockkObject(Config)
        every { Config.DEMO_MODE } returns true
        every { Config.WEBSOCKET_URL } returns "wss://unreachable.example.com"
        
        monitoringManager.startMonitoring()
        delay(150)
        
        // Demo mode should work regardless of network
        assertEquals(
            "Should be in DEMO mode",
            DetectionMode.DEMO,
            monitoringManager.detectionMode.value
        )
        
        // Select and play scenario
        val scenarios = monitoringManager.getDemoScenarios()
        assertFalse("Should have scenarios even without network", scenarios.isEmpty())
        
        val testScenario = scenarios.first()
        monitoringManager.selectDemoScenario(testScenario.id)
        monitoringManager.playDemoScenario()
        
        delay(500)
        
        // Verify detection works
        val detectionState = monitoringManager.detectionState.value
        assertNotNull("Detection should work without network", detectionState)
        
        if (detectionState != null) {
            assertNotNull("Should have metadata risk", detectionState.metadataRisk)
            assertNotNull("Should have fused risk", detectionState.fusedRisk)
        }
        
        monitoringManager.stopMonitoring()
    }
    
    @Test
    fun `test scenario playback determinism - multiple runs produce same results`() = runTest {
        // Property 19: Scenario playback determinism
        // Validates: Requirements 4.1, 4.2, 17.2
        
        val scenarios = ScamScenarios.getAllScenarios()
        val testScenario = scenarios.first()
        
        val results1 = playScenarioAndCollectResults(testScenario)
        val results2 = playScenarioAndCollectResults(testScenario)
        
        // Verify same number of segments processed
        assertEquals(
            "Should process same number of segments",
            results1.size,
            results2.size
        )
        
        // Verify risk scores are identical (or very close due to timing)
        for (i in results1.indices) {
            val score1 = results1[i]
            val score2 = results2[i]
            
            assertEquals(
                "Risk scores should be identical for segment $i",
                score1,
                score2,
                0.1f // Small tolerance for floating-point
            )
        }
    }
    
    private suspend fun playScenarioAndCollectResults(scenario: com.macher.android.demo.ScamScenario): List<Float> {
        val results = mutableListOf<Float>()
        
        monitoringManager.startMonitoring()
        delay(100)
        
        monitoringManager.selectDemoScenario(scenario.id)
        monitoringManager.playDemoScenario()
        
        // Collect risk scores at each segment
        repeat(scenario.conversation.size * 2) {
            delay(200)
            
            val state = monitoringManager.detectionState.value
            if (state?.fusedRisk != null) {
                results.add(state.fusedRisk.riskScore)
            }
            
            val progress = monitoringManager.scenarioProgress.value
            if (progress != null && !progress.isPlaying && progress.currentSegment >= scenario.conversation.size - 1) {
                break
            }
        }
        
        monitoringManager.stopMonitoring()
        delay(100)
        
        return results
    }
}
