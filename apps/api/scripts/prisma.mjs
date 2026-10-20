import { spawnSync } from 'node:child_process';
import { loadRootEnv } from './load-env.mjs';

// Runs the Prisma CLI with the repository-root .env loaded (Prisma only reads .env next to the schema).
loadRootEnv();
const result = spawnSync('prisma', process.argv.slice(2), { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
