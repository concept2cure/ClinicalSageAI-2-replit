#!/usr/bin/env node
/**
 * CI Guard: every pin in the root `requirements.txt` must be installable on the
 * Python this project actually declares.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Dependabot opened #1014 to bump `numpy==2.4.6` → `2.5.1`. numpy 2.5.1 is
 * `requires_python: >=3.12` and ships only cp312/cp313/cp314 wheels. This
 * project declares **Python 3.11** — `.replit` line 1 lists the `python-3.11`
 * module, and every `actions/setup-python` in CI pins `3.11`. Because the pin is
 * exact, pip does not quietly resolve to something older: it hard-fails with
 * `Could not find a version that satisfies the requirement`.
 *
 * The dangerous part was not the bad pin. It was that **merging it would have
 * turned nothing red.** Nothing installs the root `requirements.txt`:
 *
 *   .github/workflows/test_generator.yml    -> services/requirements.txt
 *   .github/workflows/ci.yml                -> a comment; the step pins
 *                                              python-docx/lxml inline
 *
 * Two more manifests were listed here when this guard was written —
 * shadow_service/requirements.txt (neon-preview-db.yml) and
 * ind_automation/requirements.txt (regulatory-smoke.yml). Both manifests, and
 * the trees around them, were removed by the dead-code purge; the steps that
 * installed them are gone with them, and ci:workflow-targets now fails if a
 * workflow names a file that is not there.
 *
 * Neither Dockerfile installs it either. So the root manifest — which pins
 * numpy, pandas, openai, pydantic — is declared but unconsumed, and its only
 * numpy consumer (`ingestion/pdf_extractor.py`, which imports numpy lazily
 * inside functions) never exercises it. A bad pin there surfaces at deploy time
 * on the 3.11 runtime, not in CI.
 *
 * This guard closes that specific hole: it resolves each pinned distribution's
 * `requires_python` from PyPI and fails when a pin excludes the declared Python.
 *
 * ── Scope, deliberately narrow ──────────────────────────────────────────────
 * Only the ROOT requirements.txt, only against the Python `.replit` declares.
 * The sub-project manifests above are genuinely pip-installed by CI, so a bad
 * pin in those already fails loudly and needs no guard — and they do not all
 * run on the same interpreter (`test_generator.yml` uses 3.10), so checking
 * them here would need a file→interpreter map that would rot.
 *
 * ── Network posture ─────────────────────────────────────────────────────────
 * This necessarily asks PyPI about package metadata. A PyPI outage must not
 * wedge the pipeline, so an unreachable index SKIPS loudly (exit 0) rather than
 * failing. What it will NOT do is skip silently: a skip prints why. An answer
 * that says "incompatible" is always fatal.
 *
 * Usage:
 *   node scripts/ci/check-requirements-pins.mjs
 *   node scripts/ci/check-requirements-pins.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const asJson = process.argv.includes('--json');

const REQUIREMENTS = path.join(repoRoot, 'requirements.txt');
const REPLIT = path.join(repoRoot, '.replit');

/** Fallback only — the declared version is read from .replit so this follows a real upgrade. */
const FALLBACK_PYTHON = '3.11';

/**
 * Read the Python the project declares, from `.replit`'s modules list
 * (e.g. `modules = ["bash", "nodejs-22", "python-3.11", "python3", "web"]`).
 * Deriving it rather than hardcoding means upgrading Python moves this guard
 * with it instead of leaving a stale assertion behind.
 */
function declaredPython() {
  try {
    const text = fs.readFileSync(REPLIT, 'utf8');
    const m = /python-(\d+)\.(\d+)/.exec(text);
    if (m) return { version: `${m[1]}.${m[2]}`, source: '.replit modules' };
  } catch {
    /* fall through */
  }
  return { version: FALLBACK_PYTHON, source: `fallback (could not read ${path.basename(REPLIT)})` };
}

/** Parse `name==version` pins. Ranges, markers, extras and VCS refs are skipped. */
function parsePins(text) {
  const pins = [];
  const skipped = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.split('#')[0].trim();
    if (!line || line.startsWith('-')) return;
    const m = /^([A-Za-z0-9_.\-]+)\s*==\s*([^\s;]+)$/.exec(line);
    if (m) pins.push({ name: m[1], version: m[2], line: i + 1 });
    else skipped.push({ spec: line, line: i + 1 });
  });
  return { pins, skipped };
}

/**
 * Does `requires_python` admit the target version?
 *
 * Implemented directly rather than pulling a PEP 440 library in: the specifiers
 * that appear in real `requires_python` fields are a tiny subset (>=, >, <, <=,
 * !=, ==) over two- or three-part versions, and a CI guard should not add a
 * dependency to check dependencies.
 */
function pythonSatisfies(requiresPython, target) {
  if (!requiresPython) return true; // no constraint declared
  const cmp = (a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
  };
  return requiresPython
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .every(clause => {
      const m = /^(>=|<=|!=|==|>|<|~=)\s*([0-9][0-9.*]*)$/.exec(clause);
      if (!m) return true; // unparseable clause: do not invent a failure
      const [, op, rawVer] = m;
      const ver = rawVer.replace(/\.\*$/, '');
      const c = cmp(target, ver);
      switch (op) {
        case '>=': return c >= 0;
        case '>':  return c > 0;
        case '<=': return c <= 0;
        case '<':  return c < 0;
        case '==': return c === 0;
        case '!=': return c !== 0;
        case '~=': return c >= 0;
        default:   return true;
      }
    });
}

async function fetchMeta(name, version) {
  const url = `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      // A 404 is a real answer: this exact version does not exist on PyPI.
      if (res.status === 404) return { missing: true };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      return { requiresPython: body?.info?.requires_python ?? '' };
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  return { unreachable: true, error: lastErr instanceof Error ? lastErr.message : String(lastErr) };
}

const python = declaredPython();

let requirementsText;
try {
  requirementsText = fs.readFileSync(REQUIREMENTS, 'utf8');
} catch {
  console.log('[ci:requirements-pins] no root requirements.txt — nothing to check.');
  process.exit(0);
}

const { pins, skipped } = parsePins(requirementsText);
const incompatible = [];
const missing = [];
let unreachable = 0;

for (const pin of pins) {
  const meta = await fetchMeta(pin.name, pin.version);
  if (meta.unreachable) { unreachable++; continue; }
  if (meta.missing) { missing.push(pin); continue; }
  if (!pythonSatisfies(meta.requiresPython, python.version)) {
    incompatible.push({ ...pin, requiresPython: meta.requiresPython });
  }
}

if (asJson) {
  process.stdout.write(
    `${JSON.stringify({ python, checked: pins.length, incompatible, missing, unreachable, skipped }, null, 2)}\n`,
  );
}

// A PyPI outage must not wedge CI — but it must never pass quietly either.
if (unreachable > 0 && incompatible.length === 0 && missing.length === 0) {
  console.warn(
    `[ci:requirements-pins] SKIPPED — could not reach PyPI for ${unreachable}/${pins.length} pin(s).\n` +
      '  This check needs the package index. Treating an index outage as a pass so a\n' +
      '  PyPI incident cannot block every PR — but it verified nothing for those pins.',
  );
  process.exit(0);
}

if (incompatible.length === 0 && missing.length === 0) {
  if (!asJson) {
    console.log(
      `[ci:requirements-pins] OK — ${pins.length} pinned package(s) install on Python ` +
        `${python.version} (declared by ${python.source}).` +
        (skipped.length ? ` ${skipped.length} non-exact spec(s) not checked.` : ''),
    );
  }
  process.exit(0);
}

console.error(
  `[ci:requirements-pins] FAIL — requirements.txt pins that cannot install on Python ` +
    `${python.version} (declared by ${python.source}):\n`,
);
for (const p of incompatible) {
  console.error(
    `  requirements.txt:${p.line}  ${p.name}==${p.version}  requires_python="${p.requiresPython}"`,
  );
}
for (const p of missing) {
  console.error(`  requirements.txt:${p.line}  ${p.name}==${p.version}  no such version on PyPI`);
}
console.error(
  '\n  Nothing installs the root requirements.txt, so a bad pin here does NOT turn any\n' +
    '  other job red — it surfaces at deploy time on the declared runtime. That is why\n' +
    '  this guard exists.\n' +
    '\n  Fix by pinning a version compatible with the declared Python, or by upgrading the\n' +
    `  interpreter in .replit and the setup-python steps together (currently ${python.version}).\n`,
);
process.exit(1);
