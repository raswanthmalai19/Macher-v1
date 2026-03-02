"""
Unit Tests for CostMonitor
Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
"""

import unittest
from pipeline.cost.cost_monitor import CostMonitor


class TestCostMonitor(unittest.TestCase):
    def setUp(self):
        self.monitor = CostMonitor('us-east-1')

    def test_query_current_costs(self):
        """Should query current AWS costs"""
        costs = self.monitor.query_current_costs()
        self.assertIsNotNone(costs)
        self.assertIn('total', costs)

    def test_compare_against_free_tier(self):
        """Should compare costs against Free Tier limits"""
        result = self.monitor.compare_against_free_tier(150.0, 200.0)
        self.assertEqual(result['percentage'], 75.0)
        self.assertFalse(result['exceeded'])

    def test_alert_at_80_percent(self):
        """Should alert when costs reach 80% of Free Tier"""
        should_alert = self.monitor.should_alert(160.0, 200.0)
        self.assertTrue(should_alert)

    def test_no_alert_below_threshold(self):
        """Should not alert when costs are below 80%"""
        should_alert = self.monitor.should_alert(150.0, 200.0)
        self.assertFalse(should_alert)


if __name__ == '__main__':
    unittest.main()
