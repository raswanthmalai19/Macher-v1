package com.macher.android.demo

import com.macher.android.detection.CallMetadata
import com.macher.android.detection.RiskLevel
import com.macher.android.detection.ScenarioProgress
import com.macher.android.util.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Controls demo scenario playback with progressive risk analysis.
 * 
 * This controller manages the playback of preloaded scam scenarios for competition
 * demonstrations. It simulates realistic call progression by playing conversation
 * segments with proper timing, accumulating transcription text, and triggering
 * detection analysis at each step.
 * 
 * Key features:
 * - Progressive risk analysis (risk evolves as conversation progresses)
 * - Realistic timing between segments
 * - Playback controls (play, pause, reset)
 * - Progress tracking for UI updates
 * - Works without AWS backend or network connectivity
 * 
 * Usage:
 * ```
 * val controller = DemoScenarioController { metadata, text ->
 *     monitoringManager.performDetection(metadata, text)
 * }
 * controller.selectScenario(ScamScenarios.BANK_FRAUD_OTP)
 * controller.playScenario()
 * ```
 * 
 * @property onAnalyze Callback to trigger detection analysis with metadata and transcription
 */
class DemoScenarioController(
    private val onAnalyze: suspend (CallMetadata, String) -> Unit
) {
    
    private var currentScenario: ScamScenario? = null
    private var playbackJob: Job? = null
    private var currentSegmentIndex = 0
    private var isPaused = false
    private var startTime = 0L
    private var accumulatedText = ""
    private var currentRiskLevel = RiskLevel.LOW
    
    private val _progress = MutableStateFlow<ScenarioProgress?>(null)
    val progress: StateFlow<ScenarioProgress?> = _progress
    
    /**
     * Select a demo scenario for playback (Task 9.3)
     * 
     * Validates the scenario before selection to ensure it's playable.
     * Corrupted or invalid scenarios are rejected with clear error messages.
     * 
     * @param scenario The scenario to select
     * @throws IllegalArgumentException if scenario is invalid or corrupted
     */
    fun selectScenario(scenario: ScamScenario) {
        try {
            // Validate scenario structure
            validateScenario(scenario)
            
            Logger.info("DemoScenarioController", "Selected scenario: ${scenario.title}")
            
            currentScenario = scenario
            currentSegmentIndex = 0
            isPaused = false
            startTime = 0L
            accumulatedText = ""
            currentRiskLevel = RiskLevel.LOW
            
            updateProgress()
            
        } catch (e: IllegalArgumentException) {
            Logger.error("DemoScenarioController", "Invalid scenario: ${e.message}")
            throw e
        } catch (e: Exception) {
            Logger.error("DemoScenarioController", "Failed to select scenario: ${e.message}", e)
            throw IllegalStateException("Failed to select scenario: ${e.message}", e)
        }
    }
    
    /**
     * Validate scenario structure (Task 9.3)
     * 
     * Checks that the scenario has all required fields and valid data.
     * Prevents corrupted scenarios from causing runtime errors during playback.
     * 
     * @param scenario The scenario to validate
     * @throws IllegalArgumentException if scenario is invalid
     */
    private fun validateScenario(scenario: ScamScenario) {
        // Check conversation is not empty
        require(scenario.conversation.isNotEmpty()) {
            "Scenario '${scenario.title}' has no conversation segments"
        }
        
        // Check scenario has valid ID and title
        require(scenario.id.isNotBlank()) {
            "Scenario has blank ID"
        }
        require(scenario.title.isNotBlank()) {
            "Scenario has blank title"
        }
        
        // Check phone number is valid
        require(scenario.phoneNumber.isNotBlank()) {
            "Scenario '${scenario.title}' has blank phone number"
        }
        
        // Check conversation segments are valid
        scenario.conversation.forEachIndexed { index, segment ->
            require(segment.text.isNotBlank()) {
                "Scenario '${scenario.title}' has blank text at segment $index"
            }
            require(segment.timestamp >= 0) {
                "Scenario '${scenario.title}' has negative timestamp at segment $index"
            }
            require(segment.speaker.isNotBlank()) {
                "Scenario '${scenario.title}' has blank speaker at segment $index"
            }
        }
        
        // Check timestamps are monotonically increasing
        for (i in 1 until scenario.conversation.size) {
            val prev = scenario.conversation[i - 1].timestamp
            val curr = scenario.conversation[i].timestamp
            require(curr >= prev) {
                "Scenario '${scenario.title}' has non-monotonic timestamps at segment $i (${prev}ms -> ${curr}ms)"
            }
        }
        
        Logger.info("DemoScenarioController", "Scenario '${scenario.title}' validated successfully")
    }
    
    fun getAvailableScenarios(): List<ScamScenario> {
        return ScamScenarios.getAllScenarios()
    }
    
    fun playScenario() {
        val scenario = currentScenario ?: run {
            Logger.error("DemoScenarioController", "Cannot play: no scenario selected")
            throw IllegalStateException("No scenario selected")
        }
        
        if (isPaused) {
            Logger.info("DemoScenarioController", "Resuming scenario: ${scenario.title}")
            isPaused = false
            updateProgress()
            resumePlayback()
        } else {
            Logger.info("DemoScenarioController", "Starting scenario: ${scenario.title}")
            startTime = System.currentTimeMillis()
            currentSegmentIndex = 0
            accumulatedText = ""
            currentRiskLevel = RiskLevel.LOW
            
            playbackJob = CoroutineScope(Dispatchers.Main).launch {
                playScenarioFromStart(scenario)
            }
            
            updateProgress()
        }
    }
    
    fun pauseScenario() {
        if (playbackJob?.isActive != true) {
            Logger.warn("DemoScenarioController", "Cannot pause: no active playback")
            return
        }
        
        Logger.info("DemoScenarioController", "Pausing scenario at segment $currentSegmentIndex")
        
        isPaused = true
        playbackJob?.cancel()
        playbackJob = null
        
        updateProgress()
    }
    
    fun resetScenario() {
        Logger.info("DemoScenarioController", "Resetting scenario")
        
        playbackJob?.cancel()
        playbackJob = null
        
        currentSegmentIndex = 0
        isPaused = false
        startTime = 0L
        accumulatedText = ""
        currentRiskLevel = RiskLevel.LOW
        
        updateProgress()
    }
    
    fun hasScenario(): Boolean {
        return currentScenario != null
    }
    
    fun isPlaying(): Boolean {
        return playbackJob?.isActive == true && !isPaused
    }
    
    fun getCurrentScenario(): ScamScenario? {
        return currentScenario
    }
    
    fun updateRiskLevel(riskLevel: RiskLevel) {
        currentRiskLevel = riskLevel
        updateProgress()
    }
    
    fun cleanup() {
        Logger.info("DemoScenarioController", "Cleaning up")
        
        playbackJob?.cancel()
        playbackJob = null
        currentScenario = null
        _progress.value = null
    }
    
    private fun updateProgress() {
        val scenario = currentScenario ?: run {
            _progress.value = null
            return
        }
        
        val elapsedTime = if (startTime > 0) {
            System.currentTimeMillis() - startTime
        } else {
            0L
        }
        
        _progress.value = ScenarioProgress(
            scenarioId = scenario.id,
            scenarioTitle = scenario.title,
            currentSegment = currentSegmentIndex,
            totalSegments = scenario.conversation.size,
            elapsedTime = elapsedTime,
            currentRiskLevel = currentRiskLevel,
            isPlaying = playbackJob?.isActive == true && !isPaused,
            isPaused = isPaused
        )
        
        Logger.debug(
            "DemoScenarioController",
            "Progress: ${currentSegmentIndex}/${scenario.conversation.size}, " +
            "elapsed: ${elapsedTime}ms, risk: $currentRiskLevel"
        )
    }
    
    /**
     * Play scenario from start with comprehensive error handling (Task 9.3)
     * 
     * Plays through all conversation segments with realistic timing.
     * Handles errors gracefully to prevent playback interruption.
     */
    private suspend fun playScenarioFromStart(scenario: ScamScenario) {
        try {
            // Validate scenario one more time before playback
            validateScenario(scenario)
            
            val metadata = CallMetadata(
                phoneNumber = scenario.phoneNumber,
                callTime = scenario.callTime,
                isInContacts = false,
                recentCallCount = if (scenario.isInternational) 1 else 3,
                averageCallDuration = 45
            )
            
            Logger.info(
                "DemoScenarioController",
                "Analyzing metadata: ${metadata.phoneNumber}, international: ${scenario.isInternational}"
            )
            
            // Initial metadata analysis
            try {
                onAnalyze(metadata, "")
            } catch (e: Exception) {
                Logger.error("DemoScenarioController", "Initial analysis failed: ${e.message}", e)
                // Continue playback - analysis errors shouldn't stop demo
            }
            
            for ((index, segment) in scenario.conversation.withIndex()) {
                if (isPaused) {
                    Logger.info("DemoScenarioController", "Playback paused at segment $index")
                    break
                }
                
                try {
                    currentSegmentIndex = index
                    
                    // Calculate and apply delay
                    if (index > 0) {
                        val previousTimestamp = scenario.conversation[index - 1].timestamp
                        val delayTime = (segment.timestamp - previousTimestamp).coerceAtLeast(0L)
                        
                        if (delayTime > 0) {
                            Logger.debug(
                                "DemoScenarioController",
                                "Waiting ${delayTime}ms before segment $index"
                            )
                            delay(delayTime)
                        }
                    }
                    
                    // Accumulate text
                    accumulatedText += if (accumulatedText.isEmpty()) {
                        segment.text
                    } else {
                        " ${segment.text}"
                    }
                    
                    Logger.info(
                        "DemoScenarioController",
                        "Segment $index: ${segment.speaker} - ${segment.text.take(50)}..."
                    )
                    
                    // Trigger analysis
                    try {
                        onAnalyze(metadata, accumulatedText)
                    } catch (e: Exception) {
                        Logger.error("DemoScenarioController", "Analysis failed at segment $index: ${e.message}", e)
                        // Continue playback - individual analysis failures shouldn't stop demo
                    }
                    
                    updateProgress()
                    
                } catch (e: Exception) {
                    Logger.error("DemoScenarioController", "Error processing segment $index: ${e.message}", e)
                    // Continue to next segment
                }
            }
            
            if (!isPaused) {
                Logger.info("DemoScenarioController", "Scenario completed: ${scenario.title}")
                currentSegmentIndex = scenario.conversation.size
                updateProgress()
            }
            
        } catch (e: IllegalArgumentException) {
            // Scenario validation failed
            Logger.error("DemoScenarioController", "Scenario validation failed: ${e.message}", e)
            isPaused = false
            currentScenario = null // Disable corrupted scenario
            _progress.value = null
            throw e
            
        } catch (e: Exception) {
            Logger.error("DemoScenarioController", "Playback error: ${e.message}", e)
            isPaused = false
            updateProgress()
            // Don't rethrow - allow UI to handle gracefully
        }
    }
    
    /**
     * Resume playback from current position with error handling (Task 9.3)
     */
    private fun resumePlayback() {
        val scenario = currentScenario ?: run {
            Logger.error("DemoScenarioController", "Cannot resume: no scenario selected")
            return
        }
        
        playbackJob = CoroutineScope(Dispatchers.Main).launch {
            try {
                val metadata = CallMetadata(
                    phoneNumber = scenario.phoneNumber,
                    callTime = scenario.callTime,
                    isInContacts = false,
                    recentCallCount = if (scenario.isInternational) 1 else 3,
                    averageCallDuration = 45
                )
                
                for (index in currentSegmentIndex until scenario.conversation.size) {
                    if (isPaused) {
                        Logger.info("DemoScenarioController", "Playback paused again at segment $index")
                        break
                    }
                    
                    try {
                        val segment = scenario.conversation[index]
                        currentSegmentIndex = index
                        
                        if (index > 0) {
                            val previousTimestamp = scenario.conversation[index - 1].timestamp
                            val delayTime = (segment.timestamp - previousTimestamp).coerceAtLeast(0L)
                            if (delayTime > 0) {
                                delay(delayTime)
                            }
                        }
                        
                        accumulatedText += if (accumulatedText.isEmpty()) {
                            segment.text
                        } else {
                            " ${segment.text}"
                        }
                        
                        Logger.info(
                            "DemoScenarioController",
                            "Resumed segment $index: ${segment.speaker}"
                        )
                        
                        try {
                            onAnalyze(metadata, accumulatedText)
                        } catch (e: Exception) {
                            Logger.error("DemoScenarioController", "Analysis failed at resumed segment $index: ${e.message}", e)
                            // Continue playback
                        }
                        
                        updateProgress()
                        
                    } catch (e: Exception) {
                        Logger.error("DemoScenarioController", "Error processing resumed segment $index: ${e.message}", e)
                        // Continue to next segment
                    }
                }
                
                if (!isPaused) {
                    Logger.info("DemoScenarioController", "Scenario completed after resume")
                    currentSegmentIndex = scenario.conversation.size
                    updateProgress()
                }
                
            } catch (e: Exception) {
                Logger.error("DemoScenarioController", "Resume error: ${e.message}", e)
                isPaused = false
                updateProgress()
            }
        }
    }
}
