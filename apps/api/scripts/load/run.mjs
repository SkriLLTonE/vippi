// NFR-001 measurement with autocannon against the synthetic orgs from seed.mjs.
//   LOAD_API=http://localhost:3100 node scripts/load/run.mjs [--duration 20] [--connections 10]
import os from 'node:os';
import { parseArgs } from 'node:util';
import autocannon from 'autocannon';
import { LOAD_API as API, LOAD_ORIGIN as ORIGIN, LOAD_PASSWORD, loadEmail } from './config.mjs';

const { values } = parseArgs({
  options: { duration: { type: 'string', default: '20' }, connections: { type: 'string', default: '10' } },
});
const DURATION = Number(values.duration);
const CONNECTIONS = Number(values.connections);
async function login(key) {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email: loadEmail(key), password: LOAD_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${key}: ${res.status} ${await res.text()}`);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

const round = (ms) => Math.round(ms * 10) / 10;

function percentile(sorted, p) {
  return round(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]);
}

function measure({ name, cookie, paths, target }) {
  return new Promise((resolve, reject) => {
    const times = [];
    let i = 0;
    const instance = autocannon(
      {
        url: API,
        connections: CONNECTIONS,
        duration: DURATION,
        headers: { cookie },
        requests: [{ method: 'GET', setupRequest: (req) => ({ ...req, path: paths[i++ % paths.length] }) }],
      },
      (err, result) => {
        if (err) return reject(err);
        times.sort((a, b) => a - b);
        resolve({
          name,
          target,
          requests: result.requests.total,
          rps: Math.round(result.requests.average),
          non2xx: result.non2xx,
          errors: result.errors + result.timeouts,
          p50: percentile(times, 50),
          p95: percentile(times, 95),
          p99: percentile(times, 99),
          max: round(times.at(-1)),
        });
      },
    );
    instance.on('response', (_client, _status, _bytes, responseTime) => times.push(responseTime));
  });
}

const cookie10k = await login('10k');
const cookie50k = await login('50k');
const list = await fetch(`${API}/api/v1/leads?pageSize=100&page=7`, { headers: { cookie: cookie10k } });
if (!list.ok) throw new Error(`leads list: ${list.status}`);
const listBody = await list.json();
if (listBody.total < 10_000) throw new Error(`10k org has only ${listBody.total} leads — run seed.mjs first`);
const ids = listBody.items.map((l) => l.id);
const today = new Date().toISOString().slice(0, 10);
const from60 = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);

const scenarios = [
  { name: 'GET /leads (10k, page 1, default sort)', cookie: cookie10k, paths: ['/api/v1/leads'], target: 300 },
  {
    name: 'GET /leads (10k, pages 1–50)',
    cookie: cookie10k,
    paths: Array.from({ length: 50 }, (_, p) => `/api/v1/leads?page=${p + 1}`),
    target: 300,
  },
  {
    name: 'GET /leads?status=NEW&slaState=BREACHED (10k)',
    cookie: cookie10k,
    paths: ['/api/v1/leads?status=NEW&slaState=BREACHED'],
    target: 300,
  },
  {
    name: 'GET /leads?q=… search (10k)',
    cookie: cookie10k,
    paths: ['клиент 12', '998901', 'kvartira', 'бюджет'].map((q) => `/api/v1/leads?q=${encodeURIComponent(q)}`),
    target: 300,
  },
  { name: 'GET /leads/{id} (10k, 100 ids)', cookie: cookie10k, paths: ids.map((id) => `/api/v1/leads/${id}`), target: 300 },
  { name: 'GET /analytics/dashboard?preset=30d (50k)', cookie: cookie50k, paths: ['/api/v1/analytics/dashboard?preset=30d'], target: 800 },
  {
    name: 'GET /analytics/dashboard 60 days = all 50k leads',
    cookie: cookie50k,
    paths: [`/api/v1/analytics/dashboard?from=${from60}&to=${today}`],
    target: 800,
  },
];

// Warm-up: JIT, connection pool, Postgres buffers.
for (const s of scenarios) await fetch(`${API}${s.paths[0]}`, { headers: { cookie: s.cookie } });

const results = [];
for (const s of scenarios) {
  const r = await measure(s);
  results.push(r);
  console.error(`${r.name}: p95 ${r.p95} ms, ${r.rps} rps`);
}

const cpu = os.cpus();
console.log(
  `Environment: ${cpu[0]?.model.trim()} × ${cpu.length} logical CPUs, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM, ${os.type()} ${os.release()}, Node ${process.version}`,
);
if (process.env.LOAD_ENV_NOTE) console.log(`API runtime: ${process.env.LOAD_ENV_NOTE}`);
console.log(`autocannon: ${CONNECTIONS} connections, ${DURATION} s per scenario\n`);
console.log('| Scenario | Requests | RPS | p50, ms | p95, ms | p99, ms | max, ms | non-2xx / errors | Target p95 | Result |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---|');
for (const r of results) {
  const ok = r.p95 <= r.target && r.non2xx === 0 && r.errors === 0;
  console.log(
    `| ${r.name} | ${r.requests} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${r.non2xx} / ${r.errors} | ≤${r.target} | ${ok ? 'OK' : 'FAIL'} |`,
  );
}
if (results.some((r) => r.p95 > r.target || r.non2xx > 0 || r.errors > 0)) process.exitCode = 1;
