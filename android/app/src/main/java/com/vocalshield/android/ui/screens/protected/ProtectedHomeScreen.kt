package com.vocalshield.android.ui.screens.protected

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.vocalshield.android.service.MonitoringManager
import com.vocalshield.android.ui.VocalShieldApp
import com.vocalshield.android.ui.theme.*
import com.vocalshield.android.util.AnnounceThreatLevel
import com.vocalshield.android.util.AnnounceDetectionMode

/**
 * Protected mode home screen
 * Simple monitoring interface with profile + history + settings navigation
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

    val navItemColors = NavigationBarItemDefaults.colors(
        selectedIconColor = MacherElectricCyan,
        selectedTextColor = MacherElectricCyan,
        indicatorColor = MacherElectricCyan.copy(alpha = 0.15f),
        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
    )

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface
            ) {
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                    label = { Text("Monitor") },
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    colors = navItemColors
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.History, contentDescription = "History") },
                    label = { Text("History") },
                    selected = selectedTab == 1,
                    onClick = {
                        selectedTab = 1
                        onNavigateToHistory()
                    },
                    colors = navItemColors
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                    label = { Text("Settings") },
                    selected = selectedTab == 2,
                    onClick = {
                        selectedTab = 2
                        onNavigateToSettings()
                    },
                    colors = navItemColors
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.AccountCircle, contentDescription = "Profile") },
                    label = { Text("Profile") },
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
            VocalShieldApp(monitoringManager)
        }
    }
}
