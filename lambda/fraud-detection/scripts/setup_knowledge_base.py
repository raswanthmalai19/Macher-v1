#!/usr/bin/env python3
"""
Bedrock Knowledge Base Setup Script

This script creates and configures an Amazon Bedrock Knowledge Base for storing
scam patterns and fraud detection knowledge. It creates an S3 bucket, uploads
initial scam pattern documents, and sets up the Knowledge Base with vector embeddings.

Requirements: 2.1, 2.3, 6.1

Usage:
    python setup_knowledge_base.py --region us-east-1
"""

import argparse
import json
import sys
import time
from typing import Dict, Any, List

import boto3
from botocore.exceptions import ClientError


# Knowledge Base configuration
KB_NAME = "VocalShield-ScamPatterns"
KB_DESCRIPTION = "Knowledge base containing scam patterns, scripts, and fraud indicators"

# Embedding model
EMBEDDING_MODEL_ARN = "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1"


def create_s3_bucket(s3_client: Any, bucket_name: str, region: str) -> str:
    """
    Create S3 bucket for Knowledge Base documents.
    
    Args:
        s3_client: Boto3 S3 client
        bucket_name: Name for the S3 bucket
        region: AWS region
        
    Returns:
        S3 bucket name
    """
    print(f"Creating S3 bucket: {bucket_name}")
    
    try:
        if region == 'us-east-1':
            s3_client.create_bucket(Bucket=bucket_name)
        else:
            s3_client.create_bucket(
                Bucket=bucket_name,
                CreateBucketConfiguration={'LocationConstraint': region}
            )
        
        # Enable versioning
        s3_client.put_bucket_versioning(
            Bucket=bucket_name,
            VersioningConfiguration={'Status': 'Enabled'}
        )
        
        # Add tags
        s3_client.put_bucket_tagging(
            Bucket=bucket_name,
            Tagging={
                'TagSet': [
                    {'Key': 'Project', 'Value': 'VocalShield'},
                    {'Key': 'Component', 'Value': 'FraudDetection'},
                ]
            }
        )
        
        print(f"✓ S3 bucket created: {bucket_name}")
        return bucket_name
    
    except ClientError as e:
        if e.response['Error']['Code'] == 'BucketAlreadyOwnedByYou':
            print(f"  Bucket already exists: {bucket_name}")
            return bucket_name
        else:
            print(f"✗ Failed to create S3 bucket: {e}")
            raise


def upload_scam_patterns(s3_client: Any, bucket_name: str) -> List[str]:
    """
    Upload initial scam pattern documents to S3.
    
    Args:
        s3_client: Boto3 S3 client
        bucket_name: S3 bucket name
        
    Returns:
        List of uploaded file keys
    """
    print(f"Uploading scam pattern documents...")
    
    # Define scam patterns
    scam_patterns = [
        {
            "pattern_id": "irs-scam-001",
            "pattern_type": "IRS Scam",
            "language": "en",
            "description": "Caller impersonates IRS agent demanding immediate payment for back taxes",
            "indicators": [
                "threatening arrest or legal action",
                "demanding immediate payment",
                "requesting gift cards or wire transfer",
                "claiming tax debt or unpaid taxes",
                "using aggressive or threatening tone"
            ],
            "example_scripts": [
                "This is the IRS calling about your unpaid taxes. You owe $5,000 and must pay immediately or you will be arrested.",
                "We have a warrant for your arrest due to tax fraud. Pay now to avoid legal consequences.",
                "Your Social Security number will be suspended if you don't pay your tax debt today."
            ],
            "severity": "high",
            "common_payment_methods": ["gift cards", "wire transfer", "prepaid debit cards"]
        },
        {
            "pattern_id": "tech-support-scam-001",
            "pattern_type": "Tech Support Scam",
            "language": "en",
            "description": "Caller claims to be from Microsoft/Apple/Google tech support reporting computer virus",
            "indicators": [
                "claiming computer has virus or malware",
                "requesting remote access to computer",
                "asking for payment for tech support services",
                "using technical jargon to confuse victim",
                "creating sense of urgency about computer security"
            ],
            "example_scripts": [
                "This is Microsoft tech support. We detected a virus on your computer and need remote access to fix it.",
                "Your computer is sending us error messages. We need to connect remotely to resolve the issue.",
                "We've detected suspicious activity on your Windows license. Pay $299 for our protection service."
            ],
            "severity": "high",
            "common_payment_methods": ["credit card", "gift cards", "wire transfer"]
        },
        {
            "pattern_id": "grandparent-scam-001",
            "pattern_type": "Grandparent Scam",
            "language": "en",
            "description": "Caller pretends to be grandchild in emergency needing money",
            "indicators": [
                "claiming to be family member in trouble",
                "requesting money for emergency (bail, medical, travel)",
                "asking victim not to tell other family members",
                "creating emotional urgency",
                "requesting unusual payment methods"
            ],
            "example_scripts": [
                "Grandma, it's me! I'm in trouble and need money for bail. Please don't tell Mom and Dad.",
                "I was in a car accident and need money for repairs. Can you wire me $2,000?",
                "I'm stranded in another country and lost my wallet. Please send money urgently."
            ],
            "severity": "high",
            "common_payment_methods": ["wire transfer", "gift cards", "money order"]
        },
        {
            "pattern_id": "lottery-scam-001",
            "pattern_type": "Lottery Scam",
            "language": "en",
            "description": "Caller claims victim won lottery or prize but must pay fees first",
            "indicators": [
                "claiming victim won lottery or sweepstakes",
                "requesting payment for taxes or processing fees",
                "asking for bank account information",
                "creating excitement and urgency",
                "requesting payment before receiving prize"
            ],
            "example_scripts": [
                "Congratulations! You've won $1 million in the Publishers Clearing House sweepstakes. Pay $500 in taxes to claim your prize.",
                "You're the lucky winner of our grand prize! Just send us $200 for processing fees.",
                "We need your bank account number to deposit your $50,000 prize winnings."
            ],
            "severity": "medium",
            "common_payment_methods": ["wire transfer", "gift cards", "bank account information"]
        },
        {
            "pattern_id": "romance-scam-001",
            "pattern_type": "Romance Scam",
            "language": "en",
            "description": "Caller builds romantic relationship then requests money for emergency",
            "indicators": [
                "professing love or strong feelings quickly",
                "requesting money for emergency or travel",
                "claiming to be overseas or unable to meet in person",
                "asking for financial help repeatedly",
                "avoiding video calls or in-person meetings"
            ],
            "example_scripts": [
                "I love you so much. I need money for a plane ticket to come see you.",
                "I'm stuck overseas and need money for medical treatment. Please help me.",
                "My business deal fell through. Can you lend me money until I get back on my feet?"
            ],
            "severity": "high",
            "common_payment_methods": ["wire transfer", "gift cards", "cryptocurrency"]
        }
    ]
    
    uploaded_keys = []
    
    for pattern in scam_patterns:
        key = f"patterns/{pattern['pattern_id']}.json"
        
        try:
            s3_client.put_object(
                Bucket=bucket_name,
                Key=key,
                Body=json.dumps(pattern, indent=2),
                ContentType='application/json',
                Metadata={
                    'pattern-type': pattern['pattern_type'],
                    'language': pattern['language'],
                    'severity': pattern['severity']
                }
            )
            
            uploaded_keys.append(key)
            print(f"  ✓ Uploaded: {key}")
        
        except ClientError as e:
            print(f"  ✗ Failed to upload {key}: {e}")
            raise
    
    print(f"✓ Uploaded {len(uploaded_keys)} scam pattern documents")
    return uploaded_keys


def create_opensearch_collection(
    opensearch_client: Any,
    collection_name: str
) -> str:
    """
    Create OpenSearch Serverless collection for vector store.
    
    Args:
        opensearch_client: Boto3 OpenSearch Serverless client
        collection_name: Name for the collection
        
    Returns:
        Collection ARN
    """
    print(f"Creating OpenSearch Serverless collection: {collection_name}")
    
    try:
        response = opensearch_client.create_collection(
            name=collection_name,
            type='VECTORSEARCH',
            description='Vector store for VocalShield scam patterns'
        )
        
        collection_id = response['createCollectionDetail']['id']
        collection_arn = response['createCollectionDetail']['arn']
        
        print(f"✓ OpenSearch collection created")
        print(f"  Collection ID: {collection_id}")
        print(f"  Collection ARN: {collection_arn}")
        
        # Wait for collection to become active
        print("  Waiting for collection to become active (this may take a few minutes)...")
        max_wait_time = 600  # 10 minutes
        wait_interval = 30  # 30 seconds
        elapsed_time = 0
        
        while elapsed_time < max_wait_time:
            time.sleep(wait_interval)
            elapsed_time += wait_interval
            
            response = opensearch_client.batch_get_collection(ids=[collection_id])
            if response['collectionDetails']:
                status = response['collectionDetails'][0]['status']
                print(f"  Collection status: {status} (waited {elapsed_time}s)")
                
                if status == 'ACTIVE':
                    print(f"✓ Collection is active")
                    break
                elif status == 'FAILED':
                    raise Exception("Collection creation failed")
        
        return collection_arn
    
    except ClientError as e:
        print(f"✗ Failed to create OpenSearch collection: {e}")
        raise


def create_knowledge_base(
    bedrock_agent_client: Any,
    kb_name: str,
    kb_role_arn: str,
    s3_bucket_name: str,
    collection_arn: str
) -> Dict[str, Any]:
    """
    Create Bedrock Knowledge Base.
    
    Args:
        bedrock_agent_client: Boto3 Bedrock Agent client
        kb_name: Name for the Knowledge Base
        kb_role_arn: ARN of the IAM role for the Knowledge Base
        s3_bucket_name: S3 bucket containing documents
        collection_arn: OpenSearch collection ARN
        
    Returns:
        Dictionary containing Knowledge Base details
    """
    print(f"Creating Bedrock Knowledge Base: {kb_name}")
    
    try:
        response = bedrock_agent_client.create_knowledge_base(
            name=kb_name,
            description=KB_DESCRIPTION,
            roleArn=kb_role_arn,
            knowledgeBaseConfiguration={
                'type': 'VECTOR',
                'vectorKnowledgeBaseConfiguration': {
                    'embeddingModelArn': EMBEDDING_MODEL_ARN
                }
            },
            storageConfiguration={
                'type': 'OPENSEARCH_SERVERLESS',
                'opensearchServerlessConfiguration': {
                    'collectionArn': collection_arn,
                    'vectorIndexName': 'vocalshield-scam-patterns',
                    'fieldMapping': {
                        'vectorField': 'embedding',
                        'textField': 'text',
                        'metadataField': 'metadata'
                    }
                }
            }
        )
        
        kb_id = response['knowledgeBase']['knowledgeBaseId']
        kb_arn = response['knowledgeBase']['knowledgeBaseArn']
        kb_status = response['knowledgeBase']['status']
        
        print(f"✓ Knowledge Base created")
        print(f"  KB ID: {kb_id}")
        print(f"  KB ARN: {kb_arn}")
        print(f"  Status: {kb_status}")
        
        return {
            'kb_id': kb_id,
            'kb_arn': kb_arn,
            'kb_status': kb_status
        }
    
    except ClientError as e:
        print(f"✗ Failed to create Knowledge Base: {e}")
        raise


def create_data_source(
    bedrock_agent_client: Any,
    kb_id: str,
    s3_bucket_name: str
) -> str:
    """
    Create data source for the Knowledge Base.
    
    Args:
        bedrock_agent_client: Boto3 Bedrock Agent client
        kb_id: Knowledge Base ID
        s3_bucket_name: S3 bucket containing documents
        
    Returns:
        Data source ID
    """
    print(f"Creating data source for Knowledge Base...")
    
    try:
        response = bedrock_agent_client.create_data_source(
            knowledgeBaseId=kb_id,
            name='ScamPatterns-S3',
            description='S3 data source for scam pattern documents',
            dataSourceConfiguration={
                'type': 'S3',
                's3Configuration': {
                    'bucketArn': f'arn:aws:s3:::{s3_bucket_name}'
                }
            }
        )
        
        data_source_id = response['dataSource']['dataSourceId']
        
        print(f"✓ Data source created: {data_source_id}")
        return data_source_id
    
    except ClientError as e:
        print(f"✗ Failed to create data source: {e}")
        raise


def start_ingestion_job(
    bedrock_agent_client: Any,
    kb_id: str,
    data_source_id: str
) -> None:
    """
    Start ingestion job to index documents.
    
    Args:
        bedrock_agent_client: Boto3 Bedrock Agent client
        kb_id: Knowledge Base ID
        data_source_id: Data source ID
    """
    print(f"Starting ingestion job...")
    
    try:
        response = bedrock_agent_client.start_ingestion_job(
            knowledgeBaseId=kb_id,
            dataSourceId=data_source_id
        )
        
        ingestion_job_id = response['ingestionJob']['ingestionJobId']
        print(f"✓ Ingestion job started: {ingestion_job_id}")
        print(f"  This will take a few minutes to complete.")
        
    except ClientError as e:
        print(f"✗ Failed to start ingestion job: {e}")
        raise


def create_kb_role(
    iam_client: Any,
    s3_bucket_name: str,
    collection_arn: str,
    region: str
) -> str:
    """
    Create IAM role for the Knowledge Base.
    
    Args:
        iam_client: Boto3 IAM client
        s3_bucket_name: S3 bucket name
        collection_arn: OpenSearch collection ARN
        region: AWS region
        
    Returns:
        ARN of the created IAM role
    """
    role_name = "VocalShield-KnowledgeBase-Role"
    
    print(f"Creating IAM role: {role_name}")
    
    # Trust policy
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "bedrock.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }
    
    try:
        response = iam_client.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description="IAM role for VocalShield Knowledge Base",
            Tags=[
                {'Key': 'Project', 'Value': 'VocalShield'},
                {'Key': 'Component', 'Value': 'FraudDetection'},
            ]
        )
        
        role_arn = response['Role']['Arn']
        print(f"✓ IAM role created: {role_arn}")
        
        # Attach policies
        policy_document = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "s3:GetObject",
                        "s3:ListBucket"
                    ],
                    "Resource": [
                        f"arn:aws:s3:::{s3_bucket_name}",
                        f"arn:aws:s3:::{s3_bucket_name}/*"
                    ]
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "aoss:APIAccessAll"
                    ],
                    "Resource": collection_arn
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "bedrock:InvokeModel"
                    ],
                    "Resource": EMBEDDING_MODEL_ARN
                }
            ]
        }
        
        iam_client.put_role_policy(
            RoleName=role_name,
            PolicyName="KnowledgeBaseAccess",
            PolicyDocument=json.dumps(policy_document)
        )
        
        print(f"✓ IAM policies attached")
        
        # Wait for role to propagate
        print("  Waiting for IAM role to propagate (10 seconds)...")
        time.sleep(10)
        
        return role_arn
    
    except ClientError as e:
        if e.response['Error']['Code'] == 'EntityAlreadyExists':
            print(f"  Role already exists, retrieving ARN...")
            response = iam_client.get_role(RoleName=role_name)
            return response['Role']['Arn']
        else:
            print(f"✗ Failed to create IAM role: {e}")
            raise


def main():
    parser = argparse.ArgumentParser(
        description="Set up Amazon Bedrock Knowledge Base for fraud detection"
    )
    parser.add_argument(
        '--region',
        default='us-east-1',
        help='AWS region (default: us-east-1)'
    )
    parser.add_argument(
        '--bucket-name',
        help='S3 bucket name (default: auto-generated)'
    )
    
    args = parser.parse_args()
    
    print("=" * 70)
    print("VocalShield Knowledge Base Setup")
    print("=" * 70)
    print()
    
    # Initialize AWS clients
    s3_client = boto3.client('s3', region_name=args.region)
    bedrock_agent_client = boto3.client('bedrock-agent', region_name=args.region)
    opensearch_client = boto3.client('opensearchserverless', region_name=args.region)
    iam_client = boto3.client('iam', region_name=args.region)
    sts_client = boto3.client('sts', region_name=args.region)
    
    # Get account ID
    account_id = sts_client.get_caller_identity()['Account']
    
    # Generate bucket name if not provided
    bucket_name = args.bucket_name or f"vocalshield-scam-patterns-{account_id}"
    collection_name = f"vocalshield-kb-{account_id}"
    
    print(f"AWS Account: {account_id}")
    print(f"Region: {args.region}")
    print(f"S3 Bucket: {bucket_name}")
    print(f"OpenSearch Collection: {collection_name}")
    print()
    
    try:
        # Step 1: Create S3 bucket
        create_s3_bucket(s3_client, bucket_name, args.region)
        print()
        
        # Step 2: Upload scam patterns
        upload_scam_patterns(s3_client, bucket_name)
        print()
        
        # Step 3: Create OpenSearch collection
        collection_arn = create_opensearch_collection(opensearch_client, collection_name)
        print()
        
        # Step 4: Create IAM role
        kb_role_arn = create_kb_role(iam_client, bucket_name, collection_arn, args.region)
        print()
        
        # Step 5: Create Knowledge Base
        kb_details = create_knowledge_base(
            bedrock_agent_client,
            KB_NAME,
            kb_role_arn,
            bucket_name,
            collection_arn
        )
        print()
        
        # Step 6: Create data source
        data_source_id = create_data_source(
            bedrock_agent_client,
            kb_details['kb_id'],
            bucket_name
        )
        print()
        
        # Step 7: Start ingestion job
        start_ingestion_job(
            bedrock_agent_client,
            kb_details['kb_id'],
            data_source_id
        )
        print()
        
        # Output configuration
        print("=" * 70)
        print("Setup Complete!")
        print("=" * 70)
        print()
        print("Knowledge Base Details:")
        print(f"  KB ID: {kb_details['kb_id']}")
        print(f"  S3 Bucket: {bucket_name}")
        print(f"  OpenSearch Collection: {collection_name}")
        print()
        print("Next steps:")
        print(f"  1. Wait for ingestion job to complete (check AWS Console)")
        print(f"  2. Run setup_bedrock_agent.py with --knowledge-base-id {kb_details['kb_id']}")
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
