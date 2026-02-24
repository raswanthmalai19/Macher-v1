"""
Context Store for conversation history using Amazon DynamoDB.

This module manages conversation context across multiple transcript segments,
enabling the fraud detection system to analyze patterns and escalations over time.
"""

import boto3
import logging
import time
from typing import Optional
from botocore.exceptions import ClientError
from decimal import Decimal

from .models import (
    ConversationContext,
    ConversationSegment,
    AnalysisResult,
    ThreatLevel,
    ContextStoreError
)

logger = logging.getLogger(__name__)


class ContextStore:
    """Store and retrieve conversation context using DynamoDB."""
    
    # Maximum number of segments to keep in context (last 10 segments)
    MAX_SEGMENTS = 10
    
    # TTL: 24 hours (86400 seconds)
    TTL_SECONDS = 86400
    
    def __init__(
        self,
        table_name: str,
        region: str = "us-east-1"
    ):
        """
        Initialize DynamoDB context store.
        
        Args:
            table_name: DynamoDB table name for context storage
            region: AWS region
        """
        self.table_name = table_name
        self.region = region
        
        # Initialize DynamoDB resource
        dynamodb = boto3.resource('dynamodb', region_name=region)
        self.table = dynamodb.Table(table_name)
        
        logger.info(f"Initialized ContextStore with table={table_name}")
    
    def get_context(self, call_id: str) -> ConversationContext:
        """
        Retrieve conversation context for a call.
        
        Args:
            call_id: Unique call identifier
            
        Returns:
            ConversationContext with previous segments and analysis
            
        Raises:
            ContextStoreError: If retrieval fails
        """
        try:
            logger.debug(f"Retrieving context for call_id={call_id}")
            
            response = self.table.get_item(
                Key={'call_id': call_id}
            )
            
            if 'Item' not in response:
                # No existing context - return empty context
                logger.debug(f"No existing context found for call_id={call_id}")
                return ConversationContext(call_id=call_id)
            
            item = response['Item']
            
            # Parse segments from DynamoDB item
            segments = []
            for seg_data in item.get('segments', []):
                segment = ConversationSegment(
                    segment_id=seg_data['segment_id'],
                    timestamp=float(seg_data['timestamp']),
                    transcript_text=seg_data['transcript_text'],
                    fraud_score=int(seg_data['fraud_score']),
                    threat_level=ThreatLevel(seg_data['threat_level'])
                )
                segments.append(segment)
            
            # Parse detected patterns (simplified - just store pattern types)
            detected_patterns = []  # Patterns stored separately in full analysis
            
            context = ConversationContext(
                call_id=call_id,
                segments=segments,
                cumulative_fraud_score=int(item.get('cumulative_fraud_score', 0)),
                detected_patterns=detected_patterns,
                language=item.get('language', 'en')
            )
            
            logger.debug(
                f"Retrieved context for call_id={call_id}: "
                f"{len(segments)} segments, cumulative_score={context.cumulative_fraud_score}"
            )
            
            return context
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            
            logger.error(
                f"DynamoDB error retrieving context: {error_code} - {error_message}",
                exc_info=True
            )
            
            raise ContextStoreError(
                f"Failed to retrieve context: {error_code} - {error_message}"
            ) from e
            
        except Exception as e:
            logger.error(f"Unexpected error retrieving context: {str(e)}", exc_info=True)
            raise ContextStoreError(f"Unexpected error retrieving context: {str(e)}") from e
    
    def update_context(
        self,
        call_id: str,
        segment: ConversationSegment,
        analysis: AnalysisResult
    ) -> None:
        """
        Update conversation context with new segment and analysis.
        
        Args:
            call_id: Unique call identifier
            segment: New transcript segment
            analysis: Analysis result for this segment
            
        Raises:
            ContextStoreError: If update fails
        """
        try:
            logger.debug(f"Updating context for call_id={call_id}, segment_id={segment.segment_id}")
            
            # Get existing context
            context = self.get_context(call_id)
            
            # Add new segment
            context.segments.append(segment)
            
            # Keep only last MAX_SEGMENTS segments
            if len(context.segments) > self.MAX_SEGMENTS:
                context.segments = context.segments[-self.MAX_SEGMENTS:]
            
            # Update cumulative fraud score (weighted average)
            if context.cumulative_fraud_score == 0:
                context.cumulative_fraud_score = analysis.fraud_score
            else:
                # Weight: 70% previous, 30% new (emphasize recent behavior)
                context.cumulative_fraud_score = int(
                    context.cumulative_fraud_score * 0.7 + analysis.fraud_score * 0.3
                )
            
            # Add detected patterns (avoid duplicates)
            for pattern in analysis.detected_patterns:
                if not any(p.pattern_id == pattern.pattern_id for p in context.detected_patterns):
                    context.detected_patterns.append(pattern)
            
            # Update language if not set
            if not context.language or context.language == 'en':
                context.language = analysis.language
            
            # Calculate TTL (current time + 24 hours)
            ttl = int(time.time()) + self.TTL_SECONDS
            
            # Prepare segments for DynamoDB (convert to dict)
            segments_data = []
            for seg in context.segments:
                segments_data.append({
                    'segment_id': seg.segment_id,
                    'timestamp': Decimal(str(seg.timestamp)),
                    'transcript_text': seg.transcript_text,
                    'fraud_score': seg.fraud_score,
                    'threat_level': seg.threat_level.value
                })
            
            # Store pattern IDs only (full patterns in analysis results)
            pattern_ids = [p.pattern_id for p in context.detected_patterns]
            
            # Update DynamoDB item
            self.table.put_item(
                Item={
                    'call_id': call_id,
                    'segments': segments_data,
                    'cumulative_fraud_score': context.cumulative_fraud_score,
                    'detected_pattern_ids': pattern_ids,
                    'language': context.language,
                    'ttl': ttl,
                    'last_updated': Decimal(str(time.time()))
                }
            )
            
            logger.info(
                f"Updated context for call_id={call_id}: "
                f"{len(context.segments)} segments, cumulative_score={context.cumulative_fraud_score}"
            )
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            
            logger.error(
                f"DynamoDB error updating context: {error_code} - {error_message}",
                exc_info=True
            )
            
            raise ContextStoreError(
                f"Failed to update context: {error_code} - {error_message}"
            ) from e
            
        except Exception as e:
            logger.error(f"Unexpected error updating context: {str(e)}", exc_info=True)
            raise ContextStoreError(f"Unexpected error updating context: {str(e)}") from e
    
    def clear_context(self, call_id: str) -> None:
        """
        Clear conversation context when call ends.
        
        Args:
            call_id: Unique call identifier
            
        Raises:
            ContextStoreError: If deletion fails
        """
        try:
            logger.debug(f"Clearing context for call_id={call_id}")
            
            self.table.delete_item(
                Key={'call_id': call_id}
            )
            
            logger.info(f"Cleared context for call_id={call_id}")
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            
            logger.error(
                f"DynamoDB error clearing context: {error_code} - {error_message}",
                exc_info=True
            )
            
            raise ContextStoreError(
                f"Failed to clear context: {error_code} - {error_message}"
            ) from e
            
        except Exception as e:
            logger.error(f"Unexpected error clearing context: {str(e)}", exc_info=True)
            raise ContextStoreError(f"Unexpected error clearing context: {str(e)}") from e
    
    def validate_table(self) -> bool:
        """
        Validate that the DynamoDB table exists and is accessible.
        
        Returns:
            True if table is valid, False otherwise
        """
        try:
            # Try to describe the table
            self.table.load()
            logger.info(f"DynamoDB table {self.table_name} validated successfully")
            return True
            
        except ClientError as e:
            logger.error(f"DynamoDB table validation failed: {str(e)}")
            return False
            
        except Exception as e:
            logger.error(f"Unexpected error validating table: {str(e)}")
            return False
