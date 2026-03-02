package com.macher.android.ui.components

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.macher.android.demo.ScamScenario
import com.macher.android.demo.ScamScenarios
import com.macher.android.detection.*
import com.macher.android.ui.theme.MacherTheme

/**
 * Preview tests for UI components.
 * 
 * These previews verify:
 * - Visual appearance with different risk levels
 * - Empty states and edge cases
 * - Text overflow handling
 * - Accessibility (large text, high contrast)
 * - Color coding and visual indicators
 */

// ═══════════════════════════════════════════════════════════════
// RiskBreakdownCard Previews
// ═══════════════════════════════════════════════════════════════

@Preview(name = "Risk Breakdown - High Risk", showBackground = true)
@Composable
fun PreviewRiskBreakdownHighRisk() {
    MacherTheme {
        RiskBreakdownCard(
            riskBreakdown = RiskBreakdown(
                totalScore = 12.5f,
                riskPercentage = 83,
                metadataContribution = 4.0f,
                manipulationContribution = 6.5f,
                historicalContribution = 2.0f,
                triggers = listOf(
                    TriggerInfo(
                        category = TriggerCategory.MANIPULATION_AUTHORITY,
                        description = "Caller impersonating bank official",
                        score = 5,
                        timestamp = System.currentTimeMillis(),
                        severity = RiskLevel.HIGH
                    ),
                    TriggerInfo(
                        category = TriggerCategory.MANIPULATION_URGENCY,
                        description = "Urgent action demanded immediately",
                        score = 4,
                        timestamp = System.currentTimeMillis(),
                        severity = RiskLevel.HIGH
                    ),
                    TriggerInfo(
                        category = TriggerCategory.METADATA_UNKNOWN_NUMBER,
                        description = "Call from unknown number",
                        score = 2,
                        timestamp = System.currentTimeMillis(),
                        severity = RiskLevel.MEDIUM
                    )
                ),
                confidence = 0.92f,
                primaryThreat = "Bank Fraud - OTP Request",
                explanation = "This call shows multiple high-risk indicators including authority impersonation and urgency pressure. The caller is requesting sensitive information (OTP) which is a common bank fraud tactic."
            ),
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(name = "Risk Breakdown - Medium Risk", showBackground = true)
@Composable
fun PreviewRiskBreakdownMediumRisk() {
    MacherTheme {
        RiskBreakdownCard(
            riskBreakdown = RiskBreakdown(
                totalScore = 7.5f,
                riskPercentage = 50,
                metadataContribution = 3.0f,
                manipulationContribution = 3.5f,
                historicalContribution = 1.0f,
                triggers = listOf(
                    TriggerInfo(
                        category = TriggerCategory.MANIPULATION_FINANCIAL,
                        description = "Prize claim with advance fee request",
                        score = 3,
                        timestamp = System.currentTimeMillis(),
                        severity = RiskLevel.MEDIUM
                    ),
                    TriggerInfo(
                        category = TriggerCategory.METADATA_INTERNATIONAL,
                        description = "International call from UK",
                        score = 2,
                        timestamp = System.currentTimeMillis(),
                        severity = RiskLevel.MEDIUM
                    )
                ),
                confidence = 0.68f,
                primaryThreat = "Lottery Scam",
                explanation = "Caller claims you won a prize but requests payment first. This is a common advance fee scam pattern."
            ),
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(name = "Risk Breakdown - Low Risk", showBackground = true)
@Composable
fun PreviewRiskBreakdownLowRisk() {
    MacherTheme {
        RiskBreakdownCard(
            riskBreakdown = RiskBreakdown(
                totalScore = 2.0f,
                riskPercentage = 13,
                metadataContribution = 1.0f,
                manipulationContribution = 0.5f,
                historicalContribution = 0.5f,
                triggers = listOf(
                    TriggerInfo(
                        category = TriggerCategory.METADATA_UNKNOWN_NUMBER,
                        description = "Call from unknown number",
                        score = 1,
                        timestamp = System.currentTimeMillis(),
                        severity = RiskLevel.LOW
                    )
                ),
                confidence = 0.45f,
                primaryThreat = "None",
                explanation = "This appears to be a legitimate call with no significant risk indicators detected."
            ),
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(name = "Risk Breakdown - No Triggers", showBackground = true)
@Composable
fun PreviewRiskBreakdownNoTriggers() {
    MacherTheme {
        RiskBreakdownCard(
            riskBreakdown = RiskBreakdown(
                totalScore = 1.0f,
                riskPercentage = 7,
                metadataContribution = 0.5f,
                manipulationContribution = 0.3f,
                historicalContribution = 0.2f,
                triggers = emptyList(),
                confidence = 0.35f,
                primaryThreat = "",
                explanation = "No specific threats detected. Call appears safe."
            ),
            modifier = Modifier.padding(16.dp)
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// TriggerListView Previews
// ═══════════════════════════════════════════════════════════════

@Preview(name = "Trigger List - Multiple Triggers", showBackground = true)
@Composable
fun PreviewTriggerListMultiple() {
    MacherTheme {
        TriggerListView(
            triggers = listOf(
                TriggerInfo(
                    category = TriggerCategory.MANIPULATION_AUTHORITY,
                    description = "Caller impersonating government official",
                    score = 5,
                    timestamp = System.currentTimeMillis(),
                    severity = RiskLevel.HIGH
                ),
                TriggerInfo(
                    category = TriggerCategory.MANIPULATION_URGENCY,
                    description = "Immediate action demanded",
                    score = 4,
                    timestamp = System.currentTimeMillis(),
                    severity = RiskLevel.HIGH
                ),
                TriggerInfo(
                    category = TriggerCategory.METADATA_MIDNIGHT_CALL,
                    description = "Call received at 2:30 AM",
                    score = 3,
                    timestamp = System.currentTimeMillis(),
                    severity = RiskLevel.MEDIUM
                ),
                TriggerInfo(
                    category = TriggerCategory.HISTORICAL_KNOWN_SCAMMER,
                    description = "Number previously flagged as scammer",
                    score = 4,
                    timestamp = System.currentTimeMillis(),
                    severity = RiskLevel.HIGH
                )
            ),
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(name = "Trigger List - Single Trigger", showBackground = true)
@Composable
fun PreviewTriggerListSingle() {
    MacherTheme {
        TriggerListView(
            triggers = listOf(
                TriggerInfo(
                    category = TriggerCategory.METADATA_UNKNOWN_NUMBER,
                    description = "Call from unknown number not in contacts",
                    score = 1,
                    timestamp = System.currentTimeMillis(),
                    severity = RiskLevel.LOW
                )
            ),
            modifier = Modifier.padding(16.dp)
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// ScenarioSelectorCard Previews
// ═══════════════════════════════════════════════════════════════

@Preview(name = "Scenario Selector - No Selection", showBackground = true)
@Composable
fun PreviewScenarioSelectorNoSelection() {
    MacherTheme {
        ScenarioSelectorCard(
            scenarios = ScamScenarios.getAllScenarios(),
            selectedScenarioId = null,
            onScenarioSelected = {},
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(name = "Scenario Selector - With Selection", showBackground = true)
@Composable
fun PreviewScenarioSelectorWithSelection() {
    MacherTheme {
        ScenarioSelectorCard(
            scenarios = ScamScenarios.getAllScenarios(),
            selectedScenarioId = "bank_otp",
            onScenarioSelected = {},
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(name = "Scenario Card - High Risk", showBackground = true)
@Composable
fun PreviewScenarioCardHighRisk() {
    MacherTheme {
        ScenarioCard(
            scenario = ScamScenarios.BANK_FRAUD_OTP,
            isSelected = false,
            onClick = {}
        )
    }
}

@Preview(name = "Scenario Card - Selected", showBackground = true)
@Composable
fun PreviewScenarioCardSelected() {
    MacherTheme {
        ScenarioCard(
            scenario = ScamScenarios.TAX_DEPARTMENT_SCAM,
            isSelected = true,
            onClick = {}
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// ScenarioProgressCard Previews
// ═══════════════════════════════════════════════════════════════

@Preview(name = "Scenario Progress - Playing", showBackground = true)
@Composable
fun PreviewScenarioProgressPlaying() {
    MacherTheme {
        ScenarioProgressCard(
            progress = ScenarioProgress(
                scenarioId = "bank_otp",
                scenarioTitle = "Bank Fraud - OTP Request",
                currentSegment = 2,
                totalSegments = 4,
                elapsedTime = 12000L, // 12 seconds
                currentRiskLevel = RiskLevel.HIGH,
                isPlaying = true,
                isPaused = false
            ),
            onPlay = {},
            onPause = {},
            onReset = {},
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(name = "Scenario Progress - Paused", showBackground = true)
@Composable
fun PreviewScenarioProgressPaused() {
    MacherTheme {
        ScenarioProgressCard(
            progress = ScenarioProgress(
                scenarioId = "lottery",
                scenarioTitle = "Lottery Prize Scam",
                currentSegment = 1,
                totalSegments = 4,
                elapsedTime = 5000L, // 5 seconds
                currentRiskLevel = RiskLevel.MEDIUM,
                isPlaying = false,
                isPaused = true
            ),
            onPlay = {},
            onPause = {},
            onReset = {},
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(name = "Scenario Progress - Starting", showBackground = true)
@Composable
fun PreviewScenarioProgressStarting() {
    MacherTheme {
        ScenarioProgressCard(
            progress = ScenarioProgress(
                scenarioId = "legitimate",
                scenarioTitle = "Legitimate Call",
                currentSegment = 0,
                totalSegments = 4,
                elapsedTime = 0L,
                currentRiskLevel = RiskLevel.LOW,
                isPlaying = false,
                isPaused = false
            ),
            onPlay = {},
            onPause = {},
            onReset = {},
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(name = "Scenario Progress - Complete", showBackground = true)
@Composable
fun PreviewScenarioProgressComplete() {
    MacherTheme {
        ScenarioProgressCard(
            progress = ScenarioProgress(
                scenarioId = "family_emergency",
                scenarioTitle = "Family Emergency Scam",
                currentSegment = 4,
                totalSegments = 4,
                elapsedTime = 20000L, // 20 seconds
                currentRiskLevel = RiskLevel.HIGH,
                isPlaying = false,
                isPaused = false
            ),
            onPlay = {},
            onPause = {},
            onReset = {},
            modifier = Modifier.padding(16.dp)
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// DetectionModeIndicator Previews
// ═══════════════════════════════════════════════════════════════

@Preview(name = "Detection Mode - Full Protection", showBackground = true)
@Composable
fun PreviewDetectionModeFullProtection() {
    MacherTheme {
        DetectionModeIndicator(
            mode = DetectionMode.REAL_FULL,
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(name = "Detection Mode - Metadata Only", showBackground = true)
@Composable
fun PreviewDetectionModeMetadataOnly() {
    MacherTheme {
        DetectionModeIndicator(
            mode = DetectionMode.REAL_METADATA_ONLY,
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(name = "Detection Mode - Demo", showBackground = true)
@Composable
fun PreviewDetectionModeDemo() {
    MacherTheme {
        DetectionModeIndicator(
            mode = DetectionMode.DEMO,
            modifier = Modifier.padding(16.dp)
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// Accessibility Previews (Large Text)
// ═══════════════════════════════════════════════════════════════

@Preview(
    name = "Risk Breakdown - Large Font",
    showBackground = true,
    fontScale = 2.0f
)
@Composable
fun PreviewRiskBreakdownLargeFont() {
    MacherTheme {
        RiskBreakdownCard(
            riskBreakdown = RiskBreakdown(
                totalScore = 10.0f,
                riskPercentage = 67,
                metadataContribution = 3.0f,
                manipulationContribution = 5.0f,
                historicalContribution = 2.0f,
                triggers = listOf(
                    TriggerInfo(
                        category = TriggerCategory.MANIPULATION_AUTHORITY,
                        description = "Authority impersonation detected",
                        score = 5,
                        timestamp = System.currentTimeMillis(),
                        severity = RiskLevel.HIGH
                    )
                ),
                confidence = 0.85f,
                primaryThreat = "Bank Fraud",
                explanation = "High risk call with authority impersonation."
            ),
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(
    name = "Detection Mode - Large Font",
    showBackground = true,
    fontScale = 2.0f
)
@Composable
fun PreviewDetectionModeLargeFont() {
    MacherTheme {
        DetectionModeIndicator(
            mode = DetectionMode.REAL_METADATA_ONLY,
            modifier = Modifier.padding(16.dp)
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// Edge Case Previews
// ═══════════════════════════════════════════════════════════════

@Preview(name = "Risk Breakdown - Long Text", showBackground = true)
@Composable
fun PreviewRiskBreakdownLongText() {
    MacherTheme {
        RiskBreakdownCard(
            riskBreakdown = RiskBreakdown(
                totalScore = 11.0f,
                riskPercentage = 73,
                metadataContribution = 4.0f,
                manipulationContribution = 5.0f,
                historicalContribution = 2.0f,
                triggers = listOf(
                    TriggerInfo(
                        category = TriggerCategory.MANIPULATION_AUTHORITY,
                        description = "Caller is impersonating a government official from the Income Tax Department and threatening immediate arrest with legal consequences",
                        score = 5,
                        timestamp = System.currentTimeMillis(),
                        severity = RiskLevel.HIGH
                    )
                ),
                confidence = 0.88f,
                primaryThreat = "Government Authority Impersonation with Legal Threats",
                explanation = "This call exhibits multiple high-risk characteristics including authority impersonation, urgency pressure tactics, emotional manipulation, and demands for immediate financial action. The caller is using fear-based tactics to pressure you into making hasty decisions without proper verification."
            ),
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Preview(name = "Scenario Progress - Long Title", showBackground = true)
@Composable
fun PreviewScenarioProgressLongTitle() {
    MacherTheme {
        ScenarioProgressCard(
            progress = ScenarioProgress(
                scenarioId = "test",
                scenarioTitle = "Very Long Scenario Title That Tests Text Wrapping and Overflow Handling",
                currentSegment = 2,
                totalSegments = 10,
                elapsedTime = 45000L,
                currentRiskLevel = RiskLevel.MEDIUM,
                isPlaying = true,
                isPaused = false
            ),
            onPlay = {},
            onPause = {},
            onReset = {},
            modifier = Modifier.padding(16.dp)
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// RiskDetailModal and CallInfoCard Previews
// ═══════════════════════════════════════════════════════════════

@Preview(name = "Call Info Card - High Risk Call", showBackground = true)
@Composable
fun PreviewCallInfoCardHighRisk() {
    MacherTheme {
        CallInfoCard(
            call = com.macher.android.data.database.CallRecordEntity(
                id = "call-123",
                phoneNumber = "+1 (555) 123-4567",
                callerName = "Unknown Caller",
                timestamp = System.currentTimeMillis() - 3600000, // 1 hour ago
                duration = 165, // 2:45
                wasBlocked = true,
                userReported = false
            )
        )
    }
}

@Preview(name = "Call Info Card - Normal Call", showBackground = true)
@Composable
fun PreviewCallInfoCardNormal() {
    MacherTheme {
        CallInfoCard(
            call = com.macher.android.data.database.CallRecordEntity(
                id = "call-456",
                phoneNumber = "+1 (555) 987-6543",
                callerName = "John Smith",
                timestamp = System.currentTimeMillis() - 7200000, // 2 hours ago
                duration = 320, // 5:20
                wasBlocked = false,
                userReported = false
            )
        )
    }
}

@Preview(name = "Risk Detail Modal - High Risk", showBackground = true)
@Composable
fun PreviewRiskDetailModalHighRisk() {
    MacherTheme {
        RiskDetailModal(
            record = com.macher.android.data.database.CallRecordWithRisk(
                call = com.macher.android.data.database.CallRecordEntity(
                    id = "call-789",
                    phoneNumber = "+1 (555) 123-4567",
                    callerName = "Bank of America",
                    timestamp = System.currentTimeMillis() - 1800000, // 30 minutes ago
                    duration = 245, // 4:05
                    wasBlocked = true,
                    userReported = false
                ),
                risk = com.macher.android.data.database.RiskAssessmentEntity(
                    id = "risk-789",
                    callId = "call-789",
                    totalScore = 12.5f,
                    riskLevel = "HIGH",
                    confidence = 0.92f,
                    metadataScore = 4.0f,
                    manipulationScore = 6.5f,
                    historicalScore = 2.0f,
                    primaryThreat = "Bank Fraud - OTP Request",
                    explanation = "This call shows multiple high-risk indicators including authority impersonation and urgency pressure. The caller is requesting sensitive information (OTP) which is a common bank fraud tactic.",
                    timestamp = System.currentTimeMillis() - 1800000
                ),
                triggers = listOf(
                    com.macher.android.data.database.RiskTriggerEntity(
                        id = 1,
                        riskAssessmentId = "risk-789",
                        category = "MANIPULATION_AUTHORITY",
                        description = "Caller impersonating bank official",
                        score = 5,
                        severity = "HIGH",
                        timestamp = System.currentTimeMillis() - 1800000
                    ),
                    com.macher.android.data.database.RiskTriggerEntity(
                        id = 2,
                        riskAssessmentId = "risk-789",
                        category = "MANIPULATION_URGENCY",
                        description = "Urgent action demanded immediately",
                        score = 4,
                        severity = "HIGH",
                        timestamp = System.currentTimeMillis() - 1800000
                    ),
                    com.macher.android.data.database.RiskTriggerEntity(
                        id = 3,
                        riskAssessmentId = "risk-789",
                        category = "METADATA_UNKNOWN_NUMBER",
                        description = "Call from unknown number",
                        score = 2,
                        severity = "MEDIUM",
                        timestamp = System.currentTimeMillis() - 1800000
                    )
                )
            ),
            onDismiss = { /* Preview - no action */ }
        )
    }
}

@Preview(name = "Risk Detail Modal - Medium Risk", showBackground = true)
@Composable
fun PreviewRiskDetailModalMediumRisk() {
    MacherTheme {
        RiskDetailModal(
            record = com.macher.android.data.database.CallRecordWithRisk(
                call = com.macher.android.data.database.CallRecordEntity(
                    id = "call-101",
                    phoneNumber = "+44 20 1234 5678",
                    callerName = null,
                    timestamp = System.currentTimeMillis() - 3600000, // 1 hour ago
                    duration = 180, // 3:00
                    wasBlocked = false,
                    userReported = false
                ),
                risk = com.macher.android.data.database.RiskAssessmentEntity(
                    id = "risk-101",
                    callId = "call-101",
                    totalScore = 7.5f,
                    riskLevel = "MEDIUM",
                    confidence = 0.68f,
                    metadataScore = 3.0f,
                    manipulationScore = 3.5f,
                    historicalScore = 1.0f,
                    primaryThreat = "Lottery Scam",
                    explanation = "Caller claims you won a prize but requests payment first. This is a common advance fee scam pattern.",
                    timestamp = System.currentTimeMillis() - 3600000
                ),
                triggers = listOf(
                    com.macher.android.data.database.RiskTriggerEntity(
                        id = 4,
                        riskAssessmentId = "risk-101",
                        category = "MANIPULATION_FINANCIAL",
                        description = "Prize claim with advance fee request",
                        score = 3,
                        severity = "MEDIUM",
                        timestamp = System.currentTimeMillis() - 3600000
                    ),
                    com.macher.android.data.database.RiskTriggerEntity(
                        id = 5,
                        riskAssessmentId = "risk-101",
                        category = "METADATA_INTERNATIONAL",
                        description = "International call from UK",
                        score = 2,
                        severity = "MEDIUM",
                        timestamp = System.currentTimeMillis() - 3600000
                    )
                )
            ),
            onDismiss = { /* Preview - no action */ }
        )
    }
}

@Preview(name = "Risk Detail Modal - Low Risk", showBackground = true)
@Composable
fun PreviewRiskDetailModalLowRisk() {
    MacherTheme {
        RiskDetailModal(
            record = com.macher.android.data.database.CallRecordWithRisk(
                call = com.macher.android.data.database.CallRecordEntity(
                    id = "call-202",
                    phoneNumber = "+1 (555) 234-5678",
                    callerName = "Sarah Johnson",
                    timestamp = System.currentTimeMillis() - 7200000, // 2 hours ago
                    duration = 420, // 7:00
                    wasBlocked = false,
                    userReported = false
                ),
                risk = com.macher.android.data.database.RiskAssessmentEntity(
                    id = "risk-202",
                    callId = "call-202",
                    totalScore = 2.0f,
                    riskLevel = "LOW",
                    confidence = 0.45f,
                    metadataScore = 1.0f,
                    manipulationScore = 0.5f,
                    historicalScore = 0.5f,
                    primaryThreat = "",
                    explanation = "This call shows minimal risk indicators. The conversation appears to be legitimate with no manipulation patterns detected.",
                    timestamp = System.currentTimeMillis() - 7200000
                ),
                triggers = listOf(
                    com.macher.android.data.database.RiskTriggerEntity(
                        id = 6,
                        riskAssessmentId = "risk-202",
                        category = "METADATA_UNKNOWN_NUMBER",
                        description = "Call from unknown number",
                        score = 1,
                        severity = "LOW",
                        timestamp = System.currentTimeMillis() - 7200000
                    )
                )
            ),
            onDismiss = { /* Preview - no action */ }
        )
    }
}
