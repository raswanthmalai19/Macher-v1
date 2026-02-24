package com.vocalshield.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vocalshield.android.domain.ConnectionState
import com.vocalshield.android.domain.ThreatLevel
import kotlinx.coroutines.launch

/**
 * Call monitoring screen with traffic light threat indicator.
 * 
 * Design Principles:
 * - Simplicity: Large touch targets, clear visual indicators
 * - Accessibility: High contrast, large text for elderly users
 * - Calm: Non-panic-inducing colors and messaging
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 7.1, 11.2
 */
@Composable
fun CallMonitorScreen(
    viewModel: CallMonitorViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        "VocalShield",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
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
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // Connection status indicator
            ConnectionStatusIndicator(
                connectionState = uiState.connectionState,
                modifier = Modifier.fillMaxWidth()
            )
            
            // Threat level indicator (Traffic Light)
            ThreatLevelIndicator(
                threatLevel = uiState.threatLevel,
                isMonitoring = uiState.isMonitoring,
                modifier = Modifier
                    .size(200.dp)
                    .weight(1f)
            )
            
            // Call duration
            if (uiState.isMonitoring) {
                CallDurationDisplay(
                    durationSeconds = uiState.callDuration,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            
            // Transcription display (scrollable)
            if (uiState.transcription.isNotEmpty()) {
                TranscriptionDisplay(
                    transcription = uiState.transcription,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                )
            }
            
            // Error message
            uiState.errorMessage?.let { error ->
                ErrorMessage(
                    message = error,
                    onDismiss = { viewModel.clearError() }
                )
            }
            
            // Start/Stop monitoring button
            MonitoringButton(
                isMonitoring = uiState.isMonitoring,
                onStartMonitoring = { viewModel.startMonitoring() },
                onStopMonitoring = { viewModel.stopMonitoring() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(72.dp)
            )
        }
    }
}

/**
 * Connection status indicator.
 * Optimized with remember to avoid recomposition.
 */
@Composable
fun ConnectionStatusIndicator(
    connectionState: ConnectionState,
    modifier: Modifier = Modifier
) {
    val (text, color) = remember(connectionState) {
        when (connectionState) {
            ConnectionState.CONNECTED -> "Connected" to Color(0xFF4CAF50)
            ConnectionState.CONNECTING -> "Connecting..." to Color(0xFFFFC107)
            ConnectionState.DISCONNECTED -> "Offline" to Color(0xFF9E9E9E)
            ConnectionState.ERROR -> "Connection Error" to Color(0xFFF44336)
        }
    }
    
    Surface(
        modifier = modifier,
        color = color.copy(alpha = 0.1f),
        shape = MaterialTheme.shapes.small
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .background(color, CircleShape)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = text,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                color = color
            )
        }
    }
}

/**
 * Traffic light threat level indicator.
 * Large, clear visual for elderly users.
 * Optimized with remember and derivedStateOf.
 */
@Composable
fun ThreatLevelIndicator(
    threatLevel: ThreatLevel,
    isMonitoring: Boolean,
    modifier: Modifier = Modifier
) {
    val (color, text, emoji) = remember(threatLevel, isMonitoring) {
        when {
            !isMonitoring -> Triple(Color(0xFF9E9E9E), "Not Monitoring", "⏸️")
            threatLevel == ThreatLevel.SAFE -> Triple(Color(0xFF4CAF50), "SAFE", "✅")
            threatLevel == ThreatLevel.CAUTION -> Triple(Color(0xFFFFC107), "CAUTION", "⚠️")
            threatLevel == ThreatLevel.DANGER -> Triple(Color(0xFFF44336), "DANGER", "🚨")
            else -> Triple(Color(0xFF9E9E9E), "Unknown", "❓")
        }
    }
    
    Surface(
        modifier = modifier,
        color = color,
        shape = CircleShape
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = emoji,
                fontSize = 64.sp
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = text,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                textAlign = TextAlign.Center
            )
        }
    }
}

/**
 * Call duration display.
 * Optimized with remember to format only when duration changes.
 */
@Composable
fun CallDurationDisplay(
    durationSeconds: Int,
    modifier: Modifier = Modifier
) {
    val formattedDuration = remember(durationSeconds) {
        val minutes = durationSeconds / 60
        val seconds = durationSeconds % 60
        String.format("Call Duration: %02d:%02d", minutes, seconds)
    }
    
    Text(
        text = formattedDuration,
        fontSize = 20.sp,
        fontWeight = FontWeight.Medium,
        modifier = modifier,
        textAlign = TextAlign.Center
    )
}

/**
 * Transcription display with auto-scroll.
 * Optimized with LaunchedEffect for auto-scroll on transcription updates.
 */
@Composable
fun TranscriptionDisplay(
    transcription: String,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()
    val coroutineScope = rememberCoroutineScope()
    
    // Auto-scroll to bottom when transcription updates
    LaunchedEffect(transcription) {
        if (transcription.isNotEmpty()) {
            coroutineScope.launch {
                scrollState.animateScrollTo(scrollState.maxValue)
            }
        }
    }
    
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            Text(
                text = "Live Transcription",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            Text(
                text = transcription,
                fontSize = 16.sp,
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
            )
        }
    }
}

/**
 * Error message display.
 */
@Composable
fun ErrorMessage(
    message: String,
    onDismiss: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFFF44336).copy(alpha = 0.1f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = "Error",
                tint = Color(0xFFF44336)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = message,
                fontSize = 16.sp,
                color = Color(0xFFF44336),
                modifier = Modifier.weight(1f)
            )
            TextButton(onClick = onDismiss) {
                Text("Dismiss")
            }
        }
    }
}

/**
 * Start/Stop monitoring button.
 * Large touch target for elderly users.
 */
@Composable
fun MonitoringButton(
    isMonitoring: Boolean,
    onStartMonitoring: () -> Unit,
    onStopMonitoring: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        onClick = if (isMonitoring) onStopMonitoring else onStartMonitoring,
        modifier = modifier,
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isMonitoring) Color(0xFFF44336) else MaterialTheme.colorScheme.primary
        )
    ) {
        Text(
            text = if (isMonitoring) "STOP MONITORING" else "START MONITORING",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold
        )
    }
}
