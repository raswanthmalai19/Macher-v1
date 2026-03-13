"""
Unit tests for fraud scoring helper functions.

Tests specific examples and edge cases for threat level calculation,
urgency detection, financial demand detection, and unusual payment method detection.
"""

import pytest
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


class TestCalculateThreatLevel:
    """Test threat level calculation from fraud scores."""
    
    def test_safe_level_lower_bound(self):
        """Test Safe level at lower bound (0)."""
        assert calculate_threat_level(0) == ThreatLevel.SAFE
    
    def test_safe_level_upper_bound(self):
        """Test Safe level at upper bound (30)."""
        assert calculate_threat_level(30) == ThreatLevel.SAFE
    
    def test_safe_level_mid_range(self):
        """Test Safe level in mid-range (15)."""
        assert calculate_threat_level(15) == ThreatLevel.SAFE
    
    def test_caution_level_lower_bound(self):
        """Test Caution level at lower bound (31)."""
        assert calculate_threat_level(31) == ThreatLevel.CAUTION
    
    def test_caution_level_upper_bound(self):
        """Test Caution level at upper bound (60)."""
        assert calculate_threat_level(60) == ThreatLevel.CAUTION
    
    def test_caution_level_mid_range(self):
        """Test Caution level in mid-range (45)."""
        assert calculate_threat_level(45) == ThreatLevel.CAUTION
    
    def test_danger_level_lower_bound(self):
        """Test Danger level at lower bound (61)."""
        assert calculate_threat_level(61) == ThreatLevel.DANGER
    
    def test_danger_level_upper_bound(self):
        """Test Danger level at upper bound (100)."""
        assert calculate_threat_level(100) == ThreatLevel.DANGER
    
    def test_danger_level_mid_range(self):
        """Test Danger level in mid-range (80)."""
        assert calculate_threat_level(80) == ThreatLevel.DANGER
    
    def test_invalid_score_negative(self):
        """Test error handling for negative fraud score."""
        with pytest.raises(ValueError, match="must be between 0 and 100"):
            calculate_threat_level(-1)
    
    def test_invalid_score_too_high(self):
        """Test error handling for fraud score > 100."""
        with pytest.raises(ValueError, match="must be between 0 and 100"):
            calculate_threat_level(101)
    
    def test_invalid_score_type(self):
        """Test error handling for non-integer fraud score."""
        with pytest.raises(ValueError, match="must be an integer"):
            calculate_threat_level(50.5)


class TestDetectUrgencyIndicators:
    """Test urgency indicator detection."""
    
    def test_no_urgency_in_normal_text(self):
        """Test that normal conversation has no urgency indicators."""
        text = "Hello, I'm calling to discuss your account options."
        urgency_detected, phrases = detect_urgency_indicators(text)
        assert urgency_detected is False
        assert len(phrases) == 0
    
    def test_act_now_phrase(self):
        """Test detection of 'act now' urgency phrase."""
        text = "You must act now to avoid penalties."
        urgency_detected, phrases = detect_urgency_indicators(text)
        assert urgency_detected is True
        assert "act now" in phrases
    
    def test_immediately_phrase(self):
        """Test detection of 'immediately' urgency phrase."""
        text = "You need to respond immediately or your account will be closed."
        urgency_detected, phrases = detect_urgency_indicators(text)
        assert urgency_detected is True
        assert "immediately" in phrases
    
    def test_limited_time_phrase(self):
        """Test detection of 'limited time' urgency phrase."""
        text = "This is a limited time offer that expires today."
        urgency_detected, phrases = detect_urgency_indicators(text)
        assert urgency_detected is True
        assert any("limited time" in p or "expires" in p for p in phrases)
    
    def test_arrest_threat(self):
        """Test detection of arrest threat."""
        text = "You will be arrested if you don't pay immediately."
        urgency_detected, phrases = detect_urgency_indicators(text)
        assert urgency_detected is True
        assert any("arrested" in p or "immediately" in p for p in phrases)
    
    def test_account_suspension_threat(self):
        """Test detection of account suspension threat."""
        text = "Your account will be suspended unless you verify your information."
        urgency_detected, phrases = detect_urgency_indicators(text)
        assert urgency_detected is True
        assert any("suspended" in p for p in phrases)
    
    def test_legal_action_threat(self):
        """Test detection of legal action threat."""
        text = "We will take legal action if payment is not received."
        urgency_detected, phrases = detect_urgency_indicators(text)
        assert urgency_detected is True
        assert "legal action" in phrases
    
    def test_multiple_urgency_indicators(self):
        """Test detection of multiple urgency indicators."""
        text = "Act now! Your account will be closed immediately. This is urgent!"
        urgency_detected, phrases = detect_urgency_indicators(text)
        assert urgency_detected is True
        assert len(phrases) >= 2
        assert "act now" in phrases
        assert "urgent" in phrases
    
    def test_case_insensitive_detection(self):
        """Test that detection is case-insensitive."""
        text = "ACT NOW or LOSE ACCESS to your account!"
        urgency_detected, phrases = detect_urgency_indicators(text)
        assert urgency_detected is True
        assert "act now" in phrases
    
    def test_empty_text(self):
        """Test handling of empty text."""
        urgency_detected, phrases = detect_urgency_indicators("")
        assert urgency_detected is False
        assert len(phrases) == 0
    
    def test_none_text(self):
        """Test handling of None text."""
        urgency_detected, phrases = detect_urgency_indicators(None)
        assert urgency_detected is False
        assert len(phrases) == 0


class TestDetectFinancialDemands:
    """Test financial demand detection."""
    
    def test_no_financial_demand_in_normal_text(self):
        """Test that normal conversation has no financial demands."""
        text = "Hello, how are you today? I hope you're having a good day."
        financial_detected, phrases = detect_financial_demands(text)
        assert financial_detected is False
        assert len(phrases) == 0
    
    def test_credit_card_request(self):
        """Test detection of credit card request."""
        text = "Please provide your credit card number to complete the payment."
        financial_detected, phrases = detect_financial_demands(text)
        assert financial_detected is True
        assert "credit card" in phrases
    
    def test_bank_account_request(self):
        """Test detection of bank account request."""
        text = "We need your bank account number and routing number."
        financial_detected, phrases = detect_financial_demands(text)
        assert financial_detected is True
        assert any("bank account" in p or "routing number" in p for p in phrases)
    
    def test_ssn_request(self):
        """Test detection of SSN request."""
        text = "Can you confirm your social security number for verification?"
        financial_detected, phrases = detect_financial_demands(text)
        assert financial_detected is True
        assert "social security number" in phrases
    
    def test_wire_transfer_request(self):
        """Test detection of wire transfer request."""
        text = "Please send the payment via wire transfer to this account."
        financial_detected, phrases = detect_financial_demands(text)
        assert financial_detected is True
        assert "wire transfer" in phrases
    
    def test_verify_account_indirect_request(self):
        """Test detection of indirect 'verify account' request."""
        text = "You need to verify your account information to continue."
        financial_detected, phrases = detect_financial_demands(text)
        assert financial_detected is True
        assert any("verify" in p for p in phrases)
    
    def test_confirm_payment_indirect_request(self):
        """Test detection of indirect 'confirm payment' request."""
        text = "Please confirm your payment method to proceed."
        financial_detected, phrases = detect_financial_demands(text)
        assert financial_detected is True
        assert any("confirm" in p and "payment" in p for p in phrases)
    
    def test_cvv_request(self):
        """Test detection of CVV/security code request."""
        text = "What is the CVV code on the back of your card?"
        financial_detected, phrases = detect_financial_demands(text)
        assert financial_detected is True
        assert "cvv" in phrases
    
    def test_multiple_financial_demands(self):
        """Test detection of multiple financial demands."""
        text = "I need your credit card number, CVV, and expiration date."
        financial_detected, phrases = detect_financial_demands(text)
        assert financial_detected is True
        assert len(phrases) >= 2
    
    def test_case_insensitive_detection(self):
        """Test that detection is case-insensitive."""
        text = "Please provide your CREDIT CARD NUMBER and BANK ACCOUNT."
        financial_detected, phrases = detect_financial_demands(text)
        assert financial_detected is True
    
    def test_empty_text(self):
        """Test handling of empty text."""
        financial_detected, phrases = detect_financial_demands("")
        assert financial_detected is False
        assert len(phrases) == 0
    
    def test_none_text(self):
        """Test handling of None text."""
        financial_detected, phrases = detect_financial_demands(None)
        assert financial_detected is False
        assert len(phrases) == 0


class TestDetectUnusualPaymentMethods:
    """Test unusual payment method detection."""
    
    def test_no_unusual_payment_in_normal_text(self):
        """Test that normal conversation has no unusual payment methods."""
        text = "You can pay with your regular credit card or debit card."
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(text)
        assert unusual_detected is False
        assert payment_type is None
        assert len(phrases) == 0
    
    def test_gift_card_detection(self):
        """Test detection of gift card payment method."""
        text = "Please purchase a gift card and provide the code."
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(text)
        assert unusual_detected is True
        assert payment_type == "gift card"
        assert "gift card" in phrases
    
    def test_itunes_gift_card_detection(self):
        """Test detection of iTunes gift card."""
        text = "Buy an iTunes card and send me the numbers."
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(text)
        assert unusual_detected is True
        assert payment_type == "gift card"
        assert any("itunes" in p for p in phrases)
    
    def test_google_play_card_detection(self):
        """Test detection of Google Play gift card."""
        text = "Get a Google Play gift card from the store."
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(text)
        assert unusual_detected is True
        assert payment_type == "gift card"
        assert any("google play" in p for p in phrases)
    
    def test_bitcoin_detection(self):
        """Test detection of Bitcoin/cryptocurrency."""
        text = "You can pay with Bitcoin to this wallet address."
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(text)
        assert unusual_detected is True
        assert payment_type == "cryptocurrency"
        assert "bitcoin" in phrases
    
    def test_cryptocurrency_detection(self):
        """Test detection of generic cryptocurrency mention."""
        text = "We accept cryptocurrency payments for faster processing."
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(text)
        assert unusual_detected is True
        assert payment_type == "cryptocurrency"
        assert any("crypto" in p for p in phrases)
    
    def test_western_union_detection(self):
        """Test detection of Western Union wire transfer."""
        text = "Send the money via Western Union to this location."
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(text)
        assert unusual_detected is True
        assert payment_type == "wire transfer"
        assert "western union" in phrases
    
    def test_wire_transfer_detection(self):
        """Test detection of wire transfer."""
        text = "Please wire the funds to this account immediately."
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(text)
        assert unusual_detected is True
        assert payment_type == "wire transfer"
        assert any("wire" in p for p in phrases)
    
    def test_cash_payment_detection(self):
        """Test detection of cash payment request."""
        text = "You need to send cash to this address."
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(text)
        assert unusual_detected is True
        assert payment_type == "cash"
        assert any("cash" in p for p in phrases)
    
    def test_money_order_detection(self):
        """Test detection of money order request."""
        text = "Please mail a money order to our office."
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(text)
        assert unusual_detected is True
        assert payment_type == "money order"
        assert "money order" in phrases
    
    def test_multiple_unusual_methods(self):
        """Test detection of multiple unusual payment methods."""
        text = "You can pay with gift cards, Bitcoin, or wire transfer."
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(text)
        assert unusual_detected is True
        assert payment_type is not None  # Should detect at least one
        assert len(phrases) >= 2
    
    def test_case_insensitive_detection(self):
        """Test that detection is case-insensitive."""
        text = "Buy a GIFT CARD or send BITCOIN payment."
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(text)
        assert unusual_detected is True
    
    def test_empty_text(self):
        """Test handling of empty text."""
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods("")
        assert unusual_detected is False
        assert payment_type is None
        assert len(phrases) == 0
    
    def test_none_text(self):
        """Test handling of None text."""
        unusual_detected, payment_type, phrases = detect_unusual_payment_methods(None)
        assert unusual_detected is False
        assert payment_type is None
        assert len(phrases) == 0


class TestIntegrationScenarios:
    """Test realistic scam scenarios combining multiple indicators."""
    
    def test_irs_scam_scenario(self):
        """Test detection in realistic IRS scam scenario."""
        text = """
        This is the IRS calling about your unpaid taxes. You owe $5000 and must
        pay immediately or you will be arrested. Please purchase iTunes gift cards
        and provide the codes to settle this debt. Act now before legal action is taken.
        """
        
        urgency_detected, urgency_phrases = detect_urgency_indicators(text)
        financial_detected, financial_phrases = detect_financial_demands(text)
        unusual_detected, payment_type, payment_phrases = detect_unusual_payment_methods(text)
        
        assert urgency_detected is True
        assert financial_detected is True
        assert unusual_detected is True
        assert payment_type == "gift card"
    
    def test_tech_support_scam_scenario(self):
        """Test detection in realistic tech support scam scenario."""
        text = """
        Your computer has been infected with a virus. You need to act immediately
        to prevent data loss. Please provide your credit card information to purchase
        our security software. Wire transfer the payment for faster processing.
        """
        
        urgency_detected, urgency_phrases = detect_urgency_indicators(text)
        financial_detected, financial_phrases = detect_financial_demands(text)
        unusual_detected, payment_type, payment_phrases = detect_unusual_payment_methods(text)
        
        assert urgency_detected is True
        assert financial_detected is True
        assert unusual_detected is True
    
    def test_legitimate_call_scenario(self):
        """Test that legitimate calls don't trigger false positives."""
        text = """
        Hello, I'm calling from your bank to inform you about our new services.
        If you're interested, you can visit our website or come to a branch.
        Have a great day!
        """
        
        urgency_detected, urgency_phrases = detect_urgency_indicators(text)
        financial_detected, financial_phrases = detect_financial_demands(text)
        unusual_detected, payment_type, payment_phrases = detect_unusual_payment_methods(text)
        
        # Legitimate calls should have minimal or no fraud indicators
        assert urgency_detected is False
        assert financial_detected is False
        assert unusual_detected is False



class TestDetectEscalation:
    """Test escalation detection across conversation segments."""
    
    def test_no_escalation_with_single_segment(self):
        """Test that single segment returns no escalation."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Hello", 20, ThreatLevel.SAFE)
        ]
        escalation_detected, escalation_rate = detect_escalation(segments)
        assert escalation_detected is False
        assert escalation_rate == 0.0
    
    def test_no_escalation_with_empty_list(self):
        """Test that empty segment list returns no escalation."""
        escalation_detected, escalation_rate = detect_escalation([])
        assert escalation_detected is False
        assert escalation_rate == 0.0
    
    def test_clear_escalation_pattern(self):
        """Test detection of clear escalation (scores increasing)."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Hello", 20, ThreatLevel.SAFE),
            ConversationSegment("seg2", 2000.0, "Payment", 40, ThreatLevel.CAUTION),
            ConversationSegment("seg3", 3000.0, "Urgent", 70, ThreatLevel.DANGER),
        ]
        escalation_detected, escalation_rate = detect_escalation(segments)
        assert escalation_detected is True
        assert escalation_rate == 1.0  # All transitions are increasing
    
    def test_partial_escalation(self):
        """Test detection of partial escalation (some increases)."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Hello", 20, ThreatLevel.SAFE),
            ConversationSegment("seg2", 2000.0, "Info", 25, ThreatLevel.SAFE),
            ConversationSegment("seg3", 3000.0, "Payment", 50, ThreatLevel.CAUTION),
            ConversationSegment("seg4", 4000.0, "Urgent", 75, ThreatLevel.DANGER),
        ]
        escalation_detected, escalation_rate = detect_escalation(segments)
        assert escalation_detected is True
        assert escalation_rate == 1.0  # All transitions increasing
    
    def test_no_escalation_flat_scores(self):
        """Test no escalation when scores remain flat."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Hello", 30, ThreatLevel.SAFE),
            ConversationSegment("seg2", 2000.0, "Info", 30, ThreatLevel.SAFE),
            ConversationSegment("seg3", 3000.0, "More", 30, ThreatLevel.SAFE),
        ]
        escalation_detected, escalation_rate = detect_escalation(segments)
        assert escalation_detected is False
        assert escalation_rate == 0.0
    
    def test_no_escalation_decreasing_scores(self):
        """Test no escalation when scores are decreasing."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Urgent", 70, ThreatLevel.DANGER),
            ConversationSegment("seg2", 2000.0, "Calm", 40, ThreatLevel.CAUTION),
            ConversationSegment("seg3", 3000.0, "Normal", 20, ThreatLevel.SAFE),
        ]
        escalation_detected, escalation_rate = detect_escalation(segments)
        assert escalation_detected is False
        assert escalation_rate == 0.0
    
    def test_escalation_requires_significant_increase(self):
        """Test that escalation requires at least 20 point increase."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Hello", 30, ThreatLevel.SAFE),
            ConversationSegment("seg2", 2000.0, "Info", 35, ThreatLevel.CAUTION),
            ConversationSegment("seg3", 3000.0, "More", 40, ThreatLevel.CAUTION),
        ]
        escalation_detected, escalation_rate = detect_escalation(segments)
        # All transitions increasing but total increase < 20
        assert escalation_detected is False
    
    def test_mixed_pattern_with_escalation(self):
        """Test escalation detection with mixed up/down pattern."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Hello", 20, ThreatLevel.SAFE),
            ConversationSegment("seg2", 2000.0, "Info", 30, ThreatLevel.SAFE),
            ConversationSegment("seg3", 3000.0, "Drop", 25, ThreatLevel.SAFE),
            ConversationSegment("seg4", 4000.0, "Rise", 50, ThreatLevel.CAUTION),
        ]
        escalation_detected, escalation_rate = detect_escalation(segments)
        # 2 out of 3 transitions are increasing (66%)
        assert escalation_rate > 0.5


class TestDetectInconsistencies:
    """Test inconsistency detection across conversation segments."""
    
    def test_no_inconsistencies_with_single_segment(self):
        """Test that single segment returns no inconsistencies."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Hello from the bank", 20, ThreatLevel.SAFE)
        ]
        inconsistencies_detected, descriptions = detect_inconsistencies(segments)
        assert inconsistencies_detected is False
        assert len(descriptions) == 0
    
    def test_no_inconsistencies_with_empty_list(self):
        """Test that empty segment list returns no inconsistencies."""
        inconsistencies_detected, descriptions = detect_inconsistencies([])
        assert inconsistencies_detected is False
        assert len(descriptions) == 0
    
    def test_multiple_identity_claims(self):
        """Test detection of caller claiming multiple identities."""
        segments = [
            ConversationSegment("seg1", 1000.0, "This is the IRS calling", 40, ThreatLevel.CAUTION),
            ConversationSegment("seg2", 2000.0, "I'm from your bank", 50, ThreatLevel.CAUTION),
        ]
        inconsistencies_detected, descriptions = detect_inconsistencies(segments)
        assert inconsistencies_detected is True
        assert any("multiple identities" in d.lower() for d in descriptions)
    
    def test_multiple_amounts_mentioned(self):
        """Test detection of multiple different amounts."""
        segments = [
            ConversationSegment("seg1", 1000.0, "You owe $500", 40, ThreatLevel.CAUTION),
            ConversationSegment("seg2", 2000.0, "The amount is $1000", 50, ThreatLevel.CAUTION),
            ConversationSegment("seg3", 3000.0, "Actually it's $2000", 60, ThreatLevel.CAUTION),
        ]
        inconsistencies_detected, descriptions = detect_inconsistencies(segments)
        assert inconsistencies_detected is True
        assert any("amounts" in d.lower() for d in descriptions)
    
    def test_urgency_contradiction(self):
        """Test detection of 'no rush' followed by urgency."""
        segments = [
            ConversationSegment("seg1", 1000.0, "No rush, take your time", 10, ThreatLevel.SAFE),
            ConversationSegment("seg2", 2000.0, "Actually, you must act now immediately!", 70, ThreatLevel.DANGER),
        ]
        inconsistencies_detected, descriptions = detect_inconsistencies(segments)
        assert inconsistencies_detected is True
        assert any("no rush" in d.lower() and "pressure" in d.lower() for d in descriptions)
    
    def test_threat_level_manipulation(self):
        """Test detection of threat level dropping then spiking."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Urgent payment", 50, ThreatLevel.CAUTION),
            ConversationSegment("seg2", 2000.0, "Just checking in", 20, ThreatLevel.SAFE),
            ConversationSegment("seg3", 3000.0, "Pay now or arrested!", 80, ThreatLevel.DANGER),
        ]
        inconsistencies_detected, descriptions = detect_inconsistencies(segments)
        assert inconsistencies_detected is True
        assert any("threat level" in d.lower() for d in descriptions)
    
    def test_consistent_conversation_no_inconsistencies(self):
        """Test that consistent conversation has no inconsistencies."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Hello from the bank", 10, ThreatLevel.SAFE),
            ConversationSegment("seg2", 2000.0, "We have new services", 10, ThreatLevel.SAFE),
            ConversationSegment("seg3", 3000.0, "Visit our website", 10, ThreatLevel.SAFE),
        ]
        inconsistencies_detected, descriptions = detect_inconsistencies(segments)
        assert inconsistencies_detected is False
        assert len(descriptions) == 0


class TestCalculateCumulativeFraudScore:
    """Test cumulative fraud score calculation."""
    
    def test_single_segment_returns_same_score(self):
        """Test that single segment returns its own fraud score."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Hello", 50, ThreatLevel.CAUTION)
        ]
        cumulative_score = calculate_cumulative_fraud_score(segments)
        assert cumulative_score == 50
    
    def test_empty_list_returns_zero(self):
        """Test that empty segment list returns 0."""
        cumulative_score = calculate_cumulative_fraud_score([])
        assert cumulative_score == 0
    
    def test_recency_bias_weights_recent_segments(self):
        """Test that more recent segments have higher weight."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Old", 20, ThreatLevel.SAFE),
            ConversationSegment("seg2", 2000.0, "Recent", 80, ThreatLevel.DANGER),
        ]
        cumulative_score = calculate_cumulative_fraud_score(segments)
        # Recent segment (80) should pull score higher than simple average (50)
        assert cumulative_score > 50
    
    def test_escalation_bonus_applied(self):
        """Test that escalation pattern adds bonus points."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Start", 20, ThreatLevel.SAFE),
            ConversationSegment("seg2", 2000.0, "Middle", 40, ThreatLevel.CAUTION),
            ConversationSegment("seg3", 3000.0, "End", 70, ThreatLevel.DANGER),
        ]
        cumulative_score = calculate_cumulative_fraud_score(segments)
        # Should be higher than weighted average due to escalation bonus
        assert cumulative_score >= 60
    
    def test_consistency_bonus_for_sustained_high_scores(self):
        """Test that sustained high scores add consistency bonus."""
        segments = [
            ConversationSegment("seg1", 1000.0, "High1", 70, ThreatLevel.DANGER),
            ConversationSegment("seg2", 2000.0, "High2", 75, ThreatLevel.DANGER),
            ConversationSegment("seg3", 3000.0, "High3", 80, ThreatLevel.DANGER),
        ]
        cumulative_score = calculate_cumulative_fraud_score(segments)
        # Should be high with consistency bonus
        assert cumulative_score >= 80
    
    def test_inconsistency_penalty_applied(self):
        """Test that detected inconsistencies add penalty points."""
        segments = [
            ConversationSegment("seg1", 1000.0, "IRS calling", 40, ThreatLevel.CAUTION),
            ConversationSegment("seg2", 2000.0, "Bank calling", 40, ThreatLevel.CAUTION),
        ]
        cumulative_score = calculate_cumulative_fraud_score(segments)
        # Should be higher than base due to inconsistency penalty
        assert cumulative_score >= 40
    
    def test_score_clamped_to_100(self):
        """Test that cumulative score never exceeds 100."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Max1", 100, ThreatLevel.DANGER),
            ConversationSegment("seg2", 2000.0, "Max2", 100, ThreatLevel.DANGER),
            ConversationSegment("seg3", 3000.0, "Max3", 100, ThreatLevel.DANGER),
        ]
        cumulative_score = calculate_cumulative_fraud_score(segments)
        assert cumulative_score <= 100
    
    def test_score_clamped_to_zero(self):
        """Test that cumulative score never goes below 0."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Safe1", 0, ThreatLevel.SAFE),
            ConversationSegment("seg2", 2000.0, "Safe2", 0, ThreatLevel.SAFE),
        ]
        cumulative_score = calculate_cumulative_fraud_score(segments)
        assert cumulative_score >= 0
    
    def test_realistic_escalating_scam_scenario(self):
        """Test cumulative score for realistic escalating scam."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Hello, this is the IRS", 30, ThreatLevel.SAFE),
            ConversationSegment("seg2", 2000.0, "You owe taxes", 45, ThreatLevel.CAUTION),
            ConversationSegment("seg3", 3000.0, "Pay now with gift cards", 65, ThreatLevel.DANGER),
            ConversationSegment("seg4", 4000.0, "Act immediately or be arrested", 85, ThreatLevel.DANGER),
        ]
        cumulative_score = calculate_cumulative_fraud_score(segments)
        # Should be very high due to escalation, high recent scores, and consistency
        assert cumulative_score >= 75


class TestMultiSegmentIntegrationScenarios:
    """Test realistic multi-segment scam scenarios."""
    
    def test_gradual_irs_scam_escalation(self):
        """Test detection of gradual IRS scam escalation."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Hello, IRS calling about your taxes", 35, ThreatLevel.CAUTION),
            ConversationSegment("seg2", 2000.0, "You owe $5000 in back taxes", 50, ThreatLevel.CAUTION),
            ConversationSegment("seg3", 3000.0, "You must pay immediately with gift cards", 75, ThreatLevel.DANGER),
            ConversationSegment("seg4", 4000.0, "Act now or you will be arrested", 90, ThreatLevel.DANGER),
        ]
        
        escalation_detected, escalation_rate = detect_escalation(segments)
        cumulative_score = calculate_cumulative_fraud_score(segments)
        
        assert escalation_detected is True
        assert escalation_rate >= 0.5
        assert cumulative_score >= 80
    
    def test_identity_switching_scam(self):
        """Test detection of scammer switching identities."""
        segments = [
            ConversationSegment("seg1", 1000.0, "This is your bank calling", 40, ThreatLevel.CAUTION),
            ConversationSegment("seg2", 2000.0, "Actually, I'm from the IRS", 50, ThreatLevel.CAUTION),
            ConversationSegment("seg3", 3000.0, "I mean, tech support here", 55, ThreatLevel.CAUTION),
        ]
        
        inconsistencies_detected, descriptions = detect_inconsistencies(segments)
        
        assert inconsistencies_detected is True
        assert any("multiple identities" in d.lower() for d in descriptions)
    
    def test_legitimate_multi_segment_conversation(self):
        """Test that legitimate multi-segment conversation scores low."""
        segments = [
            ConversationSegment("seg1", 1000.0, "Hello, calling from your bank", 15, ThreatLevel.SAFE),
            ConversationSegment("seg2", 2000.0, "We have new services available", 10, ThreatLevel.SAFE),
            ConversationSegment("seg3", 3000.0, "Visit our website for details", 10, ThreatLevel.SAFE),
            ConversationSegment("seg4", 4000.0, "Have a great day", 5, ThreatLevel.SAFE),
        ]
        
        escalation_detected, _ = detect_escalation(segments)
        inconsistencies_detected, _ = detect_inconsistencies(segments)
        cumulative_score = calculate_cumulative_fraud_score(segments)
        
        assert escalation_detected is False
        assert inconsistencies_detected is False
        assert cumulative_score <= 30
