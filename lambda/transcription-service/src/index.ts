/**
 * Transcription Service Lambda Handler
 * 
 * Provides API endpoints for the Audio Processor to interact with the transcription service.
 * Handles session management, audio chunk processing, and transcript retrieval.
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { TranscribeStreamingClient } from '@aws-sdk/client-transcribe-streaming';
import { captureAWSv3Client } from 'aws-xray-sdk-core';
import { TranscriptionServiceManager } from './transcription-service-manager';
import {
  StartTranscriptionRequest,
  SendAudioRequest,
  EndTranscriptionRequest,
  ErrorResponse,
} from './types';
import {
  validateAndParseJSON,
  validateStartTranscriptionRequest,
  validateSendAudioRequest,
  validateEndTranscriptionRequest,
} from './validation';

// Initialize AWS clients with X-Ray tracing
const transcribeClient = captureAWSv3Client(new TranscribeStreamingClient({}));

// Initialize service manager (singleton for Lambda container reuse)
let serviceManager: TranscriptionServiceManager | null = null;

function getServiceManager(): TranscriptionServiceManager {
  if (!serviceManager) {
    serviceManager = new TranscriptionServiceManager(transcribeClient);
  }
  return serviceManager;
}

/**
 * Structured log entry
 */
interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  requestId?: string;
  sessionId?: string;
  path?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Write structured JSON log
 */
function log(entry: Omit<LogEntry, 'timestamp'>): void {
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * Create error response
 * Requirements: 9.3, 9.4
 */
function createErrorResponse(
  statusCode: number,
  errorType: 'connection' | 'validation' | 'api' | 'internal',
  errorCode: string,
  errorMessage: string,
  sessionId: string,
  retryable: boolean = false,
  details?: Record<string, unknown>
): APIGatewayProxyResultV2 {
  const errorResponse: ErrorResponse = {
    status: 'error',
    errorType,
    errorCode,
    errorMessage,
    sessionId,
    timestamp: Date.now(),
    retryable,
    details,
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(errorResponse),
  };
}

/**
 * Create success response
 * Requirements: 9.3, 9.4
 */
function createSuccessResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Validate request body
 * Requirements: 9.5
 * @deprecated Use specific validation functions from validation module instead
 */
function validateRequestBody(body: string | undefined, requiredFields: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!body) {
    errors.push('Request body is required');
    return { valid: false, errors };
  }

  let parsedBody: any;
  try {
    parsedBody = JSON.parse(body);
  } catch (error) {
    errors.push('Invalid JSON in request body');
    return { valid: false, errors };
  }

  for (const field of requiredFields) {
    if (!(field in parsedBody)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Handle start transcription request
 * Requirements: 9.1, 9.5
 */
async function handleStartTranscription(
  body: string,
  requestId: string
): Promise<APIGatewayProxyResultV2> {
  // Parse JSON
  const parseResult = validateAndParseJSON(body);
  if (!parseResult.valid) {
    log({
      level: 'WARN',
      message: 'Invalid JSON in start transcription request',
      requestId,
      error: { name: 'ValidationError', message: parseResult.errors.join(', ') },
    });

    return createErrorResponse(
      400,
      'validation',
      'INVALID_JSON',
      parseResult.errors.join(', '),
      'unknown',
      false,
      { errors: parseResult.errors }
    );
  }

  // Validate request structure and fields
  const validation = validateStartTranscriptionRequest(parseResult.data);
  if (!validation.valid) {
    log({
      level: 'WARN',
      message: 'Invalid start transcription request',
      requestId,
      error: { name: 'ValidationError', message: validation.errors.join(', ') },
    });

    return createErrorResponse(
      400,
      'validation',
      'INVALID_REQUEST',
      validation.errors.join('; '),
      'unknown',
      false,
      { errors: validation.errors }
    );
  }

  const request = parseResult.data as StartTranscriptionRequest;
  const { sessionId } = request;

  log({
    level: 'INFO',
    message: 'Starting transcription session',
    requestId,
    sessionId,
  });

  try {
    const manager = getServiceManager();
    const response = await manager.startSession(request);

    if (response.status === 'error') {
      return createErrorResponse(
        500,
        'internal',
        'SESSION_START_FAILED',
        response.message || 'Failed to start session',
        sessionId,
        true
      );
    }

    log({
      level: 'INFO',
      message: 'Transcription session started',
      requestId,
      sessionId,
    });

    return createSuccessResponse(200, response);
  } catch (error) {
    const err = error as Error;
    log({
      level: 'ERROR',
      message: 'Error starting transcription session',
      requestId,
      sessionId,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    });

    return createErrorResponse(
      500,
      'internal',
      'INTERNAL_ERROR',
      err.message,
      sessionId,
      true
    );
  }
}

/**
 * Handle send audio request
 * Requirements: 9.1, 9.4, 9.5
 */
async function handleSendAudio(
  body: string,
  requestId: string
): Promise<APIGatewayProxyResultV2> {
  // Parse JSON
  const parseResult = validateAndParseJSON(body);
  if (!parseResult.valid) {
    log({
      level: 'WARN',
      message: 'Invalid JSON in send audio request',
      requestId,
      error: { name: 'ValidationError', message: parseResult.errors.join(', ') },
    });

    return createErrorResponse(
      400,
      'validation',
      'INVALID_JSON',
      parseResult.errors.join(', '),
      'unknown',
      false,
      { errors: parseResult.errors }
    );
  }

  // Validate request structure and fields
  const validation = validateSendAudioRequest(parseResult.data);
  if (!validation.valid) {
    log({
      level: 'WARN',
      message: 'Invalid send audio request',
      requestId,
      error: { name: 'ValidationError', message: validation.errors.join(', ') },
    });

    return createErrorResponse(
      400,
      'validation',
      'INVALID_REQUEST',
      validation.errors.join('; '),
      'unknown',
      false,
      { errors: validation.errors }
    );
  }

  const request = parseResult.data as SendAudioRequest;
  const { sessionId } = request;

  // Convert base64 audio data to Buffer if needed
  if (typeof request.audioChunk.data === 'string') {
    request.audioChunk.data = Buffer.from(request.audioChunk.data, 'base64');
  }

  try {
    const manager = getServiceManager();
    const response = await manager.processAudioChunk(request);

    if (response.status === 'error') {
      return createErrorResponse(
        500,
        'internal',
        'AUDIO_PROCESSING_FAILED',
        response.message || 'Failed to process audio',
        sessionId,
        true
      );
    }

    return createSuccessResponse(200, response);
  } catch (error) {
    const err = error as Error;
    log({
      level: 'ERROR',
      message: 'Error processing audio chunk',
      requestId,
      sessionId,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    });

    return createErrorResponse(
      500,
      'internal',
      'INTERNAL_ERROR',
      err.message,
      sessionId,
      true
    );
  }
}

/**
 * Handle end transcription request
 * Requirements: 9.1, 9.3, 9.5
 */
async function handleEndTranscription(
  body: string,
  requestId: string
): Promise<APIGatewayProxyResultV2> {
  // Parse JSON
  const parseResult = validateAndParseJSON(body);
  if (!parseResult.valid) {
    log({
      level: 'WARN',
      message: 'Invalid JSON in end transcription request',
      requestId,
      error: { name: 'ValidationError', message: parseResult.errors.join(', ') },
    });

    return createErrorResponse(
      400,
      'validation',
      'INVALID_JSON',
      parseResult.errors.join(', '),
      'unknown',
      false,
      { errors: parseResult.errors }
    );
  }

  // Validate request structure and fields
  const validation = validateEndTranscriptionRequest(parseResult.data);
  if (!validation.valid) {
    log({
      level: 'WARN',
      message: 'Invalid end transcription request',
      requestId,
      error: { name: 'ValidationError', message: validation.errors.join(', ') },
    });

    return createErrorResponse(
      400,
      'validation',
      'INVALID_REQUEST',
      validation.errors.join('; '),
      'unknown',
      false,
      { errors: validation.errors }
    );
  }

  const request = parseResult.data as EndTranscriptionRequest;
  const { sessionId } = request;

  log({
    level: 'INFO',
    message: 'Ending transcription session',
    requestId,
    sessionId,
  });

  try {
    const manager = getServiceManager();
    const response = await manager.endSession(request);

    log({
      level: 'INFO',
      message: 'Transcription session ended',
      requestId,
      sessionId,
    });

    return createSuccessResponse(200, response);
  } catch (error) {
    const err = error as Error;
    log({
      level: 'ERROR',
      message: 'Error ending transcription session',
      requestId,
      sessionId,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    });

    return createErrorResponse(
      500,
      'internal',
      'INTERNAL_ERROR',
      err.message,
      sessionId,
      true
    );
  }
}

/**
 * Lambda handler for transcription service API
 * 
 * Routes:
 * - POST /transcription/start - Start a new transcription session
 * - POST /transcription/audio - Send audio chunk to session
 * - POST /transcription/end - End transcription session
 * 
 * Requirements: 9.1, 9.3, 9.4, 9.6
 */
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  const requestId = event.requestContext.requestId;
  const path = event.rawPath || event.requestContext.http?.path || '';
  const method = event.requestContext.http.method;

  log({
    level: 'INFO',
    message: 'Transcription service request received',
    requestId,
    path,
  });

  try {
    // Route based on path
    if (method === 'POST' && path.endsWith('/start')) {
      return await handleStartTranscription(event.body || '', requestId);
    } else if (method === 'POST' && path.endsWith('/audio')) {
      return await handleSendAudio(event.body || '', requestId);
    } else if (method === 'POST' && path.endsWith('/end')) {
      return await handleEndTranscription(event.body || '', requestId);
    } else {
      log({
        level: 'WARN',
        message: 'Unknown route',
        requestId,
        path,
      });

      return createErrorResponse(
        404,
        'validation',
        'ROUTE_NOT_FOUND',
        `Route not found: ${method} ${path}`,
        'unknown',
        false
      );
    }
  } catch (error) {
    const err = error as Error;
    const duration = Date.now() - startTime;

    log({
      level: 'ERROR',
      message: 'Unhandled error in transcription service',
      requestId,
      path,
      duration,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    });

    return createErrorResponse(
      500,
      'internal',
      'INTERNAL_ERROR',
      'An unexpected error occurred',
      'unknown',
      false
    );
  } finally {
    const duration = Date.now() - startTime;
    log({
      level: 'INFO',
      message: 'Request completed',
      requestId,
      path,
      duration,
    });
  }
}
