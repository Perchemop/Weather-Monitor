import {
  CurrentWeather,
  HourlyForecastItem,
  RiskThresholds,
  AlertItem,
  AlertType,
  AlertSeverity
} from '../types.js';
import {
  getActiveAlerts,
  saveAlert,
  updateAlertStatus,
  getAlertHistory
} from '../database/db.js';

export interface EvaluatedCandidateAlert {
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  triggerCondition: string;
  observedValue: string;
  thresholdValue: string;
  startTime: string;
  expectedDuration: string;
}

export async function evaluateAndProcessAlerts(
  locationId: string,
  locationName: string,
  current: CurrentWeather,
  hourly: HourlyForecastItem[],
  thresholds: RiskThresholds,
  cooldownMinutes = 60
): Promise<{ newAlerts: AlertItem[]; clearedAlerts: AlertItem[] }> {
  const candidateAlerts: EvaluatedCandidateAlert[] = [];

  // Look ahead 6 hours
  const next6 = hourly.slice(0, 6);
  let maxGustNext6 = current.windGusts;
  let maxRainProbNext6 = current.rainProbability;
  let maxRainAmountNext6 = current.rainAmount;
  let peakGustHour: HourlyForecastItem | null = null;

  for (const h of next6) {
    if (h.windGusts > maxGustNext6) {
      maxGustNext6 = h.windGusts;
      peakGustHour = h;
    }
    if (h.rainProbability > maxRainProbNext6) maxRainProbNext6 = h.rainProbability;
    if (h.precipitation > maxRainAmountNext6) maxRainAmountNext6 = h.precipitation;
  }

  // 1. Extreme Wind / High Wind
  if (maxGustNext6 >= thresholds.gustCritical) {
    candidateAlerts.push({
      alertType: 'EXTREME WIND',
      severity: 'CRITICAL',
      title: 'CRITICAL WIND GUST ALERT',
      message: `Dangerous wind gusts up to ${Math.round(maxGustNext6)} km/h are impacting or forecast in the area. Extreme crane deflection and fall hazard.`,
      triggerCondition: `Wind gusts >= ${thresholds.gustCritical} km/h`,
      observedValue: `${Math.round(maxGustNext6)} km/h`,
      thresholdValue: `${thresholds.gustCritical} km/h`,
      startTime: peakGustHour ? peakGustHour.time : current.timestamp,
      expectedDuration: '2–3 hours'
    });
  } else if (maxGustNext6 >= thresholds.gustHigh) {
    candidateAlerts.push({
      alertType: 'HIGH WIND',
      severity: 'HIGH',
      title: 'HIGH WIND ALERT',
      message: `Strong wind gusts up to ${Math.round(maxGustNext6)} km/h expected. Approaching crane, scaffolding and roofing operational thresholds.`,
      triggerCondition: `Wind gusts >= ${thresholds.gustHigh} km/h`,
      observedValue: `${Math.round(maxGustNext6)} km/h`,
      thresholdValue: `${thresholds.gustHigh} km/h`,
      startTime: peakGustHour ? peakGustHour.time : current.timestamp,
      expectedDuration: '2–4 hours'
    });
  }

  // 2. Heavy Rain
  if (maxRainAmountNext6 >= thresholds.rainAmountHigh) {
    candidateAlerts.push({
      alertType: 'HEAVY RAIN',
      severity: 'HIGH',
      title: 'HEAVY RAINFALL ALERT',
      message: `Intense precipitation rate (${maxRainAmountNext6.toFixed(1)} mm/h) expected. High risk of trench flooding, runoff and concrete wash-out.`,
      triggerCondition: `Rainfall >= ${thresholds.rainAmountHigh} mm/h`,
      observedValue: `${maxRainAmountNext6.toFixed(1)} mm/h`,
      thresholdValue: `${thresholds.rainAmountHigh} mm/h`,
      startTime: current.timestamp,
      expectedDuration: '1–3 hours'
    });
  } else if (maxRainProbNext6 >= thresholds.rainProbHigh && maxRainAmountNext6 >= thresholds.rainAmountWarning) {
    candidateAlerts.push({
      alertType: 'HIGH RAIN PROBABILITY',
      severity: 'MODERATE',
      title: 'RAIN HAZARD ALERT',
      message: `High rain probability (${Math.round(maxRainProbNext6)}%) with active rainfall forecasted.`,
      triggerCondition: `Rain probability >= ${thresholds.rainProbHigh}% and rainfall >= ${thresholds.rainAmountWarning} mm/h`,
      observedValue: `${Math.round(maxRainProbNext6)}% / ${maxRainAmountNext6.toFixed(1)} mm/h`,
      thresholdValue: `${thresholds.rainProbHigh}% / ${thresholds.rainAmountWarning} mm/h`,
      startTime: current.timestamp,
      expectedDuration: '2–4 hours'
    });
  }

  // 3. Extreme Heat
  if (current.temperature >= thresholds.heatCritical) {
    candidateAlerts.push({
      alertType: 'EXTREME HEAT',
      severity: 'CRITICAL',
      title: 'CRITICAL HEAT ALERT',
      message: `Ambient temperatures reaching ${Math.round(current.temperature)}°C. Acute heat-illness risk and severe concrete hydration impairment.`,
      triggerCondition: `Temperature >= ${thresholds.heatCritical}°C`,
      observedValue: `${Math.round(current.temperature)}°C`,
      thresholdValue: `${thresholds.heatCritical}°C`,
      startTime: current.timestamp,
      expectedDuration: '3–5 hours'
    });
  } else if (current.temperature >= thresholds.heatWarning) {
    candidateAlerts.push({
      alertType: 'EXTREME HEAT',
      severity: 'HIGH',
      title: 'HIGH HEAT ADVISORY',
      message: `Elevated temperatures (${Math.round(current.temperature)}°C). Enforce worker hydration and shade breaks.`,
      triggerCondition: `Temperature >= ${thresholds.heatWarning}°C`,
      observedValue: `${Math.round(current.temperature)}°C`,
      thresholdValue: `${thresholds.heatWarning}°C`,
      startTime: current.timestamp,
      expectedDuration: '3–4 hours'
    });
  }

  // 4. Storm / Lightning
  if (current.weatherCode >= 95) {
    candidateAlerts.push({
      alertType: 'STORM',
      severity: 'CRITICAL',
      title: 'THUNDERSTORM & LIGHTNING ALERT',
      message: `Active thunderstorm conditions detected (WMO code ${current.weatherCode}: ${current.weatherDescription}). Suspend all crane booms and open elevated work immediately.`,
      triggerCondition: 'WMO code >= 95',
      observedValue: current.weatherDescription,
      thresholdValue: 'Thunderstorm detected',
      startTime: current.timestamp,
      expectedDuration: '1–2 hours'
    });
  } else {
    // No active thunderstorm code, but convective energy may still be building.
    // Open-Meteo's Lightning Potential Index (LPI) and CAPE flag developing
    // storms ahead of a WMO 95 code so crews can prepare in time.
    const peakLpi = Math.max(current.lightningPotential ?? 0, ...next6.map((h) => h.lightningPotential ?? 0));
    const peakCape = Math.max(current.cape ?? 0, ...next6.map((h) => h.cape ?? 0));
    if (peakLpi >= 500 || peakCape >= 1500) {
      const severe = peakLpi >= 1000 || peakCape >= 2500;
      candidateAlerts.push({
        alertType: 'LIGHTNING',
        severity: severe ? 'CRITICAL' : 'HIGH',
        title: severe ? 'SEVERE LIGHTNING RISK ALERT' : 'LIGHTNING RISK ALERT',
        message: `Convective storm energy is building (LPI ${Math.round(peakLpi)} J/kg, CAPE ${Math.round(
          peakCape
        )} J/kg). Thunderstorm and lightning activity is possible within the next few hours — secure crane booms and plan to suspend elevated work.`,
        triggerCondition: 'Lightning potential >= 500 J/kg or CAPE >= 1500 J/kg',
        observedValue: `LPI ${Math.round(peakLpi)} J/kg / CAPE ${Math.round(peakCape)} J/kg`,
        thresholdValue: 'LPI 500 J/kg / CAPE 1500 J/kg',
        startTime: current.timestamp,
        expectedDuration: '2–4 hours'
      });
    }
  }

  // 5. Extreme UV
  if (current.uvIndex >= thresholds.uvHigh) {
    candidateAlerts.push({
      alertType: 'HIGH UV',
      severity: 'HIGH',
      title: 'EXTREME UV RADIATION ALERT',
      message: `Solar UV radiation index at ${current.uvIndex.toFixed(1)} (Extreme). Mandate broad-brim hard hat shades and sunscreen.`,
      triggerCondition: `UV index >= ${thresholds.uvHigh}`,
      observedValue: current.uvIndex.toFixed(1),
      thresholdValue: `${thresholds.uvHigh}`,
      startTime: current.timestamp,
      expectedDuration: '2–3 hours'
    });
  }

  // Fetch currently active alerts and past alerts for deduplication and cooldown
  const activeAlerts = await getActiveAlerts(locationId);
  const recentAlerts = await getAlertHistory(20);
  const nowMs = Date.now();
  const cooldownMs = cooldownMinutes * 60 * 1000;

  const newAlerts: AlertItem[] = [];
  const candidateTypes = new Set(candidateAlerts.map((c) => c.alertType));

  // Check for cleared alerts
  const clearedAlerts: AlertItem[] = [];
  for (const active of activeAlerts) {
    if (!candidateTypes.has(active.alertType)) {
      // Condition cleared!
      await updateAlertStatus(active.id, 'CLEARED');
      clearedAlerts.push({ ...active, status: 'CLEARED', clearedAt: new Date().toISOString() });
    }
  }

  // Process candidate alerts with deduplication & escalation
  for (const candidate of candidateAlerts) {
    const existingActive = activeAlerts.find((a) => a.alertType === candidate.alertType);

    if (existingActive) {
      // Condition still active: check if severity escalated!
      const isEscalation =
        (existingActive.severity === 'MODERATE' && (candidate.severity === 'HIGH' || candidate.severity === 'CRITICAL')) ||
        (existingActive.severity === 'HIGH' && candidate.severity === 'CRITICAL');

      if (isEscalation) {
        // Mark old alert as superseded / cleared, create escalated alert!
        await updateAlertStatus(existingActive.id, 'CLEARED');
        const saved = await saveAlert({
          locationId,
          locationName,
          alertType: candidate.alertType,
          severity: candidate.severity,
          title: candidate.title + ' [ESCALATION]',
          message: candidate.message,
          triggerCondition: candidate.triggerCondition,
          observedValue: candidate.observedValue,
          thresholdValue: candidate.thresholdValue,
          startTime: candidate.startTime,
          expectedDuration: candidate.expectedDuration,
          status: 'ACTIVE'
        });
        newAlerts.push(saved);
      }
      // Otherwise, condition remains and hasn't escalated: suppress duplicate!
      continue;
    }

    // Not currently active. Check cooldown against recent alerts of same type
    const lastMatching = recentAlerts.find((a) => a.alertType === candidate.alertType);
    if (lastMatching) {
      const timeSinceLast = nowMs - new Date(lastMatching.createdAt).getTime();
      if (timeSinceLast < cooldownMs && candidate.severity !== 'CRITICAL') {
        // Within cooldown window: suppress notification spam
        continue;
      }
    }

    // Condition newly triggered!
    const saved = await saveAlert({
      locationId,
      locationName,
      alertType: candidate.alertType,
      severity: candidate.severity,
      title: candidate.title,
      message: candidate.message,
      triggerCondition: candidate.triggerCondition,
      observedValue: candidate.observedValue,
      thresholdValue: candidate.thresholdValue,
      startTime: candidate.startTime,
      expectedDuration: candidate.expectedDuration,
      status: 'ACTIVE'
    });
    newAlerts.push(saved);
  }

  return { newAlerts, clearedAlerts };
}
