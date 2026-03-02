package com.macher.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.macher.android.detection.RiskBreakdown
import com.macher.android.ui.theme.*

/**
 * Displays comprehensive risk breakdown with visual indicators.
 * 
 * Shows metadata vs manipulation contributions, triggers, and confidence.
 * Designed for simplicity and accessibility per product requirements.
 * 
 * Performance optimizations (Task 10.3):
 * - Uses remember for expensive calculations
 * - Uses derivedStateOf for computed values
 * - Minimizes recomposition with stable parameters
 * 
 * Accessibility (Task 12.1):
 * - Content descriptions for screen readers
 * - Semantic roles for interactive elements
 * 
 * @param riskBreakdown The risk breakdown data to display, null if not available
 * @param modifier Modifier for customizing the card appearance
 */
@Composable
fun RiskBreakdownCard(
    riskBreakdown: RiskBreakdown?,
    modifier: Modifier = Modifier
) {
    if (riskBreakdown == null) return
    
    Card(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Risk analysis breakdown showing ${riskBreakdown.riskPercentage}% risk with ${(riskBreakdown.confidence * 100).toInt()}% confidence"
            },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Header with risk percentage
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Risk Analysis",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                
                RiskPercentageBadge(
                    percentage = riskBreakdown.riskPercentage,
                    confidence = riskBreakdown.confidence
                )
            }
            
            // Risk score gauge
            RiskScoreGauge(
                score = riskBreakdown.totalScore,
                maxScore = 15f
            )
            
            // Contribution breakdown chart
            ContributionChart(
                metadataContribution = riskBreakdown.metadataContribution,
                manipulationContribution = riskBreakdown.manipulationContribution,
                historicalContribution = riskBreakdown.historicalContribution
            )
            
            // Primary threat indicator
            if (riskBreakdown.primaryThreat.isNotEmpty()) {
                PrimaryThreatBadge(threat = riskBreakdown.primaryThreat)
            }
            
            // Trigger list
            if (riskBreakdown.triggers.isNotEmpty()) {
                TriggerListView(triggers = riskBreakdown.triggers)
            }
            
            // Explanation panel
            ExplanationPanel(explanation = riskBreakdown.explanation)
        }
    }
}

/**
 * Displays risk percentage badge with confidence indicator.
 * 
 * Performance: Uses remember to cache color calculations (Task 10.3)
 * Accessibility (Task 12.1): Content description for screen readers
 */
@Composable
fun RiskPercentageBadge(
    percentage: Int,
    confidence: Float
) {
    // Cache color calculation to avoid recomputation
    val backgroundColor = remember(percentage) {
        when {
            percentage >= 70 -> VibrantRed.copy(alpha = 0.2f)
            percentage >= 40 -> VibrantYellow.copy(alpha = 0.2f)
            else -> VibrantGreen.copy(alpha = 0.2f)
        }
    }
    
    val textColor = remember(percentage) {
        when {
            percentage >= 70 -> VibrantRed
            percentage >= 40 -> VibrantYellow
            else -> VibrantGreen
        }
    }
    
    val confidenceText = remember(confidence) {
        "${(confidence * 100).toInt()}% confident"
    }
    
    val riskLevel = remember(percentage) {
        when {
            percentage >= 70 -> "high"
            percentage >= 40 -> "medium"
            else -> "low"
        }
    }
    
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = backgroundColor,
        modifier = Modifier.semantics {
            contentDescription = "$percentage percent $riskLevel risk, $confidenceText"
        }
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "$percentage%",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = textColor
            )
            Text(
                text = confidenceText,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * Visual gauge showing risk score with gradient bar.
 * 
 * Performance: Uses derivedStateOf for percentage calculation (Task 10.3)
 * Accessibility (Task 12.1): Content description for screen readers
 */
@Composable
fun RiskScoreGauge(
    score: Float,
    maxScore: Float,
    modifier: Modifier = Modifier
) {
    // Use derivedStateOf for computed percentage
    val percentage = remember(score, maxScore) {
        derivedStateOf { (score / maxScore).coerceIn(0f, 1f) }
    }.value
    
    val scoreText = remember(score, maxScore) {
        String.format("%.1f / %.0f", score, maxScore)
    }
    
    val textColor = if (percentage > 0.5f) Color.White else MaterialTheme.colorScheme.onSurface
    
    Column(modifier = modifier.semantics {
        contentDescription = "Overall risk score: $scoreText"
    }) {
        Text(
            text = "Overall Risk Score",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Gauge visualization
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(24.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(percentage)
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(
                                VibrantGreen,
                                VibrantYellow,
                                VibrantRed
                            )
                        )
                    )
            )
            
            // Score text overlay
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = scoreText,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = textColor
                )
            }
        }
    }
}

/**
 * Stacked bar chart showing contribution from each detection layer.
 * 
 * Performance: Uses remember for all calculations to minimize recomposition (Task 10.3)
 * Accessibility (Task 12.1): Content description for screen readers
 */
@Composable
fun ContributionChart(
    metadataContribution: Float,
    manipulationContribution: Float,
    historicalContribution: Float,
    modifier: Modifier = Modifier
) {
    // Cache total calculation
    val total = remember(metadataContribution, manipulationContribution, historicalContribution) {
        metadataContribution + manipulationContribution + historicalContribution
    }
    
    if (total <= 0) return
    
    // Cache percentages
    val metadataPercentage = remember(metadataContribution, total) {
        ((metadataContribution / total) * 100).toInt()
    }
    val manipulationPercentage = remember(manipulationContribution, total) {
        ((manipulationContribution / total) * 100).toInt()
    }
    val historicalPercentage = remember(historicalContribution, total) {
        ((historicalContribution / total) * 100).toInt()
    }
    
    Column(modifier = modifier.semantics {
        contentDescription = "Risk breakdown: $metadataPercentage% from call patterns, $manipulationPercentage% from conversation analysis, $historicalPercentage% from past behavior"
    }) {
        Text(
            text = "Risk Breakdown by Layer",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Stacked bar chart
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(32.dp)
                .clip(RoundedCornerShape(16.dp))
        ) {
            if (metadataContribution > 0) {
                Box(
                    modifier = Modifier
                        .weight(metadataContribution / total)
                        .fillMaxHeight()
                        .background(MacherElectricCyan)
                )
            }
            
            if (manipulationContribution > 0) {
                Box(
                    modifier = Modifier
                        .weight(manipulationContribution / total)
                        .fillMaxHeight()
                        .background(VibrantRed)
                )
            }
            
            if (historicalContribution > 0) {
                Box(
                    modifier = Modifier
                        .weight(historicalContribution / total)
                        .fillMaxHeight()
                        .background(VibrantYellow)
                )
            }
        }
        
        Spacer(modifier = Modifier.height(12.dp))
        
        // Legend
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            ContributionLegendItem(
                color = MacherElectricCyan,
                label = "Metadata (Call Patterns)",
                value = metadataContribution,
                percentage = metadataPercentage
            )
            ContributionLegendItem(
                color = VibrantRed,
                label = "Manipulation (Conversation)",
                value = manipulationContribution,
                percentage = manipulationPercentage
            )
            ContributionLegendItem(
                color = VibrantYellow,
                label = "Historical (Past Behavior)",
                value = historicalContribution,
                percentage = historicalPercentage
            )
        }
    }
}

/**
 * Legend item showing color, label, value, and percentage.
 * 
 * Performance: Uses remember for formatted value string (Task 10.3)
 */
@Composable
fun ContributionLegendItem(
    color: Color,
    label: String,
    value: Float,
    percentage: Int
) {
    val valueText = remember(percentage, value) {
        "$percentage% (${String.format("%.1f", value)})"
    }
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .clip(CircleShape)
                    .background(color)
            )
            
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
        
        Text(
            text = valueText,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

/**
 * Badge displaying the primary threat category.
 * 
 * Accessibility (Task 12.1): Content description for screen readers
 */
@Composable
fun PrimaryThreatBadge(threat: String) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = VibrantRed.copy(alpha = 0.1f),
        modifier = Modifier.semantics {
            contentDescription = "Primary threat detected: $threat"
        }
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "⚠️",
                style = MaterialTheme.typography.bodyMedium
            )
            Text(
                text = "Primary Threat: $threat",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = VibrantRed
            )
        }
    }
}

/**
 * Panel displaying human-readable explanation of risk assessment.
 */
@Composable
fun ExplanationPanel(explanation: String) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = "Explanation",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = explanation,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}
