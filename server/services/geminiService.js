import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { env } from '../config/env.js'
import { AbortError, withRetry } from '../utils/retry.js'

const generatedPlanSchema = z.object({
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(200),
        description: z.string().trim().max(600).default(''),
        toolHint: z
          .enum(['find_contacts', 'check_calendar_availability', 'create_email_draft', 'reasoning'])
          .optional()
          .default('reasoning'),
      })
    )
    .min(1)
    .max(8),
})

export class GeminiConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GeminiConfigError'
    this.status = 503
  }
}

function normalizeGeminiError(error) {
  const raw = String(error?.message || '')
  let parsedMessage = ''
  let reason = ''
  let code = Number(error?.status || error?.code || 500)

  try {
    const json = JSON.parse(raw)
    parsedMessage = json?.error?.message || ''
    code = Number(json?.error?.code || code)
    reason =
      json?.error?.details?.find((d) => d?.reason)?.reason || ''
  } catch {
    // Raw message is not JSON
  }

  if (reason === 'API_KEY_INVALID' || raw.includes('API_KEY_INVALID')) {
    const err = new Error(
      'Your GEMINI_API_KEY in server/.env is invalid or missing. Add a valid key from Google AI Studio and restart the backend.'
    )
    err.status = 400
    return err
  }

  if (parsedMessage) {
    const err = new Error(`Gemini API error: ${parsedMessage}`)
    err.status = code >= 400 && code < 600 ? code : 500
    return err
  }

  return error
}

const FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
]

function getModelCandidates() {
  const ordered = [env.GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean)
  return [...new Set(ordered)]
}

function shouldFallbackModel(error) {
  const msg = String(error?.message || '').toLowerCase()
  const status = Number(error?.status || error?.code || 0)
  return (
    [404, 429, 500, 502, 503, 504].includes(status) ||
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('404') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('deadline expired') ||
    msg.includes('timeout') ||
    msg.includes('not_found') ||
    msg.includes('no longer available')
  )
}

async function generateWithModelFallback(ai, buildRequest, { signal, onRetry }) {
  const candidates = getModelCandidates()
  let lastError
  let totalAttempts = 0

  for (let i = 0; i < candidates.length; i += 1) {
    const model = candidates[i]
    if (signal?.aborted) {
      throw new AbortError()
    }

    const timeoutSignal = AbortSignal.timeout(15000)
    const attemptSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

    try {
      const { value, attempts } = await withRetry(
        async () => ai.models.generateContent(buildRequest(model, attemptSignal)),
        {
          maxAttempts: 1,
          signal: attemptSignal,
          onRetry,
        }
      )
      return { response: value, attempts: totalAttempts + attempts, modelUsed: model }
    } catch (error) {
      if (signal?.aborted) {
        throw error
      }
      const timedOut = timeoutSignal.aborted
      if (!timedOut && (error?.isAbort || error?.name === 'AbortError')) {
        throw error
      }
      totalAttempts += error.attempts || 1
      lastError = timedOut ? new Error(`Model ${model} timed out`) : error
      if (i < candidates.length - 1 && (timedOut || shouldFallbackModel(error))) {
        if (onRetry) {
          await onRetry({
            attempt: i + 1,
            maxAttempts: candidates.length,
            delayMs: 0,
            error: lastError,
          })
        }
        continue
      }
      throw lastError
    }
  }

  throw lastError
}

function getClient() {
  if (!env.GEMINI_API_KEY) {
    throw new GeminiConfigError(
      'GEMINI_API_KEY is not configured in server/.env. Add a valid Gemini API key from Google AI Studio and restart the backend.'
    )
  }
  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
}

export async function generateTaskPlan({
  goal,
  contactsCount = 0,
  googleConnected = false,
  nowIso = new Date().toISOString(),
  signal,
}) {
  const ai = getClient()

  const prompt = [
    `Current UTC datetime: ${nowIso}`,
    `User Contacts Count: ${contactsCount}`,
    `Google Account Connected (Gmail + Calendar): ${googleConnected ? 'Yes' : 'No'}`,
    `User Goal: ${goal}`,
    '',
    'Create a concise, editable 2-to-5 step execution plan for MailPilot AI using available tools:',
    '- find_contacts: search user contacts by name, email, role, company, or tag',
    '- check_calendar_availability: inspect Google Calendar free/busy and events in an ISO-8601 window',
    '- create_email_draft: compose and save an email draft for explicit user approval (never sends automatically)',
    '- reasoning: synthesize findings or summarize results',
  ].join('\n')

  try {
    const { response, attempts } = await generateWithModelFallback(
      ai,
      (model, attemptSignal) => ({
        model,
        contents: prompt,
        config: {
          systemInstruction:
            'You are MailPilot AI planner. Output strictly valid JSON matching the requested schema. Every plan involving sending an email must end with drafting for explicit user approval, never auto-sending.',
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: 'object',
            properties: {
              steps: {
                type: 'array',
                minItems: 2,
                maxItems: 6,
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    toolHint: {
                      type: 'string',
                      enum: [
                        'find_contacts',
                        'check_calendar_availability',
                        'create_email_draft',
                        'reasoning',
                      ],
                    },
                  },
                  required: ['title', 'description', 'toolHint'],
                },
              },
            },
            required: ['steps'],
          },
          temperature: 0.2,
          abortSignal: attemptSignal,
        },
      }),
      { signal }
    )

    const rawText = response.text || '{}'
    const parsedJson = JSON.parse(rawText)
    const validated = generatedPlanSchema.parse(parsedJson)
    const steps = validated.steps.map((s, idx) => ({
      id: `step-${idx + 1}`,
      title: s.title,
      description: s.description,
      toolHint: s.toolHint || 'reasoning',
      status: 'pending',
    }))

    return { steps, attempts }
  } catch (error) {
    throw normalizeGeminiError(error)
  }
}

export async function runAgentTurn({
  contents,
  systemInstruction,
  functionDeclarations,
  signal,
  onRetry,
}) {
  const ai = getClient()

  try {
    const { response, attempts } = await generateWithModelFallback(
      ai,
      (model, attemptSignal) => ({
        model,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations }],
          temperature: 0.2,
          abortSignal: attemptSignal,
        },
      }),
      { signal, onRetry }
    )

    return { response, attempts }
  } catch (error) {
    throw normalizeGeminiError(error)
  }
}

