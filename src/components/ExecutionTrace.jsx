import { Activity, AlertTriangle, RefreshCw, ShieldCheck, Terminal, Wrench } from 'lucide-react'
import { StatusBadge } from './StatusBadge'

const TYPE_META = {
  plan: { label: 'Plan', Icon: Activity },
  reasoning: { label: 'Reasoning', Icon: Terminal },
  tool_call: { label: 'Tool Call', Icon: Wrench },
  retry: { label: 'Retry', Icon: RefreshCw },
  fallback: { label: 'Fallback', Icon: AlertTriangle },
  approval: { label: 'Approval', Icon: ShieldCheck },
  error: { label: 'Error', Icon: AlertTriangle },
  system: { label: 'System', Icon: Terminal },
}

function JsonBlock({ label, data }) {
  if (data === null || data === undefined) return null
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </p>
      <pre className="text-xs rounded-lg bg-slate-950 text-slate-100 p-3 overflow-x-auto max-h-56 leading-relaxed">
        {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

export function ExecutionTrace({ trace = [], finalSummary = '', error = '' }) {
  return (
    <section
      aria-labelledby="trace-heading"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h2 id="trace-heading" className="text-base font-semibold">
            Agent Execution Trace
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Live record of plans, Gemini tool selections, validated inputs/outputs, retries, and fallbacks.
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {trace.length} {trace.length === 1 ? 'event' : 'events'}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"
        >
          <strong>Execution stopped/failed:</strong> {error}
        </div>
      )}

      {finalSummary && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm">
          <p className="font-semibold text-emerald-800 dark:text-emerald-200 mb-1">
            Agent Summary
          </p>
          <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{finalSummary}</p>
        </div>
      )}

      {trace.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
          No execution events yet. Click Run Agent to start tool-calling execution.
        </p>
      ) : (
        <ol className="space-y-3">
          {trace.map((item, idx) => {
            const meta = TYPE_META[item.type] || TYPE_META.system
            const TypeIcon = meta.Icon

            return (
              <li
                key={`${item.stepIndex}-${idx}`}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800">
                      #{item.stepIndex}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300">
                      <TypeIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{meta.label}</span>
                    </span>
                    {item.toolName && (
                      <code className="text-xs font-mono px-2 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300">
                        {item.toolName}
                      </code>
                    )}
                    <span className="text-sm font-medium">{item.title}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.attempts > 1 && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        {item.attempts} attempts
                      </span>
                    )}
                    {item.durationMs > 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {item.durationMs}ms
                      </span>
                    )}
                    <StatusBadge status={item.status} />
                  </div>
                </div>

                {item.error && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded-lg px-2.5 py-1.5">
                    Error: {item.error}
                  </p>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <JsonBlock label="Input" data={item.input} />
                  <JsonBlock label="Output" data={item.output} />
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

