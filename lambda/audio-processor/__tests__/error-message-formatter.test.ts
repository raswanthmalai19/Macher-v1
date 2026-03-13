import { formatErrorMessage } from '../index';

describe('formatErrorMessage', () => {
  describe('Error message sanitization', () => {
    it('should remove stack traces from error messages', () => {
      const error = new Error('Test error with stack trace');
      const result = formatErrorMessage(error, 'INTERNAL_ERROR', 'req-123');

      expect(result.type).toBe('error');
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.message).toBe('Test error with stack trace');
      expect(result.timestamp).toBeDefined();
      expect(result.requestId).toBe('req-123');
    });

    it('should remove Lambda function ARNs from error messages', () => {
      const error = new Error('Lambda function arn:aws:lambda:us-east-1:123456789012:function:my-function failed');
      const result = formatErrorMessage(error, 'SERVICE_ERROR');

      expect(result.message).toBe('service function [service Function] failed');
      expect(result.message).not.toContain('arn:aws:lambda');
      expect(result.message).not.toContain('123456789012');
    });

    it('should remove DynamoDB table ARNs from error messages', () => {
      const error = new Error('DynamoDB table arn:aws:dynamodb:us-east-1:123456789012:table/my-table not found');
      const result = formatErrorMessage(error, 'SERVICE_ERROR');

      expect(result.message).toBe('database table [database Table] not found');
      expect(result.message).not.toContain('arn:aws:dynamodb');
      expect(result.message).not.toContain('my-table');
    });

    it('should remove S3 bucket ARNs from error messages', () => {
      const error = new Error('S3 bucket arn:aws:s3:::my-bucket access denied');
      const result = formatErrorMessage(error, 'SERVICE_ERROR');

      expect(result.message).toBe('S3 bucket [S3 Bucket] access denied');
      expect(result.message).not.toContain('arn:aws:s3');
      expect(result.message).not.toContain('my-bucket');
    });

    it('should remove API Gateway endpoints from error messages', () => {
      const error = new Error('Failed to connect to https://abc123.execute-api.us-east-1.amazonaws.com/prod');
      const result = formatErrorMessage(error, 'SERVICE_ERROR');

      expect(result.message).toBe('Failed to connect to [API Endpoint]');
      expect(result.message).not.toContain('execute-api');
      expect(result.message).not.toContain('amazonaws.com');
    });

    it('should remove AWS account IDs from error messages', () => {
      const error = new Error('Account 123456789012 has insufficient permissions');
      const result = formatErrorMessage(error, 'SERVICE_ERROR');

      expect(result.message).toBe('Account [Account ID] has insufficient permissions');
      expect(result.message).not.toContain('123456789012');
    });

    it('should replace AWS service names with user-friendly terms', () => {
      const error = new Error('Lambda invocation failed, DynamoDB timeout, Transcribe error, Bedrock unavailable');
      const result = formatErrorMessage(error, 'SERVICE_ERROR');

      expect(result.message).toContain('service invocation failed');
      expect(result.message).toContain('database timeout');
      expect(result.message).toContain('transcription service error');
      expect(result.message).toContain('analysis service unavailable');
      expect(result.message).not.toContain('Lambda');
      expect(result.message).not.toContain('DynamoDB');
      expect(result.message).not.toContain('Transcribe');
      expect(result.message).not.toContain('Bedrock');
    });

    it('should truncate long error messages to 200 characters', () => {
      const longMessage = 'A'.repeat(250);
      const error = new Error(longMessage);
      const result = formatErrorMessage(error, 'INTERNAL_ERROR');

      expect(result.message.length).toBe(200);
      expect(result.message.endsWith('...')).toBe(true);
    });

    it('should handle string errors', () => {
      const result = formatErrorMessage('Simple error message', 'VALIDATION_ERROR', 'req-456');

      expect(result.type).toBe('error');
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.message).toBe('Simple error message');
      expect(result.requestId).toBe('req-456');
    });

    it('should handle errors without messages', () => {
      const error = new Error();
      const result = formatErrorMessage(error, 'INTERNAL_ERROR');

      expect(result.message).toBe('An error occurred');
    });
  });

  describe('Error code categorization', () => {
    it('should format VALIDATION_ERROR correctly', () => {
      const error = new Error('Invalid input');
      const result = formatErrorMessage(error, 'VALIDATION_ERROR');

      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.type).toBe('error');
    });

    it('should format SERVICE_ERROR correctly', () => {
      const error = new Error('Service unavailable');
      const result = formatErrorMessage(error, 'SERVICE_ERROR');

      expect(result.code).toBe('SERVICE_ERROR');
      expect(result.type).toBe('error');
    });

    it('should format TRANSCRIPTION_ERROR correctly', () => {
      const error = new Error('Transcription failed');
      const result = formatErrorMessage(error, 'TRANSCRIPTION_ERROR');

      expect(result.code).toBe('TRANSCRIPTION_ERROR');
      expect(result.type).toBe('error');
    });

    it('should format ANALYSIS_ERROR correctly', () => {
      const error = new Error('Analysis failed');
      const result = formatErrorMessage(error, 'ANALYSIS_ERROR');

      expect(result.code).toBe('ANALYSIS_ERROR');
      expect(result.type).toBe('error');
    });

    it('should format INTERNAL_ERROR correctly', () => {
      const error = new Error('Internal error');
      const result = formatErrorMessage(error, 'INTERNAL_ERROR');

      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.type).toBe('error');
    });
  });

  describe('Message structure', () => {
    it('should include all required fields', () => {
      const error = new Error('Test error');
      const result = formatErrorMessage(error, 'INTERNAL_ERROR', 'req-789');

      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('requestId');
    });

    it('should have correct timestamp format', () => {
      const error = new Error('Test error');
      const beforeTimestamp = Date.now();
      const result = formatErrorMessage(error, 'INTERNAL_ERROR');
      const afterTimestamp = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(result.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should allow optional requestId', () => {
      const error = new Error('Test error');
      const result = formatErrorMessage(error, 'INTERNAL_ERROR');

      expect(result.requestId).toBeUndefined();
    });
  });

  describe('Complex sanitization scenarios', () => {
    it('should sanitize multiple AWS resources in one message', () => {
      const error = new Error(
        'Lambda arn:aws:lambda:us-east-1:123456789012:function:my-func failed to access ' +
        'DynamoDB arn:aws:dynamodb:us-east-1:123456789012:table/my-table and ' +
        'S3 arn:aws:s3:::my-bucket'
      );
      const result = formatErrorMessage(error, 'SERVICE_ERROR');

      expect(result.message).not.toContain('arn:aws');
      expect(result.message).not.toContain('123456789012');
      expect(result.message).not.toContain('my-func');
      expect(result.message).not.toContain('my-table');
      expect(result.message).not.toContain('my-bucket');
      expect(result.message).toContain('service');
      expect(result.message).toContain('database');
    });

    it('should handle region names in ARNs', () => {
      const error = new Error('Resource in us-east-1 failed, also tried us-west-2 and eu-west-1');
      const result = formatErrorMessage(error, 'SERVICE_ERROR');

      expect(result.message).not.toContain('us-east-1');
      expect(result.message).not.toContain('us-west-2');
      expect(result.message).not.toContain('eu-west-1');
      expect(result.message).toContain('[Region]');
    });

    it('should preserve user-friendly error messages', () => {
      const error = new Error('Invalid audio format: expected PCM 16kHz 16-bit mono');
      const result = formatErrorMessage(error, 'VALIDATION_ERROR');

      expect(result.message).toContain('Invalid audio format');
      expect(result.message).toContain('expected PCM 16kHz 16-bit mono');
    });
  });
});
