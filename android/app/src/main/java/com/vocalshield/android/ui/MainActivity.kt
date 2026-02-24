package com.vocalshield.android.ui

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.vocalshield.android.ui.theme.VocalShieldTheme

/**
 * Main activity for VocalShield app.
 * Handles navigation, permissions, and Accessibility Service setup.
 * 
 * Requirements: 9.4
 */
class MainActivity : ComponentActivity() {
    
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        // Handle permission results
        val allGranted = permissions.values.all { it }
        if (!allGranted) {
            // Show dialog explaining why permissions are needed
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Request necessary permissions
        requestPermissions()
        
        setContent {
            VocalShieldTheme {
                MainScreen()
            }
        }
    }
    
    /**
     * Request necessary permissions for audio capture and notifications.
     */
    private fun requestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_PHONE_STATE
        )
        
        // Add notification permission for Android 13+
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        
        permissionLauncher.launch(permissions.toTypedArray())
    }
    
    /**
     * Open Accessibility Settings to enable the service.
     */
    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        startActivity(intent)
    }
}

/**
 * Main screen with bottom navigation.
 */
@Composable
fun MainScreen() {
    val navController = rememberNavController()
    
    Scaffold(
        bottomBar = {
            NavigationBar {
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentDestination = navBackStackEntry?.destination
                
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Home, contentDescription = "Monitor") },
                    label = { Text("Monitor") },
                    selected = currentDestination?.hierarchy?.any { it.route == "monitor" } == true,
                    onClick = {
                        navController.navigate("monitor") {
                            popUpTo(navController.graph.findStartDestination().id) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                )
                
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                    label = { Text("Settings") },
                    selected = currentDestination?.hierarchy?.any { it.route == "settings" } == true,
                    onClick = {
                        navController.navigate("settings") {
                            popUpTo(navController.graph.findStartDestination().id) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                )
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = "monitor",
            modifier = Modifier.padding(innerPadding)
        ) {
            composable("monitor") {
                // TODO: Initialize ViewModel with dependencies
                // For now, this is a placeholder
                Text("Call Monitor Screen - TODO: Wire up ViewModel")
            }
            
            composable("settings") {
                Text("Settings Screen - TODO: Implement")
            }
        }
    }
}
