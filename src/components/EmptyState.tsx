import React from 'react';

type EmptyStateSize = 'default' | 'compact';

interface EmptyStateProps {
  /** Icon rendered in the centred badge. */
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** Renders without outer card chrome, for nesting inside an existing card. */
  nested?: boolean;
  /** `compact` suits inline panels; `default` suits full-width panes. */
  size?: EmptyStateSize;
  className?: string;
}

const SIZES: Record<EmptyStateSize, { pad: string; badge: string; icon: string; title: string; desc: string }> = {
  default: {
    pad: 'p-10 sm:p-12',
    badge: 'w-12 h-12 rounded-2xl',
    icon: 'w-6 h-6',
    title: 'mt-3.5 text-sm font-semibold',
    desc: 'mt-1.5 text-xs'
  },
  compact: {
    pad: 'p-6',
    badge: 'w-9 h-9 rounded-xl',
    icon: 'w-4 h-4',
    title: 'mt-2.5 text-xs font-semibold',
    desc: 'mt-1 text-[11px]'
  }
};

/**
 * Consistent empty state for lists, tables and chart panes: a soft icon badge,
 * a short title and optional supporting copy. Keeps "no data yet" screens
 * looking intentional rather than broken.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  nested,
  size = 'default',
  className
}) => {
  const s = SIZES[size];
  return (
    <div
      className={`${s.pad} text-center ${
        nested ? '' : 'bg-slate-900/80 border border-slate-800/80 rounded-2xl shadow-sm'
      } ${className ?? ''}`}
    >
      <div
        className={`${s.badge} mx-auto flex items-center justify-center bg-slate-950/60 border border-slate-800/80 shadow-sm`}
      >
        <Icon className={`${s.icon} text-slate-500`} />
      </div>
      <div className={`${s.title} tracking-tight text-slate-300`}>{title}</div>
      {description && (
        <div className={`${s.desc} text-slate-500 max-w-md mx-auto leading-relaxed`}>{description}</div>
      )}
    </div>
  );
};

export default EmptyState;
