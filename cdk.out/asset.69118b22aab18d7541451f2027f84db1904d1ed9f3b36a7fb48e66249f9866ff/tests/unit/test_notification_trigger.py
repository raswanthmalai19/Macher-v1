"""
Unit tests for NotificationTrigger - Notification service integration.

Tests notification triggering logic, priority handling, retry mechanism,
and error handling.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import json
from urllib.error import HTTPError, URLError
import time

from src.notification_trigger import NotificationTrigger, MockNotificationTrigger
from src.models import (
    AnalysisResult,
    ThreatLevel,
    ScamPattern,
    NotificationError
)


class TestNotificationTriggerInitialization:
    """Test NotificationTrigger initialization."""
    
    def test_initialization_with_valid_url(self):
        """Test successful initialization with valid URL."""
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        assert trigger.notification_service_url == "https://api.example.com/notifications"
        assert trigger.timeout == 5  # Default timeout
    
    def test_initialization_with_custom_timeout(self):
        """Test initialization with custom timeout."""
        trigger = NotificationTrigger("https://api.example.com/notifications", timeout=10)
        
        assert trigger.timeout == 10
    
    def test_initialization_with_empty_url_raises_error(self):
        """Test that empty URL raises ValueError."""
        with pytest.raises(ValueError, match="notification_service_url cannot be empty"):
            NotificationTrigger("")
    
    def test_initialization_with_invalid_url_raises_error(self):
        """Test that invalid URL raises ValueError."""
        with pytest.raises(ValueError, match="must be a valid HTTP"):
            NotificationTrigger("not-a-url")
    
    def test_initialization_accepts_http_url(self):
        """Test that HTTP URL is accepted."""
        trigger = NotificationTrigger("http://localhost:8000/notifications")
        assert trigger.notification_service_url.startswith("http://")
    
    def test_initialization_accepts_https_url(self):
        """Test that HTTPS URL is accepted."""
        trigger = NotificationTrigger("https://api.example.com/notifications")
        assert trigger.notification_service_url.startswith("https://")


class TestTriggerAlert:
    """Test trigger_alert method."""
    
    @pytest.fixture
    def safe_analysis(self):
        """Create analysis result for safe call."""
        return AnalysisResult(
            call_id="test-call-123",
            segment_id="segment-1",
            timestamp=1234567890.0,
            fraud_score=25,
            threat_level=ThreatLevel.SAFE,
            detected_patterns=[],
            confidence_score=0.85,
            explanation="No fraud indicators detected",
            language="en",
            processing_time_ms=150
        )
    
    @pytest.fixture
    def caution_analysis(self):
        """Create analysis result for caution level."""
        return AnalysisResult(
            call_id="test-call-123",
            segment_id="segment-1",
            timestamp=1234567890.0,
            fraud_score=45,
            threat_level=ThreatLevel.CAUTION,
            detected_patterns=[
                ScamPattern(
                    pattern_id="urgency-001",
                    pattern_type="Urgency Indicator",
                    description="Caller creating false urgency",
                    confidence=0.78,
                    matched_indicators=["urgent", "immediately"]
                )
            ],
            confidence_score=78,
            explanation="Some fraud indicators detected",
            language="en",
            processing_time_ms=180
        )
    
    @pytest.fixture
    def danger_analysis(self):
        """Create analysis result for danger level."""
        return AnalysisResult(
            call_id="test-call-123",
            segment_id="segment-1",
            timestamp=1234567890.0,
            fraud_score=85,
            threat_level=ThreatLevel.DANGER,
            detected_patterns=[
                ScamPattern(
                    pattern_id="irs-scam-001",
                    pattern_type="IRS Tax Scam",
                    description="Caller impersonating IRS",
                    confidence=0.95,
                    matched_indicators=["IRS", "tax", "payment"]
                )
            ],
            confidence_score=95,
            explanation="High fraud risk - IRS impersonation detected",
            language="en",
            processing_time_ms=200
        )
    
    @patch('src.notification_trigger.urlopen')
    def test_trigger_alert_for_danger_level(self, mock_urlopen, danger_analysis):
        """Test notification is sent for DANGER threat level."""
        # Setup mock response
        mock_response = MagicMock()
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = None
        mock_urlopen.return_value = mock_response
        
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        # Should not raise
        trigger.trigger_alert("test-call-123", danger_analysis)
        
        # Verify notification was sent
        assert mock_urlopen.called
        
        # Verify request details
        call_args = mock_urlopen.call_args
        request = call_args[0][0]
        
        # Verify URL
        assert request.full_url == "https://api.example.com/notifications"
        
        # Verify method
        assert request.get_method() == 'POST'
        
        # Verify headers
        assert request.headers['Content-type'] == 'application/json'
        
        # Verify payload
        payload = json.loads(request.data.decode('utf-8'))
        assert payload['call_id'] == "test-call-123"
        assert payload['priority'] == "high"
        assert payload['threat_level'] == "Danger"
        assert payload['fraud_score'] == 85
    
    @patch('src.notification_trigger.urlopen')
    def test_trigger_alert_for_caution_level(self, mock_urlopen, caution_analysis):
        """Test notification is sent for CAUTION threat level."""
        mock_response = MagicMock()
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = None
        mock_urlopen.return_value = mock_response
        
        trigger = NotificationTrigger("https://api.example.com/notifications")
        trigger.trigger_alert("test-call-123", caution_analysis)
        
        # Verify notification was sent with medium priority
        call_args = mock_urlopen.call_args
        request = call_args[0][0]
        payload = json.loads(request.data.decode('utf-8'))
        
        assert payload['priority'] == "medium"
        assert payload['threat_level'] == "Caution"
    
    def test_trigger_alert_for_safe_level_no_notification(self, safe_analysis):
        """Test no notification is sent for SAFE threat level."""
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        # Should not raise and should not send notification
        with patch('src.notification_trigger.urlopen') as mock_urlopen:
            trigger.trigger_alert("test-call-123", safe_analysis)
            
            # Verify no notification was sent
            assert not mock_urlopen.called
    
    def test_trigger_alert_empty_call_id_raises_error(self, danger_analysis):
        """Test that empty call_id raises ValueError."""
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        with pytest.raises(ValueError, match="call_id cannot be empty"):
            trigger.trigger_alert("", danger_analysis)
    
    def test_trigger_alert_none_analysis_raises_error(self):
        """Test that None analysis raises ValueError."""
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        with pytest.raises(ValueError, match="analysis cannot be None"):
            trigger.trigger_alert("test-call-123", None)


class TestNotificationPayload:
    """Test notification payload structure."""
    
    @patch('src.notification_trigger.urlopen')
    def test_payload_includes_complete_analysis(self, mock_urlopen):
        """Test that payload includes complete analysis result."""
        mock_response = MagicMock()
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = None
        mock_urlopen.return_value = mock_response
        
        analysis = AnalysisResult(
            call_id="test-call-123",
            segment_id="segment-1",
            timestamp=1234567890.0,
            fraud_score=75,
            threat_level=ThreatLevel.DANGER,
            detected_patterns=[],
            confidence_score=92,
            explanation="High fraud risk",
            language="en",
            processing_time_ms=200
        )
        
        trigger = NotificationTrigger("https://api.example.com/notifications")
        trigger.trigger_alert("test-call-123", analysis)
        
        # Extract payload
        call_args = mock_urlopen.call_args
        request = call_args[0][0]
        payload = json.loads(request.data.decode('utf-8'))
        
        # Verify payload structure
        assert payload['call_id'] == "test-call-123"
        assert payload['priority'] == "high"
        assert payload['threat_level'] == "Danger"
        assert payload['fraud_score'] == 75
        assert payload['confidence_score'] == 92
        assert payload['timestamp'] == 1234567890.0
        assert 'analysis' in payload
        assert payload['notification_type'] == "fraud_alert"
    
    @patch('src.notification_trigger.urlopen')
    def test_payload_priority_mapping(self, mock_urlopen):
        """Test that threat levels map to correct priorities."""
        mock_response = MagicMock()
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = None
        mock_urlopen.return_value = mock_response
        
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        # Test DANGER -> high
        danger_analysis = AnalysisResult(
            call_id="call-1",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=85,
            confidence_score=95,
            threat_level=ThreatLevel.DANGER,
            explanation="Danger",
            language="en",
            processing_time_ms=200
        )
        trigger.trigger_alert("call-1", danger_analysis)
        payload = json.loads(mock_urlopen.call_args[0][0].data.decode('utf-8'))
        assert payload['priority'] == "high"
        
        # Test CAUTION -> medium
        caution_analysis = AnalysisResult(
            call_id="call-2",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=45,
            confidence_score=78,
            threat_level=ThreatLevel.CAUTION,
            explanation="Caution",
            language="en",
            processing_time_ms=180
        )
        trigger.trigger_alert("call-2", caution_analysis)
        payload = json.loads(mock_urlopen.call_args[0][0].data.decode('utf-8'))
        assert payload['priority'] == "medium"


class TestRetryLogic:
    """Test retry logic for failed notifications."""
    
    @patch('src.notification_trigger.urlopen')
    @patch('src.notification_trigger.time.sleep')
    def test_retry_on_http_error(self, mock_sleep, mock_urlopen):
        """Test retry logic on HTTP error."""
        # First call fails, second succeeds
        mock_response = MagicMock()
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = None
        
        mock_urlopen.side_effect = [
            HTTPError("url", 500, "Internal Server Error", {}, None),
            mock_response
        ]
        
        analysis = AnalysisResult(
            call_id="call-123",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=75,
            confidence_score=92,
            threat_level=ThreatLevel.DANGER,
            explanation="Danger",
            language="en",
            processing_time_ms=200
        )
        
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        # Should succeed after retry
        trigger.trigger_alert("call-123", analysis, max_retries=1)
        
        # Verify retry happened
        assert mock_urlopen.call_count == 2
        assert mock_sleep.called
        mock_sleep.assert_called_with(1)  # 1 second delay
    
    @patch('src.notification_trigger.urlopen')
    @patch('src.notification_trigger.time.sleep')
    def test_retry_exhausted_raises_error(self, mock_sleep, mock_urlopen):
        """Test that NotificationError is raised after all retries exhausted."""
        mock_urlopen.side_effect = HTTPError("url", 500, "Internal Server Error", {}, None)
        
        analysis = AnalysisResult(
            call_id="call-123",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=75,
            confidence_score=92,
            threat_level=ThreatLevel.DANGER,
            explanation="Danger",
            language="en",
            processing_time_ms=200
        )
        
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        with pytest.raises(NotificationError, match="Failed to send notification after 2 attempts"):
            trigger.trigger_alert("call-123", analysis, max_retries=1)
        
        # Verify retries happened
        assert mock_urlopen.call_count == 2
    
    @patch('src.notification_trigger.urlopen')
    def test_no_retry_on_success(self, mock_urlopen):
        """Test that no retry happens on successful notification."""
        mock_response = MagicMock()
        mock_response.getcode.return_value = 200
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = None
        mock_urlopen.return_value = mock_response
        
        analysis = AnalysisResult(
            call_id="call-123",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=75,
            confidence_score=92,
            threat_level=ThreatLevel.DANGER,
            explanation="Danger",
            language="en",
            processing_time_ms=200
        )
        
        trigger = NotificationTrigger("https://api.example.com/notifications")
        trigger.trigger_alert("call-123", analysis, max_retries=1)
        
        # Should only call once
        assert mock_urlopen.call_count == 1


class TestErrorHandling:
    """Test error handling for various failure scenarios."""
    
    @patch('src.notification_trigger.urlopen')
    def test_http_error_raises_notification_error(self, mock_urlopen):
        """Test that HTTP error raises NotificationError."""
        mock_urlopen.side_effect = HTTPError("url", 404, "Not Found", {}, None)
        
        analysis = AnalysisResult(
            call_id="call-123",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=75,
            confidence_score=92,
            threat_level=ThreatLevel.DANGER,
            explanation="Danger",
            language="en",
            processing_time_ms=200
        )
        
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        with pytest.raises(NotificationError, match="HTTP error sending notification"):
            trigger.trigger_alert("call-123", analysis, max_retries=0)
    
    @patch('src.notification_trigger.urlopen')
    def test_url_error_raises_notification_error(self, mock_urlopen):
        """Test that URL error raises NotificationError."""
        mock_urlopen.side_effect = URLError("Connection refused")
        
        analysis = AnalysisResult(
            call_id="call-123",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=75,
            confidence_score=92,
            threat_level=ThreatLevel.DANGER,
            explanation="Danger",
            language="en",
            processing_time_ms=200
        )
        
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        with pytest.raises(NotificationError, match="URL error sending notification"):
            trigger.trigger_alert("call-123", analysis, max_retries=0)
    
    @patch('src.notification_trigger.urlopen')
    def test_timeout_error_raises_notification_error(self, mock_urlopen):
        """Test that timeout error raises NotificationError."""
        mock_urlopen.side_effect = TimeoutError("Request timed out")
        
        analysis = AnalysisResult(
            call_id="call-123",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=75,
            confidence_score=92,
            threat_level=ThreatLevel.DANGER,
            explanation="Danger",
            language="en",
            processing_time_ms=200
        )
        
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        with pytest.raises(NotificationError, match="Timeout sending notification"):
            trigger.trigger_alert("call-123", analysis, max_retries=0)
    
    @patch('src.notification_trigger.urlopen')
    def test_unexpected_error_raises_notification_error(self, mock_urlopen):
        """Test that unexpected error raises NotificationError."""
        mock_urlopen.side_effect = RuntimeError("Unexpected error")
        
        analysis = AnalysisResult(
            call_id="call-123",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=75,
            confidence_score=92,
            threat_level=ThreatLevel.DANGER,
            explanation="Danger",
            language="en",
            processing_time_ms=200
        )
        
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        with pytest.raises(NotificationError, match="Unexpected error sending notification"):
            trigger.trigger_alert("call-123", analysis, max_retries=0)
    
    @patch('src.notification_trigger.urlopen')
    def test_non_200_status_code_raises_error(self, mock_urlopen):
        """Test that non-200 status code raises NotificationError."""
        mock_response = MagicMock()
        mock_response.getcode.return_value = 400
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = None
        mock_urlopen.return_value = mock_response
        
        analysis = AnalysisResult(
            call_id="call-123",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=75,
            confidence_score=92,
            threat_level=ThreatLevel.DANGER,
            explanation="Danger",
            language="en",
            processing_time_ms=200
        )
        
        trigger = NotificationTrigger("https://api.example.com/notifications")
        
        with pytest.raises(NotificationError, match="Notification service returned status 400"):
            trigger.trigger_alert("call-123", analysis, max_retries=0)


class TestMockNotificationTrigger:
    """Test MockNotificationTrigger for testing and development."""
    
    def test_mock_trigger_stores_notifications(self):
        """Test that mock trigger stores notifications in memory."""
        trigger = MockNotificationTrigger()
        
        analysis = AnalysisResult(
            call_id="call-123",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=75,
            confidence_score=92,
            threat_level=ThreatLevel.DANGER,
            explanation="Danger",
            language="en",
            processing_time_ms=200
        )
        
        trigger.trigger_alert("call-123", analysis)
        
        notifications = trigger.get_notifications()
        assert len(notifications) == 1
        assert notifications[0]['payload']['call_id'] == "call-123"
    
    def test_mock_trigger_multiple_notifications(self):
        """Test storing multiple notifications."""
        trigger = MockNotificationTrigger()
        
        for i in range(3):
            analysis = AnalysisResult(
                call_id=f"call-{i}",
                segment_id="seg-1",
                timestamp=1234567890.0,
                fraud_score=75,
                confidence_score=92,
                threat_level=ThreatLevel.DANGER,
                explanation="Danger",
                language="en",
                processing_time_ms=200
            )
            trigger.trigger_alert(f"call-{i}", analysis)
        
        notifications = trigger.get_notifications()
        assert len(notifications) == 3
    
    def test_mock_trigger_clear_notifications(self):
        """Test clearing stored notifications."""
        trigger = MockNotificationTrigger()
        
        analysis = AnalysisResult(
            call_id="call-123",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=75,
            confidence_score=92,
            threat_level=ThreatLevel.DANGER,
            explanation="Danger",
            language="en",
            processing_time_ms=200
        )
        trigger.trigger_alert("call-123", analysis)
        
        assert len(trigger.get_notifications()) == 1
        
        trigger.clear_notifications()
        
        assert len(trigger.get_notifications()) == 0
    
    def test_mock_trigger_no_http_requests(self):
        """Test that mock trigger doesn't make HTTP requests."""
        trigger = MockNotificationTrigger()
        
        analysis = AnalysisResult(
            call_id="call-123",
            segment_id="seg-1",
            timestamp=1234567890.0,
            fraud_score=75,
            confidence_score=92,
            threat_level=ThreatLevel.DANGER,
            explanation="Danger",
            language="en",
            processing_time_ms=200
        )
        
        # Should not raise even without network
        with patch('src.notification_trigger.urlopen') as mock_urlopen:
            trigger.trigger_alert("call-123", analysis)
            
            # Verify no HTTP request was made
            assert not mock_urlopen.called
