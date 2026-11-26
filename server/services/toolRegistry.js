import { z } from 'zod'
import { findContactByEmail, listContacts, saveTask } from './dbStore.js'
import * as googleService from './googleService.js'

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu
const STRIP_EMOJI_REGEX = /(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\u20E3)/gu

const UNOFFICIAL_GOAL_CUE =
  /\b(friend|friends|bestie|buddy|pal|bro|sis|brother|sister|cousin|mom|dad|family|unofficial|casual|informal|personal|hangout|party|birthday)\b/i

export function countEmojis(text = '') {
  const matches = String(text).match(EMOJI_REGEX)
  return matches ? matches.length : 0
}

/**
 * Removes all emojis and variation selectors while keeping line breaks intact
 * so official emails stay strictly professional and emoji-free.
 */
export function stripEmojis(text = '') {
  return String(text || '')
    .replace(STRIP_EMOJI_REGEX, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .trim()
}

export function sanitizeOfficialEmail({ subject = '', body = '' }) {
  return {
    subject: stripEmojis(subject).replace(/\s+/g, ' ').trim(),
    body: stripEmojis(body),
  }
}

/**
 * Adds warm, friendly emojis to subjects and bodies/letters addressed to unofficial recipients.
 */
export function enhanceUnofficialEmail({ subject = '', body = '' }) {
  let nextSubject = String(subject).trim()
  if (countEmojis(nextSubject) === 0) {
    nextSubject = `${nextSubject} 😊✨`
  }

  let nextBody = String(body).trim()
  if (countEmojis(nextBody) < 4) {
    const lines = nextBody.split(/\r?\n/)
    if (lines.length > 0 && countEmojis(lines[0]) === 0) {
      lines[0] = `${lines[0]} 👋😊`
    }

    // Add warmth to the main message line if it has no emoji yet
    const midIdx = lines.findIndex((l, idx) => idx > 0 && l.trim().length > 10 && countEmojis(l) === 0)
    if (midIdx !== -1) {
      lines[midIdx] = `${lines[midIdx]} ✨💬`
    }

    // Add cheerful sign-off emojis on the last non-empty line
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

  return {
    subject: nextSubject,
    body: nextBody,
    emojisEnhanced: true,
  }
}

const findContactsInputSchema = z.object({
  query: z.string().trim().min(1, 'Search query is required').max(120),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
})

const contactMatchSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  company: z.string(),
  role: z.string(),
  relationshipType: z.enum(['official', 'unofficial']),
  notes: z.string(),
  tags: z.array(z.string()),
})

const findContactsOutputSchema = z.object({
  matches: z.array(contactMatchSchema),
  totalFound: z.number().int().nonnegative(),
  note: z.string().optional(),
})

const checkCalendarInputSchema = z.object({
  startIso: z
    .string()
    .trim()
    .refine((val) => Number.isFinite(Date.parse(val)), 'startIso must be a valid ISO-8601 datetime'),
  endIso: z
    .string()
    .trim()
    .refine((val) => Number.isFinite(Date.parse(val)), 'endIso must be a valid ISO-8601 datetime'),
  timeZone: z.string().trim().min(1).max(80).optional().default('UTC'),
})

const checkCalendarOutputSchema = z.object({
  connected: z.boolean(),
  timeZone: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  available: z.boolean().nullable(),
  busySlots: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
    })
  ),
  freeSlots: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
      durationMinutes: z.number(),
    })
  ),
  events: z.array(
    z.object({
      id: z.string(),
      summary: z.string(),
      start: z.string(),
      end: z.string(),
      status: z.string(),
    })
  ),
  fallbackUsed: z.boolean().optional(),
  note: z.string().optional(),
})

const createEmailDraftInputSchema = z.object({
  recipientName: z.string().trim().max(150).optional().default(''),
  recipientEmail: z.string().trim().email('recipientEmail must be a valid email address'),
  recipientType: z.enum(['official', 'unofficial']).optional().default('official'),
  cc: z.array(z.string().trim().email()).max(10).optional().default([]),
  subject: z.string().trim().min(1, 'Email subject is required').max(300),
  body: z.string().trim().min(1, 'Email body is required').max(20000),
})

const createEmailDraftOutputSchema = z.object({
  draftSaved: z.boolean(),
  gmailDraftCreated: z.boolean(),
  gmailDraftId: z.string(),
  approvalStatus: z.literal('pending_approval'),
  recipientName: z.string(),
  recipientEmail: z.string().email(),
  recipientType: z.enum(['official', 'unofficial']),
  emojisEnhanced: z.boolean(),
  subject: z.string(),
  fallbackUsed: z.boolean().optional(),
  note: z.string(),
})

export const TOOL_DEFINITIONS = [
  {
    name: 'find_contacts',
    description:
      'Search the user contacts database by name, email, company, role, relationshipType (official/unofficial), or tag to locate email recipients.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Name, email fragment, role, company, or tag to search for.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of matching contacts to return (1-20).',
        },
      },
      required: ['query'],
    },
    inputSchema: findContactsInputSchema,
    outputSchema: findContactsOutputSchema,
    async execute(input, context) {
      const docs = await listContacts(context.user._id, input.query, input.limit)

      const matches = docs.map((d) => ({
        id: String(d._id),
        name: d.name,
        email: d.email,
        company: d.company || '',
        role: d.role || '',
        relationshipType: d.relationshipType === 'unofficial' ? 'unofficial' : 'official',
        notes: d.notes || '',
        tags: Array.isArray(d.tags) ? d.tags : [],
      }))

      return {
        output: {
          matches,
          totalFound: matches.length,
          ...(matches.length === 0
            ? { note: `No contacts found matching "${input.query}".` }
            : {}),
        },
        attempts: 1,
        fallbackUsed: false,
      }
    },
  },
  {
    name: 'check_calendar_availability',
    description:
      'Check the user Google Calendar availability and existing events for an ISO-8601 date/time range.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        startIso: {
          type: 'string',
          description: 'Start of the range in ISO-8601 format, e.g. 2026-11-26T09:00:00Z.',
        },
        endIso: {
          type: 'string',
          description: 'End of the range in ISO-8601 format, e.g. 2026-11-26T18:00:00Z.',
        },
        timeZone: {
          type: 'string',
          description: 'IANA timezone name, e.g. America/Los_Angeles or Asia/Kolkata.',
        },
      },
      required: ['startIso', 'endIso'],
    },
    inputSchema: checkCalendarInputSchema,
    outputSchema: checkCalendarOutputSchema,
    async execute(input, context) {
      const calendarFn =
        context.googleTools?.checkCalendarAvailability ||
        googleService.checkCalendarAvailability

      try {
        const result = await calendarFn(context.user, input, {
          signal: context.signal,
          onRetry: context.onRetry,
        })
        return {
          output: {
            connected: true,
            timeZone: result.timeZone || input.timeZone,
            windowStart: input.startIso,
            windowEnd: input.endIso,
            available: Boolean(result.available),
            busySlots: result.busySlots || [],
            freeSlots: result.freeSlots || [],
            events: result.events || [],
            fallbackUsed: false,
          },
          attempts: result.attempts || 1,
          fallbackUsed: false,
        }
      } catch (error) {
        if (error?.isAbort || error?.name === 'AbortError') {
          throw error
        }
        return {
          output: {
            connected: false,
            timeZone: input.timeZone,
            windowStart: input.startIso,
            windowEnd: input.endIso,
            available: null,
            busySlots: [],
            freeSlots: [],
            events: [],
            fallbackUsed: true,
            note: `Calendar lookup unavailable (${error.message}). Propose tentative times in the email draft and inform the user.`,
          },
          attempts: error.attempts || 1,
          fallbackUsed: true,
          fallbackError: error.message,
        }
      }
    },
  },
  {
    name: 'create_email_draft',
    description:
      'Create an email or letter draft for explicit user review and approval. Set recipientType="unofficial" for friends/casual/unofficial recipients so extra emojis are included. NEVER sends the email.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        recipientName: {
          type: 'string',
          description: 'Recipient display name if known.',
        },
        recipientEmail: {
          type: 'string',
          description: 'Recipient email address.',
        },
        recipientType: {
          type: 'string',
          enum: ['official', 'unofficial'],
          description:
            'Use "unofficial" for friends, family, or casual/unofficial contacts (adds extra warm emojis); use "official" for formal work/business recipients.',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional CC email addresses.',
        },
        subject: {
          type: 'string',
          description: 'Clear email subject line.',
        },
        body: {
          type: 'string',
          description: 'Plain-text email or letter body.',
        },
      },
      required: ['recipientEmail', 'subject', 'body'],
    },
    inputSchema: createEmailDraftInputSchema,
    outputSchema: createEmailDraftOutputSchema,
    async execute(input, context) {
      // Determine official vs unofficial: explicit user toneMode takes precedence
      const lockedToneMode = context.task?.emailDraft?.toneMode || 'auto'
      let resolvedType = input.recipientType || 'official'
      if (lockedToneMode === 'official' || lockedToneMode === 'unofficial') {
        resolvedType = lockedToneMode
      } else if (resolvedType === 'official') {
        const contact = await findContactByEmail(context.user._id, input.recipientEmail)
        if (
          contact?.relationshipType === 'unofficial' ||
          UNOFFICIAL_GOAL_CUE.test(context.task?.goal || '')
        ) {
          resolvedType = 'unofficial'
        }
      }

      let finalSubject = input.subject
      let finalBody = input.body
      let emojisEnhanced = false

      if (resolvedType === 'unofficial') {
        const enhanced = enhanceUnofficialEmail({
          subject: finalSubject,
          body: finalBody,
        })
        finalSubject = enhanced.subject
        finalBody = enhanced.body
        emojisEnhanced = enhanced.emojisEnhanced
      } else {
        const sanitized = sanitizeOfficialEmail({
          subject: finalSubject,
          body: finalBody,
        })
        finalSubject = sanitized.subject
        finalBody = sanitized.body
      }

      const draftFn =
        context.googleTools?.createGmailDraft || googleService.createGmailDraft

      let gmailDraftId = ''
      let gmailMessageId = ''
      let gmailThreadId = ''
      let gmailDraftCreated = false
      let fallbackUsed = false
      let gmailError = ''
      let attempts

      try {
        const gmailRes = await draftFn(
          context.user,
          {
            to: input.recipientEmail,
            cc: input.cc,
            subject: finalSubject,
            body: finalBody,
          },
          {
            signal: context.signal,
            onRetry: context.onRetry,
          }
        )
        gmailDraftId = gmailRes.gmailDraftId || ''
        gmailMessageId = gmailRes.gmailMessageId || ''
        gmailThreadId = gmailRes.gmailThreadId || ''
        gmailDraftCreated = Boolean(gmailDraftId)
        attempts = gmailRes.attempts || 1
      } catch (error) {
        if (error?.isAbort || error?.name === 'AbortError') {
          throw error
        }
        attempts = error.attempts || 1
        fallbackUsed = true
        gmailError = error.message
      }

      context.task.emailDraft = {
        recipientName: input.recipientName || '',
        recipientEmail: input.recipientEmail,
        recipientType: resolvedType,
        toneMode: lockedToneMode,
        cc: input.cc || [],
        subject: finalSubject,
        body: finalBody,
        gmailDraftId,
        gmailMessageId,
        gmailThreadId,
        gmailDraftCreated,
        deliveryMethod: 'none',
        previewUrl: '',
        approvalStatus: 'pending_approval',
        approvedAt: null,
        sentAt: null,
        error: gmailError,
      }
      await saveTask(context.task)

      return {
        output: {
          draftSaved: true,
          gmailDraftCreated,
          gmailDraftId,
          approvalStatus: 'pending_approval',
          recipientName: input.recipientName || '',
          recipientEmail: input.recipientEmail,
          recipientType: resolvedType,
          emojisEnhanced,
          subject: finalSubject,
          fallbackUsed,
          note: gmailDraftCreated
            ? 'Gmail draft created and saved for explicit user approval. Email has NOT been sent.'
            : `Email draft preview saved and ready to approve & send (${gmailError}). Email has NOT been sent.`,
        },
        attempts,
        fallbackUsed,
        fallbackError: gmailError,
      }
    },
  },
]

export function getToolByName(name) {
  return TOOL_DEFINITIONS.find((t) => t.name === name)
}

export function getGeminiFunctionDeclarations() {
  return TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.parametersJsonSchema,
  }))
}

export async function invokeValidatedTool(name, rawArgs, context) {
  const tool = getToolByName(name)
  if (!tool) {
    throw new Error(`Unknown tool "${name}".`)
  }

  const parsedInput = tool.inputSchema.safeParse(rawArgs ?? {})
  if (!parsedInput.success) {
    const msg = parsedInput.error.issues
      .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
      .join('; ')
    const err = new Error(`Tool input validation failed for ${name}: ${msg}`)
    err.validationErrors = parsedInput.error.issues
    throw err
  }

  const execution = await tool.execute(parsedInput.data, context)

  const parsedOutput = tool.outputSchema.safeParse(execution.output)
  if (!parsedOutput.success) {
    const msg = parsedOutput.error.issues
      .map((i) => `${i.path.join('.') || 'output'}: ${i.message}`)
      .join('; ')
    throw new Error(`Tool output validation failed for ${name}: ${msg}`)
  }

  return {
    validatedInput: parsedInput.data,
    validatedOutput: parsedOutput.data,
    attempts: execution.attempts || 1,
    fallbackUsed: Boolean(execution.fallbackUsed),
    fallbackError: execution.fallbackError || '',
  }
}
