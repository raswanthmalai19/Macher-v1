package com.macher.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// ─────────────────────────────────────────────────────────────
// Composition Local to expose dark/light context to any composable
// Usage: val isDark = LocalIsDarkTheme.current
// ─────────────────────────────────────────────────────────────
val LocalIsDarkTheme = staticCompositionLocalOf { true }

// MACHER Dark Color Scheme
private val MacherDarkScheme = darkColorScheme(
    primary = MacherElectricCyan,
    onPrimary = MacherNavy,
    primaryContainer = MacherDeepBlue,
    onPrimaryContainer = MacherCyanSoft,
    secondary = MacherViolet,
    onSecondary = Color.White,
    secondaryContainer = MacherVioletGlow,
    tertiary = SafeGreen,
    onTertiary = MacherNavy,
    error = DangerRed,
    onError = Color.White,
    background = BackgroundDark,
    onBackground = TextPrimary,
    surface = SurfaceDark,
    onSurface = TextPrimary,
    surfaceVariant = SurfaceElevated,
    onSurfaceVariant = TextSecondary
)

// MACHER Light Color Scheme — proper light backgrounds
private val MacherLightScheme = lightColorScheme(
    primary = MacherCyanLight,
    onPrimary = Color.White,
    primaryContainer = LightSurfaceVariant,
    onPrimaryContainer = MacherNavy,
    secondary = MacherVioletLight,
    onSecondary = Color.White,
    secondaryContainer = LightSurfaceElevated,
    onSecondaryContainer = MacherNavy,
    tertiary = SafeGreen,
    onTertiary = Color.White,
    error = DangerRed,
    onError = Color.White,
    background = LightBackground,
    onBackground = LightTextPrimary,
    surface = LightSurface,
    onSurface = LightTextPrimary,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightTextSecondary,
    outline = LightTextTertiary,
    inverseSurface = BackgroundDark,
    inverseOnSurface = TextPrimary,
    inversePrimary = MacherElectricCyan
)

/**
 * MACHER app theme.
 * @param darkTheme true = dark (default MACHER premium feel), false = clean light mode
 */
@Composable
fun MacherTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) MacherDarkScheme else MacherLightScheme

    CompositionLocalProvider(LocalIsDarkTheme provides darkTheme) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content
        )
    }
}

// ─────────────────────────────────────────────────────────────
// Semantic color helpers — use these instead of hardcoded colors
// They automatically resolve for dark OR light theme
// ─────────────────────────────────────────────────────────────

/** Background color for screens */
val isDarkThemeColors: Boolean
    @Composable get() = LocalIsDarkTheme.current
