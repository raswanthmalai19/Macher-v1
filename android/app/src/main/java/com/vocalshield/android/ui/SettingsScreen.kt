package com.vocalshield.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.vocalshield.android.data.Contact

/**
 * Settings screen for VocalShield.
 * Allows users to configure monitoring, haptic feedback, announcements, and Family Loop.
 * 
 * Design Principles:
 * - Simplicity: Clear toggles with large touch targets
 * - Accessibility: High contrast, descriptive labels
 * - Calm: Non-threatening language and colors
 * 
 * Requirements: 4.5, 6.4, 8.4, 9.5, 10.1, 10.2
 */
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    var showAddContactDialog by remember { mutableStateOf(false) }
    var showConsentDialog by remember { mutableStateOf(!uiState.hasUserConsent) }
    
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        "Settings",
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
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Consent Dialog
            if (showConsentDialog) {
                item {
                    ConsentCard(
                        onGrantConsent = {
                            viewModel.grantConsent()
                            showConsentDialog = false
                        }
                    )
                }
            }
            
            // Monitoring Section
            item {
                SectionHeader(text = "Monitoring")
            }
            
            item {
                SettingToggle(
                    title = "Enable Monitoring",
                    description = "Allow VocalShield to monitor your phone calls for fraud",
                    checked = uiState.monitoringEnabled,
                    onCheckedChange = { viewModel.toggleMonitoring(it) },
                    icon = Icons.Default.Shield
                )
            }
            
            // Feedback Section
            item {
                SectionHeader(text = "Alerts & Feedback")
            }
            
            item {
                SettingToggle(
                    title = "Haptic Feedback",
                    description = "Vibrate when threats are detected",
                    checked = uiState.hapticEnabled,
                    onCheckedChange = { viewModel.toggleHaptic(it) },
                    icon = Icons.Default.Vibration
                )
            }
            
            item {
                SettingToggle(
                    title = "Call Announcement",
                    description = "Play announcement that call is being monitored",
                    checked = uiState.announcementEnabled,
                    onCheckedChange = { viewModel.toggleAnnouncement(it) },
                    icon = Icons.Default.RecordVoiceOver
                )
            }
            
            // Family Loop Section
            item {
                SectionHeader(text = "Family Loop")
            }
            
            item {
                Text(
                    text = "Add trusted contacts who will receive alerts when fraud is detected on your calls (max 5).",
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            // Family Loop Contacts
            items(uiState.familyLoopContacts) { contact ->
                ContactCard(
                    contact = contact,
                    onRemove = { viewModel.removeFamilyLoopContact(contact.id) }
                )
            }
            
            // Add Contact Button
            item {
                Button(
                    onClick = { showAddContactDialog = true },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = uiState.canAddMoreContacts
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (uiState.canAddMoreContacts) 
                            "Add Family Loop Contact" 
                        else 
                            "Maximum Contacts Reached",
                        fontSize = 16.sp
                    )
                }
            }
            
            // Error Message
            uiState.errorMessage?.let { error ->
                item {
                    ErrorMessage(
                        message = error,
                        onDismiss = { viewModel.clearError() }
                    )
                }
            }
            
            // Success Message
            uiState.successMessage?.let { success ->
                item {
                    SuccessMessage(
                        message = success,
                        onDismiss = { viewModel.clearSuccess() }
                    )
                }
            }
        }
    }
    
    // Add Contact Dialog
    if (showAddContactDialog) {
        AddContactDialog(
            onDismiss = { showAddContactDialog = false },
            onAdd = { name, phone, email ->
                viewModel.addFamilyLoopContact(name, phone, email)
                showAddContactDialog = false
            }
        )
    }
}

/**
 * Section header for settings groups.
 */
@Composable
fun SectionHeader(text: String) {
    Text(
        text = text,
        fontSize = 18.sp,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 8.dp)
    )
}

/**
 * Setting toggle with icon and description.
 */
@Composable
fun SettingToggle(
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(32.dp)
            )
            
            Spacer(modifier = Modifier.width(16.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = description,
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange
            )
        }
    }
}

/**
 * Contact card with remove button.
 */
@Composable
fun ContactCard(
    contact: Contact,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Person,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(32.dp)
            )
            
            Spacer(modifier = Modifier.width(16.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = contact.name,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = contact.phoneNumber,
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                contact.email?.let { email ->
                    Text(
                        text = email,
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            
            IconButton(onClick = onRemove) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = "Remove contact",
                    tint = Color(0xFFF44336)
                )
            }
        }
    }
}

/**
 * Consent card for first-time users.
 */
@Composable
fun ConsentCard(
    onGrantConsent: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Text(
                text = "Welcome to VocalShield",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "VocalShield monitors your phone calls to detect fraud and scams in real-time. " +
                      "We never store your call audio and all processing is done securely.",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Button(
                onClick = onGrantConsent,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("I Understand and Consent", fontSize = 16.sp)
            }
        }
    }
}

/**
 * Add contact dialog.
 */
@Composable
fun AddContactDialog(
    onDismiss: () -> Unit,
    onAdd: (name: String, phoneNumber: String, email: String?) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var phoneNumber by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Family Loop Contact") },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                
                OutlinedTextField(
                    value = phoneNumber,
                    onValueChange = { phoneNumber = it },
                    label = { Text("Phone Number *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email (optional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onAdd(name, phoneNumber, email.takeIf { it.isNotBlank() })
                }
            ) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

/**
 * Success message display.
 */
@Composable
fun SuccessMessage(
    message: String,
    onDismiss: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFF4CAF50).copy(alpha = 0.1f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.CheckCircle,
                contentDescription = "Success",
                tint = Color(0xFF4CAF50)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = message,
                fontSize = 16.sp,
                color = Color(0xFF4CAF50),
                modifier = Modifier.weight(1f)
            )
            TextButton(onClick = onDismiss) {
                Text("Dismiss")
            }
        }
    }
}
