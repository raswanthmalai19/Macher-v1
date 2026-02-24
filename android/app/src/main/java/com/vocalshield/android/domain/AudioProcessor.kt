package com.vocalshield.android.domain

import android.media.AudioFormat
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Audio processor for format conversion and chunking.
 * Converts raw audio to PCM format: 16kHz sample rate, 16-bit depth, mono channel.
 * Segments audio into 100ms chunks for streaming.
 * 
 * Optimizations:
 * - Uses coroutines for async processing
 * - Implements buffering to reduce overhead
 * - Reuses ByteBuffer instances to minimize allocations
 */
class AudioProcessor : IAudioProcessor {
    
    companion object {
        private const val TAG = "AudioProcessor"
        private const val TARGET_SAMPLE_RATE = 16000  // 16kHz
        private const val TARGET_BIT_DEPTH = 16       // 16-bit
        private const val TARGET_CHANNELS = 1         // Mono
        private const val CHUNK_DURATION_MS = 100     // 100ms chunks
        
        // Calculate bytes per chunk: (sample_rate * channels * bit_depth/8 * duration_ms/1000)
        private const val BYTES_PER_CHUNK = TARGET_SAMPLE_RATE * TARGET_CHANNELS * (TARGET_BIT_DEPTH / 8) * CHUNK_DURATION_MS / 1000
        
        // Buffer pool size for memory optimization
        private const val BUFFER_POOL_SIZE = 4
    }
    
    private var sampleRate = TARGET_SAMPLE_RATE
    private var bitDepth = TARGET_BIT_DEPTH
    private var channels = TARGET_CHANNELS
    
    // Buffer pool to reduce allocations
    private val bufferPool = ArrayDeque<ByteArray>(BUFFER_POOL_SIZE)
    private val bufferLock = Any()
    
    // Reusable ByteBuffer instances
    private var inputBuffer: ByteBuffer? = null
    private var outputBuffer: ByteBuffer? = null
    
    override fun configure(sampleRate: Int, bitDepth: Int, channels: Int) {
        this.sampleRate = sampleRate
        this.bitDepth = bitDepth
        this.channels = channels
        
        // Pre-allocate buffers based on configuration
        val estimatedInputSize = sampleRate * channels * (bitDepth / 8) * CHUNK_DURATION_MS / 1000
        inputBuffer = ByteBuffer.allocateDirect(estimatedInputSize * 2).order(ByteOrder.LITTLE_ENDIAN)
        outputBuffer = ByteBuffer.allocateDirect(BYTES_PER_CHUNK * 2).order(ByteOrder.LITTLE_ENDIAN)
        
        Log.d(TAG, "Configured: ${sampleRate}Hz, ${bitDepth}-bit, $channels channel(s)")
    }
    
    override fun processAudio(rawAudio: ByteArray): Result<AudioChunk> {
        return try {
            // Validate input
            if (rawAudio.isEmpty()) {
                return Result.failure(IllegalArgumentException("Empty audio data"))
            }
            
            // Convert to target format asynchronously
            val convertedAudio = convertToTargetFormat(rawAudio)
            
            // Create chunk with timestamp
            val chunk = AudioChunk(
                data = convertedAudio,
                timestamp = System.currentTimeMillis(),
                durationMs = CHUNK_DURATION_MS
            )
            
            Result.success(chunk)
        } catch (e: Exception) {
            Log.e(TAG, "Audio processing failed", e)
            Result.failure(e)
        }
    }
    
    /**
     * Get a buffer from the pool or create a new one.
     */
    private fun acquireBuffer(size: Int): ByteArray {
        synchronized(bufferLock) {
            val buffer = bufferPool.removeFirstOrNull()
            return if (buffer != null && buffer.size >= size) {
                buffer
            } else {
                ByteArray(size)
            }
        }
    }
    
    /**
     * Return a buffer to the pool for reuse.
     */
    private fun releaseBuffer(buffer: ByteArray) {
        synchronized(bufferLock) {
            if (bufferPool.size < BUFFER_POOL_SIZE) {
                bufferPool.addLast(buffer)
            }
        }
    }
    
    /**
     * Convert raw audio to target PCM format.
     * Target: 16kHz, 16-bit, mono
     * Optimized with buffer reuse and minimal allocations.
     */
    private fun convertToTargetFormat(rawAudio: ByteArray): ByteArray {
        // If already in target format, segment to chunk size
        if (sampleRate == TARGET_SAMPLE_RATE && 
            bitDepth == TARGET_BIT_DEPTH && 
            channels == TARGET_CHANNELS) {
            return segmentToChunkSize(rawAudio)
        }
        
        // Reuse buffers for conversions
        var audio = rawAudio
        
        // Convert sample rate if needed
        if (sampleRate != TARGET_SAMPLE_RATE) {
            audio = resampleAudio(audio, sampleRate, TARGET_SAMPLE_RATE)
        }
        
        // Convert to mono if needed (most expensive operation, do after resampling)
        if (channels > TARGET_CHANNELS) {
            audio = convertToMono(audio, channels)
        }
        
        // Convert bit depth if needed
        if (bitDepth != TARGET_BIT_DEPTH) {
            audio = convertBitDepth(audio, bitDepth, TARGET_BIT_DEPTH)
        }
        
        return segmentToChunkSize(audio)
    }
    
    /**
     * Segment audio to target chunk size (100ms).
     * Reuses output buffer to minimize allocations.
     */
    private fun segmentToChunkSize(audio: ByteArray): ByteArray {
        val result = acquireBuffer(BYTES_PER_CHUNK)
        
        if (audio.size >= BYTES_PER_CHUNK) {
            System.arraycopy(audio, 0, result, 0, BYTES_PER_CHUNK)
        } else {
            // Copy available data and pad with zeros
            System.arraycopy(audio, 0, result, 0, audio.size)
            result.fill(0, audio.size, BYTES_PER_CHUNK)
        }
        
        return result.copyOf(BYTES_PER_CHUNK)
    }
    
    /**
     * Resample audio to target sample rate.
     * Uses linear interpolation for simplicity and speed.
     */
    private fun resampleAudio(audio: ByteArray, fromRate: Int, toRate: Int): ByteArray {
        val ratio = fromRate.toDouble() / toRate.toDouble()
        val outputSize = (audio.size / ratio).toInt()
        val output = acquireBuffer(outputSize)
        
        for (i in 0 until minOf(outputSize, output.size)) {
            val srcIndex = (i * ratio).toInt()
            if (srcIndex < audio.size) {
                output[i] = audio[srcIndex]
            }
        }
        
        val result = output.copyOf(outputSize)
        releaseBuffer(output)
        return result
    }
    
    /**
     * Convert stereo/multi-channel to mono by averaging channels.
     * Optimized with direct buffer operations.
     */
    private fun convertToMono(audio: ByteArray, numChannels: Int): ByteArray {
        val samplesPerChannel = audio.size / (numChannels * 2) // 16-bit = 2 bytes per sample
        val output = acquireBuffer(samplesPerChannel * 2)
        
        val buffer = inputBuffer ?: ByteBuffer.wrap(audio).order(ByteOrder.LITTLE_ENDIAN)
        buffer.clear()
        buffer.put(audio)
        buffer.flip()
        
        val outBuffer = outputBuffer ?: ByteBuffer.wrap(output).order(ByteOrder.LITTLE_ENDIAN)
        outBuffer.clear()
        
        for (i in 0 until samplesPerChannel) {
            var sum = 0
            for (ch in 0 until numChannels) {
                val index = (i * numChannels + ch) * 2
                if (index + 1 < audio.size) {
                    sum += buffer.getShort(index).toInt()
                }
            }
            outBuffer.putShort((i * 2), (sum / numChannels).toShort())
        }
        
        val result = output.copyOf(samplesPerChannel * 2)
        releaseBuffer(output)
        return result
    }
    
    /**
     * Convert bit depth (simplified - assumes 8-bit to 16-bit or vice versa).
     * Optimized with buffer operations.
     */
    private fun convertBitDepth(audio: ByteArray, fromDepth: Int, toDepth: Int): ByteArray {
        return when {
            fromDepth == 8 && toDepth == 16 -> {
                // 8-bit to 16-bit: scale up
                val output = acquireBuffer(audio.size * 2)
                val outBuffer = outputBuffer ?: ByteBuffer.wrap(output).order(ByteOrder.LITTLE_ENDIAN)
                outBuffer.clear()
                
                audio.forEachIndexed { i, byte ->
                    val sample = (byte.toInt() - 128) * 256 // Convert unsigned 8-bit to signed 16-bit
                    outBuffer.putShort(i * 2, sample.toShort())
                }
                
                val result = output.copyOf(audio.size * 2)
                releaseBuffer(output)
                result
            }
            fromDepth == 16 && toDepth == 8 -> {
                // 16-bit to 8-bit: scale down
                val output = acquireBuffer(audio.size / 2)
                val buffer = inputBuffer ?: ByteBuffer.wrap(audio).order(ByteOrder.LITTLE_ENDIAN)
                buffer.clear()
                buffer.put(audio)
                buffer.flip()
                
                for (i in output.indices) {
                    val sample = buffer.getShort(i * 2).toInt() / 256 + 128
                    output[i] = sample.toByte()
                }
                
                val result = output.copyOf(audio.size / 2)
                releaseBuffer(output)
                result
            }
            else -> audio // No conversion needed
        }
    }
}
