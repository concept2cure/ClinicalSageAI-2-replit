#!/usr/bin/env node
/**
 * i18n integrity guard.
 *
 * Protects the multi-language UI: every locale bundle under
 * client/public/locales/<lng>/ must stay a faithful, complete translation of the
 * English source of truth. Drift here ships a silently-degraded UI (missing keys
 * fall back to raw key strings; a dropped {{placeholder}} renders a literal
 * variable; a mangled <tag> breaks a <Trans> component) — none of which a type
 * checker or unit test would otherwise catch.
 *
 * Checks, for every language against English:
 *   1. Every namespace file present and valid JSON.
 *   2. Exact key parity (no missing, no extra keys).
 *   3. Interpolation parity — the set of {{placeholders}} per string matches.
 *   4. Markup parity — the set of HTML tags per string matches.
 *   5. Registry sync — the locale directories exactly match the language codes
 *      declared in client/src/i18n/languages.ts (no orphan dir, no missing dir).
 *
 * Pure Node (no TS imports) so it runs anywhere; the Vitest companion
 * (client/src/i18n/__tests__/locale-integrity.test.ts) additionally cross-checks
 * the server-side AnA overlay coverage.
 *
 * Usage: node scripts/ci/check-i18n-integrity.mjs   (exit 1 on any violation)
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCALES_DIR = resolve(ROOT, 'client/public/locales');
const REGISTRY = resolve(ROOT, 'client/src/i18n/languages.ts');
const REFERENCE = 'en';

/** Recursively flatten a nested object into dot-path -> string-value pairs. */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const placeholders = (s) =>
  [...String(s).matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map((m) => m[1]).sort();
const htmlTags = (s) =>
  [...String(s).matchAll(/<\/?[a-zA-Z][^>]*>/g)].map((m) => m[0].replace(/\s+/g, ' ')).sort();
const setEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function loadNamespace(lng, ns) {
  const file = resolve(LOCALES_DIR, lng, `${ns}.json`);
  if (!existsSync(file)) return { missing: true };
  try {
    return { data: flatten(JSON.parse(readFileSync(file, 'utf8'))) };
  } catch (e) {
    return { invalid: e.message };
  }
}

function localeDirs() {
  return readdirSync(LOCALES_DIR)
    .filter((d) => statSync(resolve(LOCALES_DIR, d)).isDirectory())
    .sort();
}

function registryCodes() {
  const src = readFileSync(REGISTRY, 'utf8');
  // Match `{ code: 'xx', ... }` rows of the LANGUAGES array.
  return [...src.matchAll(/\bcode:\s*'([a-z]{2})'/g)].map((m) => m[1]).sort();
}

export function checkI18nIntegrity() {
  const errors = [];
  const namespaces = readdirSync(resolve(LOCALES_DIR, REFERENCE))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();

  const dirs = localeDirs();
  const codes = registryCodes();

  // 5. Registry <-> directory sync.
  for (const d of dirs) if (!codes.includes(d)) errors.push(`locale dir '${d}' has no entry in languages.ts LANGUAGES`);
  for (const c of codes) if (!dirs.includes(c)) errors.push(`language '${c}' in languages.ts has no locale directory`);

  // Reference key sets per namespace.
  const ref = {};
  for (const ns of namespaces) {
    const r = loadNamespace(REFERENCE, ns);
    if (r.missing || r.invalid) { errors.push(`reference ${REFERENCE}/${ns}.json ${r.missing ? 'missing' : 'invalid: ' + r.invalid}`); continue; }
    ref[ns] = r.data;
  }

  for (const lng of dirs) {
    if (lng === REFERENCE) continue;
    for (const ns of namespaces) {
      const res = loadNamespace(lng, ns);
      if (res.missing) { errors.push(`${lng}/${ns}.json is missing`); continue; }
      if (res.invalid) { errors.push(`${lng}/${ns}.json is invalid JSON: ${res.invalid}`); continue; }
      const refKeys = Object.keys(ref[ns] || {});
      const curKeys = Object.keys(res.data);
      for (const k of refKeys) if (!(k in res.data)) errors.push(`${lng}/${ns}.json missing key: ${k}`);
      for (const k of curKeys) if (!(k in (ref[ns] || {}))) errors.push(`${lng}/${ns}.json has extra key: ${k}`);
      // 3 & 4: placeholder + markup parity for shared keys.
      for (const k of refKeys) {
        if (!(k in res.data)) continue;
        if (!setEq(placeholders(ref[ns][k]), placeholders(res.data[k])))
          errors.push(`${lng}/${ns}.json key '${k}': placeholders differ from en (en=[${placeholders(ref[ns][k])}], ${lng}=[${placeholders(res.data[k])}])`);
        if (!setEq(htmlTags(ref[ns][k]), htmlTags(res.data[k])))
          errors.push(`${lng}/${ns}.json key '${k}': HTML tags differ from en (en=[${htmlTags(ref[ns][k])}], ${lng}=[${htmlTags(res.data[k])}])`);
      }
    }
  }

  return { errors, languages: dirs, namespaces };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const { errors, languages, namespaces } = checkI18nIntegrity();
  if (errors.length) {
    console.error(`[i18n-integrity] ${errors.length} violation(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`[i18n-integrity] OK — ${languages.length} languages × ${namespaces.length} namespaces (${namespaces.join(', ')}) all consistent with '${REFERENCE}'.`);
}
