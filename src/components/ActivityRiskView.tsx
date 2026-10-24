import React from 'react'
import { AlertTriangle, Clock, ShieldCheck, ShieldAlert, Zap, HardHat } from 'lucide-react'
import { ConstructionImpacts } from './ConstructionImpacts'
import { RiskAssessment, RiskLevel } from '../types'

interface ActivityRiskViewProps {
  risk: RiskAssessment | null
  locationName: string
  isLoading: boolean
}

const LEVEL_STYLES: Record<
  RiskLevel,
  { badge: string; ring: string; label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  CRITICAL: {
    badge: 'bg-red-500/15 text-red-300 border-red-500/40',
    ring: 'ring-red-500/30',
    label: 'Critical',
    icon: Zap,
  },
  HIGH: {
    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
    ring: 'ring-orange-500/30',
    label: 'High',
    icon: ShieldAlert,
  },
  MODERATE: {
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    ring: 'ring-amber-500/30',
    label: 'Moderate',
    icon: AlertTriangle,
  },
  LOW: {
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    ring: 'ring-emerald-500/30',
    label: 'Low',
    icon: ShieldCheck,
  },
}

/**
 * Dedicated page for the construction activity risk matrix.
 *
 * The matrix used to sit on the dashboard; it now lives in its own tab so the
 * monitor view stays focused on headline conditions. The deterministic
 * assessment remains the single source of truth.
 */
export const ActivityRiskView: React.FC<ActivityRiskViewProps> = ({ risk, locationName, isLoading }) => {
  if (isLoading && !risk) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="h-8 w-64 rounded bg-slate-800/60 animate-pulse" />
        <div className="h-28 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
        <div className="h-64 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
      </div>
    )
  }

  if (!risk) {
    return (
      <div className="animate-fadeIn bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-2">
        <HardHat className="w-8 h-8 text-slate-600 mx-auto" />
        <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-300">
          Activity Risk Matrix Unavailable
        </h3>
        <p className="text-xs text-slate-500">
          No deterministic risk assessment is available for {locationName} yet. Run a weather check to
          populate the matrix.
        </p>
      </div>
    )
  }

  const style = LEVEL_STYLES[risk.level] || LEVEL_STYLES.LOW
  const LevelIcon = style.icon
  const elevated = risk.affectedActivities.filter((a) => a.riskLevel === 'HIGH' || a.riskLevel === 'CRITICAL')

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <HardHat className="w-5 h-5 text-amber-400" />
            Activity Risk Matrix
          </h2>
          <p className="text-xs font-mono text-slate-500 mt-0.5">
            {locationName} · Deterministic rule engine (AS 2550.1)
          </p>
        </div>
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ring-1 ${style.badge} ${style.ring}`}
        >
          <LevelIcon className="w-4 h-4" />
          <span className="text-sm font-bold uppercase tracking-wider">{style.label}</span>
          <span className="text-xs font-mono opacity-80">Score {risk.score}/100</span>
        </div>
      </div>

      {/* Headline summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <p className="text-sm text-slate-300 leading-relaxed">{risk.summary}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono text-slate-400 border-t border-slate-800 pt-3">
          <span>
            Activities assessed: <strong className="text-slate-200">{risk.affectedActivities.length}</strong>
          </span>
          <span>
            Elevated (HIGH / CRITICAL):{' '}
            <strong className={elevated.length > 0 ? 'text-orange-400' : 'text-emerald-400'}>
              {elevated.length}
            </strong>
          </span>
          {risk.peakPeriod && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Peak window:{' '}
              <strong className="text-amber-300">
                {risk.peakPeriod.start}–{risk.peakPeriod.end}
              </strong>
            </span>
          )}
          <span>Calculated: {new Date(risk.calculatedAt).toLocaleString()}</span>
        </div>
      </div>

      {/* The matrix itself */}
      <ConstructionImpacts impacts={risk.affectedActivities} />

      {/* Safety disclaimer */}
      <p className="text-[11px] leading-relaxed text-slate-500 font-mono">{risk.safetyDisclaimer}</p>
    </div>
  )
}
