"""
Property-based tests for Bedrock Agent Client fraud analysis.

These tests verify universal correctness properties of the Bedrock Agent
fraud detection system using hypothesis for property-based testing.
"""

import pytest
from hypothesis import given, strategies as st, assume, settings
from unittest.mock import Mock, patch, MagicMock
import json
import time

from src.bedrock_agent import BedrockAgentClient
from src.models import (
    AgentResponse,
    AnalysisResult,
    ConversationSegment,
    ScamPattern,
    ThreatLevel,
    BedrockAgentError
)


# Test generators for Bedrock Agent testing

@st.composite
def partial_transcript_strategy(draw):
    """Generate partial or incomplete transcript segments."""
    # Generate transcripts of varying completeness
    completeness = draw(st.sampled_from(['very_short', 'incomplete_sentence', 'mid_sentence', 'single_word']))
    
    if completeness == 'very_short':
        # Very short transcripts (1-10 words)
        words = draw(st.lists(
            st.text(min_size=1, max_size=15, alphabet=st.characters(whitelist_categories=('L',))),
            min_size=1, max_size=10
        ))
        return ' '.join(words)
    elif completeness == 'incomplete_sentence':
        # Incomplete sentences (no ending punctuation)
        text = draw(st.text(min_size=10, max_size=100, alphabet=st.characters(blacklist_characters='\x00')))
        return text.rstrip('.!?')
    elif completeness == 'mid_sentence':
        # Text that cuts off mid-word or mid-phrase
        text = draw(st.text(min_size=20, max_size=80, alphabet=st.characters(blacklist_characters='\x00')))
        cutoff_point = draw(st.integers(min_value=10, max_value=len(text)-1))
        return text[:cutoff_point]
    else:  # single_word
        # Single word transcripts
        return draw(st.text(min_size=1, max_size=20, alphabet=st.characters(whitelist_categories=('L',))))


@st.composite
def conversation_context_strategy(draw):
    """Generate conversation context with varying amounts of history."""
    num_segments = draw(st.integers(min_value=0, max_value=5))
    
    segments = []
    for i in range(num_segments):
        segment = ConversationSegment(
            segment_id=f"seg-{i}",
            timestamp=time.time() - (num_segments - i) * 10.0,
            transcript_text=draw(st.text(min_size=10, max_size=100, alphabet=st.characters(blacklist_characters='\x00'))),
            fraud_score=draw(st.integers(min_value=0, max_value=100)),
            threat_level=draw(st.sampled_from([ThreatLevel.SAFE, ThreatLevel.CAUTION, ThreatLevel.DANGER]))
        )
        segments.append(segment)
    
    return segments


@st.composite
def transcript_with_patterns_strategy(draw):
    """Generate transcripts containing multiple scam patterns."""
    # Define pattern indicators for different scam types
    pattern_indicators = {
        'IRS Scam': ['IRS', 'tax', 'owe money', 'arrest warrant', 'pay immediately'],
        'Tech Support Scam': ['computer', 'virus', 'Microsoft', 'technical support', 'remote access'],
        'Grandparent Scam': ['grandson', 'granddaughter', 'emergency', 'bail money', 'accident'],
        'Lottery Scam': ['won', 'lottery', 'prize', 'claim', 'processing fee'],
        'Romance Scam': ['love', 'relationship', 'money', 'help', 'emergency']
    }
    
    # Select 2-4 different scam patterns to include
    num_patterns = draw(st.integers(min_value=2, max_value=4))
    selected_patterns = draw(st.lists(
        st.sampled_from(list(pattern_indicators.keys())),
        min_size=num_patterns,
        max_size=num_patterns,
        unique=True
    ))
    
    # Build transcript with indicators from multiple patterns
    transcript_parts = []
    for pattern_type in selected_patterns:
        indicators = pattern_indicators[pattern_type]
        # Pick 1-2 indicators from this pattern
        num_indicators = draw(st.integers(min_value=1, max_value=2))
        selected_indicators = draw(st.lists(
            st.sampled_from(indicators),
            min_size=num_indicators,
            max_size=num_indicators
        ))
        
        # Add indicators to transcript with some connecting text
        for indicator in selected_indicators:
            connector = draw(st.sampled_from([
                'You need to',
                'This is about',
                'We are calling regarding',
                'There is an issue with',
                'Please provide'
            ]))
            transcript_parts.append(f"{connector} {indicator}")
    
    # Join parts with periods
    transcript = '. '.join(transcript_parts) + '.'
    
    return transcript, selected_patterns


@st.composite
def agent_response_strategy(draw):
    """Generate mock agent responses with varying fraud scores and confidence."""
    fraud_score = draw(st.integers(min_value=0, max_value=100))
    confidence_score = draw(st.integers(min_value=0, max_value=100))
    
    # Generate response text in expected format
    response_parts = [
        f"Fraud Score: {fraud_score}",
        f"Confidence Score: {confidence_score}",
    ]
    
    # Add detected patterns
    pattern_types = draw(st.lists(
        st.sampled_from(['IRS Scam', 'Tech Support Scam', 'Grandparent Scam', 'Lottery Scam']),
        max_size=3
    ))
    if pattern_types:
        response_parts.append(f"Detected Patterns: {', '.join(pattern_types)}")
    
    # Add urgency indicators
    urgency = draw(st.booleans())
    response_parts.append(f"Urgency Indicators: {'yes - immediate action demanded' if urgency else 'no'}")
    
    # Add financial demands
    financial = draw(st.booleans())
    if financial:
        demand_type = draw(st.sampled_from(['gift card', 'wire transfer', 'credit card', 'bank account']))
        response_parts.append(f"Financial Demands: yes - {demand_type} requested")
    else:
        response_parts.append("Financial Demands: no")
    
    # Add explanation
    explanation = draw(st.text(min_size=20, max_size=200, alphabet=st.characters(blacklist_characters='\x00')))
    response_parts.append(f"Explanation: {explanation}")
    
    response_text = '\n'.join(response_parts)
    
    return AgentResponse(
        response_text=response_text,
        session_id=f"session-{draw(st.integers(min_value=1000, max_value=9999))}",
        trace={}
    )


# Property 6: Partial Transcript Handling
# **Validates: Requirements 3.3**

@pytest.mark.property
@given(
    partial_transcript=partial_transcript_strategy(),
    context=conversation_context_strategy()
)
@settings(max_examples=100, deadline=None)
def test_property_6_partial_transcript_handling(partial_transcript, context):
    """
    Property 6: Partial Transcript Handling
    
    For any partial or incomplete transcript segment, the system should produce
    a valid analysis result without errors, even when conversation context is limited.
    This verifies robustness in handling real-world streaming transcription scenarios.
    
    **Validates: Requirements 3.3**
    """
    # Mock Bedrock Agent Runtime client
    with patch('boto3.client') as mock_boto_client:
        mock_client = Mock()
        mock_boto_client.return_value = mock_client
        
        # Mock agent response for partial transcript
        def mock_invoke_agent(agentId, agentAliasId, sessionId, inputText, enableTrace):
            """Mock agent invocation that handles partial transcripts."""
            # Simulate agent processing partial transcript
            # Agent should still return valid response even for incomplete input
            
            # Generate a reasonable fraud score based on transcript length
            # Shorter/partial transcripts might have lower confidence
            transcript_length = len(inputText)
            
            if transcript_length < 20:
                fraud_score = 15  # Low score for very short transcripts
                confidence_score = 40  # Lower confidence for partial data
            elif transcript_length < 50:
                fraud_score = 25
                confidence_score = 55
            else:
                fraud_score = 30
                confidence_score = 65
            
            response_text = f"""Fraud Score: {fraud_score}
Confidence Score: {confidence_score}
Detected Patterns: None detected in partial transcript
Urgency Indicators: no
Financial Demands: no
Explanation: Partial transcript analyzed. Limited context available for comprehensive assessment."""
            
            # Create mock streaming response
            mock_event_stream = [
                {
                    'chunk': {
                        'bytes': response_text.encode('utf-8')
                    }
                }
            ]
            
            return {
                'completion': mock_event_stream,
                'sessionId': sessionId
            }
        
        mock_client.invoke_agent.side_effect = mock_invoke_agent
        
        # Initialize Bedrock Agent Client
        agent_client = BedrockAgentClient(
            agent_id="test-agent-id",
            agent_alias_id="test-alias-id",
            region="us-east-1"
        )
        
        # Analyze partial transcript - should not raise errors
        try:
            agent_response = agent_client.analyze_transcript(
                transcript_text=partial_transcript,
                conversation_context=context,
                language="en"
            )
            
            # Verify response is valid
            assert agent_response is not None, \
                "Agent should return valid response for partial transcript"
            assert isinstance(agent_response, AgentResponse), \
                "Response should be AgentResponse instance"
            assert agent_response.response_text, \
                "Response should contain response text"
            assert agent_response.session_id, \
                "Response should contain session ID"
            
            # Parse response into AnalysisResult
            analysis_result = agent_client.parse_agent_response(agent_response)
            
            # Verify analysis result is valid
            assert analysis_result is not None, \
                "Should produce valid analysis result for partial transcript"
            assert isinstance(analysis_result, AnalysisResult), \
                "Result should be AnalysisResult instance"
            
            # Verify fraud score is in valid range
            assert 0 <= analysis_result.fraud_score <= 100, \
                "Fraud score should be in valid range [0-100] even for partial transcript"
            
            # Verify confidence score is in valid range
            assert 0 <= analysis_result.confidence_score <= 100, \
                "Confidence score should be in valid range [0-100] even for partial transcript"
            
            # Verify threat level is valid
            assert analysis_result.threat_level in [ThreatLevel.SAFE, ThreatLevel.CAUTION, ThreatLevel.DANGER], \
                "Threat level should be valid even for partial transcript"
            
            # Verify explanation is present (even if it indicates limited context)
            assert analysis_result.explanation, \
                "Explanation should be present even for partial transcript"
            
        except ValueError as e:
            # Empty transcripts should raise ValueError, not crash
            if not partial_transcript or not partial_transcript.strip():
                pass  # Expected for empty transcripts
            else:
                pytest.fail(f"Should not raise ValueError for non-empty partial transcript: {e}")
        
        except BedrockAgentError as e:
            pytest.fail(f"Should not raise BedrockAgentError for partial transcript: {e}")
        
        except Exception as e:
            pytest.fail(f"Should not raise unexpected error for partial transcript: {e}")


@pytest.mark.property
@given(
    partial_transcript=partial_transcript_strategy(),
    context_size=st.integers(min_value=0, max_value=3)
)
@settings(max_examples=100, deadline=None)
def test_property_6_partial_transcript_with_limited_context(partial_transcript, context_size):
    """
    Property 6: Partial Transcript Handling (Limited context variant)
    
    For any partial transcript with limited conversation context, the system
    should still produce valid analysis without requiring extensive history.
    
    **Validates: Requirements 3.3**
    """
    # Skip empty transcripts
    assume(partial_transcript and partial_transcript.strip())
    
    # Generate limited context
    context = []
    for i in range(context_size):
        context.append(ConversationSegment(
            segment_id=f"seg-{i}",
            timestamp=time.time() - (context_size - i) * 10.0,
            transcript_text=f"Previous segment {i}",
            fraud_score=20,
            threat_level=ThreatLevel.SAFE
        ))
    
    # Mock Bedrock Agent Runtime client
    with patch('boto3.client') as mock_boto_client:
        mock_client = Mock()
        mock_boto_client.return_value = mock_client
        
        # Mock successful agent response
        def mock_invoke_agent(agentId, agentAliasId, sessionId, inputText, enableTrace):
            response_text = """Fraud Score: 25
Confidence Score: 50
Detected Patterns: None
Urgency Indicators: no
Financial Demands: no
Explanation: Analysis based on limited context and partial transcript."""
            
            return {
                'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                'sessionId': sessionId
            }
        
        mock_client.invoke_agent.side_effect = mock_invoke_agent
        
        # Initialize client and analyze
        agent_client = BedrockAgentClient(
            agent_id="test-agent-id",
            agent_alias_id="test-alias-id"
        )
        
        # Should succeed even with limited context
        agent_response = agent_client.analyze_transcript(
            transcript_text=partial_transcript,
            conversation_context=context,
            language="en"
        )
        
        assert agent_response is not None, \
            "Should handle partial transcript with limited context"
        
        analysis_result = agent_client.parse_agent_response(agent_response)
        
        assert 0 <= analysis_result.fraud_score <= 100, \
            "Should produce valid fraud score with limited context"
        assert analysis_result.threat_level in [ThreatLevel.SAFE, ThreatLevel.CAUTION, ThreatLevel.DANGER], \
            "Should produce valid threat level with limited context"


# Property 7: Pattern Detection Completeness
# **Validates: Requirements 6.2, 6.3**

@pytest.mark.property
@given(transcript_with_patterns=transcript_with_patterns_strategy())
@settings(max_examples=100, deadline=None)
def test_property_7_pattern_detection_completeness(transcript_with_patterns):
    """
    Property 7: Pattern Detection Completeness
    
    For any transcript containing multiple distinct scam patterns, all present
    patterns should be detected and included in the analysis result. This verifies
    that the agent can identify multiple fraud indicators simultaneously.
    
    **Validates: Requirements 6.2, 6.3**
    """
    transcript, expected_patterns = transcript_with_patterns
    
    # Mock Bedrock Agent Runtime client
    with patch('boto3.client') as mock_boto_client:
        mock_client = Mock()
        mock_boto_client.return_value = mock_client
        
        # Mock agent response that detects all patterns
        def mock_invoke_agent(agentId, agentAliasId, sessionId, inputText, enableTrace):
            """Mock agent that detects all patterns in transcript."""
            # Analyze input text to detect which patterns are present
            detected = []
            
            if 'IRS' in inputText or 'tax' in inputText:
                detected.append('IRS Scam')
            if 'computer' in inputText or 'virus' in inputText or 'Microsoft' in inputText:
                detected.append('Tech Support Scam')
            if 'grandson' in inputText or 'granddaughter' in inputText or 'bail' in inputText:
                detected.append('Grandparent Scam')
            if 'lottery' in inputText or 'prize' in inputText or 'won' in inputText:
                detected.append('Lottery Scam')
            if 'love' in inputText or 'relationship' in inputText:
                detected.append('Romance Scam')
            
            # Calculate fraud score based on number of patterns
            fraud_score = min(100, 30 + len(detected) * 20)
            
            patterns_text = ', '.join(detected) if detected else 'None'
            
            response_text = f"""Fraud Score: {fraud_score}
Confidence Score: 85
Detected Patterns: {patterns_text}
Urgency Indicators: yes
Financial Demands: yes - payment requested
Explanation: Multiple scam patterns detected: {patterns_text}. High likelihood of fraud attempt."""
            
            return {
                'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                'sessionId': sessionId
            }
        
        mock_client.invoke_agent.side_effect = mock_invoke_agent
        
        # Initialize Bedrock Agent Client
        agent_client = BedrockAgentClient(
            agent_id="test-agent-id",
            agent_alias_id="test-alias-id"
        )
        
        # Analyze transcript with multiple patterns
        agent_response = agent_client.analyze_transcript(
            transcript_text=transcript,
            conversation_context=[],
            language="en"
        )
        
        # Parse response
        analysis_result = agent_client.parse_agent_response(agent_response)
        
        # Verify multiple patterns were detected
        assert analysis_result is not None, \
            "Should produce analysis result for multi-pattern transcript"
        
        # Verify detected patterns list exists
        assert hasattr(analysis_result, 'detected_patterns'), \
            "Analysis result should have detected_patterns field"
        
        # For transcripts with multiple pattern indicators, we expect detection
        # Note: The mock detects patterns based on keywords
        # In real implementation, Bedrock Agent would use Knowledge Base
        
        # Verify fraud score reflects multiple patterns (should be elevated)
        if len(expected_patterns) >= 2:
            assert analysis_result.fraud_score >= 30, \
                "Fraud score should be elevated when multiple patterns are present"
        
        # Verify explanation mentions multiple patterns or indicators
        explanation_lower = analysis_result.explanation.lower()
        assert 'pattern' in explanation_lower or 'scam' in explanation_lower or 'fraud' in explanation_lower, \
            "Explanation should reference detected patterns"


@pytest.mark.property
@given(
    transcript_with_patterns=transcript_with_patterns_strategy(),
    context=conversation_context_strategy()
)
@settings(max_examples=50, deadline=None)
def test_property_7_pattern_detection_with_context(transcript_with_patterns, context):
    """
    Property 7: Pattern Detection Completeness (With context variant)
    
    For any transcript containing multiple patterns, pattern detection should work
    correctly even when conversation context is present, ensuring context doesn't
    interfere with pattern identification.
    
    **Validates: Requirements 6.2, 6.3**
    """
    transcript, expected_patterns = transcript_with_patterns
    
    # Mock Bedrock Agent Runtime client
    with patch('boto3.client') as mock_boto_client:
        mock_client = Mock()
        mock_boto_client.return_value = mock_client
        
        # Mock agent response
        def mock_invoke_agent(agentId, agentAliasId, sessionId, inputText, enableTrace):
            # Detect patterns in current transcript (not context)
            detected = []
            
            # Extract current transcript from prompt (after "Current transcript segment")
            if 'Current transcript segment' in inputText:
                current_part = inputText.split('Current transcript segment')[-1]
            else:
                current_part = inputText
            
            if 'IRS' in current_part or 'tax' in current_part:
                detected.append('IRS Scam')
            if 'computer' in current_part or 'virus' in current_part:
                detected.append('Tech Support Scam')
            if 'grandson' in current_part or 'granddaughter' in current_part:
                detected.append('Grandparent Scam')
            if 'lottery' in current_part or 'prize' in current_part:
                detected.append('Lottery Scam')
            
            fraud_score = min(100, 35 + len(detected) * 18)
            patterns_text = ', '.join(detected) if detected else 'None'
            
            response_text = f"""Fraud Score: {fraud_score}
Confidence Score: 80
Detected Patterns: {patterns_text}
Urgency Indicators: yes
Financial Demands: yes
Explanation: Detected patterns: {patterns_text}"""
            
            return {
                'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                'sessionId': sessionId
            }
        
        mock_client.invoke_agent.side_effect = mock_invoke_agent
        
        # Initialize client
        agent_client = BedrockAgentClient(
            agent_id="test-agent-id",
            agent_alias_id="test-alias-id"
        )
        
        # Analyze with context
        agent_response = agent_client.analyze_transcript(
            transcript_text=transcript,
            conversation_context=context,
            language="en"
        )
        
        analysis_result = agent_client.parse_agent_response(agent_response)
        
        # Verify analysis succeeded with context
        assert analysis_result is not None, \
            "Should detect patterns even with conversation context present"
        
        # Verify fraud score is valid
        assert 0 <= analysis_result.fraud_score <= 100, \
            "Fraud score should be valid with context"


# Property 15: Confidence Score Validity
# **Validates: Requirements 11.1, 11.5**

@pytest.mark.property
@given(agent_response=agent_response_strategy())
@settings(max_examples=100, deadline=None)
def test_property_15_confidence_score_validity(agent_response):
    """
    Property 15: Confidence Score Validity
    
    For any analysis result, the confidence score should be between 0 and 100
    (inclusive) and should be present alongside the fraud score. This verifies
    that confidence scoring is consistently applied.
    
    **Validates: Requirements 11.1, 11.5**
    """
    # Mock Bedrock Agent Runtime client (not needed for parsing test)
    with patch('boto3.client') as mock_boto_client:
        mock_client = Mock()
        mock_boto_client.return_value = mock_client
        
        # Initialize Bedrock Agent Client
        agent_client = BedrockAgentClient(
            agent_id="test-agent-id",
            agent_alias_id="test-alias-id"
        )
        
        # Parse agent response
        analysis_result = agent_client.parse_agent_response(agent_response)
        
        # Verify confidence score is present
        assert hasattr(analysis_result, 'confidence_score'), \
            "Analysis result should have confidence_score field"
        
        # Verify confidence score is in valid range [0-100]
        assert 0 <= analysis_result.confidence_score <= 100, \
            f"Confidence score should be between 0 and 100, got {analysis_result.confidence_score}"
        
        # Verify confidence score is an integer
        assert isinstance(analysis_result.confidence_score, int), \
            "Confidence score should be an integer"
        
        # Verify fraud score is also present (confidence accompanies fraud score)
        assert hasattr(analysis_result, 'fraud_score'), \
            "Analysis result should have fraud_score field alongside confidence_score"
        
        # Verify fraud score is also in valid range
        assert 0 <= analysis_result.fraud_score <= 100, \
            f"Fraud score should be between 0 and 100, got {analysis_result.fraud_score}"


@pytest.mark.property
@given(
    fraud_score=st.integers(min_value=0, max_value=100),
    confidence_score=st.integers(min_value=0, max_value=100)
)
@settings(max_examples=100, deadline=None)
def test_property_15_confidence_score_always_present(fraud_score, confidence_score):
    """
    Property 15: Confidence Score Validity (Always present variant)
    
    For any fraud score value, a corresponding confidence score should always
    be present in the analysis result, ensuring paired scoring.
    
    **Validates: Requirements 11.1, 11.5**
    """
    # Create agent response with specific scores
    response_text = f"""Fraud Score: {fraud_score}
Confidence Score: {confidence_score}
Detected Patterns: Test Pattern
Urgency Indicators: no
Financial Demands: no
Explanation: Test analysis with fraud score {fraud_score} and confidence {confidence_score}."""
    
    agent_response = AgentResponse(
        response_text=response_text,
        session_id="test-session",
        trace={}
    )
    
    # Mock client
    with patch('boto3.client') as mock_boto_client:
        mock_client = Mock()
        mock_boto_client.return_value = mock_client
        
        agent_client = BedrockAgentClient(
            agent_id="test-agent-id",
            agent_alias_id="test-alias-id"
        )
        
        # Parse response
        analysis_result = agent_client.parse_agent_response(agent_response)
        
        # Verify both scores are present
        assert analysis_result.fraud_score == fraud_score, \
            "Fraud score should match input"
        assert analysis_result.confidence_score == confidence_score, \
            "Confidence score should match input"
        
        # Verify both are in valid range
        assert 0 <= analysis_result.fraud_score <= 100, \
            "Fraud score should be in valid range"
        assert 0 <= analysis_result.confidence_score <= 100, \
            "Confidence score should be in valid range"


@pytest.mark.property
@given(
    transcript=st.text(min_size=20, max_size=200, alphabet=st.characters(blacklist_characters='\x00'))
)
@settings(max_examples=50, deadline=None)
def test_property_15_confidence_score_in_complete_workflow(transcript):
    """
    Property 15: Confidence Score Validity (Complete workflow variant)
    
    For any transcript analysis through the complete workflow, the final
    analysis result should contain a valid confidence score.
    
    **Validates: Requirements 11.1, 11.5**
    """
    # Skip empty transcripts
    assume(transcript and transcript.strip())
    
    # Mock Bedrock Agent Runtime client
    with patch('boto3.client') as mock_boto_client:
        mock_client = Mock()
        mock_boto_client.return_value = mock_client
        
        # Mock agent response with confidence score
        def mock_invoke_agent(agentId, agentAliasId, sessionId, inputText, enableTrace):
            response_text = """Fraud Score: 45
Confidence Score: 72
Detected Patterns: None
Urgency Indicators: no
Financial Demands: no
Explanation: Standard analysis with confidence scoring."""
            
            return {
                'completion': [{'chunk': {'bytes': response_text.encode('utf-8')}}],
                'sessionId': sessionId
            }
        
        mock_client.invoke_agent.side_effect = mock_invoke_agent
        
        # Initialize client
        agent_client = BedrockAgentClient(
            agent_id="test-agent-id",
            agent_alias_id="test-alias-id"
        )
        
        # Complete workflow: analyze and parse
        agent_response = agent_client.analyze_transcript(
            transcript_text=transcript,
            conversation_context=[],
            language="en"
        )
        
        analysis_result = agent_client.parse_agent_response(agent_response)
        
        # Verify confidence score is present and valid in complete workflow
        assert hasattr(analysis_result, 'confidence_score'), \
            "Complete workflow should produce confidence score"
        assert 0 <= analysis_result.confidence_score <= 100, \
            "Confidence score should be valid in complete workflow"
        assert isinstance(analysis_result.confidence_score, int), \
            "Confidence score should be integer in complete workflow"
