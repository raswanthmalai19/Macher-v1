#!/usr/bin/env python3
"""
Bedrock Guardrails Setup Script

This script creates and configures Amazon Bedrock Guardrails for PII detection
and redaction. The guardrails protect user privacy by anonymizing sensitive
information before analysis.

Requirements: 10.1, 10.2, 10.3

Usage:
    python setup_guardrails.py --region us-east-1
"""

import argparse
import sys
import time
from typing import Dict, Any

import boto3
from botocore.exceptions import ClientError


# Guardrail configuration
GUARDRAIL_NAME = "VocalShield-PII-Protection"
GUARDRAIL_DESCRIPTION = "PII detection and redaction for fraud detection transcripts"


def create_guardrail(bedrock_client: Any) -> Dict[str, Any]:
    """
    Create Bedrock Guardrail with PII filters.
    
    Args:
        bedrock_client: Boto3 Bedrock client
        
    Returns:
        Dictionary containing guardrail details (id, version, arn)
    """
    print(f"Creating Bedrock Guardrail: {GUARDRAIL_NAME}")
    
    # Define PII entities to detect and redact
    pii_entities = [
        {
            'type': 'NAME',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'ADDRESS',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'EMAIL',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'PHONE',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'US_SOCIAL_SECURITY_NUMBER',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'CREDIT_DEBIT_CARD_NUMBER',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'US_BANK_ACCOUNT_NUMBER',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'US_BANK_ROUTING_NUMBER',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'US_PASSPORT_NUMBER',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'US_DRIVER_LICENSE',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'USERNAME',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'PASSWORD',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'IP_ADDRESS',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'MAC_ADDRESS',
            'action': 'ANONYMIZE'
        },
        {
            'type': 'URL',
            'action': 'ANONYMIZE'
        }
    ]
    
    try:
        response = bedrock_client.create_guardrail(
            name=GUARDRAIL_NAME,
            description=GUARDRAIL_DESCRIPTION,
            sensitiveInformationPolicyConfig={
                'piiEntitiesConfig': pii_entities
            },
            blockedInputMessaging='This content contains sensitive information that cannot be processed.',
            blockedOutputsMessaging='This response contains sensitive information that cannot be returned.',
            tags=[
                {
                    'key': 'Project',
                    'value': 'VocalShield'
                },
                {
                    'key': 'Component',
                    'value': 'FraudDetection'
                }
            ]
        )
        
        guardrail_id = response['guardrailId']
        guardrail_arn = response['guardrailArn']
        version = response['version']
        
        print(f"✓ Guardrail created successfully")
        print(f"  Guardrail ID: {guardrail_id}")
        print(f"  Guardrail ARN: {guardrail_arn}")
        print(f"  Version: {version}")
        print(f"  PII Entities Protected: {len(pii_entities)}")
        
        return {
            'guardrail_id': guardrail_id,
            'guardrail_arn': guardrail_arn,
            'version': version
        }
    
    except ClientError as e:
        print(f"✗ Failed to create guardrail: {e}")
        raise


def create_guardrail_version(
    bedrock_client: Any,
    guardrail_id: str
) -> str:
    """
    Create a version of the guardrail for production use.
    
    Args:
        bedrock_client: Boto3 Bedrock client
        guardrail_id: Guardrail ID
        
    Returns:
        Version identifier
    """
    print(f"Creating guardrail version...")
    
    try:
        response = bedrock_client.create_guardrail_version(
            guardrailIdentifier=guardrail_id,
            description='Production version for VocalShield fraud detection'
        )
        
        version = response['version']
        
        print(f"✓ Guardrail version created: {version}")
        return version
    
    except ClientError as e:
        print(f"✗ Failed to create guardrail version: {e}")
        raise


def test_guardrail(
    bedrock_runtime_client: Any,
    guardrail_id: str,
    guardrail_version: str
) -> None:
    """
    Test the guardrail with sample PII data.
    
    Args:
        bedrock_runtime_client: Boto3 Bedrock Runtime client
        guardrail_id: Guardrail ID
        guardrail_version: Guardrail version
    """
    print(f"Testing guardrail with sample data...")
    
    # Test cases with various PII types
    test_cases = [
        {
            'name': 'Name and Phone',
            'text': 'My name is John Smith and my phone number is 555-123-4567.'
        },
        {
            'name': 'SSN and Email',
            'text': 'My SSN is 123-45-6789 and email is john.smith@example.com.'
        },
        {
            'name': 'Credit Card',
            'text': 'My credit card number is 4532-1234-5678-9010.'
        },
        {
            'name': 'Address',
            'text': 'I live at 123 Main Street, Springfield, IL 62701.'
        }
    ]
    
    for test_case in test_cases:
        try:
            response = bedrock_runtime_client.apply_guardrail(
                guardrailIdentifier=guardrail_id,
                guardrailVersion=guardrail_version,
                source='INPUT',
                content=[
                    {
                        'text': {
                            'text': test_case['text']
                        }
                    }
                ]
            )
            
            # Extract redacted text
            outputs = response.get('outputs', [])
            if outputs:
                redacted_text = outputs[0].get('text', '')
                print(f"  ✓ {test_case['name']}")
                print(f"    Original: {test_case['text']}")
                print(f"    Redacted: {redacted_text}")
            else:
                print(f"  ⚠ {test_case['name']}: No output returned")
        
        except ClientError as e:
            print(f"  ✗ {test_case['name']}: {e}")
    
    print(f"✓ Guardrail testing complete")


def main():
    parser = argparse.ArgumentParser(
        description="Set up Amazon Bedrock Guardrails for PII protection"
    )
    parser.add_argument(
        '--region',
        default='us-east-1',
        help='AWS region (default: us-east-1)'
    )
    parser.add_argument(
        '--skip-test',
        action='store_true',
        help='Skip guardrail testing'
    )
    
    args = parser.parse_args()
    
    print("=" * 70)
    print("VocalShield Guardrails Setup")
    print("=" * 70)
    print()
    
    # Initialize AWS clients
    bedrock_client = boto3.client('bedrock', region_name=args.region)
    bedrock_runtime_client = boto3.client('bedrock-runtime', region_name=args.region)
    sts_client = boto3.client('sts', region_name=args.region)
    
    # Get account ID
    account_id = sts_client.get_caller_identity()['Account']
    print(f"AWS Account: {account_id}")
    print(f"Region: {args.region}")
    print()
    
    try:
        # Step 1: Create guardrail
        guardrail_details = create_guardrail(bedrock_client)
        print()
        
        # Step 2: Create guardrail version
        version = create_guardrail_version(
            bedrock_client,
            guardrail_details['guardrail_id']
        )
        print()
        
        # Step 3: Test guardrail (optional)
        if not args.skip_test:
            test_guardrail(
                bedrock_runtime_client,
                guardrail_details['guardrail_id'],
                version
            )
            print()
        
        # Output configuration
        print("=" * 70)
        print("Setup Complete!")
        print("=" * 70)
        print()
        print("Guardrail Details:")
        print(f"  Guardrail ID: {guardrail_details['guardrail_id']}")
        print(f"  Version: {version}")
        print()
        print("Add these values to your CDK configuration:")
        print()
        print(f"GUARDRAIL_ID={guardrail_details['guardrail_id']}")
        print(f"GUARDRAIL_VERSION={version}")
        print()
        print("Protected PII Types:")
        print("  - Names")
        print("  - Addresses")
        print("  - Email addresses")
        print("  - Phone numbers")
        print("  - Social Security numbers")
        print("  - Credit/debit card numbers")
        print("  - Bank account numbers")
        print("  - Bank routing numbers")
        print("  - Passport numbers")
        print("  - Driver's license numbers")
        print("  - Usernames and passwords")
        print("  - IP addresses")
        print("  - MAC addresses")
        print("  - URLs")
        print()
        
        return 0
    
    except Exception as e:
        print()
        print("=" * 70)
        print("Setup Failed!")
        print("=" * 70)
        print(f"Error: {e}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
