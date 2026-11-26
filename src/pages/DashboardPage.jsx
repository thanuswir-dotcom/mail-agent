import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Briefcase, ShieldCheck, Sparkles, Wand2 } from 'lucide-react'
import { api, extractApiError } from '../api/client'
import { EmailPreviewCard } from '../components/EmailPreviewCard'
import { ExecutionTrace } from '../components/ExecutionTrace'
import { Navbar } from '../components/Navbar'
import { PlanEditor } from '../components/PlanEditor'
import { StatusBadge } from '../components/StatusBadge'
import { VoiceMicButton, VoiceSpeakButton } from '../components/VoiceControls'
import { useAuth } from '../context/useAuth'
import { useVoiceAssistant } from '../hooks/useVoiceAssistant'

const SAMPLE_GOALS = [
  'Send a friendly hi letter to my friend kethireddybhuvana69@gmail.com asking how her weekend is going.',
  'Find Sarah from Design in my contacts, check my Google Calendar availability tomorrow afternoon, and draft an email inviting her to a 30-minute UI review.',
  'Look up Marcus in engineering and draft a concise status check-in email asking for an API deployment update.',
]

export function DashboardPage() {
  const { user, integrations, refreshProfile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [goal, setGoal] = useState('')
  const [toneMode, setToneMode] = useState('auto')
  const [currentTask, setCurrentTask] = useState(null)
  const [recentTasks, setRecentTasks] = useState([])

  const [generatingPlan, setGeneratingPlan] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [startingRun, setStartingRun] = useState(false)
  const [stoppingRun, setStoppingRun] = useState(false)
  const [banner, setBanner] = useState(null)

  const {
    speechSupported,
    isListening,
    isSpeaking,
    interimTranscript,
    voiceError,
    startListening,
    speak,
    stopSpeaking,
  } = useVoiceAssistant({
    onTranscript: (spoken) => {
      setGoal((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken))
    },
  })

  const loadRecentTasks = useCallback(async () => {
    try {
      const res = await api.get('/tasks')
      setRecentTasks((res.data.tasks || []).slice(0, 5))
    } catch {
      // Non-fatal
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api
      .get('/tasks')
      .then((res) => {
        if (!cancelled) {
          setRecentTasks((res.data.tasks || []).slice(0, 5))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const taskId = searchParams.get('task')
    if (taskId) {
      api
        .get(`/tasks/${taskId}`)
        .then((res) => {
          if (cancelled) return
          setCurrentTask(res.data.task)
          setGoal(res.data.task.goal || '')
          setToneMode(res.data.task.emailDraft?.toneMode || 'auto')
        })
        .catch((err) => {
          if (cancelled) return
          setBanner({ type: 'error', text: extractApiError(err, 'Could not load selected task.') })
        })
    }

    const googleStatus = searchParams.get('google')
    if (googleStatus === 'connected') {
      Promise.resolve().then(() => {
        if (cancelled) return
        setBanner({ type: 'success', text: 'Google account connected for Gmail & Google Calendar.' })
        refreshProfile()
        const next = new URLSearchParams(searchParams)
        next.delete('google')
        setSearchParams(next, { replace: true })
      })
    } else if (googleStatus === 'error') {
      const reason = searchParams.get('reason') || 'OAuth authorization failed'
      Promise.resolve().then(() => {
        if (cancelled) return
        setBanner({ type: 'error', text: `Google connection failed: ${reason}` })
        const next = new URLSearchParams(searchParams)
        next.delete('google')
        next.delete('reason')
        setSearchParams(next, { replace: true })
      })
    }

    return () => {
      cancelled = true
    }
  }, [searchParams, refreshProfile, setSearchParams])

  // Poll live execution trace while agent is running
  useEffect(() => {
    if (!currentTask?._id || currentTask.status !== 'running') {
      return undefined
    }

    const timer = setInterval(async () => {
      try {
        const res = await api.get(`/tasks/${currentTask._id}`)
        const updated = res.data.task
        setCurrentTask(updated)
        if (updated.status !== 'running') {
          loadRecentTasks()
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 800)

    return () => clearInterval(timer)
  }, [currentTask?._id, currentTask?.status, loadRecentTasks])

  const handleGeneratePlan = async (e) => {
    e.preventDefault()
    if (!goal.trim()) return
    setBanner(null)
    setGeneratingPlan(true)
    try {
      const res = await api.post('/tasks/plan', { goal: goal.trim(), toneMode })
      setCurrentTask(res.data.task)
      setSearchParams({ task: res.data.task._id }, { replace: true })
      loadRecentTasks()
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err, 'Failed to generate task plan.') })
    } finally {
      setGeneratingPlan(false)
    }
  }

  const handleSavePlan = async (steps) => {
    if (!currentTask?._id) return
    setSavingPlan(true)
    setBanner(null)
    try {
      const res = await api.patch(`/tasks/${currentTask._id}/plan`, { plan: steps })
      setCurrentTask(res.data.task)
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err, 'Failed to update task plan.') })
      throw err
    } finally {
      setSavingPlan(false)
    }
  }

  const handleRunAgent = async () => {
    if (!currentTask?._id) return
    setStartingRun(true)
    setBanner(null)
    try {
      const res = await api.post(`/tasks/${currentTask._id}/run`)
      setCurrentTask(res.data.task)
      loadRecentTasks()
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err, 'Failed to start agent.') })
    } finally {
      setStartingRun(false)
    }
  }

  const handleStopAgent = async () => {
    if (!currentTask?._id) return
    setStoppingRun(true)
    try {
      const res = await api.post(`/tasks/${currentTask._id}/stop`)
      setCurrentTask(res.data.task)
      loadRecentTasks()
    } catch (err) {
      setBanner({ type: 'error', text: extractApiError(err, 'Failed to stop agent.') })
    } finally {
      setStoppingRun(false)
    }
  }

  const handleSaveDraft = async (draftPayload) => {
    if (!currentTask?._id) return
    const res = await api.patch(`/tasks/${currentTask._id}/draft`, draftPayload)
    setCurrentTask(res.data.task)
    loadRecentTasks()
  }

  const handleApproveAndSend = async (payload) => {
    if (!currentTask?._id) return
    const res = await api.post(`/tasks/${currentTask._id}/approve-send`, payload)
    const updatedTask = res.data.task
    setCurrentTask(updatedTask)
    const previewUrl = updatedTask.emailDraft?.previewUrl
    setBanner({
      type: 'success',
      text: previewUrl
        ? `Email approved and sent to ${updatedTask.emailDraft?.recipientEmail} via Sandbox SMTP.`
        : `Email approved and sent to ${updatedTask.emailDraft?.recipientEmail}.`,
      previewUrl: previewUrl || '',
    })
    loadRecentTasks()
  }

  const handleRejectDraft = async () => {
    if (!currentTask?._id) return
    const res = await api.post(`/tasks/${currentTask._id}/reject-draft`)
    setCurrentTask(res.data.task)
    loadRecentTasks()
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6 flex-1">
        {!integrations.geminiConfigured && (
          <div
            role="status"
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-sm text-amber-800 dark:text-amber-200"
          >
            <strong>Backend setup note:</strong> Add your <code>GEMINI_API_KEY</code> in{' '}
            <code>server/.env</code> and restart the backend server to enable Gemini planning and function calling.
          </div>
        )}

        {banner && (
          <div
            role={banner.type === 'error' ? 'alert' : 'status'}
            className={`rounded-xl border p-3.5 text-sm flex flex-wrap items-center justify-between gap-2 ${
              banner.type === 'error'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            <span>{banner.text}</span>
            {banner.previewUrl && (
              <a
                href={banner.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline"
              >
                Open Sent Email Preview
              </a>
            )}
          </div>
        )}

        {/* Goal Composer */}
        <section
          aria-labelledby="goal-composer-heading"
          className="mp-card p-5 sm:p-6 relative overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 mb-1.5">
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                <span>AI Email Command Center · Voice &amp; Tone Aware</span>
              </div>
              <h1 id="goal-composer-heading" className="text-xl font-bold tracking-tight">
                Email Goal Workspace
              </h1>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Type or dictate your goal in plain English, pick Official (zero emojis) or Unofficial mode, and review every draft before sending.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <VoiceMicButton
                isListening={isListening}
                onClick={startListening}
                supported={speechSupported}
                label="Dictate Goal"
                stopLabel="Stop Mic"
                size="sm"
              />
              {goal.trim() && (
                <VoiceSpeakButton
                  isSpeaking={isSpeaking}
                  onSpeak={() => speak(goal)}
                  onStop={stopSpeaking}
                  label="Read Goal"
                  size="sm"
                />
              )}
              {currentTask && <StatusBadge status={currentTask.status} />}
            </div>
          </div>

          {voiceError && (
            <div
              role="alert"
              className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-800 dark:text-amber-200"
            >
              {voiceError}
            </div>
          )}

          {isListening && (
            <div className="mb-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3.5 py-2 text-xs text-blue-800 dark:text-blue-200 flex items-center justify-between gap-2">
              <span>
                <strong>Listening:</strong>{' '}
                {interimTranscript || 'Speak your email goal clearly into your microphone...'}
              </span>
              <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            </div>
          )}

          <form onSubmit={handleGeneratePlan} className="space-y-4">
            <div>
              <label htmlFor="goal-input" className="block text-xs font-semibold mb-1.5">
                Plain-English Email Goal <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="goal-input"
                name="goal"
                rows={3}
                required
                minLength={5}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g., Find Sarah from Design in my contacts, check my calendar availability tomorrow afternoon, and draft a 30-min sync invite."
                className="mp-input"
              />
            </div>

            {/* Official vs Unofficial Columns */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text)]">
                  Output Column Mode
                </span>
                <button
                  type="button"
                  onClick={() => setToneMode('auto')}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition cursor-pointer ${
                    toneMode === 'auto'
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                      : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {toneMode === 'auto' ? 'Auto-Detect Active' : 'Reset to Auto-Detect'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setToneMode('official')}
                  className={`text-left rounded-xl border p-3.5 transition cursor-pointer ${
                    toneMode === 'official'
                      ? 'border-blue-600 bg-blue-500/10 ring-2 ring-blue-500/20'
                      : 'border-[var(--border)] bg-[var(--card-elevated)] hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text)]">
                      <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <span>Official Column</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                      <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                      0 Emojis
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    Formal, executive business formatting with crisp sign-off and zero emojis in subject or body.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setToneMode('unofficial')}
                  className={`text-left rounded-xl border p-3.5 transition cursor-pointer ${
                    toneMode === 'unofficial'
                      ? 'border-pink-500 bg-pink-500/10 ring-2 ring-pink-500/20'
                      : 'border-[var(--border)] bg-[var(--card-elevated)] hover:border-pink-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text)]">
                      <Sparkles className="w-4 h-4 text-pink-600 dark:text-pink-400" aria-hidden="true" />
                      <span>Unofficial Column</span>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-700 dark:text-pink-300 border border-pink-500/25">
                      Warm Emojis ✨
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    Friendly, conversational letter or message for friends and family with expressive emojis.
                  </p>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-[var(--muted)] mr-1">Examples:</span>
                {SAMPLE_GOALS.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setGoal(sample)}
                    className="text-xs px-2.5 py-1 rounded-full border border-[var(--border)] hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Example {idx + 1}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={generatingPlan || currentTask?.status === 'running'}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/25 disabled:opacity-50 cursor-pointer"
              >
                <Wand2 className="w-4 h-4" aria-hidden="true" />
                <span>{generatingPlan ? 'Generating Plan...' : 'Generate Plan'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Active Task Workspace */}
        {currentTask ? (
          <div className="space-y-6">
            <PlanEditor
              key={`${currentTask._id}-${JSON.stringify(currentTask.plan)}`}
              task={currentTask}
              onSavePlan={handleSavePlan}
              onRunAgent={handleRunAgent}
              onStopAgent={handleStopAgent}
              savingPlan={savingPlan}
              startingRun={startingRun}
              stoppingRun={stoppingRun}
            />

            <EmailPreviewCard
              key={`${currentTask._id}-${currentTask.emailDraft?.approvalStatus}-${currentTask.emailDraft?.recipientEmail}-${currentTask.emailDraft?.recipientType}-${currentTask.emailDraft?.subject}-${currentTask.emailDraft?.body}`}
              task={currentTask}
              googleConnected={Boolean(user?.googleConnected)}
              smtpConnected={Boolean(user?.smtpConnected)}
              smtpEmail={user?.smtpEmail || ''}
              onSaveDraft={handleSaveDraft}
              onApproveAndSend={handleApproveAndSend}
              onRejectDraft={handleRejectDraft}
            />

            <ExecutionTrace
              trace={currentTask.trace}
              finalSummary={currentTask.finalSummary}
              error={currentTask.error}
            />
          </div>
        ) : (
          <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center space-y-3">
            <Sparkles className="w-8 h-8 mx-auto text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h2 className="text-base font-semibold">Ready for your first goal</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              Enter a plain-English goal above to generate an editable plan. Make sure you have contacts added under{' '}
              <strong>Contacts</strong> and connect your Google account to create real Gmail drafts and check Calendar availability.
            </p>
            {recentTasks.length > 0 && (
              <div className="pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Recent Tasks
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {recentTasks.map((t) => (
                    <button
                      key={t._id}
                      type="button"
                      onClick={() => setSearchParams({ task: t._id })}
                      className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <span className="max-w-xs truncate">{t.goal}</span>
                      <StatusBadge status={t.status} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
