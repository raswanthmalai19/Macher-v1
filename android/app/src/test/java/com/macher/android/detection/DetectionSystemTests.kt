package com.macher.android.detection

import org.junit.Test
import org.junit.Assert.*

/**
 * Comprehensive tests for detection systems
 * Ensures zero loopholes for competition
 */
class DetectionSystemTests {
    
    // ============================================
    // METADATA RISK ANALYZER TESTS
    // ============================================
    
    @Test
    fun `test unknown number detection`() {
        val analyzer = MetadataRiskAnalyzer()
        val metadata = CallMetadata(
            phoneNumber = "+91-9876543210",
            isInContacts = false,
            recentCallCount = 1
        )
        
        val result = analyzer.analyzeMetadata(metadata)
        
        assertTrue("Unknown number should be detected", 
            result.triggers.contains("Unknown number"))
        assertTrue("Risk score should be > 0", result.riskScore > 0)
    }
    
    @Test
    fun `test international number detection`() {
        val analyzer = MetadataRiskAnalyzer()
        val metadata = CallMetadata(
            phoneNumber = "+44-20-1234-5678",  // UK number
            isInContacts = false
        )
        
        val result = analyzer.analyzeMetadata(metadata)
        
        assertTrue("International number should be detected",
            result.triggers.contains("International number"))
        assertTrue("Risk score should include international penalty",
            result.riskScore >= 3)
    }
    
    @Test
    fun `test midnight call detection`() {
        val analyzer = MetadataRiskAnalyzer()
        // Use a fixed 2 AM timestamp (not relative to current time)
        val cal = java.util.Calendar.getInstance()
        cal.set(java.util.Calendar.HOUR_OF_DAY, 2)
        cal.set(java.util.Calendar.MINUTE, 0)
        val midnightTime = cal.timeInMillis
        val metadata = CallMetadata(
            phoneNumber = "+91-9876543210",
            callTime = midnightTime,
            isInContacts = false
        )
        
        val result = analyzer.analyzeMetadata(metadata)
        
        assertTrue("Midnight call should be detected",
            result.triggers.any { it.contains("midnight") || it.contains("Unusual time") })
    }
    
    @Test
    fun `test repeated short calls detection`() {
        val analyzer = MetadataRiskAnalyzer()
        val metadata = CallMetadata(
            phoneNumber = "+91-9876543210",
            isInContacts = false,
            recentCallCount = 5,
            averageCallDuration = 20  // 20 seconds
        )
        
        val result = analyzer.analyzeMetadata(metadata)
        
        assertTrue("Repeated short calls should be detected",
            result.triggers.contains("Repeated short calls"))
    }
    
    @Test
    fun `test high frequency detection`() {
        val analyzer = MetadataRiskAnalyzer()
        val metadata = CallMetadata(
            phoneNumber = "+91-9876543210",
            isInContacts = false,
            recentCallCount = 8
        )
        
        val result = analyzer.analyzeMetadata(metadata)
        
        assertTrue("High frequency should be detected",
            result.triggers.contains("High call frequency"))
    }
    
    @Test
    fun `test risk level thresholds`() {
        val analyzer = MetadataRiskAnalyzer()
        
        // Low risk
        val lowRisk = CallMetadata(
            phoneNumber = "+91-9876543210",
            isInContacts = true,
            recentCallCount = 1
        )
        assertEquals(RiskLevel.LOW, analyzer.analyzeMetadata(lowRisk).riskLevel)
        
        // Medium risk
        val mediumRisk = CallMetadata(
            phoneNumber = "+44-20-1234-5678",
            isInContacts = false,
            recentCallCount = 3
        )
        val mediumResult = analyzer.analyzeMetadata(mediumRisk)
        assertTrue("Should be medium or high risk", 
            mediumResult.riskLevel == RiskLevel.MEDIUM || mediumResult.riskLevel == RiskLevel.HIGH)
    }
    
    // ============================================
    // MANIPULATION DETECTOR TESTS
    // ============================================
    
    @Test
    fun `test urgency pattern detection`() {
        val detector = ManipulationDetector()
        val text = "You must act immediately! Your account will be blocked if you don't respond right now."
        
        val result = detector.analyzeConversation(text)
        
        assertTrue("Urgency patterns should be detected",
            result.patterns.any { it.category == ManipulationCategory.URGENCY })
        assertTrue("Risk score should be > 0", result.riskScore > 0)
    }
    
    @Test
    fun `test authority impersonation detection`() {
        val detector = ManipulationDetector()
        val text = "This is Officer Sharma from the Income Tax Department. We have issued a warrant for your arrest."
        
        val result = detector.analyzeConversation(text)
        
        assertTrue("Authority impersonation should be detected",
            result.patterns.any { it.category == ManipulationCategory.AUTHORITY })
        assertTrue("Should detect multiple authority keywords",
            result.patterns.first { it.category == ManipulationCategory.AUTHORITY }.matches.size >= 2)
    }
    
    @Test
    fun `test emotional manipulation detection`() {
        val detector = ManipulationDetector()
        val text = "Your son has met with an accident. He is in the hospital emergency room in danger."
        
        val result = detector.analyzeConversation(text)
        
        assertTrue("Emotional manipulation should be detected",
            result.patterns.any { it.category == ManipulationCategory.EMOTIONAL })
        assertTrue("Risk score should be high for emotional manipulation",
            result.riskScore >= 5)
    }
    
    @Test
    fun `test financial coercion detection`() {
        val detector = ManipulationDetector()
        val text = "Transfer money immediately. Share your OTP and CVV number to verify your account."
        
        val result = detector.analyzeConversation(text)
        
        assertTrue("Financial coercion should be detected",
            result.patterns.any { it.category == ManipulationCategory.FINANCIAL })
        assertTrue("Should detect multiple financial keywords",
            result.patterns.first { it.category == ManipulationCategory.FINANCIAL }.matches.size >= 3)
    }
    
    @Test
    fun `test information extraction detection`() {
        val detector = ManipulationDetector()
        val text = "Please confirm your bank details and verify your personal information including your PAN card number."
        
        val result = detector.analyzeConversation(text)
        
        assertTrue("Information extraction should be detected",
            result.patterns.any { it.category == ManipulationCategory.INFORMATION })
    }
    
    @Test
    fun `test multi-category detection`() {
        val detector = ManipulationDetector()
        val text = "This is the police department. Your account is compromised. Transfer money immediately or face arrest."
        
        val result = detector.analyzeConversation(text)
        
        assertTrue("Should detect multiple categories",
            result.patterns.size >= 2)
        assertTrue("Should have high risk score",
            result.riskScore >= 8)
        assertEquals("Should be high risk", RiskLevel.HIGH, result.riskLevel)
    }
    
    @Test
    fun `test legitimate conversation`() {
        val detector = ManipulationDetector()
        val text = "Hi, this is customer service. I'm calling about your recent query. Would you like me to explain the new features?"
        
        val result = detector.analyzeConversation(text)
        
        assertTrue("Should have low or zero risk score", result.riskScore < 4)
        assertEquals("Should be low risk", RiskLevel.LOW, result.riskLevel)
    }
    
    @Test
    fun `test case insensitivity`() {
        val detector = ManipulationDetector()
        val text1 = "TRANSFER MONEY IMMEDIATELY"
        val text2 = "transfer money immediately"
        
        val result1 = detector.analyzeConversation(text1)
        val result2 = detector.analyzeConversation(text2)
        
        assertEquals("Case should not matter", result1.riskScore, result2.riskScore)
    }
    
    // ============================================
    // RISK FUSION ENGINE TESTS
    // ============================================
    
    @Test
    fun `test risk fusion with metadata only`() {
        val fusionEngine = RiskFusionEngine()
        val metadataRisk = MetadataRiskResult(
            riskScore = 6,
            riskLevel = RiskLevel.MEDIUM,
            triggers = listOf("Unknown number", "International number"),
            confidence = 0.7f
        )
        
        val result = fusionEngine.fuseRiskSignals(
            metadataRisk = metadataRisk,
            manipulationRisk = null
        )
        
        assertTrue("Should have non-zero risk score", result.riskScore > 0)
        assertTrue("Metadata contribution should be present", result.metadataContribution > 0)
    }
    
    @Test
    fun `test risk fusion with manipulation only`() {
        val fusionEngine = RiskFusionEngine()
        val manipulationRisk = ManipulationResult(
            riskScore = 10,
            riskLevel = RiskLevel.HIGH,
            patterns = listOf(),
            confidence = 0.85f,
            summary = "High risk"
        )
        
        val result = fusionEngine.fuseRiskSignals(
            metadataRisk = null,
            manipulationRisk = manipulationRisk
        )
        
        assertTrue("Should have high risk score", result.riskScore >= 5)
        assertTrue("Manipulation contribution should be dominant", 
            result.manipulationContribution > result.metadataContribution)
    }
    
    @Test
    fun `test risk fusion with both signals`() {
        val fusionEngine = RiskFusionEngine()
        
        val metadataRisk = MetadataRiskResult(
            riskScore = 6,
            riskLevel = RiskLevel.MEDIUM,
            triggers = listOf("Unknown number", "Midnight call"),
            confidence = 0.6f
        )
        
        val manipulationRisk = ManipulationResult(
            riskScore = 12,
            riskLevel = RiskLevel.HIGH,
            patterns = listOf(),
            confidence = 0.9f,
            summary = "Authority + Financial"
        )
        
        val result = fusionEngine.fuseRiskSignals(
            metadataRisk = metadataRisk,
            manipulationRisk = manipulationRisk
        )
        
        assertTrue("Combined risk should be high", result.riskScore >= 7)
        assertEquals("Should be high risk level", RiskLevel.HIGH, result.riskLevel)
        assertTrue("Should have non-zero confidence", result.confidence > 0f)
        assertTrue("Should have triggers from both", result.triggers.size >= 2)
    }
    
    @Test
    fun `test risk percentage calculation`() {
        val fusionEngine = RiskFusionEngine()
        val result = fusionEngine.fuseRiskSignals(
            metadataRisk = MetadataRiskResult(8, RiskLevel.HIGH, listOf(), 0.8f),
            manipulationRisk = ManipulationResult(10, RiskLevel.HIGH, listOf(), 0.9f, "")
        )
        
        val percentage = result.getRiskPercentage()
        
        assertTrue("Percentage should be 0-100", percentage in 0..100)
        assertTrue("High risk should have high percentage", percentage >= 50)
    }
    
    @Test
    fun `test primary threat identification`() {
        val fusionEngine = RiskFusionEngine()
        
        // Manipulation dominant
        val result1 = fusionEngine.fuseRiskSignals(
            metadataRisk = MetadataRiskResult(2, RiskLevel.LOW, listOf(), 0.5f),
            manipulationRisk = ManipulationResult(12, RiskLevel.HIGH, listOf(), 0.9f, "")
        )
        assertEquals("Conversational Manipulation", result1.getPrimaryThreat())
        
        // Metadata dominant
        val result2 = fusionEngine.fuseRiskSignals(
            metadataRisk = MetadataRiskResult(8, RiskLevel.HIGH, listOf(), 0.8f),
            manipulationRisk = ManipulationResult(2, RiskLevel.LOW, listOf(), 0.3f, "")
        )
        assertEquals("Suspicious Call Pattern", result2.getPrimaryThreat())
    }
    
    // ============================================
    // INTEGRATION TESTS
    // ============================================
    
    @Test
    fun `test complete detection pipeline - high risk scam`() {
        val metadataAnalyzer = MetadataRiskAnalyzer()
        val manipulationDetector = ManipulationDetector()
        val fusionEngine = RiskFusionEngine()
        
        // Simulate a high-risk scam call
        val metadata = CallMetadata(
            phoneNumber = "+1-555-0123",  // International
            isInContacts = false,
            recentCallCount = 3,
            averageCallDuration = 45
        )
        
        val conversation = """
            This is Officer Kumar from Income Tax Department. 
            We have detected tax fraud on your account. 
            You must transfer 50,000 rupees immediately to avoid arrest.
            Share your bank account details and OTP right now.
        """.trimIndent()
        
        // Run detection pipeline
        val metadataRisk = metadataAnalyzer.analyzeMetadata(metadata)
        val manipulationRisk = manipulationDetector.analyzeConversation(conversation)
        val fusedRisk = fusionEngine.fuseRiskSignals(metadataRisk, manipulationRisk)
        
        // Assertions
        assertEquals("Should be high risk", RiskLevel.HIGH, fusedRisk.riskLevel)
        assertTrue("Should have non-zero confidence", fusedRisk.confidence > 0f)
        assertTrue("Should have high risk percentage", fusedRisk.getRiskPercentage() >= 50)
        assertTrue("Should detect multiple threats", fusedRisk.triggers.size >= 3)
    }
    
    @Test
    fun `test complete detection pipeline - legitimate call`() {
        val metadataAnalyzer = MetadataRiskAnalyzer()
        val manipulationDetector = ManipulationDetector()
        val fusionEngine = RiskFusionEngine()
        
        // Simulate a legitimate call
        val metadata = CallMetadata(
            phoneNumber = "+91-9123456789",
            isInContacts = true,
            recentCallCount = 1
        )
        
        val conversation = """
            Hi, this is Priya from customer service.
            I'm calling about your recent query regarding account features.
            Would you like me to send you an email with the details?
        """.trimIndent()
        
        // Run detection pipeline
        val metadataRisk = metadataAnalyzer.analyzeMetadata(metadata)
        val manipulationRisk = manipulationDetector.analyzeConversation(conversation)
        val fusedRisk = fusionEngine.fuseRiskSignals(metadataRisk, manipulationRisk)
        
        // Assertions
        assertEquals("Should be low risk", RiskLevel.LOW, fusedRisk.riskLevel)
        assertTrue("Should have low risk percentage", fusedRisk.getRiskPercentage() < 30)
    }
}
