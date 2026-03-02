package com.macher.android.data.model

/**
 * User roles in the MACHER app
 */
enum class UserRole {
    /**
     * Protected user - vulnerable person being monitored
     * (e.g., elderly parent, grandparent)
     */
    PROTECTED,
    
    /**
     * Guardian - family member who monitors and manages settings
     * (e.g., adult child, caregiver)
     */
    GUARDIAN,
    
    /**
     * Not set - first launch, needs to choose role
     */
    NOT_SET
}

/**
 * User profile data
 */
data class UserProfile(
    val userId: String,
    val role: UserRole,
    val name: String,
    val phoneNumber: String,
    val linkedUserId: String? = null, // For guardian-protected pairing
    val createdAt: Long = System.currentTimeMillis()
)

/**
 * App mode based on user role
 */
enum class AppMode {
    PROTECTED_MODE,  // Simple monitoring interface
    GUARDIAN_MODE    // Full dashboard and controls
}
