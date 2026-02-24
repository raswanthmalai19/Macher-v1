# VocalShield AI-Powered Fraud Detection

Real-time phone call fraud detection using Amazon Bedrock Agents with Claude 3.5 Sonnet.

## Overview

The VocalShield fraud detection system analyzes phone call transcripts in real-time to identify scam patterns, urgency tactics, and financial demands. It uses Amazon Bedrock Agents connected to a Knowledge Base of known scam patterns, with PII protection via Bedrock Guardrails.

### Key Features

- **Real-time Analysis**: Processes transcript segments as they arrive (<2 seconds latency)
- **Privacy-First**: Automatic PII redaction before analysis
- **Context-Aware**: Maintains conversation history across segments
- **Pattern Detection**: Identifies known scam patterns (IRS, tech support, grandparent, lottery, romance scams)
- **Multi-Language Support**: English, Spanish, Mandarin, Hindi, French
- **Threat Scoring**: 0-100 fraud score with Safe/Caution/Danger levels
- **Actionable Explanations**: Clear, non-technical explanations for users

### Architecture

```
Transcript → Guardrails (PII Redaction) → Bedrock Agent → Analysis Result
                ↓                              ↓
         Context Store                  Knowledge Base
```

## Prerequisites

- AWS Account with Bedrock access
- Python 3.12+
- AWS CLI configured
- AWS CDK CLI installed
- Node.js 20.x (for CDK)

### AWS Service Requirements

- Amazon Bedrock (Claude 3.5 Sonnet model access)
- Amazon Bedrock Agents
- Amazon Bedrock Knowledge Bases
- Amazon Bedrock Guardrails
- AWS Lambda
- Amazon DynamoDB
- Amazon API Gateway
- Amazon S3
- Amazon OpenSearch Serverless

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/your-org/vocalshield.git
cd vocalshield/lambda/fraud-detection
```

### 2. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 3. Set Up Environment Variables

```bash
cp .env.example .env
# Edit .env with your configuration
```

## Setup Guide

### Step 1: Set Up Bedrock Guardrails

Create guardrails for PII detection and redaction:

```bash
cd scripts
python setup_guardrails.py --region us-east-1
```

This will:
- Create a Bedrock Guardrail with PII filters
- Configure anonymization for 15+ PII types
- Test the guardrail with sample data
- Output `GUARDRAIL_ID` and `GUARDRAIL_VERSION`

**Save the output values** - you'll need them for later steps.

### Step 2: Set Up Knowledge Base

Create the Knowledge Base with scam patterns:

```bash
python setup_knowledge_base.py --region us-east-1
```

This will:
- Create an S3 bucket for scam pattern documents
- Upload initial scam patterns (IRS, tech support, grandparent, lottery, romance scams)
- Create an OpenSearch Serverless collection
- Create the Bedrock Knowledge Base
- Start the ingestion job

**Wait for the ingestion job to complete** (5-10 minutes). Check status in AWS Console:
- Navigate to Amazon Bedrock → Knowledge Bases
- Select "VocalShield-ScamPatterns"
- Check "Data sources" tab for ingestion status

**Save the Knowledge Base ID** from the output.

### Step 3: Set Up Bedrock Agent

Create the Bedrock Agent connected to the Knowledge Base:

```bash
python setup_bedrock_agent.py \
  --knowledge-base-id <KB_ID_FROM_STEP_2> \
  --region us-east-1
```

This will:
- Create an IAM role for the agent
- Create the Bedrock Agent with Claude 3.5 Sonnet
- Associate the Knowledge Base
- Prepare the agent
- Create a production alias

**Save the Agent ID and Alias ID** from the output.

### Step 4: Deploy Infrastructure with CDK

You have two options for deploying the infrastructure:

#### Option A: Python CDK (Standalone Fraud Detection)

Deploy just the fraud detection infrastructure using Python CDK:

```bash
# Install CDK dependencies
pip install -r requirements-cdk.txt

# Set environment variables
export BEDROCK_AGENT_ID=<agent_id>
export BEDROCK_AGENT_ALIAS_ID=<alias_id>
export GUARDRAIL_ID=<guardrail_id>
export GUARDRAIL_VERSION=<version>
export KNOWLEDGE_BASE_ID=<kb_id>
export NOTIFICATION_SERVICE_URL=<optional_notification_url>

# Bootstrap CDK (first time only)
cdk bootstrap aws://<account-id>/us-east-1

# Deploy the stack
cdk deploy --app "python3 app.py"
```

#### Option B: TypeScript CDK (Full VocalShield Stack)

Deploy as part of the complete VocalShield infrastructure:

```bash
# Navigate to project root
cd ../../..

# Set environment variables
export BEDROCK_AGENT_ID=<agent_id>
export BEDROCK_AGENT_ALIAS_ID=<alias_id>
export GUARDRAIL_ID=<guardrail_id>
export GUARDRAIL_VERSION=<version>
export KNOWLEDGE_BASE_ID=<kb_id>

# Deploy the stack
npm install
cdk bootstrap  # First time only
cdk deploy --context environment=dev
```

Both options create:
- DynamoDB table for conversation context (24-hour TTL)
- Lambda function for fraud analysis (Python 3.12, ARM64)
- API Gateway REST API with /analyze endpoint
- CloudWatch alarms and monitoring

**Save the API endpoint** from the CDK output.

## Usage

### API Endpoint

```
POST /analyze
```

### Request Format

```json
{
  "call_id": "unique-call-identifier",
  "segment_id": "unique-segment-identifier",
  "transcript_text": "This is the IRS calling about your unpaid taxes...",
  "timestamp": 1234567890.0,
  "language": "en"
}
```

### Response Format

```json
{
  "call_id": "unique-call-identifier",
  "segment_id": "unique-segment-identifier",
  "timestamp": 1234567890.0,
  "fraud_score": 85,
  "confidence_score": 90,
  "threat_level": "Danger",
  "detected_patterns": [
    {
      "pattern_id": "irs-scam-001",
      "pattern_type": "IRS Scam",
      "description": "Caller impersonates IRS agent demanding immediate payment",
      "confidence": 0.95,
      "matched_indicators": [
        "threatening arrest",
        "demanding immediate payment",
        "requesting gift cards"
      ]
    }
  ],
  "urgency_detected": true,
  "financial_demand_detected": true,
  "financial_demand_type": "gift card",
  "explanation": "🚨 DANGER: This call shows strong indicators of a scam attempt...",
  "language": "en",
  "processing_time_ms": 1250
}
```

### Example Usage

```bash
curl -X POST https://your-api-endpoint/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "call-123",
    "segment_id": "seg-1",
    "transcript_text": "This is the IRS. You owe $5000 in back taxes. Pay immediately with gift cards or you will be arrested.",
    "timestamp": 1234567890.0,
    "language": "en"
  }'
```

## Testing

### Run Unit Tests

```bash
cd lambda/fraud-detection
pytest tests/unit/ -v
```

### Run Property-Based Tests

```bash
pytest tests/properties/ -v
```

### Run Integration Tests

```bash
pytest tests/integration/ -v
```

### Run All Tests with Coverage

```bash
pytest --cov=src --cov-report=html --cov-report=term
```

### Test Coverage Goals

- Line Coverage: ≥80%
- Branch Coverage: ≥75%
- All 26 correctness properties tested

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `CONTEXT_TABLE_NAME` | DynamoDB table for context | Yes | - |
| `BEDROCK_AGENT_ID` | Bedrock Agent ID | Yes | - |
| `BEDROCK_AGENT_ALIAS_ID` | Bedrock Agent Alias ID | Yes | - |
| `GUARDRAIL_ID` | Bedrock Guardrail ID | Yes | - |
| `GUARDRAIL_VERSION` | Guardrail version | Yes | - |
| `KNOWLEDGE_BASE_ID` | Knowledge Base ID | Yes | - |
| `AWS_REGION` | AWS region | No | us-east-1 |
| `ENVIRONMENT` | Environment name | No | dev |

### Supported Languages

- `en` - English
- `es` - Spanish
- `zh` - Mandarin Chinese
- `hi` - Hindi
- `fr` - French

## Monitoring

### CloudWatch Metrics

- `AnalysisRequests` - Total analysis requests
- `AnalysisLatency` - P50, P95, P99 latency
- `FraudScoreDistribution` - Distribution of fraud scores
- `ThreatLevelCounts` - Count by threat level
- `ErrorRate` - Analysis errors

### CloudWatch Alarms

- High error rate (>5% of requests)
- High latency (P99 >2 seconds)
- API Gateway 5xx errors

### CloudWatch Logs

All logs are structured JSON with:
- `timestamp` - ISO 8601 timestamp
- `level` - INFO, WARN, ERROR
- `component` - Component name
- `message` - Log message
- `requestId` - Request correlation ID

## Cost Optimization

### Estimated Costs per Analysis

- Claude 3.5 Sonnet input: ~$0.0006 (200 tokens)
- Claude 3.5 Sonnet output: ~$0.0015 (100 tokens)
- Guardrails: ~$0.00075 (1 content unit)
- Knowledge Base query: ~$0.0001
- **Total: ~$0.00295** (within $0.003 target)

### Free Tier Usage

- Lambda: 1M requests/month, 400K GB-seconds
- DynamoDB: 25 GB storage, 25 RCU/WCU
- API Gateway: 1M requests/month
- Bedrock: $200 competition credits

### Cost Monitoring

- CloudWatch billing alarms configured
- Daily cost tracking enabled
- Budget alerts at 80% and 100%

## Troubleshooting

### Common Issues

#### 1. Bedrock Access Denied

**Error**: `AccessDeniedException: User is not authorized to perform: bedrock:InvokeAgent`

**Solution**: Request Bedrock model access in AWS Console:
- Navigate to Amazon Bedrock → Model access
- Request access to Claude 3.5 Sonnet
- Wait for approval (usually instant)

#### 2. Knowledge Base Ingestion Failed

**Error**: Ingestion job status shows "FAILED"

**Solution**:
- Check S3 bucket permissions
- Verify IAM role has correct policies
- Check CloudWatch logs for detailed error
- Re-run ingestion job

#### 3. High Latency

**Symptom**: Analysis takes >2 seconds

**Solutions**:
- Check Bedrock API throttling
- Verify Lambda memory allocation (1024 MB recommended)
- Review Knowledge Base query performance
- Check DynamoDB read capacity

#### 4. PII Not Redacted

**Symptom**: PII appears in stored context

**Solutions**:
- Verify Guardrail is configured correctly
- Check Guardrail version is correct
- Test Guardrail with sample data
- Review Lambda logs for Guardrail errors

## Development

### Project Structure

```
lambda/fraud-detection/
├── src/
│   ├── __init__.py
│   ├── models.py                 # Data models
│   ├── fraud_scoring.py          # Fraud scoring functions
│   ├── explanation_generator.py  # Explanation generation
│   ├── notification_trigger.py   # Notification system
│   ├── guardrails_client.py      # Guardrails integration
│   ├── context_store.py          # DynamoDB context storage
│   ├── knowledge_base.py         # Knowledge Base integration
│   ├── bedrock_agent.py          # Bedrock Agent client
│   ├── fraud_analyzer.py         # Main analysis orchestration
│   └── lambda_handler.py         # Lambda entry point
├── tests/
│   ├── unit/                     # Unit tests
│   ├── properties/               # Property-based tests
│   └── integration/              # Integration tests
├── scripts/
│   ├── setup_guardrails.py       # Guardrails setup
│   ├── setup_knowledge_base.py   # Knowledge Base setup
│   └── setup_bedrock_agent.py    # Agent setup
├── requirements.txt              # Python dependencies
├── pytest.ini                    # Pytest configuration
└── README.md                     # This file
```

### Adding New Scam Patterns

1. Create JSON document in S3 bucket:

```json
{
  "pattern_id": "new-scam-001",
  "pattern_type": "New Scam Type",
  "language": "en",
  "description": "Description of the scam",
  "indicators": ["indicator1", "indicator2"],
  "example_scripts": ["example1", "example2"],
  "severity": "high",
  "common_payment_methods": ["method1", "method2"]
}
```

2. Upload to S3:

```bash
aws s3 cp new-scam.json s3://your-bucket/patterns/
```

3. Trigger ingestion job:

```bash
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id <kb-id> \
  --data-source-id <ds-id>
```

### Running Locally

```bash
# Set environment variables
export CONTEXT_TABLE_NAME=local-test-table
export BEDROCK_AGENT_ID=your-agent-id
# ... other variables

# Run Lambda handler locally
python -c "from src.lambda_handler import handler; print(handler({'body': '{...}'}, {}))"
```

## Security

### PII Protection

- All transcripts are redacted before analysis
- 15+ PII types automatically anonymized
- No unredacted PII stored in DynamoDB or logs
- Guardrails enforce PII protection at API boundary

### IAM Permissions

Lambda function requires:
- `bedrock:InvokeAgent`
- `bedrock:Retrieve`
- `bedrock:ApplyGuardrail`
- `dynamodb:GetItem`
- `dynamodb:PutItem`
- `dynamodb:UpdateItem`

### Data Retention

- Conversation context: 24 hours (TTL)
- CloudWatch logs: 7 days
- No persistent audio storage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- GitHub Issues: https://github.com/your-org/vocalshield/issues
- Documentation: https://docs.vocalshield.com
- Email: support@vocalshield.com

## Acknowledgments

- Built for AWS 10,000 AIdeas Competition
- Developed using Kiro AI-assisted workflow
- Powered by Amazon Bedrock and Claude 3.5 Sonnet
