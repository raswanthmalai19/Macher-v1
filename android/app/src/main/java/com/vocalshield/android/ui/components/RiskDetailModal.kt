package com.vocalshield.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Report
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.vocalshield.android.data.database.CallRecordEntity
import com.vocalshield.android.data.database.CallRecordWithRisk
import com.vocalshield.android.detection.RiskBreakdown
import com.vocalshield.android.detection.RiskLevel
import com.vocalshield.android.detection.TriggerCategory
import com.vocalshield.android.detection.TriggerInfo
import com.vocalshield.android.ui.theme.VibrantRed

/**
 * Risk Detail Modal
 * 
 * Full-screen dialog showing detailed risk breakdown for a call.
 * Displays:
 * - Call information (caller, number, time, duration)
 * - Complete risk breakdown with RiskBreakdownCard
 * - All detected triggers
 * - Action buttons (Report Scam, Block Number)
 * 
 * Designed for simplicity and accessibility per product requirements.
 * Uses full-screen dialog for maximum readability on all device sizes.
 * 
 * Requirements: 8.3
 * 
 * @param record The call record with risk assessment and triggers
 * @param onDismiss Callback invoked when modal is dismissed
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RiskDetailModal(
    record: CallRecordWithRisk,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            Column(
                modifier = Modifier.fillMaxSize()
            ) {
                // Header with close button
                TopAppBar(
                    title = { Text("Risk Analysis Details") },
                    navigationIcon = {
                        IconButton(onClick = onDismiss) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Close"
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                        navigationIconContentColor = MaterialTheme.colorScheme.onSurface
                    )
                )
                
                // Scrollable content
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Call information card
                    CallInfoCard(call = record.call)
                    
                    // Risk breakdown (if available)
                    if (record.risk != null) {
                        val riskBreakdown = RiskBreakdown(
                            totalScore = record.risk.totalScore,
                            riskPercentage = record.getRiskPercentage(),
                            metadataContribution = record.risk.metadataScore,
                            manipulationContribution = record.risk.manipulationScore,
                            historicalContribution = record.risk.historicalScore,
                            triggers = record.triggers.map { trigger ->
                                TriggerInfo(
                                    category = TriggerCategory.valueOf(trigger.category),
                                    description = trigger.description,
                                    score = trigger.score,
                                    timestamp = trigger.timestamp,
                                    severity = RiskLevel.valueOf(trigger.severity)
                                )
                            },
                            confidence = record.risk.confidence,
                            primaryThreat = record.risk.primaryThreat,
                            explanation = record.risk.explanation
                        )
                        
                        RiskBreakdownCard(riskBreakdown = riskBreakdown)
                    }
                    
                    // Action buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = { /* TODO: Implement report scam functionality */ },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Report,
                                contentDescription = null
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Report Scam")
                        }
                        
                        OutlinedButton(
                            onClick = { /* TODO: Implement block number functionality */ },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Block,
                                contentDescription = null
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Block Number")
                        }
                    }
                    
                    // Bottom padding for safe area
                    Spacer(modifier = Modifier.height(16.dp))
                }
            }
        }
    }
}

/**
 * Call Information Card
 * 
 * Displays metadata about the call including caller name, phone number,
 * date/time, duration, and blocked status.
 * 
 * Designed for clarity and accessibility with large touch targets and
 * high contrast text.
 * 
 * @param call The call record entity with metadata
 */
@Composable
fun CallInfoCard(call: CallRecordEntity) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "Call Information",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            
            InfoRow(
                label = "Caller",
                value = call.callerName ?: "Unknown"
            )
            
            InfoRow(
                label = "Phone Number",
                value = call.phoneNumber
            )
            
            InfoRow(
                label = "Date & Time",
                value = formatTimestamp(call.timestamp)
            )
            
            InfoRow(
                label = "Duration",
                value = formatDuration(call.duration)
            )
            
            // Blocked badge (if applicable)
            if (call.wasBlocked) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = VibrantRed.copy(alpha = 0.2f)
                ) {
                    Row(
                        modifier = Modifier.padding(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Block,
                            contentDescription = null,
                            tint = VibrantRed,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "Call was blocked by VocalShield",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Bold,
                            color = VibrantRed
                        )
                    }
                }
            }
        }
    }
}

/**
 * Information Row
 * 
 * Displays a label-value pair with consistent formatting.
 * Used for call metadata display.
 * 
 * @param label The field label (e.g., "Caller", "Duration")
 * @param value The field value
 */
@Composable
fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

/**
 * Format Unix timestamp as human-readable date/time.
 * 
 * @param timestamp Unix timestamp in milliseconds
 * @return Formatted string (e.g., "Feb 16, 2026 10:30 AM")
 */
private fun formatTimestamp(timestamp: Long): String {
    val date = java.util.Date(timestamp)
    val format = java.text.SimpleDateFormat("MMM dd, yyyy hh:mm a", java.util.Locale.getDefault())
    return format.format(date)
}

/**
 * Format call duration as MM:SS.
 * 
 * @param durationSeconds Duration in seconds
 * @return Formatted string (e.g., "02:45")
 */
private fun formatDuration(durationSeconds: Int): String {
    val minutes = durationSeconds / 60
    val seconds = durationSeconds % 60
    return String.format(java.util.Locale.getDefault(), "%02d:%02d", minutes, seconds)
}
