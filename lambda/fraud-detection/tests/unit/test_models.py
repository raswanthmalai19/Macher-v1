"""
Unit tests for data model classes.

Tests all dataclasses and their methods including serialization,
extraction methods, and enum values.
"""

import pytest
from src.models import (
    ThreatLevel,
    ScamPattern,
    ConversationSegment,
    ConversationContext,
    AnalysisResult,
    RedactionResult,
    AgentResponse,
    ErrorResponse,
    FraudDetectionError,
    UnsupportedLanguageError,
    GuardrailsError,
    BedrockAgentError,
    ContextStoreError,
    NotificationError
)


class TestThreatLevel:
    """Test ThreatLevel enum."""
    
    def test_threat_level_values(self):
        """Test that ThreatLevel has correct values."""
        assert ThreatLevel.SAFE.value == "Safe"
        assert ThreatLevel.CAUTION.value == "Caution"
        assert ThreatLevel.DANGER.value == "Danger"
    
    def test_threat_level_count(self):
        """Test that ThreatLevel has exactly 3 levels."""
        assert len(ThreatLevel) == 3


class TestScamPattern:
    """Test ScamPattern dataclass."""
    
    def test_scam_pattern_creation(self):
        """Test creating a ScamPattern instance."""
        pattern = ScamPattern(
            pattern_id="irs-001",
            pattern_type="IRS Scam",
            description="IRS tax scam",
            confidence=0.85,
            matched_indicators=["urgent payment", "arrest threat"]
        )
        
        assert pattern.pattern_id == "irs-001"
        assert pattern.pattern_type == "IRS Scam"
        assert pattern.description == "IRS tax scam"
        assert pattern.confidence == 0.85
        assert len(pattern.matched_indicators) == 2
    
    def test_scam_pattern_to_dict(self):
        """Test ScamPattern.to_dict() method."""
        pattern = ScamPattern(
            pattern_id="tech-001",
            pattern_type="Tech Support Scam",
            description="Fake tech support",
            confidence=0.9,
            matched_indicators=["computer virus", "remote access"]
        )
        
        result = pattern.to_dict()
        
        assert isinstance(result, dict)
        assert result["pattern_id"] == "tech-001"
        assert result["pattern_type"] == "Tech Support Scam"
        assert result["description"] == "Fake tech support"
        assert result["confidence"] == 0.9
        assert result["matched_indicators"] == ["computer virus", "remote access"]


class TestConversationSegment:
    """Test ConversationSegment dataclass."""
    
    def test_conversation_segment_creation(self):
        """Test creating a ConversationSegment instance."""
        segment = ConversationSegment(
            segment_id="seg-001",
            timestamp=1234567890.0,
            transcript_text="This is a test transcript",
            fraud_score=45,
            threat_level=ThreatLevel.CAUTION
        )
        
        assert segment.segment_id == "seg-001"
        assert segment.timestamp == 1234567890.0
        assert segment.transcript_text == "This is a test transcript"
        assert segment.fraud_score == 45
        assert segment.threat_level == ThreatLevel.CAUTION
    
    def test_conversation_segment_to_dict(self):
        """Test ConversationSegment.to_dict() method."""
        segment = ConversationSegment(
            segment_id="seg-002",
            timestamp=1234567891.0,
            transcript_text="Another transcript",
            fraud_score=75,
            threat_level=ThreatLevel.DANGER
        )
        
        result = segment.to_dict()
        
        assert isinstance(result, dict)
        assert result["segment_id"] == "seg-002"
        assert result["timestamp"] == 1234567891.0
        assert result["transcript_text"] == "Another transcript"
        assert result["fraud_score"] == 75
        assert result["threat_level"] == "Danger"


class TestConversationContext:
    """Test ConversationContext dataclass."""
    
    def test_conversation_context_creation(self):
        """Test creating a ConversationContext instance."""
        context = ConversationContext(
            call_id="call-001",
            segments=[],
            cumulative_fraud_score=0,
            detected_patterns=[],
            language="en"
        )
        
        assert context.call_id == "call-001"
        assert len(context.segments) == 0
        assert context.cumulative_fraud_score == 0
        assert len(context.detected_patterns) == 0
        assert context.language == "en"
    
    def test_conversation_context_defaults(self):
        """Test ConversationContext default values."""
        context = ConversationContext(call_id="call-002")
        
        assert context.segments == []
        assert context.cumulative_fraud_score == 0
        assert context.detected_patterns == []
        assert context.language == "en"
    
    def test_get_context_summary_empty(self):
        """Test get_context_summary() with no segments."""
        context = ConversationContext(call_id="call-003")
        summary = context.get_context_summary()
        
        assert summary == "No previous conversation history."
    
    def test_get_context_summary_with_segments(self):
        """Test get_context_summary() with segments."""
        segment1 = ConversationSegment(
            segment_id="seg-001",
            timestamp=1234567890.0,
            transcript_text="First segment text",
            fraud_score=20,
            threat_level=ThreatLevel.SAFE
        )
        segment2 = ConversationSegment(
            segment_id="seg-002",
            timestamp=1234567891.0,
            transcript_text="Second segment text",
            fraud_score=50,
            threat_level=ThreatLevel.CAUTION
        )
        
        pattern = ScamPattern(
            pattern_id="irs-001",
            pattern_type="IRS Scam",
            description="IRS scam detected",
            confidence=0.8,
            matched_indicators=["tax debt"]
        )
        
        context = ConversationContext(
            call_id="call-004",
            segments=[segment1, segment2],
            cumulative_fraud_score=70,
            detected_patterns=[pattern],
            language="en"
        )
        
        summary = context.get_context_summary()
        
        assert "2 segments" in summary
        assert "Cumulative fraud score: 70" in summary
        assert "IRS Scam" in summary
        assert "seg-001" in summary
        assert "seg-002" in summary
    
    def test_conversation_context_to_dict(self):
        """Test ConversationContext.to_dict() method."""
        segment = ConversationSegment(
            segment_id="seg-001",
            timestamp=1234567890.0,
            transcript_text="Test",
            fraud_score=30,
            threat_level=ThreatLevel.SAFE
        )
        
        pattern = ScamPattern(
            pattern_id="test-001",
            pattern_type="Test Pattern",
            description="Test",
            confidence=0.7,
            matched_indicators=[]
        )
        
        context = ConversationContext(
            call_id="call-005",
            segments=[segment],
            cumulative_fraud_score=30,
            detected_patterns=[pattern],
            language="es"
        )
        
        result = context.to_dict()
        
        assert isinstance(result, dict)
        assert result["call_id"] == "call-005"
        assert len(result["segments"]) == 1
        assert result["cumulative_fraud_score"] == 30
        assert len(result["detected_patterns"]) == 1
        assert result["language"] == "es"


class TestAnalysisResult:
    """Test AnalysisResult dataclass."""
    
    def test_analysis_result_creation(self):
        """Test creating an AnalysisResult instance."""
        result = AnalysisResult(
            call_id="call-001",
            segment_id="seg-001",
            timestamp=1234567890.0,
            fraud_score=65,
            confidence_score=80,
            threat_level=ThreatLevel.DANGER,
            detected_patterns=[],
            urgency_detected=True,
            financial_demand_detected=True,
            financial_demand_type="gift card",
            explanation="High fraud risk detected",
            language="en",
            processing_time_ms=150
        )
        
        assert result.call_id == "call-001"
        assert result.segment_id == "seg-001"
        assert result.fraud_score == 65
        assert result.confidence_score == 80
        assert result.threat_level == ThreatLevel.DANGER
        assert result.urgency_detected is True
        assert result.financial_demand_detected is True
        assert result.financial_demand_type == "gift card"
        assert result.explanation == "High fraud risk detected"
        assert result.processing_time_ms == 150
    
    def test_analysis_result_defaults(self):
        """Test AnalysisResult default values."""
        result = AnalysisResult(
            call_id="call-002",
            segment_id="seg-002",
            timestamp=1234567890.0,
            fraud_score=10,
            confidence_score=90,
            threat_level=ThreatLevel.SAFE
        )
        
        assert result.detected_patterns == []
        assert result.urgency_detected is False
        assert result.financial_demand_detected is False
        assert result.financial_demand_type is None
        assert result.explanation == ""
        assert result.language == "en"
        assert result.processing_time_ms == 0
    
    def test_analysis_result_to_dict(self):
        """Test AnalysisResult.to_dict() method."""
        pattern = ScamPattern(
            pattern_id="irs-001",
            pattern_type="IRS Scam",
            description="IRS scam",
            confidence=0.9,
            matched_indicators=["arrest threat"]
        )
        
        result = AnalysisResult(
            call_id="call-003",
            segment_id="seg-003",
            timestamp=1234567890.0,
            fraud_score=85,
            confidence_score=95,
            threat_level=ThreatLevel.DANGER,
            detected_patterns=[pattern],
            urgency_detected=True,
            financial_demand_detected=True,
            financial_demand_type="wire transfer",
            explanation="IRS scam detected with urgency",
            language="en",
            processing_time_ms=200
        )
        
        dict_result = result.to_dict()
        
        assert isinstance(dict_result, dict)
        assert dict_result["call_id"] == "call-003"
        assert dict_result["fraud_score"] == 85
        assert dict_result["confidence_score"] == 95
        assert dict_result["threat_level"] == "Danger"
        assert len(dict_result["detected_patterns"]) == 1
        assert dict_result["urgency_detected"] is True
        assert dict_result["financial_demand_detected"] is True
        assert dict_result["financial_demand_type"] == "wire transfer"
        assert dict_result["explanation"] == "IRS scam detected with urgency"
        assert dict_result["processing_time_ms"] == 200


class TestRedactionResult:
    """Test RedactionResult dataclass."""
    
    def test_redaction_result_creation(self):
        """Test creating a RedactionResult instance."""
        result = RedactionResult(
            redacted_text="My name is [NAME] and my SSN is [SSN]",
            detected_pii_types=["NAME", "SSN"],
            redaction_count=2
        )
        
        assert result.redacted_text == "My name is [NAME] and my SSN is [SSN]"
        assert result.detected_pii_types == ["NAME", "SSN"]
        assert result.redaction_count == 2
    
    def test_redaction_result_defaults(self):
        """Test RedactionResult default values."""
        result = RedactionResult(redacted_text="No PII here")
        
        assert result.detected_pii_types == []
        assert result.redaction_count == 0
    
    def test_redaction_result_to_dict(self):
        """Test RedactionResult.to_dict() method."""
        result = RedactionResult(
            redacted_text="Call [PHONE] for details",
            detected_pii_types=["PHONE"],
            redaction_count=1
        )
        
        dict_result = result.to_dict()
        
        assert isinstance(dict_result, dict)
        assert dict_result["redacted_text"] == "Call [PHONE] for details"
        assert dict_result["detected_pii_types"] == ["PHONE"]
        assert dict_result["redaction_count"] == 1


class TestAgentResponse:
    """Test AgentResponse dataclass."""
    
    def test_agent_response_creation(self):
        """Test creating an AgentResponse instance."""
        response = AgentResponse(
            response_text="Fraud Score: 75\nConfidence Score: 85\nExplanation: High risk",
            session_id="session-001",
            trace={"step": "analysis"}
        )
        
        assert "Fraud Score: 75" in response.response_text
        assert response.session_id == "session-001"
        assert response.trace == {"step": "analysis"}
    
    def test_extract_fraud_score(self):
        """Test extract_fraud_score() method."""
        response = AgentResponse(
            response_text="Analysis complete. Fraud Score: 85. High risk detected.",
            session_id="session-001"
        )
        
        score = response.extract_fraud_score()
        assert score == 85
    
    def test_extract_fraud_score_variations(self):
        """Test extract_fraud_score() with different formats."""
        # Test with underscore
        response1 = AgentResponse(
            response_text="fraud_score: 42",
            session_id="session-001"
        )
        assert response1.extract_fraud_score() == 42
        
        # Test with space
        response2 = AgentResponse(
            response_text="Fraud Score 67",
            session_id="session-002"
        )
        assert response2.extract_fraud_score() == 67
        
        # Test case insensitive
        response3 = AgentResponse(
            response_text="FRAUD SCORE: 93",
            session_id="session-003"
        )
        assert response3.extract_fraud_score() == 93
    
    def test_extract_fraud_score_clamping(self):
        """Test that fraud score is clamped to 0-100 range."""
        # Test upper bound
        response1 = AgentResponse(
            response_text="Fraud Score: 150",
            session_id="session-001"
        )
        assert response1.extract_fraud_score() == 100
        
        # Test lower bound (negative)
        response2 = AgentResponse(
            response_text="Fraud Score: -10",
            session_id="session-002"
        )
        assert response2.extract_fraud_score() == 0
    
    def test_extract_fraud_score_not_found(self):
        """Test extract_fraud_score() when score not found."""
        response = AgentResponse(
            response_text="No score mentioned here",
            session_id="session-001"
        )
        
        score = response.extract_fraud_score()
        assert score == 0
    
    def test_extract_confidence_score(self):
        """Test extract_confidence_score() method."""
        response = AgentResponse(
            response_text="Confidence Score: 90",
            session_id="session-001"
        )
        
        score = response.extract_confidence_score()
        assert score == 90
    
    def test_extract_confidence_score_default(self):
        """Test extract_confidence_score() returns default when not found."""
        response = AgentResponse(
            response_text="No confidence mentioned",
            session_id="session-001"
        )
        
        score = response.extract_confidence_score()
        assert score == 50
    
    def test_extract_patterns(self):
        """Test extract_patterns() method."""
        response = AgentResponse(
            response_text="Detected IRS Scam and Tech Support Scam patterns",
            session_id="session-001"
        )
        
        patterns = response.extract_patterns()
        
        assert len(patterns) == 2
        assert any(p.pattern_type == "IRS Scam" for p in patterns)
        assert any(p.pattern_type == "Tech Support Scam" for p in patterns)
    
    def test_extract_patterns_none_found(self):
        """Test extract_patterns() when no patterns found."""
        response = AgentResponse(
            response_text="Normal conversation, no scam detected",
            session_id="session-001"
        )
        
        patterns = response.extract_patterns()
        assert len(patterns) == 0
    
    def test_extract_explanation(self):
        """Test extract_explanation() method."""
        response = AgentResponse(
            response_text="Explanation: This call shows multiple fraud indicators including urgency and financial demands.",
            session_id="session-001"
        )
        
        explanation = response.extract_explanation()
        assert "fraud indicators" in explanation
        assert "urgency" in explanation
    
    def test_extract_explanation_fallback(self):
        """Test extract_explanation() fallback to first paragraph."""
        response = AgentResponse(
            response_text="This is the first paragraph.\n\nThis is the second paragraph.",
            session_id="session-001"
        )
        
        explanation = response.extract_explanation()
        assert explanation == "This is the first paragraph."
    
    def test_agent_response_to_dict(self):
        """Test AgentResponse.to_dict() method."""
        response = AgentResponse(
            response_text="Test response",
            session_id="session-001",
            trace={"step": "complete"}
        )
        
        dict_result = response.to_dict()
        
        assert isinstance(dict_result, dict)
        assert dict_result["response_text"] == "Test response"
        assert dict_result["session_id"] == "session-001"
        assert dict_result["trace"] == {"step": "complete"}


class TestErrorResponse:
    """Test ErrorResponse dataclass."""
    
    def test_error_response_creation(self):
        """Test creating an ErrorResponse instance."""
        error = ErrorResponse(
            error_code="BEDROCK_ERROR",
            error_message="Bedrock API failed",
            call_id="call-001",
            segment_id="seg-001",
            timestamp=1234567890.0,
            retry_possible=True
        )
        
        assert error.error_code == "BEDROCK_ERROR"
        assert error.error_message == "Bedrock API failed"
        assert error.call_id == "call-001"
        assert error.segment_id == "seg-001"
        assert error.timestamp == 1234567890.0
        assert error.retry_possible is True
    
    def test_error_response_defaults(self):
        """Test ErrorResponse default values."""
        error = ErrorResponse(
            error_code="TEST_ERROR",
            error_message="Test error",
            call_id="call-002",
            segment_id="seg-002",
            timestamp=1234567890.0
        )
        
        assert error.retry_possible is False
    
    def test_error_response_to_dict(self):
        """Test ErrorResponse.to_dict() method."""
        error = ErrorResponse(
            error_code="GUARDRAILS_ERROR",
            error_message="PII redaction failed",
            call_id="call-003",
            segment_id="seg-003",
            timestamp=1234567890.0,
            retry_possible=False
        )
        
        dict_result = error.to_dict()
        
        assert isinstance(dict_result, dict)
        assert dict_result["error_code"] == "GUARDRAILS_ERROR"
        assert dict_result["error_message"] == "PII redaction failed"
        assert dict_result["call_id"] == "call-003"
        assert dict_result["segment_id"] == "seg-003"
        assert dict_result["timestamp"] == 1234567890.0
        assert dict_result["retry_possible"] is False


class TestExceptions:
    """Test custom exception classes."""
    
    def test_fraud_detection_error(self):
        """Test FraudDetectionError base exception."""
        with pytest.raises(FraudDetectionError):
            raise FraudDetectionError("Base error")
    
    def test_unsupported_language_error(self):
        """Test UnsupportedLanguageError exception."""
        with pytest.raises(UnsupportedLanguageError):
            raise UnsupportedLanguageError("Language not supported")
        
        # Test inheritance
        with pytest.raises(FraudDetectionError):
            raise UnsupportedLanguageError("Language not supported")
    
    def test_guardrails_error(self):
        """Test GuardrailsError exception."""
        with pytest.raises(GuardrailsError):
            raise GuardrailsError("Guardrails failed")
        
        with pytest.raises(FraudDetectionError):
            raise GuardrailsError("Guardrails failed")
    
    def test_bedrock_agent_error(self):
        """Test BedrockAgentError exception."""
        with pytest.raises(BedrockAgentError):
            raise BedrockAgentError("Agent invocation failed")
        
        with pytest.raises(FraudDetectionError):
            raise BedrockAgentError("Agent invocation failed")
    
    def test_context_store_error(self):
        """Test ContextStoreError exception."""
        with pytest.raises(ContextStoreError):
            raise ContextStoreError("Context storage failed")
        
        with pytest.raises(FraudDetectionError):
            raise ContextStoreError("Context storage failed")
    
    def test_notification_error(self):
        """Test NotificationError exception."""
        with pytest.raises(NotificationError):
            raise NotificationError("Notification failed")
        
        with pytest.raises(FraudDetectionError):
            raise NotificationError("Notification failed")
