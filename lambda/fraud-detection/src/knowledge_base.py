"""
Knowledge Base Manager for scam pattern retrieval using Amazon Bedrock Knowledge Bases.

This module provides access to the scam pattern knowledge base for RAG-based
fraud detection pattern matching.
"""

import boto3
import logging
import json
from typing import List, Optional, Dict, Any
from botocore.exceptions import ClientError

from .models import ScamPattern, FraudDetectionError

logger = logging.getLogger(__name__)


class KnowledgeBaseManager:
    """Manager for Amazon Bedrock Knowledge Base containing scam patterns."""
    
    def __init__(
        self,
        knowledge_base_id: str,
        region: str = "us-east-1"
    ):
        """
        Initialize Knowledge Base manager.
        
        Args:
            knowledge_base_id: Bedrock Knowledge Base ID
            region: AWS region
        """
        self.knowledge_base_id = knowledge_base_id
        self.region = region
        
        # Initialize Bedrock Agent Runtime client for Retrieve API
        self.client = boto3.client(
            'bedrock-agent-runtime',
            region_name=region
        )
        
        # Initialize S3 client for pattern uploads
        self.s3_client = boto3.client('s3', region_name=region)
        
        logger.info(f"Initialized KnowledgeBaseManager with kb_id={knowledge_base_id}")
    
    def query_patterns(
        self,
        query_text: str,
        language: str = "en",
        max_results: int = 5
    ) -> List[ScamPattern]:
        """
        Query Knowledge Base for matching scam patterns.
        
        Uses the Retrieve API to find scam patterns that match the query text.
        Results are ranked by relevance using vector similarity.
        
        Args:
            query_text: Text to match against patterns
            language: Language code for filtering (e.g., "en", "es", "zh")
            max_results: Maximum number of patterns to return
            
        Returns:
            List of matching ScamPattern objects
            
        Raises:
            FraudDetectionError: If query fails
        """
        if not query_text or not query_text.strip():
            logger.warning("Empty query text provided")
            return []
        
        try:
            logger.debug(
                f"Querying Knowledge Base: query_length={len(query_text)}, "
                f"language={language}, max_results={max_results}"
            )
            
            # Call Retrieve API - request more results to account for language filtering
            # We'll filter and limit after parsing
            response = self.client.retrieve(
                knowledgeBaseId=self.knowledge_base_id,
                retrievalQuery={
                    'text': query_text
                },
                retrievalConfiguration={
                    'vectorSearchConfiguration': {
                        'numberOfResults': max_results * 2  # Request extra for filtering
                    }
                }
            )
            
            patterns = []
            
            # Parse retrieval results
            if 'retrievalResults' in response:
                for result in response['retrievalResults']:
                    # Stop if we've reached max_results
                    if len(patterns) >= max_results:
                        break
                        
                    try:
                        # Extract content from result
                        content = result.get('content', {}).get('text', '')
                        score = result.get('score', 0.0)
                        
                        # Try to parse as JSON (pattern document format)
                        try:
                            pattern_data = json.loads(content)
                        except json.JSONDecodeError:
                            # If not JSON, treat as plain text pattern
                            pattern_data = {
                                'pattern_id': f"pattern-{len(patterns)}",
                                'pattern_type': 'Unknown Pattern',
                                'description': content[:200],
                                'indicators': []
                            }
                        
                        # Filter by language if specified
                        pattern_lang = pattern_data.get('language', 'en')
                        if language and pattern_lang != language:
                            continue
                        
                        # Create ScamPattern object
                        pattern = ScamPattern(
                            pattern_id=pattern_data.get('pattern_id', f"pattern-{len(patterns)}"),
                            pattern_type=pattern_data.get('pattern_type', 'Unknown Pattern'),
                            description=pattern_data.get('description', ''),
                            confidence=float(score),
                            matched_indicators=pattern_data.get('indicators', [])
                        )
                        
                        patterns.append(pattern)
                        
                    except Exception as e:
                        logger.warning(f"Failed to parse retrieval result: {str(e)}")
                        continue
            
            logger.info(
                f"Knowledge Base query returned {len(patterns)} patterns "
                f"(requested {max_results})"
            )
            
            return patterns
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            
            logger.error(
                f"Knowledge Base query error: {error_code} - {error_message}",
                exc_info=True
            )
            
            # Don't raise - return empty list to allow analysis to continue
            # without KB patterns (degraded mode)
            logger.warning("Continuing analysis without Knowledge Base patterns")
            return []
            
        except Exception as e:
            logger.error(f"Unexpected error querying Knowledge Base: {str(e)}", exc_info=True)
            # Don't raise - return empty list for degraded mode
            return []
    
    def add_pattern(
        self,
        pattern: Dict[str, Any],
        s3_bucket: str,
        s3_prefix: str = "scam-patterns/"
    ) -> str:
        """
        Add new scam pattern to Knowledge Base.
        
        Uploads a pattern document to S3, which will be ingested by the
        Knowledge Base on the next sync/ingestion job.
        
        Args:
            pattern: Pattern data dictionary with required fields:
                - pattern_id: Unique identifier
                - pattern_type: Type of scam (e.g., "IRS Scam")
                - language: Language code (e.g., "en")
                - description: Pattern description
                - indicators: List of fraud indicators
                - example_scripts: Optional list of example scripts
                - severity: Optional severity level
            s3_bucket: S3 bucket name for Knowledge Base data source
            s3_prefix: S3 key prefix for pattern documents
            
        Returns:
            S3 key of uploaded pattern document
            
        Raises:
            FraudDetectionError: If upload fails
        """
        try:
            # Validate required fields
            required_fields = ['pattern_id', 'pattern_type', 'language', 'description']
            for field in required_fields:
                if field not in pattern:
                    raise ValueError(f"Missing required field: {field}")
            
            pattern_id = pattern['pattern_id']
            language = pattern['language']
            
            # Generate S3 key
            s3_key = f"{s3_prefix}{language}/{pattern_id}.json"
            
            logger.debug(f"Uploading pattern to s3://{s3_bucket}/{s3_key}")
            
            # Upload to S3
            self.s3_client.put_object(
                Bucket=s3_bucket,
                Key=s3_key,
                Body=json.dumps(pattern, indent=2),
                ContentType='application/json'
            )
            
            logger.info(
                f"Successfully uploaded pattern {pattern_id} to Knowledge Base "
                f"(s3://{s3_bucket}/{s3_key})"
            )
            
            return s3_key
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            
            logger.error(
                f"S3 upload error: {error_code} - {error_message}",
                exc_info=True
            )
            
            raise FraudDetectionError(
                f"Failed to add pattern to Knowledge Base: {error_code} - {error_message}"
            ) from e
            
        except Exception as e:
            logger.error(f"Unexpected error adding pattern: {str(e)}", exc_info=True)
            raise FraudDetectionError(f"Unexpected error adding pattern: {str(e)}") from e
    
    def validate_knowledge_base(self) -> bool:
        """
        Validate that the Knowledge Base is accessible.
        
        Returns:
            True if Knowledge Base is valid, False otherwise
        """
        try:
            # Try a simple query to validate access
            test_query = "test query"
            self.client.retrieve(
                knowledgeBaseId=self.knowledge_base_id,
                retrievalQuery={'text': test_query},
                retrievalConfiguration={
                    'vectorSearchConfiguration': {
                        'numberOfResults': 1
                    }
                }
            )
            logger.info("Knowledge Base validated successfully")
            return True
            
        except ClientError as e:
            logger.error(f"Knowledge Base validation failed: {str(e)}")
            return False
            
        except Exception as e:
            logger.error(f"Unexpected error validating Knowledge Base: {str(e)}")
            return False
