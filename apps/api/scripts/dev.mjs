import { spawn } from 'node:child_process';
import { loadRootEnv } from './load-env.mjs';

loadRootEnv();
// Recompiles on change and restarts the API (tsc --watch + node --watch).
const tsc = spawn('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
const node = spawn(process.execPath, ['--watch', 'dist/src/main.js'], { stdio: 'inherit', env: process.env });
const stop = () => {
  tsc.kill();
  node.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
