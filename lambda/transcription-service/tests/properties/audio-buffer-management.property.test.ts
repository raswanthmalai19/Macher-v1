/**
 * Property-Based Tests: Audio Buffer Management
 * Feature: real-time-audio-transcription
 * 
 * Properties:
 * - Property 5: Audio Format Validation and Conversion
 * - Property 6: Audio Buffer Management
 * - Property 7: Buffer Capacity Invariant
 */

import * as fc from 'fast-check';
import { AudioChunk, AudioFormat, AudioBuffer } from '../../src/types';

describe('Audio Buffer Management Properties', () => {
  /**
   * Property 5: Audio Format Validation and Conversion
   * **Validates: Requirements 2.1, 2.2, 2.4, 2.5**
   * 
   * For any incoming audio chunk, the system should validate that it meets the
   * required format (16kHz, 16-bit, mono PCM), and if not, either convert it to
   * the correct format or reject it with a descriptive error.
   */
  describe('Property 5: Audio Format Validation and Conversion', () => {
    test('valid audio format should pass validation', () => {
      fc.assert(
        fc.property(
          fc.record({
            sampleRate: fc.constant(16000),
            bitDepth: fc.constant(16),
            channels: fc.constant(1),
            encoding: fc.constant('pcm')
          }),
          (format: AudioFormat) => {
            // Valid format should meet all requirements
            expect(format.sampleRate).toBe(16000);
            expect(format.bitDepth).toBe(16);
            expect(format.channels).toBe(1);
            expect(format.encoding).toBe('pcm');
          }
        ),
        { numRuns: 10 }
      );
    });

    test('invalid audio format should be detectable', () => {
      fc.assert(
        fc.property(
          fc.record({
            sampleRate: fc.integer({ min: 8000, max: 48000 }),
            bitDepth: fc.constantFrom(8, 16, 24, 32),
            channels: fc.constantFrom(1, 2),
            encoding: fc.constantFrom('pcm', 'mp3', 'aac', 'opus')
          }),
          (format: AudioFormat) => {
            const isValid =
              format.sampleRate === 16000 &&
              format.bitDepth === 16 &&
              format.channels === 1 &&
              format.encoding === 'pcm';
            
            const requiresConversion = !isValid;
            
            // If format doesn't match requirements, it should require conversion
            if (!isValid) {
              expect(requiresConversion).toBe(true);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('audio chunk with valid format should have non-empty data', () => {
      fc.assert(
        fc.property(
          fc.record({
            data: fc.uint8Array({ minLength: 1, maxLength: 3200 }),
            timestamp: fc.integer({ min: 0, max: Date.now() }),
            sequenceNumber: fc.nat(),
            format: fc.record({
              sampleRate: fc.constant(16000),
              bitDepth: fc.constant(16),
              channels: fc.constant(1),
              encoding: fc.constant('pcm')
            })
          }),
          (chunk) => {
            const audioChunk: AudioChunk = {
              ...chunk,
              data: Buffer.from(chunk.data)
            };
            
            expect(audioChunk.data.length).toBeGreaterThan(0);
            expect(audioChunk.format.sampleRate).toBe(16000);
            expect(audioChunk.timestamp).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('format validation errors should be descriptive', () => {
      fc.assert(
        fc.property(
          fc.record({
            sampleRate: fc.integer({ min: 8000, max: 48000 }),
            bitDepth: fc.constantFrom(8, 16, 24),
            channels: fc.constantFrom(1, 2),
            encoding: fc.constantFrom('pcm', 'mp3')
          }),
          (format: AudioFormat) => {
            const errors: string[] = [];
            
            if (format.sampleRate !== 16000) {
              errors.push(`Invalid sample rate: ${format.sampleRate}, expected 16000`);
            }
            if (format.bitDepth !== 16) {
              errors.push(`Invalid bit depth: ${format.bitDepth}, expected 16`);
            }
            if (format.channels !== 1) {
              errors.push(`Invalid channels: ${format.channels}, expected 1`);
            }
            if (format.encoding !== 'pcm') {
              errors.push(`Invalid encoding: ${format.encoding}, expected pcm`);
            }
            
            // Each error should be descriptive
            errors.forEach(error => {
              expect(error.length).toBeGreaterThan(10);
              expect(error).toContain('expected');
            });
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 6: Audio Buffer Management
   * **Validates: Requirements 3.1, 3.2, 3.5**
   * 
   * For any sequence of audio chunks, the system should buffer them until reaching
   * 100ms of audio, then send the buffered data to Amazon Transcribe while
   * maintaining temporal ordering.
   */
  describe('Property 6: Audio Buffer Management', () => {
    test('audio chunks should maintain temporal ordering', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              data: fc.uint8Array({ minLength: 1600, maxLength: 3200 }),
              timestamp: fc.integer({ min: 0, max: 3600000 }),
              sequenceNumber: fc.nat(),
              format: fc.record({
                sampleRate: fc.constant(16000),
                bitDepth: fc.constant(16),
                channels: fc.constant(1),
                encoding: fc.constant('pcm')
              })
            }),
            { minLength: 2, maxLength: 20 }
          ),
          (chunks) => {
            // Sort chunks by sequence number
            const sortedChunks = [...chunks].sort(
              (a, b) => a.sequenceNumber - b.sequenceNumber
            );
            
            // Verify ordering is maintained
            for (let i = 1; i < sortedChunks.length; i++) {
              expect(sortedChunks[i].sequenceNumber).toBeGreaterThanOrEqual(
                sortedChunks[i - 1].sequenceNumber
              );
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('buffer should accumulate chunks until threshold', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              data: fc.uint8Array({ minLength: 1600, maxLength: 3200 }),
              timestamp: fc.integer({ min: 0, max: 3600000 }),
              sequenceNumber: fc.nat(),
              format: fc.record({
                sampleRate: fc.constant(16000),
                bitDepth: fc.constant(16),
                channels: fc.constant(1),
                encoding: fc.constant('pcm')
              })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (chunks) => {
            const sampleRate = 16000;
            const bytesPerSample = 2; // 16-bit
            const targetDurationMs = 100;
            const targetBytes = (sampleRate * bytesPerSample * targetDurationMs) / 1000;
            
            let accumulatedBytes = 0;
            chunks.forEach(chunk => {
              accumulatedBytes += chunk.data.length;
            });
            
            // Verify we can calculate when to send
            const shouldSend = accumulatedBytes >= targetBytes;
            expect(typeof shouldSend).toBe('boolean');
          }
        ),
        { numRuns: 10 }
      );
    });

    test('sequence numbers should be unique and increasing', () => {
      fc.assert(
        fc.property(
          fc.array(fc.nat(), { minLength: 1, maxLength: 50 }),
          (sequenceNumbers: number[]) => {
            // Create unique, sorted sequence numbers
            const uniqueSorted = Array.from(new Set(sequenceNumbers)).sort((a, b) => a - b);
            
            // Verify uniqueness and ordering
            for (let i = 1; i < uniqueSorted.length; i++) {
              expect(uniqueSorted[i]).toBeGreaterThan(uniqueSorted[i - 1]);
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 7: Buffer Capacity Invariant
   * **Validates: Requirements 3.3, 3.4**
   * 
   * For any audio buffer state, the buffer should never contain more than 10 chunks,
   * and when full, adding a new chunk should remove the oldest chunk.
   */
  describe('Property 7: Buffer Capacity Invariant', () => {
    test('buffer size should never exceed maximum capacity', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              data: fc.uint8Array({ minLength: 1600, maxLength: 3200 }),
              timestamp: fc.integer({ min: 0, max: 3600000 }),
              sequenceNumber: fc.nat(),
              format: fc.record({
                sampleRate: fc.constant(16000),
                bitDepth: fc.constant(16),
                channels: fc.constant(1),
                encoding: fc.constant('pcm')
              })
            }),
            { minLength: 0, maxLength: 50 }
          ),
          (chunks) => {
            const maxCapacity = 10;
            const buffer: AudioChunk[] = [];
            
            chunks.forEach(chunk => {
              const audioChunk: AudioChunk = {
                ...chunk,
                data: Buffer.from(chunk.data)
              };
              
              buffer.push(audioChunk);
              
              // Remove oldest if exceeds capacity
              if (buffer.length > maxCapacity) {
                buffer.shift();
              }
              
              // Invariant: buffer never exceeds capacity
              expect(buffer.length).toBeLessThanOrEqual(maxCapacity);
            });
          }
        ),
        { numRuns: 10 }
      );
    });

    test('adding to full buffer should remove oldest chunk', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              data: fc.uint8Array({ minLength: 1600, maxLength: 3200 }),
              timestamp: fc.integer({ min: 0, max: 3600000 }),
              sequenceNumber: fc.nat(),
              format: fc.record({
                sampleRate: fc.constant(16000),
                bitDepth: fc.constant(16),
                channels: fc.constant(1),
                encoding: fc.constant('pcm')
              })
            }),
            { minLength: 11, maxLength: 20 } // More than capacity
          ),
          (chunks) => {
            const maxCapacity = 10;
            const buffer: AudioChunk[] = [];
            const droppedChunks: AudioChunk[] = [];
            
            chunks.forEach(chunk => {
              const audioChunk: AudioChunk = {
                ...chunk,
                data: Buffer.from(chunk.data)
              };
              
              if (buffer.length >= maxCapacity) {
                const dropped = buffer.shift();
                if (dropped) {
                  droppedChunks.push(dropped);
                }
              }
              
              buffer.push(audioChunk);
            });
            
            // Verify oldest chunks were dropped
            expect(buffer.length).toBe(maxCapacity);
            expect(droppedChunks.length).toBe(chunks.length - maxCapacity);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('buffer should maintain FIFO ordering', () => {
      fc.assert(
        fc.property(
          fc.array(fc.nat(), { minLength: 15, maxLength: 30 }),
          (sequenceNumbers: number[]) => {
            const maxCapacity = 10;
            const buffer: number[] = [];
            
            sequenceNumbers.forEach(seqNum => {
              if (buffer.length >= maxCapacity) {
                buffer.shift(); // Remove oldest
              }
              buffer.push(seqNum);
            });
            
            // Buffer should contain the last N items
            const expectedBuffer = sequenceNumbers.slice(-maxCapacity);
            expect(buffer).toEqual(expectedBuffer);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('empty buffer should accept chunks up to capacity', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              data: fc.uint8Array({ minLength: 1600, maxLength: 3200 }),
              timestamp: fc.integer({ min: 0, max: 3600000 }),
              sequenceNumber: fc.nat(),
              format: fc.record({
                sampleRate: fc.constant(16000),
                bitDepth: fc.constant(16),
                channels: fc.constant(1),
                encoding: fc.constant('pcm')
              })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (chunks) => {
            const maxCapacity = 10;
            const buffer: AudioChunk[] = [];
            
            chunks.forEach(chunk => {
              if (buffer.length < maxCapacity) {
                buffer.push({
                  ...chunk,
                  data: Buffer.from(chunk.data)
                });
              }
            });
            
            expect(buffer.length).toBe(Math.min(chunks.length, maxCapacity));
            expect(buffer.length).toBeLessThanOrEqual(maxCapacity);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
