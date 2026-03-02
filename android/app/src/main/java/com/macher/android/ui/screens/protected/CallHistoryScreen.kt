package com.macher.android.ui.screens.protected

import androidx.compose.animation.*
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
import com.macher.android.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun CallHistoryScreen(
    onNavigateBack: () -> Unit
) {
    var selectedFilter by remember { mutableStateOf("All") }
    var searchQuery by remember { mutableStateOf("") }
    var searchVisible by remember { mutableStateOf(false) }
    
    // Sample call history data
    val callHistory = remember {
        listOf(
            CallRecord(
                id = "1",
                timestamp = System.currentTimeMillis() - 3600000,
                phoneNumber = "+1 (555) 123-4567",
                callerName = "Unknown",
                duration = 180,
                threatLevel = "DANGER",
                threatType = "OTP Request - Bank Impersonation",
                wasBlocked = true
            ),
            CallRecord(
                id = "2",
                timestamp = System.currentTimeMillis() - 7200000,
                phoneNumber = "+1 (555) 987-6543",
                callerName = "Mom",
                duration = 420,
                threatLevel = "SAFE",
                threatType = null,
                wasBlocked = false
            ),
            CallRecord(
                id = "3",
                timestamp = System.currentTimeMillis() - 86400000,
                phoneNumber = "+1 (555) 555-1234",
                callerName = "Unknown",
                duration = 90,
                threatLevel = "CAUTION",
                threatType = "Urgency Pattern",
                wasBlocked = false
            ),
            CallRecord(
                id = "4",
                timestamp = System.currentTimeMillis() - 172800000,
                phoneNumber = "+1 (555) 111-2222",
                callerName = "Dr. Smith",
                duration = 300,
                threatLevel = "SAFE",
                threatType = null,
                wasBlocked = false
            )
        )
    }
    
    val filteredCalls = callHistory
        .filter { call ->
            when (selectedFilter) {
                "Threats" -> call.threatLevel != "SAFE"
                "Blocked" -> call.wasBlocked
                "Safe" -> call.threatLevel == "SAFE"
                else -> true
            }
        }
        .filter { call ->
            if (searchQuery.isBlank()) true
            else {
                val q = searchQuery.lowercase()
                call.callerName.lowercase().contains(q) ||
                call.phoneNumber.contains(q) ||
                (call.threatType?.lowercase()?.contains(q) == true)
            }
        }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Call History") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    if (searchVisible) {
                        IconButton(onClick = {
                            searchQuery = ""
                            searchVisible = false
                        }) {
                            Icon(Icons.Default.Close, "Close Search")
                        }
                    } else {
                        IconButton(onClick = { searchVisible = true }) {
                            Icon(Icons.Default.Search, "Search")
                        }
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(padding)
        ) {
            // Search bar (animated)
            AnimatedVisibility(
                visible = searchVisible,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically()
            ) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    placeholder = { Text("Search by name, number, or threat…") },
                    leadingIcon = { Icon(Icons.Default.Search, null) },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Default.Clear, "Clear")
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(24.dp)
                )
            }

            // Filter chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = selectedFilter == "All",
                    onClick = { selectedFilter = "All" },
                    label = { Text("All") }
                )
                FilterChip(
                    selected = selectedFilter == "Threats",
                    onClick = { selectedFilter = "Threats" },
                    label = { Text("Threats") }
                )
                FilterChip(
                    selected = selectedFilter == "Blocked",
                    onClick = { selectedFilter = "Blocked" },
                    label = { Text("Blocked") }
                )
                FilterChip(
                    selected = selectedFilter == "Safe",
                    onClick = { selectedFilter = "Safe" },
                    label = { Text("Safe") }
                )
            }
            
            // Call list
            if (filteredCalls.isEmpty()) {
                EmptyCallHistoryState()
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(filteredCalls) { call ->
                        Box(modifier = Modifier.animateItemPlacement()) {
                            CallHistoryCard(call = call)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun EmptyCallHistoryState() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Phone,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text(
            text = "No Calls Yet",
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Bold
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "Your call history will appear here",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun CallHistoryCard(call: CallRecord) {
    val dateFormat = remember { SimpleDateFormat("MMM dd, hh:mm a", Locale.getDefault()) }
    
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Threat indicator
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        when (call.threatLevel) {
                            "DANGER" -> VibrantRed.copy(alpha = 0.3f)
                            "CAUTION" -> VibrantYellow.copy(alpha = 0.3f)
                            else -> VibrantGreen.copy(alpha = 0.3f)
                        }
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = when (call.threatLevel) {
                        "DANGER" -> Icons.Default.Warning
                        "CAUTION" -> Icons.Default.Info
                        else -> Icons.Default.CheckCircle
                    },
                    contentDescription = null,
                    tint = when (call.threatLevel) {
                        "DANGER" -> VibrantRed
                        "CAUTION" -> VibrantYellow
                        else -> VibrantGreen
                    },
                    modifier = Modifier.size(24.dp)
                )
            }
            
            Spacer(modifier = Modifier.width(16.dp))
            
            // Call details
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = call.callerName,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Bold
                )
                
                Text(
                    text = call.phoneNumber,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                
                Spacer(modifier = Modifier.height(4.dp))
                
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.AccessTime,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        modifier = Modifier.size(14.dp)
                    )
                    
                    Spacer(modifier = Modifier.width(4.dp))
                    
                    Text(
                        text = dateFormat.format(Date(call.timestamp)),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                    
                    Spacer(modifier = Modifier.width(12.dp))
                    
                    Icon(
                        imageVector = Icons.Default.Timer,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        modifier = Modifier.size(14.dp)
                    )
                    
                    Spacer(modifier = Modifier.width(4.dp))
                    
                    Text(
                        text = "${call.duration / 60}:${String.format("%02d", call.duration % 60)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
                
                if (call.threatType != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    
                    Text(
                        text = call.threatType,
                        style = MaterialTheme.typography.bodySmall,
                        color = when (call.threatLevel) {
                            "DANGER" -> VibrantRed
                            "CAUTION" -> VibrantYellow
                            else -> VibrantGreen
                        },
                        fontWeight = FontWeight.Medium
                    )
                }
            }
            
            // Blocked badge
            if (call.wasBlocked) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = VibrantRed.copy(alpha = 0.3f)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Block,
                            contentDescription = null,
                            tint = VibrantRed,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Blocked",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

data class CallRecord(
    val id: String,
    val timestamp: Long,
    val phoneNumber: String,
    val callerName: String,
    val duration: Int, // in seconds
    val threatLevel: String,
    val threatType: String?,
    val wasBlocked: Boolean
)
