"""
Guardrails Client for PII redaction using Amazon Bedrock Guardrails.

This module provides PII detection and redaction capabilities to ensure
privacy protection before transcript analysis.
"""

import boto3
import logging
from typing import Optional
from botocore.exceptions import ClientError

from .models import RedactionResult, GuardrailsError

logger = logging.getLogger(__name__)


class GuardrailsClient:
    """Client for Amazon Bedrock Guardrails PII redaction."""
    
    def __init__(
        self,
        guardrail_id: str,
        guardrail_version: str,
        region: str = "us-east-1"
    ):
        """
        Initialize Guardrails client.
        
        Args:
            guardrail_id: Bedrock Guardrail ID
            guardrail_version: Guardrail version (e.g., "1" or "DRAFT")
            region: AWS region
        """
        self.guardrail_id = guardrail_id
        self.guardrail_version = guardrail_version
        self.region = region
        
        # Initialize Bedrock Runtime client for ApplyGuardrail API
        self.client = boto3.client(
            'bedrock-runtime',
            region_name=region
        )
        
        logger.info(
            f"Initialized GuardrailsClient with guardrail_id={guardrail_id}, "
            f"version={guardrail_version}"
        )
    
    def redact_pii(self, text: str) -> RedactionResult:
        """
        Apply guardrails to redact PII from text.
        
        This method uses Amazon Bedrock Guardrails to detect and redact
        personally identifiable information (PII) including:
        - Names
        - Addresses
        - Phone numbers
        - Email addresses
        - Social Security Numbers (SSN)
        - Credit card numbers
        - Bank account numbers
        
        Args:
            text: Original transcript text
            
        Returns:
            RedactionResult with redacted text and detected PII types
            
        Raises:
            GuardrailsError: If redaction fails
        """
        if not text or not text.strip():
            logger.warning("Empty text provided for redaction")
            return RedactionResult(
                redacted_text="",
                detected_pii_types=[],
                redaction_count=0
            )
        
        try:
            logger.debug(f"Applying guardrails to text (length: {len(text)})")
            
            # Call ApplyGuardrail API
            response = self.client.apply_guardrail(
                guardrailIdentifier=self.guardrail_id,
                guardrailVersion=self.guardrail_version,
                source='INPUT',
                content=[
                    {
                        'text': {
                            'text': text
                        }
                    }
                ]
            )
            
            # Extract redacted text from response
            redacted_text = text  # Default to original if no redaction
            detected_pii_types = []
            redaction_count = 0
            
            # Parse response for redacted content
            if 'outputs' in response and len(response['outputs']) > 0:
                output = response['outputs'][0]
                if 'text' in output:
                    redacted_text = output['text']
            
            # Parse assessments for detected PII types
            if 'assessments' in response:
                for assessment in response['assessments']:
                    if 'sensitiveInformationPolicy' in assessment:
                        pii_policy = assessment['sensitiveInformationPolicy']
                        if 'piiEntities' in pii_policy:
                            for entity in pii_policy['piiEntities']:
                                pii_type = entity.get('type', 'UNKNOWN')
                                if pii_type not in detected_pii_types:
                                    detected_pii_types.append(pii_type)
                                redaction_count += 1
            
            # Check if guardrail blocked the content
            action = response.get('action', 'NONE')
            if action == 'GUARDRAIL_INTERVENED':
                logger.info(
                    f"Guardrail intervened: {redaction_count} PII entities detected "
                    f"({', '.join(detected_pii_types)})"
                )
            
            result = RedactionResult(
                redacted_text=redacted_text,
                detected_pii_types=detected_pii_types,
                redaction_count=redaction_count
            )
            
            logger.debug(
                f"Redaction complete: {redaction_count} entities redacted, "
                f"types: {detected_pii_types}"
            )
            
            return result
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            
            logger.error(
                f"Guardrails API error: {error_code} - {error_message}",
                exc_info=True
            )
            
            raise GuardrailsError(
                f"Failed to apply guardrails: {error_code} - {error_message}"
            ) from e
            
        except Exception as e:
            logger.error(f"Unexpected error during PII redaction: {str(e)}", exc_info=True)
            raise GuardrailsError(f"Unexpected error during PII redaction: {str(e)}") from e
    
    def validate_configuration(self) -> bool:
        """
        Validate that the guardrail configuration is accessible.
        
        Returns:
            True if configuration is valid, False otherwise
        """
        try:
            # Try to get guardrail details to validate configuration
            bedrock_client = boto3.client('bedrock', region_name=self.region)
            bedrock_client.get_guardrail(
                guardrailIdentifier=self.guardrail_id,
                guardrailVersion=self.guardrail_version
            )
            logger.info("Guardrail configuration validated successfully")
            return True
            
        except ClientError as e:
            logger.error(f"Guardrail configuration validation failed: {str(e)}")
            return False
            
        except Exception as e:
            logger.error(f"Unexpected error validating guardrail: {str(e)}")
            return False
