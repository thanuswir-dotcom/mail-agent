import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { findUserById } from '../services/dbStore.js'

export function signToken(userId) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  })
}

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || ''
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication token required.' })
    }

    const token = authHeader.slice('Bearer '.length).trim()
    if (!token) {
      return res.status(401).json({ error: 'Authentication token required.' })
    }

    const payload = jwt.verify(token, env.JWT_SECRET)
    const user = await findUserById(payload.sub)
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session.' })
    }

    req.user = user
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' })
  }
}

