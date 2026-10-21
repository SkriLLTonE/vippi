export const LOAD_ORGS = [
  { key: '10k', leads: 10_000 },
  { key: '50k', leads: 50_000 },
];
export const LOAD_PASSWORD = 'Load-Test-Synthetic-2026';
export const loadEmail = (key) => `load-${key}@load.example`;
export const LOAD_API = process.env.LOAD_API ?? 'http://localhost:3100';
export const LOAD_ORIGIN = process.env.LOAD_ORIGIN ?? 'http://localhost:4173';
