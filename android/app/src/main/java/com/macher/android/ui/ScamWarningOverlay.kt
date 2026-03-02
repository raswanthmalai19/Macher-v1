package com.macher.android.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.macher.android.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * MACHER - Premium Scam Warning Overlay
 * Full-screen dark overlay with neon red accents and urgent animations
 */
@Composable
fun ScamWarningOverlay(
    visible: Boolean,
    threatType: String = "Known Scam Tactics",
    onDismiss: () -> Unit,
    onDisconnect: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    
    // Pulsing red glow
    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.7f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glow"
    )
    
    // Scale pulse for warning icon
    val iconScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "iconScale"
    )
    
    if (visible) {
        Dialog(
            onDismissRequest = { /* Block dismissal */ },
            properties = DialogProperties(
                dismissOnBackPress = false,
                dismissOnClickOutside = false,
                usePlatformDefaultWidth = false
            )
        ) {
            var visibleWarnings by remember { mutableIntStateOf(0) }
            var countdown by remember { mutableIntStateOf(10) }
            
            LaunchedEffect(Unit) {
                // Stagger warning items by 120ms each
                for (i in 1..5) {
                    delay(120L * i)
                    visibleWarnings = i
                }
            }
            
            LaunchedEffect(Unit) {
                // 10-second auto hang-up countdown
                for (i in 9 downTo 0) {
                    delay(1000)
                    countdown = i
                }
                onDisconnect()
            }
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(BackgroundDark.copy(alpha = 0.95f)),
                contentAlignment = Alignment.Center
            ) {
                // Background red glow orbs
                Box(
                    modifier = Modifier
                        .size(300.dp)
                        .blur(80.dp)
                        .background(DangerRed.copy(alpha = glowAlpha * 0.3f), CircleShape)
                )
                
                Column(
                    modifier = Modifier
                        .fillMaxWidth(0.88f)
                        .background(
                            brush = Brush.verticalGradient(
                                colors = listOf(
                                    SurfaceElevated,
                                    SurfaceDark
                                )
                            ),
                            shape = RoundedCornerShape(28.dp)
                        )
                        .border(
                            width = 2.dp,
                            brush = Brush.verticalGradient(
                                colors = listOf(
                                    DangerRed.copy(alpha = glowAlpha),
                                    DangerRedGlow.copy(alpha = glowAlpha * 0.5f)
                                )
                            ),
                            shape = RoundedCornerShape(28.dp)
                        )
                        .padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // Warning Icon Ring
                    Box(
                        modifier = Modifier
                            .size(80.dp)
                            .scale(iconScale)
                            .border(3.dp, DangerRed, CircleShape)
                            .background(DangerRed.copy(alpha = 0.15f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(text = "⚠️", fontSize = 40.sp)
                    }
                    
                    Spacer(modifier = Modifier.height(20.dp))
                    
                    // Title
                    Text(
                        text = "SCAM DETECTED",
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Black,
                        color = DangerRed,
                        textAlign = TextAlign.Center,
                        letterSpacing = 3.sp
                    )
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    // Threat type
                    Text(
                        text = threatType,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        lineHeight = 22.sp
                    )
                    
                    Spacer(modifier = Modifier.height(24.dp))
                    
                    // Warning items
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                DangerRed.copy(alpha = 0.08f),
                                RoundedCornerShape(16.dp)
                            )
                            .border(
                                1.dp,
                                DangerRed.copy(alpha = 0.2f),
                                RoundedCornerShape(16.dp)
                            )
                            .padding(20.dp)
                    ) {
                        Column {
                            Text(
                                text = "DO NOT:",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = DangerRed,
                                letterSpacing = 2.sp
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            val warnings = listOf(
                                "Share passwords or PINs",
                                "Provide bank account details",
                                "Give OTP codes",
                                "Buy gift cards",
                                "Send money"
                            )
                            warnings.forEachIndexed { index, warning ->
                                AnimatedVisibility(
                                    visible = index < visibleWarnings,
                                    enter = slideInHorizontally(
                                        initialOffsetX = { -40 },
                                        animationSpec = tween(250, easing = EaseOutCubic)
                                    ) + fadeIn(tween(200))
                                ) {
                                    Row(
                                        modifier = Modifier.padding(vertical = 3.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(4.dp)
                                                .background(DangerRedGlow, CircleShape)
                                        )
                                        Spacer(modifier = Modifier.width(10.dp))
                                        Text(
                                            text = warning,
                                            fontSize = 13.sp,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            lineHeight = 18.sp
                                        )
                                    }
                                }
                            }
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(28.dp))
                    
                    // HANG UP Button - Bright red gradient
                    Button(
                        onClick = onDisconnect,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
                        shape = RoundedCornerShape(18.dp),
                        contentPadding = PaddingValues(0.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(
                                    brush = Brush.horizontalGradient(
                                        colors = listOf(DangerRed, DangerRedDark)
                                    ),
                                    shape = RoundedCornerShape(18.dp)
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = if (countdown > 0) "🛡️  HANG UP ($countdown)" else "🛡️  HANGING UP...",
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                letterSpacing = 1.5.sp
                            )
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(12.dp))
                    
                    // Dismiss Button - Subtle outline
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = TextSecondary
                        ),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            GlassBorder
                        ),
                        shape = RoundedCornerShape(18.dp)
                    ) {
                        Text(
                            text = "I know this caller",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Family notification text
                    Text(
                        text = "Your family will be notified of this call",
                        fontSize = 11.sp,
                        color = TextTertiary,
                        textAlign = TextAlign.Center,
                        letterSpacing = 0.5.sp
                    )
                }
            }
        }
    }
}

@Composable
fun ScamWarningOverlayPreview() {
    var visible by remember { mutableStateOf(true) }
    ScamWarningOverlay(
        visible = visible,
        threatType = "IRS Impersonation Scam",
        onDismiss = { visible = false },
        onDisconnect = { visible = false }
    )
}
