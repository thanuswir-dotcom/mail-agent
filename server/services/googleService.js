import { google } from 'googleapis'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { withRetry } from '../utils/retry.js'

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
]

export class GoogleIntegrationError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'GoogleIntegrationError'
    this.code = code
    this.status = status
  }
}

export function isGoogleOAuthConfigured() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

export function createOAuth2Client() {
  if (!isGoogleOAuthConfigured()) {
    throw new GoogleIntegrationError(
      'GOOGLE_OAUTH_NOT_CONFIGURED',
      'Google OAuth is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env.',
      503
    )
  }
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  )
}

export function getGoogleAuthUrl(userId) {
  const oauth2Client = createOAuth2Client()
  const state = jwt.sign({ sub: userId, purpose: 'google-oauth' }, env.JWT_SECRET, {
    expiresIn: '15m',
  })

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
  })
}

export function verifyGoogleOAuthState(stateToken) {
  const payload = jwt.verify(stateToken, env.JWT_SECRET)
  if (payload?.purpose !== 'google-oauth' || !payload?.sub) {
    throw new Error('Invalid OAuth state')
  }
  return payload.sub
}

export async function exchangeCodeAndSaveTokens(code, userId) {
  const oauth2Client = createOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)

  let googleEmail = ''
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const userInfo = await oauth2.userinfo.get()
    googleEmail = userInfo?.data?.email || ''
  } catch {
    // Non-fatal: Gmail/Calendar tokens remain valid even if userinfo lookup fails
  }

  const user = await User.findById(userId)
  if (!user) {
    throw new GoogleIntegrationError('USER_NOT_FOUND', 'User account not found.', 404)
  }

  user.googleTokens = {
    access_token: tokens.access_token || user.googleTokens?.access_token || '',
    refresh_token: tokens.refresh_token || user.googleTokens?.refresh_token || '',
    scope: tokens.scope || user.googleTokens?.scope || '',
    token_type: tokens.token_type || user.googleTokens?.token_type || '',
    expiry_date: tokens.expiry_date || user.googleTokens?.expiry_date || 0,
    email: googleEmail || user.googleTokens?.email || '',
  }
  await user.save()
  return user
}

export async function getAuthorizedClientForUser(user) {
  if (!isGoogleOAuthConfigured()) {
    throw new GoogleIntegrationError(
      'GOOGLE_OAUTH_NOT_CONFIGURED',
      'Google OAuth credentials are not set in server/.env.',
      503
    )
  }
  if (!user?.googleTokens?.access_token && !user?.googleTokens?.refresh_token) {
    throw new GoogleIntegrationError(
      'GOOGLE_NOT_CONNECTED',
      'Google account is not connected. Click "Connect Google" in the header to authorize Gmail and Calendar.',
      400
    )
  }

  const oauth2Client = createOAuth2Client()
  oauth2Client.setCredentials({
    access_token: user.googleTokens.access_token || undefined,
    refresh_token: user.googleTokens.refresh_token || undefined,
    expiry_date: user.googleTokens.expiry_date || undefined,
    token_type: user.googleTokens.token_type || undefined,
    scope: user.googleTokens.scope || undefined,
  })

  oauth2Client.on('tokens', async (newTokens) => {
    try {
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'googleTokens.access_token':
            newTokens.access_token || user.googleTokens.access_token,
          'googleTokens.expiry_date':
            newTokens.expiry_date || user.googleTokens.expiry_date,
          ...(newTokens.refresh_token
            ? { 'googleTokens.refresh_token': newTokens.refresh_token }
            : {}),
        },
      })
    } catch {
      // Non-fatal persistence failure during token refresh
    }
  })

  return oauth2Client
}

function computeFreeSlots(startIso, endIso, busySlots) {
  const startMs = Date.parse(startIso)
  const endMs = Date.parse(endIso)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return []
  }

  const sortedBusy = busySlots
    .map((b) => ({
      start: Math.max(startMs, Date.parse(b.start)),
      end: Math.min(endMs, Date.parse(b.end)),
    }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .sort((a, b) => a.start - b.start)

  const merged = []
  for (const block of sortedBusy) {
    const last = merged[merged.length - 1]
    if (!last || block.start > last.end) {
      merged.push({ ...block })
    } else {
      last.end = Math.max(last.end, block.end)
    }
  }

  const freeSlots = []
  let cursor = startMs
  for (const busy of merged) {
    if (busy.start - cursor >= 30 * 60 * 1000) {
      freeSlots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(busy.start).toISOString(),
        durationMinutes: Math.round((busy.start - cursor) / 60000),
      })
    }
    cursor = Math.max(cursor, busy.end)
  }
  if (endMs - cursor >= 30 * 60 * 1000) {
    freeSlots.push({
      start: new Date(cursor).toISOString(),
      end: new Date(endMs).toISOString(),
      durationMinutes: Math.round((endMs - cursor) / 60000),
    })
  }
  return freeSlots
}

export async function checkCalendarAvailability(
  user,
  { startIso, endIso, timeZone = 'UTC' },
  { signal, onRetry } = {}
) {
  const auth = await getAuthorizedClientForUser(user)
  const calendar = google.calendar({ version: 'v3', auth })

  const { value, attempts } = await withRetry(
    async () => {
      const [freeBusyRes, eventsRes] = await Promise.all([
        calendar.freebusy.query(
          {
            requestBody: {
              timeMin: startIso,
              timeMax: endIso,
              timeZone,
              items: [{ id: 'primary' }],
            },
          },
          { signal }
        ),
        calendar.events.list(
          {
            calendarId: 'primary',
            timeMin: startIso,
            timeMax: endIso,
            timeZone,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 20,
          },
          { signal }
        ),
      ])

      const busySlots = freeBusyRes?.data?.calendars?.primary?.busy || []
      const events = (eventsRes?.data?.items || []).map((evt) => ({
        id: evt.id || '',
        summary: evt.summary || '(No title)',
        start: evt.start?.dateTime || evt.start?.date || '',
        end: evt.end?.dateTime || evt.end?.date || '',
        status: evt.status || 'confirmed',
      }))

      const freeSlots = computeFreeSlots(startIso, endIso, busySlots)

      return {
        connected: true,
        timeZone,
        windowStart: startIso,
        windowEnd: endIso,
        available: busySlots.length === 0,
        busySlots,
        freeSlots,
        events,
      }
    },
    { signal, onRetry }
  )

  return { ...value, attempts }
}

function encodeRawEmail({ to, cc = [], subject, body }) {
  const safeSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
  const headers = [
    `To: ${to}`,
    ...(cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
  ]
  const message = `${headers.join('\r\n')}\r\n\r\n${body}`
  return Buffer.from(message, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function createGmailDraft(
  user,
  { to, cc = [], subject, body },
  { signal, onRetry } = {}
) {
  const auth = await getAuthorizedClientForUser(user)
  const gmail = google.gmail({ version: 'v1', auth })
  const raw = encodeRawEmail({ to, cc, subject, body })

  const { value, attempts } = await withRetry(
    async () => {
      const res = await gmail.users.drafts.create(
        {
          userId: 'me',
          requestBody: {
            message: { raw },
          },
        },
        { signal }
      )
      return {
        gmailDraftId: res.data?.id || '',
        gmailMessageId: res.data?.message?.id || '',
        gmailThreadId: res.data?.message?.threadId || '',
      }
    },
    { signal, onRetry }
  )

  return { ...value, attempts }
}

export async function sendApprovedGmail(
  user,
  { gmailDraftId, to, cc = [], subject, body },
  { signal, onRetry } = {}
) {
  const auth = await getAuthorizedClientForUser(user)
  const gmail = google.gmail({ version: 'v1', auth })
  const raw = encodeRawEmail({ to, cc, subject, body })

  const { value, attempts } = await withRetry(
    async () => {
      if (gmailDraftId) {
        try {
          await gmail.users.drafts.update(
            {
              userId: 'me',
              id: gmailDraftId,
              requestBody: {
                message: { raw },
              },
            },
            { signal }
          )
          const sent = await gmail.users.drafts.send(
            {
              userId: 'me',
              requestBody: { id: gmailDraftId },
            },
            { signal }
          )
          return {
            gmailMessageId: sent.data?.id || '',
            gmailThreadId: sent.data?.threadId || '',
          }
        } catch (err) {
          // If draft no longer exists remotely, fall back to direct send
          if (Number(err?.code || err?.response?.status) !== 404) {
            throw err
          }
        }
      }

      const sent = await gmail.users.messages.send(
        {
          userId: 'me',
          requestBody: { raw },
        },
        { signal }
      )
      return {
        gmailMessageId: sent.data?.id || '',
        gmailThreadId: sent.data?.threadId || '',
      }
    },
    { signal, onRetry }
  )

  return { ...value, attempts }
}

