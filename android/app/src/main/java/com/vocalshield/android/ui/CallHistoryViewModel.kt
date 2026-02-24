package com.vocalshield.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vocalshield.android.data.CallSession
import com.vocalshield.android.domain.ThreatLevel
import com.vocalshield.android.repository.ICallHistoryRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * ViewModel for call history screen.
 * Manages call history display, filtering, and clearing.
 * 
 * Requirements: 12.3, 12.5
 */
class CallHistoryViewModel(
    private val callHistoryRepository: ICallHistoryRepository
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(CallHistoryUiState())
    val uiState: StateFlow<CallHistoryUiState> = _uiState.asStateFlow()
    
    private val _filterLevel = MutableStateFlow<ThreatLevel?>(null)
    
    init {
        // Observe call history with filtering
        viewModelScope.launch {
            combine(
                callHistoryRepository.getCallHistory(),
                _filterLevel
            ) { sessions, filter ->
                if (filter == null) {
                    sessions
                } else {
                    sessions.filter { it.finalThreatLevel == filter }
                }
            }.collect { filteredSessions ->
                _uiState.update { 
                    it.copy(
                        callSessions = filteredSessions,
                        isEmpty = filteredSessions.isEmpty()
                    )
                }
            }
        }
    }
    
    /**
     * Set threat level filter.
     * Pass null to show all sessions.
     */
    fun setFilter(threatLevel: ThreatLevel?) {
        _filterLevel.value = threatLevel
        _uiState.update { it.copy(currentFilter = threatLevel) }
    }
    
    /**
     * Clear all call history.
     */
    fun clearHistory() {
        viewModelScope.launch {
            val result = callHistoryRepository.clearHistory()
            
            if (result.isSuccess) {
                _uiState.update { 
                    it.copy(
                        errorMessage = null,
                        successMessage = "Call history cleared"
                    )
                }
            } else {
                _uiState.update { 
                    it.copy(
                        errorMessage = result.exceptionOrNull()?.message ?: "Failed to clear history"
                    )
                }
            }
        }
    }
    
    /**
     * Clear error message.
     */
    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
    
    /**
     * Clear success message.
     */
    fun clearSuccess() {
        _uiState.update { it.copy(successMessage = null) }
    }
}

/**
 * UI state for call history screen.
 */
data class CallHistoryUiState(
    val callSessions: List<CallSession> = emptyList(),
    val currentFilter: ThreatLevel? = null,
    val isEmpty: Boolean = true,
    val errorMessage: String? = null,
    val successMessage: String? = null
)
