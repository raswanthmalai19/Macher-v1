package com.macher.android.ui.screens.protected

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import com.macher.android.BuildConfig
import androidx.compose.material.icons.automirrored.filled.Help
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.macher.android.data.database.MacherDatabase
import com.macher.android.data.preferences.AppPreferences
import com.macher.android.data.repository.GuardianRepository
import com.macher.android.ui.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProtectedSettingsScreen(
    appPreferences: AppPreferences,
    onNavigateBack: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    // Persist settings via DataStore
    val enableMonitoring by appPreferences.enableMonitoring.collectAsState(initial = true)
    val enableHaptic by appPreferences.enableHaptic.collectAsState(initial = true)
    val enableOverlay by appPreferences.enableOverlay.collectAsState(initial = true)
    val enableNotifications by appPreferences.enableNotifications.collectAsState(initial = true)
    val enableTranscription by appPreferences.enableTranscription.collectAsState(initial = true)
    val autoStartMonitoring by appPreferences.autoStartMonitoring.collectAsState(initial = false)

    var showClearHistoryDialog by remember { mutableStateOf(false) }
    var showResetDialog by remember { mutableStateOf(false) }
    var showQrDialog by remember { mutableStateOf(false) }
    var showHelpDialog by remember { mutableStateOf(false) }
    var showFeedbackDialog by remember { mutableStateOf(false) }
    
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
                            onCheckedChange = { scope.launch { try { appPreferences.setEnableMonitoring(it) } catch (_: Exception) {} } }
                        )
                        
                        SettingsToggle(
                            title = "Auto-Start Monitoring",
                            description = "Start monitoring when call begins",
                            checked = autoStartMonitoring,
                            onCheckedChange = { scope.launch { try { appPreferences.setAutoStartMonitoring(it) } catch (_: Exception) {} } }
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
                            onCheckedChange = { scope.launch { try { appPreferences.setEnableHaptic(it) } catch (_: Exception) {} } }
                        )
                        
                        SettingsToggle(
                            title = "Screen Overlay",
                            description = "Show warning overlay on screen",
                            checked = enableOverlay,
                            onCheckedChange = { scope.launch { try { appPreferences.setEnableOverlay(it) } catch (_: Exception) {} } }
                        )
                        
                        SettingsToggle(
                            title = "Notifications",
                            description = "Show notification alerts",
                            checked = enableNotifications,
                            onCheckedChange = { scope.launch { try { appPreferences.setEnableNotifications(it) } catch (_: Exception) {} } }
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
                            onCheckedChange = { scope.launch { try { appPreferences.setEnableTranscription(it) } catch (_: Exception) {} } }
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
                            onClick = { showQrDialog = true }
                        )
                        
                        SettingsButton(
                            title = "Emergency Contacts",
                            description = "Manage emergency contacts",
                            icon = Icons.Default.ContactPhone,
                            onClick = {
                                try {
                                    val intent = Intent(Intent.ACTION_VIEW).apply {
                                        data = android.provider.ContactsContract.Contacts.CONTENT_URI
                                    }
                                    context.startActivity(intent)
                                } catch (_: Exception) {
                                    android.widget.Toast.makeText(context, "Unable to open contacts", android.widget.Toast.LENGTH_SHORT).show()
                                }
                            }
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
                            onClick = {
                                try {
                                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://macher.app/privacy"))
                                    context.startActivity(intent)
                                } catch (_: Exception) {
                                    android.widget.Toast.makeText(context, "No browser available", android.widget.Toast.LENGTH_SHORT).show()
                                }
                            }
                        )
                    }
                }
                
                // About Section
                SettingsSection(
                    title = "About",
                    icon = Icons.Default.Info
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        InfoRow("Version", BuildConfig.VERSION_NAME)
                        InfoRow("Build", BuildConfig.VERSION_CODE.toString())
                        InfoRow("Mode", "Protected User")
                        
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        SettingsButton(
                            title = "Help & Support",
                            description = "Get help using MACHER",
                            icon = Icons.AutoMirrored.Filled.Help,
                            onClick = { showHelpDialog = true }
                        )
                        
                        SettingsButton(
                            title = "Send Feedback",
                            description = "Help us improve",
                            icon = Icons.Default.Feedback,
                            onClick = { showFeedbackDialog = true }
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
                                onClick = {
                                    scope.launch {
                                        try {
                                            val db = MacherDatabase.getDatabase(context)
                                            db.callHistoryDao().deleteAllCalls()
                                        } catch (_: Exception) { }
                                    }
                                    showClearHistoryDialog = false
                                },
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
                                    scope.launch { try { appPreferences.resetToDefaults() } catch (_: Exception) {} }
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

                // QR Code dialog
                if (showQrDialog) {
                    var linkCode by remember { mutableStateOf("") }
                    var qrBitmap by remember { mutableStateOf<Bitmap?>(null) }
                    var errorMsg by remember { mutableStateOf<String?>(null) }

                    LaunchedEffect(Unit) {
                        try {
                            val db = MacherDatabase.getDatabase(context)
                            val repo = GuardianRepository(db.guardianProtectedLinkDao(), db.userDao())
                            val code = repo.generateLinkCode()
                            linkCode = code
                            qrBitmap = generateQrBitmap("macher://link?code=$code", 512)
                        } catch (e: Exception) {
                            linkCode = (100000..999999).random().toString()
                            errorMsg = "Using offline code"
                            try { qrBitmap = generateQrBitmap("macher://link?code=$linkCode", 512) } catch (_: Exception) {}
                        }
                    }

                    AlertDialog(
                        onDismissRequest = { showQrDialog = false },
                        title = { Text("Link Guardian") },
                        text = {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                qrBitmap?.let { bmp ->
                                    Image(
                                        bitmap = bmp.asImageBitmap(),
                                        contentDescription = "QR Code for linking",
                                        modifier = Modifier
                                            .size(200.dp)
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(androidx.compose.ui.graphics.Color.White)
                                    )
                                } ?: Box(
                                    modifier = Modifier
                                        .size(200.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(MaterialTheme.colorScheme.surfaceVariant),
                                    contentAlignment = Alignment.Center
                                ) {
                                    CircularProgressIndicator(modifier = Modifier.size(48.dp))
                                }

                                Text(
                                    text = "Code: $linkCode",
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold,
                                    textAlign = TextAlign.Center
                                )

                                Text(
                                    "Share this QR code with your guardian to link accounts.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                                )
                            }
                        },
                        confirmButton = {
                            TextButton(onClick = { showQrDialog = false }) { Text("Done") }
                        },
                        containerColor = MaterialTheme.colorScheme.surface
                    )
                }

                // Help dialog
                if (showHelpDialog) {
                    AlertDialog(
                        onDismissRequest = { showHelpDialog = false },
                        title = { Text("Help & Support") },
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("MACHER protects you from voice fraud in real-time.")
                                Text("• Start monitoring before answering calls")
                                Text("• The app analyzes speech patterns for scam indicators")
                                Text("• You'll receive haptic, visual, and audio alerts")
                                Text("• Link a guardian for extra protection")
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    "Need more help? Email support@macher.app",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                                )
                            }
                        },
                        confirmButton = {
                            TextButton(onClick = { showHelpDialog = false }) { Text("Got it") }
                        },
                        containerColor = MaterialTheme.colorScheme.surface
                    )
                }

                // Feedback dialog
                if (showFeedbackDialog) {
                    var feedback by remember { mutableStateOf("") }
                    AlertDialog(
                        onDismissRequest = { showFeedbackDialog = false },
                        title = { Text("Send Feedback") },
                        text = {
                            OutlinedTextField(
                                value = feedback,
                                onValueChange = { feedback = it },
                                label = { Text("Your feedback") },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 120.dp),
                                maxLines = 6
                            )
                        },
                        confirmButton = {
                            Button(
                                onClick = {
                                    val intent = Intent(Intent.ACTION_SENDTO).apply {
                                        data = Uri.parse("mailto:feedback@macher.app")
                                        putExtra(Intent.EXTRA_SUBJECT, "MACHER Feedback")
                                        putExtra(Intent.EXTRA_TEXT, feedback)
                                    }
                                    try {
                                        context.startActivity(Intent.createChooser(intent, "Send Feedback"))
                                    } catch (_: Exception) {
                                        android.widget.Toast.makeText(context, "No email app available", android.widget.Toast.LENGTH_SHORT).show()
                                    }
                                    showFeedbackDialog = false
                                },
                                enabled = feedback.isNotBlank()
                            ) { Text("Send") }
                        },
                        dismissButton = {
                            TextButton(onClick = { showFeedbackDialog = false }) { Text("Cancel") }
                        },
                        containerColor = MaterialTheme.colorScheme.surface
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

/**
 * Generate a QR code bitmap from a string payload using ZXing.
 */
private fun generateQrBitmap(content: String, size: Int): Bitmap {
    val writer = QRCodeWriter()
    val bitMatrix = writer.encode(content, BarcodeFormat.QR_CODE, size, size)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
    for (x in 0 until size) {
        for (y in 0 until size) {
            bitmap.setPixel(x, y, if (bitMatrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        }
    }
    return bitmap
}
