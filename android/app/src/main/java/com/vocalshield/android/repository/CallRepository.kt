package com.vocalshield.android.repository

import android.util.Log
import com.vocalshield.android.data.CallSessionEntity
import com.vocalshield.android.domain.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Call repository orchestrates the audio pipeline:
 * Audio Capture → Audio Processing → WebSocket Streaming → Fraud Analysis → Alerts
 * 
 * Privacy-First:
 * - Audio is NEVER stored
 * - Audio is processed in RAM only
 * - Call metadata saved (no audio)
 * 
 * Requirements: 1.1, 2.1, 3.1, 3.3, 5.5, 6.1, 9.1, 12.1
 */
class CallRepository(
    private val audioCaptureService: IAudioCaptureService,
    private val audioProcessor: IAudioProcessor,
    private val webSocketClient: IWebSocketClient,
    private val hapticController: IHapticController,
    private val notificationService: INotificationService,
    private val callHistoryRepository: ICallHistoryRepository,
    private val settingsRepository: ISettingsRepository
) : ICallRepository {
    
    companion object {
        private const val TAG = "CallRepository"
    }
    
    private val repositoryScope = CoroutineScope(Dispatchers.Default + Job())
    
    private val _currentThreatLevel = MutableStateFlow(ThreatLevel.SAFE)
    private val _transcription = MutableStateFlow("")
    private var _isMonitoring = false
    private var _isOffline = false
    
    private var currentCallId: String? = null
    private var callStartTime: Long = 0
    private var audioPipelineJob: Job? = null
    private var fraudResultsJob: Job? = null
    private var connectionStateJob: Job? = null
    
    override suspend fun startMonitoring(callId: String): Result<Unit> {
        return try {
            // Check user consent
            if (!settingsRepository.hasUserConsent()) {
                Log.w(TAG, "Cannot start monitoring - no user consent")
                return Result.failure(Exception("User consent required"))
            }
            
            // Check if monitoring is enabled
            val monitoringEnabled = settingsRepository.isMonitoringEnabled().first()
            if (!monitoringEnabled) {
                Log.w(TAG, "Cannot start monitoring - monitoring disabled")
                return Result.failure(Exception("Monitoring is disabled"))
            }
            
            if (_isMonitoring) {
                Log.w(TAG, "Already monitoring a call")
                return Result.success(Unit)
            }
            
            currentCallId = callId
            callStartTime = System.currentTimeMillis()
            _isMonitoring = true
            
            // Reset state
            _currentThreatLevel.value = ThreatLevel.SAFE
            _transcription.value = ""
            _isOffline = false
            
            // Connect WebSocket
            val authToken = "dummy-token" // TODO: Get real auth token from Cognito
            val connectResult = webSocketClient.connect(authToken)
            if (connectResult.isFailure) {
                Log.e(TAG, "Failed to connect WebSocket - offline mode", connectResult.exceptionOrNull())
                _isOffline = true
                notificationService.showThreatNotification(
                    ThreatLevel.CAUTION,
                    "Fraud detection unavailable - no network connection"
                )
                // Don't start audio capture when offline
                _isMonitoring = false
                return connectResult
            }
            
            // Start monitoring connection state
            startConnectionStateMonitor()
            
            // Start audio capture
            val captureResult = audioCaptureService.startCapture(callId)
            if (captureResult.isFailure) {
                Log.e(TAG, "Failed to start audio capture", captureResult.exceptionOrNull())
                webSocketClient.disconnect()
                _isMonitoring = false
                return captureResult
            }
            
            // Start audio pipeline: capture → process → stream
            startAudioPipeline()
            
            // Start listening for fraud results
            startFraudResultsListener()
            
            Log.i(TAG, "Monitoring started for call: $callId")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error starting monitoring", e)
            _isMonitoring = false
            Result.failure(e)
        }
    }
    
    override suspend fun stopMonitoring(): Result<Unit> {
        return try {
            if (!_isMonitoring) {
                return Result.success(Unit)
            }
            
            _isMonitoring = false
            
            // Stop jobs
            audioPipelineJob?.cancel()
            fraudResultsJob?.cancel()
            connectionStateJob?.cancel()
            
            // Stop audio capture
            audioCaptureService.stopCapture()
            
            // Disconnect WebSocket
            webSocketClient.disconnect()
            
            // Save call session to history
            saveCallSession()
            
            // Reset state
            currentCallId = null
            callStartTime = 0
            _isOffline = false
            
            Log.i(TAG, "Monitoring stopped")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping monitoring", e)
            Result.failure(e)
        }
    }
    
    override fun getCurrentThreatLevel(): StateFlow<ThreatLevel> = _currentThreatLevel.asStateFlow()
    
    override fun getTranscription(): StateFlow<String> = _transcription.asStateFlow()
    
    override fun isMonitoring(): Boolean = _isMonitoring
    
    /**
     * Start the audio processing pipeline.
     * Captures audio → processes to PCM → streams to WebSocket.
     */
    private fun startAudioPipeline() {
        audioPipelineJob = repositoryScope.launch {
            audioCaptureService.getAudioStream()
                .collect { rawAudio ->
                    try {
                        // Process audio to PCM format
                        val processResult = audioProcessor.processAudio(rawAudio)
                        
                        if (processResult.isSuccess) {
                            val audioChunk = processResult.getOrThrow()
                            
                            // Stream to WebSocket
                            val sendResult = webSocketClient.sendAudioChunk(audioChunk)
                            if (sendResult.isFailure) {
                                Log.e(TAG, "Failed to send audio chunk", sendResult.exceptionOrNull())
                            }
                        } else {
                            Log.e(TAG, "Failed to process audio", processResult.exceptionOrNull())
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error in audio pipeline", e)
                    }
                }
        }
    }
    
    /**
     * Listen for fraud analysis results from WebSocket.
     * Updates threat level, triggers haptic feedback and notifications.
     */
    private fun startFraudResultsListener() {
        fraudResultsJob = repositoryScope.launch {
            webSocketClient.receiveResults()
                .collect { result ->
                    try {
                        // Update threat level
                        val previousLevel = _currentThreatLevel.value
                        _currentThreatLevel.value = result.threatLevel
                        
                        // Update transcription
                        result.transcription?.let { text ->
                            _transcription.value = _transcription.value + " " + text
                        }
                        
                        // Trigger haptic feedback if threat level changed
                        if (result.threatLevel != previousLevel) {
                            hapticController.triggerHaptic(result.threatLevel)
                            
                            // Show notification for CAUTION or DANGER
                            if (result.threatLevel != ThreatLevel.SAFE) {
                                val description = when (result.threatLevel) {
                                    ThreatLevel.CAUTION -> "Be cautious. This call may be suspicious."
                                    ThreatLevel.DANGER -> "HANG UP NOW! This is likely a scam."
                                    else -> ""
                                }
                                notificationService.showThreatNotification(
                                    result.threatLevel,
                                    description
                                )
                            }
                        }
                        
                        Log.i(TAG, "Fraud result: ${result.threatLevel}, confidence: ${result.confidence}")
                    } catch (e: Exception) {
                        Log.e(TAG, "Error processing fraud result", e)
                    }
                }
        }
    }
    
    /**
     * Monitor WebSocket connection state.
     * Handles offline/online transitions and automatic reconnection.
     */
    private fun startConnectionStateMonitor() {
        connectionStateJob = repositoryScope.launch {
            webSocketClient.getConnectionState()
                .collect { state ->
                    when (state) {
                        ConnectionState.DISCONNECTED, ConnectionState.ERROR -> {
                            if (!_isOffline) {
                                _isOffline = true
                                Log.w(TAG, "Connection lost - entering offline mode")
                                notificationService.showThreatNotification(
                                    ThreatLevel.CAUTION,
                                    "Fraud detection unavailable - connection lost"
                                )
                                // Stop audio capture when offline
                                audioCaptureService.stopCapture()
                            }
                        }
                        ConnectionState.CONNECTED -> {
                            if (_isOffline) {
                                _isOffline = false
                                Log.i(TAG, "Connection restored - resuming monitoring")
                                // Resume audio capture if still monitoring
                                if (_isMonitoring && currentCallId != null) {
                                    audioCaptureService.startCapture(currentCallId!!)
                                    startAudioPipeline()
                                }
                            }
                        }
                        ConnectionState.CONNECTING -> {
                            Log.d(TAG, "Reconnecting...")
                        }
                    }
                }
        }
    }
    
    /**
     * Save call session metadata to history.
     * Privacy: NO audio data is saved, only metadata.
     */
    private fun saveCallSession() {
        repositoryScope.launch {
            try {
                val callId = currentCallId ?: return@launch
                val duration = ((System.currentTimeMillis() - callStartTime) / 1000).toInt()
                
                val session = CallSessionEntity(
                    id = callId,
                    timestamp = callStartTime,
                    durationSeconds = duration,
                    finalThreatLevel = _currentThreatLevel.value.name,
                    phoneNumber = null // TODO: Get phone number if available
                )
                
                callHistoryRepository.saveCallSession(session)
                Log.d(TAG, "Call session saved to history")
            } catch (e: Exception) {
                Log.e(TAG, "Error saving call session", e)
            }
        }
    }
}
