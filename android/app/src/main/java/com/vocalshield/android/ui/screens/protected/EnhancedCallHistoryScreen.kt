package com.vocalshield.android.ui.screens.protected

import androidx.compose.animation.*
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.vocalshield.android.data.database.CallRecordWithRisk
import com.vocalshield.android.service.MonitoringManager
import com.vocalshield.android.ui.components.RiskDetailModal
import com.vocalshield.android.ui.theme.*
import kotlinx.coroutines.launch

/**
 * Enhanced Call History Screen with Risk Analysis
 * 
 * Displays call history with detailed risk breakdowns from the multi-layer
 * detection system. Integrates with MonitoringManager to load persisted
 * call records with risk assessments and triggers.
 * 
 * Features:
 * - Real-time loading from Room database
 * - Risk badges with color-coded threat levels
 * - Primary threat display
 * - Trigger count indicators
 * - Tap to view detailed risk breakdown modal
 * - Filter by risk level
 * - Search functionality
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.5
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun EnhancedCallHistoryScreen(
    monitoringManager: MonitoringManager,
    onNavigateBack: () -> Unit
) {
    var callHistory by remember { mutableStateOf<List<CallRecordWithRisk>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var selectedCallId by remember { mutableStateOf<String?>(null) }
    var showRiskDetail by remember { mutableStateOf(false) }
    var selectedFilter by remember { mutableStateOf("All") }
    var searchQuery by remember { mutableStateOf("") }
    var searchVisible by remember { mutableStateOf(false) }
    
    val scope = rememberCoroutineScope()
    
    // Load call history on screen launch
    LaunchedEffect(Unit) {
        scope.launch {
            try {
                val history = monitoringManager.getCallHistory(limit = 100, offset = 0)
                callHistory = history
                isLoading = false
            } catch (e: Exception) {
                // Log error and show empty state
                isLoading = false
            }
        }
    }
    
    // Filter calls based on selected filter and search query
    val filteredCalls = callHistory
        .filter { record ->
            when (selectedFilter) {
                "High Risk" -> record.isHighRisk()
                "Medium Risk" -> record.isMediumRisk()
                "Low Risk" -> record.isLowRisk()
                else -> true
            }
        }
        .filter { record ->
            if (searchQuery.isBlank()) true
            else {
                val q = searchQuery.lowercase()
                record.getCallerDisplayName().lowercase().contains(q) ||
                record.call.phoneNumber.contains(q) ||
                record.getPrimaryThreat().lowercase().contains(q)
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
                    selected = selectedFilter == "High Risk",
                    onClick = { selectedFilter = "High Risk" },
                    label = { Text("High Risk") }
                )
                FilterChip(
                    selected = selectedFilter == "Medium Risk",
                    onClick = { selectedFilter = "Medium Risk" },
                    label = { Text("Medium Risk") }
                )
                FilterChip(
                    selected = selectedFilter == "Low Risk",
                    onClick = { selectedFilter = "Low Risk" },
                    label = { Text("Low Risk") }
                )
            }
            
            // Call list
            when {
                isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                filteredCalls.isEmpty() -> {
                    EnhancedEmptyCallHistoryState()
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(filteredCalls, key = { it.call.id }) { record ->
                            Box(modifier = Modifier.animateItemPlacement()) {
                                EnhancedCallHistoryCard(
                                    record = record,
                                    onClick = {
                                        selectedCallId = record.call.id
                                        showRiskDetail = true
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Risk detail modal
    if (showRiskDetail && selectedCallId != null) {
        val selectedRecord = filteredCalls.find { it.call.id == selectedCallId }
        if (selectedRecord != null) {
            RiskDetailModal(
                record = selectedRecord,
                onDismiss = { 
                    showRiskDetail = false
                    selectedCallId = null
                }
            )
        }
    }
}

/**
 * Enhanced Call History Card
 * 
 * Displays a call record with:
 * - Phone number and caller name
 * - Timestamp and duration
 * - Risk badge with percentage
 * - Primary threat indicator
 * - Trigger count
 * - Blocked status badge
 * 
 * Tappable to show detailed risk breakdown modal.
 * 
 * Requirements: 8.2
 */
@Composable
fun EnhancedCallHistoryCard(
    record: CallRecordWithRisk,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Header row with caller info and risk badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = record.getCallerDisplayName(),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = record.getFormattedPhoneNumber(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                
                // Risk badge
                if (record.risk != null) {
                    Surface(
                        shape = CircleShape,
                        color = when (record.getRiskLevel()) {
                            "HIGH" -> VibrantRed
                            "MEDIUM" -> VibrantYellow
                            else -> VibrantGreen
                        }
                    ) {
                        Text(
                            text = "${record.getRiskPercentage()}%",
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                }
            }
            
            // Timestamp and duration row
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.AccessTime,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = record.getRelativeTimestamp(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Timer,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = record.getFormattedDuration(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            
            // Primary threat and trigger count
            if (record.risk != null) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Primary threat badge
                    if (record.risk.primaryThreat.isNotEmpty()) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = when (record.getRiskLevel()) {
                                "HIGH" -> VibrantRed.copy(alpha = 0.1f)
                                "MEDIUM" -> VibrantYellow.copy(alpha = 0.1f)
                                else -> VibrantGreen.copy(alpha = 0.1f)
                            }
                        ) {
                            Text(
                                text = record.risk.primaryThreat,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = when (record.getRiskLevel()) {
                                    "HIGH" -> VibrantRed
                                    "MEDIUM" -> VibrantYellow
                                    else -> VibrantGreen
                                }
                            )
                        }
                    }
                    
                    // Trigger count
                    if (record.getTriggerCount() > 0) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = "${record.getTriggerCount()} triggers",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
            
            // Blocked badge
            if (record.call.wasBlocked) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = VibrantRed.copy(alpha = 0.2f)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Block,
                            contentDescription = null,
                            tint = VibrantRed,
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = "Call was blocked",
                            style = MaterialTheme.typography.labelSmall,
                            color = VibrantRed,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

/**
 * Empty state for enhanced call history
 */
@Composable
fun EnhancedEmptyCallHistoryState() {
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

// RiskDetailModal is now imported from components package
