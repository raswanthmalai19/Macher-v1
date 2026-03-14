# MACHER

> Real-Time AI Bodyguard Against Phone Scams

MACHER is an intelligent, privacy-first conversation firewall that helps protect people from voice scams in real time by analyzing what is being said during calls and surfacing risk alerts instantly.

Built for the AWS 10,000 AIdeas Competition.

---

## Read, Watch, and Support MACHER

- AWS Builder Article: https://builder.aws.com/content/3AtSKEZm9cp3o0AbWm71bVjJHXh/macher-a-real-time-ai-bodyguard-against-phone-scams
- Demo Video: https://www.youtube.com/watch?v=3nF1vkQZ5SY
- Medium Blog: https://medium.com/@artistrk/macher-the-real-time-ai-bodyguard-that-lives-in-your-phone-389a1c0836ad

If you believe in this mission, please support MACHER by reading, sharing, and engaging with the article and demo.

---

## What MACHER Does

MACHER focuses on scam prevention based on conversation content, not caller ID alone. That helps detect spoofed numbers, social engineering, and AI-assisted scam scripts.

Core capabilities:
- Real-time transcript-driven risk detection
- Threat level classification (SAFE, CAUTION, DANGER)
- On-device + backend-assisted analysis flow
- Family or guardian alerting for high-risk situations
- Privacy-first handling with no unnecessary raw audio retention

---

## High-Level Architecture

1. Android app captures call-side audio and speech signals.
2. Client streams events over API Gateway WebSocket.
3. Lambda audio pipeline processes transcript and audio events.
4. Fraud analysis runs through Bedrock-based logic.
5. Risk outcomes return to mobile and are persisted in DynamoDB.
6. Alerts and telemetry flow to SNS, EventBridge, and CloudWatch.

---

## Tech Stack

Infrastructure:
- AWS CDK (TypeScript)
- AWS Lambda (Node.js 20.x)
- Amazon API Gateway WebSocket
- Amazon DynamoDB
- Amazon EventBridge
- Amazon SNS
- Amazon CloudWatch

AI and Detection:
- Amazon Bedrock integration for fraud reasoning
- Rule-based plus multi-layer risk fusion on mobile
- Transcript-driven fraud indicator analysis

Mobile:
- Android (Kotlin + Jetpack Compose)
- Real-time WebSocket client
- On-device speech recognition fallback

---

## Project Structure

```text
MACHER/
├── android/                    # Android app
├── lambda/                     # Lambda services (audio, connect, disconnect, etc.)
├── lib/                        # CDK stack and constructs
├── config/                     # Environment configs
├── tests/                      # Unit, integration, property tests
├── scripts/                    # Deployment and setup scripts
└── README.md
```

---

## Environments

- dev
- staging
- production

Environment-specific config is maintained under config and lib/config.

---

## Quick Start

Prerequisites:
- Node.js 20+
- npm 9+
- AWS CLI v2 configured
- AWS CDK v2

Install:

```bash
npm install
npm run build
```

Deploy (example):

```bash
cdk bootstrap
cdk deploy -c environment=dev
```

Run tests:

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:property
```

---

## Android Reliability Notes

Recent reliability improvements include:
- Audio source fallback for sustained silence scenarios
- Earlier speech recognition startup during active call monitoring
- Local detection fallback when backend connectivity is degraded

---

## Support

You can support MACHER by:
- Sharing the AWS Builder article
- Watching and sharing the demo video
- Reading and sharing the Medium engineering story
- Opening issues and PRs with feedback and improvements

Links:
- https://builder.aws.com/content/3AtSKEZm9cp3o0AbWm71bVjJHXh/macher-a-real-time-ai-bodyguard-against-phone-scams
- https://www.youtube.com/watch?v=3nF1vkQZ5SY
- https://medium.com/@artistrk/macher-the-real-time-ai-bodyguard-that-lives-in-your-phone-389a1c0836ad

---

## Author

Raswanth Malaisamy
- GitHub: https://github.com/raswanthmalai19

---

## License

MIT
