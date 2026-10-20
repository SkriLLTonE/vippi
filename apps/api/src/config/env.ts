import { z } from 'zod';
import { parseDisabledFeatures } from '@vippi/shared';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    PUBLIC_APP_URL: z.url('PUBLIC_APP_URL must be a URL'),
    COOKIE_SECURE: bool.default(false),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    SESSION_ABSOLUTE_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    TRUST_PROXY: bool.default(false),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    SWAGGER_ENABLED: bool.default(true),
    SLA_CRON_ENABLED: bool.default(true),
    SLA_SCAN_BATCH_SIZE: z.coerce.number().int().min(1).max(5000).default(500),
    INTAKE_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(60),
    AUTH_IP_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(30),
    EXPORT_MAX_ROWS: z.coerce.number().int().min(1).default(50_000),
    DISABLED_FEATURES: z.string().optional(),
    AI_PROVIDER: z.enum(['none', 'gemini']).default('none'),
    AI_MODEL: z.string().default('gemini-2.5-flash'),
    GEMINI_API_KEY: z.string().optional(),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
    AI_MAX_INPUT_CHARS: z.coerce.number().int().min(100).max(20_000).default(4000),
    AI_DAILY_REQUEST_LIMIT_PER_ORG: z.coerce.number().int().min(0).default(200),
    AI_DAILY_TOKEN_LIMIT_PER_ORG: z.coerce.number().int().min(0).default(300_000),
    AI_USER_HOURLY_LIMIT: z.coerce.number().int().min(0).default(30),
  })
  .transform((e) => ({
    ...e,
    publicOrigin: new URL(e.PUBLIC_APP_URL).origin,
    features: parseDisabledFeatures(e.DISABLED_FEATURES),
  }));

export type AppConfig = z.infer<typeof EnvSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
  return parsed.data;
}
