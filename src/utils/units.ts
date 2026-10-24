/**
 * Unit conversion and formatting utilities for construction weather metrics.
 * Ensures consistent handling of Celsius / Fahrenheit and km/h / mph / m/s
 * according to owner preferences stored in SQLite.
 */

export type TemperatureUnit = 'C' | 'F'
export type WindUnit = 'km/h' | 'mph' | 'm/s'

export function convertTemperature(celsius: number, unit: TemperatureUnit): number {
  if (unit === 'F') {
    return (celsius * 9) / 5 + 32
  }
  return celsius
}

export function convertWind(kmh: number, unit: WindUnit): number {
  if (unit === 'mph') {
    return kmh * 0.621371
  }
  if (unit === 'm/s') {
    return kmh / 3.6
  }
  return kmh
}

export function formatTemperature(
  celsius: number | null | undefined,
  unit: TemperatureUnit = 'C',
  decimals = 0,
): string {
  if (celsius === null || celsius === undefined || isNaN(celsius)) {
    return '--'
  }
  const val = convertTemperature(celsius, unit)
  return `${val.toFixed(decimals)}°${unit}`
}

export function formatWind(kmh: number | null | undefined, unit: WindUnit = 'km/h', decimals = 0): string {
  if (kmh === null || kmh === undefined || isNaN(kmh)) {
    return '--'
  }
  const val = convertWind(kmh, unit)
  return `${val.toFixed(decimals)} ${unit}`
}

export function formatPrecipitation(mm: number | null | undefined, decimals = 1): string {
  if (mm === null || mm === undefined || isNaN(mm)) {
    return '0.0 mm'
  }
  return `${mm.toFixed(decimals)} mm`
}
