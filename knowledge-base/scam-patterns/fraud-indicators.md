---
category: Fraud Indicators
severity: REFERENCE
---

# Fraud Indicators Reference Guide

## Overview

This document consolidates fraud indicators across all scam types to provide comprehensive detection guidance. These indicators help the AI system assess conversation risk levels and provide appropriate warnings to users.

## Universal Fraud Indicators

### Urgency Tactics

**Description**: Creating artificial time pressure to prevent victim from thinking clearly or verifying information.

**Examples**:
- "You must act immediately"
- "This offer expires in 10 minutes"
- "If you don't pay now, you'll be arrested"
- "We need this information right away"
- "Time is running out"

**Risk Level**: HIGH
**Confidence Weight**: 0.8-0.9

### Payment Requests

**Description**: Demands for money, especially via untraceable methods.

**Legitimate Payment Methods**:
- Checks
- Credit cards
- Bank transfers (with proper documentation)
- Official payment portals

**Scam Payment Methods**:
- Gift cards (iTunes, Google Play, Amazon, etc.)
- Wire transfers (Western Union, MoneyGram)
- Cryptocurrency (Bitcoin, Ethereum, etc.)
- Prepaid debit cards
- Cash sent via mail or courier

**Risk Level**: CRITICAL when untraceable methods requested
**Confidence Weight**: 0.9-1.0 for gift cards/crypto

### Impersonation

**Description**: Pretending to be authority figures, companies, or family members.

**Common Impersonations**:
- Government agencies (IRS, Social Security, FBI)
- Tech companies (Microsoft, Apple, Google)
- Banks and financial institutions
- Utility companies
- Family members or friends
- Law enforcement
- Medical professionals

**Detection Clues**:
- Unsolicited contact from "official" sources
- Requests for information legitimate entities already have
- Threats or pressure tactics
- Refusal to provide callback numbers or documentation

**Risk Level**: HIGH
**Confidence Weight**: 0.7-0.9

### Threats and Intimidation

**Description**: Using fear to coerce compliance.

**Common Threats**:
- Arrest or legal action
- Account suspension or closure
- License revocation
- Deportation
- Physical harm
- Public embarrassment
- Credit score damage

**Risk Level**: HIGH
**Confidence Weight**: 0.8-0.9

### Personal Information Requests

**Description**: Asking for sensitive data that legitimate entities wouldn't request.

**Red Flag Requests**:
- Social Security numbers
- Bank account numbers
- Credit card details
- Passwords or PINs
- Mother's maiden name
- Date of birth
- Full address

**Risk Level**: HIGH
**Confidence Weight**: 0.8-0.9

### Secrecy Demands

**Description**: Insisting victim keep situation confidential.

**Examples**:
- "Don't tell anyone about this"
- "Keep this between us"
- "Don't call your family"
- "This is confidential"
- "Don't hang up to verify"

**Risk Level**: HIGH
**Confidence Weight**: 0.8-0.9

## Confidence Scoring Framework

### Scoring Methodology

Risk scores are calculated based on:
1. Number of indicators present
2. Confidence weight of each indicator
3. Combination patterns (multiple indicators increase confidence)
4. Context and conversation flow

### Threat Levels

**SAFE (0-33)**
- Few or no fraud indicators detected
- Conversation appears legitimate
- Continue monitoring without alerts

**CAUTION (34-66)**
- Some fraud indicators present
- Situation requires vigilance
- Visual warning to user
- Provide verification guidance

**DANGER (67-100)**
- Multiple high-confidence indicators
- Clear scam pattern detected
- Immediate alert with haptic feedback
- Strong recommendation to end call

## Indicator Combinations

### High-Risk Combinations

**Combination 1: Authority + Urgency + Payment**
- Impersonates government/company
- Demands immediate action
- Requests untraceable payment
- **Risk Score**: 85-95

**Combination 2: Emotional + Secrecy + Money**
- Appeals to emotions (fear, love, duty)
- Demands confidentiality
- Requests financial help
- **Risk Score**: 80-90

**Combination 3: Threat + Payment + Urgency**
- Makes threats (arrest, harm, loss)
- Demands immediate payment
- Creates time pressure
- **Risk Score**: 90-100

**Combination 4: Impersonation + Information + Verification Refusal**
- Claims to be authority/family
- Requests personal information
- Won't provide verification details
- **Risk Score**: 75-85

## Context-Specific Indicators

### IRS/Tax Scams
- Mentions unpaid taxes
- Threatens arrest for tax debt
- Demands gift card payment
- Claims to be IRS agent with badge number

### Tech Support Scams
- Unsolicited call about computer problems
- Requests remote access
- Claims virus infection
- Sells unnecessary software/services

### Grandparent Scams
- Claims to be grandchild in trouble
- Demands secrecy from family
- Emergency requiring immediate money
- Won't answer identity verification questions

### Romance Scams
- Quick declarations of love
- Never met in person
- Repeated financial requests
- Elaborate excuses for needing money

## Detection Guidelines

### Analysis Process

1. **Identify Indicators**: Detect presence of fraud indicators in conversation
2. **Assess Confidence**: Evaluate confidence level of each indicator
3. **Calculate Score**: Combine indicators with weighted scoring
4. **Determine Threat Level**: Map score to SAFE/CAUTION/DANGER
5. **Generate Response**: Provide appropriate warning and guidance

### Scoring Formula

```
Base Score = Σ(Indicator Confidence × Indicator Weight)

Combination Multiplier = 1 + (0.1 × Number of High-Risk Combinations)

Final Score = min(Base Score × Combination Multiplier, 100)
```

### Threshold Calibration

- **SAFE**: Score < 34
- **CAUTION**: 34 ≤ Score < 67
- **DANGER**: Score ≥ 67

These thresholds are calibrated to:
- Minimize false negatives (missing real scams)
- Balance false positives (flagging legitimate calls)
- Provide actionable warnings at appropriate times

## Language and Phrasing Analysis

### High-Risk Phrases

**Urgency**:
- "right now"
- "immediately"
- "don't wait"
- "final notice"
- "last chance"

**Payment**:
- "gift cards"
- "wire transfer"
- "Bitcoin"
- "prepaid card"
- "cash only"

**Threats**:
- "arrested"
- "lawsuit"
- "suspended"
- "legal action"
- "consequences"

**Secrecy**:
- "don't tell"
- "keep this confidential"
- "between us"
- "don't hang up"
- "don't call anyone"

### Legitimate vs. Scam Language

**Legitimate Organizations**:
- Provide time to verify
- Accept standard payment methods
- Send written documentation
- Allow callback to official numbers
- Don't threaten or pressure

**Scam Indicators**:
- Demand immediate action
- Insist on specific payment methods
- Refuse to provide documentation
- Won't allow verification
- Use threats and pressure

## Edge Cases and Exceptions

### False Positive Scenarios

1. **Legitimate Emergencies**: Real family emergencies may trigger indicators
   - Solution: Encourage verification through known contacts
   
2. **Legitimate Collections**: Real debt collectors may seem aggressive
   - Solution: Advise verification through official channels

3. **Legitimate Tech Support**: User-initiated support may request remote access
   - Solution: Context matters - user initiated vs. unsolicited

### False Negative Scenarios

1. **Sophisticated Scammers**: May avoid obvious indicators
   - Solution: Monitor for subtle patterns and inconsistencies

2. **Long-Term Scams**: Romance scams build trust over time
   - Solution: Track patterns across multiple conversations

3. **New Scam Variants**: Novel approaches may not match known patterns
   - Solution: Continuous learning and pattern updates

## Response Recommendations

### For Each Threat Level

**SAFE (0-33)**
- No immediate alert
- Continue passive monitoring
- Log conversation for analysis
- Build pattern database

**CAUTION (34-66)**
- Visual warning indicator
- Brief guidance message
- Suggest verification steps
- Provide context about detected indicators
- Don't create panic

**DANGER (67-100)**
- Immediate haptic alert
- Clear warning message
- Specific guidance for situation
- Recommend ending call
- Provide reporting information

### User Guidance Principles

1. **Be Clear**: Use simple, direct language
2. **Be Specific**: Explain what was detected
3. **Be Actionable**: Provide concrete next steps
4. **Be Calm**: Don't create unnecessary panic
5. **Be Empowering**: Help user make informed decision

## Continuous Improvement

### Pattern Learning

The system should continuously improve by:
- Analyzing successful detections
- Learning from false positives/negatives
- Incorporating new scam patterns
- Refining confidence weights
- Updating indicator combinations

### Knowledge Base Updates

Regular updates should include:
- New scam variants
- Emerging fraud tactics
- Refined detection patterns
- Updated confidence weights
- User feedback integration

## Privacy Considerations

### PII Redaction

Before analysis, redact:
- Names
- Phone numbers
- Addresses
- Social Security numbers
- Bank account numbers
- Credit card numbers
- Email addresses

### Data Retention

- No audio storage
- Minimal metadata retention (24 hours)
- Redacted transcription snippets only
- Aggregate pattern data (anonymized)

## Conclusion

This fraud indicator framework provides comprehensive guidance for detecting and responding to phone scams. By combining multiple indicators with weighted confidence scoring, the system can accurately assess threat levels and provide appropriate warnings to protect vulnerable users.

The framework balances sensitivity (catching real scams) with specificity (avoiding false alarms) to create a reliable, trustworthy protection system that empowers users to make informed decisions about their phone conversations.
