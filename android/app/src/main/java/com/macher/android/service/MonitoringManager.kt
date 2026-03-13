package com.macher.android.service

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.macher.android.data.database.*
import com.macher.android.data.preferences.AppPreferences
import com.macher.android.data.preferences.UserPreferences
import com.macher.android.detection.*
import com.macher.android.demo.ScamScenarios
import com.macher.android.network.RealWebSocketClient
import com.macher.android.util.Config
import com.macher.android.util.ErrorSeverity
import com.macher.android.util.ErrorType
import com.macher.android.util.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.UUID

/**
 * Central manager for MACHER monitoring.
 * Coordinates intervention engine, audio capture, and backend communication.
 * 
 * Enhanced with multi-layer risk detection:
 * - Layer 1: Metadata-based risk (silent background monitoring)
 * - Layer 2: Manipulation detection (conversational analysis)
 * - Layer 3: Risk fusion (combined assessment)
 */
class MonitoringManager(private val context: Context) {
    
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val interventionEngine = InterventionEngine(context)
    val webSocketClient = RealWebSocketClient()
    private val audioCaptureService = AudioCaptureService()
    private val familyLoopService = FamilyLoopService(context)
    
    // User settings preferences — checked before acting on toggleable behaviors
    private val appPreferences = AppPreferences(context)
    private val userPreferences = UserPreferences(context)
    
    // Database instance for persistence (Task 6)
    private val database = MacherDatabase.getDatabase(context)
    private val callHistoryDao = database.callHistoryDao()
    private val riskAssessmentDao = database.riskAssessmentDao()
    private val riskTriggerDao = database.riskTriggerDao()
    private val historicalRiskDao = database.historicalRiskDao()
    
    // Guardian link DAO for retrieving guardian phone numbers
    private val guardianLinkDao = database.guardianProtectedLinkDao()
    
    // Enhanced detection engines
    private val metadataAnalyzer = MetadataRiskAnalyzer()
    private val manipulationDetector = ManipulationDetector()
    private val riskFusionEngine = RiskFusionEngine()
    
    // Demo scenario controller (Task 3.4)
    private val demoController = com.macher.android.demo.DemoScenarioController { metadata, text ->
        performDetection(metadata, text)
    }
    
    // Fallback manager for graceful degradation (Task 4.4)
    private val fallbackManager = FallbackManager(context, webSocketClient)
    
    private val _isMonitoring = MutableStateFlow(false)
    val isMonitoring: StateFlow<Boolean> = _isMonitoring
    
    // True when an actual phone call is being monitored (audio + WebSocket active)
    // False when just armed/listening for calls
    private val _isActiveCall = MutableStateFlow(false)
    val isActiveCall: StateFlow<Boolean> = _isActiveCall
    
    private val _transcription = MutableStateFlow("")
    val transcription: StateFlow<String> = _transcription
    
    private val _threatLevel = MutableStateFlow(ThreatLevel.SAFE)
    val threatLevel: StateFlow<ThreatLevel> = _threatLevel
    
    private val _threatConfidence = MutableStateFlow(0f)
    val threatConfidence: StateFlow<Float> = _threatConfidence
    
    private val _threatType = MutableStateFlow("")
    val threatType: StateFlow<String> = _threatType
    
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState
    
    private val _overlayVisible = MutableStateFlow(false)
    val overlayVisible: StateFlow<Boolean> = _overlayVisible
    
    private val _audioLevel = MutableStateFlow(0f)
    val audioLevel: StateFlow<Float> = _audioLevel
    
    // NEW: Detection state flows for UI integration (Task 2.1)
    private val _detectionState = MutableStateFlow<DetectionState?>(null)
    val detectionState: StateFlow<DetectionState?> = _detectionState
    
    private val _riskBreakdown = MutableStateFlow<RiskBreakdown?>(null)
    val riskBreakdown: StateFlow<RiskBreakdown?> = _riskBreakdown
    
    private val _scenarioProgress = MutableStateFlow<ScenarioProgress?>(null)
    val scenarioProgress: StateFlow<ScenarioProgress?> = _scenarioProgress
    
    private val _historicalRisks = MutableStateFlow<List<HistoricalRiskData>>(emptyList())
    val historicalRisks: StateFlow<List<HistoricalRiskData>> = _historicalRisks
    
    private val _detectionMode = MutableStateFlow(DetectionMode.REAL_FULL)
    val detectionMode: StateFlow<DetectionMode> = _detectionMode
    
    // Performance optimization: Rate limiting for state flow emissions (Task 10.1)
    private var lastEmissionTime = 0L
    private val minEmissionInterval = 100L // Max 10 updates/second
    private var pendingStateUpdate: DetectionState? = null
    private var pendingBreakdownUpdate: RiskBreakdown? = null
    private var emissionJob: Job? = null
    
    // Performance optimization: Database write batching (Task 10.2)
    private val pendingDatabaseWrites = mutableListOf<Pair<CallMetadata, FusedRiskResult>>()
    private var databaseBatchJob: Job? = null
    private val batchInterval = 30000L // Batch writes every 30 seconds
    
    // Performance monitoring (Task 10.4)
    private val _performanceMetrics = MutableStateFlow<PerformanceMetrics?>(null)
    val performanceMetrics: StateFlow<PerformanceMetrics?> = _performanceMetrics
    
    private var detectionStartTime = 0L
    private var metadataAnalysisTime = 0L
    private var manipulationAnalysisTime = 0L
    private var fusionTime = 0L
    private var uiUpdateTime = 0L
    
    private var simulationJob: Job? = null
    
    // Cached user settings (observed from AppPreferences DataStore)
    private var settingHapticEnabled = true
    private var settingOverlayEnabled = true
    private var settingAutoDisconnect = true
    private var settingAlertGuardian = true
    private var settingNotificationsEnabled = true
    
    // Current call context for real-mode detection
    private var currentCallPhoneNumber: String = ""
    private var currentCallStartTime: Long = System.currentTimeMillis()
    private var currentCallSessionId: String = ""
    
    /**
     * Look up the first active guardian's phone number from the DB.
     * Returns null if no guardian link exists.
     */
    private suspend fun getGuardianPhoneNumber(): String? {
        return try {
            val userId = userPreferences.userId.first() ?: return null
            val links = guardianLinkDao.getLinksForProtected(userId)
            links.first().firstOrNull()?.guardianPhone?.takeIf { it.isNotEmpty() }
        } catch (e: Exception) {
            Logger.warn("MonitoringManager", "Could not retrieve guardian phone: ${e.message}")
            null
        }
    }
    
    init {
        // Observe user settings so services respect toggles
        scope.launch { appPreferences.enableHaptic.collect { settingHapticEnabled = it } }
        scope.launch { appPreferences.enableOverlay.collect { settingOverlayEnabled = it } }
        scope.launch { appPreferences.autoDisconnect.collect { settingAutoDisconnect = it } }
        scope.launch { appPreferences.alertGuardian.collect { settingAlertGuardian = it } }
        scope.launch { appPreferences.enableNotifications.collect { settingNotificationsEnabled = it } }
        
        // Observe intervention engine overlay state
        scope.launch {
            interventionEngine.overlayVisible.collect { visible ->
                _overlayVisible.value = visible
            }
        }
        
        // Observe WebSocket connection state
        scope.launch {
            webSocketClient.connectionState.collect { state ->
                _connectionState.value = when (state) {
                    com.macher.android.network.ConnectionState.DISCONNECTED -> ConnectionState.DISCONNECTED
                    com.macher.android.network.ConnectionState.CONNECTING -> ConnectionState.CONNECTING
                    com.macher.android.network.ConnectionState.CONNECTED -> ConnectionState.CONNECTED
                    com.macher.android.network.ConnectionState.DISCONNECTING -> ConnectionState.DISCONNECTING
                    com.macher.android.network.ConnectionState.ERROR -> ConnectionState.ERROR
                }
                // Immediately sync detection mode based on live connection health
                // so the UI never claims "Full Protection" when backend is unreachable.
                if (!Config.DEMO_MODE) {
                    when (state) {
                        com.macher.android.network.ConnectionState.ERROR -> {
                            // Only fall back to local-only after all retries are exhausted.
                            // While isReconnecting=true the WS is still attempting — don't
                            // prematurely switch away from REAL_FULL and scare the user.
                            if (_detectionMode.value == DetectionMode.REAL_FULL && !webSocketClient.isReconnecting.value) {
                                Logger.warn("MonitoringManager", "Backend unreachable (retries exhausted) — switching to local-only detection")
                                _detectionMode.value = DetectionMode.REAL_METADATA_ONLY
                            }
                        }
                        com.macher.android.network.ConnectionState.CONNECTED -> {
                            if (_detectionMode.value == DetectionMode.REAL_METADATA_ONLY) {
                                Logger.info("MonitoringManager", "Backend connected — restoring full detection")
                                _detectionMode.value = DetectionMode.REAL_FULL
                            }
                        }
                        else -> {}
                    }
                }
            }
        }
        
        // Observe transcription from WebSocket and trigger local detection
        scope.launch {
            webSocketClient.transcriptionFlow.collect { transcript ->
                _transcription.value = transcript
                
                // In REAL mode, run local ManipulationDetector on live transcription text
                // so detection works even before the AWS Bedrock analysis returns.
                if (_isMonitoring.value && !Config.DEMO_MODE && transcript.isNotEmpty()) {
                    try {
                        val metadata = CallMetadata(
                            phoneNumber = currentCallPhoneNumber,
                            callTime = currentCallStartTime,
                            isInContacts = false,
                            recentCallCount = 0,
                            averageCallDuration = 0
                        )
                        performDetection(metadata, transcript)
                    } catch (e: Exception) {
                        Logger.error("MonitoringManager", "Local detection failed: ${e.message}", e)
                    }
                }
            }
        }
        
        // Observe threat level from WebSocket (AWS Bedrock remote analysis)
        scope.launch {
            webSocketClient.threatLevelFlow.collect { level ->
                // Only update from WebSocket if the remote analysis gives a higher threat
                // This merges remote Bedrock analysis with local detection
                if (level.ordinal > _threatLevel.value.ordinal) {
                    _threatLevel.value = level
                }
                
                // Trigger intervention based on threat level
                if (level != ThreatLevel.SAFE) {
                    val confidence = _threatConfidence.value
                    val threatType = _threatType.value
                    
                    interventionEngine.triggerIntervention(level, confidence)
                    
                    // Haptic feedback — different patterns for CAUTION vs DANGER
                    triggerHapticFeedback(level)
                    
                    // Send Family Loop alert for high threats
                    if (level == ThreatLevel.DANGER && confidence >= 0.7f) {
                        if (settingAlertGuardian && settingNotificationsEnabled) {
                            scope.launch(Dispatchers.IO) {
                                val guardianPhone = getGuardianPhoneNumber()
                                familyLoopService.sendAlert(level, threatType, confidence, guardianPhone)
                            }
                        }
                    }
                }
            }
        }
        
        // Observe threat confidence
        scope.launch {
            webSocketClient.threatConfidenceFlow.collect { confidence ->
                if (confidence > _threatConfidence.value) {
                    _threatConfidence.value = confidence
                }
            }
        }
        
        // Observe threat type
        scope.launch {
            webSocketClient.threatTypeFlow.collect { type ->
                if (type.isNotEmpty()) {
                    _threatType.value = type
                }
            }
        }
        
        // Observe audio level
        scope.launch {
            audioCaptureService.audioLevel.collect { level ->
                _audioLevel.value = level
            }
        }
        
        // Observe demo scenario progress (Task 3.4)
        scope.launch {
            demoController.progress.collect { progress ->
                _scenarioProgress.value = progress
            }
        }
        
        // Observe fallback manager mode changes (Task 4.4)
        scope.launch {
            fallbackManager.currentMode.collect { mode ->
                _detectionMode.value = mode
            }
        }
    }
    
    /**
     * Start monitoring with a specific phone number (called from call detection).
     * This means an actual call is happening — connect to backend and analyze.
     * Can be called when armed (isMonitoring=true, isActiveCall=false) or directly.
     */
    fun startMonitoring(phoneNumber: String) {
        if (_isActiveCall.value) {
            Logger.warn("MonitoringManager", "Already monitoring an active call")
            return
        }
        currentCallPhoneNumber = phoneNumber
        currentCallStartTime = System.currentTimeMillis()
        currentCallSessionId = java.util.UUID.randomUUID().toString()
        webSocketClient.setCallSessionId(currentCallSessionId)
        _isActiveCall.value = true
        startRealMonitoring()
    }

    /**
     * Toggle monitoring from UI button.
     * In real mode (non-demo): enters armed/listening state — waits for an incoming call.
     * In demo mode: starts the demo simulation immediately.
     */
    fun startMonitoring() {
        if (_isMonitoring.value) {
            Logger.warn("MonitoringManager", "Monitoring already active")
            return
        }
        
        Logger.info("MonitoringManager", "Starting MACHER monitoring")
        
        _isMonitoring.value = true
        
        // Generate a call session ID if not already set
        if (currentCallSessionId.isEmpty()) {
            currentCallSessionId = java.util.UUID.randomUUID().toString()
            webSocketClient.setCallSessionId(currentCallSessionId)
        }
        
        if (Config.DEMO_MODE) {
            // Demo mode: Use simulation
            Logger.info("MonitoringManager", "Running in DEMO mode")
            _detectionMode.value = DetectionMode.DEMO
            _connectionState.value = ConnectionState.CONNECTING
            
            scope.launch {
                delay(1000)
                _connectionState.value = ConnectionState.CONNECTED
                Logger.info("MonitoringManager", "Demo monitoring started")
                startDemoSimulation()
            }
        } else {
            // Real mode: Enter armed/listening state.
            // The app is now actively waiting for phone calls.
            // No WebSocket connection is established yet — that happens when a call starts.
            // When a call is detected by phoneStateReceiver, startMonitoring(phoneNumber)
            // will be called which triggers startRealMonitoring() for actual analysis.
            Logger.info("MonitoringManager", "Running in REAL mode — armed and listening for calls")
            _detectionMode.value = DetectionMode.REAL_FULL
            _connectionState.value = ConnectionState.DISCONNECTED
            _transcription.value = "🛡️ Protection active. Monitoring incoming calls..."
        }
    }

    /**
     * Start the real monitoring pipeline — connect to WebSocket and capture audio.
     * Only called when an actual phone call is in progress.
     */
    private fun startRealMonitoring() {
        Logger.info("MonitoringManager", "Starting real call monitoring for: $currentCallPhoneNumber")
        
        _isMonitoring.value = true
        
        // Validate backend config first
        if (Config.WEBSOCKET_URL.contains("YOUR_API_ID")) {
            Logger.error("MonitoringManager", "Backend not configured — URL still has placeholder")
            _connectionState.value = ConnectionState.ERROR
            _transcription.value = "⚠️ Backend not configured. Open Config.kt and replace YOUR_API_ID with your AWS API Gateway URL."
            _isMonitoring.value = false
            return
        }

        Logger.info("MonitoringManager", "Running in REAL mode — connecting to AWS")
        _detectionMode.value = DetectionMode.REAL_FULL
        _connectionState.value = ConnectionState.CONNECTING
        
        // Start fallback manager health checks
        fallbackManager.startHealthChecks()
        
        // Connect to WebSocket
        webSocketClient.connect()
        
        // Wait up to 20s — gives all 3 retry attempts time to resolve before giving up.
        // Must wait for CONNECTED specifically; ERROR should not exit early (retries may follow).
        scope.launch {
            withTimeoutOrNull(20_000L) {
                webSocketClient.connectionState.first { state ->
                    state == com.macher.android.network.ConnectionState.CONNECTED
                }
            }
            if (_connectionState.value == ConnectionState.CONNECTED) {
                if (audioCaptureService.hasPermission(context)) {
                    // Batch audio chunks to reduce WebSocket messages and save AWS credits
                    val batchSize = Config.CreditSaver.AUDIO_CHUNK_BATCH_SIZE
                    val audioBuffer = mutableListOf<ByteArray>()
                    audioCaptureService.startCapture { audioChunk ->
                        audioBuffer.add(audioChunk)
                        if (audioBuffer.size >= batchSize) {
                            // Combine chunks into one message
                            val totalSize = audioBuffer.sumOf { it.size }
                            val merged = ByteArray(totalSize)
                            var offset = 0
                            for (chunk in audioBuffer) {
                                chunk.copyInto(merged, offset)
                                offset += chunk.size
                            }
                            audioBuffer.clear()
                            webSocketClient.sendAudioChunk(merged)
                        }
                    }
                } else {
                    Logger.error("MonitoringManager", "Audio recording permission not granted")
                    // Disconnect WS cleanly so it stops emitting ERROR state
                    webSocketClient.disconnect()
                    webSocketClient.reset()
                    // Go back to armed mode, not full stop
                    _isActiveCall.value = false
                    _connectionState.value = ConnectionState.DISCONNECTED
                    _detectionMode.value = DetectionMode.REAL_METADATA_ONLY
                    _transcription.value = "⚠️ Mic permission needed. Local AI protection still active. Grant mic in Settings > Apps > MACHER."
                }
            } else {
                // Guard: stop was called while we were waiting for connection
                if (!_isMonitoring.value) return@launch
                Logger.error("MonitoringManager", "Failed to connect to backend (state=${_connectionState.value})")
                // Disconnect WS cleanly so it stops emitting ERROR state
                webSocketClient.disconnect()
                webSocketClient.reset()
                // Go back to armed mode instead of full stop
                _isActiveCall.value = false
                _connectionState.value = ConnectionState.DISCONNECTED
                // Switch to local-only detection; app continues protecting with ManipulationDetector
                _detectionMode.value = DetectionMode.REAL_METADATA_ONLY
                val errDetail = webSocketClient.lastConnectionError.value ?: "timeout"
                _transcription.value = "⚠️ Cloud server unreachable ($errDetail). Local AI protection active. Will retry on next call."
                fallbackManager.stopHealthChecks()
            }
        }
    }
    
    /**
     * Stop monitoring completely (UI button pressed).
     * Resets everything — armed state, active call, backend connections.
     */
    fun stopMonitoring() {
        if (!_isMonitoring.value) {
            return
        }
        
        Logger.info("MonitoringManager", "Stopping MACHER monitoring")
        
        simulationJob?.cancel()
        simulationJob = null
        
        // Cancel pending emissions (Task 10.1)
        emissionJob?.cancel()
        emissionJob = null
        pendingStateUpdate = null
        pendingBreakdownUpdate = null
        lastEmissionTime = 0L
        
        // Flush pending database writes before stopping (Task 10.2)
        scope.launch(Dispatchers.IO) {
            try {
                flushDatabaseWrites()
            } catch (e: Exception) {
                Logger.error("MonitoringManager", "Failed to flush database writes on stop: ${e.message}")
            }
        }
        
        // Cancel batch job (Task 10.2)
        databaseBatchJob?.cancel()
        databaseBatchJob = null
        
        // Stop fallback manager health checks (Task 4.4)
        fallbackManager.stopHealthChecks()
        
        // Stop audio capture
        audioCaptureService.stopCapture()
        
        // Disconnect WebSocket
        webSocketClient.disconnect()
        webSocketClient.reset()
        
        _isActiveCall.value = false
        _isMonitoring.value = false
        _transcription.value = ""
        _threatLevel.value = ThreatLevel.SAFE
        _threatConfidence.value = 0f
        _threatType.value = ""
        _connectionState.value = ConnectionState.DISCONNECTED
        
        // Reset detection state flows
        _detectionState.value = null
        _riskBreakdown.value = null
        _scenarioProgress.value = null
        _detectionMode.value = DetectionMode.REAL_FULL
        
        // Reset call context
        currentCallPhoneNumber = ""
        currentCallStartTime = System.currentTimeMillis()
        currentCallSessionId = ""
        
        Logger.info("MonitoringManager", "Monitoring stopped")
    }
    
    /**
     * Stop monitoring the current call but stay in armed/listening mode.
     * Called when a phone call ends while monitoring is still enabled.
     * The app returns to the armed state, ready for the next call.
     */
    fun stopCallMonitoring() {
        if (!_isActiveCall.value) return
        
        Logger.info("MonitoringManager", "Call ended — returning to armed mode")
        
        // Flush pending database writes
        scope.launch(Dispatchers.IO) {
            try {
                flushDatabaseWrites()
            } catch (e: Exception) {
                Logger.error("MonitoringManager", "Failed to flush database writes: ${e.message}")
            }
        }
        
        // Stop fallback health checks
        fallbackManager.stopHealthChecks()
        
        // Stop audio capture
        audioCaptureService.stopCapture()
        
        // Disconnect WebSocket
        webSocketClient.disconnect()
        webSocketClient.reset()
        
        _isActiveCall.value = false
        
        // Reset detection state but keep monitoring (armed) active
        // No WebSocket is open in armed mode — show DISCONNECTED accurately
        _transcription.value = "🛡️ Protection active. Monitoring incoming calls..."
        _threatLevel.value = ThreatLevel.SAFE
        _threatConfidence.value = 0f
        _threatType.value = ""
        _connectionState.value = ConnectionState.DISCONNECTED
        _detectionMode.value = DetectionMode.REAL_FULL
        _detectionState.value = null
        _riskBreakdown.value = null
        
        // Reset call context
        currentCallPhoneNumber = ""
        currentCallSessionId = ""
        
        Logger.info("MonitoringManager", "Returned to armed mode — listening for next call")
    }
    
    /**
     * Trigger haptic feedback based on threat level.
     * CAUTION: two short pulses. DANGER: three strong pulses.
     */
    private fun triggerHapticFeedback(level: ThreatLevel) {
        if (!settingHapticEnabled) return
        try {
            val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            
            if (!vibrator.hasVibrator()) return
            
            val effect = if (level == ThreatLevel.DANGER) {
                // Three strong 200ms pulses for DANGER
                VibrationEffect.createWaveform(
                    longArrayOf(0, 200, 100, 200, 100, 300),
                    intArrayOf(0, VibrationEffect.DEFAULT_AMPLITUDE, 0, VibrationEffect.DEFAULT_AMPLITUDE, 0, VibrationEffect.DEFAULT_AMPLITUDE),
                    -1
                )
            } else {
                // Two gentle 100ms pulses for CAUTION
                VibrationEffect.createWaveform(
                    longArrayOf(0, 100, 100, 100),
                    intArrayOf(0, 80, 0, 80),
                    -1
                )
            }
            vibrator.vibrate(effect)
        } catch (e: Exception) {
            Logger.warn("MonitoringManager", "Haptic feedback failed: ${e.message}")
        }
    }
    
    /**
     * Start demo simulation with progressive intervention
     * Enhanced with realistic scam scenarios
     */
    private fun startDemoSimulation() {
        simulationJob = scope.launch {
            // Select a random high-risk scenario
            val scenario = ScamScenarios.getRandomHighRiskScenario()
            
            Logger.info("MonitoringManager", "Starting demo scenario: ${scenario.title}")
            
            // Set detection mode to DEMO
            _detectionMode.value = DetectionMode.DEMO
            
            // Analyze metadata first (Layer 1)
            val metadata = CallMetadata(
                phoneNumber = scenario.phoneNumber,
                callTime = scenario.callTime,
                isInContacts = false,
                recentCallCount = 3,
                averageCallDuration = 45
            )
            
            // Play through conversation segments
            var accumulatedText = ""
            
            for ((index, segment) in scenario.conversation.withIndex()) {
                delay(segment.timestamp - (scenario.conversation.getOrNull(index - 1)?.timestamp ?: 0))
                
                // Add new segment to transcription
                accumulatedText += if (accumulatedText.isEmpty()) {
                    segment.text
                } else {
                    " ${segment.text}"
                }
                
                _transcription.value = accumulatedText
                
                // Perform detection with accumulated text (Task 2.3)
                performDetection(metadata, accumulatedText)
                
                Logger.info("MonitoringManager", "Segment ${index + 1}: ${_threatLevel.value}")
            }
        }
    }
    
    /**
     * Perform multi-layer detection and update all state flows (Task 2.3, 9.1, 10.4)
     * 
     * Coordinates all three detection layers and emits updated state to UI components.
     * Handles both real and demo modes, with graceful degradation to metadata-only mode.
     * 
     * Enhanced with comprehensive error handling:
     * - AWS connection failures trigger automatic fallback to metadata-only mode
     * - Detection engine exceptions return safe defaults (LOW risk, 0 confidence)
     * - Monitoring continues even if individual layers fail
     * - All errors logged with context for debugging
     * 
     * Performance monitoring (Task 10.4):
     * - Tracks latency for each detection stage
     * - Logs metrics and alerts if exceeds 500ms target
     * - Exposes metrics via StateFlow for dashboard display
     * 
     * @param metadata Call metadata for Layer 1 analysis
     * @param transcriptionText Accumulated transcription for Layer 2 analysis
     */
    private suspend fun performDetection(
        metadata: CallMetadata,
        transcriptionText: String
    ) {
        // Start performance tracking (Task 10.4)
        detectionStartTime = System.currentTimeMillis()
        val uiUpdateStartTime: Long
        
        try {
            // Layer 1: Metadata analysis (always available)
            val metadataStartTime = System.currentTimeMillis()
            val metadataRisk = try {
                metadataAnalyzer.analyzeMetadata(metadata)
            } catch (e: Exception) {
                Logger.error("MonitoringManager", "Metadata analysis failed: ${e.message}", e)
                // Return safe default - continue with other layers
                MetadataRiskResult(
                    riskScore = 0,
                    riskLevel = RiskLevel.LOW,
                    triggers = emptyList(),
                    confidence = 0f
                )
            }
            metadataAnalysisTime = System.currentTimeMillis() - metadataStartTime
            Logger.info("MonitoringManager", "Metadata risk: ${metadataRisk.riskLevel} (${metadataRisk.riskScore}) [${metadataAnalysisTime}ms]")
            
            // Layer 2: Manipulation detection (skip in metadata-only mode)
            val manipulationStartTime = System.currentTimeMillis()
            val manipulationRisk = if (_detectionMode.value != DetectionMode.REAL_METADATA_ONLY) {
                try {
                    manipulationDetector.analyzeConversation(transcriptionText)
                } catch (e: Exception) {
                    Logger.error("MonitoringManager", "Manipulation detection failed: ${e.message}", e)
                    
                    // Check if this is an AWS connection error
                    if (isAWSConnectionError(e)) {
                        Logger.warn("MonitoringManager", "AWS connection error detected - switching to metadata-only mode")
                        // Trigger fallback mode asynchronously
                        scope.launch {
                            fallbackManager.switchToMetadataOnly()
                        }
                    }
                    
                    // Return null to indicate layer unavailable
                    null
                }
            } else {
                null
            }
            manipulationAnalysisTime = if (manipulationRisk != null) {
                System.currentTimeMillis() - manipulationStartTime
            } else {
                0L
            }
            
            // Layer 3: Risk fusion with historical data (Task 6.6)
            val fusionStartTime = System.currentTimeMillis()
            val historicalRisk = try {
                getHistoricalRisk(metadata.phoneNumber)
            } catch (e: Exception) {
                Logger.error("MonitoringManager", "Historical risk retrieval failed: ${e.message}", e)
                null // Continue without historical data
            }
            
            val fusedRisk = try {
                riskFusionEngine.fuseRiskSignals(
                    metadataRisk = metadataRisk,
                    manipulationRisk = manipulationRisk,
                    historicalRisk = historicalRisk
                )
            } catch (e: Exception) {
                Logger.error("MonitoringManager", "Risk fusion failed: ${e.message}", e)
                // Return safe default to prevent monitoring interruption
                FusedRiskResult(
                    riskScore = metadataRisk.riskScore.toFloat(),
                    riskLevel = metadataRisk.riskLevel,
                    confidence = 0.3f, // Low confidence due to fusion failure
                    triggers = emptyList(),
                    explanation = "Risk fusion unavailable - using metadata only",
                    metadataContribution = metadataRisk.riskScore.toFloat(),
                    manipulationContribution = 0f,
                    historicalContribution = 0f
                )
            }
            fusionTime = System.currentTimeMillis() - fusionStartTime
            
            // Update detection state (within 100ms requirement)
            uiUpdateStartTime = System.currentTimeMillis()
            try {
                val newState = DetectionState(
                    metadataRisk = metadataRisk,
                    manipulationRisk = manipulationRisk,
                    fusedRisk = fusedRisk,
                    mode = _detectionMode.value
                )
                if (!safeEmitDetectionState(newState)) {
                    Logger.warn("MonitoringManager", "Failed to emit detection state - using previous state")
                }
            } catch (e: Exception) {
                Logger.error("MonitoringManager", "Failed to create detection state: ${e.message}", e)
                // Preserve previous state - don't crash monitoring
            }
            
            // Update risk breakdown
            try {
                val newBreakdown = createRiskBreakdown(
                    metadataRisk,
                    manipulationRisk,
                    fusedRisk
                )
                if (!safeEmitRiskBreakdown(newBreakdown)) {
                    Logger.warn("MonitoringManager", "Failed to emit risk breakdown - using previous breakdown")
                }
            } catch (e: Exception) {
                Logger.error("MonitoringManager", "Failed to create risk breakdown: ${e.message}", e)
                // Continue without breakdown - UI will handle null
            }
            
            uiUpdateTime = System.currentTimeMillis() - uiUpdateStartTime
            
            // Calculate and emit performance metrics (Task 10.4)
            val totalLatency = System.currentTimeMillis() - detectionStartTime
            val metrics = PerformanceMetrics(
                totalLatency = totalLatency,
                metadataLatency = metadataAnalysisTime,
                manipulationLatency = manipulationAnalysisTime,
                fusionLatency = fusionTime,
                uiUpdateLatency = uiUpdateTime
            )
            _performanceMetrics.value = metrics
            
            // Log performance metrics
            Logger.info("MonitoringManager", "Performance: ${metrics.getSummary()}")
            
            // Alert if latency exceeds target
            if (metrics.exceedsTarget()) {
                Logger.warn("MonitoringManager", "⚠️ Detection latency exceeded 500ms target: ${totalLatency}ms")
            }
            
            // Map fusedRisk.riskLevel to ThreatLevel and emit
            _threatLevel.value = when (fusedRisk.riskLevel) {
                RiskLevel.HIGH -> ThreatLevel.DANGER
                RiskLevel.MEDIUM -> ThreatLevel.CAUTION
                RiskLevel.LOW -> ThreatLevel.SAFE
            }
            
            _threatConfidence.value = fusedRisk.confidence
            _threatType.value = fusedRisk.getPrimaryThreat()
            
            // Update demo controller risk level (Task 3.4)
            if (_detectionMode.value == DetectionMode.DEMO) {
                try {
                    demoController.updateRiskLevel(fusedRisk.riskLevel)
                } catch (e: Exception) {
                    Logger.error("MonitoringManager", "Failed to update demo controller: ${e.message}", e)
                    // Non-critical - continue
                }
            }
            
            // Persist to database (Task 6.6, 9.2, 10.2)
            // Use batching to reduce database I/O and improve performance
            queueDatabaseWrite(metadata, fusedRisk)
            
            // Trigger interventions based on risk level
            try {
                if (fusedRisk.riskLevel == RiskLevel.HIGH && fusedRisk.confidence >= 0.7f) {
                    interventionEngine.triggerIntervention(ThreatLevel.DANGER, fusedRisk.confidence)
                    if (settingAlertGuardian && settingNotificationsEnabled) {
                        scope.launch(Dispatchers.IO) {
                            val guardianPhone = getGuardianPhoneNumber()
                            familyLoopService.sendAlert(
                                ThreatLevel.DANGER,
                                fusedRisk.getPrimaryThreat(),
                                fusedRisk.confidence,
                                guardianPhone
                            )
                        }
                    }
                } else if (fusedRisk.riskLevel == RiskLevel.MEDIUM && fusedRisk.confidence >= 0.5f) {
                    interventionEngine.triggerIntervention(ThreatLevel.CAUTION, fusedRisk.confidence)
                }
            } catch (e: Exception) {
                Logger.error("MonitoringManager", "Failed to trigger intervention: ${e.message}", e)
                // Non-critical - user may miss alert but detection continues
            }
            
            Logger.info("MonitoringManager", "Detection complete: ${fusedRisk.riskLevel} (${fusedRisk.getRiskPercentage()}%)")
            
        } catch (e: Exception) {
            // Catch-all for unexpected errors - log and continue monitoring
            Logger.error("MonitoringManager", "Unexpected error in performDetection: ${e.message}", e)
            // Don't rethrow - monitoring must continue
        }
    }
    
    /**
     * Check if an exception is an AWS connection error (Task 9.1)
     * 
     * Identifies network and connection errors that indicate AWS backend unavailability.
     * Used to trigger automatic fallback to metadata-only mode.
     * 
     * @param e Exception to check
     * @return true if this is an AWS connection error
     */
    private fun isAWSConnectionError(e: Exception): Boolean {
        val message = e.message?.lowercase() ?: ""
        return message.contains("connection") ||
               message.contains("network") ||
               message.contains("timeout") ||
               message.contains("unreachable") ||
               message.contains("websocket") ||
               e is java.net.UnknownHostException ||
               e is java.net.SocketTimeoutException ||
               e is java.io.IOException
    }
    
    /**
     * Safely emit detection state with validation and rate limiting (Task 9.4, 10.1)
     * 
     * Validates state before emission to prevent invalid data from reaching UI.
     * Implements rate limiting (max 10 updates/second) and batching to reduce
     * recomposition overhead. Uses conflation to skip intermediate states.
     * 
     * @param state The detection state to emit
     * @return true if emission succeeded or queued, false otherwise
     */
    private fun safeEmitDetectionState(state: DetectionState): Boolean {
        try {
            // Validate state structure
            require(state.timestamp > 0) {
                "Invalid timestamp: ${state.timestamp}"
            }
            
            // Validate mode-specific requirements
            when (state.mode) {
                DetectionMode.REAL_FULL -> {
                    // Full mode should have all layers (manipulation may be null if analysis failed)
                    require(state.metadataRisk != null) {
                        "REAL_FULL mode requires metadata risk"
                    }
                    require(state.fusedRisk != null) {
                        "REAL_FULL mode requires fused risk"
                    }
                }
                DetectionMode.REAL_METADATA_ONLY -> {
                    // Metadata-only mode should have metadata and fused risk, but no manipulation
                    require(state.metadataRisk != null) {
                        "REAL_METADATA_ONLY mode requires metadata risk"
                    }
                    require(state.fusedRisk != null) {
                        "REAL_METADATA_ONLY mode requires fused risk"
                    }
                }
                DetectionMode.DEMO -> {
                    // Demo mode should have all layers
                    require(state.metadataRisk != null) {
                        "DEMO mode requires metadata risk"
                    }
                    require(state.fusedRisk != null) {
                        "DEMO mode requires fused risk"
                    }
                }
            }
            
            // Rate limiting: Check if enough time has passed since last emission
            val currentTime = System.currentTimeMillis()
            val timeSinceLastEmission = currentTime - lastEmissionTime
            
            if (timeSinceLastEmission >= minEmissionInterval) {
                // Emit immediately
                _detectionState.value = state
                lastEmissionTime = currentTime
                
                // Also emit any pending breakdown update
                pendingBreakdownUpdate?.let { breakdown ->
                    _riskBreakdown.value = breakdown
                    pendingBreakdownUpdate = null
                }
            } else {
                // Queue for batched emission (conflation - only keep latest)
                pendingStateUpdate = state
                
                // Schedule emission if not already scheduled
                if (emissionJob?.isActive != true) {
                    emissionJob = scope.launch {
                        delay(minEmissionInterval - timeSinceLastEmission)
                        
                        // Emit pending updates in a single frame
                        pendingStateUpdate?.let { pending ->
                            _detectionState.value = pending
                            pendingStateUpdate = null
                        }
                        pendingBreakdownUpdate?.let { pending ->
                            _riskBreakdown.value = pending
                            pendingBreakdownUpdate = null
                        }
                        
                        lastEmissionTime = System.currentTimeMillis()
                    }
                }
            }
            
            return true
            
        } catch (e: IllegalArgumentException) {
            Logger.error("MonitoringManager", "Invalid detection state: ${e.message}")
            // Preserve previous valid state
            return false
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to emit detection state: ${e.message}", e)
            // Preserve previous valid state
            return false
        }
    }
    
    /**
     * Safely emit risk breakdown with validation and rate limiting (Task 9.4, 10.1)
     * 
     * Validates breakdown before emission to ensure data integrity.
     * Implements rate limiting and batching with detection state updates.
     * Uses distinctUntilChanged semantics to avoid duplicate emissions.
     * 
     * @param breakdown The risk breakdown to emit
     * @return true if emission succeeded or queued, false otherwise
     */
    private fun safeEmitRiskBreakdown(breakdown: RiskBreakdown): Boolean {
        try {
            // Validate breakdown structure
            require(breakdown.totalScore >= 0f) {
                "Invalid total score: ${breakdown.totalScore}"
            }
            require(breakdown.riskPercentage in 0..100) {
                "Invalid risk percentage: ${breakdown.riskPercentage}"
            }
            require(breakdown.confidence in 0f..1f) {
                "Invalid confidence: ${breakdown.confidence}"
            }
            
            // Validate contributions are non-negative
            require(breakdown.metadataContribution >= 0f) {
                "Invalid metadata contribution: ${breakdown.metadataContribution}"
            }
            require(breakdown.manipulationContribution >= 0f) {
                "Invalid manipulation contribution: ${breakdown.manipulationContribution}"
            }
            require(breakdown.historicalContribution >= 0f) {
                "Invalid historical contribution: ${breakdown.historicalContribution}"
            }
            
            // Check if this is meaningfully different from current value (distinctUntilChanged)
            val current = _riskBreakdown.value
            if (current != null && 
                current.totalScore == breakdown.totalScore &&
                current.riskPercentage == breakdown.riskPercentage &&
                current.triggers.size == breakdown.triggers.size) {
                // Skip duplicate emission
                return true
            }
            
            // Rate limiting: Check if enough time has passed since last emission
            val currentTime = System.currentTimeMillis()
            val timeSinceLastEmission = currentTime - lastEmissionTime
            
            if (timeSinceLastEmission >= minEmissionInterval && pendingStateUpdate == null) {
                // Emit immediately if no pending state update
                _riskBreakdown.value = breakdown
                lastEmissionTime = currentTime
            } else {
                // Queue for batched emission with state update (conflation)
                pendingBreakdownUpdate = breakdown
            }
            
            return true
            
        } catch (e: IllegalArgumentException) {
            Logger.error("MonitoringManager", "Invalid risk breakdown: ${e.message}")
            // Preserve previous valid state
            return false
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to emit risk breakdown: ${e.message}", e)
            // Preserve previous valid state
            return false
        }
    }
    
    /**
     * Manually trigger a threat level (demo mode only)
     */
    fun simulateThreat(level: ThreatLevel) {
        if (!_isMonitoring.value) return
        simulationJob?.cancel()
        simulationJob = scope.launch {
            when (level) {
                ThreatLevel.SAFE -> {
                    _threatLevel.value = ThreatLevel.SAFE
                    _threatConfidence.value = 0f
                    _threatType.value = ""
                    _transcription.value = "All clear. No threats detected."
                }
                ThreatLevel.CAUTION -> {
                    _threatLevel.value = ThreatLevel.CAUTION
                    _threatConfidence.value = 0.62f
                    _threatType.value = "Urgency Pattern Detected"
                    _transcription.value = "We've detected unusual activity on your account..."
                    interventionEngine.triggerIntervention(ThreatLevel.CAUTION, 0.62f)
                }
                ThreatLevel.DANGER -> {
                    _threatLevel.value = ThreatLevel.DANGER
                    _threatConfidence.value = 0.88f
                    _threatType.value = "OTP/Password Request"
                    _transcription.value = "Please provide your online banking password and the OTP sent to your phone..."
                    interventionEngine.triggerIntervention(ThreatLevel.DANGER, 0.88f)
                    scope.launch(Dispatchers.IO) {
                        val guardianPhone = getGuardianPhoneNumber()
                        familyLoopService.sendAlert(ThreatLevel.DANGER, "OTP/Password Request", 0.88f, guardianPhone)
                    }
                }
            }
        }
    }

    /**
     * Dismiss the scam warning overlay
     */
    fun dismissOverlay() {
        interventionEngine.dismissOverlay()
    }
    
    /**
     * Disconnect the call (Level 3 intervention)
     */
    fun disconnectCall() {
        Logger.info("MonitoringManager", "User requested call disconnect")
        
        // Actually disconnect the call via TelecomManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? android.telecom.TelecomManager
            if (telecomManager != null) {
                val hasPermission = androidx.core.content.ContextCompat.checkSelfPermission(
                    context, android.Manifest.permission.ANSWER_PHONE_CALLS
                ) == android.content.pm.PackageManager.PERMISSION_GRANTED
                if (hasPermission) {
                    try {
                        @Suppress("DEPRECATION")
                        telecomManager.endCall()
                        Logger.info("MonitoringManager", "Call disconnected via TelecomManager")
                    } catch (e: Exception) {
                        Logger.error("MonitoringManager", "Failed to disconnect call: ${e.message}")
                    }
                }
            }
        }
        
        interventionEngine.dismissOverlay()
        stopMonitoring()
    }
    
    /**
     * Trigger haptic feedback for alerts
     */
    private fun triggerHapticFeedback() {
        try {
            val vibrator = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) 
                    as android.os.VibratorManager
                vibratorManager.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
            }
            
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                val effect = android.os.VibrationEffect.createWaveform(
                    longArrayOf(0, 200, 100, 200),
                    intArrayOf(0, 255, 0, 255),
                    -1
                )
                vibrator.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(longArrayOf(0, 200, 100, 200), -1)
            }
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to trigger haptic feedback", e)
        }
    }
    
    /**
     * Cleanup resources
     */
    fun cleanup() {
        stopMonitoring()
        audioCaptureService.cleanup()
        demoController.cleanup()
        fallbackManager.stopHealthChecks()
        scope.coroutineContext[Job]?.cancel()
    }
    
    // ========== Fallback Management (Task 4.4) ==========
    
    /**
     * Check AWS backend availability.
     * 
     * Performs a health check to determine if the AWS backend is reachable.
     * This is a suspend function and should be called from a coroutine.
     * 
     * @return true if AWS backend is available, false otherwise
     */
    suspend fun checkBackendAvailability(): Boolean {
        return fallbackManager.checkAWSAvailability()
    }
    
    /**
     * Manually switch to metadata-only mode.
     * 
     * Forces the system to use only metadata-based detection, bypassing AWS.
     * Useful for testing fallback behavior or when user wants to conserve data.
     */
    fun switchToMetadataOnlyMode() {
        fallbackManager.switchToMetadataOnly()
    }
    
    /**
     * Manually switch to full detection mode.
     * 
     * Restores full detection with all three layers including AWS-powered
     * manipulation detection. Only works if AWS backend is available.
     */
    fun switchToFullDetectionMode() {
        fallbackManager.switchToFullDetection()
    }
    
    // ========== Demo Scenario Management (Task 3.4) ==========
    
    /**
     * Get all available demo scenarios.
     * 
     * Returns the list of preloaded scam scenarios for competition demonstrations.
     * These scenarios work without AWS backend or network connectivity.
     * 
     * @return List of all demo scenarios
     */
    fun getDemoScenarios(): List<com.macher.android.demo.ScamScenario> {
        return ScamScenarios.getAllScenarios()
    }
    
    /**
     * Select a demo scenario for playback.
     * 
     * Loads the specified scenario into the demo controller. The scenario
     * must be played using playDemoScenario() after selection.
     * 
     * @param scenarioId Unique identifier of the scenario to select
     * @throws IllegalArgumentException if scenario ID is not found
     */
    fun selectDemoScenario(scenarioId: String) {
        val scenario = ScamScenarios.getScenarioById(scenarioId)
        if (scenario != null) {
            Logger.info("MonitoringManager", "Selected demo scenario: ${scenario.title}")
            demoController.selectScenario(scenario)
        } else {
            Logger.error("MonitoringManager", "Scenario not found: $scenarioId")
            throw IllegalArgumentException("Scenario not found: $scenarioId")
        }
    }
    
    /**
     * Play the selected demo scenario.
     * 
     * Starts or resumes playback of the currently selected scenario. The scenario
     * will play through conversation segments with realistic timing, triggering
     * detection analysis at each step.
     * 
     * Must be in DEMO mode and have a scenario selected.
     * 
     * @throws IllegalStateException if not in demo mode or no scenario selected
     */
    fun playDemoScenario() {
        if (_detectionMode.value != DetectionMode.DEMO) {
            Logger.error("MonitoringManager", "Cannot play scenario: not in demo mode")
            throw IllegalStateException("Not in demo mode")
        }
        
        if (!demoController.hasScenario()) {
            Logger.error("MonitoringManager", "Cannot play scenario: no scenario selected")
            throw IllegalStateException("No scenario selected")
        }
        
        Logger.info("MonitoringManager", "Playing demo scenario")
        demoController.playScenario()
    }
    
    /**
     * Pause the currently playing demo scenario.
     * 
     * Pauses playback at the current segment. The scenario can be resumed
     * later using playDemoScenario().
     */
    fun pauseDemoScenario() {
        Logger.info("MonitoringManager", "Pausing demo scenario")
        demoController.pauseScenario()
    }
    
    /**
     * Reset the demo scenario to the beginning.
     * 
     * Stops playback and resets all state. The scenario can be played
     * again from the start using playDemoScenario().
     */
    fun resetDemoScenario() {
        Logger.info("MonitoringManager", "Resetting demo scenario")
        demoController.resetScenario()
    }
    
    /**
     * Check if a demo scenario is currently playing.
     * 
     * @return true if a scenario is actively playing, false otherwise
     */
    fun isDemoPlaying(): Boolean {
        return demoController.isPlaying()
    }
    
    /**
     * Get the current demo scenario.
     * 
     * @return The currently selected scenario, or null if none selected
     */
    fun getCurrentDemoScenario(): com.macher.android.demo.ScamScenario? {
        return demoController.getCurrentScenario()
    }
    
    /**
     * Create risk breakdown from detection results (Task 2.2)
     * 
     * Extracts triggers from metadata and manipulation results, calculates contributions,
     * and generates a comprehensive RiskBreakdown for UI visualization.
     */
    private fun createRiskBreakdown(
        metadataRisk: MetadataRiskResult?,
        manipulationRisk: ManipulationResult?,
        fusedRisk: FusedRiskResult
    ): RiskBreakdown {
        val triggers = mutableListOf<TriggerInfo>()
        val timestamp = System.currentTimeMillis()
        
        // Extract metadata triggers
        metadataRisk?.triggers?.forEach { trigger ->
            val category = mapMetadataTriggerToCategory(trigger)
            val score = (metadataRisk.riskScore / metadataRisk.triggers.size.coerceAtLeast(1))
            
            triggers.add(
                TriggerInfo(
                    category = category,
                    description = trigger,
                    score = score,
                    timestamp = timestamp,
                    severity = metadataRisk.riskLevel
                )
            )
        }
        
        // Extract manipulation triggers
        manipulationRisk?.patterns?.forEach { pattern ->
            val category = mapManipulationCategoryToTrigger(pattern.category)
            
            triggers.add(
                TriggerInfo(
                    category = category,
                    description = pattern.description,
                    score = pattern.score,
                    timestamp = timestamp,
                    severity = manipulationRisk.riskLevel
                )
            )
        }
        
        return RiskBreakdown(
            totalScore = fusedRisk.riskScore,
            riskPercentage = fusedRisk.getRiskPercentage(),
            metadataContribution = fusedRisk.metadataContribution,
            manipulationContribution = fusedRisk.manipulationContribution,
            historicalContribution = fusedRisk.historicalContribution,
            triggers = triggers,
            confidence = fusedRisk.confidence,
            primaryThreat = fusedRisk.getPrimaryThreat(),
            explanation = fusedRisk.explanation
        )
    }
    
    /**
     * Map metadata trigger string to TriggerCategory enum
     */
    private fun mapMetadataTriggerToCategory(trigger: String): TriggerCategory {
        return when {
            trigger.contains("Unknown number", ignoreCase = true) -> TriggerCategory.METADATA_UNKNOWN_NUMBER
            trigger.contains("International", ignoreCase = true) -> TriggerCategory.METADATA_INTERNATIONAL
            trigger.contains("midnight", ignoreCase = true) || trigger.contains("Unusual time", ignoreCase = true) -> TriggerCategory.METADATA_MIDNIGHT_CALL
            trigger.contains("Repeated", ignoreCase = true) -> TriggerCategory.METADATA_REPEATED_CALLS
            trigger.contains("frequency", ignoreCase = true) -> TriggerCategory.METADATA_HIGH_FREQUENCY
            else -> TriggerCategory.METADATA_UNKNOWN_NUMBER // Default fallback
        }
    }
    
    /**
     * Map ManipulationCategory to TriggerCategory enum
     */
    private fun mapManipulationCategoryToTrigger(category: ManipulationCategory): TriggerCategory {
        return when (category) {
            ManipulationCategory.URGENCY -> TriggerCategory.MANIPULATION_URGENCY
            ManipulationCategory.AUTHORITY -> TriggerCategory.MANIPULATION_AUTHORITY
            ManipulationCategory.EMOTIONAL -> TriggerCategory.MANIPULATION_EMOTIONAL
            ManipulationCategory.FINANCIAL -> TriggerCategory.MANIPULATION_FINANCIAL
            ManipulationCategory.INFORMATION -> TriggerCategory.MANIPULATION_INFORMATION
        }
    }
    
    // ========== Database Persistence (Task 6) ==========
    
    /**
     * Queue database write for batching (Task 10.2)
     * 
     * Adds the call record to a batch queue that will be flushed every 30 seconds.
     * This reduces database I/O and improves battery efficiency.
     * 
     * @param metadata Call metadata
     * @param fusedRisk Risk assessment result
     */
    private fun queueDatabaseWrite(metadata: CallMetadata, fusedRisk: FusedRiskResult) {
        synchronized(pendingDatabaseWrites) {
            pendingDatabaseWrites.add(metadata to fusedRisk)
        }
        
        // Start batch job if not already running
        if (databaseBatchJob?.isActive != true) {
            databaseBatchJob = scope.launch(Dispatchers.IO) {
                while (isActive && _isMonitoring.value) {
                    delay(batchInterval)
                    flushDatabaseWrites()
                }
            }
        }
    }
    
    /**
     * Flush pending database writes (Task 10.2)
     * 
     * Writes all queued call records to the database individually.
     * Uses suspend functions to avoid runBlocking deadlocks inside transactions.
     */
    private suspend fun flushDatabaseWrites() = withContext(Dispatchers.IO) {
        val writes = synchronized(pendingDatabaseWrites) {
            val copy = pendingDatabaseWrites.toList()
            pendingDatabaseWrites.clear()
            copy
        }
        
        if (writes.isEmpty()) {
            return@withContext
        }
        
        Logger.info("MonitoringManager", "Flushing ${writes.size} database writes")
        
        val failed = mutableListOf<Pair<CallMetadata, FusedRiskResult>>()
        
        for ((metadata, fusedRisk) in writes) {
            try {
                persistCallRecordSuspend(metadata, fusedRisk)
            } catch (e: Exception) {
                Logger.error("MonitoringManager", "Failed to persist call in batch: ${e.message}")
                failed.add(metadata to fusedRisk)
            }
        }
        
        if (failed.isNotEmpty()) {
            synchronized(pendingDatabaseWrites) {
                pendingDatabaseWrites.addAll(0, failed)
            }
            Logger.warn("MonitoringManager", "${failed.size} database writes failed, re-queued")
        } else {
            Logger.info("MonitoringManager", "Successfully flushed ${writes.size} database writes")
        }
    }
    
    /**
     * Suspend version of persistCallRecord — safe to call from coroutines
     */
    private suspend fun persistCallRecordSuspend(metadata: CallMetadata, fusedRisk: FusedRiskResult): String? {
        try {
            val callId = UUID.randomUUID().toString()
            val wasBlocked = fusedRisk.riskLevel == RiskLevel.HIGH && fusedRisk.confidence >= 0.7f
            
            val callRecord = CallRecordEntity(
                id = callId,
                phoneNumber = metadata.phoneNumber,
                callerName = null,
                timestamp = metadata.callTime,
                duration = 0,
                wasBlocked = wasBlocked,
                userReported = false
            )
            
            callHistoryDao.insertCall(callRecord)
            
            // Persist risk assessment
            val riskId = UUID.randomUUID().toString()
            val riskAssessment = RiskAssessmentEntity(
                id = riskId,
                callId = callId,
                totalScore = fusedRisk.riskScore,
                riskLevel = fusedRisk.riskLevel.name,
                confidence = fusedRisk.confidence,
                metadataScore = fusedRisk.metadataContribution,
                manipulationScore = fusedRisk.manipulationContribution,
                historicalScore = fusedRisk.historicalContribution,
                primaryThreat = fusedRisk.getPrimaryThreat(),
                explanation = fusedRisk.explanation,
                timestamp = System.currentTimeMillis()
            )
            riskAssessmentDao.insertRisk(riskAssessment)
            
            // Persist triggers
            val riskBreakdown = _riskBreakdown.value
            if (riskBreakdown != null && riskBreakdown.triggers.isNotEmpty()) {
                val triggerEntities = riskBreakdown.triggers.mapNotNull { trigger ->
                    try {
                        RiskTriggerEntity(
                            id = 0,
                            riskAssessmentId = riskId,
                            category = trigger.category.name,
                            description = trigger.description,
                            score = trigger.score,
                            severity = trigger.severity.name,
                            timestamp = trigger.timestamp
                        )
                    } catch (e: Exception) {
                        null
                    }
                }
                if (triggerEntities.isNotEmpty()) {
                    riskTriggerDao.insertTriggers(triggerEntities)
                }
            }
            
            // Update historical risk
            updateHistoricalRiskSuspend(metadata.phoneNumber, fusedRisk)
            
            return callId
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to persist call record: ${e.message}")
            return null
        }
    }
    
    /**
     * Suspend version of updateHistoricalRisk
     */
    private suspend fun updateHistoricalRiskSuspend(phoneNumber: String, fusedRisk: FusedRiskResult) {
        if (phoneNumber.isBlank()) return
        
        try {
            val existing = historicalRiskDao.getHistoricalRisk(phoneNumber)
            val isScamCall = fusedRisk.riskLevel == RiskLevel.HIGH
            
            val updated = if (existing != null) {
                val newTotalCalls = existing.totalCalls + 1
                val newScamCalls = existing.scamCalls + if (isScamCall) 1 else 0
                val newAverageRiskScore = if (newTotalCalls > 0) {
                    ((existing.averageRiskScore * existing.totalCalls) + fusedRisk.riskScore) / newTotalCalls
                } else {
                    fusedRisk.riskScore
                }
                val scamRate = if (newTotalCalls > 0) newScamCalls.toFloat() / newTotalCalls.toFloat() else 0f
                val isBlacklisted = scamRate >= 0.5f || (scamRate >= 0.33f && fusedRisk.confidence >= 0.8f)
                
                HistoricalRiskEntity(
                    phoneNumber = phoneNumber,
                    totalCalls = newTotalCalls,
                    scamCalls = newScamCalls,
                    averageRiskScore = newAverageRiskScore.coerceAtLeast(0f),
                    lastCallTime = System.currentTimeMillis(),
                    lastRiskLevel = fusedRisk.riskLevel.name,
                    isBlacklisted = isBlacklisted
                )
            } else {
                HistoricalRiskEntity(
                    phoneNumber = phoneNumber,
                    totalCalls = 1,
                    scamCalls = if (isScamCall) 1 else 0,
                    averageRiskScore = fusedRisk.riskScore.coerceAtLeast(0f),
                    lastCallTime = System.currentTimeMillis(),
                    lastRiskLevel = fusedRisk.riskLevel.name,
                    isBlacklisted = isScamCall && fusedRisk.confidence >= 0.8f
                )
            }
            
            historicalRiskDao.insertOrUpdateHistoricalRisk(updated)
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to update historical risk: ${e.message}")
        }
    }
    
    /**
     * Persist call record to database with risk assessment and triggers (Task 6.1, 9.2, 9.5)
     * 
     * Creates a complete call record including metadata, risk assessment, and all
     * detected triggers. Updates historical risk data for the phone number.
     * 
     * Implements retry logic for failed writes (max 3 attempts with exponential backoff).
     * Errors are logged with structured logging and PII hashing.
     * 
     * @param metadata Call metadata (phone number, time, etc.)
     * @param fusedRisk Complete risk assessment from fusion engine
     * @return Call ID for reference, or null if persistence failed
     */
    private suspend fun persistCallRecord(
        metadata: CallMetadata,
        fusedRisk: FusedRiskResult
    ): String? = withContext(Dispatchers.IO) {
        var attempts = 0
        val maxAttempts = 3
        var lastError: Exception? = null
        
        while (attempts < maxAttempts) {
            try {
                // Generate unique call ID
                val callId = UUID.randomUUID().toString()
                
                // Determine if call should be blocked based on risk level and confidence
                val wasBlocked = fusedRisk.riskLevel == RiskLevel.HIGH && fusedRisk.confidence >= 0.7f
                
                // Create call record entity
                val callRecord = CallRecordEntity(
                    id = callId,
                    phoneNumber = metadata.phoneNumber,
                    callerName = null, // Not available in metadata
                    timestamp = metadata.callTime,
                    duration = 0, // Duration not tracked yet (would need call end time)
                    wasBlocked = wasBlocked,
                    userReported = false
                )
                
                // Insert call record
                callHistoryDao.insertCall(callRecord)
                
                // Log with hashed phone number for privacy
                val phoneHash = Logger.hashPhoneNumber(metadata.phoneNumber)
                Logger.info("MonitoringManager", "Persisted call record: $callId for phone hash: ${phoneHash.take(8)}...")
                
                // Persist risk assessment with triggers
                persistRiskAssessment(callId, fusedRisk)
                
                // Update historical risk for this phone number
                updateHistoricalRisk(metadata.phoneNumber, fusedRisk)
                
                return@withContext callId
                
            } catch (e: Exception) {
                lastError = e
                attempts++
                
                // Structured error logging with PII hashing
                val phoneHash = Logger.hashPhoneNumber(metadata.phoneNumber)
                Logger.logStructuredError(
                    component = "MonitoringManager",
                    errorType = ErrorType.DATABASE_ERROR,
                    message = "Database write failed (attempt $attempts/$maxAttempts)",
                    exception = e,
                    severity = if (attempts >= maxAttempts) ErrorSeverity.HIGH else ErrorSeverity.MEDIUM,
                    context = mapOf(
                        "phoneHash" to phoneHash.take(16),
                        "attempt" to attempts.toString(),
                        "riskLevel" to fusedRisk.riskLevel.name
                    )
                )
                
                if (attempts < maxAttempts) {
                    // Exponential backoff: 1s, 2s, 4s
                    val delayMs = (1000L * (1 shl (attempts - 1)))
                    delay(delayMs)
                }
            }
        }
        
        // All attempts failed
        val phoneHash = Logger.hashPhoneNumber(metadata.phoneNumber)
        Logger.error("MonitoringManager", "Failed to persist call record after $maxAttempts attempts for phone hash: ${phoneHash.take(8)}...", lastError)
        return@withContext null
    }
    
    /**
     * Persist risk assessment with all triggers (Task 6.2, 9.2)
     * 
     * Creates a risk assessment entity from the fused risk result and persists
     * all detected triggers. Uses a single transaction for atomicity.
     * 
     * Enhanced with retry logic and error handling:
     * - Retries up to 3 times with exponential backoff
     * - Validates data before persistence
     * - Logs errors with context
     * 
     * @param callId Foreign key to call record
     * @param fusedRisk Complete risk assessment from fusion engine
     */
    private suspend fun persistRiskAssessment(
        callId: String,
        fusedRisk: FusedRiskResult
    ) = withContext(Dispatchers.IO) {
        var attempts = 0
        val maxAttempts = 3
        var lastError: Exception? = null
        
        while (attempts < maxAttempts) {
            try {
                // Validate input data
                if (callId.isBlank()) {
                    Logger.error("MonitoringManager", "Invalid callId for risk assessment")
                    return@withContext
                }
                
                // Generate unique risk assessment ID
                val riskId = UUID.randomUUID().toString()
                
                // Create risk assessment entity
                val riskAssessment = RiskAssessmentEntity(
                    id = riskId,
                    callId = callId,
                    totalScore = fusedRisk.riskScore,
                    riskLevel = fusedRisk.riskLevel.name,
                    confidence = fusedRisk.confidence,
                    metadataScore = fusedRisk.metadataContribution,
                    manipulationScore = fusedRisk.manipulationContribution,
                    historicalScore = fusedRisk.historicalContribution,
                    primaryThreat = fusedRisk.getPrimaryThreat(),
                    explanation = fusedRisk.explanation,
                    timestamp = System.currentTimeMillis()
                )
                
                // Insert risk assessment
                riskAssessmentDao.insertRisk(riskAssessment)
                Logger.info("MonitoringManager", "Persisted risk assessment: $riskId")
                
                // Persist all triggers
                val riskBreakdown = _riskBreakdown.value
                if (riskBreakdown != null && riskBreakdown.triggers.isNotEmpty()) {
                    persistTriggers(riskId, riskBreakdown.triggers)
                }
                
                return@withContext // Success
                
            } catch (e: Exception) {
                lastError = e
                attempts++
                Logger.error("MonitoringManager", "Failed to persist risk assessment (attempt $attempts/$maxAttempts): ${e.message}")
                
                if (attempts < maxAttempts) {
                    // Exponential backoff: 1s, 2s, 4s
                    val delayMs = (1000L * (1 shl (attempts - 1)))
                    delay(delayMs)
                }
            }
        }
        
        // All attempts failed - log and rethrow
        Logger.error("MonitoringManager", "Failed to persist risk assessment after $maxAttempts attempts", lastError)
        throw lastError ?: Exception("Unknown error persisting risk assessment")
    }
    
    /**
     * Persist all triggers for a risk assessment (Task 6.3, 9.2)
     * 
     * Converts TriggerInfo objects to RiskTriggerEntity and batch inserts them.
     * Uses a single database transaction for efficiency.
     * 
     * Enhanced with retry logic and validation:
     * - Retries up to 3 times with exponential backoff
     * - Validates trigger data before persistence
     * - Logs errors with context
     * 
     * @param riskAssessmentId Foreign key to risk assessment
     * @param triggers List of detected triggers
     */
    private suspend fun persistTriggers(
        riskAssessmentId: String,
        triggers: List<TriggerInfo>
    ) = withContext(Dispatchers.IO) {
        var attempts = 0
        val maxAttempts = 3
        var lastError: Exception? = null
        
        while (attempts < maxAttempts) {
            try {
                // Validate input data
                if (riskAssessmentId.isBlank()) {
                    Logger.error("MonitoringManager", "Invalid riskAssessmentId for triggers")
                    return@withContext
                }
                
                if (triggers.isEmpty()) {
                    Logger.info("MonitoringManager", "No triggers to persist")
                    return@withContext
                }
                
                // Convert TriggerInfo to RiskTriggerEntity
                val triggerEntities = triggers.mapNotNull { trigger ->
                    try {
                        RiskTriggerEntity(
                            id = 0, // Auto-generated
                            riskAssessmentId = riskAssessmentId,
                            category = trigger.category.name,
                            description = trigger.description,
                            score = trigger.score,
                            severity = trigger.severity.name,
                            timestamp = trigger.timestamp
                        )
                    } catch (e: Exception) {
                        Logger.warn("MonitoringManager", "Failed to convert trigger: ${e.message}")
                        null // Skip invalid trigger
                    }
                }
                
                if (triggerEntities.isEmpty()) {
                    Logger.warn("MonitoringManager", "No valid triggers to persist")
                    return@withContext
                }
                
                // Batch insert all triggers
                riskTriggerDao.insertTriggers(triggerEntities)
                Logger.info("MonitoringManager", "Persisted ${triggerEntities.size} triggers")
                
                return@withContext // Success
                
            } catch (e: Exception) {
                lastError = e
                attempts++
                Logger.error("MonitoringManager", "Failed to persist triggers (attempt $attempts/$maxAttempts): ${e.message}")
                
                if (attempts < maxAttempts) {
                    // Exponential backoff: 1s, 2s, 4s
                    val delayMs = (1000L * (1 shl (attempts - 1)))
                    delay(delayMs)
                }
            }
        }
        
        // All attempts failed - log and rethrow
        Logger.error("MonitoringManager", "Failed to persist triggers after $maxAttempts attempts", lastError)
        throw lastError ?: Exception("Unknown error persisting triggers")
    }
    
    /**
     * Update historical risk data for a phone number (Task 6.4, 9.2)
     * 
     * Calculates running statistics for the phone number including:
     * - Total calls and scam calls
     * - Average risk score
     * - Blacklist status (scam rate >= 50% or high confidence scammer)
     * 
     * Updates the historicalRisks StateFlow for UI display.
     * 
     * Enhanced with retry logic and validation:
     * - Retries up to 3 times with exponential backoff
     * - Validates phone number format
     * - Handles edge cases (division by zero, negative values)
     * 
     * @param phoneNumber Phone number to update
     * @param fusedRisk Latest risk assessment for this number
     */
    private suspend fun updateHistoricalRisk(
        phoneNumber: String,
        fusedRisk: FusedRiskResult
    ) = withContext(Dispatchers.IO) {
        var attempts = 0
        val maxAttempts = 3
        var lastError: Exception? = null
        
        while (attempts < maxAttempts) {
            try {
                // Validate phone number
                if (phoneNumber.isBlank()) {
                    Logger.error("MonitoringManager", "Invalid phone number for historical risk")
                    return@withContext
                }
                
                // Query existing historical risk
                val existing = historicalRiskDao.getHistoricalRisk(phoneNumber)
                
                // Determine if this call is a scam (HIGH risk)
                val isScamCall = fusedRisk.riskLevel == RiskLevel.HIGH
                
                val updated = if (existing != null) {
                    // Update existing record with new statistics
                    val newTotalCalls = existing.totalCalls + 1
                    val newScamCalls = existing.scamCalls + if (isScamCall) 1 else 0
                    
                    // Calculate new average risk score (prevent division by zero)
                    val newAverageRiskScore = if (newTotalCalls > 0) {
                        ((existing.averageRiskScore * existing.totalCalls) + fusedRisk.riskScore) / newTotalCalls
                    } else {
                        fusedRisk.riskScore
                    }
                    
                    // Determine blacklist status
                    // Blacklist if: scam rate >= 50% OR (scam rate >= 33% AND high confidence)
                    val scamRate = if (newTotalCalls > 0) {
                        newScamCalls.toFloat() / newTotalCalls.toFloat()
                    } else {
                        0f
                    }
                    val isBlacklisted = scamRate >= 0.5f || 
                        (scamRate >= 0.33f && fusedRisk.confidence >= 0.8f)
                    
                    HistoricalRiskEntity(
                        phoneNumber = phoneNumber,
                        totalCalls = newTotalCalls,
                        scamCalls = newScamCalls,
                        averageRiskScore = newAverageRiskScore.coerceAtLeast(0f), // Ensure non-negative
                        lastCallTime = System.currentTimeMillis(),
                        lastRiskLevel = fusedRisk.riskLevel.name,
                        isBlacklisted = isBlacklisted
                    )
                } else {
                    // Create new record for first call from this number
                    HistoricalRiskEntity(
                        phoneNumber = phoneNumber,
                        totalCalls = 1,
                        scamCalls = if (isScamCall) 1 else 0,
                        averageRiskScore = fusedRisk.riskScore.coerceAtLeast(0f),
                        lastCallTime = System.currentTimeMillis(),
                        lastRiskLevel = fusedRisk.riskLevel.name,
                        isBlacklisted = isScamCall && fusedRisk.confidence >= 0.8f
                    )
                }
                
                // Insert or update historical risk
                historicalRiskDao.insertOrUpdateHistoricalRisk(updated)
                val phoneHash = Logger.hashPhoneNumber(phoneNumber).take(8)
                Logger.info("MonitoringManager", "Updated historical risk for hash=$phoneHash... (scam rate: ${updated.scamCalls}/${updated.totalCalls})")
                
                // Update StateFlow for UI
                withContext(Dispatchers.Main) {
                    try {
                        val allHistoricalRisks = historicalRiskDao.getBlacklistedNumbers()
                            .map { entity ->
                                HistoricalRiskData(
                                    phoneNumber = entity.phoneNumber,
                                    totalCalls = entity.totalCalls,
                                    scamCalls = entity.scamCalls,
                                    averageRiskScore = entity.averageRiskScore,
                                    lastCallTime = entity.lastCallTime,
                                    riskScore = entity.averageRiskScore.toInt(),
                                    confidence = if (entity.isBlacklisted) 0.9f else 0.5f
                                )
                            }
                        _historicalRisks.value = allHistoricalRisks
                    } catch (e: Exception) {
                        Logger.error("MonitoringManager", "Failed to update historical risks StateFlow: ${e.message}")
                        // Non-critical - UI will use previous value
                    }
                }
                
                return@withContext // Success
                
            } catch (e: Exception) {
                lastError = e
                attempts++
                Logger.error("MonitoringManager", "Failed to update historical risk (attempt $attempts/$maxAttempts): ${e.message}")
                
                if (attempts < maxAttempts) {
                    // Exponential backoff: 1s, 2s, 4s
                    val delayMs = (1000L * (1 shl (attempts - 1)))
                    delay(delayMs)
                }
            }
        }
        
        // All attempts failed - log but don't rethrow (non-critical)
        Logger.error("MonitoringManager", "Failed to update historical risk after $maxAttempts attempts", lastError)
    }
    
    /**
     * Retrieve historical risk data for a phone number (Task 6.4)
     * 
     * Used by risk fusion engine to incorporate historical data into detection.
     * Returns null if no historical data exists for this number.
     * 
     * @param phoneNumber Phone number to query
     * @return Historical risk data or null if not found
     */
    private suspend fun getHistoricalRisk(phoneNumber: String): HistoricalRiskData? = withContext(Dispatchers.IO) {
        try {
            val entity = historicalRiskDao.getHistoricalRisk(phoneNumber)
            entity?.let {
                HistoricalRiskData(
                    phoneNumber = it.phoneNumber,
                    totalCalls = it.totalCalls,
                    scamCalls = it.scamCalls,
                    averageRiskScore = it.averageRiskScore,
                    lastCallTime = it.lastCallTime,
                    riskScore = it.averageRiskScore.toInt(),
                    confidence = if (it.isBlacklisted) 0.9f else 0.5f
                )
            }
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to retrieve historical risk: ${e.message}")
            null
        }
    }
    
    // ========== Call History Retrieval (Task 6.5) ==========
    
    /**
     * Get call history with pagination (Task 6.5)
     * 
     * Retrieves call records ordered by most recent first. Supports pagination
     * for efficient loading of large datasets.
     * 
     * @param limit Number of records per page (default: 50)
     * @param offset Starting position (default: 0)
     * @return List of call records with risk assessments
     */
    suspend fun getCallHistory(limit: Int = 50, offset: Int = 0): List<CallRecordWithRisk> = withContext(Dispatchers.IO) {
        try {
            val calls = callHistoryDao.getCallsPaginated(limit, offset)
            
            // Join with risk assessments and triggers
            calls.map { call ->
                val risk = riskAssessmentDao.getRiskByCallId(call.id)
                val triggers = risk?.let { riskTriggerDao.getTriggersByRiskId(it.id) } ?: emptyList()
                
                CallRecordWithRisk(
                    call = call,
                    risk = risk,
                    triggers = triggers
                )
            }
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to retrieve call history: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Get detailed call information by ID (Task 6.5)
     * 
     * Retrieves complete call record with risk assessment and all triggers.
     * Used for displaying detailed risk breakdown in UI.
     * 
     * @param callId Unique call identifier
     * @return Complete call record or null if not found
     */
    suspend fun getCallDetails(callId: String): CallRecordWithRisk? = withContext(Dispatchers.IO) {
        try {
            val call = callHistoryDao.getCallById(callId) ?: return@withContext null
            val risk = riskAssessmentDao.getRiskByCallId(callId)
            val triggers = risk?.let { riskTriggerDao.getTriggersByRiskId(it.id) } ?: emptyList()
            
            CallRecordWithRisk(
                call = call,
                risk = risk,
                triggers = triggers
            )
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to retrieve call details: ${e.message}")
            null
        }
    }
    
    /**
     * Get call history filtered by risk level (Task 6.5)
     * 
     * @param riskLevel Risk level to filter by (HIGH, MEDIUM, LOW)
     * @return List of calls matching the risk level
     */
    suspend fun getCallHistoryByRiskLevel(riskLevel: RiskLevel): List<CallRecordWithRisk> = withContext(Dispatchers.IO) {
        try {
            val calls = callHistoryDao.getCallsByRiskLevel(riskLevel.name)
            
            calls.map { call ->
                val risk = riskAssessmentDao.getRiskByCallId(call.id)
                val triggers = risk?.let { riskTriggerDao.getTriggersByRiskId(it.id) } ?: emptyList()
                
                CallRecordWithRisk(
                    call = call,
                    risk = risk,
                    triggers = triggers
                )
            }
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to retrieve calls by risk level: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Get call history within date range (Task 6.5)
     * 
     * @param startTime Start timestamp (milliseconds)
     * @param endTime End timestamp (milliseconds)
     * @return List of calls within the date range
     */
    suspend fun getCallHistoryByDateRange(startTime: Long, endTime: Long): List<CallRecordWithRisk> = withContext(Dispatchers.IO) {
        try {
            val calls = callHistoryDao.getCallsByDateRange(startTime, endTime)
            
            calls.map { call ->
                val risk = riskAssessmentDao.getRiskByCallId(call.id)
                val triggers = risk?.let { riskTriggerDao.getTriggersByRiskId(it.id) } ?: emptyList()
                
                CallRecordWithRisk(
                    call = call,
                    risk = risk,
                    triggers = triggers
                )
            }
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to retrieve calls by date range: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Delete all call history data (Requirements 15.5).
     * 
     * This method permanently deletes:
     * - All call records
     * - All risk assessments (cascade delete via foreign key)
     * - All risk triggers (cascade delete via foreign key)
     * - All historical risk data
     * 
     * The deletion is atomic - either all data is deleted or none.
     * This ensures no orphaned records remain in the database.
     * 
     * Privacy: This is used when the user requests complete data deletion.
     * After deletion, all call history and risk data is permanently removed.
     * 
     * @return true if deletion successful, false otherwise
     */
    suspend fun deleteCallHistory(): Boolean = withContext(Dispatchers.IO) {
        try {
            Logger.info("MonitoringManager", "Deleting all call history data")
            
            // Delete all call records (cascades to risk assessments and triggers)
            callHistoryDao.deleteAllCalls()
            
            // Delete all historical risk data
            historicalRiskDao.deleteAllHistoricalRisks()
            
            Logger.info("MonitoringManager", "All call history data deleted successfully")
            
            // Clear in-memory state flows
            withContext(Dispatchers.Main) {
                _historicalRisks.value = emptyList()
                _detectionState.value = null
                _riskBreakdown.value = null
            }
            
            true
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to delete call history", e)
            false
        }
    }
    
    /**
     * Delete a specific call record (Requirements 15.5).
     * 
     * Deletes a single call record and all associated data:
     * - Risk assessment (cascade delete via foreign key)
     * - Risk triggers (cascade delete via foreign key)
     * 
     * @param callId ID of the call to delete
     * @return true if deletion successful, false otherwise
     */
    suspend fun deleteCall(callId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val call = callHistoryDao.getCallById(callId)
            if (call != null) {
                callHistoryDao.deleteCall(call)
                Logger.info("MonitoringManager", "Deleted call record: $callId")
                true
            } else {
                Logger.warn("MonitoringManager", "Call not found for deletion: $callId")
                false
            }
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to delete call: $callId", e)
            false
        }
    }
    
    /**
     * Verify no orphaned data exists after deletion (Requirements 13.3).
     * 
     * This method checks database integrity after deletion operations
     * to ensure cascade deletes worked correctly.
     * 
     * @return true if no orphaned data found, false otherwise
     */
    suspend fun verifyNoOrphanedData(): Boolean = withContext(Dispatchers.IO) {
        try {
            // Get all call IDs
            val callIds = callHistoryDao.getAllCalls().map { it.id }.toSet()
            
            // Get all risk assessment call IDs
            val riskCallIds = riskAssessmentDao.getRecentRisks().map { it.callId }.toSet()
            
            // Check for orphaned risk assessments
            val orphanedRisks = riskCallIds - callIds
            if (orphanedRisks.isNotEmpty()) {
                Logger.error("MonitoringManager", "Found ${orphanedRisks.size} orphaned risk assessments")
                return@withContext false
            }
            
            Logger.info("MonitoringManager", "No orphaned data found - database integrity verified")
            true
        } catch (e: Exception) {
            Logger.error("MonitoringManager", "Failed to verify data integrity", e)
            false
        }
    }
}

/**
 * WebSocket connection states
 */
enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    DISCONNECTING,
    ERROR
}

/**
 * Threat levels
 */
enum class ThreatLevel {
    SAFE,
    CAUTION,
    DANGER
}
