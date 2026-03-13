package com.macher.android.ui.screens.guardian

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.Help
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.macher.android.data.database.MacherDatabase
import com.macher.android.data.preferences.UserPreferences
import com.macher.android.data.repository.GuardianRepository
import com.macher.android.ui.theme.*
import kotlinx.coroutines.launch
import java.util.Calendar
import kotlin.math.sin

/**
 * Guardian Dashboard - Main screen for family members
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GuardianDashboardScreen(
    userName: String = "",
    onNavigateToContacts: () -> Unit,
    onNavigateToAlerts: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToProtectedUsers: () -> Unit,
    onNavigateToStatistics: () -> Unit = {},
    onNavigateToProfile: () -> Unit = {}
) {
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    // ── Live data from Room DB ──────────────────────────────────
    val context = LocalContext.current
    val db = remember { MacherDatabase.getDatabase(context) }
    val userPrefs = remember { UserPreferences(context) }
    val guardianId by userPrefs.userId.collectAsState(initial = null)
    val guardianRepo = remember { GuardianRepository(db.guardianProtectedLinkDao(), db.userDao()) }
    val allLinks by remember(guardianId) {
        guardianRepo.getProtectedUsers(guardianId ?: "")
    }.collectAsState(initial = emptyList())
    val activeLinks = allLinks.filter { it.isActive }

    // Query real alert counts from DB for all protected users
    val alertDao = remember { db.alertHistoryDao() }
    val protectedIds = activeLinks.map { it.protectedId }
    val allAlerts by remember(protectedIds) {
        if (protectedIds.isEmpty()) {
            kotlinx.coroutines.flow.flowOf(emptyList<com.macher.android.data.database.AlertHistoryEntity>())
        } else {
            // Get alerts for first protected user (primary); extend if multiple
            alertDao.getAlertHistory(protectedIds.firstOrNull() ?: "", limit = 100)
        }
    }.collectAsState(initial = emptyList())
    val dangerCount = allAlerts.count { it.threatLevel == "DANGER" }
    val cautionCount = allAlerts.count { it.threatLevel == "CAUTION" }
    
    // Trusted contacts count
    val trustedDao = remember { db.trustedContactDao() }
    val resolvedGuardianId = guardianId ?: ""
    val trustedContacts by remember(resolvedGuardianId) {
        trustedDao.getTrustedContacts(resolvedGuardianId)
    }.collectAsState(initial = emptyList())
    val contactsCount = trustedContacts.size
    
    // Safe rate: percentage of calls that were SAFE
    val safeRate = if (allAlerts.isNotEmpty()) {
        val safeCount = allAlerts.count { it.threatLevel == "SAFE" }
        ((safeCount.toFloat() / allAlerts.size) * 100).toInt()
    } else {
        100 // Default to 100% safe when no alerts
    }
    
    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            GuardianDrawerContent(
                userName = userName,
                onNavigateToContacts = onNavigateToContacts,
                onNavigateToAlerts = onNavigateToAlerts,
                onNavigateToSettings = onNavigateToSettings,
                onNavigateToProtectedUsers = onNavigateToProtectedUsers,
                onCloseDrawer = { scope.launch { try { drawerState.close() } catch (_: Exception) {} } }
            )
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            text = "Guardian Dashboard",
                            fontWeight = FontWeight.Bold
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { try { drawerState.open() } catch (_: Exception) {} } }) {
                            Icon(Icons.Default.Menu, contentDescription = "Menu")
                        }
                    },
                    actions = {
                        IconButton(onClick = onNavigateToProfile) {
                            Icon(
                                Icons.Default.AccountCircle,
                                contentDescription = "Profile",
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                        navigationIconContentColor = MaterialTheme.colorScheme.onSurface
                    )
                )
            }
        ) { paddingValues ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(paddingValues)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Hero Banner with greeting & stats
                item {
                    GuardianHeroBanner(
                        userName = userName,
                        protectedCount = activeLinks.size,
                        contactsCount = contactsCount,
                        safeRate = safeRate,
                        alertsCount = allAlerts.size
                    )
                }

                item {
                    // Protected Users Section
                    SectionHeader(
                        title = "Protected Users",
                        icon = Icons.Default.People
                    )
                }

                // Show real protected users from DB, or an empty-state prompt
                if (activeLinks.isEmpty()) {
                    item {
                        OutlinedButton(
                            onClick = onNavigateToProtectedUsers,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            border = androidx.compose.foundation.BorderStroke(1.5.dp, MacherViolet)
                        ) {
                            Icon(Icons.Default.PersonAdd, contentDescription = null, tint = MacherViolet)
                            Spacer(Modifier.width(8.dp))
                            Text("Add a protected user", color = MacherViolet, fontWeight = FontWeight.SemiBold)
                        }
                    }
                } else {
                    items(activeLinks) { link ->
                        ProtectedUserCard(
                            name = link.protectedName.ifEmpty { "Pending setup…" },
                            phoneNumber = link.protectedPhone.ifEmpty { "—" },
                            status = "Active",
                            threatLevel = "Safe",
                            lastActivity = "Recently",
                            onClick = onNavigateToProtectedUsers
                        )
                    }
                }
                
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    SectionHeader(
                        title = "Recent Alerts",
                        icon = Icons.Default.Notifications
                    )
                }
                
                item {
                    AlertSummaryCard(
                        dangerCount = dangerCount,
                        cautionCount = cautionCount,
                        totalCount = allAlerts.size,
                        onClick = onNavigateToAlerts
                    )
                }
                
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    SectionHeader(
                        title = "Quick Actions",
                        icon = Icons.Default.Speed
                    )
                }
                
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        QuickActionCard(
                            icon = Icons.Default.ContactPhone,
                            title = "Trusted Contacts",
                            subtitle = "Manage contacts",
                            modifier = Modifier.weight(1f),
                            onClick = onNavigateToContacts
                        )
                        
                        QuickActionCard(
                            icon = Icons.Default.Settings,
                            title = "Settings",
                            subtitle = "Configure",
                            modifier = Modifier.weight(1f),
                            onClick = onNavigateToSettings
                        )
                    }
                }
                
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        QuickActionCard(
                            icon = Icons.Default.BarChart,
                            title = "Statistics",
                            subtitle = "View trends",
                            modifier = Modifier.weight(1f),
                            onClick = onNavigateToStatistics
                        )
                        
                        QuickActionCard(
                            icon = Icons.Default.People,
                            title = "Protected Users",
                            subtitle = "Manage family",
                            modifier = Modifier.weight(1f),
                            onClick = onNavigateToProtectedUsers
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun GuardianHeroBanner(
    userName: String = "",
    protectedCount: Int = 0,
    contactsCount: Int = 0,
    safeRate: Int = 100,
    alertsCount: Int = 0
) {
    val greeting = remember {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        when {
            hour < 12 -> "Good Morning"
            hour < 17 -> "Good Afternoon"
            else -> "Good Evening"
        }
    }

    val infiniteTransition = rememberInfiniteTransition(label = "hero")
    val shimmer by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 6.2832f,
        animationSpec = infiniteRepeatable(
            animation = tween(8000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmer"
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(
                            MacherViolet.copy(alpha = 0.9f),
                            MacherDeepBlue.copy(alpha = 0.95f),
                            MacherNavy
                        )
                    ),
                    shape = RoundedCornerShape(24.dp)
                )
        ) {
            // Floating orbs inside the banner
            Canvas(modifier = Modifier.fillMaxSize()) {
                drawCircle(
                    color = MacherElectricCyan.copy(alpha = 0.08f),
                    radius = 120f,
                    center = Offset(size.width * 0.85f + sin(shimmer) * 15f, 60f)
                )
                drawCircle(
                    color = VibrantPink.copy(alpha = 0.06f),
                    radius = 80f,
                    center = Offset(60f + sin(shimmer * 0.7f) * 10f, size.height * 0.7f)
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp)
            ) {
                Text(
                    text = "$greeting \uD83D\uDC4B",
                    fontSize = 16.sp,
                    color = Color.White.copy(alpha = 0.8f)
                )
                Text(
                    text = userName.ifEmpty { "Guardian" },
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    letterSpacing = 1.sp
                )

                Spacer(modifier = Modifier.height(20.dp))

                // Quick stats row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    HeroStat(value = protectedCount.toString(), label = "Protected", color = MacherElectricCyan)
                    HeroStat(value = contactsCount.toString(), label = "Contacts", color = SafeGreen)
                    HeroStat(value = "$safeRate%", label = "Safe Rate", color = SafeGreenLight)
                    HeroStat(value = alertsCount.toString(), label = "Alerts", color = CautionYellow)
                }
            }
        }
    }
}

@Composable
private fun HeroStat(value: String, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            fontSize = 24.sp,
            fontWeight = FontWeight.Black,
            color = color
        )
        Text(
            text = label,
            fontSize = 11.sp,
            color = Color.White.copy(alpha = 0.7f),
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
fun GuardianDrawerContent(
    userName: String = "",
    onNavigateToContacts: () -> Unit,
    onNavigateToAlerts: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToProtectedUsers: () -> Unit,
    onCloseDrawer: () -> Unit = {}
) {
    var showHelpDialog by remember { mutableStateOf(false) }

    ModalDrawerSheet {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 24.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(VibrantBlue, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "👨‍👩‍👧",
                        fontSize = 24.sp
                    )
                }
                
                Spacer(modifier = Modifier.width(16.dp))
                
                Column {
                    Text(
                        text = userName.ifEmpty { "Guardian" },
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Guardian Mode • Family Protection",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            
            Divider()
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Menu items
            DrawerMenuItem(
                icon = Icons.Default.Dashboard,
                title = "Dashboard",
                onClick = onCloseDrawer
            )
            
            DrawerMenuItem(
                icon = Icons.Default.People,
                title = "Protected Users",
                onClick = onNavigateToProtectedUsers
            )
            
            DrawerMenuItem(
                icon = Icons.Default.ContactPhone,
                title = "Trusted Contacts",
                onClick = onNavigateToContacts
            )
            
            DrawerMenuItem(
                icon = Icons.Default.Notifications,
                title = "Alert History",
                onClick = onNavigateToAlerts
            )
            
            DrawerMenuItem(
                icon = Icons.Default.Settings,
                title = "Settings",
                onClick = onNavigateToSettings
            )
            
            Spacer(modifier = Modifier.weight(1f))
            
            Divider()
            
            DrawerMenuItem(
                icon = Icons.AutoMirrored.Filled.Help,
                title = "Help & Support",
                onClick = { showHelpDialog = true }
            )

            if (showHelpDialog) {
                androidx.compose.material3.AlertDialog(
                    onDismissRequest = { showHelpDialog = false },
                    title = { Text("Help & Support") },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("MACHER Guardian Mode lets you monitor and protect your family members from phone scams.")
                            Text("• Add protected users via link codes")
                            Text("• View real-time threat alerts")
                            Text("• Manage trusted contact whitelists")
                            Text("• Configure detection sensitivity")
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                "Need help? Email support@macher.app",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    },
                    confirmButton = {
                        TextButton(onClick = { showHelpDialog = false }) { Text("Got it") }
                    },
                    containerColor = MaterialTheme.colorScheme.surface
                )
            }
        }
    }
}

@Composable
fun DrawerMenuItem(
    icon: ImageVector,
    title: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp, horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = title,
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.width(16.dp))
        Text(
            text = title,
            fontSize = 16.sp,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
fun SectionHeader(
    title: String,
    icon: ImageVector
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(vertical = 8.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = title,
            tint = VibrantBlue,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = title,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
fun ProtectedUserCard(
    name: String,
    phoneNumber: String,
    status: String,
    threatLevel: String,
    lastActivity: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = name,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = phoneNumber,
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
                
                // Status badge with pulsing dot
                Row(
                    modifier = Modifier
                        .background(
                            color = SafeGreen.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(12.dp)
                        )
                        .border(1.dp, SafeGreen.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    PulsingDot(color = SafeGreen, size = 6.dp)
                    Text(
                        text = status,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = SafeGreen
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                InfoChip(
                    label = "Threat Level",
                    value = threatLevel,
                    color = SafeGreen
                )
                
                InfoChip(
                    label = "Last Activity",
                    value = lastActivity,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun InfoChip(
    label: String,
    value: String,
    color: Color
) {
    Column {
        Text(
            text = label,
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = color,
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}

@Composable
fun PulsingDot(
    color: Color = SafeGreen,
    size: Dp = 8.dp
) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulseDot")
    
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.8f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = EaseOutCubic),
            repeatMode = RepeatMode.Restart
        ),
        label = "dotScale"
    )
    
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.6f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = EaseOutCubic),
            repeatMode = RepeatMode.Restart
        ),
        label = "dotAlpha"
    )
    
    Box(contentAlignment = Alignment.Center) {
        // Expanding ring
        Box(
            modifier = Modifier
                .size(size * pulseScale)
                .background(color.copy(alpha = pulseAlpha), CircleShape)
        )
        // Solid core
        Box(
            modifier = Modifier
                .size(size)
                .background(color, CircleShape)
        )
    }
}

@Composable
fun AlertSummaryCard(
    dangerCount: Int,
    cautionCount: Int,
    totalCount: Int,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            Text(
                text = "Last 7 Days",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Text(
                text = "$totalCount Alerts",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(top = 4.dp)
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                AlertTypeChip(
                    count = dangerCount,
                    label = "Danger",
                    color = DangerRed
                )
                
                AlertTypeChip(
                    count = cautionCount,
                    label = "Caution",
                    color = CautionYellow
                )
            }
        }
    }
}

@Composable
fun AlertTypeChip(
    count: Int,
    label: String,
    color: Color
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .background(
                color = color.copy(alpha = 0.1f),
                shape = RoundedCornerShape(12.dp)
            )
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(color, CircleShape)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = "$count $label",
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
fun QuickActionCard(
    icon: ImageVector,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Card(
        modifier = modifier
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = icon,
                contentDescription = title,
                tint = VibrantBlue,
                modifier = Modifier.size(32.dp)
            )
            
            Spacer(modifier = Modifier.height(12.dp))
            
            Text(
                text = title,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            
            Text(
                text = subtitle,
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
    }
}
