package com.macher.android.ui.screens.profile

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.macher.android.data.model.UserRole
import com.macher.android.ui.theme.*

/**
 * Profile screen — view/edit identity, switch role, toggle theme
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    userRole: UserRole,
    userName: String,
    userPhone: String,
    isDarkTheme: Boolean,
    onNavigateBack: () -> Unit,
    onThemeToggle: (Boolean) -> Unit,
    onRoleSwitch: (UserRole) -> Unit,
    onSaveProfile: (name: String, phone: String) -> Unit,
    onResetApp: () -> Unit
) {
    var showRoleSwitchDialog by remember { mutableStateOf(false) }
    var showResetDialog by remember { mutableStateOf(false) }
    var editName by remember(userName) { mutableStateOf(userName) }
    var editPhone by remember(userPhone) { mutableStateOf(userPhone) }
    var isEditingProfile by remember { mutableStateOf(false) }

    // Semantic colors that work in both light and dark themes
    val bg = MaterialTheme.colorScheme.background
    val surface = MaterialTheme.colorScheme.surface
    val onSurface = MaterialTheme.colorScheme.onSurface
    val outline = MaterialTheme.colorScheme.outline
    val primary = MaterialTheme.colorScheme.primary

    val roleColor = if (userRole == UserRole.GUARDIAN) MacherViolet else MacherElectricCyan
    val roleLabel = if (userRole == UserRole.GUARDIAN) "Guardian" else "Protected"
    val roleIcon = if (userRole == UserRole.GUARDIAN) "🛡️" else "👤"

    // Confirmation dialog: switch role
    if (showRoleSwitchDialog) {
        val newRole = if (userRole == UserRole.GUARDIAN) UserRole.PROTECTED else UserRole.GUARDIAN
        AlertDialog(
            onDismissRequest = { showRoleSwitchDialog = false },
            icon = { Text(text = "⚠️", fontSize = 32.sp) },
            title = {
                Text(
                    text = "Switch Role?",
                    fontWeight = FontWeight.Bold,
                    color = onSurface
                )
            },
            text = {
                Text(
                    text = "You are switching from $roleLabel to ${if (newRole == UserRole.GUARDIAN) "Guardian" else "Protected"}. " +
                           "The app will restart to apply your new role.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showRoleSwitchDialog = false
                        onRoleSwitch(newRole)
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (newRole == UserRole.GUARDIAN) MacherViolet else MacherElectricCyan
                    )
                ) {
                    Text("Switch to ${if (newRole == UserRole.GUARDIAN) "Guardian" else "Protected"}",
                        color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showRoleSwitchDialog = false }) {
                    Text("Cancel", color = outline)
                }
            },
            containerColor = surface
        )
    }

    // Confirmation dialog: reset app
    if (showResetDialog) {
        AlertDialog(
            onDismissRequest = { showResetDialog = false },
            icon = { Text(text = "🗑️", fontSize = 32.sp) },
            title = {
                Text(
                    text = "Reset Application?",
                    fontWeight = FontWeight.Bold,
                    color = onSurface
                )
            },
            text = {
                Text(
                    text = "This will clear all settings and return to onboarding. This cannot be undone.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showResetDialog = false
                        onResetApp()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = DangerRed)
                ) {
                    Text("Reset", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showResetDialog = false }) {
                    Text("Cancel", color = outline)
                }
            },
            containerColor = surface
        )
    }

    Scaffold(
        containerColor = bg,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Profile",
                        fontWeight = FontWeight.Bold,
                        color = onSurface
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = onSurface
                        )
                    }
                },
                actions = {
                    if (isEditingProfile) {
                        TextButton(onClick = {
                            onSaveProfile(editName, editPhone)
                            isEditingProfile = false
                        }) {
                            Text("Save", color = primary, fontWeight = FontWeight.Bold)
                        }
                    } else {
                        IconButton(onClick = { isEditingProfile = true }) {
                            Icon(Icons.Default.Edit, contentDescription = "Edit", tint = primary)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = surface,
                    titleContentColor = onSurface,
                    navigationIconContentColor = onSurface
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(bg)
                .verticalScroll(rememberScrollState())
                .padding(padding)
                .padding(horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(28.dp))

            // ── Avatar ──
            Box(
                modifier = Modifier
                    .size(96.dp)
                    .background(
                        brush = Brush.radialGradient(
                            colors = listOf(roleColor, roleColor.copy(alpha = 0.5f))
                        ),
                        shape = CircleShape
                    )
                    .border(3.dp, roleColor.copy(alpha = 0.5f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (editName.isNotBlank()) editName.take(1).uppercase() else "?",
                    fontSize = 40.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // ── Role Badge ──
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = roleColor.copy(alpha = 0.15f),
                tonalElevation = 0.dp
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Text(text = roleIcon, fontSize = 14.sp)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = roleLabel.uppercase(),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = roleColor,
                        letterSpacing = 1.5.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // ── Profile Info Card ──
            ProfileCard(
                surface = surface,
                outline = outline
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "IDENTITY",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = primary,
                        letterSpacing = 1.5.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))

                    if (isEditingProfile) {
                        OutlinedTextField(
                            value = editName,
                            onValueChange = { editName = it },
                            label = { Text("Name") },
                            leadingIcon = {
                                Icon(Icons.Default.Person, contentDescription = null, tint = primary)
                            },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = primary,
                                unfocusedBorderColor = outline.copy(alpha = 0.5f),
                                focusedTextColor = onSurface,
                                unfocusedTextColor = onSurface,
                                focusedLabelColor = primary,
                                unfocusedLabelColor = outline
                            )
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedTextField(
                            value = editPhone,
                            onValueChange = { editPhone = it },
                            label = { Text("Phone Number") },
                            leadingIcon = {
                                Icon(Icons.Default.Phone, contentDescription = null, tint = primary)
                            },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = primary,
                                unfocusedBorderColor = outline.copy(alpha = 0.5f),
                                focusedTextColor = onSurface,
                                unfocusedTextColor = onSurface,
                                focusedLabelColor = primary,
                                unfocusedLabelColor = outline
                            )
                        )
                    } else {
                        ProfileInfoRow(
                            icon = Icons.Default.Person,
                            label = "Name",
                            value = editName.ifBlank { "Not set" },
                            iconTint = primary,
                            textColor = onSurface,
                            subtextColor = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Divider(color = outline.copy(alpha = 0.2f), modifier = Modifier.padding(vertical = 10.dp))
                        ProfileInfoRow(
                            icon = Icons.Default.Phone,
                            label = "Phone",
                            value = editPhone.ifBlank { "Not set" },
                            iconTint = primary,
                            textColor = onSurface,
                            subtextColor = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Divider(color = outline.copy(alpha = 0.2f), modifier = Modifier.padding(vertical = 10.dp))
                        ProfileInfoRow(
                            icon = if (userRole == UserRole.GUARDIAN) Icons.Default.Shield else Icons.Default.Person,
                            label = "Role",
                            value = roleLabel,
                            valueColor = roleColor,
                            iconTint = roleColor,
                            textColor = onSurface,
                            subtextColor = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // ── Appearance Card ──
            ProfileCard(surface = surface, outline = outline) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "APPEARANCE",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = primary,
                        letterSpacing = 1.5.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .background(
                                        if (isDarkTheme) MacherViolet.copy(alpha = 0.15f)
                                        else MacherCyanLight.copy(alpha = 0.12f),
                                        RoundedCornerShape(12.dp)
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = if (isDarkTheme) "🌙" else "☀️",
                                    fontSize = 18.sp
                                )
                            }
                            Spacer(modifier = Modifier.width(14.dp))
                            Column {
                                Text(
                                    text = if (isDarkTheme) "Dark Mode" else "Light Mode",
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 15.sp,
                                    color = onSurface
                                )
                                Text(
                                    text = if (isDarkTheme) "Premium MACHER dark feel" else "Clean light design",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        Switch(
                            checked = isDarkTheme,
                            onCheckedChange = { onThemeToggle(it) },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color.White,
                                checkedTrackColor = MacherViolet,
                                uncheckedThumbColor = Color.White,
                                uncheckedTrackColor = MacherCyanLight
                            )
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // ── Switch Role Card ──
            ProfileCard(surface = surface, outline = outline) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "YOUR ROLE",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = primary,
                        letterSpacing = 1.5.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))

                    // Role description
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(roleColor.copy(alpha = 0.08f), RoundedCornerShape(12.dp))
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(text = roleIcon, fontSize = 28.sp)
                        Spacer(modifier = Modifier.width(14.dp))
                        Column {
                            Text(
                                text = roleLabel,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = roleColor
                            )
                            Text(
                                text = if (userRole == UserRole.GUARDIAN)
                                    "Monitoring and protecting family members"
                                else
                                    "Being protected against call fraud",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                lineHeight = 18.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    val newRoleLabel = if (userRole == UserRole.GUARDIAN) "Protected" else "Guardian"
                    val newRoleColor = if (userRole == UserRole.GUARDIAN) MacherElectricCyan else MacherViolet

                    OutlinedButton(
                        onClick = { showRoleSwitchDialog = true },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        border = androidx.compose.foundation.BorderStroke(1.5.dp, newRoleColor),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = newRoleColor
                        )
                    ) {
                        Icon(
                            Icons.Default.SwapHoriz,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Switch to $newRoleLabel",
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // ── App Info Card ──
            ProfileCard(surface = surface, outline = outline) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "APP INFO",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = primary,
                        letterSpacing = 1.5.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    ProfileInfoRow(
                        icon = Icons.Default.Security,
                        label = "App Name",
                        value = "MACHER",
                        iconTint = primary,
                        textColor = onSurface,
                        subtextColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Divider(color = outline.copy(alpha = 0.2f), modifier = Modifier.padding(vertical = 10.dp))
                    ProfileInfoRow(
                        icon = Icons.Default.Info,
                        label = "Version",
                        value = "1.0.0",
                        iconTint = primary,
                        textColor = onSurface,
                        subtextColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Divider(color = outline.copy(alpha = 0.2f), modifier = Modifier.padding(vertical = 10.dp))
                    ProfileInfoRow(
                        icon = Icons.Default.Lock,
                        label = "Privacy",
                        value = "Call audio never stored",
                        iconTint = SafeGreen,
                        textColor = onSurface,
                        subtextColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // ── Danger Zone ──
            ProfileCard(
                surface = DangerRed.copy(alpha = if (isDarkTheme) 0.08f else 0.05f),
                outline = DangerRed.copy(alpha = 0.3f)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "DANGER ZONE",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = DangerRed,
                        letterSpacing = 1.5.sp
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    OutlinedButton(
                        onClick = { showResetDialog = true },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, DangerRed.copy(alpha = 0.6f)),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerRed)
                    ) {
                        Icon(
                            Icons.Default.RestartAlt,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Reset App", fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(40.dp))
        }
    }
}

@Composable
private fun ProfileCard(
    surface: Color,
    outline: Color,
    content: @Composable () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = surface,
        tonalElevation = 1.dp,
        shadowElevation = 2.dp
    ) {
        Box(
            modifier = Modifier.border(
                1.dp,
                outline.copy(alpha = 0.25f),
                RoundedCornerShape(18.dp)
            )
        ) {
            content()
        }
    }
}

@Composable
private fun ProfileInfoRow(
    icon: ImageVector,
    label: String,
    value: String,
    iconTint: Color,
    textColor: Color,
    subtextColor: Color,
    valueColor: Color = textColor
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(iconTint.copy(alpha = 0.12f), RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(18.dp)
            )
        }
        Spacer(modifier = Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                fontSize = 11.sp,
                color = subtextColor,
                letterSpacing = 0.5.sp
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = value,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = valueColor
            )
        }
    }
}
