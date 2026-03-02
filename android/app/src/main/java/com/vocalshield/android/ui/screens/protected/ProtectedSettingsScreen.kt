package com.vocalshield.android.ui.screens.protected

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Help
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.vocalshield.android.data.preferences.AppPreferences
import com.vocalshield.android.ui.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProtectedSettingsScreen(
    appPreferences: AppPreferences,
    onNavigateBack: () -> Unit
) {
    val scope = rememberCoroutineScope()

    // Persist settings via DataStore
    val enableMonitoring by appPreferences.enableMonitoring.collectAsState(initial = true)
    val enableHaptic by appPreferences.enableHaptic.collectAsState(initial = true)
    val enableOverlay by appPreferences.enableOverlay.collectAsState(initial = true)
    val enableNotifications by appPreferences.enableNotifications.collectAsState(initial = true)
    val enableTranscription by appPreferences.enableTranscription.collectAsState(initial = true)
    val autoStartMonitoring by appPreferences.autoStartMonitoring.collectAsState(initial = false)

    var showClearHistoryDialog by remember { mutableStateOf(false) }
    var showResetDialog by remember { mutableStateOf(false) }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
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
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Protection Settings
                SettingsSection(
                    title = "Protection",
                    icon = Icons.Default.Shield
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SettingsToggle(
                            title = "Enable Monitoring",
                            description = "Automatically monitor incoming calls",
                            checked = enableMonitoring,
                            onCheckedChange = { scope.launch { appPreferences.setEnableMonitoring(it) } }
                        )
                        
                        SettingsToggle(
                            title = "Auto-Start Monitoring",
                            description = "Start monitoring when call begins",
                            checked = autoStartMonitoring,
                            onCheckedChange = { scope.launch { appPreferences.setAutoStartMonitoring(it) } }
                        )
                    }
                }
                
                // Alert Settings
                SettingsSection(
                    title = "Alerts",
                    icon = Icons.Default.Notifications
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SettingsToggle(
                            title = "Haptic Feedback",
                            description = "Vibrate when threat detected",
                            checked = enableHaptic,
                            onCheckedChange = { scope.launch { appPreferences.setEnableHaptic(it) } }
                        )
                        
                        SettingsToggle(
                            title = "Screen Overlay",
                            description = "Show warning overlay on screen",
                            checked = enableOverlay,
                            onCheckedChange = { scope.launch { appPreferences.setEnableOverlay(it) } }
                        )
                        
                        SettingsToggle(
                            title = "Notifications",
                            description = "Show notification alerts",
                            checked = enableNotifications,
                            onCheckedChange = { scope.launch { appPreferences.setEnableNotifications(it) } }
                        )
                    }
                }
                
                // Display Settings
                SettingsSection(
                    title = "Display",
                    icon = Icons.Default.Visibility
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SettingsToggle(
                            title = "Show Transcription",
                            description = "Display live call transcription",
                            checked = enableTranscription,
                            onCheckedChange = { scope.launch { appPreferences.setEnableTranscription(it) } }
                        )
                    }
                }
                
                // Guardian Settings
                SettingsSection(
                    title = "Guardian",
                    icon = Icons.Default.People
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SettingsButton(
                            title = "Link Guardian",
                            description = "Connect with family member",
                            icon = Icons.Default.QrCode,
                            onClick = { /* TODO: Show QR code */ }
                        )
                        
                        SettingsButton(
                            title = "Emergency Contacts",
                            description = "Manage emergency contacts",
                            icon = Icons.Default.ContactPhone,
                            onClick = { /* TODO: Navigate to contacts */ }
                        )
                    }
                }
                
                // Privacy Settings
                SettingsSection(
                    title = "Privacy",
                    icon = Icons.Default.Lock
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        InfoRow("Audio Storage", "Never stored")
                        InfoRow("Data Retention", "RAM only")
                        InfoRow("PII Protection", "Enabled")
                        
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        SettingsButton(
                            title = "Privacy Policy",
                            description = "View our privacy policy",
                            icon = Icons.Default.Description,
                            onClick = { /* TODO: Show privacy policy */ }
                        )
                    }
                }
                
                // About Section
                SettingsSection(
                    title = "About",
                    icon = Icons.Default.Info
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        InfoRow("Version", "1.0.0")
                        InfoRow("Build", "2026.03.01")
                        InfoRow("Mode", "Protected User")
                        
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        SettingsButton(
                            title = "Help & Support",
                            description = "Get help using MACHER",
                            icon = Icons.AutoMirrored.Filled.Help,
                            onClick = { /* TODO: Show help */ }
                        )
                        
                        SettingsButton(
                            title = "Send Feedback",
                            description = "Help us improve",
                            icon = Icons.Default.Feedback,
                            onClick = { /* TODO: Show feedback form */ }
                        )
                    }
                }
                
                // Danger Zone
                SettingsSection(
                    title = "Danger Zone",
                    icon = Icons.Default.Warning
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SettingsButton(
                            title = "Clear Call History",
                            description = "Delete all call records",
                            icon = Icons.Default.Delete,
                            onClick = { showClearHistoryDialog = true },
                            dangerous = true
                        )
                        
                        SettingsButton(
                            title = "Reset Settings",
                            description = "Restore default settings",
                            icon = Icons.Default.RestartAlt,
                            onClick = { showResetDialog = true },
                            dangerous = true
                        )
                    }
                }
                
                // Danger Zone Dialogs
                if (showClearHistoryDialog) {
                    AlertDialog(
                        onDismissRequest = { showClearHistoryDialog = false },
                        title = { Text("Clear Call History?") },
                        text = { Text("This will permanently delete all call records. This action cannot be undone.") },
                        confirmButton = {
                            Button(
                                onClick = { showClearHistoryDialog = false },
                                colors = ButtonDefaults.buttonColors(containerColor = DangerRed)
                            ) {
                                Text("Delete All")
                            }
                        },
                        dismissButton = {
                            OutlinedButton(onClick = { showClearHistoryDialog = false }) {
                                Text("Cancel")
                            }
                        },
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                        textContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                
                if (showResetDialog) {
                    AlertDialog(
                        onDismissRequest = { showResetDialog = false },
                        title = { Text("Reset All Settings?") },
                        text = { Text("All your preferences will be reset to factory defaults. Your call history and contacts will not be affected.") },
                        confirmButton = {
                            Button(
                                onClick = {
                                    scope.launch { appPreferences.resetToDefaults() }
                                    showResetDialog = false
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = DangerRed)
                            ) {
                                Text("Reset")
                            }
                        },
                        dismissButton = {
                            OutlinedButton(onClick = { showResetDialog = false }) {
                                Text("Cancel")
                            }
                        },
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                        textContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
fun SettingsSection(
    title: String,
    icon: ImageVector,
    content: @Composable () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, GlassBorder, RoundedCornerShape(16.dp)),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(MacherElectricCyan.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(24.dp)
                    )
                }
                
                Spacer(modifier = Modifier.width(12.dp))
                
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Bold
                )
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            content()
        }
    }
}

@Composable
fun SettingsToggle(
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Medium
            )
            
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
            )
        }
        
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = MacherElectricCyan,
                checkedTrackColor = MacherElectricCyan.copy(alpha = 0.4f),
                uncheckedThumbColor = MaterialTheme.colorScheme.onSurfaceVariant,
                uncheckedTrackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.15f)
            )
        )
    }
}

@Composable
fun SettingsButton(
    title: String,
    description: String,
    icon: ImageVector,
    onClick: () -> Unit,
    dangerous: Boolean = false
) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (dangerous) VibrantRed.copy(alpha = 0.2f) else MaterialTheme.colorScheme.surfaceVariant
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = if (dangerous) VibrantRed else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(24.dp)
                )
                
                Spacer(modifier = Modifier.width(12.dp))
                
                Column {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (dangerous) VibrantRed else MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Medium
                    )
                    
                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                    )
                }
            }
            
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
            )
        }
    }
}

@Composable
fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
        )
        
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Medium
        )
    }
}
