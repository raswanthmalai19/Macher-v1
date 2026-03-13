# VocalShield Knowledge Base

## Overview

This directory contains scam pattern documents that power VocalShield's AI-driven fraud detection system. These documents are uploaded to Amazon S3 and used by Amazon Bedrock Knowledge Base to provide context-aware fraud analysis.

## Contents

### Scam Pattern Documents

1. **irs-scams.md** - IRS and tax-related scam patterns
   - Impersonation tactics
   - Payment demands (gift cards, wire transfers)
   - Threats of arrest or legal action
   - Urgency and pressure tactics

2. **tech-support-scams.md** - Technical support scam patterns
   - Fake virus warnings
   - Remote access requests
   - Unnecessary software sales
   - Refund scam variants

3. **grandparent-scams.md** - Family emergency scam patterns
   - Emotional manipulation
   - Fake emergencies (arrest, accident, stranded)
   - Secrecy demands
   - Bail money and emergency payment requests

4. **romance-scams.md** - Romance and relationship scam patterns
   - Quick declarations of love
   - Never meeting in person
   - Repeated financial requests
   - Investment scam variants

5. **fraud-indicators.md** - Comprehensive fraud indicator reference
   - Universal fraud indicators
   - Confidence scoring framework
   - Threat level calculations
   - Detection guidelines

## Document Structure

Each scam pattern document follows a consistent structure:

```markdown
---
category: [Scam Type]
severity: [HIGH/MEDIUM/LOW]
---

# [Scam Type] Patterns

## Overview
Brief description of the scam type

## Common Tactics
How scammers operate

## Fraud Indicators
High/Medium/Low confidence indicators

## Detection Guidelines
Red flags and verification steps

## Example Phrases
Common phrases used by scammers

## Confidence Scoring
How to calculate risk scores

## Response Recommendations
What to tell users at each threat level
```

## Privacy and Compliance

### No PII
- Documents contain NO personally identifiable information
- No real phone numbers, names, addresses, or financial data
- Only generic examples and patterns

### Content Guidelines
- Based on publicly available scam reports
- FTC, FBI, and consumer protection agency data
- Anonymized and generalized patterns
- No specific victim information

## Usage in VocalShield

### Bedrock Knowledge Base Integration

1. **Upload**: Documents are automatically uploaded to S3 during CDK deployment
2. **Indexing**: Bedrock Knowledge Base indexes the documents for semantic search
3. **Retrieval**: During fraud analysis, relevant patterns are retrieved using RAG
4. **Analysis**: Claude 3.5 Sonnet analyzes transcripts against retrieved patterns

### Fraud Detection Flow

```
Phone Call Audio
    ↓
Transcription (Amazon Transcribe)
    ↓
PII Redaction (Bedrock Guardrails)
    ↓
Pattern Retrieval (Knowledge Base RAG)
    ↓
Fraud Analysis (Bedrock Agent + Claude)
    ↓
Risk Score + Threat Level + Indicators
    ↓
User Alert
```

## Updating Scam Patterns

### Adding New Patterns

1. Create new markdown file in `scam-patterns/` directory
2. Follow the document structure template
3. Ensure no PII is included
4. Deploy CDK stack to upload to S3
5. Run ingestion job to update Knowledge Base

### Modifying Existing Patterns

1. Edit the markdown file
2. Maintain document structure
3. Update version metadata if needed
4. Deploy CDK stack
5. Run ingestion job

### Ingestion Command

```bash
# After updating documents, trigger ingestion
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id $KNOWLEDGE_BASE_ID \
  --data-source-id $DATA_SOURCE_ID \
  --region us-east-1
```

## Confidence Scoring Framework

### Risk Score Calculation

```
Base Score = Σ(Indicator Confidence × Indicator Weight)
Combination Multiplier = 1 + (0.1 × Number of High-Risk Combinations)
Final Score = min(Base Score × Combination Multiplier, 100)
```

### Threat Levels

- **SAFE (0-33)**: Few or no fraud indicators
- **CAUTION (34-66)**: Some fraud indicators present
- **DANGER (67-100)**: Multiple high-confidence indicators

### Indicator Weights

- **High-Confidence (0.8-1.0)**: Gift cards, arrest threats, verification refusal
- **Medium-Confidence (0.6-0.8)**: Urgency, aggressive tone, unsolicited contact
- **Low-Confidence (0.3-0.6)**: Caller ID spoofing, official language

## Testing and Validation

### Document Quality Checks

- ✅ No PII present
- ✅ Consistent structure
- ✅ Clear fraud indicators
- ✅ Actionable guidance
- ✅ Appropriate confidence weights

### Validation Script

```bash
# Check for PII in documents
grep -r -E '\b\d{3}-\d{2}-\d{4}\b' scam-patterns/  # SSN
grep -r -E '\b\d{3}-\d{3}-\d{4}\b' scam-patterns/  # Phone
grep -r -E '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b' scam-patterns/  # Email
```

## Deployment

### Automatic Deployment (CDK)

Documents are automatically deployed when running:

```bash
npm run cdk:deploy
```

The CDK stack:
1. Creates S3 bucket with encryption
2. Uploads all documents from `knowledge-base/` directory
3. Configures IAM permissions for Bedrock access
4. Outputs bucket name for Knowledge Base configuration

### Manual Setup (Bedrock Resources)

After CDK deployment, run the setup script:

```bash
./scripts/setup-bedrock-resources.sh dev
```

This creates:
- Bedrock Knowledge Base
- Bedrock Agent with Claude 3.5 Sonnet
- Bedrock Guardrails for PII redaction
- S3 data source integration
- Agent alias for production use

## Monitoring and Maintenance

### Knowledge Base Metrics

Monitor in CloudWatch:
- Query latency
- Retrieval accuracy
- Token usage
- Cost per query

### Update Frequency

- **Monthly**: Review and update based on new scam trends
- **Quarterly**: Major pattern additions or revisions
- **As Needed**: Emergency updates for new scam variants

### Sources for Updates

- FTC Consumer Sentinel Network
- FBI Internet Crime Complaint Center (IC3)
- AARP Fraud Watch Network
- Consumer protection agencies
- User reports and feedback

## Cost Optimization

### Free Tier Compliance

- Documents are small text files (<1MB total)
- S3 storage: ~$0.023/month
- Bedrock queries: Covered by $200 competition credits
- Knowledge Base: Pay-per-query pricing

### Best Practices

- Keep documents concise and focused
- Use efficient markdown formatting
- Avoid redundant content
- Optimize for semantic search

## Support and Contribution

### Reporting Issues

If you identify:
- Missing scam patterns
- Outdated information
- Incorrect confidence weights
- PII in documents

Please report via GitHub issues.

### Contributing New Patterns

1. Research the scam type thoroughly
2. Follow document structure template
3. Ensure no PII is included
4. Test with sample conversations
5. Submit pull request with documentation

## References

- [FTC Scam Alerts](https://www.ftc.gov/scams)
- [FBI Common Scams](https://www.fbi.gov/scams-and-safety/common-scams-and-crimes)
- [AARP Fraud Watch](https://www.aarp.org/money/scams-fraud/)
- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [RAG Best Practices](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)

## License

These scam pattern documents are provided for fraud prevention purposes only. Content is based on publicly available information and consumer protection resources.

**Privacy First**: No real user data, PII, or recorded conversations are included in these documents.
