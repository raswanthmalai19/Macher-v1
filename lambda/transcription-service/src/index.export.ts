/**
 * Public exports for the Transcription Service
 * 
 * This file provides a clean API for importing transcription service components.
 */

// Core components
export { TranscriptionServiceManager } from './transcription-service-manager';
export { WebSocketConnectionPool } from './websocket-connection-pool';
export { AudioStreamHandler } from './audio-stream-handler';
export { TranscriptProcessor } from './transcript-processor';

// Type definitions
export * from './types';

// Lambda handler
export { handler } from './index';
