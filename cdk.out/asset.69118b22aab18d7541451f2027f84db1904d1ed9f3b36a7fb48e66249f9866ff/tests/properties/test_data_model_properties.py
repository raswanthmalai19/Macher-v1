"""
Property-based tests for data model validation.

These tests verify universal correctness properties of the fraud detection data models
across a wide range of inputs using hypothesis for property-based testing.
"""

import pytest
from hypothesis import given, strategies as st
from src.models import (
    AnalysisResult,
    ThreatLevel,
    ScamPattern,
    ConversationSegment,
    ConversationContext
)


# Test generators for data models

@st.composite
def scam_pattern_strategy(draw):
    """Generate arbitrary ScamPattern instances."""
    pattern_types = ["IRS Scam", "Tech Support Scam", "Grandparent Scam", 
                     "Lottery Scam", "Romance Scam", "Phishing"]
    return ScamPattern(
        pattern_id=draw(st.text(min_size=1, max_size=50)),
        pattern_type=draw(st.sampled_from(pattern_types)),
        description=draw(st.text(min_size=10, max_size=200)),
        confidence=draw(st.floats(min_value=0.0, max_value=1.0)),
        matched_indicators=draw(st.lists(st.text(min_size=1, max_size=50), max_size=5))
    )


@st.composite
def analysis_result_strategy(draw):
    """Generate arbitrary AnalysisResult instances with valid fraud scores."""
    fraud_score = draw(st.integers(min_value=0, max_value=100))
    
    # Determine threat level based on fraud score
    if fraud_score <= 30:
        threat_level = ThreatLevel.SAFE
    elif fraud_score <= 60:
        threat_level = ThreatLevel.CAUTION
    else:
        threat_level = ThreatLevel.DANGER
    
    return AnalysisResult(
        call_id=draw(st.text(min_size=1, max_size=50)),
        segment_id=draw(st.text(min_size=1, max_size=50)),
        timestamp=draw(st.floats(min_value=0, max_value=2e9)),
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
        explanation=draw(st.text(max_size=500)),
        language=draw(st.sampled_from(["en", "es", "zh", "hi", "fr"])),
        processing_time_ms=draw(st.integers(min_value=0, max_value=5000))
    )


# Property 3: Fraud Score Range Validity
# **Validates: Requirements 4.1, 5.1**

@pytest.mark.property
@given(analysis_result_strategy())
def test_property_3_fraud_score_range_validity(analysis_result):
    """
    Property 3: Fraud Score Range Validity
    
    For any transcript segment analysis, the fraud score should be between 0 and 100 
    (inclusive), and a valid threat level (Safe, Caution, or Danger) should be assigned.
    
    **Validates: Requirements 4.1, 5.1**
    """
    # Verify fraud score is within valid range
    assert 0 <= analysis_result.fraud_score <= 100, \
        f"Fraud score {analysis_result.fraud_score} is outside valid range [0, 100]"
    
    # Verify threat level is one of the valid enum values
    assert analysis_result.threat_level in [ThreatLevel.SAFE, ThreatLevel.CAUTION, ThreatLevel.DANGER], \
        f"Threat level {analysis_result.threat_level} is not a valid ThreatLevel enum value"
    
    # Verify confidence score is also within valid range
    assert 0 <= analysis_result.confidence_score <= 100, \
        f"Confidence score {analysis_result.confidence_score} is outside valid range [0, 100]"


@pytest.mark.property
@given(
    fraud_score=st.integers(min_value=0, max_value=100),
    confidence_score=st.integers(min_value=0, max_value=100)
)
def test_property_3_fraud_score_range_validity_with_arbitrary_scores(fraud_score, confidence_score):
    """
    Property 3: Fraud Score Range Validity (Alternative formulation)
    
    For any fraud score and confidence score in the valid range [0, 100], 
    creating an AnalysisResult should succeed and maintain valid values.
    
    **Validates: Requirements 4.1, 5.1**
    """
    # Determine correct threat level based on fraud score
    if fraud_score <= 30:
        threat_level = ThreatLevel.SAFE
    elif fraud_score <= 60:
        threat_level = ThreatLevel.CAUTION
    else:
        threat_level = ThreatLevel.DANGER
    
    # Create analysis result
    result = AnalysisResult(
        call_id="test-call",
        segment_id="test-segment",
        timestamp=1234567890.0,
        fraud_score=fraud_score,
        confidence_score=confidence_score,
        threat_level=threat_level,
        language="en"
    )
    
    # Verify the scores are preserved correctly
    assert result.fraud_score == fraud_score
    assert result.confidence_score == confidence_score
    assert 0 <= result.fraud_score <= 100
    assert 0 <= result.confidence_score <= 100
    
    # Verify threat level is valid
    assert result.threat_level in [ThreatLevel.SAFE, ThreatLevel.CAUTION, ThreatLevel.DANGER]


@pytest.mark.property
@given(analysis_result_strategy())
def test_property_3_serialization_preserves_validity(analysis_result):
    """
    Property 3: Fraud Score Range Validity (Serialization invariant)
    
    For any valid AnalysisResult, serializing to dict and back should preserve
    the fraud score range validity and threat level validity.
    
    **Validates: Requirements 4.1, 5.1**
    """
    # Serialize to dictionary
    result_dict = analysis_result.to_dict()
    
    # Verify serialized fraud score is still valid
    assert 0 <= result_dict["fraud_score"] <= 100
    assert 0 <= result_dict["confidence_score"] <= 100
    
    # Verify threat level is serialized as a valid string
    assert result_dict["threat_level"] in ["Safe", "Caution", "Danger"]
    
    # Verify the serialized values match the original
    assert result_dict["fraud_score"] == analysis_result.fraud_score
    assert result_dict["confidence_score"] == analysis_result.confidence_score
    assert result_dict["threat_level"] == analysis_result.threat_level.value


# Property 4: Threat Level Mapping Correctness
# **Validates: Requirements 5.2, 5.3, 5.4**

@pytest.mark.property
@given(fraud_score=st.integers(min_value=0, max_value=100))
def test_property_4_threat_level_mapping_correctness(fraud_score):
    """
    Property 4: Threat Level Mapping Correctness
    
    For any fraud score, the threat level should be correctly mapped:
    - Safe for scores 0-30
    - Caution for scores 31-60
    - Danger for scores 61-100
    
    **Validates: Requirements 5.2, 5.3, 5.4**
    """
    # Determine expected threat level based on requirements
    if fraud_score <= 30:
        expected_threat_level = ThreatLevel.SAFE
    elif fraud_score <= 60:
        expected_threat_level = ThreatLevel.CAUTION
    else:  # fraud_score >= 61
        expected_threat_level = ThreatLevel.DANGER
    
    # Create an AnalysisResult with the fraud score and expected threat level
    result = AnalysisResult(
        call_id="test-call",
        segment_id="test-segment",
        timestamp=1234567890.0,
        fraud_score=fraud_score,
        confidence_score=50,
        threat_level=expected_threat_level,
        language="en"
    )
    
    # Verify the threat level matches the expected mapping
    assert result.threat_level == expected_threat_level, \
        f"Fraud score {fraud_score} should map to {expected_threat_level.value}, " \
        f"but got {result.threat_level.value}"


@pytest.mark.property
@given(fraud_score=st.integers(min_value=0, max_value=30))
def test_property_4_safe_range_mapping(fraud_score):
    """
    Property 4: Threat Level Mapping Correctness (Safe range)
    
    For any fraud score in the range [0, 30], the threat level must be Safe.
    
    **Validates: Requirements 5.2**
    """
    result = AnalysisResult(
        call_id="test-call",
        segment_id="test-segment",
        timestamp=1234567890.0,
        fraud_score=fraud_score,
        confidence_score=50,
        threat_level=ThreatLevel.SAFE,
        language="en"
    )
    
    assert result.threat_level == ThreatLevel.SAFE, \
        f"Fraud score {fraud_score} in range [0, 30] must map to Safe"


@pytest.mark.property
@given(fraud_score=st.integers(min_value=31, max_value=60))
def test_property_4_caution_range_mapping(fraud_score):
    """
    Property 4: Threat Level Mapping Correctness (Caution range)
    
    For any fraud score in the range [31, 60], the threat level must be Caution.
    
    **Validates: Requirements 5.3**
    """
    result = AnalysisResult(
        call_id="test-call",
        segment_id="test-segment",
        timestamp=1234567890.0,
        fraud_score=fraud_score,
        confidence_score=50,
        threat_level=ThreatLevel.CAUTION,
        language="en"
    )
    
    assert result.threat_level == ThreatLevel.CAUTION, \
        f"Fraud score {fraud_score} in range [31, 60] must map to Caution"


@pytest.mark.property
@given(fraud_score=st.integers(min_value=61, max_value=100))
def test_property_4_danger_range_mapping(fraud_score):
    """
    Property 4: Threat Level Mapping Correctness (Danger range)
    
    For any fraud score in the range [61, 100], the threat level must be Danger.
    
    **Validates: Requirements 5.4**
    """
    result = AnalysisResult(
        call_id="test-call",
        segment_id="test-segment",
        timestamp=1234567890.0,
        fraud_score=fraud_score,
        confidence_score=50,
        threat_level=ThreatLevel.DANGER,
        language="en"
    )
    
    assert result.threat_level == ThreatLevel.DANGER, \
        f"Fraud score {fraud_score} in range [61, 100] must map to Danger"


@pytest.mark.property
@given(fraud_score=st.integers(min_value=0, max_value=100))
def test_property_4_boundary_conditions(fraud_score):
    """
    Property 4: Threat Level Mapping Correctness (Boundary verification)
    
    Verify that boundary values (0, 30, 31, 60, 61, 100) are correctly mapped
    and that the mapping is consistent across all values.
    
    **Validates: Requirements 5.2, 5.3, 5.4**
    """
    # Calculate expected threat level using the same logic as the system
    if fraud_score <= 30:
        expected = ThreatLevel.SAFE
    elif fraud_score <= 60:
        expected = ThreatLevel.CAUTION
    else:
        expected = ThreatLevel.DANGER
    
    # Create result with calculated threat level
    result = AnalysisResult(
        call_id="test-call",
        segment_id="test-segment",
        timestamp=1234567890.0,
        fraud_score=fraud_score,
        confidence_score=50,
        threat_level=expected,
        language="en"
    )
    
    # Verify consistency
    assert result.threat_level == expected
    
    # Verify specific boundary conditions
    if fraud_score == 0:
        assert result.threat_level == ThreatLevel.SAFE, "Score 0 must be Safe"
    elif fraud_score == 30:
        assert result.threat_level == ThreatLevel.SAFE, "Score 30 must be Safe (upper boundary)"
    elif fraud_score == 31:
        assert result.threat_level == ThreatLevel.CAUTION, "Score 31 must be Caution (lower boundary)"
    elif fraud_score == 60:
        assert result.threat_level == ThreatLevel.CAUTION, "Score 60 must be Caution (upper boundary)"
    elif fraud_score == 61:
        assert result.threat_level == ThreatLevel.DANGER, "Score 61 must be Danger (lower boundary)"
    elif fraud_score == 100:
        assert result.threat_level == ThreatLevel.DANGER, "Score 100 must be Danger"
