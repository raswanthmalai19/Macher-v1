Strategic Audit and Execution Plan: VocalShield – The Agentic Conversation Firewall
A Comprehensive Roadmap for the AWS 10,000 AIdeas Competition
1. Executive Summary and Strategic Alignment
The AWS 10,000 AIdeas Competition represents a pivotal moment in the evolution of hackathons, shifting the focus from simple prototype functionality to the rigorous application of AI-assisted development methodologies. This report serves as a deeply audited execution plan for VocalShield, a proposed real-time "Conversation Firewall" designed to intercept, analyze, and neutralize voice-based financial fraud and social engineering attacks. By synthesizing advanced AWS cloud-native services with the mandatory Kiro agentic development environment, VocalShield targets the competition's "Social Good" and "Daily Life Enhancement" tracks, addressing a global crisis that costs consumers tens of billions of dollars annually.1
This audit decomposes the path to victory into three critical pillars aligned with the competition's judging criteria: Technical Innovation (34%), which VocalShield addresses through a novel integration of AWS Wavelength, Amazon Transcribe Streaming, and Amazon Bedrock Agents; Implementation Quality (33%), which will be demonstrated through a meticulously documented Kiro workflow utilizing EARS notation specs and Agent Hooks; and Market Impact (33%), validated by the urgent need to combat the rise of AI-generated voice deepfakes and algorithmic vishing.2
The central thesis of this plan is that a winning submission must transcend the definition of a mere "app." It must present itself as an enterprise-grade security infrastructure, architected with the privacy-first rigour required by modern data protection standards. By leveraging Amazon Bedrock Guardrails for real-time PII redaction and ensuring strictly on-device consent mechanisms, VocalShield will preemptively address the privacy concerns that typically disqualify "eavesdropping" applications in judging panels. This report provides the blueprint for building that defensible, high-impact solution within the strict constraints of the AWS Free Tier.4
2. Market Impact Audit: The Case for VocalShield
2.1 The Escalating Crisis of Voice Fraud
To satisfy the "Market Impact" criterion, the submission must demonstrate that the problem is not merely an inconvenience but a systemic economic threat. Global consumer losses to robocalling and voice fraud are projected to exceed $80 billion by 2025.1 This figure represents a catastrophic transfer of wealth, primarily targeting vulnerable demographics such as the elderly, immigrants, and the financially precarious. The "Emotional Hook" identified in the initial concept—that vishing robs global citizens of billions—is supported by harrowing statistics: in Q3 2025 alone, corporate infiltration via voice deepfakes reached nearly 1,000 confirmed cases, with attackers utilizing real-time synthetic voices to authorize fraudulent wire transfers.2
The nature of the threat has evolved beyond simple "prince of Nigeria" scripts. We are now in the era of "Agentic Fraud," where malicious AI agents can autonomously navigate phone menus, mimic familiar voices using samples as short as three seconds, and engage in complex social engineering that adapts to the victim's responses in real-time.2 Traditional defenses are failing because they rely on "Blocklists" (checking if a number is known to be bad). This is a passive, retrospective defense mechanism that is useless against number spoofing and VOIP hopping. VocalShield proposes a paradigm shift to an "Active AI Bodyguard," a system that analyzes the content and intent of the conversation rather than the origin of the call. This aligns perfectly with the "Social Good" track by offering a technological shield to those most susceptible to psychological manipulation.
2.2 The Inadequacy of Current Solutions
Existing solutions like TrueCaller or carrier-grade spam blocks operate on metadata—who is calling, and from where. They are blind to the "Semantic Threat" contained within the audio stream itself. Once a user picks up the phone, they are isolated behind a "human firewall" that is easily breached by fear, urgency, or authority—the three pillars of social engineering. The market gap VocalShield fills is the Real-Time Semantic Interception layer. By introducing an AI agent into the call loop, we democratize the kind of security analysis typically reserved for high-level corporate espionage defense, making it accessible to any smartphone user.
The economic argument for VocalShield extends to the B2B sector as well. Financial institutions and insurance companies, who currently absorb billions in fraud losses annually, have a vested interest in deploying such technology to their customer base. TransUnion reports that 7.7% of annual revenue is lost to fraud, with authorized push payment fraud (scams where the user is tricked into sending money) being a leading cause.6 VocalShield acts as a preventative control, stopping the transaction request before it even reaches the banking app. This dual B2C (protection) and B2B (loss prevention) value proposition creates a compelling narrative for the "Market Impact" judges.
3. Technical Architecture Audit: Engineering for Innovation
To secure the 34% score for "Technical Innovation," the architecture must demonstrate a sophisticated synthesis of AWS services that goes beyond standard patterns. The proposed architecture for VocalShield leverages the AWS Cloud, the 5G Edge, and Agentic AI to create a system that is fast, smart, and private.
3.1 The Low-Latency Edge: AWS Wavelength
Latency is the enemy of intervention. A scam detection system that alerts the user five seconds after they have revealed their OTP (One-Time Password) is useless. To minimize the "Motion-to-Photon" latency—the time between the scammer speaking and the warning appearing on the victim's screen—VocalShield will utilize AWS Wavelength.8
Wavelength Zones embed AWS compute and storage services directly at the edge of telecommunications providers' 5G networks. By deploying the ingestion node (a lightweight containerized gateway) in a Wavelength Zone, we eliminate the network hops required to traverse the public internet to a standard AWS Region. This architecture allows the audio stream to stay within the carrier's network for the initial hop, reducing jitter and latency by tens of milliseconds. This is a critical architectural decision that demonstrates "Technical Innovation" by utilizing AWS's advanced edge computing capabilities to solve a real-world constraint (time). While the hackathon build might use a standard region if Wavelength access is restricted, the design artifact will explicitly detail this topology as the production target, showcasing foresight and architectural maturity.
3.2 Real-Time Ingestion: Amazon Transcribe Streaming
The core of the system is the ability to convert unstructured audio into structured text in real-time. We will utilize Amazon Transcribe Streaming via the WebSocket protocol.11 Unlike batch processing, which waits for a file to be uploaded, the streaming API opens a bidirectional persistent connection.
The architecture will employ a Node.js intermediary (hosted on AWS Lambda or Fargate, depending on Free Tier duration limits) to act as the WebSocket proxy. This proxy manages the audio buffer, ensuring that the raw PCM data from the Android client is chunked correctly for the Transcribe API. A critical configuration parameter here is EnablePartialResultsStabilization.13 This feature allows Transcribe to send tentative text updates as the user speaks, which can be corrected as more context becomes available. For VocalShield, this allows the UI to display a "live captioning" effect, building user trust that the system is actively listening and functioning.
Crucially, we will enable Language Identification within the stream.11 Scams are a global phenomenon, and VocalShield must demonstrate the capability to protect non-English speakers. By automatically detecting the dominant language, the system can route the text to the appropriate localized threat model in Amazon Bedrock, fulfilling the "Global Scalability" criterion mentioned in the judging rubrics.3
3.3 The Cognitive Core: Amazon Bedrock Agents
The differentiator between a transcription app and a "security agent" is the reasoning capability. VocalShield will use Agents for Amazon Bedrock 14 to orchestrate the threat analysis. Rather than simply passing text to an LLM, the Agent framework allows us to define specific "Action Groups" and "Knowledge Bases."
The Agent will be configured with a persona: "Expert Fraud Analyst." It will be connected to a Knowledge Base containing a curated dataset of known scam scripts (e.g., "Grandparent Scam," "IRS Tax Lien," "Microsoft Support"). The Agent utilizes RAG (Retrieval-Augmented Generation) to compare the live conversation stream against these known vectors. If the semantic similarity is high—for example, if the caller uses phrases like "go to Target and buy a gift card" or "do not hang up the phone"—the Agent triggers an intervention.
This "Agentic" approach is superior to simple keyword matching because it understands context. It can distinguish between a legitimate bank calling to verify a transaction (calm, verifying known info) and a scammer spoofing a bank (urgent, demanding unknown info). The Agent will effectively chain reasoning steps: "Identify Topic" -> "Assess Urgency" -> "Check for Financial Demands" -> "Determine Threat Level."
3.4 Privacy by Design: Amazon Bedrock Guardrails
The most significant risk to the project is the perception of privacy violation. To address this, VocalShield will implement Amazon Bedrock Guardrails 15 as a non-negotiable architectural component. Guardrails act as an interceptor between the application and the Foundation Model (FM).
We will configure a specific "PII Redaction" policy within the Guardrail. This policy will automatically detect and mask sensitive information types such as Credit Card Numbers, Social Security Numbers, Names, and Phone Numbers before the text is processed by the Agent for threat analysis. This ensures that the AI model never "sees" the user's private financial data, only the metadata of the conversation (e.g., "The user provided a credit card number"). This architectural decision allows us to claim "Zero-Knowledge Analysis" for PII, a powerful narrative for the "Social Good" track and a necessary compliance feature for any real-world deployment.
4. Implementation Quality Audit: The Kiro Methodology
The competition explicitly mandates the use of Kiro, an AI-native development environment.4 The "Implementation Quality" score (33%) will largely depend on how effectively the team demonstrates mastery of Kiro's specific features: Steering, Specs, and Hooks.17 A generic submission that simply uses Kiro as a text editor will fail; the submission must prove that the code was architected via Kiro's agentic workflows.
4.1 Steering Files: Codifying the Vision
We will establish a robust .kiro/steering/ directory to guide the AI agent's behavior throughout the project. This ensures consistency and prevents the "hallucination" of code that doesn't fit the project constraints.
File: .kiro/steering/product.md
Product Steering: VocalShield
Mission: To build a real-time, privacy-first voice firewall that protects vulnerable users from financial fraud.
Core Values:
Privacy First: Never store raw audio. Redact PII immediately.
Speed: Latency saves lives. Optimize for <500ms analysis time.
Simplicity: The UI must be usable by an 80-year-old in a state of panic.
Target User: Elderly individuals, immigrants, and digital novices.
Tone: Protective, Vigilant, Reassuring.
File: .kiro/steering/tech.md
Technical Steering: VocalShield Stack
Cloud Provider: AWS (Strict adherence to Free Tier limits).
Infrastructure: AWS CDK (TypeScript).
Compute: AWS Lambda (Node.js 20.x, ARM64).
AI Services: Amazon Bedrock (Claude 3.5 Sonnet via Agents), Amazon Transcribe Streaming.
Mobile: Android (Kotlin) utilizing Accessibility Services for audio capture.
Constraints:
No EC2 instances (cost).
No RDS (use DynamoDB).
Strictly typed TypeScript.
All AWS resources must be defined in CDK.
These steering files serve as the "Constitution" for the project. Every time we prompt Kiro, it will reference these files to ensure the generated code aligns with the constraints (e.g., suggesting DynamoDB instead of RDS because of the tech.md file).
4.2 Spec-Driven Development: The EARS Notation
To demonstrate high implementation quality, we will use Kiro's Spec feature, utilizing the EARS (Easy Approach to Requirements Syntax) notation.19 This formalizes the feature definition process, moving away from "vibe coding" to engineered software.
Spec Example: The Scam Detection Logic
Title: Real-Time Threat Analysis
Description: Analyze incoming transcript segments for fraud indicators.
Requirements (EARS):
Ubiquitous: The system shall Redact PII from all transcript segments using Amazon Bedrock Guardrails before analysis.
Event-Driven: When a new transcript segment arrives, the system shall invoke the Bedrock Agent "FraudAnalyst."
State-Driven: While the call is active, the system shall maintain a rolling window of the last 60 seconds of context.
Unwanted Behavior: If the transcript is empty or silence is detected, the system shall not invoke the LLM to save costs.
Optional: Where the confidence score exceeds 85%, the system shall trigger the "Family Loop" SNS notification.
By including screenshots and text of these Specs in the submission article, we prove to the judges that we utilized Kiro's advanced project management capabilities to structure the hackathon build.
4.3 Agent Hooks: Automating Quality Assurance
We will leverage Agent Hooks to enforce code quality and automate repetitive tasks.20 This demonstrates the "Force Multiplier" effect of using Kiro.
Hook 1: The Free Tier Guardian
Trigger: On Save of cdk.json or *.stack.ts.
Instruction: "Analyze the CDK stack for resources that fall outside the AWS Free Tier. If an instance type is not t2.micro or t3.micro, or if a database is provisioned instead of on-demand, add a warning comment to the file."
Hook 2: The Test Generator
Trigger: On Creation of src/lambda/*.ts.
Instruction: "Generate a corresponding unit test file in test/lambda/ using Jest. Mock all AWS SDK calls. Ensure 80% branch coverage."
These hooks not only speed up development but serve as powerful anecdotes in the "How I Built This" section of the submission, showing that the team built tools to help them build the app.
5. Mobile Client Audit: overcoming the "Android Barrier"
The most significant technical hurdle for any call-monitoring app is the Android operating system's restrictions on accessing call audio. Standard MediaRecorder APIs often block call recording to comply with wiretapping laws. To "win" the hack, VocalShield must solve this elegantly.
5.1 The Accessibility Service Pattern
We will utilize the Android Accessibility Service API.21 This API is designed to assist users with disabilities (e.g., hearing impairment) by accessing screen content and audio. By registering VocalShield as an Accessibility Service, we gain legitimate access to the audio stream for the purpose of "Live Captioning and Safety Assistance."
This approach is technically valid and aligns with the "Social Good" track (assisting the vulnerable). The app will request android.permission.BIND_ACCESSIBILITY_SERVICE and declare capability to retrieve window content and audio. The audio is then captured via the AudioRecord class, configured for VOICE_COMMUNICATION source, and streamed to the WebSocket.
5.2 The Haptic Feedback Loop
To intervene without escalating the user's panic, VocalShield will use a Haptic Language.
Safe: A slow, rhythmic heartbeat vibration (60bpm).
Caution: A double-tap vibration every 5 seconds.
Danger: A rapid, high-intensity buzz (alarm pattern).
This allows the user to feel the AI's assessment even if they cannot look at the screen (e.g., if the phone is to their ear). This UX nuance demonstrates "Daily Life Enhancement" thinking.
6. Risk and Compliance Audit
6.1 The Wiretapping Challenge (Two-Party Consent)
In many jurisdictions (e.g., California, Florida), recording a call without the consent of all parties is illegal.23 A hackathon project that ignores this will be disqualified or scored poorly on "Market Impact" due to non-viability.
Mitigation Strategy:
User-Initiated Activation: The app is not "always on." It must be triggered by the user tapping a "Shield" button when a call begins.
The "Announcement" Feature: Upon activation, the app can inject a brief audio signal or synthetic voice stating, "This call is being monitored for security." This satisfies the legal requirement for notification.
Ephemeral Processing: We emphasize that the audio is streamed, processed in RAM, and discarded. It is never written to disk. The only persistent artifact is the metadata of the scam (time, type, confidence score), not the recording itself.
6.2 Free Tier Budget Management
The "Free Tier Only" constraint requires rigorous resource management.
Lambda: We will use Provisioned Concurrency only during the demo recording, reverting to standard (cold start) for the submission code to ensure zero cost when idle.
DynamoDB: Use "On-Demand" capacity mode, which has no hourly cost, only per-request cost.
Bedrock/Transcribe: The competition provides $200 in credits.4 We must calculate the "burn rate."
Transcribe: $0.024/minute.
Bedrock (Haiku): ~$0.00025/1k input tokens.
Budget: $200 allows for roughly 100 hours of live testing. This is sufficient, provided we implement a "timeout" feature that stops processing after 5 minutes of continuous audio to prevent accidental credit drain.
7. Implementation Roadmap
Week 1: Infrastructure & Kiro Setup
Goal: A deploying "Hello World" stack.
Tasks:
Initialize Kiro Steering files (product.md, tech.md).
Scaffold the AWS CDK project.
Deploy the API Gateway (WebSocket) and Lambda skeleton.
Verify the Android Accessibility Service can capture and log local audio levels.
Week 2: The Connectivity Layer
Goal: Streaming audio from Phone to Cloud.
Tasks:
Implement the WebSocket client in Android (OkHttp).
Implement the Lambda handler to proxy data to Amazon Transcribe Streaming.
Audit: Measure latency. If >500ms, optimize chunk sizes and Lambda memory allocation.
Week 3: Intelligence & Agents
Goal: The Brain comes alive.
Tasks:
Configure the Amazon Bedrock Agent with the "Fraud Analyst" prompt.
Create the "Scam Script" Knowledge Base (using transcriptions of known scams from YouTube channels like Kitboga).
Configure the Guardrail for PII redaction.
Innovation: Connect the Agent to the "Family Loop" SNS topic.
Week 4: Polish & Submission
Goal: The Winning Artifacts.
Tasks:
Refine the UI (Traffic Light system).
The Demo Video: Record a live simulation. Use a second phone to play a scam recording. Show the app reacting in real-time. This "Live Fire" test is crucial for credibility.
The Article: Write the Builder Center post, focusing heavily on the process (Kiro) and the mission (Social Good).
8. Conclusion
VocalShield is designed to win not just by functioning, but by mattering. It takes the abstract power of Generative AI and applies it to a visceral, emotional problem: the financial exploitation of the vulnerable. By strictly adhering to the "audited" plan laid out in this report—leveraging Kiro for verifiable implementation quality, AWS Wavelength for edge innovation, and Bedrock Guardrails for privacy—the project presents a complete, defensible, and highly scalable solution. It transforms the passive victim into an agent-assisted defender, shifting the balance of power in the global fight against fraud. This is the definition of "AI for Social Good," and it is a winning strategy for the 10,000 AIdeas Competition.
9. Appendix: Kiro Specifications (EARS)
The following specifications are to be pasted directly into Kiro to generate the project's core logic.
Spec 1: The Privacy Guardrail
Title: Bedrock PII Guardrail Configuration
Description: Define the safety boundaries for the Generative AI interaction.
Requirements:
Ubiquitous: The Guardrail shall be applied to ALL invocations of the Bedrock Agent.
Ubiquitous: The Guardrail shall effectively mask Credit Card Numbers, SSNs, and US Phone Numbers.
Unwanted Behavior: The system shall NOT block the entire prompt if PII is found, but MUST replace the PII with the token.
Event-Driven: If the "Jailbreak" filter is triggered by the scammer's language, the system shall flag the conversation as High Risk immediately.
Spec 2: The Family Loop Notification
Title: Agentic Intervention & Notification
Description: The mechanism for alerting trusted third parties.
Requirements:
Event-Driven: When the Bedrock Agent returns a "Threat Confidence" score of >90%, the system shall publish a message to the "FamilyAlert" SNS Topic.
Ubiquitous: The notification message MUST contain the "Scam Type" (e.g., "Impersonation") and the "Time Detected."
Unwanted Behavior: The notification message MUST NOT contain any PII or unredacted transcript text.
Optional: If the user has configured a "WhatsApp" endpoint via AWS End User Messaging, the system shall route the alert there.
Works cited
Robocalling Fraud: Global Consumer Losses to Exceed $80bn in 2025 - Juniper Research, accessed on February 16, 2026, https://www.juniperresearch.com/press/robocalling-fraud-global-consumer-losses-to-exceed-80bn/
Best Voice AI for Fraud Detection Workflows: 2025 E-Commerce Security Guide - Dialzara, accessed on February 16, 2026, https://dialzara.com/blog/ai-voice-tools-for-fraud-detection-in-e-commerce
10,000 AIdeas Competition Terms | AWS Builder Center, accessed on February 16, 2026, https://builder.aws.com/content/35ccI7BX1tA5xIkO29YPBQPfvLk/10000-aideas-competition-terms
10000 AIdeas Competition - AWS Builder Center, accessed on February 16, 2026, https://builder.aws.com/connect/events/10000aideas
Experian's new fraud forecast warns agentic AI, deepfake job candidates and cyber break-ins are top threats for 2026, accessed on February 16, 2026, https://www.experianplc.com/newsroom/press-releases/2026/experian-s-new-fraud-forecast-warns-agentic-ai--deepfake-job-can
H2 2025 Update: Top Fraud Trends | TransUnion, accessed on February 16, 2026, https://www.transunion.com/report/top-fraud-trends
Fraud Costs Businesses Nearly 8% of Their Equivalent Revenues Globally, TransUnion Reports, accessed on February 16, 2026, https://newsroom.transunion.com/h2-2025-global-fraud-report/
Lower access latency for your apps with AWS Wavelength and our telco partners, accessed on February 16, 2026, https://aws.amazon.com/blogs/industries/lower-access-latency-for-your-apps-with-aws-wavelength-and-our-telco-partners/
5G Edge Computing Infrastructure – AWS Wavelength - Amazon AWS, accessed on February 16, 2026, https://aws.amazon.com/wavelength/
Announcing AWS Wavelength for delivering ultra-low latency applications for 5G, accessed on February 16, 2026, https://aws.amazon.com/about-aws/whats-new/2019/12/announcing-aws-wavelength-delivering-ultra-low-latency-applications-5g/
Transcribing streaming audio - AWS Documentation, accessed on February 16, 2026, https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html
Transcribe speech to text in real time using Amazon Transcribe with WebSocket - AWS, accessed on February 16, 2026, https://aws.amazon.com/blogs/machine-learning/transcribe-speech-to-text-in-real-time-using-amazon-transcribe-with-websocket/
Amazon Transcribe now supports real-time transcriptions | Artificial Intelligence - AWS, accessed on February 16, 2026, https://aws.amazon.com/blogs/machine-learning/amazon-transcribe-now-supports-real-time-transcriptions/
Amazon Bedrock abuse detection - AWS Documentation, accessed on February 16, 2026, https://docs.aws.amazon.com/bedrock/latest/userguide/abuse-detection.html
Detect and redact personally identifiable information using Amazon Bedrock Data Automation and Guardrails | Artificial Intelligence, accessed on February 16, 2026, https://aws.amazon.com/blogs/machine-learning/detect-and-redact-personally-identifiable-information-using-amazon-bedrock-data-automation-and-guardrails/
Detect and filter harmful content by using Amazon Bedrock Guardrails - AWS Documentation, accessed on February 16, 2026, https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html
Kiro Documentation - Amazon AWS, accessed on February 16, 2026, https://aws.amazon.com/documentation-overview/kiro/
Kiro: Agentic AI development from prototype to production, accessed on February 16, 2026, https://kiro.dev/
Introducing Kiro, accessed on February 16, 2026, https://kiro.dev/blog/introducing-kiro/
Your first project - IDE - Docs - Kiro, accessed on February 16, 2026, https://kiro.dev/docs/getting-started/first-project/
Use Live Transcribe - Android Accessibility Help, accessed on February 16, 2026, https://support.google.com/accessibility/android/answer/9158064?hl=en
Live Transcribe | Speech to Text App - Android, accessed on February 16, 2026, https://www.android.com/accessibility/live-transcribe/
Understanding Customer Service Call Recording Laws | NiCE, accessed on February 16, 2026, https://www.nice.com/blog/mcr-understanding-customer-service-call-recording-laws-2506
Call recording laws - HubSpot Knowledge Base, accessed on February 16, 2026, https://knowledge.hubspot.com/calling/what-are-the-call-recording-laws
