import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, MailCheck, Search, Trash2 } from 'lucide-react'
import { api, extractApiError } from '../api/client'
import { ExecutionTrace } from '../components/ExecutionTrace'
import { Navbar } from '../components/Navbar'
import { StatusBadge } from '../components/StatusBadge'

const STATUS_FILTERS = ['all', 'pending', 'running', 'completed', 'failed']

export function HistoryPage() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const params = statusFilter !== 'all' ? { status: statusFilter } : {}
    api
      .get('/tasks', { params })
      .then((res) => {
        if (cancelled) return
        const list = res.data.tasks || []
        setTasks(list)
        setSelectedTask((prev) => {
          if (!list.length) return null
          if (prev) {
            const match = list.find((t) => t._id === prev._id)
            if (match) return match
          }
          return list[0]
        })
        setError('')
      })
      .catch((err) => {
        if (!cancelled) {
          setError(extractApiError(err, 'Failed to load task history.'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [statusFilter])

  const handleDelete = async (taskId) => {
    try {
      await api.delete(`/tasks/${taskId}`)
      setTasks((prev) => prev.filter((t) => t._id !== taskId))
      if (selectedTask?._id === taskId) {
        setSelectedTask(null)
      }
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete task.'))
    }
  }

  const filteredTasks = tasks.filter((t) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      t.goal?.toLowerCase().includes(q) ||
      t.emailDraft?.recipientEmail?.toLowerCase().includes(q) ||
      t.emailDraft?.subject?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Task History</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Review previous goals, tool traces, drafts, and approval outcomes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize border ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <search>
          <form onSubmit={(e) => e.preventDefault()} className="relative max-w-md">
            <label htmlFor="history-search" className="visually-hidden">
              Search task history
            </label>
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="history-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by goal, recipient, or subject..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3.5 py-2 text-sm"
            />
          </form>
        </search>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"
          >
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500 py-8">Loading task history...</p>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
            No tasks match your current filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-5 space-y-2.5">
              {filteredTasks.map((task) => {
                const isSelected = selectedTask?._id === task._id
                return (
                  <div
                    key={task._id}
                    className={`rounded-xl border p-4 transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-500/5 dark:bg-blue-500/10'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTask(task)}
                        className="text-left font-medium text-sm hover:underline flex-1"
                      >
                        {task.goal}
                      </button>
                      <StatusBadge status={task.status} />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{new Date(task.createdAt).toLocaleString()}</span>
                      <div className="flex items-center gap-2">
                        {task.emailDraft?.approvalStatus === 'approved_and_sent' && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <MailCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            Sent
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard?task=${task._id}`)}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium hover:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Open</span>
                        </button>
                        {task.status !== 'running' && (
                          <button
                            type="button"
                            onClick={() => handleDelete(task._id)}
                            aria-label={`Delete task ${task.goal}`}
                            className="p-1 text-rose-600 hover:bg-rose-500/10 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="lg:col-span-7 space-y-4">
              {selectedTask && (
                <>
                  <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-base font-semibold">Selected Task Details</h2>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={selectedTask.status} />
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard?task=${selectedTask._id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
                        >
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Open in Workspace</span>
                        </button>
                      </div>
                    </div>
                    <p className="text-sm">{selectedTask.goal}</p>

                    {selectedTask.emailDraft?.recipientEmail && (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 text-xs space-y-1">
                        <p>
                          <strong>Recipient:</strong> {selectedTask.emailDraft.recipientName}{' '}
                          &lt;{selectedTask.emailDraft.recipientEmail}&gt;
                        </p>
                        <p>
                          <strong>Subject:</strong> {selectedTask.emailDraft.subject}
                        </p>
                        <p>
                          <strong>Approval Status:</strong> {selectedTask.emailDraft.approvalStatus}
                        </p>
                        <p className="whitespace-pre-wrap pt-1.5 border-t border-slate-200 dark:border-slate-800">
                          {selectedTask.emailDraft.body}
                        </p>
                      </div>
                    )}
                  </section>

                  <ExecutionTrace
                    trace={selectedTask.trace}
                    finalSummary={selectedTask.finalSummary}
                    error={selectedTask.error}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
