"""
Bedrock Agent Client for fraud analysis using Claude 3.5 Sonnet.

This module provides the interface to Amazon Bedrock Agents for intelligent
fraud detection analysis with conversation context and knowledge base integration.
"""

import boto3
import logging
import time
import json
from typing import List, Dict, Any, Optional
from botocore.exceptions import ClientError

from .models import (
    AgentResponse,
    AnalysisResult,
    ConversationSegment,
    ScamPattern,
    ThreatLevel,
    BedrockAgentError
)

logger = logging.getLogger(__name__)


class BedrockAgentClient:
    """Client for Amazon Bedrock Agent fraud analysis."""
    
    # Claude 3.5 Sonnet model ID
    MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0"
    
    # Retry configuration
    MAX_RETRIES = 3
    RETRY_DELAY_SECONDS = 1
    
    def __init__(
        self,
        agent_id: str,
        agent_alias_id: str,
        region: str = "us-east-1"
    ):
        """
        Initialize Bedrock Agent client.
        
        Args:
            agent_id: Bedrock Agent ID
            agent_alias_id: Agent alias ID (e.g., "TSTALIASID" or production alias)
            region: AWS region
        """
        self.agent_id = agent_id
        self.agent_alias_id = agent_alias_id
        self.region = region
        
        # Initialize Bedrock Agent Runtime client
        self.client = boto3.client(
            'bedrock-agent-runtime',
            region_name=region
        )
        
        logger.info(
            f"Initialized BedrockAgentClient with agent_id={agent_id}, "
            f"alias_id={agent_alias_id}"
        )
    
    def analyze_transcript(
        self,
        transcript_text: str,
        conversation_context: List[ConversationSegment],
        language: str = "en"
    ) -> AgentResponse:
        """
        Invoke Bedrock Agent to analyze transcript segment.
        
        Args:
            transcript_text: Redacted transcript text to analyze
            conversation_context: Previous segments from this call
            language: Language code for analysis
            
        Returns:
            AgentResponse with fraud analysis
            
        Raises:
            BedrockAgentError: If agent invocation fails after retries
        """
        if not transcript_text or not transcript_text.strip():
            raise ValueError("Transcript text cannot be empty")
        
        # Build agent prompt with context
        prompt = self._build_analysis_prompt(
            transcript_text,
            conversation_context,
            language
        )
        
        # Invoke agent with retry logic
        for attempt in range(self.MAX_RETRIES):
            try:
                logger.debug(
                    f"Invoking Bedrock Agent (attempt {attempt + 1}/{self.MAX_RETRIES}): "
                    f"transcript_length={len(transcript_text)}, "
                    f"context_segments={len(conversation_context)}"
                )
                
                start_time = time.time()
                
                # Generate unique session ID for this analysis
                session_id = f"session-{int(time.time() * 1000)}"
                
                # Invoke agent
                response = self.client.invoke_agent(
                    agentId=self.agent_id,
                    agentAliasId=self.agent_alias_id,
                    sessionId=session_id,
                    inputText=prompt,
                    enableTrace=True
                )
                
                # Parse streaming response
                response_text = self._parse_agent_response(response)
                
                elapsed_ms = int((time.time() - start_time) * 1000)
                
                logger.info(
                    f"Bedrock Agent analysis completed in {elapsed_ms}ms "
                    f"(response_length={len(response_text)})"
                )
                
                # Extract trace information if available
                trace = {}
                if 'trace' in response:
                    trace = response.get('trace', {})
                
                return AgentResponse(
                    response_text=response_text,
                    session_id=session_id,
                    trace=trace
                )
                
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                error_message = e.response.get('Error', {}).get('Message', str(e))
                
                logger.warning(
                    f"Bedrock Agent invocation failed (attempt {attempt + 1}/{self.MAX_RETRIES}): "
                    f"{error_code} - {error_message}"
                )
                
                # Check if error is retryable
                if error_code in ['ThrottlingException', 'ServiceUnavailableException']:
                    if attempt < self.MAX_RETRIES - 1:
                        # Exponential backoff
                        delay = self.RETRY_DELAY_SECONDS * (2 ** attempt)
                        logger.info(f"Retrying in {delay} seconds...")
                        time.sleep(delay)
                        continue
                
                # Non-retryable error or max retries reached
                raise BedrockAgentError(
                    f"Bedrock Agent invocation failed: {error_code} - {error_message}"
                ) from e
                
            except Exception as e:
                logger.error(
                    f"Unexpected error invoking Bedrock Agent: {str(e)}",
                    exc_info=True
                )
                
                if attempt < self.MAX_RETRIES - 1:
                    delay = self.RETRY_DELAY_SECONDS * (2 ** attempt)
                    logger.info(f"Retrying in {delay} seconds...")
                    time.sleep(delay)
                    continue
                
                raise BedrockAgentError(
                    f"Unexpected error invoking Bedrock Agent: {str(e)}"
                ) from e
        
        # Should not reach here, but just in case
        raise BedrockAgentError("Max retries exceeded")
    
    def parse_agent_response(self, agent_response: AgentResponse) -> AnalysisResult:
        """
        Parse agent response into structured AnalysisResult.
        
        This method extracts fraud score, confidence score, threat level,
        detected patterns, and explanation from the agent's response text.
        
        Args:
            agent_response: Raw agent response
            
        Returns:
            Structured AnalysisResult
        """
        # Extract fraud score
        fraud_score = agent_response.extract_fraud_score()
        
        # Extract confidence score
        confidence_score = agent_response.extract_confidence_score()
        
        # Calculate threat level based on fraud score
        threat_level = self._calculate_threat_level(fraud_score)
        
        # Extract detected patterns
        detected_patterns = agent_response.extract_patterns()
        
        # Extract explanation
        explanation = agent_response.extract_explanation()
        
        # Detect urgency indicators
        urgency_detected = self._detect_urgency(agent_response.response_text)
        
        # Detect financial demands
        financial_demand_detected, financial_demand_type = self._detect_financial_demand(
            agent_response.response_text
        )
        
        # Create analysis result (will be populated with call/segment IDs by caller)
        result = AnalysisResult(
            call_id="",  # To be set by caller
            segment_id="",  # To be set by caller
            timestamp=time.time(),
            fraud_score=fraud_score,
            confidence_score=confidence_score,
            threat_level=threat_level,
            detected_patterns=detected_patterns,
            urgency_detected=urgency_detected,
            financial_demand_detected=financial_demand_detected,
            financial_demand_type=financial_demand_type,
            explanation=explanation,
            language="en",  # To be set by caller
            processing_time_ms=0  # To be set by caller
        )
        
        return result
    
    def _build_analysis_prompt(
        self,
        transcript_text: str,
        conversation_context: List[ConversationSegment],
        language: str
    ) -> str:
        """Build analysis prompt with context for the agent."""
        prompt_parts = [
            "Analyze the following phone call transcript for fraud indicators.",
            f"Language: {language}",
            ""
        ]
        
        # Add conversation context if available
        if conversation_context:
            prompt_parts.append("Previous conversation context:")
            for seg in conversation_context[-3:]:  # Last 3 segments
                prompt_parts.append(
                    f"- [{seg.threat_level.value}] Score {seg.fraud_score}: "
                    f"\"{seg.transcript_text[:100]}...\""
                )
            prompt_parts.append("")
        
        # Add current transcript
        prompt_parts.extend([
            "Current transcript segment to analyze:",
            f"\"{transcript_text}\"",
            "",
            "Provide your analysis in the following format:",
            "Fraud Score: [0-100]",
            "Confidence Score: [0-100]",
            "Detected Patterns: [list any scam patterns detected]",
            "Urgency Indicators: [yes/no and details]",
            "Financial Demands: [yes/no and type if detected]",
            "Explanation: [clear explanation of your assessment]"
        ])
        
        return "\n".join(prompt_parts)
    
    def _parse_agent_response(self, response: Dict[str, Any]) -> str:
        """Parse streaming response from agent invocation."""
        response_text = ""
        
        # The response is an EventStream
        if 'completion' in response:
            event_stream = response['completion']
            
            for event in event_stream:
                if 'chunk' in event:
                    chunk = event['chunk']
                    if 'bytes' in chunk:
                        # Decode bytes to string
                        chunk_text = chunk['bytes'].decode('utf-8')
                        response_text += chunk_text
        
        return response_text.strip()
    
    def _calculate_threat_level(self, fraud_score: int) -> ThreatLevel:
        """Calculate threat level from fraud score."""
        if fraud_score <= 30:
            return ThreatLevel.SAFE
        elif fraud_score <= 60:
            return ThreatLevel.CAUTION
        else:
            return ThreatLevel.DANGER
    
    def _detect_urgency(self, response_text: str) -> bool:
        """Detect urgency indicators in agent response."""
        urgency_keywords = [
            'urgency', 'urgent', 'immediate', 'pressure', 'rush',
            'act now', 'limited time', 'hurry', 'quickly'
        ]
        
        response_lower = response_text.lower()
        return any(keyword in response_lower for keyword in urgency_keywords)
    
    def _detect_financial_demand(self, response_text: str) -> tuple[bool, Optional[str]]:
        """Detect financial demands in agent response."""
        # Order matters: check more specific patterns first
        financial_keywords = [
            ('gift card', 'gift card'),
            ('wire transfer', 'wire transfer'),
            ('credit card', 'credit card'),
            ('bank account', 'bank account'),
            ('cryptocurrency', 'cryptocurrency'),
            ('bitcoin', 'cryptocurrency'),
            ('money transfer', 'money transfer'),
            ('cash', 'cash payment'),
            ('payment', 'payment'),
            ('money', 'money transfer'),
        ]
        
        response_lower = response_text.lower()
        
        # Check more specific patterns first
        for keyword, demand_type in financial_keywords:
            if keyword in response_lower:
                return True, demand_type
        
        return False, None
    
    def validate_agent(self) -> bool:
        """
        Validate that the agent is accessible and configured correctly.
        
        Returns:
            True if agent is valid, False otherwise
        """
        try:
            # Try to get agent details
            bedrock_client = boto3.client('bedrock-agent', region_name=self.region)
            bedrock_client.get_agent(agentId=self.agent_id)
            logger.info("Bedrock Agent validated successfully")
            return True
            
        except ClientError as e:
            logger.error(f"Bedrock Agent validation failed: {str(e)}")
            return False
            
        except Exception as e:
            logger.error(f"Unexpected error validating agent: {str(e)}")
            return False
