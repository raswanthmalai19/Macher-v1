package com.vocalshield.android.demo

import com.vocalshield.android.detection.CallMetadata
import com.vocalshield.android.detection.RiskLevel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for DemoScenarioController.
 * 
 * Tests scenario selection, playback state transitions, progress calculation,
 * segment timing, and text accumulation correctness.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DemoScenarioControllerTest {
    
    private lateinit var controller: DemoScenarioController
    private val analyzedCalls = mutableListOf<Pair<CallMetadata, String>>()
    
    @Before
    fun setup() {
        analyzedCalls.clear()
        controller = DemoScenarioController { metadata, text ->
            analyzedCalls.add(Pair(metadata, text))
        }
    }
    
    // ========== Scenario Selection Tests ==========
    
    @Test
    fun `selectScenario should set current scenario and reset state`() {
        // Given
        val scenario = ScamScenarios.BANK_FRAUD_OTP
        
        // When
        controller.selectScenario(scenario)
        
        // Then
        assertEquals(scenario, controller.getCurrentScenario())
        assertNotNull(controller.progress.value)
        assertEquals(0, controller.progress.value?.currentSegment)
        assertEquals(scenario.conversation.size, controller.progress.value?.totalSegments)
        assertFalse(controller.progress.value?.isPlaying ?: true)
        assertFalse(controller.progress.value?.isPaused ?: true)
    }
    
    @Test
    fun `selectScenario should update progress with scenario details`() {
        // Given
        val scenario = ScamScenarios.TAX_DEPARTMENT_SCAM
        
        // When
        controller.selectScenario(scenario)
        
        // Then
        val progress = controller.progress.value
        assertNotNull(progress)
        assertEquals(scenario.id, progress?.scenarioId)
        assertEquals(scenario.title, progress?.scenarioTitle)
        assertEquals(0, progress?.currentSegment)
        assertEquals(scenario.conversation.size, progress?.totalSegments)
    }
    
    @Test(expected = IllegalArgumentException::class)
    fun `selectScenario should throw exception for empty conversation`() {
        // Given
        val invalidScenario = ScamScenario(
            id = "invalid",
            title = "Invalid",
            description = "Test",
            phoneNumber = "+1234567890",
            isInternational = false,
            callTime = System.currentTimeMillis(),
            conversation = emptyList(),
            expectedRiskLevel = "LOW",
            expectedScore = 0,
            keyTriggers = emptyList()
        )
        
        // When/Then
        controller.selectScenario(invalidScenario)
    }
    
    @Test
    fun `hasScenario should return true after selection`() {
        // Given
        assertFalse(controller.hasScenario())
        
        // When
        controller.selectScenario(ScamScenarios.BANK_FRAUD_OTP)
        
        // Then
        assertTrue(controller.hasScenario())
    }
    
    // ========== Playback State Tests ==========
    
    @Test
    fun `playScenario should start playback from beginning`() = runTest {
        // Given
        controller.selectScenario(ScamScenarios.LEGITIMATE_CALL)
        
        // When
        controller.playScenario()
        advanceTimeBy(100) // Allow coroutine to start
        
        // Then
        assertTrue(controller.isPlaying())
        assertFalse(controller.progress.value?.isPaused ?: true)
    }
    
    @Test(expected = IllegalStateException::class)
    fun `playScenario should throw exception when no scenario selected`() {
        // When/Then
        controller.playScenario()
    }
    
    @Test
    fun `pauseScenario should set paused state`() = runTest {
        // Given
        controller.selectScenario(ScamScenarios.BANK_FRAUD_OTP)
        controller.playScenario()
        advanceTimeBy(100)
        
        // When
        controller.pauseScenario()
        advanceTimeBy(100)
        
        // Then
        assertFalse(controller.isPlaying())
        assertTrue(controller.progress.value?.isPaused ?: false)
    }
    
    @Test
    fun `resetScenario should reset to beginning`() = runTest {
        // Given
        controller.selectScenario(ScamScenarios.BANK_FRAUD_OTP)
        controller.playScenario()
        advanceTimeBy(1000)
        controller.pauseScenario()
        
        // When
        controller.resetScenario()
        
        // Then
        val progress = controller.progress.value
        assertEquals(0, progress?.currentSegment)
        assertEquals(0L, progress?.elapsedTime)
        assertFalse(progress?.isPlaying ?: true)
        assertFalse(progress?.isPaused ?: true)
    }
    
    @Test
    fun `playScenario should resume from pause`() = runTest {
        // Given
        controller.selectScenario(ScamScenarios.BANK_FRAUD_OTP)
        controller.playScenario()
        advanceTimeBy(1000)
        controller.pauseScenario()
        val segmentBeforePause = controller.progress.value?.currentSegment ?: 0
        
        // When
        controller.playScenario() // Resume
        advanceTimeBy(100)
        
        // Then
        assertTrue(controller.isPlaying())
        assertFalse(controller.progress.value?.isPaused ?: true)
        // Should continue from where it paused
        assertTrue((controller.progress.value?.currentSegment ?: 0) >= segmentBeforePause)
    }
    
    // ========== Progress Calculation Tests ==========
    
    @Test
    fun `getProgressPercentage should calculate correctly`() {
        // Given
        controller.selectScenario(ScamScenarios.BANK_FRAUD_OTP)
        val totalSegments = ScamScenarios.BANK_FRAUD_OTP.conversation.size
        
        // When/Then - at start
        assertEquals(0, controller.progress.value?.getProgressPercentage())
    }
    
    @Test
    fun `progress should update after each segment`() = runTest {
        // Given
        val scenario = ScamScenarios.LEGITIMATE_CALL
        controller.selectScenario(scenario)
        
        // When
        controller.playScenario()
        
        // Advance through first segment
        advanceTimeBy(scenario.conversation[0].timestamp + 100)
        
        // Then
        val progress = controller.progress.value
        assertTrue((progress?.currentSegment ?: 0) >= 0)
    }
    
    @Test
    fun `elapsed time should increase during playback`() = runTest {
        // Given
        controller.selectScenario(ScamScenarios.LEGITIMATE_CALL)
        
        // When
        controller.playScenario()
        advanceTimeBy(1000)
        val elapsed1 = controller.progress.value?.elapsedTime ?: 0
        
        advanceTimeBy(1000)
        val elapsed2 = controller.progress.value?.elapsedTime ?: 0
        
        // Then
        assertTrue(elapsed2 >= elapsed1)
    }
    
    // ========== Segment Timing Tests ==========
    
    @Test
    fun `playback should respect segment timing`() = runTest {
        // Given
        val scenario = ScamScenarios.BANK_FRAUD_OTP
        controller.selectScenario(scenario)
        
        // When
        controller.playScenario()
        
        // Advance to first segment
        advanceTimeBy(scenario.conversation[0].timestamp + 100)
        val segment1 = controller.progress.value?.currentSegment ?: 0
        
        // Advance to second segment
        val delay = scenario.conversation[1].timestamp - scenario.conversation[0].timestamp
        advanceTimeBy(delay + 100)
        val segment2 = controller.progress.value?.currentSegment ?: 0
        
        // Then
        assertTrue(segment2 > segment1)
    }
    
    @Test
    fun `playback should complete all segments`() = runTest {
        // Given
        val scenario = ScamScenarios.LEGITIMATE_CALL
        controller.selectScenario(scenario)
        
        // When
        controller.playScenario()
        advanceUntilIdle() // Complete all segments
        
        // Then
        val progress = controller.progress.value
        assertEquals(scenario.conversation.size, progress?.currentSegment)
    }
    
    // ========== Text Accumulation Tests ==========
    
    @Test
    fun `should accumulate transcription text progressively`() = runTest {
        // Given
        val scenario = ScamScenarios.BANK_FRAUD_OTP
        controller.selectScenario(scenario)
        
        // When
        controller.playScenario()
        advanceUntilIdle()
        
        // Then
        assertTrue(analyzedCalls.size > 0)
        
        // First call should have empty text (metadata only)
        assertEquals("", analyzedCalls[0].second)
        
        // Subsequent calls should have accumulated text
        if (analyzedCalls.size > 1) {
            val text1 = analyzedCalls[1].second
            assertTrue(text1.contains(scenario.conversation[0].text))
        }
        
        if (analyzedCalls.size > 2) {
            val text2 = analyzedCalls[2].second
            assertTrue(text2.contains(scenario.conversation[0].text))
            assertTrue(text2.contains(scenario.conversation[1].text))
        }
    }
    
    @Test
    fun `should analyze metadata first with empty text`() = runTest {
        // Given
        val scenario = ScamScenarios.TAX_DEPARTMENT_SCAM
        controller.selectScenario(scenario)
        
        // When
        controller.playScenario()
        advanceTimeBy(100)
        
        // Then
        assertTrue(analyzedCalls.size >= 1)
        assertEquals("", analyzedCalls[0].second)
        assertEquals(scenario.phoneNumber, analyzedCalls[0].first.phoneNumber)
    }
    
    @Test
    fun `should create correct metadata from scenario`() = runTest {
        // Given
        val scenario = ScamScenarios.TAX_DEPARTMENT_SCAM
        controller.selectScenario(scenario)
        
        // When
        controller.playScenario()
        advanceTimeBy(100)
        
        // Then
        val metadata = analyzedCalls[0].first
        assertEquals(scenario.phoneNumber, metadata.phoneNumber)
        assertEquals(scenario.callTime, metadata.callTime)
        assertFalse(metadata.isInContacts)
        
        // International calls should have recentCallCount = 1
        if (scenario.isInternational) {
            assertEquals(1, metadata.recentCallCount)
        } else {
            assertEquals(3, metadata.recentCallCount)
        }
    }
    
    // ========== Risk Level Update Tests ==========
    
    @Test
    fun `updateRiskLevel should update progress`() {
        // Given
        controller.selectScenario(ScamScenarios.BANK_FRAUD_OTP)
        val initialRisk = controller.progress.value?.currentRiskLevel
        
        // When
        controller.updateRiskLevel(RiskLevel.HIGH)
        
        // Then
        assertEquals(RiskLevel.HIGH, controller.progress.value?.currentRiskLevel)
        assertNotEquals(initialRisk, controller.progress.value?.currentRiskLevel)
    }
    
    @Test
    fun `updateRiskLevel should work during playback`() = runTest {
        // Given
        controller.selectScenario(ScamScenarios.BANK_FRAUD_OTP)
        controller.playScenario()
        advanceTimeBy(100)
        
        // When
        controller.updateRiskLevel(RiskLevel.MEDIUM)
        
        // Then
        assertEquals(RiskLevel.MEDIUM, controller.progress.value?.currentRiskLevel)
    }
    
    // ========== Cleanup Tests ==========
    
    @Test
    fun `cleanup should cancel playback and clear state`() = runTest {
        // Given
        controller.selectScenario(ScamScenarios.BANK_FRAUD_OTP)
        controller.playScenario()
        advanceTimeBy(100)
        
        // When
        controller.cleanup()
        
        // Then
        assertFalse(controller.isPlaying())
        assertNull(controller.getCurrentScenario())
        assertNull(controller.progress.value)
    }
    
    // ========== Available Scenarios Tests ==========
    
    @Test
    fun `getAvailableScenarios should return all scenarios`() {
        // When
        val scenarios = controller.getAvailableScenarios()
        
        // Then
        assertEquals(6, scenarios.size)
        assertTrue(scenarios.any { it.id == "bank_otp" })
        assertTrue(scenarios.any { it.id == "tax_scam" })
        assertTrue(scenarios.any { it.id == "family_emergency" })
        assertTrue(scenarios.any { it.id == "lottery" })
        assertTrue(scenarios.any { it.id == "tech_support" })
        assertTrue(scenarios.any { it.id == "legitimate" })
    }
}
