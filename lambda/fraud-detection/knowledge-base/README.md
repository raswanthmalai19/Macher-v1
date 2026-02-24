# VocalShield Scam Pattern Knowledge Base

This directory contains comprehensive scam pattern documents for the VocalShield fraud detection system. These JSON documents are used by Amazon Bedrock Knowledge Base to identify and classify fraudulent phone calls.

## Pattern Categories

### 1. IRS Scam
Impersonation of IRS agents demanding immediate payment for back taxes with threats of arrest.

**Languages**: English, Spanish
**Files**:
- `irs-scam-en.json` - English version
- `irs-scam-es.json` - Spanish version

**Key Indicators**:
- Threatening arrest or legal action
- Demanding immediate payment via gift cards or wire transfer
- Claiming Social Security number suspension
- Using aggressive tone

### 2. Tech Support Scam
Fake tech support claiming computer virus or security issues requiring remote access and payment.

**Languages**: English, Spanish, Mandarin
**Files**:
- `tech-support-scam-en.json` - English version
- `tech-support-scam-es.json` - Spanish version
- `tech-support-scam-zh.json` - Mandarin version

**Key Indicators**:
- Claiming to be from Microsoft/Apple/Google
- Requesting remote access to computer
- Creating urgency about computer security
- Demanding payment for tech support services

### 3. Grandparent Scam
Pretending to be grandchild or family member in emergency needing money urgently.

**Languages**: English, Spanish
**Files**:
- `grandparent-scam-en.json` - English version
- `grandparent-scam-es.json` - Spanish version

**Key Indicators**:
- Claiming to be family member in trouble
- Requesting money for bail or emergency
- Asking victim not to tell other family members
- Creating emotional urgency and secrecy

### 4. Lottery Scam
Claiming victim won lottery or prize but must pay fees or taxes first to claim winnings.

**Languages**: English, Spanish, Mandarin
**Files**:
- `lottery-scam-en.json` - English version
- `lottery-scam-es.json` - Spanish version
- `lottery-scam-zh.json` - Mandarin version

**Key Indicators**:
- Claiming victim won lottery they didn't enter
- Requesting payment for taxes or processing fees
- Creating excitement and urgency
- Threatening prize expiration

### 5. Romance Scam
Building romantic relationship over time then requesting money for emergencies or travel.

**Languages**: English, Spanish
**Files**:
- `romance-scam-en.json` - English version
- `romance-scam-es.json` - Spanish version

**Key Indicators**:
- Professing love quickly
- Always overseas or unable to meet in person
- Requesting money repeatedly with different excuses
- Avoiding video calls

## Document Structure

Each scam pattern document follows this JSON schema:

```json
{
  "pattern_id": "unique-identifier",
  "pattern_type": "Scam Type Name",
  "language": "ISO 639-1 code",
  "description": "Brief description of the scam",
  "indicators": ["list", "of", "fraud", "indicators"],
  "example_scripts": ["example", "scam", "scripts"],
  "urgency_phrases": ["urgent", "phrases", "used"],
  "financial_demands": ["payment", "methods", "requested"],
  "red_flags": ["warning", "signs"],
  "severity": "high|medium|low",
  "common_payment_methods": ["methods"],
  "target_demographics": ["target", "groups"],
  "seasonal_patterns": ["timing", "patterns"]
}
```

## Multi-Language Support

The knowledge base supports the following languages as specified in the VocalShield requirements:

- **English (en)**: All 5 scam types
- **Spanish (es)**: All 5 scam types
- **Mandarin (zh)**: Tech support and lottery scams
- **Hindi (hi)**: To be added in future updates
- **French (fr)**: To be added in future updates

## Usage

These documents are uploaded to an S3 bucket and indexed by Amazon Bedrock Knowledge Base using:
- **Embedding Model**: Amazon Titan Embeddings G1 - Text
- **Vector Store**: Amazon OpenSearch Serverless
- **Retrieval**: RAG (Retrieval-Augmented Generation)

The Bedrock Agent queries this knowledge base during fraud analysis to match conversation patterns against known scam indicators.

## Updating Patterns

To add new scam patterns:

1. Create a new JSON file following the schema above
2. Use appropriate language code in filename (e.g., `new-scam-en.json`)
3. Upload to S3 bucket via `setup_knowledge_base.py` script
4. Trigger ingestion job to update the knowledge base

## Pattern Effectiveness

Each pattern includes:
- **Comprehensive indicators**: Multiple fraud signals to detect
- **Real-world examples**: Actual scam scripts used by fraudsters
- **Psychological tactics**: Understanding how scammers manipulate victims
- **Red flags**: Clear warning signs for users
- **Target demographics**: Who is most vulnerable to each scam type

## Privacy Compliance

All example scripts in these documents:
- Do NOT contain real PII (names, phone numbers, addresses)
- Use generic placeholders for demonstration
- Are designed for pattern matching, not data collection
- Comply with VocalShield's privacy-first principles

## References

- FTC Scam Alerts: https://consumer.ftc.gov/scams
- AARP Fraud Watch Network: https://www.aarp.org/money/scams-fraud/
- FBI Internet Crime Complaint Center: https://www.ic3.gov/

## Maintenance

These patterns should be reviewed and updated:
- **Quarterly**: Add new emerging scam patterns
- **Seasonally**: Update seasonal patterns (tax season, holidays)
- **As needed**: When new scam techniques are identified

---

**Last Updated**: 2024
**Version**: 1.0
**Maintained by**: VocalShield Development Team
