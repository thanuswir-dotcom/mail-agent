import express from 'express'
import { env } from '../config/env.js'
import { requireAuth } from '../middleware/auth.js'
import { saveUser, toSafeProfile } from '../services/dbStore.js'
import {
  exchangeCodeAndSaveTokens,
  getGoogleAuthUrl,
  isGoogleOAuthConfigured,
  verifyGoogleOAuthState,
} from '../services/googleService.js'

const router = express.Router()

router.get('/auth-url', requireAuth, (req, res) => {
  try {
    if (!isGoogleOAuthConfigured()) {
      return res.status(503).json({
        error:
          'Google OAuth is not configured on the backend. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server environment variables.',
      })
    }
    const url = getGoogleAuthUrl(String(req.user._id))
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
    await exchangeCodeAndSaveTokens(String(code), userId)
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
    const saved = await saveUser(req.user)
    return res.json({ user: toSafeProfile(saved) })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to disconnect Google account.', message: error.message })
  }
})

export default router
