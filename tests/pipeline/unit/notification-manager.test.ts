/**
 * Unit Tests for NotificationManager
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

import { NotificationManager } from '../../../pipeline/notify/NotificationManager';

describe('NotificationManager Unit Tests', () => {
  let manager: NotificationManager;

  beforeEach(() => {
    manager = new NotificationManager();
  });

  test('should send Slack notification', async () => {
    const result = await manager.sendSlackNotification('Test message', 'https://hooks.slack.com/test');
    expect(result.success).toBe(true);
  });

  test('should format notification with metadata', () => {
    const notification = manager.formatNotification({
      environment: 'production',
      status: 'success',
      commitHash: 'abc123',
      timestamp: new Date(),
    });
    expect(notification).toContain('production');
    expect(notification).toContain('success');
    expect(notification).toContain('abc123');
  });

  test('should send to multiple channels', async () => {
    const results = await manager.sendToChannels('Test', ['slack', 'email']);
    expect(results.length).toBe(2);
  });
});
