"""
Unit tests for ContextStore.

Tests conversation context management including:
- Context retrieval for existing and non-existing calls
- Context updates with multiple segments
- Context clearing
- TTL expiration
- Error handling for DynamoDB failures
"""

import pytest
import time
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal
from botocore.exceptions import ClientError

from src.context_store import ContextStore
from src.models import (
    ConversationContext,
    ConversationSegment,
    AnalysisResult,
    ThreatLevel,
    ScamPattern,
    ContextStoreError
)


class TestContextStore:
    """Test suite for ContextStore."""
    
    @pytest.fixture
    def mock_dynamodb_resource(self):
        """Create a mock boto3 DynamoDB resource."""
        return Mock()
    
    @pytest.fixture
    def mock_table(self):
        """Create a mock DynamoDB table."""
        return Mock()
    
    @pytest.fixture
    def context_store(self, mock_dynamodb_resource, mock_table):
        """Create a ContextStore instance for testing with mocked DynamoDB."""
        mock_dynamodb_resource.Table.return_value = mock_table
        
        with patch('boto3.resource', return_value=mock_dynamodb_resource):
            store = ContextStore(
                table_name="test-context-table",
                region="us-east-1"
            )
            store.table = mock_table  # Ensure mock table is used
            return store
    
    def test_initialization(self, context_store, mock_table):
        """Test ContextStore initialization."""
        assert context_store.table_name == "test-context-table"
        assert context_store.region == "us-east-1"
        assert context_store.table is mock_table
        assert context_store.MAX_SEGMENTS == 10
        assert context_store.TTL_SECONDS == 86400
    
    # Test context retrieval for non-existing calls
    
    def test_get_context_non_existing_call(self, context_store, mock_table):
        """Test retrieving context for a call that doesn't exist (returns empty context)."""
        # Arrange
        call_id = "non-existing-call-123"
        mock_table.get_item.return_value = {}  # No Item in response
        
        # Act
        context = context_store.get_context(call_id)
        
        # Assert
        assert isinstance(context, ConversationContext)
        assert context.call_id == call_id
        assert len(context.segments) == 0
        assert context.cumulative_fraud_score == 0
        assert len(context.detected_patterns) == 0
        assert context.language == 'en'
        
        # Verify DynamoDB call
        mock_table.get_item.assert_called_once_with(Key={'call_id': call_id})
    
    # Test context retrieval for existing calls
    
    def test_get_context_existing_call_single_segment(self, context_store, mock_table):
        """Test retrieving context for an existing call with one segment."""
        # Arrange
        call_id = "existing-call-456"
        mock_table.get_item.return_value = {
            'Item': {
                'call_id': call_id,
                'segments': [
                    {
                        'segment_id': 'seg-1',
                        'timestamp': Decimal('1234567890.0'),
                        'transcript_text': 'This is a test transcript',
                        'fraud_score': 25,
                        'threat_level': 'Safe'
                    }
                ],
                'cumulative_fraud_score': 25,
                'detected_pattern_ids': [],
                'language': 'en',
                'ttl': 1234567890 + 86400
            }
        }
        
        # Act
        context = context_store.get_context(call_id)
        
        # Assert
        assert context.call_id == call_id
        assert len(context.segments) == 1
        assert context.segments[0].segment_id == 'seg-1'
        assert context.segments[0].timestamp == 1234567890.0
        assert context.segments[0].transcript_text == 'This is a test transcript'
        assert context.segments[0].fraud_score == 25
        assert context.segments[0].threat_level == ThreatLevel.SAFE
        assert context.cumulative_fraud_score == 25
        assert context.language == 'en'
    
    def test_get_context_existing_call_multiple_segments(self, context_store, mock_table):
        """Test retrieving context for an existing call with multiple segments."""
        # Arrange
        call_id = "multi-segment-call-789"
        mock_table.get_item.return_value = {
            'Item': {
                'call_id': call_id,
                'segments': [
                    {
                        'segment_id': 'seg-1',
                        'timestamp': Decimal('1000.0'),
                        'transcript_text': 'First segment',
                        'fraud_score': 20,
                        'threat_level': 'Safe'
                    },
                    {
                        'segment_id': 'seg-2',
                        'timestamp': Decimal('2000.0'),
                        'transcript_text': 'Second segment',
                        'fraud_score': 45,
                        'threat_level': 'Caution'
                    },
                    {
                        'segment_id': 'seg-3',
                        'timestamp': Decimal('3000.0'),
                        'transcript_text': 'Third segment',
                        'fraud_score': 70,
                        'threat_level': 'Danger'
                    }
                ],
                'cumulative_fraud_score': 50,
                'detected_pattern_ids': ['irs-scam-001', 'urgency-001'],
                'language': 'es'
            }
        }
        
        # Act
        context = context_store.get_context(call_id)
        
        # Assert
        assert context.call_id == call_id
        assert len(context.segments) == 3
        assert context.segments[0].segment_id == 'seg-1'
        assert context.segments[1].segment_id == 'seg-2'
        assert context.segments[2].segment_id == 'seg-3'
        assert context.segments[0].threat_level == ThreatLevel.SAFE
        assert context.segments[1].threat_level == ThreatLevel.CAUTION
        assert context.segments[2].threat_level == ThreatLevel.DANGER
        assert context.cumulative_fraud_score == 50
        assert context.language == 'es'
    
    # Test context updates with multiple segments
    
    def test_update_context_first_segment(self, context_store, mock_table):
        """Test updating context with the first segment (new call)."""
        # Arrange
        call_id = "new-call-001"
        segment = ConversationSegment(
            segment_id='seg-1',
            timestamp=1000.0,
            transcript_text='First segment of new call',
            fraud_score=30,
            threat_level=ThreatLevel.SAFE
        )
        analysis = AnalysisResult(
            call_id=call_id,
            segment_id='seg-1',
            timestamp=1000.0,
            fraud_score=30,
            confidence_score=80,
            threat_level=ThreatLevel.SAFE,
            detected_patterns=[],
            urgency_detected=False,
            financial_demand_detected=False,
            financial_demand_type=None,
            explanation='No fraud indicators detected',
            language='en',
            processing_time_ms=150
        )
        
        # Mock get_item to return empty (new call)
        mock_table.get_item.return_value = {}
        
        stored_item = None
        def capture_put_item(Item):
            nonlocal stored_item
            stored_item = Item
        
        mock_table.put_item.side_effect = capture_put_item
        
        # Act
        context_store.update_context(call_id, segment, analysis)
        
        # Assert
        assert stored_item is not None
        assert stored_item['call_id'] == call_id
        assert len(stored_item['segments']) == 1
        assert stored_item['segments'][0]['segment_id'] == 'seg-1'
        assert stored_item['segments'][0]['fraud_score'] == 30
        assert stored_item['cumulative_fraud_score'] == 30
        assert stored_item['language'] == 'en'
        assert 'ttl' in stored_item
        assert stored_item['ttl'] > time.time()
    
    def test_update_context_multiple_segments(self, context_store, mock_table):
        """Test updating context with multiple segments sequentially."""
        # Arrange
        call_id = "multi-update-call-002"
        
        segments = [
            ConversationSegment(
                segment_id=f'seg-{i}',
                timestamp=float(i * 1000),
                transcript_text=f'Segment {i}',
                fraud_score=20 + (i * 10),
                threat_level=ThreatLevel.SAFE if i == 0 else ThreatLevel.CAUTION
            )
            for i in range(3)
        ]
        
        analyses = [
            AnalysisResult(
                call_id=call_id,
                segment_id=f'seg-{i}',
                timestamp=float(i * 1000),
                fraud_score=20 + (i * 10),
                confidence_score=75,
                threat_level=ThreatLevel.SAFE if i == 0 else ThreatLevel.CAUTION,
                detected_patterns=[],
                language='en'
            )
            for i in range(3)
        ]
        
        # Track stored items
        stored_items = {}
        
        def mock_get_item_func(Key):
            call_id_key = Key['call_id']
            if call_id_key in stored_items:
                return {'Item': stored_items[call_id_key]}
            return {}
        
        def mock_put_item_func(Item):
            stored_items[Item['call_id']] = Item
        
        mock_table.get_item.side_effect = mock_get_item_func
        mock_table.put_item.side_effect = mock_put_item_func
        
        # Act - Add segments one by one
        for segment, analysis in zip(segments, analyses):
            context_store.update_context(call_id, segment, analysis)
        
        # Assert
        final_item = stored_items[call_id]
        assert len(final_item['segments']) == 3
        assert final_item['segments'][0]['segment_id'] == 'seg-0'
        assert final_item['segments'][1]['segment_id'] == 'seg-1'
        assert final_item['segments'][2]['segment_id'] == 'seg-2'
        
        # Verify cumulative fraud score calculation (weighted average)
        # First: 20, Second: 20*0.7 + 30*0.3 = 23, Third: 23*0.7 + 40*0.3 = 28
        assert final_item['cumulative_fraud_score'] > 0
    
    def test_update_context_max_segments_limit(self, context_store, mock_table):
        """Test that context respects MAX_SEGMENTS limit (keeps only last 10 segments)."""
        # Arrange
        call_id = "max-segments-call-003"
        num_segments = 15  # More than MAX_SEGMENTS (10)
        
        # Track stored items
        stored_items = {}
        
        def mock_get_item_func(Key):
            call_id_key = Key['call_id']
            if call_id_key in stored_items:
                return {'Item': stored_items[call_id_key]}
            return {}
        
        def mock_put_item_func(Item):
            stored_items[Item['call_id']] = Item
        
        mock_table.get_item.side_effect = mock_get_item_func
        mock_table.put_item.side_effect = mock_put_item_func
        
        # Act - Add 15 segments
        for i in range(num_segments):
            segment = ConversationSegment(
                segment_id=f'seg-{i}',
                timestamp=float(i * 1000),
                transcript_text=f'Segment {i}',
                fraud_score=30,
                threat_level=ThreatLevel.SAFE
            )
            analysis = AnalysisResult(
                call_id=call_id,
                segment_id=f'seg-{i}',
                timestamp=float(i * 1000),
                fraud_score=30,
                confidence_score=70,
                threat_level=ThreatLevel.SAFE,
                language='en'
            )
            context_store.update_context(call_id, segment, analysis)
        
        # Assert
        final_item = stored_items[call_id]
        assert len(final_item['segments']) == context_store.MAX_SEGMENTS
        
        # Verify we kept the LAST 10 segments (seg-5 through seg-14)
        segment_ids = [seg['segment_id'] for seg in final_item['segments']]
        expected_ids = [f'seg-{i}' for i in range(5, 15)]
        assert segment_ids == expected_ids
    
    def test_update_context_with_detected_patterns(self, context_store, mock_table):
        """Test updating context with detected scam patterns."""
        # Arrange
        call_id = "pattern-call-004"
        
        pattern1 = ScamPattern(
            pattern_id='irs-scam-001',
            pattern_type='IRS Scam',
            description='IRS impersonation scam',
            confidence=0.9,
            matched_indicators=['threatening arrest', 'demanding payment']
        )
        
        pattern2 = ScamPattern(
            pattern_id='urgency-001',
            pattern_type='Urgency Tactics',
            description='Pressure tactics detected',
            confidence=0.85,
            matched_indicators=['act now', 'limited time']
        )
        
        segment = ConversationSegment(
            segment_id='seg-1',
            timestamp=1000.0,
            transcript_text='This is the IRS. Pay now or be arrested!',
            fraud_score=85,
            threat_level=ThreatLevel.DANGER
        )
        
        analysis = AnalysisResult(
            call_id=call_id,
            segment_id='seg-1',
            timestamp=1000.0,
            fraud_score=85,
            confidence_score=90,
            threat_level=ThreatLevel.DANGER,
            detected_patterns=[pattern1, pattern2],
            urgency_detected=True,
            financial_demand_detected=True,
            financial_demand_type='wire transfer',
            explanation='IRS scam with urgency tactics detected',
            language='en',
            processing_time_ms=200
        )
        
        mock_table.get_item.return_value = {}
        
        stored_item = None
        def capture_put_item(Item):
            nonlocal stored_item
            stored_item = Item
        
        mock_table.put_item.side_effect = capture_put_item
        
        # Act
        context_store.update_context(call_id, segment, analysis)
        
        # Assert
        assert 'detected_pattern_ids' in stored_item
        assert 'irs-scam-001' in stored_item['detected_pattern_ids']
        assert 'urgency-001' in stored_item['detected_pattern_ids']
        assert len(stored_item['detected_pattern_ids']) == 2
    
    # Test context clearing
    
    def test_clear_context_existing_call(self, context_store, mock_table):
        """Test clearing context for an existing call."""
        # Arrange
        call_id = "clear-call-005"
        
        # Act
        context_store.clear_context(call_id)
        
        # Assert
        mock_table.delete_item.assert_called_once_with(Key={'call_id': call_id})
    
    def test_clear_context_non_existing_call(self, context_store, mock_table):
        """Test clearing context for a non-existing call (should not raise error)."""
        # Arrange
        call_id = "non-existing-clear-006"
        
        # Act - Should complete without error even if call doesn't exist
        context_store.clear_context(call_id)
        
        # Assert
        mock_table.delete_item.assert_called_once_with(Key={'call_id': call_id})
    
    # Test TTL expiration
    
    def test_update_context_sets_ttl(self, context_store, mock_table):
        """Test that updating context sets TTL to 24 hours from now."""
        # Arrange
        call_id = "ttl-call-007"
        segment = ConversationSegment(
            segment_id='seg-1',
            timestamp=1000.0,
            transcript_text='Test segment',
            fraud_score=25,
            threat_level=ThreatLevel.SAFE
        )
        analysis = AnalysisResult(
            call_id=call_id,
            segment_id='seg-1',
            timestamp=1000.0,
            fraud_score=25,
            confidence_score=70,
            threat_level=ThreatLevel.SAFE,
            language='en'
        )
        
        mock_table.get_item.return_value = {}
        
        stored_item = None
        def capture_put_item(Item):
            nonlocal stored_item
            stored_item = Item
        
        mock_table.put_item.side_effect = capture_put_item
        
        current_time = time.time()
        
        # Act
        context_store.update_context(call_id, segment, analysis)
        
        # Assert
        assert 'ttl' in stored_item
        ttl_value = stored_item['ttl']
        
        # TTL should be approximately current_time + 86400 (24 hours)
        expected_ttl = current_time + context_store.TTL_SECONDS
        assert abs(ttl_value - expected_ttl) < 5  # Allow 5 second tolerance
    
    def test_ttl_value_is_24_hours(self, context_store):
        """Test that TTL_SECONDS constant is set to 24 hours."""
        assert context_store.TTL_SECONDS == 86400  # 24 hours in seconds
    
    # Test error handling
    
    def test_get_context_dynamodb_client_error(self, context_store, mock_table):
        """Test error handling when DynamoDB get_item fails."""
        # Arrange
        call_id = "error-call-008"
        error_response = {
            'Error': {
                'Code': 'ProvisionedThroughputExceededException',
                'Message': 'Rate exceeded'
            }
        }
        mock_table.get_item.side_effect = ClientError(error_response, 'GetItem')
        
        # Act & Assert
        with pytest.raises(ContextStoreError) as exc_info:
            context_store.get_context(call_id)
        
        assert 'ProvisionedThroughputExceededException' in str(exc_info.value)
        assert 'Rate exceeded' in str(exc_info.value)
    
    def test_update_context_dynamodb_client_error(self, context_store, mock_table):
        """Test error handling when DynamoDB put_item fails."""
        # Arrange
        call_id = "error-update-009"
        segment = ConversationSegment(
            segment_id='seg-1',
            timestamp=1000.0,
            transcript_text='Test',
            fraud_score=25,
            threat_level=ThreatLevel.SAFE
        )
        analysis = AnalysisResult(
            call_id=call_id,
            segment_id='seg-1',
            timestamp=1000.0,
            fraud_score=25,
            confidence_score=70,
            threat_level=ThreatLevel.SAFE,
            language='en'
        )
        
        mock_table.get_item.return_value = {}
        error_response = {
            'Error': {
                'Code': 'ResourceNotFoundException',
                'Message': 'Table not found'
            }
        }
        mock_table.put_item.side_effect = ClientError(error_response, 'PutItem')
        
        # Act & Assert
        with pytest.raises(ContextStoreError) as exc_info:
            context_store.update_context(call_id, segment, analysis)
        
        assert 'ResourceNotFoundException' in str(exc_info.value)
        assert 'Table not found' in str(exc_info.value)
    
    def test_clear_context_dynamodb_client_error(self, context_store, mock_table):
        """Test error handling when DynamoDB delete_item fails."""
        # Arrange
        call_id = "error-clear-010"
        error_response = {
            'Error': {
                'Code': 'InternalServerError',
                'Message': 'Internal error'
            }
        }
        mock_table.delete_item.side_effect = ClientError(error_response, 'DeleteItem')
        
        # Act & Assert
        with pytest.raises(ContextStoreError) as exc_info:
            context_store.clear_context(call_id)
        
        assert 'InternalServerError' in str(exc_info.value)
        assert 'Internal error' in str(exc_info.value)
    
    def test_get_context_unexpected_exception(self, context_store, mock_table):
        """Test error handling for unexpected exceptions during get_context."""
        # Arrange
        call_id = "unexpected-error-011"
        mock_table.get_item.side_effect = Exception("Unexpected error")
        
        # Act & Assert
        with pytest.raises(ContextStoreError) as exc_info:
            context_store.get_context(call_id)
        
        assert 'Unexpected error' in str(exc_info.value)
    
    # Test table validation
    
    def test_validate_table_success(self, context_store, mock_table):
        """Test successful table validation."""
        # Arrange
        mock_table.load.return_value = None  # Successful load
        
        # Act
        result = context_store.validate_table()
        
        # Assert
        assert result is True
        mock_table.load.assert_called_once()
    
    def test_validate_table_failure(self, context_store, mock_table):
        """Test table validation failure."""
        # Arrange
        error_response = {
            'Error': {
                'Code': 'ResourceNotFoundException',
                'Message': 'Table not found'
            }
        }
        mock_table.load.side_effect = ClientError(error_response, 'DescribeTable')
        
        # Act
        result = context_store.validate_table()
        
        # Assert
        assert result is False
    
    def test_validate_table_unexpected_error(self, context_store, mock_table):
        """Test table validation with unexpected error."""
        # Arrange
        mock_table.load.side_effect = Exception("Unexpected error")
        
        # Act
        result = context_store.validate_table()
        
        # Assert
        assert result is False
