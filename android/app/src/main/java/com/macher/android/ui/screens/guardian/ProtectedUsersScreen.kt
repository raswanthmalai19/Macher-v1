package com.macher.android.ui.screens.guardian

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
import androidx.compose.material.icons.automirrored.filled.Message

import android.content.Intent
import android.net.Uri
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.macher.android.data.database.GuardianProtectedLinkEntity
import com.macher.android.data.database.MacherDatabase
import com.macher.android.data.repository.GuardianRepository
import com.macher.android.data.preferences.UserPreferences
import com.macher.android.data.model.UserRole
import com.macher.android.ui.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun ProtectedUsersScreen(
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val db = remember { MacherDatabase.getDatabase(context) }
    val guardianRepo = remember { GuardianRepository(db.guardianProtectedLinkDao(), db.userDao()) }
    val userPrefs = remember { UserPreferences(context) }

    // Use the stored userId for the guardian — falls back to a stable default
    val rawGuardianId by userPrefs.userId.collectAsState(initial = null)
    val guardianId = rawGuardianId ?: "default_guardian"
    val guardianDisplayName by userPrefs.userNameForRole(UserRole.GUARDIAN).collectAsState(initial = "")

    val links by remember(guardianId) {
        guardianRepo.getProtectedUsers(guardianId)
    }.collectAsState(initial = emptyList())

    // Map DB entities to UI model
    val protectedUsers = remember(links) {
        links.map { link ->
            ProtectedUser(
                id = link.id,
                name = link.protectedName.ifEmpty { "Pending" },
                phoneNumber = link.protectedPhone.ifEmpty { link.linkCode },
                relationship = link.relationship,
                isActive = link.isActive
            )
        }
    }

    var showAddDialog by remember { mutableStateOf(false) }
    var showEditDialog by remember { mutableStateOf<ProtectedUser?>(null) }
    var showDetailsDialog by remember { mutableStateOf<ProtectedUser?>(null) }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Protected Users") },
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
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = MacherElectricCyan,
                contentColor = MaterialTheme.colorScheme.background
            ) {
                Icon(Icons.Default.Add, "Add User")
            }
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(padding)
        ) {
            if (protectedUsers.isEmpty()) {
                EmptyProtectedUsersState(
                    onAddClick = { showAddDialog = true }
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(protectedUsers) { user ->
                        Box(modifier = Modifier.animateItemPlacement()) {
                            ProtectedUserCard(
                                user = user,
                                onViewDetails = { showDetailsDialog = user },
                                onEdit = { showEditDialog = user },
                                onCall = {
                                    try {
                                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${user.phoneNumber}"))
                                        context.startActivity(intent)
                                    } catch (_: Exception) {
                                        android.widget.Toast.makeText(context, "Unable to open dialer", android.widget.Toast.LENGTH_SHORT).show()
                                    }
                                },
                                onMessage = {
                                    try {
                                        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("sms:${user.phoneNumber}"))
                                        context.startActivity(intent)
                                    } catch (_: Exception) {
                                        android.widget.Toast.makeText(context, "Unable to open messaging", android.widget.Toast.LENGTH_SHORT).show()
                                    }
                                },
                                onRemove = {
                                    scope.launch {
                                        try { guardianRepo.removeLink(user.id) } catch (_: Exception) { }
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
    
    if (showAddDialog) {
        AddProtectedUserDialog(
            onDismiss = { showAddDialog = false },
            onAdd = { user ->
                scope.launch {
                    try {
                        val link = guardianRepo.createLinkAsGuardian(
                            guardianId = guardianId,
                            guardianName = guardianDisplayName?.ifEmpty { "Guardian" } ?: "Guardian",
                            guardianPhone = ""
                        )
                        guardianRepo.completeLinkAsProtected(
                            linkCode = link.linkCode,
                            protectedId = user.id,
                            protectedName = user.name,
                            protectedPhone = user.phoneNumber,
                            relationship = user.relationship
                        )
                    } catch (_: Exception) { }
                }
                showAddDialog = false
            }
        )
    }

    showEditDialog?.let { user ->
        EditProtectedUserDialog(
            user = user,
            onDismiss = { showEditDialog = null },
            onSave = { updated ->
                scope.launch {
                    try {
                        val link = db.guardianProtectedLinkDao().getLinkById(updated.id)
                        if (link != null) {
                            db.guardianProtectedLinkDao().updateLink(
                                link.copy(
                                    protectedName = updated.name,
                                    protectedPhone = updated.phoneNumber,
                                    relationship = updated.relationship
                                )
                            )
                        }
                    } catch (_: Exception) { }
                }
                showEditDialog = null
            }
        )
    }

    showDetailsDialog?.let { user ->
        UserDetailsDialog(
            user = user,
            onDismiss = { showDetailsDialog = null }
        )
    }
}

@Composable
fun EmptyProtectedUsersState(onAddClick: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.PersonAdd,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text(
            text = "No Protected Users",
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Bold
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "Add family members you want to protect",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = onAddClick,
            colors = ButtonDefaults.buttonColors(
                containerColor = VibrantPink
            )
        ) {
            Icon(Icons.Default.Add, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Add Protected User")
        }
    }
}

@Composable
fun ProtectedUserCard(
    user: ProtectedUser,
    onViewDetails: () -> Unit,
    onEdit: () -> Unit = {},
    onCall: () -> Unit = {},
    onMessage: () -> Unit = {},
    onRemove: () -> Unit
) {
    var showMenu by remember { mutableStateOf(false) }
    
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
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Avatar
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(
                            Brush.linearGradient(
                                colors = listOf(MacherViolet, MacherElectricCyan)
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (user.name.isNotEmpty()) user.name.first().uppercase() else "?",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold
                    )
                }
                
                Spacer(modifier = Modifier.width(16.dp))
                
                // User info
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = user.name,
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold
                    )
                    
                    Text(
                        text = user.phoneNumber,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                    
                    Spacer(modifier = Modifier.height(4.dp))
                    
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = if (user.isActive) Icons.Default.CheckCircle else Icons.Default.Cancel,
                            contentDescription = null,
                            tint = if (user.isActive) VibrantGreen else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                            modifier = Modifier.size(16.dp)
                        )
                        
                        Spacer(modifier = Modifier.width(4.dp))
                        
                        Text(
                            text = if (user.isActive) "Active" else "Inactive",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (user.isActive) VibrantGreen else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                        )
                    }
                }
                
                // Menu button
                Box {
                    IconButton(onClick = { showMenu = true }) {
                        Icon(
                            imageVector = Icons.Default.MoreVert,
                            contentDescription = "More",
                            tint = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    
                    DropdownMenu(
                        expanded = showMenu,
                        onDismissRequest = { showMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("View Details") },
                            onClick = {
                                showMenu = false
                                onViewDetails()
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Visibility, contentDescription = null)
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Edit") },
                            onClick = {
                                showMenu = false
                                onEdit()
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Edit, contentDescription = null)
                            }
                        )
                        Divider()
                        DropdownMenuItem(
                            text = { Text("Remove", color = VibrantRed) },
                            onClick = {
                                showMenu = false
                                onRemove()
                            },
                            leadingIcon = {
                                Icon(Icons.Default.Delete, contentDescription = null, tint = VibrantRed)
                            }
                        )
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Stats
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                StatItem(
                    label = "Calls",
                    value = user.totalCalls.toString(),
                    icon = Icons.Default.Phone
                )
                
                StatItem(
                    label = "Threats",
                    value = user.threatsDetected.toString(),
                    icon = Icons.Default.Warning,
                    color = VibrantRed
                )
                
                StatItem(
                    label = "Blocked",
                    value = user.callsBlocked.toString(),
                    icon = Icons.Default.Block,
                    color = VibrantYellow
                )
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Quick actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onCall,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.onSurface
                    )
                ) {
                    Icon(Icons.Default.Call, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Call")
                }
                
                OutlinedButton(
                    onClick = onMessage,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.onSurface
                    )
                ) {
                    Icon(Icons.AutoMirrored.Filled.Message, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Message")
                }
            }
        }
    }
}

@Composable
fun StatItem(
    label: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    color: androidx.compose.ui.graphics.Color = White
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(24.dp)
        )
        
        Spacer(modifier = Modifier.height(4.dp))
        
        Text(
            text = value,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Bold
        )
        
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddProtectedUserDialog(
    onDismiss: () -> Unit,
    onAdd: (ProtectedUser) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var phoneNumber by remember { mutableStateOf("") }
    var relationship by remember { mutableStateOf("") }
    var addMethod by remember { mutableStateOf("manual") } // manual or qr
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Protected User") },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Method selection
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FilterChip(
                        selected = addMethod == "manual",
                        onClick = { addMethod = "manual" },
                        label = { Text("Manual") },
                        leadingIcon = {
                            Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(18.dp))
                        }
                    )
                    
                    FilterChip(
                        selected = addMethod == "qr",
                        onClick = { addMethod = "qr" },
                        label = { Text("QR Code") },
                        leadingIcon = {
                            Icon(Icons.Default.QrCode, contentDescription = null, modifier = Modifier.size(18.dp))
                        }
                    )
                }
                
                if (addMethod == "manual") {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    OutlinedTextField(
                        value = phoneNumber,
                        onValueChange = { phoneNumber = it },
                        label = { Text("Phone Number") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    OutlinedTextField(
                        value = relationship,
                        onValueChange = { relationship = it },
                        label = { Text("Relationship (optional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                } else {
                    // QR Code scanner placeholder
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                imageVector = Icons.Default.QrCodeScanner,
                                contentDescription = null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Scan QR Code",
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (name.isNotEmpty() && phoneNumber.isNotEmpty()) {
                        onAdd(
                            ProtectedUser(
                                id = System.currentTimeMillis().toString(),
                                name = name,
                                phoneNumber = phoneNumber,
                                relationship = relationship,
                                isActive = true,
                                totalCalls = 0,
                                threatsDetected = 0,
                                callsBlocked = 0
                            )
                        )
                    }
                },
                enabled = name.isNotEmpty() && phoneNumber.isNotEmpty()
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

data class ProtectedUser(
    val id: String,
    val name: String,
    val phoneNumber: String,
    val relationship: String = "",
    val isActive: Boolean = true,
    val totalCalls: Int = 0,
    val threatsDetected: Int = 0,
    val callsBlocked: Int = 0
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditProtectedUserDialog(
    user: ProtectedUser,
    onDismiss: () -> Unit,
    onSave: (ProtectedUser) -> Unit
) {
    var name by remember { mutableStateOf(user.name) }
    var phoneNumber by remember { mutableStateOf(user.phoneNumber) }
    var relationship by remember { mutableStateOf(user.relationship) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Protected User") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = phoneNumber,
                    onValueChange = { phoneNumber = it },
                    label = { Text("Phone Number") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = relationship,
                    onValueChange = { relationship = it },
                    label = { Text("Relationship (optional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSave(user.copy(name = name, phoneNumber = phoneNumber, relationship = relationship))
                },
                enabled = name.isNotEmpty() && phoneNumber.isNotEmpty()
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun UserDetailsDialog(
    user: ProtectedUser,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(user.name) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                DetailRow("Phone", user.phoneNumber)
                DetailRow("Relationship", user.relationship.ifEmpty { "Not specified" })
                DetailRow("Status", if (user.isActive) "Active" else "Inactive")
                DetailRow("Total Calls", user.totalCalls.toString())
                DetailRow("Threats Detected", user.threatsDetected.toString())
                DetailRow("Calls Blocked", user.callsBlocked.toString())
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}

@Composable
private fun DetailRow(label: String, value: String) {
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
            fontWeight = FontWeight.SemiBold
        )
    }
}
