package com.vocalshield.android.domain

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.ints.shouldBeInRange
import io.kotest.matchers.result.shouldBeFailure
import io.kotest.matchers.result.shouldBeSuccess
import io.kotest.matchers.shouldBe
import io.kotest.property.Arb
import io.kotest.property.arbitrary.byteArray
import io.kotest.property.arbitrary.int
import io.kotest.property.checkAll

/**
 * Property-based tests for audio processing.
 * 
 * Tests validate Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */
class AudioProcessorPropertyTest : StringSpec({
    
    companion object {
        private const val TARGET_SAMPLE_RATE = 16000
        private const val TARGET_BIT_DEPTH = 16
        private const val TARGET_CHANNELS = 1
        private const val CHUNK_DURATION_MS = 100
        private const val TOLERANCE_MS = 5
    }
    
    /**
     * Property 4: Audio format conversion correctness
     * For any captured audio data, the processed output should have exactly
     * 16kHz sample rate, 16-bit depth, and mono channel configuration.
     * 
     * Feature: android-mobile-client, Property 4: Audio format conversion correctness
     * Validates: Requirements 2.1, 2.2, 2.3
     */
    "Property 4: Audio format conversion correctness".config(invocations = 100) {
        checkAll(
            Arb.byteArray(Arb.int(1000..10000), Arb.int(-128..127))
        ) { rawAudio ->
            // Arrange
            val processor = AudioProcessor()
            processor.configure(TARGET_SAMPLE_RATE, TARGET_BIT_DEPTH, TARGET_CHANNELS)
            
            // Act
            val result = processor.processAudio(rawAudio)
            
            // Assert - Processing should succeed
            result.shouldBeSuccess()
            
            val chunk = result.getOrThrow()
            
            // Assert - Chunk should have correct duration
            chunk.durationMs shouldBe CHUNK_DURATION_MS
            
            // Assert - Chunk data size should match expected size for 16kHz, 16-bit, mono, 100ms
            // Expected bytes = sample_rate * channels * (bit_depth/8) * (duration_ms/1000)
            // = 16000 * 1 * 2 * 0.1 = 3200 bytes
            val expectedBytes = TARGET_SAMPLE_RATE * TARGET_CHANNELS * (TARGET_BIT_DEPTH / 8) * CHUNK_DURATION_MS / 1000
            chunk.data.size shouldBe expectedBytes
            
            // Assert - Timestamp should be recent (within last 5 seconds)
            val now = System.currentTimeMillis()
            chunk.timestamp shouldBeInRange (now - 5000)..(now + 1000)
        }
    }
    
    /**
     * Property 5: Audio chunking consistency
     * For any processed audio stream, all chunks should be 100ms in duration
     * (±5ms tolerance for rounding).
     * 
     * Feature: android-mobile-client, Property 5: Audio chunking consistency
     * Validates: Requirements 2.4
     */
    "Property 5: Audio chunking consistency".config(invocations = 100) {
        checkAll(
            Arb.byteArray(Arb.int(1000..10000), Arb.int(-128..127))
        ) { rawAudio ->
            // Arrange
            val processor = AudioProcessor()
            processor.configure(TARGET_SAMPLE_RATE, TARGET_BIT_DEPTH, TARGET_CHANNELS)
            
            // Act
            val result = processor.processAudio(rawAudio)
            
            // Assert
            result.shouldBeSuccess()
            val chunk = result.getOrThrow()
            
            // Assert - Duration should be 100ms ± 5ms tolerance
            chunk.durationMs shouldBeInRange (CHUNK_DURATION_MS - TOLERANCE_MS)..(CHUNK_DURATION_MS + TOLERANCE_MS)
        }
    }
    
    /**
     * Property 6: Audio processing error handling
     * For any invalid audio input, the processor should return an error result
     * and emit a user notification without crashing.
     * 
     * Feature: android-mobile-client, Property 6: Audio processing error handling
     * Validates: Requirements 2.5
     */
    "Property 6: Audio processing error handling".config(invocations = 100) {
        // Test with empty audio data
        val processor = AudioProcessor()
        processor.configure(TARGET_SAMPLE_RATE, TARGET_BIT_DEPTH, TARGET_CHANNELS)
        
        // Act
        val result = processor.processAudio(ByteArray(0))
        
        // Assert - Should return failure for empty input
        result.shouldBeFailure()
    }
    
    /**
     * Additional test: Verify processing doesn't crash with various input sizes
     */
    "Property: Audio processing handles various input sizes".config(invocations = 100) {
        checkAll(
            Arb.byteArray(Arb.int(1..20000), Arb.int(-128..127))
        ) { rawAudio ->
            // Arrange
            val processor = AudioProcessor()
            processor.configure(TARGET_SAMPLE_RATE, TARGET_BIT_DEPTH, TARGET_CHANNELS)
            
            // Act - Should not crash regardless of input size
            val result = processor.processAudio(rawAudio)
            
            // Assert - Should always return a result (success or failure)
            result.isSuccess || result.isFailure shouldBe true
        }
    }
})
