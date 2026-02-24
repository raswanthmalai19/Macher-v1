package com.vocalshield.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vocalshield.android.data.CallSession
import com.vocalshield.android.domain.ThreatLevel
import java.text.SimpleDateFormat
import java.util.*

/**
 * Call history screen showing past monitored calls.
 * 
 * Design Principles:
 * - Simplicity: Clear list with color-coded threat levels
 * - Accessibility: Large text, high contrast
 * - Privacy: Only metadata shown, no audio or transcription
 * 
 * Requirements: 12.3
 */
@Composable
fun CallHistoryScreen(
    viewModel: CallHistoryViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    var showClearDialog by remember { mutableStateOf(false) }
    
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        "Call History",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                },
                actions = {
                    // Clear history button
                    if (!uiState.isEmpty) {
                        IconButton(onClick = { showClearDialog = true }) {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = "Clear history",
                                tint = MaterialTheme.colorScheme.onPrimary
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Filter chips
            FilterChips(
                currentFilter = uiState.currentFilter,
                onFilterChange = { viewModel.setFilter(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            )
            
            // Call history list
            if (uiState.isEmpty) {
                EmptyHistoryMessage(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp)
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(
                        items = uiState.callSessions,
                        key = { session -> session.id }
                    ) { session ->
                        CallSessionCard(session = session)
                    }
                }
            }
            
            // Error Message
            uiState.errorMessage?.let { error ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                ) {
                    ErrorMessage(
                        message = error,
                        onDismiss = { viewModel.clearError() }
                    )
                }
            }
            
            // Success Message
            uiState.successMessage?.let { success ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                ) {
                    SuccessMessage(
                        message = success,
                        onDismiss = { viewModel.clearSuccess() }
                    )
                }
            }
        }
    }
    
    // Clear history confirmation dialog
    if (showClearDialog) {
        AlertDialog(
            onDismissRequest = { showClearDialog = false },
            title = { Text("Clear Call History?") },
            text = { Text("This will permanently delete all call history records. This action cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.clearHistory()
                        showClearDialog = false
                    }
                ) {
                    Text("Clear", color = Color(0xFFF44336))
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

/**
 * Filter chips for threat level filtering.
 */
@Composable
fun FilterChips(
    currentFilter: ThreatLevel?,
    onFilterChange: (ThreatLevel?) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // All filter
        FilterChip(
            selected = currentFilter == null,
            onClick = { onFilterChange(null) },
            label = { Text("All") }
        )
        
        // Safe filter
        FilterChip(
            selected = currentFilter == ThreatLevel.SAFE,
            onClick = { onFilterChange(ThreatLevel.SAFE) },
            label = { Text("Safe") },
            leadingIcon = {
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .background(Color(0xFF4CAF50), CircleShape)
                )
            }
        )
        
        // Caution filter
        FilterChip(
            selected = currentFilter == ThreatLevel.CAUTION,
            onClick = { onFilterChange(ThreatLevel.CAUTION) },
            label = { Text("Caution") },
            leadingIcon = {
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .background(Color(0xFFFFC107), CircleShape)
                )
            }
        )
        
        // Danger filter
        FilterChip(
            selected = currentFilter == ThreatLevel.DANGER,
            onClick = { onFilterChange(ThreatLevel.DANGER) },
            label = { Text("Danger") },
            leadingIcon = {
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .background(Color(0xFFF44336), CircleShape)
                )
            }
        )
    }
}

/**
 * Call session card showing metadata.
 * Optimized with remember for expensive computations.
 */
@Composable
fun CallSessionCard(
    session: CallSession,
    modifier: Modifier = Modifier
) {
    val threatColor = remember(session.finalThreatLevel) {
        when (session.finalThreatLevel) {
            ThreatLevel.SAFE -> Color(0xFF4CAF50)
            ThreatLevel.CAUTION -> Color(0xFFFFC107)
            ThreatLevel.DANGER -> Color(0xFFF44336)
        }
    }
    
    val dateFormat = remember { SimpleDateFormat("MMM dd, yyyy 'at' hh:mm a", Locale.getDefault()) }
    val formattedDate = remember(session.timestamp) { 
        dateFormat.format(Date(session.timestamp))
    }
    
    val durationText = remember(session.durationSeconds) {
        val minutes = session.durationSeconds / 60
        val seconds = session.durationSeconds % 60
        String.format("%d:%02d", minutes, seconds)
    }
    
    val threatIcon = remember(session.finalThreatLevel) {
        when (session.finalThreatLevel) {
            ThreatLevel.SAFE -> "✓"
            ThreatLevel.CAUTION -> "⚠"
            ThreatLevel.DANGER -> "!"
        }
    }
    
    Card(
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Threat level indicator
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(threatColor, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = threatIcon,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
            
            Spacer(modifier = Modifier.width(16.dp))
            
            // Call details
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = session.finalThreatLevel.name,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = threatColor
                )
                
                Text(
                    text = formattedDate,
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                
                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Duration
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Timer,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = durationText,
                            fontSize = 14.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    
                    // Phone number (if available)
                    session.phoneNumber?.let { number ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Phone,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = number,
                                fontSize = 14.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Empty history message.
 */
@Composable
fun EmptyHistoryMessage(
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.History,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text(
            text = "No Call History",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "Your monitored calls will appear here",
            fontSize = 16.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
