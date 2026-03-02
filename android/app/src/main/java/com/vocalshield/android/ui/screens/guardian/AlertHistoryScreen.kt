package com.vocalshield.android.ui.screens.guardian

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack

import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.vocalshield.android.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun AlertHistoryScreen(
    onNavigateBack: () -> Unit
) {
    // Sample data
    val alerts = remember {
        listOf(
            AlertItem(
                id = "1",
                timestamp = System.currentTimeMillis() - 3600000,
                threatLevel = "DANGER",
                threatType = "OTP Request - IRS Impersonation",
                confidence = 0.92f,
                actionTaken = "Call Disconnected"
            ),
            AlertItem(
                id = "2",
                timestamp = System.currentTimeMillis() - 7200000,
                threatLevel = "CAUTION",
                threatType = "Urgency Pattern Detected",
                confidence = 0.68f,
                actionTaken = "Haptic Warning"
            ),
            AlertItem(
                id = "3",
                timestamp = System.currentTimeMillis() - 86400000,
                threatLevel = "DANGER",
                threatType = "Gift Card Coercion",
                confidence = 0.85f,
                actionTaken = "Screen Overlay"
            )
        )
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Alert History") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
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
            if (alerts.isEmpty()) {
                EmptyAlertsState()
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(alerts) { alert ->
                        Box(modifier = Modifier.animateItemPlacement()) {
                            AlertHistoryCard(alert = alert)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun EmptyAlertsState() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.CheckCircle,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = VibrantGreen
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text(
            text = "No Alerts Yet",
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Bold
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "All clear! No threats detected.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun AlertHistoryCard(alert: AlertItem) {
    val dateFormat = remember { SimpleDateFormat("MMM dd, yyyy 'at' hh:mm a", Locale.getDefault()) }
    
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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(
                                when (alert.threatLevel) {
                                    "DANGER" -> VibrantRed.copy(alpha = 0.3f)
                                    "CAUTION" -> VibrantYellow.copy(alpha = 0.3f)
                                    else -> VibrantGreen.copy(alpha = 0.3f)
                                }
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = when (alert.threatLevel) {
                                "DANGER" -> Icons.Default.Warning
                                "CAUTION" -> Icons.Default.Info
                                else -> Icons.Default.CheckCircle
                            },
                            contentDescription = null,
                            tint = when (alert.threatLevel) {
                                "DANGER" -> VibrantRed
                                "CAUTION" -> VibrantYellow
                                else -> VibrantGreen
                            },
                            modifier = Modifier.size(24.dp)
                        )
                    }
                    
                    Spacer(modifier = Modifier.width(12.dp))
                    
                    Column {
                        Text(
                            text = alert.threatLevel,
                            style = MaterialTheme.typography.titleMedium,
                            color = when (alert.threatLevel) {
                                "DANGER" -> VibrantRed
                                "CAUTION" -> VibrantYellow
                                else -> VibrantGreen
                            },
                            fontWeight = FontWeight.Bold
                        )
                        
                        Text(
                            text = dateFormat.format(Date(alert.timestamp)),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = VibrantPink.copy(alpha = 0.3f)
                ) {
                    Text(
                        text = "${(alert.confidence * 100).toInt()}%",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            
            Text(
                text = alert.threatType,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Medium
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Shield,
                    contentDescription = null,
                    tint = VibrantGreen,
                    modifier = Modifier.size(16.dp)
                )
                
                Spacer(modifier = Modifier.width(6.dp))
                
                Text(
                    text = "Action: ${alert.actionTaken}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f)
                )
            }
        }
    }
}

data class AlertItem(
    val id: String,
    val timestamp: Long,
    val threatLevel: String,
    val threatType: String,
    val confidence: Float,
    val actionTaken: String
)
