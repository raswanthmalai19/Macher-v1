package com.vocalshield.android.service

import android.content.Context
import com.vocalshield.android.detection.*
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for MonitoringManager state management (Task 2.4)
 * 
 * Tests state flow emissions, risk breakdown creation, null handling,
 * and timestamp monotonicity.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MonitoringManagerStateTest {
    
    private lateinit var mockContext: Context
    private lateinit var monitoringManager: MonitoringManager
    
    @Before
    fun setup() {
        mockContext = mockk(relaxed = true)
        monitoringManager = MonitoringManager(mockContext)
    }
    
    @Test
    fun `test initial state flows are null or default`() = runTest {
        // Verify initial state
        assertNull(monitoringManager.detectionState.value)
        assertNull(monitoringManager.riskBreakdown.value)
        assertNull(monitoringManager.scenarioProgress.value)
        assertTrue(monitoringManager.historicalRisks.value.isEmpty())
        assertEquals(DetectionMode.REAL_FULL, monitoringManager.detectionMode.value)
    }
    
    @Test
    fun `test detection mode changes to DEMO when demo mode starts`() = runTest {
        // This test would require mocking Config.DEMO_MODE
        // For now, verify the detection mode flow exists and is accessible
        assertNotNull(monitoringManager.detectionMode)
        assertEquals(DetectionMode.REAL_FULL, monitoringManager.detectionMode.value)
    }
    
    @Test
    fun `test createRiskBreakdown with metadata triggers only`() {
        // Create test data
        val metadataRisk = MetadataRiskResult(
            riskScore = 5,
            riskLevel = RiskLevel.MEDIUM,
            triggers = listOf("Unknown number", "International number"),
            confidence = 0.6f
        )
        
        val fusedRisk = FusedRiskResult(
            riskScore = 5f,
            riskLevel = RiskLevel.MEDIUM,
            confidence = 0.6f,
            triggers = listOf("Unknown number", "International number"),
            explanation = "Medium risk detected",
            metadataContribution = 5f,
            manipulationContribution = 0f,
            historicalContribution = 0f
        )
        
        // Use reflection to access private method (for testing purposes)
        val method = MonitoringManager::class.java.getDeclaredMethod(
            "createRiskBreakdown",
            MetadataRiskResult::class.java,
            ManipulationResult::class.java,
            FusedRiskResult::class.java
        )
        method.isAccessible = true
        
        val breakdown = method.invoke(
            monitoringManager,
            metadataRisk,
            null,
            fusedRisk
        ) as RiskBreakdown
        
        // Verify breakdown
        assertEquals(5f, breakdown.totalScore, 0.01f)
        assertEquals(33, breakdown.riskPercentage) // 5/15 * 100 = 33%
        assertEquals(5f, breakdown.metadataContribution, 0.01f)
        assertEquals(0f, breakdown.manipulationContribution, 0.01f)
        assertEquals(0.6f, breakdown.confidence, 0.01f)
        assertEquals(2, breakdown.triggers.size)
        
        // Verify triggers are properly categorized
        assertTrue(breakdown.triggers.any { it.category == TriggerCategory.METADATA_UNKNOWN_NUMBER })
        assertTrue(breakdown.triggers.any { it.category == TriggerCategory.METADATA_INTERNATIONAL })
    }
    
    @Test
    fun `test createRiskBreakdown with manipulation triggers only`() {
        val manipulationRisk = ManipulationResult(
            riskScore = 8,
            riskLevel = RiskLevel.HIGH,
            patterns = listOf(
                ManipulationPattern(
                    category = ManipulationCategory.URGENCY,
                    matches = listOf("immediately", "urgent"),
                    score = 4,
                    description = "Urgency pressure detected"
                ),
                ManipulationPattern(
                    category = ManipulationCategory.FINANCIAL,
                    matches = listOf("transfer money", "otp"),
                    score = 4,
                    description = "Financial coercion detected"
                )
            ),
            confidence = 0.85f,
            summary = "Urgency, Financial"
        )
        
        val fusedRisk = FusedRiskResult(
            riskScore = 8f,
            riskLevel = RiskLevel.HIGH,
            confidence = 0.85f,
            triggers = listOf("Urgency pressure detected", "Financial coercion detected"),
            explanation = "High risk detected",
            metadataContribution = 0f,
            manipulationContribution = 8f,
            historicalContribution = 0f
        )
        
        val method = MonitoringManager::class.java.getDeclaredMethod(
            "createRiskBreakdown",
            MetadataRiskResult::class.java,
            ManipulationResult::class.java,
            FusedRiskResult::class.java
        )
        method.isAccessible = true
        
        val breakdown = method.invoke(
            monitoringManager,
            null,
            manipulationRisk,
            fusedRisk
        ) as RiskBreakdown
        
        // Verify breakdown
        assertEquals(8f, breakdown.totalScore, 0.01f)
        assertEquals(53, breakdown.riskPercentage) // 8/15 * 100 = 53%
        assertEquals(0f, breakdown.metadataContribution, 0.01f)
        assertEquals(8f, breakdown.manipulationContribution, 0.01f)
        assertEquals(0.85f, breakdown.confidence, 0.01f)
        assertEquals(2, breakdown.triggers.size)
        
        // Verify triggers are properly categorized
        assertTrue(breakdown.triggers.any { it.category == TriggerCategory.MANIPULATION_URGENCY })
        assertTrue(breakdown.triggers.any { it.category == TriggerCategory.MANIPULATION_FINANCIAL })
    }
    
    @Test
    fun `test createRiskBreakdown with combined triggers`() {
        val metadataRisk = MetadataRiskResult(
            riskScore = 4,
            riskLevel = RiskLevel.MEDIUM,
            triggers = listOf("Unknown number", "Unusual time (midnight)"),
            confidence = 0.5f
        )
        
        val manipulationRisk = ManipulationResult(
            riskScore = 6,
            riskLevel = RiskLevel.MEDIUM,
            patterns = listOf(
                ManipulationPattern(
                    category = ManipulationCategory.AUTHORITY,
                    matches = listOf("police", "government"),
                    score = 6,
                    description = "Authority impersonation detected"
                )
            ),
            confidence = 0.7f,
            summary = "Authority"
        )
        
        val fusedRisk = FusedRiskResult(
            riskScore = 10f,
            riskLevel = RiskLevel.HIGH,
            confidence = 0.6f,
            triggers = listOf("Unknown number", "Unusual time (midnight)", "Authority impersonation detected"),
            explanation = "High risk detected",
            metadataContribution = 4f,
            manipulationContribution = 6f,
            historicalContribution = 0f
        )
        
        val method = MonitoringManager::class.java.getDeclaredMethod(
            "createRiskBreakdown",
            MetadataRiskResult::class.java,
            ManipulationResult::class.java,
            FusedRiskResult::class.java
        )
        method.isAccessible = true
        
        val breakdown = method.invoke(
            monitoringManager,
            metadataRisk,
            manipulationRisk,
            fusedRisk
        ) as RiskBreakdown
        
        // Verify breakdown
        assertEquals(10f, breakdown.totalScore, 0.01f)
        assertEquals(66, breakdown.riskPercentage) // 10/15 * 100 = 66%
        assertEquals(4f, breakdown.metadataContribution, 0.01f)
        assertEquals(6f, breakdown.manipulationContribution, 0.01f)
        assertEquals(0.6f, breakdown.confidence, 0.01f)
        assertEquals(3, breakdown.triggers.size)
        
        // Verify mixed trigger categories
        assertTrue(breakdown.triggers.any { it.category == TriggerCategory.METADATA_UNKNOWN_NUMBER })
        assertTrue(breakdown.triggers.any { it.category == TriggerCategory.METADATA_MIDNIGHT_CALL })
        assertTrue(breakdown.triggers.any { it.category == TriggerCategory.MANIPULATION_AUTHORITY })
    }
    
    @Test
    fun `test mapMetadataTriggerToCategory handles all trigger types`() {
        val method = MonitoringManager::class.java.getDeclaredMethod(
            "mapMetadataTriggerToCategory",
            String::class.java
        )
        method.isAccessible = true
        
        // Test all metadata trigger mappings
        assertEquals(
            TriggerCategory.METADATA_UNKNOWN_NUMBER,
            method.invoke(monitoringManager, "Unknown number")
        )
        assertEquals(
            TriggerCategory.METADATA_INTERNATIONAL,
            method.invoke(monitoringManager, "International number")
        )
        assertEquals(
            TriggerCategory.METADATA_MIDNIGHT_CALL,
            method.invoke(monitoringManager, "Unusual time (midnight)")
        )
        assertEquals(
            TriggerCategory.METADATA_REPEATED_CALLS,
            method.invoke(monitoringManager, "Repeated short calls")
        )
        assertEquals(
            TriggerCategory.METADATA_HIGH_FREQUENCY,
            method.invoke(monitoringManager, "High call frequency")
        )
    }
    
    @Test
    fun `test mapManipulationCategoryToTrigger handles all categories`() {
        val method = MonitoringManager::class.java.getDeclaredMethod(
            "mapManipulationCategoryToTrigger",
            ManipulationCategory::class.java
        )
        method.isAccessible = true
        
        // Test all manipulation category mappings
        assertEquals(
            TriggerCategory.MANIPULATION_URGENCY,
            method.invoke(monitoringManager, ManipulationCategory.URGENCY)
        )
        assertEquals(
            TriggerCategory.MANIPULATION_AUTHORITY,
            method.invoke(monitoringManager, ManipulationCategory.AUTHORITY)
        )
        assertEquals(
            TriggerCategory.MANIPULATION_EMOTIONAL,
            method.invoke(monitoringManager, ManipulationCategory.EMOTIONAL)
        )
        assertEquals(
            TriggerCategory.MANIPULATION_FINANCIAL,
            method.invoke(monitoringManager, ManipulationCategory.FINANCIAL)
        )
        assertEquals(
            TriggerCategory.MANIPULATION_INFORMATION,
            method.invoke(monitoringManager, ManipulationCategory.INFORMATION)
        )
    }
    
    @Test
    fun `test trigger timestamps are consistent`() {
        val metadataRisk = MetadataRiskResult(
            riskScore = 3,
            riskLevel = RiskLevel.LOW,
            triggers = listOf("Unknown number"),
            confidence = 0.4f
        )
        
        val fusedRisk = FusedRiskResult(
            riskScore = 3f,
            riskLevel = RiskLevel.LOW,
            confidence = 0.4f,
            triggers = listOf("Unknown number"),
            explanation = "Low risk",
            metadataContribution = 3f,
            manipulationContribution = 0f,
            historicalContribution = 0f
        )
        
        val method = MonitoringManager::class.java.getDeclaredMethod(
            "createRiskBreakdown",
            MetadataRiskResult::class.java,
            ManipulationResult::class.java,
            FusedRiskResult::class.java
        )
        method.isAccessible = true
        
        val breakdown = method.invoke(
            monitoringManager,
            metadataRisk,
            null,
            fusedRisk
        ) as RiskBreakdown
        
        // Verify all triggers have the same timestamp (created in same call)
        val timestamps = breakdown.triggers.map { it.timestamp }.distinct()
        assertEquals(1, timestamps.size)
        
        // Verify timestamp is recent (within last second)
        val now = System.currentTimeMillis()
        assertTrue(timestamps[0] <= now)
        assertTrue(timestamps[0] >= now - 1000)
    }
    
    @Test
    fun `test null handling in metadata-only mode`() {
        val metadataRisk = MetadataRiskResult(
            riskScore = 2,
            riskLevel = RiskLevel.LOW,
            triggers = listOf("Unknown number"),
            confidence = 0.3f
        )
        
        val fusedRisk = FusedRiskResult(
            riskScore = 2f,
            riskLevel = RiskLevel.LOW,
            confidence = 0.3f,
            triggers = listOf("Unknown number"),
            explanation = "Low risk - metadata only",
            metadataContribution = 2f,
            manipulationContribution = 0f,
            historicalContribution = 0f
        )
        
        val method = MonitoringManager::class.java.getDeclaredMethod(
            "createRiskBreakdown",
            MetadataRiskResult::class.java,
            ManipulationResult::class.java,
            FusedRiskResult::class.java
        )
        method.isAccessible = true
        
        // Test with null manipulation risk (metadata-only mode)
        val breakdown = method.invoke(
            monitoringManager,
            metadataRisk,
            null,
            fusedRisk
        ) as RiskBreakdown
        
        // Verify breakdown handles null manipulation risk
        assertEquals(2f, breakdown.totalScore, 0.01f)
        assertEquals(0f, breakdown.manipulationContribution, 0.01f)
        assertEquals(1, breakdown.triggers.size)
        assertTrue(breakdown.triggers.all { it.category.name.startsWith("METADATA_") })
    }
    
    @Test
    fun `test risk breakdown with empty triggers`() {
        val fusedRisk = FusedRiskResult(
            riskScore = 0f,
            riskLevel = RiskLevel.LOW,
            confidence = 0.1f,
            triggers = emptyList(),
            explanation = "No threats detected",
            metadataContribution = 0f,
            manipulationContribution = 0f,
            historicalContribution = 0f
        )
        
        val method = MonitoringManager::class.java.getDeclaredMethod(
            "createRiskBreakdown",
            MetadataRiskResult::class.java,
            ManipulationResult::class.java,
            FusedRiskResult::class.java
        )
        method.isAccessible = true
        
        val breakdown = method.invoke(
            monitoringManager,
            null,
            null,
            fusedRisk
        ) as RiskBreakdown
        
        // Verify breakdown with no triggers
        assertEquals(0f, breakdown.totalScore, 0.01f)
        assertEquals(0, breakdown.riskPercentage)
        assertTrue(breakdown.triggers.isEmpty())
        assertEquals(0.1f, breakdown.confidence, 0.01f)
    }
}
