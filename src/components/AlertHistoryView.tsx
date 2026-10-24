import React, { useState } from 'react'
import { ShieldAlert, Mail, CheckCircle2, XCircle, Filter, Calendar, Download } from 'lucide-react'
import { AlertItem, AlertDelivery } from '../types'
import { EmptyState } from './EmptyState'

interface AlertHistoryViewProps {
  alerts: AlertItem[]
  deliveries: AlertDelivery[]
}

export const AlertHistoryView: React.FC<AlertHistoryViewProps> = ({ alerts, deliveries }) => {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL')
  const [selectedType, setSelectedType] = useState<string>('ALL')
  const [activeTab, setActiveTab] = useState<'alerts' | 'deliveries'>('alerts')

  const filteredAlerts = alerts.filter((a) => {
    if (selectedSeverity !== 'ALL' && a.severity !== selectedSeverity) return false
    if (selectedType !== 'ALL' && a.alertType !== selectedType) return false
    return true
  })

  const uniqueTypes = Array.from(new Set(alerts.map((a) => a.alertType)))

  const exportCsv = () => {
    if (activeTab === 'alerts') {
      if (filteredAlerts.length === 0) return
      const headers = [
        'ID',
        'Location',
        'Severity',
        'Type',
        'Title',
        'Message',
        'ObservedValue',
        'ThresholdValue',
        'StartTime',
        'Status',
      ]
      const rows = filteredAlerts.map((a) => [
        a.id,
        `"${a.locationName.replace(/"/g, '""')}"`,
        a.severity,
        a.alertType,
        `"${a.title.replace(/"/g, '""')}"`,
        `"${a.message.replace(/"/g, '""')}"`,
        `"${a.observedValue}"`,
        `"${a.thresholdValue}"`,
        a.startTime,
        a.status,
      ])
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `alerts-audit-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } else {
      if (deliveries.length === 0) return
      const headers = ['ID', 'AlertID', 'AlertType', 'Recipient', 'SentAt', 'Status', 'Error']
      const rows = deliveries.map((d) => [
        d.id,
        d.alertId,
        d.alertType,
        d.recipientEmail,
        d.sentAt,
        d.status,
        `"${(d.errorMessage || '').replace(/"/g, '""')}"`,
      ])
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `email-deliveries-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Tab switcher */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-slate-300">
              ALERT EVENT AUDIT & NOTIFICATION HISTORY
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => setActiveTab('alerts')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 outline-none ${
                  activeTab === 'alerts'
                    ? 'bg-slate-800 text-amber-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Alert Events ({alerts.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('deliveries')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 outline-none ${
                  activeTab === 'deliveries'
                    ? 'bg-slate-800 text-amber-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Email Deliveries ({deliveries.length})
              </button>
            </div>

            <button
              type="button"
              id="export-alerts-csv-btn"
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs font-mono font-semibold text-slate-200 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 outline-none"
              title="Download audit as CSV"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        {activeTab === 'alerts' && (
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Filter className="w-3.5 h-3.5" /> Filter by:
            </span>

            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MODERATE">Moderate</option>
              <option value="INFORMATION">Information</option>
            </select>

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">All Alert Types</option>
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <span className="text-slate-500 text-[11px]">Showing {filteredAlerts.length} records</span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {activeTab === 'alerts' ? (
        <div className="space-y-3">
          {filteredAlerts.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No alert records match these filters"
              description="Adjust the severity, type or time range filters above. New alerts will be recorded here as soon as a threshold is breached."
            />
          ) : (
            filteredAlerts.map((alert) => {
              const isCritical = alert.severity === 'CRITICAL'
              const isHigh = alert.severity === 'HIGH'

              return (
                <div
                  key={alert.id}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700/90 transition-all shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          isCritical
                            ? 'bg-red-500 text-white'
                            : isHigh
                              ? 'bg-orange-500 text-slate-950'
                              : 'bg-amber-500 text-slate-950'
                        }`}
                      >
                        {alert.severity}
                      </span>
                      <h4 className="font-bold text-slate-100 text-sm">{alert.title}</h4>
                      <span className="text-slate-500 text-xs">•</span>
                      <span className="text-xs text-slate-400">{alert.locationName}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                      <span>{new Date(alert.createdAt).toLocaleString()}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          alert.status === 'ACTIVE'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {alert.status}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">{alert.message}</p>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono text-slate-400">
                    <div>
                      <span className="text-slate-500">Trigger:</span> {alert.triggerCondition}
                    </div>
                    <div>
                      <span className="text-slate-500">Observed:</span> {alert.observedValue}
                    </div>
                    <div>
                      <span className="text-slate-500">Threshold:</span> {alert.thresholdValue}
                    </div>
                    <div>
                      <span className="text-slate-500">Expected:</span> {alert.expectedDuration}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : (
        /* Deliveries Tab */
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl overflow-hidden shadow-md">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h4 className="text-xs font-mono font-bold uppercase text-slate-400">
              SMTP DISPATCH LOG (Stored Locally)
            </h4>
            <span className="text-xs font-mono text-slate-500">Credentials Never Logged</span>
          </div>

          {deliveries.length === 0 ? (
            <EmptyState
              nested
              icon={Mail}
              title="No alert emails dispatched yet"
              description="Successful SMTP deliveries will be logged here when a severe-weather email is sent."
            />
          ) : (
            <div className="divide-y divide-slate-800">
              {deliveries.map((del) => {
                const isSuccess = del.status === 'SUCCESS'
                return (
                  <div
                    key={del.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      {isSuccess ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5 sm:mt-0" />
                      )}
                      <div>
                        <div className="font-bold text-slate-200">{del.alertType} Notification</div>
                        <div className="text-slate-400 text-[11px]">Recipient: {del.recipientEmail}</div>
                        {del.errorMessage && (
                          <div className="text-red-400 text-[11px] mt-0.5">Error: {del.errorMessage}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isSuccess
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {del.status}
                      </span>
                      <span className="text-slate-400">{new Date(del.sentAt).toLocaleString()}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
