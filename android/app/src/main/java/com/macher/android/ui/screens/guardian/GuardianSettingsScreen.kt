package com.macher.android.ui.screens.guardian

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack

import androidx.compose.material3.*
import com.macher.android.data.preferences.AppPreferences
import kotlinx.coroutines.launch
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.macher.android.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GuardianSettingsScreen(
    onNavigateBack: () -> Unit,
    appPreferences: AppPreferences
) {
    val scope = rememberCoroutineScope()
    val savedSensitivity by appPreferences.aiSensitivity.collectAsState(initial = 1f)
    var sensitivity by remember(savedSensitivity) { mutableStateOf(savedSensitivity) }
    val enableHaptic by appPreferences.enableHaptic.collectAsState(initial = true)
    val enableOverlay by appPreferences.enableOverlay.collectAsState(initial = true)
    val enableAutoDisconnect by appPreferences.autoDisconnect.collectAsState(initial = false)
    val enableAlerts by appPreferences.alertGuardian.collectAsState(initial = true)
    var showAutoDisconnectConfirm by remember { mutableStateOf(false) }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Guardian Settings") },
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
                // Sensitivity Section
                SettingsSection(
                    title = "AI Sensitivity",
                    icon = Icons.Default.Tune
                ) {
                    Column {
                        Text(
                            text = when (sensitivity.toInt()) {
                                0 -> "Low - Fewer alerts, may miss some threats"
                                1 -> "Medium - Balanced detection"
                                else -> "High - Maximum protection, more alerts"
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f)
                        )
                        
                        Spacer(modifier = Modifier.height(12.dp))
                        
                        Slider(
                            value = sensitivity,
                            onValueChange = { sensitivity = it },
                            onValueChangeFinished = { scope.launch { appPreferences.setAiSensitivity(sensitivity) } },
                            valueRange = 0f..2f,
                            steps = 1,
                            colors = SliderDefaults.colors(
                                thumbColor = VibrantPink,
                                activeTrackColor = VibrantPink,
                                inactiveTrackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f)
                            )
                        )
                        
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Low", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                            Text("Medium", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                            Text("High", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                        }
                    }
                }
                
                // Intervention Controls
                SettingsSection(
                    title = "Intervention Controls",
                    icon = Icons.Default.Shield
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SettingsToggle(
                            title = "Haptic Feedback",
                            description = "Vibrate phone when threat detected",
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
                            title = "Autonomous Disconnect",
                            description = "Automatically hang up on high threats",
                            checked = enableAutoDisconnect,
                            onCheckedChange = { newValue ->
                                if (newValue) {
                                    showAutoDisconnectConfirm = true
                                } else {
                                    scope.launch { appPreferences.setAutoDisconnect(false) }
                                }
                            },
                            dangerous = true
                        )
                        
                        if (showAutoDisconnectConfirm) {
                            AlertDialog(
                                onDismissRequest = { showAutoDisconnectConfirm = false },
                                title = { Text("Enable Autonomous Disconnect?") },
                                text = {
                                    Text(
                                        "MACHER will automatically hang up calls detected as high-threat scams. " +
                                        "This may occasionally disconnect legitimate calls. Continue?"
                                    )
                                },
                                confirmButton = {
                                    Button(
                                        onClick = {
                                            scope.launch { appPreferences.setAutoDisconnect(true) }
                                            showAutoDisconnectConfirm = false
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = DangerRed)
                                    ) {
                                        Text("Enable")
                                    }
                                },
                                dismissButton = {
                                    OutlinedButton(onClick = { showAutoDisconnectConfirm = false }) {
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
                
                // Notification Settings
                SettingsSection(
                    title = "Notifications",
                    icon = Icons.Default.Notifications
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SettingsToggle(
                            title = "Send Me Alerts",
                            description = "Notify me when threats are detected",
                            checked = enableAlerts,
                            onCheckedChange = { scope.launch { appPreferences.setAlertGuardian(it) } }
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
                        InfoRow("Protected Users", "1")
                        InfoRow("Total Alerts", "3")
                    }
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
                        .background(MacherViolet.copy(alpha = 0.2f)),
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
    onCheckedChange: (Boolean) -> Unit,
    dangerous: Boolean = false
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
                color = if (dangerous) VibrantRed else MaterialTheme.colorScheme.onSurface,
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
                checkedThumbColor = if (dangerous) DangerRed else MacherElectricCyan,
                checkedTrackColor = if (dangerous) DangerRed.copy(alpha = 0.3f) else MacherElectricCyan.copy(alpha = 0.3f),
                uncheckedThumbColor = MaterialTheme.colorScheme.onSurfaceVariant,
                uncheckedTrackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.15f)
            )
        )
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
