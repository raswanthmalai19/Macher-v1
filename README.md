# MACHER

> **Real-Time AI Voice Fraud Firewall** — An intelligent, privacy-first system that intercepts, analyzes, and neutralizes voice-based financial fraud and social engineering attacks before they succeed.

Built for the **AWS 10,000 AIdeas Competition** | Tracks: **Social Good · Daily Life Enhancement**

---

## What is MACHER?

MACHER is an agentic conversation firewall that listens to phone calls in real time, understands what is being said, and alerts users the moment a scammer attempts financial fraud. Unlike traditional spam filters that work on *who* is calling, MACHER works on *what* is being said — defeating number spoofing, AI voice deepfakes, and complex social engineering scripts that fool every existing solution.

Global voice fraud losses are projected to exceed **$80 billion by 2025**. Elderly individuals, immigrants, and digital novices are disproportionately targeted. MACHER democratizes enterprise-grade fraud detection and puts an **AI bodyguard** in every pocket.

---

## Key Features

| Feature | Description |
|---|---|
| **Real-Time Semantic Analysis** | Transcribes speech live and detects fraud patterns using Amazon Bedrock Agents |
| **AI Voice Deepfake Detection** | Identifies synthetic voices and voice-cloned impersonators |
| **Zero-Knowledge PII Handling** | Amazon Bedrock Guardrails redact credit card numbers, SSNs, and names before AI analysis — the model never sees your data |
| **Family Loop Alerts** | Instantly notifies trusted contacts via SNS the moment a high-confidence threat is detected |
| **Multi-Language Support** | Auto-detects call language and routes to the appropriate localized threat model |
| **5G Edge Deployment** | AWS Wavelength integration for sub-500ms analysis latency on supported carriers |
| **Privacy-First Architecture** | No raw audio ever stored — processing is ephemeral and on-device consent is required |

---

## Architecture Overview

```
Android Client (Kotlin + Accessibility Service)
        │
        ▼ PCM Audio Stream (WebSocket)
┌───────────────────────────────────────────────┐
│           AWS Wavelength Edge Node            │
│        (Low-latency 5G ingestion)             │
└───────────────────┬───────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────┐
│         API Gateway (WebSocket API)           │
│   Connect  │  Disconnect  │  Audio Processor  │
└───────────────────┬───────────────────────────┘
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
  Amazon Transcribe      DynamoDB
  Streaming API       (Session Metadata)
          │
          ▼
  Bedrock Guardrails ──► PII Redaction
          │
          ▼
  Bedrock Agent "FraudAnalyst"
  (RAG over scam script knowledge base)
          │
    ┌─────┴──────┐
    ▼            ▼
 EventBridge    SNS
 (event bus)  (Family Loop Alert)
    │
    ▼
 CloudWatch + X-Ray (observability)
```

---

## Tech Stack

**Infrastructure**
- AWS CDK (TypeScript) — all resources defined as code
- AWS Lambda (Node.js 20.x, ARM64) — serverless compute
- Amazon DynamoDB — session metadata with TTL
- API Gateway WebSocket — real-time bidirectional comms
- EventBridge + SQS — decoupled event-driven architecture
- Amazon SNS — push alert notifications

**AI / ML**
- Amazon Transcribe Streaming — live speech-to-text
- Amazon Bedrock Agents (Claude 3.5 Sonnet) — agentic fraud analysis
- Amazon Bedrock Guardrails — PII redaction and safety rails
- Amazon Bedrock Knowledge Bases — RAG on scam script corpus

**Mobile**
- Android (Kotlin) — Accessibility Service audio capture
- WebSocket client — direct stream to AWS edge

**Observability**
- Amazon CloudWatch — metrics, logs, and dashboards
- AWS X-Ray — distributed tracing across Lambda and Bedrock
- Structured JSON logging — queryable audit trail

---

## How the Fraud Analysis Works

MACHER's Bedrock Agent chains reasoning across four steps every time a new transcript segment arrives:

1. **Identify Topic** — What is this caller claiming to be?
2. **Assess Urgency** — Is there manufactured time pressure or fear?
3. **Check for Financial Demands** — Gift cards, wire transfers, OTPs?
4. **Determine Threat Level** — LOW / MEDIUM / HIGH / CRITICAL

> If confidence exceeds **85%**, the Family Loop SNS notification is triggered and a real-time overlay warning is shown to the user on-device.

---

## Privacy Model

MACHER is architected around a **Zero-Knowledge PII** principle:

- Raw audio is **never persisted** — it is streamed, transcribed, and discarded.
- PII types (credit card numbers, SSNs, account numbers, names) are **automatically masked** by Bedrock Guardrails *before* any LLM sees the text.
- The AI model only receives semantic metadata: `[CREDIT_CARD_NUMBER]`, not the actual digits.
- All processing requires explicit **on-device user consent**.
- Session data in DynamoDB has automatic **TTL expiration**.

---

## Getting Started

### Prerequisites

- Node.js 20.x or later
- npm 9.x or later
- AWS CLI v2 configured with credentials
- AWS CDK CLI 2.133.0 or later

```bash
npm install -g aws-cdk
aws configure
```

### Install

```bash
git clone https://github.com/raswanthmalai19/MACHER.git
cd MACHER
npm install
npm run build
```

### Deploy

```bash
# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy to dev
cdk deploy --context env=dev

# Deploy to production
cdk deploy --context env=production
```

### Run Tests

```bash
# Unit tests
npm test

# Property-based tests (100+ iterations per property)
npm run test:property

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

---

## Project Structure

```
MACHER/
├── bin/                        # CDK app entry point
├── lib/
│   ├── vocalshield-stack.ts    # Main CDK stack
│   ├── config/                 # Environment configs (dev / staging / prod)
│   ├── constructs/             # Reusable CDK constructs
│   └── monitoring/             # CloudWatch dashboards & alarms
├── lambda/
│   ├── connect/                # WebSocket connect handler
│   ├── disconnect/             # WebSocket disconnect handler
│   ├── audio-processor/        # Transcribe streaming + Bedrock invocation
│   ├── transcription-service/  # Core transcription logic with property tests
│   ├── fraud-detection/        # Python-based fraud scoring service
│   ├── slack-webhook/          # Ops alerting integration
│   └── investigation/          # Async fraud case logging
├── android/                    # Kotlin Android client
├── canaries/                   # CloudWatch Synthetic canaries
└── tests/
    ├── unit/
    ├── integration/
    └── property/               # Property-based tests
```

---

## Environments

| Environment | Configuration | Purpose |
|---|---|---|
| `dev` | `lib/config/dev.ts` | Local development & feature testing |
| `staging` | `lib/config/staging.ts` | Pre-production validation |
| `production` | `lib/config/production.ts` | Live deployment |

---

## Competition Context

MACHER was built for the **AWS 10,000 AIdeas Competition**, demonstrating mastery of:

- **Kiro Agentic Development** — Spec-driven design with EARS notation, Steering files, and Agent Hooks
- **Technical Innovation (34%)** — AWS Wavelength edge, Bedrock Agents, Transcribe Streaming, Guardrails
- **Implementation Quality (33%)** — Property-based testing (31 correctness properties), CDK IaC, structured observability
- **Market Impact (33%)** — Addresses $80B+ global voice fraud epidemic targeting vulnerable populations

---

## License

This project is licensed under the MIT License.

---

## Author

**Raswanth Malaisamy**  
GitHub: [@raswanthmalai19](https://github.com/raswanthmalai19)

## Overview

This project uses AWS CDK (Cloud Development Kit) with TypeScript to define and deploy the cloud infrastructure for VocalShield. The infrastructure is designed to be:

- **Cost-optimized**: Stays within AWS Free Tier limits
- **Serverless**: Auto-scaling without capacity planning
- **Secure**: Least privilege IAM, encryption at rest and in transit
- **Observable**: Comprehensive CloudWatch monitoring and logging
- **Event-driven**: Decoupled architecture using EventBridge and SQS

## Architecture

The infrastructure includes:

- **WebSocket API**: Real-time bidirectional communication via API Gateway
- **Lambda Functions**: Serverless compute for connection handling and audio processing
- **DynamoDB**: Metadata storage with automatic TTL expiration
- **SNS**: Fraud alert notifications to family members
- **EventBridge**: Event-driven architecture for decoupled processing
- **CloudWatch**: Monitoring, logging, and alerting
- **VPC**: Network foundation for future Wavelength Zone support

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 20.x or later
- **npm**: Version 9.x or later
- **AWS CLI**: Version 2.x configured with credentials
- **AWS CDK CLI**: Version 2.133.0 or later

### Install AWS CDK CLI

```bash
npm install -g aws-cdk
```

### Configure AWS CLI

```bash
aws configure
```

You'll need:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (e.g., us-east-1)
- Default output format (json)

## Installation

1. **Clone the repository** (or navigate to the project directory)

2. **Install dependencies**:

```bash
npm install
```

3. **Build the TypeScript code**:

```bash
npm run build
```

## Configuration

The infrastructure supports three environments: `dev`, `staging`, and `production`. Each environment has its own configuration file in `lib/config/`:

- `dev.ts`: Development environment (default)
- `staging.ts`: Staging environment
- `production.ts`: Production environment

### Environment-Specific Settings

Each configuration includes:
- VPC and subnet CIDR blocks
- Lambda memory and timeout settings
- DynamoDB TTL retention periods
- CloudWatch log retention
- Monitoring thresholds
- Feature flags (X-Ray, WAF, Backup, etc.)
- Cost budgets and alerts
- Resource tags

## Deployment

### First-Time Setup

Before deploying for the first time, you need to bootstrap your AWS environment:

```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

Replace `ACCOUNT-ID` with your AWS account ID and `REGION` with your target region (e.g., us-east-1).

### Deploy to Development

```bash
npm run deploy:dev
```

Or using CDK directly:

```bash
cdk deploy -c environment=dev
```

### Deploy to Staging

```bash
npm run deploy:staging
```

### Deploy to Production

```bash
npm run deploy:production
```

### View Changes Before Deployment

To see what changes will be made:

```bash
cdk diff -c environment=dev
```

### Synthesize CloudFormation Template

To generate the CloudFormation template without deploying:

```bash
npm run synth
```

The template will be generated in the `cdk.out` directory.

## Stack Outputs

After deployment, the stack outputs critical resource identifiers:

- `WebSocketApiEndpoint`: WSS endpoint URL for client connections
- `ConnectionsTableName`: DynamoDB connections table name
- `MetadataTableName`: DynamoDB metadata table name
- `FamilyLoopTopicArn`: SNS topic ARN for notifications
- `EventBusName`: EventBridge custom event bus name
- `AudioQueueUrl`: SQS queue URL for audio processing
- `DashboardUrl`: CloudWatch dashboard URL

View outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name VocalShield-dev \
  --query 'Stacks[0].Outputs'
```

## Testing

The project includes comprehensive testing:

### Run All Tests

```bash
npm test
```

### Run Unit Tests Only

```bash
npm run test:unit
```

### Run Property-Based Tests Only

```bash
npm run test:properties
```

### Run Integration Tests Only

```bash
npm run test:integration
```

## Development

### Watch Mode

To automatically rebuild on file changes:

```bash
npm run watch
```

### Type Checking

TypeScript is configured with strict type checking. Build the project to check for type errors:

```bash
npm run build
```

## Cost Management

The infrastructure is designed to stay within AWS Free Tier limits:

- **Lambda**: 1M requests/month, 400,000 GB-seconds compute
- **API Gateway WebSocket**: 1M messages/month (first 12 months)
- **DynamoDB**: 25 GB storage, 25 WCU, 25 RCU (on-demand)
- **CloudWatch**: 5 GB logs, 10 custom metrics, 10 alarms
- **SNS**: 1,000 notifications/month

### Billing Alarm

A CloudWatch billing alarm is automatically created with a $5 threshold. You'll receive an email notification if costs exceed this amount.

### Cost Optimization Features

- ARM64 Lambda architecture (20% cost savings)
- DynamoDB on-demand billing (no provisioned capacity)
- Automatic data expiration via TTL
- 7-day CloudWatch log retention
- No NAT Gateway (uses VPC endpoints)

## Rollback

If deployment fails or issues arise:

```bash
cdk deploy --rollback -c environment=dev
```

Or manually via CloudFormation:

```bash
aws cloudformation rollback-stack --stack-name VocalShield-dev
```

## Destroy Stack

To tear down all resources:

```bash
npm run destroy
```

Or for a specific environment:

```bash
cdk destroy -c environment=dev
```

**Warning**: This deletes all resources including DynamoDB tables. Ensure data is backed up if needed.

## Project Structure

```
.
├── bin/
│   └── vocalshield.ts          # CDK app entry point
├── lib/
│   ├── config/                 # Environment-specific configurations
│   │   ├── dev.ts
│   │   ├── staging.ts
│   │   ├── production.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── constructs/             # Reusable CDK constructs (future)
│   └── vocalshield-stack.ts    # Main stack definition
├── lambda/                     # Lambda function code (future)
├── tests/                      # Test files
│   ├── unit/                   # Unit tests
│   ├── properties/             # Property-based tests
│   └── integration/            # Integration tests
├── cdk.json                    # CDK configuration
├── tsconfig.json               # TypeScript configuration
├── jest.config.js              # Jest test configuration
├── package.json                # Node.js dependencies and scripts
└── README.md                   # This file
```

## Troubleshooting

### CDK Bootstrap Error

If you see "This stack uses assets, so the toolkit stack must be deployed":

```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### Permission Denied

Ensure your AWS credentials have sufficient permissions to create resources (CloudFormation, Lambda, DynamoDB, etc.).

### Stack Already Exists

If the stack already exists and you want to update it, use:

```bash
cdk deploy -c environment=dev
```

CDK will automatically detect changes and update the stack.

## Support

For issues or questions, please refer to:

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [VocalShield Project Documentation](./Project.md)
- [Requirements Document](./.kiro/specs/aws-infrastructure-foundation/requirements.md)
- [Design Document](./.kiro/specs/aws-infrastructure-foundation/design.md)

## License

MIT
