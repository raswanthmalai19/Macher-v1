package com.vocalshield.android.ui.screens.guardian

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingFlat
import androidx.compose.material.icons.automirrored.filled.TrendingUp

import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.vocalshield.android.data.database.CallRecordWithRisk
import com.vocalshield.android.service.MonitoringManager
import com.vocalshield.android.ui.theme.*
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

/**
 * Statistics data aggregated from call history
 */
data class CallStatistics(
    val totalCalls: Int = 0,
    val scamCalls: Int = 0,
    val blockedCalls: Int = 0,
    val safeCalls: Int = 0,
    val protectionRate: Float = 0f,
    val averageDetectionLatency: Float = 0f,
    val threatCategories: Map<String, Int> = emptyMap(),
    val timeDistribution: Map<String, Int> = emptyMap(),
    val riskHistory: List<Pair<Long, String>> = emptyList()
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatisticsScreen(
    monitoringManager: MonitoringManager,
    onNavigateBack: () -> Unit
) {
    var selectedPeriod by remember { mutableStateOf("Week") }
    var statistics by remember { mutableStateOf(CallStatistics()) }
    var isLoading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()
    
    // Load statistics when screen opens or period changes
    LaunchedEffect(selectedPeriod) {
        scope.launch {
            isLoading = true
            try {
                val history = monitoringManager.getCallHistory(limit = 1000, offset = 0)
                val filteredHistory = filterByPeriod(history, selectedPeriod)
                statistics = calculateStatistics(filteredHistory)
            } catch (e: Exception) {
                // Handle error - keep empty statistics
            } finally {
                isLoading = false
            }
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Statistics") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { /* TODO: Export */ }) {
                        Icon(Icons.Default.Download, "Export")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                    navigationIconContentColor = MaterialTheme.colorScheme.onSurface,
                    actionIconContentColor = MaterialTheme.colorScheme.onSurface
                )
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(padding)
        ) {
            if (isLoading) {
                // Loading indicator
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Period selector
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf("Day", "Week", "Month", "Year").forEach { period ->
                            FilterChip(
                                selected = selectedPeriod == period,
                                onClick = { selectedPeriod = period },
                                label = { Text(period) }
                            )
                        }
                    }
                    
                    // Overview cards
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        StatCard(
                            title = "Total Calls",
                            value = statistics.totalCalls.toString(),
                            change = "",
                            icon = Icons.Default.Phone,
                            color = VibrantBlue,
                            modifier = Modifier.weight(1f)
                        )
                        
                        StatCard(
                            title = "Threats",
                            value = statistics.scamCalls.toString(),
                            change = "",
                            icon = Icons.Default.Warning,
                            color = VibrantRed,
                            modifier = Modifier.weight(1f)
                        )
                    }
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        StatCard(
                            title = "Blocked",
                            value = statistics.blockedCalls.toString(),
                            change = "",
                            icon = Icons.Default.Block,
                            color = VibrantYellow,
                            modifier = Modifier.weight(1f)
                        )
                        
                        StatCard(
                            title = "Safe Calls",
                            value = statistics.safeCalls.toString(),
                            change = "",
                            icon = Icons.Default.CheckCircle,
                            color = VibrantGreen,
                            modifier = Modifier.weight(1f)
                        )
                    }
                
                    // Threat breakdown
                    if (statistics.threatCategories.isNotEmpty()) {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp)
                            ) {
                                Text(
                                    text = "Threat Types",
                                    style = MaterialTheme.typography.titleLarge,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontWeight = FontWeight.Bold
                                )
                                
                                Spacer(modifier = Modifier.height(16.dp))
                                
                                val sortedThreats = statistics.threatCategories.entries
                                    .sortedByDescending { it.value }
                                    .take(5)
                                
                                val totalThreats = statistics.threatCategories.values.sum().toFloat()
                                
                                sortedThreats.forEachIndexed { index, (category, count) ->
                                    val percentage = if (totalThreats > 0) (count / totalThreats) * 100 else 0f
                                    val color = when (index) {
                                        0 -> VibrantRed
                                        1 -> VibrantYellow
                                        2 -> VibrantPink
                                        3 -> VibrantPurple
                                        else -> VibrantBlue
                                    }
                                    ThreatTypeRow(category, count, percentage, color)
                                }
                            }
                        }
                    }
                
                    // Time distribution
                    if (statistics.timeDistribution.isNotEmpty()) {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp)
                            ) {
                                Text(
                                    text = "Call Distribution",
                                    style = MaterialTheme.typography.titleLarge,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontWeight = FontWeight.Bold
                                )
                                
                                Spacer(modifier = Modifier.height(16.dp))
                                
                                val totalCalls = statistics.timeDistribution.values.sum().toFloat()
                                
                                listOf(
                                    "Morning (6-12)" to statistics.timeDistribution["morning"],
                                    "Afternoon (12-18)" to statistics.timeDistribution["afternoon"],
                                    "Evening (18-24)" to statistics.timeDistribution["evening"],
                                    "Night (0-6)" to statistics.timeDistribution["night"]
                                ).forEach { (period, count) ->
                                    val callCount = count ?: 0
                                    val percentage = if (totalCalls > 0) (callCount / totalCalls) * 100 else 0f
                                    TimeDistributionRow(period, callCount, percentage)
                                }
                            }
                        }
                    }
                
                    // Protection effectiveness
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp)
                        ) {
                            Text(
                                text = "Protection Effectiveness",
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onSurface,
                                fontWeight = FontWeight.Bold
                            )
                            
                            Spacer(modifier = Modifier.height(16.dp))
                            
                            EffectivenessMetric(
                                label = "Protection Rate",
                                value = String.format("%.1f%%", statistics.protectionRate),
                                icon = Icons.Default.Shield,
                                color = VibrantGreen
                            )
                            
                            EffectivenessMetric(
                                label = "Avg Detection Time",
                                value = String.format("%.2fs", statistics.averageDetectionLatency / 1000f),
                                icon = Icons.Default.Speed,
                                color = VibrantBlue
                            )
                            
                            EffectivenessMetric(
                                label = "Scam Calls Detected",
                                value = statistics.scamCalls.toString(),
                                icon = Icons.Default.Warning,
                                color = VibrantRed
                            )
                            
                            EffectivenessMetric(
                                label = "Calls Monitored",
                                value = statistics.totalCalls.toString(),
                                icon = Icons.Default.Visibility,
                                color = VibrantPurple
                            )
                        }
                    }
                    
                    // Risk history chart (past 30 days)
                    if (statistics.riskHistory.isNotEmpty()) {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp)
                            ) {
                                Text(
                                    text = "Risk History (Last 30 Days)",
                                    style = MaterialTheme.typography.titleLarge,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontWeight = FontWeight.Bold
                                )
                                
                                Spacer(modifier = Modifier.height(16.dp))
                                
                                // Group by risk level
                                val riskCounts = statistics.riskHistory
                                    .groupBy { it.second }
                                    .mapValues { it.value.size }
                                
                                val highRisk = riskCounts["HIGH"] ?: 0
                                val mediumRisk = riskCounts["MEDIUM"] ?: 0
                                val lowRisk = riskCounts["LOW"] ?: 0
                                val total = highRisk + mediumRisk + lowRisk
                                
                                if (total > 0) {
                                    RiskHistoryRow("High Risk", highRisk, (highRisk.toFloat() / total) * 100, VibrantRed)
                                    RiskHistoryRow("Medium Risk", mediumRisk, (mediumRisk.toFloat() / total) * 100, VibrantYellow)
                                    RiskHistoryRow("Low Risk", lowRisk, (lowRisk.toFloat() / total) * 100, VibrantGreen)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun StatCard(
    title: String,
    value: String,
    change: String,
    icon: ImageVector,
    color: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(24.dp)
                )
                
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (change.startsWith("+")) VibrantGreen.copy(alpha = 0.2f) else VibrantRed.copy(alpha = 0.2f)
                ) {
                    Text(
                        text = change,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (change.startsWith("+")) VibrantGreen else VibrantRed,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            
            Text(
                text = value,
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold
            )
            
            Text(
                text = title,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
            )
        }
    }
}

@Composable
fun ThreatTypeRow(
    name: String,
    count: Int,
    percentage: Float,
    color: androidx.compose.ui.graphics.Color
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
            
            Text(
                text = "$count (${percentage.toInt()}%)",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
            )
        }
        
        Spacer(modifier = Modifier.height(4.dp))
        
        LinearProgressIndicator(
            progress = percentage / 100f,
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp)),
            color = color,
            trackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.15f)
        )
    }
}

@Composable
fun TimeDistributionRow(
    period: String,
    count: Int,
    percentage: Float
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = period,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
            
            Text(
                text = "$count (${percentage.toInt()}%)",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
            )
        }
        
        Spacer(modifier = Modifier.height(4.dp))
        
        LinearProgressIndicator(
            progress = percentage / 100f,
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp)),
            color = VibrantBlue,
            trackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.15f)
        )
    }
}

@Composable
fun EffectivenessMetric(
    label: String,
    value: String,
    icon: ImageVector,
    color: androidx.compose.ui.graphics.Color
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(color.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(20.dp)
                )
            }
            
            Spacer(modifier = Modifier.width(12.dp))
            
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
        
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
fun ScamPatternItem(
    rank: Int,
    pattern: String,
    occurrences: Int,
    trend: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = VibrantPink.copy(alpha = 0.3f),
                modifier = Modifier.size(32.dp)
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.fillMaxSize()
                ) {
                    Text(
                        text = rank.toString(),
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            
            Spacer(modifier = Modifier.width(12.dp))
            
            Column {
                Text(
                    text = pattern,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Medium
                )
                
                Text(
                    text = "$occurrences occurrences",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }
        }
        
        Icon(
            imageVector = when (trend) {
                "up" -> Icons.AutoMirrored.Filled.TrendingUp
                "down" -> Icons.AutoMirrored.Filled.TrendingDown
                else -> Icons.AutoMirrored.Filled.TrendingFlat
            },
            contentDescription = null,
            tint = when (trend) {
                "up" -> VibrantRed
                "down" -> VibrantGreen
                else -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
            },
            modifier = Modifier.size(24.dp)
        )
    }
}

@Composable
fun RiskHistoryRow(
    name: String,
    count: Int,
    percentage: Float,
    color: androidx.compose.ui.graphics.Color
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
            
            Text(
                text = "$count (${percentage.toInt()}%)",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
            )
        }
        
        Spacer(modifier = Modifier.height(4.dp))
        
        LinearProgressIndicator(
            progress = percentage / 100f,
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp)),
            color = color,
            trackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.15f)
        )
    }
}

/**
 * Filter call history by selected time period
 */
private fun filterByPeriod(history: List<CallRecordWithRisk>, period: String): List<CallRecordWithRisk> {
    val now = System.currentTimeMillis()
    val cutoffTime = when (period) {
        "Day" -> now - TimeUnit.DAYS.toMillis(1)
        "Week" -> now - TimeUnit.DAYS.toMillis(7)
        "Month" -> now - TimeUnit.DAYS.toMillis(30)
        "Year" -> now - TimeUnit.DAYS.toMillis(365)
        else -> 0L
    }
    
    return history.filter { it.call.timestamp >= cutoffTime }
}

/**
 * Calculate statistics from call history
 */
private fun calculateStatistics(history: List<CallRecordWithRisk>): CallStatistics {
    if (history.isEmpty()) {
        return CallStatistics()
    }
    
    val totalCalls = history.size
    val scamCalls = history.count { it.isHighRisk() || it.isMediumRisk() }
    val blockedCalls = history.count { it.call.wasBlocked }
    val safeCalls = history.count { it.isLowRisk() }
    
    // Protection rate: percentage of scam calls that were blocked
    val protectionRate = if (scamCalls > 0) {
        (blockedCalls.toFloat() / scamCalls.toFloat()) * 100
    } else {
        100f
    }
    
    // Average detection latency (mock for now - would need actual timing data)
    val averageDetectionLatency = 420f // 420ms average
    
    // Threat categories from triggers
    val threatCategories = mutableMapOf<String, Int>()
    history.forEach { record ->
        record.triggers.forEach { trigger ->
            val category = formatTriggerCategory(trigger.category)
            threatCategories[category] = (threatCategories[category] ?: 0) + 1
        }
    }
    
    // Time distribution
    val timeDistribution = mutableMapOf<String, Int>()
    history.forEach { record ->
        val hour = java.util.Calendar.getInstance().apply {
            timeInMillis = record.call.timestamp
        }.get(java.util.Calendar.HOUR_OF_DAY)
        
        val period = when (hour) {
            in 6..11 -> "morning"
            in 12..17 -> "afternoon"
            in 18..23 -> "evening"
            else -> "night"
        }
        
        timeDistribution[period] = (timeDistribution[period] ?: 0) + 1
    }
    
    // Risk history (last 30 days)
    val thirtyDaysAgo = System.currentTimeMillis() - TimeUnit.DAYS.toMillis(30)
    val riskHistory = history
        .filter { it.call.timestamp >= thirtyDaysAgo }
        .map { Pair(it.call.timestamp, it.getRiskLevel()) }
        .sortedBy { it.first }
    
    return CallStatistics(
        totalCalls = totalCalls,
        scamCalls = scamCalls,
        blockedCalls = blockedCalls,
        safeCalls = safeCalls,
        protectionRate = protectionRate,
        averageDetectionLatency = averageDetectionLatency,
        threatCategories = threatCategories,
        timeDistribution = timeDistribution,
        riskHistory = riskHistory
    )
}

/**
 * Format trigger category for display
 */
private fun formatTriggerCategory(category: String): String {
    return category
        .replace("METADATA_", "")
        .replace("MANIPULATION_", "")
        .replace("HISTORICAL_", "")
        .replace("_", " ")
        .lowercase()
        .split(" ")
        .joinToString(" ") { it.replaceFirstChar { char -> char.uppercase() } }
}
