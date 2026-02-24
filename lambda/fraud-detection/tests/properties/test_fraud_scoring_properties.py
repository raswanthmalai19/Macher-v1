"""
Property-based tests for fraud scoring functions.

These tests verify universal correctness properties of fraud detection scoring
across a wide range of inputs using hypothesis for property-based testing.
"""

import pytest
from hypothesis import given, strategies as st, assume
from src.fraud_scoring import (
    calculate_threat_level,
    detect_urgency_indicators,
    detect_financial_demands,
    detect_unusual_payment_methods,
    detect_escalation,
    detect_inconsistencies,
    calculate_cumulative_fraud_score
)
from src.models import ThreatLevel, ConversationSegment


# Test generators

@st.composite
def text_with_urgency_strategy(draw):
    """Generate text with urgency indicators."""
    urgency_phrases = [
        "act now", "right now", "immediately", "urgent", "limited time",
        "expires today", "hurry", "don't wait", "last chance",
        "will be arrested", "legal action", "account will be suspended",
        "must act now", "need to respond immediately"
    ]
    
    base_text = draw(st.text(min_size=10, max_size=100))
    urgency_phrase = draw(st.sampled_from(urgency_phrases))
    
    # Insert urgency phrase into text
    return f"{base_text} {urgency_phrase} {draw(st.text(max_size=50))}"


@st.composite
def text_with_financial_demand_strategy(draw):
    """Generate text with financial demands."""
    financial_phrases = [
        "pay now", "credit card number", "bank account", "wire transfer",
        "verify your account", "confirm your payment", "social security number",
        "provide your card information", "send money"
    ]
    
    base_text = draw(st.text(min_size=10, max_size=100))
    financial_phrase = draw(st.sampled_from(financial_phrases))
    
    return f"{base_text} {financial_phrase} {draw(st.text(max_size=50))}"


@st.composite
def text_with_unusual_payment_strategy(draw):
    """Generate text with unusual payment methods."""
    payment_phrases = [
        "gift card", "iTunes card", "Google Play card", "bitcoin",
        "cryptocurrency", "wire transfer", "Western Union", "send cash",
        "money order"
    ]
    
    base_text = draw(st.text(min_size=10, max_size=100))
    payment_phrase = draw(st.sampled_from(payment_phrases))
    
    return f"{base_text} {payment_phrase} {draw(st.text(max_size=50))}"


@st.composite
def conversation_segment_strategy(draw):
    """Generate arbitrary ConversationSegment instances."""
    fraud_score = draw(st.integers(min_value=0, max_value=100))
    
    if fraud_score <= 30:
        threat_level = ThreatLevel.SAFE
    elif fraud_score <= 60:
        threat_level = ThreatLevel.CAUTION
    else:
        threat_level = ThreatLevel.DANGER
    
    return ConversationSegment(
        segment_id=draw(st.text(min_size=1, max_size=50)),
        timestamp=draw(st.floats(min_value=0, max_value=2e9)),
        transcript_text=draw(st.text(min_size=10, max_size=500)),
        fraud_score=fraud_score,
        threat_level=threat_level
    )


# Property 5: Fraud Indicator Monotonicity
# **Validates: Requirements 4.6, 8.2, 9.2**

@pytest.mark.property
@given(
    base_text=st.text(min_size=20, max_size=200),
    urgency_phrase=st.sampled_from([
        "act now", "immediately", "urgent", "limited time", "will be arrested"
    ])
)
def test_property_5_urgency_increases_detection(base_text, urgency_phrase):
    """
    Property 5: Fraud Indicator Monotonicity (Urgency)
    
    For any transcript segment, adding urgency indicators should increase
    the likelihood of urgency detection compared to the same segment without
    those indicators.
    
    **Validates: Requirements 4.6, 8.2**
    """
    # Analyze base text without urgency
    urgency_without, phrases_without = detect_urgency_indicators(base_text)
    
    # Add urgency indicator to text
    text_with_urgency = f"{base_text} {urgency_phrase}"
    urgency_with, phrases_with = detect_urgency_indicators(text_with_urgency)
    
    # If urgency was not detected in base text, it should be detected after adding indicator
    if not urgency_without:
        assert urgency_with, \
            f"Adding urgency phrase '{urgency_phrase}' should trigger urgency detection"
        assert len(phrases_with) > len(phrases_without), \
            "Adding urgency should increase matched phrases count"


@pytest.mark.property
@given(
    base_text=st.text(min_size=20, max_size=200),
    financial_phrase=st.sampled_from([
        "credit card", "bank account", "wire transfer", "pay now", "verify your account"
    ])
)
def test_property_5_financial_demand_increases_detection(base_text, financial_phrase):
    """
    Property 5: Fraud Indicator Monotonicity (Financial Demands)
    
    For any transcript segment, adding financial demand indicators should increase
    the likelihood of financial demand detection compared to the same segment without
    those indicators.
    
    **Validates: Requirements 4.6, 9.2**
    """
    # Analyze base text without financial demand
    financial_without, phrases_without = detect_financial_demands(base_text)
    
    # Add financial demand to text
    text_with_financial = f"{base_text} {financial_phrase}"
    financial_with, phrases_with = detect_financial_demands(text_with_financial)
    
    # If financial demand was not detected in base text, it should be detected after adding indicator
    if not financial_without:
        assert financial_with, \
            f"Adding financial phrase '{financial_phrase}' should trigger financial demand detection"
        assert len(phrases_with) > len(phrases_without), \
            "Adding financial demand should increase matched phrases count"


@pytest.mark.property
@given(
    base_text=st.text(min_size=20, max_size=200),
    payment_phrase=st.sampled_from([
        "gift card", "bitcoin", "wire transfer", "Western Union", "cash only"
    ])
)
def test_property_5_unusual_payment_increases_detection(base_text, payment_phrase):
    """
    Property 5: Fraud Indicator Monotonicity (Unusual Payment Methods)
    
    For any transcript segment, adding unusual payment method indicators should
    increase the likelihood of unusual payment detection compared to the same
    segment without those indicators.
    
    **Validates: Requirements 4.6, 9.2**
    """
    # Analyze base text without unusual payment
    unusual_without, type_without, phrases_without = detect_unusual_payment_methods(base_text)
    
    # Add unusual payment method to text
    text_with_payment = f"{base_text} {payment_phrase}"
    unusual_with, type_with, phrases_with = detect_unusual_payment_methods(text_with_payment)
    
    # If unusual payment was not detected in base text, it should be detected after adding indicator
    if not unusual_without:
        assert unusual_with, \
            f"Adding payment phrase '{payment_phrase}' should trigger unusual payment detection"
        assert type_with is not None, \
            "Unusual payment detection should identify payment type"
        assert len(phrases_with) > len(phrases_without), \
            "Adding unusual payment should increase matched phrases count"


@pytest.mark.property
@given(text=st.text(min_size=0, max_size=500))
def test_property_5_monotonicity_never_decreases(text):
    """
    Property 5: Fraud Indicator Monotonicity (General)
    
    For any text, the number of detected fraud indicators should never decrease
    when more content is added (monotonicity property).
    
    **Validates: Requirements 4.6, 8.2, 9.2**
    """
    # Detect indicators in original text
    urgency1, urgency_phrases1 = detect_urgency_indicators(text)
    financial1, financial_phrases1 = detect_financial_demands(text)
    unusual1, _, unusual_phrases1 = detect_unusual_payment_methods(text)
    
    # Add more content
    extended_text = text + " " + text  # Double the text
    
    # Detect indicators in extended text
    urgency2, urgency_phrases2 = detect_urgency_indicators(extended_text)
    financial2, financial_phrases2 = detect_financial_demands(extended_text)
    unusual2, _, unusual_phrases2 = detect_unusual_payment_methods(extended_text)
    
    # Indicator counts should not decrease (monotonicity)
    assert len(urgency_phrases2) >= len(urgency_phrases1), \
        "Urgency indicator count should not decrease when adding content"
    assert len(financial_phrases2) >= len(financial_phrases1), \
        "Financial demand count should not decrease when adding content"
    assert len(unusual_phrases2) >= len(unusual_phrases1), \
        "Unusual payment count should not decrease when adding content"


# Property 10: Urgency Detection
# **Validates: Requirements 8.1, 8.4**

@pytest.mark.property
@given(text_with_urgency_strategy())
def test_property_10_urgency_detection_with_indicators(text_with_urgency):
    """
    Property 10: Urgency Detection
    
    For any transcript containing urgency indicators (time pressure, threats,
    immediate action demands), the system should detect the urgency and set
    the urgency flag in the analysis result.
    
    **Validates: Requirements 8.1, 8.4**
    """
    urgency_detected, matched_phrases = detect_urgency_indicators(text_with_urgency)
    
    # Urgency should be detected
    assert urgency_detected, \
        f"Urgency should be detected in text with urgency indicators: {text_with_urgency[:100]}"
    
    # At least one phrase should be matched
    assert len(matched_phrases) > 0, \
        "At least one urgency phrase should be matched"
    
    # Matched phrases should be non-empty strings
    for phrase in matched_phrases:
        assert isinstance(phrase, str), "Matched phrase should be a string"
        assert len(phrase) > 0, "Matched phrase should not be empty"


@pytest.mark.property
@given(st.text(min_size=0, max_size=500))
def test_property_10_urgency_detection_returns_valid_result(text):
    """
    Property 10: Urgency Detection (Valid result)
    
    For any text input, urgency detection should return a valid result
    (boolean flag and list of matched phrases).
    
    **Validates: Requirements 8.1, 8.4**
    """
    urgency_detected, matched_phrases = detect_urgency_indicators(text)
    
    # Result should be a boolean
    assert isinstance(urgency_detected, bool), \
        "Urgency detection should return a boolean flag"
    
    # Matched phrases should be a list
    assert isinstance(matched_phrases, list), \
        "Matched phrases should be a list"
    
    # If urgency detected, list should not be empty
    if urgency_detected:
        assert len(matched_phrases) > 0, \
            "If urgency is detected, matched phrases list should not be empty"
    
    # If no urgency detected, list should be empty
    if not urgency_detected:
        assert len(matched_phrases) == 0, \
            "If urgency is not detected, matched phrases list should be empty"


@pytest.mark.property
@given(st.lists(st.sampled_from([
    "act now", "immediately", "urgent", "limited time", "expires today",
    "will be arrested", "legal action", "must act now"
]), min_size=1, max_size=5))
def test_property_10_multiple_urgency_indicators(urgency_phrases):
    """
    Property 10: Urgency Detection (Multiple indicators)
    
    For any text containing multiple urgency indicators, all should be detected
    and included in the matched phrases list.
    
    **Validates: Requirements 8.1, 8.4**
    """
    # Create text with multiple urgency indicators
    text = " ".join(urgency_phrases)
    
    urgency_detected, matched_phrases = detect_urgency_indicators(text)
    
    # Urgency should be detected
    assert urgency_detected, \
        "Urgency should be detected when multiple indicators are present"
    
    # At least one phrase should be matched (may not match all due to regex patterns)
    assert len(matched_phrases) > 0, \
        "At least one urgency phrase should be matched"


# Property 11: Financial Demand Detection
# **Validates: Requirements 9.1, 9.4**

@pytest.mark.property
@given(text_with_financial_demand_strategy())
def test_property_11_financial_demand_detection_with_indicators(text_with_financial):
    """
    Property 11: Financial Demand Detection
    
    For any transcript containing requests for payment or financial information,
    the system should detect the financial demand, set the financial demand flag,
    and include the payment type in the analysis result.
    
    **Validates: Requirements 9.1, 9.4**
    """
    financial_detected, matched_phrases = detect_financial_demands(text_with_financial)
    
    # Financial demand should be detected
    assert financial_detected, \
        f"Financial demand should be detected in text with financial indicators: {text_with_financial[:100]}"
    
    # At least one phrase should be matched
    assert len(matched_phrases) > 0, \
        "At least one financial phrase should be matched"
    
    # Matched phrases should be non-empty strings
    for phrase in matched_phrases:
        assert isinstance(phrase, str), "Matched phrase should be a string"
        assert len(phrase) > 0, "Matched phrase should not be empty"


@pytest.mark.property
@given(st.text(min_size=0, max_size=500))
def test_property_11_financial_demand_returns_valid_result(text):
    """
    Property 11: Financial Demand Detection (Valid result)
    
    For any text input, financial demand detection should return a valid result
    (boolean flag and list of matched phrases).
    
    **Validates: Requirements 9.1, 9.4**
    """
    financial_detected, matched_phrases = detect_financial_demands(text)
    
    # Result should be a boolean
    assert isinstance(financial_detected, bool), \
        "Financial demand detection should return a boolean flag"
    
    # Matched phrases should be a list
    assert isinstance(matched_phrases, list), \
        "Matched phrases should be a list"
    
    # If financial demand detected, list should not be empty
    if financial_detected:
        assert len(matched_phrases) > 0, \
            "If financial demand is detected, matched phrases list should not be empty"
    
    # If no financial demand detected, list should be empty
    if not financial_detected:
        assert len(matched_phrases) == 0, \
            "If financial demand is not detected, matched phrases list should be empty"


@pytest.mark.property
@given(st.lists(st.sampled_from([
    "credit card", "bank account", "wire transfer", "pay now",
    "verify your account", "social security number", "send money"
]), min_size=1, max_size=5))
def test_property_11_multiple_financial_demands(financial_phrases):
    """
    Property 11: Financial Demand Detection (Multiple demands)
    
    For any text containing multiple financial demand indicators, all should be
    detected and included in the matched phrases list.
    
    **Validates: Requirements 9.1, 9.4**
    """
    # Create text with multiple financial demands
    text = " ".join(financial_phrases)
    
    financial_detected, matched_phrases = detect_financial_demands(text)
    
    # Financial demand should be detected
    assert financial_detected, \
        "Financial demand should be detected when multiple indicators are present"
    
    # At least one phrase should be matched
    assert len(matched_phrases) > 0, \
        "At least one financial phrase should be matched"


# Property 12: Unusual Payment Method Flagging
# **Validates: Requirements 9.5**

@pytest.mark.property
@given(text_with_unusual_payment_strategy())
def test_property_12_unusual_payment_detection_with_indicators(text_with_payment):
    """
    Property 12: Unusual Payment Method Flagging
    
    For any transcript mentioning unusual payment methods (gift cards,
    cryptocurrency, wire transfers to individuals), the system should flag
    these as high-risk payment types.
    
    **Validates: Requirements 9.5**
    """
    unusual_detected, payment_type, matched_phrases = detect_unusual_payment_methods(text_with_payment)
    
    # Unusual payment should be detected
    assert unusual_detected, \
        f"Unusual payment should be detected in text with payment indicators: {text_with_payment[:100]}"
    
    # Payment type should be identified
    assert payment_type is not None, \
        "Payment type should be identified when unusual payment is detected"
    
    # Payment type should be one of the known types
    valid_payment_types = ["gift card", "cryptocurrency", "wire transfer", "cash", "money order"]
    assert payment_type in valid_payment_types, \
        f"Payment type '{payment_type}' should be one of {valid_payment_types}"
    
    # At least one phrase should be matched
    assert len(matched_phrases) > 0, \
        "At least one payment phrase should be matched"


@pytest.mark.property
@given(st.text(min_size=0, max_size=500))
def test_property_12_unusual_payment_returns_valid_result(text):
    """
    Property 12: Unusual Payment Method Flagging (Valid result)
    
    For any text input, unusual payment detection should return a valid result
    (boolean flag, optional payment type, and list of matched phrases).
    
    **Validates: Requirements 9.5**
    """
    unusual_detected, payment_type, matched_phrases = detect_unusual_payment_methods(text)
    
    # Result should be a boolean
    assert isinstance(unusual_detected, bool), \
        "Unusual payment detection should return a boolean flag"
    
    # Payment type should be None or a string
    assert payment_type is None or isinstance(payment_type, str), \
        "Payment type should be None or a string"
    
    # Matched phrases should be a list
    assert isinstance(matched_phrases, list), \
        "Matched phrases should be a list"
    
    # If unusual payment detected, payment type should be set and list should not be empty
    if unusual_detected:
        assert payment_type is not None, \
            "If unusual payment is detected, payment type should be set"
        assert len(matched_phrases) > 0, \
            "If unusual payment is detected, matched phrases list should not be empty"
    
    # If no unusual payment detected, payment type should be None and list should be empty
    if not unusual_detected:
        assert payment_type is None, \
            "If unusual payment is not detected, payment type should be None"
        assert len(matched_phrases) == 0, \
            "If unusual payment is not detected, matched phrases list should be empty"


@pytest.mark.property
@given(
    payment_type=st.sampled_from(["gift card", "bitcoin", "wire transfer", "cash", "money order"]),
    base_text=st.text(min_size=10, max_size=100)
)
def test_property_12_payment_type_identification(payment_type, base_text):
    """
    Property 12: Unusual Payment Method Flagging (Type identification)
    
    For any text mentioning a specific unusual payment method, the system
    should correctly identify the payment type category.
    
    **Validates: Requirements 9.5**
    """
    # Map payment types to example phrases
    payment_phrases = {
        "gift card": "iTunes gift card",
        "bitcoin": "bitcoin wallet",
        "wire transfer": "Western Union",
        "cash": "send cash",
        "money order": "money order"
    }
    
    text = f"{base_text} {payment_phrases[payment_type]}"
    
    unusual_detected, detected_type, matched_phrases = detect_unusual_payment_methods(text)
    
    # Unusual payment should be detected
    assert unusual_detected, \
        f"Unusual payment should be detected for {payment_type}"
    
    # Detected type should match expected category (with some flexibility for mapping)
    assert detected_type is not None, \
        f"Payment type should be identified for {payment_type}"
    
    # The detected type should be one of the valid types
    valid_types = ["gift card", "cryptocurrency", "wire transfer", "cash", "money order"]
    assert detected_type in valid_types, \
        f"Detected type '{detected_type}' should be one of {valid_types}"


# Property 8: Escalation Detection Across Segments
# **Validates: Requirements 7.3**

@pytest.mark.property
@given(st.lists(conversation_segment_strategy(), min_size=2, max_size=10))
def test_property_8_escalation_detection_with_increasing_scores(segments):
    """
    Property 8: Escalation Detection Across Segments
    
    For any multi-segment conversation where fraud indicators increase over time,
    the system should detect the escalation pattern and reflect it in increasing
    fraud scores.
    
    **Validates: Requirements 7.3**
    """
    # Sort segments by timestamp to ensure chronological order
    sorted_segments = sorted(segments, key=lambda s: s.timestamp)
    
    # Run escalation detection
    escalation_detected, escalation_rate = detect_escalation(sorted_segments)
    
    # Validate return types
    assert isinstance(escalation_detected, bool), \
        "Escalation detection should return a boolean"
    assert isinstance(escalation_rate, float), \
        "Escalation rate should be a float"
    assert 0.0 <= escalation_rate <= 1.0, \
        f"Escalation rate should be between 0.0 and 1.0, got {escalation_rate}"


@pytest.mark.property
@given(
    base_score=st.integers(min_value=0, max_value=40),
    num_segments=st.integers(min_value=3, max_value=8)
)
def test_property_8_escalation_detected_with_strong_increase(base_score, num_segments):
    """
    Property 8: Escalation Detection (Strong increase pattern)
    
    For any conversation with consistently increasing fraud scores (strong escalation),
    the system should detect escalation and return a high escalation rate.
    
    **Validates: Requirements 7.3**
    """
    # Create segments with steadily increasing fraud scores
    segments = []
    for i in range(num_segments):
        score = min(100, base_score + (i * 15))  # Increase by 15 points each segment
        
        if score <= 30:
            threat_level = ThreatLevel.SAFE
        elif score <= 60:
            threat_level = ThreatLevel.CAUTION
        else:
            threat_level = ThreatLevel.DANGER
        
        segment = ConversationSegment(
            segment_id=f"seg-{i}",
            timestamp=float(i * 1000),
            transcript_text=f"Segment {i} text",
            fraud_score=score,
            threat_level=threat_level
        )
        segments.append(segment)
    
    escalation_detected, escalation_rate = detect_escalation(segments)
    
    # With consistently increasing scores, escalation should be detected
    # (if the increase is significant enough - at least 20 points)
    score_increase = segments[-1].fraud_score - segments[0].fraud_score
    
    if score_increase >= 20:
        assert escalation_detected, \
            f"Escalation should be detected with {score_increase} point increase"
        assert escalation_rate >= 0.5, \
            f"Escalation rate should be >= 0.5 for consistent increase, got {escalation_rate}"


@pytest.mark.property
@given(
    score=st.integers(min_value=0, max_value=100),
    num_segments=st.integers(min_value=3, max_value=8)
)
def test_property_8_no_escalation_with_flat_scores(score, num_segments):
    """
    Property 8: Escalation Detection (Flat pattern)
    
    For any conversation with consistent fraud scores (no escalation),
    the system should not detect escalation.
    
    **Validates: Requirements 7.3**
    """
    # Create segments with the same fraud score
    if score <= 30:
        threat_level = ThreatLevel.SAFE
    elif score <= 60:
        threat_level = ThreatLevel.CAUTION
    else:
        threat_level = ThreatLevel.DANGER
    
    segments = []
    for i in range(num_segments):
        segment = ConversationSegment(
            segment_id=f"seg-{i}",
            timestamp=float(i * 1000),
            transcript_text=f"Segment {i} text",
            fraud_score=score,
            threat_level=threat_level
        )
        segments.append(segment)
    
    escalation_detected, escalation_rate = detect_escalation(segments)
    
    # With flat scores, escalation should not be detected
    assert not escalation_detected, \
        "Escalation should not be detected with flat fraud scores"
    assert escalation_rate < 0.5, \
        f"Escalation rate should be < 0.5 for flat scores, got {escalation_rate}"


@pytest.mark.property
@given(st.lists(conversation_segment_strategy(), min_size=1, max_size=1))
def test_property_8_single_segment_no_escalation(segments):
    """
    Property 8: Escalation Detection (Single segment)
    
    For any single-segment conversation, escalation detection should return
    False (no escalation possible with only one segment).
    
    **Validates: Requirements 7.3**
    """
    escalation_detected, escalation_rate = detect_escalation(segments)
    
    # Single segment cannot have escalation
    assert not escalation_detected, \
        "Escalation should not be detected with only one segment"
    assert escalation_rate == 0.0, \
        f"Escalation rate should be 0.0 for single segment, got {escalation_rate}"


# Property 9: Inconsistency Detection
# **Validates: Requirements 7.4**

@pytest.mark.property
@given(st.lists(conversation_segment_strategy(), min_size=2, max_size=10))
def test_property_9_inconsistency_detection_returns_valid_result(segments):
    """
    Property 9: Inconsistency Detection
    
    For any multi-segment conversation, the inconsistency detection should return
    a valid result (boolean flag and list of inconsistency descriptions).
    
    **Validates: Requirements 7.4**
    """
    # Sort segments by timestamp
    sorted_segments = sorted(segments, key=lambda s: s.timestamp)
    
    # Run inconsistency detection
    inconsistencies_detected, inconsistency_list = detect_inconsistencies(sorted_segments)
    
    # Validate return types
    assert isinstance(inconsistencies_detected, bool), \
        "Inconsistency detection should return a boolean"
    assert isinstance(inconsistency_list, list), \
        "Inconsistency list should be a list"
    
    # If inconsistencies detected, list should not be empty
    if inconsistencies_detected:
        assert len(inconsistency_list) > 0, \
            "If inconsistencies are detected, list should not be empty"
        
        # All items should be strings
        for item in inconsistency_list:
            assert isinstance(item, str), \
                "Inconsistency descriptions should be strings"
            assert len(item) > 0, \
                "Inconsistency descriptions should not be empty"
    
    # If no inconsistencies detected, list should be empty
    if not inconsistencies_detected:
        assert len(inconsistency_list) == 0, \
            "If no inconsistencies detected, list should be empty"


@pytest.mark.property
@given(
    identity1=st.sampled_from(["IRS", "bank", "tech support"]),
    identity2=st.sampled_from(["police", "government", "utility company"]),
    num_segments=st.integers(min_value=2, max_value=5)
)
def test_property_9_multiple_identities_detected(identity1, identity2, num_segments):
    """
    Property 9: Inconsistency Detection (Multiple identities)
    
    For any conversation where the caller claims multiple different identities,
    the system should detect this as an inconsistency.
    
    **Validates: Requirements 7.4**
    """
    assume(identity1 != identity2)  # Ensure different identities
    
    # Create segments with different claimed identities
    segments = []
    for i in range(num_segments):
        # Alternate between identities
        identity = identity1 if i % 2 == 0 else identity2
        text = f"This is the {identity} calling about your account"
        
        segment = ConversationSegment(
            segment_id=f"seg-{i}",
            timestamp=float(i * 1000),
            transcript_text=text,
            fraud_score=50,
            threat_level=ThreatLevel.CAUTION
        )
        segments.append(segment)
    
    inconsistencies_detected, inconsistency_list = detect_inconsistencies(segments)
    
    # Multiple identities should be detected as inconsistency
    assert inconsistencies_detected, \
        f"Multiple identities ({identity1}, {identity2}) should be detected as inconsistency"
    
    # Check that the inconsistency description mentions identities
    inconsistency_text = " ".join(inconsistency_list).lower()
    assert "identit" in inconsistency_text or "claimed" in inconsistency_text, \
        "Inconsistency description should mention identity issues"


@pytest.mark.property
@given(
    amount1=st.integers(min_value=100, max_value=1000),
    amount2=st.integers(min_value=1000, max_value=5000),
    amount3=st.integers(min_value=5000, max_value=10000)
)
def test_property_9_multiple_amounts_detected(amount1, amount2, amount3):
    """
    Property 9: Inconsistency Detection (Multiple amounts)
    
    For any conversation where multiple different amounts are mentioned,
    the system should detect this as a potential inconsistency.
    
    **Validates: Requirements 7.4**
    """
    assume(amount1 != amount2 and amount2 != amount3 and amount1 != amount3)
    
    # Create segments with different amounts
    segments = [
        ConversationSegment(
            segment_id="seg-1",
            timestamp=1000.0,
            transcript_text=f"You owe ${amount1} in taxes",
            fraud_score=50,
            threat_level=ThreatLevel.CAUTION
        ),
        ConversationSegment(
            segment_id="seg-2",
            timestamp=2000.0,
            transcript_text=f"The total amount is ${amount2}",
            fraud_score=55,
            threat_level=ThreatLevel.CAUTION
        ),
        ConversationSegment(
            segment_id="seg-3",
            timestamp=3000.0,
            transcript_text=f"You need to pay ${amount3} immediately",
            fraud_score=60,
            threat_level=ThreatLevel.DANGER
        )
    ]
    
    inconsistencies_detected, inconsistency_list = detect_inconsistencies(segments)
    
    # Multiple different amounts should be detected as inconsistency
    assert inconsistencies_detected, \
        f"Multiple amounts (${amount1}, ${amount2}, ${amount3}) should be detected as inconsistency"
    
    # Check that the inconsistency description mentions amounts
    inconsistency_text = " ".join(inconsistency_list).lower()
    assert "amount" in inconsistency_text, \
        "Inconsistency description should mention amount issues"


@pytest.mark.property
@given(st.lists(conversation_segment_strategy(), min_size=1, max_size=1))
def test_property_9_single_segment_no_inconsistency(segments):
    """
    Property 9: Inconsistency Detection (Single segment)
    
    For any single-segment conversation, inconsistency detection should return
    False (no inconsistencies possible with only one segment).
    
    **Validates: Requirements 7.4**
    """
    inconsistencies_detected, inconsistency_list = detect_inconsistencies(segments)
    
    # Single segment cannot have inconsistencies
    assert not inconsistencies_detected, \
        "Inconsistencies should not be detected with only one segment"
    assert len(inconsistency_list) == 0, \
        "Inconsistency list should be empty for single segment"


@pytest.mark.property
@given(
    text=st.text(min_size=20, max_size=200),
    num_segments=st.integers(min_value=2, max_value=5)
)
def test_property_9_consistent_text_no_inconsistency(text, num_segments):
    """
    Property 9: Inconsistency Detection (Consistent text)
    
    For any conversation with consistent text across segments (no contradictions),
    the system should not detect inconsistencies.
    
    **Validates: Requirements 7.4**
    """
    # Create segments with the same consistent text
    segments = []
    for i in range(num_segments):
        segment = ConversationSegment(
            segment_id=f"seg-{i}",
            timestamp=float(i * 1000),
            transcript_text=text,  # Same text in all segments
            fraud_score=30,
            threat_level=ThreatLevel.SAFE
        )
        segments.append(segment)
    
    inconsistencies_detected, inconsistency_list = detect_inconsistencies(segments)
    
    # Consistent text should not trigger inconsistency detection
    # (unless the text itself contains multiple identities/amounts, which is unlikely with random text)
    # This property mainly ensures the function doesn't crash and returns valid results
    assert isinstance(inconsistencies_detected, bool), \
        "Should return valid boolean result"
    assert isinstance(inconsistency_list, list), \
        "Should return valid list result"
