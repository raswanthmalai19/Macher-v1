#!/usr/bin/env python3
"""
Bedrock Agent Setup Script

This script creates and configures an Amazon Bedrock Agent for fraud detection.
The agent uses Claude 3.5 Sonnet and is connected to a Knowledge Base containing
scam patterns.

Requirements: 1.1, 1.2, 1.3

Usage:
    python setup_bedrock_agent.py --knowledge-base-id <kb-id> --region us-east-1
"""

import argparse
import json
import sys
import time
from typing import Dict, Any

import boto3
from botocore.exceptions import ClientError


# Agent configuration
AGENT_NAME = "VocalShield-FraudDetection"
AGENT_DESCRIPTION = (
    "Expert fraud analyst that analyzes phone call transcripts to identify "
    "scam patterns, urgency tactics, and financial demands in real-time."
)

# Model configuration
MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0"

# Agent instructions (persona and guidelines)
AGENT_INSTRUCTIONS = """You are an expert fraud analyst specializing in phone scam detection. Your role is to analyze phone call transcripts in real-time to identify potential fraud and scam attempts.

## Your Expertise

You have deep knowledge of:
- Common scam patterns (IRS scams, tech support scams, grandparent scams, lottery scams, romance scams)
- Social engineering tactics and psychological manipulation techniques
- Urgency and pressure tactics used by scammers
- Financial fraud indicators and unusual payment methods
- Multi-segment conversation analysis and escalation patterns

## Analysis Guidelines

When analyzing a transcript segment, you must:

1. **Identify Scam Patterns**: Match the conversation against known scam patterns from the Knowledge Base
2. **Detect Urgency Indicators**: Look for time pressure, threats, and pressure tactics
3. **Detect Financial Demands**: Identify requests for payment or financial information
4. **Assess Unusual Payment Methods**: Flag gift cards, cryptocurrency, wire transfers, cash payments
5. **Analyze Context**: Consider previous conversation segments to detect escalation and inconsistencies
6. **Calculate Fraud Score**: Assign a score from 0-100 based on detected indicators
7. **Determine Confidence**: Assess your confidence in the analysis (0-100)
8. **Generate Explanation**: Provide a clear, human-readable explanation for non-technical users

## Fraud Scoring Algorithm

Calculate the fraud score using these components:

- **Pattern Match Score (0-40 points)**: Direct match with known scam pattern (+40), partial match (+20), multiple patterns (+10 each)
- **Urgency Score (0-25 points)**: Time pressure language (+15), threat language (+20), multiple urgency indicators (+25)
- **Financial Demand Score (0-30 points)**: Payment information request (+20), unusual payment method (+30), immediate payment request (+25)
- **Inconsistency Score (0-15 points)**: Story inconsistencies (+10), contradictory information (+15)
- **Context Escalation Score (0-10 points)**: Fraud score increasing across segments (+10), multiple threat indicators accumulating (+10)

Total fraud score = min(100, sum of all component scores)

## Threat Level Mapping

- **Safe (0-30)**: No significant fraud indicators
- **Caution (31-60)**: Some warning signs, user should be cautious
- **Danger (61-100)**: Strong fraud indicators, user should hang up immediately

## Response Format

You must respond in the following JSON format:

```json
{
  "fraud_score": <0-100>,
  "confidence_score": <0-100>,
  "threat_level": "<Safe|Caution|Danger>",
  "detected_patterns": [
    {
      "pattern_type": "<pattern name>",
      "confidence": <0.0-1.0>,
      "matched_indicators": ["<indicator1>", "<indicator2>"]
    }
  ],
  "urgency_detected": <true|false>,
  "urgency_phrases": ["<phrase1>", "<phrase2>"],
  "financial_demand_detected": <true|false>,
  "financial_phrases": ["<phrase1>", "<phrase2>"],
  "financial_demand_type": "<gift card|cryptocurrency|wire transfer|cash|null>",
  "explanation": "<human-readable explanation>",
  "reasoning": "<detailed analysis reasoning>"
}
```

## Important Principles

- **Privacy First**: Never store or log PII - all transcripts are pre-redacted
- **User Safety**: Prioritize user protection - err on the side of caution
- **Clear Communication**: Explanations must be understandable by elderly users
- **Evidence-Based**: Base your analysis on concrete indicators, not speculation
- **Context-Aware**: Consider the full conversation history when available
- **Actionable**: Provide clear guidance on what the user should do

Remember: Your analysis could save someone from losing their life savings. Be thorough, accurate, and clear.
"""


def create_bedrock_agent(
    bedrock_agent_client: Any,
    agent_name: str,
    knowledge_base_id: str,
    agent_resource_role_arn: str
) -> Dict[str, Any]:
    """
    Create a Bedrock Agent for fraud detection.
    
    Args:
        bedrock_agent_client: Boto3 Bedrock Agent client
        agent_name: Name for the agent
        knowledge_base_id: ID of the Knowledge Base to connect
        agent_resource_role_arn: ARN of the IAM role for the agent
        
    Returns:
        Dictionary containing agent details (agent_id, agent_arn, agent_status)
    """
    print(f"Creating Bedrock Agent: {agent_name}")
    
    try:
        response = bedrock_agent_client.create_agent(
            agentName=agent_name,
            description=AGENT_DESCRIPTION,
            foundationModel=MODEL_ID,
            instruction=AGENT_INSTRUCTIONS,
            agentResourceRoleArn=agent_resource_role_arn,
            idleSessionTTLInSeconds=600,  # 10 minutes
        )
        
        agent_id = response['agent']['agentId']
        agent_arn = response['agent']['agentArn']
        agent_status = response['agent']['agentStatus']
        
        print(f"✓ Agent created successfully")
        print(f"  Agent ID: {agent_id}")
        print(f"  Agent ARN: {agent_arn}")
        print(f"  Status: {agent_status}")
        
        return {
            'agent_id': agent_id,
            'agent_arn': agent_arn,
            'agent_status': agent_status
        }
    
    except ClientError as e:
        print(f"✗ Failed to create agent: {e}")
        raise


def associate_knowledge_base(
    bedrock_agent_client: Any,
    agent_id: str,
    knowledge_base_id: str
) -> None:
    """
    Associate a Knowledge Base with the Bedrock Agent.
    
    Args:
        bedrock_agent_client: Boto3 Bedrock Agent client
        agent_id: ID of the agent
        knowledge_base_id: ID of the Knowledge Base to associate
    """
    print(f"Associating Knowledge Base {knowledge_base_id} with agent...")
    
    try:
        bedrock_agent_client.associate_agent_knowledge_base(
            agentId=agent_id,
            agentVersion='DRAFT',
            knowledgeBaseId=knowledge_base_id,
            description="Scam pattern database for fraud detection",
            knowledgeBaseState='ENABLED'
        )
        
        print(f"✓ Knowledge Base associated successfully")
    
    except ClientError as e:
        print(f"✗ Failed to associate Knowledge Base: {e}")
        raise


def prepare_agent(
    bedrock_agent_client: Any,
    agent_id: str
) -> None:
    """
    Prepare the agent (compile and validate).
    
    Args:
        bedrock_agent_client: Boto3 Bedrock Agent client
        agent_id: ID of the agent
    """
    print(f"Preparing agent (this may take a few minutes)...")
    
    try:
        response = bedrock_agent_client.prepare_agent(
            agentId=agent_id
        )
        
        agent_status = response['agentStatus']
        print(f"  Agent status: {agent_status}")
        
        # Wait for agent to be prepared
        max_wait_time = 300  # 5 minutes
        wait_interval = 10  # 10 seconds
        elapsed_time = 0
        
        while agent_status in ['CREATING', 'PREPARING', 'UPDATING'] and elapsed_time < max_wait_time:
            time.sleep(wait_interval)
            elapsed_time += wait_interval
            
            response = bedrock_agent_client.get_agent(agentId=agent_id)
            agent_status = response['agent']['agentStatus']
            print(f"  Agent status: {agent_status} (waited {elapsed_time}s)")
        
        if agent_status == 'PREPARED':
            print(f"✓ Agent prepared successfully")
        elif agent_status == 'FAILED':
            print(f"✗ Agent preparation failed")
            raise Exception("Agent preparation failed")
        else:
            print(f"⚠ Agent preparation timed out (status: {agent_status})")
    
    except ClientError as e:
        print(f"✗ Failed to prepare agent: {e}")
        raise


def create_agent_alias(
    bedrock_agent_client: Any,
    agent_id: str,
    alias_name: str = "production"
) -> Dict[str, Any]:
    """
    Create an alias for the agent.
    
    Args:
        bedrock_agent_client: Boto3 Bedrock Agent client
        agent_id: ID of the agent
        alias_name: Name for the alias (default: "production")
        
    Returns:
        Dictionary containing alias details (alias_id, alias_arn)
    """
    print(f"Creating agent alias: {alias_name}")
    
    try:
        response = bedrock_agent_client.create_agent_alias(
            agentId=agent_id,
            agentAliasName=alias_name,
            description=f"Production alias for {AGENT_NAME}"
        )
        
        alias_id = response['agentAlias']['agentAliasId']
        alias_arn = response['agentAlias']['agentAliasArn']
        
        print(f"✓ Agent alias created successfully")
        print(f"  Alias ID: {alias_id}")
        print(f"  Alias ARN: {alias_arn}")
        
        return {
            'alias_id': alias_id,
            'alias_arn': alias_arn
        }
    
    except ClientError as e:
        print(f"✗ Failed to create agent alias: {e}")
        raise


def create_agent_role(iam_client: Any, region: str, account_id: str) -> str:
    """
    Create IAM role for the Bedrock Agent.
    
    Args:
        iam_client: Boto3 IAM client
        region: AWS region
        account_id: AWS account ID
        
    Returns:
        ARN of the created IAM role
    """
    role_name = f"VocalShield-BedrockAgent-Role"
    
    print(f"Creating IAM role: {role_name}")
    
    # Trust policy for Bedrock
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
            Description="IAM role for VocalShield Bedrock Agent",
            Tags=[
                {'Key': 'Project', 'Value': 'VocalShield'},
                {'Key': 'Component', 'Value': 'FraudDetection'},
            ]
        )
        
        role_arn = response['Role']['Arn']
        print(f"✓ IAM role created: {role_arn}")
        
        # Attach policy for Bedrock model invocation
        policy_document = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "bedrock:InvokeModel"
                    ],
                    "Resource": f"arn:aws:bedrock:{region}::foundation-model/{MODEL_ID}"
                }
            ]
        }
        
        iam_client.put_role_policy(
            RoleName=role_name,
            PolicyName="BedrockModelInvocation",
            PolicyDocument=json.dumps(policy_document)
        )
        
        print(f"✓ IAM policy attached")
        
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
        description="Set up Amazon Bedrock Agent for fraud detection"
    )
    parser.add_argument(
        '--knowledge-base-id',
        required=True,
        help='ID of the Knowledge Base to connect to the agent'
    )
    parser.add_argument(
        '--region',
        default='us-east-1',
        help='AWS region (default: us-east-1)'
    )
    parser.add_argument(
        '--alias-name',
        default='production',
        help='Name for the agent alias (default: production)'
    )
    
    args = parser.parse_args()
    
    print("=" * 70)
    print("VocalShield Bedrock Agent Setup")
    print("=" * 70)
    print()
    
    # Initialize AWS clients
    bedrock_agent_client = boto3.client('bedrock-agent', region_name=args.region)
    iam_client = boto3.client('iam', region_name=args.region)
    sts_client = boto3.client('sts', region_name=args.region)
    
    # Get account ID
    account_id = sts_client.get_caller_identity()['Account']
    print(f"AWS Account: {account_id}")
    print(f"Region: {args.region}")
    print()
    
    try:
        # Step 1: Create IAM role for agent
        agent_role_arn = create_agent_role(iam_client, args.region, account_id)
        print()
        
        # Step 2: Create Bedrock Agent
        agent_details = create_bedrock_agent(
            bedrock_agent_client,
            AGENT_NAME,
            args.knowledge_base_id,
            agent_role_arn
        )
        print()
        
        # Step 3: Associate Knowledge Base
        associate_knowledge_base(
            bedrock_agent_client,
            agent_details['agent_id'],
            args.knowledge_base_id
        )
        print()
        
        # Step 4: Prepare agent
        prepare_agent(bedrock_agent_client, agent_details['agent_id'])
        print()
        
        # Step 5: Create agent alias
        alias_details = create_agent_alias(
            bedrock_agent_client,
            agent_details['agent_id'],
            args.alias_name
        )
        print()
        
        # Output configuration for CDK
        print("=" * 70)
        print("Setup Complete!")
        print("=" * 70)
        print()
        print("Add these values to your CDK configuration:")
        print()
        print(f"BEDROCK_AGENT_ID={agent_details['agent_id']}")
        print(f"BEDROCK_AGENT_ALIAS_ID={alias_details['alias_id']}")
        print()
        print("You can now deploy the fraud detection infrastructure with CDK.")
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
