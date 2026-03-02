/**
 * Unit Tests for DriftDetector
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import { DriftDetector } from '../../../pipeline/deploy/DriftDetector';

describe('DriftDetector Unit Tests', () => {
  let detector: DriftDetector;

  beforeEach(() => {
    detector = new DriftDetector('production', 'us-east-1');
  });

  test('should detect stack drift', async () => {
    const result = await detector.detectStackDrift('my-stack');
    expect(result.driftStatus).toBeDefined();
  });

  test('should generate drift report', async () => {
    const report = await detector.generateDriftReport('my-stack');
    expect(report.stackName).toBe('my-stack');
    expect(report.driftedResources).toBeDefined();
  });

  test('should have daily schedule', () => {
    const schedule = detector.getSchedule();
    expect(schedule.frequency).toBe('daily');
    expect(schedule.hour).toBeGreaterThanOrEqual(0);
    expect(schedule.hour).toBeLessThan(24);
  });
});
