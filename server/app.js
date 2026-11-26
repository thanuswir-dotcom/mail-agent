import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import { requireAuth } from './middleware/auth.js'
import authRoutes from './routes/auth.js'
import contactsRoutes from './routes/contacts.js'
import googleRoutes from './routes/google.js'
import senderRoutes from './routes/sender.js'
import tasksRoutes from './routes/tasks.js'
import { checkDatabaseHealth, isSupabaseConfigured } from './services/dbStore.js'

export function createApp() {
  const app = express()

  const allowedOrigins = new Set(
    [env.CLIENT_URL, ...env.CORS_ORIGINS.split(',')]
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  )

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin.replace(/\/+$/, ''))) {
          return callback(null, true)
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`))
      },
      credentials: true,
    })
  )
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', async (_req, res) => {
    const db = await checkDatabaseHealth().catch((err) => ({
      configured: isSupabaseConfigured(),
      connected: false,
      error: err.message,
    }))
    res.json({
      ok: true,
      service: 'MailPilot AI Backend',
      database: db,
      geminiConfigured: Boolean(env.GEMINI_API_KEY),
      googleOAuthConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      supabaseConfigured: isSupabaseConfigured(),
      supabaseUrl: env.SUPABASE_URL || '',
    })
  })

  app.get('/api/supabase/status', requireAuth, async (_req, res) => {
    const status = await checkDatabaseHealth()
    return res.json({
      ...status,
      supabaseUrl: env.SUPABASE_URL || '',
    })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/contacts', contactsRoutes)
  app.use('/api/google', googleRoutes)
  app.use('/api/sender', senderRoutes)
  app.use('/api/tasks', tasksRoutes)

  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
  })

  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const distDir = path.resolve(__dirname, '../dist')
  const distIndex = path.join(distDir, 'index.html')

  if (env.NODE_ENV === 'production' && !process.env.VERCEL && fs.existsSync(distIndex)) {
    app.use(express.static(distDir))
    app.get('*', (_req, res) => {
      res.sendFile(distIndex)
    })
  } else {
    app.use((req, res) => {
      res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
    })
  }

  app.use((err, _req, res, _next) => {
    void _next
    const status = err.status || 500
    res.status(status).json({ error: err.message || 'Internal server error' })
  })

  return app
}
