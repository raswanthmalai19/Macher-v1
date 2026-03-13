"""
Explanation Generation Functions

This module provides functions for generating human-readable explanations
of fraud analysis results for non-technical users.

Requirements: 12.1, 12.2, 12.3, 12.4
"""

from typing import List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .models import AnalysisResult, ScamPattern


def generate_explanation(
    fraud_score: int,
    detected_patterns: List['ScamPattern'],
    urgency_detected: bool,
    urgency_phrases: List[str],
    financial_demand_detected: bool,
    financial_phrases: List[str],
    financial_demand_type: Optional[str],
    transcript_text: str,
    language: str = "en"
) -> str:
    """
    Generate human-readable explanation of fraud analysis.
    
    Creates a clear, non-technical explanation that:
    - Describes the threat level and what it means
    - Lists detected scam patterns
    - Highlights urgency indicators with transcript citations
    - Highlights financial demands with transcript citations
    - Provides actionable guidance
    
    Args:
        fraud_score: Fraud score (0-100)
        detected_patterns: List of detected scam patterns
        urgency_detected: Whether urgency indicators were found
        urgency_phrases: List of urgency phrases detected
        financial_demand_detected: Whether financial demands were found
        financial_phrases: List of financial demand phrases detected
        financial_demand_type: Type of payment method requested
        transcript_text: Original transcript text for citations
        language: Language code for localization
        
    Returns:
        Human-readable explanation string
        
    Requirements: 12.1, 12.2, 12.3, 12.4
    """
    if not transcript_text:
        return "Unable to generate explanation: no transcript provided."
    
    explanation_parts = []
    
    # 1. Threat level assessment
    if fraud_score <= 30:
        explanation_parts.append(
            "This call appears to be safe. No significant fraud indicators were detected."
        )
    elif fraud_score <= 60:
        explanation_parts.append(
            "⚠️ CAUTION: This call shows some warning signs that require attention."
        )
    else:
        explanation_parts.append(
            "🚨 DANGER: This call shows strong indicators of a scam attempt. "
            "Exercise extreme caution."
        )
    
    # 2. Detected scam patterns
    if detected_patterns:
        explanation_parts.append("\n**Detected Scam Patterns:**")
        for pattern in detected_patterns:
            confidence_pct = int(pattern.confidence * 100)
            explanation_parts.append(
                f"- {pattern.pattern_type} ({confidence_pct}% confidence): "
                f"{pattern.description}"
            )
            
            if pattern.matched_indicators:
                explanation_parts.append(
                    f"  Indicators: {', '.join(pattern.matched_indicators[:3])}"
                )
    
    # 3. Urgency indicators with citations
    if urgency_detected and urgency_phrases:
        explanation_parts.append("\n**Pressure Tactics Detected:**")
        explanation_parts.append(
            "The caller is using urgency and pressure tactics to rush you into making "
            "a decision. This is a common scam technique."
        )
        
        # Cite specific phrases from transcript
        for phrase in urgency_phrases[:3]:  # Limit to top 3
            citation = _find_citation(transcript_text, phrase)
            if citation:
                explanation_parts.append(f'- "{citation}"')
    
    # 4. Financial demands with citations
    if financial_demand_detected and financial_phrases:
        explanation_parts.append("\n**Financial Requests Detected:**")
        
        if financial_demand_type:
            explanation_parts.append(
                f"The caller is requesting payment via {financial_demand_type}. "
            )
            
            # Add specific warnings for unusual payment methods
            if financial_demand_type in ["gift card", "cryptocurrency", "wire transfer"]:
                explanation_parts.append(
                    "⚠️ WARNING: Legitimate organizations rarely request payment via "
                    f"{financial_demand_type}. This is a major red flag."
                )
        else:
            explanation_parts.append(
                "The caller is requesting financial information or payment."
            )
        
        # Cite specific phrases from transcript
        for phrase in financial_phrases[:3]:  # Limit to top 3
            citation = _find_citation(transcript_text, phrase)
            if citation:
                explanation_parts.append(f'- "{citation}"')
    
    # 5. Actionable guidance
    if fraud_score > 30:
        explanation_parts.append("\n**Recommended Actions:**")
        
        if fraud_score > 60:
            explanation_parts.append(
                "- Hang up immediately and do not provide any information"
            )
            explanation_parts.append(
                "- Do not call back any numbers provided by the caller"
            )
            explanation_parts.append(
                "- Contact the organization directly using official contact information"
            )
            explanation_parts.append(
                "- Report this call to the FTC at reportfraud.ftc.gov"
            )
        else:
            explanation_parts.append(
                "- Be cautious and verify the caller's identity independently"
            )
            explanation_parts.append(
                "- Do not provide sensitive information until you confirm legitimacy"
            )
            explanation_parts.append(
                "- Contact the organization directly using official contact information"
            )
    
    return "\n".join(explanation_parts)


def _find_citation(transcript: str, phrase: str, context_words: int = 5) -> Optional[str]:
    """
    Find a phrase in transcript and return it with surrounding context.
    
    Args:
        transcript: Full transcript text
        phrase: Phrase to find
        context_words: Number of words to include before/after phrase
        
    Returns:
        Citation string with context, or None if phrase not found
    """
    if not transcript or not phrase:
        return None
    
    # Case-insensitive search
    transcript_lower = transcript.lower()
    phrase_lower = phrase.lower()
    
    # Find phrase position
    pos = transcript_lower.find(phrase_lower)
    if pos == -1:
        return None
    
    # Split transcript into words
    words = transcript.split()
    
    # Find word index containing the phrase
    current_pos = 0
    phrase_word_idx = -1
    
    for idx, word in enumerate(words):
        word_start = current_pos
        word_end = current_pos + len(word)
        
        if word_start <= pos < word_end:
            phrase_word_idx = idx
            break
        
        current_pos = word_end + 1  # +1 for space
    
    if phrase_word_idx == -1:
        # Fallback: just return the phrase itself
        return phrase
    
    # Extract context window
    start_idx = max(0, phrase_word_idx - context_words)
    end_idx = min(len(words), phrase_word_idx + context_words + 1)
    
    context_words_list = words[start_idx:end_idx]
    citation = " ".join(context_words_list)
    
    # Add ellipsis if truncated
    if start_idx > 0:
        citation = "..." + citation
    if end_idx < len(words):
        citation = citation + "..."
    
    return citation


def format_explanation_for_notification(explanation: str, max_length: int = 500) -> str:
    """
    Format explanation for notification display (shortened version).
    
    Args:
        explanation: Full explanation text
        max_length: Maximum length for notification
        
    Returns:
        Shortened explanation suitable for notifications
    """
    if len(explanation) <= max_length:
        return explanation
    
    # Extract first paragraph (threat assessment)
    lines = explanation.split('\n')
    first_para = lines[0] if lines else explanation
    
    # Add truncation indicator
    if len(first_para) > max_length:
        first_para = first_para[:max_length - 3] + "..."
    
    return first_para


def generate_summary_explanation(
    fraud_score: int,
    detected_patterns: List['ScamPattern'],
    urgency_detected: bool,
    financial_demand_detected: bool
) -> str:
    """
    Generate brief summary explanation (one sentence).
    
    Args:
        fraud_score: Fraud score (0-100)
        detected_patterns: List of detected scam patterns
        urgency_detected: Whether urgency indicators were found
        financial_demand_detected: Whether financial demands were found
        
    Returns:
        One-sentence summary explanation
    """
    if fraud_score <= 30:
        return "No significant fraud indicators detected."
    
    indicators = []
    
    if detected_patterns:
        pattern_types = [p.pattern_type for p in detected_patterns[:2]]
        indicators.append(f"matches {' and '.join(pattern_types)}")
    
    if urgency_detected:
        indicators.append("uses pressure tactics")
    
    if financial_demand_detected:
        indicators.append("requests payment")
    
    if not indicators:
        return "Some suspicious activity detected."
    
    return f"Warning: Call {', '.join(indicators)}."
