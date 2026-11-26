import { waitUntil } from '@vercel/functions'
import express from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { executeTaskAgent, isTaskRunning, stopTaskRun } from '../services/agentRunner.js'
import {
  countContacts,
  createTask,
  deleteTask,
  findTaskById,
  isValidId,
  listTasks,
  saveTask,
} from '../services/dbStore.js'
import { deliverApprovedEmail } from '../services/emailDeliveryService.js'
import { generateTaskPlan } from '../services/geminiService.js'
import { enhanceUnofficialEmail, sanitizeOfficialEmail } from '../services/toolRegistry.js'

const router = express.Router()

const createPlanSchema = z.object({
  goal: z.string().trim().min(5, 'Please describe your email goal (at least 5 characters)').max(2000),
  toneMode: z.enum(['auto', 'official', 'unofficial']).optional().default('auto'),
})

const updatePlanSchema = z.object({
  plan: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        title: z.string().trim().min(2, 'Step title is required').max(200),
        description: z.string().trim().max(600).optional().default(''),
        toolHint: z
          .enum(['find_contacts', 'check_calendar_availability', 'create_email_draft', 'reasoning', ''])
          .optional()
          .default('reasoning'),
        status: z.enum(['pending', 'running', 'completed', 'failed']).optional().default('pending'),
      })
    )
    .min(1, 'Plan must contain at least one step')
    .max(12),
})

const updateDraftSchema = z.object({
  recipientName: z.string().trim().max(150).optional().default(''),
  recipientEmail: z.string().trim().email('Valid recipient email is required'),
  recipientType: z.enum(['official', 'unofficial']).optional().default('official'),
  enhanceEmojis: z.boolean().optional().default(false),
  cc: z.array(z.string().trim().email()).max(10).optional().default([]),
  subject: z.string().trim().min(1, 'Subject is required').max(300),
  body: z.string().trim().min(1, 'Message body is required').max(20000),
})

const approveSendSchema = z.object({
  confirmed: z.literal(true, {
    errorMap: () => ({ message: 'Explicit user confirmation is required before sending an email.' }),
  }),
  preferredMethod: z
    .enum(['auto', 'gmail_oauth', 'smtp', 'ethereal_sandbox'])
    .optional()
    .default('auto'),
  recipientName: z.string().trim().max(150).optional(),
  recipientEmail: z.string().trim().email().optional(),
  recipientType: z.enum(['official', 'unofficial']).optional(),
  cc: z.array(z.string().trim().email()).max(10).optional(),
  subject: z.string().trim().min(1).max(300).optional(),
  body: z.string().trim().min(1).max(20000).optional(),
})

router.use(requireAuth)

router.get('/', async (req, res) => {
  try {
    const rawStatus = String(req.query.status || '').trim()
    const status = ['pending', 'running', 'completed', 'failed'].includes(rawStatus)
      ? rawStatus
      : ''

    const tasks = await listTasks(req.user._id, status)
    return res.json({ tasks })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load task history.', message: error.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID.' })
    }
    const task = await findTaskById(req.params.id, req.user._id)
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' })
    }
    return res.json({ task })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load task.', message: error.message })
  }
})

router.post('/plan', async (req, res) => {
  try {
    const parsed = createPlanSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid goal input',
      })
    }

    const contactsCount = await countContacts(req.user._id)
    const googleConnected = Boolean(
      req.user.googleTokens?.refresh_token || req.user.googleTokens?.access_token
    )

    const { steps, attempts } = await generateTaskPlan({
      goal: parsed.data.goal,
      contactsCount,
      googleConnected,
    })

    const task = await createTask({
      userId: req.user._id,
      goal: parsed.data.goal,
      toneMode: parsed.data.toneMode,
      status: 'pending',
      plan: steps,
      trace: [
        {
          stepIndex: 1,
          type: 'plan',
          title: 'Generated editable task plan with Gemini',
          toolName: 'gemini_planner',
          input: { goal: parsed.data.goal, toneMode: parsed.data.toneMode },
          output: { steps },
          status: 'completed',
          attempts,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        },
      ],
    })

    return res.status(201).json({ task })
  } catch (error) {
    const status = error.status || 500
    return res.status(status).json({
      error: error.message || 'Failed to generate task plan.',
    })
  }
})

router.patch('/:id/plan', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID.' })
    }
    const parsed = updatePlanSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid plan payload',
      })
    }

    const task = await findTaskById(req.params.id, req.user._id)
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' })
    }
    if (task.status === 'running' || isTaskRunning(task._id)) {
      return res.status(409).json({ error: 'Cannot edit plan while the agent is running.' })
    }

    task.plan = parsed.data.plan.map((s) => ({ ...s, status: 'pending' }))
    task.trace.push({
      stepIndex: task.trace.length + 1,
      type: 'plan',
      title: 'User updated task plan',
      toolName: '',
      input: { steps: task.plan },
      output: null,
      status: 'completed',
      timestamp: new Date().toISOString(),
    })
    const saved = await saveTask(task)

    return res.json({ task: saved })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update plan.', message: error.message })
  }
})

router.post('/:id/run', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID.' })
    }

    const task = await findTaskById(req.params.id, req.user._id)
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' })
    }
    if (task.status === 'running' || isTaskRunning(task._id)) {
      return res.status(409).json({ error: 'Agent is already running for this task.' })
    }

    task.status = 'running'
    task.stoppedByUser = false
    task.error = ''
    const saved = await saveTask(task)

    const launchAgent = () =>
      executeTaskAgent({
        taskId: saved._id,
        userId: req.user._id,
      }).catch(() => {
        // Handled and persisted inside executeTaskAgent
      })

    if (process.env.VERCEL) {
      waitUntil(launchAgent())
    } else {
      setImmediate(() => void launchAgent())
    }

    return res.status(202).json({ task: saved })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to start agent.', message: error.message })
  }
})

router.post('/:id/stop', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID.' })
    }

    const task = await findTaskById(req.params.id, req.user._id)
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' })
    }

    const signaled = stopTaskRun(task._id)

    if (!signaled && task.status === 'running') {
      task.status = 'failed'
      task.stoppedByUser = true
      task.error = 'Agent execution stopped by user.'
      task.completedAt = new Date().toISOString()
      task.trace.push({
        stepIndex: task.trace.length + 1,
        type: 'system',
        title: 'Agent stopped by user',
        toolName: '',
        input: null,
        output: null,
        status: 'failed',
        error: task.error,
        timestamp: new Date().toISOString(),
      })
      await saveTask(task)
    }

    const refreshed = await findTaskById(task._id, req.user._id)
    return res.json({ task: refreshed, stopRequested: true })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to stop agent.', message: error.message })
  }
})

router.patch('/:id/draft', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID.' })
    }
    const parsed = updateDraftSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid draft fields',
      })
    }

    const task = await findTaskById(req.params.id, req.user._id)
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' })
    }
    if (task.emailDraft?.approvalStatus === 'approved_and_sent') {
      return res.status(409).json({ error: 'Email has already been sent and cannot be edited.' })
    }

    const { enhanceEmojis, ...draftFields } = parsed.data
    let nextSubject = draftFields.subject
    let nextBody = draftFields.body
    if (draftFields.recipientType === 'unofficial' && enhanceEmojis) {
      const enhanced = enhanceUnofficialEmail({ subject: nextSubject, body: nextBody })
      nextSubject = enhanced.subject
      nextBody = enhanced.body
    } else if (draftFields.recipientType === 'official') {
      const sanitized = sanitizeOfficialEmail({ subject: nextSubject, body: nextBody })
      nextSubject = sanitized.subject
      nextBody = sanitized.body
    }

    task.emailDraft = {
      ...(task.emailDraft || {}),
      ...draftFields,
      subject: nextSubject,
      body: nextBody,
      approvalStatus: 'pending_approval',
    }
    const saved = await saveTask(task)
    return res.json({ task: saved })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update draft.', message: error.message })
  }
})

router.post('/:id/approve-send', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID.' })
    }
    const parsed = approveSendSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Explicit confirmation is required.',
      })
    }

    const task = await findTaskById(req.params.id, req.user._id)
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' })
    }
    if (task.status === 'running' || isTaskRunning(task._id)) {
      return res.status(409).json({ error: 'Wait for or stop the running agent before sending.' })
    }
    if (task.emailDraft?.approvalStatus === 'approved_and_sent') {
      return res.status(409).json({ error: 'This email has already been sent.' })
    }

    const finalTo = parsed.data.recipientEmail || task.emailDraft?.recipientEmail
    const finalCc = parsed.data.cc ?? task.emailDraft?.cc ?? []
    const finalType = parsed.data.recipientType || task.emailDraft?.recipientType || 'official'
    let finalSubject = parsed.data.subject || task.emailDraft?.subject
    let finalBody = parsed.data.body || task.emailDraft?.body
    const finalName = parsed.data.recipientName ?? task.emailDraft?.recipientName ?? ''

    if (!finalTo || !finalSubject || !finalBody) {
      return res.status(400).json({ error: 'Draft must include recipient email, subject, and message body.' })
    }

    if (finalType === 'unofficial') {
      const enhanced = enhanceUnofficialEmail({ subject: finalSubject, body: finalBody })
      finalSubject = enhanced.subject
      finalBody = enhanced.body
    } else {
      const sanitized = sanitizeOfficialEmail({ subject: finalSubject, body: finalBody })
      finalSubject = sanitized.subject
      finalBody = sanitized.body
    }

    const sentResult = await deliverApprovedEmail(req.user, {
      gmailDraftId: task.emailDraft?.gmailDraftId || '',
      to: finalTo,
      cc: finalCc,
      subject: finalSubject,
      body: finalBody,
      preferredMethod: parsed.data.preferredMethod,
    })

    const now = new Date().toISOString()
    task.emailDraft = {
      ...(task.emailDraft || {}),
      recipientName: finalName,
      recipientEmail: finalTo,
      recipientType: finalType,
      cc: finalCc,
      subject: finalSubject,
      body: finalBody,
      gmailMessageId: sentResult.gmailMessageId || '',
      gmailThreadId: sentResult.gmailThreadId || '',
      deliveryMethod: sentResult.deliveryMethod || 'none',
      previewUrl: sentResult.previewUrl || '',
      approvalStatus: 'approved_and_sent',
      approvedAt: now,
      sentAt: now,
      error: '',
    }

    task.trace.push({
      stepIndex: task.trace.length + 1,
      type: 'approval',
      title: `User explicitly approved and sent email (${sentResult.deliveryMethod})`,
      toolName: 'send_approved_email',
      input: {
        to: finalTo,
        cc: finalCc,
        recipientType: finalType,
        deliveryMethod: sentResult.deliveryMethod,
        subject: finalSubject,
      },
      output: {
        deliveryMethod: sentResult.deliveryMethod,
        messageId: sentResult.gmailMessageId,
        threadId: sentResult.gmailThreadId,
        previewUrl: sentResult.previewUrl || undefined,
        sentAt: now,
      },
      status: 'completed',
      attempts: sentResult.attempts || 1,
      timestamp: now,
    })

    const saved = await saveTask(task)
    return res.json({ task: saved })
  } catch (error) {
    const status = error.status || 500
    return res.status(status).json({
      error: error.message || 'Failed to send email via Gmail API.',
    })
  }
})

router.post('/:id/reject-draft', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID.' })
    }
    const task = await findTaskById(req.params.id, req.user._id)
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' })
    }
    if (task.emailDraft?.approvalStatus === 'approved_and_sent') {
      return res.status(409).json({ error: 'Cannot reject an email that was already sent.' })
    }

    task.emailDraft.approvalStatus = 'rejected'
    task.trace.push({
      stepIndex: task.trace.length + 1,
      type: 'approval',
      title: 'User rejected email draft (not sent)',
      toolName: '',
      input: null,
      output: { approvalStatus: 'rejected' },
      status: 'completed',
      timestamp: new Date().toISOString(),
    })
    const saved = await saveTask(task)
    return res.json({ task: saved })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to reject draft.', message: error.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID.' })
    }
    const task = await findTaskById(req.params.id, req.user._id)
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' })
    }
    if (task.status === 'running' || isTaskRunning(task._id)) {
      return res.status(409).json({ error: 'Stop the running task before deleting it.' })
    }
    await deleteTask(req.params.id, req.user._id)
    return res.json({ deletedId: req.params.id })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete task.', message: error.message })
  }
})

export default router
