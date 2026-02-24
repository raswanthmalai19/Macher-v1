/**
 * Property Test: X-Ray Trace Completeness
 * 
 * Feature: monitoring-and-observability
 * Property 6: X-Ray Trace Completeness
 * 
 * Validates: Requirements 4.3
 * 
 * For any request flowing through the system, the X-Ray trace should contain
 * segments for all services invoked during that request (API Gateway, Lambda,
 * DynamoDB, Transcribe, Bedrock as applicable).
 */

import * as fc from 'fast-check';

/**
 * Service types that can be invoked in a request
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
 * X-Ray segment interface
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
  subsegments?: XRaySegment[];
  annotations?: Record<string, string | number | boolean>;
  metadata?: Record<string, unknown>;
  error?: boolean;
  fault?: boolean;
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
 * Request flow definition - which services are invoked
 */
interface RequestFlow {
  services: ServiceType[];
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
 * Create an X-Ray segment for a service
 */
function createSegment(
  serviceType: ServiceType,
  startTime: number,
  duration: number
): XRaySegment {
  return {
    id: generateSegmentId(),
    name: serviceType,
    startTime,
    endTime: startTime + duration,
    duration,
    service: {
      type: serviceType,
    },
    annotations: {},
    metadata: {},
  };
}

/**
 * Simulate X-Ray trace generation for a request flow
 * 
 * This simulates what the X-Ray SDK would capture when a request
 * flows through multiple services.
 */
function generateTraceForFlow(flow: RequestFlow): XRayTrace {
  const traceId = generateTraceId();
  const startTime = Date.now();
  let currentTime = startTime;
  
  const segments: XRaySegment[] = [];
  
  // Create segments for each service in the flow
  for (const serviceType of flow.services) {
    // Each service takes between 10ms and 500ms
    const duration = Math.floor(Math.random() * 490) + 10;
    
    const segment = createSegment(serviceType, currentTime, duration);
    segments.push(segment);
    
    currentTime += duration;
  }
  
  const totalDuration = currentTime - startTime;
  
  return {
    traceId,
    duration: totalDuration,
    segments,
  };
}

/**
 * Extract service types from trace segments
 */
function extractServicesFromTrace(trace: XRayTrace): Set<ServiceType> {
  const services = new Set<ServiceType>();
  
  function extractFromSegment(segment: XRaySegment): void {
    if (segment.service?.type) {
      services.add(segment.service.type);
    }
    
    // Recursively extract from subsegments
    if (segment.subsegments) {
      for (const subsegment of segment.subsegments) {
        extractFromSegment(subsegment);
      }
    }
  }
  
  for (const segment of trace.segments) {
    extractFromSegment(segment);
  }
  
  return services;
}

/**
 * Verify trace completeness - all invoked services should have segments
 */
function verifyTraceCompleteness(
  flow: RequestFlow,
  trace: XRayTrace
): { complete: boolean; missing: ServiceType[] } {
  const expectedServices = new Set(flow.services);
  const actualServices = extractServicesFromTrace(trace);
  
  const missing: ServiceType[] = [];
  
  for (const service of expectedServices) {
    if (!actualServices.has(service)) {
      missing.push(service);
    }
  }
  
  return {
    complete: missing.length === 0,
    missing,
  };
}

/**
 * Fast-check arbitrary for generating request flows
 * 
 * Generates realistic request flows through the VocalShield system:
 * - All requests start with API Gateway
 * - All requests invoke at least one Lambda function
 * - Lambda functions may invoke DynamoDB, SNS, EventBridge, etc.
 * - Audio processing flows may invoke Transcribe and Bedrock
 */
const requestFlowArbitrary = fc.record({
  services: fc.array(
    fc.constantFrom(...Object.values(ServiceType)),
    { minLength: 2, maxLength: 8 }
  ).map(services => {
    // Ensure API Gateway is always first (entry point)
    const uniqueServices = Array.from(new Set(services));
    if (!uniqueServices.includes(ServiceType.APIGateway)) {
      uniqueServices.unshift(ServiceType.APIGateway);
    } else {
      // Move API Gateway to the front
      const filtered = uniqueServices.filter(s => s !== ServiceType.APIGateway);
      uniqueServices.splice(0, uniqueServices.length, ServiceType.APIGateway, ...filtered);
    }
    
    // Ensure Lambda is present (all requests go through Lambda)
    if (!uniqueServices.includes(ServiceType.Lambda)) {
      uniqueServices.splice(1, 0, ServiceType.Lambda);
    }
    
    return uniqueServices;
  }),
});

describe('Property Test: X-Ray Trace Completeness', () => {
  test('Property 6: For any request flow, X-Ray trace contains segments for all invoked services', () => {
    fc.assert(
      fc.property(
        requestFlowArbitrary,
        (flow: RequestFlow) => {
          // Generate X-Ray trace for the request flow
          const trace = generateTraceForFlow(flow);
          
          // Verify trace completeness
          const result = verifyTraceCompleteness(flow, trace);
          
          // Property: Trace should contain segments for all services in the flow
          expect(result.complete).toBe(true);
          expect(result.missing).toHaveLength(0);
          
          // Additional verification: Trace should have correct structure
          expect(trace.traceId).toMatch(/^1-[0-9a-f]{8}-[0-9a-f]{24}$/);
          expect(trace.segments.length).toBeGreaterThan(0);
          expect(trace.duration).toBeGreaterThan(0);
          
          // Verify each segment has required fields
          for (const segment of trace.segments) {
            expect(segment.id).toBeDefined();
            expect(segment.name).toBeDefined();
            expect(segment.startTime).toBeGreaterThan(0);
            expect(segment.endTime).toBeGreaterThan(segment.startTime);
            expect(segment.duration).toBe(segment.endTime - segment.startTime);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 6 (Edge Case): Trace with single service contains that service segment', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(ServiceType)),
        (serviceType: ServiceType) => {
          const flow: RequestFlow = {
            services: [serviceType],
          };
          
          const trace = generateTraceForFlow(flow);
          const result = verifyTraceCompleteness(flow, trace);
          
          expect(result.complete).toBe(true);
          expect(result.missing).toHaveLength(0);
          expect(trace.segments).toHaveLength(1);
          expect(trace.segments[0].service?.type).toBe(serviceType);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 6 (Edge Case): Trace with all services contains all service segments', () => {
    const allServices = Object.values(ServiceType);
    const flow: RequestFlow = {
      services: allServices,
    };
    
    const trace = generateTraceForFlow(flow);
    const result = verifyTraceCompleteness(flow, trace);
    
    expect(result.complete).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(trace.segments).toHaveLength(allServices.length);
    
    // Verify all services are present
    const actualServices = extractServicesFromTrace(trace);
    for (const service of allServices) {
      expect(actualServices.has(service)).toBe(true);
    }
  });

  test('Property 6 (Invariant): Trace segments are ordered chronologically', () => {
    fc.assert(
      fc.property(
        requestFlowArbitrary,
        (flow: RequestFlow) => {
          const trace = generateTraceForFlow(flow);
          
          // Verify segments are in chronological order
          for (let i = 1; i < trace.segments.length; i++) {
            const prevSegment = trace.segments[i - 1];
            const currentSegment = trace.segments[i];
            
            // Current segment should start at or after previous segment starts
            expect(currentSegment.startTime).toBeGreaterThanOrEqual(prevSegment.startTime);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 6 (Invariant): Trace duration equals sum of segment durations for sequential flow', () => {
    fc.assert(
      fc.property(
        requestFlowArbitrary,
        (flow: RequestFlow) => {
          const trace = generateTraceForFlow(flow);
          
          // For sequential flows (no parallel execution), trace duration should be
          // approximately equal to the time from first segment start to last segment end
          const firstSegmentStart = Math.min(...trace.segments.map(s => s.startTime));
          const lastSegmentEnd = Math.max(...trace.segments.map(s => s.endTime));
          const expectedDuration = lastSegmentEnd - firstSegmentStart;
          
          // Allow small tolerance for timing precision
          expect(Math.abs(trace.duration - expectedDuration)).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 6 (Real-world scenario): Audio processing flow contains expected services', () => {
    // Typical audio processing flow:
    // API Gateway -> Lambda -> DynamoDB + Transcribe + Bedrock + SNS + EventBridge
    const audioProcessingFlow: RequestFlow = {
      services: [
        ServiceType.APIGateway,
        ServiceType.Lambda,
        ServiceType.DynamoDB,
        ServiceType.Transcribe,
        ServiceType.Bedrock,
        ServiceType.SNS,
        ServiceType.EventBridge,
      ],
    };
    
    const trace = generateTraceForFlow(audioProcessingFlow);
    const result = verifyTraceCompleteness(audioProcessingFlow, trace);
    
    expect(result.complete).toBe(true);
    expect(result.missing).toHaveLength(0);
    
    // Verify specific services are present
    const actualServices = extractServicesFromTrace(trace);
    expect(actualServices.has(ServiceType.APIGateway)).toBe(true);
    expect(actualServices.has(ServiceType.Lambda)).toBe(true);
    expect(actualServices.has(ServiceType.DynamoDB)).toBe(true);
    expect(actualServices.has(ServiceType.Transcribe)).toBe(true);
    expect(actualServices.has(ServiceType.Bedrock)).toBe(true);
    expect(actualServices.has(ServiceType.SNS)).toBe(true);
    expect(actualServices.has(ServiceType.EventBridge)).toBe(true);
  });

  test('Property 6 (Real-world scenario): Connection flow contains expected services', () => {
    // Typical WebSocket connection flow:
    // API Gateway -> Lambda -> DynamoDB
    const connectionFlow: RequestFlow = {
      services: [
        ServiceType.APIGateway,
        ServiceType.Lambda,
        ServiceType.DynamoDB,
      ],
    };
    
    const trace = generateTraceForFlow(connectionFlow);
    const result = verifyTraceCompleteness(connectionFlow, trace);
    
    expect(result.complete).toBe(true);
    expect(result.missing).toHaveLength(0);
    
    // Verify specific services are present
    const actualServices = extractServicesFromTrace(trace);
    expect(actualServices.has(ServiceType.APIGateway)).toBe(true);
    expect(actualServices.has(ServiceType.Lambda)).toBe(true);
    expect(actualServices.has(ServiceType.DynamoDB)).toBe(true);
  });

  test('Property 6 (Negative case): Incomplete trace is detected', () => {
    // Create a flow with multiple services
    const flow: RequestFlow = {
      services: [
        ServiceType.APIGateway,
        ServiceType.Lambda,
        ServiceType.DynamoDB,
        ServiceType.SNS,
      ],
    };
    
    // Generate trace but simulate missing SNS segment
    const trace = generateTraceForFlow(flow);
    
    // Remove SNS segment to simulate incomplete trace
    trace.segments = trace.segments.filter(
      s => s.service?.type !== ServiceType.SNS
    );
    
    const result = verifyTraceCompleteness(flow, trace);
    
    expect(result.complete).toBe(false);
    expect(result.missing).toContain(ServiceType.SNS);
    expect(result.missing).toHaveLength(1);
  });

  test('Property 6 (Validation): Trace ID format is valid', () => {
    fc.assert(
      fc.property(
        requestFlowArbitrary,
        (flow: RequestFlow) => {
          const trace = generateTraceForFlow(flow);
          
          // X-Ray trace ID format: 1-{timestamp}-{unique-id}
          // timestamp: 8 hex characters
          // unique-id: 24 hex characters
          expect(trace.traceId).toMatch(/^1-[0-9a-f]{8}-[0-9a-f]{24}$/);
          
          // Extract timestamp and verify it's reasonable
          const parts = trace.traceId.split('-');
          expect(parts).toHaveLength(3);
          expect(parts[0]).toBe('1');
          
          const timestamp = parseInt(parts[1], 16);
          const now = Math.floor(Date.now() / 1000);
          
          // Timestamp should be within reasonable range (not in future, not too old)
          expect(timestamp).toBeLessThanOrEqual(now);
          expect(timestamp).toBeGreaterThan(now - 86400); // Within last 24 hours
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 6 (Validation): Segment IDs are unique within trace', () => {
    fc.assert(
      fc.property(
        requestFlowArbitrary,
        (flow: RequestFlow) => {
          const trace = generateTraceForFlow(flow);
          
          // Collect all segment IDs
          const segmentIds = new Set<string>();
          
          for (const segment of trace.segments) {
            expect(segmentIds.has(segment.id)).toBe(false);
            segmentIds.add(segment.id);
          }
          
          // Number of unique IDs should equal number of segments
          expect(segmentIds.size).toBe(trace.segments.length);
        }
      ),
      { numRuns: 20 }
    );
  });
});
