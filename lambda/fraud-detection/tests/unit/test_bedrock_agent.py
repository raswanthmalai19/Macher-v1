"""
Unit tests for Bedrock Agent Client.

These tests verify specific examples, edge cases, and error handling
for the Bedrock Agent fraud detection client.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import time
from botocore.exceptions import ClientError

from src.bedrock_agent import BedrockAgentClient
from src.models import (
    AgentResponse,
    AnalysisResult,
    ConversationSegment,
    ScamPattern,
    ThreatLevel,
    BedrockAgentError
)


class TestBedrockAgentClientInitialization:
    """Test Bedrock Agent Client initialization and configuration."""
    
    def test_initialization_with_required_parameters(self):
        """Test client initialization with required parameters."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent-123",
                agent_alias_id="test-alias-456",
                region="us-east-1"
            )
            
            assert agent_client.agent_id == "test-agent-123"
            assert agent_client.agent_alias_id == "test-alias-456"
            assert agent_client.region == "us-east-1"
            assert agent_client.client is not None
            
            # Verify boto3 client was created with correct service
            mock_boto_client.assert_called_once_with(
                'bedrock-agent-runtime',
                region_name='us-east-1'
            )
    
    def test_initialization_with_default_region(self):
        """Test client initialization uses default region."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            assert agent_client.region == "us-east-1"
    
    def test_model_id_constant(self):
        """Test that Claude 3.5 Sonnet model ID is correctly configured."""
        assert BedrockAgentClient.MODEL_ID == "anthropic.claude-3-5-sonnet-20241022-v2:0"
    
    def test_retry_configuration(self):
        """Test retry configuration constants."""
        assert BedrockAgentClient.MAX_RETRIES == 3
        assert BedrockAgentClient.RETRY_DELAY_SECONDS == 1


class TestAnalyzeTranscript:
    """Test transcript analysis functionality."""
    
    def test_analyze_irs_scam_pattern(self):
        """Test detection of IRS scam pattern."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            # Mock agent response for IRS scam
            def mock_invoke_agent(**kwargs):
                response_text = """Fraud Score: 85
Confidence Score: 90
Detected Patterns: IRS Scam
Urgency Indicators: yes - immediate payment demanded
Financial Demands: yes - wire transfer requested
Explanation: This call exhibits classic IRS scam indicators including threats of arrest, demands for immediate payment via wire transfer, and urgency tactics. The IRS never demands immediate payment over the phone."""
                
                return {
                    'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                    'sessionId': kwargs['sessionId']
                }
            
            mock_client.invoke_agent.side_effect = mock_invoke_agent
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            transcript = "This is the IRS. You owe $5000 in back taxes. Pay immediately via wire transfer or you will be arrested."
            
            agent_response = agent_client.analyze_transcript(
                transcript_text=transcript,
                conversation_context=[],
                language="en"
            )
            
            assert agent_response is not None
            assert "IRS Scam" in agent_response.response_text
            assert agent_response.session_id.startswith("session-")
    
    def test_analyze_tech_support_scam_pattern(self):
        """Test detection of tech support scam pattern."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            def mock_invoke_agent(**kwargs):
                response_text = """Fraud Score: 78
Confidence Score: 85
Detected Patterns: Tech Support Scam
Urgency Indicators: yes - computer at risk
Financial Demands: yes - remote access and payment
Explanation: Classic tech support scam with fake virus warnings and requests for remote access."""
                
                return {
                    'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                    'sessionId': kwargs['sessionId']
                }
            
            mock_client.invoke_agent.side_effect = mock_invoke_agent
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            transcript = "This is Microsoft technical support. Your computer has a virus. We need remote access to fix it immediately."
            
            agent_response = agent_client.analyze_transcript(
                transcript_text=transcript,
                conversation_context=[],
                language="en"
            )
            
            assert "Tech Support Scam" in agent_response.response_text
    
    def test_analyze_grandparent_scam_pattern(self):
        """Test detection of grandparent scam pattern."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            def mock_invoke_agent(**kwargs):
                response_text = """Fraud Score: 82
Confidence Score: 88
Detected Patterns: Grandparent Scam
Urgency Indicators: yes - emergency situation
Financial Demands: yes - bail money via wire transfer
Explanation: Grandparent scam targeting elderly with fake emergency involving grandchild."""
                
                return {
                    'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                    'sessionId': kwargs['sessionId']
                }
            
            mock_client.invoke_agent.side_effect = mock_invoke_agent
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            transcript = "Grandma, it's me, your grandson. I'm in trouble and need bail money right away. Please don't tell mom and dad."
            
            agent_response = agent_client.analyze_transcript(
                transcript_text=transcript,
                conversation_context=[],
                language="en"
            )
            
            assert "Grandparent Scam" in agent_response.response_text
    
    def test_analyze_with_conversation_context(self):
        """Test analysis with previous conversation context."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            # Track the prompt sent to agent
            captured_prompt = None
            
            def mock_invoke_agent(**kwargs):
                nonlocal captured_prompt
                captured_prompt = kwargs['inputText']
                
                response_text = """Fraud Score: 65
Confidence Score: 75
Detected Patterns: IRS Scam
Urgency Indicators: yes
Financial Demands: yes
Explanation: Escalating fraud attempt with increasing pressure."""
                
                return {
                    'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                    'sessionId': kwargs['sessionId']
                }
            
            mock_client.invoke_agent.side_effect = mock_invoke_agent
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            # Create conversation context
            context = [
                ConversationSegment(
                    segment_id="seg-1",
                    timestamp=time.time() - 20,
                    transcript_text="This is the IRS calling about your taxes.",
                    fraud_score=45,
                    threat_level=ThreatLevel.CAUTION
                ),
                ConversationSegment(
                    segment_id="seg-2",
                    timestamp=time.time() - 10,
                    transcript_text="You need to pay immediately.",
                    fraud_score=60,
                    threat_level=ThreatLevel.CAUTION
                )
            ]
            
            transcript = "If you don't pay now, we will send police to arrest you."
            
            agent_response = agent_client.analyze_transcript(
                transcript_text=transcript,
                conversation_context=context,
                language="en"
            )
            
            # Verify context was included in prompt
            assert captured_prompt is not None
            assert "Previous conversation context" in captured_prompt
            assert "This is the IRS calling" in captured_prompt
            assert "Current transcript segment" in captured_prompt
    
    def test_analyze_novel_scam_pattern(self):
        """Test detection of novel/unknown scam pattern."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            def mock_invoke_agent(**kwargs):
                response_text = """Fraud Score: 70
Confidence Score: 65
Detected Patterns: Unknown Pattern
Urgency Indicators: yes
Financial Demands: yes - cryptocurrency
Explanation: Novel scam pattern detected. Caller uses unfamiliar tactics but exhibits fraud indicators including urgency and unusual payment method."""
                
                return {
                    'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                    'sessionId': kwargs['sessionId']
                }
            
            mock_client.invoke_agent.side_effect = mock_invoke_agent
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            transcript = "You've been selected for a special government program. Send Bitcoin to claim your benefits."
            
            agent_response = agent_client.analyze_transcript(
                transcript_text=transcript,
                conversation_context=[],
                language="en"
            )
            
            assert "Unknown Pattern" in agent_response.response_text or "novel" in agent_response.response_text.lower()
    
    def test_analyze_empty_transcript_raises_error(self):
        """Test that empty transcript raises ValueError."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            with pytest.raises(ValueError, match="Transcript text cannot be empty"):
                agent_client.analyze_transcript(
                    transcript_text="",
                    conversation_context=[],
                    language="en"
                )
            
            with pytest.raises(ValueError, match="Transcript text cannot be empty"):
                agent_client.analyze_transcript(
                    transcript_text="   ",
                    conversation_context=[],
                    language="en"
                )


class TestParseAgentResponse:
    """Test agent response parsing functionality."""
    
    def test_parse_response_extracts_all_fields(self):
        """Test parsing extracts fraud score, confidence, patterns, and explanation."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            response_text = """Fraud Score: 75
Confidence Score: 82
Detected Patterns: IRS Scam, Tech Support Scam
Urgency Indicators: yes - immediate action required
Financial Demands: yes - gift card requested
Explanation: Multiple fraud indicators detected including IRS impersonation and gift card payment request."""
            
            agent_response = AgentResponse(
                response_text=response_text,
                session_id="test-session",
                trace={}
            )
            
            analysis_result = agent_client.parse_agent_response(agent_response)
            
            assert analysis_result.fraud_score == 75
            assert analysis_result.confidence_score == 82
            assert analysis_result.urgency_detected is True
            assert analysis_result.financial_demand_detected is True
            assert analysis_result.financial_demand_type == "gift card"
            assert "Multiple fraud indicators" in analysis_result.explanation
    
    def test_parse_response_calculates_threat_level(self):
        """Test threat level calculation from fraud score."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            # Test SAFE level (0-30)
            response_safe = AgentResponse(
                response_text="Fraud Score: 25\nConfidence Score: 60\nExplanation: Low risk",
                session_id="test",
                trace={}
            )
            result_safe = agent_client.parse_agent_response(response_safe)
            assert result_safe.threat_level == ThreatLevel.SAFE
            
            # Test CAUTION level (31-60)
            response_caution = AgentResponse(
                response_text="Fraud Score: 45\nConfidence Score: 70\nExplanation: Moderate risk",
                session_id="test",
                trace={}
            )
            result_caution = agent_client.parse_agent_response(response_caution)
            assert result_caution.threat_level == ThreatLevel.CAUTION
            
            # Test DANGER level (61-100)
            response_danger = AgentResponse(
                response_text="Fraud Score: 85\nConfidence Score: 90\nExplanation: High risk",
                session_id="test",
                trace={}
            )
            result_danger = agent_client.parse_agent_response(response_danger)
            assert result_danger.threat_level == ThreatLevel.DANGER
    
    def test_parse_response_detects_patterns(self):
        """Test pattern detection from response text."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            response_text = """Fraud Score: 80
Confidence Score: 85
Detected Patterns: IRS Scam, Lottery Scam
Explanation: Multiple scam patterns identified."""
            
            agent_response = AgentResponse(
                response_text=response_text,
                session_id="test",
                trace={}
            )
            
            analysis_result = agent_client.parse_agent_response(agent_response)
            
            # Verify patterns were detected
            assert len(analysis_result.detected_patterns) > 0
            pattern_types = [p.pattern_type for p in analysis_result.detected_patterns]
            assert "IRS Scam" in pattern_types or "Lottery Scam" in pattern_types


class TestErrorHandling:
    """Test error handling and retry logic."""
    
    def test_retry_on_throttling_exception(self):
        """Test retry logic for throttling exceptions."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            # First two calls fail with throttling, third succeeds
            call_count = 0
            
            def mock_invoke_agent(**kwargs):
                nonlocal call_count
                call_count += 1
                
                if call_count <= 2:
                    error_response = {
                        'Error': {
                            'Code': 'ThrottlingException',
                            'Message': 'Rate exceeded'
                        }
                    }
                    raise ClientError(error_response, 'InvokeAgent')
                
                # Third call succeeds
                response_text = "Fraud Score: 30\nConfidence Score: 50\nExplanation: Success"
                return {
                    'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                    'sessionId': kwargs['sessionId']
                }
            
            mock_client.invoke_agent.side_effect = mock_invoke_agent
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            # Should succeed after retries
            with patch('time.sleep'):  # Mock sleep to speed up test
                agent_response = agent_client.analyze_transcript(
                    transcript_text="Test transcript",
                    conversation_context=[],
                    language="en"
                )
            
            assert agent_response is not None
            assert call_count == 3  # Verify it retried twice
    
    def test_max_retries_exceeded_raises_error(self):
        """Test that max retries exceeded raises BedrockAgentError."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            # All calls fail
            error_response = {
                'Error': {
                    'Code': 'ThrottlingException',
                    'Message': 'Rate exceeded'
                }
            }
            mock_client.invoke_agent.side_effect = ClientError(error_response, 'InvokeAgent')
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            with patch('time.sleep'):  # Mock sleep
                with pytest.raises(BedrockAgentError, match="Bedrock Agent invocation failed"):
                    agent_client.analyze_transcript(
                        transcript_text="Test transcript",
                        conversation_context=[],
                        language="en"
                    )
    
    def test_non_retryable_error_raises_immediately(self):
        """Test that non-retryable errors raise immediately without retry."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            call_count = 0
            
            def mock_invoke_agent(**kwargs):
                nonlocal call_count
                call_count += 1
                
                error_response = {
                    'Error': {
                        'Code': 'ValidationException',
                        'Message': 'Invalid input'
                    }
                }
                raise ClientError(error_response, 'InvokeAgent')
            
            mock_client.invoke_agent.side_effect = mock_invoke_agent
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            with pytest.raises(BedrockAgentError):
                agent_client.analyze_transcript(
                    transcript_text="Test transcript",
                    conversation_context=[],
                    language="en"
                )
            
            # Should fail on first attempt (non-retryable)
            assert call_count == 1
    
    def test_exponential_backoff(self):
        """Test exponential backoff delay between retries."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            call_count = 0
            
            def mock_invoke_agent(**kwargs):
                nonlocal call_count
                call_count += 1
                
                if call_count <= 2:
                    error_response = {
                        'Error': {
                            'Code': 'ServiceUnavailableException',
                            'Message': 'Service unavailable'
                        }
                    }
                    raise ClientError(error_response, 'InvokeAgent')
                
                response_text = "Fraud Score: 30\nConfidence Score: 50\nExplanation: Success"
                return {
                    'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                    'sessionId': kwargs['sessionId']
                }
            
            mock_client.invoke_agent.side_effect = mock_invoke_agent
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            sleep_calls = []
            
            def mock_sleep(seconds):
                sleep_calls.append(seconds)
            
            with patch('time.sleep', side_effect=mock_sleep):
                agent_response = agent_client.analyze_transcript(
                    transcript_text="Test transcript",
                    conversation_context=[],
                    language="en"
                )
            
            # Verify exponential backoff: 1s, 2s
            assert len(sleep_calls) == 2
            assert sleep_calls[0] == 1  # First retry: 1 * 2^0
            assert sleep_calls[1] == 2  # Second retry: 1 * 2^1


class TestAgentValidation:
    """Test agent validation functionality."""
    
    def test_validate_agent_success(self):
        """Test successful agent validation."""
        with patch('boto3.client') as mock_boto_client:
            mock_runtime_client = Mock()
            mock_bedrock_client = Mock()
            
            def client_factory(service_name, **kwargs):
                if service_name == 'bedrock-agent-runtime':
                    return mock_runtime_client
                elif service_name == 'bedrock-agent':
                    return mock_bedrock_client
                return Mock()
            
            mock_boto_client.side_effect = client_factory
            
            # Mock successful get_agent call
            mock_bedrock_client.get_agent.return_value = {
                'agent': {
                    'agentId': 'test-agent',
                    'agentName': 'Test Agent'
                }
            }
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            result = agent_client.validate_agent()
            
            assert result is True
            mock_bedrock_client.get_agent.assert_called_once_with(agentId='test-agent')
    
    def test_validate_agent_failure(self):
        """Test agent validation failure."""
        with patch('boto3.client') as mock_boto_client:
            mock_runtime_client = Mock()
            mock_bedrock_client = Mock()
            
            def client_factory(service_name, **kwargs):
                if service_name == 'bedrock-agent-runtime':
                    return mock_runtime_client
                elif service_name == 'bedrock-agent':
                    return mock_bedrock_client
                return Mock()
            
            mock_boto_client.side_effect = client_factory
            
            # Mock failed get_agent call
            error_response = {
                'Error': {
                    'Code': 'ResourceNotFoundException',
                    'Message': 'Agent not found'
                }
            }
            mock_bedrock_client.get_agent.side_effect = ClientError(error_response, 'GetAgent')
            
            agent_client = BedrockAgentClient(
                agent_id="invalid-agent",
                agent_alias_id="test-alias"
            )
            
            result = agent_client.validate_agent()
            
            assert result is False


class TestPromptBuilding:
    """Test prompt building for agent invocation."""
    
    def test_build_prompt_includes_language(self):
        """Test that prompt includes language information."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            captured_prompt = None
            
            def mock_invoke_agent(**kwargs):
                nonlocal captured_prompt
                captured_prompt = kwargs['inputText']
                
                response_text = "Fraud Score: 30\nConfidence Score: 50\nExplanation: Test"
                return {
                    'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                    'sessionId': kwargs['sessionId']
                }
            
            mock_client.invoke_agent.side_effect = mock_invoke_agent
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            agent_client.analyze_transcript(
                transcript_text="Test transcript",
                conversation_context=[],
                language="es"
            )
            
            assert "Language: es" in captured_prompt
    
    def test_build_prompt_limits_context_segments(self):
        """Test that prompt includes only last 3 context segments."""
        with patch('boto3.client') as mock_boto_client:
            mock_client = Mock()
            mock_boto_client.return_value = mock_client
            
            captured_prompt = None
            
            def mock_invoke_agent(**kwargs):
                nonlocal captured_prompt
                captured_prompt = kwargs['inputText']
                
                response_text = "Fraud Score: 30\nConfidence Score: 50\nExplanation: Test"
                return {
                    'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                    'sessionId': kwargs['sessionId']
                }
            
            mock_client.invoke_agent.side_effect = mock_invoke_agent
            
            agent_client = BedrockAgentClient(
                agent_id="test-agent",
                agent_alias_id="test-alias"
            )
            
            # Create 5 context segments
            context = [
                ConversationSegment(
                    segment_id=f"seg-{i}",
                    timestamp=time.time() - (5 - i) * 10,
                    transcript_text=f"Segment {i} text",
                    fraud_score=20 + i * 10,
                    threat_level=ThreatLevel.SAFE
                )
                for i in range(5)
            ]
            
            agent_client.analyze_transcript(
                transcript_text="Current segment",
                conversation_context=context,
                language="en"
            )
            
            # Verify only last 3 segments are in prompt
            assert "Segment 2 text" in captured_prompt
            assert "Segment 3 text" in captured_prompt
            assert "Segment 4 text" in captured_prompt
            assert "Segment 0 text" not in captured_prompt
            assert "Segment 1 text" not in captured_prompt
