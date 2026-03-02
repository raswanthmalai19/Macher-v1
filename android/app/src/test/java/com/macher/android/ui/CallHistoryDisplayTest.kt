package com.macher.android.ui

import com.macher.android.data.CallSession
import com.macher.android.domain.ThreatLevel
import com.macher.android.repository.ICallHistoryRepository
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldHaveSize
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
 * Unit tests for call history display functionality.
 * 
 * Tests validate Requirements 12.3, 12.5
 * Task 19.3: Write unit tests for call history display
 */
class CallHistoryDisplayTest : StringSpec({
    
    /**
     * Test history list rendering with multiple sessions.
     */
    "history list should render all call sessions" {
        runTest {
            // Arrange
            val sessions = listOf(
                CallSession(
                    id = "1",
                    timestamp = System.currentTimeMillis() - 3600000,
                    durationSeconds = 120,
                    finalThreatLevel = ThreatLevel.SAFE,
                    phoneNumber = "+1234567890"
                ),
                CallSession(
                    id = "2",
                    timestamp = System.currentTimeMillis() - 7200000,
                    durationSeconds = 180,
                    finalThreatLevel = ThreatLevel.CAUTION,
                    phoneNumber = "+0987654321"
                ),
                CallSession(
                    id = "3",
                    timestamp = System.currentTimeMillis() - 10800000,
                    durationSeconds = 90,
                    finalThreatLevel = ThreatLevel.DANGER,
                    phoneNumber = "+1122334455"
                )
            )
            
            val historyFlow = MutableStateFlow(sessions)
            val repository = mockk<ICallHistoryRepository> {
                every { getCallHistory() } returns historyFlow
                coEvery { clearHistory() } returns Result.success(Unit)
            }
            
            val viewModel = CallHistoryViewModel(repository)
            kotlinx.coroutines.delay(100) // Allow flow collection
            
            // Assert
            val state = viewModel.uiState.first()
            state.callSessions shouldHaveSize 3
            state.isEmpty shouldBe false
            state.callSessions shouldContain sessions[0]
            state.callSessions shouldContain sessions[1]
            state.callSessions shouldContain sessions[2]
        }
    }
    
    /**
     * Test empty history state.
     */
    "history list should show empty state when no sessions" {
        runTest {
            // Arrange
            val historyFlow = MutableStateFlow<List<CallSession>>(emptyList())
            val repository = mockk<ICallHistoryRepository> {
                every { getCallHistory() } returns historyFlow
                coEvery { clearHistory() } returns Result.success(Unit)
            }
            
            val viewModel = CallHistoryViewModel(repository)
            kotlinx.coroutines.delay(100)
            
            // Assert
            val state = viewModel.uiState.first()
            state.callSessions.shouldBeEmpty()
            state.isEmpty shouldBe true
        }
    }
    
    /**
     * Test clear history action.
     */
    "clear history should remove all sessions" {
        runTest {
            // Arrange
            val sessions = listOf(
                CallSession(
                    id = "1",
                    timestamp = System.currentTimeMillis(),
                    durationSeconds = 120,
                    finalThreatLevel = ThreatLevel.SAFE,
                    phoneNumber = "+1234567890"
                )
            )
            
            val historyFlow = MutableStateFlow(sessions)
            val repository = mockk<ICallHistoryRepository> {
                every { getCallHistory() } returns historyFlow
                coEvery { clearHistory() } coAnswers {
                    historyFlow.value = emptyList()
                    Result.success(Unit)
                }
            }
            
            val viewModel = CallHistoryViewModel(repository)
            kotlinx.coroutines.delay(100)
            
            // Verify initial state has sessions
            var state = viewModel.uiState.first()
            state.callSessions shouldHaveSize 1
            
            // Act - Clear history
            viewModel.clearHistory()
            kotlinx.coroutines.delay(100)
            
            // Assert
            state = viewModel.uiState.first()
            state.callSessions.shouldBeEmpty()
            state.isEmpty shouldBe true
            state.successMessage shouldNotBe null
            state.successMessage shouldBe "Call history cleared"
            
            coVerify { repository.clearHistory() }
        }
    }
    
    /**
     * Test filtering by SAFE threat level.
     */
    "filtering by SAFE should show only safe calls" {
        runTest {
            // Arrange
            val sessions = listOf(
                CallSession("1", System.currentTimeMillis(), 120, ThreatLevel.SAFE, "+1111111111"),
                CallSession("2", System.currentTimeMillis(), 180, ThreatLevel.CAUTION, "+2222222222"),
                CallSession("3", System.currentTimeMillis(), 90, ThreatLevel.DANGER, "+3333333333"),
                CallSession("4", System.currentTimeMillis(), 150, ThreatLevel.SAFE, "+4444444444")
            )
            
            val historyFlow = MutableStateFlow(sessions)
            val repository = mockk<ICallHistoryRepository> {
                every { getCallHistory() } returns historyFlow
                coEvery { clearHistory() } returns Result.success(Unit)
            }
            
            val viewModel = CallHistoryViewModel(repository)
            kotlinx.coroutines.delay(100)
            
            // Act - Set filter to SAFE
            viewModel.setFilter(ThreatLevel.SAFE)
            kotlinx.coroutines.delay(100)
            
            // Assert
            val state = viewModel.uiState.first()
            state.callSessions shouldHaveSize 2
            state.callSessions.all { it.finalThreatLevel == ThreatLevel.SAFE } shouldBe true
            state.currentFilter shouldBe ThreatLevel.SAFE
        }
    }
    
    /**
     * Test filtering by CAUTION threat level.
     */
    "filtering by CAUTION should show only caution calls" {
        runTest {
            // Arrange
            val sessions = listOf(
                CallSession("1", System.currentTimeMillis(), 120, ThreatLevel.SAFE, "+1111111111"),
                CallSession("2", System.currentTimeMillis(), 180, ThreatLevel.CAUTION, "+2222222222"),
                CallSession("3", System.currentTimeMillis(), 90, ThreatLevel.DANGER, "+3333333333"),
                CallSession("4", System.currentTimeMillis(), 150, ThreatLevel.CAUTION, "+4444444444")
            )
            
            val historyFlow = MutableStateFlow(sessions)
            val repository = mockk<ICallHistoryRepository> {
                every { getCallHistory() } returns historyFlow
                coEvery { clearHistory() } returns Result.success(Unit)
            }
            
            val viewModel = CallHistoryViewModel(repository)
            kotlinx.coroutines.delay(100)
            
            // Act - Set filter to CAUTION
            viewModel.setFilter(ThreatLevel.CAUTION)
            kotlinx.coroutines.delay(100)
            
            // Assert
            val state = viewModel.uiState.first()
            state.callSessions shouldHaveSize 2
            state.callSessions.all { it.finalThreatLevel == ThreatLevel.CAUTION } shouldBe true
            state.currentFilter shouldBe ThreatLevel.CAUTION
        }
    }
    
    /**
     * Test filtering by DANGER threat level.
     */
    "filtering by DANGER should show only danger calls" {
        runTest {
            // Arrange
            val sessions = listOf(
                CallSession("1", System.currentTimeMillis(), 120, ThreatLevel.SAFE, "+1111111111"),
                CallSession("2", System.currentTimeMillis(), 180, ThreatLevel.CAUTION, "+2222222222"),
                CallSession("3", System.currentTimeMillis(), 90, ThreatLevel.DANGER, "+3333333333"),
                CallSession("4", System.currentTimeMillis(), 150, ThreatLevel.DANGER, "+4444444444")
            )
            
            val historyFlow = MutableStateFlow(sessions)
            val repository = mockk<ICallHistoryRepository> {
                every { getCallHistory() } returns historyFlow
                coEvery { clearHistory() } returns Result.success(Unit)
            }
            
            val viewModel = CallHistoryViewModel(repository)
            kotlinx.coroutines.delay(100)
            
            // Act - Set filter to DANGER
            viewModel.setFilter(ThreatLevel.DANGER)
            kotlinx.coroutines.delay(100)
            
            // Assert
            val state = viewModel.uiState.first()
            state.callSessions shouldHaveSize 2
            state.callSessions.all { it.finalThreatLevel == ThreatLevel.DANGER } shouldBe true
            state.currentFilter shouldBe ThreatLevel.DANGER
        }
    }
    
    /**
     * Test clearing filter to show all sessions.
     */
    "clearing filter should show all sessions" {
        runTest {
            // Arrange
            val sessions = listOf(
                CallSession("1", System.currentTimeMillis(), 120, ThreatLevel.SAFE, "+1111111111"),
                CallSession("2", System.currentTimeMillis(), 180, ThreatLevel.CAUTION, "+2222222222"),
                CallSession("3", System.currentTimeMillis(), 90, ThreatLevel.DANGER, "+3333333333")
            )
            
            val historyFlow = MutableStateFlow(sessions)
            val repository = mockk<ICallHistoryRepository> {
                every { getCallHistory() } returns historyFlow
                coEvery { clearHistory() } returns Result.success(Unit)
            }
            
            val viewModel = CallHistoryViewModel(repository)
            kotlinx.coroutines.delay(100)
            
            // Act - Set filter then clear it
            viewModel.setFilter(ThreatLevel.DANGER)
            kotlinx.coroutines.delay(100)
            
            var state = viewModel.uiState.first()
            state.callSessions shouldHaveSize 1
            
            viewModel.setFilter(null)
            kotlinx.coroutines.delay(100)
            
            // Assert
            state = viewModel.uiState.first()
            state.callSessions shouldHaveSize 3
            state.currentFilter shouldBe null
        }
    }
    
    /**
     * Test error handling when clear history fails.
     */
    "clear history failure should set error message" {
        runTest {
            // Arrange
            val errorMessage = "Database error"
            val historyFlow = MutableStateFlow<List<CallSession>>(emptyList())
            val repository = mockk<ICallHistoryRepository> {
                every { getCallHistory() } returns historyFlow
                coEvery { clearHistory() } returns Result.failure(Exception(errorMessage))
            }
            
            val viewModel = CallHistoryViewModel(repository)
            kotlinx.coroutines.delay(100)
            
            // Act
            viewModel.clearHistory()
            kotlinx.coroutines.delay(100)
            
            // Assert
            val state = viewModel.uiState.first()
            state.errorMessage shouldNotBe null
            state.errorMessage shouldBe errorMessage
            state.successMessage shouldBe null
        }
    }
    
    /**
     * Test error clearing functionality.
     */
    "clearError should remove error message" {
        runTest {
            // Arrange
            val historyFlow = MutableStateFlow<List<CallSession>>(emptyList())
            val repository = mockk<ICallHistoryRepository> {
                every { getCallHistory() } returns historyFlow
                coEvery { clearHistory() } returns Result.failure(Exception("Test error"))
            }
            
            val viewModel = CallHistoryViewModel(repository)
            kotlinx.coroutines.delay(100)
            
            // Act - Trigger error
            viewModel.clearHistory()
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
     * Test success message clearing functionality.
     */
    "clearSuccess should remove success message" {
        runTest {
            // Arrange
            val historyFlow = MutableStateFlow<List<CallSession>>(emptyList())
            val repository = mockk<ICallHistoryRepository> {
                every { getCallHistory() } returns historyFlow
                coEvery { clearHistory() } returns Result.success(Unit)
            }
            
            val viewModel = CallHistoryViewModel(repository)
            kotlinx.coroutines.delay(100)
            
            // Act - Trigger success
            viewModel.clearHistory()
            kotlinx.coroutines.delay(100)
            
            var state = viewModel.uiState.first()
            state.successMessage shouldNotBe null
            
            // Act - Clear success
            viewModel.clearSuccess()
            kotlinx.coroutines.delay(50)
            
            // Assert
            state = viewModel.uiState.first()
            state.successMessage shouldBe null
        }
    }
    
    /**
     * Test that sessions display timestamp, duration, and threat level.
     */
    "sessions should include timestamp, duration, and threat level" {
        runTest {
            // Arrange
            val timestamp = System.currentTimeMillis()
            val duration = 240
            val threatLevel = ThreatLevel.CAUTION
            val phoneNumber = "+1234567890"
            
            val session = CallSession(
                id = "test-1",
                timestamp = timestamp,
                durationSeconds = duration,
                finalThreatLevel = threatLevel,
                phoneNumber = phoneNumber
            )
            
            val historyFlow = MutableStateFlow(listOf(session))
            val repository = mockk<ICallHistoryRepository> {
                every { getCallHistory() } returns historyFlow
                coEvery { clearHistory() } returns Result.success(Unit)
            }
            
            val viewModel = CallHistoryViewModel(repository)
            kotlinx.coroutines.delay(100)
            
            // Assert
            val state = viewModel.uiState.first()
            state.callSessions shouldHaveSize 1
            
            val displayedSession = state.callSessions[0]
            displayedSession.timestamp shouldBe timestamp
            displayedSession.durationSeconds shouldBe duration
            displayedSession.finalThreatLevel shouldBe threatLevel
            displayedSession.phoneNumber shouldBe phoneNumber
        }
    }
})
