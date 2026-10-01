/**
 * Style-pack path resolution guard — source AND production bundle.
 *
 * ── The defect this exists to close (U8) ─────────────────────────────────────
 * server/export/stylePacks/config.ts built every pack path as
 * `path.join(__dirname, '510k_v1.html')` with `__dirname` taken from
 * `import.meta.url`. Unbundled (tsx, vitest) that is server/export/stylePacks/,
 * where the files live. In production the server is one esbuild bundle at
 * dist/index.js (scripts/build-server.mjs), so `import.meta.url` is the bundle
 * and every pack pointed at /app/dist/510k_v1.html — a file that does not
 * exist. Every device draft-package and 510(k)/PMA/CER PDF export
 * (renderers.ts, POST /api/510k/estar/build) ENOENTed into a 500, while the
 * build and the unit suites stayed green: the route tests mock stylePacks, and
 * nothing that runs the source unbundled can see the bundle's location.
 *
 * So this test checks both conditions:
 *   1. the source module, as tsx/vitest load it, names files that exist;
 *   2. the module built with the production esbuild options into
 *      <appRoot>/dist/, run in plain Node with cwd = <appRoot> and the
 *      `server/` tree beside `dist/` (the Dockerfile.optimized layout:
 *      WORKDIR /app, COPY dist, COPY server), names files that exist.
 */

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { stylePacks } from '../../server/export/stylePacks/config';
import { SERVER_BUILD_OPTIONS } from '../../scripts/build-server.mjs';

const REPO_ROOT = path.resolve(__dirname, '../..');
const CONFIG_SRC = path.join(REPO_ROOT, 'server/export/stylePacks/config.ts');

/** The pack keys production code selects by name (renderers.ts, routes). */
const REQUIRED_PACKS = ['510k_v1', 'pma_v1', 'cer_mdr_v1'];

type Packs = Record<string, { html: string; css: string }>;

function missingFiles(packs: Packs): string[] {
  const missing: string[] = [];
  for (const [key, pack] of Object.entries(packs)) {
    for (const field of ['html', 'css'] as const) {
      const p = pack[field];
      if (!p || !path.isAbsolute(p) || !fs.existsSync(p)) missing.push(`${key}.${field} → ${p}`);
    }
  }
  return missing;
}

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('stylePacks path resolution', () => {
  it('defines every pack production code selects', () => {
    for (const key of REQUIRED_PACKS) expect(stylePacks[key], key).toBeDefined();
  });

  it('source module (tsx / vitest): every html and css path exists', () => {
    const missing = missingFiles(stylePacks);
    expect(missing, `Missing style-pack files: ${missing.join(', ')}`).toEqual([]);
  });

  it('production bundle (esbuild → <appRoot>/dist, node, cwd = appRoot): every html and css path exists', async () => {
    // A throwaway app root laid out like the image: dist/ (the bundle) and
    // server/ (the source tree, which carries the .html/.css assets).
    const appRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-stylepacks-')));
    tmpDirs.push(appRoot);
    fs.symlinkSync(path.join(REPO_ROOT, 'server'), path.join(appRoot, 'server'), 'dir');
    // The bundle is ESM ("type": "module" in the real app root).
    fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ type: 'module' }));

    const entry = path.join(appRoot, 'probe-entry.ts');
    fs.writeFileSync(
      entry,
      `import { stylePacks } from ${JSON.stringify(CONFIG_SRC)};\n` +
        `process.stdout.write(JSON.stringify(stylePacks));\n`,
    );
    const outfile = path.join(appRoot, 'dist', 'index.js');
    await build({
      ...SERVER_BUILD_OPTIONS,
      entryPoints: [entry],
      outfile,
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"' },
    });

    // Plain Node, the runtime that ships; cwd is the image's WORKDIR analogue.
    const stdout = execFileSync(process.execPath, [outfile], { cwd: appRoot, encoding: 'utf8' });
    const bundled = JSON.parse(stdout) as Packs;

    for (const key of REQUIRED_PACKS) expect(bundled[key], key).toBeDefined();
    const missing = missingFiles(bundled);
    expect(
      missing,
      `Bundled stylePacks resolve to files that do not exist (would ENOENT → 500 in production): ${missing.join(', ')}`,
    ).toEqual([]);
    // And they must resolve inside the app root, not the repo checkout that
    // happens to sit next to the test.
    for (const pack of Object.values(bundled)) {
      expect(pack.html.startsWith(appRoot + path.sep)).toBe(true);
      expect(pack.css.startsWith(appRoot + path.sep)).toBe(true);
    }
  }, 60_000);
});
