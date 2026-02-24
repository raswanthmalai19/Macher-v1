"""
AWS Lambda handler for fraud detection analysis.

This module provides the Lambda entry point for the fraud detection service,
handling API Gateway events and coordinating the analysis workflow.
"""

import json
import logging
import os
import traceback
from typing import Dict, Any

from aws_xray_sdk.core import xray_recorder
from aws_xray_sdk.core import patch_all

from .fraud_analyzer import create_fraud_analyzer
from .models import (
    ErrorResponse,
    UnsupportedLanguageError,
    GuardrailsError,
    BedrockAgentError,
    ContextStoreError
)

# Patch AWS SDK for X-Ray tracing
patch_all()

# Configure logging
log_level = os.environ.get('LOG_LEVEL', 'INFO')
logging.basicConfig(
    level=log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize fraud analyzer (reused across invocations)
fraud_analyzer = None


def get_fraud_analyzer():
    """
    Get or create fraud analyzer instance.
    
    Lazy initialization to reuse across Lambda invocations (warm starts).
    """
    global fraud_analyzer
    
    if fraud_analyzer is None:
        logger.info("Initializing fraud analyzer...")
        
        # Load configuration from environment variables
        guardrail_id = os.environ.get('GUARDRAIL_ID')
        guardrail_version = os.environ.get('GUARDRAIL_VERSION', '1')
        context_table_name = os.environ.get('CONTEXT_TABLE_NAME')
        knowledge_base_id = os.environ.get('KNOWLEDGE_BASE_ID')
        agent_id = os.environ.get('BEDROCK_AGENT_ID')
        agent_alias_id = os.environ.get('BEDROCK_AGENT_ALIAS_ID')
        region = os.environ.get('AWS_REGION', 'us-east-1')
        
        # Validate required environment variables
        required_vars = {
            'GUARDRAIL_ID': guardrail_id,
            'CONTEXT_TABLE_NAME': context_table_name,
            'KNOWLEDGE_BASE_ID': knowledge_base_id,
            'BEDROCK_AGENT_ID': agent_id,
            'BEDROCK_AGENT_ALIAS_ID': agent_alias_id
        }
        
        missing_vars = [name for name, value in required_vars.items() if not value]
        if missing_vars:
            raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")
        
        # Create fraud analyzer
        fraud_analyzer = create_fraud_analyzer(
            guardrail_id=guardrail_id,
            guardrail_version=guardrail_version,
            context_table_name=context_table_name,
            knowledge_base_id=knowledge_base_id,
            agent_id=agent_id,
            agent_alias_id=agent_alias_id,
            region=region
        )
        
        logger.info("Fraud analyzer initialized successfully")
    
    return fraud_analyzer


@xray_recorder.capture('handler')
def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler for fraud detection analysis.
    
    Expects API Gateway event with JSON body containing:
    - call_id: Unique call identifier
    - segment_id: Unique segment identifier
    - transcript_text: Transcribed text to analyze
    - timestamp: Unix timestamp
    - language: Language code (optional, default: "en")
    
    Args:
        event: API Gateway event
        context: Lambda context
        
    Returns:
        API Gateway response with analysis result or error
    """
    request_id = context.request_id if context else 'unknown'
    
    logger.info(f"Received fraud analysis request: request_id={request_id}")
    
    try:
        # Parse request body
        body = parse_request_body(event)
        
        # Extract parameters
        call_id = body.get('call_id')
        segment_id = body.get('segment_id')
        transcript_text = body.get('transcript_text')
        timestamp = body.get('timestamp')
        language = body.get('language', 'en')
        
        # Validate required parameters
        if not all([call_id, segment_id, transcript_text, timestamp]):
            return error_response(
                status_code=400,
                error_code='INVALID_REQUEST',
                error_message='Missing required parameters: call_id, segment_id, transcript_text, timestamp',
                call_id=call_id or '',
                segment_id=segment_id or '',
                timestamp=timestamp or 0
            )
        
        # Log request details (without PII)
        logger.info(
            f"Processing analysis: call_id={call_id}, segment_id={segment_id}, "
            f"language={language}, transcript_length={len(transcript_text)}"
        )
        
        # Get fraud analyzer
        analyzer = get_fraud_analyzer()
        
        # Perform analysis
        result = analyzer.analyze_segment(
            call_id=call_id,
            segment_id=segment_id,
            transcript_text=transcript_text,
            timestamp=float(timestamp),
            language=language
        )
        
        # Return success response
        return success_response(result.to_dict())
        
    except UnsupportedLanguageError as e:
        logger.warning(f"Unsupported language: {str(e)}")
        return error_response(
            status_code=400,
            error_code='UNSUPPORTED_LANGUAGE',
            error_message=str(e),
            call_id=body.get('call_id', ''),
            segment_id=body.get('segment_id', ''),
            timestamp=body.get('timestamp', 0)
        )
        
    except GuardrailsError as e:
        logger.error(f"Guardrails error: {str(e)}")
        return error_response(
            status_code=500,
            error_code='GUARDRAILS_ERROR',
            error_message='PII redaction failed. Analysis cannot proceed without privacy protection.',
            call_id=body.get('call_id', ''),
            segment_id=body.get('segment_id', ''),
            timestamp=body.get('timestamp', 0),
            retry_possible=True
        )
        
    except BedrockAgentError as e:
        logger.error(f"Bedrock Agent error: {str(e)}")
        return error_response(
            status_code=500,
            error_code='AGENT_ERROR',
            error_message='Fraud analysis failed. Please try again.',
            call_id=body.get('call_id', ''),
            segment_id=body.get('segment_id', ''),
            timestamp=body.get('timestamp', 0),
            retry_possible=True
        )
        
    except ContextStoreError as e:
        logger.error(f"Context store error: {str(e)}")
        # Context errors are non-fatal - analysis can continue without context
        return error_response(
            status_code=500,
            error_code='CONTEXT_ERROR',
            error_message='Context storage failed. Analysis may be less accurate.',
            call_id=body.get('call_id', ''),
            segment_id=body.get('segment_id', ''),
            timestamp=body.get('timestamp', 0),
            retry_possible=True
        )
        
    except ValueError as e:
        logger.warning(f"Validation error: {str(e)}")
        return error_response(
            status_code=400,
            error_code='VALIDATION_ERROR',
            error_message=str(e),
            call_id=body.get('call_id', '') if 'body' in locals() else '',
            segment_id=body.get('segment_id', '') if 'body' in locals() else '',
            timestamp=body.get('timestamp', 0) if 'body' in locals() else 0
        )
        
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return error_response(
            status_code=500,
            error_code='INTERNAL_ERROR',
            error_message='An unexpected error occurred. Please try again.',
            call_id=body.get('call_id', '') if 'body' in locals() else '',
            segment_id=body.get('segment_id', '') if 'body' in locals() else '',
            timestamp=body.get('timestamp', 0) if 'body' in locals() else 0,
            retry_possible=True
        )


def parse_request_body(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse request body from API Gateway event.
    
    Args:
        event: API Gateway event
        
    Returns:
        Parsed request body
        
    Raises:
        ValueError: If body is missing or invalid JSON
    """
    if 'body' not in event:
        raise ValueError("Request body is missing")
    
    body = event['body']
    
    # Handle string body (API Gateway)
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in request body: {str(e)}")
    
    return body


def success_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create success response for API Gateway.
    
    Args:
        data: Response data
        
    Returns:
        API Gateway response
    """
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'  # Configure CORS as needed
        },
        'body': json.dumps(data)
    }


def error_response(
    status_code: int,
    error_code: str,
    error_message: str,
    call_id: str,
    segment_id: str,
    timestamp: float,
    retry_possible: bool = False
) -> Dict[str, Any]:
    """
    Create error response for API Gateway.
    
    Args:
        status_code: HTTP status code
        error_code: Error code
        error_message: Error message
        call_id: Call ID from request
        segment_id: Segment ID from request
        timestamp: Timestamp from request
        retry_possible: Whether retry is possible
        
    Returns:
        API Gateway response
    """
    error = ErrorResponse(
        error_code=error_code,
        error_message=error_message,
        call_id=call_id,
        segment_id=segment_id,
        timestamp=timestamp,
        retry_possible=retry_possible
    )
    
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'  # Configure CORS as needed
        },
        'body': json.dumps(error.to_dict())
    }
