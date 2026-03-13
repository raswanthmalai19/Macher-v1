package com.macher.android.data.sync

import android.content.Context
import com.macher.android.data.database.GuardianProtectedLinkEntity
import com.macher.android.data.database.MacherDatabase
import com.macher.android.util.Config
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Manages bidirectional sync of guardian-protected links between
 * local Room DB and DynamoDB (via the guardian-sync Lambda).
 *
 * Sync strategy:
 *  - On app launch / periodic: push unsynced local links to cloud
 *  - On demand: pull latest links from cloud for the guardian
 */
class SyncManager(context: Context) {

    private val db = MacherDatabase.getDatabase(context)
    private val linkDao = db.guardianProtectedLinkDao()
    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    // Base URL for the REST API (populated from Config or after CDK deploy)
    private val baseUrl: String
        get() = Config.REST_API_URL.ifEmpty { "https://placeholder.execute-api.us-east-1.amazonaws.com/prod" }

    /**
     * Push all unsynced local links to DynamoDB.
     */
    suspend fun pushUnsyncedLinks() = withContext(Dispatchers.IO) {
        val unsynced = linkDao.getUnsyncedLinks(0L)
        if (unsynced.isEmpty()) return@withContext

        val linksArray = JSONArray()
        unsynced.forEach { link ->
            linksArray.put(JSONObject().apply {
                put("id", link.id)
                put("guardianId", link.guardianId)
                put("protectedId", link.protectedId)
                put("linkCode", link.linkCode)
                put("guardianName", link.guardianName)
                put("protectedName", link.protectedName)
                put("guardianPhone", link.guardianPhone)
                put("protectedPhone", link.protectedPhone)
                put("relationship", link.relationship)
                put("isActive", link.isActive)
                put("createdAt", link.createdAt)
                put("lastSyncAt", link.lastSyncAt)
            })
        }

        val body = JSONObject().put("links", linksArray).toString()
        val request = Request.Builder()
            .url("$baseUrl/links/sync")
            .addHeader("Authorization", "Bearer ${Config.AUTH_TOKEN}")
            .post(body.toRequestBody(JSON_MEDIA))
            .build()

        var lastError: Exception? = null
        for (attempt in 1..3) {
            try {
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    unsynced.forEach { link ->
                        linkDao.markSynced(link.id, System.currentTimeMillis())
                    }
                    response.close()
                    return@withContext
                }
                response.close()
            } catch (e: Exception) {
                lastError = e
                if (attempt < 3) kotlinx.coroutines.delay(1000L * attempt)
            }
        }
        if (lastError != null) {
            // Log and swallow — caller should not crash from sync failures
            android.util.Log.e("SyncManager", "pushUnsyncedLinks failed after 3 retries", lastError)
        }
    }

    /**
     * Pull guardian links from DynamoDB and merge into local DB.
     */
    suspend fun pullLinks(guardianId: String) = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/links?guardianId=$guardianId")
            .addHeader("Authorization", "Bearer ${Config.AUTH_TOKEN}")
            .get()
            .build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            response.close()
            return@withContext
        }

        val bodyString = response.body?.string()
        response.close()
        if (bodyString.isNullOrEmpty()) return@withContext

        val json = JSONObject(bodyString)
        val linksArray = json.optJSONArray("links") ?: return@withContext

        for (i in 0 until linksArray.length()) {
            val obj = linksArray.getJSONObject(i)
            val linkId = obj.getString("linkId")
            val existing = linkDao.getLinkById(linkId)

            val remote = GuardianProtectedLinkEntity(
                id = linkId,
                guardianId = obj.optString("guardianId", ""),
                protectedId = obj.optString("protectedId", ""),
                linkCode = obj.optString("linkCode", ""),
                guardianName = obj.optString("guardianName", ""),
                protectedName = obj.optString("protectedName", ""),
                guardianPhone = obj.optString("guardianPhone", ""),
                protectedPhone = obj.optString("protectedPhone", ""),
                relationship = obj.optString("relationship", ""),
                isActive = obj.optBoolean("isActive", true),
                createdAt = obj.optLong("createdAt", System.currentTimeMillis()),
                lastSyncAt = System.currentTimeMillis()
            )

            if (existing == null) {
                linkDao.insertLink(remote)
            } else {
                // Cloud wins for conflict resolution
                linkDao.updateLink(remote)
            }
        }
    }

    /**
     * Full bidirectional sync: push then pull.
     */
    suspend fun sync(guardianId: String) {
        pushUnsyncedLinks()
        pullLinks(guardianId)
    }
}
