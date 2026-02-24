# Real-Time Audio Transcription Service

## Overview

The Real-Time Audio Transcription Service provides streaming audio-to-text conversion for VocalShield's fraud detection system. It leverages Amazon Transcribe Streaming API to achieve low-latency (<500ms) transcription of phone call audio with multi-language support.

## Architecture

### Components

1. **WebSocket Connection Pool** (`websocket-connection-pool.ts`)
   - Manages WebSocket connections to Amazon Transcribe
   - Implements exponential backoff retry (1s, 2s, 4s, max 3 attempts)
   - Monitors connection health with 5-second heartbeat
   - Handles automatic reconnection on failures

2. **Audio Stream Handler** (`audio-stream-handler.ts`)
   - Buffers audio chunks in 100ms segments
   - Validates audio format (16kHz, 16-bit, mono PCM)
   - Implements circular buffer with 10-chunk capacity
   - Maintains temporal ordering of audio data

3. **Transcript Processor** (`transcript-processor.ts`)
   - Processes partial and final transcript results
   - Aggregates segments in chronological order
   - Tracks low-confidence segments (<0.8 threshold)
   - Provides real-time callbacks for streaming results

4. **Transcription Service Manager** (`transcription-service-manager.ts`)
   - Orchestrates all components
   - Manages session lifecycle
   - Tracks cumulative transcription duration for cost monitoring
   - Provides session status and metrics

5. **Lambda Handler** (`index.ts`)
   - Exposes REST API endpoints
   - Handles request validation
   - Provides structured error responses
   - Supports concurrent sessions

## API Endpoints

### POST /transcription/start

Start a new transcription session.

**Request:**
```json
{
  "sessionId": "session-123",
  "callId": "call-456",
  "audioFormat": {
    "sampleRate": 16000,
    "bitDepth": 16,
    "channels": 1,
    "encoding": "pcm"
  },
  "languageOptions": ["en-US", "es-ES", "zh-CN"]
}
```

**Response:**
```json
{
  "sessionId": "session-123",
  "status": "started",
  "message": "Transcription session started successfully"
}
```

### POST /transcription/audio

Send an audio chunk to an active session.

**Request:**
```json
{
  "sessionId": "session-123",
  "audioChunk": {
    "data": "<base64-encoded-pcm-audio>",
    "timestamp": 1234567890,
    "sequenceNumber": 1,
    "format": {
      "sampleRate": 16000,
      "bitDepth": 16,
      "channels": 1,
      "encoding": "pcm"
    }
  }
}
```

**Response:**
```json
{
  "status": "accepted",
  "message": "Audio chunk processed successfully"
}
```

### POST /transcription/end

End a transcription session and retrieve the final transcript.

**Request:**
```json
{
  "sessionId": "session-123"
}
```

**Response:**
```json
{
  "sessionId": "session-123",
  "transcript": {
    "fullText": "Hello, this is a test transcription.",
    "segments": [
      {
        "segmentId": "seg-1",
        "text": "Hello, this is a test transcription.",
        "startTime": 0,
        "endTime": 2.5,
        "confidence": 0.95,
        "isPartial": false,
        "isFinal": true,
        "languageCode": "en-US",
        "items": []
      }
    ],
    "detectedLanguage": "en-US",
    "averageConfidence": 0.95,
    "duration": 2.5
  },
  "metrics": {
    "totalAudioChunks": 25,
    "totalTranscriptSegments": 1,
    "averageLatencyMs": 250,
    "connectionRetries": 0,
    "lowConfidenceSegments": 0
  }
}
```

## Configuration

### Audio Format Requirements

- **Sample Rate:** 16kHz (16000 Hz)
- **Bit Depth:** 16-bit
- **Channels:** Mono (1 channel)
- **Encoding:** PCM (Pulse Code Modulation)

### Language Support

The service supports automatic language identification for:
- English (en-US)
- Spanish (es-ES)
- Mandarin Chinese (zh-CN)

Additional languages can be added by updating the `languageOptions` in the configuration.

### Performance Targets

- **Transcription Latency:** <500ms from speech to text delivery
- **Audio Streaming Latency:** <150ms per chunk
- **Buffer Processing:** 100ms segments
- **Connection Health Check:** 5-second intervals

### Cost Optimization

- **Free Tier Tracking:** Monitors cumulative transcription duration
- **Warning Threshold:** Logs warning at 80% of free tier limit (48 minutes)
- **Connection Reuse:** Maintains persistent connections for multiple chunks
- **Idle Timeout:** Closes connections after 30 seconds of inactivity

## Error Handling

### Error Types

1. **Connection Errors**
   - Automatic retry with exponential backoff
   - Maximum 3 retry attempts
   - Reconnection for active sessions

2. **Validation Errors**
   - Invalid audio format
   - Malformed API requests
   - Missing required fields

3. **API Errors**
   - Amazon Transcribe service errors
   - Rate limit handling with queuing
   - Authentication failures

4. **Internal Errors**
   - Buffer overflows (drops oldest chunk)
   - State management issues
   - Unexpected exceptions

### Error Response Format

```json
{
  "status": "error",
  "errorType": "validation",
  "errorCode": "INVALID_REQUEST",
  "errorMessage": "Missing required field: sessionId",
  "sessionId": "session-123",
  "timestamp": 1234567890,
  "retryable": false,
  "details": {
    "errors": ["Missing required field: sessionId"]
  }
}
```

## Logging

All logs are structured JSON with the following format:

```json
{
  "timestamp": "2024-02-16T10:30:00.000Z",
  "level": "INFO",
  "message": "Transcription session started",
  "sessionId": "session-123",
  "connectionId": "conn-123-456"
}
```

### Log Levels

- **INFO:** Normal operations (session start/end, audio processing)
- **WARN:** Recoverable issues (low confidence, buffer overflow, approaching limits)
- **ERROR:** Unrecoverable errors (connection failures, API errors)

## Testing

### Unit Tests

Run unit tests for type definitions:

```bash
npm test -- --testPathPattern=transcription-service-types
```

### Integration Tests

Integration tests with mocked Amazon Transcribe will be added in future iterations.

## Deployment

The transcription service is deployed as an AWS Lambda function with:

- **Runtime:** Node.js 20.x
- **Architecture:** ARM64 (20% better price-performance)
- **Memory:** 1024 MB (for audio processing)
- **Timeout:** 300 seconds (5 minutes for long sessions)
- **X-Ray Tracing:** Enabled for observability

## Privacy & Security

- **No Audio Storage:** Audio is processed in RAM only and discarded after transcription
- **PII Redaction:** Downstream fraud detection uses Amazon Bedrock Guardrails for PII redaction
- **Secure Connections:** All communication uses TLS 1.2+
- **IAM Permissions:** Least privilege access to Amazon Transcribe

## Future Enhancements

- Property-based testing with fast-check
- Integration tests with LocalStack
- Performance benchmarking with real audio samples
- Support for additional languages (Hindi, French)
- Voice deepfake detection integration
- Enhanced error recovery mechanisms

## References

- [Amazon Transcribe Streaming API Documentation](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)
- [VocalShield Requirements Document](.kiro/specs/real-time-audio-transcription/requirements.md)
- [VocalShield Design Document](.kiro/specs/real-time-audio-transcription/design.md)
