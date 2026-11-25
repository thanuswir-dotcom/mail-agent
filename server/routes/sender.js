import express from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { verifySmtpCredentials } from '../services/emailDeliveryService.js'
import { syncUserToSupabase } from '../services/supabaseService.js'

const router = express.Router()

const smtpSetupSchema = z.object({
  email: z.string().trim().email('Please enter a valid sender email address').toLowerCase(),
  appPassword: z
    .string()
    .trim()
    .min(8, 'App password must be at least 8 characters')
    .max(128)
    .transform((val) => val.replace(/\s+/g, '')),
  host: z.string().trim().min(3).max(120).optional().default('smtp.gmail.com'),
  port: z.coerce.number().int().min(1).max(65535).optional().default(465),
  secure: z.boolean().optional(),
})

router.use(requireAuth)

router.post('/smtp', async (req, res) => {
  try {
    const parsed = smtpSetupSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid SMTP credentials',
      })
    }

    const config = {
      ...parsed.data,
      secure: parsed.data.secure ?? Number(parsed.data.port) === 465,
    }

    try {
      await verifySmtpCredentials(config)
    } catch (verifyErr) {
      return res.status(400).json({
        error: `Could not verify SMTP login (${verifyErr.message}). For Gmail, enable 2-Step Verification and use a 16-character App Password.`,
      })
    }

    req.user.smtpConfig = config
    await req.user.save()
    void syncUserToSupabase(req.user)

    return res.json({ user: req.user.toSafeProfile() })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save SMTP settings.', message: error.message })
  }
})

router.post('/smtp/disconnect', async (req, res) => {
  try {
    req.user.smtpConfig = {
      email: '',
      appPassword: '',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
    }
    await req.user.save()
    void syncUserToSupabase(req.user)
    return res.json({ user: req.user.toSafeProfile() })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to remove SMTP sender.', message: error.message })
  }
})

export default router
