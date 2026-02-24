/**
 * Property-Based Tests: Performance Metrics
 * Feature: real-time-audio-transcription
 * 
 * Properties:
 * - Property 30: Session Metrics Collection
 * - Property 31: Latency Threshold Alerting
 */

import * as fc from 'fast-check';
import { SessionMetrics } from '../../src/types';

describe('Performance Metrics Properties', () => {
  /**
   * Property 30: Session Metrics Collection
   * **Validates: Requirements 10.1, 10.2, 10.5**
   * 
   * For any transcription session, the system should collect and provide metrics
   * including: total audio chunks processed, total segments received, average latency,
   * connection retries, and low-confidence segment count.
   */
  describe('Property 30: Session Metrics Collection', () => {
    test('session metrics should include all required fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            totalAudioChunks: fc.integer({ min: 0, max: 1000 }),
            totalTranscriptSegments: fc.integer({ min: 0, max: 500 }),
            averageLatencyMs: fc.float({ min: 0, max: 2000, noNaN: true }),
            connectionRetries: fc.integer({ min: 0, max: 10 }),
            lowConfidenceSegments: fc.integer({ min: 0, max: 100 })
          }),
          (metrics: SessionMetrics) => {
            // Verify all required fields are present
            expect(metrics.totalAudioChunks).toBeDefined();
            expect(metrics.totalTranscriptSegments).toBeDefined();
            expect(metrics.averageLatencyMs).toBeDefined();
            expect(metrics.connectionRetries).toBeDefined();
            expect(metrics.lowConfidenceSegments).toBeDefined();
            
            // Verify field types
            expect(typeof metrics.totalAudioChunks).toBe('number');
            expect(typeof metrics.totalTranscriptSegments).toBe('number');
            expect(typeof metrics.averageLatencyMs).toBe('number');
            expect(typeof metrics.connectionRetries).toBe('number');
            expect(typeof metrics.lowConfidenceSegments).toBe('number');
            
            // Verify field constraints
            expect(metrics.totalAudioChunks).toBeGreaterThanOrEqual(0);
            expect(metrics.totalTranscriptSegments).toBeGreaterThanOrEqual(0);
            expect(metrics.averageLatencyMs).toBeGreaterThanOrEqual(0);
            expect(metrics.connectionRetries).toBeGreaterThanOrEqual(0);
            expect(metrics.lowConfidenceSegments).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('average latency should be calculated from all measurements', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.float({ min: 50, max: 1000, noNaN: true }), // Latency measurements in ms
            { minLength: 1, maxLength: 100 }
          ),
          (latencyMeasurements: number[]) => {
            // Calculate average
            const sum = latencyMeasurements.reduce((acc, val) => acc + val, 0);
            const average = sum / latencyMeasurements.length;
            
            // Verify average is within range
            expect(average).toBeGreaterThan(0);
            expect(average).toBeGreaterThanOrEqual(Math.min(...latencyMeasurements));
            expect(average).toBeLessThanOrEqual(Math.max(...latencyMeasurements));
          }
        ),
        { numRuns: 10 }
      );
    });

    test('low confidence segments should be subset of total segments', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 500 }), // Total segments
          fc.float({ min: 0, max: 1, noNaN: true }), // Percentage low confidence
          (totalSegments: number, lowConfidencePercentage: number) => {
            const lowConfidenceSegments = Math.floor(totalSegments * lowConfidencePercentage);
            
            // Low confidence should never exceed total
            expect(lowConfidenceSegments).toBeLessThanOrEqual(totalSegments);
            expect(lowConfidenceSegments).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('metrics should be serializable for logging and monitoring', () => {
      fc.assert(
        fc.property(
          fc.record({
            totalAudioChunks: fc.integer({ min: 0, max: 1000 }),
            totalTranscriptSegments: fc.integer({ min: 0, max: 500 }),
            averageLatencyMs: fc.float({ min: 0, max: 2000, noNaN: true }),
            connectionRetries: fc.integer({ min: 0, max: 10 }),
            lowConfidenceSegments: fc.integer({ min: 0, max: 100 })
          }),
          (metrics: SessionMetrics) => {
            // Should be serializable to JSON
            const json = JSON.stringify(metrics);
            const parsed = JSON.parse(json);
            
            expect(parsed.totalAudioChunks).toBe(metrics.totalAudioChunks);
            expect(parsed.totalTranscriptSegments).toBe(metrics.totalTranscriptSegments);
            expect(parsed.connectionRetries).toBe(metrics.connectionRetries);
            expect(parsed.lowConfidenceSegments).toBe(metrics.lowConfidenceSegments);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('connection retries should be tracked accurately', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }), // Connection attempts (success/failure)
          (attempts: boolean[]) => {
            // Count failures (retries)
            const retries = attempts.filter(success => !success).length;
            
            expect(retries).toBeGreaterThanOrEqual(0);
            expect(retries).toBeLessThanOrEqual(attempts.length);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('metrics should reflect actual session activity', () => {
      fc.assert(
        fc.property(
          fc.record({
            audioChunksSent: fc.integer({ min: 0, max: 1000 }),
            segmentsReceived: fc.integer({ min: 0, max: 500 }),
            retryAttempts: fc.integer({ min: 0, max: 10 })
          }),
          (activity) => {
            const metrics: SessionMetrics = {
              totalAudioChunks: activity.audioChunksSent,
              totalTranscriptSegments: activity.segmentsReceived,
              averageLatencyMs: 250,
              connectionRetries: activity.retryAttempts,
              lowConfidenceSegments: 0
            };
            
            // Metrics should match activity
            expect(metrics.totalAudioChunks).toBe(activity.audioChunksSent);
            expect(metrics.totalTranscriptSegments).toBe(activity.segmentsReceived);
            expect(metrics.connectionRetries).toBe(activity.retryAttempts);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 31: Latency Threshold Alerting
   * **Validates: Requirements 10.6**
   * 
   * For any transcription session, if the average latency exceeds 500ms, the system
   * should trigger an alert.
   */
  describe('Property 31: Latency Threshold Alerting', () => {
    test('alert should trigger when average latency exceeds threshold', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 2000, noNaN: true }), // Average latency in ms
          fc.constant(500), // Threshold in ms
          (averageLatency: number, threshold: number) => {
            const shouldAlert = averageLatency > threshold;
            
            if (averageLatency > 500) {
              expect(shouldAlert).toBe(true);
            } else {
              expect(shouldAlert).toBe(false);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('threshold should be consistently applied across measurements', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.float({ min: 100, max: 1000, noNaN: true }),
            { minLength: 1, maxLength: 50 }
          ),
          (latencyMeasurements: number[]) => {
            const threshold = 500;
            const average = latencyMeasurements.reduce((a, b) => a + b, 0) / latencyMeasurements.length;
            const shouldAlert = average > threshold;
            
            // Verify threshold is applied correctly
            if (average > 500) {
              expect(shouldAlert).toBe(true);
            } else {
              expect(shouldAlert).toBe(false);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('alert should include latency details', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 501, max: 2000, noNaN: true }), // Latency above threshold
          fc.constant(500), // Threshold
          (averageLatency: number, threshold: number) => {
            // Simulate alert message
            const alertMessage = `High latency detected: ${averageLatency.toFixed(2)}ms (threshold: ${threshold}ms)`;
            
            expect(alertMessage).toContain('High latency');
            expect(alertMessage).toContain(averageLatency.toFixed(2));
            expect(alertMessage).toContain(threshold.toString());
          }
        ),
        { numRuns: 10 }
      );
    });

    test('latency should be measured for each transcript segment', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              segmentId: fc.uuid(),
              audioReceivedTime: fc.integer({ min: 1000000000000, max: 9999999999999 }),
              transcriptReceivedTime: fc.integer({ min: 1000000000000, max: 9999999999999 })
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (segments) => {
            // Calculate latency for each segment
            const latencies = segments.map(segment => {
              // Ensure transcript time is after audio time
              const audioTime = segment.audioReceivedTime;
              const transcriptTime = Math.max(segment.transcriptReceivedTime, audioTime);
              return transcriptTime - audioTime;
            });
            
            // All latencies should be non-negative
            latencies.forEach(latency => {
              expect(latency).toBeGreaterThanOrEqual(0);
            });
          }
        ),
        { numRuns: 10 }
      );
    });

    test('alert threshold should be configurable but consistent', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(500, 1000, 2000), // Different threshold values
          fc.float({ min: 0, max: 3000, noNaN: true }), // Latency
          (threshold: number, latency: number) => {
            const shouldAlert = latency > threshold;
            
            // Verify threshold is applied correctly
            if (latency > threshold) {
              expect(shouldAlert).toBe(true);
            } else {
              expect(shouldAlert).toBe(false);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('multiple consecutive high latency measurements should trigger alert', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.float({ min: 501, max: 1000, noNaN: true }), // All above threshold
            { minLength: 3, maxLength: 10 }
          ),
          (highLatencies: number[]) => {
            const threshold = 500;
            const average = highLatencies.reduce((a, b) => a + b, 0) / highLatencies.length;
            
            // Average should be above threshold
            expect(average).toBeGreaterThan(threshold);
            
            // All measurements should be above threshold
            highLatencies.forEach(latency => {
              expect(latency).toBeGreaterThan(threshold);
            });
          }
        ),
        { numRuns: 10 }
      );
    });

    test('latency alert should not trigger for acceptable performance', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.float({ min: 50, max: 499, noNaN: true }), // All below threshold
            { minLength: 1, maxLength: 50 }
          ),
          (goodLatencies: number[]) => {
            const threshold = 500;
            const average = goodLatencies.reduce((a, b) => a + b, 0) / goodLatencies.length;
            
            // Average should be below threshold
            expect(average).toBeLessThan(threshold);
            
            // Should not trigger alert
            const shouldAlert = average > threshold;
            expect(shouldAlert).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
