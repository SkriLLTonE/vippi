import { execSync } from 'node:child_process';
import { loadRootEnv } from './load-env.mjs';

loadRootEnv();
const url = process.env.DATABASE_URL_TEST;
if (!url) {
  console.error('DATABASE_URL_TEST is not set (see .env.example)');
  process.exit(1);
}
if (!/test/i.test(new URL(url).pathname)) {
  console.error('Refusing to migrate: DATABASE_URL_TEST must point to a database whose name contains "test"');
  process.exit(1);
}
execSync('prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
