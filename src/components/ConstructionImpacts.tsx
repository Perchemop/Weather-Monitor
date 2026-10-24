import React, { useState } from 'react'
import { HardHat, ChevronRight, AlertTriangle, ShieldCheck, ShieldAlert, Zap } from 'lucide-react'
import { ActivityImpact, RiskLevel } from '../types'

interface ConstructionImpactsProps {
  impacts: ActivityImpact[]
}

export const ConstructionImpacts: React.FC<ConstructionImpactsProps> = ({ impacts }) => {
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null)

  if (!impacts || impacts.length === 0) {
    return null
  }

  const getRiskBadge = (level: RiskLevel) => {
    switch (level) {
      case 'CRITICAL':
        return {
          bg: 'bg-red-500/20 text-red-400 border-red-500/40',
          icon: Zap,
          text: 'CRITICAL',
        }
      case 'HIGH':
        return {
          bg: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
          icon: ShieldAlert,
          text: 'HIGH',
        }
      case 'MODERATE':
        return {
          bg: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
          icon: AlertTriangle,
          text: 'MODERATE',
        }
      case 'LOW':
      default:
        return {
          bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
          icon: ShieldCheck,
          text: 'LOW',
        }
    }
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <HardHat className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
            CONSTRUCTION ACTIVITY RISK MATRIX
          </h3>
        </div>
        <span className="text-xs font-mono text-slate-400">Deterministic Rule Engine</span>
      </div>

      {/* Grid of activities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {impacts.map((act) => {
          const badge = getRiskBadge(act.riskLevel)
          const Icon = badge.icon
          const isSelected = selectedActivity === act.activity

          return (
            <div
              key={act.activity}
              className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-800 border-amber-500/50 shadow-sm'
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
              }`}
              onClick={() => setSelectedActivity(isSelected ? null : act.activity)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-7 h-7 rounded flex items-center justify-center shrink-0 border ${badge.bg}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-slate-200 truncate">{act.activity}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded border uppercase ${badge.bg}`}
                  >
                    {badge.text}
                  </span>
                  <ChevronRight
                    className={`w-4 h-4 text-slate-500 transition-transform ${
                      isSelected ? 'rotate-90 text-amber-400' : ''
                    }`}
                  />
                </div>
              </div>

              {/* Rationale & Details */}
              <div className="mt-2.5 text-xs text-slate-400 pl-9 leading-relaxed">
                <p>{act.reason}</p>
                {isSelected && (
                  <div className="mt-2 pt-2 border-t border-slate-700/60 text-[11px] font-mono text-slate-300">
                    <span className="text-amber-400 font-semibold">Configured Criteria:</span>{' '}
                    {act.thresholdDetails}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
