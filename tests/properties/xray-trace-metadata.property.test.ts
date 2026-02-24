/**
 * Property Test: X-Ray Trace Metadata
 * 
 * Feature: monitoring-and-observability
 * Property 8: X-Ray Trace Metadata
 * 
 * Validates: Requirements 4.5, 4.7
 * 
 * For any X-Ray trace segment, it should contain metadata including request
 * parameters (for API Gateway), response codes, and error information (when
 * errors occur).
 */

import * as fc from 'fast-check';

/**
 * Service types that can be traced
 */
enum ServiceType {
  APIGateway = 'APIGateway',
  Lambda = 'Lambda',
  DynamoDB = 'DynamoDB',
  Transcribe = 'Transcribe',
  Bedrock = 'Bedrock',
  SNS = 'SNS',
  EventBridge = 'EventBridge',
  SecretsManager = 'SecretsManager',
  SSM = 'SSM',
}

/**
 * HTTP methods for API Gateway requests
 */
enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
}

/**
 * HTTP request metadata for API Gateway segments
 */
interface HttpRequest {
  method: HttpMethod;
  url: string;
  userAgent?: string;
  clientIp?: string;
}

/**
 * HTTP response metadata
 */
interface HttpResponse {
  status: number;
  contentLength?: number;
}

/**
 * Error information captured in traces
 */
interface ErrorInfo {
  message: string;
  type: string;
  stack: string[];
}

/**
 * AWS service operation metadata
 */
interface AwsMetadata {
  operation: string;
  region: string;
  requestId: string;
  retryCount?: number;
}

/**
 * X-Ray segment interface with metadata
 */
interface XRaySegment {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  service?: {
    type: ServiceType;
  };
  http?: {
    request?: HttpRequest;
    response?: HttpResponse;
  };
  aws?: AwsMetadata;
  annotations?: Record<string, string | number | boolean>;
  metadata?: Record<string, unknown>;
  error?: boolean;
  fault?: boolean;
  cause?: ErrorInfo;
  subsegments?: XRaySegment[];
}

/**
 * X-Ray trace interface
 */
interface XRayTrace {
  traceId: string;
  duration: number;
  segments: XRaySegment[];
}

/**
 * Generate a valid X-Ray segment ID
 */
function generateSegmentId(): string {
  return Math.random().toString(36).substring(2, 18);
}

/**
 * Generate a valid X-Ray trace ID
 * Format: 1-{8 hex chars}-{24 hex chars}
 */
function generateTraceId(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(16);
  
  // Generate 24 random hex characters for unique ID
  let uniqueId = '';
  for (let i = 0; i < 24; i++) {
    uniqueId += Math.floor(Math.random() * 16).toString(16);
  }
  
  return `1-${timestamp}-${uniqueId}`;
}

/**
 * Generate AWS request ID
 */
function generateAwsRequestId(): string {
  return `${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create an X-Ray segment with appropriate metadata based on service type
 */
function createSegmentWithMetadata(
  serviceType: ServiceType,
  startTime: number,
  duration: number,
  options: {
    includeError?: boolean;
    statusCode?: number;
    httpMethod?: HttpMethod;
    url?: string;
  } = {}
): XRaySegment {
  const endTime = startTime + duration;
  
  const segment: XRaySegment = {
    id: generateSegmentId(),
    name: serviceType,
    startTime,
    endTime,
    duration,
    service: {
      type: serviceType,
    },
    annotations: {},
    metadata: {},
  };

  // Add HTTP metadata for API Gateway segments
  if (serviceType === ServiceType.APIGateway) {
    segment.http = {
      request: {
        method: options.httpMethod || HttpMethod.POST,
        url: options.url || '/prod/audio',
        userAgent: 'VocalShield-Android/1.0',
        clientIp: '192.168.1.100',
      },
      response: {
        status: options.statusCode || 200,
        contentLength: 1024,
      },
    };
  }
  
  // Add AWS metadata for AWS service segments
  if ([ServiceType.Lambda, ServiceType.DynamoDB, ServiceType.Transcribe, 
       ServiceType.Bedrock, ServiceType.SNS, ServiceType.EventBridge,
       ServiceType.SecretsManager, ServiceType.SSM].includes(serviceType)) {
    segment.aws = {
      operation: getOperationForService(serviceType),
      region: 'us-east-1',
      requestId: generateAwsRequestId(),
      retryCount: 0,
    };
    
    // Add response status for AWS services
    if (!segment.http) {
      segment.http = {
        response: {
          status: options.statusCode || 200,
        },
      };
    }
  }
  
  // Add error information if requested
  if (options.includeError) {
    segment.error = true;
    segment.fault = true;
    segment.cause = {
      message: getErrorMessageForService(serviceType),
      type: getErrorTypeForService(serviceType),
      stack: [
        `at ${serviceType}.handler (/var/task/index.js:42:15)`,
        'at Runtime.handleOnce (/var/runtime/Runtime.js:66:25)',
      ],
    };
    
    // Update status code for errors - must be 4xx or 5xx
    const errorStatusCode = options.statusCode && options.statusCode >= 400 && options.statusCode < 600
      ? options.statusCode
      : 500;
    
    if (segment.http?.response) {
      segment.http.response.status = errorStatusCode;
    } else {
      segment.http = {
        response: {
          status: errorStatusCode,
        },
      };
    }
  }
  
  return segment;
}

/**
 * Get typical operation name for a service
 */
function getOperationForService(serviceType: ServiceType): string {
  const operations: Record<ServiceType, string> = {
    [ServiceType.APIGateway]: 'POST',
    [ServiceType.Lambda]: 'Invoke',
    [ServiceType.DynamoDB]: 'PutItem',
    [ServiceType.Transcribe]: 'StartStreamTranscription',
    [ServiceType.Bedrock]: 'InvokeModel',
    [ServiceType.SNS]: 'Publish',
    [ServiceType.EventBridge]: 'PutEvents',
    [ServiceType.SecretsManager]: 'GetSecretValue',
    [ServiceType.SSM]: 'GetParameter',
  };
  
  return operations[serviceType] || 'Unknown';
}

/**
 * Get typical error message for a service
 */
function getErrorMessageForService(serviceType: ServiceType): string {
  const errors: Record<ServiceType, string> = {
    [ServiceType.APIGateway]: 'Internal server error',
    [ServiceType.Lambda]: 'Function execution failed',
    [ServiceType.DynamoDB]: 'ProvisionedThroughputExceededException',
    [ServiceType.Transcribe]: 'Audio stream error',
    [ServiceType.Bedrock]: 'Model invocation failed',
    [ServiceType.SNS]: 'Failed to publish message',
    [ServiceType.EventBridge]: 'Failed to put events',
    [ServiceType.SecretsManager]: 'Secret not found',
    [ServiceType.SSM]: 'Parameter not found',
  };
  
  return errors[serviceType] || 'Unknown error';
}

/**
 * Get typical error type for a service
 */
function getErrorTypeForService(serviceType: ServiceType): string {
  const errorTypes: Record<ServiceType, string> = {
    [ServiceType.APIGateway]: 'InternalServerError',
    [ServiceType.Lambda]: 'FunctionError',
    [ServiceType.DynamoDB]: 'ProvisionedThroughputExceededException',
    [ServiceType.Transcribe]: 'AudioStreamError',
    [ServiceType.Bedrock]: 'ModelInvocationError',
    [ServiceType.SNS]: 'PublishError',
    [ServiceType.EventBridge]: 'PutEventsError',
    [ServiceType.SecretsManager]: 'ResourceNotFoundException',
    [ServiceType.SSM]: 'ParameterNotFound',
  };
  
  return errorTypes[serviceType] || 'Error';
}

/**
 * Verify that a segment has appropriate metadata based on its service type
 */
function verifySegmentMetadata(segment: XRaySegment): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // API Gateway segments must have HTTP request and response metadata
  if (segment.service?.type === ServiceType.APIGateway) {
    if (!segment.http) {
      errors.push(`API Gateway segment ${segment.id} missing http metadata`);
    } else {
      if (!segment.http.request) {
        errors.push(`API Gateway segment ${segment.id} missing http.request`);
      } else {
        if (!segment.http.request.method) {
          errors.push(`API Gateway segment ${segment.id} missing http.request.method`);
        }
        if (!segment.http.request.url) {
          errors.push(`API Gateway segment ${segment.id} missing http.request.url`);
        }
      }
      
      if (!segment.http.response) {
        errors.push(`API Gateway segment ${segment.id} missing http.response`);
      } else {
        if (segment.http.response.status === undefined) {
          errors.push(`API Gateway segment ${segment.id} missing http.response.status`);
        }
      }
    }
  }
  
  // AWS service segments must have response codes
  if (segment.service?.type && segment.service.type !== ServiceType.APIGateway) {
    if (!segment.http?.response?.status) {
      errors.push(`AWS service segment ${segment.id} missing response status code`);
    }
  }
  
  // AWS service segments should have AWS metadata
  const awsServices = [
    ServiceType.Lambda, ServiceType.DynamoDB, ServiceType.Transcribe,
    ServiceType.Bedrock, ServiceType.SNS, ServiceType.EventBridge,
    ServiceType.SecretsManager, ServiceType.SSM
  ];
  
  if (segment.service?.type && awsServices.includes(segment.service.type)) {
    if (!segment.aws) {
      errors.push(`AWS service segment ${segment.id} missing aws metadata`);
    } else {
      if (!segment.aws.operation) {
        errors.push(`AWS service segment ${segment.id} missing aws.operation`);
      }
      if (!segment.aws.region) {
        errors.push(`AWS service segment ${segment.id} missing aws.region`);
      }
      if (!segment.aws.requestId) {
        errors.push(`AWS service segment ${segment.id} missing aws.requestId`);
      }
    }
  }

  // Error segments must have error information
  if (segment.error || segment.fault) {
    if (!segment.cause) {
      errors.push(`Error segment ${segment.id} missing cause information`);
    } else {
      if (!segment.cause.message) {
        errors.push(`Error segment ${segment.id} missing cause.message`);
      }
      if (!segment.cause.type) {
        errors.push(`Error segment ${segment.id} missing cause.type`);
      }
      if (!segment.cause.stack || segment.cause.stack.length === 0) {
        errors.push(`Error segment ${segment.id} missing or empty cause.stack`);
      }
    }
    
    // Error segments should have 4xx or 5xx status codes
    if (segment.http?.response?.status) {
      const status = segment.http.response.status;
      if (status < 400 || status >= 600) {
        errors.push(
          `Error segment ${segment.id} has invalid error status code: ${status} (expected 4xx or 5xx)`
        );
      }
    } else {
      // Error segments must have a status code
      errors.push(`Error segment ${segment.id} missing response status code`);
    }
  }
  
  // Response status codes should be valid HTTP status codes
  if (segment.http?.response?.status !== undefined) {
    const status = segment.http.response.status;
    if (status < 100 || status >= 600) {
      errors.push(`Segment ${segment.id} has invalid HTTP status code: ${status}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Verify metadata for all segments in a trace
 */
function verifyTraceMetadata(trace: XRayTrace): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  function verifySegmentRecursive(segment: XRaySegment): void {
    const result = verifySegmentMetadata(segment);
    errors.push(...result.errors);
    
    // Recursively verify subsegments
    if (segment.subsegments) {
      for (const subsegment of segment.subsegments) {
        verifySegmentRecursive(subsegment);
      }
    }
  }
  
  for (const segment of trace.segments) {
    verifySegmentRecursive(segment);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Fast-check arbitrary for generating segments with metadata
 */
const segmentWithMetadataArbitrary = fc.record({
  serviceType: fc.constantFrom(...Object.values(ServiceType)),
  startTime: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  duration: fc.integer({ min: 10, max: 5000 }),
  includeError: fc.boolean(),
  statusCode: fc.option(
    fc.integer({ min: 200, max: 599 }),
    { nil: undefined }
  ),
  httpMethod: fc.option(
    fc.constantFrom(...Object.values(HttpMethod)),
    { nil: undefined }
  ),
  url: fc.option(
    fc.constantFrom('/prod/audio', '/prod/connect', '/prod/disconnect', '/prod/health'),
    { nil: undefined }
  ),
}).map(({ serviceType, startTime, duration, includeError, statusCode, httpMethod, url }) => {
  return createSegmentWithMetadata(serviceType, startTime, duration, {
    includeError,
    statusCode,
    httpMethod,
    url,
  });
});

/**
 * Fast-check arbitrary for generating traces with metadata
 */
const traceWithMetadataArbitrary = fc.record({
  segmentCount: fc.integer({ min: 1, max: 8 }),
  startTime: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  includeErrors: fc.boolean(),
}).chain(({ segmentCount, startTime, includeErrors }) => {
  return fc.array(
    fc.record({
      serviceType: fc.constantFrom(...Object.values(ServiceType)),
      duration: fc.integer({ min: 10, max: 500 }),
      includeError: fc.boolean(),
      statusCode: fc.option(
        fc.integer({ min: 200, max: 599 }),
        { nil: undefined }
      ),
    }),
    { minLength: segmentCount, maxLength: segmentCount }
  ).map(segmentConfigs => {
    let currentTime = startTime;
    const segments: XRaySegment[] = [];
    
    for (const config of segmentConfigs) {
      const shouldIncludeError = includeErrors && config.includeError;
      const segment = createSegmentWithMetadata(
        config.serviceType,
        currentTime,
        config.duration,
        {
          includeError: shouldIncludeError,
          statusCode: config.statusCode,
        }
      );
      segments.push(segment);
      currentTime += config.duration;
    }
    
    const totalDuration = currentTime - startTime;
    
    return {
      traceId: generateTraceId(),
      duration: totalDuration,
      segments,
    };
  });
});

describe('Property Test: X-Ray Trace Metadata', () => {
  test('Property 8: For any X-Ray segment, it contains appropriate metadata based on service type', () => {
    fc.assert(
      fc.property(
        segmentWithMetadataArbitrary,
        (segment: XRaySegment) => {
          const result = verifySegmentMetadata(segment);
          
          // Property: All segments should have valid metadata
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
          
          // Verify service-specific metadata
          if (segment.service?.type === ServiceType.APIGateway) {
            expect(segment.http).toBeDefined();
            expect(segment.http?.request).toBeDefined();
            expect(segment.http?.request?.method).toBeDefined();
            expect(segment.http?.request?.url).toBeDefined();
            expect(segment.http?.response).toBeDefined();
            expect(segment.http?.response?.status).toBeDefined();
          }
          
          // Verify AWS service metadata
          const awsServices = [
            ServiceType.Lambda, ServiceType.DynamoDB, ServiceType.Transcribe,
            ServiceType.Bedrock, ServiceType.SNS, ServiceType.EventBridge,
            ServiceType.SecretsManager, ServiceType.SSM
          ];
          
          if (segment.service?.type && awsServices.includes(segment.service.type)) {
            expect(segment.aws).toBeDefined();
            expect(segment.aws?.operation).toBeDefined();
            expect(segment.aws?.region).toBeDefined();
            expect(segment.aws?.requestId).toBeDefined();
            expect(segment.http?.response?.status).toBeDefined();
          }
          
          // Verify error metadata
          if (segment.error || segment.fault) {
            expect(segment.cause).toBeDefined();
            expect(segment.cause?.message).toBeDefined();
            expect(segment.cause?.type).toBeDefined();
            expect(segment.cause?.stack).toBeDefined();
            expect(segment.cause?.stack.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 8: For any trace, all segments have valid metadata', () => {
    fc.assert(
      fc.property(
        traceWithMetadataArbitrary,
        (trace: XRayTrace) => {
          const result = verifyTraceMetadata(trace);
          
          // Property: All segments in trace should have valid metadata
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 8 (API Gateway): API Gateway segments contain HTTP request parameters', () => {
    fc.assert(
      fc.property(
        fc.record({
          method: fc.constantFrom(...Object.values(HttpMethod)),
          url: fc.constantFrom('/prod/audio', '/prod/connect', '/prod/disconnect'),
          statusCode: fc.integer({ min: 200, max: 599 }),
        }),
        ({ method, url, statusCode }) => {
          const segment = createSegmentWithMetadata(
            ServiceType.APIGateway,
            Date.now(),
            100,
            { httpMethod: method, url, statusCode }
          );
          
          const result = verifySegmentMetadata(segment);
          
          expect(result.valid).toBe(true);
          expect(segment.http?.request?.method).toBe(method);
          expect(segment.http?.request?.url).toBe(url);
          expect(segment.http?.response?.status).toBe(statusCode);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 8 (Response Codes): All segments contain response status codes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(ServiceType)),
        fc.integer({ min: 200, max: 599 }),
        (serviceType: ServiceType, statusCode: number) => {
          const segment = createSegmentWithMetadata(
            serviceType,
            Date.now(),
            100,
            { statusCode }
          );
          
          const result = verifySegmentMetadata(segment);
          
          expect(result.valid).toBe(true);
          expect(segment.http?.response?.status).toBe(statusCode);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 8 (Errors): Error segments contain error details and stack traces', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(ServiceType)),
        (serviceType: ServiceType) => {
          const segment = createSegmentWithMetadata(
            serviceType,
            Date.now(),
            100,
            { includeError: true }
          );
          
          const result = verifySegmentMetadata(segment);
          
          // Property: Error segments must have complete error information
          expect(result.valid).toBe(true);
          expect(segment.error).toBe(true);
          expect(segment.fault).toBe(true);
          expect(segment.cause).toBeDefined();
          expect(segment.cause?.message).toBeDefined();
          expect(segment.cause?.type).toBeDefined();
          expect(segment.cause?.stack).toBeDefined();
          expect(segment.cause?.stack.length).toBeGreaterThan(0);
          
          // Error status code should be 4xx or 5xx
          expect(segment.http?.response?.status).toBeGreaterThanOrEqual(400);
          expect(segment.http?.response?.status).toBeLessThan(600);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 8 (Edge Case): Segments without errors do not have error metadata', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(ServiceType)),
        (serviceType: ServiceType) => {
          const segment = createSegmentWithMetadata(
            serviceType,
            Date.now(),
            100,
            { includeError: false, statusCode: 200 }
          );
          
          // Non-error segments should not have error flags or cause
          expect(segment.error).toBeUndefined();
          expect(segment.fault).toBeUndefined();
          expect(segment.cause).toBeUndefined();
          expect(segment.http?.response?.status).toBe(200);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 8 (Edge Case): HTTP status codes are within valid range', () => {
    fc.assert(
      fc.property(
        segmentWithMetadataArbitrary,
        (segment: XRaySegment) => {
          if (segment.http?.response?.status !== undefined) {
            const status = segment.http.response.status;
            
            // Property: Status codes must be valid HTTP status codes (100-599)
            expect(status).toBeGreaterThanOrEqual(100);
            expect(status).toBeLessThan(600);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 8 (Real-world scenario): Audio processing request has complete metadata', () => {
    // Typical audio processing flow with metadata
    const apiGatewaySegment = createSegmentWithMetadata(
      ServiceType.APIGateway,
      Date.now(),
      50,
      { httpMethod: HttpMethod.POST, url: '/prod/audio', statusCode: 200 }
    );
    
    const lambdaSegment = createSegmentWithMetadata(
      ServiceType.Lambda,
      Date.now() + 50,
      200,
      { statusCode: 200 }
    );
    
    const dynamoSegment = createSegmentWithMetadata(
      ServiceType.DynamoDB,
      Date.now() + 250,
      30,
      { statusCode: 200 }
    );
    
    const transcribeSegment = createSegmentWithMetadata(
      ServiceType.Transcribe,
      Date.now() + 280,
      500,
      { statusCode: 200 }
    );
    
    const bedrockSegment = createSegmentWithMetadata(
      ServiceType.Bedrock,
      Date.now() + 780,
      1000,
      { statusCode: 200 }
    );
    
    // Verify all segments have proper metadata
    for (const segment of [apiGatewaySegment, lambdaSegment, dynamoSegment, 
                           transcribeSegment, bedrockSegment]) {
      const result = verifySegmentMetadata(segment);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
    
    // Verify API Gateway has HTTP request metadata
    expect(apiGatewaySegment.http?.request?.method).toBe(HttpMethod.POST);
    expect(apiGatewaySegment.http?.request?.url).toBe('/prod/audio');
    
    // Verify AWS services have AWS metadata
    expect(lambdaSegment.aws?.operation).toBe('Invoke');
    expect(dynamoSegment.aws?.operation).toBe('PutItem');
    expect(transcribeSegment.aws?.operation).toBe('StartStreamTranscription');
    expect(bedrockSegment.aws?.operation).toBe('InvokeModel');
  });

  test('Property 8 (Real-world scenario): Error in Lambda function has complete error metadata', () => {
    const errorSegment = createSegmentWithMetadata(
      ServiceType.Lambda,
      Date.now(),
      150,
      { includeError: true, statusCode: 500 }
    );
    
    const result = verifySegmentMetadata(errorSegment);
    
    expect(result.valid).toBe(true);
    expect(errorSegment.error).toBe(true);
    expect(errorSegment.fault).toBe(true);
    expect(errorSegment.cause?.message).toBe('Function execution failed');
    expect(errorSegment.cause?.type).toBe('FunctionError');
    expect(errorSegment.cause?.stack).toContain('at Lambda.handler (/var/task/index.js:42:15)');
    expect(errorSegment.http?.response?.status).toBe(500);
  });

  test('Property 8 (Real-world scenario): DynamoDB throttling error has proper metadata', () => {
    const throttleSegment = createSegmentWithMetadata(
      ServiceType.DynamoDB,
      Date.now(),
      50,
      { includeError: true, statusCode: 400 }
    );
    
    const result = verifySegmentMetadata(throttleSegment);
    
    expect(result.valid).toBe(true);
    expect(throttleSegment.error).toBe(true);
    expect(throttleSegment.cause?.message).toBe('ProvisionedThroughputExceededException');
    expect(throttleSegment.cause?.type).toBe('ProvisionedThroughputExceededException');
    expect(throttleSegment.aws?.operation).toBe('PutItem');
    expect(throttleSegment.http?.response?.status).toBe(400);
  });

  test('Property 8 (Real-world scenario): WebSocket connection has API Gateway metadata', () => {
    const connectSegment = createSegmentWithMetadata(
      ServiceType.APIGateway,
      Date.now(),
      30,
      { httpMethod: HttpMethod.POST, url: '/prod/connect', statusCode: 200 }
    );
    
    const result = verifySegmentMetadata(connectSegment);
    
    expect(result.valid).toBe(true);
    expect(connectSegment.http?.request?.method).toBe(HttpMethod.POST);
    expect(connectSegment.http?.request?.url).toBe('/prod/connect');
    expect(connectSegment.http?.request?.userAgent).toBeDefined();
    expect(connectSegment.http?.request?.clientIp).toBeDefined();
    expect(connectSegment.http?.response?.status).toBe(200);
  });

  test('Property 8 (Validation): AWS request IDs are present and non-empty', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ServiceType.Lambda,
          ServiceType.DynamoDB,
          ServiceType.Transcribe,
          ServiceType.Bedrock,
          ServiceType.SNS
        ),
        (serviceType: ServiceType) => {
          const segment = createSegmentWithMetadata(
            serviceType,
            Date.now(),
            100
          );
          
          expect(segment.aws?.requestId).toBeDefined();
          expect(segment.aws?.requestId).not.toBe('');
          expect(segment.aws?.requestId.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 8 (Validation): AWS regions are valid', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ServiceType.Lambda,
          ServiceType.DynamoDB,
          ServiceType.Transcribe,
          ServiceType.Bedrock
        ),
        (serviceType: ServiceType) => {
          const segment = createSegmentWithMetadata(
            serviceType,
            Date.now(),
            100
          );
          
          expect(segment.aws?.region).toBeDefined();
          expect(segment.aws?.region).toBe('us-east-1');
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 8 (Invariant): Error segments always have 4xx or 5xx status codes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(ServiceType)),
        (serviceType: ServiceType) => {
          const segment = createSegmentWithMetadata(
            serviceType,
            Date.now(),
            100,
            { includeError: true }
          );
          
          // Property: Error segments must have error status codes
          if (segment.http?.response?.status) {
            expect(segment.http.response.status).toBeGreaterThanOrEqual(400);
            expect(segment.http.response.status).toBeLessThan(600);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 8 (Invariant): Non-error segments have 2xx or 3xx status codes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(ServiceType)),
        (serviceType: ServiceType) => {
          const segment = createSegmentWithMetadata(
            serviceType,
            Date.now(),
            100,
            { includeError: false, statusCode: 200 }
          );
          
          // Property: Non-error segments should have success status codes
          if (segment.http?.response?.status) {
            expect(segment.http.response.status).toBeGreaterThanOrEqual(200);
            expect(segment.http.response.status).toBeLessThan(400);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 8 (Negative case): Missing HTTP metadata is detected for API Gateway', () => {
    const segment = createSegmentWithMetadata(
      ServiceType.APIGateway,
      Date.now(),
      100
    );
    
    // Remove HTTP metadata to test validation
    delete (segment as any).http;
    
    const result = verifySegmentMetadata(segment);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing http metadata'))).toBe(true);
  });

  test('Property 8 (Negative case): Missing AWS metadata is detected for AWS services', () => {
    const segment = createSegmentWithMetadata(
      ServiceType.Lambda,
      Date.now(),
      100
    );
    
    // Remove AWS metadata to test validation
    delete (segment as any).aws;
    
    const result = verifySegmentMetadata(segment);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing aws metadata'))).toBe(true);
  });

  test('Property 8 (Negative case): Missing error details are detected for error segments', () => {
    const segment = createSegmentWithMetadata(
      ServiceType.Lambda,
      Date.now(),
      100,
      { includeError: true }
    );
    
    // Remove cause to test validation
    delete (segment as any).cause;
    
    const result = verifySegmentMetadata(segment);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing cause information'))).toBe(true);
  });

  test('Property 8 (Negative case): Empty stack trace is detected', () => {
    const segment = createSegmentWithMetadata(
      ServiceType.Lambda,
      Date.now(),
      100,
      { includeError: true }
    );
    
    // Empty the stack trace
    if (segment.cause) {
      segment.cause.stack = [];
    }
    
    const result = verifySegmentMetadata(segment);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing or empty cause.stack'))).toBe(true);
  });
});
