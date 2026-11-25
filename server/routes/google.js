import express from 'express'
import { env } from '../config/env.js'
import { requireAuth } from '../middleware/auth.js'
import {
  exchangeCodeAndSaveTokens,
  getGoogleAuthUrl,
  isGoogleOAuthConfigured,
  verifyGoogleOAuthState,
} from '../services/googleService.js'
import { syncUserToSupabase } from '../services/supabaseService.js'

const router = express.Router()

router.get('/auth-url', requireAuth, (req, res) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      return res.status(503).json({
        error:
          'Google OAuth is not configured on the backend. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env.',
      })
    }
    const url = getGoogleAuthUrl(req.user._id.toString())
    return res.json({ url })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate Google OAuth URL.', message: error.message })
  }
})

router.get('/callback', async (req, res) => {
  const { code, state, error: oauthError, error_description: oauthErrorDesc } = req.query
  const clientRedirectBase = `${env.CLIENT_URL.replace(/\/$/, '')}/dashboard`

  if (oauthError) {
    const detail = oauthErrorDesc ? `${oauthError}: ${oauthErrorDesc}` : String(oauthError)
    console.error('Google OAuth returned error:', detail)
    return res.redirect(`${clientRedirectBase}?google=error&reason=${encodeURIComponent(detail)}`)
  }
  if (!code || !state) {
    console.error('Google OAuth callback missing code or state')
    return res.redirect(`${clientRedirectBase}?google=error&reason=missing_code_or_state`)
  }

  try {
    const userId = verifyGoogleOAuthState(String(state))
    const user = await exchangeCodeAndSaveTokens(String(code), userId)
    void syncUserToSupabase(user)
    return res.redirect(`${clientRedirectBase}?google=connected`)
  } catch (error) {
    console.error('Google OAuth token exchange error:', error)
    return res.redirect(
      `${clientRedirectBase}?google=error&reason=${encodeURIComponent(error.message || 'oauth_failed')}`
    )
  }
})

router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    req.user.googleTokens = {
      access_token: '',
      refresh_token: '',
      scope: '',
      token_type: '',
      expiry_date: 0,
      email: '',
    }
    await req.user.save()
    void syncUserToSupabase(req.user)
    return res.json({ user: req.user.toSafeProfile() })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to disconnect Google account.', message: error.message })
  }
})

export default router

