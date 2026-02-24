# VocalShield Android Client

**Your AI Bodyguard Against Scam Calls**

VocalShield is a privacy-first Android application that provides real-time fraud detection during phone calls. The app captures call audio using Android Accessibility Services, streams it to AWS backend for analysis, and displays fraud alerts with visual and haptic feedback.

## Core Values

- **Privacy First**: No audio storage, user-initiated monitoring only
- **Speed**: <500ms response time for fraud detection
- **Simplicity**: Designed for elderly users with clear visual indicators
- **Accessibility**: Large touch targets, haptic feedback, live transcription

## Architecture

The app follows **MVVM (Model-View-ViewModel)** architecture with Jetpack Compose:

```
├── ui/                    # Jetpack Compose screens
├── viewmodel/             # ViewModels for state management
├── repository/            # Data repositories
├── domain/                # Domain services (audio, websocket, haptic)
├── data/                  # Data models and Room database
└── util/                  # Utilities and helpers
```

## Key Features

### MVP Features
- ✅ Real-time audio capture via Accessibility Service
- ✅ Audio processing (PCM 16kHz, 16-bit, mono)
- ✅ WebSocket streaming to AWS backend
- ✅ Traffic light threat indicator (Green/Yellow/Red)
- ✅ Haptic feedback for alerts
- ✅ System notifications
- ✅ Call history (metadata only, no audio)
- ✅ Offline mode handling

### Privacy & Security
- **No audio storage**: Audio processed in RAM only
- **User consent**: Explicit opt-in required
- **Encrypted storage**: Sensitive data encrypted with EncryptedSharedPreferences
- **Secure WebSocket**: WSS protocol for all communications

## Technical Stack

- **Language**: Kotlin
- **UI**: Jetpack Compose + Material Design 3
- **Database**: Room
- **Networking**: OkHttp (WebSocket)
- **Async**: Kotlin Coroutines + Flow
- **Testing**: JUnit, Kotest (property-based testing), MockK

## Requirements

- **Minimum SDK**: 26 (Android 8.0)
- **Target SDK**: 34 (Android 14)
- **Permissions**: 
  - Accessibility Service (for audio capture)
  - Internet (for backend communication)
  - Vibrate (for haptic feedback)
  - Read Phone State (for call detection)
  - Post Notifications (for alerts)

## Building

```bash
cd android
./gradlew assembleDebug
```

## Testing

```bash
# Run unit tests
./gradlew test

# Run property-based tests
./gradlew testDebugUnitTest --tests "*PropertyTest"

# Run instrumentation tests
./gradlew connectedAndroidTest
```

## Project Structure

### Domain Layer
- `IAudioCaptureService`: Audio capture via Accessibility Service
- `IAudioProcessor`: Audio format conversion and chunking
- `IWebSocketClient`: WebSocket communication with AWS
- `IHapticController`: Vibration patterns for alerts
- `INotificationService`: System notifications

### Repository Layer
- `ICallRepository`: Orchestrates audio pipeline
- `ISettingsRepository`: User preferences and consent
- `ICallHistoryRepository`: Call metadata storage

### Data Layer
- Room database for call history and Family Loop contacts
- EncryptedSharedPreferences for sensitive settings

## Performance Targets

- **Audio streaming latency**: <150ms
- **Alert display latency**: <500ms
- **Battery consumption**: <5% per hour during monitoring
- **App size**: <20MB

## License

Open source - Free for all users

## Competition

Built for AWS 10,000 AIdeas Competition - Social Good Track
