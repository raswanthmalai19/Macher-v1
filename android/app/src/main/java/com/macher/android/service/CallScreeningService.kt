package com.macher.android.service

import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import androidx.annotation.RequiresApi
import com.macher.android.data.database.MacherDatabase
import com.macher.android.util.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Call Screening Service for OS-level call integration.
 * Automatically wakes up when incoming calls are received.
 * 
 * Requires Android 10+ (API 29+)
 */
@RequiresApi(Build.VERSION_CODES.Q)
class MacherCallScreeningService : CallScreeningService() {
    
    override fun onScreenCall(callDetails: Call.Details) {
        Logger.info("CallScreening", "Incoming call detected: ${callDetails.handle}")
        
        val phoneNumber = callDetails.handle?.schemeSpecificPart

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val shouldMonitor = shouldMonitorCall(phoneNumber)

                if (shouldMonitor) {
                    startCallMonitoring(callDetails)
                }

                // Always allow the call to proceed — we only monitor
                val response = CallResponse.Builder()
                    .setDisallowCall(false)
                    .setRejectCall(false)
                    .setSkipCallLog(false)
                    .setSkipNotification(false)
                    .build()

                respondToCall(callDetails, response)
            } catch (e: Exception) {
                Logger.error("CallScreening", "Error processing call, allowing through", e)
                try {
                    val response = CallResponse.Builder()
                        .setDisallowCall(false)
                        .setRejectCall(false)
                        .setSkipCallLog(false)
                        .setSkipNotification(false)
                        .build()
                    respondToCall(callDetails, response)
                } catch (_: Exception) {}
            }
        }
    }
    
    /**
     * Check if we should monitor this call by querying the trusted contacts
     * whitelist and historical blacklist from the local Room database.
     */
    private suspend fun shouldMonitorCall(phoneNumber: String?): Boolean {
        if (phoneNumber == null) return true  // Monitor unknown numbers

        val phoneHash = Logger.hashPhoneNumber(phoneNumber).take(8)
        Logger.debug("CallScreening", "Checking if should monitor: hash=$phoneHash...")

        try {
            val db = MacherDatabase.getDatabase(applicationContext)
            val trustedDao = db.trustedContactDao()
            val historicalDao = db.historicalRiskDao()

            // Check blacklist first — always monitor blacklisted numbers
            val historicalData = historicalDao.getHistoricalRisk(phoneNumber)
            if (historicalData?.isBlacklisted == true) {
                Logger.info("CallScreening", "Blacklisted number detected, monitoring")
                return true
            }

            // Check trusted contacts whitelist — skip monitoring for trusted numbers
            val normalizedPhone = phoneNumber.replace(Regex("[^0-9+]"), "")
            val trustedContact = trustedDao.findByPhone(phoneNumber)
                ?: trustedDao.findByPhone(normalizedPhone)
            if (trustedContact != null) {
                Logger.info("CallScreening", "Trusted contact detected, skipping monitoring")
                return false
            }

        } catch (e: Exception) {
            Logger.error("CallScreening", "DB check failed, defaulting to monitor", e)
        }

        return true // Default: monitor all calls
    }
    
    /**
     * Start monitoring the call by notifying the MonitoringManager singleton.
     */
    private fun startCallMonitoring(callDetails: Call.Details) {
        Logger.info("CallScreening", "Starting call monitoring")
        
        val phoneNumber = callDetails.handle?.schemeSpecificPart ?: "unknown"

        // MonitoringManager is initialized by MainActivity and persists via the Application lifecycle.
        // The CallScreeningService can signal that a call started via a broadcast or shared state.
        // Since MonitoringManager is instantiated in the Activity, we send a broadcast intent
        // that the Activity can receive to trigger startMonitoring().
        try {
            val intent = android.content.Intent("com.macher.android.CALL_DETECTED").apply {
                putExtra("phone_number", phoneNumber)
                setPackage(packageName)
            }
            sendBroadcast(intent)
            Logger.info("CallScreening", "Broadcast sent to start monitoring for $phoneNumber")
        } catch (e: Exception) {
            Logger.error("CallScreening", "Failed to send monitoring broadcast", e)
        }
    }
}
