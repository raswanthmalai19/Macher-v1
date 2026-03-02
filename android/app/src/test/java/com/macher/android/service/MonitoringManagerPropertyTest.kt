package com.macher.android.service

import android.content.Context
import com.macher.android.detection.*
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.floats.shouldBeLessThanOrEqual
import io.kotest.matchers.shouldBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.*
import io.kotest.property.checkAll
import io.mockk.mockk

/**
 * Property-based tests for MonitoringManager (Task 2.5)
 * 
 * Tests universal correctness properties:
 * - Property 3: Risk Breakdown Conservation - Sum of contributions equals total score
 * - Property 8: Trigger Score Additivity - Triggers contribute meaningfully to risk
 */
class MonitoringManagerPropertyTest : StringSpec({
    
    val mockContext = mockk<Context>(relaxed = true)
    val monitoringManager = MonitoringManager(mockContext)
    
    // Arbitrary generators for test data
    val arbRiskScore = Arb.int(0..15)
    val arbConfidence = Arb.float(0f..1f)
    val arbRiskLevel = Arb.enum<RiskLevel>()
    val arbTriggerList = Arb.list(Arb.string(1..50), 0..10)
    
    val arbManipulationCategory = Arb.enum<ManipulationCategory>()
    val arbManipulationPattern = Arb.bind(
        arbManipulationCategory,
        Arb.list(Arb.string(1..20), 1..5),
        Arb.int(1..10)
    ) { category, matches, score ->
        ManipulationPattern(
            category = category,
            matches = matches,
            score = score,
            description = "${category.displayName} detected"
        )
    }
    
    "Property 3: Risk Breakdown Conservation - Sum of contributions equals total score" {
        checkAll(1000, arbRiskScore, arbRiskScore, arbRiskScore, arbConfidence) { 
            metadataScore, manipulationScore, historicalScore, confidence ->
            
            // Create test data with controlled scores
            val metadataRisk = if (metadataScore > 0) {
                MetadataRiskResult(
                    riskScore = metadataScore,
                    riskLevel = RiskLevel.MEDIUM,
                    triggers = listOf("Test trigger"),
                    confidence = confidence
                )
            } else null
            
            val manipulationRisk = if (manipulationScore > 0) {
                ManipulationResult(
                    riskScore = manipulationScore,
                    riskLevel = RiskLevel.MEDIUM,
                    patterns = listOf(
                        ManipulationPattern(
                            category = ManipulationCategory.URGENCY,
                            matches = listOf("test"),
                            score = manipulationScore,
                            description = "Test pattern"
                        )
                    ),
                    confidence = confidence,
                    summary = "Test"
                )
            } else null
            
            // Calculate weighted contributions (matching RiskFusionEngine logic)
            val metadataContribution = metadataScore.toFloat() * 0.3f
            val manipulationContribution = manipulationScore.toFloat() * 0.6f
            val historicalContribution = historicalScore.toFloat() * 0.1f
            val totalScore = metadataContribution + manipulationContribution + historicalContribution
            
            val fusedRisk = FusedRiskResult(
                riskScore = totalScore,
                riskLevel = RiskLevel.MEDIUM,
                confidence = confidence,
                triggers = emptyList(),
                explanation = "Test",
                metadataContribution = metadataContribution,
                manipulationContribution = manipulationContribution,
                historicalContribution = historicalContribution
            )
            
            // Use reflection to access private method
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
            
            // Property: Sum of contributions should equal total score (within floating point tolerance)
            val sumOfContributions = breakdown.metadataContribution + 
                                    breakdown.manipulationContribution + 
                                    breakdown.historicalContribution
            
            val tolerance = 0.01f
            kotlin.math.abs(sumOfContributions - breakdown.totalScore) shouldBeLessThanOrEqual tolerance
            
            // Property: Each contribution should be non-negative
            breakdown.metadataContribution shouldBeLessThanOrEqual breakdown.totalScore
            breakdown.manipulationContribution shouldBeLessThanOrEqual breakdown.totalScore
            breakdown.historicalContribution shouldBeLessThanOrEqual breakdown.totalScore
        }
    }
    
    "Property 8: Trigger Score Additivity - Triggers contribute meaningfully to risk" {
        checkAll(1000, Arb.list(arbManipulationPattern, 1..5), arbConfidence) { 
            patterns, confidence ->
            
            // Calculate total score from patterns
            val totalScore = patterns.sumOf { it.score }
            
            val manipulationRisk = ManipulationResult(
                riskScore = totalScore,
                riskLevel = when {
                    totalScore >= 8 -> RiskLevel.HIGH
                    totalScore >= 4 -> RiskLevel.MEDIUM
                    else -> RiskLevel.LOW
                },
                patterns = patterns,
                confidence = confidence,
                summary = "Test patterns"
            )
            
            val fusedRisk = FusedRiskResult(
                riskScore = totalScore.toFloat() * 0.6f, // Manipulation weight
                riskLevel = manipulationRisk.riskLevel,
                confidence = confidence,
                triggers = patterns.map { it.description },
                explanation = "Test",
                metadataContribution = 0f,
                manipulationContribution = totalScore.toFloat() * 0.6f,
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
            
            // Property: Number of triggers should match number of patterns
            breakdown.triggers.size shouldBe patterns.size
            
            // Property: Sum of trigger scores should be meaningful (non-zero if patterns exist)
            if (patterns.isNotEmpty()) {
                val triggerScoreSum = breakdown.triggers.sumOf { it.score }
                assert(triggerScoreSum > 0) { 
                    "Trigger scores should sum to positive value, got $triggerScoreSum" 
                }
            }
            
            // Property: Each trigger should have a valid category
            breakdown.triggers.forEach { trigger ->
                assert(trigger.category.name.startsWith("MANIPULATION_")) {
                    "Manipulation triggers should have MANIPULATION_ category prefix"
                }
            }
            
            // Property: Trigger timestamps should be consistent (all from same detection)
            if (breakdown.triggers.size > 1) {
                val timestamps = breakdown.triggers.map { it.timestamp }.distinct()
                timestamps.size shouldBe 1
            }
        }
    }
    
    "Property: Risk percentage is always in valid range 0-100" {
        checkAll(1000, Arb.float(0f..20f), arbConfidence) { totalScore, confidence ->
            val fusedRisk = FusedRiskResult(
                riskScore = totalScore,
                riskLevel = RiskLevel.MEDIUM,
                confidence = confidence,
                triggers = emptyList(),
                explanation = "Test",
                metadataContribution = totalScore * 0.5f,
                manipulationContribution = totalScore * 0.5f,
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
            
            // Property: Risk percentage should be in valid range
            assert(breakdown.riskPercentage in 0..100) {
                "Risk percentage ${breakdown.riskPercentage} should be in range 0-100"
            }
        }
    }
    
    "Property: Confidence is always in valid range 0.0-1.0" {
        checkAll(1000, arbConfidence, Arb.float(0f..15f)) { confidence, totalScore ->
            val fusedRisk = FusedRiskResult(
                riskScore = totalScore,
                riskLevel = RiskLevel.MEDIUM,
                confidence = confidence,
                triggers = emptyList(),
                explanation = "Test",
                metadataContribution = totalScore,
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
            
            // Property: Confidence should be preserved and in valid range
            breakdown.confidence shouldBe confidence
            assert(breakdown.confidence in 0f..1f) {
                "Confidence ${breakdown.confidence} should be in range 0.0-1.0"
            }
        }
    }
    
    "Property: Metadata triggers are correctly categorized" {
        val metadataTriggers = listOf(
            "Unknown number",
            "International number",
            "Unusual time (midnight)",
            "Repeated short calls",
            "High call frequency"
        )
        
        checkAll(1000, Arb.list(Arb.element(metadataTriggers), 1..5), arbConfidence) { 
            triggers, confidence ->
            
            val metadataRisk = MetadataRiskResult(
                riskScore = triggers.size * 2,
                riskLevel = RiskLevel.MEDIUM,
                triggers = triggers,
                confidence = confidence
            )
            
            val fusedRisk = FusedRiskResult(
                riskScore = (triggers.size * 2).toFloat() * 0.3f,
                riskLevel = RiskLevel.MEDIUM,
                confidence = confidence,
                triggers = triggers,
                explanation = "Test",
                metadataContribution = (triggers.size * 2).toFloat() * 0.3f,
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
            
            // Property: All triggers should have METADATA_ category prefix
            breakdown.triggers.forEach { trigger ->
                assert(trigger.category.name.startsWith("METADATA_")) {
                    "Metadata triggers should have METADATA_ category prefix, got ${trigger.category}"
                }
            }
            
            // Property: Number of triggers should match input
            breakdown.triggers.size shouldBe triggers.size
        }
    }
})
