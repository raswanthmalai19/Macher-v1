# VocalShield Integration Tests

This directory contains comprehensive integration tests for the VocalShield multi-layer detection system. These tests validate end-to-end workflows and system behavior under various conditions.

## Test Files

### 1. EndToEndDetectionFlowTest.kt (Task 13.1)
Tests the complete detection pipeline from call start to UI updates:
- Start monitoring and verify initialization
- Simulate incoming calls with metadata and transcription
- Verify state updates through all detection layers
- Verify risk breakdown calculation and structure
- Verify database persistence of call records
- Verify UI state flows emit correctly
- Test with both high-risk scam calls and legitimate calls
- Validate Property 9 (timestamp monotonicity) and Property 2 (state consistency)

**Validates**: Requirements 1.1, 2.1, 3.1, 3.2, 4.1, 4.2, 7.1, 7.2, 10.1, 10.2

### 2. DemoModeIntegrationTest.kt (Task 13.2)
Tests the complete demo mode workflow for competition judges:
- Switch to demo mode and verify initialization
- Get and validate all available scenarios
- Select specific scenarios (Bank Fraud, IRS, etc.)
- Play scenarios from start to finish
- Verify progressive risk analysis at each segment
- Test playback controls (play, pause, resume, reset)
- Verify database persistence of demo results
- Validate Property 10 (scenario completeness) and Property 19 (playback determinism)
- Test demo mode operates without network connectivity

**Validates**: Requirements 3.1, 3.2, 4.1, 4.2, 17.1, 17.2, 17.3, 17.4, 17.5

### 3. FallbackModeIntegrationTest.kt (Task 13.3)
Tests graceful degradation when AWS services fail:
- Start in full detection mode
- Simulate AWS connection failure
- Verify automatic switch to metadata-only mode
- Verify detection continues during transitions
- Simulate AWS reconnection and restoration
- Validate Property 5 (fallback mode determinism)
- Test demo mode is never affected by AWS availability
- Test mode transitions are idempotent

**Validates**: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 14.1

### 4. CallHistoryIntegrationTest.kt (Task 13.4)
Tests call history persistence and retrieval:
- Complete multiple detection scenarios (high, medium, low risk)
- Verify database persistence for each call
- Verify call history ordering (most recent first)
- Test call details retrieval with risk and triggers
- Test filtering by risk level
- Test pagination for large datasets
- Validate Property 7 (referential integrity) and Property 20 (cascade deletion)
- Validate Property 14 (persistence completeness)
- Test historical risk calculation

**Validates**: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5

### 5. ErrorRecoveryIntegrationTest.kt (Task 13.5)
Tests system resilience and error handling:
- AWS failure during active call
- Database write failure with monitoring continuation
- Detection engine exception handling
- Corrupted scenario handling
- State flow emission failures
- Multiple simultaneous errors
- Validate Property 15 (error recovery graceful degradation)
- Verify detection state consistency after errors
- Test system continues monitoring through error recovery cycle

**Validates**: Requirements 14.1, 14.2, 14.3, 14.4, 14.5

### 6. IntegrationPropertyTests.kt (Tasks 13.6 & 13.7)
Property-based tests for integration scenarios:
- **Property 9**: State flow emission timestamps are monotonically non-decreasing
- **Property 2**: Detection state consistency with mode (risk presence matches mode)
- **Property 3**: Risk breakdown conservation (contributions sum to total)
- **Property 11**: Detection state structure completeness
- **Property 4**: Scenario progress bounds during playback

Uses Kotest property testing with 50-100 iterations per property.

**Validates**: Requirements 1.2, 1.3, 1.4, 2.1, 2.3, 3.4, 4.1, 5.2, 10.1

## Running the Tests

### Run All Integration Tests
```bash
./gradlew test --tests "com.vocalshield.android.integration.*"
```

### Run Specific Test File
```bash
./gradlew test --tests "com.vocalshield.android.integration.EndToEndDetectionFlowTest"
./gradlew test --tests "com.vocalshield.android.integration.DemoModeIntegrationTest"
./gradlew test --tests "com.vocalshield.android.integration.FallbackModeIntegrationTest"
./gradlew test --tests "com.vocalshield.android.integration.CallHistoryIntegrationTest"
./gradlew test --tests "com.vocalshield.android.integration.ErrorRecoveryIntegrationTest"
./gradlew test --tests "com.vocalshield.android.integration.IntegrationPropertyTests"
```

### Run Property-Based Tests Only
```bash
./gradlew test --tests "com.vocalshield.android.integration.IntegrationPropertyTests"
```

## Test Dependencies

These tests use:
- **JUnit 4**: Test framework
- **Robolectric**: Android testing without emulator
- **MockK**: Mocking framework for Kotlin
- **Kotest**: Property-based testing framework
- **Coroutines Test**: Testing coroutines and flows

## Test Configuration

- **SDK Version**: 30 (Android 11)
- **Database**: In-memory Room database for isolation
- **Mode**: Demo mode enabled for controlled testing
- **Timeout**: Tests complete within 5-10 seconds each

## Coverage Goals

These integration tests contribute to:
- **Line Coverage**: 85% minimum
- **Branch Coverage**: 80% minimum
- **Property Test Iterations**: 50-100 per property
- **Integration Scenarios**: All critical user flows

## Key Testing Patterns

### 1. State Flow Collection
```kotlin
val state = monitoringManager.detectionState.value
assertNotNull("State should be set", state)
```

### 2. Database Verification
```kotlin
val callRecords = database.callHistoryDao().getAllCalls()
assertTrue("Should have persisted calls", callRecords.isNotEmpty())
```

### 3. Property Testing
```kotlin
checkAll<Int>(100) { seed ->
    // Test with generated inputs
    checkTimestampMonotonicity(seed)
}
```

### 4. Error Simulation
```kotlin
monitoringManager.switchToMetadataOnlyMode()
delay(200)
assertEquals(DetectionMode.REAL_METADATA_ONLY, monitoringManager.detectionMode.value)
```

## Correctness Properties Validated

1. **Property 1**: Risk Score Monotonicity
2. **Property 2**: Detection State Consistency
3. **Property 3**: Risk Breakdown Conservation
4. **Property 4**: Scenario Progress Bounds
5. **Property 5**: Fallback Mode Determinism
6. **Property 6**: Historical Risk Accumulation
7. **Property 7**: Database Referential Integrity
8. **Property 9**: State Flow Emission Order
9. **Property 10**: Demo Scenario Completeness
10. **Property 11**: Detection State Structure Completeness
11. **Property 14**: Persistence Completeness
12. **Property 15**: Error Recovery Graceful Degradation
13. **Property 19**: Scenario Playback Determinism
14. **Property 20**: Cascade Deletion Integrity

## Competition Readiness

These integration tests demonstrate:
- **Technical Innovation**: Multi-layer detection with real-time state management
- **Implementation Quality**: Comprehensive testing with property-based validation
- **Reliability**: Error recovery and graceful degradation
- **User Experience**: Demo mode for judge demonstrations
- **Privacy**: No audio storage, secure database encryption

## Notes

- Tests use in-memory database for isolation and speed
- Demo mode is enabled for controlled, reproducible testing
- Property tests use smaller iteration counts (50-100) for faster execution
- All tests clean up resources in `@After` methods
- Tests are designed to run in CI/CD pipelines

## Troubleshooting

### Tests Fail with "Database not found"
Ensure `VocalShieldDatabase.getInMemoryDatabase()` is called in `@Before` setup.

### Tests Timeout
Increase delay times if running on slower hardware. Default delays are optimized for CI.

### Property Tests Fail Intermittently
This may indicate a real bug. Property tests are designed to find edge cases.

### MockK Errors
Ensure all mocked objects are unmocked in `@After` with `unmockkAll()`.

## Future Enhancements

- Add performance benchmarking tests
- Add stress tests with high call volumes
- Add network simulation tests
- Add battery usage tests
- Add accessibility tests with TalkBack simulation
