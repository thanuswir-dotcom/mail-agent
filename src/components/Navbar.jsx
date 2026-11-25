import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  Database,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  Settings2,
  Sparkles,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { SenderSetupDialog } from './SenderSetupDialog'

export function Navbar() {
  const { user, integrations, logout } = useAuth()
  const navigate = useNavigate()
  const [senderModalOpen, setSenderModalOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navClass = ({ isActive }) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'hover:bg-slate-200/70 dark:hover:bg-slate-800'
    }`

  const senderBadgeLabel = user?.googleConnected
    ? `Gmail: ${user.googleEmail || 'Connected'}`
    : user?.smtpConnected
    ? `SMTP: ${user.smtpEmail}`
    : 'Sender Setup (Sandbox Ready)'

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
            <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Mail className="w-5 h-5" aria-hidden="true" />
            </span>
            <span>MailPilot AI</span>
          </Link>

          <nav aria-label="Primary" className="flex items-center gap-1">
            <NavLink to="/dashboard" className={navClass}>
              <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/history" className={navClass}>
              <History className="w-4 h-4" aria-hidden="true" />
              <span>History</span>
            </NavLink>
            <NavLink to="/contacts" className={navClass}>
              <Users className="w-4 h-4" aria-hidden="true" />
              <span>Contacts</span>
            </NavLink>
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              integrations.geminiConfigured
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
            }`}
            title={`Gemini Model: ${integrations.geminiModel}`}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {integrations.geminiConfigured ? 'Gemini Ready' : 'Gemini Key Missing'}
            </span>
          </span>

          {integrations.supabaseConfigured && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
              title={integrations.supabaseUrl || 'Supabase Postgres Sync Active'}
            >
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Supabase Sync</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setSenderModalOpen(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              user?.googleConnected || user?.smtpConnected
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-transparent hover:opacity-90'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{senderBadgeLabel}</span>
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
            <span className="text-sm font-medium hidden sm:inline">{user?.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </div>

      <SenderSetupDialog
        key={`${user?.id || 'anon'}-${senderModalOpen ? 'open' : 'closed'}`}
        open={senderModalOpen}
        onClose={() => setSenderModalOpen(false)}
      />
    </header>
  )
}
