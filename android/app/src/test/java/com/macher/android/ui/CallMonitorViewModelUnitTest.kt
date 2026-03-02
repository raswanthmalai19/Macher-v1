package com.macher.android.ui

import com.macher.android.domain.ConnectionState
import com.macher.android.domain.IWebSocketClient
import com.macher.android.domain.ThreatLevel
import com.macher.android.repository.ICallRepository
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest

/**
 * Unit tests for CallMonitorViewModel state transitions.
 * 
 * Tests validate Requirements 1.1, 5.1
 * Task 14.2: Write unit tests for ViewModel state transitions
 */
class CallMonitorViewModelUnitTest : StringSpec({
    
    /**
     * Test monitoring start updates state correctly.
     */
    "monitoring start should update isMonitoring to true" {
        runTest {
            // Arrange
            val callRepository = mockk<ICallRepository> {
                every { getCurrentThreatLevel() } returns MutableStateFlow(ThreatLevel.SAFE)
                every { getTranscription() } returns MutableStateFlow("")
                coEvery { startMonitoring(any()) } returns Result.success(Unit)
                coEvery { stopMonitoring() } returns Result.success(Unit)
                every { isMonitoring() } returns false
            }
            
            val webSocketClient = mockk<IWebSocketClient> {
                every { getConnectionState() } returns MutableStateFlow(ConnectionState.DISCONNECTED)
            }
            
            val viewModel = CallMonitorViewModel(callRepository, webSocketClient)
            
            // Act
            viewModel.startMonitoring()
            kotlinx.coroutines.delay(100) // Allow coroutine to complete
            
            // Assert
            val state = viewModel.uiState.first()
            state.isMonitoring shouldBe true
            state.errorMessage shouldBe null
            state.callDuration shouldBe 0
            
            coVerify { callRepository.startMonitoring(any()) }
        }
    }
    
    /**
     * Test monitoring stop updates state correctly.
     */
    "monitoring stop should update isMonitoring to false and reset state" {
        runTest {
            // Arrange
            val threatLevelFlow = MutableStateFlow(ThreatLevel.DANGER)
            val transcriptionFlow = MutableStateFlow("Test transcription")
            
            val callRepository = mockk<ICallRepository> {
                every { getCurrentThreatLevel() } returns threatLevelFlow
                every { getTranscription() } returns transcriptionFlow
                coEvery { startMonitoring(any()) } returns Result.success(Unit)
                coEvery { stopMonitoring() } returns Result.success(Unit)
                every { isMonitoring() } returns true
            }
            
            val webSocketClient = mockk<IWebSocketClient> {
                every { getConnectionState() } returns MutableStateFlow(ConnectionState.CONNECTED)
            }
            
            val viewModel = CallMonitorViewModel(callRepository, webSocketClient)
            
            // Start monitoring first
            viewModel.startMonitoring()
            kotlinx.coroutines.delay(100)
            
            // Act - Stop monitoring
            viewModel.stopMonitoring()
            kotlinx.coroutines.delay(100)
            
            // Assert
            val state = viewModel.uiState.first()
            state.isMonitoring shouldBe false
            state.threatLevel shouldBe ThreatLevel.SAFE
            state.transcription shouldBe ""
            state.callDuration shouldBe 0
            state.errorMessage shouldBe null
            
            coVerify { callRepository.stopMonitoring() }
        }
    }
    
    /**
     * Test threat level updates propagate to UI state.
     */
    "threat level changes should update UI state" {
        runTest {
            // Arrange
            val threatLevelFlow = MutableStateFlow(ThreatLevel.SAFE)
            
            val callRepository = mockk<ICallRepository> {
                every { getCurrentThreatLevel() } returns threatLevelFlow
                every { getTranscription() } returns MutableStateFlow("")
                coEvery { startMonitoring(any()) } returns Result.success(Unit)
                coEvery { stopMonitoring() } returns Result.success(Unit)
                every { isMonitoring() } returns false
            }
            
            val webSocketClient = mockk<IWebSocketClient> {
                every { getConnectionState() } returns MutableStateFlow(ConnectionState.CONNECTED)
            }
            
            val viewModel = CallMonitorViewModel(callRepository, webSocketClient)
            
            // Act - Change threat level to CAUTION
            threatLevelFlow.value = ThreatLevel.CAUTION
            kotlinx.coroutines.delay(50)
            
            // Assert
            var state = viewModel.uiState.first()
            state.threatLevel shouldBe ThreatLevel.CAUTION
            
            // Act - Change threat level to DANGER
            threatLevelFlow.value = ThreatLevel.DANGER
            kotlinx.coroutines.delay(50)
            
            // Assert
            state = viewModel.uiState.first()
            state.threatLevel shouldBe ThreatLevel.DANGER
        }
    }
    
    /**
     * Test connection state changes propagate to UI state.
     */
    "connection state changes should update UI state" {
        runTest {
            // Arrange
            val connectionStateFlow = MutableStateFlow(ConnectionState.DISCONNECTED)
            
            val callRepository = mockk<ICallRepository> {
                every { getCurrentThreatLevel() } returns MutableStateFlow(ThreatLevel.SAFE)
                every { getTranscription() } returns MutableStateFlow("")
                coEvery { startMonitoring(any()) } returns Result.success(Unit)
                coEvery { stopMonitoring() } returns Result.success(Unit)
                every { isMonitoring() } returns false
            }
            
            val webSocketClient = mockk<IWebSocketClient> {
                every { getConnectionState() } returns connectionStateFlow
            }
            
            val viewModel = CallMonitorViewModel(callRepository, webSocketClient)
            
            // Act - Change connection state to CONNECTING
            connectionStateFlow.value = ConnectionState.CONNECTING
            kotlinx.coroutines.delay(50)
            
            // Assert
            var state = viewModel.uiState.first()
            state.connectionState shouldBe ConnectionState.CONNECTING
            
            // Act - Change connection state to CONNECTED
            connectionStateFlow.value = ConnectionState.CONNECTED
            kotlinx.coroutines.delay(50)
            
            // Assert
            state = viewModel.uiState.first()
            state.connectionState shouldBe ConnectionState.CONNECTED
            
            // Act - Change connection state to ERROR
            connectionStateFlow.value = ConnectionState.ERROR
            kotlinx.coroutines.delay(50)
            
            // Assert
            state = viewModel.uiState.first()
            state.connectionState shouldBe ConnectionState.ERROR
        }
    }
    
    /**
     * Test error handling when monitoring start fails.
     */
    "monitoring start failure should set error message" {
        runTest {
            // Arrange
            val errorMessage = "Failed to start audio capture"
            val callRepository = mockk<ICallRepository> {
                every { getCurrentThreatLevel() } returns MutableStateFlow(ThreatLevel.SAFE)
                every { getTranscription() } returns MutableStateFlow("")
                coEvery { startMonitoring(any()) } returns Result.failure(Exception(errorMessage))
                coEvery { stopMonitoring() } returns Result.success(Unit)
                every { isMonitoring() } returns false
            }
            
            val webSocketClient = mockk<IWebSocketClient> {
                every { getConnectionState() } returns MutableStateFlow(ConnectionState.DISCONNECTED)
            }
            
            val viewModel = CallMonitorViewModel(callRepository, webSocketClient)
            
            // Act
            viewModel.startMonitoring()
            kotlinx.coroutines.delay(100)
            
            // Assert
            val state = viewModel.uiState.first()
            state.isMonitoring shouldBe false
            state.errorMessage shouldNotBe null
            state.errorMessage shouldBe errorMessage
        }
    }
    
    /**
     * Test error clearing functionality.
     */
    "clearError should remove error message from state" {
        runTest {
            // Arrange
            val callRepository = mockk<ICallRepository> {
                every { getCurrentThreatLevel() } returns MutableStateFlow(ThreatLevel.SAFE)
                every { getTranscription() } returns MutableStateFlow("")
                coEvery { startMonitoring(any()) } returns Result.failure(Exception("Test error"))
                coEvery { stopMonitoring() } returns Result.success(Unit)
                every { isMonitoring() } returns false
            }
            
            val webSocketClient = mockk<IWebSocketClient> {
                every { getConnectionState() } returns MutableStateFlow(ConnectionState.DISCONNECTED)
            }
            
            val viewModel = CallMonitorViewModel(callRepository, webSocketClient)
            
            // Act - Trigger error
            viewModel.startMonitoring()
            kotlinx.coroutines.delay(100)
            
            var state = viewModel.uiState.first()
            state.errorMessage shouldNotBe null
            
            // Act - Clear error
            viewModel.clearError()
            kotlinx.coroutines.delay(50)
            
            // Assert
            state = viewModel.uiState.first()
            state.errorMessage shouldBe null
        }
    }
    
    /**
     * Test call duration timer increments correctly.
     */
    "call duration should increment every second during monitoring" {
        runTest {
            // Arrange
            val callRepository = mockk<ICallRepository> {
                every { getCurrentThreatLevel() } returns MutableStateFlow(ThreatLevel.SAFE)
                every { getTranscription() } returns MutableStateFlow("")
                coEvery { startMonitoring(any()) } returns Result.success(Unit)
                coEvery { stopMonitoring() } returns Result.success(Unit)
                every { isMonitoring() } returns true
            }
            
            val webSocketClient = mockk<IWebSocketClient> {
                every { getConnectionState() } returns MutableStateFlow(ConnectionState.CONNECTED)
            }
            
            val viewModel = CallMonitorViewModel(callRepository, webSocketClient)
            
            // Act - Start monitoring
            viewModel.startMonitoring()
            kotlinx.coroutines.delay(100)
            
            val initialState = viewModel.uiState.first()
            initialState.callDuration shouldBe 0
            
            // Wait for timer to increment
            kotlinx.coroutines.delay(2500) // Wait 2.5 seconds
            
            // Assert - Duration should have incremented
            val updatedState = viewModel.uiState.first()
            updatedState.callDuration shouldBe { it >= 2 } // At least 2 seconds
        }
    }
})
