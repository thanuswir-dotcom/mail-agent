import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, KeyRound, Mail, Plug, ShieldCheck, X } from 'lucide-react'
import { api, extractApiError } from '../api/client'
import { useAuth } from '../context/useAuth'

export function SenderSetupDialog({ open, onClose }) {
  const { user, refreshProfile } = useAuth()
  const dialogRef = useRef(null)

  const [smtpEmail, setSmtpEmail] = useState(user?.smtpEmail || user?.email || '')
  const [appPassword, setAppPassword] = useState('')
  const [host, setHost] = useState(user?.smtpHost || 'smtp.gmail.com')
  const [port, setPort] = useState('465')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const handleSaveSmtp = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setBusy('smtp')
    try {
      await api.post('/sender/smtp', {
        email: smtpEmail.trim(),
        appPassword: appPassword.trim(),
        host: host.trim(),
        port: Number(port),
      })
      await refreshProfile()
      setAppPassword('')
      setSuccess('SMTP sender verified and saved. You can now send real emails without Google OAuth errors!')
    } catch (err) {
      setError(extractApiError(err, 'Failed to verify SMTP sender credentials.'))
    } finally {
      setBusy('')
    }
  }

  const handleDisconnectSmtp = async () => {
    setError('')
    setSuccess('')
    setBusy('smtp-off')
    try {
      await api.post('/sender/smtp/disconnect')
      await refreshProfile()
      setSuccess('SMTP sender removed.')
    } catch (err) {
      setError(extractApiError(err, 'Failed to disconnect SMTP sender.'))
    } finally {
      setBusy('')
    }
  }

  const handleConnectGoogle = async () => {
    setError('')
    setBusy('google')
    try {
      const res = await api.get('/google/auth-url')
      if (res.data?.url) {
        window.location.href = res.data.url
      }
    } catch (err) {
      setError(extractApiError(err, 'Could not start Google OAuth flow.'))
      setBusy('')
    }
  }

  const handleDisconnectGoogle = async () => {
    setError('')
    setSuccess('')
    setBusy('google-off')
    try {
      await api.post('/google/disconnect')
      await refreshProfile()
      setSuccess('Google OAuth disconnected.')
    } catch (err) {
      setError(extractApiError(err, 'Could not disconnect Google account.'))
    } finally {
      setBusy('')
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="sender-setup-title"
      onClose={(e) => {
        e.currentTarget.returnValue = ''
        onClose()
      }}
    >
      <div className="flex flex-col max-h-[85vh]">
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h1 id="sender-setup-title" className="text-lg font-bold">
              Email Sender Setup
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Optional: connect a personal Gmail sender, or close this window to use Instant Sandbox Delivery right away.
            </p>
          </div>
          <form method="dialog">
            <button
              value="close"
              autoFocus
              aria-label="Close sender setup"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300"
          >
            {success}
          </div>
        )}

        {/* Option 1: Gmail App Password / SMTP (Works for ANY user without OAuth Test User errors) */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Gmail App Password / SMTP (Recommended)</h2>
            </div>
            {user?.smtpConnected && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                Connected
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enter your SMTP email &amp; password (8+ characters). For <code>smtp.gmail.com</code>, Google requires an App Password from{' '}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-blue-600 dark:text-blue-400 underline"
            >
              myaccount.google.com/apppasswords
            </a>
            ; for custom SMTP servers, any valid 8+ character password works.
          </p>

          <form onSubmit={handleSaveSmtp} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="smtp-email" className="block text-xs font-medium mb-1">
                  Sender Email
                </label>
                <input
                  id="smtp-email"
                  type="email"
                  required
                  spellCheck={false}
                  value={smtpEmail}
                  onChange={(e) => setSmtpEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm"
                />
              </div>

              <div>
                <label htmlFor="smtp-pass" className="block text-xs font-medium mb-1">
                  SMTP / App Password (8+ chars)
                </label>
                <input
                  id="smtp-pass"
                  type="password"
                  required
                  minLength={8}
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="smtp-host" className="block text-xs font-medium mb-1">
                  SMTP Host
                </label>
                <input
                  id="smtp-host"
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label htmlFor="smtp-port" className="block text-xs font-medium mb-1">
                  Port
                </label>
                <input
                  id="smtp-port"
                  type="text"
                  inputMode="numeric"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {user?.smtpConnected ? (
                <button
                  type="button"
                  onClick={handleDisconnectSmtp}
                  disabled={Boolean(busy)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 border border-rose-500/30 hover:bg-rose-500/10"
                >
                  Remove SMTP ({user.smtpEmail})
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={Boolean(busy)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy === 'smtp' ? 'Verifying...' : 'Verify & Save SMTP'}
              </button>
            </div>
          </form>
        </section>

        {/* Option 2: Google OAuth */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Plug className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Google OAuth (Gmail Drafts & Calendar)</h2>
            </div>
            {user?.googleConnected && (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {user.googleEmail || 'Connected'}
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Creates Gmail drafts and checks Google Calendar availability. Note: while the OAuth app is in Google Testing mode, your email must be listed under Test Users in Google Cloud Console.
          </p>

          <div className="flex justify-end">
            {user?.googleConnected ? (
              <button
                type="button"
                onClick={handleDisconnectGoogle}
                disabled={Boolean(busy)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Disconnect Google OAuth
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectGoogle}
                disabled={Boolean(busy)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              >
                <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{busy === 'google' ? 'Redirecting...' : 'Connect Google OAuth'}</span>
              </button>
            )}
          </div>
        </section>

        {/* Option 3: Instant Sandbox Info */}
        <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-xs text-blue-800 dark:text-blue-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2 flex-1">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong>Zero-Error Sandbox Mode:</strong> Close this modal to send via Ethereal SMTP Sandbox immediately with no password required.
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 shrink-0"
          >
            Use Sandbox Mode
          </button>
        </div>
        </div>
      </div>
    </dialog>
  )
}
