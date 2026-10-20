// Verifies that ru/uz dictionaries have the same keys and that every literal
// `t('key')` used in src exists in both (UX §8: no untranslated strings).
// Usage: node scripts/check-i18n.mjs [--list-missing]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'src');
const localesDir = join(src, 'shared', 'i18n', 'locales');
const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatten(obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out.add(key);
  }
  return out;
}

function baseKeys(keys) {
  return new Set([...keys].map((k) => k.replace(PLURAL, '')));
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
  }
  return files;
}

const ru = baseKeys(flatten(JSON.parse(readFileSync(join(localesDir, 'ru.json'), 'utf8'))));
const uz = baseKeys(flatten(JSON.parse(readFileSync(join(localesDir, 'uz.json'), 'utf8'))));

const problems = [];
for (const k of ru) if (!uz.has(k)) problems.push(`uz.json is missing "${k}"`);
for (const k of uz) if (!ru.has(k)) problems.push(`ru.json is missing "${k}"`);

// `key: 'a.b'` descriptors that are later passed to t(item.key).
const DESCRIPTOR = /\bkey:\s*'([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)'/g;
const STRING = /'([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)'/g;
// Template keys with a dynamic tail: t(`audit.actions.${x}`) → prefix "audit.actions."
const TEMPLATE = /\bt\(\s*`([a-zA-Z0-9_.]+)\.\$\{/g;

/** First argument of every `t(...)` call, so ternaries like t(c ? 'a.b' : 'a.c') are covered. */
function firstArgs(text) {
  const out = [];
  for (const m of text.matchAll(/\bt\(/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    let quote = null;
    for (; i < text.length && depth > 0; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') quote = ch;
      else if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
      else if (ch === ',' && depth === 1) break;
    }
    out.push(text.slice(start, i));
  }
  return out;
}

const used = new Map();
const prefixes = new Map();
for (const file of walk(src)) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(root, file);
  const keys = [
    ...firstArgs(text).flatMap((arg) => [...arg.matchAll(STRING)].map((m) => m[1])),
    ...[...text.matchAll(DESCRIPTOR)].map((m) => m[1]),
  ];
  for (const key of keys) if (!used.has(key)) used.set(key, rel);
  for (const m of text.matchAll(TEMPLATE)) {
    if (!prefixes.has(m[1])) prefixes.set(m[1], rel);
  }
}

for (const [key, file] of used) {
  if (!ru.has(key)) problems.push(`"${key}" (${file}) is not in ru.json`);
  else if (!uz.has(key)) problems.push(`"${key}" (${file}) is not in uz.json`);
}
for (const [prefix, file] of prefixes) {
  if (![...ru].some((k) => k.startsWith(`${prefix}.`))) problems.push(`no keys under "${prefix}.*" (${file})`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\ni18n check failed: ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`i18n OK: ${ru.size} keys in ru/uz, ${used.size} literal keys used, ${prefixes.size} dynamic prefixes.`);
