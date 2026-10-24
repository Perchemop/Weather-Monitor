/**
 * Screen Wake Lock helper ("keep the tab awake").
 *
 * While the operator is monitoring the dashboard we can ask the browser to keep
 * the display from sleeping so a phone/tablet left on a site desk keeps showing
 * live conditions. The browser silently releases the lock whenever the tab is
 * backgrounded (and on some platforms when the screen is locked), so we
 * transparently re-acquire it when the page becomes visible again.
 *
 * This is entirely optional and a graceful no-op where the Screen Wake Lock API
 * is unsupported (e.g. older iOS Safari). It never blocks monitoring: alerts and
 * notifications continue regardless of whether the wake lock was granted.
 */

interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
  addEventListener?: (type: string, listener: () => void) => void
}

const STORAGE_KEY = 'cwm.keepAwake'

let sentinel: WakeLockSentinelLike | null = null
let desired = false
let lifecycleBound = false
const listeners = new Set<(active: boolean) => void>()

export function wakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

/** Reads the operator's persisted preference (survives reloads). */
export function keepAwakePreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function persist(value: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    /* storage unavailable — preference stays in-memory only */
  }
}

function emit(): void {
  const active = isActive()
  for (const listener of listeners) {
    try {
      listener(active)
    } catch {
      /* listener errors must never break the wake lock */
    }
  }
}

/** True while the screen wake lock is actually held by this page. */
export function isActive(): boolean {
  return Boolean(sentinel && !sentinel.released)
}

/** Subscribe to lock acquisition/release changes. Returns an unsubscribe fn. */
export function onWakeLockChange(listener: (active: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function acquire(): Promise<void> {
  if (!wakeLockSupported() || !desired || isActive()) return
  try {
    const nav = navigator as Navigator & {
      wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
    }
    sentinel = await nav.wakeLock.request('screen')
    sentinel.addEventListener?.('release', () => {
      sentinel = null
      emit()
      // The OS may release the lock on its own; re-acquire if still wanted and
      // the page is visible.
      if (desired && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void acquire()
      }
    })
    emit()
  } catch {
    sentinel = null
    emit()
  }
}

async function release(): Promise<void> {
  const current = sentinel
  sentinel = null
  try {
    await current?.release()
  } catch {
    /* already released */
  }
  emit()
}

function bindLifecycle(): void {
  if (lifecycleBound || typeof document === 'undefined') return
  lifecycleBound = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && desired) void acquire()
  })
}

/** Turns "keep screen awake" on/off and persists the preference. */
export async function setKeepAwake(on: boolean): Promise<void> {
  desired = on
  persist(on)
  bindLifecycle()
  if (on) await acquire()
  else await release()
}

/** Re-applies the persisted preference. Safe to call once on startup. */
export async function initKeepAwake(): Promise<void> {
  desired = keepAwakePreference()
  bindLifecycle()
  if (desired) await acquire()
}
