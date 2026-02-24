package com.vocalshield.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vocalshield.android.data.Contact
import com.vocalshield.android.repository.ISettingsRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * ViewModel for settings screen.
 * Manages user preferences, consent, and Family Loop configuration.
 * 
 * Requirements: 4.4, 6.4, 8.4, 9.5, 10.1, 10.2, 10.5
 */
class SettingsViewModel(
    private val settingsRepository: ISettingsRepository
) : ViewModel() {
    
    companion object {
        private const val MAX_FAMILY_LOOP_CONTACTS = 5
    }
    
    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()
    
    init {
        // Observe monitoring enabled state
        viewModelScope.launch {
            settingsRepository.isMonitoringEnabled()
                .collect { enabled ->
                    _uiState.update { it.copy(monitoringEnabled = enabled) }
                }
        }
        
        // Observe haptic enabled state
        viewModelScope.launch {
            settingsRepository.isHapticEnabled()
                .collect { enabled ->
                    _uiState.update { it.copy(hapticEnabled = enabled) }
                }
        }
        
        // Observe announcement enabled state
        viewModelScope.launch {
            settingsRepository.isAnnouncementEnabled()
                .collect { enabled ->
                    _uiState.update { it.copy(announcementEnabled = enabled) }
                }
        }
        
        // Observe Family Loop contacts
        viewModelScope.launch {
            settingsRepository.getFamilyLoopContacts()
                .collect { contacts ->
                    _uiState.update { 
                        it.copy(
                            familyLoopContacts = contacts,
                            canAddMoreContacts = contacts.size < MAX_FAMILY_LOOP_CONTACTS
                        )
                    }
                }
        }
        
        // Check user consent
        val hasConsent = settingsRepository.hasUserConsent()
        _uiState.update { it.copy(hasUserConsent = hasConsent) }
    }
    
    /**
     * Toggle monitoring enabled state.
     */
    fun toggleMonitoring(enabled: Boolean) {
        settingsRepository.setMonitoringEnabled(enabled)
    }
    
    /**
     * Toggle haptic feedback enabled state.
     */
    fun toggleHaptic(enabled: Boolean) {
        settingsRepository.setHapticEnabled(enabled)
    }
    
    /**
     * Toggle call announcement enabled state.
     */
    fun toggleAnnouncement(enabled: Boolean) {
        settingsRepository.setAnnouncementEnabled(enabled)
    }
    
    /**
     * Record user consent.
     */
    fun grantConsent() {
        val timestamp = System.currentTimeMillis()
        settingsRepository.recordConsent(timestamp)
        _uiState.update { it.copy(hasUserConsent = true, errorMessage = null) }
    }
    
    /**
     * Add a Family Loop contact.
     * Validates contact limit (max 5).
     */
    fun addFamilyLoopContact(name: String, phoneNumber: String, email: String?) {
        viewModelScope.launch {
            // Validate inputs
            if (name.isBlank()) {
                _uiState.update { it.copy(errorMessage = "Contact name is required") }
                return@launch
            }
            
            if (phoneNumber.isBlank()) {
                _uiState.update { it.copy(errorMessage = "Phone number is required") }
                return@launch
            }
            
            // Check contact limit
            if (!_uiState.value.canAddMoreContacts) {
                _uiState.update { 
                    it.copy(errorMessage = "Maximum $MAX_FAMILY_LOOP_CONTACTS Family Loop contacts allowed")
                }
                return@launch
            }
            
            // Create contact
            val contact = Contact(
                id = UUID.randomUUID().toString(),
                name = name.trim(),
                phoneNumber = phoneNumber.trim(),
                email = email?.trim()?.takeIf { it.isNotBlank() },
                addedTimestamp = System.currentTimeMillis()
            )
            
            // Add contact
            val result = settingsRepository.addFamilyLoopContact(contact)
            
            if (result.isSuccess) {
                _uiState.update { it.copy(errorMessage = null, successMessage = "Contact added successfully") }
            } else {
                _uiState.update { 
                    it.copy(errorMessage = result.exceptionOrNull()?.message ?: "Failed to add contact")
                }
            }
        }
    }
    
    /**
     * Remove a Family Loop contact.
     */
    fun removeFamilyLoopContact(contactId: String) {
        viewModelScope.launch {
            val result = settingsRepository.removeFamilyLoopContact(contactId)
            
            if (result.isSuccess) {
                _uiState.update { it.copy(errorMessage = null, successMessage = "Contact removed successfully") }
            } else {
                _uiState.update { 
                    it.copy(errorMessage = result.exceptionOrNull()?.message ?: "Failed to remove contact")
                }
            }
        }
    }
    
    /**
     * Clear error message.
     */
    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
    
    /**
     * Clear success message.
     */
    fun clearSuccess() {
        _uiState.update { it.copy(successMessage = null) }
    }
}

/**
 * UI state for settings screen.
 */
data class SettingsUiState(
    val monitoringEnabled: Boolean = false,
    val hapticEnabled: Boolean = true,
    val announcementEnabled: Boolean = true,
    val hasUserConsent: Boolean = false,
    val familyLoopContacts: List<Contact> = emptyList(),
    val canAddMoreContacts: Boolean = true,
    val errorMessage: String? = null,
    val successMessage: String? = null
)
