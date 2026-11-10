/** Real golden ZIP/native regression controls, never agency qualification.
 * Only the target ZIP's root MD5 is corrupted; unzipped XML stays untouched.
 * The canonical ZIP validator is real, and every platform-manifest entry is
 * recomputed so that a passing util scan cannot conceal the required fault. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { buildMd5Index, type PackagerInput } from '../../../submission-gateways/regional-packager';
import type { SubmissionBundle } from '../../../submission-gateways/types';
import { validateEctdPackage } from '../../../submission-gateways/ectd-structural-validator';

const fault = vi.hoisted(() => ({
  sequence: '0000' as '0000' | '0001', kind: 'wrong' as 'wrong' | 'missing',
}));
vi.mock('../../../submission-gateways/regional-packager', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../submission-gateways/regional-packager')>();
  return { ...actual, packageEctdSubmission: async (input: PackagerInput): Promise<SubmissionBundle> => {
    const bundle = await actual.packageEctdSubmission(input);
    return input.sequence === fault.sequence ? corruptRootChecksum(bundle, fault.kind) : bundle;
  } };
});

import { qualifyV3 } from '../qualify';

const digest = (bytes: Buffer, algorithm = 'md5') => createHash(algorithm).update(bytes).digest('hex');

async function corruptRootChecksum(bundle: SubmissionBundle, kind: 'wrong' | 'missing'): Promise<SubmissionBundle> {
  const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
  if (!zip.file('index-md5.txt')) throw new Error('The real golden packager did not emit its required root MD5.');
  if (kind === 'wrong') zip.file('index-md5.txt', '0'.repeat(32));
  else zip.remove('index-md5.txt');
  const entries = [];
  for (const entry of Object.values(zip.files).filter(entry => !entry.dir && entry.name !== 'util/index-md5.txt')) {
    entries.push({ relPath: entry.name, md5: digest(await entry.async('nodebuffer')) });
  }
  zip.file('util/index-md5.txt', buildMd5Index(entries));
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(bundle.path, bytes);
  return { ...bundle, sha256: digest(bytes, 'sha256'), sizeBytes: bytes.length };
}

const environmentKeys = [
  'EVALIDATOR_BINARY', 'EVALIDATOR_ENDPOINT', 'EVALIDATOR_PROFILE',
  'EVALIDATOR_PROFILE_FDA', 'EVALIDATOR_PROFILE_EMA', 'EVALIDATOR_PROFILE_PMDA', 'EVALIDATOR_PROFILE_CA',
  'EVALIDATOR_USE_FDA_CRITERIA_FALLBACK', 'ECTD_REQUIRE_DTD', 'ECTD_REQUIRE_EVALIDATOR', 'ECTD_REQUIRE_RPS_SCHEMA',
] as const;
let work: string | undefined;

beforeEach(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'qualification-real-zip-integrity-'));
  const dtd = path.join(work, 'empty-dtd');
  const schema = path.join(work, 'empty-schema');
  await fs.mkdir(dtd);
  await fs.mkdir(schema);
  for (const key of environmentKeys) vi.stubEnv(key, '');
  vi.stubEnv('ECTD_DTD_DIR', dtd);
  vi.stubEnv('ECTD_SCHEMA_DIR', schema);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  if (work) await fs.rm(work, { recursive: true, force: true });
  work = undefined;
});

describe('real golden qualification reaches the canonical ZIP checksum contract', () => {
  it.each([
    ['0000', 'wrong'], ['0000', 'missing'], ['0001', 'wrong'], ['0001', 'missing'],
  ] as const)('fails sequence %s with a %s root MD5 despite clean native XML and util hashes', async (sequence, kind) => {
    fault.sequence = sequence;
    fault.kind = kind;
    const report = await qualifyV3('fda', work!);
    const original = await validateEctdPackage(await fs.readFile(report.package.path), { origin: 'platform-generated' });
    const amendment = await validateEctdPackage(await fs.readFile(report.lifecycle.package.path), { origin: 'platform-generated' });
    const broken = sequence === '0000' ? original : amendment;
    const clean = sequence === '0000' ? amendment : original;

    expect(clean).toMatchObject({ valid: true, errors: [] });
    expect(broken.valid).toBe(false);
    expect(broken.errors).toHaveLength(1);
    expect(broken.errors[0]).toMatch(kind === 'wrong'
      ? /^index-md5\.txt records 0{32}, but the MD5 of index\.xml is/
      : /^Missing required file: index-md5\.txt/);
    expect(report.checksum).toMatchObject({ ok: true, mismatches: [], missing: [] });
    expect(report.lifecycle.checksum).toMatchObject({ ok: true, mismatches: [], missing: [] });
    expect(report.checksum.filesChecked).toBeGreaterThan(0);
    expect(report.lifecycle.checksum.filesChecked).toBeGreaterThan(0);
    const nativeRows = report.validators.filter(row => row.name.includes('well-formed'));
    expect(nativeRows.length).toBeGreaterThanOrEqual(6);
    for (const row of nativeRows) expect(row).toMatchObject({ ran: true, passed: true });
    expect(report.lifecycle.modifiedFileUnresolved).toEqual([]);
    expect(report.blockers.join(' ')).toMatch(/DTD|supportive/);
    expect(report.blockers.join(' ')).toMatch(/External validation/);

    // The legacy harness reports BLOCKED with local checks passing here. The
    // observed ZIP fault must take failure precedence over absent prerequisites.
    expect(report).toMatchObject({ status: 'failed', availableChecksPassed: false, passed: false });
    expect(report.blockers.some(reason => reason.includes(sequence) && reason.includes('index-md5.txt'))).toBe(true);
    expect(report.packageValidation).toEqual({ original, amendment });
    expect(report.lifecycle).toMatchObject(sequence === '0001'
      ? { status: 'failed', availableChecksPassed: false, nextPackagePassed: false }
      : { status: 'blocked', availableChecksPassed: true, nextPackagePassed: false });
  }, 30_000);
});
