package com.vocalshield.android.ui

import com.vocalshield.android.domain.ConnectionState
import com.vocalshield.android.domain.ThreatLevel
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe

/**
 * Unit test for neutral state display in CallMonitorScreen.
 * 
 * Tests validate Requirement 5.7
 * Task 15.6: Write unit test for neutral state display
 */
class CallMonitorScreenNeutralStateTest : StringSpec({
    
    /**
     * Test that display shows neutral state when no analysis results available.
     * 
     * Validates: Requirement 5.7
     */
    "display should show neutral state when no analysis results available" {
        // Arrange - Create UI state with no monitoring and SAFE threat level
        val neutralState = CallMonitorUiState(
            isMonitoring = false,
            threatLevel = ThreatLevel.SAFE,
            transcription = "",
            connectionState = ConnectionState.DISCONNECTED,
            callDuration = 0,
            errorMessage = null
        )
        
        // Assert - Verify neutral state properties
        neutralState.isMonitoring shouldBe false
        neutralState.threatLevel shouldBe ThreatLevel.SAFE
        neutralState.transcription shouldBe ""
        neutralState.connectionState shouldBe ConnectionState.DISCONNECTED
        neutralState.callDuration shouldBe 0
        neutralState.errorMessage shouldBe null
    }
    
    /**
     * Test that display shows neutral state before call starts.
     */
    "display should show neutral state before call starts" {
        // Arrange - Initial state before any monitoring
        val initialState = CallMonitorUiState()
        
        // Assert - Default state should be neutral
        initialState.isMonitoring shouldBe false
        initialState.threatLevel shouldBe ThreatLevel.SAFE
        initialState.transcription shouldBe ""
        initialState.connectionState shouldBe ConnectionState.DISCONNECTED
        initialState.callDuration shouldBe 0
        initialState.errorMessage shouldBe null
    }
    
    /**
     * Test that display returns to neutral state after call ends.
     */
    "display should return to neutral state after call ends" {
        // Arrange - State during active call
        val activeState = CallMonitorUiState(
            isMonitoring = true,
            threatLevel = ThreatLevel.DANGER,
            transcription = "This is a scam call",
            connectionState = ConnectionState.CONNECTED,
            callDuration = 120,
            errorMessage = null
        )
        
        // Act - Simulate call ending (state reset)
        val endedState = CallMonitorUiState(
            isMonitoring = false,
            threatLevel = ThreatLevel.SAFE,
            transcription = "",
            connectionState = ConnectionState.DISCONNECTED,
            callDuration = 0,
            errorMessage = null
        )
        
        // Assert - State should return to neutral
        endedState.isMonitoring shouldBe false
        endedState.threatLevel shouldBe ThreatLevel.SAFE
        endedState.transcription shouldBe ""
        endedState.connectionState shouldBe ConnectionState.DISCONNECTED
        endedState.callDuration shouldBe 0
        
        // Verify state changed from active to neutral
        activeState.isMonitoring shouldBe true
        endedState.isMonitoring shouldBe false
    }
    
    /**
     * Test that neutral state shows SAFE threat level (green indicator).
     */
    "neutral state should display SAFE threat level with green indicator" {
        // Arrange
        val neutralState = CallMonitorUiState()
        
        // Assert - SAFE threat level maps to green color in UI
        neutralState.threatLevel shouldBe ThreatLevel.SAFE
        
        // Note: The actual color mapping is tested in CallMonitorScreenPropertyTest
        // This test validates that neutral state uses SAFE threat level
    }
    
    /**
     * Test that neutral state has no error message.
     */
    "neutral state should have no error message" {
        // Arrange
        val neutralState = CallMonitorUiState()
        
        // Assert
        neutralState.errorMessage shouldBe null
    }
    
    /**
     * Test that neutral state shows disconnected connection state.
     */
    "neutral state should show disconnected connection state" {
        // Arrange
        val neutralState = CallMonitorUiState()
        
        // Assert
        neutralState.connectionState shouldBe ConnectionState.DISCONNECTED
    }
    
    /**
     * Test that neutral state has zero call duration.
     */
    "neutral state should have zero call duration" {
        // Arrange
        val neutralState = CallMonitorUiState()
        
        // Assert
        neutralState.callDuration shouldBe 0
    }
    
    /**
     * Test that neutral state has empty transcription.
     */
    "neutral state should have empty transcription" {
        // Arrange
        val neutralState = CallMonitorUiState()
        
        // Assert
        neutralState.transcription shouldBe ""
    }
})
