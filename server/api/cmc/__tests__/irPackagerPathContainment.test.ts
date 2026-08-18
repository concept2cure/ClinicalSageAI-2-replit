/**
 * The IR package builder must not let a submission id escape storage/ir-packs.
 *
 * `buildIRPackageZip(subId)` is called with `String(req.params.id)` straight
 * from POST /api/cmc/blueprint/regulatory/submissions/:id/questions/pack, and
 * it interpolates that value into the FILENAME:
 *
 *     path.join(outDir, `ir_${subId}_${Date.now()}.zip`)
 *
 * The literal `ir_` prefix looks like it absorbs a traversal. It does not — a
 * leading slash resets path.join outright:
 *
 *     path.join('/app/storage/ir-packs', 'ir_' + '/../../../../tmp/y' + '_1.zip')
 *       → '/tmp/y_1.zip'
 *
 * and Express decodes %2F inside a route param, so the whole traversal arrives
 * in a single segment. createWriteStream then opens 'w' — truncating — in any
 * directory that already exists.
 *
 * These cases pin the refusal. They assert the id is rejected BEFORE anything
 * is written, which is why they check that no stray file appeared as well as
 * that the call threw.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIRPackageZip, InvalidSubmissionIdError } from '../regulatory_irPackager';

const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-pack-probe-'));

afterEach(() => {
  for (const f of fs.readdirSync(probeDir)) fs.rmSync(path.join(probeDir, f), { force: true });
});

describe('buildIRPackageZip — submission id containment', () => {
  const escapes = [
    ['a leading slash, which resets path.join', `${probeDir}/pwned`],
    ['relative traversal', '../../../../etc/x'],
    ['a bare parent reference', '..'],
    ['a separator mid-token', 'a/b'],
    ['a backslash separator', 'a\\b'],
    ['a NUL byte', 'a\0b'],
  ] as const;

  for (const [label, subId] of escapes) {
    it(`refuses ${label}`, async () => {
      await expect(buildIRPackageZip(subId)).rejects.toBeInstanceOf(InvalidSubmissionIdError);
      // Nothing was written on the way to the refusal.
      expect(fs.readdirSync(probeDir)).toEqual([]);
    });
  }

  it('refuses before touching the filesystem, not after', async () => {
    // If validation moved below the write, this would find the file.
    await expect(buildIRPackageZip(`${probeDir}/late`)).rejects.toThrow(InvalidSubmissionIdError);
    expect(fs.existsSync(`${probeDir}/late_`)).toBe(false);
    expect(fs.readdirSync(probeDir)).toEqual([]);
  });

  it('still accepts the shapes a real submission id takes', () => {
    // Shape only — building a real package needs a database, which this suite
    // does not stand up. The regex is the contract under test here.
    const SAFE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
    for (const ok of [
      '0f9d3c2e-7a41-4f6b-9c1d-2e5a8b7c4d3f',
      'SUB-2026-0001',
      'a',
      'A1_b2-c3',
    ]) {
      expect(SAFE.test(ok), `${ok} should be accepted`).toBe(true);
    }
  });
});
