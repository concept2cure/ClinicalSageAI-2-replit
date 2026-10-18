/**
 * A release manifest's hash covers its dates, so a saved manifest verifies after
 * it is loaded back, and a changed release date is detected.
 *
 * ── What the code used to do ────────────────────────────────────────────────
 * `sortObjectKeys` treated a Date as a plain object with no keys, so
 * `createdAt` (and each file's `lastModified`) were hashed as `{}`. The release
 * timestamp was therefore outside `manifestHash` — changing it went undetected —
 * and a manifest written with saveManifest and read back with loadManifest
 * (where the dates are ISO strings) failed verification with "Manifest hash
 * mismatch - manifest has been tampered", though nothing had changed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../audit/auditLogger', () => ({ AuditLogger: class { async log() { return undefined; } } }));

import { ReleaseHashGenerator } from '../ReleaseHashGenerator';

let dir: string;
let file: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-hash-'));
  file = path.join(dir, 'm1-cover-letter.pdf');
  fs.writeFileSync(file, 'cover letter bytes');
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('ReleaseHashGenerator', () => {
  it('a manifest saved and loaded back verifies, with no false "tampered" finding', async () => {
    const g = new ReleaseHashGenerator();
    const pkg = await g.generateReleasePackage([file], { releaseId: 'REL-1' });
    const manifestPath = path.join(dir, 'manifest.json');
    await g.saveManifest(pkg, manifestPath);
    const loaded = await g.loadManifest(manifestPath);
    const result = await g.verifyReleasePackage(loaded, [file]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('detects a changed release date', async () => {
    const g = new ReleaseHashGenerator();
    const pkg = await g.generateReleasePackage([file], { releaseId: 'REL-2' });
    const altered = { ...pkg, manifest: { ...pkg.manifest, createdAt: new Date('2020-01-01T00:00:00Z') } };
    const result = await g.verifyReleasePackage(altered, [file]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Manifest hash mismatch - manifest has been tampered');
  });
});
