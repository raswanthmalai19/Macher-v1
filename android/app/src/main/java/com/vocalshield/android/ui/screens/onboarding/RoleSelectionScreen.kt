package com.vocalshield.android.ui.screens.onboarding

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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

/**
 * Role selection screen - Choose between Protected User or Guardian
 */
@Composable
fun RoleSelectionScreen(
    onRoleSelected: (String) -> Unit
) {
    var selectedRole by remember { mutableStateOf<String?>(null) }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Title
            Text(
                text = "Who will use this app?",
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )
            
            Text(
                text = "Choose your role to get started",
                fontSize = 16.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp, bottom = 48.dp)
            )
            
            // Protected User Card
            RoleCard(
                icon = "👴",
                title = "I need protection",
                subtitle = "Protected User",
                description = "I want MACHER to monitor my calls and protect me from scams",
                isSelected = selectedRole == "PROTECTED",
                onClick = { selectedRole = "PROTECTED" }
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Guardian Card
            RoleCard(
                icon = "👨‍👩‍👧",
                title = "I'm protecting someone",
                subtitle = "Guardian",
                description = "I want to monitor and manage protection for my family member",
                isSelected = selectedRole == "GUARDIAN",
                onClick = { selectedRole = "GUARDIAN" }
            )
            
            Spacer(modifier = Modifier.height(48.dp))
            
            // Continue Button
            AnimatedVisibility(
                visible = selectedRole != null,
                enter = fadeIn() + expandVertically()
            ) {
                Button(
                    onClick = { selectedRole?.let { onRoleSelected(it) } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(64.dp)
                        .shadow(12.dp, RoundedCornerShape(32.dp)),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MacherElectricCyan
                    ),
                    shape = RoundedCornerShape(32.dp)
                ) {
                    Text(
                        text = "Continue",
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
fun RoleCard(
    icon: String,
    title: String,
    subtitle: String,
    description: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val borderColor = if (isSelected) MacherElectricCyan else MaterialTheme.colorScheme.outlineVariant
    val backgroundColor = if (isSelected) {
        MacherElectricCyan.copy(alpha = 0.08f)
    } else {
        MaterialTheme.colorScheme.surface
    }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(if (isSelected) 16.dp else 8.dp, RoundedCornerShape(24.dp))
            .border(3.dp, borderColor, RoundedCornerShape(24.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(
            containerColor = backgroundColor
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Icon
            Text(
                text = icon,
                fontSize = 64.sp,
                modifier = Modifier.padding(bottom = 16.dp)
            )
            
            // Title
            Text(
                text = title,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )
            
            // Subtitle
            Text(
                text = subtitle,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = VibrantBlue,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 4.dp)
            )
            
            // Description
            Text(
                text = description,
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 12.dp)
            )
            
            // Selected indicator
            if (isSelected) {
                Row(
                    modifier = Modifier
                        .padding(top = 16.dp)
                        .background(
                            color = VibrantBlue,
                            shape = RoundedCornerShape(12.dp)
                        )
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "✓",
                        fontSize = 16.sp,
                        color = Color.White,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text(
                        text = "Selected",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}
