/**
 * Core data models and interfaces for Real-Time Audio Transcription
 * 
 * This module defines all TypeScript interfaces used throughout the transcription service.
 */

// ============================================================================
// Audio Data Models
// ============================================================================

/**
 * Audio format specification
 */
export interface AudioFormat {
  sampleRate: number;  // 16000 Hz
  bitDepth: number;    // 16 bits
  channels: number;    // 1 (mono)
  encoding: string;    // 'pcm'
}

/**
 * Audio chunk representing a discrete segment of audio data
 */
export interface AudioChunk {
  data: Buffer;              // Raw PCM audio bytes
  timestamp: number;         // Unix timestamp in milliseconds
  sequenceNumber: number;    // Sequence number for ordering
  format: AudioFormat;       // Audio format specification
}

/**
 * Audio format validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  requiresConversion: boolean;
}

/**
 * Audio buffer for managing chunks
 */
export interface AudioBuffer {
  sessionId: string;
  chunks: AudioChunk[];
  totalDuration: number;  // milliseconds
  maxCapacity: number;    // maximum chunks (10)
  sequenceNumber: number;
}

// ============================================================================
// Transcription Configuration
// ============================================================================

/**
 * Configuration for transcription session
 */
export interface TranscriptionConfig {
  languageOptions: string[];        // e.g., ['en-US', 'es-ES', 'zh-CN']
  enablePartialResults: boolean;    // Enable partial result stabilization
  sampleRate: number;               // 16000 Hz
  enableLanguageIdentification: boolean;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Session handle returned when starting a transcription session
 */
export interface SessionHandle {
  sessionId: string;
  connectionId: string;
  startTime: number;
}

/**
 * Session status information
 */
export interface SessionStatus {
  sessionId: string;
  isActive: boolean;
  audioChunksProcessed: number;
  transcriptSegmentsReceived: number;
  currentLanguage?: string;
  latencyMs: number;
}

/**
 * Complete transcription session state
 */
export interface TranscriptionSession {
  sessionId: string;
  callId: string;
  connectionId: string;
  status: 'initializing' | 'active' | 'closing' | 'closed' | 'error';
  startTime: number;
  endTime?: number;
  
  // Audio tracking
  audioChunksReceived: number;
  audioChunksProcessed: number;
  totalAudioDuration: number;  // milliseconds
  
  // Transcript tracking
  segments: TranscriptSegment[];
  partialResults: Map<string, TranscriptSegment>;
  detectedLanguage?: string;
  
  // Performance metrics
  latencyMeasurements: number[];
  connectionRetries: number;
  errors: ErrorRecord[];
  
  // Configuration
  config: TranscriptionConfig;
}

/**
 * Error record for tracking errors during session
 */
export interface ErrorRecord {
  timestamp: number;
  errorType: string;
  errorMessage: string;
  errorCode?: string;
  recoverable: boolean;
}

// ============================================================================
// Transcript Data Models
// ============================================================================

/**
 * Individual transcript item (word or punctuation)
 */
export interface TranscriptItem {
  content: string;
  startTime: number;
  endTime: number;
  type: 'pronunciation' | 'punctuation';
  confidence: number;
}

/**
 * Transcript segment representing a portion of transcribed audio
 */
export interface TranscriptSegment {
  segmentId: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  isPartial: boolean;
  isFinal: boolean;
  languageCode: string;
  items: TranscriptItem[];
}

/**
 * Alternative transcription result
 */
export interface Alternative {
  transcript: string;
  confidence: number;
  items: TranscriptItem[];
}

/**
 * Transcript result from Amazon Transcribe
 */
export interface TranscriptResult {
  isPartial: boolean;
  alternatives: Alternative[];
  startTime: number;
  endTime: number;
  languageCode?: string;
}

/**
 * Transcript data from Amazon Transcribe event
 */
export interface TranscriptData {
  results: TranscriptResult[];
}

/**
 * Error data from Amazon Transcribe
 */
export interface ErrorData {
  code: string;
  message: string;
}

/**
 * Metadata information from Amazon Transcribe
 */
export interface MetadataInfo {
  languageCode?: string;
  languageConfidence?: number;
}

/**
 * Amazon Transcribe event
 */
export interface TranscribeEvent {
  type: 'transcript' | 'error' | 'metadata';
  transcript?: TranscriptData;
  error?: ErrorData;
  metadata?: MetadataInfo;
}

/**
 * Aggregated transcript with all segments
 */
export interface TranscriptAggregation {
  sessionId: string;
  segments: TranscriptSegment[];
  fullText: string;
  wordCount: number;
  averageConfidence: number;
  languageDistribution: Map<string, number>;  // language code -> word count
  lowConfidenceSegments: TranscriptSegment[];
}

/**
 * Aggregated transcript for API response
 */
export interface AggregatedTranscript {
  fullText: string;
  segments: TranscriptSegment[];
  detectedLanguage: string;
  averageConfidence: number;
  duration: number;
}

// ============================================================================
// Session Metrics
// ============================================================================

/**
 * Performance and quality metrics for a session
 */
export interface SessionMetrics {
  totalAudioChunks: number;
  totalTranscriptSegments: number;
  averageLatencyMs: number;
  connectionRetries: number;
  lowConfidenceSegments: number;
}

// ============================================================================
// API Request/Response Models
// ============================================================================

/**
 * Request to start a transcription session
 */
export interface StartTranscriptionRequest {
  sessionId: string;
  callId: string;
  audioFormat: AudioFormat;
  languageOptions?: string[];
}

/**
 * Response from starting a transcription session
 */
export interface StartTranscriptionResponse {
  sessionId: string;
  status: 'started' | 'error';
  message?: string;
}

/**
 * Request to send an audio chunk
 */
export interface SendAudioRequest {
  sessionId: string;
  audioChunk: AudioChunk;
}

/**
 * Response from sending an audio chunk
 */
export interface SendAudioResponse {
  status: 'accepted' | 'buffered' | 'error';
  message?: string;
}

/**
 * Request to end a transcription session
 */
export interface EndTranscriptionRequest {
  sessionId: string;
}

/**
 * Response from ending a transcription session
 */
export interface EndTranscriptionResponse {
  sessionId: string;
  transcript: AggregatedTranscript;
  metrics: SessionMetrics;
}

/**
 * Error response
 */
export interface ErrorResponse {
  status: 'error';
  errorType: 'connection' | 'validation' | 'api' | 'internal';
  errorCode: string;
  errorMessage: string;
  sessionId: string;
  timestamp: number;
  retryable: boolean;
  details?: Record<string, unknown>;
}

// ============================================================================
// WebSocket Connection Models
// ============================================================================

/**
 * WebSocket connection to Amazon Transcribe
 */
export interface WebSocketConnection {
  connectionId: string;
  socket: unknown;  // WebSocket instance (type depends on implementation)
  isOpen: boolean;
  lastActivity: number;
  
  // Send audio data
  sendAudio(audioData: Buffer): Promise<void>;
  
  // Listen for transcript events
  onTranscriptEvent(handler: (event: TranscribeEvent) => void): void;
  
  // Close connection
  close(): Promise<void>;
}
