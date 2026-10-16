import {
  CurrentWeather,
  HourlyForecastItem,
  RiskAssessment,
  RiskFactor,
  ActivityImpact,
  RiskLevel,
  RiskThresholds
} from '../types.js';
import { formatLocationTime } from '../utils/time.js';

export const DEFAULT_THRESHOLDS: RiskThresholds = {
  windWarning: 38,
  windHigh: 48,
  windCritical: 60,
  gustWarning: 45,
  gustHigh: 55,
  gustCritical: 68,
  rainProbWarning: 50,
  rainProbHigh: 75,
  rainAmountWarning: 4,
  rainAmountHigh: 12,
  heatWarning: 34,
  heatCritical: 39,
  uvWarning: 8,
  uvHigh: 11
};

export const SAFETY_DISCLAIMER =
  'Review applicable site procedures, SWMS, equipment requirements and manufacturer limits. The system is a weather-risk monitoring tool. It is not a replacement for professional safety judgement.';

export function calculateDeterministicRisk(
  current: CurrentWeather,
  hourlyForecast: HourlyForecastItem[] = [],
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS,
  timezone = 'auto'
): RiskAssessment {
  const factors: RiskFactor[] = [];
  let highestScore = 10;
  let highestLevel: RiskLevel = 'LOW';

  // 1. Wind Speed Factor
  if (current.windSpeed >= thresholds.windCritical) {
    factors.push({
      id: 'wind-critical',
      category: 'WIND',
      label: 'Critical Sustained Wind',
      value: `${Math.round(current.windSpeed)} km/h`,
      threshold: `>= ${thresholds.windCritical} km/h`,
      severity: 'CRITICAL'
    });
    highestScore = Math.max(highestScore, 90);
    highestLevel = 'CRITICAL';
  } else if (current.windSpeed >= thresholds.windHigh) {
    factors.push({
      id: 'wind-high',
      category: 'WIND',
      label: 'High Sustained Wind',
      value: `${Math.round(current.windSpeed)} km/h`,
      threshold: `>= ${thresholds.windHigh} km/h`,
      severity: 'HIGH'
    });
    highestScore = Math.max(highestScore, 70);
    highestLevel = 'HIGH';
  } else if (current.windSpeed >= thresholds.windWarning) {
    factors.push({
      id: 'wind-warning',
      category: 'WIND',
      label: 'Elevated Sustained Wind',
      value: `${Math.round(current.windSpeed)} km/h`,
      threshold: `>= ${thresholds.windWarning} km/h`,
      severity: 'MODERATE'
    });
    highestScore = Math.max(highestScore, 45);
    if (highestLevel === 'LOW') highestLevel = 'MODERATE';
  }

  // 2. Wind Gust Factor
  if (current.windGusts >= thresholds.gustCritical) {
    factors.push({
      id: 'gust-critical',
      category: 'GUST',
      label: 'Dangerous Wind Gusts',
      value: `${Math.round(current.windGusts)} km/h`,
      threshold: `>= ${thresholds.gustCritical} km/h`,
      severity: 'CRITICAL'
    });
    highestScore = Math.max(highestScore, 95);
    highestLevel = 'CRITICAL';
  } else if (current.windGusts >= thresholds.gustHigh) {
    factors.push({
      id: 'gust-high',
      category: 'GUST',
      label: 'High Wind Gusts',
      value: `${Math.round(current.windGusts)} km/h`,
      threshold: `>= ${thresholds.gustHigh} km/h`,
      severity: 'HIGH'
    });
    highestScore = Math.max(highestScore, 75);
    if (highestLevel !== 'CRITICAL') highestLevel = 'HIGH';
  } else if (current.windGusts >= thresholds.gustWarning) {
    factors.push({
      id: 'gust-warning',
      category: 'GUST',
      label: 'Moderate Wind Gusts',
      value: `${Math.round(current.windGusts)} km/h`,
      threshold: `>= ${thresholds.gustWarning} km/h`,
      severity: 'MODERATE'
    });
    highestScore = Math.max(highestScore, 50);
    if (highestLevel === 'LOW') highestLevel = 'MODERATE';
  }

  // 3. Rain & Precipitation
  if (current.rainAmount >= thresholds.rainAmountHigh) {
    factors.push({
      id: 'rain-heavy',
      category: 'RAIN',
      label: 'Heavy Rainfall',
      value: `${current.rainAmount.toFixed(1)} mm/h`,
      threshold: `>= ${thresholds.rainAmountHigh} mm/h`,
      severity: 'HIGH'
    });
    highestScore = Math.max(highestScore, 75);
    if (highestLevel !== 'CRITICAL') highestLevel = 'HIGH';
  } else if (current.rainAmount >= thresholds.rainAmountWarning) {
    factors.push({
      id: 'rain-moderate',
      category: 'RAIN',
      label: 'Active Rainfall',
      value: `${current.rainAmount.toFixed(1)} mm/h`,
      threshold: `>= ${thresholds.rainAmountWarning} mm/h`,
      severity: 'MODERATE'
    });
    highestScore = Math.max(highestScore, 50);
    if (highestLevel === 'LOW') highestLevel = 'MODERATE';
  }

  // 4. Rain Probability in near forecast
  if (current.rainProbability >= thresholds.rainProbHigh && current.rainAmount < thresholds.rainAmountWarning) {
    factors.push({
      id: 'rain-prob-high',
      category: 'RAIN',
      label: 'High Rain Probability',
      value: `${Math.round(current.rainProbability)}%`,
      threshold: `>= ${thresholds.rainProbHigh}%`,
      severity: 'MODERATE'
    });
    highestScore = Math.max(highestScore, 45);
    if (highestLevel === 'LOW') highestLevel = 'MODERATE';
  }

  // 5. Temperature (Extreme Heat / Freezing)
  if (current.temperature >= thresholds.heatCritical) {
    factors.push({
      id: 'heat-critical',
      category: 'TEMPERATURE',
      label: 'Critical Extreme Heat',
      value: `${Math.round(current.temperature)}°C`,
      threshold: `>= ${thresholds.heatCritical}°C`,
      severity: 'CRITICAL'
    });
    highestScore = Math.max(highestScore, 90);
    highestLevel = 'CRITICAL';
  } else if (current.temperature >= thresholds.heatWarning) {
    factors.push({
      id: 'heat-high',
      category: 'TEMPERATURE',
      label: 'Elevated Heat Stress',
      value: `${Math.round(current.temperature)}°C`,
      threshold: `>= ${thresholds.heatWarning}°C`,
      severity: 'HIGH'
    });
    highestScore = Math.max(highestScore, 70);
    if (highestLevel !== 'CRITICAL') highestLevel = 'HIGH';
  } else if (current.temperature <= 2) {
    factors.push({
      id: 'frost-risk',
      category: 'TEMPERATURE',
      label: 'Near-Freezing / Frost Hazard',
      value: `${current.temperature.toFixed(1)}°C`,
      threshold: `<= 2°C`,
      severity: current.temperature <= 0 ? 'HIGH' : 'MODERATE'
    });
    highestScore = Math.max(highestScore, current.temperature <= 0 ? 65 : 45);
    if (highestLevel === 'LOW') highestLevel = current.temperature <= 0 ? 'HIGH' : 'MODERATE';
  }

  // 6. UV Radiation
  if (current.uvIndex >= thresholds.uvHigh) {
    factors.push({
      id: 'uv-extreme',
      category: 'UV',
      label: 'Extreme UV Radiation',
      value: `UV ${current.uvIndex.toFixed(1)}`,
      threshold: `>= ${thresholds.uvHigh}`,
      severity: 'HIGH'
    });
    highestScore = Math.max(highestScore, 60);
    if (highestLevel === 'LOW') highestLevel = 'MODERATE';
  } else if (current.uvIndex >= thresholds.uvWarning) {
    factors.push({
      id: 'uv-very-high',
      category: 'UV',
      label: 'Very High UV Radiation',
      value: `UV ${current.uvIndex.toFixed(1)}`,
      threshold: `>= ${thresholds.uvWarning}`,
      severity: 'MODERATE'
    });
  }

  // 7. Thunderstorm / Severe Weather Codes (WMO 95, 96, 99)
  if (current.weatherCode >= 95) {
    factors.push({
      id: 'thunderstorm',
      category: 'STORM',
      label: 'Active Thunderstorm / Lightning Risk',
      value: current.weatherDescription || 'Thunderstorm',
      threshold: 'WMO 95+',
      severity: 'CRITICAL'
    });
    highestScore = Math.max(highestScore, 98);
    highestLevel = 'CRITICAL';
  }

  // 7b. Lightning Potential / Convective Energy (Open-Meteo LPI + CAPE).
  // These catch developing storms before a WMO thunderstorm code is issued.
  const lightningIndex = current.lightningPotential ?? 0;
  const cape = current.cape ?? 0;
  const lightningMetric =
    lightningIndex > 0 ? `LPI ${Math.round(lightningIndex)} J/kg` : `CAPE ${Math.round(cape)} J/kg`;
  if (lightningIndex >= 1000 || cape >= 2500) {
    factors.push({
      id: 'lightning-critical',
      category: 'STORM',
      label: 'Severe Lightning Risk',
      value: lightningMetric,
      threshold: 'LPI >= 1000 / CAPE >= 2500 J/kg',
      severity: 'CRITICAL'
    });
    highestScore = Math.max(highestScore, 97);
    highestLevel = 'CRITICAL';
  } else if (lightningIndex >= 500 || cape >= 1500) {
    factors.push({
      id: 'lightning-high',
      category: 'STORM',
      label: 'Elevated Lightning Risk',
      value: lightningMetric,
      threshold: 'LPI >= 500 / CAPE >= 1500 J/kg',
      severity: 'HIGH'
    });
    highestScore = Math.max(highestScore, 72);
    if (highestLevel !== 'CRITICAL') highestLevel = 'HIGH';
  } else if (lightningIndex >= 100 || cape >= 800) {
    factors.push({
      id: 'lightning-moderate',
      category: 'STORM',
      label: 'Developing Storm Energy',
      value: lightningMetric,
      threshold: 'LPI >= 100 / CAPE >= 800 J/kg',
      severity: 'MODERATE'
    });
    highestScore = Math.max(highestScore, 45);
    if (highestLevel === 'LOW') highestLevel = 'MODERATE';
  }

  // Check next 6 hours to also factor in imminent peak conditions
  const next6Hours = hourlyForecast.slice(0, 6);
  let peakPeriod: { start: string; end: string; metric: string } | undefined;
  let maxNextGust = current.windGusts;
  let maxNextRainProb = current.rainProbability;
  let worstHourIndex = -1;

  for (let i = 0; i < next6Hours.length; i++) {
    const h = next6Hours[i];
    if (h.windGusts > maxNextGust) {
      maxNextGust = h.windGusts;
      worstHourIndex = i;
    }
  }

  // 8. Imminent Critical Forecast Conditions (Next 6 Hours)
  // Check for imminent thunderstorm
  const stormHour = next6Hours.find((h) => h.weatherCode >= 95);
  if (stormHour) {
    factors.push({
      id: 'forecast-thunderstorm',
      category: 'STORM',
      label: 'Imminent Thunderstorm Forecast',
      value: stormHour.weatherDescription || 'Thunderstorm',
      threshold: 'WMO 95+ (within 6h)',
      severity: 'CRITICAL'
    });
    highestScore = Math.max(highestScore, 96);
    highestLevel = 'CRITICAL';
  }

  // Check for imminent lightning/convective energy in the next 6 hours.
  const lightningHour = next6Hours.find(
    (h) => (h.lightningPotential ?? 0) >= 500 || (h.cape ?? 0) >= 1500
  );
  if (lightningHour && !factors.some((f) => f.id === 'lightning-critical' || f.id === 'lightning-high')) {
    const value =
      (lightningHour.lightningPotential ?? 0) > 0
        ? `LPI up to ${Math.round(lightningHour.lightningPotential ?? 0)} J/kg`
        : `CAPE up to ${Math.round(lightningHour.cape ?? 0)} J/kg`;
    factors.push({
      id: 'forecast-lightning',
      category: 'STORM',
      label: 'Imminent Lightning Risk Forecast',
      value,
      threshold: 'LPI >= 500 / CAPE >= 1500 J/kg (within 6h)',
      severity: 'HIGH'
    });
    highestScore = Math.max(highestScore, 74);
    if (highestLevel !== 'CRITICAL') highestLevel = 'HIGH';
  }

  // Check for imminent extreme wind gusts
  if (maxNextGust >= thresholds.gustCritical) {
    factors.push({
      id: 'forecast-gust-critical',
      category: 'GUST',
      label: 'Imminent Critical Wind Gusts Forecast',
      value: `Up to ${Math.round(maxNextGust)} km/h`,
      threshold: `>= ${thresholds.gustCritical} km/h (within 6h)`,
      severity: 'CRITICAL'
    });
    highestScore = Math.max(highestScore, 92);
    highestLevel = 'CRITICAL';
  } else if (maxNextGust >= thresholds.gustHigh && highestLevel !== 'CRITICAL') {
    factors.push({
      id: 'forecast-gust-high',
      category: 'GUST',
      label: 'Imminent High Wind Gusts Forecast',
      value: `Up to ${Math.round(maxNextGust)} km/h`,
      threshold: `>= ${thresholds.gustHigh} km/h (within 6h)`,
      severity: 'HIGH'
    });
    highestScore = Math.max(highestScore, 75);
    highestLevel = 'HIGH';
  }

  // Check for imminent extreme heat in forecast
  const heatHour = next6Hours.find((h) => h.temperature >= thresholds.heatCritical);
  if (heatHour) {
    factors.push({
      id: 'forecast-heat-critical',
      category: 'TEMPERATURE',
      label: 'Imminent Extreme Heat Forecast',
      value: `${Math.round(heatHour.temperature)}°C`,
      threshold: `>= ${thresholds.heatCritical}°C (within 6h)`,
      severity: 'CRITICAL'
    });
    highestScore = Math.max(highestScore, 90);
    highestLevel = 'CRITICAL';
  }

  if (worstHourIndex !== -1 && maxNextGust >= thresholds.gustWarning) {
    const startHour = new Date(next6Hours[worstHourIndex].time);
    const endHour = new Date(startHour.getTime() + 2 * 3600 * 1000);
    const startStr = formatLocationTime(startHour.toISOString(), timezone, {
      hour: 'numeric',
      minute: '2-digit'
    });
    const endStr = formatLocationTime(endHour.toISOString(), timezone, {
      hour: 'numeric',
      minute: '2-digit'
    });
    peakPeriod = {
      start: startStr,
      end: endStr,
      metric: `Gusts up to ${Math.round(maxNextGust)} km/h`
    };
  }

  // Determine Affected Activities strictly deterministically
  const affectedActivities: ActivityImpact[] = [
    evaluateCraneOperations(current, maxNextGust, thresholds),
    evaluateScaffoldWork(current, maxNextGust, thresholds),
    evaluateRoofWork(current, maxNextGust, thresholds),
    evaluateWorkingAtHeight(current, maxNextGust, thresholds),
    evaluateConcreteWorks(current, thresholds),
    evaluateExcavation(current, thresholds),
    evaluateLiftingOperations(current, maxNextGust, thresholds),
    evaluateOutdoorWork(current, thresholds)
  ];

  // Summary generation based strictly on facts
  let summary = 'Current conditions within normal operating ranges.';
  if (highestLevel === 'CRITICAL') {
    summary = factors.map((f) => f.label).join(' & ') + ' exceed critical limits.';
  } else if (highestLevel === 'HIGH') {
    summary = factors.map((f) => f.label).join(', ') + ' observed or forecast in area.';
  } else if (highestLevel === 'MODERATE') {
    summary = factors.map((f) => f.label).join(', ') + ' requires heightened vigilance.';
  }

  return {
    level: highestLevel,
    score: highestScore,
    summary,
    factors,
    affectedActivities,
    peakPeriod,
    safetyDisclaimer: SAFETY_DISCLAIMER,
    calculatedAt: new Date().toISOString()
  };
}

function evaluateCraneOperations(
  c: CurrentWeather,
  peakGust: number,
  t: RiskThresholds
): ActivityImpact {
  const gust = Math.max(c.windGusts, peakGust);
  if (gust >= t.gustCritical || c.windSpeed >= t.windCritical || c.weatherCode >= 95) {
    return {
      activity: 'Crane Operations',
      riskLevel: 'CRITICAL',
      reason: `Gusts (${Math.round(gust)} km/h) or sustained winds (${Math.round(c.windSpeed)} km/h) exceed safe crane operating parameters.`,
      thresholdDetails: `Limit: ${t.gustHigh}–${t.gustCritical} km/h (Consult crane load chart)`
    };
  }
  if (gust >= t.gustHigh || c.windSpeed >= t.windHigh) {
    return {
      activity: 'Crane Operations',
      riskLevel: 'HIGH',
      reason: `Elevated gusts (${Math.round(gust)} km/h) approaching operational limits. High boom sway and load deflection risk.`,
      thresholdDetails: `Threshold: ${t.gustHigh} km/h`
    };
  }
  if (gust >= t.gustWarning || c.windSpeed >= t.windWarning) {
    return {
      activity: 'Crane Operations',
      riskLevel: 'MODERATE',
      reason: `Moderate gusts (${Math.round(gust)} km/h). Monitor anemometer readings closely.`,
      thresholdDetails: `Warning: ${t.gustWarning} km/h`
    };
  }
  return {
    activity: 'Crane Operations',
    riskLevel: 'LOW',
    reason: `Wind speeds and gusts (${Math.round(gust)} km/h) are within typical baseline margins.`,
    thresholdDetails: `Baseline: < ${t.gustWarning} km/h`
  };
}

function evaluateScaffoldWork(
  c: CurrentWeather,
  peakGust: number,
  t: RiskThresholds
): ActivityImpact {
  const gust = Math.max(c.windGusts, peakGust);
  if (gust >= t.gustCritical || c.weatherCode >= 95) {
    return {
      activity: 'Scaffold Work',
      riskLevel: 'CRITICAL',
      reason: `Severe gusts (${Math.round(gust)} km/h) or storm conditions pose extreme fall hazard and scaffold sheeting overload.`,
      thresholdDetails: `Critical: ${t.gustCritical} km/h`
    };
  }
  if (gust >= t.gustHigh || c.rainAmount >= t.rainAmountWarning) {
    return {
      activity: 'Scaffold Work',
      riskLevel: 'HIGH',
      reason: `High gusts (${Math.round(gust)} km/h) or wet boarding create slip and fall hazards.`,
      thresholdDetails: `Threshold: ${t.gustHigh} km/h`
    };
  }
  if (gust >= t.gustWarning || c.rainProbability >= t.rainProbWarning) {
    return {
      activity: 'Scaffold Work',
      riskLevel: 'MODERATE',
      reason: `Wind gusts (${Math.round(gust)} km/h) require caution with containment sheeting and materials.`,
      thresholdDetails: `Warning: ${t.gustWarning} km/h`
    };
  }
  return {
    activity: 'Scaffold Work',
    riskLevel: 'LOW',
    reason: 'Wind and moisture conditions present low interference to scaffold operations.',
    thresholdDetails: `Baseline: < ${t.gustWarning} km/h`
  };
}

function evaluateRoofWork(
  c: CurrentWeather,
  peakGust: number,
  t: RiskThresholds
): ActivityImpact {
  const gust = Math.max(c.windGusts, peakGust);
  if (gust >= t.gustHigh || c.weatherCode >= 95 || c.rainAmount >= t.rainAmountWarning) {
    return {
      activity: 'Roof Work',
      riskLevel: 'HIGH',
      reason: `High wind gusts (${Math.round(gust)} km/h) or slippery roof surfaces create acute edge-fall hazards.`,
      thresholdDetails: `Threshold: ${t.gustWarning}–${t.gustHigh} km/h`
    };
  }
  if (gust >= t.gustWarning || c.temperature >= t.heatWarning) {
    return {
      activity: 'Roof Work',
      riskLevel: 'MODERATE',
      reason: `Elevated wind gusts or high surface radiant heat on metal roofing.`,
      thresholdDetails: `Warning: ${t.gustWarning} km/h / ${t.heatWarning}°C`
    };
  }
  return {
    activity: 'Roof Work',
    riskLevel: 'LOW',
    reason: 'Favorable conditions with low wind resistance and dry deck surfaces.',
    thresholdDetails: `Baseline: < ${t.gustWarning} km/h`
  };
}

function evaluateWorkingAtHeight(
  c: CurrentWeather,
  peakGust: number,
  t: RiskThresholds
): ActivityImpact {
  const gust = Math.max(c.windGusts, peakGust);
  if (gust >= t.gustCritical || c.weatherCode >= 95) {
    return {
      activity: 'Working at Height (MEWPs / Booms)',
      riskLevel: 'CRITICAL',
      reason: `Elevated platform rated limits threatened by gusts (${Math.round(gust)} km/h).`,
      thresholdDetails: `Limit: ${t.gustHigh}–${t.gustCritical} km/h`
    };
  }
  if (gust >= t.gustHigh) {
    return {
      activity: 'Working at Height (MEWPs / Booms)',
      riskLevel: 'HIGH',
      reason: `Significant wind gust load on elevated work baskets.`,
      thresholdDetails: `Threshold: ${t.gustHigh} km/h`
    };
  }
  if (gust >= t.gustWarning) {
    return {
      activity: 'Working at Height (MEWPs / Booms)',
      riskLevel: 'MODERATE',
      reason: `Platform buffeting possible. Fasten all loose tools and equipment.`,
      thresholdDetails: `Warning: ${t.gustWarning} km/h`
    };
  }
  return {
    activity: 'Working at Height (MEWPs / Booms)',
    riskLevel: 'LOW',
    reason: 'Stable atmospheric conditions within normal operating envelope.',
    thresholdDetails: `Baseline: < ${t.gustWarning} km/h`
  };
}

function evaluateConcreteWorks(
  c: CurrentWeather,
  t: RiskThresholds
): ActivityImpact {
  if (c.rainAmount >= t.rainAmountHigh || c.temperature <= 2 || c.temperature >= t.heatCritical) {
    return {
      activity: 'Concrete Works',
      riskLevel: 'CRITICAL',
      reason: `Rain wash-out risk (${c.rainAmount.toFixed(1)} mm/h) or extreme temperature (${c.temperature.toFixed(1)}°C) impacting hydration & finish.`,
      thresholdDetails: `Rain > ${t.rainAmountHigh}mm or Temp < 3°C / > ${t.heatCritical}°C`
    };
  }
  if (c.rainAmount >= t.rainAmountWarning || c.temperature >= t.heatWarning || c.rainProbability >= t.rainProbHigh) {
    return {
      activity: 'Concrete Works',
      riskLevel: 'HIGH',
      reason: `Elevated chance of precipitation or rapid surface drying / plastic shrinkage cracking.`,
      thresholdDetails: `Rain Prob > ${t.rainProbHigh}% or Temp > ${t.heatWarning}°C`
    };
  }
  if (c.rainProbability >= t.rainProbWarning) {
    return {
      activity: 'Concrete Works',
      riskLevel: 'MODERATE',
      reason: `Moderate rain probability (${Math.round(c.rainProbability)}%). Prepare tarpaulins and surface protection.`,
      thresholdDetails: `Warning: ${t.rainProbWarning}% rain probability`
    };
  }
  return {
    activity: 'Concrete Works',
    riskLevel: 'LOW',
    reason: 'Favorable curing conditions with manageable temperature and dry forecast.',
    thresholdDetails: 'Dry surface conditions'
  };
}

function evaluateExcavation(
  c: CurrentWeather,
  t: RiskThresholds
): ActivityImpact {
  if (c.rainAmount >= t.rainAmountHigh || c.weatherCode >= 95) {
    return {
      activity: 'Excavation & Trenching',
      riskLevel: 'CRITICAL',
      reason: `Heavy water ingress (${c.rainAmount.toFixed(1)} mm/h) threatening sidewall integrity and trench stability.`,
      thresholdDetails: `Rainfall: > ${t.rainAmountHigh} mm/h`
    };
  }
  if (c.rainAmount >= t.rainAmountWarning || c.rainProbability >= t.rainProbHigh) {
    return {
      activity: 'Excavation & Trenching',
      riskLevel: 'HIGH',
      reason: `Active rain or high probability of soil saturation. Monitor shoring and pit dewatering.`,
      thresholdDetails: `Rainfall: > ${t.rainAmountWarning} mm/h`
    };
  }
  if (c.rainProbability >= t.rainProbWarning) {
    return {
      activity: 'Excavation & Trenching',
      riskLevel: 'MODERATE',
      reason: 'Possible rain may soften haul roads and require sump pumps on standby.',
      thresholdDetails: `Rain probability: ${t.rainProbWarning}%`
    };
  }
  return {
    activity: 'Excavation & Trenching',
    riskLevel: 'LOW',
    reason: 'Dry ground conditions with stable soil moisture.',
    thresholdDetails: 'Dry ground'
  };
}

function evaluateLiftingOperations(
  c: CurrentWeather,
  peakGust: number,
  t: RiskThresholds
): ActivityImpact {
  const gust = Math.max(c.windGusts, peakGust);
  if (gust >= t.gustCritical || c.visibility < 1000) {
    return {
      activity: 'Lifting Operations',
      riskLevel: 'CRITICAL',
      reason: `Severe gust load (${Math.round(gust)} km/h) or poor sightlines jeopardize rigging and tag line control.`,
      thresholdDetails: `Critical: ${t.gustCritical} km/h`
    };
  }
  if (gust >= t.gustHigh) {
    return {
      activity: 'Lifting Operations',
      riskLevel: 'HIGH',
      reason: `High gusts (${Math.round(gust)} km/h). Restrict large surface area loads (panels, cladding).`,
      thresholdDetails: `Threshold: ${t.gustHigh} km/h`
    };
  }
  if (gust >= t.gustWarning) {
    return {
      activity: 'Lifting Operations',
      riskLevel: 'MODERATE',
      reason: `Moderate gusts. Ensure tag lines are manned and guide paths are clear.`,
      thresholdDetails: `Warning: ${t.gustWarning} km/h`
    };
  }
  return {
    activity: 'Lifting Operations',
    riskLevel: 'LOW',
    reason: 'Calm or light breeze permitting standard controlled rigging.',
    thresholdDetails: `Baseline: < ${t.gustWarning} km/h`
  };
}

function evaluateOutdoorWork(
  c: CurrentWeather,
  t: RiskThresholds
): ActivityImpact {
  if (c.temperature >= t.heatCritical || c.weatherCode >= 95) {
    return {
      activity: 'General Outdoor Work',
      riskLevel: 'CRITICAL',
      reason: `Extreme heat stress (${c.temperature.toFixed(1)}°C) or lightning hazard requires immediate review of rest rotations.`,
      thresholdDetails: `Heat: >= ${t.heatCritical}°C`
    };
  }
  if (c.temperature >= t.heatWarning || c.uvIndex >= t.uvHigh || c.rainAmount >= t.rainAmountWarning) {
    return {
      activity: 'General Outdoor Work',
      riskLevel: 'HIGH',
      reason: `Elevated heat index, very high UV (${c.uvIndex.toFixed(1)}), or active rain. Enforce hydration and sun protection.`,
      thresholdDetails: `Heat >= ${t.heatWarning}°C or UV >= ${t.uvHigh}`
    };
  }
  if (c.uvIndex >= t.uvWarning || c.windGusts >= t.gustWarning) {
    return {
      activity: 'General Outdoor Work',
      riskLevel: 'MODERATE',
      reason: `High UV index (${c.uvIndex.toFixed(1)}) or breezy conditions requiring standard PPE vigilance.`,
      thresholdDetails: `UV >= ${t.uvWarning}`
    };
  }
  return {
    activity: 'General Outdoor Work',
    riskLevel: 'LOW',
    reason: 'Mild temperature, moderate breeze, safe outdoor conditions.',
    thresholdDetails: 'Comfortable envelope'
  };
}
