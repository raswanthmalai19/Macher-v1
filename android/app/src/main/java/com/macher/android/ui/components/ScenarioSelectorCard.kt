package com.macher.android.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.macher.android.demo.ScamScenario
import com.macher.android.ui.theme.*

/**
 * Demo mode scenario selector for judges.
 * 
 * Allows manual selection of preloaded scam scenarios for competition
 * demonstrations. Displays all 6 scenarios with expected risk levels.
 * 
 * Accessibility (Task 12.1): Content descriptions and semantic roles
 * 
 * @param scenarios List of available demo scenarios
 * @param selectedScenarioId Currently selected scenario ID, null if none selected
 * @param onScenarioSelected Callback when a scenario is selected
 * @param modifier Modifier for customizing the card appearance
 */
@Composable
fun ScenarioSelectorCard(
    scenarios: List<ScamScenario>,
    selectedScenarioId: String?,
    onScenarioSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Demo scenarios selector with ${scenarios.size} available scenarios"
            },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MacherElectricCyan.copy(alpha = 0.1f)
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header with play icon
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = null,
                    tint = MacherElectricCyan
                )
                
                Text(
                    text = "Demo Scenarios",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
            }
            
            Text(
                text = "Select a scenario to demonstrate MACHER's detection capabilities",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            // Scenario grid
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                scenarios.forEach { scenario ->
                    ScenarioCard(
                        scenario = scenario,
                        isSelected = scenario.id == selectedScenarioId,
                        onClick = { onScenarioSelected(scenario.id) }
                    )
                }
            }
        }
    }
}

/**
 * Individual scenario card with title, description, and expected risk.
 * 
 * Accessibility (Task 12.1): Content descriptions and button role
 */
@Composable
fun ScenarioCard(
    scenario: ScamScenario,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val selectionStatus = if (isSelected) "selected" else "not selected"
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = "${scenario.title}: ${scenario.description}. Expected ${scenario.expectedRiskLevel} risk at ${scenario.expectedScore}%. $selectionStatus"
            },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) {
                MacherElectricCyan.copy(alpha = 0.3f)
            } else {
                MaterialTheme.colorScheme.surface
            }
        ),
        border = if (isSelected) {
            BorderStroke(2.dp, MacherElectricCyan)
        } else {
            null
        }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = scenario.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                
                Spacer(modifier = Modifier.height(4.dp))
                
                Text(
                    text = scenario.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                // Risk level badge
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = when (scenario.expectedRiskLevel) {
                        "HIGH" -> VibrantRed.copy(alpha = 0.2f)
                        "MEDIUM" -> VibrantYellow.copy(alpha = 0.2f)
                        else -> VibrantGreen.copy(alpha = 0.2f)
                    }
                ) {
                    Text(
                        text = "Expected: ${scenario.expectedRiskLevel} (${scenario.expectedScore}%)",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = when (scenario.expectedRiskLevel) {
                            "HIGH" -> VibrantRed
                            "MEDIUM" -> VibrantYellow
                            else -> VibrantGreen
                        }
                    )
                }
            }
            
            Spacer(modifier = Modifier.width(8.dp))
            
            // Selection indicator
            if (isSelected) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = "Selected",
                    tint = MacherElectricCyan,
                    modifier = Modifier.size(32.dp)
                )
            }
        }
    }
}
