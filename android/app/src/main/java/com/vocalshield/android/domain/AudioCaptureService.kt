package com.vocalshield.android.domain

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.telephony.TelephonyManager
import android.view.accessibility.AccessibilityEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.isActive
import android.util.Log

/**
 * Accessibility Service implementation for capturing phone call audio.
 * 
 * Privacy-First Design:
 * - Audio is NEVER stored to disk
 * - Audio is processed in RAM only
 * - Audio capture stops immediately when call ends
 * - User-initiated monitoring only
 * 
 * Requirements: 1.1, 1.3, 1.4, 8.1, 8.2
 */
class AudioCaptureService : AccessibilityService(), IAudioCaptureService {
    
    companion object {
        private const val TAG = "AudioCaptureService"
        private const val SAMPLE_RATE = 16000 // 16kHz
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val BUFFER_SIZE_MULTIPLIER = 2
        
        // Singleton instance for access from repositories
        @Volatile
        private var instance: AudioCaptureService? = null
        
        fun getInstance(): AudioCaptureService? = instance
    }
    
    private var audioRecord: AudioRecord? = null
    private var captureJob: Job? = null
    private var isCapturingFlag = false
    private var currentCallId: String? = null
    
    private val audioStreamFlow = MutableSharedFlow<ByteArray>(
        replay = 0,
        extraBufferCapacity = 10
    )
    
    private val serviceScope = CoroutineScope(Dispatchers.Default + Job())
    
    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "AudioCaptureService created")
    }
    
    override fun onDestroy() {
        super.onDestroy()
        stopCapture()
        instance = null
        Log.d(TAG, "AudioCaptureService destroyed")
    }
    
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Monitor phone state changes if needed
        // For now, capture is controlled via startCapture/stopCapture
    }
    
    override fun onInterrupt() {
        Log.w(TAG, "Service interrupted")
        stopCapture()
    }
    
    override fun startCapture(callId: String): Result<Unit> {
        return try {
            if (isCapturingFlag) {
                Log.w(TAG, "Already capturing audio")
                return Result.success(Unit)
            }
            
            currentCallId = callId
            
            // Calculate buffer size
            val minBufferSize = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT
            )
            
            if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
                return Result.failure(Exception("Device does not support audio capture"))
            }
            
            val bufferSize = minBufferSize * BUFFER_SIZE_MULTIPLIER
            
            // Create AudioRecord instance
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize
            )
            
            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                audioRecord?.release()
                audioRecord = null
                return Result.failure(Exception("Failed to initialize AudioRecord"))
            }
            
            // Start recording
            audioRecord?.startRecording()
            isCapturingFlag = true
            
            // Start capture loop
            captureJob = serviceScope.launch {
                captureAudioLoop(bufferSize)
            }
            
            Log.i(TAG, "Audio capture started for call: $callId")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start audio capture", e)
            Result.failure(e)
        }
    }
    
    override fun stopCapture(): Result<Unit> {
        return try {
            if (!isCapturingFlag) {
                return Result.success(Unit)
            }
            
            isCapturingFlag = false
            captureJob?.cancel()
            captureJob = null
            
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
            
            currentCallId = null
            
            Log.i(TAG, "Audio capture stopped")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping audio capture", e)
            Result.failure(e)
        }
    }
    
    override fun isCapturing(): Boolean = isCapturingFlag
    
    override fun getAudioStream(): Flow<ByteArray> = audioStreamFlow.asSharedFlow()
    
    /**
     * Continuous audio capture loop.
     * Reads audio data and emits to flow.
     * Privacy: Audio is NEVER stored, only emitted to flow for processing.
     */
    private suspend fun captureAudioLoop(bufferSize: Int) {
        val buffer = ByteArray(bufferSize)
        
        while (isActive && isCapturingFlag) {
            try {
                val bytesRead = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                
                if (bytesRead > 0) {
                    // Create a copy of the buffer to emit (don't reuse the same array)
                    val audioChunk = buffer.copyOf(bytesRead)
                    audioStreamFlow.emit(audioChunk)
                } else if (bytesRead == AudioRecord.ERROR_INVALID_OPERATION) {
                    Log.e(TAG, "Invalid operation during audio read")
                    break
                } else if (bytesRead == AudioRecord.ERROR_BAD_VALUE) {
                    Log.e(TAG, "Bad value during audio read")
                    break
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error in audio capture loop", e)
                break
            }
        }
        
        Log.d(TAG, "Audio capture loop ended")
    }
}
