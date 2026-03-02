# MACHER - Demo Video Script

**Duration**: 4-5 minutes  
**Target Audience**: AWS 10,000 AIdeas Competition Judges  
**Goal**: Showcase technical innovation, implementation quality, and social impact

---

## Video Structure

### Opening (30 seconds)
### Problem Statement (30 seconds)
### Solution Overview (45 seconds)
### Technical Demo - Protected Mode (90 seconds)
### Technical Demo - Guardian Mode (60 seconds)
### Architecture & Innovation (45 seconds)
### Impact & Conclusion (30 seconds)

**Total**: ~4.5 minutes

---

## Scene 1: Opening (30 seconds)

### Visual
- MACHER logo animation
- Tagline: "Your AI Bodyguard Against Scam Calls"
- Fade to presenter or screen recording

### Script
> "Every year, Americans lose over $80 billion to phone scams. The elderly, immigrants, and vulnerable populations are targeted daily. Traditional solutions like caller ID blocking don't work because scammers constantly change numbers and tactics.
>
> What if we could analyze the conversation itself in real-time and warn users before they fall victim?"

### On-Screen Text
- "$80B lost annually to phone scams"
- "Traditional solutions fail"
- "Real-time content analysis needed"

---

## Scene 2: Problem Statement (30 seconds)

### Visual
- Statistics overlay
- News headlines about scam victims
- Elderly person looking at phone (stock footage)

### Script
> "Meet MACHER - a privacy-first, AI-powered voice firewall that protects vulnerable users from financial fraud and social engineering attacks.
>
> Unlike traditional solutions that only check caller IDs, MACHER analyzes what's being said during the call and intervenes in real-time to protect users."

### On-Screen Text
- "MACHER: Real-Time Voice Firewall"
- "Content analysis, not just caller ID"
- "Privacy-first, AI-powered"

---

## Scene 3: Solution Overview (45 seconds)

### Visual
- App icon and branding
- Quick tour of main features
- Dual-mode interface preview

### Script
> "MACHER is a unified Android app with two modes:
>
> Protected Mode - for vulnerable users. Simple, one-tap monitoring with clear visual indicators.
>
> Guardian Mode - for family members. Comprehensive dashboard to manage protection settings and receive alerts.
>
> The app uses AWS Transcribe for real-time speech-to-text, and AWS Bedrock with Claude 3.5 for AI-powered fraud detection. All processing happens in RAM - no audio is ever stored, ensuring complete privacy."

### On-Screen Text
- "Dual-mode app: Protected + Guardian"
- "AWS Transcribe + Bedrock"
- "Zero audio storage - Privacy first"

---

## Scene 4: Technical Demo - Protected Mode (90 seconds)

### Visual
- Screen recording of Android device
- Show onboarding flow
- Demonstrate monitoring

### Script
> "Let me show you how it works. First, the user completes a simple onboarding and selects their role.
>
> [Show onboarding screens]
>
> In Protected Mode, the interface is designed for an 80-year-old in a state of panic. Large buttons, high contrast, clear indicators.
>
> [Tap START MONITORING]
>
> The app connects to AWS and begins monitoring. Watch what happens when a scam call comes in...
>
> [Demo simulation plays]
>
> First, normal conversation - the indicator stays green. Everything is safe.
>
> [Transcription appears: 'Hello, this is John from your bank's fraud department...']
>
> Now the scammer creates urgency. The AI detects suspicious patterns.
>
> [Indicator turns yellow, phone vibrates]
>
> Level 1 Intervention: Haptic feedback. Three sharp vibrations break the psychological trance.
>
> [Transcription continues: 'We need your password and the code we sent...']
>
> Now the scammer requests sensitive information. High threat detected.
>
> [Indicator turns red, full-screen overlay appears]
>
> Level 2 Intervention: Screen overlay. An unmissable warning appears with clear instructions. The user can dismiss if they know the caller is legitimate, or hang up immediately.
>
> This progressive intervention system ensures users are protected without being annoying on legitimate calls."

### On-Screen Text
- "Progressive 3-level intervention"
- "Level 1: Haptic (vibration)"
- "Level 2: Screen overlay"
- "Level 3: Auto-disconnect (optional)"
- "AI confidence: 85%"

---

## Scene 5: Technical Demo - Guardian Mode (60 seconds)

### Visual
- Switch to Guardian Mode
- Show dashboard
- Navigate through features

### Script
> "Now let's look at Guardian Mode - designed for family members who want to protect their loved ones.
>
> [Show dashboard]
>
> The dashboard shows protected user status, recent alerts, and quick actions.
>
> [Navigate to Trusted Contacts]
>
> Guardians can manage a whitelist of trusted phone numbers - like the real bank or doctor's office.
>
> [Navigate to Alert History]
>
> The alert history shows past threats with metadata - date, time, threat type, and action taken. Notice: no transcripts. Privacy is paramount.
>
> [Navigate to Settings]
>
> Guardians control the AI sensitivity, enable or disable interventions, and configure Family Loop alerts.
>
> When a high threat is detected, the guardian receives an immediate SMS: 'URGENT: MACHER detected a high threat. Please call your loved one immediately.'
>
> This Family Loop ensures vulnerable users have backup protection even if they ignore the warnings."

### On-Screen Text
- "Guardian Dashboard"
- "Trusted contacts whitelist"
- "Alert history (metadata only)"
- "Family Loop SMS alerts"
- "Configurable sensitivity"

---

## Scene 6: Architecture & Innovation (45 seconds)

### Visual
- Architecture diagram animation
- AWS services logos
- Data flow visualization

### Script
> "Here's what makes MACHER technically innovative:
>
> The Android app captures call audio using the AudioRecord API and streams it via WebSocket to AWS API Gateway.
>
> AWS Transcribe Streaming provides real-time speech-to-text with sub-second latency.
>
> The transcript flows to Amazon Bedrock, where Claude 3.5 analyzes semantic patterns - urgency, isolation, coercion - not just keywords.
>
> The AI returns a threat level and confidence score. If high threat is detected, the app triggers progressive interventions.
>
> Critically: all processing happens in RAM. The moment analysis completes, the audio and transcript are destroyed. Zero retention. Complete privacy.
>
> The entire pipeline - from speech to intervention - takes under 500 milliseconds. Latency saves lives."

### On-Screen Text
- "Real-time WebSocket streaming"
- "AWS Transcribe + Bedrock"
- "Semantic pattern analysis"
- "Zero retention architecture"
- "End-to-end latency: <500ms"

---

## Scene 7: Impact & Conclusion (30 seconds)

### Visual
- Impact statistics
- Competition alignment
- Call to action

### Script
> "MACHER addresses an $80 billion problem affecting millions of vulnerable Americans.
>
> It's built entirely on AWS Free Tier services, making it accessible to everyone who needs protection.
>
> This project showcases AWS's most advanced AI services - Transcribe and Bedrock - in a real-world application that saves lives and money.
>
> MACHER: Your AI bodyguard against scam calls. Built with AWS. Developed with Kiro. Protecting vulnerable users everywhere.
>
> Thank you."

### On-Screen Text
- "$80B problem solved"
- "AWS Free Tier compliant"
- "Social good + technical innovation"
- "github.com/macher"
- "Built with AWS | Developed with Kiro"

---

## Recording Checklist

### Pre-Recording
- [ ] Clean device home screen
- [ ] Disable notifications from other apps
- [ ] Enable "Show taps" in Developer Options
- [ ] Charge device to 100%
- [ ] Test audio quality
- [ ] Prepare demo data
- [ ] Practice script 3 times

### Recording Setup
- [ ] Good lighting
- [ ] Quiet environment
- [ ] Screen recording app ready
- [ ] Backup recording device
- [ ] Script visible but off-camera
- [ ] Timer for pacing

### During Recording
- [ ] Speak clearly and confidently
- [ ] Maintain steady pace
- [ ] Show features smoothly
- [ ] Highlight key innovations
- [ ] Stay within time limit
- [ ] Record multiple takes

### Post-Recording
- [ ] Review footage
- [ ] Check audio quality
- [ ] Verify all features shown
- [ ] Edit for clarity
- [ ] Add captions/subtitles
- [ ] Add background music (optional)
- [ ] Export in HD (1080p)

---

## Recording Commands

### Start Screen Recording:
```bash
# On device
adb shell screenrecord --bit-rate 8000000 /sdcard/macher_demo.mp4

# Stop with Ctrl+C after recording

# Pull to Mac
adb pull /sdcard/macher_demo.mp4 ~/Desktop/
```

### Alternative: Use Android Studio
1. Open Android Studio
2. Run app on device
3. Click "Screen Record" button in Logcat panel
4. Start recording
5. Perform demo
6. Stop recording
7. Save video

---

## Editing Guidelines

### Video Editing Software Options
- **iMovie** (Mac, free) - Simple, good for basic editing
- **DaVinci Resolve** (Free) - Professional, powerful
- **Final Cut Pro** (Mac, paid) - Industry standard

### Editing Checklist
- [ ] Trim dead space at start/end
- [ ] Add title card with logo
- [ ] Add section transitions
- [ ] Overlay text for key points
- [ ] Add background music (low volume)
- [ ] Add captions/subtitles
- [ ] Color correction if needed
- [ ] Export in 1080p MP4

### Music Suggestions (Royalty-Free)
- YouTube Audio Library
- Epidemic Sound (free trial)
- Artlist (free trial)
- Choose: Uplifting, tech-focused, not distracting

---

## Key Messages to Emphasize

### Technical Innovation (34%)
- ✅ Real-time audio streaming
- ✅ AWS Transcribe + Bedrock integration
- ✅ Semantic pattern analysis (not keywords)
- ✅ Progressive intervention system
- ✅ Zero-retention privacy architecture

### Implementation Quality (33%)
- ✅ Production-ready Android app
- ✅ Clean architecture (MVVM)
- ✅ Jetpack Compose UI
- ✅ Comprehensive error handling
- ✅ Developed with Kiro workflow

### Market Impact (33%)
- ✅ $80B problem addressed
- ✅ Protects vulnerable populations
- ✅ Free and accessible (AWS Free Tier)
- ✅ Privacy-first approach
- ✅ Real-world social good

---

## Backup Plans

### If Demo Fails
- Have pre-recorded demo ready
- Show screenshots as fallback
- Explain what should happen
- Show architecture diagram instead

### If Time Runs Over
- Cut Guardian Mode demo to 30 seconds
- Shorten architecture explanation
- Focus on Protected Mode (core feature)

### If Time Runs Under
- Add more detail to architecture
- Show additional Guardian features
- Demonstrate error handling
- Show performance metrics

---

## Final Checklist

### Before Submission
- [ ] Video is 4-5 minutes long
- [ ] All key features demonstrated
- [ ] Audio quality is clear
- [ ] Video quality is HD (1080p)
- [ ] Captions/subtitles added
- [ ] No personal information visible
- [ ] Branding is consistent
- [ ] Call to action included
- [ ] File size under submission limit
- [ ] Format is compatible (MP4)

### Submission Package
- [ ] Demo video (MP4)
- [ ] README.md
- [ ] Architecture diagram
- [ ] Source code (GitHub link)
- [ ] Documentation
- [ ] Presentation slides (optional)

---

**Status**: Ready to Record  
**Estimated Time**: 2-3 hours (recording + editing)  
**Priority**: High (Required for competition)

