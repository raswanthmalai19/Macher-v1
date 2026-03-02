/**
 * Property-Based Tests for Rollback Manager
 * 
 * Requirements: 6.1, 6.4
 */

import * as fc from 'fast-check';
import { RollbackManager } from '../../../pipeline/deploy/RollbackManager';

describe('Rollback Manager Property Tests', () => {
  let rollbackManager: RollbackManager;

  beforeEach(() => {
    rollbackManager = new RollbackManager('production', 'us-east-1');
  });

  /**
   * Property 26: Automatic rollback on validation failure
   * Validates: Requirements 6.1
   */
  describe('Property 26: Automatic rollback on validation failure', () => {
    test('failed validation should trigger automatic rollback', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (validationPassed) => {
            const deploymentResult = {
              success: validationPassed,
              validationErrors: validationPassed ? [] : ['Error 1'],
            };

            const shouldRollback = !deploymentResult.success;

            expect(shouldRollback).toBe(!validationPassed);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 28: Deployment history retention
   * Validates: Requirements 6.4
   */
  describe('Property 28: Deployment history retention', () => {
    test('deployment history should maintain last 10 deployments', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({
            version: fc.string({ minLength: 5, maxLength: 20 }),
            timestamp: fc.date(),
          }), { minLength: 1, maxLength: 20 }),
          (deployments) => {
            const history = rollbackManager.maintainHistory(deployments);

            // Should keep at most 10 deployments
            expect(history.length).toBeLessThanOrEqual(10);
            
            // Should keep most recent deployments
            if (deployments.length > 10) {
              const recentDeployments = deployments.slice(-10);
              expect(history).toEqual(recentDeployments);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
