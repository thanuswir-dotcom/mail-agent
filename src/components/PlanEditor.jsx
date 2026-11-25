import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
} from 'lucide-react'
import { StatusBadge } from './StatusBadge'

const TOOL_OPTIONS = [
  { value: 'find_contacts', label: 'Contacts Lookup (find_contacts)' },
  {
    value: 'check_calendar_availability',
    label: 'Google Calendar (check_calendar_availability)',
  },
  { value: 'create_email_draft', label: 'Gmail Draft (create_email_draft)' },
  { value: 'reasoning', label: 'Agent Reasoning' },
]

export function PlanEditor({
  task,
  onSavePlan,
  onRunAgent,
  onStopAgent,
  savingPlan,
  startingRun,
  stoppingRun,
}) {
  const [steps, setSteps] = useState(task?.plan || [])
  const [dirty, setDirty] = useState(false)

  const isRunning = task?.status === 'running'

  const updateStep = (index, field, value) => {
    setSteps((prev) =>
      prev.map((step, idx) => (idx === index ? { ...step, [field]: value } : step))
    )
    setDirty(true)
  }

  const moveStep = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= steps.length) return
    setSteps((prev) => {
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
    setDirty(true)
  }

  const removeStep = (index) => {
    if (steps.length <= 1) return
    setSteps((prev) => prev.filter((_, idx) => idx !== index))
    setDirty(true)
  }

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        id: `step-${Date.now()}`,
        title: 'New agent step',
        description: '',
        toolHint: 'reasoning',
        status: 'pending',
      },
    ])
    setDirty(true)
  }

  const handleSave = async () => {
    await onSavePlan(steps)
    setDirty(false)
  }

  const handleRun = async () => {
    try {
      if (dirty) {
        await onSavePlan(steps)
        setDirty(false)
      }
      await onRunAgent()
    } catch {
      // Error banner is handled by parent
    }
  }

  return (
    <section
      aria-labelledby="plan-editor-heading"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 id="plan-editor-heading" className="text-base font-semibold">
            Editable Task Plan
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Review, edit, reorder, or add steps before running the Gemini tool-using agent.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isRunning ? (
            <>
              <button
                type="button"
                onClick={addStep}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Step</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={savingPlan || !dirty}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{savingPlan ? 'Saving...' : 'Save Plan'}</span>
              </button>
              <button
                type="button"
                onClick={handleRun}
                disabled={startingRun || steps.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {startingRun
                    ? 'Starting...'
                    : task?.status === 'completed' || task?.status === 'failed'
                    ? 'Re-run Agent'
                    : 'Run Agent'}
                </span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStopAgent}
              disabled={stoppingRun}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
              <span>{stoppingRun ? 'Stopping...' : 'Stop Agent'}</span>
            </button>
          )}
        </div>
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li
            key={step.id || index}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3.5 space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center">
                  {index + 1}
                </span>
                <StatusBadge status={step.status} />
              </div>

              {!isRunning && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveStep(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move step ${index + 1} up`}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(index, 1)}
                    disabled={index === steps.length - 1}
                    aria-label={`Move step ${index + 1} down`}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    disabled={steps.length <= 1}
                    aria-label={`Remove step ${index + 1}`}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/10 disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div className="md:col-span-2">
                <label
                  htmlFor={`step-title-${index}`}
                  className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                >
                  Step title
                </label>
                <input
                  id={`step-title-${index}`}
                  type="text"
                  value={step.title}
                  disabled={isRunning}
                  onChange={(e) => updateStep(index, 'title', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor={`step-tool-${index}`}
                  className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                >
                  Suggested tool
                </label>
                <select
                  id={`step-tool-${index}`}
                  value={step.toolHint || 'reasoning'}
                  disabled={isRunning}
                  onChange={(e) => updateStep(index, 'toolHint', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm disabled:opacity-60"
                >
                  {TOOL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor={`step-desc-${index}`}
                className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
              >
                Instructions / details
              </label>
              <input
                id={`step-desc-${index}`}
                type="text"
                value={step.description || ''}
                disabled={isRunning}
                onChange={(e) => updateStep(index, 'description', e.target.value)}
                placeholder="Optional step instructions for the agent..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm disabled:opacity-60"
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
