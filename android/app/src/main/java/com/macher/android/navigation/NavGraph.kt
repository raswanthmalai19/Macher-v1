package com.macher.android.navigation

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.macher.android.data.model.UserRole
import com.macher.android.data.preferences.UserPreferences
import com.macher.android.data.preferences.AppPreferences
import com.macher.android.service.MonitoringManager
import com.macher.android.ui.screens.onboarding.OnboardingScreen
import com.macher.android.ui.screens.onboarding.RoleSelectionScreen
import com.macher.android.ui.screens.protected.ProtectedHomeScreen
import com.macher.android.ui.screens.protected.CallHistoryScreen
import com.macher.android.ui.screens.protected.ProtectedSettingsScreen
import com.macher.android.ui.screens.guardian.GuardianDashboardScreen
import com.macher.android.ui.screens.guardian.TrustedContactsScreen
import com.macher.android.ui.screens.guardian.AlertHistoryScreen
import com.macher.android.ui.screens.guardian.GuardianSettingsScreen
import com.macher.android.ui.screens.guardian.ProtectedUsersScreen
import com.macher.android.ui.screens.guardian.StatisticsScreen
import com.macher.android.ui.screens.profile.ProfileScreen
import kotlinx.coroutines.launch

/** Navigation route constants */
object Routes {
    const val ONBOARDING = "onboarding"
    const val ROLE_SELECTION = "role_selection"
    const val PROTECTED_HOME = "protected_home"
    const val PROTECTED_HISTORY = "protected_history"
    const val PROTECTED_SETTINGS = "protected_settings"
    const val GUARDIAN_DASHBOARD = "guardian_dashboard"
    const val GUARDIAN_CONTACTS = "guardian_contacts"
    const val GUARDIAN_ALERTS = "guardian_alerts"
    const val GUARDIAN_SETTINGS = "guardian_settings"
    const val GUARDIAN_PROTECTED_USERS = "guardian_protected_users"
    const val GUARDIAN_STATISTICS = "guardian_statistics"
    const val PROFILE = "profile"
}

/** Main navigation graph */
@OptIn(ExperimentalAnimationApi::class)
@Composable
fun MacherNavGraph(
    navController: NavHostController,
    startDestination: String,
    monitoringManager: MonitoringManager,
    userPreferences: UserPreferences,
    appPreferences: AppPreferences,
    isDarkTheme: Boolean,
    onThemeToggle: (Boolean) -> Unit
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
        enterTransition = {
            slideInHorizontally(initialOffsetX = { it }, animationSpec = tween(300)) +
                    fadeIn(animationSpec = tween(300))
        },
        exitTransition = {
            slideOutHorizontally(targetOffsetX = { -it / 3 }, animationSpec = tween(300)) +
                    fadeOut(animationSpec = tween(200))
        },
        popEnterTransition = {
            slideInHorizontally(initialOffsetX = { -it / 3 }, animationSpec = tween(300)) +
                    fadeIn(animationSpec = tween(300))
        },
        popExitTransition = {
            slideOutHorizontally(targetOffsetX = { it }, animationSpec = tween(300)) +
                    fadeOut(animationSpec = tween(200))
        }
    ) {
        composable(Routes.ONBOARDING) {
            OnboardingScreen(
                onContinue = {
                    navController.navigate(Routes.ROLE_SELECTION) {
                        popUpTo(Routes.ONBOARDING) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.ROLE_SELECTION) {
            val scope = rememberCoroutineScope()
            RoleSelectionScreen(
                onRoleSelected = { role ->
                    scope.launch {
                        val userRole = if (role == "PROTECTED") UserRole.PROTECTED else UserRole.GUARDIAN
                        userPreferences.updateUserRole(userRole)
                        userPreferences.completeOnboarding()
                    }
                    val destination = if (role == "PROTECTED") Routes.PROTECTED_HOME else Routes.GUARDIAN_DASHBOARD
                    navController.navigate(destination) {
                        popUpTo(Routes.ROLE_SELECTION) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.PROTECTED_HOME) {
            ProtectedHomeScreen(
                monitoringManager = monitoringManager,
                onNavigateToHistory = { navController.navigate(Routes.PROTECTED_HISTORY) },
                onNavigateToSettings = { navController.navigate(Routes.PROTECTED_SETTINGS) },
                onNavigateToProfile = { navController.navigate(Routes.PROFILE) }
            )
        }

        composable(Routes.PROTECTED_HISTORY) {
            CallHistoryScreen(onNavigateBack = { navController.popBackStack() })
        }

        composable(Routes.PROTECTED_SETTINGS) {
            ProtectedSettingsScreen(
                appPreferences = appPreferences,
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(Routes.GUARDIAN_DASHBOARD) {
            GuardianDashboardScreen(
                onNavigateToContacts = { navController.navigate(Routes.GUARDIAN_CONTACTS) },
                onNavigateToAlerts = { navController.navigate(Routes.GUARDIAN_ALERTS) },
                onNavigateToSettings = { navController.navigate(Routes.GUARDIAN_SETTINGS) },
                onNavigateToProtectedUsers = { navController.navigate(Routes.GUARDIAN_PROTECTED_USERS) },
                onNavigateToStatistics = { navController.navigate(Routes.GUARDIAN_STATISTICS) },
                onNavigateToProfile = { navController.navigate(Routes.PROFILE) }
            )
        }

        composable(Routes.GUARDIAN_CONTACTS) {
            TrustedContactsScreen(onNavigateBack = { navController.popBackStack() })
        }

        composable(Routes.GUARDIAN_ALERTS) {
            AlertHistoryScreen(onNavigateBack = { navController.popBackStack() })
        }

        composable(Routes.GUARDIAN_SETTINGS) {
            GuardianSettingsScreen(
                appPreferences = appPreferences,
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(Routes.GUARDIAN_PROTECTED_USERS) {
            ProtectedUsersScreen(onNavigateBack = { navController.popBackStack() })
        }

        composable(Routes.GUARDIAN_STATISTICS) {
            StatisticsScreen(
                monitoringManager = monitoringManager,
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(Routes.PROFILE) {
            val scope = rememberCoroutineScope()
            val userRole by userPreferences.userRole.collectAsState(initial = UserRole.NOT_SET)
            val userName by userPreferences.userName.collectAsState(initial = "")
            val userPhone by userPreferences.userPhone.collectAsState(initial = "")

            ProfileScreen(
                userRole = userRole,
                userName = userName ?: "",
                userPhone = userPhone ?: "",
                isDarkTheme = isDarkTheme,
                onNavigateBack = { navController.popBackStack() },
                onThemeToggle = { dark -> onThemeToggle(dark) },
                onRoleSwitch = { newRole ->
                    scope.launch { userPreferences.updateUserRole(newRole) }
                    val destination = if (newRole == UserRole.GUARDIAN)
                        Routes.GUARDIAN_DASHBOARD else Routes.PROTECTED_HOME
                    navController.navigate(destination) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onSaveProfile = { name, phone ->
                    scope.launch {
                        userPreferences.updateUserName(name)
                        userPreferences.updateUserPhone(phone)
                    }
                },
                onResetApp = {
                    scope.launch { userPreferences.clear() }
                    navController.navigate(Routes.ONBOARDING) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
    }
}
