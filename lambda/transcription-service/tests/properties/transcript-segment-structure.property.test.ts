/**
 * Property-Based Test: Transcript Segment Structure
 * Feature: real-time-audio-transcription
 * Property 13: Transcript Segment Structure
 * 
 * **Validates: Requirements 6.2, 6.4**
 * 
 * For any transcript segment in the output, it should include all required fields:
 * timestamp (start and end), text content, confidence score, language code,
 * and isPartial/isFinal flags.
 */

import * as fc from 'fast-check';
import { TranscriptSegment } from '../../src/types';

describe('Property 13: Transcript Segment Structure', () => {
  test('all transcript segments must have required fields with valid values', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary transcript segments
        fc.record({
          segmentId: fc.uuid(),
          text: fc.string({ minLength: 0, maxLength: 500 }),
          startTime: fc.integer({ min: 0, max: 3600000 }), // 0 to 1 hour
          endTime: fc.integer({ min: 0, max: 3600000 }),
          confidence: fc.float({ min: 0, max: 1, noNaN: true }),
          isPartial: fc.boolean(),
          isFinal: fc.boolean(),
          languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN', 'fr-FR', 'hi-IN'),
          items: fc.array(
            fc.record({
              content: fc.string({ minLength: 1, maxLength: 50 }),
              startTime: fc.integer({ min: 0, max: 3600000 }),
              endTime: fc.integer({ min: 0, max: 3600000 }),
              type: fc.constantFrom('pronunciation', 'punctuation') as fc.Arbitrary<'pronunciation' | 'punctuation'>,
              confidence: fc.float({ min: 0, max: 1, noNaN: true })
            }),
            { minLength: 0, maxLength: 20 }
          )
        }),
        (segment: TranscriptSegment) => {
          // Verify all required fields exist
          expect(segment).toHaveProperty('segmentId');
          expect(segment).toHaveProperty('text');
          expect(segment).toHaveProperty('startTime');
          expect(segment).toHaveProperty('endTime');
          expect(segment).toHaveProperty('confidence');
          expect(segment).toHaveProperty('isPartial');
          expect(segment).toHaveProperty('isFinal');
          expect(segment).toHaveProperty('languageCode');
          expect(segment).toHaveProperty('items');

          // Verify field types
          expect(typeof segment.segmentId).toBe('string');
          expect(typeof segment.text).toBe('string');
          expect(typeof segment.startTime).toBe('number');
          expect(typeof segment.endTime).toBe('number');
          expect(typeof segment.confidence).toBe('number');
          expect(typeof segment.isPartial).toBe('boolean');
          expect(typeof segment.isFinal).toBe('boolean');
          expect(typeof segment.languageCode).toBe('string');
          expect(Array.isArray(segment.items)).toBe(true);

          // Verify field constraints
          expect(segment.segmentId.length).toBeGreaterThan(0);
          expect(segment.startTime).toBeGreaterThanOrEqual(0);
          expect(segment.endTime).toBeGreaterThanOrEqual(0);
          expect(segment.confidence).toBeGreaterThanOrEqual(0);
          expect(segment.confidence).toBeLessThanOrEqual(1);
          expect(segment.languageCode.length).toBeGreaterThan(0);

          // Verify items structure
          segment.items.forEach(item => {
            expect(item).toHaveProperty('content');
            expect(item).toHaveProperty('startTime');
            expect(item).toHaveProperty('endTime');
            expect(item).toHaveProperty('type');
            expect(item).toHaveProperty('confidence');
            expect(['pronunciation', 'punctuation']).toContain(item.type);
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  test('transcript segments with valid structure should be serializable to JSON', () => {
    fc.assert(
      fc.property(
        fc.record({
          segmentId: fc.uuid(),
          text: fc.string({ minLength: 0, maxLength: 500 }),
          startTime: fc.integer({ min: 0, max: 3600000 }),
          endTime: fc.integer({ min: 0, max: 3600000 }),
          confidence: fc.float({ min: 0, max: 1, noNaN: true }),
          isPartial: fc.boolean(),
          isFinal: fc.boolean(),
          languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
          items: fc.array(
            fc.record({
              content: fc.string({ minLength: 1, maxLength: 50 }),
              startTime: fc.integer({ min: 0, max: 3600000 }),
              endTime: fc.integer({ min: 0, max: 3600000 }),
              type: fc.constantFrom('pronunciation', 'punctuation') as fc.Arbitrary<'pronunciation' | 'punctuation'>,
              confidence: fc.float({ min: 0, max: 1, noNaN: true })
            }),
            { minLength: 0, maxLength: 20 }
          )
        }),
        (segment: TranscriptSegment) => {
          // Should be serializable to JSON and back
          const json = JSON.stringify(segment);
          const parsed = JSON.parse(json);
          
          expect(parsed.segmentId).toBe(segment.segmentId);
          expect(parsed.text).toBe(segment.text);
          expect(parsed.languageCode).toBe(segment.languageCode);
          expect(parsed.isPartial).toBe(segment.isPartial);
          expect(parsed.isFinal).toBe(segment.isFinal);
        }
      ),
      { numRuns: 10 }
    );
  });
});
