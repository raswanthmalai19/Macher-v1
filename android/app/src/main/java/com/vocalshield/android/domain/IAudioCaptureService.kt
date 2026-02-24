package com.vocalshield.android.domain

import kotlinx.coroutines.flow.Flow

/**
 * Interface for audio capture service using Android Accessibility Service API.
 * Captures phone call audio for real-time fraud detection.
 * 
 * Privacy: Audio is never stored persistently, only processed in memory.
 */
interface IAudioCaptureService {
    /**
     * Start capturing audio for the given call.
     * @param callId Unique identifier for the call session
     * @return Result indicating success or failure
     */
    fun startCapture(callId: String): Result<Unit>
    
    /**
     * Stop capturing audio immediately.
     * @return Result indicating success or failure
     */
    fun stopCapture(): Result<Unit>
    
    /**
     * Check if audio capture is currently active.
     * @return true if capturing, false otherwise
     */
    fun isCapturing(): Boolean
    
    /**
     * Get a flow of raw audio data chunks.
     * Audio is emitted as ByteArray chunks for processing.
     * @return Flow emitting raw audio data
     */
    fun getAudioStream(): Flow<ByteArray>
}
