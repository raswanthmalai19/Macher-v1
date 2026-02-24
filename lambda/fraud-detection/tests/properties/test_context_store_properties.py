"""
Property-based tests for Context Store conversation persistence.

These tests verify universal correctness properties of the conversation context
management system using hypothesis for property-based testing.
"""

import pytest
from hypothesis import given, strategies as st, assume
from unittest.mock import Mock, patch
from decimal import Decimal

from src.context_store import ContextStore
from src.models import (
    ConversationContext,
    ConversationSegment,
    AnalysisResult,
    ThreatLevel,
    ScamPattern
)


# Test generators for context store testing

@st.composite
def conversation_segment_strategy(draw):
    """Generate arbitrary ConversationSegment instances."""
    fraud_score = draw(st.integers(min_value=0, max_value=100))
    
    # Determine threat level based on fraud score
    if fraud_score <= 30:
        threat_level = ThreatLevel.SAFE
    elif fraud_score <= 60:
        threat_level = ThreatLevel.CAUTION
    else:
        threat_level = ThreatLevel.DANGER
    
    return ConversationSegment(
        segment_id=draw(st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00'))),
        timestamp=draw(st.floats(min_value=0, max_value=2e9, allow_nan=False, allow_infinity=False)),
        transcript_text=draw(st.text(min_size=1, max_size=500, alphabet=st.characters(blacklist_characters='\x00'))),
        fraud_score=fraud_score,
        threat_level=threat_level
    )


@st.composite
def scam_pattern_strategy(draw):
    """Generate arbitrary ScamPattern instances."""
    pattern_types = ["IRS Scam", "Tech Support Scam", "Grandparent Scam", 
                     "Lottery Scam", "Romance Scam", "Phishing"]
    return ScamPattern(
        pattern_id=draw(st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00'))),
        pattern_type=draw(st.sampled_from(pattern_types)),
        description=draw(st.text(min_size=10, max_size=200, alphabet=st.characters(blacklist_characters='\x00'))),
        confidence=draw(st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False)),
        matched_indicators=draw(st.lists(
            st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00')), 
            max_size=5
        ))
    )


@st.composite
def analysis_result_strategy(draw, call_id=None, segment_id=None):
    """Generate arbitrary AnalysisResult instances."""
    fraud_score = draw(st.integers(min_value=0, max_value=100))
    
    # Determine threat level based on fraud score
    if fraud_score <= 30:
        threat_level = ThreatLevel.SAFE
    elif fraud_score <= 60:
        threat_level = ThreatLevel.CAUTION
    else:
        threat_level = ThreatLevel.DANGER
    
    return AnalysisResult(
        call_id=call_id or draw(st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00'))),
        segment_id=segment_id or draw(st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00'))),
        timestamp=draw(st.floats(min_value=0, max_value=2e9, allow_nan=False, allow_infinity=False)),
        fraud_score=fraud_score,
        confidence_score=draw(st.integers(min_value=0, max_value=100)),
        threat_level=threat_level,
        detected_patterns=draw(st.lists(scam_pattern_strategy(), max_size=3)),
        urgency_detected=draw(st.booleans()),
        financial_demand_detected=draw(st.booleans()),
        financial_demand_type=draw(st.one_of(
            st.none(),
            st.sampled_from(["gift card", "wire transfer", "cryptocurrency", "credit card"])
        )),
        explanation=draw(st.text(max_size=500, alphabet=st.characters(blacklist_characters='\x00'))),
        language=draw(st.sampled_from(["en", "es", "zh", "hi", "fr"])),
        processing_time_ms=draw(st.integers(min_value=0, max_value=5000))
    )


@st.composite
def multi_segment_conversation_strategy(draw):
    """Generate a conversation with multiple segments."""
    call_id = draw(st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00')))
    num_segments = draw(st.integers(min_value=2, max_value=10))
    
    segments = []
    analyses = []
    
    for i in range(num_segments):
        segment_id = f"segment-{i}"
        segment = ConversationSegment(
            segment_id=segment_id,
            timestamp=float(i * 1000),
            transcript_text=draw(st.text(min_size=10, max_size=200, alphabet=st.characters(blacklist_characters='\x00'))),
            fraud_score=draw(st.integers(min_value=0, max_value=100)),
            threat_level=draw(st.sampled_from([ThreatLevel.SAFE, ThreatLevel.CAUTION, ThreatLevel.DANGER]))
        )
        
        analysis = draw(analysis_result_strategy(call_id=call_id, segment_id=segment_id))
        
        segments.append(segment)
        analyses.append(analysis)
    
    return call_id, segments, analyses


# Property 1: Conversation Context Persistence
# **Validates: Requirements 1.5, 3.4, 7.1**

@pytest.mark.property
@given(multi_segment_conversation_strategy())
def test_property_1_conversation_context_persistence(conversation_data):
    """
    Property 1: Conversation Context Persistence
    
    For any call session with multiple transcript segments, the system should maintain
    conversation history across all segments, allowing the agent to reference previous
    segments when analyzing new ones.
    
    **Validates: Requirements 1.5, 3.4, 7.1**
    """
    call_id, segments, analyses = conversation_data
    
    # Assume we have at least 2 segments for meaningful testing
    assume(len(segments) >= 2)
    
    # Mock DynamoDB table
    with patch('boto3.resource') as mock_resource:
        mock_table = Mock()
        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_resource.return_value = mock_dynamodb
        
        # Initialize context store
        context_store = ContextStore(table_name="test-context-table")
        
        # Track stored items
        stored_items = {}
        
        def mock_get_item(Key):
            call_id_key = Key['call_id']
            if call_id_key in stored_items:
                return {'Item': stored_items[call_id_key]}
            return {}
        
        def mock_put_item(Item):
            stored_items[Item['call_id']] = Item
        
        mock_table.get_item.side_effect = mock_get_item
        mock_table.put_item.side_effect = mock_put_item
        
        # Add segments one by one and verify context persistence
        for i, (segment, analysis) in enumerate(zip(segments, analyses)):
            # Update context with new segment
            context_store.update_context(call_id, segment, analysis)
            
            # Retrieve context
            retrieved_context = context_store.get_context(call_id)
            
            # Verify all previous segments are present
            assert len(retrieved_context.segments) == min(i + 1, ContextStore.MAX_SEGMENTS), \
                f"After adding segment {i}, expected {min(i + 1, ContextStore.MAX_SEGMENTS)} segments, " \
                f"but got {len(retrieved_context.segments)}"
            
            # Verify the segments are in order (most recent segments)
            expected_segments = segments[:i+1][-ContextStore.MAX_SEGMENTS:]
            for j, expected_seg in enumerate(expected_segments):
                actual_seg = retrieved_context.segments[j]
                assert actual_seg.segment_id == expected_seg.segment_id, \
                    f"Segment {j} ID mismatch: expected {expected_seg.segment_id}, got {actual_seg.segment_id}"
                assert actual_seg.timestamp == expected_seg.timestamp, \
                    f"Segment {j} timestamp mismatch"
                assert actual_seg.transcript_text == expected_seg.transcript_text, \
                    f"Segment {j} transcript mismatch"
                assert actual_seg.fraud_score == expected_seg.fraud_score, \
                    f"Segment {j} fraud score mismatch"
                assert actual_seg.threat_level == expected_seg.threat_level, \
                    f"Segment {j} threat level mismatch"
            
            # Verify call_id is preserved
            assert retrieved_context.call_id == call_id, \
                "Call ID should be preserved across context updates"


@pytest.mark.property
@given(
    call_id=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00')),
    segments=st.lists(conversation_segment_strategy(), min_size=2, max_size=10)
)
def test_property_1_context_accumulation(call_id, segments):
    """
    Property 1: Conversation Context Persistence (Accumulation variant)
    
    For any sequence of segments added to a conversation, the context should
    accumulate all segments up to the maximum limit, maintaining chronological order.
    
    **Validates: Requirements 1.5, 3.4, 7.1**
    """
    # Mock DynamoDB table
    with patch('boto3.resource') as mock_resource:
        mock_table = Mock()
        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_resource.return_value = mock_dynamodb
        
        # Initialize context store
        context_store = ContextStore(table_name="test-context-table")
        
        # Track stored items
        stored_items = {}
        
        def mock_get_item(Key):
            call_id_key = Key['call_id']
            if call_id_key in stored_items:
                return {'Item': stored_items[call_id_key]}
            return {}
        
        def mock_put_item(Item):
            stored_items[Item['call_id']] = Item
        
        mock_table.get_item.side_effect = mock_get_item
        mock_table.put_item.side_effect = mock_put_item
        
        # Add all segments
        for segment in segments:
            # Create a minimal analysis result
            analysis = AnalysisResult(
                call_id=call_id,
                segment_id=segment.segment_id,
                timestamp=segment.timestamp,
                fraud_score=segment.fraud_score,
                confidence_score=50,
                threat_level=segment.threat_level,
                language="en"
            )
            
            context_store.update_context(call_id, segment, analysis)
        
        # Retrieve final context
        final_context = context_store.get_context(call_id)
        
        # Verify context contains segments (up to MAX_SEGMENTS)
        expected_count = min(len(segments), ContextStore.MAX_SEGMENTS)
        assert len(final_context.segments) == expected_count, \
            f"Expected {expected_count} segments in context, got {len(final_context.segments)}"
        
        # Verify segments are the most recent ones
        expected_segments = segments[-expected_count:]
        for i, expected_seg in enumerate(expected_segments):
            actual_seg = final_context.segments[i]
            assert actual_seg.segment_id == expected_seg.segment_id, \
                f"Segment {i} should match expected segment"


@pytest.mark.property
@given(multi_segment_conversation_strategy())
def test_property_1_context_summary_includes_history(conversation_data):
    """
    Property 1: Conversation Context Persistence (Summary variant)
    
    For any conversation with multiple segments, the context summary should
    include information about previous segments, enabling the agent to reference
    conversation history.
    
    **Validates: Requirements 1.5, 3.4, 7.1**
    """
    call_id, segments, analyses = conversation_data
    
    # Assume we have at least 2 segments
    assume(len(segments) >= 2)
    
    # Mock DynamoDB table
    with patch('boto3.resource') as mock_resource:
        mock_table = Mock()
        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_resource.return_value = mock_dynamodb
        
        # Initialize context store
        context_store = ContextStore(table_name="test-context-table")
        
        # Track stored items
        stored_items = {}
        
        def mock_get_item(Key):
            call_id_key = Key['call_id']
            if call_id_key in stored_items:
                return {'Item': stored_items[call_id_key]}
            return {}
        
        def mock_put_item(Item):
            stored_items[Item['call_id']] = Item
        
        mock_table.get_item.side_effect = mock_get_item
        mock_table.put_item.side_effect = mock_put_item
        
        # Add all segments
        for segment, analysis in zip(segments, analyses):
            context_store.update_context(call_id, segment, analysis)
        
        # Retrieve context and get summary
        context = context_store.get_context(call_id)
        summary = context.get_context_summary()
        
        # Verify summary is not empty
        assert summary, "Context summary should not be empty when segments exist"
        
        # Verify summary mentions conversation history
        assert "segment" in summary.lower() or "history" in summary.lower(), \
            "Context summary should mention conversation history or segments"
        
        # Verify summary includes cumulative fraud score
        assert "fraud score" in summary.lower() or str(context.cumulative_fraud_score) in summary, \
            "Context summary should include cumulative fraud score"
        
        # If there are detected patterns, verify they're mentioned
        if context.detected_patterns:
            assert "pattern" in summary.lower(), \
                "Context summary should mention detected patterns when they exist"


@pytest.mark.property
@given(
    call_id=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00')),
    num_segments=st.integers(min_value=2, max_value=15)
)
def test_property_1_max_segments_limit(call_id, num_segments):
    """
    Property 1: Conversation Context Persistence (Max segments limit)
    
    For any conversation with more than MAX_SEGMENTS segments, the context should
    maintain only the most recent MAX_SEGMENTS segments, ensuring bounded memory usage
    while preserving recent conversation history.
    
    **Validates: Requirements 1.5, 3.4, 7.1**
    """
    # Mock DynamoDB table
    with patch('boto3.resource') as mock_resource:
        mock_table = Mock()
        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_resource.return_value = mock_dynamodb
        
        # Initialize context store
        context_store = ContextStore(table_name="test-context-table")
        
        # Track stored items
        stored_items = {}
        
        def mock_get_item(Key):
            call_id_key = Key['call_id']
            if call_id_key in stored_items:
                return {'Item': stored_items[call_id_key]}
            return {}
        
        def mock_put_item(Item):
            stored_items[Item['call_id']] = Item
        
        mock_table.get_item.side_effect = mock_get_item
        mock_table.put_item.side_effect = mock_put_item
        
        # Add segments
        all_segment_ids = []
        for i in range(num_segments):
            segment_id = f"segment-{i}"
            all_segment_ids.append(segment_id)
            
            segment = ConversationSegment(
                segment_id=segment_id,
                timestamp=float(i * 1000),
                transcript_text=f"Transcript for segment {i}",
                fraud_score=50,
                threat_level=ThreatLevel.CAUTION
            )
            
            analysis = AnalysisResult(
                call_id=call_id,
                segment_id=segment_id,
                timestamp=float(i * 1000),
                fraud_score=50,
                confidence_score=50,
                threat_level=ThreatLevel.CAUTION,
                language="en"
            )
            
            context_store.update_context(call_id, segment, analysis)
        
        # Retrieve final context
        context = context_store.get_context(call_id)
        
        # Verify segment count respects MAX_SEGMENTS limit
        expected_count = min(num_segments, ContextStore.MAX_SEGMENTS)
        assert len(context.segments) == expected_count, \
            f"Context should contain at most {ContextStore.MAX_SEGMENTS} segments, got {len(context.segments)}"
        
        # Verify we have the most recent segments
        if num_segments > ContextStore.MAX_SEGMENTS:
            expected_segment_ids = all_segment_ids[-ContextStore.MAX_SEGMENTS:]
            actual_segment_ids = [seg.segment_id for seg in context.segments]
            assert actual_segment_ids == expected_segment_ids, \
                "Context should contain the most recent segments when limit is exceeded"


@pytest.mark.property
@given(
    call_id=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00')),
    segment=conversation_segment_strategy()
)
def test_property_1_empty_context_initialization(call_id, segment):
    """
    Property 1: Conversation Context Persistence (Empty context initialization)
    
    For any new call session, retrieving context before any segments are added
    should return an empty context with the correct call_id, and adding the first
    segment should create a new context with that segment.
    
    **Validates: Requirements 1.5, 3.4, 7.1**
    """
    # Mock DynamoDB table
    with patch('boto3.resource') as mock_resource:
        mock_table = Mock()
        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_resource.return_value = mock_dynamodb
        
        # Initialize context store
        context_store = ContextStore(table_name="test-context-table")
        
        # Mock empty response for new call
        mock_table.get_item.return_value = {}
        
        # Retrieve context for new call (should be empty)
        empty_context = context_store.get_context(call_id)
        
        # Verify empty context properties
        assert empty_context.call_id == call_id, "Empty context should have correct call_id"
        assert len(empty_context.segments) == 0, "Empty context should have no segments"
        assert empty_context.cumulative_fraud_score == 0, "Empty context should have zero cumulative score"
        assert len(empty_context.detected_patterns) == 0, "Empty context should have no detected patterns"
        
        # Now add a segment
        stored_items = {}
        
        def mock_get_item_with_storage(Key):
            call_id_key = Key['call_id']
            if call_id_key in stored_items:
                return {'Item': stored_items[call_id_key]}
            return {}
        
        def mock_put_item(Item):
            stored_items[Item['call_id']] = Item
        
        mock_table.get_item.side_effect = mock_get_item_with_storage
        mock_table.put_item.side_effect = mock_put_item
        
        analysis = AnalysisResult(
            call_id=call_id,
            segment_id=segment.segment_id,
            timestamp=segment.timestamp,
            fraud_score=segment.fraud_score,
            confidence_score=50,
            threat_level=segment.threat_level,
            language="en"
        )
        
        context_store.update_context(call_id, segment, analysis)
        
        # Retrieve context after adding first segment
        context_with_segment = context_store.get_context(call_id)
        
        # Verify context now contains the segment
        assert len(context_with_segment.segments) == 1, "Context should contain exactly one segment"
        assert context_with_segment.segments[0].segment_id == segment.segment_id, \
            "Context should contain the added segment"


# Property 2: Context Reset on New Session
# **Validates: Requirements 7.5**

@pytest.mark.property
@given(
    call_id_1=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00')),
    call_id_2=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00')),
    num_segments_1=st.integers(min_value=1, max_value=5),
    num_segments_2=st.integers(min_value=1, max_value=5)
)
def test_property_2_context_reset_on_new_session(call_id_1, call_id_2, num_segments_1, num_segments_2):
    """
    Property 2: Context Reset on New Session
    
    For any new call session, the system should start with empty conversation context,
    ensuring no data leaks between different calls. Each call_id should have completely
    isolated context with no cross-contamination from other calls.
    
    **Validates: Requirements 7.5**
    """
    # Ensure we have two different call IDs
    assume(call_id_1 != call_id_2)
    
    # Mock DynamoDB table
    with patch('boto3.resource') as mock_resource:
        mock_table = Mock()
        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_resource.return_value = mock_dynamodb
        
        # Initialize context store
        context_store = ContextStore(table_name="test-context-table")
        
        # Track stored items per call_id
        stored_items = {}
        
        def mock_get_item(Key):
            call_id_key = Key['call_id']
            if call_id_key in stored_items:
                return {'Item': stored_items[call_id_key]}
            return {}
        
        def mock_put_item(Item):
            stored_items[Item['call_id']] = Item
        
        mock_table.get_item.side_effect = mock_get_item
        mock_table.put_item.side_effect = mock_put_item
        
        # Create unique segments for call 1 (with call_id in segment_id to ensure uniqueness)
        segments_1 = []
        for i in range(num_segments_1):
            segment = ConversationSegment(
                segment_id=f"{call_id_1}-segment-{i}",  # Unique to this call
                timestamp=float(i * 1000),
                transcript_text=f"Call {call_id_1} transcript {i}",  # Unique to this call
                fraud_score=10 + i,
                threat_level=ThreatLevel.SAFE
            )
            segments_1.append(segment)
            
            analysis = AnalysisResult(
                call_id=call_id_1,
                segment_id=segment.segment_id,
                timestamp=segment.timestamp,
                fraud_score=segment.fraud_score,
                confidence_score=50,
                threat_level=segment.threat_level,
                language="en"
            )
            context_store.update_context(call_id_1, segment, analysis)
        
        # Retrieve context for first call
        context_1 = context_store.get_context(call_id_1)
        
        # Verify first call has its segments
        assert len(context_1.segments) == num_segments_1, \
            f"First call should have {num_segments_1} segments"
        assert context_1.call_id == call_id_1, \
            "First call should have correct call_id"
        
        # Now retrieve context for second call (NEW SESSION - should be empty)
        context_2_initial = context_store.get_context(call_id_2)
        
        # CRITICAL: Verify second call starts with EMPTY context (no data leak)
        assert context_2_initial.call_id == call_id_2, \
            "Second call should have correct call_id"
        assert len(context_2_initial.segments) == 0, \
            "NEW SESSION: Second call should start with ZERO segments (no data leak from first call)"
        assert context_2_initial.cumulative_fraud_score == 0, \
            "NEW SESSION: Second call should start with ZERO cumulative fraud score (no data leak)"
        assert len(context_2_initial.detected_patterns) == 0, \
            "NEW SESSION: Second call should start with ZERO detected patterns (no data leak)"
        
        # Create unique segments for call 2 (with call_id in segment_id to ensure uniqueness)
        segments_2 = []
        for i in range(num_segments_2):
            segment = ConversationSegment(
                segment_id=f"{call_id_2}-segment-{i}",  # Unique to this call
                timestamp=float(i * 1000),
                transcript_text=f"Call {call_id_2} transcript {i}",  # Unique to this call
                fraud_score=20 + i,
                threat_level=ThreatLevel.CAUTION
            )
            segments_2.append(segment)
            
            analysis = AnalysisResult(
                call_id=call_id_2,
                segment_id=segment.segment_id,
                timestamp=segment.timestamp,
                fraud_score=segment.fraud_score,
                confidence_score=50,
                threat_level=segment.threat_level,
                language="en"
            )
            context_store.update_context(call_id_2, segment, analysis)
        
        # Retrieve both contexts again
        context_1_final = context_store.get_context(call_id_1)
        context_2_final = context_store.get_context(call_id_2)
        
        # Verify both contexts are completely isolated
        assert len(context_1_final.segments) == num_segments_1, \
            "First call context should remain unchanged"
        assert len(context_2_final.segments) == num_segments_2, \
            f"Second call should have {num_segments_2} segments"
        
        # Verify call IDs are correct and different
        assert context_1_final.call_id == call_id_1, \
            "First call should maintain its call_id"
        assert context_2_final.call_id == call_id_2, \
            "Second call should have its own call_id"
        
        # CRITICAL: Verify no segments from call 1 appear in call 2
        # Check that all segment IDs in call 2 start with call_id_2 prefix
        for seg in context_2_final.segments:
            assert seg.segment_id.startswith(f"{call_id_2}-"), \
                f"All segments in call {call_id_2} should have call_id_2 prefix, but found: {seg.segment_id}"
            assert call_id_2 in seg.transcript_text, \
                f"All transcripts in call {call_id_2} should reference call_id_2, but found: {seg.transcript_text}"
        
        # Verify no segments from call 2 appear in call 1
        for seg in context_1_final.segments:
            assert seg.segment_id.startswith(f"{call_id_1}-"), \
                f"All segments in call {call_id_1} should have call_id_1 prefix, but found: {seg.segment_id}"
            assert call_id_1 in seg.transcript_text, \
                f"All transcripts in call {call_id_1} should reference call_id_1, but found: {seg.transcript_text}"


@pytest.mark.property
@given(
    call_id=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_characters='\x00')),
    num_segments_before=st.integers(min_value=1, max_value=5),
    num_segments_after=st.integers(min_value=1, max_value=5)
)
def test_property_2_context_reset_after_clear(call_id, num_segments_before, num_segments_after):
    """
    Property 2: Context Reset on New Session (Clear variant)
    
    For any call session that is explicitly cleared, retrieving context afterwards
    should return empty context, and adding new segments should start fresh without
    any data from the previous session.
    
    **Validates: Requirements 7.5**
    """
    # Mock DynamoDB table
    with patch('boto3.resource') as mock_resource:
        mock_table = Mock()
        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_resource.return_value = mock_dynamodb
        
        # Initialize context store
        context_store = ContextStore(table_name="test-context-table")
        
        # Track stored items
        stored_items = {}
        
        def mock_get_item(Key):
            call_id_key = Key['call_id']
            if call_id_key in stored_items:
                return {'Item': stored_items[call_id_key]}
            return {}
        
        def mock_put_item(Item):
            stored_items[Item['call_id']] = Item
        
        def mock_delete_item(Key):
            call_id_key = Key['call_id']
            if call_id_key in stored_items:
                del stored_items[call_id_key]
        
        mock_table.get_item.side_effect = mock_get_item
        mock_table.put_item.side_effect = mock_put_item
        mock_table.delete_item.side_effect = mock_delete_item
        
        # Add segments before clear (with "before" prefix)
        segments_before_clear = []
        for i in range(num_segments_before):
            segment = ConversationSegment(
                segment_id=f"before-segment-{i}",
                timestamp=float(i * 1000),
                transcript_text=f"Before clear transcript {i}",
                fraud_score=10 + i,
                threat_level=ThreatLevel.SAFE
            )
            segments_before_clear.append(segment)
            
            analysis = AnalysisResult(
                call_id=call_id,
                segment_id=segment.segment_id,
                timestamp=segment.timestamp,
                fraud_score=segment.fraud_score,
                confidence_score=50,
                threat_level=segment.threat_level,
                language="en"
            )
            context_store.update_context(call_id, segment, analysis)
        
        # Verify context has segments
        context_before = context_store.get_context(call_id)
        assert len(context_before.segments) > 0, "Context should have segments before clear"
        
        # Clear the context (simulating end of call)
        context_store.clear_context(call_id)
        
        # Retrieve context after clear - should be EMPTY (new session)
        context_after_clear = context_store.get_context(call_id)
        
        # CRITICAL: Verify context is completely reset
        assert len(context_after_clear.segments) == 0, \
            "After clear, context should have ZERO segments (new session)"
        assert context_after_clear.cumulative_fraud_score == 0, \
            "After clear, cumulative fraud score should be ZERO (new session)"
        assert len(context_after_clear.detected_patterns) == 0, \
            "After clear, detected patterns should be ZERO (new session)"
        
        # Add new segments after clear (with "after" prefix - simulating new call session)
        segments_after_clear = []
        for i in range(num_segments_after):
            segment = ConversationSegment(
                segment_id=f"after-segment-{i}",
                timestamp=float(i * 1000),
                transcript_text=f"After clear transcript {i}",
                fraud_score=20 + i,
                threat_level=ThreatLevel.CAUTION
            )
            segments_after_clear.append(segment)
            
            analysis = AnalysisResult(
                call_id=call_id,
                segment_id=segment.segment_id,
                timestamp=segment.timestamp,
                fraud_score=segment.fraud_score,
                confidence_score=50,
                threat_level=segment.threat_level,
                language="en"
            )
            context_store.update_context(call_id, segment, analysis)
        
        # Retrieve final context
        context_final = context_store.get_context(call_id)
        
        # Verify new session has only new segments
        assert len(context_final.segments) == num_segments_after, \
            "New session should only contain new segments"
        
        # Verify no segments from before clear are present
        # Check that all segments have "after" prefix
        for seg in context_final.segments:
            assert seg.segment_id.startswith("after-"), \
                f"All segments should be from after clear, but found: {seg.segment_id}"
            assert "After clear" in seg.transcript_text, \
                f"All transcripts should be from after clear, but found: {seg.transcript_text}"
        
        # Verify none of the "before" segments leaked through
        before_segment_ids = {seg.segment_id for seg in segments_before_clear}
        after_segment_ids = {seg.segment_id for seg in context_final.segments}
        leaked_segments = before_segment_ids.intersection(after_segment_ids)
        assert len(leaked_segments) == 0, \
            f"No segments from previous session should leak into new session, but found: {leaked_segments}"


@pytest.mark.property
@given(
    num_calls=st.integers(min_value=2, max_value=5),
    segments_per_call=st.integers(min_value=1, max_value=3)
)
def test_property_2_multiple_concurrent_sessions_isolation(num_calls, segments_per_call):
    """
    Property 2: Context Reset on New Session (Multiple concurrent sessions)
    
    For any number of concurrent call sessions, each session should maintain
    completely isolated context with no cross-contamination between sessions.
    
    **Validates: Requirements 7.5**
    """
    # Mock DynamoDB table
    with patch('boto3.resource') as mock_resource:
        mock_table = Mock()
        mock_dynamodb = Mock()
        mock_dynamodb.Table.return_value = mock_table
        mock_resource.return_value = mock_dynamodb
        
        # Initialize context store
        context_store = ContextStore(table_name="test-context-table")
        
        # Track stored items
        stored_items = {}
        
        def mock_get_item(Key):
            call_id_key = Key['call_id']
            if call_id_key in stored_items:
                return {'Item': stored_items[call_id_key]}
            return {}
        
        def mock_put_item(Item):
            stored_items[Item['call_id']] = Item
        
        mock_table.get_item.side_effect = mock_get_item
        mock_table.put_item.side_effect = mock_put_item
        
        # Create multiple concurrent call sessions
        call_sessions = {}
        
        for i in range(num_calls):
            call_id = f"call-{i}"
            segments = []
            
            for j in range(segments_per_call):
                segment = ConversationSegment(
                    segment_id=f"call-{i}-segment-{j}",
                    timestamp=float(j * 1000),
                    transcript_text=f"Transcript for call {i} segment {j}",
                    fraud_score=10 * (i + 1),  # Different scores per call
                    threat_level=ThreatLevel.SAFE
                )
                segments.append(segment)
                
                analysis = AnalysisResult(
                    call_id=call_id,
                    segment_id=segment.segment_id,
                    timestamp=segment.timestamp,
                    fraud_score=segment.fraud_score,
                    confidence_score=50,
                    threat_level=segment.threat_level,
                    language="en"
                )
                
                context_store.update_context(call_id, segment, analysis)
            
            call_sessions[call_id] = segments
        
        # Verify each session has isolated context
        for call_id, expected_segments in call_sessions.items():
            context = context_store.get_context(call_id)
            
            # Verify correct number of segments
            assert len(context.segments) == len(expected_segments), \
                f"Call {call_id} should have {len(expected_segments)} segments"
            
            # Verify segment IDs match
            expected_ids = {seg.segment_id for seg in expected_segments}
            actual_ids = {seg.segment_id for seg in context.segments}
            assert expected_ids == actual_ids, \
                f"Call {call_id} should have exactly its own segments"
            
            # Verify no segments from other calls leaked in
            for other_call_id, other_segments in call_sessions.items():
                if other_call_id != call_id:
                    other_ids = {seg.segment_id for seg in other_segments}
                    leaked_ids = actual_ids.intersection(other_ids)
                    assert len(leaked_ids) == 0, \
                        f"Call {call_id} should not contain segments from {other_call_id}, " \
                        f"but found leaked segments: {leaked_ids}"
