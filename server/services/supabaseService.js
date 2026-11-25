import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'
import { Contact } from '../models/Contact.js'
import { Task } from '../models/Task.js'
import { User } from '../models/User.js'

let cachedClient = null
let cachedKeySignature = ''

export function isSupabaseConfigured() {
  if (process.env.NODE_ENV === 'test') {
    return false
  }
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY)
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null
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

function toIsoOrNull(val) {
  if (!val) return null
  const d = val instanceof Date ? val : new Date(val)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function mapUserRow(user) {
  const safe = typeof user.toSafeProfile === 'function' ? user.toSafeProfile() : user
  return {
    mongo_id: String(safe.id || user._id),
    name: user.name || safe.name || '',
    email: String(user.email || safe.email || '').toLowerCase(),
    google_connected: Boolean(safe.googleConnected),
    google_email: safe.googleEmail || '',
    smtp_connected: Boolean(safe.smtpConnected),
    smtp_email: safe.smtpEmail || '',
    smtp_host: safe.smtpHost || 'smtp.gmail.com',
    created_at: toIsoOrNull(user.createdAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function mapContactRow(contact) {
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

function mapTaskRow(task) {
  const plain = typeof task.toObject === 'function' ? task.toObject() : task
  return {
    mongo_id: String(plain._id),
    user_mongo_id: String(plain.userId),
    goal: plain.goal || '',
    status: plain.status || 'pending',
    plan: Array.isArray(plain.plan) ? plain.plan : [],
    trace: Array.isArray(plain.trace) ? plain.trace : [],
    email_draft: plain.emailDraft || {},
    final_summary: plain.finalSummary || '',
    error: plain.error || '',
    stopped_by_user: Boolean(plain.stoppedByUser),
    started_at: toIsoOrNull(plain.startedAt),
    completed_at: toIsoOrNull(plain.completedAt),
    created_at: toIsoOrNull(plain.createdAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

async function ensureUserRow(supabase, user, userId) {
  let targetUser = user
  if (!targetUser && userId) {
    targetUser = await User.findById(userId)
  }
  if (!targetUser) return
  const { error } = await supabase
    .from('mailpilot_users')
    .upsert(mapUserRow(targetUser), { onConflict: 'mongo_id' })
  if (error) {
    throw new Error(error.message)
  }
}

export async function syncUserToSupabase(user) {
  const supabase = getSupabaseClient()
  if (!supabase || !user) return { synced: false }
  try {
    await ensureUserRow(supabase, user)
    return { synced: true }
  } catch (err) {
    console.warn('Supabase user sync skipped:', err.message)
    return { synced: false, error: err.message }
  }
}

export async function syncContactToSupabase(contact, user) {
  return syncContactsToSupabase(contact ? [contact] : [], user)
}

export async function syncContactsToSupabase(contacts, user) {
  const supabase = getSupabaseClient()
  if (!supabase || !Array.isArray(contacts) || contacts.length === 0) {
    return { synced: false, count: 0 }
  }
  try {
    await ensureUserRow(supabase, user, contacts[0]?.userId)
    const rows = contacts.map(mapContactRow)
    const { error } = await supabase
      .from('mailpilot_contacts')
      .upsert(rows, { onConflict: 'mongo_id' })
    if (error) throw new Error(error.message)
    return { synced: true, count: rows.length }
  } catch (err) {
    console.warn('Supabase contacts sync skipped:', err.message)
    return { synced: false, count: 0, error: err.message }
  }
}

export async function deleteContactFromSupabase(contactId) {
  const supabase = getSupabaseClient()
  if (!supabase || !contactId) return { deleted: false }
  try {
    const { error } = await supabase
      .from('mailpilot_contacts')
      .delete()
      .eq('mongo_id', String(contactId))
    if (error) throw new Error(error.message)
    return { deleted: true }
  } catch (err) {
    console.warn('Supabase contact delete skipped:', err.message)
    return { deleted: false, error: err.message }
  }
}

export async function syncTaskToSupabase(task, user) {
  const supabase = getSupabaseClient()
  if (!supabase || !task) return { synced: false }
  try {
    await ensureUserRow(supabase, user, task.userId)
    const { error } = await supabase
      .from('mailpilot_tasks')
      .upsert(mapTaskRow(task), { onConflict: 'mongo_id' })
    if (error) throw new Error(error.message)
    return { synced: true }
  } catch (err) {
    console.warn('Supabase task sync skipped:', err.message)
    return { synced: false, error: err.message }
  }
}

export async function deleteTaskFromSupabase(taskId) {
  const supabase = getSupabaseClient()
  if (!supabase || !taskId) return { deleted: false }
  try {
    const { error } = await supabase
      .from('mailpilot_tasks')
      .delete()
      .eq('mongo_id', String(taskId))
    if (error) throw new Error(error.message)
    return { deleted: true }
  } catch (err) {
    console.warn('Supabase task delete skipped:', err.message)
    return { deleted: false, error: err.message }
  }
}

export async function backfillUserToSupabase(user) {
  const supabase = getSupabaseClient()
  if (!supabase || !user) {
    return { synced: false, contacts: 0, tasks: 0 }
  }
  try {
    await ensureUserRow(supabase, user)
    const [contacts, tasks] = await Promise.all([
      Contact.find({ userId: user._id }).lean(),
      Task.find({ userId: user._id }).lean(),
    ])

    if (contacts.length > 0) {
      const { error } = await supabase
        .from('mailpilot_contacts')
        .upsert(contacts.map(mapContactRow), { onConflict: 'mongo_id' })
      if (error) throw new Error(error.message)
    }

    if (tasks.length > 0) {
      const { error } = await supabase
        .from('mailpilot_tasks')
        .upsert(tasks.map(mapTaskRow), { onConflict: 'mongo_id' })
      if (error) throw new Error(error.message)
    }

    return { synced: true, contacts: contacts.length, tasks: tasks.length }
  } catch (err) {
    console.warn('Supabase backfill skipped:', err.message)
    return { synced: false, contacts: 0, tasks: 0, error: err.message }
  }
}

export async function checkSupabaseConnection() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { configured: false, connected: false }
  }
  const { error, count } = await supabase
    .from('mailpilot_users')
    .select('id', { count: 'exact', head: true })
  if (error) {
    return { configured: true, connected: false, error: error.message }
  }
  return { configured: true, connected: true, usersCount: count ?? 0 }
}
