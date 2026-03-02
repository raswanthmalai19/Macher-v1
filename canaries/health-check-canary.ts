/**
 * CloudWatch Synthetics Canary: API Gateway Health Check
 * 
 * This canary checks the API Gateway health endpoint every 5 minutes.
 * Validates response status, response time, and response body structure.
 */

import { SyntheticsConfiguration } from 'Synthetics';
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');
const https = require('https');

/**
 * Canary handler function
 */
export const handler = async () => {
  // Configure synthetics
  const syntheticsConfig = new SyntheticsConfiguration();
  syntheticsConfig.setConfig({
    includeRequestHeaders: true,
    includeResponseHeaders: true,
    restrictedHeaders: ['Authorization'],
    includeRequestBody: false,
    includeResponseBody: true,
  });

  // API Gateway endpoint (from environment variable)
  const apiEndpoint = process.env.API_ENDPOINT || '';
  
  if (!apiEndpoint) {
    throw new Error('API_ENDPOINT environment variable not set');
  }

  const healthUrl = `${apiEndpoint}/health`;

  log.info('Starting health check canary');
  log.info(`Target URL: ${healthUrl}`);

  // Execute health check request
  const stepName = 'HealthCheckRequest';
  await synthetics.executeHttpStep(stepName, async () => {
    const startTime = Date.now();

    const response = await makeHttpsRequest(healthUrl);
    
    const duration = Date.now() - startTime;
    log.info(`Request completed in ${duration}ms`);

    // Validate response status
    if (response.statusCode !== 200) {
      throw new Error(`Expected status 200, got ${response.statusCode}`);
    }

    // Validate response time (should be < 2000ms)
    if (duration > 2000) {
      throw new Error(`Response time ${duration}ms exceeds threshold of 2000ms`);
    }

    // Validate response body structure
    let body;
    try {
      body = JSON.parse(response.body);
    } catch (error) {
      throw new Error('Response body is not valid JSON');
    }

    // Validate required fields
    if (!body.status) {
      throw new Error('Response missing required field: status');
    }

    if (body.status !== 'healthy') {
      throw new Error(`Expected status 'healthy', got '${body.status}'`);
    }

    log.info('Health check passed');
    
    return response;
  });
};

/**
 * Make HTTPS request
 */
function makeHttpsRequest(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res: any) => {
      let body = '';
      
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body,
        });
      });
    });

    req.on('error', (error: Error) => {
      reject(error);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}
