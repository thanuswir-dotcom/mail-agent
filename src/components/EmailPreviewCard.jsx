import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  MailCheck,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react'

import { extractApiError } from '../api/client'

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu

function countEmojis(text = '') {
  const m = String(text).match(EMOJI_REGEX)
  return m ? m.length : 0
}

function addWarmEmojis({ subject = '', body = '' }) {
  let nextSubject = subject.trim()
  if (countEmojis(nextSubject) === 0 && nextSubject) {
    nextSubject = `${nextSubject} 😊✨`
  }

  let nextBody = body.trim()
  if (nextBody && countEmojis(nextBody) < 4) {
    const lines = nextBody.split(/\r?\n/)
    if (lines.length > 0 && countEmojis(lines[0]) === 0) {
      lines[0] = `${lines[0]} 👋😊`
    }
    const midIdx = lines.findIndex((l, idx) => idx > 0 && l.trim().length > 10 && countEmojis(l) === 0)
    if (midIdx !== -1) {
      lines[midIdx] = `${lines[midIdx]} ✨💬`
    }
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (lines[i].trim()) {
        if (countEmojis(lines[i]) < 2) {
          lines[i] = `${lines[i]} 🙌💛`
        }
        break
      }
    }
    nextBody = lines.join('\n')
  }

  return { subject: nextSubject, body: nextBody }
}

const DELIVERY_LABELS = {
  gmail_oauth: 'Gmail API (OAuth)',
  smtp: 'SMTP / Gmail App Password',
  ethereal_sandbox: 'Sandbox Test Inbox (Ethereal)',
}

export function EmailPreviewCard({
  task,
  googleConnected,
  smtpConnected,
  smtpEmail,
  onSaveDraft,
  onApproveAndSend,
  onRejectDraft,
}) {
  const draft = task?.emailDraft
  const hasDraft = Boolean(
    draft && (draft.recipientEmail || draft.subject || draft.body || draft.approvalStatus !== 'none')
  )

  const [recipientName, setRecipientName] = useState(draft?.recipientName || '')
  const [recipientEmail, setRecipientEmail] = useState(draft?.recipientEmail || '')
  const [recipientType, setRecipientType] = useState(draft?.recipientType || 'official')
  const [ccText, setCcText] = useState((draft?.cc || []).join(', '))
  const [subject, setSubject] = useState(draft?.subject || '')
  const [body, setBody] = useState(draft?.body || '')
  const [preferredMethod, setPreferredMethod] = useState('auto')

  const [busyAction, setBusyAction] = useState('')
  const [actionError, setActionError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const confirmDialogRef = useRef(null)

  useEffect(() => {
    const dialog = confirmDialogRef.current
    if (!dialog) return
    if (dialogOpen && !dialog.open) {
      dialog.showModal()
    } else if (!dialogOpen && dialog.open) {
      dialog.close()
    }
  }, [dialogOpen])

  if (!hasDraft) {
    return null
  }

  const isSent = draft.approvalStatus === 'approved_and_sent'
  const isRejected = draft.approvalStatus === 'rejected'
  const isAgentRunning = task?.status === 'running'
  const isLocked = isSent || isAgentRunning

  const activeAutoChannel = googleConnected
    ? 'Gmail API (OAuth)'
    : smtpConnected
    ? `SMTP (${smtpEmail})`
    : 'Sandbox Test Inbox (Zero-Error Demo)'

  const parseCcList = () =>
    ccText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

  const handleRecipientTypeChange = (nextType) => {
    setRecipientType(nextType)
    if (nextType === 'unofficial') {
      const enriched = addWarmEmojis({ subject, body })
      setSubject(enriched.subject)
      setBody(enriched.body)
    }
  }

  const handleBoostEmojis = () => {
    setRecipientType('unofficial')
    const enriched = addWarmEmojis({ subject, body })
    setSubject(enriched.subject)
    setBody(enriched.body)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setActionError('')
    setBusyAction('save')
    try {
      await onSaveDraft({
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail.trim(),
        recipientType,
        enhanceEmojis: recipientType === 'unofficial',
        cc: parseCcList(),
        subject: subject.trim(),
        body: body.trim(),
      })
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to save draft edits.'))
    } finally {
      setBusyAction('')
    }
  }

  const handleOpenConfirm = () => {
    setActionError('')
    if (!recipientEmail.trim() || !subject.trim() || !body.trim()) {
      setActionError('Recipient email, subject, and message body are required before sending.')
      return
    }
    setDialogOpen(true)
  }

  const handleConfirmSend = async () => {
    setBusyAction('send')
    setActionError('')
    try {
      await onApproveAndSend({
        confirmed: true,
        preferredMethod,
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail.trim(),
        recipientType,
        cc: parseCcList(),
        subject: subject.trim(),
        body: body.trim(),
      })
      setDialogOpen(false)
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to send email.'))
      setDialogOpen(false)
    } finally {
      setBusyAction('')
    }
  }

  const handleReject = async () => {
    setActionError('')
    setBusyAction('reject')
    try {
      await onRejectDraft()
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to reject draft.'))
    } finally {
      setBusyAction('')
    }
  }

  return (
    <section
      aria-labelledby="email-preview-heading"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 id="email-preview-heading" className="text-base font-semibold">
            Email Preview &amp; Explicit Approval
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Review the message before sending. Unofficial recipients automatically receive extra friendly emojis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {recipientType === 'unofficial' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-pink-500/15 text-pink-700 dark:text-pink-300 border border-pink-500/30">
              <span>Unofficial · Extra Emojis ✨</span>
            </span>
          )}
          {isSent && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              <MailCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Approved &amp; Sent</span>
            </span>
          )}
          {isRejected && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30">
              <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Draft Rejected</span>
            </span>
          )}
          {!isSent && !isRejected && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Awaiting Explicit Approval</span>
            </span>
          )}
        </div>
      </div>

      {isSent && (
        <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2">
          <span>
            Delivered via <strong>{DELIVERY_LABELS[draft.deliveryMethod] || 'Email Provider'}</strong>
            {draft.gmailMessageId ? (
              <>
                {' '}
                (ID: <code className="font-mono">{draft.gmailMessageId}</code>)
              </>
            ) : null}
          </span>
          {draft.previewUrl && (
            <a
              href={draft.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline"
            >
              <span>Open Sent Email Preview</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {!isSent && draft.gmailDraftCreated && (
        <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
          Synced to Gmail Drafts (Draft ID: <code className="font-mono">{draft.gmailDraftId}</code>)
        </div>
      )}

      {!isSent && !draft.gmailDraftCreated && (
        <div className="mb-4 rounded-xl border border-blue-500/25 bg-blue-500/10 px-3.5 py-2.5 text-xs text-blue-800 dark:text-blue-200">
          Ready to send via <strong>{activeAutoChannel}</strong>. You can switch or add Gmail App Password / SMTP anytime in <strong>Sender Setup</strong> in the top bar.
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"
        >
          {actionError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3.5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="draft-recipient-name" className="block text-xs font-medium mb-1">
              Recipient name
            </label>
            <input
              id="draft-recipient-name"
              name="recipientName"
              type="text"
              value={recipientName}
              disabled={isLocked}
              onChange={(e) => setRecipientName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="draft-recipient-email" className="block text-xs font-medium mb-1">
              Recipient email <span aria-hidden="true">*</span>
            </label>
            <input
              id="draft-recipient-email"
              name="recipientEmail"
              type="email"
              required
              spellCheck={false}
              value={recipientEmail}
              disabled={isLocked}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="mp-input w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="draft-recipient-type" className="block text-xs font-medium mb-1">
              Member type
            </label>
            <select
              id="draft-recipient-type"
              value={recipientType}
              disabled={isLocked}
              onChange={(e) => handleRecipientTypeChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="official">Official (Formal)</option>
              <option value="unofficial">Unofficial (Extra Emojis ✨😊)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="draft-cc" className="block text-xs font-medium mb-1">
              CC (comma-separated emails)
            </label>
            <input
              id="draft-cc"
              name="cc"
              type="text"
              spellCheck={false}
              value={ccText}
              disabled={isLocked}
              onChange={(e) => setCcText(e.target.value)}
              placeholder="teammate@example.com"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="draft-subject" className="block text-xs font-medium mb-1">
              Subject <span aria-hidden="true">*</span>
            </label>
            <input
              id="draft-subject"
              name="subject"
              type="text"
              required
              value={subject}
              disabled={isLocked}
              onChange={(e) => setSubject(e.target.value)}
              className="mp-input w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label htmlFor="draft-body" className="block text-xs font-medium">
              Message / Letter <span aria-hidden="true">*</span>
            </label>
            {!isLocked && (
              <button
                type="button"
                onClick={handleBoostEmojis}
                className="inline-flex items-center gap-1 text-xs font-medium text-pink-600 dark:text-pink-400 hover:underline"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Extra Emojis ✨</span>
              </button>
            )}
          </div>
          <textarea
            id="draft-body"
            name="body"
            rows={7}
            required
            value={body}
            disabled={isLocked}
            onChange={(e) => setBody(e.target.value)}
            className="mp-input w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm leading-relaxed disabled:opacity-60"
          />
        </div>

        {!isSent && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={isLocked || Boolean(busyAction)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{busyAction === 'save' ? 'Saving...' : 'Save Edits'}</span>
              </button>

              {!isRejected && (
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isLocked || Boolean(busyAction)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-rose-600 border border-rose-500/30 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{busyAction === 'reject' ? 'Rejecting...' : 'Discard Draft'}</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleOpenConfirm}
              disabled={isLocked || Boolean(busyAction)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Approve &amp; Send Email</span>
            </button>
          </div>
        )}
      </form>

      {/* Native <dialog> modal for explicit user confirmation before sending */}
      <dialog
        ref={confirmDialogRef}
        aria-labelledby="confirm-send-title"
        onClose={(e) => {
          e.currentTarget.returnValue = ''
          setDialogOpen(false)
        }}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            </span>
            <div>
              <h1 id="confirm-send-title" className="text-lg font-semibold">
                Confirm Send Email
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                Verify the recipient, subject, and message below before sending.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="delivery-channel" className="block text-xs font-medium mb-1">
              Delivery Method
            </label>
            <select
              id="delivery-channel"
              value={preferredMethod}
              onChange={(e) => setPreferredMethod(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="auto">Auto ({activeAutoChannel})</option>
              {googleConnected && <option value="gmail_oauth">Gmail API (OAuth)</option>}
              {smtpConnected && <option value="smtp">SMTP ({smtpEmail})</option>}
              <option value="ethereal_sandbox">Instant Sandbox Inbox (Ethereal SMTP)</option>
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2 text-sm">
            <p>
              <strong className="font-semibold">To:</strong>{' '}
              {recipientName ? `${recipientName} <${recipientEmail}>` : recipientEmail}
            </p>
            <p>
              <strong className="font-semibold">Type:</strong>{' '}
              {recipientType === 'unofficial' ? 'Unofficial (Friendly + Extra Emojis ✨)' : 'Official (Formal)'}
            </p>
            {ccText.trim() && (
              <p>
                <strong className="font-semibold">CC:</strong> {ccText}
              </p>
            )}
            <p>
              <strong className="font-semibold">Subject:</strong> {subject}
            </p>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Message
              </p>
              <p className="whitespace-pre-wrap text-xs max-h-48 overflow-y-auto leading-relaxed">
                {body}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <form method="dialog">
              <button
                value="cancel"
                autoFocus
                onClick={() => setDialogOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </form>
            <button
              type="button"
              onClick={handleConfirmSend}
              disabled={busyAction === 'send'}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>{busyAction === 'send' ? 'Sending...' : 'Confirm & Send'}</span>
            </button>
          </div>
        </div>
      </dialog>
    </section>
  )
}
