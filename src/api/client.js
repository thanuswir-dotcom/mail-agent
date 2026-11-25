import axios from 'axios'

const TOKEN_KEY = 'mailpilot_token'

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '')
const apiBaseUrl = rawApiUrl
  ? rawApiUrl.endsWith('/api')
    ? rawApiUrl
    : `${rawApiUrl}/api`
  : '/api'

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 60000,
})

api.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
        setStoredToken('')
        window.dispatchEvent(new Event('mailpilot:unauthorized'))
      }
    }
    return Promise.reject(error)
  }
)

export function extractApiError(error, fallback = 'Something went wrong.') {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  )
}

