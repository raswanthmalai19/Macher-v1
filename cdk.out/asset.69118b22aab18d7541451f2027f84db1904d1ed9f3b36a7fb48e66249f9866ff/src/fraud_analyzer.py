"""
Fraud Analyzer - Main orchestrator for AI-powered fraud detection.

This module coordinates all components to provide end-to-end fraud analysis
of phone call transcripts with PII protection and context awareness.
"""

import logging
import time
from typing import Optional

from .models import (
    AnalysisResult,
    ConversationSegment,
    ThreatLevel,
    UnsupportedLanguageError,
    GuardrailsError,
    BedrockAgentError,
    ContextStoreError
)
from .guardrails_client import GuardrailsClient
from .context_store import ContextStore
from .knowledge_base import KnowledgeBaseManager
from .bedrock_agent import BedrockAgentClient

logger = logging.getLogger(__name__)


class FraudAnalyzer:
    """
    Main API for fraud detection analysis.
    
    Orchestrates the complete fraud detection workflow:
    1. Validate input and language support
    2. Apply PII redaction via Guardrails
    3. Retrieve conversation context
    4. Query Knowledge Base for scam patterns
    5. Invoke Bedrock Agent for analysis
    6. Update conversation context
    7. Return structured analysis result
    """
    
    # Supported languages
    SUPPORTED_LANGUAGES = ['en', 'es', 'zh', 'hi', 'fr']
    
    def __init__(
        self,
        guardrails_client: GuardrailsClient,
        context_store: ContextStore,
        knowledge_base: KnowledgeBaseManager,
        bedrock_agent: BedrockAgentClient
    ):
        """
        Initialize Fraud Analyzer with all required components.
        
        Args:
            guardrails_client: Client for PII redaction
            context_store: Store for conversation context
            knowledge_base: Manager for scam pattern knowledge base
            bedrock_agent: Client for Bedrock Agent analysis
        """
        self.guardrails = guardrails_client
        self.context_store = context_store
        self.knowledge_base = knowledge_base
        self.bedrock_agent = bedrock_agent
        
        logger.info("Initialized FraudAnalyzer with all components")
    
    def analyze_segment(
        self,
        call_id: str,
        segment_id: str,
        transcript_text: str,
        timestamp: float,
        language: str = "en"
    ) -> AnalysisResult:
        """
        Analyze a transcript segment for fraud indicators.
        
        This is the main entry point for fraud detection analysis. It coordinates
        all components to provide comprehensive fraud analysis with privacy protection.
        
        Args:
            call_id: Unique identifier for the phone call session
            segment_id: Unique identifier for this transcript segment
            transcript_text: The transcribed text to analyze
            timestamp: Unix timestamp when segment was created
            language: ISO 639-1 language code (default: "en")
            
        Returns:
            AnalysisResult containing fraud score, threat level, patterns, and explanation
            
        Raises:
            UnsupportedLanguageError: If language is not supported
            GuardrailsError: If PII redaction fails
            BedrockAgentError: If agent analysis fails
            ContextStoreError: If context operations fail
        """
        start_time = time.time()
        
        logger.info(
            f"Starting fraud analysis: call_id={call_id}, segment_id={segment_id}, "
            f"language={language}, transcript_length={len(transcript_text)}"
        )
        
        try:
            # Step 1: Validate input
            self._validate_input(call_id, segment_id, transcript_text, language)
            
            # Step 2: Apply PII redaction
            logger.debug("Applying PII redaction...")
            redaction_result = self.guardrails.redact_pii(transcript_text)
            redacted_text = redaction_result.redacted_text
            
            if redaction_result.redaction_count > 0:
                logger.info(
                    f"Redacted {redaction_result.redaction_count} PII entities: "
                    f"{', '.join(redaction_result.detected_pii_types)}"
                )
            
            # Step 3: Retrieve conversation context
            logger.debug("Retrieving conversation context...")
            context = self.context_store.get_context(call_id)
            
            # Step 4: Query Knowledge Base for relevant scam patterns
            logger.debug("Querying Knowledge Base for scam patterns...")
            kb_patterns = self.knowledge_base.query_patterns(
                query_text=redacted_text,
                language=language,
                max_results=5
            )
            
            if kb_patterns:
                logger.info(f"Found {len(kb_patterns)} matching scam patterns from Knowledge Base")
            
            # Step 5: Invoke Bedrock Agent for analysis
            logger.debug("Invoking Bedrock Agent for fraud analysis...")
            agent_response = self.bedrock_agent.analyze_transcript(
                transcript_text=redacted_text,
                conversation_context=context.segments,
                language=language
            )
            
            # Step 6: Parse agent response into structured result
            logger.debug("Parsing agent response...")
            analysis_result = self.bedrock_agent.parse_agent_response(agent_response)
            
            # Populate result with call/segment information
            analysis_result.call_id = call_id
            analysis_result.segment_id = segment_id
            analysis_result.timestamp = timestamp
            analysis_result.language = language
            
            # Add KB patterns to detected patterns if not already present
            for kb_pattern in kb_patterns:
                if not any(p.pattern_id == kb_pattern.pattern_id 
                          for p in analysis_result.detected_patterns):
                    analysis_result.detected_patterns.append(kb_pattern)
            
            # Calculate processing time
            processing_time_ms = int((time.time() - start_time) * 1000)
            analysis_result.processing_time_ms = processing_time_ms
            
            # Step 7: Update conversation context
            logger.debug("Updating conversation context...")
            segment = ConversationSegment(
                segment_id=segment_id,
                timestamp=timestamp,
                transcript_text=redacted_text,  # Store redacted version only
                fraud_score=analysis_result.fraud_score,
                threat_level=analysis_result.threat_level
            )
            
            self.context_store.update_context(call_id, segment, analysis_result)
            
            # Log final result
            logger.info(
                f"Analysis complete: fraud_score={analysis_result.fraud_score}, "
                f"threat_level={analysis_result.threat_level.value}, "
                f"confidence={analysis_result.confidence_score}, "
                f"patterns={len(analysis_result.detected_patterns)}, "
                f"processing_time={processing_time_ms}ms"
            )
            
            return analysis_result
            
        except (UnsupportedLanguageError, GuardrailsError, BedrockAgentError, 
                ContextStoreError) as e:
            # Re-raise known errors
            logger.error(f"Fraud analysis failed: {str(e)}")
            raise
            
        except Exception as e:
            # Log and wrap unexpected errors
            logger.error(f"Unexpected error during fraud analysis: {str(e)}", exc_info=True)
            raise BedrockAgentError(f"Unexpected error during fraud analysis: {str(e)}") from e
    
    def _validate_input(
        self,
        call_id: str,
        segment_id: str,
        transcript_text: str,
        language: str
    ) -> None:
        """
        Validate input parameters.
        
        Raises:
            ValueError: If input is invalid
            UnsupportedLanguageError: If language is not supported
        """
        if not call_id or not call_id.strip():
            raise ValueError("call_id cannot be empty")
        
        if not segment_id or not segment_id.strip():
            raise ValueError("segment_id cannot be empty")
        
        if not transcript_text or not transcript_text.strip():
            raise ValueError("transcript_text cannot be empty")
        
        if language not in self.SUPPORTED_LANGUAGES:
            raise UnsupportedLanguageError(
                f"Language '{language}' is not supported. "
                f"Supported languages: {', '.join(self.SUPPORTED_LANGUAGES)}"
            )
    
    def clear_call_context(self, call_id: str) -> None:
        """
        Clear conversation context when a call ends.
        
        Args:
            call_id: Unique call identifier
        """
        try:
            self.context_store.clear_context(call_id)
            logger.info(f"Cleared context for call_id={call_id}")
        except Exception as e:
            logger.error(f"Failed to clear context for call_id={call_id}: {str(e)}")
            # Don't raise - this is a cleanup operation


# Factory function for easy initialization
def create_fraud_analyzer(
    guardrail_id: str,
    guardrail_version: str,
    context_table_name: str,
    knowledge_base_id: str,
    agent_id: str,
    agent_alias_id: str,
    region: str = "us-east-1"
) -> FraudAnalyzer:
    """
    Factory function to create a fully configured FraudAnalyzer.
    
    Args:
        guardrail_id: Bedrock Guardrail ID
        guardrail_version: Guardrail version
        context_table_name: DynamoDB table name for context
        knowledge_base_id: Bedrock Knowledge Base ID
        agent_id: Bedrock Agent ID
        agent_alias_id: Agent alias ID
        region: AWS region
        
    Returns:
        Configured FraudAnalyzer instance
    """
    guardrails = GuardrailsClient(guardrail_id, guardrail_version, region)
    context_store = ContextStore(context_table_name, region)
    knowledge_base = KnowledgeBaseManager(knowledge_base_id, region)
    bedrock_agent = BedrockAgentClient(agent_id, agent_alias_id, region)
    
    return FraudAnalyzer(guardrails, context_store, knowledge_base, bedrock_agent)
