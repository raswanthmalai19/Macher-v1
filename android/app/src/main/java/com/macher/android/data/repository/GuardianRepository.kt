package com.macher.android.data.repository

import com.macher.android.data.database.*
import kotlinx.coroutines.flow.Flow
import java.util.UUID

/**
 * Repository for managing guardian-protected user relationships.
 *
 * Provides a clean API for:
 * - Creating/removing guardian-protected links
 * - Generating and validating link codes (QR-based pairing)
 * - Querying linked users
 * - Preparing data for cloud sync
 */
class GuardianRepository(
    private val linkDao: GuardianProtectedLinkDao,
    private val userDao: UserDao
) {
    /**
     * Get all active links where this user is the guardian.
     */
    fun getProtectedUsers(guardianId: String): Flow<List<GuardianProtectedLinkEntity>> =
        linkDao.getLinksForGuardian(guardianId)

    /**
     * Get all active links where this user is the protected user.
     */
    fun getGuardians(protectedId: String): Flow<List<GuardianProtectedLinkEntity>> =
        linkDao.getLinksForProtected(protectedId)

    /**
     * Generate a 6-digit link code for QR pairing.
     */
    fun generateLinkCode(): String {
        return (100000..999999).random().toString()
    }

    /**
     * Create a new guardian-protected link initiated by the guardian.
     * Returns the link code to display as QR.
     */
    suspend fun createLinkAsGuardian(
        guardianId: String,
        guardianName: String,
        guardianPhone: String
    ): GuardianProtectedLinkEntity {
        val code = generateLinkCode()
        val link = GuardianProtectedLinkEntity(
            id = UUID.randomUUID().toString(),
            guardianId = guardianId,
            protectedId = "",           // filled when protected user scans
            linkCode = code,
            guardianName = guardianName,
            protectedName = "",
            guardianPhone = guardianPhone,
            protectedPhone = "",
            createdAt = System.currentTimeMillis()
        )
        linkDao.insertLink(link)
        return link
    }

    /**
     * Complete a link by the protected user scanning the QR / entering code.
     */
    suspend fun completeLinkAsProtected(
        linkCode: String,
        protectedId: String,
        protectedName: String,
        protectedPhone: String,
        relationship: String = ""
    ): GuardianProtectedLinkEntity? {
        val link = linkDao.getLinkByCode(linkCode) ?: return null
        if (link.protectedId.isNotEmpty()) return null // already claimed

        val updated = link.copy(
            protectedId = protectedId,
            protectedName = protectedName,
            protectedPhone = protectedPhone,
            relationship = relationship,
            isActive = true
        )
        linkDao.updateLink(updated)

        // Also register protected user in the users table if not exists
        if (userDao.getUser(protectedId) == null) {
            userDao.insertUser(
                UserEntity(
                    userId = protectedId,
                    role = "PROTECTED",
                    name = protectedName,
                    phoneNumber = protectedPhone,
                    linkedUserId = link.guardianId,
                    createdAt = System.currentTimeMillis()
                )
            )
        }
        return updated
    }

    /**
     * Deactivate (soft-delete) a link.
     */
    suspend fun removeLink(linkId: String) {
        linkDao.deactivateLink(linkId)
    }

    /**
     * Validate a link code exists and is unclaimed.
     */
    suspend fun validateLinkCode(code: String): Boolean {
        val link = linkDao.getLinkByCode(code) ?: return false
        return link.protectedId.isEmpty()
    }

    /**
     * Get links that haven't been synced to DynamoDB since the given timestamp.
     */
    suspend fun getUnsyncedLinks(since: Long): List<GuardianProtectedLinkEntity> =
        linkDao.getUnsyncedLinks(since)

    /**
     * Mark a link as synced with the cloud.
     */
    suspend fun markSynced(linkId: String) {
        linkDao.markSynced(linkId, System.currentTimeMillis())
    }
}
