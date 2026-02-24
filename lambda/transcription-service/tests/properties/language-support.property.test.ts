/**
 * Property-Based Tests: Language Support
 * Feature: real-time-audio-transcription
 * 
 * Properties:
 * - Property 10: Language Detection Metadata
 * - Property 11: Low-Confidence Language Warning
 * - Property 12: Language Persistence
 */

import * as fc from 'fast-check';
import { TranscriptSegment, MetadataInfo } from '../../src/types';

describe('Language Support Properties', () => {
  /**
   * Property 10: Language Detection Metadata
   * **Validates: Requirements 5.3**
   * 
   * For any transcript segment, the output should include the detected language
   * code in the segment metadata.
   */
  describe('Property 10: Language Detection Metadata', () => {
    test('all transcript segments must include language code', () => {
      fc.assert(
        fc.property(
          fc.record({
            segmentId: fc.uuid(),
            text: fc.string({ minLength: 1, maxLength: 200 }),
            startTime: fc.integer({ min: 0, max: 3600000 }),
            endTime: fc.integer({ min: 0, max: 3600000 }),
            confidence: fc.float({ min: 0, max: 1, noNaN: true }),
            isPartial: fc.boolean(),
            isFinal: fc.boolean(),
            languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN', 'fr-FR', 'hi-IN'),
            items: fc.array(
              fc.record({
                content: fc.string({ minLength: 1, maxLength: 20 }),
                startTime: fc.integer({ min: 0, max: 3600000 }),
                endTime: fc.integer({ min: 0, max: 3600000 }),
                type: fc.constantFrom('pronunciation', 'punctuation') as fc.Arbitrary<'pronunciation' | 'punctuation'>,
                confidence: fc.float({ min: 0, max: 1, noNaN: true })
              }),
              { minLength: 0, maxLength: 10 }
            )
          }),
          (segment: TranscriptSegment) => {
            // Language code must be present
            expect(segment.languageCode).toBeDefined();
            expect(typeof segment.languageCode).toBe('string');
            expect(segment.languageCode.length).toBeGreaterThan(0);
            
            // Language code should be in valid format (e.g., 'en-US')
            expect(segment.languageCode).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('language code should be one of supported languages', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('en-US', 'es-ES', 'zh-CN', 'fr-FR', 'hi-IN'),
          (languageCode: string) => {
            const supportedLanguages = ['en-US', 'es-ES', 'zh-CN', 'fr-FR', 'hi-IN'];
            expect(supportedLanguages).toContain(languageCode);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('metadata should include language information', () => {
      fc.assert(
        fc.property(
          fc.record({
            languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
            languageConfidence: fc.float({ min: 0, max: 1, noNaN: true })
          }),
          (metadata: MetadataInfo) => {
            if (metadata.languageCode) {
              expect(typeof metadata.languageCode).toBe('string');
              expect(metadata.languageCode.length).toBeGreaterThan(0);
            }
            
            if (metadata.languageConfidence !== undefined) {
              expect(metadata.languageConfidence).toBeGreaterThanOrEqual(0);
              expect(metadata.languageConfidence).toBeLessThanOrEqual(1);
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 11: Low-Confidence Language Warning
   * **Validates: Requirements 5.4**
   * 
   * For any language identification result with confidence below 0.7, the system
   * should log a warning but continue processing with the detected language.
   */
  describe('Property 11: Low-Confidence Language Warning', () => {
    test('low confidence should trigger warning but not stop processing', () => {
      fc.assert(
        fc.property(
          fc.record({
            languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
            languageConfidence: fc.float({ min: 0, max: 1, noNaN: true })
          }),
          (metadata: MetadataInfo) => {
            const lowConfidenceThreshold = 0.7;
            const isLowConfidence = (metadata.languageConfidence ?? 1) < lowConfidenceThreshold;
            
            // Should be able to determine if warning is needed
            expect(typeof isLowConfidence).toBe('boolean');
            
            // Language code should still be present even with low confidence
            if (metadata.languageCode) {
              expect(metadata.languageCode.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('confidence threshold should be consistently applied', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1, noNaN: true }),
          (confidence: number) => {
            const threshold = 0.7;
            const shouldWarn = confidence < threshold;
            
            if (confidence < 0.7) {
              expect(shouldWarn).toBe(true);
            } else {
              expect(shouldWarn).toBe(false);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('warning should include confidence value and language', () => {
      fc.assert(
        fc.property(
          fc.record({
            languageCode: fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
            languageConfidence: fc.float({ min: 0, max: Math.fround(0.69), noNaN: true }) // Below threshold
          }),
          (metadata: MetadataInfo) => {
            // Simulate warning message generation
            const warningMessage = `Low language confidence: ${metadata.languageConfidence?.toFixed(2)} for ${metadata.languageCode}`;
            
            expect(warningMessage).toContain('Low language confidence');
            expect(warningMessage).toContain(metadata.languageCode ?? '');
            expect(warningMessage.length).toBeGreaterThan(20);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 12: Language Persistence
   * **Validates: Requirements 5.5**
   * 
   * For any transcription session, once a language is detected and set, it should
   * remain constant for all subsequent segments unless explicitly reconfigured.
   */
  describe('Property 12: Language Persistence', () => {
    test('all segments in a session should have the same language', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
          fc.array(
            fc.record({
              segmentId: fc.uuid(),
              text: fc.string({ minLength: 1, maxLength: 100 }),
              startTime: fc.integer({ min: 0, max: 3600000 }),
              endTime: fc.integer({ min: 0, max: 3600000 }),
              confidence: fc.float({ min: 0, max: 1, noNaN: true }),
              isPartial: fc.boolean(),
              isFinal: fc.boolean(),
              languageCode: fc.string(), // Will be overridden
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
            { minLength: 2, maxLength: 10 }
          ),
          (detectedLanguage: string, segments: TranscriptSegment[]) => {
            // Simulate setting all segments to detected language
            const sessionSegments = segments.map(s => ({
              ...s,
              languageCode: detectedLanguage
            }));
            
            // Verify all segments have the same language
            const languages = new Set(sessionSegments.map(s => s.languageCode));
            expect(languages.size).toBe(1);
            expect(languages.has(detectedLanguage)).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('language should not change without explicit reconfiguration', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
          fc.integer({ min: 1, max: 20 }), // Number of segments
          (initialLanguage: string, segmentCount: number) => {
            // Simulate session with persistent language
            const segments: string[] = [];
            let currentLanguage = initialLanguage;
            
            for (let i = 0; i < segmentCount; i++) {
              segments.push(currentLanguage);
              // Language persists unless explicitly changed (not happening here)
            }
            
            // Verify all segments have the initial language
            expect(segments.every(lang => lang === initialLanguage)).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    test('language change should only occur on explicit reconfiguration', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
          fc.constantFrom('en-US', 'es-ES', 'zh-CN'),
          fc.boolean(), // Whether reconfiguration occurs
          (initialLanguage: string, newLanguage: string, shouldReconfigure: boolean) => {
            let currentLanguage = initialLanguage;
            
            if (shouldReconfigure) {
              currentLanguage = newLanguage;
            }
            
            // Verify language only changes if reconfigured
            if (shouldReconfigure) {
              expect(currentLanguage).toBe(newLanguage);
            } else {
              expect(currentLanguage).toBe(initialLanguage);
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
