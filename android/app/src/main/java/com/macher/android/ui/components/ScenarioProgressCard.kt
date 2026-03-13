package com.macher.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.macher.android.detection.RiskLevel
import com.macher.android.detection.ScenarioProgress
import com.macher.android.ui.theme.*

/**
 * Shows real-time progress of demo scenario playback.
 * 
 * Displays current segment, progress bar, elapsed time, and playback controls.
 * Updates in real-time as the scenario plays for competition demonstrations.
 * 
 * Accessibility (Task 12.1): Content descriptions for all interactive elements
 * 
 * @param progress Current scenario progress state, null if no scenario active
 * @param onPlay Callback when play button is clicked
 * @param onPause Callback when pause button is clicked
 * @param onReset Callback when reset button is clicked
 * @param modifier Modifier for customizing the card appearance
 */
@Composable
fun ScenarioProgressCard(
    progress: ScenarioProgress?,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (progress == null) return
    
    val riskLevelText = when (progress.currentRiskLevel) {
        RiskLevel.HIGH -> "high"
        RiskLevel.MEDIUM -> "medium"
        RiskLevel.LOW -> "low"
        else -> "unknown"
    }
    
    Card(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${progress.scenarioTitle} scenario: ${progress.getProgressPercentage()}% complete, current risk level $riskLevelText, elapsed time ${formatElapsedTime(progress.elapsedTime)}"
            },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header with scenario title and current risk indicator
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = progress.scenarioTitle,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                
                // Current risk indicator (colored dot)
                Surface(
                    shape = CircleShape,
                    color = when (progress.currentRiskLevel) {
                        RiskLevel.HIGH -> VibrantRed
                        RiskLevel.MEDIUM -> VibrantYellow
                        RiskLevel.LOW -> VibrantGreen
                    },
                    modifier = Modifier
                        .size(16.dp)
                        .semantics {
                            contentDescription = "$riskLevelText risk level indicator"
                        }
                ) {
                    Box(modifier = Modifier.fillMaxSize())
                }
            }
            
            // Progress bar with segment count
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Segment ${progress.currentSegment + 1} of ${progress.totalSegments}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    
                    Text(
                        text = "${progress.getProgressPercentage()}%",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                
                LinearProgressIndicator(
                    progress = progress.getProgressPercentage() / 100f,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp)),
                    color = MacherElectricCyan,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
            }
            
            // Elapsed time
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = "⏱️",
                    style = MaterialTheme.typography.bodyMedium
                )
                
                Text(
                    text = formatElapsedTime(progress.elapsedTime),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            // Playback controls
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Play/Pause button
                Button(
                    onClick = if (progress.isPlaying) onPause else onPlay,
                    modifier = Modifier
                        .weight(1f)
                        .semantics {
                            contentDescription = if (progress.isPlaying) {
                                "Pause scenario playback"
                            } else {
                                "Play scenario"
                            }
                        },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MacherElectricCyan
                    )
                ) {
                    Icon(
                        imageVector = if (progress.isPlaying) {
                            Icons.Default.Pause
                        } else {
                            Icons.Default.PlayArrow
                        },
                        contentDescription = null
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (progress.isPlaying) "Pause" else "Play")
                }
                
                // Reset button
                OutlinedButton(
                    onClick = onReset,
                    modifier = Modifier
                        .weight(1f)
                        .semantics {
                            contentDescription = "Reset scenario to beginning"
                        }
                ) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = null
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Reset")
                }
            }
        }
    }
}

/**
 * Format elapsed time in MM:SS format.
 * 
 * @param milliseconds Time in milliseconds
 * @return Formatted time string (e.g., "1:23")
 */
fun formatElapsedTime(milliseconds: Long): String {
    val seconds = milliseconds / 1000
    val minutes = seconds / 60
    val remainingSeconds = seconds % 60
    return String.format("%d:%02d", minutes, remainingSeconds)
}
