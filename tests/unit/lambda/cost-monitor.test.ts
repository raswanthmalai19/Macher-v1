/**
 * Unit tests for cost monitoring module
 * 
 * Requirements 4.8, 9.7: Test token usage tracking and cost alert thresholds
 */

import {
  calculateCost,
  getCumulativeUsage,
  resetCumulativeUsage,
  trackTokenUsage,
} from '../../../lambda/audio-processor/cost-monitor';

describe('Cost Monitor', () => {
  // Spy on console.log to capture structured logs
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset cumulative usage before each test
    resetCumulativeUsage();
    
    // Spy on console.log
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('calculateCost', () => {
    it('should calculate cost correctly for input and output tokens', () => {
      // Claude 3.5 Sonnet pricing: $3 per 1M input tokens, $15 per 1M output tokens
      const inputTokens = 1_000_000; // 1M tokens
      const outputTokens = 1_000_000; // 1M tokens
      
      const cost = calculateCost(inputTokens, outputTokens);
      
      // Expected: $3 (input) + $15 (output) = $18
      expect(cost).toBe(18);
    });

    it('should calculate cost correctly for small token counts', () => {
      const inputTokens = 1000; // 1K tokens
      const outputTokens = 500; // 500 tokens
      
      const cost = calculateCost(inputTokens, outputTokens);
      
      // Expected: (1000/1M * $3) + (500/1M * $15) = $0.003 + $0.0075 = $0.0105
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('should return zero cost for zero tokens', () => {
      const cost = calculateCost(0, 0);
      expect(cost).toBe(0);
    });

    it('should handle large token counts', () => {
      const inputTokens = 10_000_000; // 10M tokens
      const outputTokens = 5_000_000; // 5M tokens
      
      const cost = calculateCost(inputTokens, outputTokens);
      
      // Expected: (10M/1M * $3) + (5M/1M * $15) = $30 + $75 = $105
      expect(cost).toBe(105);
    });
  });

  describe('getCumulativeUsage', () => {
    it('should return zero usage initially', () => {
      const usage = getCumulativeUsage();
      
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.estimatedCost).toBe(0);
    });

    it('should return cumulative usage after tracking tokens', () => {
      // Track first call
      trackTokenUsage(1000, 500, 'session-1');
      
      // Track second call
      trackTokenUsage(2000, 1000, 'session-2');
      
      const usage = getCumulativeUsage();
      
      expect(usage.inputTokens).toBe(3000);
      expect(usage.outputTokens).toBe(1500);
      expect(usage.totalTokens).toBe(4500);
      expect(usage.estimatedCost).toBeCloseTo(0.0315, 4); // (3000/1M * $3) + (1500/1M * $15)
    });
  });

  describe('resetCumulativeUsage', () => {
    it('should reset cumulative usage to zero', () => {
      // Track some tokens
      trackTokenUsage(5000, 2500, 'session-1');
      
      // Verify usage is tracked
      let usage = getCumulativeUsage();
      expect(usage.totalTokens).toBe(7500);
      
      // Reset
      resetCumulativeUsage();
      
      // Verify usage is reset
      usage = getCumulativeUsage();
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.estimatedCost).toBe(0);
    });

    it('should log reset action', () => {
      resetCumulativeUsage();
      
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const resetLog = logs.find(log => log.message === 'Cumulative token usage reset');
      
      expect(resetLog).toBeDefined();
      expect(resetLog.level).toBe('INFO');
      expect(resetLog.component).toBe('CostMonitor');
    });
  });

  describe('trackTokenUsage', () => {
    it('should track token usage and log INFO', () => {
      const inputTokens = 1000;
      const outputTokens = 500;
      const callSessionId = 'test-session-123';
      
      trackTokenUsage(inputTokens, outputTokens, callSessionId);
      
      // Verify cumulative usage
      const usage = getCumulativeUsage();
      expect(usage.inputTokens).toBe(1000);
      expect(usage.outputTokens).toBe(500);
      expect(usage.totalTokens).toBe(1500);
      
      // Verify log
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const trackLog = logs.find(log => log.message === 'Token usage tracked for Bedrock API call');
      
      expect(trackLog).toBeDefined();
      expect(trackLog.level).toBe('INFO');
      expect(trackLog.component).toBe('CostMonitor');
      expect(trackLog.callSessionId).toBe(callSessionId);
      expect(trackLog.inputTokens).toBe(inputTokens);
      expect(trackLog.outputTokens).toBe(outputTokens);
      expect(trackLog.totalTokens).toBe(1500);
      expect(trackLog.cumulativeInputTokens).toBe(1000);
      expect(trackLog.cumulativeOutputTokens).toBe(500);
      expect(trackLog.cumulativeTotalTokens).toBe(1500);
      expect(trackLog.creditLimit).toBe(200);
      expect(trackLog.percentageUsed).toBeDefined();
    });

    it('should accumulate token usage across multiple calls', () => {
      trackTokenUsage(1000, 500, 'session-1');
      trackTokenUsage(2000, 1000, 'session-2');
      trackTokenUsage(1500, 750, 'session-3');
      
      const usage = getCumulativeUsage();
      expect(usage.inputTokens).toBe(4500);
      expect(usage.outputTokens).toBe(2250);
      expect(usage.totalTokens).toBe(6750);
    });

    it('should log WARNING when cumulative cost reaches 80% threshold ($160)', () => {
      // Calculate tokens needed to reach 80% of $200 = $160
      // We need to reach $160 total cost
      // Let's use mostly output tokens (more expensive): $15 per 1M
      // $160 / $15 = 10.67M output tokens
      const outputTokens = 10_670_000; // ~$160 in output tokens
      
      trackTokenUsage(0, outputTokens, 'session-warning');
      
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const warningLog = logs.find(log => log.message === 'WARNING: Token usage has reached 80% of credit limit');
      
      expect(warningLog).toBeDefined();
      expect(warningLog.level).toBe('WARN');
      expect(warningLog.component).toBe('CostMonitor');
      expect(warningLog.cumulativeCost).toBeGreaterThanOrEqual(160);
      expect(warningLog.creditLimit).toBe(200);
      expect(warningLog.percentageUsed).toBeGreaterThanOrEqual(80);
    });

    it('should log ERROR when cumulative cost reaches 95% threshold ($190)', () => {
      // Calculate tokens needed to reach 95% of $200 = $190
      // $190 / $15 = 12.67M output tokens
      const outputTokens = 12_670_000; // ~$190 in output tokens
      
      trackTokenUsage(0, outputTokens, 'session-error');
      
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const errorLog = logs.find(log => log.message === 'CRITICAL: Token usage has reached 95% of credit limit');
      
      expect(errorLog).toBeDefined();
      expect(errorLog.level).toBe('ERROR');
      expect(errorLog.component).toBe('CostMonitor');
      expect(errorLog.cumulativeCost).toBeGreaterThanOrEqual(190);
      expect(errorLog.creditLimit).toBe(200);
      expect(errorLog.percentageUsed).toBeGreaterThanOrEqual(95);
    });

    it('should not log WARNING or ERROR when below 80% threshold', () => {
      // Use small token count (well below threshold)
      trackTokenUsage(1000, 500, 'session-safe');
      
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const warningLog = logs.find(log => log.message === 'WARNING: Token usage has reached 80% of credit limit');
      const errorLog = logs.find(log => log.message === 'CRITICAL: Token usage has reached 95% of credit limit');
      
      expect(warningLog).toBeUndefined();
      expect(errorLog).toBeUndefined();
    });

    it('should log WARNING but not ERROR when between 80% and 95%', () => {
      // Calculate tokens for 85% of $200 = $170
      // $170 / $15 = 11.33M output tokens
      const outputTokens = 11_330_000; // ~$170 in output tokens
      
      trackTokenUsage(0, outputTokens, 'session-warning-only');
      
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const warningLog = logs.find(log => log.message === 'WARNING: Token usage has reached 80% of credit limit');
      const errorLog = logs.find(log => log.message === 'CRITICAL: Token usage has reached 95% of credit limit');
      
      expect(warningLog).toBeDefined();
      expect(errorLog).toBeUndefined();
    });

    it('should handle tracking without callSessionId', () => {
      trackTokenUsage(1000, 500);
      
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const trackLog = logs.find(log => log.message === 'Token usage tracked for Bedrock API call');
      
      expect(trackLog).toBeDefined();
      expect(trackLog.callSessionId).toBeUndefined();
    });

    it('should calculate percentage used correctly', () => {
      // Track tokens worth $50 (25% of $200)
      // $50 / $15 = 3.33M output tokens
      const outputTokens = 3_330_000;
      
      trackTokenUsage(0, outputTokens, 'session-percentage');
      
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const trackLog = logs.find(log => log.message === 'Token usage tracked for Bedrock API call');
      
      expect(trackLog).toBeDefined();
      expect(trackLog.percentageUsed).toBeCloseTo(25, 0); // ~25%
    });

    it('should track mixed input and output tokens correctly', () => {
      // Mix of input and output tokens
      // Input: 1M tokens = $3
      // Output: 1M tokens = $15
      // Total: $18
      trackTokenUsage(1_000_000, 1_000_000, 'session-mixed');
      
      const usage = getCumulativeUsage();
      expect(usage.estimatedCost).toBe(18);
      
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const trackLog = logs.find(log => log.message === 'Token usage tracked for Bedrock API call');
      
      expect(trackLog).toBeDefined();
      expect(trackLog.cumulativeCost).toBe(18);
      expect(trackLog.percentageUsed).toBe(9); // $18 / $200 = 9%
    });

    it('should handle incremental approach to threshold', () => {
      // Simulate multiple calls that incrementally approach 80% threshold
      // 80% of $200 = $160
      // Using output tokens at $15 per 1M: $160 / $15 = 10.67M tokens
      // Split into 8 calls: 10.67M / 8 = 1,333,750 tokens per call
      const tokensPerCall = 1_333_750; // Each call adds ~$20
      
      // First 7 calls (cumulative ~$140, should not trigger warning)
      for (let i = 0; i < 7; i++) {
        consoleLogSpy.mockClear();
        trackTokenUsage(0, tokensPerCall, `session-${i}`);
        
        const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
        const warningLog = logs.find(log => log.message === 'WARNING: Token usage has reached 80% of credit limit');
        expect(warningLog).toBeUndefined();
      }
      
      // 8th call should trigger warning (cumulative ~$160)
      consoleLogSpy.mockClear();
      trackTokenUsage(0, tokensPerCall, 'session-8');
      
      const logs = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const warningLog = logs.find(log => log.message === 'WARNING: Token usage has reached 80% of credit limit');
      expect(warningLog).toBeDefined();
    });
  });

  describe('Integration with bedrock-client', () => {
    it('should track realistic token usage from fraud analysis', () => {
      // Simulate realistic token usage from a fraud analysis call
      // Typical transcription: ~100 words = ~133 tokens input
      // Typical response: ~50 words = ~67 tokens output
      const inputTokens = 133;
      const outputTokens = 67;
      
      trackTokenUsage(inputTokens, outputTokens, 'fraud-analysis-1');
      
      const usage = getCumulativeUsage();
      expect(usage.inputTokens).toBe(133);
      expect(usage.outputTokens).toBe(67);
      expect(usage.totalTokens).toBe(200);
      
      // Cost should be very small for a single call
      expect(usage.estimatedCost).toBeLessThan(0.01); // Less than 1 cent
    });

    it('should handle many fraud analysis calls before reaching threshold', () => {
      // Simulate 1000 fraud analysis calls
      // Each call: 133 input tokens, 67 output tokens
      for (let i = 0; i < 1000; i++) {
        trackTokenUsage(133, 67, `fraud-analysis-${i}`);
      }
      
      const usage = getCumulativeUsage();
      expect(usage.inputTokens).toBe(133_000);
      expect(usage.outputTokens).toBe(67_000);
      
      // Total cost should still be well below threshold
      // (133K/1M * $3) + (67K/1M * $15) = $0.399 + $1.005 = $1.404
      expect(usage.estimatedCost).toBeCloseTo(1.404, 2);
      expect(usage.estimatedCost).toBeLessThan(160); // Well below 80% threshold
    });
  });
});
