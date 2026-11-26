import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import http from 'node:http'
import { createApp } from '../app.js'
import { executeTaskAgent, stopTaskRun } from '../services/agentRunner.js'
import {
  createTask,
  findUserById,
  resetMemoryStore,
} from '../services/dbStore.js'
import { countEmojis, invokeValidatedTool } from '../services/toolRegistry.js'

let server
let baseUrl

async function request(path, { method = 'GET', token = '', body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

before(async () => {
  process.env.NODE_ENV = 'test'
  resetMemoryStore()
  const app = createApp()
  server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  baseUrl = `http://127.0.0.1:${addr.port}`
})

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve))
  }
})

describe('MailPilot AI Backend Integration & Agent Tests', () => {
  let token = ''
  let userId = ''

  it('registers, hashes password, logs in, and fetches authenticated profile', async () => {
    const reg = await request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Test Pilot',
        email: 'pilot@example.com',
        password: 'StrongPassword123',
      },
    })
    assert.equal(reg.status, 201)
    assert.ok(reg.data.token)
    assert.equal(reg.data.user.email, 'pilot@example.com')

    const dbUser = await findUserById(reg.data.user.id)
    assert.ok(dbUser.passwordHash.startsWith('$2'))
    assert.notEqual(dbUser.passwordHash, 'StrongPassword123')

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'pilot@example.com', password: 'StrongPassword123' },
    })
    assert.equal(login.status, 200)
    token = login.data.token
    userId = login.data.user.id

    const unauth = await request('/api/auth/me')
    assert.equal(unauth.status, 401)

    const me = await request('/api/auth/me', { token })
    assert.equal(me.status, 200)
    assert.equal(me.data.user.email, 'pilot@example.com')
  })

  it('creates, searches, seeds, and updates contacts', async () => {
    const created = await request('/api/contacts', {
      method: 'POST',
      token,
      body: {
        name: 'Sarah Chen',
        email: 'sarah@design.example.com',
        company: 'Acme Design',
        role: 'Lead Designer',
        tags: ['design'],
      },
    })
    assert.equal(created.status, 201)

    const search = await request('/api/contacts?q=Sarah', { token })
    assert.equal(search.status, 200)
    assert.equal(search.data.contacts.length, 1)
    assert.equal(search.data.contacts[0].email, 'sarah@design.example.com')

    const seed = await request('/api/contacts/seed', { method: 'POST', token })
    assert.equal(seed.status, 200)
    assert.ok(seed.data.contacts.length >= 4)
  })

  it('validates tool inputs and outputs with Zod', async () => {
    const user = await findUserById(userId)
    const task = await createTask({ userId, goal: 'Test Zod validation', status: 'pending' })

    await assert.rejects(
      () =>
        invokeValidatedTool(
          'create_email_draft',
          { recipientEmail: 'not-an-email', subject: 'Hi', body: 'Hello' },
          { user, task }
        ),
      /Tool input validation failed/
    )

    const contactsRes = await invokeValidatedTool(
      'find_contacts',
      { query: 'Sarah' },
      { user, task }
    )
    assert.equal(contactsRes.validatedOutput.totalFound >= 1, true)

    const unofficialTask = await createTask({
      userId,
      goal: 'Send a friendly hi letter to my friend Bhuvana',
      status: 'pending',
    })
    const draftRes = await invokeValidatedTool(
      'create_email_draft',
      {
        recipientName: 'Bhuvana',
        recipientEmail: 'bhuvana@example.com',
        recipientType: 'unofficial',
        subject: 'Hey Bhuvana',
        body: 'Hi Bhuvana,\n\nHope your day is going great.\n\nTalk soon,\nTest Pilot',
      },
      { user, task: unofficialTask }
    )
    assert.equal(draftRes.validatedOutput.recipientType, 'unofficial')
    assert.equal(draftRes.validatedOutput.emojisEnhanced, true)
    assert.match(unofficialTask.emailDraft.subject, /\p{Extended_Pictographic}/u)
    assert.match(unofficialTask.emailDraft.body, /\p{Extended_Pictographic}/u)
  })

  it('runs tool-calling agent loop, records trace, handles calendar fallback, and never auto-sends', async () => {
    const task = await createTask({
      userId,
      goal: 'Find Sarah from design, check calendar, and draft a 30-min sync email',
      status: 'pending',
      plan: [
        { id: 'step-1', title: 'Find Sarah', toolHint: 'find_contacts', status: 'pending' },
        {
          id: 'step-2',
          title: 'Check calendar',
          toolHint: 'check_calendar_availability',
          status: 'pending',
        },
        { id: 'step-3', title: 'Create draft', toolHint: 'create_email_draft', status: 'pending' },
      ],
    })

    let turn = 0
    const fakeAiClient = {
      async runAgentTurn() {
        turn += 1
        if (turn === 1) {
          return {
            attempts: 1,
            response: {
              text: 'Looking up Sarah in contacts first.',
              candidates: [{ content: { role: 'model', parts: [{ text: 'Looking up Sarah.' }] } }],
              functionCalls: [{ id: 'c1', name: 'find_contacts', args: { query: 'Sarah' } }],
            },
          }
        }
        if (turn === 2) {
          return {
            attempts: 1,
            response: {
              text: '',
              candidates: [{ content: { role: 'model', parts: [] } }],
              functionCalls: [
                {
                  id: 'c2',
                  name: 'check_calendar_availability',
                  args: {
                    startIso: '2026-11-26T14:00:00Z',
                    endIso: '2026-11-26T17:00:00Z',
                    timeZone: 'UTC',
                  },
                },
              ],
            },
          }
        }
        if (turn === 3) {
          return {
            attempts: 1,
            response: {
              text: '',
              candidates: [{ content: { role: 'model', parts: [] } }],
              functionCalls: [
                {
                  id: 'c3',
                  name: 'create_email_draft',
                  args: {
                    recipientName: 'Sarah Chen',
                    recipientEmail: 'sarah@design.example.com',
                    subject: '30-Minute Design Sync Tomorrow',
                    body: 'Hi Sarah,\n\nWould you be available for a 30-minute design sync tomorrow afternoon?\n\nBest,\nTest Pilot',
                  },
                },
              ],
            },
          }
        }
        return {
          attempts: 1,
          response: {
            text: 'Draft prepared for Sarah Chen and awaiting your explicit approval.',
            candidates: [{ content: { role: 'model', parts: [{ text: 'Done.' }] } }],
            functionCalls: [],
          },
        }
      },
    }

    const fakeGoogleTools = {
      async checkCalendarAvailability() {
        throw new Error('Google Calendar not connected')
      },
      async createGmailDraft() {
        return { gmailDraftId: 'draft_123', gmailMessageId: 'msg_123', gmailThreadId: 'thr_123', attempts: 1 }
      },
    }

    const completed = await executeTaskAgent({
      taskId: task._id,
      userId,
      aiClient: fakeAiClient,
      googleTools: fakeGoogleTools,
    })

    assert.equal(completed.status, 'completed')
    assert.equal(completed.emailDraft.approvalStatus, 'pending_approval')
    assert.equal(completed.emailDraft.gmailDraftId, 'draft_123')
    assert.equal(completed.emailDraft.sentAt, null)
    assert.ok(completed.trace.some((t) => t.toolName === 'find_contacts' && t.status === 'completed'))
    assert.ok(completed.trace.some((t) => t.type === 'fallback' && t.toolName === 'check_calendar_availability'))
    assert.ok(completed.trace.some((t) => t.toolName === 'create_email_draft' && t.status === 'completed'))

    const badApprove = await request(`/api/tasks/${task._id}/approve-send`, {
      method: 'POST',
      token,
      body: { confirmed: false },
    })
    assert.equal(badApprove.status, 400)
  })

  it('supports editing task plan and stopping a running agent cleanly', async () => {
    const task = await createTask({
      userId,
      goal: 'Stoppable task test',
      status: 'pending',
      plan: [{ id: 'step-1', title: 'Initial step', toolHint: 'reasoning', status: 'pending' }],
    })

    const patched = await request(`/api/tasks/${task._id}/plan`, {
      method: 'PATCH',
      token,
      body: {
        plan: [
          {
            id: 'step-1',
            title: 'Edited step title',
            description: 'Custom instructions',
            toolHint: 'find_contacts',
          },
        ],
      },
    })
    assert.equal(patched.status, 200)
    assert.equal(patched.data.task.plan[0].title, 'Edited step title')

    const slowAiClient = {
      async runAgentTurn({ signal }) {
        await new Promise((_, reject) => {
          const timer = setTimeout(() => reject(new Error('timeout')), 5000)
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer)
              const err = new Error('Aborted')
              err.name = 'AbortError'
              reject(err)
            },
            { once: true }
          )
        })
      },
    }

    const runPromise = executeTaskAgent({
      taskId: task._id,
      userId,
      aiClient: slowAiClient,
    })

    await new Promise((r) => setTimeout(r, 80))
    const stopped = stopTaskRun(task._id)
    assert.equal(stopped, true)

    const result = await runPromise
    assert.equal(result.status, 'failed')
    assert.equal(result.stoppedByUser, true)
  })

  it('enforces zero emojis on official drafts even when tone is overridden or saved with emojis', async () => {
    const task = await createTask({
      userId,
      goal: 'Write a birthday invite to my friend bob@example.com',
      toneMode: 'official',
      status: 'pending',
      plan: [{ id: 'step-1', title: 'Draft email', toolHint: 'create_email_draft', status: 'pending' }],
    })

    const patched = await request(`/api/tasks/${task._id}/draft`, {
      method: 'PATCH',
      token,
      body: {
        recipientName: 'Bob Smith',
        recipientEmail: 'bob@example.com',
        recipientType: 'official',
        enhanceEmojis: true,
        subject: 'Quarterly Strategy Review 🚀✨',
        body: 'Dear Bob 😊,\n\nPlease find the Q4 summary attached 🙌.\n\nRegards,\nTest Pilot',
      },
    })
    assert.equal(patched.status, 200)
    assert.equal(patched.data.task.emailDraft.recipientType, 'official')
    assert.equal(countEmojis(patched.data.task.emailDraft.subject), 0)
    assert.equal(countEmojis(patched.data.task.emailDraft.body), 0)
    assert.equal(patched.data.task.emailDraft.subject, 'Quarterly Strategy Review')
  })
})
