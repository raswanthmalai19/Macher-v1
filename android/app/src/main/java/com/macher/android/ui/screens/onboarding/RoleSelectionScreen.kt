package com.macher.android.ui.screens.onboarding

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.macher.android.ui.theme.*
import kotlinx.coroutines.delay
import kotlin.math.sin

private data class RoleOption(
    val id: String,
    val icon: String,
    val title: String,
    val subtitle: String,
    val description: String,
    val accentColor: Color,
    val features: List<String>
)

private val roles = listOf(
    RoleOption(
        id = "PROTECTED",
        icon = "\uD83D\uDC74",
        title = "I need protection",
        subtitle = "Protected User",
        description = "MACHER monitors your calls and shields you from scams",
        accentColor = MacherElectricCyan,
        features = listOf(
            "Real-time scam detection on every call",
            "Instant audio + visual + haptic warnings",
            "One-touch emergency contact alert"
        )
    ),
    RoleOption(
        id = "GUARDIAN",
        icon = "\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67",
        title = "I\u2019m protecting someone",
        subtitle = "Guardian",
        description = "Monitor and manage protection for your loved ones remotely",
        accentColor = MacherViolet,
        features = listOf(
            "Live dashboard for protected users",
            "Push notifications on threat detection",
            "Manage trusted contacts and settings"
        )
    )
)

@Composable
fun RoleSelectionScreen(
    onRoleSelected: (String) -> Unit
) {
    var selectedRole by remember { mutableStateOf<String?>(null) }
    var showCard1 by remember { mutableStateOf(false) }
    var showCard2 by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        delay(200)
        showCard1 = true
        delay(150)
        showCard2 = true
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        RoleSelectionBackground()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(horizontal = 24.dp)
                .padding(top = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Who will use\nthis app?",
                fontSize = 34.sp,
                fontWeight = FontWeight.Black,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
                lineHeight = 40.sp
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Choose your role to get started",
                fontSize = 15.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(40.dp))

            AnimatedVisibility(
                visible = showCard1,
                enter = fadeIn(tween(500)) + slideInVertically(
                    initialOffsetY = { it / 3 },
                    animationSpec = spring(
                        dampingRatio = Spring.DampingRatioMediumBouncy,
                        stiffness = Spring.StiffnessLow
                    )
                )
            ) {
                RoleOptionCard(
                    role = roles[0],
                    isSelected = selectedRole == roles[0].id,
                    onClick = { selectedRole = roles[0].id }
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            AnimatedVisibility(
                visible = showCard2,
                enter = fadeIn(tween(500)) + slideInVertically(
                    initialOffsetY = { it / 3 },
                    animationSpec = spring(
                        dampingRatio = Spring.DampingRatioMediumBouncy,
                        stiffness = Spring.StiffnessLow
                    )
                )
            ) {
                RoleOptionCard(
                    role = roles[1],
                    isSelected = selectedRole == roles[1].id,
                    onClick = { selectedRole = roles[1].id }
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            AnimatedVisibility(
                visible = selectedRole != null,
                enter = fadeIn(tween(300)) + slideInVertically(
                    initialOffsetY = { it / 2 },
                    animationSpec = spring(stiffness = Spring.StiffnessMediumLow)
                )
            ) {
                val btnColor = if (selectedRole == "PROTECTED") MacherElectricCyan else MacherViolet
                val btnLabel = if (selectedRole == "PROTECTED")
                    "Continue as Protected User" else "Continue as Guardian"

                Button(
                    onClick = { selectedRole?.let { onRoleSelected(it) } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(64.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = btnColor),
                    shape = RoundedCornerShape(32.dp),
                    elevation = ButtonDefaults.buttonElevation(
                        defaultElevation = 8.dp,
                        pressedElevation = 2.dp
                    )
                ) {
                    Text(
                        text = btnLabel,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (btnColor == MacherElectricCyan) Color(0xFF050D1A) else Color.White
                    )
                }
            }

            Spacer(modifier = Modifier.height(48.dp))
        }
    }
}

@Composable
private fun RoleOptionCard(
    role: RoleOption,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val borderWidth by animateDpAsState(
        targetValue = if (isSelected) 2.dp else 1.dp,
        animationSpec = tween(300),
        label = "border"
    )
    val borderColor by animateColorAsState(
        targetValue = if (isSelected) role.accentColor else MaterialTheme.colorScheme.outlineVariant,
        animationSpec = tween(300),
        label = "borderColor"
    )
    val elevation by animateDpAsState(
        targetValue = if (isSelected) 12.dp else 2.dp,
        animationSpec = tween(300),
        label = "elevation"
    )
    val cardScale by animateFloatAsState(
        targetValue = if (isSelected) 1.02f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium
        ),
        label = "scale"
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .scale(cardScale)
            .border(borderWidth, borderColor, RoundedCornerShape(24.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected)
                role.accentColor.copy(alpha = 0.06f)
            else MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = elevation)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.Top
        ) {
            Box(
                modifier = Modifier.size(72.dp),
                contentAlignment = Alignment.Center
            ) {
                if (isSelected) {
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .blur(16.dp)
                            .background(role.accentColor.copy(alpha = 0.25f), CircleShape)
                    )
                }
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .background(
                            role.accentColor.copy(alpha = 0.1f),
                            CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(text = role.icon, fontSize = 36.sp)
                }
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = role.title,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = role.subtitle,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = role.accentColor,
                    modifier = Modifier.padding(top = 2.dp)
                )
                Text(
                    text = role.description,
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                    lineHeight = 18.sp
                )

                Spacer(modifier = Modifier.height(12.dp))

                role.features.forEach { feature ->
                    Row(
                        modifier = Modifier.padding(vertical = 3.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Box(
                            modifier = Modifier
                                .padding(top = 6.dp)
                                .size(6.dp)
                                .background(role.accentColor, CircleShape)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = feature,
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            lineHeight = 16.sp
                        )
                    }
                }
            }

            AnimatedVisibility(
                visible = isSelected,
                enter = scaleIn(spring(stiffness = Spring.StiffnessMedium)) + fadeIn(),
                exit = scaleOut() + fadeOut()
            ) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .background(role.accentColor, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text("\u2713", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun RoleSelectionBackground() {
    val transition = rememberInfiniteTransition(label = "bgOrbs")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 6.283f,
        animationSpec = infiniteRepeatable(
            animation = tween(10000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "bgPhase"
    )

    Canvas(modifier = Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        drawCircle(
            color = MacherElectricCyan.copy(alpha = 0.04f),
            radius = w * 0.35f,
            center = Offset(w * 0.85f + sin(phase) * 15f, h * 0.2f)
        )
        drawCircle(
            color = MacherViolet.copy(alpha = 0.04f),
            radius = w * 0.3f,
            center = Offset(w * 0.15f + sin(phase * 0.7f) * 15f, h * 0.7f)
        )
    }
}
