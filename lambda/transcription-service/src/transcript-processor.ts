/**
 * Transcript Processor for handling Amazon Transcribe results
 * 
 * Processes transcript events from Amazon Transcribe, handles partial and final results,
 * and aggregates them into structured output.
 */

import { 
  TranscribeEvent, 
  TranscriptSegment, 
  TranscriptItem,
  AggregatedTranscript 
} from './types';

/**
 * Logger interface for structured logging
 */
interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Simple console logger implementation
 */
class ConsoleLogger implements Logger {
  info(message: string, context?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'INFO', message, timestamp: new Date().toISOString(), ...context }));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'WARN', message, timestamp: new Date().toISOString(), ...context }));
  }

  error(message: string, context?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'ERROR', message, timestamp: new Date().toISOString(), ...context }));
  }
}

/**
 * Callback type for transcript events
 */
type TranscriptCallback = (segment: TranscriptSegment) => void;

/**
 * Session transcript state
 */
interface SessionTranscriptState {
  segments: TranscriptSegment[];
  partialResults: Map<string, TranscriptSegment>;
  detectedLanguage?: string;
  partialCallbacks: TranscriptCallback[];
  finalCallbacks: TranscriptCallback[];
}

/**
 * Transcript Processor for handling transcription results
 */
export class TranscriptProcessor {
  private sessions: Map<string, SessionTranscriptState> = new Map();
  private logger: Logger;
  private readonly LOW_CONFIDENCE_THRESHOLD = 0.8;

  constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Initialize transcript processing for a session
   */
  initializeSession(sessionId: string): void {
    this.logger.info('Initializing transcript processor', { sessionId });
    
    this.sessions.set(sessionId, {
      segments: [],
      partialResults: new Map(),
      partialCallbacks: [],
      finalCallbacks: [],
    });
  }

  /**
   * Process incoming transcript event from Amazon Transcribe
   * Requirements: 4.2, 6.1
   */
  async processTranscriptEvent(sessionId: string, event: TranscribeEvent): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`No transcript state found for session: ${sessionId}`);
    }

    if (event.type === 'error') {
      this.logger.error('Transcribe error event', { 
        sessionId, 
        error: event.error 
      });
      return;
    }

    if (event.type === 'metadata') {
      this.handleMetadata(sessionId, state, event);
      return;
    }

    if (event.type === 'transcript' && event.transcript) {
      await this.handleTranscriptResults(sessionId, state, event.transcript.results);
    }
  }

  /**
   * Handle metadata events (language detection)
   * Requirements: 5.3
   */
  private handleMetadata(sessionId: string, state: SessionTranscriptState, event: TranscribeEvent): void {
    if (event.metadata?.languageCode) {
      state.detectedLanguage = event.metadata.languageCode;
      
      this.logger.info('Language detected', { 
        sessionId, 
        languageCode: event.metadata.languageCode,
        confidence: event.metadata.languageConfidence 
      });

      // Requirement 5.4: Log warning if confidence is low
      if (event.metadata.languageConfidence && event.metadata.languageConfidence < 0.7) {
        this.logger.warn('Low language identification confidence', { 
          sessionId, 
          languageCode: event.metadata.languageCode,
          confidence: event.metadata.languageConfidence 
        });
      }
    }
  }

  /**
   * Handle transcript results (partial and final)
   * Requirements: 4.2, 4.4, 4.5, 6.2
   */
  private async handleTranscriptResults(
    sessionId: string, 
    state: SessionTranscriptState, 
    results: any[]
  ): Promise<void> {
    for (const result of results) {
      if (!result.Alternatives || result.Alternatives.length === 0) {
        continue;
      }

      const alternative = result.Alternatives[0];
      const isPartial = result.IsPartial === true;
      const isFinal = !isPartial;

      // Extract transcript items
      const items: TranscriptItem[] = (alternative.Items || []).map((item: any) => ({
        content: item.Content || '',
        startTime: parseFloat(item.StartTime || '0'),
        endTime: parseFloat(item.EndTime || '0'),
        type: item.Type === 'punctuation' ? 'punctuation' : 'pronunciation',
        confidence: parseFloat(item.Confidence || '0'),
      }));

      // Calculate segment timing
      const startTime = items.length > 0 ? items[0].startTime : 0;
      const endTime = items.length > 0 ? items[items.length - 1].endTime : 0;

      // Create transcript segment
      const segment: TranscriptSegment = {
        segmentId: `${sessionId}-${result.ResultId || Date.now()}`,
        text: alternative.Transcript || '',
        startTime,
        endTime,
        confidence: parseFloat(alternative.Confidence || '0'),
        isPartial,
        isFinal,
        languageCode: state.detectedLanguage || 'en-US',
        items,
      };

      // Log low confidence segments
      if (segment.confidence < this.LOW_CONFIDENCE_THRESHOLD) {
        this.logger.warn('Low confidence transcript segment', { 
          sessionId, 
          segmentId: segment.segmentId,
          confidence: segment.confidence,
          text: segment.text 
        });
      }

      if (isPartial) {
        // Handle partial result
        await this.handlePartialResult(sessionId, state, segment);
      } else {
        // Handle final result
        await this.handleFinalResult(sessionId, state, segment);
      }
    }
  }

  /**
   * Handle partial transcript result
   * Requirements: 4.2, 4.4
   */
  private async handlePartialResult(
    sessionId: string, 
    state: SessionTranscriptState, 
    segment: TranscriptSegment
  ): Promise<void> {
    // Store partial result (will be superseded by final)
    state.partialResults.set(segment.segmentId, segment);

    this.logger.info('Partial transcript received', { 
      sessionId, 
      segmentId: segment.segmentId,
      text: segment.text,
      confidence: segment.confidence 
    });

    // Notify partial result callbacks
    for (const callback of state.partialCallbacks) {
      try {
        callback(segment);
      } catch (error) {
        const err = error as Error;
        this.logger.error('Error in partial result callback', { 
          sessionId, 
          error: err.message 
        });
      }
    }
  }

  /**
   * Handle final transcript result
   * Requirements: 4.5, 6.2, 6.3
   */
  private async handleFinalResult(
    sessionId: string, 
    state: SessionTranscriptState, 
    segment: TranscriptSegment
  ): Promise<void> {
    // Remove any partial results that are now superseded
    // Requirement 4.5: Final result supersedes partial results
    state.partialResults.delete(segment.segmentId);

    // Add to final segments (maintaining chronological order)
    // Requirement 6.3: Chronological ordering
    state.segments.push(segment);
    state.segments.sort((a, b) => a.startTime - b.startTime);

    this.logger.info('Final transcript received', { 
      sessionId, 
      segmentId: segment.segmentId,
      text: segment.text,
      confidence: segment.confidence,
      totalSegments: state.segments.length 
    });

    // Notify final result callbacks
    for (const callback of state.finalCallbacks) {
      try {
        callback(segment);
      } catch (error) {
        const err = error as Error;
        this.logger.error('Error in final result callback', { 
          sessionId, 
          error: err.message 
        });
      }
    }
  }

  /**
   * Get current transcript for a session
   * Requirements: 6.1, 6.4, 6.5
   */
  getCurrentTranscript(sessionId: string): AggregatedTranscript {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`No transcript state found for session: ${sessionId}`);
    }

    // Concatenate all segment texts
    const fullText = state.segments.map(s => s.text).join(' ');

    // Calculate average confidence
    const totalConfidence = state.segments.reduce((sum, s) => sum + s.confidence, 0);
    const averageConfidence = state.segments.length > 0 
      ? totalConfidence / state.segments.length 
      : 0;

    // Calculate total duration
    const duration = state.segments.length > 0
      ? state.segments[state.segments.length - 1].endTime - state.segments[0].startTime
      : 0;

    return {
      fullText,
      segments: state.segments,
      detectedLanguage: state.detectedLanguage || 'en-US',
      averageConfidence,
      duration,
    };
  }

  /**
   * Register callback for partial results
   * Requirements: 4.3
   */
  onPartialResult(sessionId: string, callback: TranscriptCallback): void {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`No transcript state found for session: ${sessionId}`);
    }

    state.partialCallbacks.push(callback);
    this.logger.info('Partial result callback registered', { sessionId });
  }

  /**
   * Register callback for final results
   */
  onFinalResult(sessionId: string, callback: TranscriptCallback): void {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`No transcript state found for session: ${sessionId}`);
    }

    state.finalCallbacks.push(callback);
    this.logger.info('Final result callback registered', { sessionId });
  }

  /**
   * Get low confidence segments
   * Requirements: 7.5, 10.3
   */
  getLowConfidenceSegments(sessionId: string): TranscriptSegment[] {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`No transcript state found for session: ${sessionId}`);
    }

    return state.segments.filter(s => s.confidence < this.LOW_CONFIDENCE_THRESHOLD);
  }

  /**
   * Clean up session resources
   */
  cleanup(sessionId: string): void {
    this.logger.info('Cleaning up transcript processor', { sessionId });
    this.sessions.delete(sessionId);
  }
}
