import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'

const STYLES = {
  pending: {
    classes: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    Icon: Clock,
    label: 'Pending',
  },
  running: {
    classes: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
    Icon: Loader2,
    label: 'Running',
    spin: true,
  },
  completed: {
    classes: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    Icon: CheckCircle2,
    label: 'Completed',
  },
  failed: {
    classes: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    Icon: XCircle,
    label: 'Failed',
  },
}

export function StatusBadge({ status = 'pending' }) {
  const cfg = STYLES[status] || STYLES.pending
  const Icon = cfg.Icon

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.classes}`}
    >
      <Icon className={`w-3.5 h-3.5 ${cfg.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      <span>{cfg.label}</span>
    </span>
  )
}

