package com.macher.android.ui.screens.onboarding

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.macher.android.ui.theme.*
import kotlinx.coroutines.launch
import kotlin.math.absoluteValue
import kotlin.math.sin

private data class OnboardingPage(
    val icon: String,
    val title: String,
    val subtitle: String,
    val description: String,
    val accentColor: Color,
    val glowColor: Color
)

private val pages = listOf(
    OnboardingPage(
        icon = "\uD83D\uDEE1\uFE0F",
        title = "MACHER",
        subtitle = "AI Voice Fraud Firewall",
        description = "Military-grade AI protection against phone scams. Designed for everyone \u2014 simple enough for anyone to use.",
        accentColor = MacherElectricCyan,
        glowColor = CyanGlow
    ),
    OnboardingPage(
        icon = "\uD83C\uDFAF",
        title = "Real-Time\nDetection",
        subtitle = "Multi-Layer AI Engine",
        description = "Analyzes voice patterns, speech manipulation, and metadata in real-time during every call. Instant threat alerts.",
        accentColor = SafeGreen,
        glowColor = GreenGlow
    ),
    OnboardingPage(
        icon = "\uD83D\uDD12",
        title = "Zero-Knowledge\nPrivacy",
        subtitle = "Your Voice Stays Yours",
        description = "We never record or store your calls. All analysis happens locally on your device. Not even we can access your data.",
        accentColor = MacherViolet,
        glowColor = VioletGlow
    ),
    OnboardingPage(
        icon = "\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66",
        title = "Family\nProtection",
        subtitle = "Guardian Mode",
        description = "Protect your loved ones remotely. Get instant alerts when a scam is detected on their phone. Peace of mind for the whole family.",
        accentColor = AccentPink,
        glowColor = RedGlow
    )
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun OnboardingScreen(
    onContinue: () -> Unit
) {
    val pagerState = rememberPagerState(pageCount = { pages.size })
    val scope = rememberCoroutineScope()
    val currentPage = pagerState.currentPage

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        OnboardingFloatingOrbs(
            accentColor = pages[currentPage].accentColor,
            glowColor = pages[currentPage].glowColor
        )

        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.End
            ) {
                AnimatedVisibility(
                    visible = currentPage < pages.size - 1,
                    enter = fadeIn(),
                    exit = fadeOut()
                ) {
                    TextButton(onClick = {
                        scope.launch { pagerState.animateScrollToPage(pages.size - 1) }
                    }) {
                        Text(
                            "Skip",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 16.sp
                        )
                    }
                }
            }

            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) { page ->
                val pageOffset = (pagerState.currentPage - page) + pagerState.currentPageOffsetFraction

                OnboardingPageContent(
                    page = pages[page],
                    pageOffset = pageOffset
                )
            }

            Row(
                modifier = Modifier.padding(bottom = 24.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                pages.forEachIndexed { index, pg ->
                    val isActive = index == currentPage
                    val width by animateDpAsState(
                        targetValue = if (isActive) 28.dp else 8.dp,
                        animationSpec = spring(
                            dampingRatio = Spring.DampingRatioMediumBouncy,
                            stiffness = Spring.StiffnessMedium
                        ),
                        label = "dotWidth"
                    )
                    val color by animateColorAsState(
                        targetValue = if (isActive) pg.accentColor else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f),
                        animationSpec = tween(300),
                        label = "dotColor"
                    )

                    Box(
                        modifier = Modifier
                            .padding(horizontal = 4.dp)
                            .height(8.dp)
                            .width(width)
                            .clip(CircleShape)
                            .background(color)
                    )
                }
            }

            val buttonColor by animateColorAsState(
                targetValue = pages[currentPage].accentColor,
                animationSpec = tween(400),
                label = "btnColor"
            )
            val isLastPage = currentPage == pages.size - 1

            Button(
                onClick = {
                    if (isLastPage) {
                        onContinue()
                    } else {
                        scope.launch { pagerState.animateScrollToPage(currentPage + 1) }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp)
                    .padding(bottom = 48.dp)
                    .height(64.dp),
                colors = ButtonDefaults.buttonColors(containerColor = buttonColor),
                shape = RoundedCornerShape(32.dp),
                elevation = ButtonDefaults.buttonElevation(
                    defaultElevation = 8.dp,
                    pressedElevation = 2.dp
                )
            ) {
                Text(
                    text = if (isLastPage) "Get Started" else "Next",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (buttonColor == SafeGreen || buttonColor == MacherElectricCyan)
                        Color(0xFF050D1A) else Color.White
                )
            }
        }
    }
}

@Composable
private fun OnboardingPageContent(
    page: OnboardingPage,
    pageOffset: Float
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp)
            .graphicsLayer {
                translationX = pageOffset * 200f
                alpha = 1f - pageOffset.absoluteValue.coerceAtMost(1f) * 0.5f
                scaleX = 1f - pageOffset.absoluteValue.coerceAtMost(1f) * 0.15f
                scaleY = 1f - pageOffset.absoluteValue.coerceAtMost(1f) * 0.15f
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier.size(160.dp),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .size(160.dp)
                    .blur(24.dp)
                    .background(
                        page.glowColor.copy(alpha = 0.35f),
                        CircleShape
                    )
            )
            Box(
                modifier = Modifier
                    .size(140.dp)
                    .border(
                        width = 2.dp,
                        brush = Brush.sweepGradient(
                            colors = listOf(
                                page.accentColor,
                                page.accentColor.copy(alpha = 0.3f),
                                page.accentColor
                            )
                        ),
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text(text = page.icon, fontSize = 72.sp)
            }
        }

        Spacer(modifier = Modifier.height(40.dp))

        Surface(
            color = page.accentColor.copy(alpha = 0.12f),
            shape = RoundedCornerShape(20.dp)
        ) {
            Text(
                text = page.subtitle,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = page.accentColor,
                letterSpacing = 1.sp,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
            )
        }

        Spacer(modifier = Modifier.height(20.dp))

        Text(
            text = page.title,
            fontSize = 36.sp,
            fontWeight = FontWeight.Black,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
            lineHeight = 42.sp
        )

        Spacer(modifier = Modifier.height(20.dp))

        Text(
            text = page.description,
            fontSize = 16.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            lineHeight = 24.sp,
            modifier = Modifier.padding(horizontal = 8.dp)
        )
    }
}

@Composable
private fun OnboardingFloatingOrbs(
    accentColor: Color,
    glowColor: Color
) {
    val transition = rememberInfiniteTransition(label = "orbTransition")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 6.283f,
        animationSpec = infiniteRepeatable(
            animation = tween(8000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "phase"
    )
    val animatedAccent by animateColorAsState(
        targetValue = accentColor,
        animationSpec = tween(600),
        label = "orbAccent"
    )
    val animatedGlow by animateColorAsState(
        targetValue = glowColor,
        animationSpec = tween(600),
        label = "orbGlow"
    )

    Canvas(modifier = Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height

        drawCircle(
            color = animatedAccent.copy(alpha = 0.06f),
            radius = w * 0.4f,
            center = Offset(
                w * 0.8f + sin(phase) * 20f,
                h * 0.15f + sin(phase * 0.7f) * 15f
            )
        )
        drawCircle(
            color = animatedGlow.copy(alpha = 0.08f),
            radius = w * 0.3f,
            center = Offset(
                w * 0.2f + sin(phase * 0.5f) * 25f,
                h * 0.75f + sin(phase * 0.9f) * 20f
            )
        )
        drawCircle(
            color = animatedAccent.copy(alpha = 0.04f),
            radius = w * 0.18f,
            center = Offset(
                w * 0.5f + sin(phase * 1.3f) * 15f,
                h * 0.5f + sin(phase * 0.6f) * 10f
            )
        )
    }
}
