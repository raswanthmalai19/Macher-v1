import { ApiGatewayManagementApiClient, PostToConnectionCommand, GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import { captureAWSv3Client } from 'aws-xray-sdk-core';

/**
 * Structured log entry interface
 */
interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  component: string;
  message: string;
  callSessionId?: string;
  connectionId?: string;
  duration?: number;
  messageSize?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Write structured JSON log to CloudWatch
 */
function log(entry: Omit<LogEntry, 'timestamp' | 'component'>): void {
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    component: 'WebSocketClient',
    ...entry,
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * WebSocket client for sending messages to mobile clients via API Gateway Management API
 * 
 * Requirements 5.1, 5.3, 10.4: Send formatted fraud alert to mobile client via WebSocket,
 * handle disconnected clients gracefully, log message delivery with latency metrics
 */
export class WebSocketClient {
  private apiClient: ApiGatewayManagementApiClient;

  /**
   * Initialize WebSocket client
   * 
   * @param websocketEndpoint - API Gateway WebSocket endpoint URL
   * @param _connectionTableName - DynamoDB Connection Store table name (reserved for future use)
   */
  constructor(websocketEndpoint: string, _connectionTableName: string) {
    // Initialize API Gateway Management API client with X-Ray tracing
    // Requirements 5.1: Initialize API Gateway Management API client
    this.apiClient = captureAWSv3Client(
      new ApiGatewayManagementApiClient({
        endpoint: websocketEndpoint,
      })
    );

    // Note: _connectionTableName parameter is reserved for future use if we need to implement
    // DynamoDB-based connection lookups. Currently, we use the connectionId from
    // the call session state which is more efficient.

    log({
      level: 'INFO',
      message: 'WebSocket client initialized',
    });
  }

  /**
   * Send message to mobile client via WebSocket
   * 
   * Requirements 5.1: Send formatted fraud alert to mobile client via postToConnection
   * Requirements 5.3: Handle disconnected clients gracefully (log and discard results)
   * Requirements 10.4: Log message delivery with latency metrics
   * 
   * @param connectionId - WebSocket connection ID
   * @param message - Message to send (will be JSON stringified)
   * @param callSessionId - Call session identifier (for logging)
   * @returns True if message sent successfully, false if client disconnected or error occurred
   */
  async sendMessage(
    connectionId: string,
    message: any,
    callSessionId: string
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      // Requirements 5.1: Send formatted fraud alert to mobile client via postToConnection
      const messageData = JSON.stringify(message);
      const messageSize = Buffer.byteLength(messageData, 'utf8');

      log({
        level: 'INFO',
        message: 'Sending message to mobile client',
        callSessionId,
        connectionId,
        messageSize,
      });

      // Send message via API Gateway Management API
      await this.apiClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(messageData, 'utf8'),
        })
      );

      // Requirements 10.4: Log message delivery with latency metrics
      const duration = Date.now() - startTime;

      log({
        level: 'INFO',
        message: 'Message sent successfully',
        callSessionId,
        connectionId,
        duration,
        messageSize,
      });

      return true;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Requirements 5.3: Handle disconnected clients gracefully (log and discard results)
      if (error instanceof GoneException) {
        // Client has disconnected - this is expected and not an error
        log({
          level: 'WARN',
          message: 'Client disconnected, discarding message',
          callSessionId,
          connectionId,
          duration,
        });

        return false;
      }

      // Other errors - log as error but don't throw
      log({
        level: 'ERROR',
        message: 'Failed to send message to client',
        callSessionId,
        connectionId,
        duration,
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      });

      return false;
    }
  }

  /**
   * Send fraud alert message to mobile client
   * 
   * Convenience method that combines connection lookup and message sending
   * 
   * Requirements 5.1, 5.3, 5.4, 10.4: Complete WebSocket message delivery pipeline
   * 
   * @param connectionId - WebSocket connection ID (from call session state)
   * @param fraudAlert - Formatted fraud alert message
   * @param callSessionId - Call session identifier
   * @returns True if message sent successfully, false otherwise
   */
  async sendFraudAlert(
    connectionId: string,
    fraudAlert: any,
    callSessionId: string
  ): Promise<boolean> {
    log({
      level: 'INFO',
      message: 'Sending fraud alert to mobile client',
      callSessionId,
      connectionId,
    });

    // Requirements 5.4: Send results only to the Connection_ID associated with the Call_Session
    // The connectionId is already validated from the call session state
    
    // Requirements 5.1, 5.3, 10.4: Send message via WebSocket with error handling and metrics
    return await this.sendMessage(connectionId, fraudAlert, callSessionId);
  }

  /**
   * Send error message to mobile client
   * 
   * Requirements 8.5: Send error messages to mobile client via WebSocket
   * 
   * This method sends sanitized error messages to the mobile client when
   * validation errors, service failures, or other issues occur.
   * 
   * @param connectionId - WebSocket connection ID
   * @param errorMessage - Formatted and sanitized error message
   * @param callSessionId - Call session identifier (for logging)
   * @returns True if message sent successfully, false otherwise
   */
  async sendErrorMessage(
    connectionId: string,
    errorMessage: any,
    callSessionId: string
  ): Promise<boolean> {
    log({
      level: 'INFO',
      message: 'Sending error message to mobile client',
      callSessionId,
      connectionId,
    });

    // Requirements 8.5: Send sanitized error message via WebSocket
    // The error message has already been sanitized by formatErrorMessage()
    // to remove stack traces, AWS resource names, and internal details
    
    return await this.sendMessage(connectionId, errorMessage, callSessionId);
  }
}
