---
category: IRS Scam
severity: HIGH
---

# IRS Scam Patterns

## Overview

IRS (Internal Revenue Service) scams are among the most prevalent and financially damaging phone scams. Scammers impersonate IRS agents to create fear and urgency, pressuring victims into immediate payment for fabricated tax debts.

## Common Tactics

### Impersonation
- Claims to be an IRS agent with a badge number
- Uses official-sounding titles like "Senior Officer" or "Tax Investigator"
- May spoof caller ID to display "IRS" or government phone numbers
- References real IRS procedures to sound legitimate

### Urgency and Threats
- Claims of unpaid taxes or tax refunds that require immediate action
- Threats of arrest, deportation, or license suspension
- Warnings of legal action or lawsuits
- "Final notice" or "last chance" language
- Claims that police are on the way to arrest the victim

### Payment Demands
- Demands immediate payment via gift cards (iTunes, Google Play, Amazon)
- Requests wire transfers or cryptocurrency payments
- Asks for prepaid debit cards
- Insists on specific payment methods that are untraceable
- Refuses to accept checks or credit cards

### Information Requests
- Asks for Social Security numbers
- Requests bank account information
- Demands credit card numbers
- Asks for personal identification details

## Fraud Indicators

### High-Confidence Indicators (90-100% fraud likelihood)
- **Payment via gift cards**: The IRS never accepts gift cards as payment
- **Immediate arrest threats**: The IRS does not threaten immediate arrest
- **Demands for specific payment methods**: The IRS provides multiple payment options
- **Unsolicited calls about tax debt**: The IRS always sends written notice first

### Medium-Confidence Indicators (60-89% fraud likelihood)
- Aggressive or threatening tone
- Refusal to provide callback number or written documentation
- Pressure to act immediately without time to verify
- Claims of warrants or legal action without prior notice
- Requests to keep the call confidential

### Low-Confidence Indicators (30-59% fraud likelihood)
- Caller ID shows "IRS" or government agency
- Use of official-sounding language
- Reference to specific tax years or amounts
- Mention of refunds or credits

## Detection Guidelines

### Red Flags
1. **Urgency**: Any demand for immediate action or payment
2. **Payment Method**: Gift cards, wire transfers, cryptocurrency
3. **Threats**: Arrest, deportation, license suspension
4. **Unsolicited Contact**: IRS always sends written notice before calling
5. **Personal Information**: Requests for SSN, bank details, or credit cards

### Legitimate IRS Contact
- The IRS sends written notices via U.S. mail
- The IRS provides time to question or appeal amounts owed
- The IRS accepts checks, money orders, or credit cards
- The IRS does not demand immediate payment
- The IRS does not threaten arrest or deportation

## Example Phrases

### High-Risk Phrases
- "You owe back taxes and will be arrested"
- "Pay immediately or face legal consequences"
- "We need payment via gift cards"
- "This is your final notice"
- "Police are on their way to your location"
- "You must pay now to avoid arrest"
- "We need your Social Security number to verify your identity"

### Medium-Risk Phrases
- "You have unpaid taxes from [year]"
- "We're calling about your tax refund"
- "You need to settle this matter today"
- "This is a time-sensitive matter"
- "We need to verify your information"

## Confidence Scoring

When analyzing conversations for IRS scam indicators:

- **DANGER (67-100)**: Multiple high-confidence indicators present (gift cards, arrest threats, immediate payment demands)
- **CAUTION (34-66)**: Medium-confidence indicators present (urgency, aggressive tone, unsolicited contact)
- **SAFE (0-33)**: Low or no fraud indicators detected

## Response Recommendations

### For DANGER Level
- Alert user immediately with haptic feedback
- Display clear warning: "SCAM DETECTED - Hang up immediately"
- Provide guidance: "The IRS never demands gift card payments or threatens arrest"
- Suggest actions: Hang up and report to IRS at 1-800-366-4484

### For CAUTION Level
- Alert user with visual warning
- Display message: "Possible scam - Be cautious"
- Provide verification steps: "Ask for written documentation and verify independently"
- Remind: "The IRS always sends written notice before calling"

### For SAFE Level
- Continue monitoring conversation
- No immediate alert required
- Log conversation for pattern analysis
