package com.macher.android.ui.screens.protected

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.macher.android.service.MonitoringManager
import com.macher.android.ui.MacherApp
import com.macher.android.ui.theme.*
import com.macher.android.util.AnnounceThreatLevel
import com.macher.android.util.AnnounceDetectionMode

/**
 * Protected mode home screen
 * Simple monitoring interface with profile + history + settings navigation
 * Enhanced with badge indicators on bottom bar items
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProtectedHomeScreen(
    monitoringManager: MonitoringManager,
    onNavigateToHistory: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToProfile: () -> Unit = {}
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val isMonitoring by monitoringManager.isMonitoring.collectAsState()

    val navItemColors = NavigationBarItemDefaults.colors(
        selectedIconColor = MacherElectricCyan,
        selectedTextColor = MacherElectricCyan,
        indicatorColor = MacherElectricCyan.copy(alpha = 0.12f),
        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
    )

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface,
                tonalElevation = 0.dp
            ) {
                NavigationBarItem(
                    icon = {
                        BadgedBox(
                            badge = {
                                if (isMonitoring) {
                                    Badge(
                                        containerColor = SafeGreen,
                                        modifier = Modifier.size(8.dp)
                                    )
                                }
                            }
                        ) {
                            Icon(Icons.Default.Home, contentDescription = "Home")
                        }
                    },
                    label = { Text("Monitor", fontSize = 12.sp) },
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    colors = navItemColors
                )
                NavigationBarItem(
                    icon = {
                        BadgedBox(
                            badge = {
                                Badge(containerColor = DangerRed) {
                                    Text("3", color = Color.White, fontSize = 10.sp)
                                }
                            }
                        ) {
                            Icon(Icons.Default.History, contentDescription = "History")
                        }
                    },
                    label = { Text("History", fontSize = 12.sp) },
                    selected = selectedTab == 1,
                    onClick = {
                        selectedTab = 1
                        onNavigateToHistory()
                    },
                    colors = navItemColors
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                    label = { Text("Settings", fontSize = 12.sp) },
                    selected = selectedTab == 2,
                    onClick = {
                        selectedTab = 2
                        onNavigateToSettings()
                    },
                    colors = navItemColors
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.AccountCircle, contentDescription = "Profile") },
                    label = { Text("Profile", fontSize = 12.sp) },
                    selected = selectedTab == 3,
                    onClick = {
                        selectedTab = 3
                        onNavigateToProfile()
                    },
                    colors = navItemColors
                )
            }
        }
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues)) {
            MacherApp(monitoringManager)
        }
    }
}
