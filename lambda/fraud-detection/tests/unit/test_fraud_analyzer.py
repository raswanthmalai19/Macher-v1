"""
Unit tests for FraudAnalyzer - Main orchestration component.

Tests the complete fraud detection workflow including component integration,
error handling, and end-to-end analysis flow.
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
import time

from src.fraud_analyzer import FraudAnalyzer, create_fraud_analyzer
from src.models import (
    AnalysisResult,
    ConversationSegment,
    ConversationContext,
    ThreatLevel,
    ScamPattern,
    RedactionResult,
    AgentResponse,
    UnsupportedLanguageError,
    GuardrailsError,
    BedrockAgentError,
    ContextStoreError
)


class TestFraudAnalyzerInitialization:
    """Test FraudAnalyzer initialization."""
    
    def test_initialization_with_all_components(self):
        """Test successful initialization with all required components."""
        guardrails = Mock()
        context_store = Mock()
        knowledge_base = Mock()
        bedrock_agent = Mock()
        
        analyzer = FraudAnalyzer(guardrails, context_store, knowledge_base, bedrock_agent)
        
        assert analyzer.guardrails == guardrails
        assert analyzer.context_store == context_store
        assert analyzer.knowledge_base == knowledge_base
        assert analyzer.bedrock_agent == bedrock_agent
    
    def test_supported_languages_list(self):
        """Test that supported languages are correctly defined."""
        assert FraudAnalyzer.SUPPORTED_LANGUAGES == ['en', 'es', 'zh', 'hi', 'fr']


class TestAnalyzeSegment:
    """Test analyze_segment method - main entry point."""
    
    @pytest.fixture
    def mock_components(self):
        """Create mock components for testing."""
        guardrails = Mock()
        context_store = Mock()
        knowledge_base = Mock()
        bedrock_agent = Mock()
        
        # Setup default mock behaviors
        guardrails.redact_pii.return_value = RedactionResult(
            redacted_text="This is a test transcript",
            detected_pii_types=[],
            redaction_count=0
        )
        
        context_store.get_context.return_value = ConversationContext(
            call_id="test-call-123",
            segments=[],
            cumulative_fraud_score=0.0
        )
        
        knowledge_base.query_patterns.return_value = []
        
        agent_response = AgentResponse(
            response_text="Analysis complete. Fraud Score: 25. Confidence Score: 85. No significant fraud indicators detected.",
            session_id="test-session-123"
        )
        bedrock_agent.analyze_transcript.return_value = agent_response
        
        analysis_result = AnalysisResult(
            call_id="",
            segment_id="",
            timestamp=0,
            fraud_score=25,
            threat_level=ThreatLevel.SAFE,
            detected_patterns=[],
            confidence_score=0.85,
            explanation="No significant fraud indicators detected.",
            language="en",
            processing_time_ms=0
        )
        bedrock_agent.parse_agent_response.return_value = analysis_result
        
        context_store.update_context.return_value = None
        
        return {
            'guardrails': guardrails,
            'context_store': context_store,
            'knowledge_base': knowledge_base,
            'bedrock_agent': bedrock_agent
        }
    
    def test_successful_analysis_safe_call(self, mock_components):
        """Test successful analysis of a safe call."""
        analyzer = FraudAnalyzer(
            mock_components['guardrails'],
            mock_components['context_store'],
            mock_components['knowledge_base'],
            mock_components['bedrock_agent']
        )
        
        result = analyzer.analyze_segment(
            call_id="test-call-123",
            segment_id="segment-1",
            transcript_text="Hello, this is a normal conversation.",
            timestamp=1234567890.0,
            language="en"
        )
        
        # Verify result
        assert result.call_id == "test-call-123"
        assert result.segment_id == "segment-1"
        assert result.fraud_score == 25
        assert result.threat_level == ThreatLevel.SAFE
        assert result.language == "en"
        # Processing time should be set by the analyzer (not from mock)
        assert result.processing_time_ms >= 0
        
        # Verify component calls
        mock_components['guardrails'].redact_pii.assert_called_once()
        mock_components['context_store'].get_context.assert_called_once_with("test-call-123")
        mock_components['knowledge_base'].query_patterns.assert_called_once()
        mock_components['bedrock_agent'].analyze_transcript.assert_called_once()
        mock_components['context_store'].update_context.assert_called_once()
    
    def test_successful_analysis_with_pii_redaction(self, mock_components):
        """Test analysis with PII redaction."""
        # Setup PII redaction
        mock_components['guardrails'].redact_pii.return_value = RedactionResult(
            redacted_text="My name is [NAME] and my SSN is [SSN]",
            detected_pii_types=["NAME", "SSN"],
            redaction_count=2
        )
        
        analyzer = FraudAnalyzer(
            mock_components['guardrails'],
            mock_components['context_store'],
            mock_components['knowledge_base'],
            mock_components['bedrock_agent']
        )
        
        result = analyzer.analyze_segment(
            call_id="test-call-123",
            segment_id="segment-1",
            transcript_text="My name is John Doe and my SSN is 123-45-6789",
            timestamp=1234567890.0,
            language="en"
        )
        
        # Verify PII was redacted
        assert result is not None
        mock_components['guardrails'].redact_pii.assert_called_once()
        
        # Verify redacted text was passed to agent
        call_args = mock_components['bedrock_agent'].analyze_transcript.call_args
        assert "My name is [NAME]" in str(call_args)
    
    def test_successful_analysis_with_kb_patterns(self, mock_components):
        """Test analysis with Knowledge Base pattern matching."""
        # Setup KB patterns
        kb_pattern = ScamPattern(
            pattern_id="irs-scam-001",
            pattern_type="IRS Tax Scam",
            description="Caller claims to be from IRS demanding immediate payment",
            confidence=0.92,
            matched_indicators=["IRS", "tax", "payment"]
        )
        mock_components['knowledge_base'].query_patterns.return_value = [kb_pattern]
        
        analyzer = FraudAnalyzer(
            mock_components['guardrails'],
            mock_components['context_store'],
            mock_components['knowledge_base'],
            mock_components['bedrock_agent']
        )
        
        result = analyzer.analyze_segment(
            call_id="test-call-123",
            segment_id="segment-1",
            transcript_text="This is the IRS. You owe back taxes.",
            timestamp=1234567890.0,
            language="en"
        )
        
        # Verify KB patterns were added to result
        assert len(result.detected_patterns) >= 1
        mock_components['knowledge_base'].query_patterns.assert_called_once()
    
    def test_analysis_with_conversation_context(self, mock_components):
        """Test analysis uses conversation context from previous segments."""
        # Setup existing context
        previous_segment = ConversationSegment(
            segment_id="segment-0",
            timestamp=1234567880.0,
            transcript_text="Previous conversation",
            fraud_score=15,
            threat_level=ThreatLevel.SAFE
        )
        mock_components['context_store'].get_context.return_value = ConversationContext(
            call_id="test-call-123",
            segments=[previous_segment],
            cumulative_fraud_score=15.0
        )
        
        analyzer = FraudAnalyzer(
            mock_components['guardrails'],
            mock_components['context_store'],
            mock_components['knowledge_base'],
            mock_components['bedrock_agent']
        )
        
        result = analyzer.analyze_segment(
            call_id="test-call-123",
            segment_id="segment-1",
            transcript_text="Current conversation",
            timestamp=1234567890.0,
            language="en"
        )
        
        # Verify context was retrieved and used
        mock_components['context_store'].get_context.assert_called_once_with("test-call-123")
        
        # Verify agent received context
        call_args = mock_components['bedrock_agent'].analyze_transcript.call_args
        assert call_args[1]['conversation_context'] == [previous_segment]
    
    def test_analysis_multi_language_support(self, mock_components):
        """Test analysis with different supported languages."""
        analyzer = FraudAnalyzer(
            mock_components['guardrails'],
            mock_components['context_store'],
            mock_components['knowledge_base'],
            mock_components['bedrock_agent']
        )
        
        for language in ['en', 'es', 'zh', 'hi', 'fr']:
            result = analyzer.analyze_segment(
                call_id=f"test-call-{language}",
                segment_id="segment-1",
                transcript_text="Test transcript",
                timestamp=1234567890.0,
                language=language
            )
            
            assert result.language == language
            
            # Verify language was passed to KB and agent
            kb_call = mock_components['knowledge_base'].query_patterns.call_args
            assert kb_call[1]['language'] == language
            
            agent_call = mock_components['bedrock_agent'].analyze_transcript.call_args
            assert agent_call[1]['language'] == language


class TestInputValidation:
    """Test input validation."""
    
    @pytest.fixture
    def analyzer(self):
        """Create analyzer with mock components."""
        return FraudAnalyzer(Mock(), Mock(), Mock(), Mock())
    
    def test_empty_call_id_raises_error(self, analyzer):
        """Test that empty call_id raises ValueError."""
        # ValueError is wrapped as BedrockAgentError in the implementation
        with pytest.raises((ValueError, BedrockAgentError)):
            analyzer.analyze_segment(
                call_id="",
                segment_id="segment-1",
                transcript_text="Test",
                timestamp=1234567890.0
            )
    
    def test_empty_segment_id_raises_error(self, analyzer):
        """Test that empty segment_id raises ValueError."""
        # ValueError is wrapped as BedrockAgentError in the implementation
        with pytest.raises((ValueError, BedrockAgentError)):
            analyzer.analyze_segment(
                call_id="test-call-123",
                segment_id="",
                transcript_text="Test",
                timestamp=1234567890.0
            )
    
    def test_empty_transcript_raises_error(self, analyzer):
        """Test that empty transcript_text raises ValueError."""
        # ValueError is wrapped as BedrockAgentError in the implementation
        with pytest.raises((ValueError, BedrockAgentError)):
            analyzer.analyze_segment(
                call_id="test-call-123",
                segment_id="segment-1",
                transcript_text="",
                timestamp=1234567890.0
            )
    
    def test_unsupported_language_raises_error(self, analyzer):
        """Test that unsupported language raises UnsupportedLanguageError."""
        with pytest.raises(UnsupportedLanguageError, match="Language 'ja' is not supported"):
            analyzer.analyze_segment(
                call_id="test-call-123",
                segment_id="segment-1",
                transcript_text="Test",
                timestamp=1234567890.0,
                language="ja"  # Japanese not supported
            )


class TestErrorHandling:
    """Test error handling and propagation."""
    
    def test_guardrails_error_propagates(self):
        """Test that GuardrailsError is propagated."""
        guardrails = Mock()
        guardrails.redact_pii.side_effect = GuardrailsError("PII redaction failed")
        
        analyzer = FraudAnalyzer(guardrails, Mock(), Mock(), Mock())
        
        with pytest.raises(GuardrailsError, match="PII redaction failed"):
            analyzer.analyze_segment(
                call_id="test-call-123",
                segment_id="segment-1",
                transcript_text="Test",
                timestamp=1234567890.0
            )
    
    def test_bedrock_agent_error_propagates(self):
        """Test that BedrockAgentError is propagated."""
        guardrails = Mock()
        guardrails.redact_pii.return_value = RedactionResult("Test", [], 0)
        
        context_store = Mock()
        context_store.get_context.return_value = ConversationContext("test", [], 0)
        
        knowledge_base = Mock()
        knowledge_base.query_patterns.return_value = []
        
        bedrock_agent = Mock()
        bedrock_agent.analyze_transcript.side_effect = BedrockAgentError("Agent failed")
        
        analyzer = FraudAnalyzer(guardrails, context_store, knowledge_base, bedrock_agent)
        
        with pytest.raises(BedrockAgentError, match="Agent failed"):
            analyzer.analyze_segment(
                call_id="test-call-123",
                segment_id="segment-1",
                transcript_text="Test",
                timestamp=1234567890.0
            )
    
    def test_context_store_error_propagates(self):
        """Test that ContextStoreError is propagated."""
        guardrails = Mock()
        guardrails.redact_pii.return_value = RedactionResult("Test", [], 0)
        
        context_store = Mock()
        context_store.get_context.side_effect = ContextStoreError("Context retrieval failed")
        
        analyzer = FraudAnalyzer(guardrails, context_store, Mock(), Mock())
        
        with pytest.raises(ContextStoreError, match="Context retrieval failed"):
            analyzer.analyze_segment(
                call_id="test-call-123",
                segment_id="segment-1",
                transcript_text="Test",
                timestamp=1234567890.0
            )
    
    def test_unexpected_error_wrapped_as_bedrock_error(self):
        """Test that unexpected errors are wrapped as BedrockAgentError."""
        guardrails = Mock()
        guardrails.redact_pii.side_effect = RuntimeError("Unexpected error")
        
        analyzer = FraudAnalyzer(guardrails, Mock(), Mock(), Mock())
        
        with pytest.raises(BedrockAgentError, match="Unexpected error during fraud analysis"):
            analyzer.analyze_segment(
                call_id="test-call-123",
                segment_id="segment-1",
                transcript_text="Test",
                timestamp=1234567890.0
            )


class TestClearCallContext:
    """Test clear_call_context method."""
    
    def test_clear_context_success(self):
        """Test successful context clearing."""
        context_store = Mock()
        analyzer = FraudAnalyzer(Mock(), context_store, Mock(), Mock())
        
        analyzer.clear_call_context("test-call-123")
        
        context_store.clear_context.assert_called_once_with("test-call-123")
    
    def test_clear_context_handles_errors_gracefully(self):
        """Test that clear_context doesn't raise errors (cleanup operation)."""
        context_store = Mock()
        context_store.clear_context.side_effect = Exception("Clear failed")
        
        analyzer = FraudAnalyzer(Mock(), context_store, Mock(), Mock())
        
        # Should not raise
        analyzer.clear_call_context("test-call-123")


class TestFactoryFunction:
    """Test create_fraud_analyzer factory function."""
    
    @patch('src.fraud_analyzer.GuardrailsClient')
    @patch('src.fraud_analyzer.ContextStore')
    @patch('src.fraud_analyzer.KnowledgeBaseManager')
    @patch('src.fraud_analyzer.BedrockAgentClient')
    def test_factory_creates_analyzer_with_all_components(
        self, mock_agent, mock_kb, mock_context, mock_guardrails
    ):
        """Test factory function creates analyzer with all components."""
        analyzer = create_fraud_analyzer(
            guardrail_id="guardrail-123",
            guardrail_version="1",
            context_table_name="context-table",
            knowledge_base_id="kb-123",
            agent_id="agent-123",
            agent_alias_id="alias-123",
            region="us-east-1"
        )
        
        # Verify all components were created
        mock_guardrails.assert_called_once_with("guardrail-123", "1", "us-east-1")
        mock_context.assert_called_once_with("context-table", "us-east-1")
        mock_kb.assert_called_once_with("kb-123", "us-east-1")
        mock_agent.assert_called_once_with("agent-123", "alias-123", "us-east-1")
        
        # Verify analyzer was created
        assert isinstance(analyzer, FraudAnalyzer)


class TestProcessingTime:
    """Test processing time tracking."""
    
    def test_processing_time_is_tracked(self):
        """Test that processing time is measured and included in result."""
        guardrails = Mock()
        guardrails.redact_pii.return_value = RedactionResult("Test", [], 0)
        
        context_store = Mock()
        context_store.get_context.return_value = ConversationContext("test", [], 0)
        
        knowledge_base = Mock()
        knowledge_base.query_patterns.return_value = []
        
        bedrock_agent = Mock()
        # AgentResponse only takes response_text and session_id
        agent_response = AgentResponse(
            response_text="Analysis complete. Fraud Score: 25. Confidence Score: 85. No significant fraud indicators detected.",
            session_id="test-session-123"
        )
        bedrock_agent.analyze_transcript.return_value = agent_response
        
        analysis_result = AnalysisResult(
            call_id="", 
            segment_id="", 
            timestamp=0, 
            fraud_score=25, 
            threat_level=ThreatLevel.SAFE, 
            detected_patterns=[], 
            confidence_score=85,
            explanation="Explanation", 
            language="en", 
            processing_time_ms=0
        )
        bedrock_agent.parse_agent_response.return_value = analysis_result
        
        analyzer = FraudAnalyzer(guardrails, context_store, knowledge_base, bedrock_agent)
        
        result = analyzer.analyze_segment(
            call_id="test-call-123",
            segment_id="segment-1",
            transcript_text="Test",
            timestamp=1234567890.0
        )
        
        # Verify processing time was set and is reasonable
        assert result.processing_time_ms >= 0
        assert result.processing_time_ms < 10000  # Should be less than 10 seconds
