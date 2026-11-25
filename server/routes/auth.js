import express from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { User } from '../models/User.js'
import { requireAuth, signToken } from '../middleware/auth.js'
import { env } from '../config/env.js'
import {
  backfillUserToSupabase,
  isSupabaseConfigured,
  syncUserToSupabase,
} from '../services/supabaseService.js'

const router = express.Router()

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
})

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
})

router.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid registration data',
        details: parsed.error.issues,
      })
    }

    const { name, email, password } = parsed.data
    const existing = await User.findOne({ email })
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({ name, email, passwordHash })
    const token = signToken(user._id.toString())
    void syncUserToSupabase(user)

    return res.status(201).json({
      token,
      user: user.toSafeProfile(),
    })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to register account.', message: error.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid login credentials',
      })
    }

    const { email, password } = parsed.data
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const token = signToken(user._id.toString())
    void backfillUserToSupabase(user)
    return res.json({
      token,
      user: user.toSafeProfile(),
    })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to sign in.', message: error.message })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  return res.json({
    user: req.user.toSafeProfile(),
    integrations: {
      geminiConfigured: Boolean(env.GEMINI_API_KEY),
      geminiModel: env.GEMINI_MODEL,
      googleOAuthConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      supabaseConfigured: isSupabaseConfigured(),
      supabaseUrl: env.SUPABASE_URL || '',
    },
  })
})

export default router

