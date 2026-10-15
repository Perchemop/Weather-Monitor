import React, { Suspense } from 'react';
import { HardHat } from 'lucide-react';

/**
 * Adapts a lazily-imported module with a named export into a React.lazy
 * component, so heavy views (charts, reports, settings) can be code-split.
 */
export function lazyNamed<T extends Record<string, React.ComponentType<any>>>(
  factory: () => Promise<T>,
  exportName: keyof T
) {
  return React.lazy(async () => {
    const mod = await factory();
    return { default: mod[exportName] };
  });
}

/** Lightweight, on-brand fallback shown while a split view chunk loads. */
export function ViewLoadingFallback({ label = 'Loading module' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 animate-pulse">
          <HardHat className="w-5 h-5" />
        </div>
        <span className="text-xs font-mono text-slate-400 animate-pulse">{label}...</span>
      </div>
    </div>
  );
}

/** Convenience boundary that renders the branded fallback for its subtree. */
export function LazyBoundary({ children, label }: { children: React.ReactNode; label?: string }) {
  return <Suspense fallback={<ViewLoadingFallback label={label} />}>{children}</Suspense>;
}
