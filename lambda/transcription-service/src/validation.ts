/**
 * Input Validation Module
 * 
 * Provides comprehensive validation for all API inputs to ensure data integrity
 * and provide descriptive error messages for malformed requests.
 * 
 * Requirements: 9.5
 */

import {
  StartTranscriptionRequest,
  SendAudioRequest,
  EndTranscriptionRequest,
  AudioFormat,
  AudioChunk,
} from './types';

/**
 * Validation result with detailed error information
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  field?: string;
}

/**
 * Validate that a value is a non-empty string
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate that a value is a positive number
 */
function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && !isNaN(value);
}

/**
 * Validate that a value is a non-negative number
 */
function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && !isNaN(value);
}

/**
 * Validate that a value is a valid Buffer or base64 string
 */
function isValidAudioData(value: unknown): boolean {
  if (Buffer.isBuffer(value)) {
    return value.length > 0;
  }
  if (typeof value === 'string') {
    // Check if it's a valid base64 string
    // Base64 regex: only A-Z, a-z, 0-9, +, /, and = for padding
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(value)) {
      return false;
    }
    try {
      const buffer = Buffer.from(value, 'base64');
      return buffer.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Validate AudioFormat object
 * Requirements: 2.1, 2.4
 */
export function validateAudioFormat(format: unknown): ValidationResult {
  const errors: string[] = [];

  if (!format || typeof format !== 'object') {
    return {
      valid: false,
      errors: ['audioFormat must be an object'],
      field: 'audioFormat',
    };
  }

  const audioFormat = format as Partial<AudioFormat>;

  // Validate sampleRate
  if (!isPositiveNumber(audioFormat.sampleRate)) {
    errors.push('audioFormat.sampleRate must be a positive number');
  } else if (audioFormat.sampleRate !== 16000) {
    errors.push('audioFormat.sampleRate must be 16000 Hz (required by Amazon Transcribe)');
  }

  // Validate bitDepth
  if (!isPositiveNumber(audioFormat.bitDepth)) {
    errors.push('audioFormat.bitDepth must be a positive number');
  } else if (audioFormat.bitDepth !== 16) {
    errors.push('audioFormat.bitDepth must be 16 bits (required by Amazon Transcribe)');
  }

  // Validate channels
  if (!isPositiveNumber(audioFormat.channels)) {
    errors.push('audioFormat.channels must be a positive number');
  } else if (audioFormat.channels !== 1) {
    errors.push('audioFormat.channels must be 1 (mono, required by Amazon Transcribe)');
  }

  // Validate encoding
  if (!isNonEmptyString(audioFormat.encoding)) {
    errors.push('audioFormat.encoding must be a non-empty string');
  } else if (audioFormat.encoding.toLowerCase() !== 'pcm') {
    errors.push('audioFormat.encoding must be "pcm" (required by Amazon Transcribe)');
  }

  return {
    valid: errors.length === 0,
    errors,
    field: 'audioFormat',
  };
}

/**
 * Validate AudioChunk object
 * Requirements: 3.1, 9.5
 */
export function validateAudioChunk(chunk: unknown): ValidationResult {
  const errors: string[] = [];

  if (!chunk || typeof chunk !== 'object') {
    return {
      valid: false,
      errors: ['audioChunk must be an object'],
      field: 'audioChunk',
    };
  }

  const audioChunk = chunk as Partial<AudioChunk>;

  // Validate data
  if (!isValidAudioData(audioChunk.data)) {
    errors.push('audioChunk.data must be a non-empty Buffer or valid base64 string');
  }

  // Validate timestamp
  if (!isPositiveNumber(audioChunk.timestamp)) {
    errors.push('audioChunk.timestamp must be a positive number (Unix timestamp in milliseconds)');
  } else {
    // Check if timestamp is reasonable (not in the future, not too old)
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    if (audioChunk.timestamp > now + 60000) {
      errors.push('audioChunk.timestamp cannot be in the future');
    } else if (audioChunk.timestamp < now - maxAge) {
      errors.push('audioChunk.timestamp is too old (max age: 1 hour)');
    }
  }

  // Validate sequenceNumber
  if (!isNonNegativeNumber(audioChunk.sequenceNumber)) {
    errors.push('audioChunk.sequenceNumber must be a non-negative number');
  }

  // Validate format
  if (audioChunk.format) {
    const formatValidation = validateAudioFormat(audioChunk.format);
    if (!formatValidation.valid) {
      errors.push(...formatValidation.errors);
    }
  } else {
    errors.push('audioChunk.format is required');
  }

  return {
    valid: errors.length === 0,
    errors,
    field: 'audioChunk',
  };
}

/**
 * Validate language options array
 * Requirements: 5.1, 5.2
 */
export function validateLanguageOptions(options: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(options)) {
    return {
      valid: false,
      errors: ['languageOptions must be an array'],
      field: 'languageOptions',
    };
  }

  if (options.length === 0) {
    errors.push('languageOptions must contain at least one language code');
  }

  const validLanguageCodes = ['en-US', 'es-ES', 'zh-CN', 'en-GB', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR', 'ja-JP', 'ko-KR'];
  
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (!isNonEmptyString(option)) {
      errors.push(`languageOptions[${i}] must be a non-empty string`);
    } else if (!validLanguageCodes.includes(option)) {
      errors.push(`languageOptions[${i}] contains invalid language code: ${option}. Valid codes: ${validLanguageCodes.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    field: 'languageOptions',
  };
}

/**
 * Validate StartTranscriptionRequest
 * Requirements: 9.5
 */
export function validateStartTranscriptionRequest(request: unknown): ValidationResult {
  const errors: string[] = [];

  if (!request || typeof request !== 'object') {
    return {
      valid: false,
      errors: ['Request must be an object'],
    };
  }

  const req = request as Partial<StartTranscriptionRequest>;

  // Validate sessionId
  if (!isNonEmptyString(req.sessionId)) {
    errors.push('sessionId must be a non-empty string');
  } else if (req.sessionId.length > 256) {
    errors.push('sessionId must not exceed 256 characters');
  }

  // Validate callId
  if (!isNonEmptyString(req.callId)) {
    errors.push('callId must be a non-empty string');
  } else if (req.callId.length > 256) {
    errors.push('callId must not exceed 256 characters');
  }

  // Validate audioFormat
  if (!req.audioFormat) {
    errors.push('audioFormat is required');
  } else {
    const formatValidation = validateAudioFormat(req.audioFormat);
    if (!formatValidation.valid) {
      errors.push(...formatValidation.errors);
    }
  }

  // Validate languageOptions (optional)
  if (req.languageOptions !== undefined) {
    const langValidation = validateLanguageOptions(req.languageOptions);
    if (!langValidation.valid) {
      errors.push(...langValidation.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate SendAudioRequest
 * Requirements: 9.5
 */
export function validateSendAudioRequest(request: unknown): ValidationResult {
  const errors: string[] = [];

  if (!request || typeof request !== 'object') {
    return {
      valid: false,
      errors: ['Request must be an object'],
    };
  }

  const req = request as Partial<SendAudioRequest>;

  // Validate sessionId
  if (!isNonEmptyString(req.sessionId)) {
    errors.push('sessionId must be a non-empty string');
  } else if (req.sessionId.length > 256) {
    errors.push('sessionId must not exceed 256 characters');
  }

  // Validate audioChunk
  if (!req.audioChunk) {
    errors.push('audioChunk is required');
  } else {
    const chunkValidation = validateAudioChunk(req.audioChunk);
    if (!chunkValidation.valid) {
      errors.push(...chunkValidation.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate EndTranscriptionRequest
 * Requirements: 9.5
 */
export function validateEndTranscriptionRequest(request: unknown): ValidationResult {
  const errors: string[] = [];

  if (!request || typeof request !== 'object') {
    return {
      valid: false,
      errors: ['Request must be an object'],
    };
  }

  const req = request as Partial<EndTranscriptionRequest>;

  // Validate sessionId
  if (!isNonEmptyString(req.sessionId)) {
    errors.push('sessionId must be a non-empty string');
  } else if (req.sessionId.length > 256) {
    errors.push('sessionId must not exceed 256 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate JSON string and parse it
 * Requirements: 9.5
 */
export function validateAndParseJSON(body: string | undefined): { valid: boolean; data?: unknown; errors: string[] } {
  if (!body) {
    return {
      valid: false,
      errors: ['Request body is required'],
    };
  }

  if (typeof body !== 'string') {
    return {
      valid: false,
      errors: ['Request body must be a string'],
    };
  }

  if (body.trim().length === 0) {
    return {
      valid: false,
      errors: ['Request body cannot be empty'],
    };
  }

  try {
    const data = JSON.parse(body);
    return {
      valid: true,
      data,
      errors: [],
    };
  } catch (error) {
    const err = error as Error;
    return {
      valid: false,
      errors: [`Invalid JSON: ${err.message}`],
    };
  }
}
