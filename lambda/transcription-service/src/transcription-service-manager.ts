/**
 * Transcription Service Manager
 * 
 * Orchestrates the entire transcription workflow, manages session state,
 * and coordinates between WebSocket connections, audio streaming, and transcript processing.
 */

import { TranscribeStreamingClient } from '@aws-sdk/client-transcribe-streaming';
import { WebSocketConnectionPool } from './websocket-connection-pool';
import { AudioStreamHandler } from './audio-stream-handler';
import { TranscriptProcessor } from './transcript-processor';
import { ErrorHandler, TranscriptionError } from './error-handler';
import { CloudWatchMetrics } from './cloudwatch-metrics';
import {
  TranscriptionConfig,
  SessionHandle,
  SessionStatus,
  TranscriptionSession,
  AudioChunk,
  AggregatedTranscript,
  SessionMetrics,
  StartTranscriptionRequest,
  StartTranscriptionResponse,
  SendAudioRequest,
  SendAudioResponse,
  EndTranscriptionRequest,
  EndTranscriptionResponse,
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
 * Transcription Service Manager
 * 
 * Main orchestrator for real-time audio transcription
 */
export class TranscriptionServiceManager {
  private connectionPool: WebSocketConnectionPool;
  private audioHandler: AudioStreamHandler;
  private transcriptProcessor: TranscriptProcessor;
  private errorHandler: ErrorHandler;
  private cloudWatchMetrics: CloudWatchMetrics;
  private sessions: Map<string, TranscriptionSession> = new Map();
  private logger: Logger;
  private cumulativeTranscriptionDuration: number = 0; // milliseconds
  private readonly FREE_TIER_LIMIT_MS = 60 * 60 * 1000; // 60 minutes in milliseconds
  private readonly FREE_TIER_WARNING_THRESHOLD = 0.8; // 80%

  constructor(
    transcribeClient?: TranscribeStreamingClient,
    logger?: Logger
  ) {
    this.logger = logger || new ConsoleLogger();
    this.errorHandler = new ErrorHandler(this.logger);
    this.cloudWatchMetrics = new CloudWatchMetrics(undefined, this.logger);
    this.connectionPool = new WebSocketConnectionPool(transcribeClient, this.logger, this.errorHandler);
    this.audioHandler = new AudioStreamHandler(this.logger, this.errorHandler);
    this.transcriptProcessor = new TranscriptProcessor(this.logger);
  }

  /**
   * Start a new transcription session
   * Requirements: 1.1, 1.3, 4.1, 5.1, 5.2
   */
  async startSession(request: StartTranscriptionRequest): Promise<StartTranscriptionResponse> {
    const { sessionId, callId, audioFormat, languageOptions } = request;

    this.logger.info('Starting transcription session', { sessionId, callId });

    try {
      // Check if session already exists
      if (this.sessions.has(sessionId)) {
        throw new Error(`Session already exists: ${sessionId}`);
      }

      // Create transcription configuration
      const config: TranscriptionConfig = {
        languageOptions: languageOptions || ['en-US', 'es-ES', 'zh-CN'],
        enablePartialResults: true,
        sampleRate: audioFormat.sampleRate || 16000,
        enableLanguageIdentification: true,
      };

      // Acquire WebSocket connection
      const connection = await this.connectionPool.acquireConnection(sessionId, config);

      // Initialize audio stream handler
      this.audioHandler.initializeStream(sessionId, connection);

      // Initialize transcript processor
      this.transcriptProcessor.initializeSession(sessionId);

      // Register transcript event handler
      connection.onTranscriptEvent(async (event) => {
        await this.transcriptProcessor.processTranscriptEvent(sessionId, event);
      });

      // Create session state
      const session: TranscriptionSession = {
        sessionId,
        callId,
        connectionId: connection.connectionId,
        status: 'active',
        startTime: Date.now(),
        audioChunksReceived: 0,
        audioChunksProcessed: 0,
        totalAudioDuration: 0,
        segments: [],
        partialResults: new Map(),
        latencyMeasurements: [],
        connectionRetries: 0,
        errors: [],
        config,
      };

      this.sessions.set(sessionId, session);

      this.logger.info('Transcription session started', { 
        sessionId, 
        connectionId: connection.connectionId 
      });

      return {
        sessionId,
        status: 'started',
        message: 'Transcription session started successfully',
      };
    } catch (error) {
      const err = error as Error;
      
      // Requirement 7.4: Handle unrecoverable errors
      const errorResponse = this.errorHandler.handleError(err, sessionId, { callId });
      
      // Mark session as error if it exists
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'error';
        session.errors.push({
          timestamp: Date.now(),
          errorType: errorResponse.errorType,
          errorMessage: errorResponse.errorMessage,
          errorCode: errorResponse.errorCode,
          recoverable: errorResponse.retryable,
        });
      }

      this.logger.error('Failed to start transcription session', { 
        sessionId, 
        error: err.message 
      });

      return {
        sessionId,
        status: 'error',
        message: `Failed to start session: ${err.message}`,
      };
    }
  }

  /**
   * Process an audio chunk
   * Requirements: 9.1, 9.4
   */
  async processAudioChunk(request: SendAudioRequest): Promise<SendAudioResponse> {
    const { sessionId, audioChunk } = request;
    const startTime = Date.now();

    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        status: 'error',
        message: `Session not found: ${sessionId}`,
      };
    }

    try {
      // Update session metrics
      session.audioChunksReceived++;

      // Buffer and stream audio
      await this.audioHandler.bufferAndStream(sessionId, audioChunk);

      // Update session metrics
      session.audioChunksProcessed++;
      
      // Calculate chunk duration (16kHz, 16-bit, mono)
      const chunkDuration = (audioChunk.data.length / 2 / 16000) * 1000;
      session.totalAudioDuration += chunkDuration;

      // Track latency
      const latency = Date.now() - startTime;
      session.latencyMeasurements.push(latency);

      // Publish latency metric to CloudWatch
      await this.cloudWatchMetrics.publishLatency(sessionId, latency);

      this.logger.info('Audio chunk processed', { 
        sessionId, 
        sequenceNumber: audioChunk.sequenceNumber,
        latencyMs: latency 
      });

      return {
        status: 'accepted',
        message: 'Audio chunk processed successfully',
      };
    } catch (error) {
      const err = error as Error;
      
      // Handle error with context
      const errorResponse = this.errorHandler.handleError(err, sessionId);
      
      // Publish error metric to CloudWatch
      await this.cloudWatchMetrics.publishError(sessionId, errorResponse.errorType);
      
      // Record error in session
      session.errors.push({
        timestamp: Date.now(),
        errorType: errorResponse.errorType,
        errorMessage: errorResponse.errorMessage,
        errorCode: errorResponse.errorCode,
        recoverable: errorResponse.retryable,
      });

      this.logger.error('Failed to process audio chunk', { 
        sessionId, 
        error: err.message 
      });

      return {
        status: 'error',
        message: `Failed to process audio: ${err.message}`,
      };
    }
  }

  /**
   * End a transcription session
   * Requirements: 1.7, 6.5
   */
  async endSession(request: EndTranscriptionRequest): Promise<EndTranscriptionResponse> {
    const { sessionId } = request;

    this.logger.info('Ending transcription session', { sessionId });

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      // Update session status
      session.status = 'closing';

      // Flush any remaining buffered audio
      await this.audioHandler.flushBuffer(sessionId);

      // Get final transcript
      const transcript = this.transcriptProcessor.getCurrentTranscript(sessionId);

      // Calculate metrics
      const metrics = this.calculateSessionMetrics(session);

      // Publish session metrics to CloudWatch
      const durationMinutes = session.totalAudioDuration / 60000;
      await this.cloudWatchMetrics.publishSessionMetrics(sessionId, {
        ...metrics,
        durationMinutes,
      });

      // Update cumulative transcription duration
      this.cumulativeTranscriptionDuration += session.totalAudioDuration;

      // Check free tier usage
      this.checkFreeTierUsage();

      // Clean up resources
      await this.audioHandler.cleanup(sessionId);
      this.transcriptProcessor.cleanup(sessionId);
      await this.connectionPool.releaseConnection(sessionId);

      // Update session status
      session.status = 'closed';
      session.endTime = Date.now();

      // Remove session
      this.sessions.delete(sessionId);

      this.logger.info('Transcription session ended', { 
        sessionId, 
        duration: session.totalAudioDuration,
        segments: transcript.segments.length 
      });

      return {
        sessionId,
        transcript,
        metrics,
      };
    } catch (error) {
      const err = error as Error;
      
      // Requirement 7.4: Handle unrecoverable errors - gracefully terminate
      const errorResponse = this.errorHandler.handleError(err, sessionId);
      
      this.logger.error('Failed to end transcription session', { 
        sessionId, 
        error: err.message 
      });

      // Mark session as error
      session.status = 'error';
      session.errors.push({
        timestamp: Date.now(),
        errorType: errorResponse.errorType,
        errorMessage: errorResponse.errorMessage,
        errorCode: errorResponse.errorCode,
        recoverable: errorResponse.retryable,
      });

      // Clean up resources even on error
      try {
        await this.audioHandler.cleanup(sessionId);
        this.transcriptProcessor.cleanup(sessionId);
        await this.connectionPool.releaseConnection(sessionId);
      } catch (cleanupError) {
        this.logger.error('Error during cleanup', { 
          sessionId, 
          error: (cleanupError as Error).message 
        });
      }

      throw error;
    }
  }

  /**
   * Get current session status
   * Requirements: 10.5
   */
  getSessionStatus(sessionId: string): SessionStatus {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Calculate average latency
    const avgLatency = session.latencyMeasurements.length > 0
      ? session.latencyMeasurements.reduce((sum, l) => sum + l, 0) / session.latencyMeasurements.length
      : 0;

    // Get current transcript to count segments
    const transcript = this.transcriptProcessor.getCurrentTranscript(sessionId);

    return {
      sessionId,
      isActive: session.status === 'active',
      audioChunksProcessed: session.audioChunksProcessed,
      transcriptSegmentsReceived: transcript.segments.length,
      currentLanguage: session.detectedLanguage,
      latencyMs: avgLatency,
    };
  }

  /**
   * Calculate session metrics
   * Requirements: 10.1, 10.2, 10.5, 8.6
   */
  private calculateSessionMetrics(session: TranscriptionSession): SessionMetrics {
    // Get transcript for metrics
    const transcript = this.transcriptProcessor.getCurrentTranscript(session.sessionId);

    // Calculate average latency
    const avgLatency = session.latencyMeasurements.length > 0
      ? session.latencyMeasurements.reduce((sum, l) => sum + l, 0) / session.latencyMeasurements.length
      : 0;

    // Get low confidence segments
    const lowConfidenceSegments = this.transcriptProcessor.getLowConfidenceSegments(session.sessionId);

    // Check latency threshold
    if (avgLatency > 500) {
      this.logger.warn('Average latency exceeded 500ms threshold', { 
        sessionId: session.sessionId, 
        avgLatencyMs: avgLatency 
      });
    }

    // Requirement 8.6: Calculate cost metrics
    const durationMinutes = session.totalAudioDuration / 60000;
    const costPerMinute = 0.024; // $0.024 per minute for Amazon Transcribe (standard pricing)
    const estimatedCost = durationMinutes * costPerMinute;

    this.logger.info('Session cost metrics', {
      sessionId: session.sessionId,
      durationMinutes: durationMinutes.toFixed(2),
      estimatedCost: estimatedCost.toFixed(4),
    });

    return {
      totalAudioChunks: session.audioChunksProcessed,
      totalTranscriptSegments: transcript.segments.length,
      averageLatencyMs: avgLatency,
      connectionRetries: session.connectionRetries,
      lowConfidenceSegments: lowConfidenceSegments.length,
    };
  }

  /**
   * Check free tier usage and log warnings
   * Requirements: 8.1, 8.2
   */
  private checkFreeTierUsage(): void {
    const usagePercent = this.cumulativeTranscriptionDuration / this.FREE_TIER_LIMIT_MS;

    this.logger.info('Free tier usage', { 
      cumulativeDurationMs: this.cumulativeTranscriptionDuration,
      cumulativeDurationMinutes: Math.round(this.cumulativeTranscriptionDuration / 60000),
      usagePercent: Math.round(usagePercent * 100),
      limitMinutes: this.FREE_TIER_LIMIT_MS / 60000 
    });

    // Requirement 8.2: Log warning at 80% threshold
    if (usagePercent >= this.FREE_TIER_WARNING_THRESHOLD && usagePercent < 1.0) {
      this.logger.warn('Approaching free tier limit', { 
        usagePercent: Math.round(usagePercent * 100),
        remainingMinutes: Math.round((this.FREE_TIER_LIMIT_MS - this.cumulativeTranscriptionDuration) / 60000) 
      });
    }

    if (usagePercent >= 1.0) {
      this.logger.error('Free tier limit exceeded', { 
        cumulativeDurationMinutes: Math.round(this.cumulativeTranscriptionDuration / 60000),
        limitMinutes: this.FREE_TIER_LIMIT_MS / 60000 
      });
    }
  }

  /**
   * Get cumulative transcription duration for cost monitoring
   * Requirements: 8.1
   */
  getCumulativeTranscriptionDuration(): number {
    return this.cumulativeTranscriptionDuration;
  }

  /**
   * Shutdown the service manager
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down transcription service manager');

    // End all active sessions
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      try {
        await this.endSession({ sessionId });
      } catch (error) {
        this.logger.error('Error ending session during shutdown', { 
          sessionId, 
          error: (error as Error).message 
        });
      }
    }

    // Shutdown connection pool
    await this.connectionPool.shutdown();

    this.logger.info('Transcription service manager shutdown complete');
  }
}
