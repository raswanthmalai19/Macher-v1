"""
Data models for AI-Powered Fraud Detection.

This module contains all data classes used throughout the fraud detection system,
including analysis results, conversation context, scam patterns, and error responses.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Dict, Any


class ThreatLevel(Enum):
    """Threat level classification for fraud analysis."""
    SAFE = "Safe"  # Fraud score 0-30
    CAUTION = "Caution"  # Fraud score 31-60
    DANGER = "Danger"  # Fraud score 61-100


@dataclass
class ScamPattern:
    """Detected scam pattern from Knowledge Base."""
    
    pattern_id: str
    pattern_type: str  # e.g., "IRS Scam", "Tech Support Scam"
    description: str
    confidence: float  # 0.0-1.0
    matched_indicators: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "pattern_id": self.pattern_id,
            "pattern_type": self.pattern_type,
            "description": self.description,
            "confidence": self.confidence,
            "matched_indicators": self.matched_indicators
        }


@dataclass
class ConversationSegment:
    """Single segment of a conversation."""
    
    segment_id: str
    timestamp: float
    transcript_text: str  # Redacted
    fraud_score: int
    threat_level: ThreatLevel
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "segment_id": self.segment_id,
            "timestamp": self.timestamp,
            "transcript_text": self.transcript_text,
            "fraud_score": self.fraud_score,
            "threat_level": self.threat_level.value
        }


@dataclass
class ConversationContext:
    """Context for an ongoing conversation."""
    
    call_id: str
    segments: List[ConversationSegment] = field(default_factory=list)
    cumulative_fraud_score: int = 0
    detected_patterns: List[ScamPattern] = field(default_factory=list)
    language: str = "en"
    
    def get_context_summary(self) -> str:
        """Generate summary of conversation for agent context."""
        if not self.segments:
            return "No previous conversation history."
        
        summary_parts = [
            f"Conversation history ({len(self.segments)} segments):",
            f"Cumulative fraud score: {self.cumulative_fraud_score}"
        ]
        
        if self.detected_patterns:
            pattern_types = [p.pattern_type for p in self.detected_patterns]
            summary_parts.append(f"Detected patterns: {', '.join(pattern_types)}")
        
        # Include last 3 segments for context
        recent_segments = self.segments[-3:]
        for seg in recent_segments:
            summary_parts.append(
                f"- Segment {seg.segment_id}: \"{seg.transcript_text[:100]}...\" "
                f"(Score: {seg.fraud_score}, Level: {seg.threat_level.value})"
            )
        
        return "\n".join(summary_parts)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "call_id": self.call_id,
            "segments": [seg.to_dict() for seg in self.segments],
            "cumulative_fraud_score": self.cumulative_fraud_score,
            "detected_patterns": [p.to_dict() for p in self.detected_patterns],
            "language": self.language
        }


@dataclass
class AnalysisResult:
    """Result of fraud analysis for a transcript segment."""
    
    call_id: str
    segment_id: str
    timestamp: float
    fraud_score: int  # 0-100
    confidence_score: int  # 0-100
    threat_level: ThreatLevel
    detected_patterns: List[ScamPattern] = field(default_factory=list)
    urgency_detected: bool = False
    financial_demand_detected: bool = False
    financial_demand_type: Optional[str] = None  # e.g., "gift card", "wire transfer"
    explanation: str = ""
    language: str = "en"
    processing_time_ms: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "call_id": self.call_id,
            "segment_id": self.segment_id,
            "timestamp": self.timestamp,
            "fraud_score": self.fraud_score,
            "confidence_score": self.confidence_score,
            "threat_level": self.threat_level.value,
            "detected_patterns": [p.to_dict() for p in self.detected_patterns],
            "urgency_detected": self.urgency_detected,
            "financial_demand_detected": self.financial_demand_detected,
            "financial_demand_type": self.financial_demand_type,
            "explanation": self.explanation,
            "language": self.language,
            "processing_time_ms": self.processing_time_ms
        }


@dataclass
class RedactionResult:
    """Result of PII redaction."""
    
    redacted_text: str
    detected_pii_types: List[str] = field(default_factory=list)  # e.g., ["NAME", "PHONE", "SSN"]
    redaction_count: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "redacted_text": self.redacted_text,
            "detected_pii_types": self.detected_pii_types,
            "redaction_count": self.redaction_count
        }


@dataclass
class AgentResponse:
    """Raw response from Bedrock Agent."""
    
    response_text: str
    session_id: str
    trace: Dict[str, Any] = field(default_factory=dict)
    
    def extract_fraud_score(self) -> int:
        """Extract fraud score from response text."""
        # Parse fraud score from agent response
        # Expected format: "Fraud Score: 85" or similar
        import re
        match = re.search(r'fraud[_\s]score[:\s]+(\d+)', self.response_text, re.IGNORECASE)
        if match:
            score = int(match.group(1))
            return max(0, min(100, score))  # Clamp to 0-100
        return 0
    
    def extract_confidence_score(self) -> int:
        """Extract confidence score from response text."""
        import re
        match = re.search(r'confidence[_\s]score[:\s]+(\d+)', self.response_text, re.IGNORECASE)
        if match:
            score = int(match.group(1))
            return max(0, min(100, score))  # Clamp to 0-100
        return 50  # Default moderate confidence
    
    def extract_patterns(self) -> List[ScamPattern]:
        """Extract detected patterns from response text."""
        # Parse detected patterns from agent response
        # This is a simplified implementation - actual parsing would be more sophisticated
        patterns = []
        pattern_types = ["IRS Scam", "Tech Support Scam", "Grandparent Scam", 
                        "Lottery Scam", "Romance Scam", "Phishing"]
        
        for pattern_type in pattern_types:
            if pattern_type.lower() in self.response_text.lower():
                patterns.append(ScamPattern(
                    pattern_id=f"{pattern_type.lower().replace(' ', '-')}-001",
                    pattern_type=pattern_type,
                    description=f"Detected {pattern_type} indicators",
                    confidence=0.8,
                    matched_indicators=[]
                ))
        
        return patterns
    
    def extract_explanation(self) -> str:
        """Extract explanation from response text."""
        # Look for explanation section in response
        import re
        match = re.search(r'explanation[:\s]+(.*?)(?:\n\n|$)', self.response_text, 
                         re.IGNORECASE | re.DOTALL)
        if match:
            return match.group(1).strip()
        
        # If no explicit explanation section, return first paragraph
        paragraphs = self.response_text.split('\n\n')
        return paragraphs[0] if paragraphs else self.response_text[:200]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "response_text": self.response_text,
            "session_id": self.session_id,
            "trace": self.trace
        }


@dataclass
class ErrorResponse:
    """Error response for failed analysis."""
    
    error_code: str
    error_message: str
    call_id: str
    segment_id: str
    timestamp: float
    retry_possible: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "error_code": self.error_code,
            "error_message": self.error_message,
            "call_id": self.call_id,
            "segment_id": self.segment_id,
            "timestamp": self.timestamp,
            "retry_possible": self.retry_possible
        }


# Custom exceptions for fraud detection system

class FraudDetectionError(Exception):
    """Base exception for fraud detection errors."""
    pass


class UnsupportedLanguageError(FraudDetectionError):
    """Raised when transcript language is not supported."""
    pass


class GuardrailsError(FraudDetectionError):
    """Raised when PII redaction fails."""
    pass


class BedrockAgentError(FraudDetectionError):
    """Raised when Bedrock Agent invocation fails."""
    pass


class ContextStoreError(FraudDetectionError):
    """Raised when context storage operations fail."""
    pass


class NotificationError(FraudDetectionError):
    """Raised when notification triggering fails."""
    pass
