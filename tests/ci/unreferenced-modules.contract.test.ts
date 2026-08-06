/**
 * Contract: the unreferenced-module ratchet must not call live code dead.
 *
 * This scanner's only dangerous failure is a FALSE POSITIVE — telling someone a
 * mounted router is unreachable, and getting working code deleted. Two things
 * about this repository make the obvious implementation do exactly that, and
 * both were observed doing it during development:
 *
 *   1. ESM-style specifiers name `.js` for a `.ts` file
 *      (`from '../../routes/chat/shared.js'` → server/routes/chat/shared.TS).
 *      Extension-sensitive matching marked all 8 files in server/routes/chat
 *      dead. They are live.
 *
 *   2. Routers also mount from a MANIFEST of path strings
 *      (`{ path: '/api', mod: '../routes/chat-actions' }`), not import literals.
 *      An import-anchored regex marked 61 mounted routers dead — including
 *      chat-actions, whose INSERT is the entire reason the artifacts table
 *      migration exists.
 *
 * So these tests assert on real files with known-live status, not on synthetic
 * fixtures. If someone "simplifies" the matcher back to `import ... from`, or
 * makes it extension-sensitive, these fail with the exact files that would have
 * been wrongly deleted.
 *
 * The baseline itself is also pinned to only ever shrink — the whole point of a
 * ratchet is that the number cannot be edited upward by hand.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findUnreferencedModules,
  collectReferencedPaths,
  stripModuleExtension,
  ENTRY_POINTS,
  SCAN_ROOTS,
  REFERENCE_ROOTS,
} from '../../scripts/ci/check-unreferenced-modules.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = path.join(REPO_ROOT, 'scripts/ci/unreferenced-modules-baseline.json');

const unreferenced = new Set(findUnreferencedModules());
const baseline: { modules: string[]; count: number } = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

describe('resolution quirk 1 — .js specifiers naming .ts files', () => {
  // server/services/ana/submission-chat-handler.ts imports '../../routes/chat/shared.js'.
  // The file on disk is shared.ts. Every one of these is reached that way.
  const chatModules = fs
    .readdirSync(path.join(REPO_ROOT, 'server/routes/chat'))
    .filter(f => f.endsWith('.ts'))
    .map(f => `server/routes/chat/${f}`);

  it('finds the chat route directory (guards against the fixture being moved)', () => {
    expect(chatModules.length).toBeGreaterThanOrEqual(5);
  });

  it.each(chatModules)('does not call %s dead', (mod) => {
    expect(unreferenced.has(mod)).toBe(false);
  });

  it('treats x.js, x.ts and x as the same module key', () => {
    expect(stripModuleExtension('server/routes/chat/shared.js')).toBe('server/routes/chat/shared');
    expect(stripModuleExtension('server/routes/chat/shared.ts')).toBe('server/routes/chat/shared');
    expect(stripModuleExtension('server/routes/chat/shared')).toBe('server/routes/chat/shared');
  });
});

describe('resolution quirk 2 — routers mounted from a manifest of thunks', () => {
  // server/bootstrap/register-advanced-platform-routes.ts mounts these from a
  // config manifest whose entries carry a loader thunk, e.g.
  // { path: '/api', load: () => import('../routes/chat-actions') }.
  //
  // These used to use a bare string ({ mod: '../routes/chat-actions' }) with no
  // `import` keyword, which is why this quirk existed: the module was invisible
  // to the import-based unreferenced-modules checker. They were converted to
  // literal-import thunks so esbuild can bundle them for production (fix: bundle
  // the ~127 route mounts esbuild was silently dropping in prod), which also
  // makes the reference visible. The assertion now pins the thunk form.
  const manifestMounted = [
    'server/routes/chat-actions.ts',
    'server/routes/workspace-summary.ts',
  ];

  it('the manifest form is still how these mount (guards against a stale premise)', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'server/bootstrap/register-advanced-platform-routes.ts'),
      'utf8',
    );
    expect(src).toMatch(/load:\s*\(\)\s*=>\s*import\('\.\.\/routes\/chat-actions'\)/);
    expect(src).toMatch(/load:\s*\(\)\s*=>\s*import\('\.\.\/routes\/workspace-summary'\)/);
  });

  it.each(manifestMounted)('does not call %s dead', (mod) => {
    expect(unreferenced.has(mod)).toBe(false);
  });

  it('resolves a manifest string to the same key as an import would', () => {
    const referenced = collectReferencedPaths();
    expect(referenced.has('server/routes/chat-actions')).toBe(true);
  });
});

describe('references are collected from tests and scripts too', () => {
  // A module used only by a test is not dead — deleting it breaks the test.
  // This is why REFERENCE_ROOTS is wider than SCAN_ROOTS.
  it('searches more trees for references than it scans for candidates', () => {
    for (const root of SCAN_ROOTS) expect(REFERENCE_ROOTS).toContain(root);
    expect(REFERENCE_ROOTS).toContain('tests');
    expect(REFERENCE_ROOTS).toContain('scripts');
    expect(REFERENCE_ROOTS.length).toBeGreaterThan(SCAN_ROOTS.length);
  });
});

describe('entry points', () => {
  it('every declared entry point exists on disk', () => {
    // A configured entry that does not exist is exactly what silently broke the
    // knip run this check replaces: its third entry,
    // client/src/concept2cure/ZenApp.tsx, had been deleted.
    for (const entry of ENTRY_POINTS) {
      expect(fs.existsSync(path.join(REPO_ROOT, entry)), `${entry} is missing`).toBe(true);
    }
  });

  it('does not report an entry point as unreferenced', () => {
    for (const entry of ENTRY_POINTS) expect(unreferenced.has(entry)).toBe(false);
  });
});

describe('the ratchet only turns one way', () => {
  it('the baseline matches what the scanner finds', () => {
    // If this fails, either dead code was added (fix the code) or dead code was
    // removed (regenerate the baseline). Both are actionable; drift is not.
    expect([...unreferenced].sort()).toEqual([...baseline.modules].sort());
  });

  it('the recorded count matches the recorded list', () => {
    expect(baseline.count).toBe(baseline.modules.length);
  });

  it('every baselined module is a real file', () => {
    // A baseline entry for a file that no longer exists is a free pass that
    // would let a genuinely new dead module hide behind a stale name.
    const missing = baseline.modules.filter(m => !fs.existsSync(path.join(REPO_ROOT, m)));
    expect(missing).toEqual([]);
  });
});
