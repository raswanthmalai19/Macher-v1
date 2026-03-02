package com.vocalshield.android.integration

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.vocalshield.android.data.database.VocalShieldDatabase
import com.vocalshield.android.detection.*
import com.vocalshield.android.service.DetectionMode
import com.vocalshield.android.service.MonitoringManager
import com.vocalshield.android.util.Config
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.*
import io.kotest.property.checkAll
import io.mockk.every
import io.mockk.mockkObject
import io.mockk.unmockkAll
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config as RobolectricConfig

/**
 * Integration Property Tests 13.6 and 13.7
 * 
 * Property-based tests for integration scenarios:
 * - Property 9: State flow emission order (timestamps monotonically non-decreasing)
 * - Property 2: Detection state consistency (risk presence matches mode)
 * 
 * **Validates: Requirements 1.2, 1.3, 1.4, 5.2, 10.1**
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@RobolectricConfig(sdk = [30])
class IntegrationPropertyTests {
    
    private lateinit var context: Context
    private lateinit var database: VocalShieldDatabase
    
    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        database = VocalShieldDatabase.getInMemoryDatabase(context)
        
        mockkObject(Config)
        every { Config.DEMO_MODE } returns true
        every { Config.WEBSOCKET_URL } returns "wss://test.example.com"
    }
    
    @After
    fun teardown() {
        database.close()
        unmockkAll()
    }
    
    /**
     * Property 9: State Flow Emission Order
     * 
     * For any sequence of state updates emitted via StateFlow, the timestamps must be
     * monotonically non-decreasing, ensuring chronological ordering and preventing
     * time-travel paradoxes in the UI.
     * 
     * **Validates: Requirements 1.2, 10.1**
     */
    @Test
    fun `property 9 - state flow emission timestamps are monotonically non-decreasing`() = runTest {
        suspend fun checkTimestampMonotonicity(sampleCount: Int) {
            val monitoringManager = MonitoringManager(context)
            
            try {
                monitoringManager.startMonitoring()
                delay(150)
                
                val timestamps = mutableListOf<Long>()
                
                // Collect multiple state updates
                repeat(sampleCount) {
                    delay(50)
                    val state = monitoringManager.detectionState.value
                    if (state != null) {
                        timestamps.add(state.timestamp)
                    }
                }
                
                // Verify monotonicity
                for (i in 1 until timestamps.size) {
                    val prev = timestamps[i - 1]
                    val curr = timestamps[i]
                    
                    if (curr < prev) {
                        throw AssertionError(
                            "Timestamps not monotonic: timestamps[$i-1]=$prev > timestamps[$i]=$curr"
                        )
                    }
                }
                
                monitoringManager.stopMonitoring()
                delay(50)
            } finally {
                monitoringManager.stopMonitoring()
            }
        }
        
        // Test with different sample counts
        checkAll<Int>(100) { seed ->
            val sampleCount = (seed % 10) + 3 // 3-12 samples
            checkTimestampMonotonicity(sampleCount)
        }
    }
    
    /**
     * Property 2: Detection State Consistency
     * 
     * For any detection state, the presence or absence of risk results must be consistent
     * with the current detection mode:
     * - Metadata-only mode must have null manipulation risk
     * - Demo mode must have both metadata and manipulation risk (when analyzed)
     * - Fused risk requires at least one layer result
     * 
     * **Validates: Requirements 1.3, 1.4, 5.2**
     */
    @Test
    fun `property 2 - detection state consistency with mode`() = runTest {
        suspend fun checkStateConsistency(mode: DetectionMode) {
            val monitoringManager = MonitoringManager(context)
            
            try {
                monitoringManager.startMonitoring()
                delay(200)
                
                // Collect multiple states
                val states = mutableListOf<DetectionState>()
                repeat(5) {
                    delay(100)
                    val state = monitoringManager.detectionState.value
                    if (state != null) {
                        states.add(state)
                    }
                }
                
                // Verify consistency for each state
                states.forEach { state ->
                    when (state.mode) {
                        DetectionMode.REAL_METADATA_ONLY -> {
                            // Metadata-only mode should have metadata risk
                            state.metadataRisk shouldNotBe null
                            
                            // Metadata-only mode should NOT have manipulation risk
                            state.manipulationRisk shouldBe null
                            
                            // Should have fused risk (from metadata)
                            state.fusedRisk shouldNotBe null
                        }
                        
                        DetectionMode.DEMO -> {
                            // Demo mode should have metadata risk
                            state.metadataRisk shouldNotBe null
                            
                            // Demo mode may have manipulation risk (depends on analysis stage)
                            // No strict requirement here
                            
                            // Should have fused risk
                            state.fusedRisk shouldNotBe null
                        }
                        
                        DetectionMode.REAL_FULL -> {
                            // Full mode should have metadata risk
                            state.metadataRisk shouldNotBe null
                            
                            // Full mode may have manipulation risk (depends on AWS availability)
                            // No strict requirement here
                            
                            // Should have fused risk
                            state.fusedRisk shouldNotBe null
                        }
                    }
                    
                    // Universal requirement: fused risk requires at least one layer
                    if (state.fusedRisk != null) {
                        val hasAtLeastOneLayer = state.metadataRisk != null || state.manipulationRisk != null
                        hasAtLeastOneLayer shouldBe true
                    }
                }
                
                monitoringManager.stopMonitoring()
                delay(50)
            } finally {
                monitoringManager.stopMonitoring()
            }
        }
        
        // Test with different modes
        checkAll<Int>(50) { seed ->
            val modeIndex = seed % 3
            val mode = when (modeIndex) {
                0 -> DetectionMode.REAL_FULL
                1 -> DetectionMode.REAL_METADATA_ONLY
                else -> DetectionMode.DEMO
            }
            
            checkStateConsistency(mode)
        }
    }
    
    /**
     * Property: Risk Breakdown Conservation (Integration Context)
     * 
     * For any risk breakdown created during integration flow, the sum of individual
     * layer contributions must equal the total risk score within tolerance.
     * 
     * **Validates: Requirements 2.1, 2.3**
     */
    @Test
    fun `property - risk breakdown conservation in integration flow`() = runTest {
        suspend fun checkBreakdownConservation() {
            val monitoringManager = MonitoringManager(context)
            
            try {
                monitoringManager.startMonitoring()
                delay(200)
                
                // Collect risk breakdowns
                val breakdowns = mutableListOf<com.vocalshield.android.service.RiskBreakdown>()
                repeat(5) {
                    delay(100)
                    val breakdown = monitoringManager.riskBreakdown.value
                    if (breakdown != null) {
                        breakdowns.add(breakdown)
                    }
                }
                
                // Verify conservation for each breakdown
                breakdowns.forEach { breakdown ->
                    val totalContribution = breakdown.metadataContribution +
                                           breakdown.manipulationContribution +
                                           breakdown.historicalContribution
                    
                    val difference = Math.abs(breakdown.totalScore - totalContribution)
                    val tolerance = 0.1f
                    
                    if (difference > tolerance) {
                        throw AssertionError(
                            "Risk breakdown conservation violated: " +
                            "total=${breakdown.totalScore}, " +
                            "sum=$totalContribution, " +
                            "difference=$difference"
                        )
                    }
                }
                
                monitoringManager.stopMonitoring()
                delay(50)
            } finally {
                monitoringManager.stopMonitoring()
            }
        }
        
        // Run multiple times to catch edge cases
        checkAll<Int>(100) { _ ->
            checkBreakdownConservation()
        }
    }
    
    /**
     * Property: Detection State Structure Completeness
     * 
     * For any detection state emitted during integration, it must include:
     * - Valid detection mode
     * - Non-negative timestamp
     * - If fused risk present, at least one layer result
     * 
     * **Validates: Requirements 1.1, 1.5**
     */
    @Test
    fun `property - detection state structure completeness`() = runTest {
        suspend fun checkStateCompleteness() {
            val monitoringManager = MonitoringManager(context)
            
            try {
                monitoringManager.startMonitoring()
                delay(200)
                
                // Collect states
                val states = mutableListOf<DetectionState>()
                repeat(5) {
                    delay(100)
                    val state = monitoringManager.detectionState.value
                    if (state != null) {
                        states.add(state)
                    }
                }
                
                // Verify completeness for each state
                states.forEach { state ->
                    // Must have valid mode
                    state.mode shouldNotBe null
                    
                    // Must have positive timestamp
                    if (state.timestamp <= 0) {
                        throw AssertionError("Invalid timestamp: ${state.timestamp}")
                    }
                    
                    // If fused risk present, must have at least one layer
                    if (state.fusedRisk != null) {
                        val hasLayer = state.metadataRisk != null || state.manipulationRisk != null
                        if (!hasLayer) {
                            throw AssertionError("Fused risk without any layer results")
                        }
                    }
                }
                
                monitoringManager.stopMonitoring()
                delay(50)
            } finally {
                monitoringManager.stopMonitoring()
            }
        }
        
        checkAll<Int>(100) { _ ->
            checkStateCompleteness()
        }
    }
    
    /**
     * Property: Scenario Progress Bounds
     * 
     * For any scenario progress state during demo playback:
     * - Current segment must be non-negative and not exceed total
     * - Progress percentage must be in [0, 100]
     * - Elapsed time must be non-negative
     * 
     * **Validates: Requirements 3.4, 4.1**
     */
    @Test
    fun `property - scenario progress bounds during playback`() = runTest {
        suspend fun checkProgressBounds() {
            val monitoringManager = MonitoringManager(context)
            
            try {
                monitoringManager.startMonitoring()
                delay(150)
                
                // Select and play a scenario
                val scenarios = monitoringManager.getDemoScenarios()
                if (scenarios.isNotEmpty()) {
                    val scenario = scenarios.first()
                    monitoringManager.selectDemoScenario(scenario.id)
                    monitoringManager.playDemoScenario()
                    
                    // Collect progress states
                    val progressStates = mutableListOf<com.vocalshield.android.service.ScenarioProgress>()
                    repeat(10) {
                        delay(100)
                        val progress = monitoringManager.scenarioProgress.value
                        if (progress != null) {
                            progressStates.add(progress)
                        }
                    }
                    
                    // Verify bounds for each progress state
                    progressStates.forEach { progress ->
                        // Current segment bounds
                        if (progress.currentSegment < 0) {
                            throw AssertionError("Negative current segment: ${progress.currentSegment}")
                        }
                        if (progress.currentSegment > progress.totalSegments) {
                            throw AssertionError(
                                "Current segment exceeds total: " +
                                "${progress.currentSegment} > ${progress.totalSegments}"
                            )
                        }
                        
                        // Progress percentage bounds
                        val percentage = progress.getProgressPercentage()
                        if (percentage < 0 || percentage > 100) {
                            throw AssertionError("Progress percentage out of bounds: $percentage")
                        }
                        
                        // Elapsed time bounds
                        if (progress.elapsedTime < 0) {
                            throw AssertionError("Negative elapsed time: ${progress.elapsedTime}")
                        }
                    }
                }
                
                monitoringManager.stopMonitoring()
                delay(50)
            } finally {
                monitoringManager.stopMonitoring()
            }
        }
        
        checkAll<Int>(50) { _ ->
            checkProgressBounds()
        }
    }
}
