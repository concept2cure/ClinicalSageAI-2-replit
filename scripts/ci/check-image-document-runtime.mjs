#!/usr/bin/env node
/**
 * The production image can run AnA's document runtimes.
 *
 * insert_document_content, surgical_docx_xml_edit, validate_docx and the DOCX
 * runtime spawn `python3 workers/artifact-compute/<runtime>.py`
 * (server/services/compute/scriptWorker.ts, workerClient.ts), and those
 * runtimes import python-docx and lxml. Dockerfile.optimized's production
 * stage copied neither the runtimes nor installed the packages, while CI
 * installed them separately — so every test passed and every production call
 * failed. (D1, 2026-10-01.)
 *
 * Checked, statically, against the production stage:
 *   1. every runtime the server spawns is copied into it;
 *   2. every third-party module those runtimes import is installed into the
 *      document virtualenv at the version requirements.txt pins, and an
 *      import probe runs at build time, so an image that cannot import them
 *      is not built;
 *   3. the image points ANA_DOCX_PYTHON at that virtualenv, and both spawners
 *      use it.
 *
 * Usage: node scripts/ci/check-image-document-runtime.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const SPAWNERS = ['server/services/compute/scriptWorker.ts', 'server/services/compute/workerClient.ts'];
export const VENV_PYTHON = '/opt/docx-runtime/bin/python';

/** Import name → requirements.txt distribution name. */
export const DISTRIBUTION_OF = { docx: 'python-docx', lxml: 'lxml' };

const FALLBACK_STDLIB = [
  'argparse', 'base64', 'collections', 'copy', 'datetime', 'functools', 'hashlib', 'io', 'itertools', 'json',
  'math', 'os', 'pathlib', 'posixpath', 're', 'shutil', 'string', 'subprocess', 'sys', 'tempfile', 'textwrap',
  'time', 'traceback', 'typing', 'unicodedata', 'uuid', 'xml', 'zipfile',
];

export function stdlibModules() {
  try {
    const out = execFileSync('python3', ['-c', 'import sys; print("\\n".join(sorted(sys.stdlib_module_names)))'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return new Set(out.split('\n').filter(Boolean));
  } catch {
    return new Set(FALLBACK_STDLIB);
  }
}

/** The text of the stage `FROM … AS <name>`, up to the next FROM. */
export function stageText(dockerfile, name) {
  const lines = dockerfile.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^FROM\\s+\\S+\\s+AS\\s+${name}\\s*$`, 'i').test(l.trim()));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^FROM\s/i.test(l.trim()));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/** Top-level imports of a Python source, by first package segment. */
export function pythonImports(source) {
  const mods = new Set();
  for (const m of source.matchAll(/^(?:from\s+([A-Za-z_][\w]*)[\w.]*\s+import\b|import\s+([A-Za-z_][\w.]*(?:\s*,\s*[A-Za-z_][\w.]*)*))/gm)) {
    if (m[1]) mods.add(m[1]);
    else for (const part of m[2].split(',')) mods.add(part.trim().split('.')[0]);
  }
  return [...mods];
}

/** Runtime paths the spawners name. */
export function spawnedRuntimes(spawnerSources) {
  const found = new Set();
  for (const src of spawnerSources) {
    for (const m of src.matchAll(/['"`](workers\/artifact-compute\/[\w.-]+\.py)['"`]/g)) found.add(m[1]);
  }
  return [...found].sort();
}

/** The pinned `name==version` requirement lines. */
export function pins(requirements) {
  const out = new Map();
  for (const line of requirements.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_.-]+)==([^\s#]+)/);
    if (m) out.set(m[1].toLowerCase(), m[2]);
  }
  return out;
}

/**
 * Problems with the production image, or [] when it can run the runtimes.
 * Pure: every input is passed in.
 */
export function checkImageDocumentRuntime({ dockerfile, spawnerSources, runtimeSources, requirements, stdlib }) {
  const problems = [];
  const stage = stageText(dockerfile, 'production');
  if (stage === null) return ['Dockerfile has no `FROM … AS production` stage'];

  const runtimes = spawnedRuntimes(spawnerSources);
  if (runtimes.length === 0) problems.push('no workers/artifact-compute runtime is named by the spawners — has the path moved?');
  const copiesRuntimes = /^COPY\b[^\n]*\bworkers\/artifact-compute\b/m.test(stage);
  for (const r of runtimes) {
    if (!copiesRuntimes) problems.push(`${r} is spawned by the server but not copied into the production stage`);
  }

  const thirdParty = new Set();
  for (const r of runtimes) {
    const src = runtimeSources[r];
    if (src === undefined) {
      problems.push(`${r} is named by a spawner but does not exist`);
      continue;
    }
    for (const mod of pythonImports(src)) if (!stdlib.has(mod)) thirdParty.add(mod);
  }

  const pinned = pins(requirements);
  for (const mod of [...thirdParty].sort()) {
    const dist = DISTRIBUTION_OF[mod];
    if (!dist) {
      problems.push(`the runtimes import "${mod}", which has no entry in DISTRIBUTION_OF — add it, and install it in the image`);
      continue;
    }
    if (!pinned.has(dist)) problems.push(`requirements.txt does not pin ${dist} (imported as "${mod}")`);
    if (!new RegExp(`/opt/docx-runtime/bin/pip install[^\\n]*(?:\\\\\\n[^\\n]*)*\\b${dist.replace(/[.-]/g, '[.-]')}\\b`).test(stage)) {
      problems.push(`the production stage does not pip-install ${dist} into /opt/docx-runtime`);
    }
    if (!new RegExp(`${VENV_PYTHON.replace(/\//g, '\\/')} -c "[^"\\n]*\\bimport\\b[^"\\n]*\\b${mod}\\b`).test(stage)) {
      problems.push(`the production stage has no build-time import probe for "${mod}"`);
    }
  }
  if (thirdParty.size > 0 && !/requirements\.txt/.test(stage)) {
    problems.push('the production stage does not take its versions from requirements.txt, so it can drift from CI');
  }

  if (!new RegExp(`^ENV\\s+ANA_DOCX_PYTHON[= ]${VENV_PYTHON.replace(/\//g, '\\/')}\\s*$`, 'm').test(stage)) {
    problems.push(`the production stage does not set ENV ANA_DOCX_PYTHON=${VENV_PYTHON}`);
  }
  spawnerSources.forEach((src, i) => {
    if (!/process\.env\.ANA_DOCX_PYTHON/.test(src)) problems.push(`${SPAWNERS[i]} does not spawn the interpreter ANA_DOCX_PYTHON names`);
  });
  return problems;
}

function main() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const spawnerSources = SPAWNERS.map(read);
  const runtimeSources = {};
  for (const r of spawnedRuntimes(spawnerSources)) {
    if (fs.existsSync(path.join(ROOT, r))) runtimeSources[r] = read(r);
  }
  const problems = checkImageDocumentRuntime({
    dockerfile: read('Dockerfile.optimized'),
    spawnerSources,
    runtimeSources,
    requirements: read('requirements.txt'),
    stdlib: stdlibModules(),
  });
  if (problems.length > 0) {
    console.error('[ci:image-document-runtime] FAIL — the production image cannot run AnA\'s document runtimes:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[ci:image-document-runtime] OK — ${Object.keys(runtimeSources).length} runtime(s) copied, their imports installed and probed.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
