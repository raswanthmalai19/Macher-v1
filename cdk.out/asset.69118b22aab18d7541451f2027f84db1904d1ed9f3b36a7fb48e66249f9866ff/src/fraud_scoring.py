"""
Fraud Scoring Helper Functions

This module provides helper functions for fraud detection scoring, including
threat level calculation, urgency detection, financial demand detection, and
unusual payment method identification.

Requirements: 5.1, 5.2, 5.3, 5.4, 8.1, 9.1, 9.5
"""

import re
from typing import Tuple, List, Optional, TYPE_CHECKING

from .models import ThreatLevel

if TYPE_CHECKING:
    from .models import ConversationSegment


# Urgency indicator patterns
URGENCY_PATTERNS = [
    # Time pressure
    r'\b(act now|right now|immediately|urgent|asap|as soon as possible)\b',
    r'\b(limited time|time[- ]limited|expires? (soon|today|tonight))\b',
    r'\b(hurry|quick(ly)?|fast|don\'t wait|can\'t wait)\b',
    r'\b(before it\'s too late|last chance|final (notice|warning))\b',
    
    # Threats
    r'\b(will be (arrested|suspended|closed|terminated|cancelled))\b',
    r'\b(legal action|lawsuit|court|warrant|police)\b',
    r'\b(lose (access|account|money|benefits))\b',
    r'\b(account (will be|has been) (suspended|closed|locked))\b',
    
    # Pressure tactics
    r'\b(must (act|respond|pay|call) (now|immediately|today))\b',
    r'\b(need (to|you to) (act|respond|pay|call) (now|immediately|today))\b',
    r'\b(have to (act|respond|pay|call) (now|immediately|today))\b',
]

# Financial demand patterns
FINANCIAL_DEMAND_PATTERNS = [
    # Direct payment requests
    r'\b(pay|payment|send (money|payment|funds))\b',
    r'\b(credit card|debit card|card number)\b',
    r'\b(bank account|routing number|account number)\b',
    r'\b(wire transfer|money transfer|western union|moneygram)\b',
    r'\b(social security number|ssn|tax id)\b',
    
    # Indirect requests
    r'\b(verify (your|the) (account|card|payment))\b',
    r'\b(confirm (your|the) (account|card|payment|information))\b',
    r'\b(update (your|the) (account|card|payment|information))\b',
    r'\b(provide (your|the) (account|card|payment|information))\b',
    
    # Financial information
    r'\b(cvv|security code|pin|password)\b',
    r'\b(expiration date|exp date)\b',
    r'\b(billing address|zip code for card)\b',
]

# Unusual payment method patterns
UNUSUAL_PAYMENT_PATTERNS = {
    "gift card": [
        r'\b(gift card|giftcard|prepaid card)\b',
        r'\b(itunes|google play|amazon|steam|target|walmart) (card|gift)\b',
        r'\b(buy (a )?gift card)\b',
    ],
    "cryptocurrency": [
        r'\b(bitcoin|btc|ethereum|eth|crypto(currency)?)\b',
        r'\b(digital currency|virtual currency)\b',
        r'\b(crypto wallet|bitcoin wallet)\b',
    ],
    "wire transfer": [
        r'\b(wire (transfer|money|funds|the funds))\b',
        r'\b(western union|moneygram|money transfer)\b',
        r'\b(send (money|funds) (via|through|by) wire)\b',
    ],
    "cash": [
        r'\b(cash (only|payment))\b',
        r'\b(send cash|mail cash)\b',
        r'\b(pay (in|with) cash)\b',
    ],
    "money order": [
        r'\b(money order|cashier\'?s check)\b',
        r'\b(certified check)\b',
    ],
}


def calculate_threat_level(fraud_score: int) -> ThreatLevel:
    """
    Calculate threat level based on fraud score.
    
    Maps fraud scores to threat levels according to the design specification:
    - Safe: 0-30
    - Caution: 31-60
    - Danger: 61-100
    
    Args:
        fraud_score: Fraud score between 0 and 100
        
    Returns:
        ThreatLevel enum value (SAFE, CAUTION, or DANGER)
        
    Raises:
        ValueError: If fraud_score is not between 0 and 100
        
    Requirements: 5.1, 5.2, 5.3, 5.4
    """
    if not isinstance(fraud_score, int):
        raise ValueError(f"fraud_score must be an integer, got {type(fraud_score)}")
    
    if fraud_score < 0 or fraud_score > 100:
        raise ValueError(f"fraud_score must be between 0 and 100, got {fraud_score}")
    
    if fraud_score <= 30:
        return ThreatLevel.SAFE
    elif fraud_score <= 60:
        return ThreatLevel.CAUTION
    else:
        return ThreatLevel.DANGER


def detect_urgency_indicators(text: str) -> Tuple[bool, List[str]]:
    """
    Detect urgency indicators and pressure tactics in text.
    
    Identifies phrases that indicate time pressure, threats, or pressure tactics
    commonly used in scam calls to rush victims into making decisions.
    
    Args:
        text: Text to analyze for urgency indicators
        
    Returns:
        Tuple of (urgency_detected: bool, matched_phrases: List[str])
        - urgency_detected: True if any urgency indicators found
        - matched_phrases: List of specific phrases that matched urgency patterns
        
    Requirements: 8.1, 8.3, 8.4
    """
    if not text:
        return False, []
    
    text_lower = text.lower()
    matched_phrases = []
    
    for pattern in URGENCY_PATTERNS:
        matches = re.finditer(pattern, text_lower, re.IGNORECASE)
        for match in matches:
            phrase = match.group(0)
            if phrase not in matched_phrases:
                matched_phrases.append(phrase)
    
    urgency_detected = len(matched_phrases) > 0
    
    return urgency_detected, matched_phrases


def detect_financial_demands(text: str) -> Tuple[bool, List[str]]:
    """
    Detect requests for payment or financial information in text.
    
    Identifies both direct and indirect requests for financial information,
    including payment requests, account verification, and credential requests.
    
    Args:
        text: Text to analyze for financial demands
        
    Returns:
        Tuple of (financial_demand_detected: bool, matched_phrases: List[str])
        - financial_demand_detected: True if any financial demands found
        - matched_phrases: List of specific phrases that matched financial patterns
        
    Requirements: 9.1, 9.2, 9.3, 9.4
    """
    if not text:
        return False, []
    
    text_lower = text.lower()
    matched_phrases = []
    
    for pattern in FINANCIAL_DEMAND_PATTERNS:
        matches = re.finditer(pattern, text_lower, re.IGNORECASE)
        for match in matches:
            phrase = match.group(0)
            if phrase not in matched_phrases:
                matched_phrases.append(phrase)
    
    financial_demand_detected = len(matched_phrases) > 0
    
    return financial_demand_detected, matched_phrases


def detect_unusual_payment_methods(text: str) -> Tuple[bool, Optional[str], List[str]]:
    """
    Detect unusual payment methods commonly used in scams.
    
    Identifies mentions of payment methods that are red flags for fraud:
    - Gift cards (iTunes, Google Play, Amazon, etc.)
    - Cryptocurrency (Bitcoin, Ethereum, etc.)
    - Wire transfers (Western Union, MoneyGram)
    - Cash payments
    - Money orders
    
    Args:
        text: Text to analyze for unusual payment methods
        
    Returns:
        Tuple of (unusual_detected: bool, payment_type: Optional[str], matched_phrases: List[str])
        - unusual_detected: True if any unusual payment methods found
        - payment_type: Type of unusual payment detected (e.g., "gift card", "cryptocurrency")
        - matched_phrases: List of specific phrases that matched payment patterns
        
    Requirements: 9.5
    """
    if not text:
        return False, None, []
    
    text_lower = text.lower()
    matched_phrases = []
    detected_payment_type = None
    
    for payment_type, patterns in UNUSUAL_PAYMENT_PATTERNS.items():
        for pattern in patterns:
            matches = re.finditer(pattern, text_lower, re.IGNORECASE)
            for match in matches:
                phrase = match.group(0)
                if phrase not in matched_phrases:
                    matched_phrases.append(phrase)
                    # Set payment type to the first detected type
                    if detected_payment_type is None:
                        detected_payment_type = payment_type
    
    unusual_detected = len(matched_phrases) > 0
    
    return unusual_detected, detected_payment_type, matched_phrases


def detect_escalation(segments: List['ConversationSegment']) -> Tuple[bool, float]:
    """
    Detect escalation patterns across multiple conversation segments.
    
    Analyzes fraud scores across segments to identify increasing fraud indicators,
    which is a common tactic in scam calls where the caller gradually increases
    pressure and demands.
    
    Args:
        segments: List of ConversationSegment objects in chronological order
        
    Returns:
        Tuple of (escalation_detected: bool, escalation_rate: float)
        - escalation_detected: True if fraud scores are increasing across segments
        - escalation_rate: Rate of increase (0.0-1.0), where 1.0 means maximum escalation
        
    Requirements: 4.6, 7.3
    """
    if not segments or len(segments) < 2:
        return False, 0.0
    
    # Extract fraud scores in chronological order
    scores = [seg.fraud_score for seg in segments]
    
    # Count increasing transitions
    increasing_count = 0
    total_transitions = len(scores) - 1
    
    for i in range(total_transitions):
        if scores[i + 1] > scores[i]:
            increasing_count += 1
    
    # Calculate escalation rate (percentage of increasing transitions)
    escalation_rate = increasing_count / total_transitions if total_transitions > 0 else 0.0
    
    # Detect escalation if more than 50% of transitions are increasing
    # and the overall trend shows significant increase
    escalation_detected = False
    if escalation_rate >= 0.5:
        # Check if there's a significant overall increase
        score_increase = scores[-1] - scores[0]
        if score_increase >= 20:  # At least 20 point increase
            escalation_detected = True
    
    return escalation_detected, escalation_rate


def detect_inconsistencies(segments: List['ConversationSegment']) -> Tuple[bool, List[str]]:
    """
    Detect inconsistencies and contradictions across conversation segments.
    
    Analyzes transcript text across segments to identify contradictory information,
    which is a red flag for fraud (e.g., caller claims different identities or
    changes their story).
    
    Args:
        segments: List of ConversationSegment objects in chronological order
        
    Returns:
        Tuple of (inconsistencies_detected: bool, inconsistency_descriptions: List[str])
        - inconsistencies_detected: True if contradictions found
        - inconsistency_descriptions: List of detected inconsistencies
        
    Requirements: 7.4
    """
    if not segments or len(segments) < 2:
        return False, []
    
    inconsistencies = []
    
    # Combine all transcript text for analysis
    all_text = " ".join([seg.transcript_text.lower() for seg in segments])
    
    # Check for identity inconsistencies
    identity_patterns = {
        "irs": r'\b(irs|internal revenue service)\b',
        "bank": r'\b(bank|banking|financial institution)\b',
        "tech_support": r'\b(tech(nical)? support|microsoft|apple|google)\b',
        "government": r'\b(government|federal|social security)\b',
        "law_enforcement": r'\b(police|sheriff|fbi|law enforcement)\b',
        "utility": r'\b(electric|gas|water|utility)\b',
    }
    
    claimed_identities = []
    for identity, pattern in identity_patterns.items():
        if re.search(pattern, all_text, re.IGNORECASE):
            claimed_identities.append(identity)
    
    # Multiple claimed identities is suspicious
    if len(claimed_identities) >= 2:
        inconsistencies.append(
            f"Caller claimed multiple identities: {', '.join(claimed_identities)}"
        )
    
    # Check for amount inconsistencies (different amounts mentioned)
    amount_pattern = r'\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)'
    amounts = re.findall(amount_pattern, all_text)
    if amounts:
        # Remove duplicates and check if multiple different amounts mentioned
        unique_amounts = list(set(amounts))
        if len(unique_amounts) >= 3:
            inconsistencies.append(
                f"Multiple different amounts mentioned: {', '.join(['$' + a for a in unique_amounts[:3]])}"
            )
    
    # Check for contradictory urgency (first says no rush, later says urgent)
    no_rush_patterns = [
        r'\b(no (rush|hurry|pressure)|take your time|whenever you can)\b',
    ]
    
    has_no_rush = False
    has_urgency = False
    
    for i, seg in enumerate(segments):
        text_lower = seg.transcript_text.lower()
        
        # Check for "no rush" in early segments
        if i < len(segments) // 2:
            for pattern in no_rush_patterns:
                if re.search(pattern, text_lower):
                    has_no_rush = True
                    break
        
        # Check for urgency in later segments
        if i >= len(segments) // 2:
            urgency_detected, _ = detect_urgency_indicators(seg.transcript_text)
            if urgency_detected:
                has_urgency = True
    
    if has_no_rush and has_urgency:
        inconsistencies.append(
            "Caller initially said no rush but later applied pressure tactics"
        )
    
    # Check for threat level inconsistencies (drops then spikes)
    threat_levels = [seg.threat_level.value for seg in segments]
    if len(threat_levels) >= 3:
        # Look for pattern: high -> low -> high (suspicious)
        for i in range(len(threat_levels) - 2):
            if (threat_levels[i] in ["Caution", "Danger"] and 
                threat_levels[i + 1] == "Safe" and 
                threat_levels[i + 2] in ["Caution", "Danger"]):
                inconsistencies.append(
                    "Threat level dropped then spiked again (manipulation tactic)"
                )
                break
    
    inconsistencies_detected = len(inconsistencies) > 0
    
    return inconsistencies_detected, inconsistencies


def calculate_cumulative_fraud_score(segments: List['ConversationSegment']) -> int:
    """
    Calculate cumulative fraud score across multiple segments.
    
    Combines fraud scores from all segments with weighting that considers:
    - Recent segments more heavily than older ones
    - Escalation patterns
    - Consistency of high scores
    
    Args:
        segments: List of ConversationSegment objects in chronological order
        
    Returns:
        Cumulative fraud score (0-100)
        
    Requirements: 4.6, 7.3
    """
    if not segments:
        return 0
    
    if len(segments) == 1:
        return segments[0].fraud_score
    
    # Extract fraud scores
    scores = [seg.fraud_score for seg in segments]
    
    # Calculate weighted average with recency bias
    # More recent segments get higher weight
    total_weight = 0
    weighted_sum = 0
    
    for i, score in enumerate(scores):
        # Weight increases linearly with recency (most recent = highest weight)
        weight = i + 1  # 1, 2, 3, ... n
        weighted_sum += score * weight
        total_weight += weight
    
    base_score = weighted_sum / total_weight if total_weight > 0 else 0
    
    # Apply escalation bonus
    escalation_detected, escalation_rate = detect_escalation(segments)
    if escalation_detected:
        # Add up to 15 points for strong escalation
        escalation_bonus = int(escalation_rate * 15)
        base_score += escalation_bonus
    
    # Apply consistency bonus for sustained high scores
    high_score_count = sum(1 for score in scores if score >= 60)
    if high_score_count >= len(scores) * 0.5:  # At least half are high scores
        consistency_bonus = 10
        base_score += consistency_bonus
    
    # Apply inconsistency penalty
    inconsistencies_detected, _ = detect_inconsistencies(segments)
    if inconsistencies_detected:
        # Add 10 points for detected inconsistencies (red flag)
        base_score += 10
    
    # Clamp to 0-100 range
    cumulative_score = int(max(0, min(100, base_score)))
    
    return cumulative_score
