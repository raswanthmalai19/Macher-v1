/**
 * WebSocket Connection Pool for Amazon Transcribe Streaming
 * 
 * Manages WebSocket connections to Amazon Transcribe, handles connection lifecycle,
 * implements retry logic with exponential backoff, and monitors connection health.
 */

import { TranscribeStreamingClient, StartStreamTranscriptionCommand } from '@aws-sdk/client-transcribe-streaming';
import { TranscriptionConfig, TranscribeEvent, WebSocketConnection } from './types';
import { ErrorHandler, TranscriptionError } from './error-handler';

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
 * WebSocket connection wrapper for Amazon Transcribe
 */
class TranscribeWebSocketConnection implements WebSocketConnection {
  connectionId: string;
  socket: unknown;
  isOpen: boolean;
  lastActivity: number;
  
  private eventHandlers: Array<(event: TranscribeEvent) => void> = [];
  private audioStream: AsyncIterable<{ AudioEvent: { AudioChunk: Uint8Array } }> | null = null;
  private audioStreamController: ReadableStreamDefaultController<{ AudioEvent: { AudioChunk: Uint8Array } }> | null = null;

  constructor(connectionId: string) {
    this.connectionId = connectionId;
    this.socket = null;
    this.isOpen = false;
    this.lastActivity = Date.now();
  }

  /**
   * Initialize the connection with audio stream
   */
  initializeStream(): AsyncIterable<{ AudioEvent: { AudioChunk: Uint8Array } }> {
    const stream = new ReadableStream<{ AudioEvent: { AudioChunk: Uint8Array } }>({
      start: (controller) => {
        this.audioStreamController = controller;
      },
    });

    this.audioStream = stream as unknown as AsyncIterable<{ AudioEvent: { AudioChunk: Uint8Array } }>;
    return this.audioStream;
  }

  /**
   * Send audio data to Amazon Transcribe
   */
  async sendAudio(audioData: Buffer): Promise<void> {
    if (!this.isOpen) {
      throw new Error('Connection is not open');
    }

    if (!this.audioStreamController) {
      throw new Error('Audio stream not initialized');
    }

    // Convert Buffer to Uint8Array and send
    const audioChunk = new Uint8Array(audioData);
    this.audioStreamController.enqueue({ AudioEvent: { AudioChunk: audioChunk } });
    this.lastActivity = Date.now();
  }

  /**
   * Register handler for transcript events
   */
  onTranscriptEvent(handler: (event: TranscribeEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Emit transcript event to all registered handlers
   */
  emitEvent(event: TranscribeEvent): void {
    this.eventHandlers.forEach(handler => handler(event));
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (this.audioStreamController) {
      this.audioStreamController.close();
      this.audioStreamController = null;
    }
    this.isOpen = false;
    this.lastActivity = Date.now();
  }
}

/**
 * WebSocket Connection Pool for managing connections to Amazon Transcribe
 */
export class WebSocketConnectionPool {
  private connections: Map<string, TranscribeWebSocketConnection> = new Map();
  private transcribeClient: TranscribeStreamingClient;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private rateLimitQueue: Map<string, Array<() => Promise<void>>> = new Map();
  private readonly HEALTH_CHECK_INTERVAL_MS = 5000; // 5 seconds
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly INITIAL_RETRY_DELAY_MS = 1000; // 1 second
  private readonly MAX_RETRY_DELAY_MS = 8000; // 8 seconds
  private readonly RATE_LIMIT_DELAY_MS = 2000; // 2 seconds delay for rate limits

  constructor(transcribeClient?: TranscribeStreamingClient, logger?: Logger, errorHandler?: ErrorHandler) {
    this.transcribeClient = transcribeClient || new TranscribeStreamingClient({});
    this.logger = logger || new ConsoleLogger();
    this.errorHandler = errorHandler || new ErrorHandler(this.logger);
    this.startHealthMonitoring();
  }

  /**
   * Acquire a connection for a session
   * Requirements: 1.1, 1.3, 4.1, 5.1
   */
  async acquireConnection(sessionId: string, config: TranscriptionConfig): Promise<WebSocketConnection> {
    // Check if connection already exists
    const existingConnection = this.connections.get(sessionId);
    if (existingConnection && existingConnection.isOpen) {
      this.logger.info('Reusing existing connection', { sessionId, connectionId: existingConnection.connectionId });
      return existingConnection;
    }

    // Create new connection with retry logic
    return await this.createConnectionWithRetry(sessionId, config);
  }

  /**
   * Create a new connection with exponential backoff retry
   * Requirements: 1.4, 7.2, 7.6
   */
  private async createConnectionWithRetry(
    sessionId: string,
    config: TranscriptionConfig,
    attempt: number = 1
  ): Promise<WebSocketConnection> {
    try {
      this.logger.info('Creating new Transcribe connection', { sessionId, attempt });
      
      const connection = await this.createConnection(sessionId, config);
      
      this.logger.info('Connection established successfully', { 
        sessionId, 
        connectionId: connection.connectionId,
        attempt 
      });
      
      return connection;
    } catch (error) {
      const err = error as Error;
      
      // Parse error to determine if it's retryable
      const transcribeError = this.errorHandler.parseTranscribeError(err);
      
      this.logger.error('Connection attempt failed', { 
        sessionId, 
        attempt, 
        errorCode: transcribeError.code,
        error: transcribeError.message 
      });

      // Requirement 7.6: Handle rate limit errors with queuing
      if (this.errorHandler.isRateLimitError(transcribeError)) {
        this.logger.warn('Rate limit detected, queuing request', { sessionId, attempt });
        await this.handleRateLimit(sessionId);
        // Retry after rate limit delay
        return await this.createConnectionWithRetry(sessionId, config, attempt);
      }

      // Check if we should retry
      if (!transcribeError.retryable || attempt >= this.MAX_RETRY_ATTEMPTS) {
        this.logger.error('Max retry attempts reached or non-retryable error', { 
          sessionId, 
          attempts: attempt,
          retryable: transcribeError.retryable 
        });
        throw transcribeError;
      }

      // Calculate exponential backoff delay
      const delay = Math.min(
        this.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1),
        this.MAX_RETRY_DELAY_MS
      );

      this.logger.info('Retrying connection', { sessionId, attempt: attempt + 1, delayMs: delay });
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retry
      return await this.createConnectionWithRetry(sessionId, config, attempt + 1);
    }
  }

  /**
   * Handle rate limit by queuing and delaying requests
   * Requirement 7.6: Rate limit handling
   */
  private async handleRateLimit(sessionId: string): Promise<void> {
    this.logger.info('Handling rate limit', { sessionId });
    
    // Wait for rate limit delay
    await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY_MS));
    
    this.logger.info('Rate limit delay complete', { sessionId });
  }

  /**
   * Create a new WebSocket connection to Amazon Transcribe
   * Requirements: 1.1, 1.2, 1.3
   */
  private async createConnection(sessionId: string, config: TranscriptionConfig): Promise<TranscribeWebSocketConnection> {
    const connectionId = `conn-${sessionId}-${Date.now()}`;
    const connection = new TranscribeWebSocketConnection(connectionId);

    // Initialize audio stream
    const audioStream = connection.initializeStream();

    // Configure transcription parameters
    const command = new StartStreamTranscriptionCommand({
      LanguageCode: config.languageOptions[0] as any, // Primary language
      MediaSampleRateHertz: config.sampleRate,
      MediaEncoding: 'pcm',
      EnablePartialResultsStabilization: config.enablePartialResults,
      PartialResultsStability: 'high',
      IdentifyLanguage: config.enableLanguageIdentification,
      LanguageOptions: config.enableLanguageIdentification ? config.languageOptions.join(',') : undefined,
      AudioStream: audioStream,
    });

    try {
      // Start streaming transcription
      const response = await this.transcribeClient.send(command);

      // Mark connection as open
      connection.isOpen = true;
      connection.lastActivity = Date.now();

      // Store connection
      this.connections.set(sessionId, connection);

      // Process transcript stream in background
      this.processTranscriptStream(sessionId, connection, response.TranscriptResultStream);

      return connection;
    } catch (error) {
      const err = error as Error;
      this.logger.error('Failed to start transcription stream', { 
        sessionId, 
        connectionId, 
        error: err.message 
      });
      throw error;
    }
  }

  /**
   * Process incoming transcript events from Amazon Transcribe
   */
  private async processTranscriptStream(
    sessionId: string,
    connection: TranscribeWebSocketConnection,
    stream: AsyncIterable<any> | undefined
  ): Promise<void> {
    if (!stream) {
      this.logger.warn('No transcript stream available', { sessionId });
      return;
    }

    try {
      for await (const event of stream) {
        if (event.TranscriptEvent) {
          const transcriptEvent: TranscribeEvent = {
            type: 'transcript',
            transcript: {
              results: event.TranscriptEvent.Transcript?.Results || [],
            },
          };
          connection.emitEvent(transcriptEvent);
          connection.lastActivity = Date.now();
        } else if (event.BadRequestException || event.InternalFailureException || event.LimitExceededException) {
          const error = event.BadRequestException || event.InternalFailureException || event.LimitExceededException;
          const errorEvent: TranscribeEvent = {
            type: 'error',
            error: {
              code: error.name || 'UNKNOWN_ERROR',
              message: error.message || 'Unknown error occurred',
            },
          };
          connection.emitEvent(errorEvent);
          this.logger.error('Transcribe error event', { sessionId, error: error.message });
        }
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error('Error processing transcript stream', { sessionId, error: err.message });
      connection.isOpen = false;
    }
  }

  /**
   * Release a connection back to the pool
   * Requirements: 1.7
   */
  async releaseConnection(sessionId: string): Promise<void> {
    const connection = this.connections.get(sessionId);
    if (!connection) {
      this.logger.warn('Connection not found for release', { sessionId });
      return;
    }

    this.logger.info('Releasing connection', { sessionId, connectionId: connection.connectionId });

    try {
      await connection.close();
      this.connections.delete(sessionId);
      this.logger.info('Connection released successfully', { sessionId });
    } catch (error) {
      const err = error as Error;
      this.logger.error('Error releasing connection', { sessionId, error: err.message });
      // Remove from pool even if close fails
      this.connections.delete(sessionId);
    }
  }

  /**
   * Check if a connection is healthy
   * Requirements: 1.5
   */
  isConnectionHealthy(sessionId: string): boolean {
    const connection = this.connections.get(sessionId);
    if (!connection) {
      return false;
    }

    // Check if connection is open
    if (!connection.isOpen) {
      return false;
    }

    // Check if connection has been inactive for too long (5 seconds)
    const inactiveTime = Date.now() - connection.lastActivity;
    if (inactiveTime > this.HEALTH_CHECK_INTERVAL_MS) {
      this.logger.warn('Connection inactive', { sessionId, inactiveTimeMs: inactiveTime });
      return false;
    }

    return true;
  }

  /**
   * Reconnect a lost connection
   * Requirements: 1.6, 7.3
   */
  async reconnect(sessionId: string, config: TranscriptionConfig): Promise<WebSocketConnection> {
    this.logger.info('Attempting to reconnect', { sessionId });

    // Remove old connection
    const oldConnection = this.connections.get(sessionId);
    if (oldConnection) {
      try {
        await oldConnection.close();
      } catch (error) {
        // Ignore errors when closing old connection
      }
      this.connections.delete(sessionId);
    }

    // Create new connection with retry
    return await this.createConnectionWithRetry(sessionId, config);
  }

  /**
   * Start health monitoring for all connections
   * Requirements: 1.5, 8.5
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      const now = Date.now();
      const IDLE_TIMEOUT_MS = 30000; // 30 seconds
      
      for (const [sessionId, connection] of this.connections.entries()) {
        // Check connection health
        if (!this.isConnectionHealthy(sessionId)) {
          this.logger.warn('Unhealthy connection detected', { 
            sessionId, 
            connectionId: connection.connectionId 
          });
          // Connection will be reconnected when next used
        }
        
        // Requirement 8.5: Close idle connections after 30 seconds
        const idleTime = now - connection.lastActivity;
        if (idleTime > IDLE_TIMEOUT_MS && connection.isOpen) {
          this.logger.info('Closing idle connection', { 
            sessionId, 
            connectionId: connection.connectionId,
            idleTimeMs: idleTime 
          });
          
          // Close idle connection
          this.releaseConnection(sessionId).catch(error => {
            this.logger.error('Error closing idle connection', { 
              sessionId, 
              error: (error as Error).message 
            });
          });
        }
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Stop health monitoring and clean up
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down connection pool');

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Close all connections
    const closePromises = Array.from(this.connections.keys()).map(sessionId => 
      this.releaseConnection(sessionId)
    );
    await Promise.all(closePromises);

    this.logger.info('Connection pool shutdown complete');
  }
}
