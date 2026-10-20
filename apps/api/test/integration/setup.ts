import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2] ?? '';
  }
}
if (!process.env.DATABASE_URL_TEST) throw new Error('DATABASE_URL_TEST is required for integration tests');

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.DATABASE_URL_TEST,
  PUBLIC_APP_URL: 'http://localhost:8080',
  LOG_LEVEL: 'silent',
  SLA_CRON_ENABLED: 'false',
  SWAGGER_ENABLED: 'false',
  AI_PROVIDER: 'none',
  GEMINI_API_KEY: '',
  DISABLED_FEATURES: '',
});
