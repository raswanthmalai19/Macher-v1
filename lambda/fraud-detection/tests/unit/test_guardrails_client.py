"""
Unit tests for GuardrailsClient.

Tests PII redaction functionality including:
- Redaction of various PII types (names, phone numbers, SSNs, emails, credit cards)
- Error handling for API failures
- Empty text handling
- Response parsing
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from botocore.exceptions import ClientError

from src.guardrails_client import GuardrailsClient
from src.models import RedactionResult, GuardrailsError


class TestGuardrailsClient:
    """Test suite for GuardrailsClient."""
    
    @pytest.fixture
    def mock_bedrock_client(self):
        """Create a mock boto3 bedrock-runtime client."""
        return Mock()
    
    @pytest.fixture
    def client(self, mock_bedrock_client):
        """Create a GuardrailsClient instance for testing with mocked boto3 client."""
        with patch('boto3.client', return_value=mock_bedrock_client):
            return GuardrailsClient(
                guardrail_id="test-guardrail-id",
                guardrail_version="1",
                region="us-east-1"
            )
    
    def test_initialization(self, client, mock_bedrock_client):
        """Test GuardrailsClient initialization."""
        assert client.guardrail_id == "test-guardrail-id"
        assert client.guardrail_version == "1"
        assert client.region == "us-east-1"
        assert client.client is mock_bedrock_client
    
    def test_redact_name(self, client, mock_bedrock_client):
        """Test redaction of names (PII type: NAME)."""
        # Arrange
        original_text = "My name is John Smith and I live in Seattle."
        mock_bedrock_client.apply_guardrail.return_value = {
            'action': 'GUARDRAIL_INTERVENED',
            'outputs': [
                {
                    'text': 'My name is [NAME] and I live in Seattle.'
                }
            ],
            'assessments': [
                {
                    'sensitiveInformationPolicy': {
                        'piiEntities': [
                            {
                                'type': 'NAME',
                                'match': 'John Smith'
                            }
                        ]
                    }
                }
            ]
        }
        
        # Act
        result = client.redact_pii(original_text)
        
        # Assert
        assert isinstance(result, RedactionResult)
        assert '[NAME]' in result.redacted_text
        assert 'John Smith' not in result.redacted_text
        assert 'NAME' in result.detected_pii_types
        assert result.redaction_count == 1
        
        # Verify API call
        mock_bedrock_client.apply_guardrail.assert_called_once()
        call_args = mock_bedrock_client.apply_guardrail.call_args
        assert call_args[1]['guardrailIdentifier'] == 'test-guardrail-id'
        assert call_args[1]['guardrailVersion'] == '1'
        assert call_args[1]['source'] == 'INPUT'
    
    def test_redact_phone_number(self, client, mock_bedrock_client):
        """Test redaction of phone numbers (PII type: PHONE)."""
        # Arrange
        original_text = "Call me at 555-1234 or 123-456-7890."
        mock_bedrock_client.apply_guardrail.return_value = {
            'action': 'GUARDRAIL_INTERVENED',
            'outputs': [
                {
                    'text': 'Call me at [PHONE] or [PHONE].'
                }
            ],
            'assessments': [
                {
                    'sensitiveInformationPolicy': {
                        'piiEntities': [
                            {
                                'type': 'PHONE',
                                'match': '555-1234'
                            },
                            {
                                'type': 'PHONE',
                                'match': '123-456-7890'
                            }
                        ]
                    }
                }
            ]
        }
        
        # Act
        result = client.redact_pii(original_text)
        
        # Assert
        assert '[PHONE]' in result.redacted_text
        assert '555-1234' not in result.redacted_text
        assert '123-456-7890' not in result.redacted_text
        assert 'PHONE' in result.detected_pii_types
        assert result.redaction_count == 2
    
    def test_redact_ssn(self, client, mock_bedrock_client):
        """Test redaction of Social Security Numbers (PII type: US_SOCIAL_SECURITY_NUMBER)."""
        # Arrange
        original_text = "My SSN is 123-45-6789 for verification."
        mock_bedrock_client.apply_guardrail.return_value = {
            'action': 'GUARDRAIL_INTERVENED',
            'outputs': [
                {
                    'text': 'My SSN is [US_SOCIAL_SECURITY_NUMBER] for verification.'
                }
            ],
            'assessments': [
                {
                    'sensitiveInformationPolicy': {
                        'piiEntities': [
                            {
                                'type': 'US_SOCIAL_SECURITY_NUMBER',
                                'match': '123-45-6789'
                            }
                        ]
                    }
                }
            ]
        }
        
        # Act
        result = client.redact_pii(original_text)
        
        # Assert
        assert '[US_SOCIAL_SECURITY_NUMBER]' in result.redacted_text
        assert '123-45-6789' not in result.redacted_text
        assert 'US_SOCIAL_SECURITY_NUMBER' in result.detected_pii_types
        assert result.redaction_count == 1
    
    def test_redact_email(self, client, mock_bedrock_client):
        """Test redaction of email addresses (PII type: EMAIL)."""
        # Arrange
        original_text = "Contact me at john.smith@example.com for details."
        mock_bedrock_client.apply_guardrail.return_value = {
            'action': 'GUARDRAIL_INTERVENED',
            'outputs': [
                {
                    'text': 'Contact me at [EMAIL] for details.'
                }
            ],
            'assessments': [
                {
                    'sensitiveInformationPolicy': {
                        'piiEntities': [
                            {
                                'type': 'EMAIL',
                                'match': 'john.smith@example.com'
                            }
                        ]
                    }
                }
            ]
        }
        
        # Act
        result = client.redact_pii(original_text)
        
        # Assert
        assert '[EMAIL]' in result.redacted_text
        assert 'john.smith@example.com' not in result.redacted_text
        assert 'EMAIL' in result.detected_pii_types
        assert result.redaction_count == 1
    
    def test_redact_credit_card(self, client, mock_bedrock_client):
        """Test redaction of credit card numbers (PII type: CREDIT_DEBIT_CARD_NUMBER)."""
        # Arrange
        original_text = "My card number is 4532-1234-5678-9010."
        mock_bedrock_client.apply_guardrail.return_value = {
            'action': 'GUARDRAIL_INTERVENED',
            'outputs': [
                {
                    'text': 'My card number is [CREDIT_DEBIT_CARD_NUMBER].'
                }
            ],
            'assessments': [
                {
                    'sensitiveInformationPolicy': {
                        'piiEntities': [
                            {
                                'type': 'CREDIT_DEBIT_CARD_NUMBER',
                                'match': '4532-1234-5678-9010'
                            }
                        ]
                    }
                }
            ]
        }
        
        # Act
        result = client.redact_pii(original_text)
        
        # Assert
        assert '[CREDIT_DEBIT_CARD_NUMBER]' in result.redacted_text
        assert '4532-1234-5678-9010' not in result.redacted_text
        assert 'CREDIT_DEBIT_CARD_NUMBER' in result.detected_pii_types
        assert result.redaction_count == 1
    
    def test_redact_bank_account(self, client, mock_bedrock_client):
        """Test redaction of bank account numbers (PII type: US_BANK_ACCOUNT_NUMBER)."""
        # Arrange
        original_text = "My bank account number is 123456789 and routing number is 021000021."
        mock_bedrock_client.apply_guardrail.return_value = {
            'action': 'GUARDRAIL_INTERVENED',
            'outputs': [
                {
                    'text': 'My bank account number is [US_BANK_ACCOUNT_NUMBER] and routing number is [US_BANK_ROUTING_NUMBER].'
                }
            ],
            'assessments': [
                {
                    'sensitiveInformationPolicy': {
                        'piiEntities': [
                            {
                                'type': 'US_BANK_ACCOUNT_NUMBER',
                                'match': '123456789'
                            },
                            {
                                'type': 'US_BANK_ROUTING_NUMBER',
                                'match': '021000021'
                            }
                        ]
                    }
                }
            ]
        }
        
        # Act
        result = client.redact_pii(original_text)
        
        # Assert
        assert '[US_BANK_ACCOUNT_NUMBER]' in result.redacted_text
        assert '[US_BANK_ROUTING_NUMBER]' in result.redacted_text
        assert '123456789' not in result.redacted_text
        assert '021000021' not in result.redacted_text
        assert 'US_BANK_ACCOUNT_NUMBER' in result.detected_pii_types
        assert 'US_BANK_ROUTING_NUMBER' in result.detected_pii_types
        assert result.redaction_count == 2
    
    def test_redact_multiple_pii_types(self, client, mock_bedrock_client):
        """Test redaction of multiple PII types in a single text."""
        # Arrange
        original_text = "I'm John Smith, call me at 555-1234 or email john@example.com. My SSN is 123-45-6789."
        mock_bedrock_client.apply_guardrail.return_value = {
            'action': 'GUARDRAIL_INTERVENED',
            'outputs': [
                {
                    'text': "I'm [NAME], call me at [PHONE] or email [EMAIL]. My SSN is [US_SOCIAL_SECURITY_NUMBER]."
                }
            ],
            'assessments': [
                {
                    'sensitiveInformationPolicy': {
                        'piiEntities': [
                            {'type': 'NAME', 'match': 'John Smith'},
                            {'type': 'PHONE', 'match': '555-1234'},
                            {'type': 'EMAIL', 'match': 'john@example.com'},
                            {'type': 'US_SOCIAL_SECURITY_NUMBER', 'match': '123-45-6789'}
                        ]
                    }
                }
            ]
        }
        
        # Act
        result = client.redact_pii(original_text)
        
        # Assert
        assert '[NAME]' in result.redacted_text
        assert '[PHONE]' in result.redacted_text
        assert '[EMAIL]' in result.redacted_text
        assert '[US_SOCIAL_SECURITY_NUMBER]' in result.redacted_text
        assert 'John Smith' not in result.redacted_text
        assert '555-1234' not in result.redacted_text
        assert 'john@example.com' not in result.redacted_text
        assert '123-45-6789' not in result.redacted_text
        assert len(result.detected_pii_types) == 4
        assert result.redaction_count == 4
    
    def test_no_pii_detected(self, client, mock_bedrock_client):
        """Test handling of text with no PII."""
        # Arrange
        original_text = "This is a normal conversation about the weather."
        mock_bedrock_client.apply_guardrail.return_value = {
            'action': 'NONE',
            'outputs': [
                {
                    'text': original_text
                }
            ],
            'assessments': []
        }
        
        # Act
        result = client.redact_pii(original_text)
        
        # Assert
        assert result.redacted_text == original_text
        assert len(result.detected_pii_types) == 0
        assert result.redaction_count == 0
    
    def test_empty_text(self, client):
        """Test handling of empty text input."""
        # Act
        result = client.redact_pii("")
        
        # Assert
        assert result.redacted_text == ""
        assert len(result.detected_pii_types) == 0
        assert result.redaction_count == 0
    
    def test_whitespace_only_text(self, client):
        """Test handling of whitespace-only text input."""
        # Act
        result = client.redact_pii("   \n\t  ")
        
        # Assert
        assert result.redacted_text == ""
        assert len(result.detected_pii_types) == 0
        assert result.redaction_count == 0
    
    def test_api_client_error(self, client, mock_bedrock_client):
        """Test error handling for AWS API ClientError."""
        # Arrange
        original_text = "Test text with potential PII."
        error_response = {
            'Error': {
                'Code': 'ThrottlingException',
                'Message': 'Rate exceeded'
            }
        }
        mock_bedrock_client.apply_guardrail.side_effect = ClientError(
            error_response,
            'ApplyGuardrail'
        )
        
        # Act & Assert
        with pytest.raises(GuardrailsError) as exc_info:
            client.redact_pii(original_text)
        
        assert 'ThrottlingException' in str(exc_info.value)
        assert 'Rate exceeded' in str(exc_info.value)
    
    def test_api_access_denied_error(self, client, mock_bedrock_client):
        """Test error handling for access denied errors."""
        # Arrange
        original_text = "Test text with potential PII."
        error_response = {
            'Error': {
                'Code': 'AccessDeniedException',
                'Message': 'User is not authorized to perform: bedrock:ApplyGuardrail'
            }
        }
        mock_bedrock_client.apply_guardrail.side_effect = ClientError(
            error_response,
            'ApplyGuardrail'
        )
        
        # Act & Assert
        with pytest.raises(GuardrailsError) as exc_info:
            client.redact_pii(original_text)
        
        assert 'AccessDeniedException' in str(exc_info.value)
    
    def test_api_resource_not_found_error(self, client, mock_bedrock_client):
        """Test error handling for resource not found errors."""
        # Arrange
        original_text = "Test text with potential PII."
        error_response = {
            'Error': {
                'Code': 'ResourceNotFoundException',
                'Message': 'Guardrail not found'
            }
        }
        mock_bedrock_client.apply_guardrail.side_effect = ClientError(
            error_response,
            'ApplyGuardrail'
        )
        
        # Act & Assert
        with pytest.raises(GuardrailsError) as exc_info:
            client.redact_pii(original_text)
        
        assert 'ResourceNotFoundException' in str(exc_info.value)
        assert 'Guardrail not found' in str(exc_info.value)
    
    def test_unexpected_exception(self, client, mock_bedrock_client):
        """Test error handling for unexpected exceptions."""
        # Arrange
        original_text = "Test text with potential PII."
        mock_bedrock_client.apply_guardrail.side_effect = Exception("Unexpected error")
        
        # Act & Assert
        with pytest.raises(GuardrailsError) as exc_info:
            client.redact_pii(original_text)
        
        assert 'Unexpected error during PII redaction' in str(exc_info.value)
    
    def test_malformed_response(self, client, mock_bedrock_client):
        """Test handling of malformed API response."""
        # Arrange
        original_text = "Test text with potential PII."
        # Response missing expected fields
        mock_bedrock_client.apply_guardrail.return_value = {
            'action': 'NONE'
            # Missing 'outputs' and 'assessments'
        }
        
        # Act
        result = client.redact_pii(original_text)
        
        # Assert - should handle gracefully and return original text
        assert result.redacted_text == original_text
        assert len(result.detected_pii_types) == 0
        assert result.redaction_count == 0
    
    def test_validate_configuration_success(self, client):
        """Test successful guardrail configuration validation."""
        # Arrange
        with patch('boto3.client') as mock_client:
            mock_bedrock = MagicMock()
            mock_client.return_value = mock_bedrock
            mock_bedrock.get_guardrail.return_value = {
                'guardrailId': 'test-guardrail-id',
                'version': '1'
            }
            
            # Act
            result = client.validate_configuration()
            
            # Assert
            assert result is True
    
    def test_validate_configuration_failure(self, client):
        """Test guardrail configuration validation failure."""
        # Arrange
        with patch('boto3.client') as mock_client:
            mock_bedrock = MagicMock()
            mock_client.return_value = mock_bedrock
            error_response = {
                'Error': {
                    'Code': 'ResourceNotFoundException',
                    'Message': 'Guardrail not found'
                }
            }
            mock_bedrock.get_guardrail.side_effect = ClientError(
                error_response,
                'GetGuardrail'
            )
            
            # Act
            result = client.validate_configuration()
            
            # Assert
            assert result is False
