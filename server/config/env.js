import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

function cleanSecret(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (/^(your[-_]|replace[-_]with|placeholder|changeme)/i.test(trimmed)) {
    return ''
  }
  return trimmed
}

function resolveDefaultClientUrl() {
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'http://localhost:5173'
}

function resolveDefaultGoogleRedirectUri() {
  if (process.env.RENDER_EXTERNAL_URL) {
    return `${process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '')}/api/google/callback`
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/google/callback`
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/google/callback`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/google/callback`
  }
  return 'http://localhost:5000/api/google/callback'
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z
    .string()
    .url()
    .optional()
    .default(resolveDefaultClientUrl)
    .transform((val) => val.replace(/\/+$/, '')),
  CORS_ORIGINS: z.string().optional().default(''),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/mailpilot'),
  JWT_SECRET: z.string().min(16).default('dev-insecure-jwt-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  GEMINI_API_KEY: z.string().optional().default('').transform(cleanSecret),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  GOOGLE_CLIENT_ID: z.string().optional().default('').transform(cleanSecret),
  GOOGLE_CLIENT_SECRET: z.string().optional().default('').transform(cleanSecret),
  GOOGLE_REDIRECT_URI: z.string().optional().default(resolveDefaultGoogleRedirectUri),
  SUPABASE_URL: z.string().optional().default('').transform(cleanSecret),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional().default('').transform(cleanSecret),
  SUPABASE_SECRET_KEY: z.string().optional().default('').transform(cleanSecret),
})

export function getEnv() {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    )
  }
  return parsed.data
}

export const env = getEnv()
