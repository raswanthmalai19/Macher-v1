package com.macher.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.macher.android.detection.DetectionMode
import com.macher.android.ui.theme.*

/**
 * Displays current detection mode indicator.
 * 
 * Shows which detection mode is active (REAL_FULL, REAL_METADATA_ONLY, or DEMO)
 * with appropriate icon, color, and explanatory text. Helps users understand
 * their current level of protection.
 * 
 * Accessibility (Task 12.1): Content descriptions for screen readers
 * 
 * @param mode Current detection mode
 * @param isActiveCall Whether a phone call is actively being monitored (vs just armed/listening)
 * @param modifier Modifier for customizing the indicator appearance
 */
@Composable
fun DetectionModeIndicator(
    mode: DetectionMode,
    isActiveCall: Boolean = false,
    modifier: Modifier = Modifier
) {
    val modeDescription = when (mode) {
        DetectionMode.REAL_FULL -> if (isActiveCall)
            "Live call analysis active — all detection layers operational"
        else
            "Armed and ready — all detection layers will activate on incoming call"
        DetectionMode.REAL_METADATA_ONLY -> "Local AI protection active — cloud analysis unavailable, using on-device detection"
        DetectionMode.DEMO -> "Demo mode: demonstrating detection with preloaded scenarios"
    }
    
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = modeDescription
            },
        shape = RoundedCornerShape(12.dp),
        color = when (mode) {
            DetectionMode.REAL_FULL -> VibrantGreen.copy(alpha = 0.2f)
            DetectionMode.REAL_METADATA_ONLY -> VibrantYellow.copy(alpha = 0.2f)
            DetectionMode.DEMO -> MacherElectricCyan.copy(alpha = 0.2f)
        }
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Mode-specific icon
            Icon(
                imageVector = when (mode) {
                    DetectionMode.REAL_FULL -> Icons.Default.CheckCircle
                    DetectionMode.REAL_METADATA_ONLY -> Icons.Default.Warning
                    DetectionMode.DEMO -> Icons.Default.PlayArrow
                },
                contentDescription = when (mode) {
                    DetectionMode.REAL_FULL -> "Full protection icon"
                    DetectionMode.REAL_METADATA_ONLY -> "Warning icon"
                    DetectionMode.DEMO -> "Demo mode icon"
                },
                tint = when (mode) {
                    DetectionMode.REAL_FULL -> VibrantGreen
                    DetectionMode.REAL_METADATA_ONLY -> VibrantYellow
                    DetectionMode.DEMO -> MacherElectricCyan
                },
                modifier = Modifier.size(24.dp)
            )
            
            // Mode title and explanation
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = when (mode) {
                        DetectionMode.REAL_FULL -> if (isActiveCall) "Live Analysis Active" else "Full Protection Armed"
                        DetectionMode.REAL_METADATA_ONLY -> "Local AI Protection Active"
                        DetectionMode.DEMO -> "Demo Mode"
                    },
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                
                Spacer(modifier = Modifier.height(2.dp))
                
                Text(
                    text = when (mode) {
                        DetectionMode.REAL_FULL -> if (isActiveCall)
                            "All detection layers operational"
                        else
                            "All layers ready — activates automatically on incoming call"
                        DetectionMode.REAL_METADATA_ONLY -> "Cloud unreachable — on-device AI protecting you"
                        DetectionMode.DEMO -> "Demonstrating detection with preloaded scenarios"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
