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
 * It proves the handler *mentions* each leaf name — not that the value is used
 * correctly, and not that the request would be accepted. That is the job of the
 * route tests. This is the narrow, mechanical check that no key is a dead
 * letter, which is precisely the part humans and types both miss.
 *
 * ── The handler is the region PLUS the helpers it calls (2026-10-12) ─────────
 * This read only the source between one `router.<verb>('<path>'` and the next.
 * `/adaptive/interim` then reported five live fields as dead —
 * `informationFractions`, `designEffect.standardizedEffect`,
 * `designEffect.nPerArm`, `prior.mean`, `prior.sd` — every one of which the
 * route does read, through named validators the route file deliberately keeps
 * outside the handler: *"Split into named validators so the handler stays a
 * handler"* (biostat-design-stats.ts:485). `parseInterimLook` calls
 * `checkInformationFractions`, `resolveDesignDrift` (which destructures
 * `standardizedEffect` and `nPerArm`) and `resolvePrior`.
 *
 * A gate that a tidy refactor turns red is a gate that gets baselined, and this
 * one has no baseline by design — so the region now carries the bodies of the
 * module-level functions it calls, followed TRANSITIVELY (the route calls
 * `parseInterimLook`, which calls the three validators). That follows real call
 * edges rather than widening to the whole file, which would let a mention
 * anywhere in a thousand lines satisfy the check and take the teeth out.
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

/**
 * Module-level `function NAME(...) { … }` bodies, by name, so a handler's
 * region can be followed into the validators it calls. Brace-matched from the
 * signature's `{`, which is enough for this file's plain declarations.
 */
function moduleFunctions(src) {
  const out = new Map();
  const re = /\nfunction\s+([A-Za-z0-9_$]+)\s*(?:<[^>]*>)?\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const body = bodyAfterSignature(src, re.lastIndex);
    if (body) out.set(m[1], body);
  }
  return out;
}

/**
 * The function BODY that follows a signature, given the index just past the
 * opening `(` of its parameter list.
 *
 * Taking the first `{` is wrong, and wrongly in a way that is silent: for
 * `function parseInterimLook(b: …): { error: string } | InterimLookRequest {`
 * the first `{` opens the RETURN TYPE, so the "body" came back as
 * `{ error: string }` and the walk never reached the validators that function
 * calls — which is the very thing this follows call edges for. A return-type
 * object literal is written on one line; a body is not. So: the body is the
 * first brace-matched span after the parameter list that contains a newline.
 */
function bodyAfterSignature(src, afterOpenParen) {
  // Close the parameter list first — it can hold parens and generics.
  let depth = 1;
  let i = afterOpenParen;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') depth--;
  }
  for (let open = src.indexOf('{', i); open !== -1; open = src.indexOf('{', open + 1)) {
    let d = 0;
    for (let j = open; j < src.length; j++) {
      if (src[j] === '{') d++;
      else if (src[j] === '}') {
        d--;
        if (d === 0) {
          const span = src.slice(open, j + 1);
          if (span.includes('\n')) return span;
          open = j; // a one-line type literal — keep looking
          break;
        }
      }
    }
    if (open >= src.length) break;
  }
  return null;
}

const MODULE_FUNCTIONS = moduleFunctions(routeSrc);

/**
 * All source for a path (a path may be declared more than once), plus the
 * bodies of the module-level functions that source calls, transitively. See
 * the header: the route file keeps its validators outside the handler on
 * purpose, and the fields are read in them.
 */
function handlerFor(path) {
  const own = regions
    .filter(r => r.path === path)
    .map(r => routeSrc.slice(r.start, r.end));
  if (own.length === 0) return '';

  const parts = [...own];
  const seen = new Set();
  const queue = [...own];
  while (queue.length > 0) {
    const chunk = queue.shift();
    for (const call of chunk.matchAll(/\b([A-Za-z0-9_$]+)\s*\(/g)) {
      const name = call[1];
      if (seen.has(name)) continue;
      const body = MODULE_FUNCTIONS.get(name);
      if (!body) continue;
      seen.add(name);
      parts.push(body);
      queue.push(body);
    }
  }
  return parts.join('\n');
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
