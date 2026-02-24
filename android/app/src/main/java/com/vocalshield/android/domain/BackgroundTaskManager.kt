package com.vocalshield.android.domain

import android.content.Context
import android.os.BatteryManager
import androidx.work.*
import java.util.concurrent.TimeUnit

/**
 * Background task manager using WorkManager.
 * Ensures audio capture and streaming continue when app is backgrounded.
 * Optimizes battery usage when no call is active.
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */
class BackgroundTaskManager(
    private val context: Context
) {
    
    companion object {
        private const val MONITORING_WORK_TAG = "vocalshield_monitoring"
        private const val CLEANUP_WORK_TAG = "vocalshield_cleanup"
        private const val CLEANUP_INTERVAL_HOURS = 24L
    }
    
    private val workManager = WorkManager.getInstance(context)
    
    /**
     * Start background monitoring for active call.
     * Ensures audio capture and WebSocket connection remain active.
     */
    fun startMonitoringWork(callId: String) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        
        val monitoringWork = OneTimeWorkRequestBuilder<MonitoringWorker>()
            .setConstraints(constraints)
            .setInputData(workDataOf("callId" to callId))
            .addTag(MONITORING_WORK_TAG)
            .build()
        
        workManager.enqueueUniqueWork(
            "monitoring_$callId",
            ExistingWorkPolicy.KEEP,
            monitoringWork
        )
    }
    
    /**
     * Stop background monitoring when call ends.
     */
    fun stopMonitoringWork() {
        workManager.cancelAllWorkByTag(MONITORING_WORK_TAG)
    }
    
    /**
     * Schedule periodic cleanup work.
     * Runs daily to clean up old call history and optimize storage.
     */
    fun scheduleCleanupWork() {
        val constraints = Constraints.Builder()
            .setRequiresBatteryNotLow(true)
            .setRequiresDeviceIdle(true)
            .build()
        
        val cleanupWork = PeriodicWorkRequestBuilder<CleanupWorker>(
            CLEANUP_INTERVAL_HOURS,
            TimeUnit.HOURS
        )
            .setConstraints(constraints)
            .addTag(CLEANUP_WORK_TAG)
            .build()
        
        workManager.enqueueUniquePeriodicWork(
            "cleanup_work",
            ExistingPeriodicWorkPolicy.KEEP,
            cleanupWork
        )
    }
    
    /**
     * Check if device is in low battery mode.
     * Used to reduce non-essential background tasks.
     */
    fun isLowBatteryMode(): Boolean {
        val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val batteryLevel = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return batteryLevel < 20
    }
    
    /**
     * Cancel all background work.
     */
    fun cancelAllWork() {
        workManager.cancelAllWork()
    }
}

/**
 * Worker for maintaining monitoring during background operation.
 * Ensures audio capture and WebSocket connection remain active.
 */
class MonitoringWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    override suspend fun doWork(): Result {
        val callId = inputData.getString("callId") ?: return Result.failure()
        
        // Keep monitoring active
        // In a real implementation, this would:
        // 1. Ensure AudioCaptureService is running
        // 2. Maintain WebSocket connection
        // 3. Continue streaming audio chunks
        // 4. Monitor for call end
        
        // For now, this is a placeholder that demonstrates the pattern
        // The actual implementation would integrate with CallRepository
        
        return Result.success()
    }
}

/**
 * Worker for periodic cleanup tasks.
 * Runs daily to optimize storage and clean up old data.
 */
class CleanupWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    override suspend fun doWork(): Result {
        // Perform cleanup tasks:
        // 1. Delete call history older than 30 days
        // 2. Clear temporary files
        // 3. Optimize database
        
        // For now, this is a placeholder
        // The actual implementation would integrate with CallHistoryRepository
        
        return Result.success()
    }
}
