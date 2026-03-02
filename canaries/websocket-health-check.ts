/**
 * CloudWatch Synthetics Canary: WebSocket Connection Test
 * 
 * This canary tests the WebSocket API connection flow every 15 minutes.
 * Validates connection establishment, message exchange, and disconnection.
 */

import { SyntheticsConfiguration } from 'Synthetics';
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');
const WebSocket = require('ws');

/**
 * Canary handler function
 */
export const handler = async () => {
  // Configure synthetics
  const syntheticsConfig = new SyntheticsConfiguration();
  syntheticsConfig.setConfig({
    continueOnStepFailure: false,
  });

  // WebSocket endpoint (from environment variable)
  const wsEndpoint = process.env.WS_ENDPOINT || '';
  
  if (!wsEndpoint) {
    throw new Error('WS_ENDPOINT environment variable not set');
  }

  log.info('Starting WebSocket connection test');
  log.info(`Target URL: ${wsEndpoint}`);

  // Execute WebSocket connection test
  const stepName = 'WebSocketConnectionTest';
  await synthetics.executeStep(stepName, async () => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      const ws = new WebSocket(wsEndpoint);
      let connected = false;

      ws.on('open', () => {
        log.info('WebSocket connected');
        connected = true;

        // Send test message
        const testMessage = JSON.stringify({
          action: 'ping',
          timestamp: new Date().toISOString(),
        });
        
        ws.send(testMessage);
        log.info('Test message sent');
      });

      ws.on('message', (data: Buffer) => {
        log.info('Received message from server');
        
        try {
          const message = JSON.parse(data.toString());
          log.info(`Message: ${JSON.stringify(message)}`);
          
          // Close connection after receiving response
          ws.close();
        } catch (error) {
          reject(new Error('Invalid message format'));
        }
      });

      ws.on('close', () => {
        log.info('WebSocket disconnected');
        clearTimeout(timeout);
        
        if (connected) {
          resolve({ success: true });
        } else {
          reject(new Error('Connection closed before establishing'));
        }
      });

      ws.on('error', (error: Error) => {
        log.error(`WebSocket error: ${error.message}`);
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  log.info('WebSocket connection test passed');
};
