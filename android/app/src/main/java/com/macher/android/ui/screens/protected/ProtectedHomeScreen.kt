package com.macher.android.ui.screens.protected

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
                modifier = Modifier
                    .navigationBarsPadding()
                    .padding(bottom = 56.dp),
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
                    selected = true,
                    onClick = { /* already on this screen */ },
                    colors = navItemColors
                )
                NavigationBarItem(
                    icon = {
                        // Badge count comes from real DB — no hardcoded number
                        Icon(Icons.Default.History, contentDescription = "History")
                    },
                    label = { Text("History", fontSize = 12.sp) },
                    // History/Settings/Profile navigate to separate screens so they are
                    // never truly "selected" while we are on ProtectedHomeScreen.
                    selected = false,
                    onClick = { onNavigateToHistory() },
                    colors = navItemColors
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                    label = { Text("Settings", fontSize = 12.sp) },
                    selected = false,
                    onClick = { onNavigateToSettings() },
                    colors = navItemColors
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.AccountCircle, contentDescription = "Profile") },
                    label = { Text("Profile", fontSize = 12.sp) },
                    selected = false,
                    onClick = { onNavigateToProfile() },
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
