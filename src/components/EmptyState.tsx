import React from 'react';

interface EmptyStateProps {
  /** Icon rendered in the centred badge. */
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** Renders without outer card chrome, for nesting inside an existing card. */
  nested?: boolean;
  className?: string;
}

/**
 * Consistent empty state for lists, tables and chart panes: a soft icon badge,
 * a short title and optional supporting copy. Keeps "no data yet" screens
 * looking intentional rather than broken.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, nested, className }) => (
  <div
    className={`p-10 sm:p-12 text-center ${
      nested ? '' : 'bg-slate-900/80 border border-slate-800/80 rounded-2xl shadow-sm'
    } ${className ?? ''}`}
  >
    <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center bg-slate-950/60 border border-slate-800/80 shadow-sm">
      <Icon className="w-6 h-6 text-slate-500" />
    </div>
    <div className="mt-3.5 text-sm font-semibold tracking-tight text-slate-300">{title}</div>
    {description && (
      <div className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto leading-relaxed">{description}</div>
    )}
  </div>
);

export default EmptyState;
