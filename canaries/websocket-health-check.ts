/**
 * CloudWatch Synthetics Canary for WebSocket Health Check
 * 
 * This canary:
 * 1. Connects to the WebSocket API
 * 2. Sends a test audio message
 * 3. Verifies response is received
 * 4. Disconnects cleanly
 * 
 * Runs every 5 minutes to monitor API availability
 */

import { WebSocket } from 'ws';

export const handler = async () => {
  const websocketUrl = process.env.WEBSOCKET_URL;
  
  if (!websocketUrl) {
    throw new Error('WEBSOCKET_URL environment variable not set');
  }

  console.log(`Connecting to WebSocket: ${websocketUrl}`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(websocketUrl);
    let responseReceived = false;
    const timeout = setTimeout(() => {
      if (!responseReceived) {
        ws.close();
        reject(new Error('Timeout: No response received within 10 seconds'));
      }
    }, 10000);

    ws.on('open', () => {
      console.log('WebSocket connection established');
      
      // Send test audio message
      const testMessage = {
        action: 'audio',
        data: Buffer.from('test-audio-data').toString('base64'),
        sessionId: `canary-${Date.now()}`,
      };
      
      ws.send(JSON.stringify(testMessage));
      console.log('Test message sent');
    });

    ws.on('message', (data: any) => {
      console.log('Response received:', data.toString());
      responseReceived = true;
      clearTimeout(timeout);
      ws.close();
      resolve({ success: true, message: 'WebSocket health check passed' });
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      clearTimeout(timeout);
      reject(error);
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
      if (!responseReceived) {
        clearTimeout(timeout);
        reject(new Error('Connection closed without receiving response'));
      }
    });
  });
};
