/**
 * Timezone and timestamp helpers to ensure local site time is correctly respected
 */

/**
 * Validates whether a timezone identifier is supported by Intl.DateTimeFormat
 */
export function isValidTimezone(tz?: string): boolean {
  if (!tz || tz === 'auto') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a valid IANA timezone string, falling back to UTC if invalid or 'auto'
 */
export function resolveTimezone(tz?: string, fallback = 'UTC'): string {
  if (tz && isValidTimezone(tz)) {
    return tz;
  }
  return fallback;
}

/**
 * Formats an ISO date string into a localized time string according to the target timezone
 */
export function formatLocationTime(
  isoDateString: string,
  timezone?: string,
  options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
): string {
  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return isoDateString;
    const tz = resolveTimezone(timezone);
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: tz }).format(d);
  } catch {
    return new Date(isoDateString).toLocaleTimeString([], options);
  }
}

/**
 * Formats an ISO date string into a localized date string (e.g. "Mon, Oct 12")
 */
export function formatLocationDate(
  isoDateString: string,
  timezone?: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
): string {
  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return isoDateString;
    const tz = resolveTimezone(timezone);
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: tz }).format(d);
  } catch {
    return new Date(isoDateString).toLocaleDateString([], options);
  }
}

/**
 * Formats date and time together with timezone name or abbreviation
 */
export function formatLocationDateTime(
  isoDateString: string,
  timezone?: string,
  includeTzAbbr = true
): string {
  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return isoDateString;
    const tz = resolveTimezone(timezone);
    const datePart = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
      timeZoneName: includeTzAbbr ? 'short' : undefined
    }).format(d);
    return datePart;
  } catch {
    return new Date(isoDateString).toLocaleString();
  }
}

/**
 * Returns the hour (0-23) in the target timezone
 */
export function getLocationHour(isoDateString: string, timezone?: string): number {
  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return 0;
    const tz = resolveTimezone(timezone);
    const hourStr = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: tz
    }).format(d);
    return parseInt(hourStr, 10) || 0;
  } catch {
    return new Date(isoDateString).getHours();
  }
}

/**
 * Calculates observation age in minutes and classifies freshness status
 */
export type DataFreshnessStatus = 'LIVE' | 'CACHED' | 'STALE' | 'OFFLINE' | 'UNAVAILABLE';

export interface FreshnessInfo {
  status: DataFreshnessStatus;
  ageMinutes: number;
  ageLabel: string;
  isStale: boolean;
  formattedLocalTime: string;
}

export function evaluateDataFreshness(
  timestamp?: string,
  timezone?: string,
  isProviderOffline = false
): FreshnessInfo {
  if (!timestamp) {
    return {
      status: 'UNAVAILABLE',
      ageMinutes: -1,
      ageLabel: 'No observation recorded',
      isStale: true,
      formattedLocalTime: 'N/A'
    };
  }

  const obsTime = new Date(timestamp).getTime();
  if (isNaN(obsTime)) {
    return {
      status: 'UNAVAILABLE',
      ageMinutes: -1,
      ageLabel: 'Invalid timestamp',
      isStale: true,
      formattedLocalTime: 'N/A'
    };
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - obsTime);
  const ageMinutes = Math.round(diffMs / (60 * 1000));
  const formattedLocalTime = formatLocationDateTime(timestamp, timezone, true);

  let ageLabel: string;
  if (ageMinutes < 1) {
    ageLabel = 'Just now';
  } else if (ageMinutes === 1) {
    ageLabel = '1 min ago';
  } else if (ageMinutes < 60) {
    ageLabel = `${ageMinutes} mins ago`;
  } else {
    const hours = Math.floor(ageMinutes / 60);
    const remMins = ageMinutes % 60;
    ageLabel = remMins > 0 ? `${hours}h ${remMins}m ago` : `${hours}h ago`;
  }

  if (isProviderOffline) {
    return {
      status: 'OFFLINE',
      ageMinutes,
      ageLabel: `Offline cache (${ageLabel})`,
      isStale: ageMinutes > 30,
      formattedLocalTime
    };
  }

  if (ageMinutes <= 25) {
    return {
      status: 'LIVE',
      ageMinutes,
      ageLabel,
      isStale: false,
      formattedLocalTime
    };
  }

  if (ageMinutes <= 60) {
    return {
      status: 'CACHED',
      ageMinutes,
      ageLabel: `Cached (${ageLabel})`,
      isStale: false,
      formattedLocalTime
    };
  }

  return {
    status: 'STALE',
    ageMinutes,
    ageLabel: `Stale (${ageLabel})`,
    isStale: true,
    formattedLocalTime
  };
}
