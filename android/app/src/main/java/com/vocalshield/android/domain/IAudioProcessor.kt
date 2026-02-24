package com.vocalshield.android.domain

/**
 * Interface for audio processing and format conversion.
 * Converts raw audio to PCM format and segments into chunks.
 */
interface IAudioProcessor {
    /**
     * Process raw audio data and convert to PCM format.
     * @param rawAudio Raw audio bytes from capture
     * @return Result containing processed AudioChunk or error
     */
    fun processAudio(rawAudio: ByteArray): Result<AudioChunk>
    
    /**
     * Configure audio processing parameters.
     * @param sampleRate Sample rate in Hz (default: 16000)
     * @param bitDepth Bit depth (default: 16)
     * @param channels Number of channels (default: 1 for mono)
     */
    fun configure(sampleRate: Int = 16000, bitDepth: Int = 16, channels: Int = 1)
}

/**
 * Represents a processed audio chunk ready for streaming.
 * @property data PCM audio data
 * @property timestamp Timestamp when chunk was created (milliseconds)
 * @property durationMs Duration of audio chunk in milliseconds
 */
data class AudioChunk(
    val data: ByteArray,
    val timestamp: Long,
    val durationMs: Int
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as AudioChunk
        if (!data.contentEquals(other.data)) return false
        if (timestamp != other.timestamp) return false
        if (durationMs != other.durationMs) return false
        return true
    }

    override fun hashCode(): Int {
        var result = data.contentHashCode()
        result = 31 * result + timestamp.hashCode()
        result = 31 * result + durationMs
        return result
    }
}
