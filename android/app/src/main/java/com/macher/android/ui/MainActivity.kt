package com.macher.android.ui

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.provider.CallLog
import android.provider.Settings
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import java.util.concurrent.Executors
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.compose.rememberNavController
import com.macher.android.data.model.UserRole
import com.macher.android.data.preferences.UserPreferences
import com.macher.android.data.preferences.AppPreferences
import com.macher.android.detection.DetectionMode
import com.macher.android.detection.RiskBreakdown
import com.macher.android.detection.ScenarioProgress
import com.macher.android.navigation.Routes
import com.macher.android.navigation.MacherNavGraph
import com.macher.android.service.ConnectionState
import com.macher.android.service.MonitoringManager
import com.macher.android.service.ThreatLevel as NetworkThreatLevel
import com.macher.android.ui.components.DetectionModeIndicator
import com.macher.android.util.AnnounceThreatLevel
import com.macher.android.util.AnnounceDetectionMode
import com.macher.android.ui.components.RiskBreakdownCard
import com.macher.android.ui.components.ScenarioProgressCard
import com.macher.android.ui.components.ScenarioSelectorCard
import com.macher.android.ui.theme.*
import com.macher.android.util.Config
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlin.math.sin

/**
 * MACHER - Premium Dark-Mode UI
 * Professional, modern design with neon accents, glassmorphism, and fluid animations
 */
class MainActivity : ComponentActivity() {
    
    private lateinit var monitoringManager: MonitoringManager
    private var callDetectionReceiver: BroadcastReceiver? = null
    private var phoneStateReceiver: BroadcastReceiver? = null
    // TelephonyManager.listen() — primary MIUI-safe call detector (non-broadcast)
    private var telephonyManager: TelephonyManager? = null
    @Suppress("DEPRECATION")
    private var legacyPhoneStateListener: PhoneStateListener? = null
    private var modernCallCallback: Any? = null // TelephonyCallback (API 31+)
    // Cache number from RINGING so we have it at OFFHOOK (unified between all detectors)
    private var cachedCallerNumber: String = ""
    private var lastCallState: Int = TelephonyManager.CALL_STATE_IDLE
    private var callStatePollingJob: Job? = null

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val denied = permissions.filter { !it.value }.keys
        if (denied.isNotEmpty()) {
            com.macher.android.util.Logger.warn("MainActivity", "Permissions denied: $denied")
            // Critical permission: RECORD_AUDIO is required for monitoring
            if (denied.contains(Manifest.permission.RECORD_AUDIO)) {
                com.macher.android.util.Logger.error("MainActivity", "RECORD_AUDIO denied — monitoring will not work")
            }
        } else {
            com.macher.android.util.Logger.info("MainActivity", "All permissions granted")
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        monitoringManager = MonitoringManager(this)
        val userPreferences = UserPreferences(this)
        val appPreferences = AppPreferences(this)
        requestPermissions()
        registerCallDetectionReceiver()
        registerTelephonyListener()
        
        setContent {
            // Read theme preference from DataStore — recompose when it changes
            val isDarkTheme by userPreferences.isDarkTheme.collectAsState(initial = true)

            MacherTheme(darkTheme = isDarkTheme) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()
                    val scope = rememberCoroutineScope()
                    
                    // Determine start destination from persisted prefs
                    var startDestination by remember { mutableStateOf<String?>(null) }
                    LaunchedEffect(Unit) {
                        combine(
                            userPreferences.isOnboardingComplete,
                            userPreferences.userRole
                        ) { complete, role -> complete to role }
                            .first()
                            .let { (complete, role) ->
                                startDestination = when {
                                    !complete -> Routes.ONBOARDING
                                    role == UserRole.GUARDIAN -> Routes.GUARDIAN_DASHBOARD
                                    role == UserRole.PROTECTED -> Routes.PROTECTED_HOME
                                    else -> Routes.ROLE_SELECTION
                                }
                            }
                    }
                    
                    val resolvedStart = startDestination
                    if (resolvedStart == null) {
                        SplashScreen()
                    } else {
                        MacherNavGraph(
                            navController = navController,
                            startDestination = resolvedStart,
                            monitoringManager = monitoringManager,
                            userPreferences = userPreferences,
                            appPreferences = appPreferences,
                            isDarkTheme = isDarkTheme,
                            onThemeToggle = { dark ->
                                scope.launch { userPreferences.setDarkTheme(dark) }
                            }
                        )
                    }
                }
            }
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        callDetectionReceiver?.let {
            try { unregisterReceiver(it) } catch (_: Exception) {}
        }
        callDetectionReceiver = null
        phoneStateReceiver?.let {
            try { unregisterReceiver(it) } catch (_: Exception) {}
        }
        phoneStateReceiver = null
        callStatePollingJob?.cancel()
        callStatePollingJob = null
        unregisterTelephonyListener()
        monitoringManager.cleanup()
    }

    override fun onResume() {
        super.onResume()
        // MIUI fix: immediately check current call state (catches already-active calls)
        val currentState = telephonyManager?.callState ?: TelephonyManager.CALL_STATE_IDLE
        com.macher.android.util.Logger.info("MainActivity", "[Poll] onResume — callState=$currentState lastKnown=$lastCallState")
        if (currentState != lastCallState) {
            handleTelephonyCallState(currentState, "")
        }
        startCallStatePolling()
    }

    override fun onPause() {
        super.onPause()
        callStatePollingJob?.cancel()
        callStatePollingJob = null
    }

    /**
     * Polls TelephonyManager.callState every 2 seconds as a MIUI fallback.
     * On MIUI, TelephonyCallback.onCallStateChanged(OFFHOOK) is frequently not fired
     * for outgoing VoLTE calls. Direct polling catches the state change reliably.
     */
    private fun startCallStatePolling() {
        callStatePollingJob?.cancel()
        callStatePollingJob = lifecycleScope.launch {
            while (true) {
                delay(2000L)
                val state = telephonyManager?.callState ?: TelephonyManager.CALL_STATE_IDLE
                if (state != lastCallState) {
                    com.macher.android.util.Logger.info("MainActivity",
                        "[Poll] State changed $lastCallState -> $state (MIUI fallback)")
                    handleTelephonyCallState(state, "")
                }
            }
        }
    }

    private fun registerCallDetectionReceiver() {
        // Receiver for MACHER's own CallScreeningService broadcast (API 29+)
        callDetectionReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val phoneNumber = intent?.getStringExtra("phone_number") ?: ""
                com.macher.android.util.Logger.info("MainActivity", "Call detected broadcast received for monitoring")
                // Start real monitoring if armed (isMonitoring=true) but no active call yet
                if (monitoringManager.isMonitoring.value && !monitoringManager.isActiveCall.value) {
                    monitoringManager.startMonitoring(phoneNumber)
                }
            }
        }
        val filter = IntentFilter("com.macher.android.CALL_DETECTED")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(callDetectionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(callDetectionReceiver, filter)
        }
        
        // PhoneStateReceiver: Detects incoming/outgoing calls on ALL API levels.
        // Routes through handleTelephonyCallState() so both sources share unified caching.
        phoneStateReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
                val stateStr = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
                val phoneNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER) ?: ""
                val state = when (stateStr) {
                    TelephonyManager.EXTRA_STATE_RINGING -> TelephonyManager.CALL_STATE_RINGING
                    TelephonyManager.EXTRA_STATE_OFFHOOK -> TelephonyManager.CALL_STATE_OFFHOOK
                    else -> TelephonyManager.CALL_STATE_IDLE
                }
                com.macher.android.util.Logger.info("MainActivity", "[BroadcastReceiver] state=$stateStr number=$phoneNumber")
                handleTelephonyCallState(state, phoneNumber)
            }
        }
        val phoneFilter = IntentFilter(TelephonyManager.ACTION_PHONE_STATE_CHANGED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // System broadcasts require RECEIVER_EXPORTED to be delivered on Android 13+
            registerReceiver(phoneStateReceiver, phoneFilter, Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(phoneStateReceiver, phoneFilter)
        }

        // Listen for the internal forwarded broadcast from our manifest-declared PhoneStateManifestReceiver.
        // This receiver fires even when MIUI blocks direct delivery to dynamically-registered receivers.
        val manifestForwardReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val stateStr = intent?.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
                val state = when (stateStr) {
                    TelephonyManager.EXTRA_STATE_RINGING -> TelephonyManager.CALL_STATE_RINGING
                    TelephonyManager.EXTRA_STATE_OFFHOOK -> TelephonyManager.CALL_STATE_OFFHOOK
                    else -> TelephonyManager.CALL_STATE_IDLE
                }
                com.macher.android.util.Logger.info("MainActivity",
                    "[ManifestForward] state=$stateStr")
                handleTelephonyCallState(state, "")
            }
        }
        val internalFilter = IntentFilter(
            com.macher.android.service.PhoneStateManifestReceiver.ACTION_INTERNAL_PHONE_STATE
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(manifestForwardReceiver, internalFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(manifestForwardReceiver, internalFilter)
        }
    }
    
    /**
     * Register TelephonyManager listener — the PRIMARY and MOST RELIABLE method on MIUI/Xiaomi.
     * Unlike ACTION_PHONE_STATE_CHANGED broadcasts (which MIUI blocks), this direct API call
     * always delivers call state changes to the app.
     *
     * Uses TelephonyCallback on API 31+ (avoids deprecation lint), falls back to
     * PhoneStateListener on older devices.
     */
    @Suppress("DEPRECATION")
    private fun registerTelephonyListener() {
        telephonyManager = getSystemService(TelephonyManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // API 31+ — TelephonyCallback (modern, non-deprecated)
            val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    // TelephonyCallback doesn't provide phone number — resolved via CallLog
                    handleTelephonyCallState(state, "")
                }
            }
            telephonyManager?.registerTelephonyCallback(
                Executors.newSingleThreadExecutor(), callback
            )
            modernCallCallback = callback
            com.macher.android.util.Logger.info("MainActivity", "TelephonyCallback registered (API 31+)")
        } else {
            // API < 31 — PhoneStateListener (deprecated but works)
            val listener = object : PhoneStateListener() {
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    handleTelephonyCallState(state, phoneNumber ?: "")
                }
            }
            telephonyManager?.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
            legacyPhoneStateListener = listener
            com.macher.android.util.Logger.info("MainActivity", "PhoneStateListener registered (legacy)")
        }
    }

    @Suppress("DEPRECATION")
    private fun unregisterTelephonyListener() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (modernCallCallback as? TelephonyCallback)?.let {
                    telephonyManager?.unregisterTelephonyCallback(it)
                }
            } else {
                legacyPhoneStateListener?.let {
                    telephonyManager?.listen(it, PhoneStateListener.LISTEN_NONE)
                }
            }
        } catch (_: Exception) {}
        telephonyManager = null
        modernCallCallback = null
        legacyPhoneStateListener = null
    }

    /**
     * Unified call state handler — called from BOTH TelephonyListener AND broadcast receiver.
     * Guards against double-triggering with [lastCallState] check.
     *
     * On API 31+, phoneNumber will be empty (TelephonyCallback doesn't provide it).
     * We resolve it by reading the most recent CallLog entry.
     */
    private fun handleTelephonyCallState(state: Int, phoneNumber: String) {
        if (state == lastCallState) return // debounce duplicates

        // If phone number is empty (API 31 TelephonyCallback path), read from CallLog
        val resolvedNumber = if (phoneNumber.isNotEmpty()) {
            phoneNumber
        } else if (state == TelephonyManager.CALL_STATE_RINGING ||
                   state == TelephonyManager.CALL_STATE_OFFHOOK) {
            queryLatestCallLogNumber() ?: ""
        } else ""

        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                if (resolvedNumber.isNotEmpty()) cachedCallerNumber = resolvedNumber
                com.macher.android.util.Logger.info("MainActivity",
                    "[TelephonyListener] RINGING — caller: $cachedCallerNumber")
            }
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                if (cachedCallerNumber.isEmpty() && resolvedNumber.isNotEmpty()) {
                    cachedCallerNumber = resolvedNumber
                }
                com.macher.android.util.Logger.info("MainActivity",
                    "[TelephonyListener] OFFHOOK — starting monitoring for: $cachedCallerNumber")
                // Auto-arm if shield wasn't pressed by the user yet
                if (!monitoringManager.isMonitoring.value) {
                    com.macher.android.util.Logger.info("MainActivity",
                        "[TelephonyListener] Auto-arming monitoring (shield not manually pressed)")
                    monitoringManager.startMonitoring()
                }
                if (!monitoringManager.isActiveCall.value) {
                    monitoringManager.startMonitoring(cachedCallerNumber)
                }
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                if (lastCallState != TelephonyManager.CALL_STATE_IDLE) {
                    com.macher.android.util.Logger.info("MainActivity",
                        "[TelephonyListener] IDLE — call ended")
                    cachedCallerNumber = ""
                    if (monitoringManager.isActiveCall.value) {
                        monitoringManager.stopCallMonitoring()
                    }
                }
            }
        }
        lastCallState = state
    }

    /**
     * Query CallLog for the most recent incoming/outgoing call number.
     * Used on API 31+ where TelephonyCallback doesn't provide the number.
     * Requires READ_CALL_LOG permission.
     */
    private fun queryLatestCallLogNumber(): String? {
        return try {
            val cursor = contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(CallLog.Calls.NUMBER),
                null, null,
                "${CallLog.Calls.DATE} DESC"
            ) ?: return null
            cursor.use { c ->
                if (c.moveToFirst()) c.getString(0) else null
            }
        } catch (e: Exception) {
            com.macher.android.util.Logger.warn("MainActivity", "CallLog query failed: ${e.message}")
            null
        }
    }

    private fun requestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.ANSWER_PHONE_CALLS,
            Manifest.permission.SEND_SMS
        )
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        permissionLauncher.launch(permissions.toTypedArray())
    }
}

@Composable
fun MacherApp(monitoringManager: MonitoringManager) {
    val isMonitoring by monitoringManager.isMonitoring.collectAsState()
    val threatLevel by monitoringManager.threatLevel.collectAsState()
    val transcription by monitoringManager.transcription.collectAsState()
    val connectionState by monitoringManager.connectionState.collectAsState()
    val overlayVisible by monitoringManager.overlayVisible.collectAsState()
    val threatType by monitoringManager.threatType.collectAsState()
    val threatConfidence by monitoringManager.threatConfidence.collectAsState()
    val audioLevel by monitoringManager.audioLevel.collectAsState()
    
    // NEW: Collect detection state flows for multi-layer detection UI (Task 8.1)
    val detectionState by monitoringManager.detectionState.collectAsState()
    val riskBreakdown by monitoringManager.riskBreakdown.collectAsState()
    val scenarioProgress by monitoringManager.scenarioProgress.collectAsState()
    val detectionMode by monitoringManager.detectionMode.collectAsState()
    val isActiveCall by monitoringManager.isActiveCall.collectAsState()
    
    // Task 12.2: TalkBack announcements for threat level and detection mode changes
    AnnounceThreatLevel(threatLevel = threatLevel.name)
    AnnounceDetectionMode(detectionMode = detectionMode.name)
    
    var showSplash by remember { mutableStateOf(true) }
    
    val uiThreatLevel = when (threatLevel) {
        NetworkThreatLevel.SAFE -> ThreatLevel.SAFE
        NetworkThreatLevel.CAUTION -> ThreatLevel.CAUTION
        NetworkThreatLevel.DANGER -> ThreatLevel.DANGER
    }
    
    LaunchedEffect(Unit) {
        delay(2200)
        showSplash = false
    }
    
    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        // Animated ambient background particles
        AmbientBackground()
        
        AnimatedVisibility(
            visible = showSplash,
            exit = fadeOut(animationSpec = tween(600)) + slideOutVertically(targetOffsetY = { -it / 4 })
        ) {
            SplashScreen()
        }
        
        AnimatedVisibility(
            visible = !showSplash,
            enter = fadeIn(animationSpec = tween(800, delayMillis = 200)) + slideInVertically(initialOffsetY = { it / 6 })
        ) {
            MainContent(
                isMonitoring = isMonitoring,
                threatLevel = uiThreatLevel,
                threatConfidence = threatConfidence,
                audioLevel = audioLevel,
                transcription = transcription,
                connectionState = connectionState,
                detectionMode = detectionMode,
                riskBreakdown = riskBreakdown,
                scenarioProgress = scenarioProgress,
                isActiveCall = isActiveCall,
                monitoringManager = monitoringManager,
                onMonitoringToggle = {
                    if (isMonitoring) monitoringManager.stopMonitoring()
                    else monitoringManager.startMonitoring()
                },
                onThreatLevelChange = { level ->
                    val networkLevel = when (level) {
                        ThreatLevel.SAFE -> NetworkThreatLevel.SAFE
                        ThreatLevel.CAUTION -> NetworkThreatLevel.CAUTION
                        ThreatLevel.DANGER -> NetworkThreatLevel.DANGER
                    }
                    monitoringManager.simulateThreat(
                        when (networkLevel) {
                            NetworkThreatLevel.SAFE -> com.macher.android.service.ThreatLevel.SAFE
                            NetworkThreatLevel.CAUTION -> com.macher.android.service.ThreatLevel.CAUTION
                            NetworkThreatLevel.DANGER -> com.macher.android.service.ThreatLevel.DANGER
                        }
                    )
                }
            )
        }
        
        ScamWarningOverlay(
            visible = overlayVisible,
            threatType = threatType.ifEmpty { "Known Scam Tactics Detected" },
            onDismiss = { monitoringManager.dismissOverlay() },
            onDisconnect = { monitoringManager.disconnectCall() }
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// AMBIENT BACKGROUND - Floating gradient orbs
// ═══════════════════════════════════════════════════════════════
@Composable
fun AmbientBackground() {
    val infiniteTransition = rememberInfiniteTransition(label = "ambient")
    val phase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 6.2832f, // 2*PI
        animationSpec = infiniteRepeatable(
            animation = tween(12000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "phase"
    )
    
    Canvas(modifier = Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        
        // Cyan orb - top right
        drawCircle(
            color = MacherElectricCyan.copy(alpha = 0.06f),
            radius = w * 0.4f,
            center = Offset(w * 0.8f + sin(phase) * 30f, h * 0.15f + sin(phase * 0.7f) * 20f)
        )
        
        // Violet orb - bottom left
        drawCircle(
            color = MacherViolet.copy(alpha = 0.05f),
            radius = w * 0.35f,
            center = Offset(w * 0.2f + sin(phase * 0.5f) * 25f, h * 0.75f + sin(phase * 0.8f) * 15f)
        )
        
        // Small green accent - center
        drawCircle(
            color = SafeGreen.copy(alpha = 0.03f),
            radius = w * 0.2f,
            center = Offset(w * 0.5f + sin(phase * 1.2f) * 20f, h * 0.5f)
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// SPLASH SCREEN - Premium animated entrance
// ═══════════════════════════════════════════════════════════════
@Composable
fun SplashScreen() {
    val scale = remember { Animatable(0.3f) }
    val alpha = remember { Animatable(0f) }
    val titleOffset = remember { Animatable(40f) }
    
    LaunchedEffect(Unit) {
        launch {
            scale.animateTo(1f, animationSpec = spring(
                dampingRatio = Spring.DampingRatioMediumBouncy,
                stiffness = Spring.StiffnessLow
            ))
        }
        launch { alpha.animateTo(1f, animationSpec = tween(1000)) }
        launch { titleOffset.animateTo(0f, animationSpec = tween(1200, easing = EaseOutQuart)) }
    }
    
    Box(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        // Radial glow behind logo
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        MacherElectricCyan.copy(alpha = 0.15f),
                        MacherViolet.copy(alpha = 0.05f),
                        Color.Transparent
                    ),
                    center = Offset(size.width / 2, size.height / 2),
                    radius = size.width * 0.6f
                ),
                center = Offset(size.width / 2, size.height / 2),
                radius = size.width * 0.6f
            )
        }
        
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .scale(scale.value)
                .graphicsLayer { this.alpha = alpha.value }
        ) {
            // Shield icon with cyan glow ring
            Box(
                modifier = Modifier.size(130.dp),
                contentAlignment = Alignment.Center
            ) {
                // Outer glow ring
                Box(
                    modifier = Modifier
                        .size(130.dp)
                        .border(
                            width = 3.dp,
                            brush = Brush.sweepGradient(
                                colors = listOf(
                                    MacherElectricCyan,
                                    MacherViolet,
                                    MacherElectricCyan
                                )
                            ),
                            shape = CircleShape
                        )
                )
                // Inner circle
                Box(
                    modifier = Modifier
                        .size(110.dp)
                        .background(
                            brush = Brush.radialGradient(
                                colors = listOf(
                                    MaterialTheme.colorScheme.surfaceVariant,
                                    MaterialTheme.colorScheme.surface
                                )
                            ),
                            shape = CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(text = "🛡️", fontSize = 56.sp)
                }
            }
            
            Spacer(modifier = Modifier.height(32.dp))
            
            Text(
                text = "MACHER",
                fontSize = 48.sp,
                fontWeight = FontWeight.Black,
                color = MacherElectricCyan,
                letterSpacing = 8.sp,
                modifier = Modifier.graphicsLayer { translationY = titleOffset.value }
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "AI Voice Fraud Firewall",
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                letterSpacing = 3.sp,
                modifier = Modifier.graphicsLayer { translationY = titleOffset.value * 0.5f }
            )
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// MAIN CONTENT - The hero screen
// ═══════════════════════════════════════════════════════════════
@Composable
fun MainContent(
    isMonitoring: Boolean,
    threatLevel: ThreatLevel,
    threatConfidence: Float = 0f,
    audioLevel: Float = 0f,
    transcription: String,
    connectionState: ConnectionState,
    detectionMode: DetectionMode,
    riskBreakdown: RiskBreakdown?,
    scenarioProgress: ScenarioProgress?,
    isActiveCall: Boolean = false,
    monitoringManager: MonitoringManager,
    onMonitoringToggle: () -> Unit,
    onThreatLevelChange: (ThreatLevel) -> Unit
) {
    val scrollState = rememberScrollState()
    val scope = rememberCoroutineScope()
    
    val pulseScale = remember { Animatable(1f) }
    LaunchedEffect(isMonitoring) {
        if (isMonitoring) {
            while (true) {
                pulseScale.animateTo(1.03f, animationSpec = tween(1500, easing = EaseInOutSine))
                pulseScale.animateTo(1f, animationSpec = tween(1500, easing = EaseInOutSine))
            }
        } else {
            pulseScale.snapTo(1f)
        }
    }
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(48.dp))
        
        // ── Premium Hero Header ──
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            color = Color.Transparent,
            shadowElevation = 8.dp
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        brush = Brush.linearGradient(
                            colors = listOf(
                                MacherDeepBlue,
                                MacherNavy,
                                Color(0xFF0D1A33)
                            )
                        ),
                        shape = RoundedCornerShape(24.dp)
                    )
                    .padding(24.dp)
            ) {
                Column {
                    // Greeting row
                    val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
                    val greeting = when {
                        hour < 12 -> "Good Morning"
                        hour < 17 -> "Good Afternoon"
                        else -> "Good Evening"
                    }
                    Text(
                        text = "$greeting 👋",
                        fontSize = 16.sp,
                        color = MacherCyanSoft,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "MACHER",
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Black,
                        color = MacherElectricCyan,
                        letterSpacing = 6.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "AI Voice Fraud Firewall",
                        fontSize = 13.sp,
                        color = Color.White.copy(alpha = 0.6f),
                        letterSpacing = 2.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    // Mini stats row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        HeroMiniStat(value = if (isMonitoring) "Active" else "Standby", label = "Status",
                            color = if (isMonitoring) SafeGreen else CautionYellow)
                        HeroMiniStat(value = when(threatLevel) {
                            ThreatLevel.SAFE -> "Safe"
                            ThreatLevel.CAUTION -> "Caution"
                            ThreatLevel.DANGER -> "Danger"
                        }, label = "Threat",
                            color = when(threatLevel) {
                            ThreatLevel.SAFE -> SafeGreen
                            ThreatLevel.CAUTION -> CautionYellow
                            ThreatLevel.DANGER -> DangerRed
                        })
                        HeroMiniStat(value = when {
                            Config.DEMO_MODE -> "Demo"
                            connectionState == ConnectionState.CONNECTED -> "Online"
                            connectionState == ConnectionState.CONNECTING -> "Connecting"
                            // Armed = monitoring but no active WS yet
                            isMonitoring && !isActiveCall && connectionState == ConnectionState.DISCONNECTED -> "Armed"
                            connectionState == ConnectionState.ERROR -> "Offline"
                            else -> "Offline"
                        }, label = "Backend",
                            color = when {
                                connectionState == ConnectionState.CONNECTED -> SafeGreen
                                connectionState == ConnectionState.CONNECTING -> CautionYellow
                                Config.DEMO_MODE -> MacherElectricCyan
                                isMonitoring && !isActiveCall -> MacherElectricCyan
                                else -> MaterialTheme.colorScheme.onSurfaceVariant
                            })
                    }
                }
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // ── Detection Mode Indicator (Task 8.1) ──
        DetectionModeIndicator(
            mode = detectionMode,
            isActiveCall = isActiveCall,
            modifier = Modifier.fillMaxWidth()
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // ── Quick Demo Button (Task 15.1) ──
        if (detectionMode == DetectionMode.DEMO && !isMonitoring) {
            QuickDemoButton(
                onQuickDemo = {
                    // Auto-select high-risk scenario (Bank Fraud OTP)
                    val bankFraudScenario = monitoringManager.getDemoScenarios()
                        .find { it.id == "bank_fraud_otp" }
                    if (bankFraudScenario != null) {
                        monitoringManager.selectDemoScenario(bankFraudScenario.id)
                        scope.launch {
                            delay(500) // Brief delay for UI update
                            monitoringManager.startMonitoring()
                            delay(300)
                            monitoringManager.playDemoScenario()
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        // ── Scenario Selector (Demo Mode Only) (Task 8.1) ──
        if (detectionMode == DetectionMode.DEMO && !isMonitoring) {
            ScenarioSelectorCard(
                scenarios = monitoringManager.getDemoScenarios(),
                selectedScenarioId = monitoringManager.getCurrentDemoScenario()?.id,
                onScenarioSelected = { scenarioId ->
                    monitoringManager.selectDemoScenario(scenarioId)
                },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        // ── Scenario Progress (When Scenario Selected) (Task 8.1) ──
        if (scenarioProgress != null) {
            ScenarioProgressCard(
                progress = scenarioProgress,
                onPlay = { monitoringManager.playDemoScenario() },
                onPause = { monitoringManager.pauseDemoScenario() },
                onReset = { monitoringManager.resetDemoScenario() },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        // ── Threat Level Ring ──
        ThreatIndicator(
            threatLevel = threatLevel,
            isMonitoring = isMonitoring,
            scale = pulseScale.value,
            threatConfidence = threatConfidence
        )
        
        Spacer(modifier = Modifier.height(36.dp))
        
        // ── Monitoring Button ──
        AnimatedMonitoringButton(
            isMonitoring = isMonitoring,
            threatLevel = threatLevel,
            onClick = onMonitoringToggle
        )

        // ── Audio Waveform (visible when monitoring) ──
        AnimatedVisibility(
            visible = isMonitoring,
            enter = expandVertically(animationSpec = spring(stiffness = Spring.StiffnessLow)) + fadeIn(),
            exit = shrinkVertically() + fadeOut()
        ) {
            AudioWaveform(
                audioLevel = audioLevel,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(40.dp)
                    .padding(top = 8.dp)
            )
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // ── Status Cards Grid ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Backend Status
            StatusMiniCard(
                modifier = Modifier.weight(1f),
                icon = when {
                    Config.DEMO_MODE -> "🧪"
                    connectionState == ConnectionState.CONNECTED -> "⚡"
                    connectionState == ConnectionState.CONNECTING -> "◎"
                    connectionState == ConnectionState.DISCONNECTING -> "◎"
                    // Armed: monitoring is ON but no active call yet — no WS open, not an error
                    isMonitoring && !isActiveCall && connectionState == ConnectionState.DISCONNECTED -> "🛡"
                    connectionState == ConnectionState.ERROR && !monitoringManager.webSocketClient.isReconnecting.value -> "⚠"
                    connectionState == ConnectionState.ERROR -> "◌"  // spinning retry
                    else -> "○"
                },
                label = "Backend",
                value = when {
                    Config.DEMO_MODE -> "Demo Mode"
                    connectionState == ConnectionState.CONNECTED -> "Connected"
                    connectionState == ConnectionState.CONNECTING -> "Connecting..."
                    connectionState == ConnectionState.DISCONNECTING -> "Closing..."
                    // Armed: show "Armed" — backend will connect when a call arrives
                    isMonitoring && !isActiveCall && connectionState == ConnectionState.DISCONNECTED -> "Armed"
                    // ERROR while retrying — show Connecting, not Cloud Offline
                    connectionState == ConnectionState.ERROR && monitoringManager.webSocketClient.isReconnecting.value -> "Connecting..."
                    connectionState == ConnectionState.ERROR -> "Cloud Offline"
                    else -> "Offline"
                },
                accentColor = when {
                    Config.DEMO_MODE -> MacherElectricCyan
                    connectionState == ConnectionState.CONNECTED -> SafeGreen
                    connectionState == ConnectionState.CONNECTING -> CautionYellow
                    connectionState == ConnectionState.DISCONNECTING -> CautionYellow
                    // Armed: neutral cyan — app is ready, not broken
                    isMonitoring && !isActiveCall && connectionState == ConnectionState.DISCONNECTED -> MacherElectricCyan
                    // Retrying — yellow like connecting, not alarming red/warning
                    connectionState == ConnectionState.ERROR && monitoringManager.webSocketClient.isReconnecting.value -> CautionYellow
                    connectionState == ConnectionState.ERROR -> CautionYellow
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                }
            )
            
            // Monitoring Status
            StatusMiniCard(
                modifier = Modifier.weight(1f),
                icon = when {
                    !isMonitoring -> "⏸"
                    isActiveCall -> "🔴"  // Active call in progress
                    else -> "🛡"           // Armed and listening
                },
                label = "Monitor",
                value = when {
                    !isMonitoring -> "Standby"
                    isActiveCall -> "In Call"
                    else -> "Armed"
                },
                accentColor = if (isMonitoring) SafeGreen else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // ── Live Transcription ──
        AnimatedVisibility(
            visible = isMonitoring && transcription.isNotEmpty() && Config.Features.ENABLE_TRANSCRIPTION_DISPLAY,
            enter = expandVertically(animationSpec = spring(stiffness = Spring.StiffnessLow)) + fadeIn(),
            exit = shrinkVertically() + fadeOut()
        ) {
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .background(if (isActiveCall || detectionMode == DetectionMode.DEMO) SafeGreen else MacherElectricCyan, CircleShape)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = if (isActiveCall || detectionMode == DetectionMode.DEMO) "LIVE TRANSCRIPTION" else "STATUS",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = MacherElectricCyan,
                            letterSpacing = 1.5.sp
                        )
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = transcription,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        lineHeight = 22.sp
                    )
                }
            }
        }
        
        // ── Risk Breakdown Card (Task 8.1) ──
        if (riskBreakdown != null) {
            Spacer(modifier = Modifier.height(16.dp))
            RiskBreakdownCard(
                riskBreakdown = riskBreakdown,
                modifier = Modifier.fillMaxWidth()
            )
        }
        
        // ── Demo Mode Card ──
        if (Config.DEMO_MODE) {
            Spacer(modifier = Modifier.height(16.dp))
            GlassCard(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .background(MacherViolet.copy(alpha = 0.15f), RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(text = "🧪", fontSize = 18.sp)
                    }
                    Spacer(modifier = Modifier.width(14.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Demo Mode",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = MacherVioletGlow
                        )
                        Text(
                            text = "All features are fully functional in demo simulation",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }
            }
        }
        
        // ── Demo Threat Controls (only visible in demo mode) ──
        AnimatedVisibility(
            visible = isMonitoring && detectionMode == DetectionMode.DEMO,
            enter = expandVertically(animationSpec = spring(stiffness = Spring.StiffnessLow)) + fadeIn(),
            exit = shrinkVertically() + fadeOut()
        ) {
            Column(modifier = Modifier.padding(top = 20.dp)) {
                Text(
                    text = "SIMULATE THREAT",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    letterSpacing = 2.sp,
                    modifier = Modifier.padding(bottom = 12.dp)
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    ThreatButton(
                        modifier = Modifier.weight(1f),
                        text = "Safe",
                        color = SafeGreen,
                        glowColor = GreenGlow,
                        onClick = { onThreatLevelChange(ThreatLevel.SAFE) }
                    )
                    ThreatButton(
                        modifier = Modifier.weight(1f),
                        text = "Caution",
                        color = CautionYellow,
                        glowColor = YellowGlow,
                        onClick = { onThreatLevelChange(ThreatLevel.CAUTION) }
                    )
                    ThreatButton(
                        modifier = Modifier.weight(1f),
                        text = "Danger",
                        color = DangerRed,
                        glowColor = RedGlow,
                        onClick = { onThreatLevelChange(ThreatLevel.DANGER) }
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // ── Privacy Footer ──
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp
        ) {
            Row(
                modifier = Modifier
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = "🔒", fontSize = 16.sp)
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "MACHER never stores call audio. All processing is ephemeral.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    lineHeight = 18.sp
                )
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
fun ThreatIndicator(
    threatLevel: ThreatLevel,
    isMonitoring: Boolean,
    scale: Float,
    threatConfidence: Float = 0f
) {
    val targetColor = when (threatLevel) {
        ThreatLevel.SAFE -> SafeGreen
        ThreatLevel.CAUTION -> CautionYellow
        ThreatLevel.DANGER -> DangerRed
    }
    
    val color by animateColorAsState(
        targetValue = targetColor,
        animationSpec = tween(800, easing = EaseInOutCubic),
        label = "threatColor"
    )
    
    val glowColor by animateColorAsState(
        targetValue = when (threatLevel) {
            ThreatLevel.SAFE -> GreenGlow
            ThreatLevel.CAUTION -> YellowGlow
            ThreatLevel.DANGER -> RedGlow
        },
        animationSpec = tween(800),
        label = "glowColor"
    )
    
    // Ring rotation animation (only when monitoring)
    val infiniteTransition = rememberInfiniteTransition(label = "ring")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = if (isMonitoring) 360f else 15f,
        animationSpec = infiniteRepeatable(
            animation = tween(if (isMonitoring) 8000 else 6000, easing = if (isMonitoring) LinearEasing else EaseInOutSine),
            repeatMode = if (isMonitoring) RepeatMode.Restart else RepeatMode.Reverse
        ),
        label = "rotation"
    )
    
    // Idle breathing scale (when not monitoring)
    val idleBreath by infiniteTransition.animateFloat(
        initialValue = if (isMonitoring) 1f else 0.97f,
        targetValue = if (isMonitoring) 1f else 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "idleBreath"
    )
    
    val glowPulse by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 0.8f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = EaseInOutSine),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glow"
    )
    
    // Animated confidence percentage
    val animatedConfidence by animateFloatAsState(
        targetValue = threatConfidence,
        animationSpec = tween(600, easing = EaseOutCubic),
        label = "confidence"
    )
    
    Box(
        modifier = Modifier.size(220.dp).scale(scale * idleBreath),
        contentAlignment = Alignment.Center
    ) {
        // Outer glow pulse
        Box(
            modifier = Modifier
                .size(220.dp)
                .blur(40.dp)
                .background(color.copy(alpha = glowPulse * (if (isMonitoring) 0.3f else 0.08f)), CircleShape)
        )
        
        // Neon border ring (rotating gradient)
        Box(
            modifier = Modifier
                .size(200.dp)
                .graphicsLayer { rotationZ = rotation }
                .border(
                    width = if (isMonitoring) 3.dp else 1.5.dp,
                    brush = Brush.sweepGradient(
                        colors = listOf(
                            color,
                            color.copy(alpha = 0.3f),
                            Color.Transparent,
                            color.copy(alpha = 0.3f),
                            color
                        )
                    ),
                    shape = CircleShape
                )
        )
        
        // Inner circle — theme-aware
        Box(
            modifier = Modifier
                .size(188.dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.surfaceVariant,
                            MaterialTheme.colorScheme.surface,
                            MaterialTheme.colorScheme.background
                        )
                    ),
                    shape = CircleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = when (threatLevel) {
                        ThreatLevel.SAFE -> "SAFE"
                        ThreatLevel.CAUTION -> "CAUTION"
                        ThreatLevel.DANGER -> "DANGER"
                    },
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Black,
                    color = color,
                    letterSpacing = 3.sp
                )
                
                // Confidence percentage
                if (animatedConfidence > 0.01f) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "${(animatedConfidence * 100).toInt()}%",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = color.copy(alpha = 0.9f)
                    )
                }
                
                if (isMonitoring) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .background(color, CircleShape)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Monitoring",
                            style = MaterialTheme.typography.bodySmall,
                            color = color.copy(alpha = 0.8f),
                            letterSpacing = 1.sp
                        )
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// HERO MINI STAT - Compact stat for hero header
// ═══════════════════════════════════════════════════════════════
@Composable
private fun HeroMiniStat(
    value: String,
    label: String,
    color: Color
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            color = color
        )
        Text(
            text = label,
            fontSize = 11.sp,
            color = Color.White.copy(alpha = 0.5f),
            letterSpacing = 1.sp
        )
    }
}// ═══════════════════════════════════════════════════════════════
// AUDIO WAVEFORM - Live visualiser driven by audioLevel float
// ═══════════════════════════════════════════════════════════════
@Composable
fun AudioWaveform(
    audioLevel: Float,
    modifier: Modifier = Modifier
) {
    val barCount = 20
    val infiniteTransition = rememberInfiniteTransition(label = "waveform")
    
    // Animated phase offset drives the ripple effect across bars
    val phase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * Math.PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "phase"
    )
    
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(barCount) { index ->
            val sinOffset = sin(phase + index * (2 * Math.PI / barCount).toFloat()).toFloat()
            val heightFraction = ((sinOffset + 1f) / 2f) * 0.6f + 0.1f + (audioLevel * 0.9f)
            val barAlpha = 0.6f + (sinOffset + 1f) / 2f * 0.4f
            
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(
                        (heightFraction.coerceIn(0.05f, 1.0f) * 40f).dp
                    )
                    .clip(RoundedCornerShape(2.dp))
                    .background(MacherElectricCyan.copy(alpha = barAlpha))
            )
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// MONITORING BUTTON - Gradient with press animation
// ═══════════════════════════════════════════════════════════════
@Composable
fun AnimatedMonitoringButton(
    isMonitoring: Boolean,
    threatLevel: ThreatLevel = ThreatLevel.SAFE,
    onClick: () -> Unit
) {
    val scale = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    
    val buttonColors = if (isMonitoring) {
        listOf(DangerRed, DangerRedDark)
    } else {
        listOf(MacherElectricCyan, MacherCyanSoft.copy(alpha = 0.8f))
    }
    
    val textColor = if (isMonitoring) Color.White else MacherNavy
    
    Button(
        onClick = {
            onClick()
            scope.launch {
                scale.animateTo(0.93f, animationSpec = tween(80))
                scale.animateTo(1f, animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy))
            }
        },
        modifier = Modifier
            .fillMaxWidth()
            .height(60.dp)
            .scale(scale.value),
        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
        shape = RoundedCornerShape(20.dp),
        contentPadding = PaddingValues(0.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = Brush.horizontalGradient(buttonColors),
                    shape = RoundedCornerShape(20.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                if (isMonitoring) {
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .background(Color.White, RoundedCornerShape(3.dp))
                    )
                } else {
                    Text("▶", fontSize = 16.sp, color = textColor)
                }
                Spacer(modifier = Modifier.width(14.dp))
                Text(
                    text = if (isMonitoring) "STOP MONITORING" else "START MONITORING",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = textColor,
                    letterSpacing = 1.5.sp
                )
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// STATUS MINI CARD - Compact info display
// ═══════════════════════════════════════════════════════════════
@Composable
fun StatusMiniCard(
    modifier: Modifier = Modifier,
    icon: String,
    label: String,
    value: String,
    accentColor: Color
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 2.dp,
        shadowElevation = 1.dp
    ) {
        Box(
            modifier = Modifier
                .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
                .padding(16.dp)
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(text = icon, fontSize = 16.sp)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = label.uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        letterSpacing = 1.sp
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = accentColor
                )
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// THREAT BUTTON - Compact colored pill
// ═══════════════════════════════════════════════════════════════
@Composable
fun ThreatButton(
    modifier: Modifier = Modifier,
    text: String,
    color: Color,
    glowColor: Color = color.copy(alpha = 0.3f),
    onClick: () -> Unit
) {
    val scale = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    
    Button(
        onClick = {
            scope.launch {
                scale.animateTo(0.9f, animationSpec = tween(80))
                scale.animateTo(1f, animationSpec = spring())
            }
            onClick()
        },
        modifier = modifier
            .height(44.dp)
            .scale(scale.value),
        colors = ButtonDefaults.buttonColors(containerColor = color.copy(alpha = 0.15f)),
        shape = RoundedCornerShape(14.dp),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, color.copy(alpha = 0.4f))
    ) {
        Text(
            text = text,
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
            color = color,
            letterSpacing = 0.5.sp
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// GLASS CARD - Theme-aware frosted glass panel
// ═══════════════════════════════════════════════════════════════
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 2.dp,
        shadowElevation = 1.dp
    ) {
        Box(
            modifier = Modifier.border(
                1.dp,
                MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                RoundedCornerShape(20.dp)
            )
        ) {
            content()
        }
    }
}

enum class ThreatLevel {
    SAFE,
    CAUTION,
    DANGER
}

// ═══════════════════════════════════════════════════════════════
// QUICK DEMO BUTTON - One-click demo for judges (Task 15.1)
// ═══════════════════════════════════════════════════════════════
@Composable
fun QuickDemoButton(
    onQuickDemo: () -> Unit,
    modifier: Modifier = Modifier
) {
    val scale = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    
    Button(
        onClick = {
            scope.launch {
                scale.animateTo(0.95f, animationSpec = tween(100))
                scale.animateTo(1f, animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy))
            }
            onQuickDemo()
        },
        modifier = modifier
            .height(56.dp)
            .scale(scale.value),
        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
        shape = RoundedCornerShape(16.dp),
        contentPadding = PaddingValues(0.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = Brush.horizontalGradient(
                        colors = listOf(
                            VibrantRed.copy(alpha = 0.9f),
                            DangerRed
                        )
                    ),
                    shape = RoundedCornerShape(16.dp)
                )
                .border(
                    width = 1.dp,
                    color = VibrantRed.copy(alpha = 0.5f),
                    shape = RoundedCornerShape(16.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Text("⚡", fontSize = 20.sp)
                Spacer(modifier = Modifier.width(12.dp))
                Column(horizontalAlignment = Alignment.Start) {
                    Text(
                        text = "QUICK DEMO",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        letterSpacing = 1.5.sp
                    )
                    Text(
                        text = "Auto-play high-risk scenario",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.9f),
                        fontSize = 11.sp
                    )
                }
            }
        }
    }
}
