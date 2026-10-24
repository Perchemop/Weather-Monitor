/**
 * Pure helpers for the rain-accumulation layer on the weather map.
 *
 * Kept free of React/DOM so the window arithmetic (past vs next, boundaries,
 * sparse data) can be unit tested directly.
 */

export type RainDirection = 'past' | 'next'

/**
 * Sums hourly precipitation (mm/h buckets) over an accumulation window.
 *
 * - `next`: the current hour plus the following `hours - 1` buckets — i.e. a
 *   forecast total for the coming window.
 * - `past`: the last `hours` buckets ending with the current (in-progress)
 *   hour — i.e. how much has already fallen.
 *
 * Missing/non-numeric entries are treated as 0. Negative values are clamped to
 * 0 and the result is never negative.
 */
export function sumPrecipitationWindow(
  hourlyPrecip: readonly number[],
  startHourIdx: number,
  hours: number,
  direction: RainDirection,
): number {
  if (!Array.isArray(hourlyPrecip) || hourlyPrecip.length === 0 || hours <= 0) {
    return 0
  }

  const start = Math.max(0, Math.floor(startHourIdx))
  const window = Math.max(0, Math.floor(hours))

  let from: number
  let to: number // exclusive
  if (direction === 'next') {
    from = start
    to = start + window
  } else {
    from = Math.max(0, start - window + 1)
    to = start + 1
  }

  let sum = 0
  const end = Math.min(hourlyPrecip.length, to)
  for (let i = from; i < end; i++) {
    const v = hourlyPrecip[i]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      sum += v
    }
  }
  return sum
}
