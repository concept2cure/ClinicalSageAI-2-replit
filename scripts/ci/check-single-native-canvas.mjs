#!/usr/bin/env node
/**
 * One build of each statically linked native graphics library, ever.
 *
 * Until 2026-10-01 package-lock.json installed three builds of @napi-rs/canvas
 * (1.0.6 top level, 0.1.100 under pdfjs-dist, 0.1.80 under pdf-parse). Each
 * links its own Skia. The OCR rasteriser drew a page on one copy while pdfjs
 * drew that page's images and paths with objects from another, and the native
 * heap was corrupted: a scanned PDF uploaded to AnA killed the API task with
 * SIGSEGV, taking every other request on it down too. `npm ci` in the image
 * reproduces whatever the lockfile says, so the lockfile is where it is held.
 *
 * The behaviour is pinned by tests/services/scanned-pdf-native-canvas.test.ts;
 * this pins the cause, so a dependency bump that re-nests a copy fails here
 * with the reason instead of in a child process's exit status.
 *
 *   node scripts/ci/check-single-native-canvas.mjs              # the repo's lockfile
 *   node scripts/ci/check-single-native-canvas.mjs --self-test  # proves it refuses
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = '[single-native-canvas]';
const SINGLETONS = ['@napi-rs/canvas'];

/** Every installed copy of each singleton: `{ name: [{ at, version }] }`. */
export function copiesIn(lock) {
  const out = Object.fromEntries(SINGLETONS.map((n) => [n, []]));
  for (const [at, entry] of Object.entries(lock.packages ?? {})) {
    for (const name of SINGLETONS) {
      if (at === `node_modules/${name}` || at.endsWith(`/node_modules/${name}`)) {
        out[name].push({ at, version: entry.version });
      }
    }
  }
  return out;
}

export function problems(lock) {
  return Object.entries(copiesIn(lock))
    .filter(([, copies]) => copies.length !== 1)
    .map(([name, copies]) =>
      copies.length === 0
        ? `${name}: not installed at all (the OCR rasteriser needs it)`
        : `${name}: ${copies.length} copies — ${copies.map((c) => `${c.version} at ${c.at}`).join('; ')}. ` +
          'Pin one version that every dependent accepts and add "overrides": { "' + name + '": "$' + name + '" } in package.json.',
    );
}

function selfTest() {
  const one = { packages: { 'node_modules/@napi-rs/canvas': { version: '0.1.80' } } };
  // The lockfile as it stood before this gate, reduced to the entries that matter.
  const before = {
    packages: {
      'node_modules/@napi-rs/canvas': { version: '1.0.6' },
      'node_modules/@napi-rs/canvas-linux-x64-gnu': { version: '1.0.6' },
      'node_modules/pdfjs-dist/node_modules/@napi-rs/canvas': { version: '0.1.100' },
      'node_modules/pdf-parse/node_modules/@napi-rs/canvas': { version: '0.1.80' },
    },
  };
  const none = { packages: {} };
  const cases = [
    ['one copy', one, 0],
    ['the pre-fix lockfile (three copies)', before, 1],
    ['no copy', none, 1],
  ];
  let ok = true;
  for (const [label, lock, want] of cases) {
    const got = problems(lock).length;
    const pass = got === want;
    ok &&= pass;
    console.log(`${TAG} self-test ${pass ? 'ok' : 'FAILED'} — ${label}: ${got} problem(s), expected ${want}`);
  }
  return ok;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  const found = problems(lock);
  if (found.length) {
    for (const p of found) console.error(`${TAG} FAIL — ${p}`);
    process.exit(1);
  }
  console.log(`${TAG} ok — ${SINGLETONS.map((n) => `${n} ${copiesIn(lock)[n][0].version}`).join(', ')}: one copy`);
}
