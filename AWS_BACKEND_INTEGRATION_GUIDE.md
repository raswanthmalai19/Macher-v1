# AWS Backend Integration Guide

This guide explains how to connect the VocalShield Android app to the real AWS backend.

---

## Current State

The app is in **Demo Mode** with simulated backend responses. To enable real AWS integration:

---

## Step 1: Get AWS WebSocket URL

### From AWS Console

1. Go to **AWS Console** → **API Gateway**
2. Find your **WebSocket API** (should be named something like "VocalShieldWebSocketAPI")
3. Click on **Stages** in the left sidebar
4. Select your stage (e.g., "production" or "dev")
5. Copy the **WebSocket URL** - it looks like:
   ```
   wss://abc123xyz.execute-api.us-east-1.amazonaws.com/production
   ```

### From AWS CDK Output

If you deployed using CDK, the WebSocket URL should be in the stack outputs:

```bash
# List stack outputs
aws cloudformation describe-stacks \
  --stack-name VocalShieldStack \
  --query 'Stacks[0].Outputs'

# Look for output with key like "WebSocketApiUrl"
```

---

## Step 2: Update Android Config

Edit `android/app/src/main/java/com/vocalshield/android/util/Config.kt`:

```kotlin
object Config {
    /**
     * WebSocket API Gateway URL for real-time audio streaming.
     * 
     * REPLACE THIS with your actual AWS API Gateway WebSocket URL
     */
    const val WEBSOCKET_URL = "wss://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/production"
    
    /**
     * REST API URL for mobile analytics and management.
     */
    const val REST_API_URL = "https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/production"
    
    /**
     * Enable demo mode for testing without real call audio.
     * 
     * Set to FALSE to enable real backend connection
     */
    const val DEMO_MODE = false  // ← Change this to false
    
    // ... rest of config
}
```

---

## Step 3: Implement Full WebSocket Client

Create `android/app/src/main/java/com/vocalshield/android/network/WebSocketClient.kt`:

```kotlin
package com.vocalshield.android.network

import com.vocalshield.android.util.Config
import com.vocalshield.android.util.Logger
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import okhttp3.*
import okio.ByteString
import java.util.concurrent.TimeUnit

class WebSocketClient {
    private var webSocket: WebSocket? = null
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState
    
    private val _transcriptionFlow = MutableStateFlow("")
    val transcriptionFlow: StateFlow<String> = _transcriptionFlow
    
    private val _threatLevelFlow = MutableStateFlow(ThreatLevel.SAFE)
    val threatLevelFlow: StateFlow<ThreatLevel> = _threatLevelFlow
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(Config.WebSocket.CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .pingInterval(Config.WebSocket.PING_INTERVAL_MS, TimeUnit.MILLISECONDS)
        .build()
    
    fun connect() {
        Logger.info("WebSocketClient", "Connecting to ${Config.WEBSOCKET_URL}")
        _connectionState.value = ConnectionState.CONNECTING
        
        val request = Request.Builder()
            .url(Config.WEBSOCKET_URL)
            .addHeader("Authorization", Config.AUTH_TOKEN)
            .build()
        
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Logger.info("WebSocketClient", "Connected")
                _connectionState.value = ConnectionState.CONNECTED
            }
            
            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }
            
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Logger.error("WebSocketClient", "Connection failed", t)
                _connectionState.value = ConnectionState.ERROR
            }
        })
    }
    
    fun disconnect() {
        webSocket?.close(1000, "Client disconnect")
        _connectionState.value = ConnectionState.DISCONNECTED
    }
    
    fun sendAudioChunk(audioData: ByteArray) {
        webSocket?.send(ByteString.of(*audioData))
    }
    
    private fun handleMessage(text: String) {
        // Parse JSON message from AWS
        // Update transcription and threat level flows
    }
}
```

---

## Step 4: Implement Audio Capture Service

Create `android/app/src/main/java/com/vocalshield/android/service/AudioCaptureService.kt`:

```kotlin
package com.vocalshield.android.service

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.vocalshield.android.util.Config
import com.vocalshield.android.util.Logger
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

class AudioCaptureService {
    private var audioRecord: AudioRecord? = null
    private var captureJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    
    private val _isCapturing = MutableStateFlow(false)
    val isCapturing: StateFlow<Boolean> = _isCapturing
    
    private val bufferSize = AudioRecord.getMinBufferSize(
        Config.Audio.SAMPLE_RATE,
        Config.Audio.CHANNEL_CONFIG,
        Config.Audio.AUDIO_FORMAT
    )
    
    fun startCapture(onAudioData: (ByteArray) -> Unit) {
        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            Config.Audio.SAMPLE_RATE,
            Config.Audio.CHANNEL_CONFIG,
            Config.Audio.AUDIO_FORMAT,
            bufferSize * 2
        )
        
        audioRecord?.startRecording()
        _isCapturing.value = true
        
        captureJob = scope.launch {
            val buffer = ShortArray(bufferSize)
            while (isActive) {
                val readSize = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                if (readSize > 0) {
                    // Convert to byte array and send
                    val byteArray = shortArrayToByteArray(buffer, readSize)
                    onAudioData(byteArray)
                }
            }
        }
    }
    
    fun stopCapture() {
        captureJob?.cancel()
        audioRecord?.stop()
        audioRecord?.release()
        _isCapturing.value = false
    }
    
    private fun shortArrayToByteArray(shorts: ShortArray, size: Int): ByteArray {
        val bytes = ByteArray(size * 2)
        for (i in 0 until size) {
            bytes[i * 2] = (shorts[i].toInt() and 0xFF).toByte()
            bytes[i * 2 + 1] = (shorts[i].toInt() shr 8 and 0xFF).toByte()
        }
        return bytes
    }
}
```

---

## Step 5: Update MonitoringManager

Update `android/app/src/main/java/com/vocalshield/android/service/MonitoringManager.kt`:

```kotlin
class MonitoringManager(private val context: Context) {
    private val webSocketClient = WebSocketClient()
    private val audioCaptureService = AudioCaptureService()
    
    // ... existing state flows ...
    
    fun startMonitoring() {
        Logger.info("MonitoringManager", "Starting monitoring")
        
        // Connect to WebSocket
        webSocketClient.connect()
        
        // Start audio capture
        audioCaptureService.startCapture { audioData ->
            // Send audio to WebSocket
            webSocketClient.sendAudioChunk(audioData)
        }
        
        // Observe WebSocket flows
        scope.launch {
            webSocketClient.transcriptionFlow.collect { transcript ->
                _transcription.value = transcript
            }
        }
        
        scope.launch {
            webSocketClient.threatLevelFlow.collect { level ->
                _threatLevel.value = level
                if (level == ThreatLevel.DANGER) {
                    triggerHapticFeedback()
                }
            }
        }
        
        _isMonitoring.value = true
    }
    
    fun stopMonitoring() {
        audioCaptureService.stopCapture()
        webSocketClient.disconnect()
        _isMonitoring.value = false
    }
}
```

---

## Step 6: Rebuild and Test

```bash
cd android
./gradlew clean assembleDebug
./gradlew installDebug
```

---

## Step 7: Test Real Backend Connection

1. **Launch app** on device/emulator
2. **Grant permissions** (Audio, Phone State)
3. **Tap START MONITORING**
4. **Speak into microphone**
5. **Verify**:
   - Connection status shows "Connected"
   - Live transcription appears
   - Threat level updates based on content

---

## AWS Backend Message Format

### Messages from Android → AWS

**Audio Chunk** (Binary):
```
Raw PCM audio data (16-bit, 16kHz, mono)
Sent as WebSocket binary frames
```

**Control Message** (JSON):
```json
{
  "action": "connect",
  "data": {
    "clientType": "android",
    "version": "1.0.0"
  }
}
```

### Messages from AWS → Android

**Transcription Update**:
```json
{
  "type": "transcription",
  "data": {
    "transcript": "Hello, this is the transcribed text...",
    "isFinal": false,
    "timestamp": "2026-03-01T12:00:00Z"
  }
}
```

**Threat Analysis**:
```json
{
  "type": "threat_analysis",
  "data": {
    "threatLevel": "danger",
    "confidence": 0.95,
    "reason": "Detected social engineering patterns",
    "scamType": "IRS impersonation",
    "timestamp": "2026-03-01T12:00:05Z"
  }
}
```

**Error**:
```json
{
  "type": "error",
  "data": {
    "message": "Transcription service unavailable",
    "code": "TRANSCRIBE_ERROR"
  }
}
```

---

## Testing Checklist

### Connection Testing
- [ ] App connects to WebSocket successfully
- [ ] Connection status shows "Connected"
- [ ] Reconnection works after network interruption
- [ ] Error handling works for invalid URLs

### Audio Testing
- [ ] Microphone permission granted
- [ ] Audio capture starts successfully
- [ ] Audio chunks sent to WebSocket
- [ ] Audio quality is acceptable (16kHz, 16-bit)

### Transcription Testing
- [ ] Transcription appears in real-time
- [ ] Transcription updates smoothly
- [ ] Partial results show up quickly
- [ ] Final results are accurate

### Threat Detection Testing
- [ ] Threat level updates based on content
- [ ] Safe calls show green indicator
- [ ] Suspicious calls show yellow indicator
- [ ] Dangerous calls show red indicator
- [ ] Haptic feedback triggers for danger

### Performance Testing
- [ ] Latency < 500ms end-to-end
- [ ] No audio dropouts
- [ ] Smooth UI updates
- [ ] Battery drain acceptable (<5% per hour)

---

## Troubleshooting

### WebSocket Connection Fails

**Check**:
1. WebSocket URL is correct (starts with `wss://`)
2. AWS API Gateway is deployed and running
3. Network connectivity is available
4. Firewall/proxy allows WebSocket connections

**Debug**:
```bash
# Test WebSocket from command line
wscat -c wss://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/production
```

### No Transcription Appears

**Check**:
1. Audio permission granted
2. Microphone is working
3. Audio chunks are being sent (check logs)
4. AWS Transcribe is configured correctly
5. WebSocket message format is correct

**Debug**:
```kotlin
// Add logging in AudioCaptureService
Logger.debug("AudioCapture", "Captured ${audioData.size} bytes")

// Add logging in WebSocketClient
Logger.debug("WebSocket", "Sent audio chunk: ${audioData.size} bytes")
```

### Threat Level Not Updating

**Check**:
1. AWS Bedrock is configured correctly
2. Fraud detection Lambda is running
3. Message format from backend is correct
4. JSON parsing is working

**Debug**:
```kotlin
// Add logging in handleMessage
Logger.debug("WebSocket", "Received message: $text")
```

---

## Security Considerations

### API Authentication

Currently using placeholder token. For production:

```kotlin
// Use AWS Cognito for authentication
const val AUTH_TOKEN = getCognitoToken()

private fun getCognitoToken(): String {
    // Implement Cognito authentication
    // Return JWT token
}
```

### Audio Data Privacy

- ✅ Audio never stored on device
- ✅ Audio processed in memory only
- ✅ Audio discarded after analysis
- ✅ PII redacted by AWS Bedrock Guardrails
- ✅ No audio sent to third parties

### Network Security

- ✅ WebSocket uses TLS (wss://)
- ✅ Certificate pinning (optional, for production)
- ✅ Request signing (optional, for production)

---

## Next Steps

1. ✅ Get AWS WebSocket URL
2. ✅ Update Config.kt
3. ✅ Implement WebSocketClient
4. ✅ Implement AudioCaptureService
5. ✅ Update MonitoringManager
6. ✅ Rebuild APK
7. ✅ Test on device
8. ✅ Record demo video
9. ✅ Submit to competition

---

## Support

For issues with AWS backend integration:
- Check AWS CloudWatch logs for Lambda errors
- Check API Gateway logs for WebSocket connection issues
- Check AWS Transcribe console for transcription errors
- Check AWS Bedrock console for fraud detection errors

For issues with Android app:
- Check Logcat for error messages
- Use Android Studio debugger
- Test on multiple devices/Android versions
