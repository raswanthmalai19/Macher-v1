/**
 * Direct Bedrock client for fraud analysis.
 * Uses Amazon Nova Micro via InvokeModel — no Bedrock Agent or Anthropic use-case form required.
 */
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export interface FraudAnalysisResult {
  riskScore: number;
  threatLevel: 'SAFE' | 'CAUTION' | 'DANGER';
  fraudIndicators: Array<{
    type: string;
    description: string;
    confidence: number;
  }>;
  reasoning: string;
  knowledgeBaseReferences: string[];
  tokenUsage: { inputTokens: number; outputTokens: number };
}

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
// Amazon Nova Micro — no use-case form required, ON_DEMAND inference
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-micro-v1:0';

function createDefaultSafe(): FraudAnalysisResult {
  return {
    riskScore: 0, threatLevel: 'SAFE',
    fraudIndicators: [], reasoning: 'No concerning patterns detected.',
    knowledgeBaseReferences: [],
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
  };
}

function createDefaultCaution(reason: string): FraudAnalysisResult {
  return {
    riskScore: 50, threatLevel: 'CAUTION',
    fraudIndicators: [{ type: 'UNKNOWN', description: reason, confidence: 0.5 }],
    reasoning: reason,
    knowledgeBaseReferences: [],
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
  };
}

/**
 * Analyze call transcription for fraud using Amazon Nova Micro via Bedrock InvokeModel.
 */
export async function analyzeTranscriptWithClaude(
  transcription: string,
  sessionId: string,
): Promise<FraudAnalysisResult> {
  if (!transcription || transcription.trim().length < 10) {
    return createDefaultSafe();
  }

  const prompt = `You are a real-time phone call fraud detector. Analyze the following phone call transcription and determine if there are signs of a scam or fraud.

Common scam patterns:
- Impersonation of government agencies (IRS, SSA, police)
- Urgency and threats ("you will be arrested", "act now")
- Requests for gift cards, wire transfers, cryptocurrency
- Requests for personal information (SSN, bank account, passwords)
- Tech support scams ("your computer has a virus")
- Romance/grandparent scams
- Prize/lottery scams ("you have won")

Transcription:
"""
${transcription}
"""

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "riskScore": <0-100>,
  "threatLevel": "<SAFE|CAUTION|DANGER>",
  "fraudIndicators": [{"type": "<URGENCY|PAYMENT_REQUEST|IMPERSONATION|THREAT|PERSONAL_INFO_REQUEST>", "description": "<brief>", "confidence": <0.0-1.0>}],
  "reasoning": "<brief explanation max 200 chars>"
}

Rules:
- riskScore 0-33 = SAFE, 34-66 = CAUTION, 67-100 = DANGER
- Return SAFE with score 0 if transcription is normal conversation
- Be conservative — only flag clear scam patterns`;

  try {
    // Amazon Nova message format (different from Anthropic)
    const body = JSON.stringify({
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 512, temperature: 0.1 },
    });

    const resp = await client.send(new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: Buffer.from(body),
    }));

    const result = JSON.parse(new TextDecoder().decode(resp.body));
    // Nova response format: result.output.message.content[0].text
    const text = result?.output?.message?.content?.[0]?.text || '';
    const usage = result.usage || {};

    console.log(JSON.stringify({
      component: 'BedrockDirect', level: 'INFO',
      message: 'Nova Micro raw response', sessionId,
      textLength: text.length, text: text.slice(0, 300),
    }));

    // Parse JSON from Nova response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(JSON.stringify({ component: 'BedrockDirect', level: 'WARN', message: 'No JSON in response', sessionId, text }));
      return createDefaultCaution('Could not parse analysis result');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    const riskScore = Math.max(0, Math.min(100, Number(analysis.riskScore) || 0));
    const threatLevel = riskScore <= 33 ? 'SAFE' : riskScore <= 66 ? 'CAUTION' : 'DANGER';

    return {
      riskScore,
      threatLevel,
      fraudIndicators: Array.isArray(analysis.fraudIndicators) ? analysis.fraudIndicators : [],
      reasoning: (analysis.reasoning || 'Analysis completed').slice(0, 200),
      knowledgeBaseReferences: [],
      tokenUsage: {
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
      },
    };
  } catch (error) {
    console.log(JSON.stringify({
      component: 'BedrockDirect', level: 'ERROR',
      message: 'Nova Micro invocation failed',
      sessionId,
      error: { name: (error as Error).name, message: (error as Error).message },
    }));
    return createDefaultCaution('Analysis service temporarily unavailable');
  }
}
