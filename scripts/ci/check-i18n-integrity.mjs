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

const SRC_DIR = resolve(ROOT, 'client/src');
const DEFAULT_NS = 'common';

/** Recursively list .ts/.tsx source files (excluding tests). */
function sourceFiles(dir = SRC_DIR, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Verify that every statically-keyed t('…') / <Trans i18nKey="…"> reference in
 * the client resolves to a key that actually exists in the English bundles — so a
 * typo'd or renamed key fails CI instead of silently rendering its raw key string
 * to a user (the failure mode the parity check can't see, since it only compares
 * the bundles to each other).
 *
 * Dynamic keys (t(`greeting.${x}`)) are skipped. Each file's translator bindings
 * (the `t` plus any `const { t: alias } = useTranslation(...)`) and the union of
 * namespaces it loads are parsed from source; a reference is accepted if the key
 * exists in ANY namespace the file loads, so aliasing and multi-namespace files
 * never produce false positives.
 */
export function checkI18nKeyUsage() {
  const errors = [];
  const namespaces = readdirSync(resolve(LOCALES_DIR, REFERENCE))
    .filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  const enKeys = {};
  for (const ns of namespaces) enKeys[ns] = new Set(Object.keys(loadNamespace(REFERENCE, ns).data || {}));

  let checked = 0;
  for (const file of sourceFiles()) {
    const src = readFileSync(file, 'utf8');
    if (!/useTranslation\s*\(/.test(src)) continue; // no translator bound here
    const rel = file.slice(ROOT.length + 1);

    // Parse `const { t[, …][: alias] } = useTranslation('ns' | ['a','b'] | )`.
    const bindings = new Set();
    const fileNs = new Set();
    for (const m of src.matchAll(/\{([^}]*)\}\s*=\s*useTranslation\s*\(([^)]*)\)/g)) {
      const tb = m[1].match(/\bt\b(?:\s*:\s*(\w+))?/);
      if (tb) bindings.add(tb[1] || 't');
      const nsHits = [...m[2].matchAll(/['"]([a-z]+)['"]/g)].map((x) => x[1]);
      (nsHits.length ? nsHits : [DEFAULT_NS]).forEach((n) => fileNs.add(n));
    }
    if (bindings.size === 0) continue;
    if (fileNs.size === 0) fileNs.add(DEFAULT_NS);

    const verify = (rawKey, kind) => {
      checked++;
      let ns = null, key = rawKey;
      if (rawKey.includes(':')) [ns, key] = rawKey.split(':');
      const nsList = ns ? [ns] : [...fileNs];
      if (!nsList.some((n) => enKeys[n]?.has(key)))
        errors.push(`${rel}: ${kind} '${rawKey}' not found in en bundle(s) [${nsList.join(', ')}]`);
    };

    for (const b of bindings) {
      // Static `binding('key')` / `binding("key")` — dynamic template keys are skipped.
      const re = new RegExp(`\\b${b}\\(\\s*['"]([a-zA-Z0-9_.:]+)['"]`, 'g');
      for (const m of src.matchAll(re)) verify(m[1], `${b}()`);
    }
    // <Trans i18nKey="key"> (static only).
    for (const m of src.matchAll(/i18nKey=\s*["']([a-zA-Z0-9_.:]+)["']/g)) verify(m[1], 'i18nKey');
  }
  return { errors, checked };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const parity = checkI18nIntegrity();
  const usage = checkI18nKeyUsage();
  const errors = [...parity.errors, ...usage.errors];
  if (errors.length) {
    console.error(`[i18n-integrity] ${errors.length} violation(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`[i18n-integrity] OK — ${parity.languages.length} languages × ${parity.namespaces.length} namespaces (${parity.namespaces.join(', ')}) consistent with '${REFERENCE}'; ${usage.checked} t()/i18nKey references all resolve.`);
}
