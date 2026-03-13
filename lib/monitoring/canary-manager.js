"use strict";
/**
 * CanaryManager - Manages CloudWatch Synthetics Canaries
 *
 * This class provides methods to create, update, and delete CloudWatch Synthetics
 * canaries for automated endpoint health checks. It includes pre-configured canary
 * scripts for API Gateway health, authentication flow, and conversation analysis flow.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.5
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanaryManager = void 0;
const client_synthetics_1 = require("@aws-sdk/client-synthetics");
/**
 * CanaryManager class for managing CloudWatch Synthetics canaries
 */
class CanaryManager {
    constructor(region = 'us-east-1') {
        this.region = region;
        this.client = new client_synthetics_1.SyntheticsClient({ region });
    }
    /**
     * Create a new canary
     *
     * @param config - Canary configuration
     * @returns Promise<void>
     */
    async createCanary(config) {
        const input = {
            Name: config.name,
            Code: {
                Handler: config.handler,
                Script: config.script,
            },
            ArtifactS3Location: config.artifactS3Location,
            ExecutionRoleArn: this.getExecutionRoleArn(),
            Schedule: {
                Expression: config.schedule.expression,
                DurationInSeconds: config.schedule.durationInSeconds,
            },
            RunConfig: {
                TimeoutInSeconds: 60,
                MemoryInMB: 960,
                EnvironmentVariables: config.environmentVariables || {},
            },
            SuccessRetentionPeriodInDays: config.successRetentionPeriod,
            FailureRetentionPeriodInDays: config.failureRetentionPeriod,
            RuntimeVersion: config.runtime,
            VpcConfig: config.vpcConfig,
        };
        const command = new client_synthetics_1.CreateCanaryCommand(input);
        await this.client.send(command);
    }
    /**
     * Update an existing canary
     *
     * @param canaryName - Name of the canary to update
     * @param config - Updated canary configuration
     * @returns Promise<void>
     */
    async updateCanary(canaryName, config) {
        const input = {
            Name: canaryName,
        };
        if (config.script && config.handler) {
            input.Code = {
                Handler: config.handler,
                Script: config.script,
            };
        }
        if (config.schedule) {
            input.Schedule = {
                Expression: config.schedule.expression,
                DurationInSeconds: config.schedule.durationInSeconds,
            };
        }
        if (config.environmentVariables) {
            input.RunConfig = {
                EnvironmentVariables: config.environmentVariables,
            };
        }
        if (config.successRetentionPeriod) {
            input.SuccessRetentionPeriodInDays = config.successRetentionPeriod;
        }
        if (config.failureRetentionPeriod) {
            input.FailureRetentionPeriodInDays = config.failureRetentionPeriod;
        }
        if (config.vpcConfig) {
            input.VpcConfig = config.vpcConfig;
        }
        const command = new client_synthetics_1.UpdateCanaryCommand(input);
        await this.client.send(command);
    }
    /**
     * Delete a canary
     *
     * @param canaryName - Name of the canary to delete
     * @returns Promise<void>
     */
    async deleteCanary(canaryName) {
        const command = new client_synthetics_1.DeleteCanaryCommand({ Name: canaryName });
        await this.client.send(command);
    }
    /**
     * Start a canary
     *
     * @param canaryName - Name of the canary to start
     * @returns Promise<void>
     */
    async startCanary(canaryName) {
        const command = new client_synthetics_1.StartCanaryCommand({ Name: canaryName });
        await this.client.send(command);
    }
    /**
     * Stop a canary
     *
     * @param canaryName - Name of the canary to stop
     * @returns Promise<void>
     */
    async stopCanary(canaryName) {
        const command = new client_synthetics_1.StopCanaryCommand({ Name: canaryName });
        await this.client.send(command);
    }
    /**
     * Get the execution role ARN for canaries
     *
     * @returns Execution role ARN
     */
    getExecutionRoleArn() {
        // This should be configured via environment variable or CDK
        return process.env.CANARY_EXECUTION_ROLE_ARN || '';
    }
    /**
     * Generate API Gateway health check canary script
     *
     * Validates:
     * - Response status code is 200
     * - Response time is < 2000ms
     * - Response body is valid JSON with required fields
     *
     * Requirements: 11.1, 11.5
     *
     * @param apiUrl - API Gateway health endpoint URL
     * @param validation - Validation requirements
     * @returns Canary script content
     */
    static generateHealthCheckScript(apiUrl, validation) {
        return `
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');
const https = require('https');
const http = require('http');

const apiCanaryBlueprint = async function () {
  const url = '${apiUrl}';
  const expectedStatusCode = ${validation.expectedStatusCode};
  const maxResponseTime = ${validation.maxResponseTime};
  const requiredFields = ${JSON.stringify(validation.requiredFields || [])};

  log.info('Starting API Gateway health check');
  log.info('URL: ' + url);

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'CloudWatch-Synthetics',
      },
    };

    const req = protocol.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      log.info('Response status code: ' + res.statusCode);
      log.info('Response time: ' + responseTime + 'ms');

      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          // Validate status code
          if (res.statusCode !== expectedStatusCode) {
            reject(new Error(\`Expected status code \${expectedStatusCode}, got \${res.statusCode}\`));
            return;
          }

          // Validate response time
          if (responseTime > maxResponseTime) {
            reject(new Error(\`Response time \${responseTime}ms exceeds maximum \${maxResponseTime}ms\`));
            return;
          }

          // Validate response body structure
          const parsedBody = JSON.parse(body);
          log.info('Response body: ' + JSON.stringify(parsedBody));

          // Check required fields
          for (const field of requiredFields) {
            if (!(field in parsedBody)) {
              reject(new Error(\`Required field '\${field}' not found in response body\`));
              return;
            }
          }

          log.info('Health check passed');
          resolve({
            statusCode: res.statusCode,
            responseTime: responseTime,
            body: parsedBody,
          });
        } catch (error) {
          reject(new Error('Failed to parse response body as JSON: ' + error.message));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error('Request failed: ' + error.message));
    });

    req.setTimeout(maxResponseTime, () => {
      req.destroy();
      reject(new Error('Request timeout after ' + maxResponseTime + 'ms'));
    });

    req.end();
  });
};

exports.handler = async () => {
  return await synthetics.executeHttpStep('HealthCheck', apiCanaryBlueprint);
};
`;
    }
    /**
     * Generate authentication flow canary script
     *
     * Validates:
     * - Authentication endpoint returns 200
     * - Response time is < 2000ms
     * - Response contains valid authentication token
     *
     * Requirements: 11.2, 11.5
     *
     * @param authUrl - Authentication endpoint URL
     * @param testCredentials - Test credentials for authentication
     * @param validation - Validation requirements
     * @returns Canary script content
     */
    static generateAuthFlowScript(authUrl, testCredentials, validation) {
        return `
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');
const https = require('https');
const http = require('http');

const authCanaryBlueprint = async function () {
  const url = '${authUrl}';
  const apiKey = '${testCredentials.apiKey}';
  const expectedStatusCode = ${validation.expectedStatusCode};
  const maxResponseTime = ${validation.maxResponseTime};
  const requiredFields = ${JSON.stringify(validation.requiredFields || [])};

  log.info('Starting authentication flow test');
  log.info('URL: ' + url);

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CloudWatch-Synthetics',
        'x-api-key': apiKey,
      },
    };

    const req = protocol.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      log.info('Response status code: ' + res.statusCode);
      log.info('Response time: ' + responseTime + 'ms');

      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          // Validate status code
          if (res.statusCode !== expectedStatusCode) {
            reject(new Error(\`Expected status code \${expectedStatusCode}, got \${res.statusCode}\`));
            return;
          }

          // Validate response time
          if (responseTime > maxResponseTime) {
            reject(new Error(\`Response time \${responseTime}ms exceeds maximum \${maxResponseTime}ms\`));
            return;
          }

          // Validate response body structure
          const parsedBody = JSON.parse(body);
          log.info('Response body: ' + JSON.stringify(parsedBody));

          // Check required fields
          for (const field of requiredFields) {
            if (!(field in parsedBody)) {
              reject(new Error(\`Required field '\${field}' not found in response body\`));
              return;
            }
          }

          log.info('Authentication flow test passed');
          resolve({
            statusCode: res.statusCode,
            responseTime: responseTime,
            body: parsedBody,
          });
        } catch (error) {
          reject(new Error('Failed to parse response body as JSON: ' + error.message));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error('Request failed: ' + error.message));
    });

    req.setTimeout(maxResponseTime, () => {
      req.destroy();
      reject(new Error('Request timeout after ' + maxResponseTime + 'ms'));
    });

    req.end();
  });
};

exports.handler = async () => {
  return await synthetics.executeHttpStep('AuthenticationFlow', authCanaryBlueprint);
};
`;
    }
    /**
     * Generate conversation analysis flow canary script
     *
     * Validates:
     * - Conversation analysis endpoint returns 200
     * - Response time is < 2000ms
     * - Response contains analysis results with required fields
     *
     * Requirements: 11.3, 11.5
     *
     * @param analysisUrl - Conversation analysis endpoint URL
     * @param testData - Test conversation data
     * @param validation - Validation requirements
     * @returns Canary script content
     */
    static generateConversationAnalysisScript(analysisUrl, testData, validation) {
        return `
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');
const https = require('https');
const http = require('http');

const analysisCanaryBlueprint = async function () {
  const url = '${analysisUrl}';
  const apiKey = '${testData.apiKey}';
  const expectedStatusCode = ${validation.expectedStatusCode};
  const maxResponseTime = ${validation.maxResponseTime};
  const requiredFields = ${JSON.stringify(validation.requiredFields || [])};

  const testPayload = {
    transcript: '${testData.transcript}',
    sessionId: 'canary-test-' + Date.now(),
  };

  log.info('Starting conversation analysis flow test');
  log.info('URL: ' + url);

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(testPayload);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'CloudWatch-Synthetics',
        'x-api-key': apiKey,
      },
    };

    const req = protocol.request(options, (res) => {
      const responseTime = Date.now() - startTime;
      log.info('Response status code: ' + res.statusCode);
      log.info('Response time: ' + responseTime + 'ms');

      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          // Validate status code
          if (res.statusCode !== expectedStatusCode) {
            reject(new Error(\`Expected status code \${expectedStatusCode}, got \${res.statusCode}\`));
            return;
          }

          // Validate response time
          if (responseTime > maxResponseTime) {
            reject(new Error(\`Response time \${responseTime}ms exceeds maximum \${maxResponseTime}ms\`));
            return;
          }

          // Validate response body structure
          const parsedBody = JSON.parse(body);
          log.info('Response body: ' + JSON.stringify(parsedBody));

          // Check required fields
          for (const field of requiredFields) {
            if (!(field in parsedBody)) {
              reject(new Error(\`Required field '\${field}' not found in response body\`));
              return;
            }
          }

          log.info('Conversation analysis flow test passed');
          resolve({
            statusCode: res.statusCode,
            responseTime: responseTime,
            body: parsedBody,
          });
        } catch (error) {
          reject(new Error('Failed to parse response body as JSON: ' + error.message));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error('Request failed: ' + error.message));
    });

    req.setTimeout(maxResponseTime, () => {
      req.destroy();
      reject(new Error('Request timeout after ' + maxResponseTime + 'ms'));
    });

    req.write(postData);
    req.end();
  });
};

exports.handler = async () => {
  return await synthetics.executeHttpStep('ConversationAnalysisFlow', analysisCanaryBlueprint);
};
`;
    }
    /**
     * Create API Gateway health check canary
     *
     * Runs every 5 minutes to check API Gateway health endpoint
     *
     * Requirements: 11.1, 11.5
     *
     * @param apiUrl - API Gateway health endpoint URL
     * @param artifactS3Location - S3 location for canary artifacts
     * @returns Promise<void>
     */
    async createHealthCheckCanary(apiUrl, artifactS3Location) {
        const validation = {
            expectedStatusCode: 200,
            maxResponseTime: 2000,
            requiredFields: ['status', 'timestamp'],
        };
        const config = {
            name: 'vocalshield-api-health-check',
            schedule: {
                expression: 'rate(5 minutes)',
                durationInSeconds: 0, // Run indefinitely
            },
            script: CanaryManager.generateHealthCheckScript(apiUrl, validation),
            handler: 'index.handler',
            runtime: 'syn-nodejs-puppeteer-7.0',
            successRetentionPeriod: 7,
            failureRetentionPeriod: 30,
            artifactS3Location,
            environmentVariables: {
                API_URL: apiUrl,
            },
        };
        await this.createCanary(config);
    }
    /**
     * Create authentication flow canary
     *
     * Runs every 15 minutes to test authentication flow
     *
     * Requirements: 11.2, 11.5
     *
     * @param authUrl - Authentication endpoint URL
     * @param testApiKey - Test API key for authentication
     * @param artifactS3Location - S3 location for canary artifacts
     * @returns Promise<void>
     */
    async createAuthFlowCanary(authUrl, testApiKey, artifactS3Location) {
        const validation = {
            expectedStatusCode: 200,
            maxResponseTime: 2000,
            requiredFields: ['authenticated', 'userId'],
        };
        const config = {
            name: 'vocalshield-auth-flow-check',
            schedule: {
                expression: 'rate(15 minutes)',
                durationInSeconds: 0,
            },
            script: CanaryManager.generateAuthFlowScript(authUrl, { apiKey: testApiKey }, validation),
            handler: 'index.handler',
            runtime: 'syn-nodejs-puppeteer-7.0',
            successRetentionPeriod: 7,
            failureRetentionPeriod: 30,
            artifactS3Location,
            environmentVariables: {
                AUTH_URL: authUrl,
                TEST_API_KEY: testApiKey,
            },
        };
        await this.createCanary(config);
    }
    /**
     * Create conversation analysis flow canary
     *
     * Runs every 15 minutes to test conversation analysis flow
     *
     * Requirements: 11.3, 11.5
     *
     * @param analysisUrl - Conversation analysis endpoint URL
     * @param testApiKey - Test API key for authentication
     * @param artifactS3Location - S3 location for canary artifacts
     * @returns Promise<void>
     */
    async createConversationAnalysisCanary(analysisUrl, testApiKey, artifactS3Location) {
        const validation = {
            expectedStatusCode: 200,
            maxResponseTime: 2000,
            requiredFields: ['threatLevel', 'analysis', 'timestamp'],
        };
        const testData = {
            transcript: 'Hello, this is a test conversation for canary monitoring.',
            apiKey: testApiKey,
        };
        const config = {
            name: 'vocalshield-conversation-analysis-check',
            schedule: {
                expression: 'rate(15 minutes)',
                durationInSeconds: 0,
            },
            script: CanaryManager.generateConversationAnalysisScript(analysisUrl, testData, validation),
            handler: 'index.handler',
            runtime: 'syn-nodejs-puppeteer-7.0',
            successRetentionPeriod: 7,
            failureRetentionPeriod: 30,
            artifactS3Location,
            environmentVariables: {
                ANALYSIS_URL: analysisUrl,
                TEST_API_KEY: testApiKey,
            },
        };
        await this.createCanary(config);
    }
}
exports.CanaryManager = CanaryManager;
//# sourceMappingURL=canary-manager.js.map