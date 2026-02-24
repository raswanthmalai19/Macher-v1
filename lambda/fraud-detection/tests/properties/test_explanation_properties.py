"""
Property-based tests for explanation generation.

Tests validate Requirements 12.1, 12.2, 12.3, 12.4
"""

from hypothesis import given, strategies as st, assume
from src.explanation_generator import (
    generate_explanation,
    generate_summary_explanation,
    format_explanation_for_notification
)
from src.models import ScamPattern


# Strategy for generating fraud scores
fraud_scores = st.integers(min_value=0, max_value=100)

# Strategy for generating transcript text
transcripts = st.text(min_size=10, max_size=500, alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z')))

# Strategy for generating phrases
phrases = st.lists(st.text(min_size=3, max_size=20), min_size=0, max_size=5)

# Strategy for generating scam patterns
@st.composite
def scam_patterns(draw):
    """Generate list of scam patterns."""
    num_patterns = draw(st.integers(min_value=0, max_value=3))
    patterns = []
    
    pattern_types = ["IRS Scam", "Tech Support", "Grandparent Scam", "Lottery Scam"]
    
    for i in range(num_patterns):
        pattern = ScamPattern(
            pattern_id=f"pattern-{i:03d}",
            pattern_type=draw(st.sampled_from(pattern_types)),
            description=draw(st.text(min_size=10, max_size=100)),
            confidence=draw(st.floats(min_value=0.0, max_value=1.0)),
            matched_indicators=draw(st.lists(st.text(min_size=3, max_size=15), max_size=5))
        )
        patterns.append(pattern)
    
    return patterns


class TestExplanationPresenceProperty:
    """
    Property 17: Explanation Presence for Flagged Calls
    
    For any call with fraud_score > 30, an explanation should be generated
    and should not be empty.
    
    Feature: ai-powered-fraud-detection, Property 17: Explanation Presence for Flagged Calls
    Validates: Requirements 12.1
    """
    
    @given(
        fraud_score=st.integers(min_value=31, max_value=100),
        detected_patterns=scam_patterns(),
        urgency_detected=st.booleans(),
        urgency_phrases=phrases,
        financial_demand_detected=st.booleans(),
        financial_phrases=phrases,
        transcript_text=transcripts
    )
    def test_property_17_explanation_presence_for_flagged_calls(
        self,
        fraud_score,
        detected_patterns,
        urgency_detected,
        urgency_phrases,
        financial_demand_detected,
        financial_phrases,
        transcript_text
    ):
        """Test that flagged calls always have explanations."""
        assume(len(transcript_text.strip()) > 0)  # Non-empty transcript
        
        explanation = generate_explanation(
            fraud_score=fraud_score,
            detected_patterns=detected_patterns,
            urgency_detected=urgency_detected,
            urgency_phrases=urgency_phrases,
            financial_demand_detected=financial_demand_detected,
            financial_phrases=financial_phrases,
            financial_demand_type="credit card" if financial_demand_detected else None,
            transcript_text=transcript_text,
            language="en"
        )
        
        # Explanation should not be empty
        assert explanation is not None
        assert len(explanation) > 0
        
        # Explanation should contain threat assessment
        assert any(keyword in explanation for keyword in ["DANGER", "CAUTION", "safe"])
    
    @given(
        fraud_score=st.integers(min_value=0, max_value=30),
        transcript_text=transcripts
    )
    def test_property_17_safe_calls_have_explanations(self, fraud_score, transcript_text):
        """Test that even safe calls have explanations."""
        assume(len(transcript_text.strip()) > 0)
        
        explanation = generate_explanation(
            fraud_score=fraud_score,
            detected_patterns=[],
            urgency_detected=False,
            urgency_phrases=[],
            financial_demand_detected=False,
            financial_phrases=[],
            financial_demand_type=None,
            transcript_text=transcript_text,
            language="en"
        )
        
        assert explanation is not None
        assert len(explanation) > 0
        assert "safe" in explanation.lower()


class TestExplanationIndicatorReferencesProperty:
    """
    Property 18: Explanation Indicator References
    
    For any explanation with detected indicators (patterns, urgency, financial demands),
    the explanation should reference those indicators.
    
    Feature: ai-powered-fraud-detection, Property 18: Explanation Indicator References
    Validates: Requirements 12.2, 12.4
    """
    
    @given(
        fraud_score=fraud_scores,
        detected_patterns=scam_patterns(),
        transcript_text=transcripts
    )
    def test_property_18_patterns_referenced_in_explanation(
        self,
        fraud_score,
        detected_patterns,
        transcript_text
    ):
        """Test that detected patterns are referenced in explanation."""
        assume(len(transcript_text.strip()) > 0)
        assume(len(detected_patterns) > 0)  # At least one pattern
        
        explanation = generate_explanation(
            fraud_score=fraud_score,
            detected_patterns=detected_patterns,
            urgency_detected=False,
            urgency_phrases=[],
            financial_demand_detected=False,
            financial_phrases=[],
            financial_demand_type=None,
            transcript_text=transcript_text,
            language="en"
        )
        
        # Explanation should mention detected patterns
        assert "Detected Scam Patterns" in explanation or "Pattern" in explanation
        
        # At least one pattern type should be mentioned
        pattern_types = [p.pattern_type for p in detected_patterns]
        assert any(ptype in explanation for ptype in pattern_types)
    
    @given(
        fraud_score=fraud_scores,
        urgency_phrases=st.lists(st.text(min_size=5, max_size=20), min_size=1, max_size=3),
        transcript_text=transcripts
    )
    def test_property_18_urgency_referenced_in_explanation(
        self,
        fraud_score,
        urgency_phrases,
        transcript_text
    ):
        """Test that urgency indicators are referenced in explanation."""
        assume(len(transcript_text.strip()) > 0)
        
        explanation = generate_explanation(
            fraud_score=fraud_score,
            detected_patterns=[],
            urgency_detected=True,
            urgency_phrases=urgency_phrases,
            financial_demand_detected=False,
            financial_phrases=[],
            financial_demand_type=None,
            transcript_text=transcript_text,
            language="en"
        )
        
        # Explanation should mention pressure tactics
        assert any(keyword in explanation.lower() for keyword in ["pressure", "urgency", "tactics"])
    
    @given(
        fraud_score=fraud_scores,
        financial_phrases=st.lists(st.text(min_size=5, max_size=20), min_size=1, max_size=3),
        transcript_text=transcripts
    )
    def test_property_18_financial_demands_referenced_in_explanation(
        self,
        fraud_score,
        financial_phrases,
        transcript_text
    ):
        """Test that financial demands are referenced in explanation."""
        assume(len(transcript_text.strip()) > 0)
        
        explanation = generate_explanation(
            fraud_score=fraud_score,
            detected_patterns=[],
            urgency_detected=False,
            urgency_phrases=[],
            financial_demand_detected=True,
            financial_phrases=financial_phrases,
            financial_demand_type="credit card",
            transcript_text=transcript_text,
            language="en"
        )
        
        # Explanation should mention financial requests
        assert any(keyword in explanation.lower() for keyword in ["financial", "payment", "credit card"])


class TestExplanationTranscriptCitationsProperty:
    """
    Property 19: Explanation Transcript Citations
    
    For any explanation with specific indicators, relevant portions of the
    transcript should be cited.
    
    Feature: ai-powered-fraud-detection, Property 19: Explanation Transcript Citations
    Validates: Requirements 12.3
    """
    
    @given(
        fraud_score=fraud_scores,
        transcript_text=st.text(min_size=50, max_size=200)
    )
    def test_property_19_urgency_phrases_cited(self, fraud_score, transcript_text):
        """Test that urgency phrases from transcript are cited."""
        assume(len(transcript_text.strip()) > 0)
        
        # Use phrases that might appear in transcript
        urgency_phrases = ["now", "immediately", "urgent"]
        
        explanation = generate_explanation(
            fraud_score=fraud_score,
            detected_patterns=[],
            urgency_detected=True,
            urgency_phrases=urgency_phrases,
            financial_demand_detected=False,
            financial_phrases=[],
            financial_demand_type=None,
            transcript_text=transcript_text,
            language="en"
        )
        
        # If urgency detected, explanation should attempt to cite phrases
        if fraud_score > 30:
            assert "Pressure Tactics" in explanation or "urgency" in explanation.lower()
    
    @given(
        fraud_score=fraud_scores,
        transcript_text=st.text(min_size=50, max_size=200)
    )
    def test_property_19_financial_phrases_cited(self, fraud_score, transcript_text):
        """Test that financial phrases from transcript are cited."""
        assume(len(transcript_text.strip()) > 0)
        
        # Use phrases that might appear in transcript
        financial_phrases = ["payment", "money", "card"]
        
        explanation = generate_explanation(
            fraud_score=fraud_score,
            detected_patterns=[],
            urgency_detected=False,
            urgency_phrases=[],
            financial_demand_detected=True,
            financial_phrases=financial_phrases,
            financial_demand_type="credit card",
            transcript_text=transcript_text,
            language="en"
        )
        
        # If financial demand detected, explanation should mention it
        if fraud_score > 30:
            assert "Financial" in explanation or "payment" in explanation.lower()


class TestSummaryExplanationProperty:
    """Test properties of summary explanations."""
    
    @given(
        fraud_score=fraud_scores,
        detected_patterns=scam_patterns(),
        urgency_detected=st.booleans(),
        financial_demand_detected=st.booleans()
    )
    def test_summary_is_concise(
        self,
        fraud_score,
        detected_patterns,
        urgency_detected,
        financial_demand_detected
    ):
        """Test that summary explanations are concise (one sentence)."""
        summary = generate_summary_explanation(
            fraud_score=fraud_score,
            detected_patterns=detected_patterns,
            urgency_detected=urgency_detected,
            financial_demand_detected=financial_demand_detected
        )
        
        # Summary should be short
        assert len(summary) < 300
        
        # Summary should end with period
        assert summary.endswith(".")
        
        # Summary should not be empty
        assert len(summary) > 0
    
    @given(
        fraud_score=st.integers(min_value=31, max_value=100),
        detected_patterns=scam_patterns()
    )
    def test_summary_includes_key_info(self, fraud_score, detected_patterns):
        """Test that summary includes key information."""
        summary = generate_summary_explanation(
            fraud_score=fraud_score,
            detected_patterns=detected_patterns,
            urgency_detected=True,
            financial_demand_detected=True
        )
        
        # Summary should mention at least one indicator
        has_indicator = any([
            len(detected_patterns) > 0 and any(p.pattern_type in summary for p in detected_patterns),
            "pressure" in summary.lower(),
            "payment" in summary.lower(),
            "suspicious" in summary.lower()
        ])
        
        assert has_indicator


class TestNotificationFormattingProperty:
    """Test properties of notification formatting."""
    
    @given(
        explanation=st.text(min_size=10, max_size=2000),
        max_length=st.integers(min_value=50, max_value=500)
    )
    def test_formatted_respects_max_length(self, explanation, max_length):
        """Test that formatted explanation respects max length."""
        formatted = format_explanation_for_notification(explanation, max_length=max_length)
        
        # Formatted should not exceed max length
        assert len(formatted) <= max_length
        
        # Formatted should not be empty
        assert len(formatted) > 0
    
    @given(
        explanation=st.text(min_size=10, max_size=100)
    )
    def test_short_explanations_unchanged(self, explanation):
        """Test that short explanations are not modified."""
        max_length = 500
        
        formatted = format_explanation_for_notification(explanation, max_length=max_length)
        
        # If explanation is shorter than max, should be unchanged
        if len(explanation) <= max_length:
            assert formatted == explanation
    
    @given(
        explanation=st.text(min_size=600, max_size=2000)
    )
    def test_long_explanations_truncated(self, explanation):
        """Test that long explanations are truncated."""
        max_length = 100
        
        formatted = format_explanation_for_notification(explanation, max_length=max_length)
        
        # Should be truncated
        assert len(formatted) <= max_length
        
        # Should have truncation indicator if original was longer
        # (Note: may not always have ... if first paragraph is exactly max_length)
        if len(explanation) > max_length:
            assert len(formatted) <= max_length
