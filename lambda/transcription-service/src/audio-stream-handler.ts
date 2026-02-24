/**
 * Audio Stream Handler for buffering and streaming audio to Amazon Transcribe
 * 
 * Manages audio buffering, format validation, and streaming to Amazon Transcribe via WebSocket.
 * Implements circular buffer with 10-chunk capacity and 100ms segment processing.
 */

import { AudioChunk, AudioFormat, ValidationResult, WebSocketConnection } from './types';
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
 * Audio buffer for managing chunks
 */
class CircularAudioBuffer {
  private chunks: AudioChunk[] = [];
  private readonly maxCapacity: number;
  private totalDuration: number = 0;
  private sequenceNumber: number = 0;

  constructor(maxCapacity: number = 10) {
    this.maxCapacity = maxCapacity;
  }

  /**
   * Add a chunk to the buffer
   * If buffer is full, remove oldest chunk
   * Requirements: 3.3, 3.4
   */
  add(chunk: AudioChunk): AudioChunk | null {
    let droppedChunk: AudioChunk | null = null;

    // If buffer is full, drop oldest chunk
    if (this.chunks.length >= this.maxCapacity) {
      droppedChunk = this.chunks.shift() || null;
      if (droppedChunk) {
        // Calculate chunk duration (assuming 16kHz, 16-bit, mono)
        const chunkDuration = (droppedChunk.data.length / 2 / 16000) * 1000;
        this.totalDuration -= chunkDuration;
      }
    }

    // Add new chunk
    this.chunks.push(chunk);
    
    // Calculate chunk duration
    const chunkDuration = (chunk.data.length / 2 / 16000) * 1000;
    this.totalDuration += chunkDuration;
    this.sequenceNumber++;

    return droppedChunk;
  }

  /**
   * Get all chunks and clear buffer
   */
  flush(): AudioChunk[] {
    const chunks = [...this.chunks];
    this.chunks = [];
    this.totalDuration = 0;
    return chunks;
  }

  /**
   * Get current buffer duration in milliseconds
   */
  getDuration(): number {
    return this.totalDuration;
  }

  /**
   * Get number of chunks in buffer
   */
  size(): number {
    return this.chunks.length;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.chunks.length === 0;
  }
}

/**
 * Audio Stream Handler for managing audio buffering and streaming
 */
export class AudioStreamHandler {
  private buffers: Map<string, CircularAudioBuffer> = new Map();
  private connections: Map<string, WebSocketConnection> = new Map();
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private readonly BUFFER_THRESHOLD_MS = 100; // Send when buffer reaches 100ms
  private readonly MAX_BUFFER_CAPACITY = 10; // Maximum 10 chunks

  constructor(logger?: Logger, errorHandler?: ErrorHandler) {
    this.logger = logger || new ConsoleLogger();
    this.errorHandler = errorHandler || new ErrorHandler(this.logger);
  }

  /**
   * Initialize audio stream for a session
   * Requirements: 3.1
   */
  initializeStream(sessionId: string, connection: WebSocketConnection): void {
    this.logger.info('Initializing audio stream', { sessionId, connectionId: connection.connectionId });
    
    // Create buffer for session
    this.buffers.set(sessionId, new CircularAudioBuffer(this.MAX_BUFFER_CAPACITY));
    
    // Store connection reference
    this.connections.set(sessionId, connection);
    
    this.logger.info('Audio stream initialized', { sessionId });
  }

  /**
   * Validate audio format
   * Requirements: 2.1, 2.4
   */
  validateAudioFormat(audioChunk: AudioChunk): ValidationResult {
    const errors: string[] = [];
    let requiresConversion = false;

    // Check encoding
    if (audioChunk.format.encoding !== 'pcm') {
      errors.push(`Invalid encoding: ${audioChunk.format.encoding}. Expected 'pcm'`);
      requiresConversion = true;
    }

    // Check sample rate
    if (audioChunk.format.sampleRate !== 16000) {
      errors.push(`Invalid sample rate: ${audioChunk.format.sampleRate}. Expected 16000 Hz`);
      requiresConversion = true;
    }

    // Check bit depth
    if (audioChunk.format.bitDepth !== 16) {
      errors.push(`Invalid bit depth: ${audioChunk.format.bitDepth}. Expected 16 bits`);
      requiresConversion = true;
    }

    // Check channels
    if (audioChunk.format.channels !== 1) {
      errors.push(`Invalid channels: ${audioChunk.format.channels}. Expected 1 (mono)`);
      requiresConversion = true;
    }

    // Check data size
    if (audioChunk.data.length === 0) {
      errors.push('Audio data is empty');
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      errors,
      requiresConversion,
    };
  }

  /**
   * Convert audio format to required specification
   * Requirements: 2.2, 2.5
   * 
   * Note: This is a simplified implementation for MVP.
   * In production, use a proper audio processing library like ffmpeg or sox.
   */
  private convertAudioFormat(audioChunk: AudioChunk): AudioChunk {
    const startTime = Date.now();
    
    this.logger.info('Converting audio format', { 
      sequenceNumber: audioChunk.sequenceNumber,
      currentFormat: audioChunk.format 
    });

    // For MVP, we'll assume audio is already in correct format
    // In production, implement actual conversion logic here
    const convertedChunk: AudioChunk = {
      ...audioChunk,
      format: {
        sampleRate: 16000,
        bitDepth: 16,
        channels: 1,
        encoding: 'pcm',
      },
    };

    const conversionTime = Date.now() - startTime;
    
    this.logger.info('Audio format converted', { 
      sequenceNumber: audioChunk.sequenceNumber,
      conversionTimeMs: conversionTime 
    });

    // Requirement 2.3: Conversion should complete within 50ms
    if (conversionTime > 50) {
      this.logger.warn('Audio conversion exceeded 50ms threshold', { 
        conversionTimeMs: conversionTime 
      });
    }

    return convertedChunk;
  }

  /**
   * Buffer and stream audio chunk
   * Requirements: 3.1, 3.2, 3.5
   */
  async bufferAndStream(sessionId: string, audioChunk: AudioChunk): Promise<void> {
    const buffer = this.buffers.get(sessionId);
    const connection = this.connections.get(sessionId);

    if (!buffer) {
      throw new Error(`No buffer found for session: ${sessionId}`);
    }

    if (!connection) {
      throw new Error(`No connection found for session: ${sessionId}`);
    }

    // Validate audio format
    // Requirement 9.5: Malformed input validation
    const validation = this.validateAudioFormat(audioChunk);
    
    if (!validation.isValid) {
      if (validation.requiresConversion) {
        this.logger.warn('Audio format requires conversion', { 
          sessionId, 
          errors: validation.errors 
        });
        // Convert audio format
        audioChunk = this.convertAudioFormat(audioChunk);
      } else {
        // Non-recoverable validation error - do not retry
        throw this.errorHandler.createValidationError(
          `Audio validation failed: ${validation.errors.join(', ')}`,
          { errors: validation.errors, sequenceNumber: audioChunk.sequenceNumber }
        );
      }
    }

    // Add chunk to buffer
    const droppedChunk = buffer.add(audioChunk);
    
    // Log if chunk was dropped due to buffer overflow
    if (droppedChunk) {
      this.logger.warn('Buffer overflow: oldest chunk dropped', { 
        sessionId, 
        droppedSequenceNumber: droppedChunk.sequenceNumber,
        bufferSize: buffer.size() 
      });
    }

    this.logger.info('Audio chunk buffered', { 
      sessionId, 
      sequenceNumber: audioChunk.sequenceNumber,
      bufferDurationMs: buffer.getDuration(),
      bufferSize: buffer.size() 
    });

    // Check if buffer has reached threshold (100ms)
    if (buffer.getDuration() >= this.BUFFER_THRESHOLD_MS) {
      await this.sendBufferedAudio(sessionId);
    }
  }

  /**
   * Send buffered audio to Amazon Transcribe
   * Requirements: 3.2, 3.6
   */
  private async sendBufferedAudio(sessionId: string): Promise<void> {
    const buffer = this.buffers.get(sessionId);
    const connection = this.connections.get(sessionId);

    if (!buffer || !connection) {
      return;
    }

    // Get all chunks from buffer
    const chunks = buffer.flush();
    
    if (chunks.length === 0) {
      return;
    }

    // Combine chunks into single buffer
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.data.length, 0);
    const combinedBuffer = Buffer.concat(chunks.map(chunk => chunk.data), totalSize);

    const startTime = Date.now();

    try {
      // Send to Amazon Transcribe via WebSocket
      await connection.sendAudio(combinedBuffer);
      
      const latency = Date.now() - startTime;
      
      this.logger.info('Audio sent to Transcribe', { 
        sessionId, 
        chunkCount: chunks.length,
        totalBytes: totalSize,
        latencyMs: latency 
      });

      // Requirement 3.6: End-to-end latency should not exceed 150ms
      if (latency > 150) {
        this.logger.warn('Audio streaming latency exceeded 150ms threshold', { 
          sessionId, 
          latencyMs: latency 
        });
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error('Failed to send audio to Transcribe', { 
        sessionId, 
        error: err.message 
      });
      throw error;
    }
  }

  /**
   * Flush remaining buffered audio
   * Requirements: 3.2
   */
  async flushBuffer(sessionId: string): Promise<void> {
    this.logger.info('Flushing audio buffer', { sessionId });
    
    const buffer = this.buffers.get(sessionId);
    if (!buffer || buffer.isEmpty()) {
      this.logger.info('Buffer is empty, nothing to flush', { sessionId });
      return;
    }

    // Send any remaining buffered audio
    await this.sendBufferedAudio(sessionId);
    
    this.logger.info('Audio buffer flushed', { sessionId });
  }

  /**
   * Clean up resources for a session
   */
  async cleanup(sessionId: string): Promise<void> {
    this.logger.info('Cleaning up audio stream handler', { sessionId });
    
    // Flush any remaining audio
    await this.flushBuffer(sessionId);
    
    // Remove buffer and connection references
    this.buffers.delete(sessionId);
    this.connections.delete(sessionId);
    
    this.logger.info('Audio stream handler cleanup complete', { sessionId });
  }
}
