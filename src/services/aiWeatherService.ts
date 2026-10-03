import { GoogleGenAI } from '@google/genai';
import {
  RiskAssessment,
  CurrentWeather,
  HourlyForecastItem,
  AlertItem,
  AiBriefingResponse,
  AiAlertExplanationResponse,
  AiHistoricalSummaryResponse
} from '../types.js';
import { SAFETY_DISCLAIMER } from './riskEngine.js';

let genAIClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (genAIClient) return genAIClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return null;
  }
  genAIClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
  return genAIClient;
}

/**
 * Valid model cascade list for resilient text and reasoning tasks.
 * In case of 503 high-demand spikes or transient rate limits on gemini-3.8-flash,
 * the system immediately and transparently fails over to flash-lite / flash-latest.
 */
const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest'
];

interface GeminiCallOptions {
  config?: {
    responseMimeType?: string;
    systemInstruction?: string;
  };
  maxRetriesPerModel?: number;
}

/**
 * Resilient multi-model Gemini caller with automated retry and failover cascade.
 * Protects against 503 UNAVAILABLE ("model is experiencing high demand") and 429 errors.
 */
async function callGeminiWithCascade(
  prompt: string,
  options?: GeminiCallOptions
): Promise<{ text: string; modelUsed: string } | null> {
  const client = getGeminiClient();
  if (!client) return null;

  let lastErrorSummary = '';

  for (const model of CANDIDATE_MODELS) {
    let attempts = 0;
    const maxAttempts = options?.maxRetriesPerModel ?? 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const response = await client.models.generateContent({
          model,
          contents: prompt,
          ...(options?.config ? { config: options.config } : {})
        });
        const text = response.text?.trim() || '';
        if (text) {
          return { text, modelUsed: model };
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        lastErrorSummary = msg;
        const isSpikeOrRateLimit =
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('high demand') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED');

        if (isSpikeOrRateLimit && attempts < maxAttempts) {
          // Brief jittered pause before one retry on this model
          await new Promise((r) => setTimeout(r, 500 + Math.random() * 400));
          continue;
        }

        console.log(`[AI Weather Service] Model ${model} unavailable (transient load/status). Cascading to next fallback...`);
        break; // Fail over to next candidate model
      }
    }
  }

  console.log(`[AI Weather Service] Note: Gemini models temporarily unavailable (${lastErrorSummary.slice(0, 80)}). Gracefully utilizing deterministic rule engine.`);
  return null;
}

/**
 * Generates an executive site superintendent weather briefing.
 * Strictly non-authoritative: AI commentary cannot alter the deterministic risk level or score.
 */
export async function generateAiWeatherBriefing(
  locationName: string,
  current: CurrentWeather,
  deterministicRisk: RiskAssessment,
  _hourlyForecast: HourlyForecastItem[] = []
): Promise<AiBriefingResponse> {
  const activitiesAffected = deterministicRisk.affectedActivities
    .filter((a) => a.riskLevel === 'HIGH' || a.riskLevel === 'CRITICAL')
    .map((a) => a.activity);

  const fallbackNarrative =
    deterministicRisk.level === 'CRITICAL'
      ? `CRITICAL ALERT for ${locationName}: Severe weather conditions (${deterministicRisk.factors
          .map((f) => f.label)
          .join(', ')}) exceed safety limits. Suspend hazardous operations including ${activitiesAffected.join(', ') || 'crane and elevated work'} immediately.`
      : deterministicRisk.level === 'HIGH'
      ? `HIGH RISK ADVISORY for ${locationName}: Elevated conditions (${deterministicRisk.factors
          .map((f) => f.label)
          .join(', ')}) require SWMS review and mitigation before proceeding with high-exposure tasks.`
      : deterministicRisk.level === 'MODERATE'
      ? `MODERATE VIGILANCE for ${locationName}: Conditions are marginal (${deterministicRisk.factors
          .map((f) => f.label)
          .join(', ')}). Monitor wind gusts and localized shower development.`
      : `NORMAL OPERATIONAL STATUS for ${locationName}: Weather parameters are within standard envelopes. Proceed with standard site safety protocols.`;

  const prompt = `You are a licensed construction site safety director preparing a brief daily weather risk briefing for site supervisors.
Location: ${locationName}
Current Weather:
- Temperature: ${current.temperature}°C (Feels like: ${current.feelsLike}°C)
- Sustained Wind: ${Math.round(current.windSpeed)} km/h
- Wind Gusts: ${Math.round(current.windGusts)} km/h
- Rain Rate: ${current.rainAmount} mm/h (Probability: ${current.rainProbability}%)
- Conditions: ${current.weatherDescription}

Deterministic Safety Assessment (MANDATORY BENCHMARK):
- Authoritative Risk Level: ${deterministicRisk.level}
- Risk Score: ${deterministicRisk.score}/100
- Active Trigger Factors: ${deterministicRisk.factors.map((f) => `${f.label} (${f.value})`).join(', ') || 'None'}
- Affected Activities: ${deterministicRisk.affectedActivities
    .map((a) => `${a.activity}: ${a.riskLevel} (${a.reason})`)
    .join('; ')}

CRITICAL INSTRUCTION:
Provide a crisp, professional 2-3 sentence superintendent briefing.
You MUST acknowledge the authoritative risk level "${deterministicRisk.level}" and MUST NOT contradict or downgrade it. Focus on practical site actions (e.g. crane tag lines, scaffold tie-offs, heat breaks).`;

  const result = await callGeminiWithCascade(prompt);

  if (result) {
    return {
      briefing: result.text,
      authoritativeRiskLevel: deterministicRisk.level,
      source: 'GEMINI_AI',
      modelUsed: result.modelUsed,
      generatedAt: new Date().toISOString(),
      disclaimer: SAFETY_DISCLAIMER
    };
  }

  return {
    briefing: fallbackNarrative,
    authoritativeRiskLevel: deterministicRisk.level,
    source: 'DETERMINISTIC_RULES',
    generatedAt: new Date().toISOString(),
    disclaimer: SAFETY_DISCLAIMER
  };
}

/**
 * Generates an operational safety explanation for an active alert.
 */
export async function generateAiAlertExplanation(
  alert: AlertItem,
  _deterministicRisk: RiskAssessment
): Promise<AiAlertExplanationResponse> {
  const fallbackActions = [
    'Inspect site tie-downs and loose forms',
    'Verify manufacturer crane anemometer limits',
    'Notify superintendent and review SWMS'
  ];

  const prompt = `You are a senior site safety engineer. A weather alert has been triggered:
Alert Title: ${alert.title}
Alert Type: ${alert.alertType}
Location: ${alert.locationName}
Severity: ${alert.severity}
Observed Value: ${alert.observedValue}
Configured Safety Threshold: ${alert.thresholdValue}
Expected Timeframe: ${alert.startTime} (${alert.expectedDuration})

Provide an operational safety explanation in JSON format with:
- "explanation": 2 sentences explaining the mechanical/safety reason for the hazard (e.g., aerodynamic drag on crane boom, scaffold sail area, reduced tire friction).
- "recommendedActions": an array of 3 specific site actions to execute.`;

  const result = await callGeminiWithCascade(prompt, {
    config: {
      responseMimeType: 'application/json'
    }
  });

  if (result) {
    try {
      const parsed = JSON.parse(result.text);
      return {
        alertId: alert.id,
        explanation: parsed.explanation || alert.message,
        recommendedActions: Array.isArray(parsed.recommendedActions) && parsed.recommendedActions.length > 0
          ? parsed.recommendedActions
          : fallbackActions,
        authoritativeSeverity: alert.severity,
        source: 'GEMINI_AI',
        modelUsed: result.modelUsed,
        generatedAt: new Date().toISOString()
      };
    } catch {
      // Fall through to deterministic response if JSON parsing fails
    }
  }

  return {
    alertId: alert.id,
    explanation: `Operational safety notice: ${alert.message}. Review site SWMS and stop work if limits are breached.`,
    recommendedActions: fallbackActions,
    authoritativeSeverity: alert.severity,
    source: 'DETERMINISTIC_RULES',
    generatedAt: new Date().toISOString()
  };
}

/**
 * Summarizes past weather observation trends.
 */
export async function generateAiHistoricalSummary(
  locationName: string,
  observations: CurrentWeather[]
): Promise<AiHistoricalSummaryResponse> {
  if (!observations || observations.length === 0) {
    return {
      locationName,
      timeframe: 'No records available',
      summary: 'Insufficient historical weather observations logged in the database to generate a trend analysis.',
      peakGustObserved: '0 km/h',
      highestRiskLevel: 'LOW',
      source: 'DETERMINISTIC_RULES',
      generatedAt: new Date().toISOString()
    };
  }

  const maxWind = Math.max(...observations.map((o) => o.windSpeed || 0));
  const maxGust = Math.max(...observations.map((o) => o.windGusts || o.windSpeed || 0));
  const maxTemp = Math.max(...observations.map((o) => o.temperature || 0));
  const minTemp = Math.min(...observations.map((o) => o.temperature || 0));

  const prompt = `Analyze this recent construction weather log for site "${locationName}":
Total logged intervals: ${observations.length}
Max sustained wind: ${Math.round(maxWind)} km/h
Max wind gust: ${Math.round(maxGust)} km/h
Temperature span: ${minTemp.toFixed(1)}°C to ${maxTemp.toFixed(1)}°C

Write a 2-3 sentence operational historical summary highlighting whether conditions showed rising volatility or stability, and noting impact on work schedules.`;

  const result = await callGeminiWithCascade(prompt);

  const highestRisk = maxGust >= 68 ? 'CRITICAL' : maxGust >= 55 ? 'HIGH' : maxGust >= 45 ? 'MODERATE' : 'LOW';

  if (result) {
    return {
      locationName,
      timeframe: `Past ${observations.length} observations`,
      summary: result.text || `Weather records show peak gusts of ${Math.round(maxGust)} km/h across ${observations.length} observations.`,
      peakGustObserved: `${Math.round(maxGust)} km/h`,
      highestRiskLevel: highestRisk,
      source: 'GEMINI_AI',
      modelUsed: result.modelUsed,
      generatedAt: new Date().toISOString()
    };
  }

  return {
    locationName,
    timeframe: `Past ${observations.length} observations`,
    summary: `Across the past ${observations.length} recorded cycles at ${locationName}, maximum gusts reached ${Math.round(maxGust)} km/h with temperatures ranging from ${minTemp.toFixed(1)}°C to ${maxTemp.toFixed(1)}°C. Weather trends remained consistent with recorded seasonal benchmarks.`,
    peakGustObserved: `${Math.round(maxGust)} km/h`,
    highestRiskLevel: highestRisk,
    source: 'DETERMINISTIC_RULES',
    generatedAt: new Date().toISOString()
  };
}
