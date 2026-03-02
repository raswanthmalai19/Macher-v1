"""
CostMonitor - AWS cost tracking and Free Tier compliance monitoring

Queries AWS Cost Explorer to track spending, compares against Free Tier limits,
generates cost trends, predicts monthly costs, and sends alerts on threshold breaches.

Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from enum import Enum

# AWS SDK imports (boto3)
try:
    import boto3
    from botocore.exceptions import ClientError, BotoCoreError
except ImportError:
    # Allow module to be imported even if boto3 is not installed (for testing)
    boto3 = None
    ClientError = Exception
    BotoCoreError = Exception


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CostTrend(str, Enum):
    """Cost trend direction"""
    INCREASING = "increasing"
    STABLE = "stable"
    DECREASING = "decreasing"


@dataclass
class FreeTierLimits:
    """AWS Free Tier limits for VocalShield services"""
    lambda_invocations: int = 1_000_000  # 1M requests/month
    lambda_gb_seconds: int = 400_000  # 400K GB-seconds/month
    dynamodb_read_units: int = 25  # 25 RCU
    dynamodb_write_units: int = 25  # 25 WCU
    dynamodb_storage_gb: int = 25  # 25 GB
    api_gateway_requests: int = 1_000_000  # 1M requests/month
    cloudwatch_metrics: int = 10  # 10 custom metrics
    cloudwatch_logs_gb: int = 5  # 5 GB ingestion


@dataclass
class FreeTierUsage:
    """Current Free Tier usage"""
    lambda_invocations: int
    lambda_gb_seconds: float
    dynamodb_read_units: int
    dynamodb_write_units: int
    dynamodb_storage_gb: float
    api_gateway_requests: int
    
    def percent_of_limit(self, limits: FreeTierLimits) -> Dict[str, float]:
        """Calculate percentage of Free Tier limits used"""
        return {
            'lambda_invocations': (self.lambda_invocations / limits.lambda_invocations) * 100,
            'lambda_gb_seconds': (self.lambda_gb_seconds / limits.lambda_gb_seconds) * 100,
            'dynamodb_read_units': (self.dynamodb_read_units / limits.dynamodb_read_units) * 100,
            'dynamodb_write_units': (self.dynamodb_write_units / limits.dynamodb_write_units) * 100,
            'dynamodb_storage_gb': (self.dynamodb_storage_gb / limits.dynamodb_storage_gb) * 100,
            'api_gateway_requests': (self.api_gateway_requests / limits.api_gateway_requests) * 100,
        }


@dataclass
class CostReport:
    """Cost report for an environment"""
    environment: str
    period_start: datetime
    period_end: datetime
    total_cost: float
    free_tier_usage: FreeTierUsage
    resource_breakdown: Dict[str, float]
    trend: CostTrend
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'environment': self.environment,
            'period_start': self.period_start.isoformat(),
            'period_end': self.period_end.isoformat(),
            'total_cost': self.total_cost,
            'free_tier_usage': asdict(self.free_tier_usage),
            'resource_breakdown': self.resource_breakdown,
            'trend': self.trend.value
        }


@dataclass
class DataPoint:
    """Single data point for trend analysis"""
    timestamp: datetime
    value: float


class CostMonitor:
    """
    Monitors AWS costs and Free Tier usage for VocalShield deployments
    
    Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
    """
    
    def __init__(self, region: str = 'us-east-1'):
        """
        Initialize CostMonitor
        
        Args:
            region: AWS region for Cost Explorer API (must be us-east-1)
        """
        if boto3 is None:
            raise ImportError("boto3 is required for CostMonitor. Install with: pip install boto3")
        
        # Cost Explorer API is only available in us-east-1
        self.ce_client = boto3.client('ce', region_name='us-east-1')
        self.cloudwatch_client = boto3.client('cloudwatch', region_name=region)
        self.region = region
        self.free_tier_limits = FreeTierLimits()
        
        logger.info(f"CostMonitor initialized for region {region}")
    
    def query_current_costs(self, environment: str) -> CostReport:
        """
        Query current costs for an environment using AWS Cost Explorer
        
        Args:
            environment: Environment name (dev, staging, production)
            
        Returns:
            CostReport with current cost information
            
        Requirements: 10.1
        """
        try:
            logger.info(f"Querying costs for environment: {environment}")
            
            # Get current month date range
            end_date = datetime.now()
            start_date = end_date.replace(day=1)
            
            # Query Cost Explorer
            response = self.ce_client.get_cost_and_usage(
                TimePeriod={
                    'Start': start_date.strftime('%Y-%m-%d'),
                    'End': end_date.strftime('%Y-%m-%d')
                },
                Granularity='MONTHLY',
                Metrics=['UnblendedCost'],
                Filter={
                    'Tags': {
                        'Key': 'Environment',
                        'Values': [environment]
                    }
                },
                GroupBy=[
                    {
                        'Type': 'SERVICE',
                        'Key': 'SERVICE'
                    }
                ]
            )
            
            # Parse response
            total_cost = 0.0
            resource_breakdown = {}
            
            if response['ResultsByTime']:
                for group in response['ResultsByTime'][0]['Groups']:
                    service = group['Keys'][0]
                    cost = float(group['Metrics']['UnblendedCost']['Amount'])
                    resource_breakdown[service] = cost
                    total_cost += cost
            
            # Get Free Tier usage
            free_tier_usage = self._query_free_tier_usage(environment)
            
            # Generate trend
            trend = self._calculate_trend(environment, 30)
            
            report = CostReport(
                environment=environment,
                period_start=start_date,
                period_end=end_date,
                total_cost=total_cost,
                free_tier_usage=free_tier_usage,
                resource_breakdown=resource_breakdown,
                trend=trend
            )
            
            logger.info(f"Cost query completed: ${total_cost:.2f}")
            return report
            
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to query costs: {e}")
            raise
    
    def compare_against_free_tier(self, usage: FreeTierUsage) -> Tuple[bool, List[str]]:
        """
        Compare current usage against Free Tier limits
        
        Args:
            usage: Current Free Tier usage
            
        Returns:
            Tuple of (is_compliant, list of warnings)
            
        Requirements: 10.2
        """
        logger.info("Comparing usage against Free Tier limits")
        
        percentages = usage.percent_of_limit(self.free_tier_limits)
        warnings = []
        is_compliant = True
        
        for service, percent in percentages.items():
            if percent > 100:
                is_compliant = False
                warnings.append(f"{service}: {percent:.1f}% (EXCEEDED FREE TIER)")
            elif percent > 80:
                warnings.append(f"{service}: {percent:.1f}% (WARNING: approaching limit)")
        
        logger.info(f"Free Tier compliance: {is_compliant}, warnings: {len(warnings)}")
        return is_compliant, warnings
    
    def generate_cost_trend(self, environment: str, days: int = 30) -> List[DataPoint]:
        """
        Generate cost trend analysis for the specified number of days
        
        Args:
            environment: Environment name
            days: Number of days to analyze (default: 30)
            
        Returns:
            List of DataPoint objects showing daily costs
            
        Requirements: 10.4
        """
        try:
            logger.info(f"Generating {days}-day cost trend for {environment}")
            
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
            
            response = self.ce_client.get_cost_and_usage(
                TimePeriod={
                    'Start': start_date.strftime('%Y-%m-%d'),
                    'End': end_date.strftime('%Y-%m-%d')
                },
                Granularity='DAILY',
                Metrics=['UnblendedCost'],
                Filter={
                    'Tags': {
                        'Key': 'Environment',
                        'Values': [environment]
                    }
                }
            )
            
            data_points = []
            for result in response['ResultsByTime']:
                timestamp = datetime.strptime(result['TimePeriod']['Start'], '%Y-%m-%d')
                cost = float(result['Total']['UnblendedCost']['Amount'])
                data_points.append(DataPoint(timestamp=timestamp, value=cost))
            
            logger.info(f"Generated {len(data_points)} data points")
            return data_points
            
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to generate cost trend: {e}")
            raise
    
    def predict_monthly_cost(self, environment: str) -> float:
        """
        Predict monthly cost based on current usage trends
        
        Args:
            environment: Environment name
            
        Returns:
            Predicted monthly cost in USD
            
        Requirements: 10.5
        """
        try:
            logger.info(f"Predicting monthly cost for {environment}")
            
            # Get current month's costs so far
            end_date = datetime.now()
            start_date = end_date.replace(day=1)
            days_elapsed = (end_date - start_date).days + 1
            
            response = self.ce_client.get_cost_and_usage(
                TimePeriod={
                    'Start': start_date.strftime('%Y-%m-%d'),
                    'End': end_date.strftime('%Y-%m-%d')
                },
                Granularity='MONTHLY',
                Metrics=['UnblendedCost'],
                Filter={
                    'Tags': {
                        'Key': 'Environment',
                        'Values': [environment]
                    }
                }
            )
            
            current_cost = 0.0
            if response['ResultsByTime']:
                current_cost = float(response['ResultsByTime'][0]['Total']['UnblendedCost']['Amount'])
            
            # Calculate days in current month
            if end_date.month == 12:
                next_month = end_date.replace(year=end_date.year + 1, month=1, day=1)
            else:
                next_month = end_date.replace(month=end_date.month + 1, day=1)
            days_in_month = (next_month - start_date).days
            
            # Predict based on daily average
            daily_average = current_cost / days_elapsed if days_elapsed > 0 else 0
            predicted_cost = daily_average * days_in_month
            
            logger.info(f"Predicted monthly cost: ${predicted_cost:.2f}")
            return predicted_cost
            
        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to predict monthly cost: {e}")
            raise
    
    def send_cost_alert(
        self,
        environment: str,
        current_cost: float,
        threshold: float,
        webhook_url: Optional[str] = None
    ) -> None:
        """
        Send cost alert when threshold is breached
        
        Args:
            environment: Environment name
            current_cost: Current cost in USD
            threshold: Threshold percentage (e.g., 80 for 80%)
            webhook_url: Optional webhook URL for notifications
            
        Requirements: 10.3, 10.6
        """
        logger.warning(
            f"Cost alert for {environment}: ${current_cost:.2f} "
            f"({threshold}% of Free Tier limit)"
        )
        
        alert_message = {
            'type': 'warning',
            'environment': environment,
            'message': f'Cost threshold breach: {threshold}% of Free Tier limit',
            'current_cost': current_cost,
            'threshold': threshold,
            'timestamp': datetime.now().isoformat()
        }
        
        # Log alert
        logger.warning(f"Cost alert: {json.dumps(alert_message, indent=2)}")
        
        # Send to webhook if provided
        if webhook_url:
            try:
                import requests
                response = requests.post(
                    webhook_url,
                    json=alert_message,
                    timeout=10
                )
                response.raise_for_status()
                logger.info("Cost alert sent to webhook")
            except Exception as e:
                logger.error(f"Failed to send cost alert to webhook: {e}")
    
    def _query_free_tier_usage(self, environment: str) -> FreeTierUsage:
        """
        Query Free Tier usage metrics from CloudWatch
        
        Args:
            environment: Environment name
            
        Returns:
            FreeTierUsage object with current usage
        """
        # In a real implementation, this would query CloudWatch metrics
        # For now, return placeholder values
        logger.info(f"Querying Free Tier usage for {environment}")
        
        # TODO: Implement actual CloudWatch metric queries
        # This would query metrics like:
        # - AWS/Lambda Invocations
        # - AWS/Lambda Duration
        # - AWS/DynamoDB ConsumedReadCapacityUnits
        # - AWS/DynamoDB ConsumedWriteCapacityUnits
        # - AWS/ApiGateway Count
        
        return FreeTierUsage(
            lambda_invocations=0,
            lambda_gb_seconds=0.0,
            dynamodb_read_units=0,
            dynamodb_write_units=0,
            dynamodb_storage_gb=0.0,
            api_gateway_requests=0
        )
    
    def _calculate_trend(self, environment: str, days: int) -> CostTrend:
        """
        Calculate cost trend direction
        
        Args:
            environment: Environment name
            days: Number of days to analyze
            
        Returns:
            CostTrend enum value
        """
        try:
            data_points = self.generate_cost_trend(environment, days)
            
            if len(data_points) < 2:
                return CostTrend.STABLE
            
            # Calculate simple linear trend
            first_half = data_points[:len(data_points)//2]
            second_half = data_points[len(data_points)//2:]
            
            first_avg = sum(dp.value for dp in first_half) / len(first_half)
            second_avg = sum(dp.value for dp in second_half) / len(second_half)
            
            # Determine trend with 10% threshold
            change_percent = ((second_avg - first_avg) / first_avg * 100) if first_avg > 0 else 0
            
            if change_percent > 10:
                return CostTrend.INCREASING
            elif change_percent < -10:
                return CostTrend.DECREASING
            else:
                return CostTrend.STABLE
                
        except Exception as e:
            logger.warning(f"Failed to calculate trend: {e}")
            return CostTrend.STABLE


def main():
    """Example usage of CostMonitor"""
    try:
        monitor = CostMonitor()
        
        # Query current costs
        report = monitor.query_current_costs('dev')
        print(f"\nCost Report for {report.environment}:")
        print(f"Total Cost: ${report.total_cost:.2f}")
        print(f"Trend: {report.trend.value}")
        print(f"\nResource Breakdown:")
        for service, cost in report.resource_breakdown.items():
            print(f"  {service}: ${cost:.2f}")
        
        # Check Free Tier compliance
        is_compliant, warnings = monitor.compare_against_free_tier(report.free_tier_usage)
        print(f"\nFree Tier Compliant: {is_compliant}")
        if warnings:
            print("Warnings:")
            for warning in warnings:
                print(f"  - {warning}")
        
        # Predict monthly cost
        predicted = monitor.predict_monthly_cost('dev')
        print(f"\nPredicted Monthly Cost: ${predicted:.2f}")
        
        # Send alert if needed
        if not is_compliant or predicted > 10:
            monitor.send_cost_alert('dev', report.total_cost, 80)
        
    except Exception as e:
        logger.error(f"Error in main: {e}")
        raise


if __name__ == '__main__':
    main()
