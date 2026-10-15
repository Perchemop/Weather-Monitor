/**
 * Tiny in-memory TTL cache.
 *
 * Used to avoid repeating expensive upstream calls when several callers request
 * the same value within a short window.
 */
export class TtlCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) this.sweep();
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Returns the cached value or computes, stores and returns a fresh one. */
  async wrap(key: string, producer: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await producer();
    this.set(key, value);
    return value;
  }

  clear(): void {
    this.store.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
    // If still full, drop the oldest entries.
    if (this.store.size >= this.maxEntries) {
      const overflow = this.store.size - this.maxEntries + 1;
      let i = 0;
      for (const key of this.store.keys()) {
        if (i++ >= overflow) break;
        this.store.delete(key);
      }
    }
  }
}
