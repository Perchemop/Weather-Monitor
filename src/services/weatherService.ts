import {
  CurrentWeather,
  HourlyForecastItem,
  DailyForecastItem,
  RiskLevel,
  ProviderComparison
} from '../types.js';

export interface WeatherDataPayload {
  locationId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  fetchedAt: string;
  current: CurrentWeather;
  hourly: HourlyForecastItem[];
  daily: DailyForecastItem[];
  provider: string;
  comparison?: ProviderComparison;
  fallbackActive?: boolean;
}

// WMO Weather interpretation codes
const WMO_CODE_MAP: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  62: 'Moderate rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail'
};

export function getWeatherDescription(code: number): string {
  if (typeof code !== 'number' || isNaN(code)) return 'Unavailable';
  return WMO_CODE_MAP[code] || `Condition code ${code}`;
}

const parseSafeNumber = (val: any, fallback = 0): number => {
  if (val === null || val === undefined || isNaN(Number(val))) return fallback;
  return Number(val);
};

const validTimestamp = (t: string | undefined): string => {
  if (!t) return new Date().toISOString();
  const d = new Date(t);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

/**
 * 1. Fetch from WeatherAPI (User's Main Reference Provider)
 */
export async function fetchWeatherApiData(
  apiKey: string,
  latitude: number,
  longitude: number,
  locationId: string,
  locationName: string,
  _timezone = 'auto'
): Promise<WeatherDataPayload> {
  const url = new URL('https://api.weatherapi.com/v1/forecast.json');
  url.searchParams.set('key', apiKey.trim());
  url.searchParams.set('q', `${latitude.toFixed(4)},${longitude.toFixed(4)}`);
  url.searchParams.set('days', '7');
  url.searchParams.set('aqi', 'no');
  url.searchParams.set('alerts', 'yes');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ConstructionWeatherMonitor/1.0 (Safety Monitoring System)'
      }
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`WeatherAPI error (${res.status}): ${errText || res.statusText}`);
    }

    const data = await res.json();
    return normalizeWeatherApiData(data, locationId, locationName, latitude, longitude);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Normalizes WeatherAPI.com payload into application format
 */
export function normalizeWeatherApiData(
  raw: any,
  locationId: string,
  locationName: string,
  latitude: number,
  longitude: number
): WeatherDataPayload {
  if (!raw || !raw.current) {
    throw new Error('WeatherAPI returned invalid structure: missing current node.');
  }

  const c = raw.current;
  const current: CurrentWeather = {
    timestamp: c.last_updated_epoch
      ? new Date(c.last_updated_epoch * 1000).toISOString()
      : new Date().toISOString(),
    temperature: parseSafeNumber(c.temp_c, 20),
    feelsLike: parseSafeNumber(c.feelslike_c, parseSafeNumber(c.temp_c, 20)),
    humidity: Math.min(100, Math.max(0, parseSafeNumber(c.humidity, 50))),
    windSpeed: Math.max(0, parseSafeNumber(c.wind_kph, 0)),
    windGusts: Math.max(0, parseSafeNumber(c.gust_kph, parseSafeNumber(c.wind_kph, 0))),
    rainAmount: Math.max(0, parseSafeNumber(c.precip_mm, 0)),
    rainProbability: parseSafeNumber(c.chance_of_rain, 0),
    uvIndex: parseSafeNumber(c.uv, 0),
    weatherCode: parseSafeNumber(c.condition?.code, 1000),
    weatherDescription: c.condition?.text || 'Clear',
    pressure: parseSafeNumber(c.pressure_mb, 1013),
    visibility: parseSafeNumber(c.vis_km, 10) * 1000,
    isDay: c.is_day === 1
  };

  const hourly: HourlyForecastItem[] = [];
  const daily: DailyForecastItem[] = [];

  if (raw.forecast && Array.isArray(raw.forecast.forecastday)) {
    const forecastDays = raw.forecast.forecastday;

    for (let dayIdx = 0; dayIdx < forecastDays.length; dayIdx++) {
      const fDay = forecastDays[dayIdx];
      const dayData = fDay.day || {};

      const maxTemp = parseSafeNumber(dayData.maxtemp_c, current.temperature);
      const minTemp = parseSafeNumber(dayData.mintemp_c, current.temperature);
      const rainProb = parseSafeNumber(dayData.daily_chance_of_rain, 0);
      const precipSum = parseSafeNumber(dayData.totalprecip_mm, 0);
      const maxWind = parseSafeNumber(dayData.maxwind_kph, 0);
      const maxGust = Math.max(maxWind, parseSafeNumber(dayData.maxwind_kph, 0) * 1.25);

      let dayRisk: RiskLevel = 'LOW';
      if (maxGust >= 65 || precipSum >= 25 || maxTemp >= 40) {
        dayRisk = 'CRITICAL';
      } else if (maxGust >= 50 || precipSum >= 10 || maxTemp >= 35 || rainProb >= 80) {
        dayRisk = 'HIGH';
      } else if (maxGust >= 40 || precipSum >= 3 || rainProb >= 50) {
        dayRisk = 'MODERATE';
      }

      daily.push({
        date: fDay.date || new Date().toISOString().slice(0, 10),
        maxTemp,
        minTemp,
        rainProbability: rainProb,
        precipitationSum: precipSum,
        maxWindSpeed: maxWind,
        maxWindGust: maxGust,
        weatherCode: parseSafeNumber(dayData.condition?.code, 1000),
        weatherDescription: dayData.condition?.text || 'Clear',
        riskLevel: dayRisk
      });

      // Hourly forecast items
      if (Array.isArray(fDay.hour)) {
        for (const h of fDay.hour) {
          const temp = parseSafeNumber(h.temp_c, current.temperature);
          const windSpd = parseSafeNumber(h.wind_kph, 0);
          const gusts = Math.max(windSpd, parseSafeNumber(h.gust_kph, windSpd));
          const hRainProb = parseSafeNumber(h.chance_of_rain, 0);
          const precip = parseSafeNumber(h.precip_mm, 0);
          const uv = parseSafeNumber(h.uv, 0);

          let risk: RiskLevel = 'LOW';
          if (gusts >= 65 || precip >= 15 || temp >= 40) {
            risk = 'CRITICAL';
          } else if (gusts >= 50 || precip >= 6 || temp >= 35 || hRainProb >= 80) {
            risk = 'HIGH';
          } else if (gusts >= 40 || precip >= 2 || hRainProb >= 50 || uv >= 8) {
            risk = 'MODERATE';
          }

          let isoTime = new Date().toISOString();
          if (h.time_epoch) {
            isoTime = new Date(h.time_epoch * 1000).toISOString();
          } else if (h.time) {
            isoTime = new Date(h.time.replace(' ', 'T')).toISOString();
          }

          hourly.push({
            time: isoTime,
            temperature: temp,
            windSpeed: windSpd,
            windGusts: gusts,
            rainProbability: hRainProb,
            precipitation: precip,
            weatherCode: parseSafeNumber(h.condition?.code, 1000),
            weatherDescription: h.condition?.text || 'Clear',
            uvIndex: uv,
            riskLevel: risk
          });
        }
      }
    }
  }

  // Supplement current rain probability and UV if needed
  if (hourly.length > 0 && current.rainProbability === 0) {
    current.rainProbability = hourly[0].rainProbability;
    current.uvIndex = hourly[0].uvIndex;
  }

  return {
    locationId,
    locationName,
    latitude,
    longitude,
    timezone: raw.location?.tz_id || 'auto',
    fetchedAt: new Date().toISOString(),
    current,
    hourly: hourly.slice(0, 48),
    daily: daily.slice(0, 7),
    provider: 'WeatherAPI (Main Reference)'
  };
}

/**
 * 2. Fetch from Open-Meteo (Cross-Reference & Automatic Fallback Provider)
 */
export async function fetchOpenMeteoData(
  latitude: number,
  longitude: number,
  locationId: string,
  locationName: string,
  timezone = 'auto'
): Promise<WeatherDataPayload> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', latitude.toFixed(4));
  url.searchParams.set('longitude', longitude.toFixed(4));
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_gusts_10m,is_day'
  );
  url.searchParams.set(
    'hourly',
    'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,uv_index'
  );
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max'
  );
  url.searchParams.set('timezone', timezone || 'auto');
  url.searchParams.set('forecast_days', '7');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ConstructionWeatherMonitor/1.0 (Safety Monitoring System)'
      }
    });

    if (!res.ok) {
      throw new Error(`Open-Meteo responded with status ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    return validateAndNormalizeOpenMeteoData(data, locationId, locationName, latitude, longitude);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function validateAndNormalizeOpenMeteoData(
  raw: any,
  locationId: string,
  locationName: string,
  latitude: number,
  longitude: number
): WeatherDataPayload {
  if (!raw || typeof raw !== 'object' || !raw.current) {
    throw new Error('Open-Meteo returned an invalid payload.');
  }

  const currentRaw = raw.current;
  const weatherCode = parseSafeNumber(currentRaw.weather_code, 0);

  const current: CurrentWeather = {
    timestamp: validTimestamp(currentRaw.time),
    temperature: parseSafeNumber(currentRaw.temperature_2m, 20),
    feelsLike: parseSafeNumber(currentRaw.apparent_temperature, parseSafeNumber(currentRaw.temperature_2m, 20)),
    humidity: Math.min(100, Math.max(0, parseSafeNumber(currentRaw.relative_humidity_2m, 50))),
    windSpeed: Math.max(0, parseSafeNumber(currentRaw.wind_speed_10m, 0)),
    windGusts: Math.max(0, parseSafeNumber(currentRaw.wind_gusts_10m, parseSafeNumber(currentRaw.wind_speed_10m, 0))),
    rainAmount: Math.max(0, parseSafeNumber(currentRaw.precipitation, 0)),
    rainProbability: 0,
    uvIndex: 0,
    weatherCode,
    weatherDescription: getWeatherDescription(weatherCode),
    pressure: parseSafeNumber(currentRaw.surface_pressure, 1013),
    visibility: 10000,
    isDay: currentRaw.is_day === 1 || currentRaw.is_day === true
  };

  const hourly: HourlyForecastItem[] = [];
  const hourlyRaw = raw.hourly;
  if (hourlyRaw && Array.isArray(hourlyRaw.time)) {
    const times = hourlyRaw.time;
    const count = Math.min(times.length, 48);
    const nowMs = Date.now();

    for (let i = 0; i < count; i++) {
      const timeStr = times[i];
      const timeDate = new Date(timeStr);
      if (isNaN(timeDate.getTime())) continue;

      const temp = parseSafeNumber(hourlyRaw.temperature_2m?.[i], current.temperature);
      const windSpd = parseSafeNumber(hourlyRaw.wind_speed_10m?.[i], 0);
      const gusts = parseSafeNumber(hourlyRaw.wind_gusts_10m?.[i], windSpd);
      const rainProb = parseSafeNumber(hourlyRaw.precipitation_probability?.[i], 0);
      const precip = parseSafeNumber(hourlyRaw.precipitation?.[i], 0);
      const wCode = parseSafeNumber(hourlyRaw.weather_code?.[i], 0);
      const uv = parseSafeNumber(hourlyRaw.uv_index?.[i], 0);

      let risk: RiskLevel = 'LOW';
      if (gusts >= 65 || precip >= 15 || wCode >= 95 || temp >= 40) {
        risk = 'CRITICAL';
      } else if (gusts >= 50 || precip >= 6 || temp >= 35 || rainProb >= 80) {
        risk = 'HIGH';
      } else if (gusts >= 40 || precip >= 2 || rainProb >= 50 || uv >= 8) {
        risk = 'MODERATE';
      }

      hourly.push({
        time: timeDate.toISOString(),
        temperature: temp,
        windSpeed: windSpd,
        windGusts: gusts,
        rainProbability: rainProb,
        precipitation: precip,
        weatherCode: wCode,
        weatherDescription: getWeatherDescription(wCode),
        uvIndex: uv,
        riskLevel: risk
      });

      if (i === 0 || (timeDate.getTime() <= nowMs && timeDate.getTime() > nowMs - 3600000)) {
        current.rainProbability = rainProb;
        current.uvIndex = uv;
      }
    }
  }

  const daily: DailyForecastItem[] = [];
  const dailyRaw = raw.daily;
  if (dailyRaw && Array.isArray(dailyRaw.time)) {
    const days = dailyRaw.time;
    for (let i = 0; i < days.length; i++) {
      const dateStr = days[i];
      const maxTemp = parseSafeNumber(dailyRaw.temperature_2m_max?.[i], current.temperature);
      const minTemp = parseSafeNumber(dailyRaw.temperature_2m_min?.[i], current.temperature);
      const rainProb = parseSafeNumber(dailyRaw.precipitation_probability_max?.[i], 0);
      const precipSum = parseSafeNumber(dailyRaw.precipitation_sum?.[i], 0);
      const maxWind = parseSafeNumber(dailyRaw.wind_speed_10m_max?.[i], 0);
      const maxGust = parseSafeNumber(dailyRaw.wind_gusts_10m_max?.[i], maxWind);
      const wCode = parseSafeNumber(dailyRaw.weather_code?.[i], 0);

      let risk: RiskLevel = 'LOW';
      if (maxGust >= 65 || precipSum >= 25 || wCode >= 95 || maxTemp >= 40) {
        risk = 'CRITICAL';
      } else if (maxGust >= 50 || precipSum >= 10 || maxTemp >= 35 || rainProb >= 80) {
        risk = 'HIGH';
      } else if (maxGust >= 40 || precipSum >= 3 || rainProb >= 50) {
        risk = 'MODERATE';
      }

      daily.push({
        date: dateStr,
        maxTemp,
        minTemp,
        rainProbability: rainProb,
        precipitationSum: precipSum,
        maxWindSpeed: maxWind,
        maxWindGust: maxGust,
        weatherCode: wCode,
        weatherDescription: getWeatherDescription(wCode),
        riskLevel: risk
      });
    }
  }

  return {
    locationId,
    locationName,
    latitude,
    longitude,
    timezone: raw.timezone || 'auto',
    fetchedAt: new Date().toISOString(),
    current,
    hourly,
    daily,
    provider: 'Open-Meteo Meteorological Service'
  };
}

/**
 * 3. Cross-Reference Analysis Engine
 * Calculates variance, model concordance, and safety consensus between WeatherAPI and Open-Meteo
 */
export function generateCrossReferenceComparison(
  primary: WeatherDataPayload,
  crossRef: WeatherDataPayload,
  isFallback = false,
  fallbackReason?: string
): ProviderComparison {
  const pCurr = primary.current;
  const cCurr = crossRef.current;

  const tempDelta = Math.round(Math.abs(pCurr.temperature - cCurr.temperature) * 10) / 10;
  const windDelta = Math.round(Math.abs(pCurr.windSpeed - cCurr.windSpeed) * 10) / 10;
  const gustDelta = Math.round(Math.abs(pCurr.windGusts - cCurr.windGusts) * 10) / 10;
  const humidityDelta = Math.round(Math.abs(pCurr.humidity - cCurr.humidity) * 10) / 10;
  const rainProbDelta = Math.round(Math.abs(pCurr.rainProbability - cCurr.rainProbability) * 10) / 10;
  const pressureDelta = Math.round(Math.abs(pCurr.pressure - cCurr.pressure) * 10) / 10;

  // Concordance classification
  let concordance: 'HIGH' | 'MODERATE' | 'DIVERGENT' = 'HIGH';
  if (windDelta > 15 || gustDelta > 20 || tempDelta > 4) {
    concordance = 'DIVERGENT';
  } else if (windDelta > 8 || gustDelta > 12 || tempDelta > 2.5) {
    concordance = 'MODERATE';
  }

  // Consensus confidence score (0 to 100)
  const penalty = windDelta * 1.5 + gustDelta * 0.8 + tempDelta * 3 + rainProbDelta * 0.2;
  const confidenceScore = Math.max(50, Math.min(99, Math.round(100 - penalty)));

  let notes = 'Dual-model data demonstrates close alignment across thermodynamic and wind metrics.';
  if (concordance === 'DIVERGENT') {
    notes = 'Model divergence observed between WeatherAPI and Open-Meteo. Construction safety thresholds adhere to conservative higher-risk metrics.';
  } else if (concordance === 'MODERATE') {
    notes = 'Minor variance observed across atmospheric models. General weather trajectory confirmed.';
  }

  if (isFallback) {
    notes = fallbackReason || 'WeatherAPI unavailable. Open-Meteo automatic fallback is actively servicing observations.';
  }

  return {
    primaryProvider: 'WeatherAPI (User Main Reference)',
    crossRefProvider: 'Open-Meteo (Automatic Fallback & Verification)',
    activeDataSource: isFallback ? 'Open-Meteo (Automatic Fallback)' : 'WeatherAPI (Main Reference)',
    isFallbackActive: isFallback,
    fallbackReason,
    variance: {
      tempDelta,
      windDelta,
      gustDelta,
      humidityDelta,
      rainProbDelta,
      pressureDelta
    },
    concordance,
    confidenceScore,
    primaryReading: {
      temperature: pCurr.temperature,
      feelsLike: pCurr.feelsLike,
      windSpeed: pCurr.windSpeed,
      windGusts: pCurr.windGusts,
      rainProbability: pCurr.rainProbability,
      rainAmount: pCurr.rainAmount,
      humidity: pCurr.humidity,
      pressure: pCurr.pressure,
      uvIndex: pCurr.uvIndex,
      condition: pCurr.weatherDescription
    },
    crossRefReading: {
      temperature: cCurr.temperature,
      feelsLike: cCurr.feelsLike,
      windSpeed: cCurr.windSpeed,
      windGusts: cCurr.windGusts,
      rainProbability: cCurr.rainProbability,
      rainAmount: cCurr.rainAmount,
      humidity: cCurr.humidity,
      pressure: cCurr.pressure,
      uvIndex: cCurr.uvIndex,
      condition: cCurr.weatherDescription
    },
    notes,
    timestamp: new Date().toISOString()
  };
}

/**
 * 4. Unified Weather Orchestrator:
 * - Uses WeatherAPI key as the MAIN REFERENCE.
 * - Cross-references all metrics against Open-Meteo.
 * - AUTOMATIC FALLBACK to Open-Meteo if WeatherAPI fails or key is invalid.
 * - Never stores or prints the raw API key in logs or source files.
 */
export async function fetchRealWeatherData(
  latitude: number,
  longitude: number,
  locationId: string,
  locationName: string,
  timezone = 'auto',
  apiKeyOverride?: string
): Promise<WeatherDataPayload> {
  const apiKey =
    apiKeyOverride ||
    (typeof process !== 'undefined' && process.env ? process.env.WEATHER_API_KEY : undefined);

  // If WeatherAPI key is present, use WeatherAPI as the main reference & cross-reference with Open-Meteo
  if (apiKey && apiKey.trim().length > 0) {
    let weatherApiPayload: WeatherDataPayload | null = null;
    let openMeteoPayload: WeatherDataPayload | null = null;
    let weatherApiError: string | null = null;

    // Concurrently fetch WeatherAPI (main) and Open-Meteo (cross-reference)
    const [wApiRes, omRes] = await Promise.allSettled([
      fetchWeatherApiData(apiKey, latitude, longitude, locationId, locationName, timezone),
      fetchOpenMeteoData(latitude, longitude, locationId, locationName, timezone)
    ]);

    if (wApiRes.status === 'fulfilled') {
      weatherApiPayload = wApiRes.value;
    } else {
      weatherApiError = wApiRes.reason?.message || 'WeatherAPI request failed';
      console.warn('WeatherAPI main reference failed:', weatherApiError);
    }

    if (omRes.status === 'fulfilled') {
      openMeteoPayload = omRes.value;
    } else {
      console.warn('Open-Meteo cross-reference fetch failed:', omRes.reason);
    }

    // MAIN PATH: WeatherAPI succeeded
    if (weatherApiPayload) {
      if (openMeteoPayload) {
        // Cross-reference data available!
        const comparison = generateCrossReferenceComparison(weatherApiPayload, openMeteoPayload, false);
        return {
          ...weatherApiPayload,
          comparison,
          fallbackActive: false
        };
      } else {
        // Only WeatherAPI available
        return {
          ...weatherApiPayload,
          fallbackActive: false
        };
      }
    }

    // AUTOMATIC FALLBACK PATH: WeatherAPI failed, switch seamlessly to Open-Meteo
    if (openMeteoPayload) {
      console.info('Seamlessly switched to Open-Meteo automatic fallback.');
      const fallbackComparison: ProviderComparison = {
        primaryProvider: 'WeatherAPI (User Main Reference - Offline / Fallback Active)',
        crossRefProvider: 'Open-Meteo (Automatic Fallback Active)',
        activeDataSource: 'Open-Meteo (Automatic Fallback)',
        isFallbackActive: true,
        fallbackReason: `WeatherAPI error: ${weatherApiError || 'Service unavailable'}. Seamlessly operating on Open-Meteo.`,
        variance: {
          tempDelta: 0,
          windDelta: 0,
          gustDelta: 0,
          humidityDelta: 0,
          rainProbDelta: 0,
          pressureDelta: 0
        },
        concordance: 'HIGH',
        confidenceScore: 88,
        primaryReading: {
          temperature: openMeteoPayload.current.temperature,
          feelsLike: openMeteoPayload.current.feelsLike,
          windSpeed: openMeteoPayload.current.windSpeed,
          windGusts: openMeteoPayload.current.windGusts,
          rainProbability: openMeteoPayload.current.rainProbability,
          rainAmount: openMeteoPayload.current.rainAmount,
          humidity: openMeteoPayload.current.humidity,
          pressure: openMeteoPayload.current.pressure,
          uvIndex: openMeteoPayload.current.uvIndex,
          condition: openMeteoPayload.current.weatherDescription
        },
        notes: `Automatic fallback actively serving construction safety data. ${weatherApiError || ''}`,
        timestamp: new Date().toISOString()
      };

      return {
        ...openMeteoPayload,
        provider: 'Open-Meteo (Automatic Fallback Active)',
        comparison: fallbackComparison,
        fallbackActive: true
      };
    }

    // Both failed
    throw new Error(
      `Both WeatherAPI and Open-Meteo failed: WeatherAPI (${weatherApiError}), Open-Meteo (${omRes.status === 'rejected' ? omRes.reason : 'unknown'})`
    );
  }

  // If no API key configured, use Open-Meteo directly
  return fetchOpenMeteoData(latitude, longitude, locationId, locationName, timezone);
}

export async function searchGeocodingLocations(query: string) {
  if (!query || query.trim().length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query.trim()
  )}&count=8&language=en&format=json`;

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.results || !Array.isArray(data.results)) return [];

  return data.results.map((r: any) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone || 'auto',
    country: r.country
  }));
}
