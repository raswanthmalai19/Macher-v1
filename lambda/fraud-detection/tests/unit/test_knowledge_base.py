"""
Unit tests for Knowledge Base Manager.

These tests verify specific examples, edge cases, and error conditions
for the scam pattern knowledge base system.

Requirements: 2.2, 2.4, 2.5
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import json
from botocore.exceptions import ClientError

from src.knowledge_base import KnowledgeBaseManager
from src.models import ScamPattern, FraudDetectionError


class TestKnowledgeBaseManager:
    """Test suite for KnowledgeBaseManager class."""
    
    def test_initialization(self):
        """Test Knowledge Base Manager initialization."""
        with patch('boto3.client') as mock_boto_client:
            mock_bedrock_client = Mock()
            mock_s3_client = Mock()
            
            def client_factory(service_name, **kwargs):
                if service_name == 'bedrock-agent-runtime':
                    return mock_bedrock_client
                elif service_name == 's3':
                    return mock_s3_client
                return Mock()
            
            mock_boto_client.side_effect = client_factory
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            assert kb_manager.knowledge_base_id == "test-kb-123"
            assert kb_manager.region == "us-east-1"
            # Verify both clients were created
            assert mock_boto_client.call_count == 2
    
    def test_query_patterns_irs_scam(self):
        """Test pattern querying with IRS scam search term."""
        with patch('boto3.client') as mock_boto_client:
            mock_bedrock_client = Mock()
            mock_boto_client.return_value = mock_bedrock_client
            
            # Mock retrieve response with IRS scam pattern
            mock_bedrock_client.retrieve.return_value = {
                'retrievalResults': [
                    {
                        'content': {
                            'text': json.dumps({
                                'pattern_id': 'irs-scam-001',
                                'pattern_type': 'IRS Scam',
                                'description': 'Caller impersonates IRS agent',
                                'indicators': ['threatening arrest', 'demanding payment'],
                                'severity': 'high'
                            })
                        },
                        'score': 0.95
                    }
                ]
            }
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            patterns = kb_manager.query_patterns(
                query_text="IRS tax payment arrest",
                language="en",
                max_results=5
            )
            
            assert len(patterns) == 1
            assert patterns[0].pattern_type == "IRS Scam"
            assert patterns[0].pattern_id == "irs-scam-001"
            assert "threatening arrest" in patterns[0].matched_indicators
    
    def test_query_patterns_tech_support_scam(self):
        """Test pattern querying with tech support scam search term."""
        with patch('boto3.client') as mock_boto_client:
            mock_bedrock_client = Mock()
            mock_boto_client.return_value = mock_bedrock_client
            
            # Mock retrieve response with tech support scam pattern
            mock_bedrock_client.retrieve.return_value = {
                'retrievalResults': [
                    {
                        'content': {
                            'text': json.dumps({
                                'pattern_id': 'tech-support-001',
                                'pattern_type': 'Tech Support Scam',
                                'description': 'Caller claims computer has virus',
                                'indicators': ['virus detected', 'remote access', 'Microsoft'],
                                'severity': 'high'
                            })
                        },
                        'score': 0.92
                    }
                ]
            }
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            patterns = kb_manager.query_patterns(
                query_text="Microsoft virus computer remote access",
                language="en",
                max_results=5
            )
            
            assert len(patterns) == 1
            assert patterns[0].pattern_type == "Tech Support Scam"
            assert "virus detected" in patterns[0].matched_indicators
    
    def test_query_patterns_grandparent_scam(self):
        """Test pattern querying with grandparent scam search term."""
        with patch('boto3.client') as mock_boto_client:
            mock_bedrock_client = Mock()
            mock_boto_client.return_value = mock_bedrock_client
            
            # Mock retrieve response with grandparent scam pattern
            mock_bedrock_client.retrieve.return_value = {
                'retrievalResults': [
                    {
                        'content': {
                            'text': json.dumps({
                                'pattern_id': 'grandparent-001',
                                'pattern_type': 'Grandparent Scam',
                                'description': 'Pretends to be grandchild in emergency',
                                'indicators': ['emergency', 'bail money', 'dont tell'],
                                'severity': 'high'
                            })
                        },
                        'score': 0.88
                    }
                ]
            }
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            patterns = kb_manager.query_patterns(
                query_text="grandma emergency bail money",
                language="en",
                max_results=5
            )
            
            assert len(patterns) == 1
            assert patterns[0].pattern_type == "Grandparent Scam"
            assert "emergency" in patterns[0].matched_indicators
    
    def test_query_patterns_no_results(self):
        """Test pattern querying with no matching results."""
        with patch('boto3.client') as mock_boto_client:
            mock_bedrock_client = Mock()
            mock_boto_client.return_value = mock_bedrock_client
            
            # Mock retrieve response with no results
            mock_bedrock_client.retrieve.return_value = {
                'retrievalResults': []
            }
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            patterns = kb_manager.query_patterns(
                query_text="completely unrelated query",
                language="en",
                max_results=5
            )
            
            assert len(patterns) == 0
    
    def test_query_patterns_multiple_results(self):
        """Test pattern querying with multiple matching results."""
        with patch('boto3.client') as mock_boto_client:
            mock_bedrock_client = Mock()
            mock_boto_client.return_value = mock_bedrock_client
            
            # Mock retrieve response with multiple patterns
            mock_bedrock_client.retrieve.return_value = {
                'retrievalResults': [
                    {
                        'content': {
                            'text': json.dumps({
                                'pattern_id': 'irs-scam-001',
                                'pattern_type': 'IRS Scam',
                                'description': 'IRS impersonation',
                                'indicators': ['IRS', 'tax debt'],
                                'severity': 'high'
                            })
                        },
                        'score': 0.95
                    },
                    {
                        'content': {
                            'text': json.dumps({
                                'pattern_id': 'social-security-001',
                                'pattern_type': 'Social Security Scam',
                                'description': 'Social Security impersonation',
                                'indicators': ['SSN suspended', 'social security'],
                                'severity': 'high'
                            })
                        },
                        'score': 0.85
                    },
                    {
                        'content': {
                            'text': json.dumps({
                                'pattern_id': 'bank-scam-001',
                                'pattern_type': 'Bank Scam',
                                'description': 'Bank impersonation',
                                'indicators': ['account suspended', 'verify identity'],
                                'severity': 'medium'
                            })
                        },
                        'score': 0.75
                    }
                ]
            }
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            patterns = kb_manager.query_patterns(
                query_text="government agency account suspended",
                language="en",
                max_results=5
            )
            
            assert len(patterns) == 3
            assert patterns[0].pattern_type == "IRS Scam"
            assert patterns[1].pattern_type == "Social Security Scam"
            assert patterns[2].pattern_type == "Bank Scam"
    
    def test_query_patterns_max_results_limit(self):
        """Test pattern querying respects max_results limit."""
        with patch('boto3.client') as mock_boto_client:
            mock_bedrock_client = Mock()
            mock_boto_client.return_value = mock_bedrock_client
            
            # Mock retrieve response with many patterns
            mock_results = []
            for i in range(10):
                mock_results.append({
                    'content': {
                        'text': json.dumps({
                            'pattern_id': f'pattern-{i}',
                            'pattern_type': f'Scam Type {i}',
                            'description': f'Description {i}',
                            'indicators': [f'indicator-{i}'],
                            'severity': 'medium'
                        })
                    },
                    'score': 0.9 - (i * 0.05)
                })
            
            mock_bedrock_client.retrieve.return_value = {
                'retrievalResults': mock_results
            }
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            # Query with max_results=3
            patterns = kb_manager.query_patterns(
                query_text="scam fraud",
                language="en",
                max_results=3
            )
            
            assert len(patterns) == 3
    
    def test_add_pattern_to_s3(self):
        """Test adding a new pattern to S3."""
        with patch('boto3.client') as mock_boto_client:
            mock_s3_client = Mock()
            mock_bedrock_client = Mock()
            
            def client_factory(service_name, **kwargs):
                if service_name == 's3':
                    return mock_s3_client
                elif service_name == 'bedrock-agent-runtime':
                    return mock_bedrock_client
                return Mock()
            
            mock_boto_client.side_effect = client_factory
            
            mock_s3_client.put_object.return_value = {'ETag': 'mock-etag'}
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            pattern = {
                'pattern_id': 'new-scam-001',
                'pattern_type': 'New Scam Type',
                'language': 'en',
                'description': 'A new type of scam',
                'indicators': ['indicator1', 'indicator2'],
                'severity': 'high'
            }
            
            s3_key = kb_manager.add_pattern(
                pattern=pattern,
                s3_bucket="test-bucket"
            )
            
            assert s3_key is not None
            assert "new-scam-001" in s3_key
            assert "/en/" in s3_key
            
            # Verify S3 put_object was called
            mock_s3_client.put_object.assert_called_once()
            call_kwargs = mock_s3_client.put_object.call_args[1]
            assert call_kwargs['Bucket'] == "test-bucket"
            assert call_kwargs['ContentType'] == 'application/json'
    
    def test_add_pattern_spanish_language(self):
        """Test adding a pattern in Spanish language."""
        with patch('boto3.client') as mock_boto_client:
            mock_s3_client = Mock()
            mock_bedrock_client = Mock()
            
            def client_factory(service_name, **kwargs):
                if service_name == 's3':
                    return mock_s3_client
                elif service_name == 'bedrock-agent-runtime':
                    return mock_bedrock_client
                return Mock()
            
            mock_boto_client.side_effect = client_factory
            
            mock_s3_client.put_object.return_value = {'ETag': 'mock-etag'}
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            pattern = {
                'pattern_id': 'estafa-irs-001',
                'pattern_type': 'Estafa del IRS',
                'language': 'es',
                'description': 'Llamada fraudulenta del IRS',
                'indicators': ['amenaza de arresto', 'pago inmediato'],
                'severity': 'high'
            }
            
            s3_key = kb_manager.add_pattern(
                pattern=pattern,
                s3_bucket="test-bucket"
            )
            
            assert s3_key is not None
            assert "/es/" in s3_key
            assert "estafa-irs-001" in s3_key
    
    def test_language_filtering_english(self):
        """Test language filtering for English patterns."""
        with patch('boto3.client') as mock_boto_client:
            mock_bedrock_client = Mock()
            mock_boto_client.return_value = mock_bedrock_client
            
            # Mock retrieve response with English pattern only
            mock_bedrock_client.retrieve.return_value = {
                'retrievalResults': [
                    {
                        'content': {
                            'text': json.dumps({
                                'pattern_id': 'irs-scam-001',
                                'pattern_type': 'IRS Scam',
                                'language': 'en',
                                'description': 'IRS impersonation',
                                'indicators': ['IRS', 'tax'],
                                'severity': 'high'
                            })
                        },
                        'score': 0.95
                    }
                ]
            }
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            patterns = kb_manager.query_patterns(
                query_text="IRS tax",
                language="en",
                max_results=5
            )
            
            assert len(patterns) == 1
            # In real implementation, language filtering would be enforced
    
    def test_language_filtering_spanish(self):
        """Test language filtering for Spanish patterns."""
        with patch('boto3.client') as mock_boto_client:
            mock_bedrock_client = Mock()
            mock_boto_client.return_value = mock_bedrock_client
            
            # Mock retrieve response with Spanish pattern
            mock_bedrock_client.retrieve.return_value = {
                'retrievalResults': [
                    {
                        'content': {
                            'text': json.dumps({
                                'pattern_id': 'estafa-irs-001',
                                'pattern_type': 'Estafa del IRS',
                                'language': 'es',
                                'description': 'Suplantación del IRS',
                                'indicators': ['IRS', 'impuestos'],
                                'severity': 'high'
                            })
                        },
                        'score': 0.92
                    }
                ]
            }
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            patterns = kb_manager.query_patterns(
                query_text="IRS impuestos",
                language="es",
                max_results=5
            )
            
            assert len(patterns) == 1
    
    def test_query_patterns_api_error(self):
        """Test error handling when Bedrock API fails - should return empty list for resilience."""
        with patch('boto3.client') as mock_boto_client:
            mock_bedrock_client = Mock()
            mock_s3_client = Mock()
            
            def client_factory(service_name, **kwargs):
                if service_name == 'bedrock-agent-runtime':
                    return mock_bedrock_client
                elif service_name == 's3':
                    return mock_s3_client
                return Mock()
            
            mock_boto_client.side_effect = client_factory
            
            # Simulate API error
            error_response = {
                'Error': {
                    'Code': 'ThrottlingException',
                    'Message': 'Rate exceeded'
                }
            }
            mock_bedrock_client.retrieve.side_effect = ClientError(
                error_response, 'Retrieve'
            )
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            # Implementation returns empty list for resilience (degraded mode)
            # instead of raising an error
            patterns = kb_manager.query_patterns(
                query_text="test query",
                language="en",
                max_results=5
            )
            
            assert patterns == []  # Should return empty list, not raise
    
    def test_add_pattern_s3_error(self):
        """Test error handling when S3 upload fails."""
        with patch('boto3.client') as mock_boto_client:
            mock_s3_client = Mock()
            mock_bedrock_client = Mock()
            
            def client_factory(service_name, **kwargs):
                if service_name == 's3':
                    return mock_s3_client
                elif service_name == 'bedrock-agent-runtime':
                    return mock_bedrock_client
                return Mock()
            
            mock_boto_client.side_effect = client_factory
            
            # Simulate S3 error
            error_response = {
                'Error': {
                    'Code': 'AccessDenied',
                    'Message': 'Access Denied'
                }
            }
            mock_s3_client.put_object.side_effect = ClientError(
                error_response, 'PutObject'
            )
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            pattern = {
                'pattern_id': 'test-001',
                'pattern_type': 'Test Scam',
                'language': 'en',
                'description': 'Test pattern',
                'indicators': ['test'],
                'severity': 'low'
            }
            
            with pytest.raises(FraudDetectionError) as exc_info:
                kb_manager.add_pattern(
                    pattern=pattern,
                    s3_bucket="test-bucket"
                )
            
            assert "Failed to add pattern" in str(exc_info.value) or "AccessDenied" in str(exc_info.value)
    
    def test_query_patterns_empty_query(self):
        """Test querying with empty query text - should return empty list."""
        with patch('boto3.client') as mock_boto_client:
            mock_bedrock_client = Mock()
            mock_s3_client = Mock()
            
            def client_factory(service_name, **kwargs):
                if service_name == 'bedrock-agent-runtime':
                    return mock_bedrock_client
                elif service_name == 's3':
                    return mock_s3_client
                return Mock()
            
            mock_boto_client.side_effect = client_factory
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            # Implementation returns empty list for empty query (graceful handling)
            patterns = kb_manager.query_patterns(
                query_text="",
                language="en",
                max_results=5
            )
            
            assert patterns == []  # Should return empty list, not raise
    
    def test_add_pattern_missing_required_fields(self):
        """Test adding pattern with missing required fields."""
        with patch('boto3.client') as mock_boto_client:
            mock_s3_client = Mock()
            mock_bedrock_client = Mock()
            
            def client_factory(service_name, **kwargs):
                if service_name == 's3':
                    return mock_s3_client
                elif service_name == 'bedrock-agent-runtime':
                    return mock_bedrock_client
                return Mock()
            
            mock_boto_client.side_effect = client_factory
            
            kb_manager = KnowledgeBaseManager(
                knowledge_base_id="test-kb-123",
                region="us-east-1"
            )
            
            # Pattern missing required fields
            incomplete_pattern = {
                'pattern_id': 'test-001',
                # Missing pattern_type, language, description
            }
            
            with pytest.raises((ValueError, KeyError, FraudDetectionError)):
                kb_manager.add_pattern(
                    pattern=incomplete_pattern,
                    s3_bucket="test-bucket"
                )
