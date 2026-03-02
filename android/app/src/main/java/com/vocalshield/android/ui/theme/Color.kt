package com.vocalshield.android.ui.theme

import androidx.compose.ui.graphics.Color

// ═══════════════════════════════════════════════════════════════
// MACHER - Premium Dark Color System
// Deep navy base with electric cyan + violet neon accents
// ═══════════════════════════════════════════════════════════════

// Primary Brand - Deep navy to electric cyan
val MacherNavy = Color(0xFF0A1628)
val MacherDeepBlue = Color(0xFF0F2042)
val MacherElectricCyan = Color(0xFF00E5FF)
val MacherCyanSoft = Color(0xFF80DEEA)

// Secondary Brand - Electric violet
val MacherViolet = Color(0xFF7C4DFF)
val MacherVioletGlow = Color(0xFFB388FF)

// Legacy aliases (backward compatibility)
val VibrantBlue = MacherElectricCyan
val DeepBlue = MacherDeepBlue
val ElectricBlue = MacherElectricCyan
val SkyBlue = MacherCyanSoft
val AccentPurple = MacherViolet
val AccentPink = Color(0xFFFF4081)
val AccentCyan = MacherElectricCyan
val AccentEmerald = Color(0xFF00E676)

// Guardian UI Colors
val VibrantPurple = MacherViolet
val DeepPurple = Color(0xFF651FFF)
val VibrantPink = Color(0xFFFF4081)
val VibrantGreen = Color(0xFF00E676)
val VibrantYellow = Color(0xFFFFD600)
val VibrantRed = Color(0xFFFF1744)
val White = Color(0xFFFFFFFF)
val Black = Color(0xFF000000)

// Gradient Colors - Premium dark gradients
val GradientStart = MacherNavy
val GradientMiddle = MacherDeepBlue
val GradientEnd = Color(0xFF1A237E)

// Threat Level Colors - High contrast neon
val SafeGreen = Color(0xFF00E676)
val SafeGreenLight = Color(0xFF69F0AE)
val CautionYellow = Color(0xFFFFD600)
val CautionOrange = Color(0xFFFF9100)
val DangerRed = Color(0xFFFF1744)
val DangerRedDark = Color(0xFFD50000)
val DangerRedGlow = Color(0xFFFF5252)

// Background Colors - Deep dark
val BackgroundDark = Color(0xFF050D1A)
val BackgroundLight = Color(0xFF0A1628)
val SurfaceDark = Color(0xFF0F1D32)
val SurfaceLight = Color(0xFF142441)
val SurfaceElevated = Color(0xFF1A2D4D)

// Glass Effect Colors - Translucent panels
val GlassWhite = Color(0x1AFFFFFF)
val GlassDark = Color(0x33000D1A)
val GlassBlur = Color(0x0DFFFFFF)
val GlassBorder = Color(0x33FFFFFF)
val GlassCard = Color(0x1A80DEEA)

// Text Colors - High readability on dark
val TextPrimary = Color(0xFFF0F4F8)
val TextSecondary = Color(0xFFB0BEC5)
val TextTertiary = Color(0xFF607D8B)
val TextOnDark = Color(0xFFF0F4F8)
val TextOnAccent = Color(0xFF050D1A)

// Shadow & Glow Colors
val ShadowLight = Color(0x1A000000)
val ShadowMedium = Color(0x33000000)
val ShadowDark = Color(0x4D000000)
val CyanGlow = Color(0x4D00E5FF)
val VioletGlow = Color(0x4D7C4DFF)
val GreenGlow = Color(0x4D00E676)
val RedGlow = Color(0x4DFF1744)
val YellowGlow = Color(0x4DFFD600)

// ═══════════════════════════════════════════════════════════════
// LIGHT THEME COLORS
// Clean white/light-blue background with deep navy accents
// ═══════════════════════════════════════════════════════════════
val LightBackground = Color(0xFFF5F8FF)       // Very light blue-white
val LightSurface = Color(0xFFFFFFFF)           // Pure white cards
val LightSurfaceVariant = Color(0xFFECF2FF)    // Subtle blue-tint panels
val LightSurfaceElevated = Color(0xFFDEEBFF)   // Slightly elevated

val LightTextPrimary = Color(0xFF0D1B2A)       // Very dark navy
val LightTextSecondary = Color(0xFF3A5068)     // Dark slate
val LightTextTertiary = Color(0xFF6B8CAE)      // Medium slate

val LightGlassBorder = Color(0x330D1B2A)       // Dark border for light mode
val LightGlassCard = Color(0x0A006080)         // Very faint teal tint
val LightDivider = Color(0xFFD0DDF0)           // Light divider

// Brand colors are the same in both themes but slightly adjusted
val MacherCyanLight = Color(0xFF007B8F)        // Deeper cyan for readability on white
val MacherVioletLight = Color(0xFF5C35CC)      // Darker violet for white bg
