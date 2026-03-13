import * as fc from 'fast-check';
import { formatErrorMessage } from '../../lambda/audio-processor/index';

/**
 * Feature: competition-mvp-backend, Property 26: Error Response Sanitization
 * 
 * For any unhandled exception in Lambda functions, the error response returned to the mobile
 * client should be a generic message without exposing internal details (stack traces,
 * environment variables, AWS resource names).
 * 
 * This test validates that:
 * 1. Stack traces are never included in error messages
 * 2. AWS resource names (ARNs, endpoints) are removed
 * 3. AWS account IDs are removed
 * 4. Internal service names are replaced with user-friendly terms
 * 5. Messages are truncated to 200 characters
 * 6. All error codes produce valid, sanitized messages
 * 
 * Validates: Requirements 8.5
 */
describe('Property 26: Error Response Sanitization', () => {
  // Generator for AWS ARNs with sensitive information
  const awsArnGen = fc.oneof(
    // Lambda ARNs
    fc.tuple(
      fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
      fc.integer({ min: 100000000000, max: 999999999999 }),
      fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'), { minLength: 5, maxLength: 20 })
    ).map(([region, accountId, funcName]) => 
      `arn:aws:lambda:${region}:${accountId}:function:${funcName}`
    ),
    // DynamoDB ARNs
    fc.tuple(
      fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
      fc.integer({ min: 100000000000, max: 999999999999 }),
      fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'), { minLength: 5, maxLength: 20 })
    ).map(([region, accountId, tableName]) => 
      `arn:aws:dynamodb:${region}:${accountId}:table/${tableName}`
    ),
    // S3 ARNs
    fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'), { minLength: 5, maxLength: 20 })
      .map(bucketName => `arn:aws:s3:::${bucketName}`)
  );

  // Generator for API Gateway endpoints
  const apiGatewayEndpointGen = fc.tuple(
    fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', '0', '1', '2', '3'), { minLength: 10, maxLength: 10 }),
    fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
    fc.constantFrom('prod', 'dev', 'staging')
  ).map(([apiId, region, stage]) => 
    `https://${apiId}.execute-api.${region}.amazonaws.com/${stage}`
  );

  // Generator for AWS account IDs
  const accountIdGen = fc.integer({ min: 100000000000, max: 999999999999 });

  // Generator for AWS service names
  const awsServiceGen = fc.constantFrom('Lambda', 'DynamoDB', 'Transcribe', 'Bedrock', 'API Gateway');

  // Generator for error codes
  const errorCodeGen = fc.constantFrom(
    'VALIDATION_ERROR' as const,
    'SERVICE_ERROR' as const,
    'TRANSCRIPTION_ERROR' as const,
    'ANALYSIS_ERROR' as const,
    'INTERNAL_ERROR' as const
  );

  test('removes stack traces from error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorMessage: fc.string({ minLength: 10, maxLength: 100 }),
          errorCode: errorCodeGen,
          requestId: fc.option(fc.uuid()),
        }),
        async ({ errorMessage, errorCode, requestId }) => {
          // Create error with stack trace
          const error = new Error(errorMessage);
          
          // Format error message
          const result = formatErrorMessage(error, errorCode, requestId ?? undefined);

          // Property: Stack trace should never be in the response
          expect(result.message).not.toContain('at ');
          expect(result.message).not.toContain('Error:');
          expect(result.message).not.toContain('.ts:');
          expect(result.message).not.toContain('.js:');
          expect(result.message).not.toContain('node_modules');
          
          // Verify error object doesn't have stack property
          expect(result).not.toHaveProperty('stack');
        }
      ),
      { numRuns: 20 }
    );
  });

  test('removes Lambda function ARNs from error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          arn: awsArnGen,
          prefix: fc.constantFrom('Failed to invoke ', 'Error in ', 'Timeout from '),
          suffix: fc.constantFrom(' failed', ' error', ' timeout'),
          errorCode: errorCodeGen,
        }),
        async ({ arn, prefix, suffix, errorCode }) => {
          const errorMessage = `${prefix}${arn}${suffix}`;
          const error = new Error(errorMessage);

          // Format error message
          const result = formatErrorMessage(error, errorCode);

          // Property: ARN should be replaced with generic placeholder
          expect(result.message).not.toContain('arn:aws');
          expect(result.message).not.toContain(':function:');
          expect(result.message).not.toContain(':table/');
          expect(result.message).not.toContain('arn:aws:s3:::');
          
          // Should contain generic placeholder (note: service names are also replaced)
          // So we might see [service Function], [database Table], or [S3 Bucket]
          expect(result.message).toMatch(/\[(service Function|Lambda Function|database Table|DynamoDB Table|S3 Bucket)\]/);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('removes API Gateway endpoints from error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          endpoint: apiGatewayEndpointGen,
          prefix: fc.constantFrom('Failed to connect to ', 'Error calling ', 'Timeout from '),
          errorCode: errorCodeGen,
        }),
        async ({ endpoint, prefix, errorCode }) => {
          const errorMessage = `${prefix}${endpoint}`;
          const error = new Error(errorMessage);

          // Format error message
          const result = formatErrorMessage(error, errorCode);

          // Property: API Gateway endpoint should be replaced
          expect(result.message).not.toContain('.execute-api.');
          expect(result.message).not.toContain('.amazonaws.com');
          expect(result.message).toContain('[API Endpoint]');
        }
      ),
      { numRuns: 20 }
    );
  });

  test('removes AWS account IDs from error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          accountId: accountIdGen,
          prefix: fc.constantFrom('Account ', 'User ', 'Resource in account '),
          suffix: fc.constantFrom(' has insufficient permissions', ' not found', ' error'),
          errorCode: errorCodeGen,
        }),
        async ({ accountId, prefix, suffix, errorCode }) => {
          const errorMessage = `${prefix}${accountId}${suffix}`;
          const error = new Error(errorMessage);

          // Format error message
          const result = formatErrorMessage(error, errorCode);

          // Property: Account ID should be replaced
          expect(result.message).not.toMatch(/\d{12}/);
          expect(result.message).toContain('[Account ID]');
        }
      ),
      { numRuns: 20 }
    );
  });

  test('replaces AWS service names with user-friendly terms', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          serviceName: awsServiceGen,
          action: fc.constantFrom('invocation', 'call', 'request', 'operation'),
          result: fc.constantFrom('failed', 'timeout', 'error', 'unavailable'),
          errorCode: errorCodeGen,
        }),
        async ({ serviceName, action, result, errorCode }) => {
          const errorMessage = `${serviceName} ${action} ${result}`;
          const error = new Error(errorMessage);

          // Format error message
          const result_msg = formatErrorMessage(error, errorCode);

          // Property: AWS service names should be replaced with user-friendly terms
          expect(result_msg.message).not.toContain('Lambda');
          expect(result_msg.message).not.toContain('DynamoDB');
          expect(result_msg.message).not.toContain('Transcribe');
          expect(result_msg.message).not.toContain('Bedrock');
          expect(result_msg.message).not.toContain('API Gateway');
          
          // Should contain user-friendly terms
          const userFriendlyTerms = ['service', 'database', 'transcription service', 'analysis service', 'connection service'];
          const containsUserFriendlyTerm = userFriendlyTerms.some(term => 
            result_msg.message.toLowerCase().includes(term)
          );
          expect(containsUserFriendlyTerm).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('truncates messages to 200 characters maximum', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          longMessage: fc.string({ minLength: 201, maxLength: 500 }),
          errorCode: errorCodeGen,
        }),
        async ({ longMessage, errorCode }) => {
          const error = new Error(longMessage);

          // Format error message
          const result = formatErrorMessage(error, errorCode);

          // Property: Message should be truncated to 200 characters
          expect(result.message.length).toBeLessThanOrEqual(200);
          
          // If original was longer, should end with ellipsis
          if (longMessage.length > 200) {
            expect(result.message).toMatch(/\.\.\.$/);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('removes region names from error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          region: fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
          prefix: fc.constantFrom('Resource in ', 'Failed in region ', 'Error from '),
          suffix: fc.constantFrom(' failed', ' unavailable', ' timeout'),
          errorCode: errorCodeGen,
        }),
        async ({ region, prefix, suffix, errorCode }) => {
          const errorMessage = `${prefix}${region}${suffix}`;
          const error = new Error(errorMessage);

          // Format error message
          const result = formatErrorMessage(error, errorCode);

          // Property: Region names should be replaced
          expect(result.message).not.toContain('us-east-1');
          expect(result.message).not.toContain('us-west-2');
          expect(result.message).not.toContain('eu-west-1');
          expect(result.message).toContain('[Region]');
        }
      ),
      { numRuns: 20 }
    );
  });

  test('produces valid error message structure for all error codes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorMessage: fc.string({ minLength: 10, maxLength: 200 }),
          errorCode: errorCodeGen,
          requestId: fc.option(fc.uuid()),
        }),
        async ({ errorMessage, errorCode, requestId }) => {
          const error = new Error(errorMessage);

          // Format error message
          const result = formatErrorMessage(error, errorCode, requestId ?? undefined);

          // Property: Result must have valid structure
          expect(result).toHaveProperty('type');
          expect(result.type).toBe('error');
          
          expect(result).toHaveProperty('code');
          expect(result.code).toBe(errorCode);
          
          expect(result).toHaveProperty('message');
          expect(typeof result.message).toBe('string');
          expect(result.message.length).toBeGreaterThan(0);
          expect(result.message.length).toBeLessThanOrEqual(200);
          
          expect(result).toHaveProperty('timestamp');
          expect(typeof result.timestamp).toBe('number');
          expect(result.timestamp).toBeGreaterThan(0);
          
          if (requestId) {
            expect(result).toHaveProperty('requestId');
            expect(result.requestId).toBe(requestId);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('handles errors with multiple sensitive patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          arn: awsArnGen,
          endpoint: apiGatewayEndpointGen,
          accountId: accountIdGen,
          serviceName: awsServiceGen,
          errorCode: errorCodeGen,
        }),
        async ({ arn, endpoint, accountId, serviceName, errorCode }) => {
          // Create error with multiple sensitive patterns
          const errorMessage = `${serviceName} failed: ${arn} could not connect to ${endpoint} for account ${accountId}`;
          const error = new Error(errorMessage);

          // Format error message
          const result = formatErrorMessage(error, errorCode);

          // Property: All sensitive information should be sanitized
          expect(result.message).not.toContain('arn:aws');
          expect(result.message).not.toContain('.execute-api.');
          expect(result.message).not.toMatch(/\d{12}/);
          expect(result.message).not.toContain('Lambda');
          expect(result.message).not.toContain('DynamoDB');
          expect(result.message).not.toContain('Transcribe');
          expect(result.message).not.toContain('Bedrock');
          
          // Should contain generic placeholders
          expect(result.message).toMatch(/\[.*\]/);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('handles string errors without Error objects', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorMessage: fc.string({ minLength: 10, maxLength: 200 }),
          arn: awsArnGen,
          errorCode: errorCodeGen,
        }),
        async ({ errorMessage, arn, errorCode }) => {
          // Pass string error with sensitive information
          const stringError = `${errorMessage} ${arn}`;

          // Format error message
          const result = formatErrorMessage(stringError, errorCode);

          // Property: String errors should also be sanitized
          expect(result.message).not.toContain('arn:aws');
          expect(result.type).toBe('error');
          expect(result.code).toBe(errorCode);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('handles errors with empty or undefined messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorCode: errorCodeGen,
          requestId: fc.option(fc.uuid()),
        }),
        async ({ errorCode, requestId }) => {
          // Create error with no message
          const error = new Error();

          // Format error message
          const result = formatErrorMessage(error, errorCode, requestId ?? undefined);

          // Property: Should provide default message
          expect(result.message).toBeDefined();
          expect(result.message.length).toBeGreaterThan(0);
          expect(result.message).toBe('An error occurred');
          expect(result.type).toBe('error');
          expect(result.code).toBe(errorCode);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('preserves user-friendly error information while sanitizing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userMessage: fc.constantFrom(
            'Invalid audio format: expected PCM 16kHz 16-bit mono',
            'Connection timeout after 30 seconds',
            'Rate limit exceeded, please try again later'
          ),
          arn: awsArnGen,
          errorCode: errorCodeGen,
        }),
        async ({ userMessage, arn, errorCode }) => {
          // Create error with user-friendly message and sensitive data
          const errorMessage = `${userMessage} (resource: ${arn})`;
          const error = new Error(errorMessage);

          // Format error message
          const result = formatErrorMessage(error, errorCode);

          // Property: User-friendly information should be preserved
          // while sensitive data is removed
          expect(result.message).toContain(userMessage.split('(')[0].trim());
          expect(result.message).not.toContain('arn:aws');
        }
      ),
      { numRuns: 20 }
    );
  });

  test('sanitization is idempotent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorMessage: fc.string({ minLength: 10, maxLength: 100 }),
          arn: awsArnGen,
          errorCode: errorCodeGen,
        }),
        async ({ errorMessage, arn, errorCode }) => {
          const fullMessage = `${errorMessage} ${arn}`;
          const error = new Error(fullMessage);

          // Format error message twice
          const result1 = formatErrorMessage(error, errorCode);
          const error2 = new Error(result1.message);
          const result2 = formatErrorMessage(error2, errorCode);

          // Property: Sanitizing an already sanitized message should produce same result
          // (modulo timestamp which will be different)
          expect(result2.message).toBe(result1.message);
          expect(result2.code).toBe(result1.code);
          expect(result2.type).toBe(result1.type);
        }
      ),
      { numRuns: 20 }
    );
  });
});
