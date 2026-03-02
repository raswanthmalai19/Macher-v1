/**
 * Unit Tests for RollbackManager
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { RollbackManager } from '../../../pipeline/deploy/RollbackManager';

describe('RollbackManager Unit Tests', () => {
  let manager: RollbackManager;

  beforeEach(() => {
    manager = new RollbackManager('production', 'us-east-1');
  });

  test('should save deployment snapshot', async () => {
    const snapshot = await manager.saveDeploymentSnapshot('v1.0.0', 'stack-name');
    expect(snapshot.version).toBe('v1.0.0');
    expect(snapshot.timestamp).toBeDefined();
  });

  test('should rollback to previous version', async () => {
    const result = await manager.rollbackToVersion('v0.9.0');
    expect(result.success).toBe(true);
  });

  test('should maintain deployment history of 10 items', () => {
    const deployments = Array.from({ length: 15 }, (_, i) => ({
      version: `v1.${i}.0`,
      timestamp: new Date(),
    }));
    const history = manager.maintainHistory(deployments);
    expect(history.length).toBe(10);
  });
});
