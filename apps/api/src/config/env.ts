import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseDisabledFeatures } from '@vippi/shared';

/** Dev/test only: production refuses to start without API_KEY_ENCRYPTION_KEY. */
const DEV_API_KEY_ENCRYPTION_KEY = createHash('sha256').update('vippi-dev-only-api-key-encryption').digest();

function parseEncryptionKey(value: string): Buffer | null {
  const v = value.trim();
  const bytes = /^[0-9a-f]{64}$/i.test(v)
    ? Buffer.from(v, 'hex')
    : /^[A-Za-z0-9+/_-]{43}={0,2}$/.test(v)
      ? Buffer.from(v, 'base64')
      : null;
  return bytes?.length === 32 ? bytes : null;
}

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    PUBLIC_APP_URL: z.url('PUBLIC_APP_URL must be a URL'),
    /** Defaults to true when PUBLIC_APP_URL is https (see loadConfig). */
    COOKIE_SECURE: bool.optional(),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    SESSION_ABSOLUTE_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Number of reverse-proxy hops in front of the API (Express `trust proxy`); `true` = 1, `false` = 0. */
    TRUST_PROXY: z
      .union([z.enum(['true', 'false']), z.coerce.number().int().min(0).max(10)])
      .transform((v) => (v === 'true' ? 1 : v === 'false' ? 0 : v))
      .default(0),
    /** Built web app (apps/web/dist). When set, the API also serves the SPA on the same origin (ADR-022). */
    WEB_DIST_DIR: z.string().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    SWAGGER_ENABLED: bool.default(true),
    SLA_CRON_ENABLED: bool.default(true),
    SLA_SCAN_BATCH_SIZE: z.coerce.number().int().min(1).max(5000).default(500),
    INTAKE_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(60),
    AUTH_IP_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(30),
    EXPORT_MAX_ROWS: z.coerce.number().int().min(1).default(50_000),
    DISABLED_FEATURES: z.string().optional(),
    AI_PROVIDER: z.enum(['none', 'gemini']).default('none'),
    AI_MODEL: z.string().default('gemini-3.5-flash-lite'),
    /** Gemini thinking level; unset = model default (gemini-3.5-flash-lite: minimal). */
    AI_THINKING_LEVEL: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
    GEMINI_API_KEY: z.string().optional(),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
    AI_MAX_INPUT_CHARS: z.coerce.number().int().min(100).max(20_000).default(4000),
    AI_DAILY_REQUEST_LIMIT_PER_ORG: z.coerce.number().int().min(0).default(200),
    AI_DAILY_TOKEN_LIMIT_PER_ORG: z.coerce.number().int().min(0).default(300_000),
    AI_USER_HOURLY_LIMIT: z.coerce.number().int().min(0).default(30),
    /** Outbox that delivers in-app notifications to Web Push and email (ADR-023). */
    NOTIFY_DISPATCH_ENABLED: bool.default(true),
    /** Web Push VAPID key pair (`npx web-push generate-vapid-keys`); both empty => push disabled. */
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    /** mailto: or https: contact for push services; defaults to PUBLIC_APP_URL. */
    VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/, 'VAPID_SUBJECT must start with mailto: or https://').optional(),
    /** SMTP for email notifications; SMTP_HOST or SMTP_FROM empty => email disabled. */
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    /** Implicit TLS; defaults to true for port 465 (otherwise STARTTLS is used when offered). */
    SMTP_SECURE: bool.optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    /** Fallback From (address used when org.emailFrom is unset; display name is replaced by org.name). */
    SMTP_FROM: z.string().optional(),
    /**
     * 32-byte key (base64 or 64 hex chars) encrypting API keys at rest (AES-256-GCM) so owners can copy them later.
     * Required in production; development/test fall back to a fixed dev-only key. Changing it makes existing keys
     * non-copyable (they keep working; rotate them).
     */
    API_KEY_ENCRYPTION_KEY: z
      .string()
      .refine((v) => parseEncryptionKey(v) !== null, 'API_KEY_ENCRYPTION_KEY must be 32 bytes: base64 or 64 hex chars')
      .optional(),
  })
  .refine((e) => !e.VAPID_PUBLIC_KEY === !e.VAPID_PRIVATE_KEY, {
    path: ['VAPID_PRIVATE_KEY'],
    message: 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together',
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.API_KEY_ENCRYPTION_KEY, {
    path: ['API_KEY_ENCRYPTION_KEY'],
    message: 'API_KEY_ENCRYPTION_KEY is required in production (32 random bytes, base64)',
  })
  .transform(({ API_KEY_ENCRYPTION_KEY, ...e }) => ({
    ...e,
    COOKIE_SECURE: e.COOKIE_SECURE ?? new URL(e.PUBLIC_APP_URL).protocol === 'https:',
    SMTP_SECURE: e.SMTP_SECURE ?? e.SMTP_PORT === 465,
    publicOrigin: new URL(e.PUBLIC_APP_URL).origin,
    features: parseDisabledFeatures(e.DISABLED_FEATURES),
    notifyChannels: { push: !!e.VAPID_PUBLIC_KEY && !!e.VAPID_PRIVATE_KEY, email: !!e.SMTP_HOST && !!e.SMTP_FROM },
    apiKeyEncryptionKey: (API_KEY_ENCRYPTION_KEY && parseEncryptionKey(API_KEY_ENCRYPTION_KEY)) || DEV_API_KEY_ENCRYPTION_KEY,
  }));

export type AppConfig = z.infer<typeof EnvSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const cleaned: Record<string, string | undefined> = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  // Render injects PORT and RENDER_EXTERNAL_URL; explicit API_PORT / PUBLIC_APP_URL win.
  cleaned.API_PORT ??= cleaned.PORT;
  cleaned.PUBLIC_APP_URL ??= cleaned.RENDER_EXTERNAL_URL;
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
  return parsed.data;
}
