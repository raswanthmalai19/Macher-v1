# MACHER Unified App - Implementation Plan

**Goal**: Single app with dual modes (Protected User + Guardian)  
**Approach**: Phased implementation with testing at each step

---

## Phase 1: Navigation & Mode Selection (Foundation)

### 1.1 Create App Navigation Structure
- Bottom navigation for Protected Mode
- Drawer navigation for Guardian Mode
- Mode switcher in settings

### 1.2 Create User Role System
- UserRole enum (PROTECTED, GUARDIAN)
- Role selection on first launch
- Role persistence in SharedPreferences
- Account linking system (QR code)

### 1.3 Create Base Screens
- Protected Home (existing monitoring screen)
- Guardian Dashboard (new)
- Settings screen (role-specific)

**Estimated Time**: 2-3 hours  
**Testing**: Navigation works, role switching works

---

## Phase 2: Guardian Dashboard Features

### 2.1 Dashboard Overview Screen
- Protected user status card
- Recent alerts summary
- Quick actions (call, message)
- Threat level indicator

### 2.2 Trusted Contacts Management
- Add/remove trusted numbers
- Contact name and relationship
- Local storage (Room database)
- Sync with protected user's device

### 2.3 Alert History
- List of past interventions
- Metadata only (date, time, threat type, action)
- NO transcripts (privacy)
- Filter and search

### 2.4 Settings & Controls
- Sensitivity slider (Low/Medium/High)
- Feature toggles:
  - Enable haptic feedback
  - Enable screen overlay
  - Enable autonomous disconnect
  - Send me alerts
- Protected user's phone number
- Emergency contacts

**Estimated Time**: 4-6 hours  
**Testing**: All CRUD operations work, data persists

---

## Phase 3: Family Loop Alerting (In-App)

### 3.1 Local Notification System
- Trigger notifications on threat detection
- Rich notifications with actions
- Notification channels (Android 8+)

### 3.2 In-App Messaging
- Send alert to guardian's device
- Use Firebase Cloud Messaging (FCM)
- Real-time delivery
- Message history

### 3.3 SMS Fallback
- Use Android SMS API
- Send SMS if app not active
- Template messages
- Rate limiting

**Estimated Time**: 3-4 hours  
**Testing**: Notifications arrive, SMS works

---

## Phase 4: AWS Backend Integration

### 4.1 WebSocket Client (Real Implementation)
- Connect to AWS API Gateway WebSocket
- Handle connection lifecycle
- Reconnection logic
- Message serialization

### 4.2 Audio Streaming
- Capture call audio (AudioRecord)
- PCM 16kHz encoding
- Chunk and stream to WebSocket
- Buffer management

### 4.3 Transcription Integration
- Receive transcription from AWS Transcribe
- Update UI in real-time
- Handle partial results
- Error handling

### 4.4 Threat Detection Integration
- Receive threat analysis from AWS Bedrock
- Parse threat level and confidence
- Trigger interventions
- Update guardian dashboard

**Estimated Time**: 6-8 hours  
**Testing**: End-to-end flow works, latency <500ms

---

## Phase 5: Autonomous Call Termination

### 5.1 Telecom API Integration
- Request ANSWER_PHONE_CALLS permission
- Implement call disconnect logic
- Handle different Android versions
- Fallback for unsupported devices

### 5.2 Permission Flow
- "Protector Mode" permission request
- Clear explanation of what it does
- User consent flow
- Guardian approval required

### 5.3 Safety Checks
- Verify guardian has enabled feature
- Check confidence threshold (>85%)
- Log all autonomous actions
- Notify guardian immediately

**Estimated Time**: 2-3 hours  
**Testing**: Call disconnects work, permissions handled

---

## Phase 6: Data Persistence & Sync

### 6.1 Room Database Schema
```kotlin
@Entity
data class TrustedContact(
    @PrimaryKey val id: String,
    val phoneNumber: String,
    val name: String,
    val relationship: String,
    val addedBy: String, // guardian user ID
    val createdAt: Long
)

@Entity
data class AlertHistory(
    @PrimaryKey val id: String,
    val timestamp: Long,
    val threatLevel: String,
    val threatType: String,
    val confidence: Float,
    val actionTaken: String,
    val protectedUserId: String
)

@Entity
data class UserSettings(
    @PrimaryKey val userId: String,
    val role: String,
    val sensitivity: String,
    val enableHaptic: Boolean,
    val enableOverlay: Boolean,
    val enableAutoDisconnect: Boolean,
    val enableAlerts: Boolean,
    val linkedUserId: String? // for guardian-protected pairing
)
```

### 6.2 Repository Pattern
- TrustedContactRepository
- AlertHistoryRepository
- UserSettingsRepository
- Sync logic

**Estimated Time**: 3-4 hours  
**Testing**: Data persists, queries work

---

## Phase 7: Account Linking & Pairing

### 7.1 QR Code Generation
- Generate unique pairing code
- Display QR code on protected user's device
- Include user ID and device info

### 7.2 QR Code Scanning
- Guardian scans QR code
- Establish link between accounts
- Store relationship in database
- Sync settings

### 7.3 Multi-Device Support
- One protected user, multiple guardians
- One guardian, multiple protected users
- Manage relationships

**Estimated Time**: 2-3 hours  
**Testing**: Pairing works, relationships persist

---

## Implementation Order (Priority)

### Week 1: Foundation & Core Features
1. ✅ Phase 1: Navigation & Mode Selection (Day 1)
2. ✅ Phase 2: Guardian Dashboard (Day 2-3)
3. ✅ Phase 6: Data Persistence (Day 4)
4. ✅ Phase 7: Account Linking (Day 5)

### Week 2: Integration & Polish
5. ✅ Phase 3: Family Loop Alerting (Day 6-7)
6. ✅ Phase 4: AWS Backend Integration (Day 8-10)
7. ✅ Phase 5: Autonomous Call Termination (Day 11)
8. ✅ Testing & Bug Fixes (Day 12-14)

---

## Technical Decisions

### Navigation Library
**Choice**: Jetpack Navigation Compose  
**Why**: Native Compose support, type-safe, well-documented

### Database
**Choice**: Room + SQLite  
**Why**: Offline-first, fast, reliable, Android standard

### Messaging
**Choice**: Firebase Cloud Messaging (FCM)  
**Why**: Free, reliable, real-time, cross-device

### QR Code
**Choice**: ZXing (Zebra Crossing)  
**Why**: Mature, well-tested, easy to use

### WebSocket
**Choice**: OkHttp WebSocket  
**Why**: Already in dependencies, reliable, efficient

---

## Testing Strategy

### Unit Tests
- ViewModel logic
- Repository operations
- Intervention engine logic
- WebSocket message parsing

### Integration Tests
- Database operations
- Navigation flows
- Permission handling
- Notification delivery

### End-to-End Tests
- Complete monitoring flow
- Guardian dashboard operations
- Account linking
- Alert delivery

### Manual Testing Checklist
- [ ] Protected mode monitoring works
- [ ] Guardian dashboard displays correctly
- [ ] Trusted contacts CRUD works
- [ ] Alert history displays
- [ ] Settings persist
- [ ] Account linking works
- [ ] Notifications arrive
- [ ] SMS fallback works
- [ ] AWS backend connects
- [ ] Transcription displays
- [ ] Threat detection triggers
- [ ] Interventions escalate correctly
- [ ] Call disconnect works
- [ ] Multi-device sync works

---

## Risk Mitigation

### Risk: AWS Backend Not Ready
**Mitigation**: Keep demo mode functional, use mock data

### Risk: Call Disconnect Permission Denied
**Mitigation**: Graceful degradation, show manual disconnect button

### Risk: Audio Capture Fails
**Mitigation**: Clear error messages, fallback to manual monitoring

### Risk: FCM Delivery Fails
**Mitigation**: SMS fallback, local notifications

### Risk: Database Corruption
**Mitigation**: Regular backups, migration strategy

---

## Success Criteria

### Must Have
- [ ] Dual mode navigation works
- [ ] Guardian can manage trusted contacts
- [ ] Guardian receives alerts
- [ ] Protected user sees interventions
- [ ] AWS backend integration works
- [ ] Call disconnect works (if permission granted)

### Should Have
- [ ] QR code pairing works
- [ ] Multi-device support
- [ ] Alert history with search
- [ ] Settings sync between devices
- [ ] SMS fallback

### Nice to Have
- [ ] Multiple protected users per guardian
- [ ] Export alert history
- [ ] Custom alert templates
- [ ] Voice announcements

---

## Next Steps

1. **Start with Phase 1**: Create navigation structure
2. **Build incrementally**: Test each phase before moving on
3. **Keep demo mode**: Don't break existing functionality
4. **Document as we go**: Update guides with new features
5. **Test on device**: Verify everything works in real environment

---

**Ready to start implementation?**
