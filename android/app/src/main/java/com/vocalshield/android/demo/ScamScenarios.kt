package com.vocalshield.android.demo

/**
 * Preloaded scam scenarios for demo mode
 * 
 * These scenarios demonstrate the detection system without requiring:
 * - Real calls
 * - AWS connection
 * - Network connectivity
 * - Emulator stability
 * 
 * Perfect for hackathon demos and testing.
 */
object ScamScenarios {
    
    /**
     * Scenario 1: Bank Fraud - OTP Request
     * High risk: Authority + Financial + Urgency
     */
    val BANK_FRAUD_OTP = ScamScenario(
        id = "bank_otp",
        title = "Bank Fraud - OTP Request",
        description = "Scammer impersonates bank official requesting OTP",
        phoneNumber = "+91-9876543210",
        isInternational = false,
        callTime = System.currentTimeMillis(),
        conversation = listOf(
            ConversationSegment(
                timestamp = 0,
                speaker = "Caller",
                text = "Hello, this is calling from State Bank of India fraud department.",
                riskIndicators = listOf("Authority impersonation")
            ),
            ConversationSegment(
                timestamp = 5000,
                speaker = "Caller",
                text = "We have detected suspicious activity on your account. Your account will be blocked immediately if you don't verify.",
                riskIndicators = listOf("Urgency pressure", "Emotional manipulation")
            ),
            ConversationSegment(
                timestamp = 12000,
                speaker = "Caller",
                text = "I need you to share the OTP we just sent to your phone to verify your identity right now.",
                riskIndicators = listOf("Financial coercion", "Urgency", "Information extraction")
            ),
            ConversationSegment(
                timestamp = 18000,
                speaker = "Caller",
                text = "Sir, this is urgent. Your account has unauthorized transactions. Share the 6-digit code immediately.",
                riskIndicators = listOf("Urgency pressure", "Financial threat")
            )
        ),
        expectedRiskLevel = "HIGH",
        expectedScore = 85,
        keyTriggers = listOf(
            "Authority impersonation (Bank)",
            "OTP request",
            "Urgency pressure",
            "Account blocking threat"
        )
    )
    
    /**
     * Scenario 2: Tax Department Scam
     * High risk: Authority + Legal threat + Financial
     */
    val TAX_DEPARTMENT_SCAM = ScamScenario(
        id = "tax_scam",
        title = "Tax Department Scam",
        description = "Scammer poses as income tax officer with arrest threat",
        phoneNumber = "+1-555-0123",
        isInternational = true,
        callTime = System.currentTimeMillis() - (2 * 60 * 60 * 1000), // 2 hours ago
        conversation = listOf(
            ConversationSegment(
                timestamp = 0,
                speaker = "Caller",
                text = "This is Officer Sharma from Income Tax Department. We have issued a warrant for your arrest.",
                riskIndicators = listOf("Authority impersonation", "Legal threat")
            ),
            ConversationSegment(
                timestamp = 6000,
                speaker = "Caller",
                text = "You have unpaid taxes of 2.5 lakh rupees. Police will come to arrest you within 2 hours.",
                riskIndicators = listOf("Urgency", "Emotional manipulation")
            ),
            ConversationSegment(
                timestamp = 13000,
                speaker = "Caller",
                text = "To stop the arrest warrant, you must pay the penalty immediately through UPI or bank transfer.",
                riskIndicators = listOf("Financial coercion", "Urgency pressure")
            ),
            ConversationSegment(
                timestamp = 20000,
                speaker = "Caller",
                text = "This is your last chance. Transfer the money now or face legal consequences.",
                riskIndicators = listOf("Urgency", "Threat")
            )
        ),
        expectedRiskLevel = "HIGH",
        expectedScore = 92,
        keyTriggers = listOf(
            "Authority impersonation (Tax)",
            "Arrest warrant threat",
            "Immediate payment demand",
            "Legal consequences"
        )
    )
    
    /**
     * Scenario 3: Family Emergency Scam
     * High risk: Emotional manipulation + Urgency
     */
    val FAMILY_EMERGENCY = ScamScenario(
        id = "family_emergency",
        title = "Family Emergency Scam",
        description = "Scammer claims family member is in danger",
        phoneNumber = "+91-8765432109",
        isInternational = false,
        callTime = System.currentTimeMillis() - (23 * 60 * 60 * 1000), // 11 PM (midnight call)
        conversation = listOf(
            ConversationSegment(
                timestamp = 0,
                speaker = "Caller",
                text = "Hello, your son has met with an accident. He is in the hospital emergency room.",
                riskIndicators = listOf("Emotional manipulation", "Family threat")
            ),
            ConversationSegment(
                timestamp = 5000,
                speaker = "Caller",
                text = "The doctors need immediate payment for surgery. It's a matter of life and death.",
                riskIndicators = listOf("Urgency", "Emotional pressure")
            ),
            ConversationSegment(
                timestamp = 11000,
                speaker = "Caller",
                text = "You need to transfer 50,000 rupees right now to this account number for the operation.",
                riskIndicators = listOf("Financial coercion", "Urgency")
            ),
            ConversationSegment(
                timestamp = 17000,
                speaker = "Caller",
                text = "Every minute counts. Your son's life is in danger. Send the money immediately.",
                riskIndicators = listOf("Emotional manipulation", "Urgency pressure")
            )
        ),
        expectedRiskLevel = "HIGH",
        expectedScore = 88,
        keyTriggers = listOf(
            "Family member in danger",
            "Hospital emergency",
            "Immediate payment demand",
            "Midnight call"
        )
    )
    
    /**
     * Scenario 4: Prize/Lottery Scam
     * Medium risk: Financial + Information extraction
     */
    val LOTTERY_SCAM = ScamScenario(
        id = "lottery",
        title = "Lottery Prize Scam",
        description = "Scammer claims user won lottery, requests fees",
        phoneNumber = "+44-20-1234-5678",
        isInternational = true,
        callTime = System.currentTimeMillis(),
        conversation = listOf(
            ConversationSegment(
                timestamp = 0,
                speaker = "Caller",
                text = "Congratulations! You have won 25 lakh rupees in the National Lottery draw.",
                riskIndicators = listOf("Prize claim")
            ),
            ConversationSegment(
                timestamp = 5000,
                speaker = "Caller",
                text = "To claim your prize money, we need to verify your bank account details.",
                riskIndicators = listOf("Information extraction")
            ),
            ConversationSegment(
                timestamp = 10000,
                speaker = "Caller",
                text = "There is a small processing fee of 5,000 rupees that you need to pay first.",
                riskIndicators = listOf("Financial coercion", "Advance fee")
            ),
            ConversationSegment(
                timestamp = 15000,
                speaker = "Caller",
                text = "This offer expires today. Share your account number and pay the fee to receive your winnings.",
                riskIndicators = listOf("Urgency", "Information extraction")
            )
        ),
        expectedRiskLevel = "MEDIUM",
        expectedScore = 65,
        keyTriggers = listOf(
            "Lottery/prize claim",
            "Advance fee request",
            "Bank details request",
            "International number"
        )
    )
    
    /**
     * Scenario 5: Tech Support Scam
     * Medium risk: Authority + Information extraction
     */
    val TECH_SUPPORT_SCAM = ScamScenario(
        id = "tech_support",
        title = "Tech Support Scam",
        description = "Scammer poses as tech support, requests remote access",
        phoneNumber = "+1-800-555-0199",
        isInternational = true,
        callTime = System.currentTimeMillis(),
        conversation = listOf(
            ConversationSegment(
                timestamp = 0,
                speaker = "Caller",
                text = "Hello, this is Microsoft technical support. We detected a virus on your computer.",
                riskIndicators = listOf("Authority impersonation")
            ),
            ConversationSegment(
                timestamp = 6000,
                speaker = "Caller",
                text = "Your system is compromised. Hackers are accessing your personal data right now.",
                riskIndicators = listOf("Emotional manipulation", "Urgency")
            ),
            ConversationSegment(
                timestamp = 12000,
                speaker = "Caller",
                text = "I need you to install this remote access software immediately so I can fix the problem.",
                riskIndicators = listOf("Information extraction", "Urgency")
            ),
            ConversationSegment(
                timestamp = 18000,
                speaker = "Caller",
                text = "The virus will steal your bank details if we don't act fast. Download the software now.",
                riskIndicators = listOf("Urgency pressure", "Financial threat")
            )
        ),
        expectedRiskLevel = "MEDIUM",
        expectedScore = 70,
        keyTriggers = listOf(
            "Tech support impersonation",
            "Virus/hacking threat",
            "Remote access request",
            "Urgency pressure"
        )
    )
    
    /**
     * Scenario 6: Legitimate Call - Low Risk
     * Low risk: Normal conversation
     */
    val LEGITIMATE_CALL = ScamScenario(
        id = "legitimate",
        title = "Legitimate Call",
        description = "Normal call from known contact",
        phoneNumber = "+91-9123456789",
        isInternational = false,
        callTime = System.currentTimeMillis(),
        conversation = listOf(
            ConversationSegment(
                timestamp = 0,
                speaker = "Caller",
                text = "Hi, this is Priya from your bank's customer service. I'm calling about your recent query.",
                riskIndicators = emptyList()
            ),
            ConversationSegment(
                timestamp = 5000,
                speaker = "Caller",
                text = "You had asked about the new savings account features. Would you like me to explain them?",
                riskIndicators = emptyList()
            ),
            ConversationSegment(
                timestamp = 11000,
                speaker = "Caller",
                text = "For security, I'll send you an email with all the details. You can review and respond at your convenience.",
                riskIndicators = emptyList()
            ),
            ConversationSegment(
                timestamp = 17000,
                speaker = "Caller",
                text = "Is there anything else I can help you with today?",
                riskIndicators = emptyList()
            )
        ),
        expectedRiskLevel = "LOW",
        expectedScore = 15,
        keyTriggers = listOf(
            "No urgency pressure",
            "No information requests",
            "Professional tone"
        )
    )
    
    /**
     * Get all scenarios
     */
    fun getAllScenarios(): List<ScamScenario> {
        return listOf(
            BANK_FRAUD_OTP,
            TAX_DEPARTMENT_SCAM,
            FAMILY_EMERGENCY,
            LOTTERY_SCAM,
            TECH_SUPPORT_SCAM,
            LEGITIMATE_CALL
        )
    }
    
    /**
     * Get scenario by ID
     */
    fun getScenarioById(id: String): ScamScenario? {
        return getAllScenarios().find { it.id == id }
    }
    
    /**
     * Get random high-risk scenario
     */
    fun getRandomHighRiskScenario(): ScamScenario {
        val highRiskScenarios = listOf(
            BANK_FRAUD_OTP,
            TAX_DEPARTMENT_SCAM,
            FAMILY_EMERGENCY
        )
        return highRiskScenarios.random()
    }
}

/**
 * Scam scenario data
 */
data class ScamScenario(
    val id: String,
    val title: String,
    val description: String,
    val phoneNumber: String,
    val isInternational: Boolean,
    val callTime: Long,
    val conversation: List<ConversationSegment>,
    val expectedRiskLevel: String,
    val expectedScore: Int,
    val keyTriggers: List<String>
)

/**
 * Conversation segment
 */
data class ConversationSegment(
    val timestamp: Long, // milliseconds from call start
    val speaker: String,
    val text: String,
    val riskIndicators: List<String>
)
