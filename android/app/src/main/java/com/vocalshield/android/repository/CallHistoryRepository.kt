package com.vocalshield.android.repository

import android.util.Log
import com.vocalshield.android.data.CallSession
import com.vocalshield.android.data.CallSessionDao
import com.vocalshield.android.data.toEntity
import com.vocalshield.android.data.toDomain
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Repository for managing call history.
 * 
 * Privacy: NO audio data is stored, only metadata.
 * Automatically enforces 100 session limit.
 * 
 * Requirements: 12.1, 12.3, 12.5, 12.6
 */
class CallHistoryRepository(
    private val callSessionDao: CallSessionDao
) : ICallHistoryRepository {
    
    companion object {
        private const val TAG = "CallHistoryRepository"
        private const val MAX_SESSIONS = 100
    }
    
    override suspend fun saveCallSession(session: CallSession): Result<Unit> {
        return try {
            // Insert the session
            callSessionDao.insert(session.toEntity())
            
            // Enforce 100 session limit by deleting oldest
            val count = callSessionDao.getCount()
            if (count > MAX_SESSIONS) {
                callSessionDao.deleteOldestSessions()
                Log.d(TAG, "Deleted oldest sessions to maintain limit of $MAX_SESSIONS")
            }
            
            Log.i(TAG, "Call session saved: ${session.id}")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error saving call session", e)
            Result.failure(e)
        }
    }
    
    override fun getCallHistory(): Flow<List<CallSession>> {
        return callSessionDao.getAllSessions()
            .map { entities ->
                entities.map { it.toDomain() }
            }
    }
    
    override suspend fun clearHistory(): Result<Unit> {
        return try {
            callSessionDao.deleteAll()
            Log.i(TAG, "Call history cleared")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing call history", e)
            Result.failure(e)
        }
    }
}
