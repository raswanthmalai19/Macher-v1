package com.vocalshield.android.ui.screens.onboarding

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vocalshield.android.ui.theme.*
import androidx.compose.foundation.border
import kotlinx.coroutines.delay

/**
 * Onboarding welcome screen
 */
@Composable
fun OnboardingScreen(
    onContinue: () -> Unit
) {
    var showContent by remember { mutableStateOf(false) }
    
    LaunchedEffect(Unit) {
        delay(300)
        showContent = true
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        AnimatedVisibility(
            visible = showContent,
            enter = fadeIn(animationSpec = tween(800)) + slideInVertically(
                initialOffsetY = { it / 2 },
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessLow
                )
            )
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Shield Icon
                Text(
                    text = "🛡️",
                    fontSize = 120.sp,
                    modifier = Modifier.padding(bottom = 32.dp)
                )
                
                // App Name
                Text(
                    text = "MACHER",
                    fontSize = 48.sp,
                    fontWeight = FontWeight.Bold,
                    color = MacherElectricCyan,
                    textAlign = TextAlign.Center,
                    letterSpacing = 8.sp
                )
                
                Spacer(modifier = Modifier.height(12.dp))
                
                // Tagline
                Text(
                    text = "AI Voice Fraud Firewall",
                    fontSize = 16.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    letterSpacing = 2.sp,
                    modifier = Modifier.padding(horizontal = 24.dp)
                )
                
                Spacer(modifier = Modifier.height(64.dp))
                
                // Features
                FeatureItem(
                    icon = "🎯",
                    title = "Real-Time Protection",
                    description = "AI analyzes calls as they happen"
                )
                
                Spacer(modifier = Modifier.height(24.dp))
                
                FeatureItem(
                    icon = "🔒",
                    title = "Privacy First",
                    description = "Never stores your call audio"
                )
                
                Spacer(modifier = Modifier.height(24.dp))
                
                FeatureItem(
                    icon = "👨‍👩‍👧‍👦",
                    title = "Family Protection",
                    description = "Guardians can monitor loved ones"
                )
                
                Spacer(modifier = Modifier.height(64.dp))
                
                // Continue Button
                Button(
                    onClick = onContinue,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(64.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MacherElectricCyan
                    ),
                    shape = RoundedCornerShape(32.dp)
                ) {
                    Text(
                        text = "Get Started",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.background
                    )
                }
            }
        }
    }
}

@Composable
fun FeatureItem(
    icon: String,
    title: String,
    description: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(16.dp)
            )
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
            .padding(20.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = icon,
            fontSize = 32.sp,
            modifier = Modifier.padding(end = 16.dp)
        )
        
        Column {
            Text(
                text = title,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = description,
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
    }
}
