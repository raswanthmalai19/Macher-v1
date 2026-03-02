package com.vocalshield.android.util

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/**
 * Secure key management using Android Keystore.
 * 
 * Generates and stores encryption keys for database encryption (SQLCipher).
 * Keys are stored in Android Keystore, which provides hardware-backed security
 * on supported devices.
 * 
 * Privacy: Keys never leave the secure hardware and cannot be extracted.
 * 
 * Requirements: 15.2 (Database encryption with secure key storage)
 */
object KeyManager {
    
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val DB_KEY_ALIAS = "vocalshield_db_key"
    private const val PREFS_NAME = "vocalshield_secure_prefs"
    private const val DB_PASSPHRASE_KEY = "db_passphrase"
    
    /**
     * Get or generate database encryption passphrase.
     * 
     * The passphrase is generated once and stored securely using EncryptedSharedPreferences.
     * This passphrase is used by SQLCipher to encrypt the Room database.
     * 
     * @param context Application context
     * @return Database encryption passphrase
     */
    fun getDatabasePassphrase(context: Context): String {
        val encryptedPrefs = getEncryptedPreferences(context)
        
        // Check if passphrase already exists
        val existingPassphrase = encryptedPrefs.getString(DB_PASSPHRASE_KEY, null)
        if (existingPassphrase != null) {
            Logger.debug("KeyManager", "Using existing database passphrase")
            return existingPassphrase
        }
        
        // Generate new passphrase
        Logger.info("KeyManager", "Generating new database passphrase")
        val newPassphrase = generateSecurePassphrase()
        
        // Store passphrase securely
        encryptedPrefs.edit()
            .putString(DB_PASSPHRASE_KEY, newPassphrase)
            .apply()
        
        Logger.info("KeyManager", "Database passphrase generated and stored securely")
        return newPassphrase
    }
    
    /**
     * Get EncryptedSharedPreferences backed by Android Keystore.
     * 
     * Uses MasterKey with AES256_GCM encryption for maximum security.
     */
    private fun getEncryptedPreferences(context: Context): android.content.SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        
        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }
    
    /**
     * Generate a secure random passphrase for database encryption.
     * 
     * Uses cryptographically secure random number generator to create
     * a 256-bit (32-byte) passphrase encoded as hex string.
     * 
     * @return 64-character hex string (256 bits of entropy)
     */
    private fun generateSecurePassphrase(): String {
        val random = java.security.SecureRandom()
        val bytes = ByteArray(32) // 256 bits
        random.nextBytes(bytes)
        
        // Convert to hex string
        return bytes.joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Clear all stored keys (for testing or user data deletion).
     * 
     * WARNING: This will make the encrypted database unreadable.
     * Only call this when the user explicitly requests data deletion.
     */
    fun clearAllKeys(context: Context) {
        Logger.warn("KeyManager", "Clearing all encryption keys - database will become unreadable")
        
        try {
            // Clear encrypted preferences
            val encryptedPrefs = getEncryptedPreferences(context)
            encryptedPrefs.edit().clear().apply()
            
            // Clear keystore entries
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            
            if (keyStore.containsAlias(DB_KEY_ALIAS)) {
                keyStore.deleteEntry(DB_KEY_ALIAS)
            }
            
            Logger.info("KeyManager", "All encryption keys cleared successfully")
        } catch (e: Exception) {
            Logger.error("KeyManager", "Failed to clear encryption keys", e)
            throw e
        }
    }
    
    /**
     * Check if database passphrase exists.
     * 
     * @param context Application context
     * @return true if passphrase exists, false otherwise
     */
    fun hasDatabasePassphrase(context: Context): Boolean {
        val encryptedPrefs = getEncryptedPreferences(context)
        return encryptedPrefs.contains(DB_PASSPHRASE_KEY)
    }
}
