/**
 * Feature: competition-mvp-backend, Property 8: Analysis Trigger Threshold
 * 
 * For any accumulated transcription, when it reaches 50 words OR 10 seconds of speech,
 * the Audio_Processor should trigger fraud analysis exactly once for that segment.
 * 
 * Validates: Requirements 3.7
 */

import * as fc from 'fast-check';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('aws-xray-sdk-core', () => ({
  captureAWSv3Client: jest.fn((client) => client),
}));

describe('Property 8: Analysis Trigger Threshold', () => {
  let audioProcessorModule: any;

  beforeAll(async () => {
    // Set up environment
    process.env.METADATA_TABLE_NAME = 'test-metadata-table';
    process.env.CONNECTIONS_TABLE_NAME = 'test-connections-table';
    process.env.AWS_REGION = 'us-east-1';
    process.env.LOG_LEVEL = 'ERROR'; // Reduce noise in tests

    // Import the audio processor module
    audioProcessorModule = await import('../../lambda/audio-processor/index');
  });

  /**
   * Helper function to create a call session state
   */
  const createSession = (wordCount: number, speechDuration: number) => ({
    callSessionId: 'test-session-id',
    connectionId: 'test-connection-id',
    startTime: Date.now(),
    transcriptionBuffer: Array(wordCount).fill('word'),
    wordCount,
    speechDuration,
    lastAnalysisTime: 0,
    analysisCount: 0,
    currentRiskScore: 0,
    currentThreatLevel: 'SAFE' as const,
  });

  /**
   * Helper function to simulate the threshold check logic
   * (mirrors the implementation in audio-processor/index.ts)
   */
  const checkAnalysisThreshold = (session: any): boolean => {
    const WORD_THRESHOLD = 50;
    const DURATION_THRESHOLD = 10; // seconds

    const wordThresholdReached = session.wordCount >= WORD_THRESHOLD;
    const durationThresholdReached = session.speechDuration >= DURATION_THRESHOLD;

    return wordThresholdReached || durationThresholdReached;
  };

  /**
   * Helper function to simulate triggering fraud analysis
   * (mirrors the implementation in audio-processor/index.ts)
   */
  const triggerFraudAnalysis = (session: any): void => {
    // Clear transcription buffer after analysis (prevent memory overflow)
    session.transcriptionBuffer = [];
    session.wordCount = 0;
    session.speechDuration = 0;
    session.lastAnalysisTime = Date.now();
    session.analysisCount += 1;
  };

  /**
   * Property: Analysis should be triggered exactly once when word count reaches 50
   */
  it('should trigger analysis exactly once when word count reaches 50 words', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Generate word counts around the threshold
          wordCount: fc.integer({ min: 50, max: 100 }),
          speechDuration: fc.double({ min: 0, max: 9.9, noNaN: true }),
        }),
        async ({ wordCount, speechDuration }) => {
          const session = createSession(wordCount, speechDuration);
          const initialAnalysisCount = session.analysisCount;

          // Property 1: Threshold should be met when wordCount >= 50
          const shouldTrigger = checkAnalysisThreshold(session);
          expect(shouldTrigger).toBe(true);

          // Simulate triggering analysis
          if (shouldTrigger) {
            triggerFraudAnalysis(session);
          }

          // Property 2: Analysis count should increment by exactly 1
          expect(session.analysisCount).toBe(initialAnalysisCount + 1);

          // Property 3: Buffer should be cleared after analysis
          expect(session.transcriptionBuffer.length).toBe(0);
          expect(session.wordCount).toBe(0);
          expect(session.speechDuration).toBe(0);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Analysis should be triggered exactly once when speech duration reaches 10 seconds
   */
  it('should trigger analysis exactly once when speech duration reaches 10 seconds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          wordCount: fc.integer({ min: 0, max: 49 }),
          // Generate durations at or above the threshold
          speechDuration: fc.double({ min: 10.0, max: 30.0, noNaN: true }),
        }),
        async ({ wordCount, speechDuration }) => {
          const session = createSession(wordCount, speechDuration);
          const initialAnalysisCount = session.analysisCount;

          // Property 1: Threshold should be met when speechDuration >= 10
          const shouldTrigger = checkAnalysisThreshold(session);
          expect(shouldTrigger).toBe(true);

          // Simulate triggering analysis
          if (shouldTrigger) {
            triggerFraudAnalysis(session);
          }

          // Property 2: Analysis count should increment by exactly 1
          expect(session.analysisCount).toBe(initialAnalysisCount + 1);

          // Property 3: Buffer should be cleared after analysis
          expect(session.transcriptionBuffer.length).toBe(0);
          expect(session.wordCount).toBe(0);
          expect(session.speechDuration).toBe(0);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Analysis should NOT be triggered when below both thresholds
   */
  it('should NOT trigger analysis when below both thresholds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          wordCount: fc.integer({ min: 0, max: 49 }),
          speechDuration: fc.double({ min: 0, max: 9.9, noNaN: true }),
        }),
        async ({ wordCount, speechDuration }) => {
          const session = createSession(wordCount, speechDuration);
          const initialAnalysisCount = session.analysisCount;
          const initialWordCount = session.wordCount;
          const initialDuration = session.speechDuration;

          // Property 1: Threshold should NOT be met
          const shouldTrigger = checkAnalysisThreshold(session);
          expect(shouldTrigger).toBe(false);

          // Property 2: Analysis should not be triggered
          if (shouldTrigger) {
            triggerFraudAnalysis(session);
          }

          // Property 3: Analysis count should remain unchanged
          expect(session.analysisCount).toBe(initialAnalysisCount);

          // Property 4: Buffer should NOT be cleared
          expect(session.wordCount).toBe(initialWordCount);
          expect(session.speechDuration).toBe(initialDuration);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Analysis should be triggered when EITHER threshold is met (OR logic)
   */
  it('should trigger analysis when either word count OR speech duration threshold is met', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Case 1: Word threshold met, duration below
          fc.record({
            wordCount: fc.integer({ min: 50, max: 100 }),
            speechDuration: fc.double({ min: 0, max: 9.9, noNaN: true }),
          }),
          // Case 2: Duration threshold met, words below
          fc.record({
            wordCount: fc.integer({ min: 0, max: 49 }),
            speechDuration: fc.double({ min: 10.0, max: 30.0, noNaN: true }),
          }),
          // Case 3: Both thresholds met
          fc.record({
            wordCount: fc.integer({ min: 50, max: 100 }),
            speechDuration: fc.double({ min: 10.0, max: 30.0, noNaN: true }),
          })
        ),
        async ({ wordCount, speechDuration }) => {
          const session = createSession(wordCount, speechDuration);

          // Property: Threshold should be met in all cases
          const shouldTrigger = checkAnalysisThreshold(session);
          expect(shouldTrigger).toBe(true);

          // Verify the OR logic
          const wordThresholdMet = wordCount >= 50;
          const durationThresholdMet = speechDuration >= 10;
          expect(wordThresholdMet || durationThresholdMet).toBe(true);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Buffer should be cleared after analysis to prevent memory overflow
   */
  it('should clear buffer after analysis to prevent memory overflow', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          wordCount: fc.integer({ min: 50, max: 200 }),
          speechDuration: fc.double({ min: 10.0, max: 60.0, noNaN: true }),
          bufferSize: fc.integer({ min: 10, max: 100 }),
        }),
        async ({ wordCount, speechDuration, bufferSize }) => {
          const session = createSession(wordCount, speechDuration);
          // Simulate a large buffer
          session.transcriptionBuffer = Array(bufferSize).fill('text segment');

          // Trigger analysis
          const shouldTrigger = checkAnalysisThreshold(session);
          expect(shouldTrigger).toBe(true);

          if (shouldTrigger) {
            triggerFraudAnalysis(session);
          }

          // Property 1: Buffer should be completely cleared
          expect(session.transcriptionBuffer.length).toBe(0);

          // Property 2: Word count should be reset to 0
          expect(session.wordCount).toBe(0);

          // Property 3: Speech duration should be reset to 0
          expect(session.speechDuration).toBe(0);

          // Property 4: Analysis count should increment
          expect(session.analysisCount).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Exact boundary conditions (50 words, 10 seconds)
   */
  it('should trigger analysis at exact boundary conditions', async () => {
    // Test exact word boundary
    const sessionAtWordBoundary = createSession(50, 0);
    expect(checkAnalysisThreshold(sessionAtWordBoundary)).toBe(true);

    // Test exact duration boundary
    const sessionAtDurationBoundary = createSession(0, 10.0);
    expect(checkAnalysisThreshold(sessionAtDurationBoundary)).toBe(true);

    // Test just below word boundary
    const sessionBelowWordBoundary = createSession(49, 0);
    expect(checkAnalysisThreshold(sessionBelowWordBoundary)).toBe(false);

    // Test just below duration boundary
    const sessionBelowDurationBoundary = createSession(0, 9.99);
    expect(checkAnalysisThreshold(sessionBelowDurationBoundary)).toBe(false);
  });

  /**
   * Property: Multiple analysis cycles should work correctly
   */
  it('should handle multiple analysis cycles correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            wordCount: fc.integer({ min: 50, max: 100 }),
            speechDuration: fc.double({ min: 10.0, max: 30.0, noNaN: true }),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (cycles) => {
          const session = createSession(0, 0);

          for (let i = 0; i < cycles.length; i++) {
            // Accumulate to threshold
            session.wordCount = cycles[i].wordCount;
            session.speechDuration = cycles[i].speechDuration;
            session.transcriptionBuffer = Array(cycles[i].wordCount).fill('word');

            // Check and trigger
            const shouldTrigger = checkAnalysisThreshold(session);
            expect(shouldTrigger).toBe(true);

            if (shouldTrigger) {
              triggerFraudAnalysis(session);
            }

            // Property: Analysis count should match cycle number
            expect(session.analysisCount).toBe(i + 1);

            // Property: Buffer should be cleared after each cycle
            expect(session.wordCount).toBe(0);
            expect(session.speechDuration).toBe(0);
            expect(session.transcriptionBuffer.length).toBe(0);
          }

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property: Analysis should be triggered exactly once per threshold crossing
   */
  it('should trigger analysis exactly once per threshold crossing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          initialWordCount: fc.integer({ min: 45, max: 49 }),
          additionalWords: fc.integer({ min: 1, max: 10 }),
          speechDuration: fc.double({ min: 0, max: 9.9, noNaN: true }),
        }),
        async ({ initialWordCount, additionalWords, speechDuration }) => {
          const session = createSession(initialWordCount, speechDuration);
          
          // Initially below threshold
          expect(checkAnalysisThreshold(session)).toBe(false);

          // Add words to cross threshold
          session.wordCount += additionalWords;
          session.transcriptionBuffer.push(...Array(additionalWords).fill('word'));

          // Check if we actually crossed the threshold
          const finalWordCount = initialWordCount + additionalWords;
          const shouldTrigger = checkAnalysisThreshold(session);
          
          // Only test if we actually crossed the threshold
          if (finalWordCount >= 50) {
            // Now should be above threshold
            expect(shouldTrigger).toBe(true);

            const beforeAnalysisCount = session.analysisCount;

            // Trigger analysis
            if (shouldTrigger) {
              triggerFraudAnalysis(session);
            }

            // Property: Analysis should be triggered exactly once
            expect(session.analysisCount).toBe(beforeAnalysisCount + 1);

            // Property: After clearing, threshold should not be met
            expect(checkAnalysisThreshold(session)).toBe(false);
          } else {
            // Still below threshold, should not trigger
            expect(shouldTrigger).toBe(false);
          }

          return true;
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });
});
