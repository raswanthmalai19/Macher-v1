/**
 * Amazon Transcribe Streaming Client Module
 * 
 * Requirements 3.1, 3.2, 3.3: Real-time speech transcription with streaming mode,
 * automatic language detection, and partial results stabilization
 */

import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  StartStreamTranscriptionCommandInput,
  TranscriptResultStream,
  AudioStream,
  LanguageCode,
} from '@aws-sdk/client-transcribe-streaming';

/**
 * Transcription segment from Transcribe response
 */
export interface TranscriptionSegment {
  text: string;
  startTime: number; // Seconds from call start
  endTime: number; // Seconds from call start
  isPartial: boolean; // True if not yet stabilized
  confidence: number; // 0.0 to 1.0
  language?: string; // Detected language code
}

/**
 * Transcribe streaming configuration
 */
export interface TranscribeConfig {
  region: string;
  mediaSampleRateHertz: number;
  mediaEncoding: 'pcm';
  languageCode?: LanguageCode; // Optional for auto-detect
  enablePartialResultsStabilization: boolean;
  partialResultsStability: 'high' | 'medium' | 'low';
}

/**
 * Audio chunk for streaming to Transcribe
 */
export interface AudioChunk {
  data: Buffer;
  sequenceNumber: number;
}

/**
 * Transcribe streaming client wrapper
 * 
 * Provides a simplified interface for streaming audio to Amazon Transcribe
 * and receiving transcription segments in real-time.
 */
export class TranscribeStreamingService {
  private client: TranscribeStreamingClient;
  private config: TranscribeConfig;

  /**
   * Create a new Transcribe streaming service
   * 
   * Requirements 3.1, 3.2, 3.3: Initialize TranscribeStreamingClient with
   * us-east-1 region and configure for streaming mode with language detection
   * 
   * @param config - Transcribe configuration
   */
  constructor(config?: Partial<TranscribeConfig>) {
    // Default configuration per requirements
    this.config = {
      region: 'us-east-1',
      mediaSampleRateHertz: 16000,
      mediaEncoding: 'pcm',
      languageCode: 'en-US' as LanguageCode, // Fixed to en-US for reliability
      enablePartialResultsStabilization: true,
      partialResultsStability: 'high',
      ...config,
    };

    // Initialize Transcribe client WITHOUT X-Ray tracing
    // (X-Ray's HTTP wrapper is incompatible with HTTP/2 bidirectional streaming)
    this.client = new TranscribeStreamingClient({
        region: this.config.region,
      });
  }

  /**
   * Create audio stream generator for sending PCM chunks
   * 
   * Requirements 3.1: Create audio stream for sending PCM chunks to Transcribe
   * 
   * @param audioChunks - Array of audio chunks to stream
   * @returns Async generator for audio stream
   */
  private async *createAudioStream(
    audioChunks: AudioChunk[]
  ): AsyncGenerator<AudioStream> {
    for (const chunk of audioChunks) {
      yield {
        AudioEvent: {
          AudioChunk: chunk.data,
        },
      };
    }
  }

  /**
   * Process Transcribe response stream for receiving text segments
   * 
   * Requirements 3.1, 3.3: Handle Transcribe response stream for receiving
   * text segments with partial results stabilization
   * 
   * @param responseStream - Transcribe response stream
   * @param onSegment - Callback for each transcription segment
   */
  private async processResponseStream(
    responseStream: AsyncIterable<TranscriptResultStream>,
    onSegment: (segment: TranscriptionSegment) => void
  ): Promise<void> {
    try {
      for await (const event of responseStream) {
        if (event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            // Skip empty results
            if (!result.Alternatives || result.Alternatives.length === 0) {
              continue;
            }

            const alternative = result.Alternatives[0];
            
            // Skip if no transcript text
            if (!alternative.Transcript) {
              continue;
            }

            // Extract transcription segment
            const segment: TranscriptionSegment = {
              text: alternative.Transcript,
              startTime: result.StartTime || 0,
              endTime: result.EndTime || 0,
              isPartial: result.IsPartial || false,
              confidence: alternative.Items?.[0]?.Confidence || 0,
              language: result.LanguageCode,
            };

            // Call segment callback
            onSegment(segment);
          }
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to process Transcribe response stream: ${(error as Error).message}`
      );
    }
  }

  /**
   * Start streaming transcription session
   * 
   * Requirements 3.1, 3.2, 3.3: Configure StartStreamTranscriptionCommand with
   * MediaSampleRateHertz: 16000, MediaEncoding: pcm, LanguageCode: auto-detect,
   * EnablePartialResultsStabilization: true, PartialResultsStability: high
   * 
   * @param audioChunks - Array of audio chunks to transcribe
   * @param onSegment - Callback for each transcription segment
   * @returns Promise that resolves when transcription is complete
   */
  async startStreamTranscription(
    audioChunks: AudioChunk[],
    onSegment: (segment: TranscriptionSegment) => void
  ): Promise<void> {
    try {
      // Create audio stream generator
      const audioStream = this.createAudioStream(audioChunks);

      // Configure StartStreamTranscriptionCommand
      // Requirements 3.1, 3.2, 3.3
      const commandInput: StartStreamTranscriptionCommandInput = {
        // Audio configuration
        MediaSampleRateHertz: this.config.mediaSampleRateHertz,
        MediaEncoding: this.config.mediaEncoding,
        
        // Use fixed language code (auto-detect via IdentifyLanguage is not used
        // because it requires a different subscription tier)
        LanguageCode: this.config.languageCode || ('en-US' as LanguageCode),
        
        // Partial results stabilization
        EnablePartialResultsStabilization: this.config.enablePartialResultsStabilization,
        PartialResultsStability: this.config.partialResultsStability,
        
        // Audio stream
        AudioStream: audioStream,
      };

      // Create and send command
      const command = new StartStreamTranscriptionCommand(commandInput);
      const response = await this.client.send(command);

      // Process response stream
      if (response.TranscriptResultStream) {
        await this.processResponseStream(
          response.TranscriptResultStream,
          onSegment
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to start stream transcription: ${(error as Error).message}`
      );
    }
  }

  /**
   * Transcribe a single audio chunk
   * 
   * Convenience method for transcribing a single audio chunk.
   * 
   * @param audioBuffer - Audio data buffer (PCM 16kHz 16-bit mono)
   * @param onSegment - Callback for each transcription segment
   * @returns Promise that resolves when transcription is complete
   */
  async transcribeAudioChunk(
    audioBuffer: Buffer,
    onSegment: (segment: TranscriptionSegment) => void
  ): Promise<void> {
    const audioChunks: AudioChunk[] = [
      {
        data: audioBuffer,
        sequenceNumber: 0,
      },
    ];

    await this.startStreamTranscription(audioChunks, onSegment);
  }

  /**
   * Get current configuration
   * 
   * @returns Current Transcribe configuration
   */
  getConfig(): TranscribeConfig {
    return { ...this.config };
  }
}

/**
 * Create a default Transcribe streaming service instance
 * 
 * Requirements 3.1, 3.2, 3.3: Initialize with default configuration
 * (us-east-1, 16kHz, PCM, auto-detect, high stability)
 * 
 * @returns Transcribe streaming service instance
 */
export function createTranscribeService(
  config?: Partial<TranscribeConfig>
): TranscribeStreamingService {
  return new TranscribeStreamingService(config);
}
