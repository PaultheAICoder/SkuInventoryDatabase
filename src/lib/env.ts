import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  CLAUDE_CODE_PATH: z.string().optional(),
  // [V2-DEFERRED] Shopify token encryption key removed - add back for V2
  // SHOPIFY_ENCRYPTION_KEY: z.string().min(32).optional(),
  // Cron job secret - required for /api/cron/alerts endpoint authentication
  CRON_SECRET: z.string().min(16).optional(),
  // Email configuration - Resend API key (recommended for serverless)
  RESEND_API_KEY: z.string().min(1).optional(),
  // Email "From" address (optional, defaults to alerts@example.com)
  EMAIL_FROM: z.string().email().optional(),
})

export type Env = z.infer<typeof envSchema>

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors)
    throw new Error('Invalid environment variables')
  }

  return parsed.data
}

export const env = validateEnv()
