"""
Property-based tests for Guardrails Client PII redaction.

These tests verify universal correctness properties of PII detection and redaction
across a wide range of inputs using hypothesis for property-based testing.
"""

import pytest
import re
from hypothesis import given, strategies as st, assume, settings
from unittest.mock import Mock, patch, MagicMock
from src.guardrails_client import GuardrailsClient
from src.models import RedactionResult, GuardrailsError


# Test generators for PII-containing text

PII_PATTERNS = {
    "NAME": [
        "John Smith", "Jane Doe", "Bob Johnson", "Alice Williams", "Michael Brown",
        "Sarah Davis", "David Miller", "Emily Wilson", "James Taylor", "Mary Anderson"
    ],
    "PHONE": [
        "555-1234", "123-456-7890", "(555) 123-4567", "555.123.4567",
        "1-800-555-0123", "+1-555-123-4567", "(800) 555-1234"
    ],
    "SSN": [
        "123-45-6789", "987-65-4321", "111-22-3333", "555-66-7777"
    ],
    "EMAIL": [
        "john.smith@example.com", "jane_doe@test.org", "user123@domain.co.uk",
        "contact@company.com", "support@service.net"
    ],
    "CREDIT_CARD": [
        "4532-1234-5678-9010", "5425-2334-3010-9903", "4111111111111111",
        "5500 0000 0000 0004", "3400 000000 00009"
    ],
    "BANK_ACCOUNT": [
        "123456789012", "987654321098", "111222333444"
    ],
    "ADDRESS": [
        "123 Main Street, Springfield, IL 62701",
        "456 Oak Avenue, Apt 2B, New York, NY 10001",
        "789 Elm Road, Los Angeles, CA 90001"
    ]
}


@st.composite
def text_with_single_pii(draw):
    """Generate text containing exactly one PII instance."""
    pii_type = draw(st.sampled_from(list(PII_PATTERNS.keys())))
    pii_value = draw(st.sampled_from(PII_PATTERNS[pii_type]))
    
    # Generate surrounding text
    prefix = draw(st.text(
        alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'), max_codepoint=127),
        min_size=5,
        max_size=50
    ))
    suffix = draw(st.text(
        alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'), max_codepoint=127),
        min_size=5,
        max_size=50
    ))
    
    text = f"{prefix} {pii_value} {suffix}"
    return text, pii_type, pii_value


@st.composite
def text_with_multiple_pii(draw):
    """Generate text containing multiple PII instances of different types."""
    num_pii = draw(st.integers(min_value=2, max_value=5))
    pii_items = []
    text_parts = []
    
    # Add initial text
    text_parts.append(draw(st.text(
        alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'), max_codepoint=127),
        min_size=5,
        max_size=30
    )))
    
    for _ in range(num_pii):
        pii_type = draw(st.sampled_from(list(PII_PATTERNS.keys())))
        pii_value = draw(st.sampled_from(PII_PATTERNS[pii_type]))
        pii_items.append((pii_type, pii_value))
        
        # Add PII value
        text_parts.append(pii_value)
        
        # Add separator text
        text_parts.append(draw(st.text(
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'), max_codepoint=127),
            min_size=3,
            max_size=30
        )))
    
    text = " ".join(text_parts)
    return text, pii_items


@st.composite
def text_without_pii(draw):
    """Generate text that should not contain PII."""
    # Generate safe text without PII patterns
    text = draw(st.text(
        alphabet=st.characters(whitelist_categories=('L', 'Z'), max_codepoint=127),
        min_size=10,
        max_size=200
    ))
    
    # Ensure it doesn't accidentally contain PII patterns
    for pii_type, patterns in PII_PATTERNS.items():
        for pattern in patterns:
            assume(pattern not in text)
    
    return text


# Property 13: PII Redaction Completeness
# **Validates: Requirements 10.2, 10.3**

@pytest.mark.property
@given(text_with_single_pii())
@settings(max_examples=100, deadline=None)
def test_property_13_single_pii_redaction_completeness(text_and_pii):
    """
    Property 13: PII Redaction Completeness (Single PII)
    
    For any transcript containing a single PII instance (name, address, phone, email, 
    SSN, credit card, or bank account), the guardrails should detect and redact the 
    PII with an appropriate placeholder token.
    
    **Validates: Requirements 10.2, 10.3**
    """
    text, pii_type, pii_value = text_and_pii
    
    # Mock the Bedrock Runtime client
    with patch('boto3.client') as mock_boto_client:
        mock_client = MagicMock()
        mock_boto_client.return_value = mock_client
        
        # Create redacted text by replacing PII with placeholder
        redacted_text = text.replace(pii_value, f"[{pii_type}]")
        
        # Mock the apply_guardrail response
        mock_client.apply_guardrail.return_value = {
            'action': 'GUARDRAIL_INTERVENED',
            'outputs': [
                {
                    'text': redacted_text
                }
            ],
            'assessments': [
                {
                    'sensitiveInformationPolicy': {
                        'piiEntities': [
                            {
                                'type': pii_type,
                                'match': pii_value
                            }
                        ]
                    }
                }
            ]
        }
        
        # Initialize client and perform redaction
        client = GuardrailsClient(
            guardrail_id="test-guardrail-id",
            guardrail_version="1"
        )
        
        result = client.redact_pii(text)
        
        # Verify PII was detected
        assert len(result.detected_pii_types) > 0, \
            f"PII type {pii_type} should be detected in text containing '{pii_value}'"
        
        # Verify the specific PII type was detected
        assert pii_type in result.detected_pii_types, \
            f"PII type {pii_type} should be in detected types: {result.detected_pii_types}"
        
        # Verify redaction occurred
        assert result.redaction_count > 0, \
            "Redaction count should be greater than 0 when PII is detected"
        
        # Verify the original PII value is not in the redacted text
        assert pii_value not in result.redacted_text, \
            f"Original PII value '{pii_value}' should not appear in redacted text"
        
        # Verify a placeholder token is present
        assert f"[{pii_type}]" in result.redacted_text or \
               result.redacted_text != text, \
            "Redacted text should contain placeholder or be different from original"


@pytest.mark.property
@given(text_with_multiple_pii())
@settings(max_examples=100, deadline=None)
def test_property_13_multiple_pii_redaction_completeness(text_and_pii_items):
    """
    Property 13: PII Redaction Completeness (Multiple PII)
    
    For any transcript containing multiple PII instances of different types, 
    the guardrails should detect and redact all PII instances with appropriate 
    placeholder tokens.
    
    **Validates: Requirements 10.2, 10.3**
    """
    text, pii_items = text_and_pii_items
    
    # Mock the Bedrock Runtime client
    with patch('boto3.client') as mock_boto_client:
        mock_client = MagicMock()
        mock_boto_client.return_value = mock_client
        
        # Create redacted text by replacing all PII with placeholders
        redacted_text = text
        pii_entities = []
        
        for pii_type, pii_value in pii_items:
            redacted_text = redacted_text.replace(pii_value, f"[{pii_type}]")
            pii_entities.append({
                'type': pii_type,
                'match': pii_value
            })
        
        # Mock the apply_guardrail response
        mock_client.apply_guardrail.return_value = {
            'action': 'GUARDRAIL_INTERVENED',
            'outputs': [
                {
                    'text': redacted_text
                }
            ],
            'assessments': [
                {
                    'sensitiveInformationPolicy': {
                        'piiEntities': pii_entities
                    }
                }
            ]
        }
        
        # Initialize client and perform redaction
        client = GuardrailsClient(
            guardrail_id="test-guardrail-id",
            guardrail_version="1"
        )
        
        result = client.redact_pii(text)
        
        # Verify all PII types were detected
        assert len(result.detected_pii_types) > 0, \
            "At least one PII type should be detected"
        
        # Verify redaction count matches or exceeds the number of PII items
        assert result.redaction_count >= len(pii_items), \
            f"Redaction count {result.redaction_count} should be at least {len(pii_items)}"
        
        # Verify none of the original PII values appear in redacted text
        for pii_type, pii_value in pii_items:
            assert pii_value not in result.redacted_text, \
                f"Original PII value '{pii_value}' should not appear in redacted text"
        
        # Verify the redacted text is different from original
        assert result.redacted_text != text, \
            "Redacted text should be different from original when PII is present"


@pytest.mark.property
@given(text_without_pii())
@settings(max_examples=50, deadline=None)
def test_property_13_no_false_positives(text):
    """
    Property 13: PII Redaction Completeness (No false positives)
    
    For any transcript that does not contain PII, the guardrails should not 
    detect or redact any content, returning the original text unchanged.
    
    **Validates: Requirements 10.2, 10.3**
    """
    # Skip empty or very short text
    assume(len(text.strip()) >= 10)
    
    # Mock the Bedrock Runtime client
    with patch('boto3.client') as mock_boto_client:
        mock_client = MagicMock()
        mock_boto_client.return_value = mock_client
        
        # Mock the apply_guardrail response with no PII detected
        mock_client.apply_guardrail.return_value = {
            'action': 'NONE',
            'outputs': [
                {
                    'text': text
                }
            ],
            'assessments': [
                {
                    'sensitiveInformationPolicy': {
                        'piiEntities': []
                    }
                }
            ]
        }
        
        # Initialize client and perform redaction
        client = GuardrailsClient(
            guardrail_id="test-guardrail-id",
            guardrail_version="1"
        )
        
        result = client.redact_pii(text)
        
        # Verify no PII was detected
        assert len(result.detected_pii_types) == 0, \
            f"No PII should be detected in text without PII, but found: {result.detected_pii_types}"
        
        # Verify no redactions occurred
        assert result.redaction_count == 0, \
            f"Redaction count should be 0 for text without PII, but got {result.redaction_count}"
        
        # Verify text is unchanged
        assert result.redacted_text == text, \
            "Text without PII should remain unchanged after redaction"


@pytest.mark.property
@given(
    st.lists(
        text_with_single_pii(),
        min_size=1,
        max_size=5
    )
)
@settings(max_examples=50, deadline=None)
def test_property_13_batch_redaction_consistency(text_pii_list):
    """
    Property 13: PII Redaction Completeness (Batch consistency)
    
    For any batch of transcripts, each containing PII, the guardrails should 
    consistently detect and redact PII across all transcripts, maintaining 
    the same redaction behavior for identical PII instances.
    
    **Validates: Requirements 10.2, 10.3**
    """
    # Mock the Bedrock Runtime client
    with patch('boto3.client') as mock_boto_client:
        mock_client = MagicMock()
        mock_boto_client.return_value = mock_client
        
        # Initialize client
        client = GuardrailsClient(
            guardrail_id="test-guardrail-id",
            guardrail_version="1"
        )
        
        results = []
        
        for text, pii_type, pii_value in text_pii_list:
            # Create redacted text
            redacted_text = text.replace(pii_value, f"[{pii_type}]")
            
            # Mock the apply_guardrail response
            mock_client.apply_guardrail.return_value = {
                'action': 'GUARDRAIL_INTERVENED',
                'outputs': [{'text': redacted_text}],
                'assessments': [{
                    'sensitiveInformationPolicy': {
                        'piiEntities': [{'type': pii_type, 'match': pii_value}]
                    }
                }]
            }
            
            result = client.redact_pii(text)
            results.append((text, pii_type, pii_value, result))
        
        # Verify all results have consistent behavior
        for text, pii_type, pii_value, result in results:
            # Each should detect PII
            assert len(result.detected_pii_types) > 0, \
                "Each text with PII should have detected PII types"
            
            # Each should have redactions
            assert result.redaction_count > 0, \
                "Each text with PII should have redaction count > 0"
            
            # Original PII should not be in redacted text
            assert pii_value not in result.redacted_text, \
                f"PII value '{pii_value}' should be redacted"


@pytest.mark.property
def test_property_13_empty_text_handling():
    """
    Property 13: PII Redaction Completeness (Edge case: empty text)
    
    For empty or whitespace-only text, the guardrails should handle gracefully
    without errors, returning an empty redaction result.
    
    **Validates: Requirements 10.2, 10.3**
    """
    # Test with empty string
    with patch('boto3.client') as mock_boto_client:
        mock_client = MagicMock()
        mock_boto_client.return_value = mock_client
        
        client = GuardrailsClient(
            guardrail_id="test-guardrail-id",
            guardrail_version="1"
        )
        
        # Test empty string
        result = client.redact_pii("")
        assert result.redacted_text == ""
        assert result.redaction_count == 0
        assert len(result.detected_pii_types) == 0
        
        # Test whitespace-only string - guardrails client returns empty for whitespace
        result = client.redact_pii("   ")
        # The client returns empty string for whitespace-only input
        assert result.redacted_text == ""
        assert result.redaction_count == 0
        assert len(result.detected_pii_types) == 0


@pytest.mark.property
@given(text_with_single_pii())
@settings(max_examples=50, deadline=None)
def test_property_13_idempotency(text_and_pii):
    """
    Property 13: PII Redaction Completeness (Idempotency)
    
    For any text, applying redaction multiple times should produce the same result
    as applying it once. Redaction should be idempotent.
    
    **Validates: Requirements 10.2, 10.3**
    """
    text, pii_type, pii_value = text_and_pii
    
    with patch('boto3.client') as mock_boto_client:
        mock_client = MagicMock()
        mock_boto_client.return_value = mock_client
        
        # Create redacted text
        redacted_text = text.replace(pii_value, f"[{pii_type}]")
        
        # Mock the apply_guardrail response
        mock_client.apply_guardrail.return_value = {
            'action': 'GUARDRAIL_INTERVENED',
            'outputs': [{'text': redacted_text}],
            'assessments': [{
                'sensitiveInformationPolicy': {
                    'piiEntities': [{'type': pii_type, 'match': pii_value}]
                }
            }]
        }
        
        client = GuardrailsClient(
            guardrail_id="test-guardrail-id",
            guardrail_version="1"
        )
        
        # Apply redaction twice
        result1 = client.redact_pii(text)
        
        # For second redaction, mock response with already-redacted text
        mock_client.apply_guardrail.return_value = {
            'action': 'NONE',
            'outputs': [{'text': redacted_text}],
            'assessments': [{
                'sensitiveInformationPolicy': {
                    'piiEntities': []
                }
            }]
        }
        
        result2 = client.redact_pii(result1.redacted_text)
        
        # Results should be equivalent (redacted text should be the same)
        assert result1.redacted_text == result2.redacted_text, \
            "Redaction should be idempotent - applying twice should give same result"
