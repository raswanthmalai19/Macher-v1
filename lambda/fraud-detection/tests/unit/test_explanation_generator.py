"""
Unit tests for explanation generation functions.

Tests validate Requirements 12.1, 12.2, 12.3, 12.4
"""

import pytest
from src.explanation_generator import (
    generate_explanation,
    format_explanation_for_notification,
    generate_summary_explanation,
    _find_citation
)
from src.models import ScamPattern


class TestGenerateExplanation:
    """Test explanation generation for fraud analysis results."""
    
    def test_safe_call_explanation(self):
        """Test explanation for safe call (score <= 30)."""
        explanation = generate_explanation(
            fraud_score=20,
            detected_patterns=[],
            urgency_detected=False,
            urgency_phrases=[],
            financial_demand_detected=False,
            financial_phrases=[],
            financial_demand_type=None,
            transcript_text="Hello, this is a legitimate business call.",
            language="en"
        )
        
        assert "safe" in explanation.lower()
        assert "no significant fraud indicators" in explanation.lower()
        assert "DANGER" not in explanation
        assert "CAUTION" not in explanation
    
    def test_caution_call_explanation(self):
        """Test explanation for caution-level call (31-60)."""
        explanation = generate_explanation(
            fraud_score=45,
            detected_patterns=[],
            urgency_detected=True,
            urgency_phrases=["act now"],
            financial_demand_detected=False,
            financial_phrases=[],
            financial_demand_type=None,
            transcript_text="You need to act now to avoid penalties.",
            language="en"
        )
        
        assert "CAUTION" in explanation
        assert "warning signs" in explanation.lower()
        assert "Recommended Actions" in explanation
    
    def test_danger_call_explanation(self):
        """Test explanation for danger-level call (> 60)."""
        explanation = generate_explanation(
            fraud_score=85,
            detected_patterns=[],
            urgency_detected=True,
            urgency_phrases=["urgent action required"],
            financial_demand_detected=True,
            financial_phrases=["send payment"],
            financial_demand_type="gift card",
            transcript_text="Urgent action required. Send payment via gift card immediately.",
            language="en"
        )
        
        assert "DANGER" in explanation
        assert "scam attempt" in explanation.lower()
        assert "Hang up immediately" in explanation
        assert "Report this call" in explanation
    
    def test_detected_patterns_included(self):
        """Test that detected scam patterns are included in explanation."""
        patterns = [
            ScamPattern(
                pattern_id="irs-001",
                pattern_type="IRS Scam",
                description="Impersonates IRS agent demanding payment",
                confidence=0.92,
                matched_indicators=["IRS", "tax debt", "arrest warrant"]
            ),
            ScamPattern(
                pattern_id="tech-001",
                pattern_type="Tech Support Scam",
                description="Claims computer has virus",
                confidence=0.78,
                matched_indicators=["virus", "computer problem"]
            )
        ]
        
        explanation = generate_explanation(
            fraud_score=75,
            detected_patterns=patterns,
            urgency_detected=False,
            urgency_phrases=[],
            financial_demand_detected=False,
            financial_phrases=[],
            financial_demand_type=None,
            transcript_text="This is the IRS. You have a tax debt.",
            language="en"
        )
        
        assert "Detected Scam Patterns" in explanation
        assert "IRS Scam" in explanation
        assert "92% confidence" in explanation
        assert "Tech Support Scam" in explanation
        assert "78% confidence" in explanation
        assert "IRS" in explanation
        assert "tax debt" in explanation
    
    def test_urgency_indicators_with_citations(self):
        """Test that urgency indicators are cited from transcript."""
        transcript = "You must act now or your account will be closed. This is urgent."
        
        explanation = generate_explanation(
            fraud_score=55,
            detected_patterns=[],
            urgency_detected=True,
            urgency_phrases=["act now", "urgent"],
            financial_demand_detected=False,
            financial_phrases=[],
            financial_demand_type=None,
            transcript_text=transcript,
            language="en"
        )
        
        assert "Pressure Tactics Detected" in explanation
        assert "urgency and pressure tactics" in explanation.lower()
        assert "act now" in explanation.lower() or "urgent" in explanation.lower()
    
    def test_financial_demands_with_citations(self):
        """Test that financial demands are cited from transcript."""
        transcript = "Please provide your credit card number to verify your account."
        
        explanation = generate_explanation(
            fraud_score=65,
            detected_patterns=[],
            urgency_detected=False,
            urgency_phrases=[],
            financial_demand_detected=True,
            financial_phrases=["credit card number", "verify your account"],
            financial_demand_type="credit card",
            transcript_text=transcript,
            language="en"
        )
        
        assert "Financial Requests Detected" in explanation
        assert "credit card" in explanation.lower()
    
    def test_unusual_payment_method_warning(self):
        """Test warning for unusual payment methods."""
        for payment_type in ["gift card", "cryptocurrency", "wire transfer"]:
            explanation = generate_explanation(
                fraud_score=70,
                detected_patterns=[],
                urgency_detected=False,
                urgency_phrases=[],
                financial_demand_detected=True,
                financial_phrases=["send payment"],
                financial_demand_type=payment_type,
                transcript_text=f"Send payment via {payment_type}.",
                language="en"
            )
            
            assert "WARNING" in explanation
            assert payment_type in explanation.lower()
            assert "major red flag" in explanation.lower()
    
    def test_recommended_actions_for_danger(self):
        """Test recommended actions for danger-level calls."""
        explanation = generate_explanation(
            fraud_score=85,
            detected_patterns=[],
            urgency_detected=False,
            urgency_phrases=[],
            financial_demand_detected=False,
            financial_phrases=[],
            financial_demand_type=None,
            transcript_text="This is a dangerous call.",
            language="en"
        )
        
        assert "Recommended Actions" in explanation
        assert "Hang up immediately" in explanation
        assert "do not provide any information" in explanation.lower()
        assert "Report this call" in explanation
    
    def test_recommended_actions_for_caution(self):
        """Test recommended actions for caution-level calls."""
        explanation = generate_explanation(
            fraud_score=45,
            detected_patterns=[],
            urgency_detected=False,
            urgency_phrases=[],
            financial_demand_detected=False,
            financial_phrases=[],
            financial_demand_type=None,
            transcript_text="This is a cautionary call.",
            language="en"
        )
        
        assert "Recommended Actions" in explanation
        assert "Be cautious" in explanation
        assert "verify the caller's identity" in explanation.lower()
    
    def test_empty_transcript_handling(self):
        """Test handling of empty transcript."""
        explanation = generate_explanation(
            fraud_score=50,
            detected_patterns=[],
            urgency_detected=False,
            urgency_phrases=[],
            financial_demand_detected=False,
            financial_phrases=[],
            financial_demand_type=None,
            transcript_text="",
            language="en"
        )
        
        assert "Unable to generate explanation" in explanation
        assert "no transcript" in explanation.lower()
    
    def test_explanation_completeness(self):
        """Test that explanation includes all relevant information."""
        patterns = [
            ScamPattern(
                pattern_id="irs-001",
                pattern_type="IRS Scam",
                description="Tax scam",
                confidence=0.85,
                matched_indicators=["IRS", "tax"]
            )
        ]
        
        explanation = generate_explanation(
            fraud_score=75,
            detected_patterns=patterns,
            urgency_detected=True,
            urgency_phrases=["act now"],
            financial_demand_detected=True,
            financial_phrases=["send money"],
            financial_demand_type="gift card",
            transcript_text="This is the IRS. You must act now and send money via gift card.",
            language="en"
        )
        
        # Should include all major sections
        assert "DANGER" in explanation
        assert "Detected Scam Patterns" in explanation
        assert "Pressure Tactics Detected" in explanation
        assert "Financial Requests Detected" in explanation
        assert "Recommended Actions" in explanation


class TestFindCitation:
    """Test citation extraction from transcript."""
    
    def test_find_citation_basic(self):
        """Test basic citation extraction."""
        transcript = "Hello this is a test message for citation extraction."
        phrase = "test message"
        
        citation = _find_citation(transcript, phrase, context_words=2)
        
        assert citation is not None
        assert "test message" in citation.lower()
    
    def test_find_citation_with_context(self):
        """Test citation includes surrounding context."""
        transcript = "The quick brown fox jumps over the lazy dog."
        phrase = "fox"
        
        citation = _find_citation(transcript, phrase, context_words=2)
        
        assert "fox" in citation.lower()
        assert "brown" in citation.lower() or "jumps" in citation.lower()
    
    def test_find_citation_case_insensitive(self):
        """Test citation search is case-insensitive."""
        transcript = "This is a TEST message."
        phrase = "test"
        
        citation = _find_citation(transcript, phrase)
        
        assert citation is not None
        assert "test" in citation.lower()
    
    def test_find_citation_not_found(self):
        """Test citation returns None when phrase not found."""
        transcript = "This is a test message."
        phrase = "nonexistent"
        
        citation = _find_citation(transcript, phrase)
        
        assert citation is None
    
    def test_find_citation_with_ellipsis(self):
        """Test citation adds ellipsis when truncated."""
        transcript = "One two three four five six seven eight nine ten."
        phrase = "five"
        
        citation = _find_citation(transcript, phrase, context_words=2)
        
        # Should have ellipsis on at least one side
        assert citation is not None
        assert "..." in citation or citation.startswith("...") or citation.endswith("...")
    
    def test_find_citation_empty_inputs(self):
        """Test citation handles empty inputs."""
        assert _find_citation("", "test") is None
        assert _find_citation("test", "") is None
        assert _find_citation("", "") is None


class TestFormatExplanationForNotification:
    """Test explanation formatting for notifications."""
    
    def test_short_explanation_unchanged(self):
        """Test short explanation is not truncated."""
        explanation = "This is a short explanation."
        
        formatted = format_explanation_for_notification(explanation, max_length=500)
        
        assert formatted == explanation
    
    def test_long_explanation_truncated(self):
        """Test long explanation is truncated."""
        explanation = "This is a very long explanation. " * 50  # ~1500 chars
        
        formatted = format_explanation_for_notification(explanation, max_length=100)
        
        assert len(formatted) <= 100
        assert formatted.endswith("...")
    
    def test_extracts_first_paragraph(self):
        """Test formatting extracts first paragraph."""
        explanation = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
        
        formatted = format_explanation_for_notification(explanation, max_length=500)
        
        assert "First paragraph" in formatted
        # Formatting extracts first line/paragraph
        assert "First paragraph" in formatted
    
    def test_truncation_indicator(self):
        """Test truncation adds ellipsis."""
        explanation = "A" * 1000
        
        formatted = format_explanation_for_notification(explanation, max_length=100)
        
        assert formatted.endswith("...")
        assert len(formatted) == 100


class TestGenerateSummaryExplanation:
    """Test summary explanation generation."""
    
    def test_safe_call_summary(self):
        """Test summary for safe call."""
        summary = generate_summary_explanation(
            fraud_score=20,
            detected_patterns=[],
            urgency_detected=False,
            financial_demand_detected=False
        )
        
        assert "No significant fraud indicators" in summary
    
    def test_summary_with_patterns(self):
        """Test summary includes detected patterns."""
        patterns = [
            ScamPattern(
                pattern_id="irs-001",
                pattern_type="IRS Scam",
                description="Tax scam",
                confidence=0.85,
                matched_indicators=[]
            ),
            ScamPattern(
                pattern_id="tech-001",
                pattern_type="Tech Support",
                description="Tech scam",
                confidence=0.75,
                matched_indicators=[]
            )
        ]
        
        summary = generate_summary_explanation(
            fraud_score=70,
            detected_patterns=patterns,
            urgency_detected=False,
            financial_demand_detected=False
        )
        
        assert "IRS Scam" in summary
        assert "matches" in summary.lower()
    
    def test_summary_with_urgency(self):
        """Test summary includes urgency indicator."""
        summary = generate_summary_explanation(
            fraud_score=50,
            detected_patterns=[],
            urgency_detected=True,
            financial_demand_detected=False
        )
        
        assert "pressure tactics" in summary.lower()
    
    def test_summary_with_financial_demand(self):
        """Test summary includes financial demand indicator."""
        summary = generate_summary_explanation(
            fraud_score=60,
            detected_patterns=[],
            urgency_detected=False,
            financial_demand_detected=True
        )
        
        assert "requests payment" in summary.lower()
    
    def test_summary_with_multiple_indicators(self):
        """Test summary combines multiple indicators."""
        patterns = [
            ScamPattern(
                pattern_id="pattern-001",
                pattern_type="IRS Scam",
                description="Tax scam",
                confidence=0.85,
                matched_indicators=[]
            )
        ]
        
        summary = generate_summary_explanation(
            fraud_score=75,
            detected_patterns=patterns,
            urgency_detected=True,
            financial_demand_detected=True
        )
        
        assert "IRS Scam" in summary
        assert "pressure tactics" in summary.lower()
        assert "requests payment" in summary.lower()
    
    def test_summary_is_concise(self):
        """Test summary is one sentence."""
        patterns = [
            ScamPattern(
                pattern_id="pattern-001",
                pattern_type="IRS Scam",
                description="Tax scam",
                confidence=0.85,
                matched_indicators=[]
            )
        ]
        
        summary = generate_summary_explanation(
            fraud_score=70,
            detected_patterns=patterns,
            urgency_detected=True,
            financial_demand_detected=True
        )
        
        # Should be relatively short (one sentence)
        assert len(summary) < 200
        assert summary.endswith(".")
    
    def test_summary_fallback(self):
        """Test summary fallback when no specific indicators."""
        summary = generate_summary_explanation(
            fraud_score=50,
            detected_patterns=[],
            urgency_detected=False,
            financial_demand_detected=False
        )
        
        assert "suspicious activity" in summary.lower()


class TestExplanationIntegration:
    """Integration tests for explanation generation."""
    
    def test_realistic_irs_scam_explanation(self):
        """Test explanation for realistic IRS scam scenario."""
        patterns = [
            ScamPattern(
                pattern_id="pattern-001",
                pattern_type="IRS Scam",
                description="Impersonates IRS agent demanding immediate payment",
                confidence=0.92,
                matched_indicators=["IRS", "tax debt", "arrest warrant", "immediate payment"]
            )
        ]
        
        transcript = (
            "This is Agent Johnson from the IRS. You have an outstanding tax debt "
            "of $5,000. If you don't pay immediately, we will issue an arrest warrant. "
            "You must purchase gift cards and provide the numbers to settle this debt now."
        )
        
        explanation = generate_explanation(
            fraud_score=95,
            detected_patterns=patterns,
            urgency_detected=True,
            urgency_phrases=["immediately", "now"],
            financial_demand_detected=True,
            financial_phrases=["purchase gift cards", "pay"],
            financial_demand_type="gift card",
            transcript_text=transcript,
            language="en"
        )
        
        # Verify all key elements are present
        assert "DANGER" in explanation
        assert "IRS Scam" in explanation
        assert "92% confidence" in explanation
        assert "Pressure Tactics" in explanation
        assert "Financial Requests" in explanation
        assert "gift card" in explanation.lower()
        assert "WARNING" in explanation
        assert "major red flag" in explanation.lower()
        assert "Hang up immediately" in explanation
        assert "Report this call" in explanation
    
    def test_realistic_tech_support_scam_explanation(self):
        """Test explanation for realistic tech support scam scenario."""
        patterns = [
            ScamPattern(
                pattern_id="pattern-001",
                pattern_type="Tech Support Scam",
                description="Claims computer has virus and offers paid fix",
                confidence=0.88,
                matched_indicators=["virus", "computer problem", "remote access"]
            )
        ]
        
        transcript = (
            "Hello, this is Microsoft technical support. We've detected a virus on your "
            "computer. You need to give us remote access right away to fix it. "
            "The repair service costs $299."
        )
        
        explanation = generate_explanation(
            fraud_score=82,
            detected_patterns=patterns,
            urgency_detected=True,
            urgency_phrases=["right away"],
            financial_demand_detected=True,
            financial_phrases=["costs $299"],
            financial_demand_type="credit card",
            transcript_text=transcript,
            language="en"
        )
        
        assert "DANGER" in explanation
        assert "Tech Support Scam" in explanation
        assert "88% confidence" in explanation
        assert "virus" in explanation.lower()
        assert "Hang up immediately" in explanation
