import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let devMongoServer = null

function isLocalConnectionRefused(error, uri) {
  const isLocalUri =
    uri.includes('127.0.0.1') || uri.includes('localhost')
  const msg = String(error?.message || '')
  return isLocalUri && msg.includes('ECONNREFUSED')
}

export async function connectDB(uri) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection
  }
  mongoose.set('strictQuery', true)

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 })
    return mongoose.connection
  } catch (error) {
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test' &&
      isLocalConnectionRefused(error, uri)
    ) {
      const { MongoMemoryServer } = await import('mongodb-memory-server')
      const dbPath = path.resolve(__dirname, '../.mongodb-data')
      fs.mkdirSync(dbPath, { recursive: true })

      devMongoServer = await MongoMemoryServer.create({
        instance: {
          dbName: 'mailpilot',
          dbPath,
          storageEngine: 'wiredTiger',
        },
      })

      const fallbackUri = devMongoServer.getUri('mailpilot')
      console.log(
        `Local mongod not running on ${uri}; started persistent dev MongoDB at ${dbPath}`
      )
      await mongoose.connect(fallbackUri)
      return mongoose.connection
    }
    throw error
  }
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
  if (devMongoServer) {
    await devMongoServer.stop()
    devMongoServer = null
  }
}
