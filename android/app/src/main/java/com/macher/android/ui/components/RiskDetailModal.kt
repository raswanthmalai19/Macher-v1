package com.macher.android.ui.components

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
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.telecom.TelecomManager
import android.widget.Toast
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.macher.android.data.database.CallRecordEntity
import com.macher.android.data.database.CallRecordWithRisk
import com.macher.android.data.database.HistoricalRiskEntity
import com.macher.android.data.database.MacherDatabase
import com.macher.android.detection.RiskBreakdown
import com.macher.android.detection.RiskLevel
import com.macher.android.detection.TriggerCategory
import com.macher.android.detection.TriggerInfo
import com.macher.android.ui.theme.VibrantRed
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

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
                            triggers = record.triggers.mapNotNull { trigger ->
                            try {
                                TriggerInfo(
                                    category = runCatching { TriggerCategory.valueOf(trigger.category) }.getOrDefault(TriggerCategory.HISTORICAL_KNOWN_SCAMMER),
                                    description = trigger.description,
                                    score = trigger.score,
                                    timestamp = trigger.timestamp,
                                    severity = runCatching { RiskLevel.valueOf(trigger.severity) }.getOrDefault(RiskLevel.LOW)
                                )
                            } catch (_: Exception) {
                                null
                            }
                            },
                            confidence = record.risk.confidence,
                            primaryThreat = record.risk.primaryThreat,
                            explanation = record.risk.explanation
                        )
                        
                        RiskBreakdownCard(riskBreakdown = riskBreakdown)
                    }
                    
                    // Action buttons
                    val context = LocalContext.current
                    var reported = remember { mutableStateOf(false) }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                if (!reported.value) {
                                    reported.value = true
                                    reportScam(context, record)
                                }
                            },
                            modifier = Modifier.weight(1f),
                            enabled = !reported.value
                        ) {
                            Icon(
                                imageVector = Icons.Default.Report,
                                contentDescription = null
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(if (reported.value) "Reported" else "Report Scam")
                        }
                        
                        OutlinedButton(
                            onClick = { blockNumber(context, record.call.phoneNumber) },
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
                            text = "Call was blocked by MACHER",
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

/**
 * Report a scam call — blacklists the phone number in the local database.
 */
private fun reportScam(context: Context, record: CallRecordWithRisk) {
    CoroutineScope(Dispatchers.IO).launch {
        try {
            val db = MacherDatabase.getDatabase(context)
            val dao = db.historicalRiskDao()
            val existing = dao.getHistoricalRisk(record.call.phoneNumber)
            if (existing != null) {
                dao.insertOrUpdateHistoricalRisk(existing.copy(isBlacklisted = true, scamCalls = existing.scamCalls + 1))
            } else {
                dao.insertOrUpdateHistoricalRisk(
                    HistoricalRiskEntity(
                        phoneNumber = record.call.phoneNumber,
                        totalCalls = 1,
                        scamCalls = 1,
                        averageRiskScore = record.risk?.totalScore?.toFloat() ?: 80f,
                        lastCallTime = System.currentTimeMillis(),
                        lastRiskLevel = record.getRiskLevel(),
                        isBlacklisted = true
                    )
                )
            }
        } catch (_: Exception) {
            // Silently log — don't crash the UI
        }
    }
    CoroutineScope(Dispatchers.Main).launch {
        Toast.makeText(context, "Number reported as scam", Toast.LENGTH_SHORT).show()
    }
}

/**
 * Block a phone number — opens the system blocked numbers manager.
 */
private fun blockNumber(context: Context, phoneNumber: String) {
    try {
        val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
        if (telecomManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                val intent = telecomManager.createManageBlockedNumbersIntent()
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(context, "Block feature not available on this device", Toast.LENGTH_LONG).show()
            }
        } else {
            Toast.makeText(context, "Open Phone app settings to block this number", Toast.LENGTH_LONG).show()
        }
    } catch (e: Exception) {
        Toast.makeText(context, "Unable to open block settings", Toast.LENGTH_SHORT).show()
    }
}
