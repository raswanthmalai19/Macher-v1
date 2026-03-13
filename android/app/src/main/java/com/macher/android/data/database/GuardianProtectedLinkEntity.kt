package com.macher.android.data.database

import androidx.room.*
import kotlinx.coroutines.flow.Flow

/**
 * Represents a link between a Guardian user and a Protected user.
 *
 * This entity stores the pairing relationship created via QR code scanning.
 * Each guardian can have multiple protected users, and each protected user
 * can have multiple guardians.
 *
 * Sync: linkCode is used for cloud sync with DynamoDB.
 */
@Entity(
    tableName = "guardian_protected_links",
    indices = [
        Index(value = ["guardianId"]),
        Index(value = ["protectedId"]),
        Index(value = ["linkCode"], unique = true)
    ]
)
data class GuardianProtectedLinkEntity(
    @PrimaryKey val id: String,
    val guardianId: String,
    val protectedId: String,
    val linkCode: String,          // 6-digit code or QR payload for pairing
    val guardianName: String,
    val protectedName: String,
    val guardianPhone: String,
    val protectedPhone: String,
    val relationship: String = "",  // e.g. "Parent", "Child", "Spouse"
    val isActive: Boolean = true,
    val createdAt: Long,
    val lastSyncAt: Long = 0L      // Last DynamoDB sync timestamp
)

/**
 * DAO for managing guardian-protected user links.
 */
@Dao
interface GuardianProtectedLinkDao {

    @Query("SELECT * FROM guardian_protected_links WHERE guardianId = :guardianId AND isActive = 1 ORDER BY createdAt DESC")
    fun getLinksForGuardian(guardianId: String): Flow<List<GuardianProtectedLinkEntity>>

    @Query("SELECT * FROM guardian_protected_links WHERE protectedId = :protectedId AND isActive = 1 ORDER BY createdAt DESC")
    fun getLinksForProtected(protectedId: String): Flow<List<GuardianProtectedLinkEntity>>

    @Query("SELECT * FROM guardian_protected_links WHERE linkCode = :linkCode")
    suspend fun getLinkByCode(linkCode: String): GuardianProtectedLinkEntity?

    @Query("SELECT * FROM guardian_protected_links WHERE id = :id")
    suspend fun getLinkById(id: String): GuardianProtectedLinkEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLink(link: GuardianProtectedLinkEntity)

    @Update
    suspend fun updateLink(link: GuardianProtectedLinkEntity)

    @Query("UPDATE guardian_protected_links SET isActive = 0 WHERE id = :id")
    suspend fun deactivateLink(id: String)

    @Query("DELETE FROM guardian_protected_links WHERE id = :id")
    suspend fun deleteLink(id: String)

    @Query("SELECT COUNT(*) FROM guardian_protected_links WHERE guardianId = :guardianId AND isActive = 1")
    suspend fun getActiveLinksCount(guardianId: String): Int

    @Query("SELECT * FROM guardian_protected_links WHERE lastSyncAt < :since")
    suspend fun getUnsyncedLinks(since: Long): List<GuardianProtectedLinkEntity>

    @Query("UPDATE guardian_protected_links SET lastSyncAt = :timestamp WHERE id = :id")
    suspend fun markSynced(id: String, timestamp: Long)
}
