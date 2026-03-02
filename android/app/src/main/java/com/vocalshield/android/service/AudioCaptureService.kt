package com.vocalshield.android.service

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.vocalshield.android.util.Config
import com.vocalshield.android.util.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Service for capturing audio from phone calls.
 * Uses AudioRecord API to capture PCM audio at 16kHz.
 */
class AudioCaptureService {
    
    private var audioRecord: AudioRecord? = null
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var captureJob: Job? = null
    
    private val _isCapturing = MutableStateFlow(false)
    val isCapturing: StateFlow<Boolean> = _isCapturing
    
    private val _audioLevel = MutableStateFlow(0f)
    val audioLevel: StateFlow<Float> = _audioLevel
    
    private var audioChunkCallback: ((ByteArray) -> Unit)? = null
    
    private val bufferSize: Int by lazy {
        val minBufferSize = AudioRecord.getMinBufferSize(
            Config.Audio.SAMPLE_RATE,
            Config.Audio.CHANNEL_CONFIG,
            Config.Audio.AUDIO_FORMAT
        )
        
        // Use 2x minimum buffer size for stability
        maxOf(minBufferSize * 2, calculateChunkSize())
    }
    
    /**
     * Calculate chunk size based on desired chunk duration
     */
    private fun calculateChunkSize(): Int {
        // 16kHz * 16-bit (2 bytes) * 100ms = 3200 bytes
        return (Config.Audio.SAMPLE_RATE * 2 * Config.Audio.CHUNK_SIZE_MS) / 1000
    }
    
    /**
     * Start capturing audio
     */
    fun startCapture(onAudioChunk: (ByteArray) -> Unit) {
        if (_isCapturing.value) {
            Logger.warn("AudioCaptureService", "Already capturing")
            return
        }
        
        audioChunkCallback = onAudioChunk
        
        try {
            // Initialize AudioRecord
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                Config.Audio.SAMPLE_RATE,
                Config.Audio.CHANNEL_CONFIG,
                Config.Audio.AUDIO_FORMAT,
                bufferSize
            )
            
            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Logger.error("AudioCaptureService", "AudioRecord initialization failed")
                return
            }
            
            audioRecord?.startRecording()
            _isCapturing.value = true
            
            Logger.info("AudioCaptureService", "Audio capture started (buffer: $bufferSize bytes)")
            
            // Start capture loop
            captureJob = scope.launch {
                captureLoop()
            }
            
        } catch (e: SecurityException) {
            Logger.error("AudioCaptureService", "Permission denied for audio recording", e)
        } catch (e: Exception) {
            Logger.error("AudioCaptureService", "Failed to start audio capture", e)
        }
    }
    
    /**
     * Stop capturing audio
     */
    fun stopCapture() {
        if (!_isCapturing.value) {
            return
        }
        
        Logger.info("AudioCaptureService", "Stopping audio capture")
        
        captureJob?.cancel()
        captureJob = null
        
        try {
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
        } catch (e: Exception) {
            Logger.error("AudioCaptureService", "Error stopping audio capture", e)
        }
        
        _isCapturing.value = false
        audioChunkCallback = null
        
        Logger.info("AudioCaptureService", "Audio capture stopped")
    }
    
    /**
     * Main capture loop
     */
    private suspend fun captureLoop() {
        val chunkSize = calculateChunkSize()
        val buffer = ByteArray(chunkSize)
        
        Logger.debug("AudioCaptureService", "Capture loop started (chunk: $chunkSize bytes)")
        
        while (scope.isActive && _isCapturing.value) {
            try {
                val bytesRead = audioRecord?.read(buffer, 0, chunkSize) ?: 0
                
                if (bytesRead > 0) {
                    // Calculate audio level for visualization
                    val level = calculateAudioLevel(buffer, bytesRead)
                    _audioLevel.value = level
                    
                    // Send chunk to callback
                    val chunk = buffer.copyOf(bytesRead)
                    audioChunkCallback?.invoke(chunk)
                    
                } else if (bytesRead < 0) {
                    Logger.error("AudioCaptureService", "Read error: $bytesRead")
                    break
                }
                
                // Small delay to prevent tight loop
                delay(10)
                
            } catch (e: Exception) {
                Logger.error("AudioCaptureService", "Error in capture loop", e)
                break
            }
        }
        
        Logger.debug("AudioCaptureService", "Capture loop ended")
    }
    
    /**
     * Calculate audio level (RMS) for visualization
     */
    private fun calculateAudioLevel(buffer: ByteArray, length: Int): Float {
        if (length < 2) return 0f
        
        var sum = 0L
        val samples = length / 2
        
        // Convert bytes to 16-bit samples and calculate RMS
        for (i in 0 until length step 2) {
            val sample = ((buffer[i + 1].toInt() shl 8) or (buffer[i].toInt() and 0xFF)).toShort()
            sum += (sample * sample).toLong()
        }
        
        val rms = kotlin.math.sqrt(sum.toDouble() / samples)
        
        // Normalize to 0-1 range (assuming max amplitude is 32767)
        return (rms / 32767.0).toFloat().coerceIn(0f, 1f)
    }
    
    /**
     * Check if audio recording permission is granted
     */
    fun hasPermission(context: android.content.Context): Boolean {
        return android.content.pm.PackageManager.PERMISSION_GRANTED ==
            androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.RECORD_AUDIO
            )
    }
    
    /**
     * Cleanup resources
     */
    fun cleanup() {
        stopCapture()
    }
}
