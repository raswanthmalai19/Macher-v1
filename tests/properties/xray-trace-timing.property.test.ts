/**
 * Property Test: X-Ray Trace Timing Information
 * 
 * Feature: monitoring-and-observability
 * Property 7: X-Ray Trace Timing Information
 * 
 * Validates: Requirements 4.4
 * 
 * For any X-Ray trace segment, it should contain startTime, endTime, and duration
 * fields with valid timestamps where endTime > startTime.
 */

import * as fc from 'fast-check';

/**
 * X-Ray segment interface with timing information
 */
interface XRaySegment {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
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
 * Create an X-Ray segment with timing information
 */
function createSegment(
  name: string,
  startTime: number,
  duration: number,
  subsegments?: XRaySegment[]
): XRaySegment {
  const endTime = startTime + duration;
  
  return {
    id: generateSegmentId(),
    name,
    startTime,
    endTime,
    duration,
    subsegments,
    annotations: {},
    metadata: {},
  };
}

/**
 * Verify timing information for a single segment
 */
function verifySegmentTiming(segment: XRaySegment): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check that all required timing fields are present
  if (segment.startTime === undefined) {
    errors.push(`Segment ${segment.id} missing startTime`);
  }
  
  if (segment.endTime === undefined) {
    errors.push(`Segment ${segment.id} missing endTime`);
  }
  
  if (segment.duration === undefined) {
    errors.push(`Segment ${segment.id} missing duration`);
  }
  
  // Check that startTime is a valid timestamp (positive number)
  if (typeof segment.startTime !== 'number' || segment.startTime < 0) {
    errors.push(`Segment ${segment.id} has invalid startTime: ${segment.startTime}`);
  }
  
  // Check that endTime is a valid timestamp (positive number)
  if (typeof segment.endTime !== 'number' || segment.endTime < 0) {
    errors.push(`Segment ${segment.id} has invalid endTime: ${segment.endTime}`);
  }
  
  // Check that duration is a valid number (non-negative)
  if (typeof segment.duration !== 'number' || segment.duration < 0) {
    errors.push(`Segment ${segment.id} has invalid duration: ${segment.duration}`);
  }
  
  // Check that endTime > startTime
  if (segment.endTime <= segment.startTime) {
    errors.push(
      `Segment ${segment.id} has endTime (${segment.endTime}) <= startTime (${segment.startTime})`
    );
  }
  
  // Check that duration equals endTime - startTime
  const expectedDuration = segment.endTime - segment.startTime;
  if (Math.abs(segment.duration - expectedDuration) > 0.001) {
    errors.push(
      `Segment ${segment.id} duration (${segment.duration}) does not match endTime - startTime (${expectedDuration})`
    );
  }
  
  // Check that timestamps are reasonable (not in the far future or distant past)
  const now = Date.now();
  const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
  const oneYearFromNow = now + (365 * 24 * 60 * 60 * 1000);
  
  if (segment.startTime < oneYearAgo || segment.startTime > oneYearFromNow) {
    errors.push(
      `Segment ${segment.id} startTime (${segment.startTime}) is outside reasonable range`
    );
  }
  
  if (segment.endTime < oneYearAgo || segment.endTime > oneYearFromNow) {
    errors.push(
      `Segment ${segment.id} endTime (${segment.endTime}) is outside reasonable range`
    );
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Verify timing information for all segments in a trace (including subsegments)
 */
function verifyTraceTiming(trace: XRayTrace): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  function verifySegmentRecursive(segment: XRaySegment): void {
    const result = verifySegmentTiming(segment);
    errors.push(...result.errors);
    
    // Recursively verify subsegments
    if (segment.subsegments) {
      for (const subsegment of segment.subsegments) {
        verifySegmentRecursive(subsegment);
        
        // Subsegment timing should be within parent segment timing
        if (subsegment.startTime < segment.startTime) {
          errors.push(
            `Subsegment ${subsegment.id} startTime (${subsegment.startTime}) is before parent segment ${segment.id} startTime (${segment.startTime})`
          );
        }
        
        if (subsegment.endTime > segment.endTime) {
          errors.push(
            `Subsegment ${subsegment.id} endTime (${subsegment.endTime}) is after parent segment ${segment.id} endTime (${segment.endTime})`
          );
        }
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
 * Fast-check arbitrary for generating X-Ray segments with timing information
 */
const segmentArbitrary = fc.record({
  name: fc.constantFrom(
    'APIGateway',
    'Lambda',
    'DynamoDB',
    'Transcribe',
    'Bedrock',
    'SNS',
    'EventBridge',
    'SecretsManager',
    'SSM'
  ),
  startTime: fc.integer({ min: Date.now() - 86400000, max: Date.now() }), // Last 24 hours
  duration: fc.integer({ min: 1, max: 5000 }), // 1ms to 5 seconds
}).map(({ name, startTime, duration }) => {
  return createSegment(name, startTime, duration);
});

/**
 * Fast-check arbitrary for generating X-Ray segments with subsegments
 */
const segmentWithSubsegmentsArbitrary = fc.record({
  name: fc.constantFrom('Lambda', 'APIGateway'),
  startTime: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
  duration: fc.integer({ min: 100, max: 5000 }), // Parent needs longer duration
  subsegmentCount: fc.integer({ min: 1, max: 5 }),
}).map(({ name, startTime, duration, subsegmentCount }) => {
  // Create subsegments within parent timing bounds
  const subsegments: XRaySegment[] = [];
  let currentTime = startTime;
  const remainingDuration = duration;
  const subsegmentDuration = Math.floor(remainingDuration / subsegmentCount);
  
  for (let i = 0; i < subsegmentCount; i++) {
    const subDuration = Math.min(
      subsegmentDuration,
      startTime + duration - currentTime - 1
    );
    
    if (subDuration > 0) {
      subsegments.push(
        createSegment(
          `Subsegment-${i}`,
          currentTime,
          subDuration
        )
      );
      currentTime += subDuration;
    }
  }
  
  return createSegment(name, startTime, duration, subsegments);
});

/**
 * Fast-check arbitrary for generating X-Ray traces
 */
const traceArbitrary = fc.record({
  segmentCount: fc.integer({ min: 1, max: 10 }),
  startTime: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
}).chain(({ segmentCount, startTime }) => {
  return fc.array(
    fc.record({
      name: fc.constantFrom(
        'APIGateway',
        'Lambda',
        'DynamoDB',
        'Transcribe',
        'Bedrock',
        'SNS'
      ),
      duration: fc.integer({ min: 10, max: 500 }),
    }),
    { minLength: segmentCount, maxLength: segmentCount }
  ).map(segmentConfigs => {
    let currentTime = startTime;
    const segments: XRaySegment[] = [];
    
    for (const config of segmentConfigs) {
      const segment = createSegment(config.name, currentTime, config.duration);
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

describe('Property Test: X-Ray Trace Timing Information', () => {
  test('Property 7: For any X-Ray segment, timing fields are present and valid', () => {
    fc.assert(
      fc.property(
        segmentArbitrary,
        (segment: XRaySegment) => {
          const result = verifySegmentTiming(segment);
          
          // Property: All timing fields should be present and valid
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
          
          // Verify specific timing constraints
          expect(segment.startTime).toBeDefined();
          expect(segment.endTime).toBeDefined();
          expect(segment.duration).toBeDefined();
          
          expect(typeof segment.startTime).toBe('number');
          expect(typeof segment.endTime).toBe('number');
          expect(typeof segment.duration).toBe('number');
          
          expect(segment.startTime).toBeGreaterThan(0);
          expect(segment.endTime).toBeGreaterThan(0);
          expect(segment.duration).toBeGreaterThan(0);
          
          expect(segment.endTime).toBeGreaterThan(segment.startTime);
          expect(segment.duration).toBe(segment.endTime - segment.startTime);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 7: For any X-Ray trace, all segments have valid timing information', () => {
    fc.assert(
      fc.property(
        traceArbitrary,
        (trace: XRayTrace) => {
          const result = verifyTraceTiming(trace);
          
          // Property: All segments in trace should have valid timing
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
          
          // Verify each segment individually
          for (const segment of trace.segments) {
            expect(segment.startTime).toBeDefined();
            expect(segment.endTime).toBeDefined();
            expect(segment.duration).toBeDefined();
            
            expect(segment.endTime).toBeGreaterThan(segment.startTime);
            expect(segment.duration).toBe(segment.endTime - segment.startTime);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 7: Segments with subsegments have valid nested timing', () => {
    fc.assert(
      fc.property(
        segmentWithSubsegmentsArbitrary,
        (segment: XRaySegment) => {
          const result = verifySegmentTiming(segment);
          
          // Property: Parent and all subsegments should have valid timing
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
          
          // Verify parent segment timing
          expect(segment.endTime).toBeGreaterThan(segment.startTime);
          expect(segment.duration).toBe(segment.endTime - segment.startTime);
          
          // Verify subsegments are within parent bounds
          if (segment.subsegments) {
            for (const subsegment of segment.subsegments) {
              expect(subsegment.startTime).toBeGreaterThanOrEqual(segment.startTime);
              expect(subsegment.endTime).toBeLessThanOrEqual(segment.endTime);
              expect(subsegment.endTime).toBeGreaterThan(subsegment.startTime);
              expect(subsegment.duration).toBe(subsegment.endTime - subsegment.startTime);
            }
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 7 (Edge Case): Zero-duration segments are invalid', () => {
    const segment = createSegment('Lambda', Date.now(), 0);
    
    // Manually set duration to 0 to test validation
    segment.duration = 0;
    segment.endTime = segment.startTime;
    
    const result = verifySegmentTiming(segment);
    
    // Zero duration should be invalid (endTime must be > startTime)
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('Property 7 (Edge Case): Negative duration segments are invalid', () => {
    const startTime = Date.now();
    const segment = createSegment('Lambda', startTime, 100);
    
    // Manually set endTime before startTime to test validation
    segment.endTime = startTime - 100;
    segment.duration = segment.endTime - segment.startTime;
    
    const result = verifySegmentTiming(segment);
    
    // Negative duration should be invalid
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('Property 7 (Edge Case): Missing timing fields are detected', () => {
    const segment = createSegment('Lambda', Date.now(), 100);
    
    // Remove timing fields to test validation
    delete (segment as any).startTime;
    
    const result = verifySegmentTiming(segment);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing startTime'))).toBe(true);
  });

  test('Property 7 (Edge Case): Inconsistent duration is detected', () => {
    const startTime = Date.now();
    const segment = createSegment('Lambda', startTime, 100);
    
    // Manually set inconsistent duration
    segment.duration = 200; // Should be 100
    
    const result = verifySegmentTiming(segment);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('does not match'))).toBe(true);
  });

  test('Property 7 (Invariant): Segment duration equals endTime minus startTime', () => {
    fc.assert(
      fc.property(
        segmentArbitrary,
        (segment: XRaySegment) => {
          const calculatedDuration = segment.endTime - segment.startTime;
          
          // Property: duration should always equal endTime - startTime
          expect(segment.duration).toBe(calculatedDuration);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 7 (Invariant): Subsegments are contained within parent segment time bounds', () => {
    fc.assert(
      fc.property(
        segmentWithSubsegmentsArbitrary,
        (segment: XRaySegment) => {
          if (segment.subsegments) {
            for (const subsegment of segment.subsegments) {
              // Property: Subsegment must start at or after parent start
              expect(subsegment.startTime).toBeGreaterThanOrEqual(segment.startTime);
              
              // Property: Subsegment must end at or before parent end
              expect(subsegment.endTime).toBeLessThanOrEqual(segment.endTime);
            }
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 7 (Real-world scenario): Lambda execution segment has valid timing', () => {
    // Simulate a typical Lambda execution (50ms to 3000ms)
    fc.assert(
      fc.property(
        fc.integer({ min: 50, max: 3000 }),
        (duration: number) => {
          const startTime = Date.now();
          const segment = createSegment('Lambda', startTime, duration);
          
          const result = verifySegmentTiming(segment);
          
          expect(result.valid).toBe(true);
          expect(segment.duration).toBe(duration);
          expect(segment.endTime).toBe(startTime + duration);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 7 (Real-world scenario): DynamoDB query segment has valid timing', () => {
    // Simulate a typical DynamoDB query (5ms to 100ms)
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 100 }),
        (duration: number) => {
          const startTime = Date.now();
          const segment = createSegment('DynamoDB', startTime, duration);
          
          const result = verifySegmentTiming(segment);
          
          expect(result.valid).toBe(true);
          expect(segment.duration).toBe(duration);
          expect(segment.endTime).toBe(startTime + duration);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 7 (Real-world scenario): Transcribe streaming segment has valid timing', () => {
    // Simulate Transcribe streaming (100ms to 2000ms)
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 2000 }),
        (duration: number) => {
          const startTime = Date.now();
          const segment = createSegment('Transcribe', startTime, duration);
          
          const result = verifySegmentTiming(segment);
          
          expect(result.valid).toBe(true);
          expect(segment.duration).toBe(duration);
          expect(segment.endTime).toBe(startTime + duration);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 7 (Real-world scenario): Bedrock LLM invocation segment has valid timing', () => {
    // Simulate Bedrock LLM invocation (500ms to 5000ms)
    fc.assert(
      fc.property(
        fc.integer({ min: 500, max: 5000 }),
        (duration: number) => {
          const startTime = Date.now();
          const segment = createSegment('Bedrock', startTime, duration);
          
          const result = verifySegmentTiming(segment);
          
          expect(result.valid).toBe(true);
          expect(segment.duration).toBe(duration);
          expect(segment.endTime).toBe(startTime + duration);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 7 (Real-world scenario): Complete request trace has chronologically ordered segments', () => {
    fc.assert(
      fc.property(
        traceArbitrary,
        (trace: XRayTrace) => {
          // Verify all segments have valid timing
          const result = verifyTraceTiming(trace);
          expect(result.valid).toBe(true);
          
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

  test('Property 7 (Validation): Timestamps are within reasonable range', () => {
    fc.assert(
      fc.property(
        segmentArbitrary,
        (segment: XRaySegment) => {
          const now = Date.now();
          const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
          const oneYearFromNow = now + (365 * 24 * 60 * 60 * 1000);
          
          // Property: Timestamps should be within reasonable range
          expect(segment.startTime).toBeGreaterThan(oneYearAgo);
          expect(segment.startTime).toBeLessThan(oneYearFromNow);
          expect(segment.endTime).toBeGreaterThan(oneYearAgo);
          expect(segment.endTime).toBeLessThan(oneYearFromNow);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Property 7 (Validation): Duration is positive and reasonable', () => {
    fc.assert(
      fc.property(
        segmentArbitrary,
        (segment: XRaySegment) => {
          // Property: Duration should be positive
          expect(segment.duration).toBeGreaterThan(0);
          
          // Property: Duration should be reasonable (not more than 1 hour)
          const oneHour = 60 * 60 * 1000;
          expect(segment.duration).toBeLessThan(oneHour);
        }
      ),
      { numRuns: 20 }
    );
  });
});
