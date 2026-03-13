/**
 * Circuit Breaker Pattern Implementation
 * 
 * Requirements 8.6: Implement circuit breaker pattern for Bedrock API calls
 * after 5 consecutive failures
 * 
 * States:
 * - CLOSED: Normal operation, all requests go through
 * - OPEN: After 5 consecutive failures, fail fast without calling service
 * - HALF_OPEN: After timeout, allow 1 test request to check if service recovered
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of consecutive failures before opening
  timeout: number; // Milliseconds to wait before attempting half-open
  name: string; // Circuit breaker name for logging
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.config.timeout) {
        this.state = CircuitState.HALF_OPEN;
        this.log('INFO', 'Circuit breaker transitioning to HALF_OPEN state');
      }
    }
    return this.state;
  }

  /**
   * Check if request should be allowed
   */
  canExecute(): boolean {
    const currentState = this.getState();
    
    if (currentState === CircuitState.OPEN) {
      this.log('WARN', 'Circuit breaker is OPEN, rejecting request');
      return false;
    }
    
    return true;
  }

  /**
   * Record successful execution
   */
  recordSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      this.log('INFO', 'Circuit breaker transitioning to CLOSED state after successful test');
    }
  }

  /**
   * Record failed execution
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed in half-open state, go back to open
      this.state = CircuitState.OPEN;
      this.log('ERROR', 'Circuit breaker transitioning back to OPEN state after failed test');
    } else if (this.failureCount >= this.config.failureThreshold) {
      // Reached failure threshold, open the circuit
      this.state = CircuitState.OPEN;
      this.log('ERROR', `Circuit breaker OPEN after ${this.failureCount} consecutive failures`);
    } else {
      this.log('WARN', `Circuit breaker failure count: ${this.failureCount}/${this.config.failureThreshold}`);
    }
  }

  /**
   * Get failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Reset circuit breaker (for testing)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Log circuit breaker events
   */
  private log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: 'CircuitBreaker',
      name: this.config.name,
      message,
      state: this.state,
      failureCount: this.failureCount,
    };
    console.log(JSON.stringify(logEntry));
  }
}

/**
 * Global circuit breaker instance for Bedrock API calls
 * Requirements 8.6: Open after 5 consecutive failures, half-open after 30s
 */
export const bedrockCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  timeout: 30000, // 30 seconds
  name: 'BedrockAgent',
});
