package com.vocalshield.android.service

import android.content.Context
import com.vocalshield.android.detection.DetectionMode
import com.vocalshield.android.network.RealWebSocketClient
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for FallbackManager (Task 4.5)
 * 
 * Tests AWS availability checking, mode switching logic, timeout handling,
 * notification triggering, and health check scheduling.
 * 
 * Requirements: 5.1, 5.3, 5.5, 16.1
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FallbackManagerTest {
    
    private lateinit var mockContext: Context
    private lateinit var mockWebSocketClient: RealWebSocketClient
    private lateinit var fallbackManager: FallbackManager
    
    @Before
    fun setup() {
        mockContext = mockk(relaxed = true)
        mockWebSocketClient = mockk(relaxed = true)
        fallbackManager = FallbackManager(mockContext, mockWebSocketClient)
    }
    
    // ========== AWS Availability Checking Tests ==========
    
    @Test
    fun `test checkAWSAvailability returns true when connection succeeds`() = runTest {
        // Mock successful connection
        coEvery { mockWebSocketClient.testConnection() } returns true
        
        // Check availability
        val available = fallbackManager.checkAWSAvailability()
        
        // Verify result
        assertTrue(available)
        assertTrue(fallbackManager.awsAvailable.value)
        coVerify(exactly = 1) { mockWebSocketClient.testConnection() }
    }
    
    @Test
    fun `test checkAWSAvailability returns false when connection fails`() = runTest {
        // Mock failed connection
        coEvery { mockWebSocketClient.testConnection() } returns false
        
        // Check availability
        val available = fallbackManager.checkAWSAvailability()
        
        // Verify result
        assertFalse(available)
        assertFalse(fallbackManager.awsAvailable.value)
        coVerify(exactly = 1) { mockWebSocketClient.testConnection() }
    }
    
    @Test
    fun `test checkAWSAvailability returns false when exception thrown`() = runTest {
        // Mock exception during connection
        coEvery { mockWebSocketClient.testConnection() } throws Exception("Connection error")
        
        // Check availability
        val available = fallbackManager.checkAWSAvailability()
        
        // Verify result
        assertFalse(available)
        assertFalse(fallbackManager.awsAvailable.value)
    }
    
    @Test
    fun `test checkAWSAvailability respects 5 second timeout`() = runTest {
        // Mock slow connection that would exceed timeout
        coEvery { mockWebSocketClient.testConnection() } coAnswers {
            delay(10000) // 10 seconds - exceeds 5 second timeout
            true
        }
        
        // Check availability (should timeout)
        val available = fallbackManager.checkAWSAvailability()
        
        // Verify result - should be false due to timeout
        assertFalse(available)
        assertFalse(fallbackManager.awsAvailable.value)
    }
    
    // ========== Mode Switching Tests ==========
    
    @Test
    fun `test switchToMetadataOnly changes mode correctly`() = runTest {
        // Initial mode should be REAL_FULL
        assertEquals(DetectionMode.REAL_FULL, fallbackManager.currentMode.value)
        
        // Switch to metadata-only
        fallbackManager.switchToMetadataOnly()
        
        // Verify mode changed
        assertEquals(DetectionMode.REAL_METADATA_ONLY, fallbackManager.currentMode.value)
    }
    
    @Test
    fun `test switchToFullDetection changes mode correctly`() = runTest {
        // Start in metadata-only mode
        fallbackManager.switchToMetadataOnly()
        assertEquals(DetectionMode.REAL_METADATA_ONLY, fallbackManager.currentMode.value)
        
        // Switch to full detection
        fallbackManager.switchToFullDetection()
        
        // Verify mode changed
        assertEquals(DetectionMode.REAL_FULL, fallbackManager.currentMode.value)
    }
    
    @Test
    fun `test mode switching is idempotent`() = runTest {
        // Switch to metadata-only multiple times
        fallbackManager.switchToMetadataOnly()
        fallbackManager.switchToMetadataOnly()
        fallbackManager.switchToMetadataOnly()
        
        // Should still be in metadata-only mode
        assertEquals(DetectionMode.REAL_METADATA_ONLY, fallbackManager.currentMode.value)
        
        // Switch to full detection multiple times
        fallbackManager.switchToFullDetection()
        fallbackManager.switchToFullDetection()
        fallbackManager.switchToFullDetection()
        
        // Should still be in full mode
        assertEquals(DetectionMode.REAL_FULL, fallbackManager.currentMode.value)
    }
    
    // ========== Health Check Tests ==========
    
    @Test
    fun `test startHealthChecks initiates periodic checks`() = runTest {
        // Mock AWS as available
        coEvery { mockWebSocketClient.testConnection() } returns true
        
        // Start health checks
        fallbackManager.startHealthChecks()
        
        // Advance time by 30 seconds (one health check interval)
        advanceTimeBy(30000)
        
        // Verify at least one health check was performed
        coVerify(atLeast = 1) { mockWebSocketClient.testConnection() }
        
        // Stop health checks
        fallbackManager.stopHealthChecks()
    }
    
    @Test
    fun `test stopHealthChecks cancels periodic checks`() = runTest {
        // Mock AWS as available
        coEvery { mockWebSocketClient.testConnection() } returns true
        
        // Start health checks
        fallbackManager.startHealthChecks()
        
        // Stop health checks immediately
        fallbackManager.stopHealthChecks()
        
        // Advance time by 30 seconds
        advanceTimeBy(30000)
        
        // Verify no health checks were performed after stopping
        // (may have 0 or 1 depending on timing, but not more)
        coVerify(atMost = 1) { mockWebSocketClient.testConnection() }
    }
    
    @Test
    fun `test health check auto-switches to metadata-only when AWS fails`() = runTest {
        // Start in full mode
        assertEquals(DetectionMode.REAL_FULL, fallbackManager.currentMode.value)
        
        // Mock AWS as unavailable
        coEvery { mockWebSocketClient.testConnection() } returns false
        
        // Start health checks
        fallbackManager.startHealthChecks()
        
        // Advance time to trigger health check
        advanceTimeBy(30000)
        
        // Verify mode switched to metadata-only
        assertEquals(DetectionMode.REAL_METADATA_ONLY, fallbackManager.currentMode.value)
        
        // Stop health checks
        fallbackManager.stopHealthChecks()
    }
    
    @Test
    fun `test health check auto-switches to full mode when AWS recovers`() = runTest {
        // Start in metadata-only mode
        fallbackManager.switchToMetadataOnly()
        assertEquals(DetectionMode.REAL_METADATA_ONLY, fallbackManager.currentMode.value)
        
        // Mock AWS as available
        coEvery { mockWebSocketClient.testConnection() } returns true
        
        // Start health checks
        fallbackManager.startHealthChecks()
        
        // Advance time to trigger health check
        advanceTimeBy(30000)
        
        // Verify mode switched to full detection
        assertEquals(DetectionMode.REAL_FULL, fallbackManager.currentMode.value)
        
        // Stop health checks
        fallbackManager.stopHealthChecks()
    }
    
    @Test
    fun `test health check does not switch mode when already in correct state`() = runTest {
        // Start in full mode with AWS available
        assertEquals(DetectionMode.REAL_FULL, fallbackManager.currentMode.value)
        coEvery { mockWebSocketClient.testConnection() } returns true
        
        // Start health checks
        fallbackManager.startHealthChecks()
        
        // Advance time to trigger health check
        advanceTimeBy(30000)
        
        // Verify mode remains in full detection
        assertEquals(DetectionMode.REAL_FULL, fallbackManager.currentMode.value)
        
        // Stop health checks
        fallbackManager.stopHealthChecks()
    }
    
    // ========== State Combination Tests ==========
    
    @Test
    fun `test all state combinations for mode switching`() = runTest {
        // Test matrix of (current mode, AWS availability) -> expected mode
        
        // Case 1: REAL_FULL + AWS unavailable -> REAL_METADATA_ONLY
        fallbackManager.switchToFullDetection()
        coEvery { mockWebSocketClient.testConnection() } returns false
        fallbackManager.startHealthChecks()
        advanceTimeBy(30000)
        assertEquals(DetectionMode.REAL_METADATA_ONLY, fallbackManager.currentMode.value)
        fallbackManager.stopHealthChecks()
        
        // Case 2: REAL_METADATA_ONLY + AWS available -> REAL_FULL
        coEvery { mockWebSocketClient.testConnection() } returns true
        fallbackManager.startHealthChecks()
        advanceTimeBy(30000)
        assertEquals(DetectionMode.REAL_FULL, fallbackManager.currentMode.value)
        fallbackManager.stopHealthChecks()
        
        // Case 3: REAL_FULL + AWS available -> REAL_FULL (no change)
        coEvery { mockWebSocketClient.testConnection() } returns true
        fallbackManager.startHealthChecks()
        advanceTimeBy(30000)
        assertEquals(DetectionMode.REAL_FULL, fallbackManager.currentMode.value)
        fallbackManager.stopHealthChecks()
        
        // Case 4: REAL_METADATA_ONLY + AWS unavailable -> REAL_METADATA_ONLY (no change)
        fallbackManager.switchToMetadataOnly()
        coEvery { mockWebSocketClient.testConnection() } returns false
        fallbackManager.startHealthChecks()
        advanceTimeBy(30000)
        assertEquals(DetectionMode.REAL_METADATA_ONLY, fallbackManager.currentMode.value)
        fallbackManager.stopHealthChecks()
    }
    
    // ========== Initial State Tests ==========
    
    @Test
    fun `test initial state is REAL_FULL with AWS available`() {
        assertEquals(DetectionMode.REAL_FULL, fallbackManager.currentMode.value)
        assertTrue(fallbackManager.awsAvailable.value)
    }
    
    @Test
    fun `test state flows are accessible`() {
        assertNotNull(fallbackManager.currentMode)
        assertNotNull(fallbackManager.awsAvailable)
    }
}
