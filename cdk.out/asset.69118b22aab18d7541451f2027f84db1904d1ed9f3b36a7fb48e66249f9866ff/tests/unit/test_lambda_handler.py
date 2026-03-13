"""
Unit tests for Lambda handler - AWS Lambda entry point.

Tests request parsing, response formatting, error handling, and
environment variable configuration.
"""

import json
import pytest
from unittest.mock import Mock, patch, MagicMock
import os

from src.lambda_handler import (
    handler,
    parse_request_body,
    success_response,
    error_response,
    get_fraud_analyzer
)
from src.models import (
    AnalysisResult,
    ThreatLevel,
    UnsupportedLanguageError,
    GuardrailsError,
    BedrockAgentError,
    ContextStoreError
)


class TestParseRequestBody:
    """Test parse_request_body function."""
    
    def test_parse_json_string_body(self):
        """Test parsing JSON string body from API Gateway."""
        event = {
            'body': json.dumps({
                'call_id': 'test-123',
                'segment_id': 'seg-1',
                'transcript_text': 'Test transcript',
                'timestamp': 1234567890
            })
        }
        
        body = parse_request_body(event)
        
        assert body['call_id'] == 'test-123'
        assert body['segment_id'] == 'seg-1'
        assert body['transcript_text'] == 'Test transcript'
        assert body['timestamp'] == 1234567890
    
    def test_parse_dict_body(self):
        """Test parsing dictionary body (direct invocation)."""
        event = {
            'body': {
                'call_id': 'test-123',
                'segment_id': 'seg-1',
                'transcript_text': 'Test transcript',
                'timestamp': 1234567890
            }
        }
        
        body = parse_request_body(event)
        
        assert body['call_id'] == 'test-123'
    
    def test_missing_body_raises_error(self):
        """Test that missing body raises ValueError."""
        event = {}
        
        with pytest.raises(ValueError, match="Request body is missing"):
            parse_request_body(event)
    
    def test_invalid_json_raises_error(self):
        """Test that invalid JSON raises ValueError."""
        event = {
            'body': 'not valid json {'
        }
        
        with pytest.raises(ValueError, match="Invalid JSON in request body"):
            parse_request_body(event)


class TestSuccessResponse:
    """Test success_response function."""
    
    def test_success_response_format(self):
        """Test success response has correct format."""
        data = {
            'call_id': 'test-123',
            'fraud_score': 25,
            'threat_level': 'SAFE'
        }
        
        response = success_response(data)
        
        assert response['statusCode'] == 200
        assert response['headers']['Content-Type'] == 'application/json'
        assert 'Access-Control-Allow-Origin' in response['headers']
        
        body = json.loads(response['body'])
        assert body['call_id'] == 'test-123'
        assert body['fraud_score'] == 25
    
    def test_success_response_json_serializable(self):
        """Test that success response body is valid JSON."""
        data = {'test': 'value'}
        response = success_response(data)
        
        # Should not raise
        json.loads(response['body'])


class TestErrorResponse:
    """Test error_response function."""
    
    def test_error_response_format(self):
        """Test error response has correct format."""
        response = error_response(
            status_code=400,
            error_code='INVALID_REQUEST',
            error_message='Missing parameters',
            call_id='test-123',
            segment_id='seg-1',
            timestamp=1234567890.0,
            retry_possible=False
        )
        
        assert response['statusCode'] == 400
        assert response['headers']['Content-Type'] == 'application/json'
        
        body = json.loads(response['body'])
        assert body['error_code'] == 'INVALID_REQUEST'
        assert body['error_message'] == 'Missing parameters'
        assert body['call_id'] == 'test-123'
        assert body['segment_id'] == 'seg-1'
        assert body['timestamp'] == 1234567890.0
        assert body['retry_possible'] == False
    
    def test_error_response_with_retry(self):
        """Test error response with retry_possible=True."""
        response = error_response(
            status_code=500,
            error_code='AGENT_ERROR',
            error_message='Analysis failed',
            call_id='test-123',
            segment_id='seg-1',
            timestamp=1234567890.0,
            retry_possible=True
        )
        
        body = json.loads(response['body'])
        assert body['retry_possible'] == True


class TestGetFraudAnalyzer:
    """Test get_fraud_analyzer function."""
    
    @patch.dict(os.environ, {
        'GUARDRAIL_ID': 'guardrail-123',
        'GUARDRAIL_VERSION': '1',
        'CONTEXT_TABLE_NAME': 'context-table',
        'KNOWLEDGE_BASE_ID': 'kb-123',
        'BEDROCK_AGENT_ID': 'agent-123',
        'BEDROCK_AGENT_ALIAS_ID': 'alias-123',
        'AWS_REGION': 'us-east-1'
    })
    @patch('src.lambda_handler.create_fraud_analyzer')
    def test_get_fraud_analyzer_creates_instance(self, mock_create):
        """Test that get_fraud_analyzer creates analyzer from environment variables."""
        # Reset global state
        import src.lambda_handler
        src.lambda_handler.fraud_analyzer = None
        
        mock_analyzer = Mock()
        mock_create.return_value = mock_analyzer
        
        analyzer = get_fraud_analyzer()
        
        assert analyzer == mock_analyzer
        mock_create.assert_called_once_with(
            guardrail_id='guardrail-123',
            guardrail_version='1',
            context_table_name='context-table',
            knowledge_base_id='kb-123',
            agent_id='agent-123',
            agent_alias_id='alias-123',
            region='us-east-1'
        )
    
    @patch.dict(os.environ, {
        'GUARDRAIL_ID': 'guardrail-123',
        'CONTEXT_TABLE_NAME': 'context-table',
        'KNOWLEDGE_BASE_ID': 'kb-123',
        'BEDROCK_AGENT_ID': 'agent-123',
        'BEDROCK_AGENT_ALIAS_ID': 'alias-123'
    })
    @patch('src.lambda_handler.create_fraud_analyzer')
    def test_get_fraud_analyzer_reuses_instance(self, mock_create):
        """Test that get_fraud_analyzer reuses existing instance (warm start)."""
        # Reset and create first instance
        import src.lambda_handler
        src.lambda_handler.fraud_analyzer = None
        
        mock_analyzer = Mock()
        mock_create.return_value = mock_analyzer
        
        analyzer1 = get_fraud_analyzer()
        analyzer2 = get_fraud_analyzer()
        
        assert analyzer1 == analyzer2
        # Should only create once
        assert mock_create.call_count == 1
    
    @patch.dict(os.environ, {}, clear=True)
    def test_get_fraud_analyzer_missing_env_vars_raises_error(self):
        """Test that missing environment variables raises ValueError."""
        # Reset global state
        import src.lambda_handler
        src.lambda_handler.fraud_analyzer = None
        
        with pytest.raises(ValueError, match="Missing required environment variables"):
            get_fraud_analyzer()


class TestHandler:
    """Test Lambda handler function."""
    
    @pytest.fixture
    def mock_context(self):
        """Create mock Lambda context."""
        context = Mock()
        context.request_id = 'test-request-123'
        return context
    
    @pytest.fixture
    def valid_event(self):
        """Create valid API Gateway event."""
        return {
            'body': json.dumps({
                'call_id': 'test-call-123',
                'segment_id': 'segment-1',
                'transcript_text': 'This is a test transcript',
                'timestamp': 1234567890.0,
                'language': 'en'
            })
        }
    
    @patch('src.lambda_handler.get_fraud_analyzer')
    def test_handler_successful_analysis(self, mock_get_analyzer, valid_event, mock_context):
        """Test successful fraud analysis through handler."""
        # Setup mock analyzer
        mock_analyzer = Mock()
        mock_result = AnalysisResult(
            call_id='test-call-123',
            segment_id='segment-1',
            timestamp=1234567890.0,
            fraud_score=25,
            threat_level=ThreatLevel.SAFE,
            detected_patterns=[],
            confidence_score=0.85,
            explanation='No fraud detected',
            language='en',
            processing_time_ms=150
        )
        mock_analyzer.analyze_segment.return_value = mock_result
        mock_get_analyzer.return_value = mock_analyzer
        
        response = handler(valid_event, mock_context)
        
        # Verify response
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert body['call_id'] == 'test-call-123'
        assert body['fraud_score'] == 25
        assert body['threat_level'] == 'Safe'
        
        # Verify analyzer was called correctly
        mock_analyzer.analyze_segment.assert_called_once_with(
            call_id='test-call-123',
            segment_id='segment-1',
            transcript_text='This is a test transcript',
            timestamp=1234567890.0,
            language='en'
        )
    
    @patch('src.lambda_handler.get_fraud_analyzer')
    def test_handler_missing_required_parameters(self, mock_get_analyzer, mock_context):
        """Test handler with missing required parameters."""
        event = {
            'body': json.dumps({
                'call_id': 'test-call-123',
                # Missing segment_id, transcript_text, timestamp
            })
        }
        
        response = handler(event, mock_context)
        
        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['error_code'] == 'INVALID_REQUEST'
        assert 'Missing required parameters' in body['error_message']
    
    @patch('src.lambda_handler.get_fraud_analyzer')
    def test_handler_unsupported_language_error(self, mock_get_analyzer, valid_event, mock_context):
        """Test handler with unsupported language."""
        mock_analyzer = Mock()
        mock_analyzer.analyze_segment.side_effect = UnsupportedLanguageError(
            "Language 'ja' is not supported"
        )
        mock_get_analyzer.return_value = mock_analyzer
        
        # Modify event to use unsupported language
        body = json.loads(valid_event['body'])
        body['language'] = 'ja'
        valid_event['body'] = json.dumps(body)
        
        response = handler(valid_event, mock_context)
        
        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['error_code'] == 'UNSUPPORTED_LANGUAGE'
        assert 'not supported' in body['error_message']
    
    @patch('src.lambda_handler.get_fraud_analyzer')
    def test_handler_guardrails_error(self, mock_get_analyzer, valid_event, mock_context):
        """Test handler with Guardrails error."""
        mock_analyzer = Mock()
        mock_analyzer.analyze_segment.side_effect = GuardrailsError("PII redaction failed")
        mock_get_analyzer.return_value = mock_analyzer
        
        response = handler(valid_event, mock_context)
        
        assert response['statusCode'] == 500
        body = json.loads(response['body'])
        assert body['error_code'] == 'GUARDRAILS_ERROR'
        assert body['retry_possible'] == True
        assert 'PII redaction failed' in body['error_message']
    
    @patch('src.lambda_handler.get_fraud_analyzer')
    def test_handler_bedrock_agent_error(self, mock_get_analyzer, valid_event, mock_context):
        """Test handler with Bedrock Agent error."""
        mock_analyzer = Mock()
        mock_analyzer.analyze_segment.side_effect = BedrockAgentError("Agent analysis failed")
        mock_get_analyzer.return_value = mock_analyzer
        
        response = handler(valid_event, mock_context)
        
        assert response['statusCode'] == 500
        body = json.loads(response['body'])
        assert body['error_code'] == 'AGENT_ERROR'
        assert body['retry_possible'] == True
    
    @patch('src.lambda_handler.get_fraud_analyzer')
    def test_handler_context_store_error(self, mock_get_analyzer, valid_event, mock_context):
        """Test handler with Context Store error."""
        mock_analyzer = Mock()
        mock_analyzer.analyze_segment.side_effect = ContextStoreError("Context storage failed")
        mock_get_analyzer.return_value = mock_analyzer
        
        response = handler(valid_event, mock_context)
        
        assert response['statusCode'] == 500
        body = json.loads(response['body'])
        assert body['error_code'] == 'CONTEXT_ERROR'
        assert body['retry_possible'] == True
    
    @patch('src.lambda_handler.get_fraud_analyzer')
    def test_handler_validation_error(self, mock_get_analyzer, valid_event, mock_context):
        """Test handler with validation error."""
        mock_analyzer = Mock()
        mock_analyzer.analyze_segment.side_effect = ValueError("call_id cannot be empty")
        mock_get_analyzer.return_value = mock_analyzer
        
        response = handler(valid_event, mock_context)
        
        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['error_code'] == 'VALIDATION_ERROR'
    
    @patch('src.lambda_handler.get_fraud_analyzer')
    def test_handler_unexpected_error(self, mock_get_analyzer, valid_event, mock_context):
        """Test handler with unexpected error."""
        mock_analyzer = Mock()
        mock_analyzer.analyze_segment.side_effect = RuntimeError("Unexpected error")
        mock_get_analyzer.return_value = mock_analyzer
        
        response = handler(valid_event, mock_context)
        
        assert response['statusCode'] == 500
        body = json.loads(response['body'])
        assert body['error_code'] == 'INTERNAL_ERROR'
        assert body['retry_possible'] == True
    
    def test_handler_invalid_json_body(self, mock_context):
        """Test handler with invalid JSON body."""
        event = {
            'body': 'not valid json {'
        }
        
        response = handler(event, mock_context)
        
        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert body['error_code'] == 'VALIDATION_ERROR'
    
    @patch('src.lambda_handler.get_fraud_analyzer')
    def test_handler_default_language(self, mock_get_analyzer, mock_context):
        """Test handler uses default language when not specified."""
        event = {
            'body': json.dumps({
                'call_id': 'test-call-123',
                'segment_id': 'segment-1',
                'transcript_text': 'Test',
                'timestamp': 1234567890.0
                # No language specified
            })
        }
        
        mock_analyzer = Mock()
        mock_result = AnalysisResult(
            'test-call-123', 'segment-1', 1234567890.0, 25, ThreatLevel.SAFE,
            [], 0.85, 'Safe', 'en', 150
        )
        mock_analyzer.analyze_segment.return_value = mock_result
        mock_get_analyzer.return_value = mock_analyzer
        
        response = handler(event, mock_context)
        
        # Verify default language 'en' was used
        call_args = mock_analyzer.analyze_segment.call_args
        assert call_args[1]['language'] == 'en'


class TestCORSHeaders:
    """Test CORS headers in responses."""
    
    def test_success_response_has_cors_headers(self):
        """Test that success response includes CORS headers."""
        response = success_response({'test': 'data'})
        
        assert 'Access-Control-Allow-Origin' in response['headers']
    
    def test_error_response_has_cors_headers(self):
        """Test that error response includes CORS headers."""
        response = error_response(
            400, 'ERROR', 'Message', 'call-123', 'seg-1', 1234567890.0
        )
        
        assert 'Access-Control-Allow-Origin' in response['headers']


class TestResponseSerialization:
    """Test response serialization."""
    
    def test_analysis_result_serialization(self):
        """Test that AnalysisResult can be serialized to JSON."""
        result = AnalysisResult(
            call_id='test-123',
            segment_id='seg-1',
            timestamp=1234567890.0,
            fraud_score=75,
            threat_level=ThreatLevel.DANGER,
            detected_patterns=[],
            confidence_score=0.92,
            explanation='High fraud risk detected',
            language='en',
            processing_time_ms=200
        )
        
        response = success_response(result.to_dict())
        
        # Should not raise
        body = json.loads(response['body'])
        assert body['fraud_score'] == 75
        assert body['threat_level'] == 'Danger'
