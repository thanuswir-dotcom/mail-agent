import nodemailer from 'nodemailer'
import { withRetry } from '../utils/retry.js'
import { sendApprovedGmail } from './googleService.js'

export function createSmtpTransport(smtpConfig) {
  return nodemailer.createTransport({
    host: smtpConfig.host || 'smtp.gmail.com',
    port: Number(smtpConfig.port || 465),
    secure: smtpConfig.secure ?? Number(smtpConfig.port || 465) === 465,
    auth: {
      user: smtpConfig.email,
      pass: smtpConfig.appPassword,
    },
  })
}

export async function verifySmtpCredentials(smtpConfig) {
  const transporter = createSmtpTransport(smtpConfig)
  await transporter.verify()
  return true
}

/**
 * Sends an explicitly approved email via the user's configured provider:
 * 1) Gmail API OAuth, 2) Gmail App Password / Custom SMTP, or 3) Ethereal Sandbox SMTP.
 */
export async function deliverApprovedEmail(
  user,
  { gmailDraftId, to, cc = [], subject, body, preferredMethod = 'auto' }
) {
  const hasGoogleOAuth = Boolean(
    user.googleTokens?.refresh_token || user.googleTokens?.access_token
  )
  const hasSmtp = Boolean(user.smtpConfig?.email && user.smtpConfig?.appPassword)

  let chosen = preferredMethod
  if (chosen === 'auto') {
    if (hasGoogleOAuth) chosen = 'gmail_oauth'
    else if (hasSmtp) chosen = 'smtp'
    else chosen = 'ethereal_sandbox'
  }

  if (chosen === 'gmail_oauth') {
    const res = await sendApprovedGmail(user, {
      gmailDraftId,
      to,
      cc,
      subject,
      body,
    })
    return {
      deliveryMethod: 'gmail_oauth',
      gmailMessageId: res.gmailMessageId || '',
      gmailThreadId: res.gmailThreadId || '',
      previewUrl: '',
      attempts: res.attempts || 1,
    }
  }

  if (chosen === 'smtp') {
    if (!hasSmtp) {
      const err = new Error(
        'SMTP sender is not configured. Open Sender Setup to add your email and Gmail App Password.'
      )
      err.status = 400
      throw err
    }

    const transporter = createSmtpTransport(user.smtpConfig)
    const { value, attempts } = await withRetry(async () => {
      return transporter.sendMail({
        from: `"${user.name}" <${user.smtpConfig.email}>`,
        to,
        ...(cc.length ? { cc: cc.join(', ') } : {}),
        subject,
        text: body,
      })
    })

    return {
      deliveryMethod: 'smtp',
      gmailMessageId: value.messageId || '',
      gmailThreadId: '',
      previewUrl: '',
      attempts,
    }
  }

  // Real SMTP delivery via Ethereal test inbox when no personal sender is connected yet
  const { value, attempts } = await withRetry(async () => {
    const testAccount = await nodemailer.createTestAccount()
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    })

    const info = await transporter.sendMail({
      from: `"${user.name} via MailPilot AI" <${testAccount.user}>`,
      replyTo: user.email,
      to,
      ...(cc.length ? { cc: cc.join(', ') } : {}),
      subject,
      text: body,
    })

    return {
      messageId: info.messageId || '',
      previewUrl: nodemailer.getTestMessageUrl(info) || '',
    }
  })

  return {
    deliveryMethod: 'ethereal_sandbox',
    gmailMessageId: value.messageId,
    gmailThreadId: '',
    previewUrl: value.previewUrl,
    attempts,
  }
}
