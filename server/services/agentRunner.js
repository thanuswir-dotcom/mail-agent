import { Task } from '../models/Task.js'
import { User } from '../models/User.js'
import { AbortError } from '../utils/retry.js'
import * as geminiService from './geminiService.js'
import { syncTaskToSupabase } from './supabaseService.js'
import {
  getGeminiFunctionDeclarations,
  invokeValidatedTool,
} from './toolRegistry.js'

const activeRuns = new Map()

export function isTaskRunning(taskId) {
  return activeRuns.has(String(taskId))
}

export function stopTaskRun(taskId) {
  const controller = activeRuns.get(String(taskId))
  if (controller) {
    controller.abort()
    return true
  }
  return false
}

function findMatchingPlanStep(plan, toolName) {
  return (
    plan.find((s) => s.status === 'pending' && s.toolHint === toolName) ||
    plan.find((s) => s.status === 'pending')
  )
}

export async function executeTaskAgent({
  taskId,
  userId,
  aiClient,
  googleTools,
}) {
  const key = String(taskId)
  if (activeRuns.has(key)) {
    throw new Error('Agent is already running for this task.')
  }

  const controller = new AbortController()
  activeRuns.set(key, controller)
  const { signal } = controller

  const runTurnFn = aiClient?.runAgentTurn || geminiService.runAgentTurn

  const task = await Task.findOne({ _id: taskId, userId })
  const user = await User.findById(userId)

  if (!task || !user) {
    activeRuns.delete(key)
    throw new Error('Task or user not found.')
  }

  let stepCounter = task.trace.length

  const appendTrace = async (entry) => {
    stepCounter += 1
    task.trace.push({
      stepIndex: stepCounter,
      timestamp: new Date(),
      attempts: 1,
      durationMs: 0,
      error: '',
      ...entry,
    })
    await task.save()
    return task.trace[task.trace.length - 1]
  }

  try {
    task.status = 'running'
    task.stoppedByUser = false
    task.error = ''
    task.startedAt = new Date()
    task.completedAt = null
    task.plan = task.plan.map((s) => ({
      ...(typeof s.toObject === 'function' ? s.toObject() : s),
      status: 'pending',
    }))
    await task.save()

    await appendTrace({
      type: 'plan',
      title: 'Execution started with active task plan',
      toolName: '',
      input: { goal: task.goal, planSteps: task.plan },
      output: { googleConnected: Boolean(user.googleTokens?.refresh_token || user.googleTokens?.access_token) },
      status: 'completed',
    })

    const nowIso = new Date().toISOString()
    const planText = task.plan
      .map((s, idx) => `${idx + 1}. [${s.toolHint || 'reasoning'}] ${s.title}${s.description ? ` — ${s.description}` : ''}`)
      .join('\n')

    const systemInstruction = [
      'You are MailPilot AI, a tool-using smart email agent.',
      `Current UTC datetime: ${nowIso}`,
      `Authenticated user: ${user.name} (${user.email})`,
      '',
      'Rules:',
      '1. Follow the user-approved task plan below step by step.',
      '2. Use `find_contacts` to look up recipients whenever a name, role, or company is mentioned.',
      '3. Use `check_calendar_availability` whenever scheduling, meetings, or availability are involved.',
      '4. Determine whether the recipient is `official` (work/client/boss/formal) or `unofficial` (friend/family/casual/personal, or marked relationshipType="unofficial" in Contacts).',
      '5. For `unofficial` recipients, write a warm, friendly email or letter with extra expressive emojis throughout the subject and message, and pass `recipientType: "unofficial"` to `create_email_draft`.',
      '6. Use `create_email_draft` to compose the email for explicit user approval. NEVER claim an email has been sent.',
      '7. If a tool returns a fallback or empty result, adapt transparently and explain it in your final summary.',
      '8. When finished, provide a concise summary of what tools ran and what draft is ready for approval.',
    ].join('\n')

    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: `Goal: ${task.goal}\n\nEditable Task Plan:\n${planText}`,
          },
        ],
      },
    ]

    const declarations = getGeminiFunctionDeclarations()
    const maxTurns = 8
    let finalSummary = ''

    for (let turn = 1; turn <= maxTurns; turn += 1) {
      if (signal.aborted) {
        throw new AbortError()
      }

      const turnStart = Date.now()
      const { response, attempts } = await runTurnFn({
        contents,
        systemInstruction,
        functionDeclarations: declarations,
        signal,
        onRetry: async ({ attempt, maxAttempts, delayMs, error }) => {
          await appendTrace({
            type: 'retry',
            title: `Retrying Gemini reasoning call (${attempt}/${maxAttempts})`,
            toolName: 'gemini_model',
            input: { turn, delayMs },
            output: null,
            status: 'running',
            attempts: attempt,
            error: error.message,
          })
        },
      })

      if (signal.aborted) {
        throw new AbortError()
      }

      const candidateContent = response?.candidates?.[0]?.content
      if (candidateContent) {
        contents.push(candidateContent)
      }

      const functionCalls = response?.functionCalls || []
      const text = (response?.text || '').trim()

      if (text && functionCalls.length > 0) {
        await appendTrace({
          type: 'reasoning',
          title: `Agent thought (turn ${turn})`,
          toolName: '',
          input: null,
          output: { message: text },
          status: 'completed',
          attempts,
          durationMs: Date.now() - turnStart,
        })
      }

      if (functionCalls.length === 0) {
        finalSummary = text || 'Task completed.'
        await appendTrace({
          type: 'reasoning',
          title: 'Final agent summary',
          toolName: '',
          input: null,
          output: { summary: finalSummary },
          status: 'completed',
          attempts,
          durationMs: Date.now() - turnStart,
        })
        break
      }

      const functionResponseParts = []

      for (const call of functionCalls) {
        if (signal.aborted) {
          throw new AbortError()
        }

        const matchedStep = findMatchingPlanStep(task.plan, call.name)
        if (matchedStep) {
          matchedStep.status = 'running'
        }

        stepCounter += 1
        const traceIndex = task.trace.length
        task.trace.push({
          stepIndex: stepCounter,
          type: 'tool_call',
          title: `Calling tool: ${call.name}`,
          toolName: call.name,
          input: call.args || {},
          output: null,
          status: 'running',
          attempts: 1,
          durationMs: 0,
          error: '',
          timestamp: new Date(),
        })
        await task.save()

        const toolStart = Date.now()

        try {
          const result = await invokeValidatedTool(call.name, call.args, {
            user,
            task,
            signal,
            googleTools,
            onRetry: async ({ attempt, maxAttempts, delayMs, error }) => {
              await appendTrace({
                type: 'retry',
                title: `Retrying tool ${call.name} (${attempt}/${maxAttempts})`,
                toolName: call.name,
                input: { delayMs },
                output: null,
                status: 'running',
                attempts: attempt,
                error: error.message,
              })
            },
          })

          const traceItem = task.trace[traceIndex]
          traceItem.input = result.validatedInput
          traceItem.output = result.validatedOutput
          traceItem.attempts = result.attempts
          traceItem.durationMs = Date.now() - toolStart
          traceItem.status = result.fallbackUsed ? 'failed' : 'completed'
          traceItem.error = result.fallbackError || ''

          if (matchedStep) {
            matchedStep.status = result.fallbackUsed ? 'failed' : 'completed'
          }
          await task.save()

          if (result.fallbackUsed) {
            await appendTrace({
              type: 'fallback',
              title: `Fallback response used for ${call.name}`,
              toolName: call.name,
              input: result.validatedInput,
              output: result.validatedOutput,
              status: 'completed',
              error: result.fallbackError,
            })
          }

          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: { output: result.validatedOutput },
            },
          })
        } catch (toolError) {
          if (toolError?.isAbort || toolError?.name === 'AbortError' || signal.aborted) {
            const traceItem = task.trace[traceIndex]
            traceItem.status = 'failed'
            traceItem.error = 'Stopped by user'
            traceItem.durationMs = Date.now() - toolStart
            if (matchedStep) matchedStep.status = 'failed'
            await task.save()
            throw new AbortError()
          }

          const traceItem = task.trace[traceIndex]
          traceItem.status = 'failed'
          traceItem.error = toolError.message
          traceItem.durationMs = Date.now() - toolStart
          if (matchedStep) {
            matchedStep.status = 'failed'
          }
          await task.save()

          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: call.name,
              response: { error: toolError.message },
            },
          })
        }
      }

      contents.push({
        role: 'user',
        parts: functionResponseParts,
      })
    }

    if (signal.aborted) {
      throw new AbortError()
    }

    for (const step of task.plan) {
      if (step.status === 'pending' || step.status === 'running') {
        step.status = 'completed'
      }
    }

    task.status = 'completed'
    task.finalSummary =
      finalSummary ||
      (task.emailDraft?.approvalStatus === 'pending_approval'
        ? 'Email draft prepared and awaiting your explicit approval.'
        : 'Agent run completed.')
    task.completedAt = new Date()
    await task.save()
    void syncTaskToSupabase(task, user)
    return task
  } catch (error) {
    for (const step of task.plan) {
      if (step.status === 'running') {
        step.status = 'failed'
      }
    }
    for (const entry of task.trace) {
      if (entry.status === 'running') {
        entry.status = 'failed'
        entry.error = entry.error || error.message
      }
    }

    const stopped = Boolean(error?.isAbort || error?.name === 'AbortError' || signal.aborted)
    task.status = 'failed'
    task.stoppedByUser = stopped
    task.error = stopped ? 'Agent execution stopped by user.' : error.message
    task.completedAt = new Date()

    stepCounter += 1
    task.trace.push({
      stepIndex: stepCounter,
      type: stopped ? 'system' : 'error',
      title: stopped ? 'Agent stopped by user' : 'Agent execution failed',
      toolName: '',
      input: null,
      output: null,
      status: 'failed',
      attempts: error.attempts || 1,
      durationMs: 0,
      error: task.error,
      timestamp: new Date(),
    })

    await task.save()
    void syncTaskToSupabase(task, user)
    return task
  } finally {
    activeRuns.delete(key)
  }
}

