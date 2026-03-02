package com.vocalshield.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.vocalshield.android.detection.RiskLevel
import com.vocalshield.android.detection.TriggerCategory
import com.vocalshield.android.detection.TriggerInfo
import com.vocalshield.android.ui.theme.*

/**
 * Displays list of detected triggers with categories and severity.
 * 
 * Shows all threat patterns detected by the detection layers with
 * color-coded severity indicators for easy comprehension.
 * 
 * Performance optimizations (Task 10.3):
 * - Uses LazyColumn with key() for efficient recomposition
 * - Caches color and text calculations with remember
 * 
 * Accessibility (Task 12.1):
 * - Content descriptions for screen readers
 * - Semantic information for each trigger
 * 
 * @param triggers List of detected triggers to display
 * @param modifier Modifier for customizing the view appearance
 */
@Composable
fun TriggerListView(
    triggers: List<TriggerInfo>,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.semantics {
        contentDescription = "${triggers.size} threats detected"
    }) {
        Text(
            text = "Detected Threats (${triggers.size})",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Use LazyColumn with key() for efficient rendering (Task 10.3)
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.heightIn(max = 400.dp) // Limit height to avoid nested scrolling
        ) {
            items(
                items = triggers,
                key = { trigger -> "${trigger.category.name}_${trigger.timestamp}" }
            ) { trigger ->
                TriggerCard(trigger = trigger)
            }
        }
    }
}

/**
 * Individual trigger card with category badge, description, and score.
 * 
 * Performance: Uses remember to cache color and text calculations (Task 10.3)
 * Accessibility (Task 12.1): Content description for screen readers
 */
@Composable
fun TriggerCard(trigger: TriggerInfo) {
    // Cache color calculations
    val backgroundColor = remember(trigger.severity) {
        when (trigger.severity) {
            RiskLevel.HIGH -> VibrantRed.copy(alpha = 0.1f)
            RiskLevel.MEDIUM -> VibrantYellow.copy(alpha = 0.1f)
            RiskLevel.LOW -> VibrantGreen.copy(alpha = 0.1f)
        }
    }
    
    val scoreColor = remember(trigger.severity) {
        when (trigger.severity) {
            RiskLevel.HIGH -> VibrantRed
            RiskLevel.MEDIUM -> VibrantYellow
            RiskLevel.LOW -> VibrantGreen
        }
    }
    
    val categoryColor = remember(trigger.category) {
        getCategoryColor(trigger.category)
    }
    
    val categoryName = remember(trigger.category) {
        getCategoryDisplayName(trigger.category)
    }
    
    val scoreText = remember(trigger.score) {
        "+${trigger.score}"
    }
    
    val severityText = remember(trigger.severity) {
        when (trigger.severity) {
            RiskLevel.HIGH -> "high"
            RiskLevel.MEDIUM -> "medium"
            RiskLevel.LOW -> "low"
        }
    }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "$categoryName threat: ${trigger.description}, $severityText severity, score ${trigger.score}"
            },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = backgroundColor
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                // Category badge
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = categoryColor.copy(alpha = 0.2f)
                ) {
                    Text(
                        text = categoryName,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = categoryColor
                    )
                }
                
                Spacer(modifier = Modifier.height(4.dp))
                
                // Description
                Text(
                    text = trigger.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            
            Spacer(modifier = Modifier.width(8.dp))
            
            // Score badge
            Surface(
                shape = androidx.compose.foundation.shape.CircleShape,
                color = scoreColor
            ) {
                Text(
                    text = scoreText,
                    modifier = Modifier.padding(8.dp),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
        }
    }
}

/**
 * Get color for trigger category.
 * 
 * Maps trigger categories to their visual color representation:
 * - Metadata triggers: Cyan (call pattern analysis)
 * - Manipulation triggers: Red (conversation threats)
 * - Historical triggers: Yellow (past behavior)
 */
fun getCategoryColor(category: TriggerCategory): Color {
    return when (category) {
        TriggerCategory.METADATA_UNKNOWN_NUMBER,
        TriggerCategory.METADATA_INTERNATIONAL,
        TriggerCategory.METADATA_MIDNIGHT_CALL,
        TriggerCategory.METADATA_REPEATED_CALLS,
        TriggerCategory.METADATA_HIGH_FREQUENCY -> MacherElectricCyan
        
        TriggerCategory.MANIPULATION_URGENCY,
        TriggerCategory.MANIPULATION_AUTHORITY,
        TriggerCategory.MANIPULATION_EMOTIONAL,
        TriggerCategory.MANIPULATION_FINANCIAL,
        TriggerCategory.MANIPULATION_INFORMATION -> VibrantRed
        
        TriggerCategory.HISTORICAL_KNOWN_SCAMMER -> VibrantYellow
    }
}

/**
 * Get user-friendly display name for trigger category.
 * 
 * Converts enum values to readable labels for UI display.
 */
fun getCategoryDisplayName(category: TriggerCategory): String {
    return when (category) {
        TriggerCategory.METADATA_UNKNOWN_NUMBER -> "Unknown Number"
        TriggerCategory.METADATA_INTERNATIONAL -> "International"
        TriggerCategory.METADATA_MIDNIGHT_CALL -> "Midnight Call"
        TriggerCategory.METADATA_REPEATED_CALLS -> "Repeated Calls"
        TriggerCategory.METADATA_HIGH_FREQUENCY -> "High Frequency"
        TriggerCategory.MANIPULATION_URGENCY -> "Urgency Pressure"
        TriggerCategory.MANIPULATION_AUTHORITY -> "Authority Impersonation"
        TriggerCategory.MANIPULATION_EMOTIONAL -> "Emotional Manipulation"
        TriggerCategory.MANIPULATION_FINANCIAL -> "Financial Coercion"
        TriggerCategory.MANIPULATION_INFORMATION -> "Info Extraction"
        TriggerCategory.HISTORICAL_KNOWN_SCAMMER -> "Known Scammer"
    }
}
