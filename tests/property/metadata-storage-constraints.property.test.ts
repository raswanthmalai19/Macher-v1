/**
 * Feature: competition-mvp-backend, Property 17: Metadata Storage Constraints
 * 
 * For any call session metadata stored in Metadata_Store, it should contain Call_Session ID,
 * timestamp, Risk_Score, Threat_Level, and fraud indicators, with transcription snippets
 * ≤200 characters and all PII redacted, and should NOT contain raw audio or complete transcriptions.
 * 
 * Validates: Requirements 6.1, 6.2, 6.3, 6.6
 */

import * as fc from 'fast-check';
import { buildCallMetadata, CallMetadata, CallSessionState } from '../../lambda/audio-processor';
import { FraudAnalysisResult } from '../../lambda/audio-processor/bedrock-client';

describe('Property 17: Metadata Storage Constraints', () => {
  /**
   * Generator for CallSessionState with various transcription buffer sizes
   */
  const callSessionStateGen = fc.record({
    callSessionId: fc.uuid(),
    connectionId: fc.string({ minLength: 10, maxLength: 50 }),
    startTime: fc.date().map(d => d.getTime()),
    transcriptionBuffer: fc.array(
      fc.string({ minLength: 5, maxLength: 100 }),
      { minLength: 1, maxLength: 50 }
    ),
    wordCount: fc.integer({ min: 50, max: 500 }),
    speechDuration: fc.integer({ min: 10, max: 60 }),
    lastAnalysisTime: fc.date().map(d => d.getTime()),
    analysisCount: fc.integer({ min: 1, max: 10 }),
    currentRiskScore: fc.integer({ min: 0, max: 100 }),
    currentThreatLevel: fc.constantFrom('SAFE' as const, 'CAUTION' as const, 'DANGER' as const),
  });

  /**
   * Generator for FraudAnalysisResult with various fraud indicators
   */
  const fraudAnalysisResultGen = fc.record({
    callSessionId: fc.uuid(),
    timestamp: fc.date().map(d => d.getTime()),
    riskScore: fc.integer({ min: 0, max: 100 }),
    threatLevel: fc.constantFrom('SAFE' as const, 'CAUTION' as const, 'DANGER' as const),
    fraudIndicators: fc.array(
      fc.record({
        type: fc.constantFrom('URGENCY' as const, 'PAYMENT_REQUEST' as const, 'IMPERSONATION' as const, 'THREAT' as const, 'PERSONAL_INFO_REQUEST' as const),
        description: fc.string({ minLength: 10, maxLength: 100 }),
        confidence: fc.double({ min: 0, max: 1 }),
      }),
      { minLength: 0, maxLength: 5 }
    ),
    reasoning: fc.string({ minLength: 10, maxLength: 200 }),
    knowledgeBaseReferences: fc.array(fc.string(), { maxLength: 3 }),
    tokenUsage: fc.record({
      inputTokens: fc.integer({ min: 10, max: 1000 }),
      outputTokens: fc.integer({ min: 10, max: 500 }),
    }),
  });

  /**
   * Generator for transcription text that may contain PII
   */
  const transcriptionWithPIIGen = fc.oneof(
    // Plain text without PII
    fc.string({ minLength: 50, maxLength: 500 }),
    // Text with phone numbers
    fc.tuple(
      fc.string({ minLength: 20, maxLength: 200 }),
      fc.constantFrom(
        '(123) 456-7890',
        '123-456-7890',
        '1234567890',
        '+1 123 456 7890'
      ),
      fc.string({ minLength: 20, maxLength: 200 })
    ).map(([before, phone, after]) => `${before} ${phone} ${after}`),
    // Text with email addresses
    fc.tuple(
      fc.string({ minLength: 20, maxLength: 200 }),
      fc.emailAddress(),
      fc.string({ minLength: 20, maxLength: 200 })
    ).map(([before, email, after]) => `${before} ${email} ${after}`),
    // Text with SSN
    fc.tuple(
      fc.string({ minLength: 20, maxLength: 200 }),
      fc.constantFrom('123-45-6789', '123 45 6789', '123456789'),
      fc.string({ minLength: 20, maxLength: 200 })
    ).map(([before, ssn, after]) => `${before} ${ssn} ${after}`),
    // Text with credit card
    fc.tuple(
      fc.string({ minLength: 20, maxLength: 200 }),
      fc.constantFrom(
        '1234-5678-9012-3456',
        '1234 5678 9012 3456',
        '1234567890123456'
      ),
      fc.string({ minLength: 20, maxLength: 200 })
    ).map(([before, card, after]) => `${before} ${card} ${after}`),
    // Text with names
    fc.tuple(
      fc.string({ minLength: 20, maxLength: 200 }),
      fc.constantFrom('John Smith', 'Mary Johnson', 'Robert Williams'),
      fc.string({ minLength: 20, maxLength: 200 })
    ).map(([before, name, after]) => `${before} ${name} ${after}`)
  );

  test('metadata record always has all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        callSessionStateGen,
        fraudAnalysisResultGen,
        async (session, analysisResult) => {
          // Build metadata record
          const metadata = buildCallMetadata(session, analysisResult);

          // Requirement 6.1: Verify all required fields are present
          expect(metadata).toHaveProperty('callSessionId');
          expect(metadata).toHaveProperty('timestamp');
          expect(metadata).toHaveProperty('riskScore');
          expect(metadata).toHaveProperty('threatLevel');
          expect(metadata).toHaveProperty('fraudIndicators');
          expect(metadata).toHaveProperty('redactedSnippet');
          expect(metadata).toHaveProperty('analysisCount');
          expect(metadata).toHaveProperty('ttl');

          // Verify field types
          expect(typeof metadata.callSessionId).toBe('string');
          expect(typeof metadata.timestamp).toBe('number');
          expect(typeof metadata.riskScore).toBe('number');
          expect(typeof metadata.threatLevel).toBe('string');
          expect(Array.isArray(metadata.fraudIndicators)).toBe(true);
          expect(typeof metadata.redactedSnippet).toBe('string');
          expect(typeof metadata.analysisCount).toBe('number');
          expect(typeof metadata.ttl).toBe('number');
        }
      ),
      { numRuns: 20 }
    );
  });

  test('snippet is always ≤200 characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        callSessionStateGen,
        fraudAnalysisResultGen,
        async (session, analysisResult) => {
          // Build metadata record
          const metadata = buildCallMetadata(session, analysisResult);

          // Requirement 6.3: Verify snippet length constraint
          expect(metadata.redactedSnippet.length).toBeLessThanOrEqual(200);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('PII patterns are not present in redacted snippet', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          callSessionId: fc.uuid(),
          connectionId: fc.string({ minLength: 10, maxLength: 50 }),
          startTime: fc.date().map(d => d.getTime()),
          transcriptionBuffer: fc.array(transcriptionWithPIIGen, { minLength: 1, maxLength: 10 }),
          wordCount: fc.integer({ min: 50, max: 500 }),
          speechDuration: fc.integer({ min: 10, max: 60 }),
          lastAnalysisTime: fc.date().map(d => d.getTime()),
          analysisCount: fc.integer({ min: 1, max: 10 }),
          currentRiskScore: fc.integer({ min: 0, max: 100 }),
          currentThreatLevel: fc.constantFrom('SAFE' as const, 'CAUTION' as const, 'DANGER' as const),
        }),
        fraudAnalysisResultGen,
        async (session, analysisResult) => {
          // Build metadata record
          const metadata = buildCallMetadata(session, analysisResult);

          // Requirement 6.3: Verify no PII patterns in snippet
          const snippet = metadata.redactedSnippet;

          // Check for phone number patterns (same regex as redactPII)
          expect(snippet).not.toMatch(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/);
          
          // Check for email patterns (same regex as redactPII)
          expect(snippet).not.toMatch(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
          
          // Check for SSN patterns (same regex as redactPII)
          expect(snippet).not.toMatch(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/);
          
          // Check for credit card patterns (same regex as redactPII)
          expect(snippet).not.toMatch(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4,7}\b/);
          
          // Check for account number patterns (8-16 digits)
          expect(snippet).not.toMatch(/\b\d{8,16}\b/);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('metadata does not contain raw audio data', async () => {
    await fc.assert(
      fc.asyncProperty(
        callSessionStateGen,
        fraudAnalysisResultGen,
        async (session, analysisResult) => {
          // Build metadata record
          const metadata = buildCallMetadata(session, analysisResult);

          // Requirement 6.2: Verify no audio-related fields
          expect(metadata).not.toHaveProperty('audioData');
          expect(metadata).not.toHaveProperty('audioChunks');
          expect(metadata).not.toHaveProperty('rawAudio');
          expect(metadata).not.toHaveProperty('pcmData');
          expect(metadata).not.toHaveProperty('audioBuffer');

          // Verify the metadata object only has the expected keys
          const allowedKeys = [
            'callSessionId',
            'timestamp',
            'riskScore',
            'threatLevel',
            'fraudIndicators',
            'redactedSnippet',
            'analysisCount',
            'ttl'
          ];
          
          const metadataKeys = Object.keys(metadata);
          metadataKeys.forEach(key => {
            expect(allowedKeys).toContain(key);
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  test('metadata does not contain complete transcriptions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          callSessionId: fc.uuid(),
          connectionId: fc.string({ minLength: 10, maxLength: 50 }),
          startTime: fc.date().map(d => d.getTime()),
          // Generate long transcription buffer (>200 chars when joined)
          transcriptionBuffer: fc.array(
            fc.string({ minLength: 50, maxLength: 100 }),
            { minLength: 5, maxLength: 20 }
          ),
          wordCount: fc.integer({ min: 100, max: 500 }),
          speechDuration: fc.integer({ min: 10, max: 60 }),
          lastAnalysisTime: fc.date().map(d => d.getTime()),
          analysisCount: fc.integer({ min: 1, max: 10 }),
          currentRiskScore: fc.integer({ min: 0, max: 100 }),
          currentThreatLevel: fc.constantFrom('SAFE' as const, 'CAUTION' as const, 'DANGER' as const),
        }),
        fraudAnalysisResultGen,
        async (session, analysisResult) => {
          // Build metadata record
          const metadata = buildCallMetadata(session, analysisResult);

          // Requirement 6.2: Verify no complete transcription
          const fullTranscription = session.transcriptionBuffer.join(' ');
          
          // If full transcription is longer than 200 chars, metadata should NOT contain it
          if (fullTranscription.length > 200) {
            expect(metadata.redactedSnippet).not.toBe(fullTranscription);
            expect(metadata.redactedSnippet.length).toBeLessThanOrEqual(200);
          }

          // Verify no transcription-related fields
          expect(metadata).not.toHaveProperty('fullTranscription');
          expect(metadata).not.toHaveProperty('completeTranscription');
          expect(metadata).not.toHaveProperty('transcriptionBuffer');
          expect(metadata).not.toHaveProperty('transcriptionText');
        }
      ),
      { numRuns: 20 }
    );
  });

  test('TTL is set to 24 hours from current time', async () => {
    await fc.assert(
      fc.asyncProperty(
        callSessionStateGen,
        fraudAnalysisResultGen,
        async (session, analysisResult) => {
          // Capture current time before building metadata
          const beforeTime = Math.floor(Date.now() / 1000);
          
          // Build metadata record
          const metadata = buildCallMetadata(session, analysisResult);
          
          // Capture current time after building metadata
          const afterTime = Math.floor(Date.now() / 1000);

          // Requirement 6.6: Verify TTL is set to 24 hours (86400 seconds)
          const expectedMinTTL = beforeTime + (24 * 60 * 60);
          const expectedMaxTTL = afterTime + (24 * 60 * 60);

          expect(metadata.ttl).toBeGreaterThanOrEqual(expectedMinTTL);
          expect(metadata.ttl).toBeLessThanOrEqual(expectedMaxTTL);

          // Verify TTL is in seconds (not milliseconds)
          // TTL should be a reasonable Unix timestamp in seconds
          const currentTimeSeconds = Math.floor(Date.now() / 1000);
          expect(metadata.ttl).toBeGreaterThan(currentTimeSeconds);
          expect(metadata.ttl).toBeLessThan(currentTimeSeconds + (25 * 60 * 60)); // Less than 25 hours
        }
      ),
      { numRuns: 20 }
    );
  });

  test('fraud indicators are stored as array of strings', async () => {
    await fc.assert(
      fc.asyncProperty(
        callSessionStateGen,
        fraudAnalysisResultGen,
        async (session, analysisResult) => {
          // Build metadata record
          const metadata = buildCallMetadata(session, analysisResult);

          // Requirement 6.1: Verify fraud indicators format
          expect(Array.isArray(metadata.fraudIndicators)).toBe(true);
          
          // All elements should be strings (indicator types only, not full objects)
          metadata.fraudIndicators.forEach(indicator => {
            expect(typeof indicator).toBe('string');
          });

          // Verify no detailed indicator information is stored
          metadata.fraudIndicators.forEach(indicator => {
            // Should be simple strings, not objects with description/confidence
            expect(typeof indicator).toBe('string');
            expect(indicator).not.toHaveProperty('description');
            expect(indicator).not.toHaveProperty('confidence');
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  test('risk score and threat level are preserved from analysis result', async () => {
    await fc.assert(
      fc.asyncProperty(
        callSessionStateGen,
        fraudAnalysisResultGen,
        async (session, analysisResult) => {
          // Build metadata record
          const metadata = buildCallMetadata(session, analysisResult);

          // Requirement 6.1: Verify risk score and threat level are stored correctly
          expect(metadata.riskScore).toBe(analysisResult.riskScore);
          expect(metadata.threatLevel).toBe(analysisResult.threatLevel);

          // Verify valid ranges
          expect(metadata.riskScore).toBeGreaterThanOrEqual(0);
          expect(metadata.riskScore).toBeLessThanOrEqual(100);
          expect(['SAFE', 'CAUTION', 'DANGER']).toContain(metadata.threatLevel);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('analysis count is preserved from session state', async () => {
    await fc.assert(
      fc.asyncProperty(
        callSessionStateGen,
        fraudAnalysisResultGen,
        async (session, analysisResult) => {
          // Build metadata record
          const metadata = buildCallMetadata(session, analysisResult);

          // Requirement 6.1: Verify analysis count is stored correctly
          expect(metadata.analysisCount).toBe(session.analysisCount);
          expect(metadata.analysisCount).toBeGreaterThan(0);
        }
      ),
      { numRuns: 20 }
    );
  });
});
