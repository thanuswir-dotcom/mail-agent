import { env } from './config/env.js'
import { connectDB, disconnectDB } from './config/db.js'
import { createApp } from './app.js'

async function startServer() {
  await connectDB(env.MONGODB_URI)
  const app = createApp()

  const server = app.listen(env.PORT, () => {
    console.log(`MailPilot AI server listening on http://localhost:${env.PORT}`)
  })

  const shutdown = async () => {
    server.close(async () => {
      await disconnectDB()
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

startServer().catch((err) => {
  console.error('Failed to start MailPilot AI server:', err)
  process.exit(1)
})
