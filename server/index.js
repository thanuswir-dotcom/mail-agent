import { env } from './config/env.js'
import { createApp } from './app.js'
import { checkDatabaseHealth } from './services/dbStore.js'

const app = createApp()

async function startServer() {
  const dbStatus = await checkDatabaseHealth()
  if (!dbStatus.connected) {
    console.warn('Supabase Postgres connection check failed:', dbStatus.error || 'Not configured')
  } else {
    console.log(`Connected to Supabase Postgres (${env.SUPABASE_URL})`)
  }

  const server = app.listen(env.PORT, () => {
    console.log(`MailPilot AI server listening on http://localhost:${env.PORT}`)
  })

  const shutdown = () => {
    server.close(() => {
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start MailPilot AI server:', err)
    process.exit(1)
  })
}

export default app
