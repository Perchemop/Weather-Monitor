/**
 * State-stability helpers.
 *
 * Polling UIs receive freshly deserialised payloads on every tick (`res.json()`
 * always allocates new objects/arrays). Feeding those straight into React state
 * churns references, which re-renders whole subtrees, invalidates memoised
 * children and can even re-trigger effects that depend on the value — the root
 * cause of the dashboard's render/poll feedback loop.
 *
 * `setStateIfChanged` keeps the *previous* reference whenever the incoming
 * payload is structurally identical, so React bails out of the update.
 */
import type { Dispatch, SetStateAction } from 'react';

/** Structural (deep) equality. Uses JSON semantics, which is sufficient for the
 *  plain JSON payloads exchanged with the API and the in-browser backend. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Applies `next` only when it differs from the current value, preserving the
 *  existing reference (and therefore avoiding a needless re-render). */
export function setStateIfChanged<T>(setter: Dispatch<SetStateAction<T>>, next: T): void {
  setter((prev) => (deepEqual(prev, next) ? prev : next));
}
