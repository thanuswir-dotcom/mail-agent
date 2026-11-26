import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

let cachedClient = null
let cachedKeySignature = ''

const memUsers = new Map()
const memContacts = new Map()
const memTasks = new Map()

function useMemoryStore() {
  return process.env.NODE_ENV === 'test'
}

export function resetMemoryStore() {
  memUsers.clear()
  memContacts.clear()
  memTasks.clear()
}

export function isSupabaseConfigured() {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY)
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in environment variables.'
    )
  }
  const signature = `${env.SUPABASE_URL}|${env.SUPABASE_SECRET_KEY}`
  if (!cachedClient || cachedKeySignature !== signature) {
    cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
    cachedKeySignature = signature
  }
  return cachedClient
}

export function isValidId(id) {
  return typeof id === 'string' && id.trim().length > 0 && id.trim().length <= 128
}

function toIsoOrNull(val) {
  if (!val) return null
  const d = val instanceof Date ? val : new Date(val)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function mapUserFromRow(row) {
  if (!row) return null
  return {
    _id: row.mongo_id,
    id: row.mongo_id,
    name: row.name || '',
    email: String(row.email || '').toLowerCase(),
    passwordHash: row.password_hash || '',
    googleTokens: row.google_tokens || {},
    smtpConfig: row.smtp_config || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapUserToRow(user) {
  const googleTokens = user.googleTokens || {}
  const smtpConfig = user.smtpConfig || {}
  return {
    mongo_id: String(user._id || user.id),
    name: user.name || '',
    email: String(user.email || '').toLowerCase(),
    password_hash: user.passwordHash || '',
    google_connected: Boolean(googleTokens.refresh_token || googleTokens.access_token),
    google_email: googleTokens.email || '',
    google_tokens: googleTokens,
    smtp_connected: Boolean(smtpConfig.email && smtpConfig.appPassword),
    smtp_email: smtpConfig.email || '',
    smtp_host: smtpConfig.host || 'smtp.gmail.com',
    smtp_config: smtpConfig,
    created_at: toIsoOrNull(user.createdAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export function toSafeProfile(user) {
  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    googleConnected: Boolean(
      user.googleTokens?.refresh_token || user.googleTokens?.access_token
    ),
    googleEmail: user.googleTokens?.email || '',
    smtpConnected: Boolean(user.smtpConfig?.email && user.smtpConfig?.appPassword),
    smtpEmail: user.smtpConfig?.email || '',
    smtpHost: user.smtpConfig?.host || 'smtp.gmail.com',
    createdAt: user.createdAt,
  }
}

function mapContactFromRow(row) {
  if (!row) return null
  return {
    _id: row.mongo_id,
    userId: row.user_mongo_id,
    name: row.name || '',
    email: String(row.email || '').toLowerCase(),
    company: row.company || '',
    role: row.role || '',
    relationshipType: row.relationship_type === 'unofficial' ? 'unofficial' : 'official',
    notes: row.notes || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapContactToRow(contact) {
  return {
    mongo_id: String(contact._id),
    user_mongo_id: String(contact.userId),
    name: contact.name || '',
    email: String(contact.email || '').toLowerCase(),
    company: contact.company || '',
    role: contact.role || '',
    relationship_type: contact.relationshipType === 'unofficial' ? 'unofficial' : 'official',
    notes: contact.notes || '',
    tags: Array.isArray(contact.tags) ? contact.tags : [],
    created_at: toIsoOrNull(contact.createdAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function defaultEmailDraft() {
  return {
    recipientName: '',
    recipientEmail: '',
    recipientType: 'official',
    cc: [],
    subject: '',
    body: '',
    gmailDraftId: '',
    gmailMessageId: '',
    gmailThreadId: '',
    gmailDraftCreated: false,
    deliveryMethod: 'none',
    previewUrl: '',
    approvalStatus: 'none',
    approvedAt: null,
    sentAt: null,
    error: '',
  }
}

function mapTaskFromRow(row) {
  if (!row) return null
  return {
    _id: row.mongo_id,
    userId: row.user_mongo_id,
    goal: row.goal || '',
    status: row.status || 'pending',
    plan: Array.isArray(row.plan) ? row.plan : [],
    trace: Array.isArray(row.trace) ? row.trace : [],
    emailDraft: { ...defaultEmailDraft(), ...(row.email_draft || {}) },
    finalSummary: row.final_summary || '',
    error: row.error || '',
    stoppedByUser: Boolean(row.stopped_by_user),
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTaskToRow(task) {
  return {
    mongo_id: String(task._id),
    user_mongo_id: String(task.userId),
    goal: task.goal || '',
    status: task.status || 'pending',
    plan: Array.isArray(task.plan) ? task.plan : [],
    trace: Array.isArray(task.trace) ? task.trace : [],
    email_draft: { ...defaultEmailDraft(), ...(task.emailDraft || {}) },
    final_summary: task.finalSummary || '',
    error: task.error || '',
    stopped_by_user: Boolean(task.stoppedByUser),
    started_at: toIsoOrNull(task.startedAt),
    completed_at: toIsoOrNull(task.completedAt),
    created_at: toIsoOrNull(task.createdAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

// --- Users ---

export async function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  if (useMemoryStore()) {
    for (const u of memUsers.values()) {
      if (u.email === normalized) return structuredClone(u)
    }
    return null
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('mailpilot_users')
    .select('*')
    .eq('email', normalized)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return mapUserFromRow(data)
}

export async function findUserById(id) {
  const key = String(id || '')
  if (useMemoryStore()) {
    const u = memUsers.get(key)
    return u ? structuredClone(u) : null
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('mailpilot_users')
    .select('*')
    .eq('mongo_id', key)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return mapUserFromRow(data)
}

export async function createUser({ name, email, passwordHash }) {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const user = {
    _id: id,
    id,
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    passwordHash,
    googleTokens: {},
    smtpConfig: {},
    createdAt: now,
    updatedAt: now,
  }
  if (useMemoryStore()) {
    for (const existing of memUsers.values()) {
      if (existing.email === user.email) {
        const err = new Error('Duplicate email')
        err.code = '23505'
        throw err
      }
    }
    memUsers.set(id, structuredClone(user))
    return user
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('mailpilot_users')
    .insert(mapUserToRow(user))
    .select('*')
    .single()
  if (error) {
    const err = new Error(error.message)
    err.code = error.code
    throw err
  }
  return mapUserFromRow(data)
}

export async function saveUser(user) {
  const key = String(user._id || user.id)
  if (useMemoryStore()) {
    const next = { ...structuredClone(user), updatedAt: new Date().toISOString() }
    memUsers.set(key, next)
    return structuredClone(next)
  }
  const supabase = getSupabaseClient()
  const row = mapUserToRow(user)
  const { data, error } = await supabase
    .from('mailpilot_users')
    .update({
      name: row.name,
      email: row.email,
      password_hash: row.password_hash,
      google_connected: row.google_connected,
      google_email: row.google_email,
      google_tokens: row.google_tokens,
      smtp_connected: row.smtp_connected,
      smtp_email: row.smtp_email,
      smtp_host: row.smtp_host,
      smtp_config: row.smtp_config,
      updated_at: row.updated_at,
    })
    .eq('mongo_id', key)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapUserFromRow(data)
}

export async function updateUserGoogleTokens(userId, tokenPatch) {
  const user = await findUserById(userId)
  if (!user) return null
  user.googleTokens = {
    ...(user.googleTokens || {}),
    ...tokenPatch,
  }
  return saveUser(user)
}

// --- Contacts ---

function matchesContactQuery(contact, query) {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    contact.name.toLowerCase().includes(q) ||
    contact.email.toLowerCase().includes(q) ||
    (contact.company || '').toLowerCase().includes(q) ||
    (contact.role || '').toLowerCase().includes(q) ||
    (contact.relationshipType || '').toLowerCase().includes(q) ||
    (contact.notes || '').toLowerCase().includes(q) ||
    (contact.tags || []).some((t) => t.toLowerCase().includes(q))
  )
}

export async function listContacts(userId, query = '', limit = 200) {
  const uid = String(userId)
  const q = String(query || '').trim()
  if (useMemoryStore()) {
    return Array.from(memContacts.values())
      .filter((c) => c.userId === uid && matchesContactQuery(c, q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit)
      .map((c) => structuredClone(c))
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('mailpilot_contacts')
    .select('*')
    .eq('user_mongo_id', uid)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || [])
    .map(mapContactFromRow)
    .filter((c) => matchesContactQuery(c, q))
    .slice(0, limit)
}

export async function countContacts(userId) {
  const uid = String(userId)
  if (useMemoryStore()) {
    let count = 0
    for (const c of memContacts.values()) {
      if (c.userId === uid) count += 1
    }
    return count
  }
  const supabase = getSupabaseClient()
  const { count, error } = await supabase
    .from('mailpilot_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('user_mongo_id', uid)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function findContactByEmail(userId, email) {
  const uid = String(userId)
  const normalized = String(email || '').trim().toLowerCase()
  if (useMemoryStore()) {
    for (const c of memContacts.values()) {
      if (c.userId === uid && c.email === normalized) return structuredClone(c)
    }
    return null
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('mailpilot_contacts')
    .select('*')
    .eq('user_mongo_id', uid)
    .eq('email', normalized)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return mapContactFromRow(data)
}

export async function createContact(userId, payload) {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const contact = {
    _id: id,
    userId: String(userId),
    name: payload.name,
    email: String(payload.email).toLowerCase(),
    company: payload.company || '',
    role: payload.role || '',
    relationshipType: payload.relationshipType === 'unofficial' ? 'unofficial' : 'official',
    notes: payload.notes || '',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    createdAt: now,
    updatedAt: now,
  }
  if (useMemoryStore()) {
    for (const existing of memContacts.values()) {
      if (existing.userId === contact.userId && existing.email === contact.email) {
        const err = new Error('Duplicate contact email')
        err.code = '23505'
        throw err
      }
    }
    memContacts.set(id, structuredClone(contact))
    return contact
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('mailpilot_contacts')
    .insert(mapContactToRow(contact))
    .select('*')
    .single()
  if (error) {
    const err = new Error(error.message)
    err.code = error.code
    throw err
  }
  return mapContactFromRow(data)
}

export async function updateContact(id, userId, payload) {
  const key = String(id)
  const uid = String(userId)
  if (useMemoryStore()) {
    const existing = memContacts.get(key)
    if (!existing || existing.userId !== uid) return null
    const nextEmail = String(payload.email).toLowerCase()
    for (const other of memContacts.values()) {
      if (other._id !== key && other.userId === uid && other.email === nextEmail) {
        const err = new Error('Duplicate contact email')
        err.code = '23505'
        throw err
      }
    }
    const updated = {
      ...existing,
      ...payload,
      email: nextEmail,
      updatedAt: new Date().toISOString(),
    }
    memContacts.set(key, structuredClone(updated))
    return updated
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('mailpilot_contacts')
    .update({
      name: payload.name,
      email: String(payload.email).toLowerCase(),
      company: payload.company || '',
      role: payload.role || '',
      relationship_type: payload.relationshipType === 'unofficial' ? 'unofficial' : 'official',
      notes: payload.notes || '',
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      updated_at: new Date().toISOString(),
    })
    .eq('mongo_id', key)
    .eq('user_mongo_id', uid)
    .select('*')
    .maybeSingle()
  if (error) {
    const err = new Error(error.message)
    err.code = error.code
    throw err
  }
  return mapContactFromRow(data)
}

export async function deleteContact(id, userId) {
  const key = String(id)
  const uid = String(userId)
  if (useMemoryStore()) {
    const existing = memContacts.get(key)
    if (!existing || existing.userId !== uid) return false
    memContacts.delete(key)
    return true
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('mailpilot_contacts')
    .delete()
    .eq('mongo_id', key)
    .eq('user_mongo_id', uid)
    .select('mongo_id')
  if (error) throw new Error(error.message)
  return Boolean(data && data.length > 0)
}

export async function seedContacts(userId, starterContacts) {
  const results = []
  for (const item of starterContacts) {
    const existing = await findContactByEmail(userId, item.email)
    if (existing) {
      results.push(existing)
    } else {
      const created = await createContact(userId, item)
      results.push(created)
    }
  }
  return results
}

// --- Tasks ---

export async function listTasks(userId, statusFilter = '') {
  const uid = String(userId)
  if (useMemoryStore()) {
    return Array.from(memTasks.values())
      .filter((t) => t.userId === uid && (!statusFilter || t.status === statusFilter))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 50)
      .map((t) => structuredClone(t))
  }
  const supabase = getSupabaseClient()
  let query = supabase
    .from('mailpilot_tasks')
    .select('*')
    .eq('user_mongo_id', uid)
    .order('created_at', { ascending: false })
    .limit(50)
  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data || []).map(mapTaskFromRow)
}

export async function findTaskById(id, userId) {
  const key = String(id)
  const uid = userId ? String(userId) : ''
  if (useMemoryStore()) {
    const t = memTasks.get(key)
    if (!t) return null
    if (uid && t.userId !== uid) return null
    return structuredClone(t)
  }
  const supabase = getSupabaseClient()
  let query = supabase.from('mailpilot_tasks').select('*').eq('mongo_id', key)
  if (uid) {
    query = query.eq('user_mongo_id', uid)
  }
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return mapTaskFromRow(data)
}

export async function createTask({ userId, goal, status = 'pending', plan = [], trace = [] }) {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const task = {
    _id: id,
    userId: String(userId),
    goal,
    status,
    plan,
    trace,
    emailDraft: defaultEmailDraft(),
    finalSummary: '',
    error: '',
    stoppedByUser: false,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  if (useMemoryStore()) {
    memTasks.set(id, structuredClone(task))
    return task
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('mailpilot_tasks')
    .insert(mapTaskToRow(task))
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapTaskFromRow(data)
}

export async function saveTask(task) {
  const key = String(task._id)
  if (useMemoryStore()) {
    const next = { ...structuredClone(task), updatedAt: new Date().toISOString() }
    memTasks.set(key, next)
    return structuredClone(next)
  }
  const supabase = getSupabaseClient()
  const row = mapTaskToRow(task)
  const { data, error } = await supabase
    .from('mailpilot_tasks')
    .update({
      goal: row.goal,
      status: row.status,
      plan: row.plan,
      trace: row.trace,
      email_draft: row.email_draft,
      final_summary: row.final_summary,
      error: row.error,
      stopped_by_user: row.stopped_by_user,
      started_at: row.started_at,
      completed_at: row.completed_at,
      updated_at: row.updated_at,
    })
    .eq('mongo_id', key)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapTaskFromRow(data)
}

export async function deleteTask(id, userId) {
  const key = String(id)
  const uid = String(userId)
  if (useMemoryStore()) {
    const existing = memTasks.get(key)
    if (!existing || existing.userId !== uid) return false
    memTasks.delete(key)
    return true
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('mailpilot_tasks')
    .delete()
    .eq('mongo_id', key)
    .eq('user_mongo_id', uid)
    .select('mongo_id')
  if (error) throw new Error(error.message)
  return Boolean(data && data.length > 0)
}

export async function checkDatabaseHealth() {
  if (useMemoryStore()) {
    return { configured: true, connected: true, backend: 'memory-test' }
  }
  if (!isSupabaseConfigured()) {
    return { configured: false, connected: false, backend: 'supabase' }
  }
  const supabase = getSupabaseClient()
  const { error, count } = await supabase
    .from('mailpilot_users')
    .select('id', { count: 'exact', head: true })
  if (error) {
    return { configured: true, connected: false, backend: 'supabase', error: error.message }
  }
  return { configured: true, connected: true, backend: 'supabase', usersCount: count ?? 0 }
}
