package com.vocalshield.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vocalshield.android.domain.ConnectionState
import com.vocalshield.android.domain.IWebSocketClient
import com.vocalshield.android.domain.ThreatLevel
import com.vocalshield.android.repository.ICallRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * ViewModel for call monitoring screen.
 * Manages UI state for active call monitoring.
 * 
 * Requirements: 1.1, 3.1, 5.1, 5.5, 7.1
 */
class CallMonitorViewModel(
    private val callRepository: ICallRepository,
    private val webSocketClient: IWebSocketClient
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(CallMonitorUiState())
    val uiState: StateFlow<CallMonitorUiState> = _uiState.asStateFlow()
    
    private var callDurationJob: Job? = null
    
    init {
        // Observe threat level changes
        viewModelScope.launch {
            callRepository.getCurrentThreatLevel()
                .collect { threatLevel ->
                    _uiState.update { it.copy(threatLevel = threatLevel) }
                }
        }
        
        // Observe transcription updates
        viewModelScope.launch {
            callRepository.getTranscription()
                .collect { transcription ->
                    _uiState.update { it.copy(transcription = transcription) }
                }
        }
        
        // Observe connection state
        viewModelScope.launch {
            webSocketClient.getConnectionState()
                .collect { connectionState ->
                    _uiState.update { it.copy(connectionState = connectionState) }
                }
        }
    }
    
    /**
     * Start monitoring a call.
     */
    fun startMonitoring() {
        viewModelScope.launch {
            val callId = UUID.randomUUID().toString()
            val result = callRepository.startMonitoring(callId)
            
            if (result.isSuccess) {
                _uiState.update { 
                    it.copy(
                        isMonitoring = true,
                        errorMessage = null,
                        callDuration = 0
                    )
                }
                startCallDurationTimer()
            } else {
                _uiState.update { 
                    it.copy(
                        isMonitoring = false,
                        errorMessage = result.exceptionOrNull()?.message ?: "Failed to start monitoring"
                    )
                }
            }
        }
    }
    
    /**
     * Stop monitoring the current call.
     */
    fun stopMonitoring() {
        viewModelScope.launch {
            callRepository.stopMonitoring()
            callDurationJob?.cancel()
            
            _uiState.update { 
                it.copy(
                    isMonitoring = false,
                    threatLevel = ThreatLevel.SAFE,
                    transcription = "",
                    callDuration = 0,
                    errorMessage = null
                )
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
     * Start timer to track call duration.
     */
    private fun startCallDurationTimer() {
        callDurationJob = viewModelScope.launch {
            while (true) {
                delay(1000) // Update every second
                _uiState.update { 
                    it.copy(callDuration = it.callDuration + 1)
                }
            }
        }
    }
    
    override fun onCleared() {
        super.onCleared()
        callDurationJob?.cancel()
    }
}

/**
 * UI state for call monitoring screen.
 */
data class CallMonitorUiState(
    val isMonitoring: Boolean = false,
    val threatLevel: ThreatLevel = ThreatLevel.SAFE,
    val transcription: String = "",
    val connectionState: ConnectionState = ConnectionState.DISCONNECTED,
    val callDuration: Int = 0, // in seconds
    val errorMessage: String? = null
)
