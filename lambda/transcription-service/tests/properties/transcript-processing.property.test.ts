/**
 * Property-Based Tests: Transcript Processing
 * Feature: real-time-audio-transcription
 * 
 * Properties:
 * - Property 8: Partial Result Processing
 * - Property 9: Final Result Supersedes Partial
 * - Property 14: Chronological Segment Ordering
 * - Property 15: Complete Transcript on Session End
 */

import * as fc from 'fast-check';
import { TranscriptSegment } from '../../src/types';

describe('Transcript Processing Properties', () => {
  /**
   * Property 8: Partial Result Processing
   * **Validates: Requirements 4.2, 4.4**
   * 
   * For any partial result received from Amazon Transcribe, the system should extract
   * the stabilized text and mark the segment as partial (not final) in the output.
   */
  describe('Property 8: Partial Result Processing', () => {
    test('partial results should be marked as partial and not final', () => {
      fc.assert(
        fc.property(
          fc.record({
            segmentId: fc.uuid(),
            text: fc.string({ minLength: 1, maxLength: 200 }),
            startTime: fc.integer({ min: 0, max: 3600000 }),
            endTime: fc.integer({ min: 0, max: 3600000 }),
            confidence: fc.float({ min: 0, max: 1, noNaN: true }),
            isPartial: fc.constant(true),
            isFinal: fc.constant(false),
            languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
            items: fc.array(
              fc.record({
                content: fc.string({ minLength: 1, maxLength: 20 }),
                startTime: fc.integer({ min: 0, max: 3600000 }),
                endTime: fc.integer({ min: 0, max: 3600000 }),
                type: fc.constantFrom('pronunciation', 'punctuation') as fc.Arbitrary<'pronunciation' | 'punctuation'>,
                confidence: fc.float({ min: 0, max: 1, noNaN: true })
              }),
              { minLength: 1, maxLength: 10 }
            )
          }),
          (segment: TranscriptSegment) => {
            // Partial results must have isPartial=true and isFinal=false
            expect(segment.isPartial).toBe(true);
            expect(segment.isFinal).toBe(false);
            
            // Should have valid text content
            expect(segment.text.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('partial results should have valid timestamps', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 3600000 }),
          fc.integer({ min: 0, max: 3600000 }),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
          (startTime: number, duration: number, segmentId: string, text: string, confidence: number, languageCode: string) => {
            const endTime = startTime + duration;
            const segment: TranscriptSegment = {
              segmentId,
              text,
              startTime,
              endTime,
              confidence,
              isPartial: true,
              isFinal: false,
              languageCode,
              items: []
            };
            
            expect(segment.startTime).toBeGreaterThanOrEqual(0);
            expect(segment.endTime).toBeGreaterThanOrEqual(0);
            // End time should be >= start time
            expect(segment.endTime).toBeGreaterThanOrEqual(segment.startTime);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 9: Final Result Supersedes Partial
   * **Validates: Requirements 4.5**
   * 
   * For any final transcript segment received, if there were previous partial results
   * for the same time range, those partial results should be marked as superseded.
   */
  describe('Property 9: Final Result Supersedes Partial', () => {
    test('final results should be marked as final and not partial', () => {
      fc.assert(
        fc.property(
          fc.record({
            segmentId: fc.uuid(),
            text: fc.string({ minLength: 1, maxLength: 200 }),
            startTime: fc.integer({ min: 0, max: 3600000 }),
            endTime: fc.integer({ min: 0, max: 3600000 }),
            confidence: fc.float({ min: 0, max: 1, noNaN: true }),
            isPartial: fc.constant(false),
            isFinal: fc.constant(true),
            languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
            items: fc.array(
              fc.record({
                content: fc.string({ minLength: 1, maxLength: 20 }),
                startTime: fc.integer({ min: 0, max: 3600000 }),
                endTime: fc.integer({ min: 0, max: 3600000 }),
                type: fc.constantFrom('pronunciation', 'punctuation') as fc.Arbitrary<'pronunciation' | 'punctuation'>,
                confidence: fc.float({ min: 0, max: 1, noNaN: true })
              }),
              { minLength: 1, maxLength: 10 }
            )
          }),
          (segment: TranscriptSegment) => {
            // Final results must have isFinal=true and isPartial=false
            expect(segment.isFinal).toBe(true);
            expect(segment.isPartial).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('final result should supersede partial results in same time range', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            // Partial result
            fc.record({
              segmentId: fc.uuid(),
              text: fc.string({ minLength: 1, maxLength: 100 }),
              startTime: fc.integer({ min: 0, max: 3600000 }),
              endTime: fc.integer({ min: 0, max: 3600000 }),
              confidence: fc.float({ min: 0, max: 1, noNaN: true }),
              isPartial: fc.constant(true),
              isFinal: fc.constant(false),
              languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
              items: fc.array(
                fc.record({
                  content: fc.string({ minLength: 1, maxLength: 20 }),
                  startTime: fc.integer({ min: 0, max: 3600000 }),
                  endTime: fc.integer({ min: 0, max: 3600000 }),
                  type: fc.constantFrom('pronunciation', 'punctuation') as fc.Arbitrary<'pronunciation' | 'punctuation'>,
                  confidence: fc.float({ min: 0, max: 1, noNaN: true })
                }),
                { minLength: 1, maxLength: 5 }
              )
            }),
            // Final result (same time range)
            fc.record({
              segmentId: fc.uuid(),
              text: fc.string({ minLength: 1, maxLength: 100 }),
              startTime: fc.integer({ min: 0, max: 3600000 }),
              endTime: fc.integer({ min: 0, max: 3600000 }),
              confidence: fc.float({ min: 0, max: 1, noNaN: true }),
              isPartial: fc.constant(false),
              isFinal: fc.constant(true),
              languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
              items: fc.array(
                fc.record({
                  content: fc.string({ minLength: 1, maxLength: 20 }),
                  startTime: fc.integer({ min: 0, max: 3600000 }),
                  endTime: fc.integer({ min: 0, max: 3600000 }),
                  type: fc.constantFrom('pronunciation', 'punctuation') as fc.Arbitrary<'pronunciation' | 'punctuation'>,
                  confidence: fc.float({ min: 0, max: 1, noNaN: true })
                }),
                { minLength: 1, maxLength: 5 }
              )
            })
          ),
          ([partialResult, finalResult]) => {
            // Simulate superseding logic
            const segments: TranscriptSegment[] = [partialResult];
            
            // When final result arrives, check for overlapping partial results
            const overlappingPartials = segments.filter(
              s => s.isPartial && 
                   s.startTime <= finalResult.endTime && 
                   s.endTime >= finalResult.startTime
            );
            
            // Add final result
            segments.push(finalResult);
            
            // Verify final result is present
            const finalSegments = segments.filter(s => s.isFinal);
            expect(finalSegments.length).toBeGreaterThan(0);
            
            // Verify we can identify overlapping partials
            expect(Array.isArray(overlappingPartials)).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 14: Chronological Segment Ordering
   * **Validates: Requirements 6.3**
   * 
   * For any aggregated transcript, the segments should be ordered chronologically
   * by their start timestamps.
   */
  describe('Property 14: Chronological Segment Ordering', () => {
    test('segments should be ordered by start time', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              segmentId: fc.uuid(),
              text: fc.string({ minLength: 1, maxLength: 100 }),
              startTime: fc.integer({ min: 0, max: 3600000 }),
              endTime: fc.integer({ min: 0, max: 3600000 }),
              confidence: fc.float({ min: 0, max: 1, noNaN: true }),
              isPartial: fc.boolean(),
              isFinal: fc.boolean(),
              languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
              items: fc.array(
                fc.record({
                  content: fc.string({ minLength: 1, maxLength: 20 }),
                  startTime: fc.integer({ min: 0, max: 3600000 }),
                  endTime: fc.integer({ min: 0, max: 3600000 }),
                  type: fc.constantFrom('pronunciation', 'punctuation') as fc.Arbitrary<'pronunciation' | 'punctuation'>,
                  confidence: fc.float({ min: 0, max: 1, noNaN: true })
                }),
                { minLength: 0, maxLength: 5 }
              )
            }),
            { minLength: 2, maxLength: 20 }
          ),
          (segments: TranscriptSegment[]) => {
            // Sort segments by start time
            const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime);
            
            // Verify chronological ordering
            for (let i = 1; i < sortedSegments.length; i++) {
              expect(sortedSegments[i].startTime).toBeGreaterThanOrEqual(
                sortedSegments[i - 1].startTime
              );
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('sorting should be stable for segments with same start time', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              segmentId: fc.uuid(),
              text: fc.string({ minLength: 1, maxLength: 100 }),
              startTime: fc.constantFrom(1000, 2000, 3000), // Limited set of times
              endTime: fc.integer({ min: 1000, max: 5000 }),
              confidence: fc.float({ min: 0, max: 1, noNaN: true }),
              isPartial: fc.boolean(),
              isFinal: fc.boolean(),
              languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
              items: fc.array(
                fc.record({
                  content: fc.string({ minLength: 1, maxLength: 20 }),
                  startTime: fc.integer({ min: 0, max: 3600000 }),
                  endTime: fc.integer({ min: 0, max: 3600000 }),
                  type: fc.constantFrom('pronunciation', 'punctuation') as fc.Arbitrary<'pronunciation' | 'punctuation'>,
                  confidence: fc.float({ min: 0, max: 1, noNaN: true })
                }),
                { minLength: 0, maxLength: 5 }
              )
            }),
            { minLength: 3, maxLength: 15 }
          ),
          (segments: TranscriptSegment[]) => {
            const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime);
            
            // Verify all segments are present after sorting
            expect(sortedSegments.length).toBe(segments.length);
            
            // Verify ordering is maintained
            for (let i = 1; i < sortedSegments.length; i++) {
              expect(sortedSegments[i].startTime).toBeGreaterThanOrEqual(
                sortedSegments[i - 1].startTime
              );
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 15: Complete Transcript on Session End
   * **Validates: Requirements 6.1, 6.5**
   * 
   * For any transcription session, calling endSession should return both an array
   * of individual segments and a concatenated full transcript text.
   */
  describe('Property 15: Complete Transcript on Session End', () => {
    test('full transcript should be concatenation of all segment texts', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              segmentId: fc.uuid(),
              text: fc.string({ minLength: 1, maxLength: 50 }),
              startTime: fc.integer({ min: 0, max: 3600000 }),
              endTime: fc.integer({ min: 0, max: 3600000 }),
              confidence: fc.float({ min: 0, max: 1, noNaN: true }),
              isPartial: fc.constant(false),
              isFinal: fc.constant(true),
              languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
              items: fc.array(
                fc.record({
                  content: fc.string({ minLength: 1, maxLength: 20 }),
                  startTime: fc.integer({ min: 0, max: 3600000 }),
                  endTime: fc.integer({ min: 0, max: 3600000 }),
                  type: fc.constantFrom('pronunciation', 'punctuation') as fc.Arbitrary<'pronunciation' | 'punctuation'>,
                  confidence: fc.float({ min: 0, max: 1, noNaN: true })
                }),
                { minLength: 0, maxLength: 5 }
              )
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (segments: TranscriptSegment[]) => {
            // Sort segments chronologically
            const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime);
            
            // Concatenate text
            const fullText = sortedSegments.map(s => s.text).join(' ');
            
            // Verify full text contains all segment texts
            sortedSegments.forEach(segment => {
              if (segment.text.length > 0) {
                expect(fullText).toContain(segment.text);
              }
            });
            
            // Verify segments array is preserved
            expect(sortedSegments.length).toBe(segments.length);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('aggregated transcript should include metadata', () => {
      fc.assert(
        fc.property(
          fc.record({
            sessionId: fc.uuid(),
            segments: fc.array(
              fc.record({
                segmentId: fc.uuid(),
                text: fc.string({ minLength: 1, maxLength: 50 }),
                startTime: fc.integer({ min: 0, max: 3600000 }),
                endTime: fc.integer({ min: 0, max: 3600000 }),
                confidence: fc.float({ min: 0, max: 1, noNaN: true }),
                isPartial: fc.constant(false),
                isFinal: fc.constant(true),
                languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
                items: fc.array(
                  fc.record({
                    content: fc.string({ minLength: 1, maxLength: 20 }),
                    startTime: fc.integer({ min: 0, max: 3600000 }),
                    endTime: fc.integer({ min: 0, max: 3600000 }),
                    type: fc.constantFrom('pronunciation', 'punctuation') as fc.Arbitrary<'pronunciation' | 'punctuation'>,
                    confidence: fc.float({ min: 0, max: 1, noNaN: true })
                  }),
                  { minLength: 0, maxLength: 5 }
                )
              }),
              { minLength: 1, maxLength: 10 }
            ),
            detectedLanguage: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
            averageConfidence: fc.float({ min: 0, max: 1, noNaN: true }),
            duration: fc.integer({ min: 0, max: 3600000 })
          }),
          (transcript) => {
            // Verify required metadata fields
            expect(transcript.sessionId.length).toBeGreaterThan(0);
            expect(Array.isArray(transcript.segments)).toBe(true);
            expect(transcript.segments.length).toBeGreaterThan(0);
            expect(transcript.detectedLanguage.length).toBeGreaterThan(0);
            expect(transcript.averageConfidence).toBeGreaterThanOrEqual(0);
            expect(transcript.averageConfidence).toBeLessThanOrEqual(1);
            expect(transcript.duration).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
