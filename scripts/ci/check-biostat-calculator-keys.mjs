#!/usr/bin/env node
/**
 * Every field the biostat workbench collects must be one the server reads.
 *
 * ── The failure this catches ─────────────────────────────────────────────────
 * `client/src/concept2cure/v2/surfaces/biostatCalculators.ts` declares each
 * design-stats calculator as data: an endpoint plus the request-body keys its
 * form collects. The handlers in `server/routes/biostat-design-stats.ts` read
 * `req.body` directly and ignore anything they do not recognise.
 *
 * So a mistyped key — `nReader` for `nReaders`, `priorSD` for `priorSd` — does
 * not throw and does not 400. The form renders, the request succeeds, the server
 * silently falls back to its default, and the user is shown a real number
 * computed from an input they believe they supplied and did not. There is no
 * screenshot, no test of the endpoint, and no type in either language that
 * would notice: the client's key is a string and the server's body is `any`.
 *
 * This gate closes that by cross-checking the two files directly.
 *
 * ── What it does NOT claim ───────────────────────────────────────────────────
 * It proves the handler *mentions* each leaf name inside the region that serves
 * that path — not that the value is used correctly, and not that the request
 * would be accepted. That is the job of the route tests. This is the narrow,
 * mechanical check that no key is a dead letter, which is precisely the part
 * humans and types both miss.
 *
 * Zero tolerance: there is no baseline file, because unlike the ratchet gates
 * this has no legitimate exceptions. A key the server does not read is always a
 * defect.
 *
 * Usage: node scripts/ci/check-biostat-calculator-keys.mjs
 */

import { readFileSync } from 'node:fs';

const ROUTES = 'server/routes/biostat-design-stats.ts';
const REGISTRY = 'client/src/concept2cure/v2/surfaces/biostatCalculators.ts';

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    console.error(`check-biostat-calculator-keys: cannot read ${path} — ${err.message}`);
    process.exit(2);
  }
}

const routeSrc = read(ROUTES);
const registrySrc = read(REGISTRY);

/**
 * Slice the route file into one region per `router.<verb>('<path>'` declaration,
 * each running until the next declaration. Handler-scoped rather than
 * file-scoped: a key read by a DIFFERENT endpoint must not satisfy this one.
 */
function routeRegions(src) {
  const regions = [];
  const re = /router\.(post|get|put|patch|delete)\('([^']+)'/g;
  let match;
  let previous = null;
  while ((match = re.exec(src)) !== null) {
    if (previous) previous.end = match.index;
    previous = { path: match[2], start: match.index, end: src.length };
    regions.push(previous);
  }
  return regions;
}

const regions = routeRegions(routeSrc);
if (regions.length === 0) {
  console.error(`check-biostat-calculator-keys: found no routes in ${ROUTES}. Has the file moved?`);
  process.exit(2);
}

/** All source for a path (a path may be declared more than once). */
function handlerFor(path) {
  return regions
    .filter(r => r.path === path)
    .map(r => routeSrc.slice(r.start, r.end))
    .join('\n');
}

/**
 * Pull `{ id, path, keys[] }` out of the registry by scanning its literal. The
 * registry is plain data, so a regex over the source is enough and avoids making
 * a CI gate depend on a TypeScript loader.
 */
function parseRegistry(src) {
  const calculators = [];
  // Each entry starts at `id: '...'` and runs to the next entry or the array end.
  // Accept both LF (GitHub runners) and CRLF (Windows worktrees). Without the
  // optional carriage return, every Windows entry collapses into the first
  // calculator and produces a misleading wall of dead-key findings.
  const entryRe = /id: '([^']+)',[\s\S]*?path: '([^']+)',([\s\S]*?)(?=\r?\n {2}\{\r?\n {4}id: '|\r?\n\];)/g;
  let match;
  while ((match = entryRe.exec(src)) !== null) {
    const [, id, path, block] = match;
    const keys = [...block.matchAll(/key: '([^']+)'/g)].map(m => m[1]);
    calculators.push({ id, path, keys });
  }
  return calculators;
}

const calculators = parseRegistry(registrySrc);
if (calculators.length === 0) {
  console.error(`check-biostat-calculator-keys: parsed no calculators from ${REGISTRY}. Has its shape changed?`);
  process.exit(2);
}

const problems = [];
let keysChecked = 0;

for (const calc of calculators) {
  const handler = handlerFor(calc.path);
  if (!handler) {
    problems.push(`${calc.id}: no handler serves ${calc.path} — the form posts into the void.`);
    continue;
  }
  if (calc.keys.length === 0) {
    problems.push(`${calc.id}: declares no fields.`);
    continue;
  }
  for (const key of calc.keys) {
    keysChecked++;
    // Dotted keys build nested objects; the handler reads the leaf off the
    // parent (`b.prior.alpha`), so the leaf is what must appear.
    const leaf = key.split('.').pop();
    if (!new RegExp(`\\b${leaf}\\b`).test(handler)) {
      problems.push(
        `${calc.id}.${key}: the handler for ${calc.path} never reads "${leaf}". ` +
          `The form will collect it, the request will succeed, and the value will be ignored.`
      );
    }
  }
}

if (problems.length > 0) {
  console.error('check-biostat-calculator-keys: FAILED\n');
  for (const p of problems) console.error(`  • ${p}`);
  console.error(
    `\n${problems.length} problem(s) across ${calculators.length} calculators.\n` +
      `Fix the key in ${REGISTRY} to match what the handler reads, or make the handler read it.`
  );
  process.exit(1);
}

console.log(
  `check-biostat-calculator-keys: ${keysChecked} field keys across ${calculators.length} calculators, ` +
    `all read by their handlers.`
);
