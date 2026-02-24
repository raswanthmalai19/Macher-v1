"""
Notification Trigger

This module provides the NotificationTrigger class for sending fraud alerts
to the notification service when high or medium threat levels are detected.

Requirements: 15.1, 15.2, 15.3
"""

import json
import time
from typing import Optional, TYPE_CHECKING
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

from .models import NotificationError, ThreatLevel

if TYPE_CHECKING:
    from .models import AnalysisResult


class NotificationTrigger:
    """
    Triggers notifications when fraud is detected.
    
    Sends alerts to the notification service with priority levels based on
    threat level. Implements retry logic for reliability.
    """
    
    def __init__(self, notification_service_url: str, timeout: int = 5):
        """
        Initialize notification trigger.
        
        Args:
            notification_service_url: URL of the notification service endpoint
            timeout: Request timeout in seconds (default: 5)
            
        Raises:
            ValueError: If notification_service_url is empty or invalid
        """
        if not notification_service_url:
            raise ValueError("notification_service_url cannot be empty")
        
        if not notification_service_url.startswith(("http://", "https://")):
            raise ValueError("notification_service_url must be a valid HTTP(S) URL")
        
        self.notification_service_url = notification_service_url
        self.timeout = timeout
    
    def trigger_alert(
        self,
        call_id: str,
        analysis: 'AnalysisResult',
        max_retries: int = 1
    ) -> None:
        """
        Trigger notification for fraud alert.
        
        Sends notification to the notification service with priority level
        based on threat level:
        - Danger: high priority
        - Caution: medium priority
        - Safe: no notification (unless explicitly configured)
        
        Args:
            call_id: Unique call identifier
            analysis: Analysis result triggering the alert
            max_retries: Maximum number of retry attempts (default: 1)
            
        Raises:
            NotificationError: If notification fails after all retries
            
        Requirements: 15.1, 15.2, 15.3
        """
        if not call_id:
            raise ValueError("call_id cannot be empty")
        
        if not analysis:
            raise ValueError("analysis cannot be None")
        
        # Determine if notification should be sent
        should_notify = self._should_notify(analysis.threat_level)
        if not should_notify:
            return  # No notification needed for Safe calls
        
        # Build notification payload
        payload = self._build_payload(call_id, analysis)
        
        # Send notification with retry logic
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                self._send_notification(payload)
                return  # Success
            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    # Wait before retry (1 second delay)
                    time.sleep(1)
                    continue
                else:
                    # All retries exhausted
                    raise NotificationError(
                        f"Failed to send notification after {max_retries + 1} attempts: {str(e)}"
                    ) from e
    
    def _should_notify(self, threat_level: ThreatLevel) -> bool:
        """
        Determine if notification should be sent based on threat level.
        
        Args:
            threat_level: Threat level from analysis
            
        Returns:
            True if notification should be sent, False otherwise
            
        Requirements: 15.5
        """
        # Send notifications for Caution and Danger, not for Safe
        return threat_level in [ThreatLevel.CAUTION, ThreatLevel.DANGER]
    
    def _build_payload(self, call_id: str, analysis: 'AnalysisResult') -> dict:
        """
        Build notification payload from analysis result.
        
        Args:
            call_id: Unique call identifier
            analysis: Analysis result
            
        Returns:
            Notification payload dictionary
            
        Requirements: 15.3
        """
        # Determine priority based on threat level
        priority = self._get_priority(analysis.threat_level)
        
        # Build payload with complete analysis result
        payload = {
            "call_id": call_id,
            "priority": priority,
            "threat_level": analysis.threat_level.value,
            "fraud_score": analysis.fraud_score,
            "confidence_score": analysis.confidence_score,
            "timestamp": analysis.timestamp,
            "analysis": analysis.to_dict(),
            "notification_type": "fraud_alert"
        }
        
        return payload
    
    def _get_priority(self, threat_level: ThreatLevel) -> str:
        """
        Get notification priority based on threat level.
        
        Args:
            threat_level: Threat level from analysis
            
        Returns:
            Priority string ("high", "medium", or "low")
            
        Requirements: 15.1, 15.2
        """
        if threat_level == ThreatLevel.DANGER:
            return "high"
        elif threat_level == ThreatLevel.CAUTION:
            return "medium"
        else:
            return "low"
    
    def _send_notification(self, payload: dict) -> None:
        """
        Send notification to the notification service.
        
        Args:
            payload: Notification payload dictionary
            
        Raises:
            NotificationError: If HTTP request fails
        """
        # Convert payload to JSON
        json_data = json.dumps(payload).encode('utf-8')
        
        # Create HTTP request
        request = Request(
            self.notification_service_url,
            data=json_data,
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'VocalShield-FraudDetection/1.0'
            },
            method='POST'
        )
        
        try:
            # Send request
            with urlopen(request, timeout=self.timeout) as response:
                status_code = response.getcode()
                
                # Check for successful response
                if status_code not in [200, 201, 202]:
                    raise NotificationError(
                        f"Notification service returned status {status_code}"
                    )
        
        except HTTPError as e:
            raise NotificationError(
                f"HTTP error sending notification: {e.code} {e.reason}"
            ) from e
        
        except URLError as e:
            raise NotificationError(
                f"URL error sending notification: {e.reason}"
            ) from e
        
        except TimeoutError as e:
            raise NotificationError(
                f"Timeout sending notification after {self.timeout}s"
            ) from e
        
        except Exception as e:
            raise NotificationError(
                f"Unexpected error sending notification: {str(e)}"
            ) from e


class MockNotificationTrigger(NotificationTrigger):
    """
    Mock notification trigger for testing and development.
    
    Stores notifications in memory instead of sending HTTP requests.
    """
    
    def __init__(self):
        """Initialize mock notification trigger."""
        super().__init__("http://localhost:8000/notifications")
        self.notifications = []
    
    def _send_notification(self, payload: dict) -> None:
        """
        Store notification in memory instead of sending.
        
        Args:
            payload: Notification payload dictionary
        """
        self.notifications.append({
            "timestamp": time.time(),
            "payload": payload
        })
    
    def get_notifications(self) -> list:
        """
        Get all stored notifications.
        
        Returns:
            List of notification dictionaries
        """
        return self.notifications
    
    def clear_notifications(self) -> None:
        """Clear all stored notifications."""
        self.notifications = []
